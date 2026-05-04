import { type CSSProperties } from "react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { AuditResult, AuditRequest, WastingItem } from "../api";
import { getExportUrl } from "../api";
import type { NavPage } from "../App";
import AuditTable from "./AuditTable";
import OpportunityDeck from "./OpportunityDeck";

interface Props {
  result: AuditResult;
  lastReq: AuditRequest;
  activePage: NavPage;
  onNavigate: (p: NavPage) => void;
  onRerun: () => void;
}

function usd(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function GlassCard({ children, className = "", p = "p-5", style }: { children: React.ReactNode; className?: string; p?: string; style?: CSSProperties }) {
  return (
    <div className={`glass rounded-2xl ${p} ${className}`} style={style}>{children}</div>
  );
}

function KpiCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <GlassCard>
      <div className="text-[10px] font-semibold uppercase tracking-[0.5px] text-gray-400 mb-2">{label}</div>
      <div
        className={color ? "" : "gradient-text"}
        style={{
          fontSize: 40, fontWeight: 700, lineHeight: 1,
          ...(color ? { color } : {}),
        }}
      >
        {value}
      </div>
    </GlassCard>
  );
}

// ── OVERVIEW ──────────────────────────────────────────────────────────────────

const ENTITY_COLORS: Record<string, string> = {
  keyword: "#ff2e6a",
  search_term: "#f97316",
  ad_group: "#a855f7",
  ad: "#0284c7",
  campaign: "#10b981",
};

const ENTITY_LABELS: Record<string, string> = {
  keyword: "Keywords", search_term: "Search Terms",
  ad_group: "Ad Groups", ad: "Ads", campaign: "Campaigns",
};

const ENTITY_PAGES: Record<string, NavPage> = {
  keyword: "keyword", search_term: "search_term",
  ad_group: "ad_group", ad: "ad",
};

