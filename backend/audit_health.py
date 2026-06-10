"""
audit_health.py
────────────────
Additional audit "sources" that extend the existing opportunity audit.

Every function returns a list[Recommendation] using the SAME model as
audit_opportunities.py, so they render in OpportunityDeck.tsx with ZERO
frontend changes. Categories are restricted to "quick_win" | "scaling"
because the frontend partitions on exactly those two values.

New coverage vs. the original app:
  • Google's NATIVE recommendations + account optimization score
  • Conversion-tracking health (the foundation every other metric rests on)
  • Disapproved / policy-limited ads that aren't serving
  • Negative-keyword hygiene (spending campaigns with no negatives)
  • Shopping product waste (spend, zero conversions)
  • PMax asset-group ad strength (POOR / AVERAGE groups)

Every query is wrapped so a single unavailable resource (e.g. no Shopping
on the account) yields no card instead of failing the whole audit.
"""

from collections import defaultdict
from models import Recommendation, AuditRequest


def _safe_extend(results: list, fn, *args) -> None:
    try:
        results.extend(fn(*args))
    except Exception:
        pass


# ── Source #1: Google's native Recommendations + Optimization Score ───────────

# Friendly labels for the most common recommendation types.
_REC_TYPE_LABELS = {
    "CAMPAIGN_BUDGET": "Raise budget on limited campaigns",
    "KEYWORD": "Add suggested keywords",
    "TEXT_AD": "Add new ad variations",
    "TARGET_CPA_OPT_IN": "Switch to Target CPA bidding",
    "MAXIMIZE_CONVERSIONS_OPT_IN": "Switch to Maximize Conversions",
    "MAXIMIZE_CONVERSION_VALUE_OPT_IN": "Switch to Maximize Conversion Value",
    "TARGET_ROAS_OPT_IN": "Switch to Target ROAS bidding",
    "ENHANCED_CPC_OPT_IN": "Enable Enhanced CPC",
    "SEARCH_PARTNERS_OPT_IN": "Opt into Search Partners",
    "OPTIMIZE_AD_ROTATION": "Optimize ad rotation",
    "MOVE_UNUSED_BUDGET": "Reallocate unused budget",
    "RESPONSIVE_SEARCH_AD": "Add a Responsive Search Ad",
    "RESPONSIVE_SEARCH_AD_ASSET": "Add headlines/descriptions to RSAs",
    "RESPONSIVE_SEARCH_AD_IMPROVE_AD_STRENGTH": "Improve RSA ad strength",
    "SITELINK_ASSET": "Add sitelink assets",
    "CALLOUT_ASSET": "Add callout assets",
    "CALL_ASSET": "Add call assets",
    "USE_BROAD_MATCH_KEYWORD": "Test broad match keywords",
    "UPGRADE_SMART_SHOPPING_CAMPAIGN_TO_PERFORMANCE_MAX": "Upgrade to Performance Max",
    "DISPLAY_EXPANSION_OPT_IN": "Enable display expansion",
    "IMPROVE_PERFORMANCE_MAX_AD_STRENGTH": "Improve PMax ad strength",
    "FORECASTING_CAMPAIGN_BUDGET": "Prepare budget for forecasted demand",
    "LOWER_CPC": "Lower CPC opportunity",
}


def _google_native_recommendations(ga_service, customer_id: str, req: AuditRequest) -> list[Recommendation]:
    # Account optimization score (0.0–1.0). Surfaced in the card description.
    opt_score_pct = None
    try:
        for row in ga_service.search(
            customer_id=customer_id,
            query="SELECT customer.optimization_score FROM customer LIMIT 1",
        ):
            score = row.customer.optimization_score
            if score and score > 0:
                opt_score_pct = round(score * 100, 1)
    except Exception:
        pass

    # Google's own recommendation engine. Minimal field set = maximum robustness.
    counts: dict[str, int] = defaultdict(int)
    try:
        for row in ga_service.search(
            customer_id=customer_id,
            query="SELECT recommendation.type, recommendation.campaign FROM recommendation",
        ):
            counts[row.recommendation.type.name] += 1
    except Exception:
        pass

    if not counts and opt_score_pct is None:
        return []

    items = [
        {
            "recommendation": _REC_TYPE_LABELS.get(t, t.replace("_", " ").title()),
            "type": t,
            "count": n,
        }
        for t, n in sorted(counts.items(), key=lambda kv: kv[1], reverse=True)
    ]

    total = sum(counts.values())
    score_txt = f"Optimization score: {opt_score_pct}%. " if opt_score_pct is not None else ""
    impact = (
        f"{score_txt}{total} pending Google recommendations"
        if total else f"{score_txt}No pending Google recommendations"
    )

    return [Recommendation(
        id="google_native_recommendations",
        category="scaling",
        severity="medium" if total else "low",
        title=f"Google's Own Recommendations — {total} pending"
              + (f" · {opt_score_pct}% opt score" if opt_score_pct is not None else ""),
        description=(
            "Pulled directly from Google's Recommendations engine — the same list that "
            "drives your Optimization Score. Each one Google has identified for THIS account. "
            "Review before bulk-applying: bidding and budget recommendations should be sanity-checked "
            "against your margins, but asset and keyword suggestions are usually safe wins."
        ),
        estimated_impact=impact,
        action_label="Review in Google Ads → Recommendations tab",
        items=items,
    )] if items else []


