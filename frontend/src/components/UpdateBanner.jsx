import { useEffect, useState } from "react";
import { NO_BACKEND } from "../localMode";
import { getUpdateAvailable, checkUpdates, runUpdate, getUpdateStatus, getVersion, getChangelog } from "../api/system";
import ChangeList from "./ChangeList.jsx";

const SNOOZE_KEY = "dispatch.updateSnoozeUntil";
const SEEN_KEY = "dispatch.lastSeenVersion"; // 上次看過的版本：版本變了就秀「這次更新了什麼」
const ls = {
  get: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* 無痕模式 */
    }
  },
};

/* 更新完成後（不管是網頁按的、還是在主機跑 win-restart.bat）第一次打開，告訴使用者這次更新了什麼 */
function WhatsNew() {
  const [data, setData] = useState(null); // { version, commits }
  useEffect(() => {
    let alive = true;
    getVersion()
      .then(async (v) => {
        if (!v?.commit) return;
        const seen = ls.get(SEEN_KEY);
        if (!seen) return ls.set(SEEN_KEY, v.commit); // 第一次用：記下來就好
        if (seen === v.commit) return;
        const r = await getChangelog(seen).catch(() => null);
        if (!alive) return;
        if (r?.ok && r.commits.length) setData({ version: v, commits: r.commits });
        else ls.set(SEEN_KEY, v.commit);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  if (!data) return null;
  const close = () => {
    ls.set(SEEN_KEY, data.version.commit);
    setData(null);
  };
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/50 backdrop-blur-sm sm:items-center sm:p-4" onClick={close}>
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-slate-50 shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 px-5 py-4 text-white">
          <p className="text-lg font-black">✨ 已更新到新版本</p>
          <p className="text-xs text-emerald-50">
            這次有 {data.commits.length} 個更新・版本 <span className="font-mono">{data.version.commit}</span>
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <ChangeList commits={data.commits} />
        </div>
        <div className="border-t border-slate-200 bg-white px-5 py-3 text-right">
          <button onClick={close} className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-700">知道了</button>
        </div>
      </div>
    </div>
  );
}

export default function UpdateBanner() {
  const [info, setInfo] = useState(null); // { behind, latest_subject }
  const [updating, setUpdating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState("");
  const [showList, setShowList] = useState(false);

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
    setShowList(false);
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

  if (NO_BACKEND) return null;
  if (!info && !updating) return <WhatsNew />;

  return (
    <div className="border-b border-emerald-100 bg-emerald-50 px-4 py-2.5">
      <WhatsNew />
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
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-emerald-800">
              🎉 有新版可更新（{info.behind} 個更新）
              {info.commits?.[0] && <span className="ml-2 hidden text-emerald-600 sm:inline">{info.commits[0].subject}</span>}
            </span>
            {info.commits?.length > 0 && (
              <button
                onClick={() => setShowList((v) => !v)}
                className="shrink-0 rounded-lg px-2 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
              >
                {showList ? "收起 ▴" : "看更新內容 ▾"}
              </button>
            )}
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
      {showList && !updating && (
        <div className="mx-auto mt-2 max-h-[50vh] max-w-5xl overflow-y-auto pb-1">
          <ChangeList commits={info.commits} />
        </div>
      )}
    </div>
  );
}
