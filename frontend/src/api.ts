import axios from "axios";

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

const api = axios.create({ baseURL: BASE, withCredentials: true });

export interface Account {
  id: string;
  name: string;
  currency: string;
}

export interface WastingItem {
  entity_type: "campaign" | "ad_group" | "keyword" | "search_term" | "ad";
  name: string;
  campaign: string;
  ad_group: string | null;
  cost_usd: number;
  conversions: number;
  cpa_usd: number | null;
  waste_reason: "zero_conversions" | "high_cpa";
  clicks: number;
  impressions: number;
  match_type?: string;
}

export interface HeadlineItem {
  headline_text: string;
  ad_group: string;
  campaign: string;
  performance_label: "BEST" | "GOOD" | "LOW" | "LEARNING" | "UNSPECIFIED" | "UNKNOWN";
  pinned_position: string | null;
  is_clickbait: boolean;
  clickbait_flags: string[];
  status: "winner" | "bleeder" | "average" | "testing";
  recommendation: string;
}

export interface RsaPinningIssue {
  ad_name: string;
  ad_group: string;
  campaign: string;
  cost_usd: number;
  conversions: number;
  headline_count: number;
  recommendation: string;
}

export interface Recommendation {
  id: string;
  category: "quick_win" | "scaling";
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  estimated_impact: string | null;
  action_label: string;
  items: Record<string, unknown>[];
}

export interface AuditResult {
  account_id: string;
  account_name: string;
  date_range: string;
  total_waste_usd: number;
  items: WastingItem[];
  headline_items: HeadlineItem[];
  pinning_issues: RsaPinningIssue[];
  recommendations: Recommendation[];
  generated_at: string;
}

export interface AuditRequest {
  customer_id: string;
  date_range: string;
  min_spend_usd: number;
  target_cpa_usd: number;
  cpa_multiplier: number;
}

export const getAccounts = (): Promise<Account[]> =>
  api.get("/accounts").then((r) => r.data);

export const runAudit = (req: AuditRequest): Promise<AuditResult> =>
  api.post("/audit", req).then((r) => r.data);

export const getExportUrl = (req: AuditRequest): string => {
  const params = new URLSearchParams({
    customer_id: req.customer_id,
    date_range: req.date_range,
    min_spend_usd: String(req.min_spend_usd),
    target_cpa_usd: String(req.target_cpa_usd),
    cpa_multiplier: String(req.cpa_multiplier),
  });
  return `${BASE}/audit/export?${params}`;
};
