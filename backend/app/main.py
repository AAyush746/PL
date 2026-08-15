import csv
import io
import re
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from . import analytics, esewa, remediation as remediation_helpers, tracking, training
from .core.config import get_settings
from .core.security import UserClaims, create_access_token, decode_token, encrypt_secret, hash_password, verify_password
from .database import get_db_for_request, get_public_db
from .models import (
    Base, Campaign, CampaignResult, CampaignStatus, Employee, Organization,
    OutboxMessage, PaymentOrder, PhishingEvent, PhishingTemplate, Remediation,
    RemediationStatus, SendingProfile, SubscriptionTier, TrainingAttempt,
    TrainingModule, TrainingQuestion, TrainingStatus, User,
)
from .schemas import (
    CampaignCreateRequest,
    CampaignDetail,
    CampaignRead,
    CampaignResultRead,
    DepartmentRead,
    EmployeeCreateRequest,
    EmployeeImportRequest,
    EmployeeRead,
    EmployeeUpdateRequest,
    EsewaInitiateRequest,
    EsewaInitiateResponse,
    EventRead,
    MeRead,
    OrgSummary,
    OutboxMessageRead,
    PayRequest,
    RemediationRead,
    SendingProfileCreateRequest,
    SendingProfileRead,
    SendingProfileTestRequest,
    SendingProfileUpdateRequest,
    TemplateCreateRequest,
    TemplateRead,
    TokenResponse,
)
from .tasks import dispatch_campaign, send_test_email

settings = get_settings()

# Developer / platform admin — full visibility, paywall bypassed. Used by the
# developer to design the dashboard without a paid subscription.
DEV_ADMIN_EMAIL = "admin@phishloop.dev"
DEV_ADMIN_PASSWORD = "admin1234"


@asynccontextmanager
async def lifespan(_: FastAPI):
    from .database import SessionLocal, engine
    from .training import seed_training_modules

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_migrate_schema)
    await _ensure_dev_admin()
    async with SessionLocal() as db:
        await seed_training_modules(db)
    yield


async def _ensure_dev_admin() -> None:
    """Idempotent: create the developer admin on the demo org if it is missing."""
    from .database import SessionLocal

    async with SessionLocal() as db:
        org = (await db.execute(select(Organization).where(Organization.slug == "demo-org"))).scalars().first()
        if org is None:
            org = Organization(name="Acme Corp Pvt. Ltd.", slug="demo-org", domain="acme.local")
            db.add(org)
            await db.flush()
        existing = (
            await db.execute(select(User).where(User.org_id == org.id, User.email == DEV_ADMIN_EMAIL))
        ).scalars().first()
        if existing is None:
            db.add(
                User(
                    org_id=org.id,
                    email=DEV_ADMIN_EMAIL,
                    first_name="Developer",
                    hashed_password=hash_password(DEV_ADMIN_PASSWORD),
                    role="platform_admin",
                )
            )
            await db.commit()


def _migrate_schema(conn) -> None:
    """create_all() adds new tables but never alters existing ones. Running an
    existing DB through a new version therefore needs a tiny ALTER pass to add
    any new columns that arrived after the original schema."""
    from sqlalchemy import inspect, text

    existing = set(inspect(conn).get_table_names())
    columns_to_add = {
        "campaign_results": [
            ("is_reported", "BOOLEAN NOT NULL DEFAULT FALSE"),
            ("reported_at", "TIMESTAMP WITHOUT TIME ZONE"),
        ],
        "campaigns": [
            ("sending_profile_id", "UUID"),
        ],
        "sending_profiles": [
            ("dkim_selector", "VARCHAR(128) NOT NULL DEFAULT ''"),
            ("dkim_domain", "VARCHAR(255) NOT NULL DEFAULT ''"),
            ("dkim_private_key_encrypted", "TEXT"),
        ],
        "users": [
            ("first_name", "VARCHAR(100)"),
        ],
        "organizations": [
            ("trial_ends_at", "TIMESTAMP WITHOUT TIME ZONE"),
            ("employee_count", "INTEGER"),
        ],
    }
    for table, columns in columns_to_add.items():
        if table not in existing:
            continue
        present = {col["name"] for col in inspect(conn).get_columns(table)}
        for name, definition in columns:
            if name not in present:
                conn.execute(text(f'ALTER TABLE "{table}" ADD COLUMN {name} {definition}'))

    _backfill_first_names(conn)
    _normalize_auth_columns(conn)


def _normalize_auth_columns(conn) -> None:
    """Clean up registration sloppiness that broke logins: org names saved with
    accidental leading/trailing whitespace and emails saved in mixed case."""
    from sqlalchemy import text

    conn.execute(text("UPDATE organizations SET name = TRIM(name) WHERE name <> TRIM(name) OR name IS NULL"))
    conn.execute(text("UPDATE users SET email = LOWER(TRIM(email)) WHERE email <> LOWER(TRIM(email)) OR email IS NULL"))


def _backfill_first_names(conn) -> None:
    """Existing users were created before first_name existed. Derive a display
    name from the email local part so the avatar menu works for old rows."""
    from sqlalchemy import text

    rows = conn.execute(
        text("SELECT id, email FROM users WHERE first_name IS NULL OR first_name = ''")
    ).fetchall()
    for row_id, email in rows:
        local = (email or "").split("@", 1)[0]
        name = local.replace(".", " ").replace("_", " ").strip().title() or "User"
        conn.execute(
            text("UPDATE users SET first_name = :name WHERE id = :id"),
            {"name": name, "id": row_id},
        )


app = FastAPI(title="CyberSafe Nepal API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(tracking.router)
app.include_router(training.router)

# Locally generated lesson videos (see scripts/generate_training_videos.py).
_MEDIA_DIR = Path(__file__).resolve().parent.parent / "media"
_MEDIA_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=str(_MEDIA_DIR)), name="media")


