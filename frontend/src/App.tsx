import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAccounts, runAudit } from "./api";
import type { AuditResult, AuditRequest } from "./api";
import ConnectScreen from "./components/ConnectScreen";
import AuditForm from "./components/AuditForm";
import Dashboard from "./components/Dashboard";

export type NavPage =
  | "overview" | "ad_group"
  | "keyword" | "search_term" | "ad"
  | "todo" | "reports";

const NAV: { page: NavPage; label: string; icon: string }[] = [
  { page: "overview",     label: "Overview",      icon: "⊞" },
  { page: "ad_group",    label: "Ad Groups",     icon: "◉" },
  { page: "keyword",     label: "Keywords",      icon: "⌕" },
  { page: "search_term", label: "Search Terms",  icon: "⌖" },
  { page: "ad",          label: "Ads",           icon: "▤" },
  { page: "todo",        label: "To Do",         icon: "⚡" },
  { page: "reports",     label: "Reports",       icon: "▦" },
];

const PAGE_TITLES: Record<NavPage, { title: string; subtitle: (r: AuditResult | null) => string }> = {
  overview:    { title: "Overview",     subtitle: (r) => r ? `Account: ${r.account_name} · Last run just now` : "" },
  ad_group:    { title: "Ad Groups",   subtitle: (r) => r ? `${r.items.filter(i=>i.entity_type==="ad_group").length} wasting ad groups` : "" },
  keyword:     { title: "Keywords",    subtitle: (r) => r ? `${r.items.filter(i=>i.entity_type==="keyword").length} wasting keywords` : "" },
  search_term: { title: "Search Terms",subtitle: (r) => r ? `${r.items.filter(i=>i.entity_type==="search_term").length} wasting search terms` : "" },
  ad:          { title: "Ads",         subtitle: (r) => r ? `${r.items.filter(i=>i.entity_type==="ad").length} wasting ads` : "" },
  todo:        { title: "To Do",       subtitle: (r) => r ? `${r.recommendations.length} recommendations` : "" },
  reports:     { title: "Reports",     subtitle: () => "Export audit data as CSV" },
};

const LogoSVG = () => (
  <svg width="32" height="32" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="lg" x1="2" y1="4" x2="34" y2="32" gradientUnits="userSpaceOnUse">
        <stop stopColor="#22c55e"/><stop offset="1" stopColor="#06b6d4"/>
      </linearGradient>
    </defs>
    <polygon points="18,4 34,32 2,32" fill="url(#lg)"/>
    <rect x="10" y="21" width="16" height="3" rx="1.5" fill="white"/>
  </svg>
);

export default function App() {
  const [activePage, setActivePage] = useState<NavPage>("overview");
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [lastReq, setLastReq] = useState<AuditRequest | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const statusQuery = useQuery({
    queryKey: ["status"],
    queryFn: () =>
      fetch("http://localhost:8000/auth/status", { credentials: "include" })
        .then((r) => r.json()) as Promise<{ ready: boolean }>,
  });

  const accountsQuery = useQuery({
    queryKey: ["accounts"],
    queryFn: getAccounts,
    enabled: statusQuery.data?.ready === true,
  });

  const handleRunAudit = async (req: AuditRequest) => {
    setRunning(true);
    setAuditError(null);
    try {
      const result = await runAudit(req);
      setAuditResult(result);
      setLastReq(req);
      setActivePage("overview");
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Audit failed. Check your credentials and try again.";
      setAuditError(msg);
    } finally {
      setRunning(false);
    }
  };

  const handleRerun = () => {
    setAuditResult(null);
    setAuditError(null);
  };

  if (statusQuery.isLoading) {
    return (
      <div className="h-full flex items-center justify-center" style={{ background: "#f0fdf9" }}>
        <div className="skeleton w-8 h-8 rounded-full" />
      </div>
    );
  }

  const ready = statusQuery.data?.ready ?? false;
  const accounts = accountsQuery.data ?? [];
  const pt = PAGE_TITLES[activePage];

  if (!ready) return <ConnectScreen />;

  return (
    <div className="flex h-full">
      {/* SIDEBAR — 64px icon rail */}
      <aside className="glass-sidebar w-16 shrink-0 flex flex-col items-center py-4 gap-0 z-20">
        {/* Logo */}
        <div className="mb-5 mt-1">
          <LogoSVG />
        </div>

        {/* Nav */}
        <nav className="flex-1 flex flex-col gap-1 w-full px-2">
          {NAV.map(({ page, label, icon }) => {
            const isActive = activePage === page;
            const hasData = auditResult !== null;
            const disabled = !hasData && page !== "overview";
            return (
              <button
                key={page}
                title={label}
                onClick={() => { if (!disabled) setActivePage(page); }}
                disabled={disabled && !auditResult}
                className={`w-full h-11 rounded-xl flex items-center justify-center text-lg transition-all duration-150 ${
                  isActive
                    ? "nav-active text-white shadow-sm"
                    : disabled
                    ? "text-gray-300 cursor-default"
                    : "text-gray-500 hover:bg-white/50"
                }`}
              >
                <span style={{ filter: isActive ? "brightness(10)" : "none" }}>{icon}</span>
              </button>
            );
          })}
        </nav>

        {/* Avatar */}
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center mt-2"
          style={{ background: "#d1fae5" }}
        >
          <span className="text-[11px] font-bold" style={{ color: "#16a34a" }}>JD</span>
        </div>
      </aside>

      {/* RIGHT SIDE */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* TOPBAR */}
        {(auditResult || running) && (
          <div className="glass-topbar h-14 shrink-0 flex items-center justify-between px-7 z-10">
            <div>
              <div className="text-[17px] font-semibold text-gray-800 leading-tight">{pt.title}</div>
              {pt.subtitle(auditResult) && (
                <div className="text-[11px] text-gray-400 mt-0.5">{pt.subtitle(auditResult)}</div>
              )}
            </div>
            <div className="flex items-center gap-2.5">
              {lastReq && (
                <div
                  className="px-3 py-1 rounded-full text-[11px] font-medium"
                  style={{ background: "#d1fae5", color: "#16a34a", border: "1px solid rgba(34,197,94,0.2)" }}
                >
                  {lastReq.date_range.replace("LAST_", "").replace("_DAYS", "d range")}
                </div>
              )}
              <button
                onClick={handleRerun}
                title="Re-run audit"
                className="w-7 h-7 rounded-full gradient-bg flex items-center justify-center text-white text-xs font-bold shadow-sm hover:opacity-90 transition-opacity"
              >
                ↺
              </button>
            </div>
          </div>
        )}

        {/* MAIN CONTENT */}
        <main className="flex-1 main-scroll">
          {!auditResult ? (
            <AuditForm
              accounts={accounts}
              accountsLoading={accountsQuery.isLoading}
              onSubmit={handleRunAudit}
              running={running}
              error={auditError}
            />
          ) : (
            <Dashboard
              result={auditResult}
              lastReq={lastReq!}
              activePage={activePage}
              onNavigate={setActivePage}
              onRerun={handleRerun}
            />
          )}
        </main>
      </div>
    </div>
  );
}
