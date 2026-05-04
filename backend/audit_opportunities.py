import httpx
from collections import defaultdict
from models import Recommendation, AuditRequest

# Google Ads Device enum values
_DEVICE = {2: "MOBILE", 3: "TABLET", 4: "DESKTOP", 5: "CONNECTED_TV"}

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


# ── Quick Win #4: Low Quality Score keywords ─────────────────────────────────

def _low_quality_score_keywords(ga_service, customer_id: str, req: AuditRequest) -> list[Recommendation]:
    query = f"""
        SELECT
            ad_group_criterion.keyword.text,
            ad_group_criterion.quality_info.quality_score,
            campaign.name,
            ad_group.name,
            metrics.cost_micros,
            metrics.clicks
        FROM keyword_view
        WHERE segments.date DURING {req.date_range}
            AND metrics.cost_micros > 0
            AND ad_group_criterion.status = 'ENABLED'
            AND campaign.status = 'ENABLED'
            AND ad_group.status = 'ENABLED'
    """

    low_qs = []
    for row in ga_service.search(customer_id=customer_id, query=query):
        qs = row.ad_group_criterion.quality_info.quality_score
        if not qs or qs > 4:
            continue
        cost = row.metrics.cost_micros / 1_000_000
        if cost < req.min_spend_usd:
            continue
        low_qs.append({
            "keyword": row.ad_group_criterion.keyword.text,
            "quality_score": qs,
            "campaign": row.campaign.name,
            "ad_group": row.ad_group.name,
            "cost_usd": round(cost, 2),
            "clicks": row.metrics.clicks,
        })

    if not low_qs:
        return []

    total = sum(k["cost_usd"] for k in low_qs)
    return [Recommendation(
        id="low_quality_score",
        category="quick_win",
        severity="high",
        title=f"Low Quality Score Keywords — {len(low_qs)} keywords",
        description=(
            "Keywords with Quality Score ≤ 4 pay a CPC premium of up to 400% "
            "compared to QS 10. Poor ad relevance or landing page mismatch "
            "is draining budget on every click."
        ),
        estimated_impact=f"${total:.0f} spent at inflated CPCs — fix to cut cost per click",
        action_label="Rewrite ad copy or landing pages to match keyword intent",
        items=sorted(low_qs, key=lambda x: (x["quality_score"], -x["cost_usd"])),
    )]


# ── Quick Win #5: Mobile CPA >> Desktop ──────────────────────────────────────

def _device_cpa_imbalance(ga_service, customer_id: str, req: AuditRequest) -> list[Recommendation]:
    query = f"""
        SELECT
            campaign.name,
            segments.device,
            metrics.cost_micros,
            metrics.conversions
        FROM campaign
        WHERE segments.date DURING {req.date_range}
            AND campaign.status = 'ENABLED'
            AND metrics.cost_micros > 0
    """

    data: dict[str, dict[str, dict]] = defaultdict(lambda: defaultdict(lambda: {"cost": 0.0, "convs": 0.0}))
    for row in ga_service.search(customer_id=customer_id, query=query):
        device = _DEVICE.get(int(row.segments.device), "OTHER")
        data[row.campaign.name][device]["cost"] += row.metrics.cost_micros / 1_000_000
        data[row.campaign.name][device]["convs"] += row.metrics.conversions

    flagged = []
    for campaign, devices in data.items():
        d = devices.get("DESKTOP", {})
        m = devices.get("MOBILE", {})
        d_cost, d_convs = d.get("cost", 0.0), d.get("convs", 0.0)
        m_cost, m_convs = m.get("cost", 0.0), m.get("convs", 0.0)
        if d_convs < 2 or m_cost < req.min_spend_usd * 2:
            continue
        d_cpa = d_cost / d_convs
        m_cpa = m_cost / m_convs if m_convs > 0 else None
        if m_cpa is None or m_cpa <= d_cpa * 2:
            continue
        flagged.append({
            "campaign": campaign,
            "desktop_cpa_usd": round(d_cpa, 2),
            "mobile_cpa_usd": round(m_cpa, 2),
            "mobile_spend_usd": round(m_cost, 2),
            "cpa_ratio": f"{m_cpa / d_cpa:.1f}×",
        })

    if not flagged:
        return []

    total_mobile = sum(f["mobile_spend_usd"] for f in flagged)
    return [Recommendation(
        id="device_cpa_imbalance",
        category="quick_win",
        severity="medium",
        title=f"Mobile CPA 2× Desktop — {len(flagged)} campaigns",
        description=(
            "These campaigns spend heavily on mobile but convert at 2× or more "
            "the desktop CPA. A negative mobile bid adjustment shifts budget "
            "toward your more profitable device without pausing anything."
        ),
        estimated_impact=f"${total_mobile:.0f} in mobile spend — apply -20% to -50% mobile bid adjustment",
        action_label="Apply negative mobile bid adjustments in campaign settings",
        items=sorted(flagged, key=lambda x: x["mobile_spend_usd"], reverse=True),
    )]


