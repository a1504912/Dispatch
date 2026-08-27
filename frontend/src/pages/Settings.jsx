import { useEffect, useState } from "react";
import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from "../api/categories";
import { TW_CITIES, getWeatherLoc, setWeatherLoc } from "../api/weather";
import { getUpdateAvailable, runUpdate, getVersion, checkUpdates, getUpdateStatus } from "../api/system";
import { NO_BACKEND } from "../localMode";
import {
  pushSupported,
  isIOS,
  isStandalone,
  getPushStatus,
  enablePush,
  disablePush,
  sendTestPush,
  getNotifySettings,
  saveNotifySettings,
  showLocalTest,
} from "../api/push";

function WeatherSettings() {
  const [city, setCity] = useState(() => getWeatherLoc().label);
  return (
    <div>
      <label className="mb-1.5 block text-xs font-bold text-slate-500">所在城市</label>
      <select
        value={city}
        onChange={(e) => {
          const loc = TW_CITIES.find((c) => c.label === e.target.value);
          if (loc) {
            setWeatherLoc(loc);
            setCity(loc.label);
          }
        }}
        className="w-full max-w-xs cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
      >
        {TW_CITIES.map((c) => (
          <option key={c.label} value={c.label}>
            {c.label}
          </option>
        ))}
      </select>
      <p className="mt-2 text-xs text-slate-400">
        總覽頁的「本週天氣」會依這個城市顯示。改完回總覽頁即更新。
      </p>
    </div>
  );
}

const GAME_PLATFORMS = [
  ["steam", "Steam"],
  ["epic", "Epic"],
  ["gog", "GOG"],
  ["ubisoft", "Ubisoft"],
  ["ea", "EA"],
  ["itchio", "itch.io"],
  ["xbox", "Xbox"],
  ["playstation", "PS"],
  ["android", "Android"],
  ["ios", "iOS"],
  ["drmfree", "DRM-Free"],
];

const REMIND_OPTIONS = [
  { value: 0, label: "準時" },
  { value: 5, label: "提前 5 分鐘" },
  { value: 10, label: "提前 10 分鐘" },
  { value: 15, label: "提前 15 分鐘" },
  { value: 30, label: "提前 30 分鐘" },
  { value: 60, label: "提前 1 小時" },
];

