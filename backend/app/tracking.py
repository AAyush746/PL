"""
Public, unauthenticated endpoints hit directly from an employee's email
client (the simulated outbox). Two things are deliberate here:

1. Token resolution is a single narrow lookup — never a raw dump of
   campaign_results. The token is a UUID generated per-employee-result.
2. A click redirects to an educational reveal page, never a credential
   form. is_submitted records INTENT only — the reveal page asks "would you
   have entered your password?", and no payload is ever stored.
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .core.config import get_settings
from .database import get_tracking_db
from .models import Campaign, CampaignResult, EventType, PhishingEvent

router = APIRouter(prefix="/track", tags=["tracking"])

TRACKING_PIXEL = (
    b"GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff!\xf9\x04\x01"
    b"\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x01D\x00;"
)

settings = get_settings()


async def _resolve_token(token: str, db: AsyncSession) -> tuple[CampaignResult | None, Campaign | None]:
    try:
        token_uuid = uuid.UUID(token)
    except (ValueError, AttributeError, TypeError):
        return None, None
    result = await db.scalar(
        select(CampaignResult).where(CampaignResult.tracking_token == token_uuid)
    )
    if result is None:
        return None, None
    campaign = await db.scalar(select(Campaign).where(Campaign.id == result.campaign_id))
    return result, campaign


def _touch_request(result: CampaignResult, request: Request | None) -> None:
    if request is None:
        return
    result.ip_address = request.client.host if request.client else None
    result.user_agent = request.headers.get("user-agent")


@router.get("/open/{token}")
async def track_open(token: str, request: Request, db: AsyncSession = Depends(get_tracking_db)):
    result, campaign = await _resolve_token(token, db)
    if result and campaign and not result.is_opened:
        result.is_opened = True
        result.opened_at = datetime.now(timezone.utc)
        _touch_request(result, request)
        db.add(
            PhishingEvent(
                org_id=campaign.org_id,
                campaign_id=campaign.id,
                result_id=result.id,
                event_type=EventType.OPENED,
            )
        )
        await db.commit()
    # Return the pixel regardless of whether the token resolved — never
    # signal to an external prober whether a given token is valid.
    return Response(content=TRACKING_PIXEL, media_type="image/gif")


@router.get("/click/{token}")
async def track_click(token: str, request: Request, db: AsyncSession = Depends(get_tracking_db)):
    result, campaign = await _resolve_token(token, db)
    if not result:
        return RedirectResponse(url=f"{settings.REVEAL_PAGE_URL}?t=unknown")

    if not result.is_clicked:
        result.is_clicked = True
        result.clicked_at = datetime.now(timezone.utc)
        _touch_request(result, request)
        if campaign:
            db.add(
                PhishingEvent(
                    org_id=campaign.org_id,
                    campaign_id=campaign.id,
                    result_id=result.id,
                    event_type=EventType.CLICKED,
                )
            )
        await db.commit()

    # Always the educational reveal — explains what the red flags were.
    # There is intentionally no branch here that leads to a login form.
    return RedirectResponse(url=f"{settings.REVEAL_PAGE_URL}?t={token}&cid={result.campaign_id}")


@router.post("/complete/{token}")
async def track_training_complete(token: str, db: AsyncSession = Depends(get_tracking_db)):
    """Called by the awareness-reveal page once the micro-lesson is done."""
    result, campaign = await _resolve_token(token, db)
    if not result:
        return {"ok": False, "error": "Unknown token"}
    result.is_submitted = True
    result.training_completed = True
    result.training_completed_at = datetime.now(timezone.utc)
    if campaign:
        db.add(
            PhishingEvent(
                org_id=campaign.org_id,
                campaign_id=campaign.id,
                result_id=result.id,
                event_type=EventType.TRAINING_COMPLETED,
            )
        )
    await db.commit()
    return {"ok": True, "training_completed": True}


@router.post("/report/{token}")
async def track_report(token: str, request: Request, db: AsyncSession = Depends(get_tracking_db)):
    """The employee clicks 'Report phishing' on the simulated message.

    This is the desirable behavior we want to encourage, so it is recorded
    immediately and is never overridden by a later click.
    """
    result, campaign = await _resolve_token(token, db)
    if not result:
        return {"ok": False, "error": "Unknown token"}
    if not result.is_reported:
        result.is_reported = True
        result.reported_at = datetime.now(timezone.utc)
        _touch_request(result, request)
        if campaign:
            db.add(
                PhishingEvent(
                    org_id=campaign.org_id,
                    campaign_id=campaign.id,
                    result_id=result.id,
                    event_type=EventType.REPORTED,
                )
            )
        await db.commit()
    return {"ok": True, "reported": True}