# ── Source #2: Conversion-tracking health ────────────────────────────────────

def _conversion_tracking_health(ga_service, customer_id: str, req: AuditRequest) -> list[Recommendation]:
    # Enabled conversion actions and whether any is primary (counts toward "Conversions").
    actions: list[dict] = []
    try:
        q = """
            SELECT
                conversion_action.name,
                conversion_action.category,
                conversion_action.type,
                conversion_action.primary_for_goal,
                conversion_action.status
            FROM conversion_action
            WHERE conversion_action.status = 'ENABLED'
        """
        for row in ga_service.search(customer_id=customer_id, query=q):
            actions.append({
                "name": row.conversion_action.name,
                "category": row.conversion_action.category.name,
                "type": row.conversion_action.type_.name,
                "primary": bool(row.conversion_action.primary_for_goal),
            })
    except Exception:
        return []

    # Which actions actually fired in the audit window?
    fired: set[str] = set()
    try:
        q2 = f"""
            SELECT segments.conversion_action_name, metrics.conversions
            FROM customer
            WHERE segments.date DURING {req.date_range}
        """
        for row in ga_service.search(customer_id=customer_id, query=q2):
            if row.metrics.conversions and row.metrics.conversions > 0:
                fired.add(row.segments.conversion_action_name)
    except Exception:
        pass

    issues: list[dict] = []

    if not actions:
        issues.append({
            "issue": "No enabled conversion actions",
            "detail": "Smart Bidding and every CPA/ROAS metric in this audit are flying blind.",
            "severity": "CRITICAL",
        })
    else:
        if not any(a["primary"] for a in actions):
            issues.append({
                "issue": "No primary conversion action",
                "detail": "Conversions exist but none counts toward 'Conversions' — bidding can't optimize.",
                "severity": "CRITICAL",
            })
        # Primary actions that never fired in the window = likely broken tags.
        for a in actions:
            if a["primary"] and fired and a["name"] not in fired:
                issues.append({
                    "issue": "Primary action with 0 conversions",
                    "detail": f"'{a['name']}' ({a['category']}) recorded nothing in {req.date_range}. Check the tag fires.",
                    "severity": "HIGH",
                })

    if not issues:
        return []

    crit = any(i["severity"] == "CRITICAL" for i in issues)
    return [Recommendation(
        id="conversion_tracking_health",
        category="quick_win",
        severity="high",
        title=f"Conversion Tracking Issues — {len(issues)} found"
              + (" · CRITICAL" if crit else ""),
        description=(
            "Conversion tracking is the foundation every other number in this audit rests on. "
            "If it's broken or misconfigured, Smart Bidding optimizes toward the wrong signal and "
            "every CPA figure you're looking at is wrong. Fix these before trusting anything else."
        ),
        estimated_impact="Restores the signal Smart Bidding and this entire audit depend on",
        action_label="Fix in Google Ads → Goals → Conversions",
        items=issues,
    )]


# ── Source #3: Disapproved / policy-limited ads ──────────────────────────────

_APPROVAL_LABEL = {
    "DISAPPROVED": "Disapproved (not serving)",
    "APPROVED_LIMITED": "Limited (reduced reach)",
    "AREA_OF_INTEREST_ONLY": "Serving only in areas of interest",
    "UNDER_REVIEW": "Under review",
}


