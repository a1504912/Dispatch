// 記事本加密：全部在瀏覽器裡做（Web Crypto），主機只收到亂碼、也拿不到金鑰。
//   金鑰：PBKDF2-SHA256（600,000 次）從密碼＋salt 算出 AES-256-GCM 金鑰
//   文字：  "e1:" + base64(iv) + ":" + base64(密文)
//   檔案：  [12 bytes iv][密文]
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
