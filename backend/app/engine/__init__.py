"""
The deterministic adjudication engine.

ALL decisions and money math live here. No LLM is ever called in this path —
the LLM only feeds it a structured Claim and later phrases the result. This
separation is deliberate: it keeps amounts exact, the logic unit-testable,
and the decisions auditable.

The checks run in a fixed precedence order (see the rules doc) so that the
*correct* rejection reason fires when several could apply.
"""
from __future__ import annotations

from typing import Any

from .. import classify, policy as P
from ..schemas import Claim, Decision

# Confidence baselines, calibrated to how deterministic each outcome is.
# (In production this is blended with OCR + extraction certainty.)
CONF = {
    "MISSING_DOCUMENTS": 1.00,
    "DOCTOR_REG_INVALID": 0.97,
    "WAITING_PERIOD": 0.96,
    "SERVICE_NOT_COVERED": 0.97,
    "PRE_AUTH_MISSING": 0.94,
    "PER_CLAIM_EXCEEDED": 0.98,
    "APPROVE_GENERAL": 0.95,
    "APPROVE_NETWORK": 0.93,
    "APPROVE_PARTIAL": 0.92,
    "APPROVE_ALT": 0.89,
    "MANUAL_REVIEW": 0.65,
}


def adjudicate(claim: Claim, policy: dict[str, Any] | None = None,
               claim_id: str = "CLM_AUTO") -> Decision:
    policy = policy or P.get_policy()
    cov = P.coverage(policy)

    def reject(code: str, notes: str, steps: str) -> Decision:
        return Decision(
            claim_id=claim_id, decision="REJECTED",
            rejection_reasons=[code], confidence_score=CONF[code],
            notes=notes, next_steps=steps,
        )

    # 1. Documents -- prescription is mandatory
    if claim.prescription is None:
        return reject(
            "MISSING_DOCUMENTS",
            "A prescription from a registered doctor is required.",
            "Resubmit the claim including the doctor's prescription.",
        )

    # 2. Doctor registration validity
    if not classify.valid_doctor_reg(claim.prescription.doctor_reg):
        return reject(
            "DOCTOR_REG_INVALID",
            "The doctor's registration number is missing or invalid.",
            "Resubmit with a valid registration number "
            "(format: State/Number/Year).",
        )

    # 3. Waiting period (diagnosis -> specific ailment)
    ailment, wait_days = classify.specific_ailment_waiting(claim, policy)
    if claim.member_join_date and wait_days:
        eligible = classify.eligible_from(claim.member_join_date, wait_days)
        if claim.treatment_date < eligible:
            label = ailment.replace("_", " ").title()
            return reject(
                "WAITING_PERIOD",
                f"{label} has a {wait_days}-day waiting period. "
                f"Eligible from {eligible.isoformat()}.",
                f"You can claim for this condition from {eligible.isoformat()}.",
            )

    # 4. Coverage exclusions (semantic)
    excl = classify.matched_exclusion(claim)
    if excl:
        return reject(
            "SERVICE_NOT_COVERED",
            f"{excl} are excluded from coverage under this policy.",
            "This treatment is not eligible for reimbursement.",
        )

    domain = classify.detect_domain(claim, policy)

    # 5. Pre-authorisation for high-end imaging (MRI / CT)
    if domain == "diagnostic_preauth" and not claim.pre_authorized:
        return reject(
            "PRE_AUTH_MISSING",
            "MRI/CT scans require pre-authorisation for high-value "
            "diagnostic claims.",
            "Obtain pre-authorisation and resubmit the claim.",
        )

    lines = classify.line_items(claim)
    total = round(sum(amt for _, amt in lines), 2)

    # 6 & 7. Amount + decision, by domain
    if domain == "dental":
        decision = _adjudicate_dental(claim, policy, lines, claim_id)
    elif domain == "alternative":
        decision = _adjudicate_alt(total, policy, claim_id)
    else:  # general OPD (consultation / diagnostic / pharmacy)
        decision = _adjudicate_general(claim, policy, total, claim_id)

    # 8. Fraud indicators escalate an otherwise-clear claim to manual review
    flags = classify.fraud_flags(claim)
    if flags and decision.decision in ("APPROVED", "PARTIAL"):
        decision.decision = "MANUAL_REVIEW"
        decision.flags = flags
        decision.confidence_score = CONF["MANUAL_REVIEW"]
        decision.notes = (
            "Routed to manual review: potential fraud indicators detected."
        )
        decision.next_steps = "A claims specialist will review this claim."

    return decision


