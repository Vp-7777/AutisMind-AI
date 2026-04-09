"""
Breadth-First Search (BFS) for symptom co-occurrence analysis.

What this module does
---------------------
1) Builds a small *symptom graph*: each node is a screening dimension.
2) Connects two nodes with an undirected edge when both look "low" on the same scale
   (co-occurrence of possible concern flags).
3) Runs **BFS** from the "most concerning" node to collect all connected concerns
   in **breadth-first order** (layer by layer).

Why BFS (and not DFS) here
--------------------------
- BFS explores all immediate neighbors before going deeper—natural for "which clusters
  of observations rise together?"
- In an unweighted graph, BFS from a start node lists nodes by *shortest hop distance*,
  which is a clean viva talking point about optimality properties of BFS.

How this connects to a typical AI syllabus
------------------------------------------
- **Uninformed search**: BFS is a classic blind search strategy (no heuristic).
- **State space view**: nodes = problem features; edges = co-occurrence relations.
- Contrasts with A* in `a_star_therapy.py`, which *does* use a heuristic.

Implementation note: queue operations use a plain Python list as a FIFO queue
(`pop(0)` is O(n) but fine for five nodes—readability beats micro-optimization here).
"""

from __future__ import annotations

from collections import deque


# Human-readable labels for each measured dimension (nodes in the graph).
SYMPTOM_NODES = (
    "eye_contact",
    "name_response",
    "vocalization",
    "gestures",
    "repetitive_behavior",
)


def _build_symptom_graph(scores: dict[str, float], threshold: float = 40.0) -> dict[str, list[str]]:
    """
    Build an undirected graph of "co-occurring low scores".

    Edge rule (simple, explainable):
    Two symptoms share an edge if BOTH adjusted scores are strictly below `threshold`
    on the 0–100 scale.

    This is a *screening abstraction*, not a medical diagnostic graph.
    """
    graph: dict[str, list[str]] = {name: [] for name in SYMPTOM_NODES}
    names = list(SYMPTOM_NODES)
    for i, a in enumerate(names):
        for b in names[i + 1 :]:
            if scores[a] < threshold and scores[b] < threshold:
                graph[a].append(b)
                graph[b].append(a)
    return graph


def analyze_symptoms_bfs(
    eye_contact: float,
    name_response: float,
    vocalization: float,
    gestures: float,
    repetitive_behavior: float,
) -> tuple[list[str], dict[str, list[str]]]:
    """
    Run BFS from the lowest-scoring (most concerning) symptom node.

    Returns
    -------
    order : list[str]
        BFS visitation order over the connected component that contains the start node.
    graph : dict[str, list[str]]
        The adjacency lists (for debugging / extended UI later).
    """
    scores = {
        "eye_contact": eye_contact,
        "name_response": name_response,
        "vocalization": vocalization,
        "gestures": gestures,
        # For repetitive behavior, "high" is concerning; invert to align with others.
        "repetitive_behavior": 100.0 - repetitive_behavior,
    }
    graph = _build_symptom_graph(scores)

    # Start from the weakest skill signal (minimum of the adjusted scores).
    start = min(SYMPTOM_NODES, key=lambda n: scores[n])

    visited: set[str] = set()
    order: list[str] = []
    queue: deque[str] = deque([start])
    visited.add(start)

    while queue:
        node = queue.popleft()
        order.append(node)
        for neighbor in graph[node]:
            if neighbor not in visited:
                visited.add(neighbor)
                queue.append(neighbor)

    return order, graph


def format_bfs_explanation(order: list[str]) -> str:
    """Turn BFS order into one short paragraph for the API response."""
    if not order:
        return "Symptom graph analysis did not find a starting node."
    focus = order[0]
    rest = ", ".join(order[1:]) if len(order) > 1 else "none in the same connected group"
    return (
        f"BFS (uninformed search) started from the weakest area ({focus}) and visited "
        f"connected concern-linked nodes in breadth-first order: {', '.join(order)}. "
        f"This models symptom co-occurrence as a graph and layers exploration the way "
        f"breadth-first search does in an AI course. Further linked nodes: {rest}."
    )
