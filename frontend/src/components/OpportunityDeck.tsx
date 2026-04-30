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
                  <td key={k} className="px-3 py-2 text-gray-600">{fmt(row[k])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {items.length > 3 && (
        <button onClick={() => setExpanded(!expanded)} className="mt-1.5 text-xs text-[#7f7fd5] hover:underline">
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
        <span className="text-sm text-gray-500 line-through">{rec.title}</span>
        <button onClick={onUndo} className="text-xs text-[#7f7fd5] hover:underline ml-3">Undo</button>
      </div>
    );
  }
  if (state === "accepted") {
    return (
      <div className="glass rounded-2xl px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-green-500 text-sm">✓</span>
          <span className="text-sm font-medium text-gray-700">{rec.title}</span>
          <span className="text-xs text-gray-400">— done</span>
        </div>
        <button onClick={onUndo} className="text-xs text-[#7f7fd5] hover:underline">Undo</button>
      </div>
    );
  }

  return (
    <div className="glass rounded-2xl overflow-hidden">
      {/* Header */}
      <div className={`px-5 py-4 ${isQW ? "bg-red-50/60" : "bg-green-50/60"}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                isQW ? "bg-red-100 text-red-600" : "bg-green-100 text-green-600"
              }`}>
                {isQW ? "Quick Win" : "Growth"}
              </span>
              <span className={`w-1.5 h-1.5 rounded-full ${
                rec.severity === "high" ? "bg-red-500" : rec.severity === "medium" ? "bg-yellow-400" : "bg-blue-400"
              }`} />
            </div>
            <h3 className="font-semibold text-gray-800 text-sm leading-snug">{rec.title}</h3>
          </div>
          {rec.estimated_impact && (
            <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-xl ${
              isQW ? "bg-red-100 text-red-600" : "bg-green-100 text-green-600"
            }`}>
              {rec.estimated_impact}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="px-5 py-4 space-y-3">
        <p className="text-sm text-gray-500 leading-relaxed">{rec.description}</p>
        {rec.items.length > 0 && <ItemsTable items={rec.items} />}
        <div className="flex items-center justify-between pt-1 border-t border-white/40">
          <p className="text-xs text-gray-400">
            Action: <span className="text-gray-600">{rec.action_label}</span>
          </p>
          <div className="flex gap-2">
            <button
              onClick={onDismiss}
              className="px-3 py-1.5 text-xs glass-light rounded-xl text-gray-500 hover:bg-white/70"
            >
              Dismiss
            </button>
            <button
              onClick={onAccept}
              className={`px-3 py-1.5 text-xs font-medium rounded-xl text-white ${
                isQW
                  ? "bg-gradient-to-r from-[#ff6b6b] to-[#ff2e6a]"
                  : "bg-gradient-to-r from-[#7f7fd5] to-[#86a8e7]"
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

export default function OpportunityDeck({ recommendations }: Props) {
  const [states, setStates] = useState<Record<string, CardState>>({});
  const getState = (id: string): CardState => states[id] ?? "default";
  const setState = (id: string, s: CardState) => setStates((p) => ({ ...p, [id]: s }));

  const qw = recommendations.filter((r) => r.category === "quick_win");
  const sc = recommendations.filter((r) => r.category === "scaling");

  if (recommendations.length === 0) {
    return (
      <div className="glass rounded-3xl p-12 text-center text-gray-400">
        <p className="font-medium text-lg">No recommendations found</p>
        <p className="text-sm mt-1">Your account looks clean in these areas.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* Red zone */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
          <h3 className="font-semibold text-gray-800">Quick Wins — Fix These First</h3>
          {qw.filter((r) => getState(r.id) === "default").length > 0 && (
            <span className="ml-auto text-xs font-medium bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
              {qw.filter((r) => getState(r.id) === "default").length} pending
            </span>
          )}
        </div>
        <div className="space-y-3">
          {qw.length === 0
            ? <div className="glass rounded-2xl p-8 text-center text-gray-400 text-sm">No quick wins found.</div>
            : qw.map((r) => (
              <Card key={r.id} rec={r} state={getState(r.id)}
                onAccept={() => setState(r.id, "accepted")}
                onDismiss={() => setState(r.id, "dismissed")}
                onUndo={() => setState(r.id, "default")} />
            ))}
        </div>
      </div>

      {/* Green zone */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
          <h3 className="font-semibold text-gray-800">Growth Opportunities</h3>
          {sc.filter((r) => getState(r.id) === "default").length > 0 && (
            <span className="ml-auto text-xs font-medium bg-green-100 text-green-600 px-2 py-0.5 rounded-full">
              {sc.filter((r) => getState(r.id) === "default").length} signals
            </span>
          )}
        </div>
        <div className="space-y-3">
          {sc.length === 0
            ? <div className="glass rounded-2xl p-8 text-center text-gray-400 text-sm">No scaling signals found.</div>
            : sc.map((r) => (
              <Card key={r.id} rec={r} state={getState(r.id)}
                onAccept={() => setState(r.id, "accepted")}
                onDismiss={() => setState(r.id, "dismissed")}
                onUndo={() => setState(r.id, "default")} />
            ))}
        </div>
      </div>
    </div>
  );
}