@app.middleware("http")
async def attach_authenticated_user(request: Request, call_next):
    if request.method == "OPTIONS":
        return await call_next(request)
    public_paths = {
        "/api/health",
        "/api/auth/login",
        "/api/auth/register",
        "/api/auth/admin/register",
        "/api/v1/org/pay/esewa/callback",
    }
    if (
        request.url.path.startswith("/track")
        or request.url.path.startswith("/media")
        or request.url.path in public_paths
    ):
        return await call_next(request)

    token = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
    if not token:
        return JSONResponse(status_code=status.HTTP_401_UNAUTHORIZED, content={"detail": "Missing credentials"})

    try:
        request.state.user = decode_token(token)
    except Exception:  # noqa: BLE001 — invalid/expired token
        return JSONResponse(status_code=status.HTTP_401_UNAUTHORIZED, content={"detail": "Invalid or expired token"})
    return await call_next(request)


# ── Auth ────────────────────────────────────────────────────────────────────

def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or "org"


def _display_name_from_email(email: str) -> str:
    local = (email or "").split("@", 1)[0]
    return local.replace(".", " ").replace("_", " ").strip().title() or "User"


async def _me_payload(db: AsyncSession, user: User, org: Organization) -> dict:
    declared = org.employee_count
    if declared:
        employee_count = declared
    else:
        employee_count = (
            await db.execute(
                select(func.count(Employee.id)).where(Employee.org_id == org.id, Employee.is_active == True)  # noqa: E712
            )
        ).scalar() or 0
    return {
        "email": user.email,
        "first_name": user.first_name or _display_name_from_email(user.email),
        "role": user.role,
        "org_name": org.name,
        "org_slug": org.slug,
        "subscription_tier": org.subscription_tier.value,
        "trial_ends_at": org.trial_ends_at,
        "employee_count": int(employee_count or 0),
    }


@app.get("/api/auth/me", response_model=MeRead)
async def me(request: Request, db: AsyncSession = Depends(get_db_for_request)):
    user = await db.get(User, uuid.UUID(str(request.state.user.user_id)))
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    org = await db.get(Organization, user.org_id)
    if org is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    return await _me_payload(db, user, org)


@app.post("/api/auth/login", response_model=TokenResponse)
async def login(payload: dict, db: AsyncSession = Depends(get_public_db)):
    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""
    org_name = (payload.get("org_name") or "").strip()
    if not all([email, password, org_name]):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="org_name, email, and password are required")

    org = (
        await db.execute(select(Organization).where(func.lower(Organization.name) == org_name.lower()))
    ).scalars().first()
    if org is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    user = (
        await db.execute(
            select(User).where(User.org_id == org.id, func.lower(User.email) == email, User.is_active == True)  # noqa: E712
        )
    ).scalars().first()
    if user is None or not verify_password(password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    token = create_access_token(UserClaims(user_id=str(user.id), org_id=str(org.id), role=user.role))
    return {"access_token": token, "token_type": "bearer", "role": user.role}


@app.post("/api/auth/register", response_model=TokenResponse)
async def register(payload: dict, db: AsyncSession = Depends(get_public_db)):
    org_name = (payload.get("org_name") or "").strip()
    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""
    if not all([org_name, email, password]):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="org_name, email, and password are required")

    try:
        employee_count = int(payload.get("employee_count") or 0)
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="employee_count must be a whole number",
        )
    if employee_count < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="employee_count must be zero or a positive number",
        )

    base_slug = _slugify(org_name)
    slug = base_slug
    counter = 1
    while (
        await db.execute(select(Organization).where(Organization.slug == slug))
    ).scalars().first() is not None:
        counter += 1
        slug = f"{base_slug}-{counter}"

    new_org = Organization(
        name=org_name,
        slug=slug,
        domain=f"{slug}.local",
        employee_count=employee_count or None,
    )
    db.add(new_org)
    await db.flush()

    admin = User(
        org_id=new_org.id,
        email=email,
        first_name=_display_name_from_email(email),
        hashed_password=hash_password(password),
        role="organization_admin",
    )
    db.add(admin)
    await db.commit()

    token = create_access_token(UserClaims(user_id=str(admin.id), org_id=str(new_org.id), role=admin.role))
    return {"access_token": token, "token_type": "bearer", "role": admin.role}


@app.post("/api/auth/admin/register", response_model=TokenResponse)
async def register_platform_admin(payload: dict, db: AsyncSession = Depends(get_public_db)):
    """Sign-up for the developer portal. Creates a platform_admin account on the
    demo workspace so the developer can design the dashboard without the
    paywall. Idempotent by email within the org."""
    first_name = (payload.get("first_name") or "").strip().title()
    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""
    if not all([first_name, email, password]):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="first_name, email, and password are required")
    if len(password) < 8:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must be at least 8 characters")

    org = (
        await db.execute(select(Organization).where(Organization.slug == "demo-org"))
    ).scalars().first()
    if org is None:
        org = Organization(name="Acme Corp Pvt. Ltd.", slug="demo-org", domain="acme.local")
        db.add(org)
        await db.flush()

    existing = (
        await db.execute(select(User).where(User.org_id == org.id, User.email == email))
    ).scalars().first()
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An account with this email already exists")

    admin = User(
        org_id=org.id,
        email=email,
        first_name=first_name,
        hashed_password=hash_password(password),
        role="platform_admin",
    )
    db.add(admin)
    await db.commit()

    token = create_access_token(UserClaims(user_id=str(admin.id), org_id=str(org.id), role=admin.role))
    return {"access_token": token, "token_type": "bearer", "role": admin.role}