def _disapproved_ads(ga_service, customer_id: str, req: AuditRequest) -> list[Recommendation]:
    q = """
        SELECT
            ad_group_ad.ad.id,
            ad_group_ad.ad.name,
            ad_group_ad.ad.type,
            ad_group_ad.policy_summary.approval_status,
            campaign.name,
            ad_group.name
        FROM ad_group_ad
        WHERE ad_group_ad.status = 'ENABLED'
            AND campaign.status = 'ENABLED'
            AND ad_group.status = 'ENABLED'
            AND ad_group_ad.policy_summary.approval_status != 'APPROVED'
    """
    flagged: list[dict] = []
    for row in ga_service.search(customer_id=customer_id, query=q):
        status = row.ad_group_ad.policy_summary.approval_status.name
        if status in ("UNSPECIFIED", "UNKNOWN", "APPROVED"):
            continue
        name = row.ad_group_ad.ad.name or f"Ad #{row.ad_group_ad.ad.id} ({row.ad_group_ad.ad.type_.name})"
        flagged.append({
            "ad": name,
            "status": _APPROVAL_LABEL.get(status, status),
            "campaign": row.campaign.name,
            "ad_group": row.ad_group.name,
        })

    if not flagged:
        return []

    disapproved = sum(1 for f in flagged if "Disapproved" in f["status"])
    return [Recommendation(
        id="disapproved_ads",
        category="quick_win",
        severity="high" if disapproved else "medium",
        title=f"Ads Not Fully Serving — {len(flagged)} ads"
              + (f" ({disapproved} disapproved)" if disapproved else ""),
        description=(
            "These enabled ads are disapproved or limited by policy, so they're getting reduced "
            "or zero impressions. In single-ad ad groups a disapproval means the ad group is dark. "
            "Fixing the policy issue restores reach you've already built and paid to set up."
        ),
        estimated_impact="Restore impressions on ads that are built but blocked",
        action_label="Resolve policy issues in Google Ads (hover the ad status)",
        items=sorted(flagged, key=lambda x: 0 if "Disapproved" in x["status"] else 1),
    )]


# ── Source #4: Negative-keyword hygiene ──────────────────────────────────────

def _missing_negative_keywords(ga_service, customer_id: str, req: AuditRequest) -> list[Recommendation]:
    # Count campaign-level negative keywords per campaign.
    neg_counts: dict[str, int] = defaultdict(int)
    try:
        q = """
            SELECT campaign.id
            FROM campaign_criterion
            WHERE campaign_criterion.type = 'KEYWORD'
                AND campaign_criterion.negative = TRUE
                AND campaign.status = 'ENABLED'
        """
        for row in ga_service.search(customer_id=customer_id, query=q):
            neg_counts[str(row.campaign.id)] += 1
    except Exception:
        return []

    # Spending Search campaigns with no negatives at all.
    flagged: list[dict] = []
    spend_q = f"""
        SELECT
            campaign.id,
            campaign.name,
            campaign.advertising_channel_type,
            metrics.cost_micros
        FROM campaign
        WHERE segments.date DURING {req.date_range}
            AND campaign.status = 'ENABLED'
            AND metrics.cost_micros > 0
    """
    for row in ga_service.search(customer_id=customer_id, query=spend_q):
        channel = row.campaign.advertising_channel_type.name
        if channel not in ("SEARCH", "SHOPPING"):
            continue
        cid = str(row.campaign.id)
        cost = row.metrics.cost_micros / 1_000_000
        if cost < req.min_spend_usd * 5:
            continue
        if neg_counts.get(cid, 0) == 0:
            flagged.append({
                "campaign": row.campaign.name,
                "channel": channel,
                "spend_usd": round(cost, 2),
                "negative_keywords": 0,
                "issue": "No campaign-level negatives",
            })

    if not flagged:
        return []

    total = sum(f["spend_usd"] for f in flagged)
    return [Recommendation(
        id="missing_negative_keywords",
        category="quick_win",
        severity="medium",
        title=f"Campaigns With Zero Negative Keywords — {len(flagged)}",
        description=(
            "These spending Search/Shopping campaigns have no campaign-level negative keywords. "
            "Without negatives, broad and phrase match drift onto irrelevant queries and PMax/Shopping "
            "soak up junk traffic. Even a basic universal negative list (jobs, free, cheap, competitor "
            "names) typically recovers a meaningful slice of spend."
        ),
        estimated_impact=f"${total:.0f} in spend with no query filtering — add a negative list",
        action_label="Add negative keyword lists in Google Ads → Shared Library",
        items=sorted(flagged, key=lambda x: x["spend_usd"], reverse=True),
    )]


# ── Source #5: Shopping product waste ────────────────────────────────────────

