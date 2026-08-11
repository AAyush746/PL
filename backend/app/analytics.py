"""Analytics helpers: per-employee risk scoring, org-level rollups, and
department breakdowns. Built on the decaying risk model in risk_scoring.py."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from .models import Campaign, CampaignResult, Employee
from .risk_scoring import ScoreEvent, calculate_risk_score


def _as_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _events_for_results(results: list[CampaignResult]) -> list[ScoreEvent]:
    events: list[ScoreEvent] = []
    for result in results:
        opened_at = _as_utc(result.opened_at)
        clicked_at = _as_utc(result.clicked_at)
        created_at = _as_utc(result.created_at)
        training_at = _as_utc(result.training_completed_at)
        if opened_at:
            events.append(ScoreEvent("opened", opened_at))
        if clicked_at:
            events.append(ScoreEvent("clicked", clicked_at))
        if result.is_submitted:
            happened = clicked_at or created_at or datetime.now(timezone.utc)
            events.append(ScoreEvent("submitted", happened))
        if training_at:
            events.append(ScoreEvent("training_completed", training_at))
    return events


async def load_all_results(db, org_id: str) -> list[CampaignResult]:
    org_uuid = uuid.UUID(str(org_id))
    stmt = (
        select(CampaignResult)
        .join(CampaignResult.campaign)
        .options(selectinload(CampaignResult.campaign))
        .where(Campaign.org_id == org_uuid)
    )
    return (await db.execute(stmt)).scalars().all()


async def employee_risk_by_id(db, org_id: str) -> dict:
    """Map employee_id -> {score, trend_prev, fails, trained}."""
    results = await load_all_results(db, org_id)

    by_employee: dict = {}
    for result in results:
        entry = by_employee.setdefault(
            str(result.employee_id),
            {"events": [], "fails": 0, "trained": False},
        )
        entry["events"].extend(_events_for_results([result]))
        if result.is_clicked:
            entry["fails"] += 1
        if result.training_completed:
            entry["trained"] = True

    stats = {}
    for employee_id, entry in by_employee.items():
        scored = calculate_risk_score(entry["events"])
        stats[employee_id] = {
            "score": scored.score,
            "trend_prev": scored.trend_previous_period,
            "fails": entry["fails"],
            "trained": entry["trained"],
        }
    return stats


def org_risk(stats: dict) -> tuple[int, int | None]:
    """Average of per-employee scores -> (current, previous-period trend)."""
    if not stats:
        return 0, None
    current = [s["score"] for s in stats.values()]
    prev = [s["trend_prev"] for s in stats.values() if s["trend_prev"] is not None]
    return round(sum(current) / len(current)), (round(sum(prev) / len(prev)) if prev else None)


async def department_breakdown(db, org_id: str, employees: list[Employee]) -> list[dict]:
    """Per-department rollup: headcount, avg risk, click rate, opened rate."""
    stats = await employee_risk_by_id(db, org_id)
    results = await load_all_results(db, org_id)

    by_dept: dict[str, dict] = {}
    for employee in employees:
        dept = (employee.department or "General").strip() or "General"
        entry = by_dept.setdefault(dept, {"employees": 0, "risk_sum": 0, "risk_n": 0, "opened": 0, "clicked": 0, "delivered": 0})
        entry["employees"] += 1
        risk = stats.get(str(employee.id), {}).get("score")
        if risk is not None:
            entry["risk_sum"] += risk
            entry["risk_n"] += 1

    for result in results:
        campaign = result.campaign
        if campaign is None or str(campaign.org_id) != str(org_id):
            continue
        employee = next((e for e in employees if e.id == result.employee_id), None)
        if employee is None:
            continue
        dept = (employee.department or "General").strip() or "General"
        entry = by_dept.setdefault(dept, {"employees": 0, "risk_sum": 0, "risk_n": 0, "opened": 0, "clicked": 0, "delivered": 0})
        if result.is_delivered:
            entry["delivered"] += 1
        if result.is_opened:
            entry["opened"] += 1
        if result.is_clicked:
            entry["clicked"] += 1

    rows = []
    for name, entry in by_dept.items():
        click_rate = round(entry["clicked"] / entry["opened"] * 100, 1) if entry["opened"] else 0.0
        avg_risk = round(entry["risk_sum"] / entry["risk_n"], 1) if entry["risk_n"] else 0.0
        rows.append(
            {
                "name": name,
                "employees": entry["employees"],
                "delivered": entry["delivered"],
                "opened": entry["opened"],
                "clicked": entry["clicked"],
                "click_rate": click_rate,
                "avg_risk": avg_risk,
            }
        )
    rows.sort(key=lambda r: r["click_rate"], reverse=True)
    return rows
