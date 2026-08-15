"""KnowBe4-style remediation automation.

Trigger: an employee clicks a simulated phish. We auto-enroll them in the
org's remediation group, email a direct training link with a 7-day deadline,
and once they complete the assigned lesson we queue them for a follow-up
simulation in the coming weeks (drained by ``dispatch_campaign``).

Nothing here punishes anyone — the record exists so the security team can see
who is mid-remediation, who missed the deadline, and who is due a retest.
"""

import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from .core.config import get_settings
from .models import (
    Campaign, CampaignResult, Employee, EventType, OutboxMessage,
    PhishingEvent, Remediation, RemediationStatus,
)

logger = logging.getLogger(__name__)
settings = get_settings()

REMEDIATION_DEADLINE_DAYS = 7          # days an employee gets to complete the lesson
FOLLOW_UP_DELAY_DAYS = 21              # "in the coming weeks" retest window
REMEDIATION_FROM_NAME = "NovaGuard Security Team"
REMEDIATION_FROM_EMAIL = "security@novaguard.example"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def training_link_for(result: CampaignResult) -> str:
    """The direct link the employee follows to complete the assigned lesson.
    The awareness-reveal page carries the red-flag breakdown + micro-lesson."""
    return f"{settings.REVEAL_PAGE_URL}?t={result.tracking_token}&cid={result.campaign_id}"


async def _failure_type(db, campaign: Campaign | None) -> str:
    from .models import PhishingTemplate  # local import keeps module import graph shallow
    from .training import CATEGORY_TO_FAILURE, FALLBACK_FAILURE

    if campaign is None:
        return FALLBACK_FAILURE
    template = await db.get(PhishingTemplate, campaign.template_id)
    return (
        CATEGORY_TO_FAILURE.get((template.category or "").strip().lower(), FALLBACK_FAILURE)
        if template is not None else FALLBACK_FAILURE
    )


async def _open_remediation(db, employee_id) -> Remediation | None:
    now = _now()
    return await db.scalar(
        select(Remediation).where(
            Remediation.employee_id == employee_id,
            Remediation.status == RemediationStatus.ASSIGNED,
            Remediation.deadline > now,
        ).order_by(Remediation.assigned_at.desc())
    )


def _notification_html(employee: Employee, deadline: datetime, link: str) -> str:
    when = deadline.strftime("%B %d, %Y")
    return f"""<html><body style="font-family:Arial,sans-serif;color:#1c1917;background:#fafaf9;padding:24px">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden">
<div style="background:#0c0c0e;color:#fdba74;padding:18px 24px;font-size:15px;font-weight:bold">
NovaGuard Security · Phishloop
</div>
<div style="padding:24px">
<p style="margin:0 0 12px">Hi {employee.first_name},</p>
<p style="margin:0 0 12px;line-height:1.55">
You clicked a link in a <strong>simulated phishing email</strong> your organization sent to
everyone. Nothing was compromised and no data was collected — this is a safe, controlled test.
</p>
<p style="margin:0 0 12px;line-height:1.55">
To keep your risk profile clean, please complete a <strong>2-minute micro-lesson</strong> that
shows you exactly which red flags to spot next time.
</p>
<p style="margin:0 0 18px">
<a href="{link}" style="display:inline-block;background:#ea580c;color:#ffffff;padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:bold">
Complete my lesson
</a>
</p>
<p style="margin:0 0 6px;font-size:13px;color:#57534e">
This lesson must be completed by <strong>{when}</strong>. Missing the deadline flags you for
follow-up with your security team.
</p>
<p style="margin:0;font-size:12px;color:#a8a29e">
If you already completed it, thank you — you can ignore this message.
</p>
</div>
</div></body></html>"""