# ── Organization ────────────────────────────────────────────────────────────

def _org_id(request: Request) -> str:
    return str(request.state.user.org_id)


@app.get("/api/v1/org/summary", response_model=OrgSummary)
async def get_org_summary(request: Request, db: AsyncSession = Depends(get_db_for_request)):
    org_id = _org_id(request)
    org = await db.get(Organization, uuid.UUID(org_id))
    if org is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    employees = (
        await db.execute(select(Employee).where(Employee.org_id == org.id, Employee.is_active == True))  # noqa: E712
    ).scalars().all()
    campaigns = (await db.execute(select(Campaign).where(Campaign.org_id == org.id))).scalars().all()
    results = await analytics.load_all_results(db, org_id)

    active = sum(1 for c in campaigns if c.status != CampaignStatus.COMPLETED)
    completed = len(campaigns) - active
    delivered = sum(1 for r in results if r.is_delivered)
    clicked = sum(1 for r in results if r.is_clicked)
    reported = sum(1 for r in results if r.is_reported)
    trained = sum(1 for r in results if r.training_completed)

    stats = await analytics.employee_risk_by_id(db, org_id)
    risk_score, risk_trend_prev = analytics.org_risk(stats)

    click_rate = round(clicked / delivered * 100, 1) if delivered else 0.0
    report_rate = round(reported / delivered * 100, 1) if delivered else 0.0
    training_rate = round(trained / delivered * 100, 1) if delivered else 0.0

    return {
        "name": org.name,
        "employees": len(employees),
        "active_campaigns": active,
        "completed_campaigns": completed,
        "click_rate": click_rate,
        "report_rate": report_rate,
        "training_completion_rate": training_rate,
        "risk_score": risk_score,
        "risk_trend_prev": risk_trend_prev,
        "subscription_tier": org.subscription_tier.value,
        "trial_ends_at": org.trial_ends_at,
    }


def _luhn_valid(number: str) -> bool:
    total = 0
    digits = [int(d) for d in number if d.isdigit()]
    if len(digits) < 12 or len(digits) > 19:
        return False
    for index, digit in enumerate(reversed(digits)):
        if index % 2 == 1:
            digit *= 2
            if digit > 9:
                digit -= 9
        total += digit
    return total % 10 == 0


def _expiry_valid(expiry: str) -> bool:
    match = re.match(r"^(0[1-9]|1[0-2])/(\d{2})$", expiry)
    if not match:
        return False
    month, year = int(match.group(1)), 2000 + int(match.group(2))
    now = datetime.now(timezone.utc)
    return (year, month) >= (now.year, now.month)


@app.post("/api/v1/org/pay", response_model=MeRead)
async def process_payment(
    payload: PayRequest,
    request: Request,
    db: AsyncSession = Depends(get_db_for_request),
):
    """Validate the card (Luhn + expiry) and, on success, activate the chosen
    subscription plan — unlocking the dashboard for the org's HR."""
    org = await db.get(Organization, uuid.UUID(_org_id(request)))
    if org is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    if not _luhn_valid(payload.card_number):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid card number")
    if not _expiry_valid(payload.expiry):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Card is expired or has an invalid expiry date")
    if not payload.cvc.isdigit():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid CVC")

    org.subscription_tier = SubscriptionTier(payload.plan)
    org.trial_ends_at = None
    await db.commit()

    user = await db.get(User, uuid.UUID(str(request.state.user.user_id)))
    return await _me_payload(db, user, org)


# ── eSewa ePay ───────────────────────────────────────────────────────────────

async def _billable_employee_count(db: AsyncSession, org: Organization) -> int:
    """Seat count used for pricing: the declared signup count, else the number
    of active employees."""
    if org.employee_count:
        return int(org.employee_count)
    return (
        await db.execute(
            select(func.count(Employee.id)).where(Employee.org_id == org.id, Employee.is_active == True)  # noqa: E712
        )
    ).scalar() or 0


@app.post("/api/v1/org/pay/esewa/initiate", response_model=EsewaInitiateResponse)
async def esewa_initiate(
    payload: EsewaInitiateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db_for_request),
):
    """Create a payment order, compute the NPR total, and return the signed
    hidden-form fields the browser must POST to eSewa's hosted checkout."""
    org = await db.get(Organization, uuid.UUID(_org_id(request)))
    if org is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    rate = esewa.PLAN_RATES.get(payload.plan)
    if rate is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Enterprise has custom pricing — contact sales@phishloop.dev",
        )

    total = rate * await _billable_employee_count(db, org)
    if total <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No employees to bill yet — add employees and try again",
        )

    transaction_uuid = esewa.new_transaction_uuid()
    order = PaymentOrder(
        org_id=org.id,
        plan=payload.plan,
        amount=total,
        transaction_uuid=transaction_uuid,
    )
    db.add(order)
    await db.commit()

    return {
        "order_id": str(order.id),
        "action_url": settings.ESEWA_PAYMENT_URL,
        "form": esewa.build_form(total, transaction_uuid),
    }


