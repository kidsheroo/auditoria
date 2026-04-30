import os
from dotenv import load_dotenv
from google.ads.googleads.client import GoogleAdsClient
from google.ads.googleads.errors import GoogleAdsException

load_dotenv()

DEVELOPER_TOKEN = os.getenv("GOOGLE_ADS_DEVELOPER_TOKEN")
CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
LOGIN_CUSTOMER_ID = os.getenv("GOOGLE_ADS_LOGIN_CUSTOMER_ID", "")


def _get_refresh_token(tokens: dict = None) -> str:
    """Use saved env token first; fall back to session token."""
    return (
        os.environ.get("GOOGLE_REFRESH_TOKEN")
        or (tokens or {}).get("refresh_token")
        or ""
    )


def build_client(tokens: dict = None, customer_id: str = None) -> GoogleAdsClient:
    config = {
        "developer_token": DEVELOPER_TOKEN,
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "refresh_token": _get_refresh_token(tokens),
        "use_proto_plus": True,
    }
    if customer_id:
        config["login_customer_id"] = customer_id
    elif LOGIN_CUSTOMER_ID:
        config["login_customer_id"] = LOGIN_CUSTOMER_ID
    return GoogleAdsClient.load_from_dict(config)


def list_accounts(tokens: dict = None) -> list[dict]:
    client = build_client(tokens)
    customer_service = client.get_service("CustomerService")

    try:
        accessible = customer_service.list_accessible_customers()
        resource_names = accessible.resource_names
    except GoogleAdsException as ex:
        raise RuntimeError(f"Failed to list accounts: {ex.error.code().name}")

    accounts = []
    for resource_name in resource_names:
        customer_id = resource_name.split("/")[1]
        try:
            c = build_client(tokens, customer_id)
            ga = c.get_service("GoogleAdsService")
            response = ga.search(
                customer_id=customer_id,
                query=(
                    "SELECT customer.id, customer.descriptive_name, "
                    "customer.currency_code FROM customer LIMIT 1"
                ),
            )
            for row in response:
                accounts.append(
                    {
                        "id": customer_id,
                        "name": row.customer.descriptive_name or f"Account {customer_id}",
                        "currency": row.customer.currency_code or "USD",
                    }
                )
                break
        except Exception:
            accounts.append(
                {"id": customer_id, "name": f"Account {customer_id}", "currency": "USD"}
            )

    return accounts
