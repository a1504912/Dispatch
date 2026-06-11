import { NavLink, Outlet } from "react-router-dom";

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

const navItems = [
  { to: "/dashboard", label: "總覽", icon: CalendarIcon },
  { to: "/agents", label: "AI 員工", icon: UsersIcon },
];

function NavItems({ vertical }) {
  return navItems.map(({ to, label, icon: Icon }) => (
    <NavLink
      key={to}
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
          vertical ? "" : "flex-1 justify-center"
        } ${
          isActive
            ? "bg-indigo-500/15 text-white shadow-inner ring-1 ring-indigo-400/30"
            : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
        }`
      }
    >
      <Icon className="h-5 w-5 shrink-0" />
      {label}
    </NavLink>
  ));
}

export default function Layout() {
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
          <NavItems vertical />
        </nav>

        <div className="mt-auto p-4">
          <div className="rounded-xl bg-white/5 px-4 py-3 ring-1 ring-white/10">
            <p className="text-xs font-medium text-slate-300">🦙 本地模型驅動</p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
              所有對話都在你的電腦上完成，資料不出門。
            </p>
          </div>
        </div>
      </aside>

      {/* 手機版頂欄 */}
      <header className="flex items-center gap-3 bg-slate-900 px-4 py-3 md:hidden">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600">
          <PlaneIcon className="h-4 w-4 text-white" />
        </div>
        <span className="font-black text-white">Dispatch</span>
        <nav className="ml-auto flex gap-1">
          <NavItems />
        </nav>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
