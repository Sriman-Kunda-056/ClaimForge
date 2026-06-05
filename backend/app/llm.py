"""
LLM layer — two jobs:
  1. extract_from_image / extract_from_text  → structured fields from a document
  2. explain_decision                         → professional member-facing explanation

Every call is logged to the ai_logs table (tokens, latency, I/O preview).
"""
from __future__ import annotations

import base64
import json
import os
import time

EXTRACT_SYSTEM = """You are a medical document parser for an OPD insurance claims system in India.
Extract structured information from the provided medical document (prescription, bill, or lab report).
Return ONLY valid JSON with these fields (omit fields you cannot read, never guess):
{
  "doctor_name": "string or null",
  "doctor_reg": "string or null — look for registration/reg no, MCI no, state medical council number",
  "diagnosis": "string or null",
  "medicines_prescribed": ["list of medicine names"],
  "procedures": ["list of procedure names"],
  "tests_prescribed": ["list of test names"],
  "treatment": "string or null — for alternative medicine treatments",
  "bill_items": {"item_name": rupee_amount},
  "total_amount": number_or_null,
  "hospital": "string or null",
  "patient_name": "string or null"
}"""

EXPLAIN_SYSTEM = """You are a professional insurance claims officer at an OPD health insurance company in India.
Write a clear, empathetic, and professional explanation of an adjudication decision for the member.
Be specific: mention the actual amounts, the policy rule that applied, and what the member should do next.
Keep it to 2–3 sentences. Do not use jargon. Write in second person ('Your claim…')."""


def _client():
    from openai import OpenAI
    return OpenAI(
        base_url=os.getenv("LLM_BASE_URL", "https://api.groq.com/openai/v1"),
        api_key=os.getenv("LLM_API_KEY", ""),
    )


def _log(call_type, model, prompt, response, usage, latency_ms, error=None):
    try:
        from .database import log_ai_call
        log_ai_call(
            call_type=call_type,
            model=model,
            prompt_preview=prompt,
            response_preview=response,
            prompt_tokens=getattr(usage, "prompt_tokens", 0) if usage else 0,
            completion_tokens=getattr(usage, "completion_tokens", 0) if usage else 0,
            latency_ms=latency_ms,
            error=str(error) if error else None,
        )
    except Exception:
        pass


def extract_from_image(image_bytes: bytes, media_type: str) -> dict:
    client = _client()
    b64 = base64.b64encode(image_bytes).decode()
    model = os.getenv("LLM_VISION_MODEL", "meta-llama/llama-4-scout-17b-16e-instruct")
    prompt_text = EXTRACT_SYSTEM + "\n\nExtract all readable information from this medical document image."

    t0 = time.time()
    error = None
    usage = None
    result_text = None
    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": [
                {"type": "image_url", "image_url": {"url": f"data:{media_type};base64,{b64}"}},
                {"type": "text", "text": prompt_text},
            ]}],
            temperature=0,
            max_tokens=1024,
            response_format={"type": "json_object"},
        )
        result_text = resp.choices[0].message.content
        usage = resp.usage
        return json.loads(result_text)
    except Exception as e:
        error = e
        raise
    finally:
        _log("extraction", model, prompt_text[:300] + " [+ image]", result_text,
             usage, int((time.time() - t0) * 1000), error)


def extract_from_text(text: str) -> dict:
    client = _client()
    model = os.getenv("LLM_MODEL", "llama-3.3-70b-versatile")

    t0 = time.time()
    error = None
    usage = None
    result_text = None
    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": EXTRACT_SYSTEM},
                {"role": "user", "content": f"Extract information from this medical document:\n\n{text[:2000]}"},
            ],
            temperature=0,
            max_tokens=1024,
            response_format={"type": "json_object"},
        )
        result_text = resp.choices[0].message.content
        usage = resp.usage
        return json.loads(result_text)
    except Exception as e:
        error = e
        raise
    finally:
        _log("extraction", model, text[:300], result_text, usage,
             int((time.time() - t0) * 1000), error)


