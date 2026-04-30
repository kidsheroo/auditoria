import { useState } from "react";
import type { HeadlineItem, RsaPinningIssue } from "../api";

interface Props {
  headlines: HeadlineItem[];
  pinningIssues: RsaPinningIssue[];
}

const STATUS_STYLE: Record<string, string> = {
  winner: "bg-green-100/70 text-green-700",
  average: "bg-yellow-100/70 text-yellow-700",
  bleeder: "tag-high-cpa",
  testing: "bg-gray-100/70 text-gray-500",
};
const STATUS_ICON: Record<string, string> = {
  winner: "🟢", average: "🟡", bleeder: "🔴", testing: "⚪",
};
const LABEL: Record<string, string> = {
  BEST: "Best", GOOD: "Good", LOW: "Low",
  LEARNING: "Learning", UNSPECIFIED: "No data", UNKNOWN: "No data",
};

function usd(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export default function HeadlineTable({ headlines, pinningIssues }: Props) {
  const [filter, setFilter] = useState<"all" | "bleeder" | "winner" | "clickbait">("all");
  const [search, setSearch] = useState("");

  const filtered = headlines.filter((h) => {
    if (filter === "bleeder" && h.status !== "bleeder") return false;
    if (filter === "winner" && h.status !== "winner") return false;
    if (filter === "clickbait" && !h.is_clickbait) return false;
    if (search && !h.headline_text.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const counts = {
    all: headlines.length,
    bleeder: headlines.filter((h) => h.status === "bleeder").length,
    winner: headlines.filter((h) => h.status === "winner").length,
    clickbait: headlines.filter((h) => h.is_clickbait).length,
  };

  if (headlines.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="font-medium">No RSA headline data found.</p>
        <p className="text-sm mt-1">Headlines appear after your ads run and collect performance data.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Filter chips + search */}
      <div className="flex items-center gap-2 flex-wrap">
        {(["all", "bleeder", "winner", "clickbait"] as const).map((f) => {
          const labels = { all: `All (${counts.all})`, bleeder: `🔴 Bleeders (${counts.bleeder})`, winner: `🟢 Winners (${counts.winner})`, clickbait: `⚠ Clickbait (${counts.clickbait})` };
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all glass-light ${
                filter === f ? "ring-2 ring-[#7f7fd5] text-[#7f7fd5]" : "text-gray-500"
              }`}
            >
              {labels[f]}
            </button>
          );
        })}
        <input
          type="text"
          placeholder="Search headlines..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ml-auto glass-light rounded-xl px-3 py-1.5 text-sm w-52 focus:outline-none focus:ring-2 focus:ring-[#7f7fd5]/30"
        />
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">No headlines match.</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/40">
          <table className="w-full text-sm audit-table">
            <thead>
              <tr className="bg-white/30">
                {["Headline", "Campaign / Ad Group", "Label", "Status", "Pinned", "Recommendation"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-medium text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((h, i) => (
                <tr key={i}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-800 max-w-[200px]">"{h.headline_text}"</div>
                    {h.is_clickbait && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {h.clickbait_flags.map((f) => (
                          <span key={f} className="px-1.5 py-0.5 rounded bg-orange-100 text-orange-600 text-xs">{f}</span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-gray-700 text-sm">{h.campaign}</div>
                    <div className="text-xs text-gray-400">{h.ad_group}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{LABEL[h.performance_label] ?? h.performance_label}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLE[h.status] ?? ""}`}>
                      {STATUS_ICON[h.status]} {h.status.charAt(0).toUpperCase() + h.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {h.pinned_position
                      ? <span className="text-[#7f7fd5] font-medium">{h.pinned_position.replace("HEADLINE_", "H")}</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 max-w-xs leading-relaxed">{h.recommendation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pinning issues */}
      {pinningIssues.length > 0 && (
        <div>
          <h3 className="font-semibold text-gray-700 text-sm mb-3">
            ⚠ {pinningIssues.length} RSA ads with no pinned headlines
          </h3>
          <div className="overflow-x-auto rounded-2xl border border-orange-200/60 bg-orange-50/40">
            <table className="w-full text-sm audit-table">
              <thead>
                <tr className="bg-orange-50/60">
                  {["Ad", "Campaign", "Spend", "Conversions", "Recommendation"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 font-medium text-orange-600 text-xs">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pinningIssues.map((p, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3 font-medium text-gray-800">{p.ad_name}</td>
                    <td className="px-4 py-3 text-gray-600 text-sm">{p.campaign}</td>
                    <td className="px-4 py-3 font-semibold text-[#ff2e6a]">{usd(p.cost_usd)}</td>
                    <td className="px-4 py-3 text-gray-600">{p.conversions}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-xs">{p.recommendation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
