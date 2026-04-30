from pydantic import BaseModel
from typing import Optional


class WastingItem(BaseModel):
    entity_type: str  # campaign | ad_group | keyword | search_term | ad
    name: str
    campaign: str
    ad_group: Optional[str] = None
    cost_usd: float
    conversions: float
    cpa_usd: Optional[float] = None
    waste_reason: str  # zero_conversions | high_cpa
    clicks: int
    impressions: int
    match_type: Optional[str] = None


class HeadlineItem(BaseModel):
    headline_text: str
    ad_group: str
    campaign: str
    performance_label: str       # BEST | GOOD | LOW | LEARNING | UNSPECIFIED
    pinned_position: Optional[str] = None  # HEADLINE_1 | HEADLINE_2 | HEADLINE_3
    is_clickbait: bool
    clickbait_flags: list[str]
    status: str                  # winner | bleeder | average | testing
    recommendation: str


class RsaPinningIssue(BaseModel):
    ad_name: str
    ad_group: str
    campaign: str
    cost_usd: float
    conversions: float
    headline_count: int
    recommendation: str


class Recommendation(BaseModel):
    id: str
    category: str        # quick_win | scaling
    severity: str        # high | medium | low
    title: str
    description: str
    estimated_impact: Optional[str] = None
    action_label: str
    items: list[dict]


class AuditResult(BaseModel):
    account_id: str
    account_name: str
    date_range: str
    total_waste_usd: float
    items: list[WastingItem]
    headline_items: list[HeadlineItem] = []
    pinning_issues: list[RsaPinningIssue] = []
    recommendations: list[Recommendation] = []
    generated_at: str


class AuditRequest(BaseModel):
    customer_id: str
    date_range: str = "LAST_30_DAYS"
    min_spend_usd: float = 5.0
    target_cpa_usd: float = 20.0
    cpa_multiplier: float = 3.0


class Account(BaseModel):
    id: str
    name: str
    currency: str = "USD"


class AuthStatus(BaseModel):
    connected: bool
    email: Optional[str] = None
