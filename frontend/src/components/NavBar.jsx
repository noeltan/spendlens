import { NavLink } from 'react-router-dom';

const LogoIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
    <polyline points="16 7 22 7 22 13" />
  </svg>
);

const IconOverview = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
    <rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>
  </svg>
);
const IconTransactions = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
    <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
    <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
  </svg>
);
const IconRetirement = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 17l6-6 4 4 8-8"/>
    <path d="M17 7h4v4"/>
  </svg>
);
const IconSettings = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);
const IconUser = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
);

const sidebarLinkClass = ({ isActive }) =>
  `flex items-center gap-3 rounded-2xl px-5 py-4 text-[15px] font-semibold transition ${isActive ? 'bg-blue-50 text-blue-700 shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`;

const bottomTabClass = ({ isActive }) => `bottom-tab-item${isActive ? ' active' : ''}`;

export default function NavBar({ monthLabel, onPrevMonth, onNextMonth, onSignOut, viewBy, setViewBy }) {
  return (
    <>
      {/* ── Desktop sidebar ─────────────────────────────────── */}
      <aside className="hidden h-screen w-[288px] shrink-0 border-r border-slate-200 bg-white lg:flex lg:flex-col lg:sticky lg:top-0">

        {/* Logo */}
        <div className="border-b border-slate-200 px-8 py-7">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-100">
              <LogoIcon />
            </div>
            <span className="text-[20px] font-semibold text-slate-950">SpendLens</span>
          </div>
        </div>

        {/* Nav + viewby toggle */}
        <div className="flex flex-1 flex-col px-5 py-8">
          <nav className="space-y-2">
            <NavLink
              to="/"
              className={sidebarLinkClass}
            >
              <IconOverview /> Overview
            </NavLink>
            <NavLink
              to="/transactions"
              className={sidebarLinkClass}
            >
              <IconTransactions /> Transactions
            </NavLink>
            <NavLink
              to="/retirement"
              className={sidebarLinkClass}
            >
              <IconRetirement /> Retirement
            </NavLink>
            <NavLink
              to="/config"
              className={sidebarLinkClass}
            >
              <IconSettings /> Settings
            </NavLink>
          </nav>

          {/* View-by toggle (desktop only) */}
          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-1 flex">
            <button
              onClick={() => setViewBy('billing')}
              className={`flex-1 rounded-xl border-0 py-2 text-[13px] font-semibold transition-all ${viewBy === 'billing' ? 'bg-white text-blue-700 shadow-sm' : 'bg-transparent text-slate-500 hover:text-slate-700'}`}
            >
              Billing
            </button>
            <button
              onClick={() => setViewBy('calendar')}
              className={`flex-1 rounded-xl border-0 py-2 text-[13px] font-semibold transition-all ${viewBy === 'calendar' ? 'bg-white text-blue-700 shadow-sm' : 'bg-transparent text-slate-500 hover:text-slate-700'}`}
            >
              Calendar
            </button>
          </div>

          {/* Month picker (desktop only) */}
          <div className="mt-4 flex items-center justify-between gap-1 rounded-2xl border border-slate-200 bg-slate-50 px-2 py-2">
            <button
              onClick={onPrevMonth}
              className="flex h-8 w-8 items-center justify-center rounded-xl border-0 bg-transparent text-slate-500 hover:bg-white hover:text-slate-900"
            >
              ‹
            </button>
            <span className="flex-1 text-center text-[13px] font-medium text-slate-700">{monthLabel}</span>
            <button
              onClick={onNextMonth}
              className="flex h-8 w-8 items-center justify-center rounded-xl border-0 bg-transparent text-slate-500 hover:bg-white hover:text-slate-900"
            >
              ›
            </button>
          </div>
        </div>

        {/* Session footer */}
        <div className="border-t border-slate-200 px-6 py-6">
          <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Session</p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Google Account</p>
                <p className="text-xs text-slate-500">Authenticated</p>
              </div>
              <button
                onClick={onSignOut}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-red-500"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Mobile top bar ──────────────────────────────────── */}
      <nav className="sticky top-0 z-[100] border-b border-slate-200 bg-white lg:hidden">
        <div className="page-outer">
          <div className="flex h-16 items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
                <LogoIcon />
              </div>
              <span className="text-[18px] font-semibold text-slate-950">SpendLens</span>
            </div>

            {/* User avatar */}
            <button
              onClick={onSignOut}
              title="Sign out"
              className="flex h-9 w-9 items-center justify-center rounded-full border-0 bg-slate-100 text-slate-600 hover:bg-slate-200"
            >
              <IconUser />
            </button>
          </div>

          {/* Month picker + view-by toggle (mobile only) */}
          <div className="flex items-center gap-2 pb-3">
            <div className="flex flex-1 items-center justify-between gap-1 rounded-xl border border-slate-200 bg-slate-50 px-1 py-1">
              <button
                onClick={onPrevMonth}
                className="flex h-8 w-8 items-center justify-center rounded-lg border-0 bg-transparent text-slate-500 active:bg-white"
              >
                ‹
              </button>
              <span className="flex-1 text-center text-[13px] font-medium text-slate-700">{monthLabel}</span>
              <button
                onClick={onNextMonth}
                className="flex h-8 w-8 items-center justify-center rounded-lg border-0 bg-transparent text-slate-500 active:bg-white"
              >
                ›
              </button>
            </div>
            <button
              onClick={() => setViewBy(viewBy === 'billing' ? 'calendar' : 'billing')}
              className="h-10 shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-3 text-[12px] font-semibold text-slate-600"
            >
              {viewBy === 'billing' ? 'Billing' : 'Calendar'}
            </button>
          </div>
        </div>
      </nav>

      {/* ── Mobile bottom tab bar (3 items) ─────────────────── */}
      <nav className="bottom-tab-bar lg:hidden">
        <NavLink to="/" className={bottomTabClass}>
          <IconOverview />
          Overview
        </NavLink>
        <NavLink to="/transactions" className={bottomTabClass}>
          <IconTransactions />
          Transactions
        </NavLink>
        <NavLink to="/retirement" className={bottomTabClass}>
          <IconRetirement />
          Retirement
        </NavLink>
        <NavLink to="/config" className={bottomTabClass}>
          <IconSettings />
          Settings
        </NavLink>
      </nav>
    </>
  );
}
