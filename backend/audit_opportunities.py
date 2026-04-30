import httpx
from models import Recommendation, AuditRequest

INTENT_PATTERNS = [
    "how to", "how-to", "free", "tutorial", "what is", "what are",
    "cheap", "guide", "learn", "basics", "beginner",
]


def _safe_extend(results: list, fn, *args) -> None:
    try:
        results.extend(fn(*args))
    except Exception:
        pass


# ── Quick Win #1: Non-converting intent search terms ─────────────────────────

def _low_intent_search_terms(ga_service, customer_id: str, req: AuditRequest) -> list[Recommendation]:
    query = f"""
        SELECT
            search_term_view.search_term,
            campaign.name,
            ad_group.name,
            metrics.clicks,
            metrics.conversions,
            metrics.cost_micros
        FROM search_term_view
        WHERE segments.date DURING {req.date_range}
            AND metrics.clicks > 20
            AND metrics.conversions = 0
            AND metrics.cost_micros > 0
            AND campaign.status = 'ENABLED'
            AND ad_group.status = 'ENABLED'
    """

    flagged = []
    for row in ga_service.search(customer_id=customer_id, query=query):
        term = row.search_term_view.search_term
        flags = [p for p in INTENT_PATTERNS if p in term.lower()]
        if flags:
            flagged.append({
                "term": term,
                "clicks": row.metrics.clicks,
                "cost_usd": round(row.metrics.cost_micros / 1_000_000, 2),
                "campaign": row.campaign.name,
                "ad_group": row.ad_group.name,
                "intent_flags": flags,
            })

    if not flagged:
        return []

    total = sum(f["cost_usd"] for f in flagged)
    return [Recommendation(
        id="non_converting_intent",
        category="quick_win",
        severity="high",
        title=f"Non-Buyer Intent Search Terms — {len(flagged)} terms",
        description=(
            "Search terms containing 'free', 'how to', 'tutorial' etc. "
            "with more than 20 clicks and zero purchases. "
            "These attract curiosity clicks from people not ready to buy."
        ),
        estimated_impact=f"Stop ${total:.0f} in wasted spend",
        action_label="Add as negative keywords in Google Ads",
        items=sorted(flagged, key=lambda x: x["cost_usd"], reverse=True),
    )]


# ── Quick Win #2: Zombie ad groups ────────────────────────────────────────────

def _zombie_ad_groups(ga_service, customer_id: str, req: AuditRequest) -> list[Recommendation]:
    query = """
        SELECT
            ad_group.id,
            ad_group.name,
            campaign.name,
            metrics.cost_micros,
            metrics.conversions
        FROM ad_group
        WHERE segments.date DURING LAST_14_DAYS
            AND metrics.cost_micros > 0
            AND metrics.conversions = 0
            AND ad_group.status = 'ENABLED'
            AND campaign.status = 'ENABLED'
    """

    threshold = req.target_cpa_usd * 2
    zombies = []
    for row in ga_service.search(customer_id=customer_id, query=query):
        cost = row.metrics.cost_micros / 1_000_000
        if cost >= threshold:
            zombies.append({
                "name": row.ad_group.name,
                "campaign": row.campaign.name,
                "cost_usd": round(cost, 2),
                "days_checked": 14,
                "threshold_usd": round(threshold, 2),
            })

    if not zombies:
        return []

    total = sum(z["cost_usd"] for z in zombies)
    return [Recommendation(
        id="zombie_ad_groups",
        category="quick_win",
        severity="high",
        title=f"Zombie Ad Groups — {len(zombies)} found",
        description=(
            f"Ad groups that spent more than 2× your target CPA "
            f"(${threshold:.0f}) in the last 14 days with zero purchases. "
            "Budget is being drained with no return."
        ),
        estimated_impact=f"Pause to save ${total:.0f}",
        action_label="Pause these ad groups in Google Ads",
        items=sorted(zombies, key=lambda x: x["cost_usd"], reverse=True),
    )]


# ── Quick Win #3: Final URL health check ─────────────────────────────────────

