"""Seed a fully-populated demo workspace.

Run once:
    cd backend && venv/bin/python seed.py

Creates: global phishing-template library, a demo org (slug: demo-org) with
an admin login, ~16 employees, one completed historical campaign (so the
dashboard/charts have real shape), one live campaign, and one draft.

Demo login:
    org slug: demo-org
    email:    admin@demo.com
    password: demo1234

All templates are generic/fictional educational material — never a clone of a
real brand's product.
"""

import asyncio
import random
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.core.security import encrypt_secret, hash_password
from app.database import SessionLocal, engine
from app.models import (
    Base, Campaign, CampaignResult, CampaignStatus, Employee, EventType,
    Organization, OutboxMessage, PhishingEvent, PhishingTemplate,
    SendingProfile, SubscriptionTier, User,
)
from app.tasks import _inject_tracking

random.seed(42)


def _days_ago(days: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days)


def _wrap(title: str, body_html: str, red_flags: list[str]) -> str:
    flags = "".join(
        f'<li style="margin:2px 0">{f}</li>' for f in red_flags
    )
    return f"""
<div style="background:#f5f6f8;padding:24px;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e4e7eb">
    <div style="padding:20px 28px;background:#0f172a;color:#ffffff;font-weight:bold">{title}</div>
    <div style="padding:28px;color:#334155;font-size:14px;line-height:1.7">{body_html}</div>
    <div style="padding:18px 28px;background:#f8fafc;border-top:1px solid #e4e7eb;color:#94a3b8;font-size:12px">
      This is an automated notification from the {title.split(' ')[0]} team. Do not reply to this email.<br/><br/>
      <div style="font-size:11px;color:#cbd5e1;margin-top:4px">
        Security awareness simulation — red flags trained: <ul style="margin:6px 0 0 16px">{flags}</ul>
      </div>
    </div>
  </div>
</div>
"""


