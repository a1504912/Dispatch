import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { getToken } from "../api/client";
import { logout } from "../api/auth";
import { LOCAL_MODE, NO_BACKEND } from "../localMode";
import { SUPABASE_MODE, supabase } from "../supabase";
import Lightbox from "./Lightbox.jsx";

function CalendarIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="1.8" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
      />
    </svg>
  );
}

function UsersIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="1.8" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"
      />
    </svg>
  );
}

function PlaneIcon({ className }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
    </svg>
  );
}

function TodoIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="1.8" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
      />
    </svg>
  );
}

function WalletIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="1.8" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 9m18 0V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v3"
      />
    </svg>
  );
}

function NewsIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="1.8" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 0 1-2.25 2.25M16.5 7.5V18a2.25 2.25 0 0 0 2.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 0 0 2.25 2.25h13.5M6 7.5h3v3H6v-3Z"
      />
    </svg>
  );
}

function GameIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="1.8" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.75 9.75h1.5m-.75-.75v1.5m5.03-.375h.008m2.212-.75h.008M6.911 5.25h10.178a2.25 2.25 0 0 1 2.174 1.671l1.35 5.115a2.652 2.652 0 0 1-4.977 1.815 2.25 2.25 0 0 0-2.087-1.416H10.05a2.25 2.25 0 0 0-2.086 1.416 2.652 2.652 0 0 1-4.978-1.815l1.35-5.115A2.25 2.25 0 0 1 6.911 5.25Z"
      />
    </svg>
  );
}

function InfoIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="1.8" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z"
      />
    </svg>
  );
}

function ChevronIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="2.2" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
    </svg>
  );
}

function GearIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="1.8" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a7.723 7.723 0 0 1 0-.255c.007-.378-.138-.75-.43-.991l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  );
}

const navItems = [
  { to: "/dashboard", label: "總覽", icon: CalendarIcon },
  { to: "/todos", label: "待辦", icon: TodoIcon },
  { to: "/ledger", label: "記帳", icon: WalletIcon },
  // 新聞、免費遊戲收進「情報站」群組；AI 員工需要後端，離線/雲端同步模式隱藏
  ...(NO_BACKEND
    ? []
    : [
        {
          label: "情報站",
          icon: InfoIcon,
          children: [
            { to: "/news", label: "新聞", icon: NewsIcon },
            { to: "/games", label: "免費遊戲", icon: GameIcon },
          ],
        },
        { to: "/agents", label: "AI 員工", icon: UsersIcon },
      ]),
  { to: "/settings", label: "設定", icon: GearIcon },
];

// 側邊欄（桌面）連結樣式
const sideLink = (active) =>
  `flex w-full items-center gap-3 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-medium transition ${
    active
      ? "bg-indigo-500/15 text-white shadow-inner ring-1 ring-indigo-400/30"
      : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
  }`;

// 底部分頁（手機）連結樣式：圖示在上、小字在下
const tabLink = (active) =>
  `flex flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-[10px] font-medium transition ${
    active ? "text-indigo-300" : "text-slate-400 active:text-slate-200"
  }`;

function NavLeaf({ to, label, icon: Icon, variant }) {
  const tab = variant === "tab";
  return (
    <NavLink to={to} className={({ isActive }) => (tab ? tabLink(isActive) : sideLink(isActive))}>
      <Icon className="h-5 w-5 shrink-0" />
      {label}
    </NavLink>
  );
}

