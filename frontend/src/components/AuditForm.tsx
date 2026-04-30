import { useState } from "react";
import type { Account, AuditRequest } from "../api";

interface Props {
  accounts: Account[];
  accountsLoading: boolean;
  onSubmit: (req: AuditRequest) => void;
  running: boolean;
  error: string | null;
}

const DATE_RANGES = [
  { value: "LAST_7_DAYS", label: "7 days" },
  { value: "LAST_30_DAYS", label: "30 days" },
  { value: "LAST_90_DAYS", label: "90 days" },
];

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

  return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="glass rounded-3xl p-10 max-w-xl w-full">
        <h2 className="text-xl font-semibold text-gray-800 mb-1">Configure Audit</h2>
        <p className="text-sm text-gray-400 mb-8">
          Select your account and set thresholds to identify wasted spend.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Account */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">
              Google Ads Account
            </label>
            {accountsLoading ? (
              <div className="h-10 rounded-2xl bg-white/40 animate-pulse" />
            ) : (
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                required
                className="w-full glass-light rounded-2xl px-4 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#7f7fd5]/40"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.id})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Date range */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">
              Date Range
            </label>
            <div className="flex gap-2">
              {DATE_RANGES.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setDateRange(r.value)}
                  className={`flex-1 py-2.5 rounded-2xl text-sm font-medium transition-all ${
                    dateRange === r.value
                      ? "btn-gradient shadow-md"
                      : "glass-light text-gray-600 hover:bg-white/70"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Thresholds */}
          <div className="border-t border-white/40 pt-5">
            <p className="text-xs font-medium text-gray-500 mb-4 uppercase tracking-wide">
              Waste Thresholds
            </p>
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Min spend ($)", value: minSpend, set: setMinSpend, hint: "Ignore below this" },
                { label: "Target CPA ($)", value: targetCpa, set: setTargetCpa, hint: "Your goal per conversion" },
                { label: "CPA multiplier", value: cpaMultiplier, set: setCpaMultiplier, hint: "Flag if CPA > target × X" },
              ].map(({ label, value, set, hint }) => (
                <div key={label}>
                  <label className="block text-xs text-gray-400 mb-1">{label}</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={value}
                    onChange={(e) => set(e.target.value)}
                    className="w-full glass-light rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7f7fd5]/40"
                  />
                  <p className="text-xs text-gray-400 mt-1">{hint}</p>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-2xl bg-red-50/80 border border-red-100 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={running || !customerId}
            className="btn-gradient w-full py-3 rounded-2xl text-sm font-medium shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {running ? (
              <>
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Running audit...
              </>
            ) : (
              "✦  Run Audit"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
