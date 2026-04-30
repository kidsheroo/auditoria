import type { AuditResult, AuditRequest, WastingItem } from "../api";
import { getExportUrl } from "../api";
import type { NavPage } from "../App";
import AuditTable from "./AuditTable";
import HeadlineTable from "./HeadlineTable";
import OpportunityDeck from "./OpportunityDeck";

interface Props {
  result: AuditResult;
  lastReq: AuditRequest;
  activePage: NavPage;
  onNavigate: (p: NavPage) => void;
  onRerun: () => void;
}

function usd(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
}

const STAT_PAGES: { page: NavPage; label: string; type: WastingItem["entity_type"] | null; icon: string }[] = [
  { page: "campaign",    label: "Campaigns",    type: "campaign",    icon: "🗂" },
  { page: "ad_group",   label: "Ad Groups",    type: "ad_group",    icon: "📦" },
  { page: "keyword",    label: "Keywords",     type: "keyword",     icon: "🔍" },
  { page: "search_term",label: "Search Terms", type: "search_term", icon: "🔎" },
  { page: "ad",         label: "Ads",          type: "ad",          icon: "📋" },
];

function StatCard({
  label, count, spend, icon, active, onClick,
}: {
  label: string; count: number; spend: number; icon: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`glass-light rounded-2xl p-4 text-center transition-all duration-200 hover:-translate-y-1 ${
        active ? "ring-2 ring-[#7f7fd5]" : ""
      }`}
    >
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-2xl font-bold text-gray-800">{count}</div>
      {spend > 0 && <div className="text-xs text-[#ff2e6a] font-medium mt-0.5">{usd(spend)}</div>}
    </button>
  );
}

function ReportsPage({ result, lastReq }: { result: AuditResult; lastReq: AuditRequest }) {
  return (
    <div className="glass rounded-3xl p-8 space-y-6">
      <h2 className="text-lg font-semibold text-gray-800">Export Report</h2>
      <p className="text-sm text-gray-500">
        Download a full CSV of all wasting items from this audit ({result.items.length} rows).
      </p>
      <a
        href={getExportUrl(lastReq)}
        className="inline-block btn-gradient px-6 py-3 rounded-2xl text-sm font-medium shadow-md"
      >
        Download CSV
      </a>
      <div className="border-t border-white/40 pt-4 text-xs text-gray-400 space-y-1">
        <div>Account: <span className="text-gray-600 font-medium">{result.account_name}</span></div>
        <div>Period: <span className="text-gray-600 font-medium">{result.date_range.replace(/_/g, " ")}</span></div>
        <div>Total waste: <span className="text-[#ff2e6a] font-medium">{usd(result.total_waste_usd)}</span></div>
        <div>Generated: <span className="text-gray-600 font-medium">{new Date(result.generated_at).toLocaleString()}</span></div>
      </div>
    </div>
  );
}

export default function Dashboard({ result, lastReq, activePage, onNavigate, onRerun }: Props) {
  const tableData: WastingItem[] =
    activePage === "all" || activePage === "overview"
      ? result.items
      : result.items.filter((i) => i.entity_type === activePage);

  const zeroConv = result.items.filter((i) => i.waste_reason === "zero_conversions").length;
  const highCpa = result.items.filter((i) => i.waste_reason === "high_cpa").length;
  const quickWins = result.recommendations.filter((r) => r.category === "quick_win").length;
  const scaling = result.recommendations.filter((r) => r.category === "scaling").length;

  return (
    <div className="p-8 space-y-6">
      {/* Topbar */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-gray-800">{result.account_id}</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            Generated {new Date(result.generated_at).toLocaleString("en-GB", {
              day: "2-digit", month: "2-digit", year: "numeric",
              hour: "2-digit", minute: "2-digit",
            })} ·{" "}
            <span
              className="text-[#7f7fd5] cursor-pointer font-medium"
              onClick={() => onNavigate("all")}
            >
              last {result.date_range.replace("LAST_", "").replace("_DAYS", " days").toLowerCase()}
            </span>
          </p>
        </div>
        <div className="flex gap-3">
          <a
            href={getExportUrl(lastReq)}
            className="glass-light flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-medium text-gray-700 hover:bg-white/70 transition-colors"
          >
            <span>↓</span> Export CSV
          </a>
          <button
            onClick={onRerun}
            className="btn-gradient flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-medium shadow-md"
          >
            ✦ Re-run Audit
          </button>
        </div>
      </div>

      {/* Overview page */}
      {activePage === "overview" && (
        <>
          {/* Big cards */}
          <div className="grid grid-cols-2 gap-5">
            <div className="glass rounded-3xl p-7">
              <p className="text-sm text-gray-500 font-medium mb-2">Total Wasted Spend ↑</p>
              <div className="gradient-text text-5xl font-semibold tracking-tight mb-1">
                {usd(result.total_waste_usd)}
              </div>
              <p className="text-xs text-gray-400">
                {result.date_range.replace(/_/g, " ").toLowerCase()}
              </p>
            </div>
            <div className="glass rounded-3xl p-7">
              <p className="text-sm text-gray-500 font-medium mb-2">Total Wasting Items</p>
              <div className="gradient-text text-5xl font-semibold tracking-tight mb-1">
                {result.items.length}
              </div>
              <p className="text-xs text-gray-400">
                {zeroConv} zero conversions &nbsp;·&nbsp; {highCpa} high CPA
              </p>
            </div>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-5 gap-4">
            {STAT_PAGES.map(({ page, label, type, icon }) => {
              const items = type ? result.items.filter((i) => i.entity_type === type) : result.items;
              return (
                <StatCard
                  key={page}
                  label={label}
                  count={items.length}
                  spend={items.reduce((s, i) => s + i.cost_usd, 0)}
                  icon={icon}
                  active={activePage === page}
                  onClick={() => onNavigate(page)}
                />
              );
            })}
          </div>

          {/* Quick wins strip */}
          {(quickWins > 0 || scaling > 0) && (
            <button
              onClick={() => onNavigate("opportunities")}
              className="w-full glass rounded-2xl px-6 py-4 flex items-center justify-between hover:bg-white/60 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <span className="text-[#ff2e6a] text-xl">⚡</span>
                <div>
                  <p className="text-sm font-semibold text-gray-800">
                    {quickWins} Quick Win{quickWins !== 1 ? "s" : ""}
                    {scaling > 0 && ` · ${scaling} Growth Signal${scaling !== 1 ? "s" : ""}`}
                  </p>
                  <p className="text-xs text-gray-400">Immediate waste to fix — click to review</p>
                </div>
              </div>
              <span className="text-gray-400">›</span>
            </button>
          )}

          {/* Table */}
          <div className="glass rounded-3xl p-6">
            <AuditTable data={result.items} showEntityType />
          </div>
        </>
      )}

      {/* Filtered table pages */}
      {["all", "campaign", "ad_group", "keyword", "search_term", "ad"].includes(activePage) &&
        activePage !== "overview" && (
        <div className="glass rounded-3xl p-6">
          <AuditTable data={tableData} showEntityType={activePage === "all"} />
        </div>
      )}

      {/* Headlines */}
      {activePage === "headlines" && (
        <div className="glass rounded-3xl p-6">
          <HeadlineTable headlines={result.headline_items} pinningIssues={result.pinning_issues} />
        </div>
      )}

      {/* Opportunities */}
      {activePage === "opportunities" && (
        <OpportunityDeck recommendations={result.recommendations} />
      )}

      {/* Reports */}
      {activePage === "reports" && (
        <ReportsPage result={result} lastReq={lastReq} />
      )}
    </div>
  );
}
