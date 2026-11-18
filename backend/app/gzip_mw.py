"""只壓縮文字類回應（JSON、網頁、JS、CSS）的 gzip。

為什麼不用 Starlette 內建的 GZipMiddleware：它連照片／影片／下載檔也會壓，
影片拖拉進度用的 Range（206）回應會被弄壞，照片本來就壓過了也是白花 CPU。
這裡在回應開頭看 Content-Type，只有文字類、200、沒有被壓過的才整包壓縮。
走 Cloudflare／Tailscale 網址、手機網路時，JSON 小 5～10 倍，載入快很多。
"""

import gzip

COMPRESSIBLE = ("application/json", "text/", "application/javascript", "image/svg+xml", "application/manifest+json")
MIN_SIZE = 1024


class SelectiveGZipMiddleware:
    def __init__(self, app, minimum_size: int = MIN_SIZE, level: int = 5):
        self.app = app
        self.minimum_size = minimum_size
        self.level = level

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        headers = {k.lower(): v for k, v in scope.get("headers") or []}
        if b"gzip" not in headers.get(b"accept-encoding", b"") or b"range" in headers:
            return await self.app(scope, receive, send)

        start = None
        mode = None  # "buffer" 要壓縮 / "pass" 原樣
        body = []

        async def wrapped(message):
            nonlocal start, mode
            if message["type"] == "http.response.start":
                h = {k.lower(): v for k, v in message.get("headers") or []}
                ctype = h.get(b"content-type", b"").decode("latin-1").lower()
                ok = (
                    message.get("status") == 200
                    and b"content-encoding" not in h
                    and any(ctype.startswith(c) for c in COMPRESSIBLE)
                    and not ctype.startswith("text/event-stream")  # 串流不能整包等完才送
                )
                if ok:
                    start, mode = message, "buffer"
                else:
                    mode = "pass"
                    await send(message)
                return
            if message["type"] != "http.response.body" or mode == "pass":
                return await send(message)
            body.append(message.get("body", b""))
            if message.get("more_body"):
                return
            raw = b"".join(body)
            hdrs = [(k, v) for k, v in start.get("headers") or [] if k.lower() not in (b"content-length",)]
            if len(raw) >= self.minimum_size:
                raw = gzip.compress(raw, compresslevel=self.level)
                hdrs.append((b"content-encoding", b"gzip"))
                hdrs.append((b"vary", b"Accept-Encoding"))
            hdrs.append((b"content-length", str(len(raw)).encode()))
            await send({**start, "headers": hdrs})
            await send({"type": "http.response.body", "body": raw, "more_body": False})

        await self.app(scope, receive, wrapped)
