// 記事本加密：全部在瀏覽器裡做（Web Crypto），主機只收到亂碼、也拿不到金鑰。
//   金鑰：PBKDF2-SHA256（600,000 次）從密碼＋salt 算出 AES-256-GCM 金鑰
//   文字：  "e1:" + base64(iv) + ":" + base64(密文)
//   檔案 v1（舊）：[12 bytes iv][密文]           ← 要整個檔案放進記憶體，手機開大影片會撐爆
//   檔案 v2（新）："DSE2" + 段大小(4) + 基準 iv(12)，後面每 4MB 一段各自加密（含 16 bytes 驗證碼）
//               每段 iv＝基準 iv 尾端 XOR 段號；additionalData＝段號＋是否最後一段（防止段落被調換／截斷）
//               一段一段處理，記憶體只要幾 MB，大檔也能在手機上加解密
// 忘記密碼就解不開，沒有任何後門。

const ITER = 600000;
const CHECK_PLAIN = "dispatch-notebook-ok";
const enc = new TextEncoder();
const dec = new TextDecoder();

export const cryptoSupported = () => Boolean(window.crypto?.subtle);

function toB64(buf) {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function newSalt() {
  return toB64(crypto.getRandomValues(new Uint8Array(16)));
}

export async function deriveKey(password, saltB64) {
  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: fromB64(saltB64), iterations: ITER, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptText(key, plain) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plain));
  return `e1:${toB64(iv)}:${toB64(ct)}`;
}

export async function decryptText(key, packed) {
  if (!packed) return "";
  const [v, ivB64, ctB64] = packed.split(":");
  if (v !== "e1" || !ivB64 || !ctB64) throw new Error("不是加密內容");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(ivB64) }, key, fromB64(ctB64));
  return dec.decode(pt);
}

export async function encryptBytes(key, buf) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, buf);
  return new Blob([iv, new Uint8Array(ct)], { type: "application/octet-stream" });
}

export async function decryptBytes(key, buf) {
  const bytes = new Uint8Array(buf);
  return crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.subarray(0, 12) }, key, bytes.subarray(12));
}

const MAGIC = [0x44, 0x53, 0x45, 0x32]; // "DSE2"
const HEAD = 20;
const SEG = 4 * 1024 * 1024;

function segIv(base, i) {
  const iv = new Uint8Array(base);
  const dv = new DataView(iv.buffer);
  dv.setUint32(8, dv.getUint32(8) ^ i);
  return iv;
}
function segAad(i, last) {
  const a = new Uint8Array(5);
  new DataView(a.buffer).setUint32(0, i);
  a[4] = last ? 1 : 0;
  return a;
}

/** 檔案加密（分段，v2）：blob 可以是 File／Blob；onProgress(0~1) */
export async function encryptFile(key, blob, onProgress) {
  const base = crypto.getRandomValues(new Uint8Array(12));
  const head = new Uint8Array(HEAD);
  head.set(MAGIC, 0);
  new DataView(head.buffer).setUint32(4, SEG);
  head.set(base, 8);
  const parts = [head];
  const n = Math.max(1, Math.ceil(blob.size / SEG));
  for (let i = 0; i < n; i++) {
    const plain = await blob.slice(i * SEG, Math.min((i + 1) * SEG, blob.size)).arrayBuffer();
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: segIv(base, i), additionalData: segAad(i, i === n - 1) }, key, plain);
    parts.push(new Blob([ct])); // 包成小 Blob：瀏覽器可以放到硬碟，不會全部堆在記憶體
    onProgress?.((i + 1) / n);
  }
  return new Blob(parts, { type: "application/octet-stream" });
}

/** 檔案解密：自動認 v2（分段）或 v1（舊格式），回傳 Blob */
export async function decryptFile(key, blob, type = "application/octet-stream", onProgress) {
  const head = new Uint8Array(await blob.slice(0, HEAD).arrayBuffer());
  if (head.length === HEAD && MAGIC.every((b, i) => head[i] === b)) {
    try {
      const seg = new DataView(head.buffer).getUint32(4);
      const base = head.slice(8, 20);
      const parts = [];
      let off = HEAD;
      for (let i = 0; off < blob.size; i++) {
        const len = Math.min(seg + 16, blob.size - off);
        const last = off + len >= blob.size;
        const ct = await blob.slice(off, off + len).arrayBuffer();
        const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: segIv(base, i), additionalData: segAad(i, last) }, key, ct);
        parts.push(new Blob([pt]));
        off += len;
        onProgress?.(off / blob.size);
      }
      return new Blob(parts, { type });
    } catch (e) {
      // 舊格式的 iv 剛好以 "DSE2" 開頭（機率極低）→ 改用舊方法再試一次
      if (blob.size > 512 * 1024 * 1024) throw e;
    }
  }
  const plain = await decryptBytes(key, await blob.arrayBuffer());
  return new Blob([plain], { type });
}

export function makeCheck(key) {
  return encryptText(key, CHECK_PLAIN);
}

// 密碼對 → 回傳 key；不對 → null
export async function unlockKey(password, saltB64, check) {
  const key = await deriveKey(password, saltB64);
  try {
    return (await decryptText(key, check)) === CHECK_PLAIN ? key : null;
  } catch {
    return null;
  }
}
