"""
API contracts (input/output shapes).

These match the screening questionnaire fields and the unified analysis response.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class AnalyzeRequest(BaseModel):
    """Raw observational scores from the screening UI on a strict 0–100 range."""

    eye_contact: float = Field(..., ge=0, le=100, description="Observed eye contact quality/frequency")
    name_response: float = Field(..., ge=0, le=100, description="Response when name is called")
    vocalization: float = Field(..., ge=0, le=100, description="Appropriate vocal communication")
    gestures: float = Field(..., ge=0, le=100, description="Use of gestures / nonverbal cues")
    repetitive_behavior: float = Field(
        ...,
        ge=0,
        le=100,
        description="Repetitive or restricted behaviors (higher = more concern)",
    )


class ModuleScores(BaseModel):
    """
    Per-domain scores after normalization (0–100).
    Higher = more aligned with typical development (lower clinical concern).
    """

    social_attention: float
    communication: float
    motor_expression: float
    behavioral_regulation: float


class AnalyzeResponse(BaseModel):
    """Full analysis payload returned to the client and stored by session_id."""

    session_id: str
    risk_score: float = Field(..., ge=0, le=100)
    risk_band: Literal["low", "moderate", "high"]
    module_scores: ModuleScores
    explanation: str
    therapy_plan: list[str]
    created_at: datetime


class HistorySession(BaseModel):
    """Compact session row returned by GET /api/history."""

    session_id: str
    risk_score: float = Field(..., ge=0, le=100)
    risk_band: Literal["low", "moderate", "high"]
    created_at: datetime
