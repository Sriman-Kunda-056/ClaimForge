"""
Adjudication test harness.

Runs every case in test_cases.json through the engine and checks the output
against the assignment's expected results. Doubles as:
  * a pytest suite  ->  `python -m pytest tests/ -v`
  * a readable report ->  `python tests/test_adjudication.py`

Treating the 10 provided cases as the ground-truth spec is what locks in
correctness (and is the "evaluation metrics" bonus).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

# make `app` importable when run directly
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.engine import adjudicate          # noqa: E402
from app.policy import get_policy           # noqa: E402
from app.schemas import Claim               # noqa: E402

CASES_PATH = Path(__file__).resolve().parent / "test_cases.json"


def load_cases() -> list[dict]:
    with open(CASES_PATH, "r", encoding="utf-8") as fh:
        return json.load(fh)["test_cases"]


def evaluate(case: dict) -> tuple[list[str], dict]:
    """Run one case; return (list_of_failures, summary_for_report)."""
    claim = Claim.from_input(case["input_data"])
    out = adjudicate(claim, get_policy(), claim_id=case["case_id"])
    exp = case["expected_output"]
    fails: list[str] = []

    def check(field: str, expected, actual):
        if expected != actual:
            fails.append(f"{field}: expected {expected!r}, got {actual!r}")

    check("decision", exp["decision"], out.decision)
    if "approved_amount" in exp:
        check("approved_amount", exp["approved_amount"], out.approved_amount)
    if "rejection_reasons" in exp:
        check("rejection_reasons", exp["rejection_reasons"], out.rejection_reasons)
    if "rejected_items" in exp:
        check("rejected_items", exp["rejected_items"], out.rejected_items)
    if "flags" in exp:
        check("flags", exp["flags"], out.flags)
    if "cashless_approved" in exp:
        check("cashless_approved", exp["cashless_approved"], out.cashless_approved)
    if "confidence_score" in exp:
        check("confidence_score", exp["confidence_score"], out.confidence_score)

    summary = {
        "id": case["case_id"],
        "name": case["case_name"],
        "expected": exp["decision"],
        "got": out.decision,
        "amount": out.approved_amount,
        "conf": out.confidence_score,
        "ok": not fails,
    }
    return fails, summary


# --- pytest entrypoint ----------------------------------------------------

@pytest.mark.parametrize("case", load_cases(), ids=lambda c: c["case_id"])
def test_case(case):
    fails, _ = evaluate(case)
    assert not fails, f"{case['case_id']} ({case['case_name']}):\n  " + "\n  ".join(fails)


# --- readable report ------------------------------------------------------

def main() -> int:
    rows, passed = [], 0
    for case in load_cases():
        fails, summary = evaluate(case)
        rows.append((summary, fails))
        passed += summary["ok"]

    print("\n  OPD Adjudication Engine — Test Results")
    print("  " + "-" * 68)
    print(f"  {'CASE':<7}{'DECISION':<16}{'AMOUNT':>9}  {'CONF':>5}  RESULT")
    print("  " + "-" * 68)
    for summary, fails in rows:
        mark = "PASS" if summary["ok"] else "FAIL"
        amt = f"{summary['amount']:.0f}" if summary["amount"] else "-"
        print(f"  {summary['id']:<7}{summary['got']:<16}{amt:>9}  "
              f"{summary['conf']:>5.2f}  {mark}")
        if fails:
            for f in fails:
                print(f"           ! {f}")
    print("  " + "-" * 68)
    total = len(rows)
    print(f"  {passed}/{total} cases passed"
          + ("  \u2713 all green" if passed == total else "  -- see failures above"))
    print()
    return 0 if passed == total else 1


if __name__ == "__main__":
    raise SystemExit(main())
