import csv
import io
import re
import uuid
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from . import analytics, tracking
from .core.config import get_settings
from .core.security import UserClaims, create_access_token, decode_token, encrypt_secret, hash_password, verify_password
from .database import get_db_for_request, get_public_db
from .models import (
    Base, Campaign, CampaignResult, CampaignStatus, Employee, Organization,
    OutboxMessage, PhishingEvent, PhishingTemplate, SendingProfile, User,
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
    EventRead,
    OrgSummary,
    OutboxMessageRead,
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


@asynccontextmanager
async def lifespan(_: FastAPI):
    from .database import engine

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_migrate_schema)
    yield


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
    }
    for table, columns in columns_to_add.items():
        if table not in existing:
            continue
        present = {col["name"] for col in inspect(conn).get_columns(table)}
        for name, definition in columns:
            if name not in present:
                conn.execute(text(f'ALTER TABLE "{table}" ADD COLUMN {name} {definition}'))


app = FastAPI(title="CyberSafe Nepal API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(tracking.router)


@app.middleware("http")
async def attach_authenticated_user(request: Request, call_next):
    if request.method == "OPTIONS":
        return await call_next(request)
    if request.url.path.startswith("/track") or request.url.path.startswith("/api/auth") or request.url.path == "/api/health":
        return await call_next(request)

    token = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing credentials")

    request.state.user = decode_token(token)
    return await call_next(request)


# ── Auth ────────────────────────────────────────────────────────────────────

def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or "org"


@app.post("/api/auth/login", response_model=TokenResponse)
async def login(payload: dict, db: AsyncSession = Depends(get_public_db)):
    email = payload.get("email")
    password = payload.get("password")
    org_name = payload.get("org_name")
    if not all([email, password, org_name]):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="org_name, email, and password are required")

    org = (
        await db.execute(select(Organization).where(func.lower(Organization.name) == org_name.lower()))
    ).scalars().first()
    if org is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    user = (
        await db.execute(
            select(User).where(User.org_id == org.id, User.email == email, User.is_active == True)  # noqa: E712
        )
    ).scalars().first()
    if user is None or not verify_password(password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    token = create_access_token(UserClaims(user_id=str(user.id), org_id=str(org.id), role=user.role))
    return {"access_token": token, "token_type": "bearer"}


@app.post("/api/auth/register", response_model=TokenResponse)
async def register(payload: dict, db: AsyncSession = Depends(get_public_db)):
    org_name = payload.get("org_name")
    email = payload.get("email")
    password = payload.get("password")
    if not all([org_name, email, password]):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="org_name, email, and password are required")

    base_slug = _slugify(org_name)
    slug = base_slug
    counter = 1
    while (
        await db.execute(select(Organization).where(Organization.slug == slug))
    ).scalars().first() is not None:
        counter += 1
        slug = f"{base_slug}-{counter}"

    new_org = Organization(name=org_name, slug=slug, domain=f"{slug}.local")
    db.add(new_org)
    await db.flush()

    admin = User(
        org_id=new_org.id,
        email=email,
        hashed_password=hash_password(password),
        role="organization_admin",
    )
    db.add(admin)
    await db.commit()

    token = create_access_token(UserClaims(user_id=str(admin.id), org_id=str(new_org.id), role=admin.role))
    return {"access_token": token, "token_type": "bearer"}


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
    }


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
    employee = Employee(**payload.model_dump(), org_id=uuid.UUID(_org_id(request)))
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
        employee = Employee(
            first_name=row["first_name"].strip(),
            last_name=row["last_name"].strip(),
            email=row["email"].strip().lower(),
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
    profile = SendingProfile(**data, org_id=uuid.UUID(_org_id(request)))
    if password:
        profile.password_encrypted = encrypt_secret(password)
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
    for field, value in data.items():
        setattr(profile, field, value)
    if password:
        profile.password_encrypted = encrypt_secret(password)
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


@app.get("/api/health")
async def health():
    return {"ok": True}