function NotificationSettings() {
  const [status, setStatus] = useState({ supported: true });
  const [prefs, setPrefs] = useState({
    remind_before_minutes: 10,
    daily_summary_time: "08:00",
    games_enabled: true,
    games_platforms: [],
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function refreshStatus() {
    try {
      setStatus(await getPushStatus());
    } catch {
      setStatus({ supported: pushSupported() });
    }
  }

  useEffect(() => {
    refreshStatus();
    getNotifySettings()
      .then(setPrefs)
      .catch(() => {});
  }, []);

  async function handleEnable() {
    setBusy(true);
    setMsg("");
    try {
      await enablePush();
      await refreshStatus();
      setMsg("✅ 這台裝置的通知已開啟。");
    } catch (err) {
      setMsg("⚠️ " + (err?.message ?? "開啟失敗"));
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    setBusy(true);
    setMsg("");
    try {
      await disablePush();
      await refreshStatus();
      setMsg("這台裝置的通知已關閉。");
    } catch (err) {
      setMsg("⚠️ " + (err?.message ?? "關閉失敗"));
    } finally {
      setBusy(false);
    }
  }

  async function handleTest() {
    setBusy(true);
    setMsg("");
    try {
      const r = await sendTestPush();
      setMsg(r.sent > 0 ? "🔔 已送出測試通知，稍等一下就會跳出來。" : "沒有已開啟通知的裝置。");
    } catch {
      setMsg("⚠️ 測試通知送出失敗。");
    } finally {
      setBusy(false);
    }
  }

  async function handleLocalTest() {
    setMsg("");
    try {
      await showLocalTest();
      setMsg("已觸發本機測試。有跳出來 → 顯示正常；沒跳 → 是 Windows/Chrome 的通知被關了。");
    } catch (err) {
      setMsg("⚠️ " + (err?.message ?? "本機測試失敗"));
    }
  }

  async function handleSavePrefs(next) {
    setPrefs(next);
    try {
      const saved = await saveNotifySettings(next);
      setPrefs(saved);
    } catch {
      setMsg("⚠️ 偏好儲存失敗。");
    }
  }

  const field =
    "rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100";

  // 不支援（HTTP 或舊瀏覽器）
  if (!status.supported) {
    return (
      <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
        這個瀏覽器（或用 http:// 開啟）不支援通知。請改用手機/電腦的 Chrome、Edge，
        並透過 <span className="font-mono">https://…ts.net</span> 這個網址開啟。
      </p>
    );
  }

  const iosNeedsInstall = isIOS() && !isStandalone();

  return (
    <div className="space-y-4">
      {/* 這台裝置 */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-bold text-slate-600">這台裝置：</span>
        {status.permission === "denied" ? (
          <span className="rounded-lg bg-red-50 px-3 py-1.5 text-sm text-red-600">
            已被瀏覽器封鎖 — 請到瀏覽器網站設定手動允許通知
          </span>
        ) : status.subscribed ? (
          <>
            <span className="rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-bold text-emerald-600">
              ● 已開啟
            </span>
            <button
              onClick={handleDisable}
              disabled={busy}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
            >
              關閉通知
            </button>
            <button
              onClick={handleTest}
              disabled={busy}
              className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-700 disabled:opacity-40"
            >
              測試通知
            </button>
            <button
              onClick={handleLocalTest}
              disabled={busy}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
            >
              本機測試
            </button>
          </>
        ) : (
          <button
            onClick={handleEnable}
            disabled={busy}
            className="rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-indigo-200 transition hover:brightness-110 active:scale-95 disabled:opacity-40"
          >
            🔔 開啟這台的通知
          </button>
        )}
      </div>

      {iosNeedsInstall && (
        <p className="rounded-xl bg-sky-50 px-4 py-3 text-xs leading-relaxed text-sky-700">
          📱 iPhone / iPad 要先把這個網站「<b>加到主畫面</b>」：Safari 按下方分享鈕 → 加到主畫面 →
          再從桌面的 Dispatch 圖示開啟，才能開啟通知。
        </p>
      )}

      {msg && <p className="text-sm text-slate-500">{msg}</p>}

      <hr className="border-slate-100" />

      {/* 通知偏好（全帳號共用） */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-bold text-slate-500">行程提前提醒</label>
          <select
            value={prefs.remind_before_minutes}
            onChange={(e) =>
              handleSavePrefs({ ...prefs, remind_before_minutes: Number(e.target.value) })
            }
            className={`${field} w-full max-w-xs cursor-pointer`}
          >
            {REMIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-slate-400">有設定時間的行程，到點前會提醒。</p>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-bold text-slate-500">每日摘要</label>
          <div className="flex items-center gap-2">
            <input
              type="time"
              value={prefs.daily_summary_time || ""}
              disabled={!prefs.daily_summary_time}
              onChange={(e) => handleSavePrefs({ ...prefs, daily_summary_time: e.target.value })}
              className={`${field} w-32 disabled:opacity-40`}
            />
            <label className="flex cursor-pointer items-center gap-1.5 text-sm text-slate-500">
              <input
                type="checkbox"
                checked={Boolean(prefs.daily_summary_time)}
                onChange={(e) =>
                  handleSavePrefs({
                    ...prefs,
                    daily_summary_time: e.target.checked ? "08:00" : "",
                  })
                }
              />
              啟用
            </label>
          </div>
          <p className="mt-1.5 text-xs text-slate-400">每天這個時間推一則：今天幾件、逾期、待辦。</p>
        </div>
      </div>

      <hr className="border-slate-100" />

      {/* 免費遊戲新品提醒 */}
      <div>
        <label className="flex cursor-pointer items-center justify-between">
          <span className="text-xs font-bold text-slate-500">🎮 免費遊戲新品提醒</span>
          <input
            type="checkbox"
            checked={Boolean(prefs.games_enabled)}
            onChange={(e) => handleSavePrefs({ ...prefs, games_enabled: e.target.checked })}
            className="h-4 w-4 accent-indigo-600"
          />
        </label>
        {prefs.games_enabled && (
          <>
            <p className="mb-1.5 mt-2 text-xs text-slate-400">只提醒這些平台（都不選 = 全部平台都提醒）：</p>
            <div className="flex flex-wrap gap-1.5">
              {GAME_PLATFORMS.map(([key, label]) => {
                const on = (prefs.games_platforms || []).includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      const cur = prefs.games_platforms || [];
                      const next = on ? cur.filter((k) => k !== key) : [...cur, key];
                      handleSavePrefs({ ...prefs, games_platforms: next });
                    }}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                      on ? "bg-indigo-600 text-white" : "bg-slate-50 text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      <p className="text-xs text-slate-400">
        通知由你的主機在背景送出，所以就算沒開網頁也會跳。每台想收通知的裝置都要各按一次「開啟這台的通知」。
      </p>
    </div>
  );
}

const CATEGORY_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#f43f5e",
  "#64748b",
];

function ColorPicker({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {CATEGORY_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`h-6 w-6 rounded-full transition ${
            value === c ? "ring-2 ring-slate-800 ring-offset-1" : "hover:scale-110"
          }`}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  );
}

function SystemSettings() {
  const [info, setInfo] = useState(null);
  const [msg, setMsg] = useState("");
  const [ver, setVer] = useState(null);
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState(null); // { behind, latest_subject } | { error }

  useEffect(() => {
    getUpdateAvailable()
      .then(setInfo)
      .catch(() => setInfo({ supported: false }));
    getVersion()
      .then(setVer)
      .catch(() => setVer(null));
  }, []);

  async function handleCheck() {
    setChecking(true);
    setCheck(null);
    try {
      const r = await checkUpdates();
      setCheck(r.ok ? r : { error: r.detail || "檢查失敗" });
    } catch {
      setCheck({ error: "檢查失敗" });
    } finally {
      setChecking(false);
    }
  }

  const [updating, setUpdating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stepLabel, setStepLabel] = useState("");

  async function handleUpdate() {
    if (
      !window.confirm(
        "要現在更新嗎？主機會拉最新程式、重建並重啟，約 1–2 分鐘。期間網頁會短暫斷線，完成後會自動重新整理。"
      )
    )
      return;
    setMsg("");
    setUpdating(true);
    setProgress(5);
    setStepLabel("開始更新…");
    try {
      await runUpdate();
    } catch (e) {
      setUpdating(false);
      setMsg("⚠️ " + (e?.response?.data?.detail || e?.message || "更新失敗"));
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
        setStepLabel("更新逾時，請到主機視窗看看狀況。");
        return;
      }
      try {
        const s = await getUpdateStatus();
        if (wentDown) {
          // 後端曾斷線又回來 = 更新完成
          clearInterval(timer);
          setProgress(100);
          setStepLabel("完成！即將重新整理…");
          setTimeout(() => window.location.reload(), 1500);
          return;
        }
        if (PCT[s.step]) setProgress((p) => Math.max(p, PCT[s.step]));
        setStepLabel(LBL[s.step] || "更新中…");
        setProgress((p) => Math.min(p + 1, 90)); // 平滑爬升，重啟前封頂 90%
      } catch {
        wentDown = true;
        setStepLabel("重啟中…");
        setProgress((p) => Math.max(p, 92));
      }
    }, 1500);
  }

  const supported = !info || info.supported;

  return (
    <div className="space-y-3">
      {ver?.commit && (
        <p className="text-xs text-slate-500">
          目前版本 <span className="font-mono font-semibold text-slate-700">{ver.commit}</span>
          {ver.date && <span className="text-slate-400"> · {ver.date}</span>}
          {ver.subject && <span className="mt-0.5 block truncate text-slate-400">{ver.subject}</span>}
        </p>
      )}

      {/* 檢查更新 */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={handleCheck}
          disabled={checking}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-40"
        >
          {checking ? "檢查中…" : "🔍 檢查更新"}
        </button>
        {check?.error && <span className="text-sm text-amber-600">⚠️ {check.error}</span>}
        {check && !check.error &&
          (check.behind > 0 ? (
            <span className="text-sm font-semibold text-emerald-600">有 {check.behind} 個更新可用 🎉</span>
          ) : (
            <span className="text-sm text-slate-500">已是最新版 ✅</span>
          ))}
      </div>

      {supported ? (
        <>
          {updating ? (
            <div>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-600">{stepLabel}</span>
                <span className="text-slate-400">{progress}%</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ) : (
            <button
              onClick={handleUpdate}
              className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 active:scale-95"
            >
              ⬆️ 立即更新並重啟
            </button>
          )}
          {msg && <p className="text-sm text-slate-500">{msg}</p>}
          <p className="text-xs text-slate-400">
            會在主機背景執行 win-restart.bat：拉最新程式 → 重建前端 → 重啟後端。完成後會自動重新整理網頁。
          </p>
        </>
      ) : (
        <p className="text-sm text-slate-400">
          一鍵更新只在自架 Windows 主機可用（或已在 .env 停用）。其他情況請手動執行 win-restart.bat。
        </p>
      )}
    </div>
  );
}

/** 設定頁的通用區塊卡片，之後新增設定就加一個 <SettingSection>。 */
function SettingSection({ title, description, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-black text-slate-900">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-slate-400">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function CategorySettings() {
  const [categories, setCategories] = useState([]);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(CATEGORY_COLORS[0]);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", color: "" });

  async function refresh() {
    try {
      setCategories(await listCategories());
    } catch {
      setCategories([]);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      await createCategory({ name: newName.trim(), color: newColor });
      setNewName("");
      refresh();
    } catch (err) {
      alert(
        "新增失敗：連不到分類 API。\n請確認 backend 已經 git pull 並重新啟動。\n" +
          (err?.message ?? "")
      );
    }
  }

  async function handleDelete(cat) {
    if (!window.confirm(`確定要刪除分類「${cat.name}」嗎？使用中的行程會變成未分類。`)) return;
    await deleteCategory(cat.id);
    refresh();
  }

  async function handleSaveEdit(id) {
    if (!editForm.name.trim()) return;
    await updateCategory(id, { name: editForm.name.trim(), color: editForm.color });
    setEditingId(null);
    refresh();
  }

  const field =
    "rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100";

  return (
    <div className="space-y-4">
      {/* 新增 */}
      <form onSubmit={handleCreate} className="flex flex-wrap items-center gap-3">
        <input
          className={`${field} w-44`}
          placeholder="新分類名稱，例：工作"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <ColorPicker value={newColor} onChange={setNewColor} />
        <button
          type="submit"
          disabled={!newName.trim()}
          className="rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-indigo-200 transition hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:shadow-none"
        >
          ＋ 新增分類
        </button>
      </form>

      {/* 列表 */}
      {categories.length === 0 ? (
        <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
          還沒有分類。建議先建立幾個，例如：工作、自己的事、家裡的事、出遊。
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {categories.map((cat) =>
            editingId === cat.id ? (
              <li key={cat.id} className="flex flex-wrap items-center gap-3 py-3">
                <input
                  className={`${field} w-44`}
                  value={editForm.name}
                  autoFocus
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                />
                <ColorPicker
                  value={editForm.color}
                  onChange={(c) => setEditForm({ ...editForm, color: c })}
                />
                <div className="ml-auto flex gap-2">
                  <button
                    onClick={() => setEditingId(null)}
                    className="rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => handleSaveEdit(cat.id)}
                    className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-bold text-white hover:bg-slate-700"
                  >
                    儲存
                  </button>
                </div>
              </li>
            ) : (
              <li key={cat.id} className="flex items-center gap-3 py-3">
                <span
                  className="h-3.5 w-3.5 shrink-0 rounded-full"
                  style={{ backgroundColor: cat.color }}
                />
                <span className="font-medium text-slate-800">{cat.name}</span>
                <div className="ml-auto flex gap-1">
                  <button
                    onClick={() => {
                      setEditingId(cat.id);
                      setEditForm({ name: cat.name, color: cat.color });
                    }}
                    className="rounded-lg px-3 py-1.5 text-sm text-slate-500 transition hover:bg-slate-100"
                  >
                    編輯
                  </button>
                  <button
                    onClick={() => handleDelete(cat)}
                    className="rounded-lg px-3 py-1.5 text-sm text-red-500 transition hover:bg-red-50"
                  >
                    刪除
                  </button>
                </div>
              </li>
            )
          )}
        </ul>
      )}
    </div>
  );
}

export default function Settings() {
  const TABS = [
    { key: "general", label: "🏷️ 一般" },
    ...(NO_BACKEND ? [] : [{ key: "notify", label: "🔔 通知" }, { key: "system", label: "⚙️ 系統" }]),
  ];
  const [tabRaw, setTab] = useState(() => localStorage.getItem("dispatch.settingsTab") || "general");
  const tab = TABS.some((t) => t.key === tabRaw) ? tabRaw : "general";
  function switchTab(k) {
    setTab(k);
    localStorage.setItem("dispatch.settingsTab", k);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-black text-slate-900">設定</h1>
        <p className="mt-1 text-sm text-slate-500">管理 Dispatch 的分類與偏好設定。</p>
      </div>

      {/* 分頁 */}
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 text-sm font-semibold">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => switchTab(t.key)}
            className={`shrink-0 rounded-full px-4 py-1.5 transition ${
              tab === t.key
                ? "bg-slate-900 text-white shadow-sm"
                : "bg-white text-slate-500 ring-1 ring-slate-200 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "general" && (
        <>
          <SettingSection
            title="🏷️ 行程分類"
            description="建立自己的分類（工作、家裡、出遊…），行程可以掛上分類，總覽頁就能用分類篩選。"
          >
            <CategorySettings />
          </SettingSection>

          <SettingSection title="🌤️ 天氣" description="設定你所在的城市，總覽頁會顯示本週天氣預報。">
            <WeatherSettings />
          </SettingSection>
        </>
      )}

      {tab === "notify" && !NO_BACKEND && (
        <SettingSection
          title="🔔 通知"
          description="行程到點、每日摘要、免費遊戲新品會推播到電腦或手機，就算沒開網頁也會跳。"
        >
          <NotificationSettings />
        </SettingSection>
      )}

      {tab === "system" && !NO_BACKEND && (
        <>
          <SettingSection title="⬆️ 更新" description="不用連到主機，直接從這裡把程式更新到最新版並重啟。">
            <SystemSettings />
          </SettingSection>

          <SettingSection title="🚧 更多設定" description="陸續加入中——想到要什麼就告訴開發者。">
            <p className="text-sm text-slate-400">
              預留位置：Ollama 模型管理、Google 同步偏好、資料備份…
            </p>
          </SettingSection>
        </>
      )}
    </div>
  );
}
