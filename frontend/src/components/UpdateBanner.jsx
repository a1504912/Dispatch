import { useEffect, useState } from "react";
import { NO_BACKEND } from "../localMode";
import { getUpdateAvailable, checkUpdates, runUpdate, getUpdateStatus } from "../api/system";

const SNOOZE_KEY = "dispatch.updateSnoozeUntil";

export default function UpdateBanner() {
  const [info, setInfo] = useState(null); // { behind, latest_subject }
  const [updating, setUpdating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState("");

  useEffect(() => {
    if (NO_BACKEND) return;
    if (Date.now() < Number(localStorage.getItem(SNOOZE_KEY) || 0)) return; // 稍後：暫時不提醒
    let alive = true;
    (async () => {
      try {
        const avail = await getUpdateAvailable();
        if (!avail?.supported) return; // 非自架 Windows 主機不檢查
        const r = await checkUpdates();
        if (alive && r?.ok && r.behind > 0) setInfo(r);
      } catch {
        /* 連不到 GitHub 就當作沒有更新 */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  function snooze() {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + 6 * 60 * 60 * 1000)); // 6 小時內不再提醒
    setInfo(null);
  }

  async function doUpdate() {
    setUpdating(true);
    setProgress(5);
    setStep("開始更新…");
    let startBoot = null;
    try {
      startBoot = (await getUpdateStatus()).boot;
    } catch {
      /* 拿不到就用「後端曾斷線」當完成依據 */
    }
    try {
      await runUpdate();
    } catch {
      setStep("啟動更新失敗，請到設定→系統手動更新。");
      return;
    }
    const PCT = { start: 8, pull: 20, build: 45, deps: 72, restart: 88 };
    const LBL = {
      start: "開始更新…",
      pull: "拉取最新程式…",
      build: "重建前端（這步較久）…",
      deps: "更新後端套件…",
      restart: "重啟後端…",
    };
    let wentDown = false;
    let ticks = 0;
    const timer = setInterval(async () => {
      ticks += 1;
      if (ticks > 200) {
        clearInterval(timer);
        setStep("更新逾時，請到主機看看。");
        return;
      }
      try {
        const s = await getUpdateStatus();
        // 後端每次啟動會換一個 boot id；變了＝新後端已就緒
        const done = startBoot ? Boolean(s.boot && s.boot !== startBoot) : wentDown;
        if (done) {
          clearInterval(timer);
          setProgress(100);
          setStep("完成！即將重新整理…");
          setTimeout(() => window.location.reload(), 1500);
          return;
        }
        if (PCT[s.step]) setProgress((p) => Math.max(p, PCT[s.step]));
        setStep(LBL[s.step] || "更新中…");
        setProgress((p) => Math.min(p + 1, 90));
      } catch {
        wentDown = true;
        setStep("重啟中…");
        setProgress((p) => Math.max(p, 92));
      }
    }, 1500);
  }

  if (NO_BACKEND || (!info && !updating)) return null;

  return (
    <div className="border-b border-emerald-100 bg-emerald-50 px-4 py-2.5">
      <div className="mx-auto flex max-w-5xl items-center gap-3">
        {updating ? (
          <div className="flex-1">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-semibold text-emerald-700">{step}</span>
              <span className="text-emerald-600">{progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-emerald-100">
              <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : (
          <>
            <span className="flex-1 truncate text-sm font-medium text-emerald-800">
              🎉 有新版可更新（{info.behind} 個更新）
            </span>
            <button
              onClick={doUpdate}
              className="shrink-0 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-700 active:scale-95"
            >
              立即更新
            </button>
            <button
              onClick={snooze}
              className="shrink-0 rounded-lg px-2 py-1.5 text-xs font-medium text-emerald-600 transition hover:bg-emerald-100"
            >
              稍後
            </button>
          </>
        )}
      </div>
    </div>
  );
}
