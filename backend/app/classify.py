"""
Classification helpers — the "understanding" layer.

Right now these use keyword matching against the structured fields, which is
enough to pass every provided test case. The interface is deliberately small
so the LLM extractor can later return these classifications directly (or an
LLM call can replace any single function here) without touching the engine.
"""
from __future__ import annotations

import re
from datetime import date, timedelta
from typing import Any, Optional

from .schemas import Claim

# --- doctor registration --------------------------------------------------

# Standard medical council format: KA/45678/2015  ->  [State]/[Number]/[Year]
_STD_REG = re.compile(r"^[A-Za-z]{2}/\d+/\d{4}$")
# AYUSH format: AYUR/KL/2345/2019  (Ayurveda / Homeopathy councils)
_AYUSH_REG = re.compile(r"^(AYUR|HOMEO|UNANI)/[A-Za-z]{2}/\d+/\d{4}$", re.IGNORECASE)


def valid_doctor_reg(reg: Optional[str]) -> bool:
    """Accept both standard council and AYUSH registration formats."""
    if not reg:
        return False
    reg = reg.strip()
    return bool(_STD_REG.match(reg) or _AYUSH_REG.match(reg))


# --- claim "domain" -------------------------------------------------------

_WEIGHT_LOSS = ("obesity", "bariatric", "weight loss", "weight-loss", "slimming")
_DENTAL = ("root canal", "tooth", "teeth", "dental", "filling", "extraction", "cavity")
_ALT_MED = ("ayurveda", "panchakarma", "homeopath", "unani", "naturopath")
# Pre-auth tests are no longer hardcoded — read from policy via detect_domain()


def _claim_text(claim: Claim) -> str:
    """All free text on the claim, lowercased, for keyword matching."""
    p = claim.prescription
    parts: list[str] = []
    if p:
        parts += [
            p.diagnosis or "",
            p.treatment or "",
            " ".join(p.procedures),
            " ".join(p.tests_prescribed),
            " ".join(p.medicines_prescribed),
        ]
    parts += list(claim.bill.keys())
    return " ".join(parts).lower()


def detect_domain(claim: Claim, policy: dict[str, Any] | None = None) -> str:
    """Classify the claim into a coverage domain.

    Returns one of: weight_loss | diagnostic_preauth | dental |
    alternative | general

    Pre-auth test keywords are read from policy_terms.json so the admin
    can add/remove tests without touching code.
    """
    from . import policy as P
    preauth_keywords = P.preauth_tests(policy or P.get_policy())

    text = _claim_text(claim)
    keys = {k.lower() for k in claim.bill}

    if any(w in text for w in _WEIGHT_LOSS) or "diet_plan" in keys:
        return "weight_loss"
    # Check both free text and bill key names against policy-driven keyword list
    bill_key_text = " ".join(keys)
    if any(t in text or t in bill_key_text for t in preauth_keywords):
        return "diagnostic_preauth"
    if any(w in text for w in _DENTAL) or "root_canal" in keys:
        return "dental"
    if any(w in text for w in _ALT_MED) or "therapy_charges" in keys:
        return "alternative"
    return "general"


# --- exclusions & waiting periods ----------------------------------------

def matched_exclusion(claim: Claim) -> Optional[str]:
    """Return a human label if the whole claim hits a hard exclusion."""
    text = _claim_text(claim)
    if any(w in text for w in _WEIGHT_LOSS):
        return "Weight loss treatments"
    # extend here: infertility, experimental, etc. (semantic match)
    return None


def specific_ailment_waiting(
    claim: Claim, policy: dict[str, Any]
) -> tuple[Optional[str], Optional[int]]:
    """Map the diagnosis to a specific-ailment waiting period, if any."""
    diag = (claim.prescription.diagnosis if claim.prescription else "") or ""
    diag = diag.lower()
    specific = policy["waiting_periods"].get("specific_ailments", {})
    for ailment, days in specific.items():
        if ailment.replace("_", " ") in diag:
            return ailment, int(days)
    return None, None


def eligible_from(join: date, days: int) -> date:
    return join + timedelta(days=days)


# --- bill line items ------------------------------------------------------

def line_items(claim: Claim) -> list[tuple[str, float]]:
    """Numeric bill lines as (name, amount); ignores non-numeric values."""
    out: list[tuple[str, float]] = []
    for key, val in claim.bill.items():
        if isinstance(val, (int, float)) and not isinstance(val, bool):
            out.append((key, float(val)))
    return out


def is_cosmetic_line(name: str) -> bool:
    n = name.lower()
    return "whitening" in n or "cosmetic" in n or "aesthetic" in n


def pretty(name: str) -> str:
    """teeth_whitening -> 'Teeth whitening'."""
    return name.replace("_", " ").capitalize()


# --- fraud ----------------------------------------------------------------

def fraud_flags(claim: Claim, high_value: float = 25000.0) -> list[str]:
    flags: list[str] = []
    if claim.previous_claims_same_day and claim.previous_claims_same_day >= 2:
        flags += ["Multiple claims same day", "Unusual pattern detected"]
    if claim.claim_amount > high_value:
        flags.append("High-value claim above review threshold")
    return flags