TEMPLATES = [
    {
        "name": "Pending Invoice #INV-44821",
        "category": "Finance",
        "subject_line": "Overdue invoice #INV-44821 — remit payment now",
        "difficulty_level": 2,
        "red_flags": ["Spoofed sender", "Urgency to pay", "Mismatched link domain"],
        "body": """
          <p>Hi,</p>
          <p>Our records show invoice <strong>#INV-44821</strong> for NPR 184,500 remains unpaid.
          Late fees are accruing daily.</p>
          <p>Please review the attached copy and approve payment within 24 hours.</p>
          <p style="margin:20px 0">
            <a href="{{TRACKING_LINK}}" style="background:#b91c1c;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">View &amp; pay invoice now</a>
          </p>
          <p>Accounts Receivable<br/>Acme Suppliers</p>
        """,
    },
    {
        "name": "Shared Document: Q3 Budget.xlsx",
        "category": "Collaboration",
        "subject_line": "[Shared] Q3 Budget.xlsx was shared with you",
        "difficulty_level": 3,
        "red_flags": ["Unexpected external sender", "Click here to view", "Generic greeting"],
        "body": """
          <p>Hi there,</p>
          <p>Anirudh shared the document <strong>Q3 Budget.xlsx</strong> with you via CloudDocs.</p>
          <p>Click below to open it in your browser.</p>
          <p style="margin:20px 0">
            <a href="{{TRACKING_LINK}}" style="background:#1d4ed8;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">Open document</a>
          </p>
          <p>— CloudDocs notifications</p>
        """,
    },
    {
        "name": "Password expires in 24 hours",
        "category": "Internal IT",
        "subject_line": "Action required: your password expires in 24 hours",
        "difficulty_level": 1,
        "red_flags": ["Threat of account lockout", "Fake IT department", "Unknown link"],
        "body": """
          <p>Dear user,</p>
          <p>Your network password will <strong>expire in 24 hours</strong>. If you do not update it, your
          mailbox will be locked and you will lose access to shared drives.</p>
          <p style="margin:20px 0">
            <a href="{{TRACKING_LINK}}" style="background:#0f766e;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">Keep my password</a>
          </p>
          <p>IT Service Desk</p>
        """,
    },
    {
        "name": "New HR Policy: Remote Work Update",
        "category": "HR",
        "subject_line": "IMPORTANT: Updated remote-work policy for all staff",
        "difficulty_level": 3,
        "red_flags": ["Unexpected attachment", "High-stakes subject", "Requests credentials to 'sign'"],
        "body": """
          <p>Hello,</p>
          <p>Following the latest board review, the <strong>Remote Work Policy v3.1</strong> is now effective.
          All staff must acknowledge the policy by the end of the week.</p>
          <p style="margin:20px 0">
            <a href="{{TRACKING_LINK}}" style="background:#1d4ed8;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">Review &amp; sign policy</a>
          </p>
          <p>HR Administration</p>
        """,
    },
    {
        "name": "Package delivery failed",
        "category": "Delivery",
        "subject_line": "Your parcel could not be delivered — reschedule now",
        "difficulty_level": 2,
        "red_flags": ["Unsolicited sender", "Tracking number to a fake page", "Urgent reschedule"],
        "body": """
          <p>Hello,</p>
          <p>We attempted to deliver your parcel (tracking <strong>PKT-88219</strong>) but the address was
          incomplete. Parcels are returned after 48 hours.</p>
          <p style="margin:20px 0">
            <a href="{{TRACKING_LINK}}" style="background:#b45309;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">Reschedule delivery</a>
          </p>
          <p>FastPost Courier</p>
        """,
    },
    {
        "name": "Re: Meeting invite — urgent reschedule",
        "category": "Collaboration",
        "subject_line": "Re: Kickoff meeting moved to today — RSVP required",
        "difficulty_level": 4,
        "red_flags": ["Reply-snooping thread", "Inconsistent sender name", "Asks for OTP later in thread"],
        "body": """
          <p>Hi,</p>
          <p>I've had to pull today's kickoff forward. Several stakeholders are already on the call —
          can you jump in?</p>
          <p>Since the calendar invite glitched, use this link:</p>
          <p style="margin:20px 0">
            <a href="{{TRACKING_LINK}}" style="background:#6d28d9;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">Join the call now</a>
          </p>
          <p>Thanks,<br/>— R (acting lead)</p>
        """,
    },
    {
        "name": "Benefit enrollment closing soon",
        "category": "HR",
        "subject_line": "Final reminder: benefit enrollment window closes Friday",
        "difficulty_level": 2,
        "red_flags": ["Generic personalisation", "Deadline pressure", "Link to non-corporate domain"],
        "body": """
          <p>Hello,</p>
          <p>If you have not yet enrolled in your 2026 benefits, please do so before the window closes on
          <strong>Friday</strong>. Unenrolled staff will be defaulted to the base plan.</p>
          <p style="margin:20px 0">
            <a href="{{TRACKING_LINK}}" style="background:#1e40af;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">Enroll now</a>
          </p>
          <p>People Operations</p>
        """,
    },
    {
        "name": "Failed sign-in attempt alert",
        "category": "Internal IT",
        "subject_line": "Alert: failed sign-in from an unknown device",
        "difficulty_level": 4,
        "red_flags": ["Security fear-mongering", "Phone number to call", "Asks to confirm password"],
        "body": """
          <p>Dear user,</p>
          <p>We blocked a sign-in attempt from <strong>89.160.12.34 (Kathmandu, NP)</strong> at 03:12 today.
          If this was not you, you must secure your account immediately.</p>
          <p style="margin:20px 0">
            <a href="{{TRACKING_LINK}}" style="background:#991b1b;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">Review activity &amp; secure account</a>
          </p>
          <p>Account Security Team</p>
        """,
    },
    {
        "name": "Tax refund pending",
        "category": "Finance",
        "subject_line": "Refund NPR 24,380 is waiting — claim before the deadline",
        "difficulty_level": 3,
        "red_flags": ["Unexpected windfall", "Requests banking details", "Short window"],
        "body": """
          <p>Good day,</p>
          <p>Based on your previous filings you are eligible for a tax refund of <strong>NPR 24,380</strong>.
          The claim window closes on the 15th.</p>
          <p style="margin:20px 0">
            <a href="{{TRACKING_LINK}}" style="background:#15803d;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">Claim refund</a>
          </p>
          <p>Revenue Department — Citizen Services</p>
        """,
    },
]


