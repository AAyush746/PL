"""
Campaign email dispatch.

Self-contained mode: `EmailProvider.send()` records each rendered message to
the local outbox table (see `OutboxMessage`) so the whole pipeline is
observable end-to-end without real email infrastructure. Real delivery goes
through SMTP (global env config or a per-org SendingProfile), and every
successful step is written to the append-only `PhishingEvent` table.

Deliverability here means the normal, legitimate things only. Nothing in
this module is designed to help a message evade detection as suspicious —
that works directly against the product's purpose, since the whole point is
measuring realistic (not undetectable) susceptibility.
"""

import asyncio
import html as html_module
import logging
import random
import re
import time
import uuid
from datetime import datetime, timezone
from email.message import EmailMessage
from email.utils import formataddr, format_datetime, make_msgid

from aiosmtplib import SMTP
from aiosmtplib.errors import SMTPException
from sqlalchemy import select

from .core.config import get_settings
from .core.security import decrypt_secret
from .database import tenant_session
from .models import (
    Campaign, CampaignResult, CampaignStatus, Employee, EventType,
    Organization, OutboxMessage, PhishingEvent, PhishingTemplate, SendingProfile,
)
from .risk_scoring import is_eligible_for_campaign

logger = logging.getLogger(__name__)
settings = get_settings()

CAMPAIGN_FROM_NAME = "NovaGuard Security"
CAMPAIGN_FROM_EMAIL = "security@novaguard.example"


class EmailProvider:
    """Sends campaign emails.

    Configuration comes from either a per-org `SendingProfile` (when a
    campaign references one) or the global env settings. In simulated mode a
    message is recorded to the local outbox table so the pipeline is
    observable without email infrastructure; in real mode it is additionally
    delivered over SMTP, and only a successful send is recorded as delivered.
    """

    def __init__(self, profile: SendingProfile | None = None):
        self.profile = profile
        self.simulate = profile.simulate if profile is not None else settings.SIMULATE_EMAILS
        self._client: SMTP | None = None

    # ── Config resolution (profile overrides global env) ───────────────────

    def _relay(self) -> tuple[str, int, str | None, str | None, bool]:
        """(host, port, username, password, use_tls) from profile or env."""
        if self.profile is not None:
            password = (
                decrypt_secret(self.profile.password_encrypted)
                if self.profile.password_encrypted else None
            )
            return (
                self.profile.host or "",
                self.profile.port or 587,
                self.profile.username,
                password,
                self.profile.use_tls or False,
            )
        return (
            settings.SMTP_HOST,
            settings.SMTP_PORT,
            settings.SMTP_USERNAME,
            settings.SMTP_PASSWORD,
            settings.SMTP_USE_TLS,
        )

    def _from(self) -> tuple[str, str]:
        if self.profile is not None:
            return (
                self.profile.from_name or CAMPAIGN_FROM_NAME,
                self.profile.from_email or CAMPAIGN_FROM_EMAIL,
            )
        return (
            settings.SMTP_FROM_NAME or CAMPAIGN_FROM_NAME,
            settings.SMTP_FROM_EMAIL or CAMPAIGN_FROM_EMAIL,
        )

    # ── SMTP connection (created once, reused for the whole dispatch) ──────

    async def _smtp_client(self) -> SMTP:
        if self._client is not None:
            return self._client
        host, port, username, password, use_tls = self._relay()
        if not host:
            raise RuntimeError("no SMTP relay configured")
        client = SMTP(
            hostname=host,
            port=port,
            timeout=settings.SMTP_TIMEOUT,
            use_tls=use_tls,
        )
        await client.connect()
        if not use_tls:
            try:
                await client.starttls()
            except SMTPException as exc:
                if username:
                    raise  # never send credentials in the clear
                logger.warning(
                    "SMTP server %s:%s does not support STARTTLS (%s); continuing without TLS",
                    host,
                    port,
                    exc,
                )
        if username:
            await client.login(username, password or "")
        self._client = client
        return client

    async def close(self) -> None:
        if self._client is not None:
            try:
                await self._client.quit()
            except Exception:
                logger.debug("SMTP quit failed", exc_info=True)
            self._client = None

    # ── Message assembly ───────────────────────────────────────────────────

    @staticmethod
    def _plain_text(html_body: str) -> str:
        text = re.sub(r"<style.*?</style>", " ", html_body, flags=re.S | re.I)
        text = re.sub(r"<[^>]+>", " ", text)
        text = html_module.unescape(text)
        return re.sub(r"\s+", " ", text).strip()

    async def _send_via_smtp(self, to_email: str, subject: str, html_body: str, from_name: str, from_email: str) -> None:
        message = EmailMessage()
        message["From"] = formataddr((from_name, from_email))
        message["To"] = to_email
        message["Subject"] = subject
        message["Message-ID"] = make_msgid(domain=from_email.rsplit("@", 1)[-1])
        message["Date"] = format_datetime(datetime.now(timezone.utc))
        message.set_content(self._plain_text(html_body))
        message.add_alternative(html_body, subtype="html")
        client = await self._smtp_client()
        await client.send_message(message)

    # ── Public API used by dispatch_campaign ───────────────────────────────

    async def send(self, session, result: CampaignResult, employee: Employee, template: PhishingTemplate, org_id: str) -> bool:
        html_body = _inject_tracking(template.html_body, result.tracking_token)
        from_name, from_email = self._from()

        if not self.simulate:
            host, *_ = self._relay()
            if not host:
                logger.error(
                    "Real delivery requested but no SMTP relay is configured — falling back to simulated send for %s",
                    employee.email,
                )
            else:
                try:
                    await self._send_via_smtp(employee.email, template.subject_line, html_body, from_name, from_email)
                except Exception:
                    logger.exception("SMTP delivery failed for %s (result %s)", employee.email, result.id)
                    return False

        message = OutboxMessage(
            org_id=org_id,
            campaign_id=result.campaign_id,
            result_id=result.id,
            to_name=f"{employee.first_name} {employee.last_name}",
            to_email=employee.email,
            from_name=from_name,
            from_email=from_email,
            subject=template.subject_line,
            html_body=html_body,
            tracking_token=result.tracking_token,
        )
        session.add(message)
        result.is_delivered = True
        return True


