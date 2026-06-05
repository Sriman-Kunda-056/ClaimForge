"""Loads, caches, and saves the policy configuration (policy_terms.json)."""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

_POLICY_PATH = Path(__file__).resolve().parents[1] / "policy_terms.json"


@lru_cache(maxsize=1)
def get_policy() -> dict[str, Any]:
    with open(_POLICY_PATH, "r", encoding="utf-8") as fh:
        return json.load(fh)


def save_policy(data: dict[str, Any]) -> None:
    with open(_POLICY_PATH, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)
    get_policy.cache_clear()


# ── convenience accessors ─────────────────────────────────────────────────────

def coverage(policy: dict[str, Any]) -> dict[str, Any]:
    return policy["coverage_details"]

def per_claim_limit(policy: dict[str, Any]) -> float:
    return float(policy["coverage_details"]["per_claim_limit"])

def annual_limit(policy: dict[str, Any]) -> float:
    return float(policy["coverage_details"]["annual_limit"])

def sub_limit(policy: dict[str, Any], category: str) -> float:
    cov = policy["coverage_details"]
    mapping = {
        "consultation": "consultation_fees",
        "diagnostic":   "diagnostic_tests",
        "pharmacy":     "pharmacy",
        "dental":       "dental",
        "vision":       "vision",
        "alternative":  "alternative_medicine",
    }
    key = mapping.get(category)
    if key and "sub_limit" in cov.get(key, {}):
        return float(cov[key]["sub_limit"])
    return float("inf")

def copay_percentage(policy: dict[str, Any]) -> float:
    return float(policy["coverage_details"]["consultation_fees"]["copay_percentage"])

def network_discount_percentage(policy: dict[str, Any]) -> float:
    return float(policy["coverage_details"]["consultation_fees"]["network_discount"])

def waiting_periods(policy: dict[str, Any]) -> dict[str, Any]:
    return policy["waiting_periods"]

def exclusions(policy: dict[str, Any]) -> list[str]:
    return policy["exclusions"]

def network_hospitals(policy: dict[str, Any]) -> list[str]:
    return policy.get("network_hospitals", [])

def instant_approval_limit(policy: dict[str, Any]) -> float:
    return float(policy["cashless_facilities"]["instant_approval_limit"])

def preauth_tests(policy: dict[str, Any]) -> tuple[str, ...]:
    """Return lowercase keyword list of tests that require pre-authorisation.

    Reads from coverage_details.diagnostic_tests.covered_tests — any entry
    that contains '(with pre-auth)' is considered a pre-auth required test.
    Falls back to a safe default if the key is missing.
    """
    covered = (
        policy.get("coverage_details", {})
              .get("diagnostic_tests", {})
              .get("covered_tests", [])
    )
    result = []
    for entry in covered:
        if "with pre-auth" in entry.lower():
            # Strip the annotation → "MRI (with pre-auth)" → "mri"
            keyword = entry.lower().split("(")[0].strip()
            result.append(keyword)
    return tuple(result) if result else ("mri", "ct scan", "ct-scan")
