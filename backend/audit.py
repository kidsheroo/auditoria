from datetime import datetime, timezone
from google.ads.googleads.errors import GoogleAdsException
from ads_client import build_client
from models import AuditRequest, AuditResult, WastingItem
from audit_headlines import run_headline_audit
from audit_opportunities import run_opportunity_audit
from audit_health import run_health_audit


def _micros_to_usd(micros: int) -> float:
    return micros / 1_000_000


def _detect_waste(
    cost_usd: float,
    conversions: float,
    min_spend_usd: float,
    target_cpa_usd: float,
    cpa_multiplier: float,
) -> tuple[str | None, float | None]:
    """Returns (waste_reason, cpa_usd) or (None, None) if not wasting."""
    if cost_usd < min_spend_usd:
        return None, None
    if conversions == 0:
        return "zero_conversions", None
    cpa = cost_usd / conversions
    if cpa > target_cpa_usd * cpa_multiplier:
        return "high_cpa", round(cpa, 2)
    return None, None


def _query_campaigns(ga_service, customer_id: str, req: AuditRequest) -> list[WastingItem]:
    query = f"""
        SELECT
            campaign.id,
            campaign.name,
            metrics.cost_micros,
            metrics.conversions,
            metrics.clicks,
            metrics.impressions
        FROM campaign
        WHERE segments.date DURING {req.date_range}
            AND metrics.cost_micros > 0
            AND campaign.status = 'ENABLED'
    """
    items = []
    for row in ga_service.search(customer_id=customer_id, query=query):
        cost = _micros_to_usd(row.metrics.cost_micros)
        convs = row.metrics.conversions
        reason, cpa = _detect_waste(cost, convs, req.min_spend_usd, req.target_cpa_usd, req.cpa_multiplier)
        if reason:
            items.append(WastingItem(
                entity_type="campaign",
                name=row.campaign.name,
                campaign=row.campaign.name,
                cost_usd=round(cost, 2),
                conversions=convs,
                cpa_usd=cpa,
                waste_reason=reason,
                clicks=row.metrics.clicks,
                impressions=row.metrics.impressions,
            ))
    return items


def _query_ad_groups(ga_service, customer_id: str, req: AuditRequest) -> list[WastingItem]:
    query = f"""
        SELECT
            ad_group.id,
            ad_group.name,
            campaign.name,
            metrics.cost_micros,
            metrics.conversions,
            metrics.clicks,
            metrics.impressions
        FROM ad_group
        WHERE segments.date DURING {req.date_range}
            AND metrics.cost_micros > 0
            AND ad_group.status = 'ENABLED'
            AND campaign.status = 'ENABLED'
    """
    items = []
    for row in ga_service.search(customer_id=customer_id, query=query):
        cost = _micros_to_usd(row.metrics.cost_micros)
        convs = row.metrics.conversions
        reason, cpa = _detect_waste(cost, convs, req.min_spend_usd, req.target_cpa_usd, req.cpa_multiplier)
        if reason:
            items.append(WastingItem(
                entity_type="ad_group",
                name=row.ad_group.name,
                campaign=row.campaign.name,
                ad_group=row.ad_group.name,
                cost_usd=round(cost, 2),
                conversions=convs,
                cpa_usd=cpa,
                waste_reason=reason,
                clicks=row.metrics.clicks,
                impressions=row.metrics.impressions,
            ))
    return items


def _query_keywords(ga_service, customer_id: str, req: AuditRequest) -> list[WastingItem]:
    query = f"""
        SELECT
            ad_group_criterion.keyword.text,
            ad_group_criterion.keyword.match_type,
            ad_group.name,
            campaign.name,
            metrics.cost_micros,
            metrics.conversions,
            metrics.clicks,
            metrics.impressions
        FROM keyword_view
        WHERE segments.date DURING {req.date_range}
            AND metrics.cost_micros > 0
            AND campaign.status = 'ENABLED'
            AND ad_group.status = 'ENABLED'
            AND ad_group_criterion.status != 'REMOVED'
    """
    items = []
    for row in ga_service.search(customer_id=customer_id, query=query):
        cost = _micros_to_usd(row.metrics.cost_micros)
        convs = row.metrics.conversions
        reason, cpa = _detect_waste(cost, convs, req.min_spend_usd, req.target_cpa_usd, req.cpa_multiplier)
        if reason:
            match = row.ad_group_criterion.keyword.match_type.name
            items.append(WastingItem(
                entity_type="keyword",
                name=row.ad_group_criterion.keyword.text,
                campaign=row.campaign.name,
                ad_group=row.ad_group.name,
                cost_usd=round(cost, 2),
                conversions=convs,
                cpa_usd=cpa,
                waste_reason=reason,
                clicks=row.metrics.clicks,
                impressions=row.metrics.impressions,
                match_type=match,
            ))
    return items