EMPLOYEES = [
    ("Ramesh", "Shrestha", "Finance"),
    ("Sunita", "Karki", "Operations"),
    ("Prakash", "Gurung", "Finance"),
    ("Anita", "Thapa", "HR"),
    ("Nisha", "Rai", "Customer Service"),
    ("Bikash", "Adhikari", "IT"),
    ("Priya", "Sharma", "Engineering"),
    ("Dipesh", "Tamang", "Finance"),
    ("Gita", "Maharjan", "Operations"),
    ("Suman", "Joshi", "Engineering"),
    ("Kiran", "Basnet", "Customer Service"),
    ("Manisha", "Poudel", "HR"),
    ("Rajesh", "Khadka", "IT"),
    ("Luna", "Shrestha", "Operations"),
    ("Anil", "Magar", "Engineering"),
    ("Sabina", "Lama", "Finance"),
]


def _persona(department: str) -> tuple[float, float]:
    """(open_likelihood, click_likelihood) by department — makes Finance the
    most-targeted/weakest and Engineering/IT the strongest, matching the
    original fixture data's shape."""
    table = {
        "Finance": (0.98, 0.42),
        "Operations": (0.95, 0.30),
        "HR": (0.92, 0.24),
        "Customer Service": (0.90, 0.20),
        "IT": (0.85, 0.10),
        "Engineering": (0.82, 0.08),
    }
    return table.get(department, (0.9, 0.2))


