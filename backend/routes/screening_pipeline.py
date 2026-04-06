"""
End-to-end screening pipeline used by the FastAPI routes.

Execution order (easy to narrate in a viva):
1. Rule-based layer → numeric risk + module scores.
2. BFS on a symptom graph → qualitative ordering / clustering story.
3. A* → prioritized therapy focus areas.
4. CSP → weekly-style schedule that respects simple constraints.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from algorithms.a_star_therapy import recommend_therapy_plan_from_path, run_a_star
from algorithms.bfs_symptom import analyze_symptoms_bfs, format_bfs_explanation
from algorithms.csp_schedule import schedule_therapies_csp
from algorithms.rule_based import compute_risk_and_modules
from models.schemas import AnalyzeRequest, AnalyzeResponse, ModuleScores


def run_screening(payload: AnalyzeRequest) -> AnalyzeResponse:
    """Run all AI-style steps and package a single API response object."""
    session_id = str(uuid.uuid4())

    raw = payload.model_dump()
    rule = compute_risk_and_modules(
        eye_contact=raw["eye_contact"],
        name_response=raw["name_response"],
        vocalization=raw["vocalization"],
        gestures=raw["gestures"],
        repetitive_behavior=raw["repetitive_behavior"],
    )

    bfs_order, _graph = analyze_symptoms_bfs(
        eye_contact=raw["eye_contact"],
        name_response=raw["name_response"],
        vocalization=raw["vocalization"],
        gestures=raw["gestures"],
        repetitive_behavior=raw["repetitive_behavior"],
    )
    bfs_text = format_bfs_explanation(bfs_order)

    module_scores_dict = rule["module_scores"]
    astar_path, astar_cost = run_a_star(module_scores_dict)
    therapy_focus = recommend_therapy_plan_from_path(module_scores_dict, astar_path)
    scheduled_plan = schedule_therapies_csp(therapy_focus, rule["risk_band"])

    astar_therapy_nodes = [n for n in astar_path if n.startswith("therapy_")]
    astar_summary = (
        f"A* informed search selected an initial therapy focus with total path cost "
        f"{astar_cost:.2f} (lower is better on this teaching graph). "
        f"Intermediate nodes on the winning path: {astar_therapy_nodes or ['(direct)']}."
    )

    rule_summary = (
        f"Rule-based scoring produced risk {rule['risk_score']:.1f}/100 "
        f"({rule['risk_band']} band) from weighted module gaps."
    )

    csp_summary = (
        "A CSP scheduler (backtracking with forward checking) assigned therapies to "
        "weekly slots under all-different and simple ordering constraints; see therapy_plan."
    )

    explanation = " ".join([rule_summary, bfs_text, astar_summary, csp_summary])

    return AnalyzeResponse(
        session_id=session_id,
        risk_score=rule["risk_score"],
        risk_band=rule["risk_band"],
        module_scores=ModuleScores(**rule["module_scores"]),
        explanation=explanation,
        therapy_plan=scheduled_plan,
        created_at=datetime.now(timezone.utc),
    )
