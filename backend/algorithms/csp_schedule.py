"""
Constraint Satisfaction Problem (CSP) solver for weekly therapy scheduling.

What this module does
---------------------
1) Defines variables (e.g., Mon / Wed / Fri slots).
2) Each variable's domain is the set of therapy actions we want to schedule.
3) Uses **backtracking** with simple **forward checking** flavor:
   when a variable is assigned, remove that value from remaining domains.

Why CSP appears in an AI class
------------------------------
- Many timetabling / scheduling tasks are modeled as CSPs: variables, domains, constraints.
- Backtracking + constraint propagation is a standard topic next to search algorithms.

How this connects to A* and screening
-------------------------------------
- A* (see `a_star_therapy.py`) proposes *which* therapies matter most on this snapshot.
- CSP turns them into a *feasible weekly layout* with "no double booking" style rules.

No OR-Tools / CP-SAT: only Python lists and loops—easy to trace on paper during a viva.
"""

from __future__ import annotations

# Three placeholder slots; names are easy to explain in presentations.
SLOT_VARS = ("early_week_slot", "mid_week_slot", "late_week_slot")


def _all_different(assignments: dict[str, str]) -> bool:
    """Hard constraint: a therapy should not appear twice the same week."""
    seen: set[str] = set()
    for v in assignments.values():
        if v in seen:
            return False
        seen.add(v)
    return True


def _behavioral_first_if_present(assignments: dict[str, str], behavioral_phrase: str) -> bool:
    """
    Soft-clinical ordering constraint for demos:

    If the behavioral therapy string is used at all, prefer it earlier in the week
    (lower index in SLOT_VARS) than other assigned therapies when possible.

    Enforced as: if behavioral appears in two slots, fail; if it appears after a
    non-behavioral in slot order, fail.
    """
    slots_in_order = list(SLOT_VARS)
    behavioral_slots = [s for s in slots_in_order if assignments.get(s) == behavioral_phrase]
    if not behavioral_slots:
        return True
    # Only one slot should hold behavioral if it exists; all_different already guards duplicates.
    beh_slot = behavioral_slots[0]
    beh_index = slots_in_order.index(beh_slot)
    for s in slots_in_order:
        if s == beh_slot:
            continue
        val = assignments.get(s)
        if val and val != behavioral_phrase:
            if slots_in_order.index(s) < beh_index:
                return False
    return True


def _backtrack(
    variables: list[str],
    domains: dict[str, list[str]],
    assignments: dict[str, str],
    behavioral_phrase: str,
) -> dict[str, str] | None:
    """
    Depth-first search over assignments with domain pruning.

    This is the classic CSP backtracking template from AI lectures:
    choose variable, try each value, recurse if constraints still satisfiable.
    """
    if len(assignments) == len(variables):
        if _all_different(assignments) and _behavioral_first_if_present(assignments, behavioral_phrase):
            return dict(assignments)
        return None

    # Simple variable ordering: first unassigned in fixed slot order (static ordering).
    next_var = next(v for v in variables if v not in assignments)

    for value in list(domains[next_var]):
        assignments[next_var] = value
        if not _all_different(assignments):
            del assignments[next_var]
            continue
        if not _behavioral_first_if_present(assignments, behavioral_phrase):
            del assignments[next_var]
            continue

        # Forward checking: copy domains and remove assigned value elsewhere.
        new_domains = {var: list(vals) for var, vals in domains.items()}
        for var in variables:
            if var == next_var:
                continue
            if value in new_domains[var]:
                new_domains[var] = [x for x in new_domains[var] if x != value]

        still_open = [v for v in variables if v not in assignments]
        if any(len(new_domains[v]) == 0 for v in still_open):
            del assignments[next_var]
            continue

        result = _backtrack(variables, new_domains, assignments, behavioral_phrase)
        if result is not None:
            return result
        del assignments[next_var]

    return None


def schedule_therapies_csp(
    therapies: list[str],
    risk_band: str,
) -> list[str]:
    """
    Assign each therapy to a weekly slot; return readable schedule lines.

    If fewer than three therapies are provided, we pad with a low-intensity placeholder
    so the CSP still has a consistent shape for teaching.
    """
    behavioral_phrase = next((t for t in therapies if "behavioral" in t.lower()), "")

    ordered_unique: list[str] = []
    for t in therapies:
        if t not in ordered_unique:
            ordered_unique.append(t)

    pool = list(ordered_unique)
    filler = "Caregiver check-in & home practice review"
    while len(pool) < len(SLOT_VARS):
        pool.append(filler)

    # Domains start as full pool for each slot; constraints will prune.
    domains = {var: list(pool) for var in SLOT_VARS}

    if risk_band == "high" and behavioral_phrase and behavioral_phrase in pool:
        # Narrow early slot domain to prioritize behavioral support when risk is high.
        domains[SLOT_VARS[0]] = [behavioral_phrase]

    solution = _backtrack(list(SLOT_VARS), domains, {}, behavioral_phrase)

    if solution is None:
        # Fallback: simple sequential mapping if constraints over-constrain tiny inputs.
        return [f"{slot.replace('_', ' ')}: {pool[i]}" for i, slot in enumerate(SLOT_VARS)]

    lines: list[str] = []
    for slot in SLOT_VARS:
        lines.append(f"{slot.replace('_', ' ')}: {solution[slot]}")
    return lines