async def _seed():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    async with SessionLocal() as db:
        org = Organization(
            name="Acme Corp Pvt. Ltd.",
            domain="acme.local",
            slug="demo-org",
            subscription_tier=SubscriptionTier.FREE,
        )
        db.add(org)
        await db.flush()

        admin = User(
            org_id=org.id,
            email="admin@demo.com",
            first_name="Admin",
            hashed_password=hash_password("demo1234"),
            role="organization_admin",
        )
        db.add(admin)

        # ── Sending profile (simulated relay) ────────────────────────────────
        profile = SendingProfile(
            org_id=org.id,
            name="Simulated Relay (demo)",
            host="",
            port=587,
            username=None,
            from_name="NovaGuard Security",
            from_email="security@novaguard.example",
            use_tls=False,
            simulate=True,
        )
        db.add(profile)
        await db.flush()

        # ── Global template library ──────────────────────────────────────────
        templates = []
        for spec in TEMPLATES:
            template = PhishingTemplate(
                org_id=None,
                name=spec["name"],
                category=spec["category"],
                subject_line=spec["subject_line"],
                html_body=_wrap(spec["name"], spec["body"], spec["red_flags"]),
                difficulty_level=spec["difficulty_level"],
            )
            db.add(template)
            templates.append(template)
        await db.flush()

        # ── Employees ─────────────────────────────────────────────────────────
        employees = []
        for first, last, department in EMPLOYEES:
            employee = Employee(
                org_id=org.id,
                first_name=first,
                last_name=last,
                email=f"{first.lower()}.{last.lower()}@acme.local",
                department=department,
                hire_date=_days_ago(random.randint(180, 2200)),
                on_leave=False,
                is_active=True,
            )
            db.add(employee)
            employees.append(employee)
        await db.flush()

        # ── Historical (completed) campaign: Invoice drill ───────────────────
        invoice_template = templates[0]
        completed = Campaign(
            org_id=org.id,
            template_id=invoice_template.id,
            name="Invoice Drill — March",
            target_departments=["All"],
            scheduled_start=_days_ago(120),
            status=CampaignStatus.COMPLETED,
        )
        db.add(completed)
        await db.flush()

        for employee in employees:
            open_p, click_p = _persona(employee.department)
            opened = random.random() < open_p
            clicked = opened and random.random() < click_p
            submitted = clicked and random.random() < 0.55
            trained = submitted and random.random() < 0.8
            reported = opened and random.random() < 0.22

            opened_at = _days_ago(random.randint(115, 119)) if opened else None
            clicked_at = (
                opened_at + timedelta(minutes=random.randint(2, 180)) if clicked else None
            )
            training_at = (
                clicked_at + timedelta(minutes=random.randint(5, 240)) if trained else None
            )
            reported_at = (
                opened_at + timedelta(minutes=random.randint(1, 90)) if reported else None
            )
            result = CampaignResult(
                campaign_id=completed.id,
                employee_id=employee.id,
                tracking_token=uuid.uuid4(),
                is_delivered=True,
                is_opened=opened,
                is_clicked=clicked,
                is_submitted=submitted,
                is_reported=reported,
                training_completed=trained,
                training_completed_at=training_at,
                reported_at=reported_at,
                opened_at=opened_at,
                clicked_at=clicked_at,
            )
            db.add(result)
            await db.flush()
            db.add(PhishingEvent(org_id=org.id, campaign_id=completed.id, result_id=result.id, event_type=EventType.SENT, created_at=opened_at or _days_ago(119)))
            if opened:
                db.add(PhishingEvent(org_id=org.id, campaign_id=completed.id, result_id=result.id, event_type=EventType.OPENED, created_at=opened_at))
            if clicked:
                db.add(PhishingEvent(org_id=org.id, campaign_id=completed.id, result_id=result.id, event_type=EventType.CLICKED, created_at=clicked_at))
            if reported:
                db.add(PhishingEvent(org_id=org.id, campaign_id=completed.id, result_id=result.id, event_type=EventType.REPORTED, created_at=reported_at))
            if trained:
                db.add(PhishingEvent(org_id=org.id, campaign_id=completed.id, result_id=result.id, event_type=EventType.SUBMITTED, created_at=training_at))

        # ── Live campaign: password-expiry drill, launched 2 days ago ────────
        expiry_template = templates[2]
        live = Campaign(
            org_id=org.id,
            template_id=expiry_template.id,
            name="Password Expiry Awareness",
            target_departments=["All"],
            scheduled_start=_days_ago(2),
            status=CampaignStatus.ACTIVE,
        )
        db.add(live)
        await db.flush()

        for employee in employees:
            opened = random.random() < 0.8
            clicked = opened and random.random() < 0.28
            opened_at = _days_ago(1) + timedelta(hours=random.randint(0, 20)) if opened else None
            clicked_at = (
                opened_at + timedelta(minutes=random.randint(3, 120)) if clicked else None
            )
            tracking_token = uuid.uuid4()
            result = CampaignResult(
                campaign_id=live.id,
                employee_id=employee.id,
                tracking_token=tracking_token,
                is_delivered=True,
                is_opened=opened,
                is_clicked=clicked,
                is_submitted=False,
                training_completed=False,
                opened_at=opened_at,
                clicked_at=clicked_at,
            )
            db.add(result)
            await db.flush()
            sent_at = _days_ago(2) + timedelta(hours=random.randint(0, 8))
            db.add(PhishingEvent(org_id=org.id, campaign_id=live.id, result_id=result.id, event_type=EventType.SENT, created_at=sent_at))
            if opened:
                db.add(PhishingEvent(org_id=org.id, campaign_id=live.id, result_id=result.id, event_type=EventType.OPENED, created_at=opened_at))
            if clicked:
                db.add(PhishingEvent(org_id=org.id, campaign_id=live.id, result_id=result.id, event_type=EventType.CLICKED, created_at=clicked_at))
            db.add(
                OutboxMessage(
                    org_id=org.id,
                    campaign_id=live.id,
                    result_id=result.id,
                    to_name=f"{employee.first_name} {employee.last_name}",
                    to_email=employee.email,
                    from_name="NovaGuard Security",
                    from_email="security@novaguard.example",
                    subject=expiry_template.subject_line,
                    html_body=_inject_tracking(expiry_template.html_body, tracking_token),
                    tracking_token=tracking_token,
                    created_at=sent_at,
                )
            )

        # ── Draft campaign ready for the user to launch ─────────────────────
        draft = Campaign(
            org_id=org.id,
            template_id=templates[5].id,
            sending_profile_id=profile.id,
            name="Q3 Collaboration Drill",
            target_departments=["All"],
            scheduled_start=_days_ago(0),
            status=CampaignStatus.DRAFT,
        )
        db.add(draft)

        await db.commit()

    print("Seed complete.")
    print("  org slug : demo-org")
    print("  email    : admin@demo.com")
    print("  password : demo1234")


if __name__ == "__main__":
    asyncio.run(_seed())