def explain_decision(claim_dict: dict, decision_dict: dict) -> str:
    client = _client()
    model = os.getenv("LLM_MODEL", "llama-3.3-70b-versatile")

    prompt = (
        f"Claim summary:\n"
        f"- Member: {claim_dict.get('member_name')}, treatment on {claim_dict.get('treatment_date')}\n"
        f"- Diagnosis: {(claim_dict.get('prescription') or {}).get('diagnosis', 'No prescription')}\n"
        f"- Amount claimed: ₹{claim_dict.get('claim_amount', 0)}\n"
        f"- Hospital: {claim_dict.get('hospital', 'Not specified')}\n\n"
        f"Decision: {decision_dict.get('decision')}\n"
        f"Approved amount: ₹{decision_dict.get('approved_amount', 0)}\n"
        f"Reason codes: {', '.join(decision_dict.get('rejection_reasons', []) or [decision_dict.get('decision', '')])}\n"
        f"Deductions: {json.dumps(decision_dict.get('deductions', {}))}\n\n"
        f"Write a professional member-facing explanation."
    )

    t0 = time.time()
    error = None
    usage = None
    result_text = None
    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": EXPLAIN_SYSTEM},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            max_tokens=200,
        )
        result_text = resp.choices[0].message.content.strip()
        usage = resp.usage
        return result_text
    except Exception as e:
        error = e
        return decision_dict.get("notes", "")
    finally:
        _log("explanation", model, prompt, result_text, usage,
             int((time.time() - t0) * 1000), error)


FRAUD_SYSTEM = """You are a senior insurance fraud analyst reviewing OPD health insurance claims in India.
Analyze the claim for suspicious patterns or inconsistencies that clearly suggest fraud or abuse.

Return ONLY valid JSON:
{
  "risk_level": "LOW" | "MEDIUM" | "HIGH",
  "risk_score": 0-100,
  "flags": ["list of specific concerns — empty if none"],
  "reasoning": "1-2 sentence summary"
}

Important context for India OPD claims:
- Round bill amounts (₹500, ₹1000, ₹1500, ₹2000) are COMPLETELY NORMAL — most clinics charge fixed fees.
  Do NOT flag round numbers unless they are implausibly large (e.g. ₹50000 for a consultation).
- Standard OPD amounts (₹500–₹5000) for common conditions are expected and should be LOW risk.
- Only flag HIGH risk for clear medical inconsistencies: e.g. cardiac stress test billed for a cold,
  expensive procedures with no clinical justification, or bill items with zero relation to the diagnosis.

Flag HIGH risk only for:
- Diagnosis clearly inconsistent with billed procedures (e.g. MRI/CT for mild fever)
- Expensive specialist procedures billed for trivial diagnoses
- Bill items that have no possible connection to the stated diagnosis

Flag MEDIUM risk for:
- Some mismatch between medicines and diagnosis that could be explained
- Multiple expensive tests for a single mild condition

Return LOW if the claim looks like a normal OPD visit, even if amounts are round numbers."""


def analyze_fraud(claim_dict: dict) -> dict:
    """AI-powered fraud analysis — runs after the rule engine, only on APPROVED/PARTIAL claims."""
    client = _client()
    model = os.getenv("LLM_MODEL", "llama-3.3-70b-versatile")

    presc = claim_dict.get("prescription") or {}
    bill = claim_dict.get("bill") or {}

    prompt = (
        f"Claim to analyze:\n"
        f"- Diagnosis: {presc.get('diagnosis', 'not provided')}\n"
        f"- Medicines: {', '.join(presc.get('medicines_prescribed', []) or []) or 'none'}\n"
        f"- Procedures: {', '.join(presc.get('procedures', []) or []) or 'none'}\n"
        f"- Tests: {', '.join(presc.get('tests_prescribed', []) or []) or 'none'}\n"
        f"- Treatment: {presc.get('treatment', 'none')}\n"
        f"- Doctor reg: {presc.get('doctor_reg', 'not provided')}\n"
        f"- Bill items: {json.dumps(bill)}\n"
        f"- Total claimed: ₹{claim_dict.get('claim_amount', 0)}\n"
        f"- Previous claims same day: {claim_dict.get('previous_claims_same_day', 0)}\n"
        f"- Hospital: {claim_dict.get('hospital', 'not specified')}\n"
    )

    t0 = time.time()
    error = None
    usage = None
    result_text = None
    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": FRAUD_SYSTEM},
                {"role": "user", "content": prompt},
            ],
            temperature=0,
            max_tokens=300,
            response_format={"type": "json_object"},
        )
        result_text = resp.choices[0].message.content
        usage = resp.usage
        result = json.loads(result_text)
        return result
    except Exception as e:
        error = e
        return {"risk_level": "LOW", "risk_score": 0, "flags": [], "reasoning": "Analysis unavailable"}
    finally:
        _log("fraud_analysis", model, prompt, result_text, usage,
             int((time.time() - t0) * 1000), error)
