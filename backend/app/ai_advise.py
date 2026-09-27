"""問 AI 給建議：直接呼叫主機上已登入的 CLI（Codex / Claude Code）。

不需要另外的 API 金鑰、不用額外付費 —— 用的是使用者現有訂閱額度（跟側邊欄用量同一份）。
題目一律走 stdin 餵進去，不放到命令列，避免任何字元被當成指令。

  GPT   → codex exec --skip-git-repo-check --sandbox read-only -o <檔> -   （stdin 餵題目）
  Claude→ claude -p                                                       （stdin 餵題目）
"""

import os
import shutil
import subprocess
import tempfile

TIMEOUT = 180  # 秒


def _resolve(name: str) -> str | None:
    return shutil.which(name)


def _base_cmd(exe: str) -> list[str]:
    # Windows 的 npm 全域指令是 .cmd shim，需透過 cmd /c 執行（題目走 stdin，命令列無使用者資料）
    if os.name == "nt" and exe.lower().endswith((".cmd", ".bat")):
        return ["cmd", "/c", exe]
    return [exe]


def _run(cmd: list[str], prompt: str, cwd: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        cmd,
        input=prompt,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=TIMEOUT,
        cwd=cwd,
    )


def _ask_gpt(prompt: str) -> str:
    exe = _resolve("codex")
    if not exe:
        raise RuntimeError("主機找不到 codex 指令，請確認 Codex CLI 已安裝並在 PATH。")
    with tempfile.TemporaryDirectory() as tmp:
        outfile = os.path.join(tmp, "out.txt")
        cmd = _base_cmd(exe) + [
            "exec",
            "--skip-git-repo-check",
            "--sandbox",
            "read-only",
            "-o",
            outfile,
            "-",
        ]
        proc = _run(cmd, prompt, tmp)
        answer = ""
        try:
            with open(outfile, encoding="utf-8", errors="replace") as f:
                answer = f.read().strip()
        except Exception:  # noqa: BLE001
            pass
        if not answer:
            answer = (proc.stdout or "").strip()
        if not answer:
            raise RuntimeError((proc.stderr or "Codex 沒有回覆").strip()[:500])
        return answer


def _ask_claude(prompt: str) -> str:
    exe = _resolve("claude")
    if not exe:
        raise RuntimeError(
            "主機找不到 claude 指令，請先安裝 Claude Code CLI：npm i -g @anthropic-ai/claude-code"
        )
    with tempfile.TemporaryDirectory() as tmp:
        cmd = _base_cmd(exe) + ["-p"]
        proc = _run(cmd, prompt, tmp)
        answer = (proc.stdout or "").strip()
        if not answer:
            raise RuntimeError((proc.stderr or "Claude 沒有回覆").strip()[:500])
        return answer


def ask(provider: str, prompt: str) -> str:
    prompt = (prompt or "").strip()
    if not prompt:
        raise ValueError("請輸入問題")
    try:
        if provider == "gpt":
            return _ask_gpt(prompt)
        if provider == "claude":
            return _ask_claude(prompt)
    except subprocess.TimeoutExpired:
        raise RuntimeError("AI 回覆逾時（可能在忙或題目太大），請稍後再試或縮短問題。")
    raise ValueError("provider 必須是 gpt 或 claude")
