"""
Data contracts for the adjudication pipeline.

These Pydantic models are the *contract* between every layer:
  OCR/LLM extraction  ->  Claim
  deterministic engine ->  Decision

Keeping them strict (and typed) is what makes the engine testable and the
API self-documenting (FastAPI generates Swagger from these).
"""
from __future__ import annotations

from datetime import date
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class Prescription(BaseModel):
    """What the doctor wrote. Extracted from the prescription document."""

    model_config = ConfigDict(extra="ignore")

    doctor_name: Optional[str] = None
    doctor_reg: Optional[str] = None
    diagnosis: Optional[str] = None
    medicines_prescribed: list[str] = Field(default_factory=list)
    procedures: list[str] = Field(default_factory=list)
    tests_prescribed: list[str] = Field(default_factory=list)
    treatment: Optional[str] = None


class Claim(BaseModel):
    """A single OPD reimbursement claim, normalised into structured fields.

    `bill` is intentionally a free-form dict of line-item -> amount because
    every hospital itemises differently (consultation_fee, root_canal,
    mri_scan, diet_plan, ...). The engine classifies these lines itself.
    """

    model_config = ConfigDict(extra="ignore")

    member_id: str
    member_name: str
    member_join_date: Optional[date] = None
    treatment_date: date
    claim_amount: float = 0.0
    hospital: Optional[str] = None
    cashless_request: bool = False
    pre_authorized: bool = False
    previous_claims_same_day: int = 0

    prescription: Optional[Prescription] = None
    bill: dict[str, Any] = Field(default_factory=dict)

    @classmethod
    def from_input(cls, data: dict[str, Any]) -> "Claim":
        """Build a Claim from the assignment's `input_data` shape."""
        docs = data.get("documents", {}) or {}
        presc_raw = docs.get("prescription")
        prescription = Prescription(**presc_raw) if presc_raw else None
        return cls(
            member_id=data.get("member_id", ""),
            member_name=data.get("member_name", ""),
            member_join_date=data.get("member_join_date"),
            treatment_date=data["treatment_date"],
            claim_amount=data.get("claim_amount", 0.0),
            hospital=data.get("hospital"),
            cashless_request=data.get("cashless_request", False),
            pre_authorized=data.get("pre_authorized", False),
            previous_claims_same_day=data.get("previous_claims_same_day", 0),
            prescription=prescription,
            bill=docs.get("bill", {}) or {},
        )


Decision_t = Literal["APPROVED", "REJECTED", "PARTIAL", "MANUAL_REVIEW"]


class Decision(BaseModel):
    """The adjudication result. Mirrors the output schema in the rules doc."""

    claim_id: str = "CLM_AUTO"
    decision: Decision_t
    approved_amount: float = 0.0
    rejection_reasons: list[str] = Field(default_factory=list)
    rejected_items: list[str] = Field(default_factory=list)
    flags: list[str] = Field(default_factory=list)
    deductions: dict[str, float] = Field(default_factory=dict)
    cashless_approved: Optional[bool] = None
    confidence_score: float = 0.0
    notes: str = ""
    next_steps: str = ""
    ai_fraud_risk: Optional[dict] = None   # {"risk_level", "risk_score", "flags", "reasoning"}