// 可展開的分類（桌面往下展開、手機底部跳出上浮小選單）
function NavGroup({ label, icon: Icon, children, variant }) {
  const location = useLocation();
  const childActive = children.some((c) => location.pathname.startsWith(c.to));
  const isSide = variant === "side";
  const [open, setOpen] = useState(isSide ? childActive : false);
  const ref = useRef(null);

  // 進入子頁時，桌面自動展開；手機選完自動收起
  useEffect(() => {
    if (isSide) {
      if (childActive) setOpen(true);
    } else {
      setOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // 手機：點外面自動收起
  useEffect(() => {
    if (isSide || !open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [isSide, open]);

  const headerActive = childActive || (!isSide && open);

  // 手機底部分頁版：上浮選單
  if (!isSide) {
    return (
      <div ref={ref} className="relative flex flex-1">
        <button type="button" onClick={() => setOpen((v) => !v)} className={tabLink(headerActive)}>
          <Icon className="h-5 w-5 shrink-0" />
          {label}
        </button>
        {open && (
          <div className="absolute bottom-full left-1/2 z-40 mb-2 flex min-w-[10rem] -translate-x-1/2 flex-col gap-1 rounded-2xl bg-slate-800 p-1.5 shadow-2xl ring-1 ring-white/10">
            {children.map((c) => (
              <NavLeaf key={c.to} {...c} variant="side" />
            ))}
          </div>
        )}
      </div>
    );
  }

  // 桌面側邊欄版：往下展開
  return (
    <div ref={ref}>
      <button type="button" onClick={() => setOpen((v) => !v)} className={sideLink(headerActive)}>
        <Icon className="h-5 w-5 shrink-0" />
        {label}
        <ChevronIcon
          className={`ml-auto h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
        />
      </button>
      {open && (
        <div className="mt-1 flex flex-col gap-1 pl-4">
          {children.map((c) => (
            <NavLeaf key={c.to} {...c} variant="side" />
          ))}
        </div>
      )}
    </div>
  );
}

function NavItems({ variant }) {
  return navItems.map((item) =>
    item.children ? (
      <NavGroup key={item.label} {...item} variant={variant} />
    ) : (
      <NavLeaf key={item.to} {...item} variant={variant} />
    )
  );
}

export default function Layout() {
  const [supaAuthed, setSupaAuthed] = useState(false);

  // Supabase 模式：沒有登入 session 就導回登入頁
  useEffect(() => {
    if (!SUPABASE_MODE) return;
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) window.location.replace("/login");
      else setSupaAuthed(true);
    });
  }, []);

  const showLogout = SUPABASE_MODE ? supaAuthed : Boolean(getToken());

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* 桌面版側邊欄 */}
      <aside className="hidden w-60 shrink-0 flex-col bg-slate-900 md:flex">
        <div className="flex items-center gap-3 px-5 pb-6 pt-7">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-900/50">
            <PlaneIcon className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-lg font-black tracking-wide text-white">Dispatch</p>
            <p className="text-[11px] text-slate-500">AI 助理團隊</p>
          </div>
        </div>

        <nav className="flex flex-col gap-1 px-3">
          <NavItems variant="side" />
        </nav>

        <div className="mt-auto space-y-2 p-4">
          <div className="rounded-xl bg-white/5 px-4 py-3 ring-1 ring-white/10">
            {SUPABASE_MODE ? (
              <>
                <p className="text-xs font-medium text-slate-300">☁️ 雲端同步</p>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                  資料存在雲端，所有裝置同步；AI 功能請用筆電版。
                </p>
              </>
            ) : LOCAL_MODE ? (
              <>
                <p className="text-xs font-medium text-slate-300">📦 離線模式</p>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                  資料儲存在此瀏覽器，換裝置不會同步；AI 功能請用筆電版。
                </p>
              </>
            ) : (
              <>
                <p className="text-xs font-medium text-slate-300">🦙 本地模型驅動</p>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                  所有對話都在你的電腦上完成，資料不出門。
                </p>
              </>
            )}
          </div>
          {showLogout && (
            <button
              onClick={logout}
              className="w-full rounded-xl px-4 py-2 text-left text-sm font-medium text-slate-400 transition hover:bg-white/5 hover:text-slate-200"
            >
              ⏻ 登出
            </button>
          )}
        </div>
      </aside>

      {/* 手機版頂欄（只有品牌 + 登出，導覽移到底部分頁） */}
      <header className="sticky top-0 z-30 flex items-center gap-3 bg-slate-900 px-4 py-3 md:hidden">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600">
          <PlaneIcon className="h-4 w-4 text-white" />
        </div>
        <span className="font-black text-white">Dispatch</span>
        {showLogout && (
          <button
            onClick={logout}
            className="ml-auto rounded-lg px-3 py-1.5 text-sm font-medium text-slate-400 transition active:bg-white/5 active:text-slate-200"
          >
            ⏻ 登出
          </button>
        )}
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="w-full px-4 py-6 pb-24 md:px-8 md:py-8 md:pb-8">
          <Outlet />
        </div>
      </main>

      {/* 手機版底部分頁列 */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch gap-0.5 border-t border-white/10 bg-slate-900/95 px-1.5 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden">
        <NavItems variant="tab" />
      </nav>

      <Lightbox />
    </div>
  );
}
