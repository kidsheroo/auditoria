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
  | "headlines" | "todo" | "reports";

const NAV: { page: NavPage; label: string; icon: string }[] = [
  { page: "overview",    label: "Overview",     icon: "⊞" },
  { page: "ad_group",   label: "Ad Groups",    icon: "◉" },
  { page: "keyword",    label: "Keywords",     icon: "⌕" },
  { page: "search_term",label: "Search Terms", icon: "⌖" },
  { page: "ad",         label: "Ads",          icon: "▤" },
  { page: "headlines",  label: "Headlines",    icon: "⁋" },
  { page: "todo",       label: "To Do",        icon: "⚡" },
  { page: "reports",    label: "Reports",      icon: "▦" },
];

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
    setActivePage("overview");
  };

  if (statusQuery.isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading...</p>
      </div>
    );
  }

  const ready = statusQuery.data?.ready ?? false;
  const accounts = accountsQuery.data ?? [];

  return (
    <div className="flex h-full relative z-10">
      {/* Floating orb */}
      <div className="orb" />

      {/* SIDEBAR */}
      <aside className="glass w-64 shrink-0 flex flex-col py-6 px-4 z-10">
        {/* Logo */}
        <div className="flex items-center gap-2 mb-8 px-2">
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="logo-g" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#22c55e"/>
                <stop offset="100%" stopColor="#06b6d4"/>
              </linearGradient>
            </defs>
            <path d="M18 3L31 30H5L18 3Z" fill="url(#logo-g)"/>
            <rect x="11.5" y="21.5" width="13" height="2.5" rx="1.25" fill="white" opacity="0.9"/>
          </svg>
          <span className="text-xl font-semibold text-gray-800">Auditoria</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1">
          {NAV.map(({ page, label, icon }) => (
            <button
              key={page}
              onClick={() => setActivePage(page)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-medium transition-all duration-200 text-gray-600 hover:bg-white/60 ${
                activePage === page ? "nav-active shadow-sm" : ""
              }`}
            >
              <span className="text-base w-5 text-center">{icon}</span>
              {label}
            </button>
          ))}
        </nav>

        {/* Footer info */}
        {auditResult && (
          <div className="mt-4 px-3 pt-4 border-t border-white/40 text-xs text-gray-400 space-y-1">
            <div className="flex justify-between">
              <span>Audit ID</span>
              <span className="font-medium text-gray-600">{auditResult.account_id}</span>
            </div>
            <div className="flex justify-between">
              <span>Last updated</span>
              <span className="font-medium text-gray-600">
                {new Date(auditResult.generated_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        )}

      </aside>

      {/* MAIN */}
      <main className="flex-1 main-scroll z-10">
        {!ready ? (
          <ConnectScreen />
        ) : !auditResult ? (
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
  );
}
