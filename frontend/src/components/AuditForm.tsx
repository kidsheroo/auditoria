import { useState, useEffect, useRef } from "react";
import type { Account, AuditRequest } from "../api";

interface Props {
  accounts: Account[];
  accountsLoading: boolean;
  onSubmit: (req: AuditRequest) => void;
  running: boolean;
  error: string | null;
}

const DATE_RANGES = [
  { value: "LAST_7_DAYS",  label: "Last 7 days" },
  { value: "LAST_30_DAYS", label: "Last 30 days" },
  { value: "LAST_90_DAYS", label: "Last 90 days" },
];

const STEPS = ["Connecting", "Fetching", "Analyzing", "Scoring"];

function LoadingSkeleton() {
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 95) {
          clearInterval(timerRef.current);
          return prev;
        }
        const inc = prev < 30 ? 4 : prev < 60 ? 2.5 : prev < 80 ? 1.5 : 0.4;
        return Math.min(95, prev + inc);
      });
    }, 150);
    return () => clearInterval(timerRef.current);
  }, []);

  const stepIdx = progress < 25 ? 0 : progress < 50 ? 1 : progress < 75 ? 2 : 3;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="main-scroll flex-1 p-7 space-y-4">
        {/* Progress card */}
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[12px] font-semibold text-gray-800">Audit Progress</div>
            <div className="gradient-text text-[12px] font-semibold">{progress}%</div>
          </div>
          <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden mb-4">
            <div
              className="h-full rounded-full gradient-bg transition-all duration-700"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between">
            {STEPS.map((s, i) => (
              <div key={s} className="flex flex-col items-center gap-1">
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center"
                  style={{
                    background: i < stepIdx
                      ? "linear-gradient(135deg,#22c55e,#06b6d4)"
                      : i === stepIdx
                      ? "rgba(34,197,94,0.15)"
                      : "#e5e7eb",
                  }}
                >
                  {i < stepIdx && <span className="text-white text-[10px]">✓</span>}
                  {i === stepIdx && (
                    <div className="w-2 h-2 rounded-full" style={{ background: "#22c55e" }} />
                  )}
                </div>
                <span className="text-[9px]" style={{ color: i <= stepIdx ? "#4b5563" : "#9ca3af" }}>{s}</span>
              </div>
            ))}
          </div>
        </div>

        {/* KPI skeleton row */}
        <div className="flex gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="glass rounded-2xl p-6 flex-1">
              <div className="skeleton mb-3" style={{ width: 60, height: 10 }} />
              <div className="skeleton mb-2" style={{ width: 120, height: 36 }} />
              <div className="skeleton" style={{ width: 80, height: 10 }} />
            </div>
          ))}
        </div>

        {/* Chart skeleton row */}
        <div className="flex gap-4">
          {[0, 1].map((i) => (
            <div key={i} className="glass rounded-2xl p-5 flex-1">
              <div className="skeleton mb-4" style={{ width: 100, height: 12 }} />
              <div className="skeleton w-full" style={{ height: 100 }} />
            </div>
          ))}
        </div>

        {/* Table skeleton */}
        <div className="glass rounded-2xl p-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex gap-3 mb-3">
              <div className="skeleton" style={{ width: "30%", height: 10 }} />
              <div className="skeleton" style={{ width: "20%", height: 10 }} />
              <div className="skeleton" style={{ width: "10%", height: 10 }} />
              <div className="skeleton" style={{ width: "10%", height: 10 }} />
              <div className="skeleton" style={{ width: "15%", height: 10 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AuditForm({ accounts, accountsLoading, onSubmit, running, error }: Props) {
  const [customerId, setCustomerId] = useState(accounts[0]?.id ?? "");
  const [dateRange, setDateRange] = useState("LAST_30_DAYS");
  const [minSpend, setMinSpend] = useState("5");
  const [targetCpa, setTargetCpa] = useState("20");
  const [cpaMultiplier, setCpaMultiplier] = useState("3");

  if (!customerId && accounts.length > 0) setCustomerId(accounts[0].id);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      customer_id: customerId,
      date_range: dateRange,
      min_spend_usd: parseFloat(minSpend) || 5,
      target_cpa_usd: parseFloat(targetCpa) || 20,
      cpa_multiplier: parseFloat(cpaMultiplier) || 3,
    });
  };

  if (running) return <LoadingSkeleton />;

  return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="glass rounded-2xl p-10" style={{ maxWidth: 560, width: "100%" }}>
        <h2 className="text-[18px] font-semibold text-gray-800 mb-1">Configure Audit</h2>
        <p className="text-[13px] text-gray-400 mb-8">
          Select your account and set thresholds to identify wasted spend.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Account */}
          <div>
            <label className="block text-[10px] font-semibold text-gray-400 mb-2 uppercase tracking-wide">
              Google Ads Account
            </label>
            {accountsLoading ? (
              <div className="skeleton h-10 rounded-xl" />
            ) : (
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                required
                className="w-full glass-light rounded-xl px-4 py-2.5 text-[13px] text-gray-700 focus:outline-none"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} ({a.id})</option>
                ))}
              </select>
            )}
          </div>

          {/* Date range */}
          <div>
            <label className="block text-[10px] font-semibold text-gray-400 mb-2 uppercase tracking-wide">
              Date Range
            </label>
            <div className="flex gap-2">
              {DATE_RANGES.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setDateRange(r.value)}
                  className={`flex-1 py-2.5 rounded-xl text-[13px] font-medium transition-all ${
                    dateRange === r.value
                      ? "btn-gradient shadow-sm"
                      : "glass-light text-gray-600 hover:bg-white/70"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Thresholds */}
          <div className="pt-2">
            <p className="text-[10px] font-semibold text-gray-400 mb-4 uppercase tracking-wide">
              Waste Thresholds
            </p>
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Min spend ($)", value: minSpend, set: setMinSpend, hint: "Ignore below this" },
                { label: "Target CPA ($)", value: targetCpa, set: setTargetCpa, hint: "Your goal per conversion" },
                { label: "CPA multiplier", value: cpaMultiplier, set: setCpaMultiplier, hint: "Flag if CPA > target × X" },
              ].map(({ label, value, set, hint }) => (
                <div key={label}>
                  <label className="block text-[11px] text-gray-500 mb-1.5">{label}</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={value}
                    onChange={(e) => set(e.target.value)}
                    className="w-full glass-light rounded-xl px-3 py-2 text-[13px] focus:outline-none"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">{hint}</p>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-red-50/80 border border-red-100 px-4 py-3 text-[12px] text-red-600">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!customerId}
            className="btn-gradient w-full py-3 rounded-xl text-[14px] font-semibold shadow-sm disabled:opacity-50"
          >
            ✦  Run Audit
          </button>
        </form>
      </div>
    </div>
  );
}
