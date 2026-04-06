"""
HTTP endpoints required by the project brief.

* POST /api/analyze — run the full pipeline and persist the structured result.
* GET /api/results/{session_id} — fetch a previously stored analysis (demo memory DB).
"""

from fastapi import APIRouter, HTTPException

from database.mongodb import get_result, list_results, save_result
from models.schemas import AnalyzeRequest, AnalyzeResponse, HistorySession
from .screening_pipeline import run_screening

router = APIRouter(tags=["screening"])


@router.post("/analyze", response_model=AnalyzeResponse)
def analyze_screening(payload: AnalyzeRequest) -> AnalyzeResponse:
    """
    Accept five observational scores and return risk, explanations, and a therapy schedule.

    The heavy lifting lives in `services/screening.py` so this file stays thin and readable.
    """
    result = run_screening(payload)
    try:
        save_result(result.session_id, result.model_dump())
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return result


@router.get("/results/{session_id}", response_model=AnalyzeResponse)
def read_screening_result(session_id: str) -> AnalyzeResponse:
    """Look up a saved session produced by POST /api/analyze."""
    try:
        stored = get_result(session_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    if stored is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return AnalyzeResponse(**stored)


@router.get("/history", response_model=list[HistorySession])
def read_history() -> list[HistorySession]:
    """Return previously analyzed sessions in reverse chronological order."""
    try:
        rows = list_results()
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return [HistorySession(**row) for row in rows]
