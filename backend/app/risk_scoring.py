"""
Risk scoring with exponential time-decay.

The original draft (10 + clicks*15 + submissions*30, pure cumulative) makes
an employee who failed once 18 months ago look identical to one who failed
last week. That's not useful for HR follow-up and it never lets anyone's
score recover after they improve. Decay fixes both: old events fade out,
so the score reflects *current* behavior, and the "Vulnerable 10%" list
stays meaningful over time instead of just accumulating names forever.
"""

import math
from dataclasses import dataclass, field
from datetime import datetime, timezone

# Points per event type, before decay is applied.
EVENT_WEIGHTS = {
    "opened": 2,
    "clicked": 15,
    "submitted": 30,
}
TRAINING_COMPLETION_CREDIT = -10  # completing remedial training after a fail earns credit back

BASE_SCORE = 10          # floor — everyone starts here, nobody is ever "0 risk"
HALF_LIFE_DAYS = 90       # an event's weight halves every 90 days
MAX_SCORE = 100


@dataclass
class ScoreEvent:
    kind: str              # "opened" | "clicked" | "submitted" | "training_completed"
    occurred_at: datetime


@dataclass
class RiskScoreResult:
    score: int
    trend_previous_period: int | None
    contributing_events: int
    breakdown: dict = field(default_factory=dict)


def _decay_weight(days_ago: float) -> float:
    return 0.5 ** (days_ago / HALF_LIFE_DAYS)


def _score_as_of(events: list[ScoreEvent], as_of: datetime) -> tuple[int, dict]:
    total = 0.0
    breakdown = {"opened": 0.0, "clicked": 0.0, "submitted": 0.0, "training_credit": 0.0}

    for event in events:
        if event.occurred_at > as_of:
            continue
        days_ago = (as_of - event.occurred_at).total_seconds() / 86400
        decay = _decay_weight(days_ago)

        if event.kind == "training_completed":
            contribution = TRAINING_COMPLETION_CREDIT * decay
            breakdown["training_credit"] += contribution
        else:
            weight = EVENT_WEIGHTS.get(event.kind, 0)
            contribution = weight * decay
            breakdown[event.kind] = breakdown.get(event.kind, 0.0) + contribution

        total += contribution

    score = max(0, min(MAX_SCORE, round(BASE_SCORE + total)))
    return score, breakdown


def calculate_risk_score(
    events: list[ScoreEvent],
    as_of: datetime | None = None,
    compare_days: int = 90,
) -> RiskScoreResult:
    """
    Returns current score plus the score as of `compare_days` ago, so a
    dashboard/compliance report can show real trend lines ("dropped from
    30% in Jan to 5% in June") instead of just a static current number.
    """
    as_of = as_of or datetime.now(timezone.utc)
    current_score, breakdown = _score_as_of(events, as_of)

    previous_cutoff = as_of.fromtimestamp(as_of.timestamp() - compare_days * 86400, tz=timezone.utc)
    previous_events = [e for e in events if e.occurred_at <= previous_cutoff]
    previous_score = None
    if previous_events:
        previous_score, _ = _score_as_of(previous_events, previous_cutoff)

    return RiskScoreResult(
        score=current_score,
        trend_previous_period=previous_score,
        contributing_events=len([e for e in events if e.occurred_at <= as_of]),
        breakdown={k: round(v, 1) for k, v in breakdown.items()},
    )


def is_eligible_for_campaign(employee, org) -> bool:
    """
    Ethical/legal guardrail, not just a technical one: don't phish-test
    someone who's on leave, and respect an org-level exclusion list (e.g.
    an employee under active HR investigation, or excluded per a
    collective-bargaining agreement). Cheap to build, avoids real harm.
    """
    if not employee.is_active or employee.on_leave:
        return False
    if str(employee.id) in (org.excluded_employee_ids or []):
        return False
    return True