def _query_search_terms(ga_service, customer_id: str, req: AuditRequest) -> list[WastingItem]:
    query = f"""
        SELECT
            search_term_view.search_term,
            campaign.name,
            ad_group.name,
            metrics.cost_micros,
            metrics.conversions,
            metrics.clicks,
            metrics.impressions
        FROM search_term_view
        WHERE segments.date DURING {req.date_range}
            AND metrics.cost_micros > 0
            AND campaign.status = 'ENABLED'
            AND ad_group.status = 'ENABLED'
    """
    items = []
    for row in ga_service.search(customer_id=customer_id, query=query):
        cost = _micros_to_usd(row.metrics.cost_micros)
        convs = row.metrics.conversions
        reason, cpa = _detect_waste(cost, convs, req.min_spend_usd, req.target_cpa_usd, req.cpa_multiplier)
        if reason:
            items.append(WastingItem(
                entity_type="search_term",
                name=row.search_term_view.search_term,
                campaign=row.campaign.name,
                ad_group=row.ad_group.name,
                cost_usd=round(cost, 2),
                conversions=convs,
                cpa_usd=cpa,
                waste_reason=reason,
                clicks=row.metrics.clicks,
                impressions=row.metrics.impressions,
            ))
    return items


def _query_ads(ga_service, customer_id: str, req: AuditRequest) -> list[WastingItem]:
    query = f"""
        SELECT
            ad_group_ad.ad.id,
            ad_group_ad.ad.type,
            ad_group_ad.ad.name,
            ad_group.name,
            campaign.name,
            metrics.cost_micros,
            metrics.conversions,
            metrics.clicks,
            metrics.impressions
        FROM ad_group_ad
        WHERE segments.date DURING {req.date_range}
            AND metrics.cost_micros > 0
            AND ad_group_ad.status = 'ENABLED'
            AND campaign.status = 'ENABLED'
            AND ad_group.status = 'ENABLED'
    """
    items = []
    for row in ga_service.search(customer_id=customer_id, query=query):
        cost = _micros_to_usd(row.metrics.cost_micros)
        convs = row.metrics.conversions
        reason, cpa = _detect_waste(cost, convs, req.min_spend_usd, req.target_cpa_usd, req.cpa_multiplier)
        if reason:
            ad_name = (
                row.ad_group_ad.ad.name
                or f"Ad #{row.ad_group_ad.ad.id} ({row.ad_group_ad.ad.type.name})"
            )
            items.append(WastingItem(
                entity_type="ad",
                name=ad_name,
                campaign=row.campaign.name,
                ad_group=row.ad_group.name,
                cost_usd=round(cost, 2),
                conversions=convs,
                cpa_usd=cpa,
                waste_reason=reason,
                clicks=row.metrics.clicks,
                impressions=row.metrics.impressions,
            ))
    return items


def run_audit(tokens: dict, req: AuditRequest) -> AuditResult:
    client = build_client(tokens, req.customer_id)
    ga_service = client.get_service("GoogleAdsService")

    try:
        # Get account name
        acc_response = ga_service.search(
            customer_id=req.customer_id,
            query="SELECT customer.id, customer.descriptive_name FROM customer LIMIT 1",
        )
        account_name = req.customer_id
        for row in acc_response:
            account_name = row.customer.descriptive_name or req.customer_id

        items: list[WastingItem] = []
        items.extend(_query_campaigns(ga_service, req.customer_id, req))
        items.extend(_query_ad_groups(ga_service, req.customer_id, req))
        items.extend(_query_keywords(ga_service, req.customer_id, req))
        items.extend(_query_search_terms(ga_service, req.customer_id, req))
        items.extend(_query_ads(ga_service, req.customer_id, req))
        items.sort(key=lambda x: x.cost_usd, reverse=True)
        total_waste = round(sum(i.cost_usd for i in items), 2)

        # Headline & creative audit
        headline_items, pinning_issues = run_headline_audit(ga_service, req.customer_id)

        # Quick wins + scaling opportunities
        recommendations = run_opportunity_audit(ga_service, req.customer_id, req)

        # Health & coverage checks (Google native recs, conversion tracking,
        # disapproved ads, negative-keyword hygiene, Shopping/PMax)
        recommendations.extend(run_health_audit(ga_service, req.customer_id, req))

        return AuditResult(
            account_id=req.customer_id,
            account_name=account_name,
            date_range=req.date_range,
            total_waste_usd=total_waste,
            items=items,
            headline_items=headline_items,
            pinning_issues=pinning_issues,
            recommendations=recommendations,
            generated_at=datetime.now(timezone.utc).isoformat(),
        )

    except GoogleAdsException as ex:
        errors = [e.message for e in ex.failure.errors]
        raise RuntimeError(f"Google Ads API error: {'; '.join(errors)}")