def _url_health(ga_service, customer_id: str, req: AuditRequest) -> list[Recommendation]:
    query = """
        SELECT
            ad_group_ad.ad.final_urls,
            ad_group_ad.ad.name,
            campaign.name
        FROM ad_group_ad
        WHERE ad_group_ad.status = 'ENABLED'
            AND campaign.status = 'ENABLED'
            AND ad_group.status = 'ENABLED'
        LIMIT 300
    """

    url_meta: dict[str, str] = {}
    for row in ga_service.search(customer_id=customer_id, query=query):
        for url in row.ad_group_ad.ad.final_urls:
            if url and url not in url_meta:
                url_meta[url] = row.campaign.name

    broken = []
    for url, campaign in list(url_meta.items())[:50]:
        try:
            resp = httpx.get(
                url, timeout=6, follow_redirects=True,
                headers={"User-Agent": "Mozilla/5.0 (compatible; AdsAuditor/1.0)"},
            )
            if resp.status_code >= 400:
                broken.append({
                    "url": url,
                    "status_code": resp.status_code,
                    "campaign": campaign,
                    "issue": f"HTTP {resp.status_code}",
                })
        except Exception:
            broken.append({
                "url": url,
                "status_code": 0,
                "campaign": campaign,
                "issue": "Unreachable / Timeout",
            })

    if not broken:
        return []

    return [Recommendation(
        id="broken_urls",
        category="quick_win",
        severity="high",
        title=f"Broken Landing Pages — {len(broken)} URLs",
        description=(
            "These final URLs return errors or are unreachable. "
            "Every click to a broken page is 100% wasted spend — "
            "the visitor has no chance to convert."
        ),
        estimated_impact="Fix immediately to stop paying for zero-chance conversions",
        action_label="Fix or redirect these URLs in Google Ads",
        items=broken,
    )]


# ── Scaling #1: Impression share gap ─────────────────────────────────────────

def _impression_share_gap(ga_service, customer_id: str, req: AuditRequest) -> list[Recommendation]:
    query = f"""
        SELECT
            campaign.id,
            campaign.name,
            metrics.cost_micros,
            metrics.conversions,
            metrics.search_impression_share,
            metrics.search_budget_lost_impression_share
        FROM campaign
        WHERE segments.date DURING {req.date_range}
            AND metrics.cost_micros > 0
            AND metrics.conversions > 0
            AND campaign.status = 'ENABLED'
    """

    opportunities = []
    for row in ga_service.search(customer_id=customer_id, query=query):
        cost = row.metrics.cost_micros / 1_000_000
        convs = row.metrics.conversions
        if convs == 0:
            continue

        imp_share = row.metrics.search_impression_share
        budget_lost = row.metrics.search_budget_lost_impression_share

        # imp_share < 0 means Google returns a sentinel value (–) for PMax etc.
        if not imp_share or imp_share <= 0 or imp_share >= 0.7:
            continue
        if not budget_lost or budget_lost <= 0.1:
            continue

        actual_cpa = cost / convs
        est_extra = round(convs * (budget_lost / max(imp_share, 0.01)))

        opportunities.append({
            "campaign": row.campaign.name,
            "impression_share_pct": round(imp_share * 100, 1),
            "budget_lost_to_budget_pct": round(budget_lost * 100, 1),
            "actual_cpa_usd": round(actual_cpa, 2),
            "conversions": convs,
            "estimated_extra_purchases": est_extra,
        })

    if not opportunities:
        return []

    total_extra = sum(o["estimated_extra_purchases"] for o in opportunities)
    return [Recommendation(
        id="impression_share_gap",
        category="scaling",
        severity="medium",
        title=f"Budget-Limited Campaigns — {len(opportunities)} campaigns losing impressions",
        description=(
            "These campaigns are converting profitably but losing impressions "
            "purely because of budget limits. Increasing budget captures "
            "missed conversions at your existing CPA."
        ),
        estimated_impact=f"Estimated +{total_extra} purchases/month with budget increase",
        action_label="Increase daily budgets for these campaigns",
        items=sorted(opportunities, key=lambda x: x["estimated_extra_purchases"], reverse=True),
    )]


# ── Scaling #2: Winning search terms to exact match ──────────────────────────

