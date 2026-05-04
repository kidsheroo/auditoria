import { useState } from "react";
import type { Recommendation } from "../api";

interface Props {
  recommendations: Recommendation[];
}

type CardState = "default" | "accepted" | "dismissed";

function ItemsTable({ items }: { items: Record<string, unknown>[] }) {
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;
  const keys = Object.keys(items[0]);
  const shown = expanded ? items : items.slice(0, 3);
  const fmt = (v: unknown): string => {
    if (v == null) return "—";
    if (Array.isArray(v)) return v.join(", ");
    if (typeof v === "number") return v > 100 ? v.toLocaleString() : String(v);
    return String(v);
  };
  const fmtKey = (k: string) => k.replace(/_/g, " ").replace(/\busd\b/gi, "$").replace(/\bpct\b/gi, "%");

  return (
    <div className="mt-3">
      <div className="overflow-x-auto rounded-xl border border-white/40">
        <table className="w-full text-xs audit-table">
          <thead>
            <tr className="bg-white/30">
              {keys.map((k) => (
                <th key={k} className="text-left px-3 py-2 font-medium text-gray-400 capitalize">{fmtKey(k)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row, i) => (
              <tr key={i}>
                {keys.map((k) => (
                  <td key={k} className="px-3 py-2 text-[11px] text-gray-600">{fmt(row[k])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {items.length > 3 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1.5 text-[11px] text-[#22c55e] hover:underline"
        >
          {expanded ? "Show less" : `Show all ${items.length}`}
        </button>
      )}
    </div>
  );
}

function Card({
  rec, state, onAccept, onDismiss, onUndo,
}: {
  rec: Recommendation; state: CardState;
  onAccept: () => void; onDismiss: () => void; onUndo: () => void;
}) {
  const isQW = rec.category === "quick_win";

  if (state === "dismissed") {
    return (
      <div className="glass rounded-2xl px-4 py-3 flex items-center justify-between opacity-40">
        <span className="text-[12px] text-gray-500 line-through">{rec.title}</span>
        <button onClick={onUndo} className="text-[11px] text-[#22c55e] hover:underline ml-3">Undo</button>
      </div>
    );
  }
  if (state === "accepted") {
    return (
      <div className="glass rounded-2xl px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[#22c55e] text-[13px]">✓</span>
          <span className="text-[12px] font-medium text-gray-700">{rec.title}</span>
          <span className="text-[11px] text-gray-400">— done</span>
        </div>
        <button onClick={onUndo} className="text-[11px] text-[#22c55e] hover:underline">Undo</button>
      </div>
    );
  }

  return (
    <div className="glass rounded-2xl overflow-hidden">
      <div
        className="px-5 py-4"
        style={{ background: isQW ? "rgba(255,46,106,0.06)" : "rgba(34,197,94,0.06)" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                isQW ? "bg-red-100 text-red-600" : "bg-green-100 text-green-600"
              }`}>
                {isQW ? "Quick Win" : "Growth"}
              </span>
              <span className={`w-1.5 h-1.5 rounded-full ${
                rec.severity === "high" ? "bg-red-500" : rec.severity === "medium" ? "bg-yellow-400" : "bg-blue-400"
              }`} />
            </div>
            <h3 className="text-[13px] font-semibold text-gray-800 leading-snug">{rec.title}</h3>
          </div>
          {rec.estimated_impact && (
            <span className={`shrink-0 text-[10px] font-semibold px-2.5 py-1 rounded-lg ${
              isQW ? "bg-red-100 text-red-600" : "bg-green-100 text-green-600"
            }`}>
              {rec.estimated_impact}
            </span>
          )}
        </div>
      </div>

      <div className="px-5 py-4 space-y-3">
        <p className="text-[12px] text-gray-500 leading-relaxed">{rec.description}</p>
        {rec.items.length > 0 && <ItemsTable items={rec.items} />}
        <div className="flex items-center justify-between pt-2 border-t border-white/40">
          <p className="text-[11px] text-gray-400">
            Action: <span className="text-gray-600">{rec.action_label}</span>
          </p>
          <div className="flex gap-2">
            <button
              onClick={onDismiss}
              className="px-3 py-1.5 text-[11px] glass-light rounded-xl text-gray-500 hover:bg-white/70"
            >
              Dismiss
            </button>
            <button
              onClick={onAccept}
              className={`px-3 py-1.5 text-[11px] font-medium rounded-xl text-white ${
                isQW
                  ? "bg-gradient-to-r from-[#ff6b6b] to-[#ff2e6a]"
                  : "btn-gradient"
              }`}
            >
              Mark as Done ✓
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const STATIC_TIPS = [
  {
    icon: "🔍",
    title: "Review Search Terms Weekly",
    description: "Open the Search Terms report every week and add irrelevant terms as negative keywords. Even well-managed accounts accumulate 10–20 new waste terms per week.",
    action: "Google Ads → Keywords → Search Terms → Add as Negative",
    color: "red",
  },
  {
    icon: "⏰",
    title: "Set Ad Schedules by Hour",
    description: "Check performance by hour of day (Reports → Predefined → Time → Hour of Day). Add negative bid adjustments during your worst-converting windows — often late night and early morning.",
    action: "Campaign Settings → Ad Schedule → Add time segments",
    color: "red",
  },
  {
    icon: "📱",
    title: "Check Device Performance",
    description: "Compare CPA across Desktop, Mobile, and Tablet. If mobile CPA is 2× desktop, apply a -30% to -50% mobile bid adjustment.",
    action: "Campaign Settings → Devices → Set bid adjustments",
    color: "red",
  },
  {
    icon: "🎯",
    title: "Add RLSA Audiences to Search",
    description: "Layer remarketing lists on search campaigns (Observation mode). Past site visitors convert 2–5× better than cold traffic.",
    action: "Campaign → Audiences → Add audience list (Observation)",
    color: "green",
  },
  {
    icon: "📝",
    title: "Enable All Ad Extensions",
    description: "Sitelinks, callouts, structured snippets, and call extensions improve CTR and Ad Rank at zero extra cost.",
    action: "Ads & Extensions → Extensions → Add missing extension types",
    color: "green",
  },
  {
    icon: "🏆",
    title: "Isolate Top Search Terms",
    description: "Any search term with 3+ purchases in 30 days via Broad Match should be moved to its own Exact Match ad group.",
    action: "Search Terms → Add as Exact Match keyword in new ad group",
    color: "green",
  },
  {
    icon: "💡",
    title: "Test 3 Headlines Per RSA",
    description: "RSAs with fewer than 8–10 headline variants give Google's algorithm little to test. Add diverse headlines to improve Ad Strength.",
    action: "Ads → Edit RSA → Add headlines until Ad Strength is 'Excellent'",
    color: "green",
  },
  {
    icon: "🛡️",
    title: "Run a Brand Campaign",
    description: "If you're not bidding on your own brand name, competitors are. Brand campaigns typically have QS 9–10 and CVR 5–10× non-brand.",
    action: "Create campaign → Exact Match [your brand name] → Set tCPA",
    color: "red",
  },
  {
    icon: "🔎",
    title: "Check Auction Insights",
    description: "Auction Insights shows which competitors appear alongside you and how often. If a competitor's impression share jumps, respond before it affects your results.",
    action: "Select campaigns → Auction Insights tab → Sort by Impression Share",
    color: "red",
  },
  {
    icon: "👥",
    title: "Upload Customer Match Lists",
    description: "Upload your existing customer email list. Bid up on past buyers (they convert 3–5× better) and create Lookalike segments.",
    action: "Tools → Audience Manager → Customer Match → Upload email list",
    color: "green",
  },
  {
    icon: "📋",
    title: "Use Shared Negative Keyword Lists",
    description: "Build a master negative keyword list once and attach it to all campaigns to prevent irrelevant spend from reappearing.",
    action: "Tools → Shared Library → Negative keyword lists → Apply to all campaigns",
    color: "red",
  },
  {
    icon: "💰",
    title: "Set Conversion Value Rules",
    description: "If mobile leads are worth less or certain geographies convert better, tell Google with Conversion Value Rules.",
    action: "Goals → Conversions → Conversion value rules → Add rule by device or location",
    color: "green",
  },
  {
    icon: "🔔",
    title: "Set Up Automated Alerts",
    description: "Create automated rules to email you when cost spikes 50% week-over-week or conversion rate drops below a threshold.",
    action: "Tools → Bulk Actions → Rules → Create rule → Send email notification",
    color: "red",
  },
];

function PlaybookCard({ tip }: { tip: typeof STATIC_TIPS[0] }) {
  const [expanded, setExpanded] = useState(false);
  const isRed = tip.color === "red";
  return (
    <div className="glass rounded-xl overflow-hidden">
      <button
        className="w-full px-3.5 py-2.5 flex items-center gap-2 text-left"
        style={{ background: isRed ? "rgba(255,46,106,0.06)" : "rgba(34,197,94,0.06)" }}
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-[13px]">{tip.icon}</span>
        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${
          isRed ? "bg-red-100 text-red-600" : "bg-green-100 text-green-600"
        }`}>
          {isRed ? "Save" : "Grow"}
        </span>
        <span className="flex-1 text-[11px] font-semibold text-gray-800 leading-tight">{tip.title}</span>
        <span className="text-[10px] text-gray-400 shrink-0">{expanded ? "▲" : "▼"}</span>
      </button>
      {expanded && (
        <div className="px-3.5 py-3 border-t border-white/40">
          <p className="text-[11px] text-gray-500 leading-relaxed mb-2">{tip.description}</p>
          <p className="text-[10px] text-gray-400">
            <span className="font-semibold">Action:</span> {tip.action}
          </p>
        </div>
      )}
    </div>
  );
}

function PlaybookSidebar() {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[13px] font-semibold text-gray-800">Optimization Playbook</span>
        <span className="text-[10px] text-gray-400">Best practices</span>
      </div>
      <div className="space-y-2">
        {STATIC_TIPS.map((tip) => (
          <PlaybookCard key={tip.title} tip={tip} />
        ))}
      </div>
    </div>
  );
}

export default function OpportunityDeck({ recommendations }: Props) {
  const [states, setStates] = useState<Record<string, CardState>>({});
  const getState = (id: string): CardState => states[id] ?? "default";
  const setState = (id: string, s: CardState) => setStates((p) => ({ ...p, [id]: s }));

  const qw = recommendations.filter((r) => r.category === "quick_win");
  const sc = recommendations.filter((r) => r.category === "scaling");

  if (recommendations.length === 0) {
    return (
      <div className="flex gap-6">
        <div className="flex-1 glass rounded-2xl p-12 text-center text-gray-400">
          <p className="text-[14px] font-medium">No recommendations found</p>
          <p className="text-[12px] mt-1">Your account looks clean in these areas.</p>
        </div>
        <div style={{ width: 300 }} className="shrink-0">
          <PlaybookSidebar />
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-6">
      {/* Left: dynamic recommendations */}
      <div className="flex-1 space-y-6 min-w-0">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-[#ff2e6a]" />
            <span className="text-[13px] font-semibold text-gray-800">Quick Wins — Fix These First</span>
            {qw.filter((r) => getState(r.id) === "default").length > 0 && (
              <span className="ml-auto text-[10px] font-semibold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
                {qw.filter((r) => getState(r.id) === "default").length} pending
              </span>
            )}
          </div>
          <div className="space-y-3">
            {qw.length === 0
              ? <div className="glass rounded-2xl p-8 text-center text-[12px] text-gray-400">No quick wins found.</div>
              : qw.map((r) => (
                  <Card key={r.id} rec={r} state={getState(r.id)}
                    onAccept={() => setState(r.id, "accepted")}
                    onDismiss={() => setState(r.id, "dismissed")}
                    onUndo={() => setState(r.id, "default")} />
                ))}
          </div>
        </div>

        {sc.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full bg-[#22c55e]" />
              <span className="text-[13px] font-semibold text-gray-800">Growth Opportunities</span>
              {sc.filter((r) => getState(r.id) === "default").length > 0 && (
                <span className="ml-auto text-[10px] font-semibold bg-green-100 text-green-600 px-2 py-0.5 rounded-full">
                  {sc.filter((r) => getState(r.id) === "default").length} signals
                </span>
              )}
            </div>
            <div className="space-y-3">
              {sc.map((r) => (
                <Card key={r.id} rec={r} state={getState(r.id)}
                  onAccept={() => setState(r.id, "accepted")}
                  onDismiss={() => setState(r.id, "dismissed")}
                  onUndo={() => setState(r.id, "default")} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right: static playbook sidebar */}
      <div style={{ width: 300 }} className="shrink-0">
        <PlaybookSidebar />
      </div>
    </div>
  );
}