@app.get("/api/v1/org/pay/esewa/callback")
async def esewa_callback(data: str, db: AsyncSession = Depends(get_public_db)):
    """Public URL eSewa redirects the browser back to. The `data` query param
    holds a base64 JSON body signed by eSewa; on a verified COMPLETE the org's
    plan is activated, then the browser is bounced to the SPA result page."""
    result = "failed"

    try:
        payload = esewa.decode_callback_data(str(data).replace(" ", "+"))
    except Exception:  # noqa: BLE001 — malformed/absent data just means "failed"
        payload = None

    order = None
    if payload is not None:
        rows = await db.execute(
            select(PaymentOrder).where(
                PaymentOrder.transaction_uuid == payload.get("transaction_uuid", "")
            )
        )
        order = rows.scalars().first()

    if order is not None:
        confirmed = await esewa.check_status(order)
        if esewa.approve_callback(payload, confirmed, order.amount):
            org = await db.get(Organization, order.org_id)
            if org is not None:
                org.subscription_tier = SubscriptionTier(order.plan)
                org.trial_ends_at = None
            order.status = "complete"
            order.transaction_code = payload.get("transaction_code") or confirmed.get("ref_id")
            order.ref_id = confirmed.get("ref_id") if confirmed else None
            order.completed_at = datetime.now(timezone.utc)
            await db.commit()
            result = "success"

    if order is not None and order.status != "complete":
        order.status = "failed"
        await db.commit()

    plan = order.plan if order is not None else ""
    return RedirectResponse(f"{settings.FRONTEND_URL}/payment?plan={plan}&result={result}")


# ── Employees ───────────────────────────────────────────────────────────────

@app.get("/api/employees", response_model=list[EmployeeRead])
async def list_employees(request: Request, db: AsyncSession = Depends(get_db_for_request)):
    org_id = uuid.UUID(_org_id(request))
    employees = (
        await db.execute(select(Employee).where(Employee.org_id == org_id, Employee.is_active == True))  # noqa: E712
    ).scalars().all()
    stats = await analytics.employee_risk_by_id(db, str(org_id))
    rows = []
    for employee in employees:
        stat = stats.get(str(employee.id), {})
        rows.append(
            {
                "id": employee.id,
                "first_name": employee.first_name,
                "last_name": employee.last_name,
                "email": employee.email,
                "department": employee.department,
                "hire_date": employee.hire_date,
                "on_leave": employee.on_leave,
                "is_active": employee.is_active,
                "risk_score": stat.get("score"),
                "fails": stat.get("fails", 0),
                "training_completed": stat.get("trained", False),
            }
        )
    return rows


@app.post("/api/employees", response_model=EmployeeRead)
async def create_employee(request: Request, payload: EmployeeCreateRequest, db: AsyncSession = Depends(get_db_for_request)):
    org_id = uuid.UUID(_org_id(request))
    # Deleting an employee is a soft-delete (is_active=False) to preserve
    # campaign history, but the unique (org_id, email) constraint still blocks
    # re-adding. Reactivate the existing row instead of 500-ing on the
    # duplicate, which is the expected UX when re-importing a removed person.
    existing = await db.scalar(
        select(Employee).where(Employee.org_id == org_id, Employee.email == payload.email)
    )
    if existing is not None:
        if not existing.is_active:
            existing.is_active = True
            existing.first_name = payload.first_name
            existing.last_name = payload.last_name
            existing.department = payload.department
            await db.commit()
            await db.refresh(existing)
            return existing
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An employee with this email already exists.",
        )
    employee = Employee(**payload.model_dump(), org_id=org_id)
    db.add(employee)
    await db.commit()
    await db.refresh(employee)
    return employee


