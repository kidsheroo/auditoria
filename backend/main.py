import os
import csv
import io
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from starlette.middleware.sessions import SessionMiddleware

load_dotenv()

SESSION_SECRET = os.getenv("SESSION_SECRET", "dev-secret-change-me")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
IS_PROD = any(os.getenv(v) for v in ("RAILWAY_ENVIRONMENT", "RENDER", "VERCEL", "VERCEL_ENV"))

app = FastAPI(title="Google Ads Waste Auditor")

app.add_middleware(
    SessionMiddleware,
    secret_key=SESSION_SECRET,
    max_age=86400,
    same_site="none" if IS_PROD else "lax",
    https_only=IS_PROD,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from auth import router as auth_router
from ads_client import list_accounts
from audit import run_audit
from models import AuditRequest, AuditResult, Account

app.include_router(auth_router)


def get_tokens(request: Request) -> dict:
    """
    Returns credentials dict. Prefers the saved GOOGLE_REFRESH_TOKEN env var
    (set after first OAuth login); falls back to session tokens.
    """
    saved = os.environ.get("GOOGLE_REFRESH_TOKEN")
    if saved:
        return {"refresh_token": saved, "access_token": ""}
    if request.session.get("connected"):
        return {
            "access_token": request.session.get("access_token", ""),
            "refresh_token": request.session.get("refresh_token", ""),
        }
    raise HTTPException(401, "No credentials found. Please connect your Google Ads account.")


@app.get("/accounts", response_model=list[Account])
def get_accounts(tokens: dict = Depends(get_tokens)):
    try:
        return list_accounts(tokens)
    except Exception as e:
        raise HTTPException(400, str(e))


@app.post("/audit", response_model=AuditResult)
def post_audit(body: AuditRequest, tokens: dict = Depends(get_tokens)):
    try:
        return run_audit(tokens, body)
    except Exception as e:
        raise HTTPException(400, str(e))


@app.get("/audit/export")
def export_audit(
    customer_id: str,
    date_range: str = "LAST_30_DAYS",
    min_spend_usd: float = 5.0,
    target_cpa_usd: float = 20.0,
    cpa_multiplier: float = 3.0,
    tokens: dict = Depends(get_tokens),
):
    req = AuditRequest(
        customer_id=customer_id,
        date_range=date_range,
        min_spend_usd=min_spend_usd,
        target_cpa_usd=target_cpa_usd,
        cpa_multiplier=cpa_multiplier,
    )
    try:
        result = run_audit(tokens, req)
    except Exception as e:
        raise HTTPException(400, str(e))

    output = io.StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=[
            "entity_type", "name", "campaign", "ad_group",
            "cost_usd", "conversions", "cpa_usd", "waste_reason",
            "clicks", "impressions", "match_type",
        ],
    )
    writer.writeheader()
    for item in result.items:
        writer.writerow(item.model_dump())

    output.seek(0)
    filename = f"ads_waste_audit_{customer_id}_{date_range}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
