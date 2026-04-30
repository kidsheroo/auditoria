import type { AuditResult, WastingItem } from "../api";

interface Props {
  result: AuditResult;
}

const ENTITY_LABELS: Record<WastingItem["entity_type"], string> = {
  campaign: "Campaigns",
  ad_group: "Ad Groups",
  keyword: "Keywords",
  search_term: "Search Terms",
  ad: "Ads",
};

function usd(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export default function SummaryCards({ result }: Props) {
  const byType = result.items.reduce<Record<string, number>>((acc, item) => {
    acc[item.entity_type] = (acc[item.entity_type] ?? 0) + 1;
    return acc;
  }, {});

  const zeroConv = result.items.filter((i) => i.waste_reason === "zero_conversions").length;
  const highCpa = result.items.filter((i) => i.waste_reason === "high_cpa").length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
          <p className="text-sm font-medium text-red-600">Total Wasted Spend</p>
          <p className="text-3xl font-bold text-red-700 mt-1">{usd(result.total_waste_usd)}</p>
          <p className="text-sm text-red-500 mt-1">{result.date_range.replace(/_/g, " ").toLowerCase()}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <p className="text-sm font-medium text-gray-600">Total Wasting Items</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{result.items.length}</p>
          <div className="flex gap-4 mt-2">
            <span className="text-xs text-red-600 font-medium">{zeroConv} zero conversions</span>
            <span className="text-xs text-orange-600 font-medium">{highCpa} high CPA</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-3">
        {(Object.keys(ENTITY_LABELS) as WastingItem["entity_type"][]).map((type) => {
          const count = byType[type] ?? 0;
          const spend = result.items
            .filter((i) => i.entity_type === type)
            .reduce((s, i) => s + i.cost_usd, 0);
          return (
            <div
              key={type}
              className={`rounded-xl border p-4 ${count > 0 ? "bg-white border-gray-200" : "bg-gray-50 border-gray-100"}`}
            >
              <p className="text-xs font-medium text-gray-500">{ENTITY_LABELS[type]}</p>
              <p className={`text-2xl font-bold mt-1 ${count > 0 ? "text-gray-900" : "text-gray-300"}`}>
                {count}
              </p>
              {count > 0 && (
                <p className="text-xs text-red-600 font-medium mt-1">{usd(spend)}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
