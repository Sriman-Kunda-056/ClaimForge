# OPD Claim Adjudication — Backend

Automated approval/rejection of outpatient (OPD) insurance claims. A
deterministic rule engine makes every decision and does all money math; an
LLM layer (next phase) handles document understanding and explanation.

## Status

| Layer | State |
|-------|-------|
| Pydantic data contracts (`Claim`, `Decision`) | ✅ done |
| Policy loader (`policy_terms.json`) | ✅ done |
| Classification (domain, exclusions, waiting periods, reg validation) | ✅ done |
| **Deterministic adjudication engine** | ✅ done — **passes all 10 official test cases** |
| FastAPI server (`/adjudicate`, `/policy`, `/health`) | ✅ done |
| Test harness (pytest + readable report) | ✅ done |
| OCR ingestion (Tesseract) | ⏳ next |
| LLM extraction (open-source, schema-enforced) | ⏳ next |
| LLM explanation + confidence blend | ⏳ next |
| React frontend | ⏳ next |

## Run it

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# verify the engine against the 10 official cases
python tests/test_adjudication.py      # readable report
python -m pytest tests/ -v             # CI form

# start the API (interactive docs at http://localhost:8000/docs)
uvicorn app.main:app --reload
```

Example request:

```bash
curl -X POST http://localhost:8000/adjudicate \
  -H "Content-Type: application/json" \
  -d '{"member_id":"EMP001","member_name":"Rajesh Kumar",
       "treatment_date":"2024-11-01","claim_amount":1500,
       "prescription":{"doctor_reg":"KA/45678/2015","diagnosis":"Viral fever"},
       "bill":{"consultation_fee":1000,"diagnostic_tests":500}}'
# -> {"decision":"APPROVED","approved_amount":1350, ...}
```

## Architecture

```
Upload (image/PDF)
  → [1] Ingestion + OCR (Tesseract / PDF text layer)   → raw text
  → [2] Extraction (open-source LLM, schema-enforced)   → Claim
  → [3] Decision Engine (deterministic, no LLM)         → Decision
  → [4] Explanation (LLM)                               → notes + confidence
  → [5] Persist (SQLite)                                → React UI
```

Each layer sits behind a small interface, so any one (OCR provider, LLM,
storage) can be swapped without touching the others. The LLM **never** does
arithmetic or makes decisions — that is the engine's job — which keeps
amounts exact and the logic auditable.

## Decision precedence

Checks run in a fixed order so the correct reason fires when several apply:
missing prescription → invalid doctor reg → waiting period → exclusion →
pre-authorisation → per-claim limit → amount-by-domain → fraud escalation.

## Assumptions & resolved ambiguities

The provided rules and the expected test outputs conflict in a few places.
The expected outputs were treated as ground truth; resolutions:

1. **Co-pay base** — the 10% co-pay applies to the whole general-OPD bill
   (TC001), not just the consultation line. Dental and alternative-medicine
   claims carry no co-pay (TC002, TC006).
2. **Per-claim limit** — enforced for general OPD (TC003) but not for dental,
   where the dental sub-limit governs (TC002 approves ₹8,000 > ₹5,000).
3. **Network discount** — the 20% network discount replaces co-pay for
   network/cashless claims (TC010).
4. **MRI/CT pre-auth** — required despite `pre_authorization_required: false`,
   per the "(with pre-auth)" tag (TC007).
5. **AYUSH registration** — `AYUR/KL/2345/2019` is accepted even though it
   does not fit the standard `State/Number/Year` format (TC006).
6. **Exclusions are matched semantically** — "Obesity / Bariatric / diet plan"
   maps to the "Weight loss treatments" exclusion (TC009).
7. **Confidence scores** are calibrated to how deterministic each outcome is;
   in production they blend with OCR and extraction certainty.

## Next steps

OCR ingestion → open-source LLM extraction (Instructor + Pydantic) →
LLM explanation → SQLite persistence → React UI.
