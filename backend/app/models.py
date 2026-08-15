import enum
import uuid

from sqlalchemy import (
    Boolean, Column, DateTime, Enum, Float, ForeignKey, Integer,
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
    TRAINING_COMPLETED = "training_completed"
    REMEDIATION_ASSIGNED = "remediation_assigned"
    FOLLOW_UP_QUEUED = "follow_up_queued"


class RemediationStatus(str, enum.Enum):
    ASSIGNED = "assigned"
    COMPLETED = "completed"
    EXPIRED = "expired"


class TrainingStatus(str, enum.Enum):
    STARTED = "started"
    IN_PROGRESS = "in_progress"
    QUIZ_REQUIRED = "quiz_required"
    COMPLETED = "completed"
    INVALID = "invalid"


class User(Base):
    __tablename__ = "users"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id = Column(Uuid, ForeignKey("organizations.id"), nullable=False)
    email = Column(String(255), nullable=False)
    first_name = Column(String(100))  # display name for the avatar menu
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
    employee_count = Column(Integer, nullable=True)  # declared seat count from signup
    subscription_tier = Column(
        Enum(SubscriptionTier, values_callable=_enum_values),
        default=SubscriptionTier.FREE,
    )
    # Departments/leave employees should be excluded from testing (e.g. staff
    # on medical/maternity leave) — see risk_scoring.is_eligible_for_campaign
    excluded_employee_ids = Column(JSON, default=list)
    trial_ends_at = Column(DateTime(timezone=True), nullable=True)  # null = not on trial
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    employees = relationship("Employee", back_populates="organization", cascade="all, delete-orphan")
    users = relationship("User", back_populates="organization", cascade="all, delete-orphan")
    campaigns = relationship("Campaign", back_populates="organization", cascade="all, delete-orphan")
    payment_orders = relationship("PaymentOrder", back_populates="organization", cascade="all, delete-orphan")


class PaymentOrder(Base):
    """An eSewa ePay attempt for a subscription plan. `transaction_uuid` is the
    unique id sent to eSewa and echoed back by their callbacks + status API,
    which is how a browser redirect is matched back to an org."""
    __tablename__ = "payment_orders"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id = Column(Uuid, ForeignKey("organizations.id"), nullable=False, index=True)
    plan = Column(String(50), nullable=False)
    amount = Column(Integer, nullable=False)  # total NPR due
    transaction_uuid = Column(String(100), unique=True, nullable=False, index=True)
    status = Column(String(20), default="pending")  # pending | complete | failed
    transaction_code = Column(String(100))
    ref_id = Column(String(100))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True))

    organization = relationship("Organization", back_populates="payment_orders")


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
    # Optional DKIM signing for this profile's domain. `dkim_private_key_encrypted`
    # is encrypted at rest like the SMTP password. When set, outbound mail is
    # signed so receivers authenticate it (the core "lands in the inbox, not
    # spam" lever). Falls back to the global DKIM_* env config when empty.
    dkim_selector = Column(String(128), default="")
    dkim_domain = Column(String(255), default="")
    dkim_private_key_encrypted = Column(Text)
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