async def _pace_send(domain: str, last_by_domain: dict[str, float]) -> None:
    """Per-domain rate limiting + jitter so a receiving mail server isn't
    flooded the instant a campaign launches."""
    gap = 60.0 / max(1, settings.SEND_RATE_PER_MINUTE)
    now = time.monotonic()
    last = last_by_domain.get(domain, 0.0)
    wait = last + gap - now
    if wait > 0:
        await asyncio.sleep(wait)
    last_by_domain[domain] = time.monotonic()
    if settings.SEND_JITTER_MAX_SECONDS > 0:
        await asyncio.sleep(random.uniform(0, settings.SEND_JITTER_MAX_SECONDS))


async def dispatch_campaign(campaign_id: str, org_id: str) -> int:
    """Creates a CampaignResult (with tracking token) per eligible employee,
    renders each simulated email into the outbox, sends it through the
    campaign's relay when configured, records a `sent` event per recipient,
    and marks the campaign active. Returns the number of recipients."""
    async with tenant_session(org_id) as session:
        campaign = await session.get(Campaign, uuid.UUID(str(campaign_id)))
        if campaign is None:
            raise ValueError("Campaign not found")
        org = await session.get(Organization, uuid.UUID(str(org_id)))
        if org is None:
            raise ValueError("Organization not found")

        profile = None
        if campaign.sending_profile_id is not None:
            profile = await session.get(SendingProfile, campaign.sending_profile_id)
            if profile is None:
                raise ValueError("Sending profile not found")

        dept_filter = campaign.target_departments or ["All"]
        stmt = select(Employee).where(Employee.org_id == campaign.org_id, Employee.is_active == True)  # noqa: E712
        employees = (await session.execute(stmt)).scalars().all()

        provider = EmailProvider(profile)
        recipients = 0
        last_by_domain: dict[str, float] = {}
        try:
            for employee in employees:
                if "All" not in dept_filter and employee.department not in dept_filter:
                    continue
                if not is_eligible_for_campaign(employee, org):
                    continue

                result = CampaignResult(campaign_id=campaign.id, employee_id=employee.id)
                session.add(result)
                await session.flush()

                template = await session.get(PhishingTemplate, campaign.template_id)
                if template is None:
                    continue
                if not provider.simulate:
                    await _pace_send(employee.email.rsplit("@", 1)[-1].lower(), last_by_domain)

                delivered = await provider.send(session, result, employee, template, org.id)
                if delivered:
                    recipients += 1
                    session.add(
                        PhishingEvent(
                            org_id=org.id,
                            campaign_id=campaign.id,
                            result_id=result.id,
                            event_type=EventType.SENT,
                        )
                    )
                else:
                    await session.delete(result)
        finally:
            await provider.close()

        if recipients:
            campaign.status = CampaignStatus.ACTIVE
            campaign.scheduled_start = campaign.scheduled_start or datetime.now(timezone.utc)
        await session.commit()

    logger.info("Dispatched campaign %s to %d employees", campaign_id, recipients)
    return recipients


def _inject_tracking(html_body: str, tracking_token) -> str:
    pixel = (
        f'<img src="{settings.API_BASE_URL}/track/open/{tracking_token}" '
        f'width="1" height="1" alt="" />'
    )
    body = html_body.replace(
        "{{TRACKING_LINK}}", f"{settings.API_BASE_URL}/track/click/{tracking_token}"
    )
    return body + pixel


TEST_SUBJECT = "Test message from CyberSafe Nepal"
TEST_BODY = (
    "<html><body>"
    "<h3>This is a test message from your CyberSafe Nepal sender profile.</h3>"
    "<p>If you are reading this, the relay settings are working. "
    "No tracking is attached to this message.</p>"
    "</body></html>"
)


async def send_test_email(profile: SendingProfile, to_email: str) -> None:
    """Delivers (or simulates) a single plain test message through a profile.
    Used by the sending-profiles UI to verify credentials before launching a
    campaign."""
    provider = EmailProvider(profile)
    try:
        if not provider.simulate:
            host, *_ = provider._relay()
            if not host:
                raise ValueError("no SMTP relay configured")
            await provider._send_via_smtp(to_email, TEST_SUBJECT, TEST_BODY, *provider._from())
    finally:
        await provider.close()
