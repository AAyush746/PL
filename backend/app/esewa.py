"""eSewa ePay (Nepal) integration helpers.

Implements the documented flow:
  1. Build the checkout form and sign it (HMAC-SHA256, base64) so the browser
     can POST to eSewa's hosted page.
  2. Verify the base64-encoded response eSewa appends to our callback URL.
  3. Confirm the payment server-side via eSewa's status-check API.

Signature algorithm (per eSewa docs): the message is the values of the
signed_field_names, comma-joined in the order listed; the MAC is HMAC-SHA256
with the merchant secret and the result is base64-encoded.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import urllib.parse
import urllib.request
import uuid
from asyncio import to_thread
from datetime import datetime, timezone

from .core.config import get_settings

logger = logging.getLogger(__name__)

SIGNED_FIELD_NAMES = "total_amount,transaction_uuid,product_code"

# Per-employee pricing in NPR. `starter`/`growth` are monthly rates; `enterprise`
# is an annual rate charged once per year through eSewa ePay.
PLAN_RATES = {"starter": 199, "growth": 149, "enterprise": 1199}

STATUS_COMPLETE = "COMPLETE"


def _form_amount(value) -> str:
    """Amount as eSewa expects it in the form + request signature: a whole-NPR
    integer string (e.g. ``2384``)."""
    return str(int(value))


def _int_form(value) -> str:
    """Normalize a numeric value to its integer-string form (``100.0`` -> ``100``)."""
    if isinstance(value, (int, float)):
        return str(int(float(value)))
    return str(value)


def _hmac(message: str) -> str:
    settings = get_settings()
    digest = hmac.new(
        settings.ESEWA_SECRET_KEY.encode("utf-8"),
        message.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    return base64.b64encode(digest).decode("ascii")


def request_signature(total_amount: int, transaction_uuid: str) -> str:
    """Signature for the checkout form. The canonical eSewa message is the
    signed fields as ``field=value`` pairs (no spaces) in signed_field_names
    order — e.g. ``total_amount=2384,transaction_uuid=...,product_code=EPAYTEST``."""
    settings = get_settings()
    message = (
        f"total_amount={_form_amount(total_amount)},"
        f"transaction_uuid={transaction_uuid},"
        f"product_code={settings.ESEWA_PRODUCT_CODE}"
    )
    return _hmac(message)


def new_transaction_uuid() -> str:
    """eSewa only allows alphanumerics and hyphens, and the value must be
    unique per request."""
    return f"PHL{datetime.now(timezone.utc).strftime('%Y%m%d')}-{uuid.uuid4().hex[:12].upper()}"


def build_form(total_amount: int, transaction_uuid: str) -> dict:
    """The hidden-form fields the browser must POST to eSewa."""
    settings = get_settings()
    total = _form_amount(total_amount)
    callback = f"{settings.API_BASE_URL}/api/v1/org/pay/esewa/callback"
    return {
        "amount": total,
        "tax_amount": "0",
        "total_amount": total,
        "transaction_uuid": transaction_uuid,
        "product_code": settings.ESEWA_PRODUCT_CODE,
        "product_service_charge": "0",
        "product_delivery_charge": "0",
        "success_url": callback,
        "failure_url": callback,
        "signed_field_names": SIGNED_FIELD_NAMES,
        "signature": request_signature(total_amount, transaction_uuid),
    }


def decode_callback_data(data_b64: str) -> dict:
    """Decode the base64 JSON body eSewa sends back to the callback URL."""
    raw = base64.b64decode(data_b64).decode("utf-8")
    return json.loads(raw)


def verify_callback_signature(payload: dict) -> bool:
    """Re-derive the HMAC over the fields eSewa signed and compare it to the
    signature it returned. Callers must treat a mismatch as a failed payment.

    Confirmed against eSewa's documented response sample: the message is the
    ``signed_field_names`` values as ``field=value`` pairs in that order, with
    ``total_amount`` kept in its raw JSON form (``1000.0``, not ``1000``).
    A fallback to integer form is accepted for robustness."""
    names = [n.strip() for n in str(payload.get("signed_field_names") or "").split(",") if n.strip()]
    if not names:
        return False
    expected = payload.get("signature", "")
    if not expected:
        return False

    raw = ",".join(f"{name}={payload.get(name)}" for name in names)
    normalized = ",".join(f"{name}={_int_form(payload.get(name))}" for name in names)
    if hmac.compare_digest(_hmac(raw), expected) or hmac.compare_digest(_hmac(normalized), expected):
        return True

    logger.warning("eSewa callback signature mismatch for %s", payload.get("transaction_uuid"))
    return False


def amount_matches(value, expected: int) -> bool:
    try:
        return int(float(value)) == int(expected)
    except (TypeError, ValueError):
        return False


def approve_callback(payload: dict | None, confirmed: dict, expected_amount: int) -> bool:
    """Decision logic for the success callback. A payment is approved only when
    the eSewa signature verifies AND the status is COMPLETE. If the server-side
    status check is unreachable (``confirmed`` empty) the signature-verified
    callback is trusted as a fallback; if eSewa answers but reports anything
    other than COMPLETE the payment is rejected."""
    if payload is None or not verify_callback_signature(payload):
        return False
    if payload.get("status") != STATUS_COMPLETE:
        return False
    if not confirmed:
        return True
    return confirmed.get("status") == STATUS_COMPLETE and amount_matches(confirmed.get("total_amount"), expected_amount)


def _status_check_raw(order) -> tuple[bool, dict]:
    settings = get_settings()
    query = urllib.parse.urlencode(
        {
            "product_code": settings.ESEWA_PRODUCT_CODE,
            "total_amount": _form_amount(order.amount),
            "transaction_uuid": order.transaction_uuid,
        }
    )
    url = f"{settings.ESEWA_STATUS_URL}?{query}"
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            return True, json.loads(resp.read().decode("utf-8"))
    except Exception as exc:  # noqa: BLE001 — network/parse failures are handled by the caller
        logger.warning("eSewa status check failed for %s: %s", order.transaction_uuid, exc)
        return False, {}


async def check_status(order) -> dict:
    """Call eSewa's status API to confirm a completed transaction server-side.
    Returns ``{}`` if the call fails so the caller can fall back to the
    signature-verified callback data."""
    ok, body = await to_thread(_status_check_raw, order)
    if not ok:
        return {}
    return body