function OverviewPage({ result, onNavigate }: { result: AuditResult; onNavigate: (p: NavPage) => void }) {
  const byType = ["keyword", "search_term", "ad_group", "ad"].map((type) => {
    const items = result.items.filter((i) => i.entity_type === type);
    return { type, label: ENTITY_LABELS[type], count: items.length, waste: items.reduce((s, i) => s + i.cost_usd, 0), color: ENTITY_COLORS[type] };
  }).filter((e) => e.count > 0);

  const byCampaign = Object.values(
    result.items.reduce((acc, item) => {
      if (!acc[item.campaign]) acc[item.campaign] = { campaign: item.campaign, waste: 0 };
      acc[item.campaign].waste += item.cost_usd;
      return acc;
    }, {} as Record<string, { campaign: string; waste: number }>)
  ).sort((a, b) => b.waste - a.waste).slice(0, 5);

  const avgWaste = result.items.length > 0 ? result.total_waste_usd / result.items.length : 0;

  return (
    <div className="p-7 space-y-4">
      {/* KPI row */}
      <div className="flex gap-4">
        <KpiCard label="Total Wasted Spend" value={usd(result.total_waste_usd)} />
        <KpiCard label="Wasting Entities" value={result.items.length} />
        <KpiCard label="Avg. Waste / Item" value={usd(avgWaste)} />
      </div>

      {/* Charts row */}
      <div className="flex gap-4">
        {/* Donut */}
        <GlassCard className="flex-none" style={{ width: 280 }}>
          <div className="text-[12px] font-semibold text-gray-800 mb-3">Waste by Entity</div>
          <div className="flex items-center gap-4">
            <PieChart width={100} height={100}>
              <Pie data={byType} cx={46} cy={46} innerRadius={30} outerRadius={46}
                dataKey="waste" strokeWidth={0}>
                {byType.map((e) => <Cell key={e.type} fill={e.color} />)}
              </Pie>
            </PieChart>
            <div className="flex flex-col gap-2">
              {byType.map((e) => (
                <div key={e.type} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: e.color }} />
                  <span className="text-[11px] text-gray-600 flex-1">{e.label}</span>
                  <span className="text-[11px] font-semibold text-gray-800">{usd(e.waste)}</span>
                </div>
              ))}
            </div>
          </div>
        </GlassCard>

        {/* Bar chart */}
        <GlassCard className="flex-1">
          <div className="text-[12px] font-semibold text-gray-800 mb-3">Waste by Campaign</div>
          <ResponsiveContainer width="100%" height={110}>
            <BarChart data={byCampaign} margin={{ top: 16, right: 0, left: 0, bottom: 0 }}>
              <XAxis dataKey="campaign" tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false}
                tickFormatter={(v: string) => v.length > 10 ? v.slice(0, 10) + "…" : v} />
              <Tooltip
                formatter={(v: unknown) => [usd(v as number), "Waste"]}
                contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid rgba(255,255,255,0.6)", background: "rgba(255,255,255,0.9)" }}
              />
              <Bar dataKey="waste" radius={[4, 4, 0, 0]}>
                {byCampaign.map((_, i) => (
                  <Cell key={i} fill={["#ff2e6a","#f97316","#a855f7","#0284c7","#10b981"][i % 5]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </GlassCard>

        {/* Entity quick-nav */}
        <GlassCard className="flex-none" style={{ width: 220 }}>
          <div className="text-[12px] font-semibold text-gray-800 mb-3">By Type</div>
          <div className="flex flex-col gap-2">
            {byType.map((e) => (
              <button
                key={e.type}
                onClick={() => onNavigate(ENTITY_PAGES[e.type])}
                className="flex items-center gap-2.5 p-2 rounded-xl text-left hover:bg-white/60 transition-colors"
                style={{ background: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.7)" }}
              >
                <div className="flex-1">
                  <div className="text-[11px] font-semibold text-gray-800">{e.label}</div>
                  <div className="text-[10px] text-gray-400">{e.count} items</div>
                </div>
                <div className="text-[11px] font-bold" style={{ color: e.color }}>{usd(e.waste)}</div>
              </button>
            ))}
          </div>
        </GlassCard>
      </div>

      {/* Table */}
      <GlassCard p="p-0" className="overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/40">
          <div className="text-[12px] font-semibold text-gray-800">All Wasting Items</div>
        </div>
        <div className="p-5">
          <AuditTable data={result.items} showEntityType />
        </div>
      </GlassCard>
    </div>
  );
}

// ── ENTITY PAGE (Keywords / Ad Groups / Ads) ────────────────────────────────

function EntityPage({
  items, title, entityType,
}: {
  items: WastingItem[]; title: string; entityType: string;
}) {
  const zeroConv = items.filter((i) => i.waste_reason === "zero_conversions").length;
  const highCpa  = items.filter((i) => i.waste_reason === "high_cpa").length;
  const totalWaste = items.reduce((s, i) => s + i.cost_usd, 0);

  const color1 = ENTITY_COLORS[entityType] ?? "#ff2e6a";

  // By campaign
  const byCampaign = Object.values(
    items.reduce((acc, item) => {
      if (!acc[item.campaign]) acc[item.campaign] = { campaign: item.campaign, waste: 0 };
      acc[item.campaign].waste += item.cost_usd;
      return acc;
    }, {} as Record<string, { campaign: string; waste: number }>)
  ).sort((a, b) => b.waste - a.waste).slice(0, 5);

  const reasonData = [
    { name: "Zero Conv", value: zeroConv, color: "#0284c7" },
    { name: "High CPA",  value: highCpa,  color: "#dc2626" },
  ].filter((d) => d.value > 0);

  // Quick actions for keywords
  const quickActions = entityType === "keyword" ? [
    `Pause all zero-conv (${zeroConv})`,
    `Add negatives for broad (${items.filter(i => i.match_type === "BROAD").length})`,
    `Review high-CPA bids (${highCpa})`,
  ] : entityType === "ad_group" ? [
    `Pause zombie ad groups (${zeroConv})`,
    `Review high-CPA groups (${highCpa})`,
    `Audit creatives in groups`,
  ] : [];

  return (
    <div className="p-7 space-y-4">
      {/* KPI strip */}
      <div className="flex gap-4">
        {[
          { label: `Wasting ${title}`, value: items.length, color: color1 },
          { label: "Total Waste", value: usd(totalWaste), color: color1 },
          { label: "Zero Conversions", value: zeroConv, color: "#0284c7" },
          { label: "High CPA", value: highCpa, color: "#dc2626" },
        ].map((k) => (
          <GlassCard key={k.label} className="flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.5px] text-gray-400 mb-2">{k.label}</div>
            <div className="text-[26px] font-bold" style={{ color: k.color }}>{k.value}</div>
          </GlassCard>
        ))}
      </div>

      {/* Charts row */}
      <div className="flex gap-4">
        <GlassCard className="flex-1">
          <div className="text-[12px] font-semibold text-gray-800 mb-3">
            Waste by {entityType === "keyword" ? "Match Type" : "Campaign"}
          </div>
          <ResponsiveContainer width="100%" height={100}>
            <BarChart
              data={entityType === "keyword"
                ? [
                    { label: "Broad",  waste: items.filter(i=>i.match_type==="BROAD").reduce((s,i)=>s+i.cost_usd,0), color: "#dc2626" },
                    { label: "Phrase", waste: items.filter(i=>i.match_type==="PHRASE").reduce((s,i)=>s+i.cost_usd,0), color: "#f97316" },
                    { label: "Exact",  waste: items.filter(i=>i.match_type==="EXACT").reduce((s,i)=>s+i.cost_usd,0), color: "#22c55e" },
                  ].filter(d => d.waste > 0)
                : byCampaign.map((c, i) => ({ ...c, label: c.campaign, color: ["#dc2626","#f97316","#a855f7","#0284c7","#9ca3af"][i%5] }))
              }
              margin={{ top: 16, right: 0, left: 0, bottom: 0 }}
            >
              <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false}
                tickFormatter={(v: string) => v.length > 10 ? v.slice(0, 9) + "…" : v} />
              <Tooltip formatter={(v: unknown) => [usd(v as number), "Waste"]}
                contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid rgba(255,255,255,0.6)", background: "rgba(255,255,255,0.9)" }} />
              <Bar dataKey="waste" radius={[4,4,0,0]}>
                {(entityType === "keyword"
                  ? [{ color: "#dc2626" }, { color: "#f97316" }, { color: "#22c55e" }]
                  : byCampaign.map((_, i) => ({ color: ["#dc2626","#f97316","#a855f7","#0284c7","#9ca3af"][i%5] }))
                ).map((d, i) => <Cell key={i} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </GlassCard>

        <GlassCard className="flex-1">
          <div className="text-[12px] font-semibold text-gray-800 mb-3">Reason Split</div>
          <div className="flex items-center gap-5">
            <PieChart width={90} height={90}>
              <Pie data={reasonData} cx={41} cy={41} innerRadius={26} outerRadius={42}
                dataKey="value" strokeWidth={0}>
                {reasonData.map((d) => <Cell key={d.name} fill={d.color} />)}
              </Pie>
            </PieChart>
            <div className="flex flex-col gap-3">
              {reasonData.map((d) => (
                <div key={d.name}>
                  <span className={d.color === "#0284c7" ? "tag-zero-conv" : "tag-high-cpa"}>
                    {d.name === "Zero Conv" ? "zero_conversions" : "high_cpa"}
                  </span>
                  <div className="text-[10px] text-gray-400 mt-1">{d.value} {title.toLowerCase()}</div>
                </div>
              ))}
            </div>
          </div>
        </GlassCard>

        {quickActions.length > 0 && (
          <GlassCard className="flex-none" style={{ width: 240 }}>
            <div className="text-[12px] font-semibold text-gray-800 mb-3">Quick Actions</div>
            <div className="flex flex-col gap-2">
              {quickActions.map((a) => (
                <div key={a} className="flex items-center justify-between p-2.5 rounded-xl text-[11px] text-gray-700"
                  style={{ background: "rgba(255,255,255,0.6)", border: "1px solid rgba(34,197,94,0.15)", cursor: "pointer" }}>
                  <span>{a}</span>
                  <span style={{ color: "#22c55e" }}>→</span>
                </div>
              ))}
            </div>
          </GlassCard>
        )}
      </div>

      {/* Table */}
      <GlassCard p="p-0" className="overflow-hidden">
        <div className="px-5 py-3.5 border-b border-white/40">
          <div className="text-[12px] font-semibold text-gray-800">All Wasting {title}</div>
        </div>
        <div className="p-5">
          <AuditTable data={items} showEntityType={false} />
        </div>
      </GlassCard>
    </div>
  );
}

// ── SEARCH TERMS PAGE ─────────────────────────────────────────────────────────

function SearchTermsPage({ items }: { items: WastingItem[] }) {
  const totalWaste = items.reduce((s, i) => s + i.cost_usd, 0);
  const negCandidates = items.filter((i) => i.waste_reason === "zero_conversions").length;
  const avgWaste = items.length > 0 ? totalWaste / items.length : 0;

  const suggestedNegatives = [...new Set(
    items
      .filter((i) => i.waste_reason === "zero_conversions")
      .map((i) => i.name.split(" ")[0])
      .filter((t) => t.length > 2)
      .slice(0, 10)
  )];

  const byKeyword = Object.values(
    items.reduce((acc, item) => {
      const key = item.ad_group ?? "Other";
      if (!acc[key]) acc[key] = { label: key.length > 14 ? key.slice(0, 13) + "…" : key, waste: 0 };
      acc[key].waste += item.cost_usd;
      return acc;
    }, {} as Record<string, { label: string; waste: number }>)
  ).sort((a, b) => b.waste - a.waste).slice(0, 5);

  return (
    <div className="p-7 space-y-4">
      {/* KPI strip */}
      <div className="flex gap-4">
        {[
          { label: "Wasting Terms",    value: items.length,      color: "#ff2e6a" },
          { label: "Total Waste",      value: usd(totalWaste),   color: "#ff2e6a" },
          { label: "Neg. Candidates",  value: negCandidates,     color: "#f97316" },
          { label: "Avg. Waste/Term",  value: usd(avgWaste),     color: "#4b5563" },
        ].map((k) => (
          <GlassCard key={k.label} className="flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.5px] text-gray-400 mb-2">{k.label}</div>
            <div className="text-[26px] font-bold" style={{ color: k.color }}>{k.value}</div>
          </GlassCard>
        ))}
      </div>

      {/* Negatives + chart row */}
      <div className="flex gap-4">
        <GlassCard className="flex-1">
          <div className="text-[12px] font-semibold text-gray-800 mb-1">Suggested Negative Keywords</div>
          <div className="text-[10px] text-gray-400 mb-3">These terms match your keywords but never convert. Add as negatives.</div>
          <div className="flex flex-wrap gap-2 mb-4">
            {suggestedNegatives.map((t) => (
              <span key={t}
                className="px-3 py-1 rounded-full text-[11px] cursor-pointer"
                style={{
                  background: "rgba(255,46,106,0.07)",
                  border: "1px dashed rgba(255,46,106,0.3)",
                  color: "#ff2e6a",
                }}>
                + {t}
              </span>
            ))}
          </div>
          {negCandidates > 0 && (
            <button className="btn-gradient rounded-xl px-4 py-2 text-[11px] font-semibold text-white">
              Add All {negCandidates} as Negatives →
            </button>
          )}
        </GlassCard>

        <GlassCard className="flex-none" style={{ width: 300 }}>
          <div className="text-[12px] font-semibold text-gray-800 mb-3">Waste by Source</div>
          <ResponsiveContainer width="100%" height={100}>
            <BarChart data={byKeyword} margin={{ top: 16, right: 0, left: 0, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v: unknown) => [usd(v as number), "Waste"]}
                contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid rgba(255,255,255,0.6)", background: "rgba(255,255,255,0.9)" }} />
              <Bar dataKey="waste" radius={[4,4,0,0]}>
                {byKeyword.map((_, i) => (
                  <Cell key={i} fill={["#0284c7","#dc2626","#a855f7","#f97316","#9ca3af"][i%5]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </GlassCard>
      </div>

      {/* Table */}
      <GlassCard p="p-0" className="overflow-hidden">
        <div className="px-5 py-3.5 border-b border-white/40">
          <div className="text-[12px] font-semibold text-gray-800">All Wasting Search Terms</div>
        </div>
        <div className="p-5">
          <AuditTable data={items} showEntityType={false} />
        </div>
      </GlassCard>
    </div>
  );
}

// ── REPORTS PAGE ──────────────────────────────────────────────────────────────

function ReportsPage({ result, lastReq }: { result: AuditResult; lastReq: AuditRequest }) {
  const kwItems    = result.items.filter((i) => i.entity_type === "keyword");
  const stItems    = result.items.filter((i) => i.entity_type === "search_term");
  const recItems   = result.recommendations;

  const tiers = [
    { label: "Full Audit Export",    desc: `All ${result.items.length} wasting entities across all types`, rows: result.items.length, size: "~12kb", primary: true },
    { label: "Keywords Only",        desc: "Wasting keywords + metrics + reasons", rows: kwItems.length, size: "~5kb",  primary: false },
    { label: "Search Terms Only",    desc: "Wasting search terms + source keywords", rows: stItems.length, size: "~4kb", primary: false },
    { label: "Recommendations",      desc: "All To Do items + playbook tips", rows: recItems.length, size: "~3kb", primary: false },
  ];

  const meta = [
    ["Account",          result.account_name],
    ["Date Range",       lastReq.date_range.replace(/_/g, " ")],
    ["Min Spend",        `$${lastReq.min_spend_usd} per entity`],
    ["Target CPA",       `$${lastReq.target_cpa_usd}`],
    ["CPA Multiplier",   `${lastReq.cpa_multiplier}×`],
    ["Generated",        new Date(result.generated_at).toLocaleString()],
    ["Entities Found",   result.items.length],
    ["Total Waste",      usd(result.total_waste_usd)],
  ];

  const csvPreview = [
    "name,type,campaign,ad_group,cost,conversions,cpa,reason,clicks",
    ...result.items.slice(0, 7).map((i) =>
      `${i.name},${i.entity_type},${i.campaign},${i.ad_group ?? ""},${i.cost_usd.toFixed(0)},${i.conversions},${i.cpa_usd?.toFixed(0) ?? ""},${i.waste_reason},${i.clicks}`
    ),
    `… ${Math.max(0, result.items.length - 7)} more rows`,
  ];

  return (
    <div className="p-7">
      <div className="flex gap-4">
        {/* Left: tiers + meta */}
        <div className="flex-1 flex flex-col gap-4">
          <GlassCard>
            <div className="text-[12px] font-semibold text-gray-800 mb-4">Export Options</div>
            <div className="flex flex-col gap-2.5">
              {tiers.map((t, i) => (
                <a
                  key={t.label}
                  href={getExportUrl(lastReq)}
                  className="flex items-center gap-3 p-3 rounded-xl transition-all hover:opacity-90"
                  style={{
                    background: i === 0
                      ? "linear-gradient(135deg, rgba(34,197,94,0.07), rgba(6,182,212,0.07))"
                      : "rgba(255,255,255,0.5)",
                    border: i === 0 ? "1px solid rgba(34,197,94,0.2)" : "1px solid rgba(255,255,255,0.7)",
                  }}
                >
                  <div className="flex-1">
                    <div className="text-[12px] font-semibold text-gray-800">{t.label}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">{t.desc}</div>
                  </div>
                  <div className="text-[10px] text-gray-400">{t.rows} rows</div>
                  <div className="text-[10px] text-gray-400">{t.size}</div>
                  <div
                    className="px-3 py-1.5 rounded-lg text-[11px] font-semibold"
                    style={{
                      background: i === 0 ? "linear-gradient(135deg,#22c55e,#06b6d4)" : "rgba(0,0,0,0.05)",
                      color: i === 0 ? "white" : "#6b7280",
                    }}
                  >
                    ↓ CSV
                  </div>
                </a>
              ))}
            </div>
          </GlassCard>

          <GlassCard>
            <div className="text-[12px] font-semibold text-gray-800 mb-4">Last Audit</div>
            <div className="grid grid-cols-2 gap-2.5">
              {meta.map(([k, v]) => (
                <div key={k} className="rounded-lg p-2.5" style={{ background: "rgba(255,255,255,0.4)" }}>
                  <div className="text-[9px] font-semibold uppercase tracking-[0.4px] text-gray-400">{k}</div>
                  <div className="text-[11px] font-medium text-gray-800 mt-0.5">{v}</div>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>

        {/* Right: CSV preview */}
        <div style={{ width: 360 }}>
          <GlassCard p="p-0" className="overflow-hidden h-full">
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/40">
              <div className="text-[12px] font-semibold text-gray-800">CSV Preview</div>
              <div className="text-[10px] text-gray-400">audit-{new Date().toISOString().split("T")[0]}.csv</div>
            </div>
            <div className="p-4 overflow-auto" style={{ background: "rgba(255,255,255,0.3)", fontFamily: "monospace", fontSize: 9, lineHeight: 2, color: "#4b5563" }}>
              {csvPreview.map((line, i) => (
                <div key={i} style={{ color: i === 0 ? "#16a34a" : i === csvPreview.length - 1 ? "#9ca3af" : "#4b5563", fontWeight: i === 0 ? 700 : 400 }}>
                  {line}
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}

// ── MAIN DASHBOARD ROUTER ────────────────────────────────────────────────────

export default function Dashboard({ result, lastReq, activePage, onNavigate }: Props) {
  const items = (type?: string) =>
    type ? result.items.filter((i) => i.entity_type === type) : result.items;

  return (
    <>
      {activePage === "overview" && (
        <OverviewPage result={result} onNavigate={onNavigate} />
      )}

      {activePage === "keyword" && (
        <EntityPage items={items("keyword")} title="Keywords" entityType="keyword" />
      )}

      {activePage === "ad_group" && (
        <EntityPage items={items("ad_group")} title="Ad Groups" entityType="ad_group" />
      )}

      {activePage === "ad" && (
        <EntityPage items={items("ad")} title="Ads" entityType="ad" />
      )}

      {activePage === "search_term" && (
        <SearchTermsPage items={items("search_term")} />
      )}

{activePage === "todo" && (
        <div className="p-7">
          <OpportunityDeck recommendations={result.recommendations} />
        </div>
      )}

      {activePage === "reports" && (
        <ReportsPage result={result} lastReq={lastReq} />
      )}
    </>
  );
}
