import os
import re
import secrets
import hashlib
import base64
import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse
from google_auth_oauthlib.flow import Flow

load_dotenv()

CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
REDIRECT_URI = "http://localhost:8000/auth/callback"

SCOPES = [
    "https://www.googleapis.com/auth/adwords",
    "https://www.googleapis.com/auth/userinfo.email",
    "openid",
]

router = APIRouter(prefix="/auth", tags=["auth"])

ENV_PATH = os.path.join(os.path.dirname(__file__), ".env")


def _create_flow() -> Flow:
    return Flow.from_client_config(
        {
            "web": {
                "client_id": CLIENT_ID,
                "client_secret": CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [REDIRECT_URI],
            }
        },
        scopes=SCOPES,
        redirect_uri=REDIRECT_URI,
    )


def _save_refresh_token(token: str):
    """Persist refresh token into .env and update the live process env."""
    os.environ["GOOGLE_REFRESH_TOKEN"] = token
    try:
        with open(ENV_PATH, "r") as f:
            content = f.read()
        if "GOOGLE_REFRESH_TOKEN=" in content:
            content = re.sub(r"GOOGLE_REFRESH_TOKEN=.*", f"GOOGLE_REFRESH_TOKEN={token}", content)
        else:
            content += f"\nGOOGLE_REFRESH_TOKEN={token}\n"
        with open(ENV_PATH, "w") as f:
            f.write(content)
    except Exception:
        pass


@router.get("/status")
def status():
    """Returns whether credentials are ready — no login needed if True."""
    ready = bool(os.environ.get("GOOGLE_REFRESH_TOKEN"))
    return {"ready": ready}


@router.get("/login")
def login(request: Request):
    # PKCE — required by Google for web application OAuth clients
    code_verifier = secrets.token_urlsafe(96)
    code_challenge = base64.urlsafe_b64encode(
        hashlib.sha256(code_verifier.encode()).digest()
    ).decode().rstrip("=")

    flow = _create_flow()
    auth_url, state = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
        code_challenge=code_challenge,
        code_challenge_method="S256",
    )
    request.session["oauth_state"] = state
    request.session["code_verifier"] = code_verifier
    return RedirectResponse(auth_url)


@router.get("/callback")
def callback(request: Request, code: str = None, state: str = None, error: str = None):
    if error:
        return RedirectResponse(f"{FRONTEND_URL}/?error={error}")

    if not code or state != request.session.get("oauth_state"):
        return RedirectResponse(f"{FRONTEND_URL}/?error=invalid_state")

    code_verifier = request.session.get("code_verifier", "")
    flow = _create_flow()
    flow.fetch_token(code=code, code_verifier=code_verifier)
    credentials = flow.credentials

    # Persist so the app never needs login again
    if credentials.refresh_token:
        _save_refresh_token(credentials.refresh_token)

    request.session["access_token"] = credentials.token
    request.session["refresh_token"] = credentials.refresh_token or os.environ.get("GOOGLE_REFRESH_TOKEN", "")
    request.session["connected"] = True

    try:
        resp = httpx.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {credentials.token}"},
            timeout=10,
        )
        user_info = resp.json()
        request.session["user_email"] = user_info.get("email", "")
    except Exception:
        request.session["user_email"] = ""

    return RedirectResponse(f"{FRONTEND_URL}/")