# ── Quick Win #6: Day-of-week waste ──────────────────────────────────────────

def _day_of_week_waste(ga_service, customer_id: str, req: AuditRequest) -> list[Recommendation]:
    query = f"""
        SELECT
            segments.day_of_week,
            metrics.cost_micros,
            metrics.conversions,
            metrics.clicks
        FROM campaign
        WHERE segments.date DURING {req.date_range}
            AND campaign.status = 'ENABLED'
            AND metrics.cost_micros > 0
    """

    DAY = {2: "Monday", 3: "Tuesday", 4: "Wednesday", 5: "Thursday",
           6: "Friday", 7: "Saturday", 8: "Sunday"}

    agg: dict[str, dict] = defaultdict(lambda: {"cost": 0.0, "convs": 0.0, "clicks": 0})
    for row in ga_service.search(customer_id=customer_id, query=query):
        day = DAY.get(int(row.segments.day_of_week), "Unknown")
        agg[day]["cost"] += row.metrics.cost_micros / 1_000_000
        agg[day]["convs"] += row.metrics.conversions
        agg[day]["clicks"] += row.metrics.clicks

    # Find overall CPA to compare against
    total_cost = sum(v["cost"] for v in agg.values())
    total_convs = sum(v["convs"] for v in agg.values())
    if total_convs < 5 or total_cost < req.min_spend_usd * 10:
        return []

    avg_cpa = total_cost / total_convs
    waste_days = []
    for day, v in agg.items():
        if v["cost"] < req.min_spend_usd * 3:
            continue
        day_cpa = v["cost"] / v["convs"] if v["convs"] > 0 else v["cost"] * 100
        if day_cpa > avg_cpa * 2.5:
            waste_days.append({
                "day": day,
                "spend_usd": round(v["cost"], 2),
                "conversions": round(v["convs"], 1),
                "cpa_usd": round(day_cpa, 2) if v["convs"] > 0 else "No conversions",
                "avg_account_cpa_usd": round(avg_cpa, 2),
            })

    if not waste_days:
        return []

    total = sum(d["spend_usd"] for d in waste_days)
    return [Recommendation(
        id="day_of_week_waste",
        category="quick_win",
        severity="medium",
        title=f"High-Waste Days of Week — {len(waste_days)} days",
        description=(
            "These days of the week have a CPA more than 2.5× the account average. "
            "Reducing bids or pausing ads on these days saves budget "
            "and reallocates it to your best-performing windows."
        ),
        estimated_impact=f"${total:.0f} in above-average-CPA day spend — use ad scheduling",
        action_label="Apply negative bid adjustments by day in campaign settings",
        items=sorted(waste_days, key=lambda x: x["spend_usd"], reverse=True),
    )]


# ── Scaling #4: Ad groups with only one active ad ────────────────────────────

