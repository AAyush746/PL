from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    email: str
    password: str
    org_slug: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str = "organization_admin"


class MeRead(BaseModel):
    email: str
    first_name: str
    role: str
    org_name: str
    org_slug: str
    subscription_tier: str
    trial_ends_at: datetime | None = None
    employee_count: int = 0


class PayRequest(BaseModel):
    plan: Literal["starter", "growth", "enterprise"]
    cardholder_name: str = Field(min_length=2)
    card_number: str = Field(min_length=12)
    expiry: str = Field(pattern=r"^(0[1-9]|1[0-2])/\d{2}$")
    cvc: str = Field(min_length=3, max_length=4)


class EsewaInitiateRequest(BaseModel):
    plan: Literal["starter", "growth", "enterprise"]


class EsewaInitiateResponse(BaseModel):
    order_id: str
    action_url: str
    form: dict


class EmployeeCreateRequest(BaseModel):
    first_name: str
    last_name: str
    email: str
    department: str | None = None
    hire_date: datetime | None = None
    on_leave: bool = False
    is_active: bool = True


class EmployeeUpdateRequest(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    department: str | None = None
    on_leave: bool | None = None
    is_active: bool | None = None


class EmployeeRead(BaseModel):
    id: uuid.UUID
    first_name: str
    last_name: str
    email: str
    department: str | None = None
    hire_date: datetime | None = None
    on_leave: bool
    is_active: bool
    risk_score: int | None = None
    fails: int = 0
    training_completed: bool = False

    model_config = {"from_attributes": True}


class EmployeeImportRequest(BaseModel):
    csv_text: str = Field(..., description="CSV payload containing employee rows")


class TemplateCreateRequest(BaseModel):
    name: str
    category: str | None = None
    subject_line: str
    html_body: str
    difficulty_level: int = 2


class TemplateRead(BaseModel):
    id: uuid.UUID
    org_id: uuid.UUID | None = None
    name: str
    category: str | None = None
    subject_line: str
    html_body: str
    difficulty_level: int

    model_config = {"from_attributes": True}


class CampaignCreateRequest(BaseModel):
    name: str
    template_id: uuid.UUID
    target_departments: list[str] = Field(default_factory=lambda: ["All"])
    scheduled_start: datetime
    sending_profile_id: uuid.UUID | None = None


class CampaignResultRead(BaseModel):
    id: uuid.UUID
    employee_name: str
    employee_email: str
    department: str | None = None
    is_delivered: bool
    is_opened: bool
    is_clicked: bool
    is_submitted: bool
    is_reported: bool
    training_completed: bool
    opened_at: datetime | None = None
    clicked_at: datetime | None = None
    training_completed_at: datetime | None = None
    reported_at: datetime | None = None

    model_config = {"from_attributes": True}


class CampaignRead(BaseModel):
    id: uuid.UUID
    template_id: uuid.UUID
    template_name: str | None = None
    sending_profile_id: uuid.UUID | None = None
    sending_profile_name: str | None = None
    name: str
    target_departments: list[str]
    scheduled_start: datetime
    status: str
    created_at: datetime | None = None
    total: int = 0
    delivered: int = 0
    opened: int = 0
    clicked: int = 0
    submitted: int = 0
    reported: int = 0
    trained: int = 0
    click_rate: float = 0.0
    report_rate: float = 0.0

    model_config = {"from_attributes": True}


class CampaignDetail(CampaignRead):
    results: list[CampaignResultRead] = Field(default_factory=list)


class DepartmentRead(BaseModel):
    name: str
    employees: int = 0
    click_rate: float = 0.0
    avg_risk: float = 0.0


class OutboxMessageRead(BaseModel):
    id: uuid.UUID
    to_name: str | None = None
    to_email: str
    from_name: str | None = None
    from_email: str | None = None
    subject: str
    campaign_id: uuid.UUID | None = None
    tracking_token: uuid.UUID | None = None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class OrgSummary(BaseModel):
    name: str
    employees: int
    active_campaigns: int
    completed_campaigns: int
    click_rate: float
    report_rate: float
    training_completion_rate: float
    risk_score: int
    risk_trend_prev: int | None = None
    subscription_tier: str = "free"
    trial_ends_at: datetime | None = None


class SendingProfileCreateRequest(BaseModel):
    name: str
    host: str = ""
    port: int = 587
    username: str | None = None
    password: str | None = None
    from_name: str | None = None
    from_email: str = ""
    use_tls: bool = False
    simulate: bool = True
    # DKIM signing for this profile's domain (optional; falls back to the
    # global DKIM_* env config). The private key is write-only and never
    # returned by the API.
    dkim_selector: str | None = None
    dkim_domain: str | None = None
    dkim_private_key: str | None = None


class SendingProfileUpdateRequest(BaseModel):
    name: str | None = None
    host: str | None = None
    port: int | None = None
    username: str | None = None
    password: str | None = None
    from_name: str | None = None
    from_email: str | None = None
    use_tls: bool | None = None
    simulate: bool | None = None
    dkim_selector: str | None = None
    dkim_domain: str | None = None
    dkim_private_key: str | None = None


class SendingProfileRead(BaseModel):
    id: uuid.UUID
    name: str
    host: str
    port: int
    username: str | None = None
    from_name: str | None = None
    from_email: str
    use_tls: bool
    simulate: bool
    has_password: bool = False
    dkim_domain: str = ""
    has_dkim_key: bool = False
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class SendingProfileTestRequest(BaseModel):
    to_email: str


class EventRead(BaseModel):
    id: uuid.UUID
    campaign_id: uuid.UUID | None = None
    result_id: uuid.UUID | None = None
    event_type: str
    ip_address: str | None = None
    user_agent: str | None = None
    event_data: dict | None = None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class RemediationRead(BaseModel):
    id: uuid.UUID
    employee_name: str
    employee_email: str
    department: str | None = None
    failure_type: str
    status: str  # assigned | expired | completed
    assigned_at: datetime
    deadline: datetime
    completed_at: datetime | None = None
    notified_at: datetime | None = None
    follow_up_due_at: datetime | None = None
    follow_up_campaign_id: uuid.UUID | None = None
    campaign_name: str | None = None
    training_link: str

    model_config = {"from_attributes": True}