@app.patch("/api/employees/{employee_id}", response_model=EmployeeRead)
async def update_employee(
    employee_id: uuid.UUID,
    request: Request,
    payload: EmployeeUpdateRequest,
    db: AsyncSession = Depends(get_db_for_request),
):
    employee = await db.get(Employee, employee_id)
    if employee is None or employee.org_id != uuid.UUID(_org_id(request)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(employee, field, value)
    await db.commit()
    await db.refresh(employee)
    stats = await analytics.employee_risk_by_id(db, str(employee.org_id))
    stat = stats.get(str(employee.id), {})
    return {
        "id": employee.id,
        "first_name": employee.first_name,
        "last_name": employee.last_name,
        "email": employee.email,
        "department": employee.department,
        "hire_date": employee.hire_date,
        "on_leave": employee.on_leave,
        "is_active": employee.is_active,
        "risk_score": stat.get("score"),
        "fails": stat.get("fails", 0),
        "training_completed": stat.get("trained", False),
    }


@app.delete("/api/employees/{employee_id}")
async def delete_employee(employee_id: uuid.UUID, request: Request, db: AsyncSession = Depends(get_db_for_request)):
    employee = await db.get(Employee, employee_id)
    if employee is None or employee.org_id != uuid.UUID(_org_id(request)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    employee.is_active = False
    await db.commit()
    return {"ok": True}


@app.post("/api/employees/import")
async def import_employees(request: Request, payload: EmployeeImportRequest, db: AsyncSession = Depends(get_db_for_request)):
    org_id = uuid.UUID(_org_id(request))
    reader = csv.DictReader(io.StringIO(payload.csv_text.strip()))
    created = []
    errors = []
    for index, row in enumerate(reader, start=1):
        if not row.get("email") or not row.get("first_name") or not row.get("last_name"):
            errors.append({"line": index, "reason": "Missing required columns"})
            continue
        email = row["email"].strip().lower()
        existing = await db.scalar(
            select(Employee).where(Employee.org_id == org_id, Employee.email == email)
        )
        if existing is not None:
            if existing.is_active:
                errors.append({"line": index, "reason": f"Duplicate email already active: {email}"})
                continue
            # Reactivate a previously removed employee instead of failing the
            # unique (org_id, email) constraint.
            existing.is_active = True
            existing.first_name = row["first_name"].strip()
            existing.last_name = row["last_name"].strip()
            existing.department = row.get("department")
            await db.flush()
            created.append(email)
            continue
        employee = Employee(
            first_name=row["first_name"].strip(),
            last_name=row["last_name"].strip(),
            email=email,
            department=row.get("department"),
            is_active=True,
            org_id=org_id,
        )
        db.add(employee)
        try:
            await db.flush()
            created.append(employee.email)
        except Exception as exc:
            await db.rollback()
            errors.append({"line": index, "reason": str(exc)})
    await db.commit()
    return {"created": len(created), "errors": errors}


# ── Departments ─────────────────────────────────────────────────────────────

@app.get("/api/departments", response_model=list[DepartmentRead])
async def list_departments(request: Request, db: AsyncSession = Depends(get_db_for_request)):
    org_id = uuid.UUID(_org_id(request))
    employees = (
        await db.execute(select(Employee).where(Employee.org_id == org_id, Employee.is_active == True))  # noqa: E712
    ).scalars().all()
    return await analytics.department_breakdown(db, str(org_id), employees)


# ── Templates ───────────────────────────────────────────────────────────────

@app.get("/api/templates", response_model=list[TemplateRead])
async def list_templates(request: Request, db: AsyncSession = Depends(get_db_for_request)):
    org_id = uuid.UUID(_org_id(request))
    result = await db.execute(
        select(PhishingTemplate).where(
            (PhishingTemplate.org_id.is_(None)) | (PhishingTemplate.org_id == org_id)
        )
    )
    return result.scalars().all()


@app.post("/api/templates", response_model=TemplateRead)
async def create_template(request: Request, payload: TemplateCreateRequest, db: AsyncSession = Depends(get_db_for_request)):
    template = PhishingTemplate(**payload.model_dump(), org_id=uuid.UUID(_org_id(request)))
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return template


@app.delete("/api/templates/{template_id}")
async def delete_template(template_id: uuid.UUID, request: Request, db: AsyncSession = Depends(get_db_for_request)):
    template = await db.get(PhishingTemplate, template_id)
    if template is None or template.org_id != uuid.UUID(_org_id(request)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    await db.delete(template)
    await db.commit()
    return {"ok": True}


# ── Campaigns ───────────────────────────────────────────────────────────────

async def _campaign_reads(db, campaigns: list[Campaign]) -> list[dict]:
    result_ids = {c.id for c in campaigns}
    results = (
        await db.execute(
            select(CampaignResult).where(CampaignResult.campaign_id.in_(result_ids))
        )
    ).scalars().all()
    template_ids = {c.template_id for c in campaigns}
    templates = (
        await db.execute(select(PhishingTemplate).where(PhishingTemplate.id.in_(template_ids)))
    ).scalars().all()
    template_by_id = {t.id: t for t in templates}

    profile_ids = {c.sending_profile_id for c in campaigns if c.sending_profile_id is not None}
    profiles = (
        await db.execute(select(SendingProfile).where(SendingProfile.id.in_(profile_ids)))
    ).scalars().all()
    profile_by_id = {p.id: p for p in profiles}

    stats_by_campaign: dict[uuid.UUID, dict] = {}
    for result in results:
        stats = stats_by_campaign.setdefault(
            result.campaign_id,
            {"total": 0, "delivered": 0, "opened": 0, "clicked": 0, "submitted": 0, "reported": 0, "trained": 0},
        )
        stats["total"] += 1
        if result.is_delivered:
            stats["delivered"] += 1
        if result.is_opened:
            stats["opened"] += 1
        if result.is_clicked:
            stats["clicked"] += 1
        if result.is_submitted:
            stats["submitted"] += 1
        if result.is_reported:
            stats["reported"] += 1
        if result.training_completed:
            stats["trained"] += 1

    rows = []
    for campaign in campaigns:
        stats = stats_by_campaign.get(
            campaign.id,
            {"total": 0, "delivered": 0, "opened": 0, "clicked": 0, "submitted": 0, "reported": 0, "trained": 0},
        )
        template = template_by_id.get(campaign.template_id)
        profile = profile_by_id.get(campaign.sending_profile_id) if campaign.sending_profile_id else None
        click_rate = round(stats["clicked"] / stats["opened"] * 100, 1) if stats["opened"] else 0.0
        report_rate = round(stats["reported"] / stats["delivered"] * 100, 1) if stats["delivered"] else 0.0
        rows.append(
            {
                "id": campaign.id,
                "template_id": campaign.template_id,
                "template_name": template.name if template else None,
                "sending_profile_id": campaign.sending_profile_id,
                "sending_profile_name": profile.name if profile else None,
                "name": campaign.name,
                "target_departments": campaign.target_departments or ["All"],
                "scheduled_start": campaign.scheduled_start,
                "status": campaign.status,
                "created_at": campaign.created_at,
                "total": stats["total"],
                "delivered": stats["delivered"],
                "opened": stats["opened"],
                "clicked": stats["clicked"],
                "submitted": stats["submitted"],
                "reported": stats["reported"],
                "trained": stats["trained"],
                "click_rate": click_rate,
                "report_rate": report_rate,
            }
        )
    rows.sort(key=lambda r: r["scheduled_start"] or datetime.min, reverse=True)
    return rows


@app.get("/api/campaigns", response_model=list[CampaignRead])
async def list_campaigns(request: Request, db: AsyncSession = Depends(get_db_for_request)):
    org_id = uuid.UUID(_org_id(request))
    campaigns = (
        await db.execute(select(Campaign).where(Campaign.org_id == org_id))
    ).scalars().all()
    return await _campaign_reads(db, campaigns)


@app.post("/api/campaigns", response_model=CampaignRead)
async def create_campaign(request: Request, payload: CampaignCreateRequest, db: AsyncSession = Depends(get_db_for_request)):
    campaign = Campaign(**payload.model_dump(), org_id=uuid.UUID(_org_id(request)))
    db.add(campaign)
    await db.commit()
    await db.refresh(campaign)
    return (await _campaign_reads(db, [campaign]))[0]


@app.get("/api/campaigns/{campaign_id}", response_model=CampaignDetail)
async def get_campaign(
    campaign_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db_for_request),
):
    org_id = uuid.UUID(_org_id(request))
    campaign = await db.get(Campaign, campaign_id)
    if campaign is None or campaign.org_id != org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")

    reads = (await _campaign_reads(db, [campaign]))[0]
    results = (
        await db.execute(select(CampaignResult).where(CampaignResult.campaign_id == campaign.id))
    ).scalars().all()
    employees = (
        await db.execute(
            select(Employee).where(Employee.id.in_([r.employee_id for r in results]))
        )
    ).scalars().all()
    employee_by_id = {e.id: e for e in employees}

    result_rows = []
    for result in results:
        employee = employee_by_id.get(result.employee_id)
        result_rows.append(
            CampaignResultRead(
                id=result.id,
                employee_name=f"{employee.first_name} {employee.last_name}" if employee else "Unknown",
                employee_email=employee.email if employee else "unknown",
                department=employee.department if employee else None,
                is_delivered=result.is_delivered,
                is_opened=result.is_opened,
                is_clicked=result.is_clicked,
                is_submitted=result.is_submitted,
                is_reported=result.is_reported,
                training_completed=result.training_completed,
                opened_at=result.opened_at,
                clicked_at=result.clicked_at,
                training_completed_at=result.training_completed_at,
                reported_at=result.reported_at,
            )
        )
    return {**reads, "results": result_rows}


@app.post("/api/campaigns/{campaign_id}/launch")
async def launch_campaign(campaign_id: uuid.UUID, request: Request, db: AsyncSession = Depends(get_db_for_request)):
    org_id = uuid.UUID(_org_id(request))
    campaign = await db.get(Campaign, campaign_id)
    if campaign is None or campaign.org_id != org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")
    if campaign.status == CampaignStatus.ACTIVE:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Campaign is already active")
    count = await dispatch_campaign(str(campaign_id), str(org_id))
    return {"message": "Campaign launch scheduled", "recipients": count}


@app.get("/api/campaigns/{campaign_id}/export")
async def export_campaign(
    campaign_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db_for_request),
):
    org_id = uuid.UUID(_org_id(request))
    campaign = await db.get(Campaign, campaign_id)
    if campaign is None or campaign.org_id != org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")

    results = (
        await db.execute(select(CampaignResult).where(CampaignResult.campaign_id == campaign.id))
    ).scalars().all()
    employees = (
        await db.execute(
            select(Employee).where(Employee.id.in_([r.employee_id for r in results]))
        )
    ).scalars().all()
    employee_by_id = {e.id: e for e in employees}

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        ["email", "name", "department", "delivered", "opened", "clicked", "submitted", "reported", "training_completed", "opened_at", "clicked_at", "reported_at"]
    )
    for result in results:
        employee = employee_by_id.get(result.employee_id)
        writer.writerow(
            [
                employee.email if employee else "",
                f"{employee.first_name} {employee.last_name}" if employee else "",
                employee.department if employee else "",
                "yes" if result.is_delivered else "no",
                "yes" if result.is_opened else "no",
                "yes" if result.is_clicked else "no",
                "yes" if result.is_submitted else "no",
                "yes" if result.is_reported else "no",
                "yes" if result.training_completed else "no",
                result.opened_at,
                result.clicked_at,
                result.reported_at,
            ]
        )
    filename = f"campaign-{campaign.name.replace(' ', '-').lower()}.csv"
    return Response(
        content=buffer.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Training (admin: modules + compliance) ──────────────────────────────────

@app.get("/api/training/modules")
async def list_training_modules(request: Request, db: AsyncSession = Depends(get_db_for_request)):
    org_id = uuid.UUID(_org_id(request))
    modules = (
        await db.execute(
            select(TrainingModule).where(
                (TrainingModule.org_id.is_(None)) | (TrainingModule.org_id == org_id)
            ).order_by(TrainingModule.failure_type, TrainingModule.created_at)
        )
    ).scalars().all()
    rows = []
    for module in modules:
        question_count = (
            await db.execute(
                select(func.count()).select_from(TrainingQuestion)
                .where(TrainingQuestion.module_id == module.id)
            )
        ).scalar() or 0
        attempts = (
            await db.execute(
                select(func.count()).select_from(TrainingAttempt)
                .where(TrainingAttempt.module_id == module.id, TrainingAttempt.org_id == org_id)
            )
        ).scalar() or 0
        rows.append({
            "id": module.id,
            "title": module.title,
            "title_ne": module.title_ne,
            "description": module.description,
            "description_ne": module.description_ne,
            "failure_type": module.failure_type,
            "video_url_en": training.media_absolute_url(module.video_url_en),
            "video_url_ne": training.media_absolute_url(module.video_url_ne),
            "audio_url_en": training.media_absolute_url(module.audio_url_en),
            "audio_url_ne": training.media_absolute_url(module.audio_url_ne),
            "duration_seconds": module.duration_seconds,
            "pass_score": module.pass_score,
            "key_points_en": module.key_points_en or [],
            "key_points_ne": module.key_points_ne or [],
            "is_global": module.org_id is None,
            "question_count": question_count,
            "attempts": attempts,
            "version": module.version,
            "created_at": module.created_at,
        })
    return rows


@app.get("/api/training/modules/{module_id}")
async def get_training_module(
    module_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db_for_request),
):
    org_id = uuid.UUID(_org_id(request))
    module = await db.get(TrainingModule, module_id)
    if module is None or (module.org_id is not None and module.org_id != org_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lesson not found")
    questions = (
        await db.execute(
            select(TrainingQuestion)
            .where(TrainingQuestion.module_id == module.id)
            .order_by(TrainingQuestion.created_at)
        )
    ).scalars().all()
    return {
        "id": module.id,
        "title": module.title,
        "title_ne": module.title_ne,
        "description": module.description,
        "description_ne": module.description_ne,
        "failure_type": module.failure_type,
        "video_url_en": training.media_absolute_url(module.video_url_en),
        "video_url_ne": training.media_absolute_url(module.video_url_ne),
        "audio_url_en": training.media_absolute_url(module.audio_url_en),
        "audio_url_ne": training.media_absolute_url(module.audio_url_ne),
        "duration_seconds": module.duration_seconds,
        "pass_score": module.pass_score,
        "key_points_en": module.key_points_en or [],
        "key_points_ne": module.key_points_ne or [],
        "questions": [
            {
                "id": q.id,
                "prompt": q.prompt,
                "prompt_ne": q.prompt_ne,
                "options": q.options,
                "checkpoint_after_seconds": q.checkpoint_after_seconds,
                "explanation": q.explanation,
                "explanation_ne": q.explanation_ne,
            }
            for q in questions
        ],
    }


@app.get("/api/training/compliance")
async def training_compliance(request: Request, db: AsyncSession = Depends(get_db_for_request)):
    org_id = uuid.UUID(_org_id(request))
    attempts = (
        await db.execute(
            select(TrainingAttempt).where(TrainingAttempt.org_id == org_id)
        )
    ).scalars().all()
    employees = (
        await db.execute(select(Employee).where(Employee.org_id == org_id, Employee.is_active == True))  # noqa: E712
    ).scalars().all()
    employee_by_id = {e.id: e for e in employees}
    modules = (await db.execute(select(TrainingModule))).scalars().all()
    module_by_id = {m.id: m for m in modules}

    rows = []
    for attempt in attempts:
        employee = employee_by_id.get(attempt.employee_id)
        module = module_by_id.get(attempt.module_id)
        rows.append({
            "employee_name": f"{employee.first_name} {employee.last_name}" if employee else "Unknown",
            "email": employee.email if employee else "unknown",
            "department": employee.department if employee else None,
            "module_title": module.title if module else "Unknown",
            "failure_type": module.failure_type if module else None,
            "language": attempt.language,
            "mode": attempt.mode,
            "status": attempt.status.value,
            "completion_percentage": attempt.completion_percentage,
            "verified_watch_seconds": round(attempt.verified_watch_seconds or 0, 1),
            "quiz_score": attempt.quiz_score,
            "quiz_passed": attempt.quiz_passed,
            "invalid_flags": attempt.invalid_flags or [],
            "started_at": attempt.started_at,
            "last_activity_at": attempt.last_activity_at,
            "completed_at": attempt.completed_at,
        })

    rows.sort(key=lambda r: (r["status"] == TrainingStatus.COMPLETED.value, r["last_activity_at"] or r["started_at"] or datetime.min))
    completed = sum(1 for r in rows if r["status"] == TrainingStatus.COMPLETED.value)
    started = sum(1 for r in rows if r["status"] in (TrainingStatus.STARTED.value, TrainingStatus.IN_PROGRESS.value))
    quiz_scores = [r["quiz_score"] for r in rows if r["quiz_score"] is not None]
    coverages = [r["completion_percentage"] for r in rows]

    return {
        "summary": {
            "attempts": len(rows),
            "started": started,
            "completed": completed,
            "quiz_pass_rate": round(sum(1 for s in quiz_scores if s >= 80) / len(quiz_scores) * 100, 1) if quiz_scores else 0.0,
            "avg_coverage": round(sum(coverages) / len(coverages), 1) if coverages else 0.0,
        },
        "rows": rows,
    }


# ── Sending profiles ────────────────────────────────────────────────────────

def _profile_read(profile: SendingProfile) -> dict:
    return {
        "id": profile.id,
        "name": profile.name,
        "host": profile.host or "",
        "port": profile.port,
        "username": profile.username,
        "from_name": profile.from_name,
        "from_email": profile.from_email or "",
        "use_tls": profile.use_tls,
        "simulate": profile.simulate,
        "has_password": bool(profile.password_encrypted),
        "dkim_domain": profile.dkim_domain or "",
        "has_dkim_key": bool(profile.dkim_private_key_encrypted),
        "created_at": profile.created_at,
    }


@app.get("/api/sending-profiles", response_model=list[SendingProfileRead])
async def list_sending_profiles(request: Request, db: AsyncSession = Depends(get_db_for_request)):
    org_id = uuid.UUID(_org_id(request))
    profiles = (
        await db.execute(
            select(SendingProfile).where(SendingProfile.org_id == org_id).order_by(SendingProfile.created_at.desc())
        )
    ).scalars().all()
    return [_profile_read(p) for p in profiles]


@app.post("/api/sending-profiles", response_model=SendingProfileRead)
async def create_sending_profile(
    request: Request,
    payload: SendingProfileCreateRequest,
    db: AsyncSession = Depends(get_db_for_request),
):
    data = payload.model_dump()
    password = data.pop("password", None)
    dkim_key = data.pop("dkim_private_key", None)
    profile = SendingProfile(**data, org_id=uuid.UUID(_org_id(request)))
    if password:
        profile.password_encrypted = encrypt_secret(password)
    if dkim_key:
        profile.dkim_private_key_encrypted = encrypt_secret(dkim_key)
    db.add(profile)
    await db.commit()
    await db.refresh(profile)
    return _profile_read(profile)


@app.patch("/api/sending-profiles/{profile_id}", response_model=SendingProfileRead)
async def update_sending_profile(
    profile_id: uuid.UUID,
    request: Request,
    payload: SendingProfileUpdateRequest,
    db: AsyncSession = Depends(get_db_for_request),
):
    profile = await db.get(SendingProfile, profile_id)
    if profile is None or profile.org_id != uuid.UUID(_org_id(request)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sending profile not found")
    data = payload.model_dump(exclude_unset=True)
    password = data.pop("password", None)
    dkim_key = data.pop("dkim_private_key", None)
    for field, value in data.items():
        setattr(profile, field, value)
    if password:
        profile.password_encrypted = encrypt_secret(password)
    if dkim_key:
        profile.dkim_private_key_encrypted = encrypt_secret(dkim_key)
    await db.commit()
    await db.refresh(profile)
    return _profile_read(profile)


@app.delete("/api/sending-profiles/{profile_id}")
async def delete_sending_profile(
    profile_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db_for_request),
):
    profile = await db.get(SendingProfile, profile_id)
    if profile is None or profile.org_id != uuid.UUID(_org_id(request)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sending profile not found")
    await db.delete(profile)
    await db.commit()
    return {"ok": True}


@app.post("/api/sending-profiles/{profile_id}/test")
async def test_sending_profile(
    profile_id: uuid.UUID,
    payload: SendingProfileTestRequest,
    request: Request,
    db: AsyncSession = Depends(get_db_for_request),
):
    profile = await db.get(SendingProfile, profile_id)
    if profile is None or profile.org_id != uuid.UUID(_org_id(request)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sending profile not found")
    if not profile.simulate and not profile.host:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No SMTP host configured for this profile")
    try:
        await send_test_email(profile, payload.to_email)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Test send failed: {exc}")
    return {"ok": True, "message": "Test message sent"}


# ── Events (append-only audit log) ──────────────────────────────────────────

@app.get("/api/events", response_model=list[EventRead])
async def list_events(request: Request, db: AsyncSession = Depends(get_db_for_request)):
    org_id = uuid.UUID(_org_id(request))
    events = (
        await db.execute(
            select(PhishingEvent)
            .where(PhishingEvent.org_id == org_id)
            .order_by(PhishingEvent.created_at.desc())
            .limit(200)
        )
    ).scalars().all()
    return events


# ── Outbox (simulated mailbox) ──────────────────────────────────────────────

@app.get("/api/outbox", response_model=list[OutboxMessageRead])
async def list_outbox(request: Request, db: AsyncSession = Depends(get_db_for_request)):
    org_id = uuid.UUID(_org_id(request))
    messages = (
        await db.execute(
            select(OutboxMessage).where(OutboxMessage.org_id == org_id).order_by(OutboxMessage.created_at.desc())
        )
    ).scalars().all()
    return messages


@app.get("/api/outbox/{message_id}/html", response_class=HTMLResponse)
async def render_outbox_message(
    message_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db_for_request),
):
    message = await db.get(OutboxMessage, message_id)
    if message is None or message.org_id != uuid.UUID(_org_id(request)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")
    return message.html_body


# ── Remediation & follow-up queue ──────────────────────────────────────────

async def _remediation_reads(db: AsyncSession, rows: list[Remediation], now) -> list[dict]:
    employee_ids = {r.employee_id for r in rows}
    campaign_ids = {r.campaign_id for r in rows}
    result_ids = {r.result_id for r in rows}
    employees = (
        await db.execute(select(Employee).where(Employee.id.in_(employee_ids)))
    ).scalars().all()
    employee_by_id = {e.id: e for e in employees}
    campaigns = (
        await db.execute(select(Campaign).where(Campaign.id.in_(campaign_ids)))
    ).scalars().all()
    campaign_by_id = {c.id: c for c in campaigns}
    results = (
        await db.execute(select(CampaignResult).where(CampaignResult.id.in_(result_ids)))
    ).scalars().all()
    result_by_id = {r.id: r for r in results}

    out = []
    for row in rows:
        status = row.status.value if isinstance(row.status, RemediationStatus) else str(row.status)
        deadline = analytics._as_utc(row.deadline)
        if status == RemediationStatus.ASSIGNED.value and deadline is not None and deadline < now:
            status = RemediationStatus.EXPIRED.value
        employee = employee_by_id.get(row.employee_id)
        campaign = campaign_by_id.get(row.campaign_id)
        result = result_by_id.get(row.result_id)
        out.append(
            {
                "id": row.id,
                "employee_name": f"{employee.first_name} {employee.last_name}" if employee else "—",
                "employee_email": employee.email if employee else "",
                "department": employee.department if employee else None,
                "failure_type": row.failure_type,
                "status": status,
                "assigned_at": row.assigned_at,
                "deadline": row.deadline,
                "completed_at": row.completed_at,
                "notified_at": row.notified_at,
                "follow_up_due_at": row.follow_up_due_at,
                "follow_up_campaign_id": row.follow_up_campaign_id,
                "campaign_name": campaign.name if campaign else None,
                "training_link": remediation_helpers.training_link_for(result) if result else "",
            }
        )
    return out


@app.get("/api/remediations", response_model=list[RemediationRead])
async def list_remediations(request: Request, db: AsyncSession = Depends(get_db_for_request)):
    org_id = uuid.UUID(_org_id(request))
    rows = (
        await db.execute(
            select(Remediation)
            .where(Remediation.org_id == org_id)
            .order_by(Remediation.assigned_at.desc())
        )
    ).scalars().all()
    return await _remediation_reads(db, rows, datetime.now(timezone.utc))


@app.post("/api/remediations/{remediation_id}/resend", response_model=RemediationRead)
async def resend_remediation(
    remediation_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db_for_request),
):
    remediation = await db.get(Remediation, remediation_id)
    if remediation is None or remediation.org_id != uuid.UUID(_org_id(request)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Remediation not found")
    await remediation_helpers.resend_notification(db, remediation)
    return (await _remediation_reads(db, [remediation], datetime.now(timezone.utc)))[0]


@app.get("/api/health")
async def health():
    return {"ok": True}
