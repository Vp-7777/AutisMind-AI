"""
A* search for therapy *path* recommendation.

What this module does
---------------------
Treats therapy planning as a **pathfinding** problem on a small directed graph:
- START → intermediate therapy-focus nodes → GOAL.
A* picks a path minimizing total edge cost while using a heuristic that estimates
remaining cost to GOAL.

Why A* fits this screening story
--------------------------------
- Screening outputs are not a full clinical plan, but we can still demonstrate
  **informed search**: combine known path cost so far (g) + estimate to goal (h).
- With an **admissible** heuristic (never overestimates), A* is optimal—standard exam topic.

How this connects to a typical AI syllabus
------------------------------------------
- Informed search: best-first variants, admissibility, consistency (discuss verbally in viva).
- Comparison: BFS in `bfs_symptom.py` ignores h; A* uses h to steer expansion.

No graph libraries: adjacency and costs are plain dicts; the open set is a Python list
with a manual minimum pick (clear for beginners, graph is tiny).
"""

from __future__ import annotations

from typing import Callable

# Named nodes in our therapy decision graph.
START = "START"
GOAL = "GOAL"
NODE_SOCIAL = "therapy_social_attention"
NODE_COMM = "therapy_communication"
NODE_BEHAV = "therapy_behavioral"
NODE_MOTOR = "therapy_motor_ot"


def _build_graph(
    module_scores: dict[str, float],
) -> tuple[dict[str, list[str]], Callable[[str, str], float]]:
    """
    Build directed edges and a cost function.

    Edge costs are *baseline* weights, then nudged using module scores:
    lower alignment on a module makes the matching therapy branch slightly cheaper
    (more recommended), which ties the classical search to our screening signals.

    This keeps the algorithm transparent: you can print the graph on a whiteboard in a viva.
    """
    # Baseline topology: START connects to four focus nodes; each focus connects to GOAL.
    neighbors: dict[str, list[str]] = {
        START: [NODE_SOCIAL, NODE_COMM, NODE_BEHAV, NODE_MOTOR],
        NODE_SOCIAL: [GOAL],
        NODE_COMM: [GOAL],
        NODE_BEHAV: [GOAL],
        NODE_MOTOR: [GOAL],
        GOAL: [],
    }

    def edge_cost(u: str, v: str) -> float:
        base = 5.0
        if u == START and v == NODE_SOCIAL:
            base = 4.0 + (100.0 - module_scores["social_attention"]) / 40.0
        elif u == START and v == NODE_COMM:
            base = 4.0 + (100.0 - module_scores["communication"]) / 40.0
        elif u == START and v == NODE_BEHAV:
            base = 4.0 + (100.0 - module_scores["behavioral_regulation"]) / 40.0
        elif u == START and v == NODE_MOTOR:
            base = 4.0 + (100.0 - module_scores["motor_expression"]) / 40.0
        elif v == GOAL:
            base = 2.0
        return base

    return neighbors, edge_cost


def _heuristic(node: str) -> float:
    """
    Admissible heuristic: smallest possible remaining cost from `node` to GOAL.

    Because any forward step costs at least 2.0 in our model, h(START) can be 2.0
    and h(therapy_node) is 2.0 (one jump to GOAL). h(GOAL) = 0.

    This is deliberately simple so you can defend admissibility verbally.
    """
    if node == GOAL:
        return 0.0
    return 2.0


def _reconstruct_path(came_from: dict[str, str], current: str) -> list[str]:
    path = [current]
    while current in came_from:
        current = came_from[current]
        path.append(current)
    path.reverse()
    return path


def run_a_star(
    module_scores: dict[str, float],
) -> tuple[list[str], float]:
    """
    Run A* from START to GOAL.

    Returns the node sequence (including START and GOAL) and the goal's g-score.
    """
    neighbors, cost_fn = _build_graph(module_scores)

    open_set: list[str] = [START]
    came_from: dict[str, str] = {}

    g_score: dict[str, float] = {START: 0.0}

    def f_score(n: str) -> float:
        return g_score[n] + _heuristic(n)

    while open_set:
        # Manual selection of the most promising frontier node (smallest f = g + h).
        current = min(open_set, key=f_score)
        if current == GOAL:
            return _reconstruct_path(came_from, current), g_score[GOAL]

        open_set.remove(current)

        for nb in neighbors[current]:
            tentative_g = g_score[current] + cost_fn(current, nb)
            if tentative_g < g_score.get(nb, float("inf")):
                came_from[nb] = current
                g_score[nb] = tentative_g
                if nb not in open_set:
                    open_set.append(nb)

    return [], float("inf")


_LABELS = {
    NODE_SOCIAL: "Joint attention & social referencing sessions",
    NODE_COMM: "Speech-language and functional communication training",
    NODE_BEHAV: "Structured behavioral support (e.g., positive routines)",
    NODE_MOTOR: "Occupational therapy for motor planning / sensory strategies",
}


def recommend_therapy_plan(module_scores: dict[str, float]) -> list[str]:
    """
    Public helper: return a short ordered list of therapy actions.

    1) A* finds a minimum-cost path START → … → GOAL; the first therapy node on that
       path is the **optimal first step** under our simplified cost model (viva talking point).
    2) Remaining therapies are ranked by the same START→therapy edge costs so the plan
       still reads as a full multi-item checklist for caregivers.
    """
    path, _ = run_a_star(module_scores)
    neighbors, cost_fn = _build_graph(module_scores)
    all_therapy_nodes = list(neighbors[START])

    primary = next((n for n in path if n in _LABELS), None)
    ranked_by_cost = sorted(all_therapy_nodes, key=lambda n: cost_fn(START, n))

    ordered_nodes: list[str] = []
    if primary is not None:
        ordered_nodes.append(primary)
    for n in ranked_by_cost:
        if n not in ordered_nodes:
            ordered_nodes.append(n)

    # Keep the response compact for UI and oral exams.
    return [_LABELS[n] for n in ordered_nodes[:3]]


def recommend_therapy_plan_from_path(
    module_scores: dict[str, float], path: list[str]
) -> list[str]:
    """
    Optimized helper when caller already executed A*.

    This avoids running A* a second time in the pipeline and keeps response latency
    lower on cold-start constrained environments.
    """
    neighbors, cost_fn = _build_graph(module_scores)
    all_therapy_nodes = list(neighbors[START])
    primary = next((n for n in path if n in _LABELS), None)
    ranked_by_cost = sorted(all_therapy_nodes, key=lambda n: cost_fn(START, n))

    ordered_nodes: list[str] = []
    if primary is not None:
        ordered_nodes.append(primary)
    for n in ranked_by_cost:
        if n not in ordered_nodes:
            ordered_nodes.append(n)
    return [_LABELS[n] for n in ordered_nodes[:3]]