def _single_ad_ad_groups(ga_service, customer_id: str, req: AuditRequest) -> list[Recommendation]:
    query = f"""
        SELECT
            ad_group.id,
            ad_group.name,
            campaign.name,
            metrics.cost_micros
        FROM ad_group_ad
        WHERE ad_group_ad.status = 'ENABLED'
            AND ad_group.status = 'ENABLED'
            AND campaign.status = 'ENABLED'
            AND segments.date DURING {req.date_range}
            AND metrics.cost_micros > 0
    """

    counts: dict[str, dict] = defaultdict(lambda: {"count": 0, "name": "", "campaign": "", "cost": 0.0})
    for row in ga_service.search(customer_id=customer_id, query=query):
        ag_id = str(row.ad_group.id)
        counts[ag_id]["count"] += 1
        counts[ag_id]["name"] = row.ad_group.name
        counts[ag_id]["campaign"] = row.campaign.name
        counts[ag_id]["cost"] += row.metrics.cost_micros / 1_000_000

    singles = [
        {
            "ad_group": v["name"],
            "campaign": v["campaign"],
            "cost_usd": round(v["cost"], 2),
            "active_ads": 1,
            "fix": "Add a second RSA with different headlines",
        }
        for v in counts.values()
        if v["count"] == 1 and v["cost"] >= req.min_spend_usd * 2
    ]

    if not singles:
        return []

    return [Recommendation(
        id="single_ad_ad_groups",
        category="scaling",
        severity="medium",
        title=f"Ad Groups With Only 1 Active Ad — {len(singles)} groups",
        description=(
            "These ad groups have only one enabled ad, so Google has nothing to test "
            "or rotate. Adding a second RSA with different headlines lets the algorithm "
            "learn what messaging converts best and improves CTR over time."
        ),
        estimated_impact="Add a second RSA to unlock Google's creative testing and lift CTR",
        action_label="Add a second Responsive Search Ad to each ad group",
        items=sorted(singles, key=lambda x: x["cost_usd"], reverse=True),
    )]


# ── Scaling #5: Keywords with high CTR but zero conversions ──────────────────

def _high_ctr_no_conversion_keywords(ga_service, customer_id: str, req: AuditRequest) -> list[Recommendation]:
    query = f"""
        SELECT
            ad_group_criterion.keyword.text,
            ad_group_criterion.keyword.match_type,
            campaign.name,
            ad_group.name,
            metrics.clicks,
            metrics.conversions,
            metrics.cost_micros,
            metrics.ctr
        FROM keyword_view
        WHERE segments.date DURING {req.date_range}
            AND metrics.clicks > 30
            AND metrics.conversions = 0
            AND metrics.cost_micros > 0
            AND ad_group_criterion.status = 'ENABLED'
            AND campaign.status = 'ENABLED'
    """

    flagged = []
    for row in ga_service.search(customer_id=customer_id, query=query):
        ctr = row.metrics.ctr
        if ctr < 0.04:  # only keywords people are clicking (CTR ≥ 4%)
            continue
        cost = row.metrics.cost_micros / 1_000_000
        if cost < req.min_spend_usd:
            continue
        flagged.append({
            "keyword": row.ad_group_criterion.keyword.text,
            "match_type": str(row.ad_group_criterion.keyword.match_type).split(".")[-1],
            "campaign": row.campaign.name,
            "ad_group": row.ad_group.name,
            "clicks": row.metrics.clicks,
            "ctr_pct": round(ctr * 100, 1),
            "cost_usd": round(cost, 2),
        })

    if not flagged:
        return []

    total = sum(f["cost_usd"] for f in flagged)
    return [Recommendation(
        id="high_ctr_no_conversion",
        category="scaling",
        severity="medium",
        title=f"High-CTR Keywords Not Converting — {len(flagged)} keywords",
        description=(
            "These keywords attract clicks (CTR ≥ 4%) but produce zero purchases. "
            "The ad is compelling but the landing page is failing — "
            "wrong offer, slow load, or broken form. This is a landing page problem, not a keyword problem."
        ),
        estimated_impact=f"${total:.0f} going to clicks that bounce — fix the landing page to recover conversions",
        action_label="Audit landing page speed, offer, and form for these keywords",
        items=sorted(flagged, key=lambda x: x["cost_usd"], reverse=True),
    )]


# ── Entry point ───────────────────────────────────────────────────────────────

def run_opportunity_audit(ga_service, customer_id: str, req: AuditRequest) -> list[Recommendation]:
    results: list[Recommendation] = []
    for fn in [
        _low_intent_search_terms,
        _zombie_ad_groups,
        _url_health,
        _low_quality_score_keywords,
        _device_cpa_imbalance,
        _day_of_week_waste,
        _impression_share_gap,
        _winning_search_terms,
        _bidding_headroom,
        _single_ad_ad_groups,
        _high_ctr_no_conversion_keywords,
    ]:
        _safe_extend(results, fn, ga_service, customer_id, req)
    return results