async def _deliver_notification(db, org_id, campaign_id, result: CampaignResult, employee: Employee, deadline: datetime) -> None:
    """Record a remediation email in the outbox and, when real delivery is
    configured, also send it over SMTP. Send failures never block assignment."""
    from .tasks import EmailProvider  # local import avoids a tasks <-> remediation cycle

    link = training_link_for(result)
    subject = f"Complete your security micro-lesson by {deadline:%b %d}"
    html = _notification_html(employee, deadline, link)

    provider = EmailProvider()
    try:
        await provider.send_direct(employee.email, subject, html)
    except Exception:  # noqa: BLE001 — a failed notification must not break the click flow
        logger.exception("Failed to send remediation notification to %s", employee.email)
    finally:
        await provider.close()

    db.add(OutboxMessage(
        org_id=org_id,
        campaign_id=campaign_id,
        result_id=result.id,
        to_name=f"{employee.first_name} {employee.last_name}",
        to_email=employee.email,
        from_name=REMEDIATION_FROM_NAME,
        from_email=REMEDIATION_FROM_EMAIL,
        subject=subject,
        html_body=html,
        tracking_token=uuid.uuid4(),  # distinct from the campaign token — column is unique
    ))


async def assign_remediation(db, result: CampaignResult, campaign: Campaign | None) -> Remediation | None:
    """Auto-enroll an employee who clicked a simulated phish.

    One open assignment per employee: if they already have a live one we leave
    it untouched rather than stacking deadlines. Returns the record, or None
    when there was nothing to do (unknown employee, already assigned)."""
    if campaign is None:
        return None
    existing = await _open_remediation(db, result.employee_id)
    if existing is not None:
        return existing

    employee = await db.get(Employee, result.employee_id)
    if employee is None:
        return None

    now = _now()
    deadline = now + timedelta(days=REMEDIATION_DEADLINE_DAYS)
    remediation = Remediation(
        org_id=campaign.org_id,
        employee_id=employee.id,
        campaign_id=campaign.id,
        result_id=result.id,
        failure_type=await _failure_type(db, campaign),
        status=RemediationStatus.ASSIGNED,
        assigned_at=now,
        deadline=deadline,
        notified_at=now,
    )
    db.add(remediation)
    await db.flush()
    await _deliver_notification(db, campaign.org_id, campaign.id, result, employee, deadline)
    db.add(PhishingEvent(
        org_id=campaign.org_id,
        campaign_id=campaign.id,
        result_id=result.id,
        event_type=EventType.REMEDIATION_ASSIGNED,
        event_data={"deadline": deadline.isoformat(), "failure_type": remediation.failure_type},
    ))
    await db.commit()
    logger.info("Assigned remediation to %s (deadline %s)", employee.email, deadline)
    return remediation


async def complete_remediation(db, result: CampaignResult) -> None:
    """Close the open assignment for a result and queue the employee for a
    follow-up simulation in the coming weeks. No-op if nothing was assigned."""
    now = _now()
    remediation = await db.scalar(
        select(Remediation).where(
            Remediation.result_id == result.id,
            Remediation.status == RemediationStatus.ASSIGNED,
        )
    )
    if remediation is None:
        return

    remediation.status = RemediationStatus.COMPLETED
    remediation.completed_at = now
    remediation.follow_up_due_at = now + timedelta(days=FOLLOW_UP_DELAY_DAYS)
    db.add(PhishingEvent(
        org_id=remediation.org_id,
        campaign_id=result.campaign_id,
        result_id=result.id,
        event_type=EventType.FOLLOW_UP_QUEUED,
        event_data={"follow_up_due_at": remediation.follow_up_due_at.isoformat()},
    ))
    await db.commit()
    logger.info("Completed remediation for result %s; follow-up due %s", result.id, remediation.follow_up_due_at)


async def resend_notification(db, remediation: Remediation) -> None:
    """Re-email the training link + deadline for a still-open assignment."""
    result = await db.get(CampaignResult, remediation.result_id)
    employee = await db.get(Employee, remediation.employee_id)
    if result is None or employee is None:
        return
    await _deliver_notification(db, remediation.org_id, remediation.campaign_id, result, employee, remediation.deadline)
    remediation.notified_at = _now()
    await db.commit()
