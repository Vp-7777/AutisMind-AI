"""
Rule-based autism risk scoring (expert / knowledge-based layer).

What this module does
---------------------
Turns five observable scores into:
1) Per-module alignment scores (0–100, higher = fewer concerns in that area).
2) A single overall risk_score (0–100, higher = more screening concern).
3) A discrete risk_band for reporting.

Why rule-based logic fits this project
--------------------------------------
In many AI courses, "knowledge-based systems" appear before machine learning.
Rules (if-then, weighted sums) are interpretable—important for screening tools
where clinicians and viva examiners can trace *why* a score changed.

How this connects to a typical AI syllabus
------------------------------------------
- Production systems (RBS): rules + uncertainty (here we use simple weights).
- Comparison point for ML: same inputs could later train a classifier; rules give a baseline.
- Explainability: each module_score is tied to named observables.

No external rule engines are used: all logic is plain Python so it is easy to read in a viva.
"""

from __future__ import annotations

import logging
from typing import TypedDict

logger = logging.getLogger(__name__)


class RuleBasedResult(TypedDict):
    risk_score: float
    risk_band: str
    module_scores: dict[str, float]


def _clamp(value: float, low: float, high: float) -> float:
    """Keep numeric inputs inside a safe range for scoring."""
    return max(low, min(high, value))


def compute_risk_and_modules(
    eye_contact: float,
    name_response: float,
    vocalization: float,
    gestures: float,
    repetitive_behavior: float,
) -> RuleBasedResult:
    """
    Apply weighted rules to derive module scores and overall risk.

    Rule sketch (all manual—no ML libraries):
    - Social attention blends eye contact + response to name.
    - Communication blends vocalization + name response.
    - Motor expression focuses on gesture use.
    - Behavioral regulation treats *high* repetitive_behavior as lower alignment.

    The overall risk_score is a weighted concern index derived from (100 - alignment)
    per module, so higher risk means more areas look atypical on this screening snapshot.
    """
    # API contract is strict 0-100, but clamp again for safety if this function is reused.
    ec = _clamp(eye_contact, 0.0, 100.0)
    nr = _clamp(name_response, 0.0, 100.0)
    vo = _clamp(vocalization, 0.0, 100.0)
    ge = _clamp(gestures, 0.0, 100.0)
    rb = _clamp(repetitive_behavior, 0.0, 100.0)

    # Module values are normalized to 0-100 where higher means stronger positive behavior.
    social_attention = (ec + nr) / 2.0
    communication = (vo + nr) / 2.0
    motor_expression = ge
    # Keep this as "positive alignment" for UI modules.
    behavioral_regulation = 100.0 - rb

    module_scores = {
        "social_attention": round(_clamp(social_attention, 0.0, 100.0), 2),
        "communication": round(_clamp(communication, 0.0, 100.0), 2),
        "motor_expression": round(_clamp(motor_expression, 0.0, 100.0), 2),
        "behavioral_regulation": round(_clamp(behavioral_regulation, 0.0, 100.0), 2),
    }

    # Proper gap-based scoring:
    # - Positive behaviors -> gap = 100 - value
    # - Repetitive behavior -> gap = value (already concerning when high)
    social_gap = 100.0 - module_scores["social_attention"]
    comm_gap = 100.0 - module_scores["communication"]
    motor_gap = 100.0 - module_scores["motor_expression"]
    behavior_gap = rb

    weights = {"social_attention": 0.30, "communication": 0.30, "motor_expression": 0.20, "behavioral_regulation": 0.20}
    risk_score = (
        social_gap * weights["social_attention"]
        + comm_gap * weights["communication"]
        + motor_gap * weights["motor_expression"]
        + behavior_gap * weights["behavioral_regulation"]
    )
    risk_score = round(_clamp(risk_score, 0.0, 100.0), 2)

    logger.info(
        "risk_scoring social_gap=%.2f comm_gap=%.2f motor_gap=%.2f behavior_gap=%.2f "
        "weights=%s risk_score=%.2f",
        social_gap,
        comm_gap,
        motor_gap,
        behavior_gap,
        weights,
        risk_score,
    )

    if risk_score < 35.0:
        band = "low"
    elif risk_score < 65.0:
        band = "moderate"
    else:
        band = "high"

    return {
        "risk_score": risk_score,
        "risk_band": band,
        "module_scores": module_scores,
    }
