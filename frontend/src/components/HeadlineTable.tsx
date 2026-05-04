import { useState } from "react";
import type { HeadlineItem, RsaPinningIssue } from "../api";

interface Props {
  headlines: HeadlineItem[];
  pinningIssues: RsaPinningIssue[];
}

const FILTER_TABS = [
  { value: "all",     label: "All" },
  { value: "winner",  label: "Winners" },
  { value: "bleeder", label: "Bleeders" },
  { value: "testing", label: "Testing" },
] as const;

type FilterTab = typeof FILTER_TABS[number]["value"];

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; icon: string; label: string }> = {
    winner:  { cls: "hl-winner",  icon: "★", label: "Winner" },
    bleeder: { cls: "hl-bleeder", icon: "↓", label: "Bleeder" },
    average: { cls: "hl-average", icon: "–", label: "Average" },
    testing: { cls: "hl-testing", icon: "○", label: "Testing" },
  };
  const m = map[status] ?? { cls: "hl-average", icon: "–", label: status };
  return <span className={m.cls}>{m.icon} {m.label}</span>;
}

export default function HeadlineTable({ headlines, pinningIssues }: Props) {
  const [filter, setFilter] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");

  const filtered = headlines.filter((h) => {
    if (filter !== "all" && h.status !== filter) return false;
    if (search && !h.headline_text.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const counts: Record<FilterTab, number> = {
    all:     headlines.length,
    winner:  headlines.filter((h) => h.status === "winner").length,
    bleeder: headlines.filter((h) => h.status === "bleeder").length,
    testing: headlines.filter((h) => h.status === "testing").length,
  };

  if (headlines.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-[13px] font-medium">No RSA headline data found.</p>
        <p className="text-[11px] mt-1">Headlines appear after your ads run and collect performance data.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter tabs + search */}
      <div className="flex items-center gap-3">
        <div className="flex gap-1 p-1 glass-light rounded-xl">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value)}
              className={`px-3.5 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
                filter === tab.value
                  ? "btn-gradient text-white shadow-sm"
                  : "text-gray-500 hover:bg-white/50"
              }`}
            >
              {tab.label}
              <span className={`ml-1.5 text-[10px] ${filter === tab.value ? "text-white/80" : "text-gray-400"}`}>
                {counts[tab.value]}
              </span>
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search headlines..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ml-auto glass-light rounded-xl px-3 py-1.5 text-[12px] text-gray-700 focus:outline-none w-48"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-10 text-[12px] text-gray-400">No headlines match.</div>
      ) : (
        <div className="glass rounded-2xl overflow-hidden">
          <table className="w-full audit-table">
            <thead>
              <tr className="bg-white/20">
                {["Headline", "Campaign / Ad Group", "Performance", "Status", "Pinned", "Action"].map((h) => (
                  <th key={h} className="text-left px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((h, i) => (
                <tr key={i}>
                  <td className="px-4 py-3">
                    <div className="text-[13px] font-medium text-gray-800 max-w-[220px] leading-snug">
                      "{h.headline_text}"
                    </div>
                    {h.is_clickbait && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {h.clickbait_flags.map((f) => (
                          <span key={f} className="px-1.5 py-0.5 rounded bg-orange-100 text-orange-600 text-[10px]">
                            {f}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-[12px] text-gray-700">{h.campaign}</div>
                    <div className="text-[11px] text-gray-400 mt-0.5">{h.ad_group}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[11px] text-gray-500">{h.performance_label}</span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={h.status} />
                  </td>
                  <td className="px-4 py-3 text-[12px]">
                    {h.pinned_position
                      ? <span className="text-[#22c55e] font-medium">{h.pinned_position.replace("HEADLINE_", "H")}</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-[11px] text-gray-500 max-w-[180px] leading-relaxed">
                    {h.recommendation}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pinningIssues.length > 0 && (
        <div className="glass rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-orange-100/60" style={{ background: "rgba(251,146,60,0.06)" }}>
            <span className="text-[12px] font-semibold text-orange-600">
              ⚠ {pinningIssues.length} RSA ads with no pinned headlines
            </span>
          </div>
          <table className="w-full audit-table">
            <thead>
              <tr style={{ background: "rgba(251,146,60,0.04)" }}>
                {["Ad", "Campaign", "Spend", "Conversions", "Recommendation"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-orange-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pinningIssues.map((p, i) => (
                <tr key={i}>
                  <td className="px-4 py-3 text-[12px] font-medium text-gray-800">{p.ad_name}</td>
                  <td className="px-4 py-3 text-[12px] text-gray-600">{p.campaign}</td>
                  <td className="px-4 py-3 text-[12px] font-semibold text-[#ff2e6a]">
                    {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(p.cost_usd)}
                  </td>
                  <td className="px-4 py-3 text-[12px] text-gray-600">{p.conversions}</td>
                  <td className="px-4 py-3 text-[11px] text-gray-500 max-w-xs leading-relaxed">{p.recommendation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