def _winning_search_terms(ga_service, customer_id: str, req: AuditRequest) -> list[Recommendation]:
    query = f"""
        SELECT
            search_term_view.search_term,
            campaign.name,
            ad_group.name,
            metrics.conversions,
            metrics.cost_micros,
            metrics.clicks
        FROM search_term_view
        WHERE segments.date DURING {req.date_range}
            AND metrics.conversions >= 2
            AND metrics.cost_micros > 0
            AND campaign.status = 'ENABLED'
            AND ad_group.status = 'ENABLED'
    """

    winners = []
    for row in ga_service.search(customer_id=customer_id, query=query):
        cost = row.metrics.cost_micros / 1_000_000
        convs = row.metrics.conversions
        cpa = cost / convs if convs > 0 else 9999

        if cpa <= req.target_cpa_usd:
            winners.append({
                "term": row.search_term_view.search_term,
                "campaign": row.campaign.name,
                "ad_group": row.ad_group.name,
                "conversions": convs,
                "cpa_usd": round(cpa, 2),
                "clicks": row.metrics.clicks,
            })

    if not winners:
        return []

    return [Recommendation(
        id="winning_search_terms",
        category="scaling",
        severity="medium",
        title=f"High-Converting Search Terms to Exact Match — {len(winners)} terms",
        description=(
            "These search terms have ≥2 purchases at or below your target CPA, "
            "appearing via Broad Match or PMax. Moving them to dedicated "
            "Exact Match ad groups gives you full bid control and better ad relevance."
        ),
        estimated_impact="Lock in performance, improve Quality Score, reduce CPCs",
        action_label="Create Exact Match ad groups for these terms",
        items=sorted(winners, key=lambda x: x["conversions"], reverse=True),
    )]


# ── Scaling #3: Bidding headroom (tCPA below actual) ─────────────────────────

def _bidding_headroom(ga_service, customer_id: str, req: AuditRequest) -> list[Recommendation]:
    query = f"""
        SELECT
            campaign.id,
            campaign.name,
            campaign.target_cpa.target_cpa_micros,
            metrics.cost_micros,
            metrics.conversions
        FROM campaign
        WHERE segments.date DURING {req.date_range}
            AND campaign.status = 'ENABLED'
            AND metrics.cost_micros > 0
            AND metrics.conversions > 0
    """

    headroom = []
    for row in ga_service.search(customer_id=customer_id, query=query):
        target_micros = row.campaign.target_cpa.target_cpa_micros
        if not target_micros or target_micros <= 0:
            continue

        target_cpa = target_micros / 1_000_000
        cost = row.metrics.cost_micros / 1_000_000
        convs = row.metrics.conversions
        actual_cpa = cost / convs

        if actual_cpa < target_cpa * 0.7:
            headroom.append({
                "campaign": row.campaign.name,
                "target_cpa_usd": round(target_cpa, 2),
                "actual_cpa_usd": round(actual_cpa, 2),
                "gap_pct": round((1 - actual_cpa / target_cpa) * 100),
                "suggested_tcpa_usd": round(target_cpa * 1.15, 2),
                "conversions": convs,
            })

    if not headroom:
        return []

    return [Recommendation(
        id="bidding_headroom",
        category="scaling",
        severity="low",
        title=f"Bidding Headroom — {len(headroom)} campaigns under-bidding",
        description=(
            "Your actual CPA is significantly below your tCPA target. "
            "The algorithm is being overly conservative. "
            "Raising the tCPA by ~15% lets it compete in more auctions and scale volume."
        ),
        estimated_impact="Increase conversion volume at an acceptable CPA",
        action_label="Raise tCPA by ~15% in Google Ads bidding settings",
        items=sorted(headroom, key=lambda x: x["gap_pct"], reverse=True),
    )]


# ── Entry point ───────────────────────────────────────────────────────────────

def run_opportunity_audit(ga_service, customer_id: str, req: AuditRequest) -> list[Recommendation]:
    results: list[Recommendation] = []
    for fn in [
        _low_intent_search_terms,
        _zombie_ad_groups,
        _url_health,
        _impression_share_gap,
        _winning_search_terms,
        _bidding_headroom,
    ]:
        _safe_extend(results, fn, ga_service, customer_id, req)
    return results