# --- per-domain handlers --------------------------------------------------

def _adjudicate_dental(claim, policy, lines, claim_id) -> Decision:
    covered = [(n, a) for n, a in lines if not classify.is_cosmetic_line(n)]
    excluded = [(n, a) for n, a in lines if classify.is_cosmetic_line(n)]
    sub = P.sub_limit(policy, "dental")
    approved = round(min(sum(a for _, a in covered), sub), 2)
    rejected_items = [f"{classify.pretty(n)} - cosmetic procedure" for n, _ in excluded]

    if excluded:
        return Decision(
            claim_id=claim_id, decision="PARTIAL", approved_amount=approved,
            rejected_items=rejected_items, confidence_score=CONF["APPROVE_PARTIAL"],
            notes="Covered dental treatment approved; cosmetic items excluded.",
            next_steps="The approved amount will be reimbursed.",
        )
    return Decision(
        claim_id=claim_id, decision="APPROVED", approved_amount=approved,
        confidence_score=CONF["APPROVE_GENERAL"],
        notes="Dental treatment covered under policy.",
        next_steps="The approved amount will be reimbursed.",
    )


def _adjudicate_alt(total, policy, claim_id) -> Decision:
    sub = P.sub_limit(policy, "alternative")
    approved = round(min(total, sub), 2)
    return Decision(
        claim_id=claim_id, decision="APPROVED", approved_amount=approved,
        confidence_score=CONF["APPROVE_ALT"],
        notes="Alternative medicine treatment covered under policy.",
        next_steps="The approved amount will be reimbursed.",
    )


def _adjudicate_general(claim, policy, total, claim_id) -> Decision:
    per_claim = P.per_claim_limit(policy)
    if total > per_claim:
        return Decision(
            claim_id=claim_id, decision="REJECTED",
            rejection_reasons=["PER_CLAIM_EXCEEDED"],
            confidence_score=CONF["PER_CLAIM_EXCEEDED"],
            notes=f"Claim amount of \u20b9{total:.0f} exceeds the per-claim "
                  f"limit of \u20b9{per_claim:.0f}.",
            next_steps="Only claims up to the per-claim limit are eligible.",
        )

    is_network = claim.hospital in P.network_hospitals(policy)
    if is_network:
        disc = round(total * P.network_discount_percentage(policy) / 100)
        approved = round(total - disc, 2)
        cashless = bool(
            claim.cashless_request and total <= P.instant_approval_limit(policy)
        )
        return Decision(
            claim_id=claim_id, decision="APPROVED", approved_amount=approved,
            deductions={"network_discount": disc}, cashless_approved=cashless,
            confidence_score=CONF["APPROVE_NETWORK"],
            notes="Treatment at a network hospital; network discount applied.",
            next_steps="Cashless settlement processed at the network hospital."
            if cashless else "The approved amount will be reimbursed.",
        )

    copay = round(total * P.copay_percentage(policy) / 100)
    approved = round(total - copay, 2)
    return Decision(
        claim_id=claim_id, decision="APPROVED", approved_amount=approved,
        deductions={"copay": copay}, confidence_score=CONF["APPROVE_GENERAL"],
        notes="Claim approved after applying the applicable co-payment.",
        next_steps="The approved amount will be reimbursed.",
    )