def _shopping_product_waste(ga_service, customer_id: str, req: AuditRequest) -> list[Recommendation]:
    q = f"""
        SELECT
            segments.product_item_id,
            segments.product_title,
            campaign.name,
            metrics.cost_micros,
            metrics.conversions,
            metrics.clicks
        FROM shopping_performance_view
        WHERE segments.date DURING {req.date_range}
            AND metrics.cost_micros > 0
            AND metrics.conversions = 0
    """
    agg: dict[str, dict] = defaultdict(
        lambda: {"title": "", "campaign": "", "cost": 0.0, "clicks": 0}
    )
    for row in ga_service.search(customer_id=customer_id, query=q):
        pid = row.segments.product_item_id or "unknown"
        agg[pid]["title"] = row.segments.product_title or pid
        agg[pid]["campaign"] = row.campaign.name
        agg[pid]["cost"] += row.metrics.cost_micros / 1_000_000
        agg[pid]["clicks"] += row.metrics.clicks

    flagged = [
        {
            "product": v["title"][:60],
            "item_id": pid,
            "campaign": v["campaign"],
            "cost_usd": round(v["cost"], 2),
            "clicks": v["clicks"],
        }
        for pid, v in agg.items()
        if v["cost"] >= req.min_spend_usd * 2
    ]

    if not flagged:
        return []

    total = sum(f["cost_usd"] for f in flagged)
    return [Recommendation(
        id="shopping_product_waste",
        category="quick_win",
        severity="high",
        title=f"Shopping Products Burning Budget — {len(flagged)} products",
        description=(
            "Individual products that spent real money with zero conversions in the window. "
            "Unlike Search, you can't 'pause a keyword' here — you exclude the product or split "
            "it into its own listing group with a lower bid. A handful of dud SKUs often eat a "
            "disproportionate share of Shopping/PMax budget."
        ),
        estimated_impact=f"${total:.0f} on non-converting products — exclude or down-bid",
        action_label="Add product exclusions in the listing group / asset group",
        items=sorted(flagged, key=lambda x: x["cost_usd"], reverse=True),
    )]


# ── Source #6: PMax asset-group strength ─────────────────────────────────────

_AD_STRENGTH_LABEL = {
    "POOR": "Poor", "AVERAGE": "Average", "GOOD": "Good", "EXCELLENT": "Excellent",
    "PENDING": "Pending", "NO_ADS": "No ads",
}


def _weak_pmax_asset_groups(ga_service, customer_id: str, req: AuditRequest) -> list[Recommendation]:
    q = """
        SELECT
            asset_group.name,
            asset_group.ad_strength,
            asset_group.status,
            campaign.name
        FROM asset_group
        WHERE asset_group.status = 'ENABLED'
            AND campaign.status = 'ENABLED'
    """
    flagged: list[dict] = []
    for row in ga_service.search(customer_id=customer_id, query=q):
        strength = row.asset_group.ad_strength.name
        if strength in ("POOR", "AVERAGE", "NO_ADS"):
            flagged.append({
                "asset_group": row.asset_group.name,
                "campaign": row.campaign.name,
                "ad_strength": _AD_STRENGTH_LABEL.get(strength, strength),
                "fix": "Add more headlines, images, and videos to reach 'Excellent'",
            })

    if not flagged:
        return []

    return [Recommendation(
        id="weak_pmax_asset_groups",
        category="scaling",
        severity="medium",
        title=f"Weak Performance Max Asset Groups — {len(flagged)}",
        description=(
            "These PMax asset groups have Poor/Average ad strength, which directly caps how "
            "much inventory Google will serve them into. Filling out the missing asset slots "
            "(extra headlines, long headlines, multiple image ratios, and at least one video) "
            "is the single biggest lever for PMax reach and is free to do."
        ),
        estimated_impact="Lift ad strength to 'Excellent' to unlock more PMax inventory",
        action_label="Add missing assets in each asset group",
        items=flagged,
    )]


# ── Entry point ──────────────────────────────────────────────────────────────

def run_health_audit(ga_service, customer_id: str, req: AuditRequest) -> list[Recommendation]:
    """Run all health/coverage checks. Each is isolated so one failure (e.g. a
    Shopping query on a Search-only account) never breaks the rest of the audit."""
    results: list[Recommendation] = []
    for fn in [
        _google_native_recommendations,
        _conversion_tracking_health,
        _disapproved_ads,
        _missing_negative_keywords,
        _shopping_product_waste,
        _weak_pmax_asset_groups,
    ]:
        _safe_extend(results, fn, ga_service, customer_id, req)
    return results
