import enum
import uuid

from sqlalchemy import (
    Boolean, Column, DateTime, Enum, ForeignKey, Integer,
    JSON, String, Text, Uuid, UniqueConstraint, func
)
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


def _enum_values(enum_cls):
    """Store enum by `.value` (works on both SQLite and Postgres)."""
    return [member.value for member in enum_cls]


class SubscriptionTier(str, enum.Enum):
    FREE = "free"
    STARTER = "starter"
    GROWTH = "growth"
    ENTERPRISE = "enterprise"


class CampaignStatus(str, enum.Enum):
    DRAFT = "draft"
    SCHEDULED = "scheduled"
    ACTIVE = "active"
    COMPLETED = "completed"


class EventType(str, enum.Enum):
    SENT = "sent"
    OPENED = "opened"
    CLICKED = "clicked"
    SUBMITTED = "submitted"
    REPORTED = "reported"


class User(Base):
    __tablename__ = "users"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id = Column(Uuid, ForeignKey("organizations.id"), nullable=False)
    email = Column(String(255), nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(50), default="organization_admin")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    organization = relationship("Organization", back_populates="users")

    __table_args__ = (UniqueConstraint("org_id", "email", name="uq_user_org_email"),)


class Organization(Base):
    __tablename__ = "organizations"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    domain = Column(String(255), unique=True, nullable=False)  # verified via DNS TXT
    slug = Column(String(100), unique=True, nullable=False)
    subscription_tier = Column(
        Enum(SubscriptionTier, values_callable=_enum_values),
        default=SubscriptionTier.FREE,
    )
    # Departments/leave employees should be excluded from testing (e.g. staff
    # on medical/maternity leave) — see risk_scoring.is_eligible_for_campaign
    excluded_employee_ids = Column(JSON, default=list)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    employees = relationship("Employee", back_populates="organization", cascade="all, delete-orphan")
    users = relationship("User", back_populates="organization", cascade="all, delete-orphan")
    campaigns = relationship("Campaign", back_populates="organization", cascade="all, delete-orphan")


class Employee(Base):
    __tablename__ = "employees"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id = Column(Uuid, ForeignKey("organizations.id"), nullable=False)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    email = Column(String(255), nullable=False)
    department = Column(String(100))
    hire_date = Column(DateTime(timezone=True))
    on_leave = Column(Boolean, default=False)  # excluded from campaigns while true
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    organization = relationship("Organization", back_populates="employees")

    __table_args__ = (UniqueConstraint("org_id", "email", name="uq_employee_org_email"),)


class PhishingTemplate(Base):
    """org_id NULL = global library template every tenant can use. Non-null
    = a tenant's own private template. Educational fiction only — never a
    live clone of an unrelated third party's product."""
    __tablename__ = "phishing_templates"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id = Column(Uuid, ForeignKey("organizations.id"), nullable=True)
    name = Column(String(255), nullable=False)         # e.g. "Pending Invoice"
    category = Column(String(100))                      # "Finance", "Internal IT", "HR"
    subject_line = Column(String(255), nullable=False)
    html_body = Column(Text, nullable=False)
    difficulty_level = Column(Integer, default=2)        # 1-5
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class SendingProfile(Base):
    """Per-org SMTP sending configuration. When a campaign references one, its
    relay settings override the global SIMULATE_EMAILS/SMTP_* env config.
    The password is encrypted at rest (see security.encrypt_secret)."""
    __tablename__ = "sending_profiles"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id = Column(Uuid, ForeignKey("organizations.id"), nullable=False)
    name = Column(String(255), nullable=False)
    host = Column(String(255), default="")
    port = Column(Integer, default=587)
    username = Column(String(255))
    password_encrypted = Column(String(512))
    from_name = Column(String(255))
    from_email = Column(String(255), default="")
    use_tls = Column(Boolean, default=False)
    # Per-profile simulation flag: True records to the outbox only, False sends
    # for real through `host`.
    simulate = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    organization = relationship("Organization")


class Campaign(Base):
    __tablename__ = "campaigns"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id = Column(Uuid, ForeignKey("organizations.id"), nullable=False)
    template_id = Column(Uuid, ForeignKey("phishing_templates.id"), nullable=False)
    sending_profile_id = Column(Uuid, ForeignKey("sending_profiles.id"), nullable=True)
    name = Column(String(255), nullable=False)
    target_departments = Column(JSON, default=list)      # ["Finance", "HR"] or ["All"]
    scheduled_start = Column(DateTime(timezone=True), nullable=False)
    status = Column(
        Enum(CampaignStatus, values_callable=_enum_values),
        default=CampaignStatus.DRAFT,
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    organization = relationship("Organization", back_populates="campaigns")
    results = relationship("CampaignResult", back_populates="campaign", cascade="all, delete-orphan")


class CampaignResult(Base):
    """No org_id here on purpose — tenancy is inherited through campaign_id.
    Note what's absent: no password/credential field. is_submitted records
    INTENT only."""
    __tablename__ = "campaign_results"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    campaign_id = Column(Uuid, ForeignKey("campaigns.id"), nullable=False)
    employee_id = Column(Uuid, ForeignKey("employees.id"), nullable=False)
    tracking_token = Column(Uuid, unique=True, default=uuid.uuid4, nullable=False)

    is_delivered = Column(Boolean, default=False)
    is_opened = Column(Boolean, default=False)
    is_clicked = Column(Boolean, default=False)
    is_submitted = Column(Boolean, default=False)  # they hit "submit" — no payload stored
    is_reported = Column(Boolean, default=False)   # employee flagged the email as phish
    training_completed = Column(Boolean, default=False)
    training_completed_at = Column(DateTime(timezone=True), nullable=True)
    reported_at = Column(DateTime(timezone=True), nullable=True)

    ip_address = Column(String(45), nullable=True)
    user_agent = Column(Text, nullable=True)
    opened_at = Column(DateTime(timezone=True), nullable=True)
    clicked_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    campaign = relationship("Campaign", back_populates="results")
    employee = relationship("Employee")


class OutboxMessage(Base):
    """Simulated email outbox. In a production deployment EmailProvider.send()
    would hand off to SES/Postmark/SendGrid instead of inserting here; keeping
    the row makes the training pipeline observable end-to-end without real
    email infrastructure."""
    __tablename__ = "outbox_messages"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id = Column(Uuid, ForeignKey("organizations.id"), nullable=False)
    campaign_id = Column(Uuid, ForeignKey("campaigns.id"), nullable=False)
    result_id = Column(Uuid, ForeignKey("campaign_results.id"), nullable=False)
    to_name = Column(String(255))
    to_email = Column(String(255), nullable=False)
    from_name = Column(String(255))
    from_email = Column(String(255))
    subject = Column(String(255), nullable=False)
    html_body = Column(Text, nullable=False)
    tracking_token = Column(Uuid, unique=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class PhishingEvent(Base):
    """Append-only audit log of every simulation step (sent, opened, clicked,
    submitted, reported). This is the source of truth for reporting; the
    boolean flags on CampaignResult are a cached snapshot of the latest state.
    Rows are only ever inserted, never updated or deleted."""
    __tablename__ = "phishing_events"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id = Column(Uuid, ForeignKey("organizations.id"), nullable=False)
    campaign_id = Column(Uuid, ForeignKey("campaigns.id"), nullable=False)
    result_id = Column(Uuid, ForeignKey("campaign_results.id"), nullable=False)
    event_type = Column(Enum(EventType, values_callable=_enum_values), nullable=False)
    ip_address = Column(String(45))
    user_agent = Column(Text)
    event_data = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
