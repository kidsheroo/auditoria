from models import HeadlineItem, RsaPinningIssue

CLICKBAIT_PATTERNS = [
    "free", "how to", "how-to", "tutorial", "what is", "what are",
    "cheap", "easy", "beginner", "learn", "guide", "basics",
]

_LABEL_STATUS = {
    "BEST": "winner",
    "GOOD": "average",
    "LOW": "bleeder",
    "LEARNING": "testing",
    "UNSPECIFIED": "testing",
    "UNKNOWN": "testing",
}

_LABEL_BASE_RECO = {
    "BEST": "Top performer — consider pinning to Headline 1 to guarantee visibility.",
    "GOOD": "Solid performer. Keep and test new variants alongside it.",
    "LOW": "Underperforming. Replace with a benefit-driven headline (e.g., 'Get Certified in AI Automation').",
    "LEARNING": "Still collecting data. Allow more impressions before making decisions.",
    "UNSPECIFIED": "No performance data yet.",
    "UNKNOWN": "No performance data yet.",
}


def _flags(text: str) -> list[str]:
    t = text.lower()
    return [p for p in CLICKBAIT_PATTERNS if p in t]


def run_headline_audit(
    ga_service, customer_id: str
) -> tuple[list[HeadlineItem], list[RsaPinningIssue]]:

    # ── Asset-level performance (performance_label per headline) ──────────────
    asset_query = """
        SELECT
            asset.text_asset.text,
            ad_group_ad_asset_view.field_type,
            ad_group_ad_asset_view.performance_label,
            ad_group_ad_asset_view.pinned_field,
            ad_group.name,
            campaign.name
        FROM ad_group_ad_asset_view
        WHERE ad_group_ad_asset_view.field_type = 'HEADLINE'
            AND campaign.status = 'ENABLED'
            AND ad_group.status = 'ENABLED'
            AND ad_group_ad.status = 'ENABLED'
    """

    seen = set()
    headline_items: list[HeadlineItem] = []

    try:
        for row in ga_service.search(customer_id=customer_id, query=asset_query):
            text = row.asset.text_asset.text
            if not text:
                continue

            key = (text, row.ad_group.name, row.campaign.name)
            if key in seen:
                continue
            seen.add(key)

            perf = row.ad_group_ad_asset_view.performance_label.name
            pinned_raw = row.ad_group_ad_asset_view.pinned_field.name
            pinned_pos = None if pinned_raw in ("UNSPECIFIED", "UNKNOWN", "") else pinned_raw

            flags = _flags(text)
            status = _LABEL_STATUS.get(perf, "testing")
            reco = _LABEL_BASE_RECO.get(perf, "")

            if flags and status == "bleeder":
                reco = (
                    f"High CTR / Zero Revenue risk: contains '{', '.join(flags)}' "
                    f"which attracts curiosity clicks, not buyers. "
                    f"Replace with a transactional headline like 'Get Certified in AI Automation'."
                )
            elif flags and status in ("testing", "average"):
                reco = (
                    f"Caution: contains curiosity language ('{', '.join(flags)}'). "
                    f"Monitor conversion rate closely — if it stays at 0%, remove it."
                )

            headline_items.append(HeadlineItem(
                headline_text=text,
                ad_group=row.ad_group.name,
                campaign=row.campaign.name,
                performance_label=perf,
                pinned_position=pinned_pos,
                is_clickbait=bool(flags),
                clickbait_flags=flags,
                status=status,
                recommendation=reco,
            ))
    except Exception:
        pass

    # ── RSA pinning audit ─────────────────────────────────────────────────────
    rsa_query = """
        SELECT
            ad_group_ad.ad.responsive_search_ad.headlines,
            ad_group_ad.ad.name,
            ad_group.name,
            campaign.name,
            metrics.cost_micros,
            metrics.conversions
        FROM ad_group_ad
        WHERE segments.date DURING LAST_30_DAYS
            AND campaign.status = 'ENABLED'
            AND ad_group.status = 'ENABLED'
            AND ad_group_ad.status = 'ENABLED'
            AND ad_group_ad.ad.type = 'RESPONSIVE_SEARCH_AD'
            AND metrics.cost_micros > 0
    """

    pinning_issues: list[RsaPinningIssue] = []

    try:
        for row in ga_service.search(customer_id=customer_id, query=rsa_query):
            headlines = row.ad_group_ad.ad.responsive_search_ad.headlines
            if not headlines:
                continue

            pinned_count = sum(
                1 for h in headlines
                if h.pinned_field.name not in ("UNSPECIFIED", "UNKNOWN", "")
            )
            cost = row.metrics.cost_micros / 1_000_000

            if pinned_count == 0 and cost > 0:
                pinning_issues.append(RsaPinningIssue(
                    ad_name=row.ad_group_ad.ad.name or "Unnamed Ad",
                    ad_group=row.ad_group.name,
                    campaign=row.campaign.name,
                    cost_usd=round(cost, 2),
                    conversions=row.metrics.conversions,
                    headline_count=len(headlines),
                    recommendation=(
                        "No headlines pinned — Google may show your CTA as Headline 1, "
                        "removing context for the user. Pin your core value prop "
                        "(e.g., product name or main benefit) to Position 1."
                    ),
                ))
    except Exception:
        pass

    return headline_items, pinning_issues