class Remediation(Base):
    """A KnowBe4-style remediation assignment.

    Created the moment an employee clicks a simulated phish: the employee is
    auto-enrolled in the org's remediation group, an email with a direct
    training link + deadline goes out, and once they complete the lesson they
    are queued for a follow-up simulation in the coming weeks. `status` is a
    cached snapshot; admin read endpoints also treat an overdue ASSIGNED row
    as expired for the queue view."""
    __tablename__ = "remediations"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id = Column(Uuid, ForeignKey("organizations.id"), nullable=False, index=True)
    employee_id = Column(Uuid, ForeignKey("employees.id"), nullable=False, index=True)
    campaign_id = Column(Uuid, ForeignKey("campaigns.id"), nullable=False)
    result_id = Column(Uuid, ForeignKey("campaign_results.id"), nullable=False)
    failure_type = Column(String(100), nullable=False)
    status = Column(
        Enum(RemediationStatus, values_callable=_enum_values),
        default=RemediationStatus.ASSIGNED,
    )
    assigned_at = Column(DateTime(timezone=True), nullable=False)
    deadline = Column(DateTime(timezone=True), nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    notified_at = Column(DateTime(timezone=True), nullable=True)

    # Follow-up retest: when the retest is due, and which campaign/result
    # actually retested the employee (set by dispatch_campaign).
    follow_up_due_at = Column(DateTime(timezone=True), nullable=True)
    follow_up_campaign_id = Column(Uuid, ForeignKey("campaigns.id"), nullable=True)
    follow_up_result_id = Column(Uuid, ForeignKey("campaign_results.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    employee = relationship("Employee")
    campaign = relationship("Campaign", foreign_keys=[campaign_id])
    follow_up_campaign = relationship("Campaign", foreign_keys=[follow_up_campaign_id])


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


class TrainingModule(Base):
    """A remediation lesson. org_id NULL = global library module seeded by the
    platform (available to every tenant); non-null = a tenant's own lesson.

    Every lesson is authored in both English and Nepali so the employee can
    pick the medium (watch a video / listen to audio) and the language."""
    __tablename__ = "training_modules"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id = Column(Uuid, ForeignKey("organizations.id"), nullable=True)
    title = Column(String(255), nullable=False)
    title_ne = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    description_ne = Column(Text, nullable=False)
    failure_type = Column(String(100), nullable=False)  # matches the risk being remediated
    video_url_en = Column(String(512), nullable=False)
    video_url_ne = Column(String(512), nullable=False)
    audio_url_en = Column(String(512), nullable=True)
    audio_url_ne = Column(String(512), nullable=True)
    duration_seconds = Column(Integer, default=180)  # nominal reference length
    pass_score = Column(Integer, default=80)          # required quiz score (0-100)
    key_points_en = Column(JSON, default=list)        # teaching bullets shown during playback
    key_points_ne = Column(JSON, default=list)
    is_active = Column(Boolean, default=True)
    version = Column(Integer, default=1)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    questions = relationship("TrainingQuestion", back_populates="module", cascade="all, delete-orphan")


class TrainingQuestion(Base):
    """A question attached to a lesson. checkpoint_after_seconds set = an
    interactive checkpoint that pauses playback mid-lesson and must be answered
    correctly to continue; NULL = part of the final assessment quiz."""
    __tablename__ = "training_questions"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    module_id = Column(Uuid, ForeignKey("training_modules.id"), nullable=False)
    prompt = Column(Text, nullable=False)
    prompt_ne = Column(Text, nullable=False)
    options = Column(JSON, nullable=False)             # list[str]
    correct_index = Column(Integer, nullable=False)
    checkpoint_after_seconds = Column(Integer, nullable=True)
    explanation = Column(Text, nullable=False)
    explanation_ne = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    module = relationship("TrainingModule", back_populates="questions")


class TrainingAttempt(Base):
    """The tamper-resistant training record. The browser reports playback, the
    backend decides whether it counts. verified_watch_seconds is a UNION of
    verified segments (not raw video position), so seeking to the end does not
    count as having watched anything."""
    __tablename__ = "training_attempts"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id = Column(Uuid, ForeignKey("organizations.id"), nullable=False)
    employee_id = Column(Uuid, ForeignKey("employees.id"), nullable=False)
    module_id = Column(Uuid, ForeignKey("training_modules.id"), nullable=False)
    campaign_id = Column(Uuid, ForeignKey("campaigns.id"), nullable=True)
    result_id = Column(Uuid, ForeignKey("campaign_results.id"), nullable=True)

    status = Column(Enum(TrainingStatus, values_callable=_enum_values), default=TrainingStatus.STARTED)
    language = Column(String(10), default="en")
    mode = Column(String(10), default="watch")         # watch | listen

    video_duration = Column(Float, nullable=True)      # actual media length reported by client
    verified_watch_seconds = Column(Float, default=0.0)
    completion_percentage = Column(Float, default=0.0)
    watch_segments = Column(JSON, default=list)        # [[start, end], ...] union of verified time
    checkpoints = Column(JSON, default=list)           # [{question_id, passed, attempts}]
    quiz_score = Column(Integer, nullable=True)
    quiz_passed = Column(Boolean, default=False)
    invalid_flags = Column(JSON, default=list)         # ["tab-hidden", "seek-forward", ...]
    session_id = Column(String(64), nullable=True)     # single active playback session
    last_position = Column(Float, default=0.0)

    started_at = Column(DateTime(timezone=True), server_default=func.now())
    last_activity_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class PlaybackEvent(Base):
    """Append-only audit trail of every playback action per attempt."""
    __tablename__ = "playback_events"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    attempt_id = Column(Uuid, ForeignKey("training_attempts.id"), nullable=False)
    event_type = Column(String(50), nullable=False)    # heartbeat, seek, tab-hidden, checkpoint, quiz...
    position = Column(Float, default=0.0)
    client_ts = Column(Float, nullable=True)           # client clock (informational only)
    event_data = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
