#!/usr/bin/env python3
"""Generate JSON fixtures from the testtime.py algorithms.

Run from the repo root:

    python3 reference/generate_fixtures.py

The TypeScript port asserts against these fixtures so the web output
matches the customer-validated Python output byte-for-byte. Functions
here are ported verbatim from testtime.py (no Tkinter scaffolding).
"""
from __future__ import annotations

import json
import math
import os


# --- Ported verbatim from testtime.py ---------------------------------------


def calculate_sigma(values, mean):
    # testtime.py:327-332 — sample std dev, denominator (n-1)
    if len(values) <= 1:
        return 0
    variance = sum((x - mean) ** 2 for x in values) / (len(values) - 1)
    return math.sqrt(variance)


def years_to_age_string(years):
    # testtime.py:334-368 — the 30/30.44-day hybrid is intentional
    total_days = years * 365.25
    full_years = int(years)
    remaining_days = total_days - (full_years * 365.25)
    full_months = int(remaining_days / 30.44)
    remaining_days -= full_months * 30.44
    full_days = round(remaining_days)
    if full_days >= 30:
        full_months += 1
        full_days -= 30
    if full_months >= 12:
        full_years += 1
        full_months -= 12
    parts = []
    if full_years > 0:
        parts.append(f"{full_years}г")
    if full_months > 0:
        parts.append(f"{full_months}м")
    if full_days > 0 or len(parts) == 0:
        parts.append(f"{full_days}д")
    return f"({', '.join(parts)})"


def cycle_name(multiplier):
    # testtime.py:489
    return f"C{multiplier:.2f}".rstrip("0").rstrip(".")


def tau_for_interval(user_times, target):
    # testtime.py:420 ported with len(user_times) instead of the literal 5.
    # Identical to Python for full 5-trial intervals; correct for partial.
    if not user_times:
        return None
    return sum(user_times) / (target * len(user_times))


def mean_tau(taus):
    filtered = [t for t in taus if t is not None]
    if not filtered:
        return None
    return sum(filtered) / len(filtered)


def cycles_table(mean_tau_value):
    # testtime.py:485-504
    CYCLE_CONSTANT = 8.5
    rows = []
    multiplier = 0.25
    while multiplier <= 12:
        cycle_value = mean_tau_value * CYCLE_CONSTANT * multiplier
        age = years_to_age_string(cycle_value)
        rows.append(
            {
                "cycle": cycle_name(multiplier),
                "multiplier": multiplier,
                "value": round(cycle_value, 3),
                "age": age,
            }
        )
        multiplier += 0.25
    return rows


# --- Fixture inputs ---------------------------------------------------------


def sigma_fixtures():
    cases = [
        {"values": [], "mean": 0},
        {"values": [1.0], "mean": 1.0},
        {"values": [1.0, 1.0], "mean": 1.0},
        {"values": [1.0, 2.0, 3.0, 4.0], "mean": 2.5},
        {"values": [0.98, 1.02, 1.01, 0.99], "mean": 1.0},
        {"values": [1.9, 2.0, 2.1, 1.95, 2.05], "mean": 2.0},
    ]
    return [{**c, "expected": calculate_sigma(c["values"], c["mean"])} for c in cases]


def age_string_fixtures():
    inputs = [
        0.0,
        0.08,
        0.5,
        1.0,
        1.9999,
        3.0,
        12.0,
        # realistic τ × 8.5 × k outputs from a session with mean τ ≈ 1.0
        0.25,
        1.0625,
        2.125,
        4.25,
        8.5,
        17.0,
        25.5,
        51.0,
        102.0,
    ]
    return [{"years": y, "expected": years_to_age_string(y)} for y in inputs]


def session_fixture():
    # Representative full 20-trial session (4 intervals × 5 trials)
    intervals = [2.0, 3.0, 4.0, 5.0]
    trials_by_interval = [
        [1.98, 2.03, 1.95, 2.02, 2.00],
        [2.97, 3.05, 2.96, 3.02, 3.00],
        [3.96, 4.04, 4.01, 3.98, 4.00],
        [4.95, 5.05, 4.98, 5.02, 5.00],
    ]
    per_interval_suma = [sum(t) for t in trials_by_interval]
    per_interval_tau = [
        tau_for_interval(trials_by_interval[i], intervals[i]) for i in range(4)
    ]
    mean = mean_tau(per_interval_tau)
    sigma = calculate_sigma(per_interval_tau, mean)
    return {
        "intervals": intervals,
        "trials": trials_by_interval,
        "per_interval_suma": per_interval_suma,
        "per_interval_tau": per_interval_tau,
        "mean_tau": mean,
        "sigma_tau": sigma,
        "cycles": cycles_table(mean),
    }


def cycles_fixture():
    return {"mean_tau": 1.0, "rows": cycles_table(1.0)}


def partial_tau_fixture():
    user_times = [1.98, 2.03, 1.95]
    return {
        "target": 2.0,
        "trials": user_times,
        "tau": tau_for_interval(user_times, 2.0),
    }


# --- Runner -----------------------------------------------------------------


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    out_dir = os.path.abspath(os.path.join(here, "..", "tests", "fixtures"))
    os.makedirs(out_dir, exist_ok=True)

    files = {
        "sigma.json": sigma_fixtures(),
        "ageString.json": age_string_fixtures(),
        "session.json": session_fixture(),
        "cycles.json": cycles_fixture(),
        "partialTau.json": partial_tau_fixture(),
    }
    for name, data in files.items():
        path = os.path.join(out_dir, name)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"wrote {path}")


if __name__ == "__main__":
    main()
