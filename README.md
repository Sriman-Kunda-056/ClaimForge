# ClaimForge - AI-Powered OPD Insurance Claim Adjudication

ClaimForge automates the review and approval of outpatient (OPD) health insurance claims. An employee uploads a medical document (prescription or bill), the system reads it with AI, evaluates it against the policy, and returns an instant decision — **APPROVED / PARTIAL / REJECTED / MANUAL_REVIEW** — with an amount, reasoning, and a member-facing explanation.

---

## What it does

| Step | What happens |
|------|-------------|
| **1. Upload** | Employee uploads a prescription image or bill PDF |
| **2. Extract** | LLM vision reads the document and pulls out structured fields (doctor, diagnosis, medicines, bill items, amounts) |
| **3. Adjudicate** | A deterministic rule engine evaluates the claim against the policy — no LLM involved in the decision itself |
| **4. Explain** | LLM writes a plain-language explanation for the member |
| **5. Review** | Reviewer can override any decision; appeals thread available |

The LLM only handles *language work* (reading documents, writing explanations). All money arithmetic and approve/reject logic is pure Python — exact, auditable, and testable.

---

## Key Features

### AI Document Extraction
- Upload prescription images (PNG/JPG) or bill PDFs
- LLM vision model reads handwritten and printed documents
- Auto-fills the claim form with extracted fields: doctor name, registration, diagnosis, medicines, procedures, bill items, total

### Deterministic Decision Engine
Rules run in fixed precedence — the first matching rule fires:

1. **Missing documents** — prescription mandatory
2. **Doctor registration** — validates format (State/Number/Year, MCI, AYUSH)
3. **Waiting period** — specific ailments blocked before eligibility date
4. **Exclusions** — cosmetic, experimental, and excluded services blocked
5. **Pre-authorisation** — MRI/CT require pre-auth
6. **Per-claim limit** — general OPD capped at policy limit
7. **Domain-specific rules** — dental sub-limit, cosmetic line removal, alternative medicine cap
8. **Fraud detection** — same-day duplicate claims, round-number bills, diagnosis-medicine mismatch → MANUAL_REVIEW

### Coverage Rules Handled
- General OPD with 10% co-pay
- Network hospital 20% discount (replaces co-pay) + cashless approval
- Dental sub-limit with cosmetic procedure exclusion
- Alternative medicine (AYUSH) sub-limit
- Annual limit tracking across all claims
- Duplicate claim detection (same bill cannot be reimbursed twice)

### Role-Based Dashboards

| Role | What they can do |
|------|-----------------|
| **Employee** | Submit claims, upload documents, AI extraction, view own claim history with appeal thread |
| **Reviewer** | See full claims queue, review MANUAL_REVIEW cases, override decisions with reason, reply to appeals |
| **Admin** | KPI analytics dashboard, decision breakdown charts, live policy editor (edit limits and rules without redeploying) |
| **AI Agent** | Evaluation runner (runs all 10 test cases, shows accuracy %), AI activity log (every LLM call: model, tokens, latency, I/O preview) |

### Live Policy Editor
Admins can change coverage limits, sub-limits, co-pay percentages, waiting periods, and exclusions directly from the UI. Changes take effect on the next claim — no code deployment needed.

### Appeals
Employees can open an appeal on any rejected claim. Reviewers reply directly in a threaded conversation. Both sides see the full thread.

---

## Architecture

```
Frontend (React + Vite)          Backend (FastAPI)
──────────────────────           ──────────────────────────────────────
Employee Dashboard      ──────►  POST /extract      → LLM vision/text
Reviewer Dashboard      ──────►  POST /adjudicate   → Rule engine → LLM explain
Admin Dashboard         ──────►  GET  /claims        → SQLite
AI Agent Dashboard      ──────►  GET  /stats
                                 PUT  /policy
                                 GET  /ai-logs
```

**Key design choice:** the rule engine and LLM are completely separate. The engine runs first and produces a decision; the LLM only phrases it into readable notes afterward. Swapping the LLM provider never changes a claim outcome.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, JavaScript (JSX), Vite, Tailwind CSS 4 |
| Backend | FastAPI, Python 3.12, Pydantic v2 |
| Database | SQLite (file-based, zero config) |
| AI / LLM | Groq API (llama-4-scout for vision, llama-3.3-70b for text) via OpenAI-compatible SDK |
| Auth | Token-based, persisted in SQLite |

**Provider switching** requires only `.env` changes — no code changes:
```
LLM_BASE_URL=https://api.groq.com/openai/v1   # or Together AI / local Ollama
LLM_API_KEY=...
LLM_MODEL=llama-3.3-70b-versatile
LLM_VISION_MODEL=meta-llama/llama-4-scout-17b-16e-instruct
```

---

## Running Locally

### Prerequisites
- Python 3.11+
- Node.js 18+
- A Groq API key (free at [console.groq.com](https://console.groq.com)) — optional, only needed for AI extraction

### Backend
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
source .venv/bin/activate     # Mac/Linux
pip install -r requirements.txt

# Create .env from the example
copy .env.example .env        # Windows
cp .env.example .env          # Mac/Linux
# Edit .env and add your LLM_API_KEY

uvicorn app.main:app --reload --port 8000
```

Backend runs at `http://localhost:8000`
API docs at `http://localhost:8000/docs`

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:5173` and proxies `/api/*` to the backend.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `LLM_API_KEY` | For AI features | Groq (or other provider) API key |
| `LLM_BASE_URL` | No | API endpoint (default: `https://api.groq.com/openai/v1`) |
| `LLM_MODEL` | No | Text model (default: `llama-3.3-70b-versatile`) |
| `LLM_VISION_MODEL` | No | Vision model (default: `meta-llama/llama-4-scout-17b-16e-instruct`) |
| `DB_PATH` | No | SQLite file path (default: `backend/claims.db`) |

Without `LLM_API_KEY`, the app still runs — adjudication works fully, but AI extraction and LLM explanations are disabled.

---

## Demo Accounts

| Username | Password | Role |
|----------|----------|------|
| `employee` | `demo123` | Submit claims |
| `reviewer` | `demo123` | Review + override |
| `admin` | `admin123` | Analytics + policy |
| `ai_agent` | `agent123` | Eval runner + AI logs |

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/login` | Login → returns bearer token |
| GET | `/auth/me` | Current user info |
| POST | `/extract` | Upload image/PDF → extracted fields |
| POST | `/adjudicate` | Submit structured claim → decision |
| GET | `/claims` | Claim history (role-filtered) |
| POST | `/claims/{id}/override` | Reviewer override |
| POST | `/claims/{id}/appeal` | Submit appeal |
| GET | `/claims/{id}/thread` | Appeal message thread |
| GET | `/policy` | Current policy config |
| PUT | `/policy` | Update policy (admin only) |
| GET | `/stats` | Aggregate statistics |
| GET | `/ai-logs` | LLM call log (admin/ai_agent) |

---

## Test Suite

10 test cases covering all decision paths are encoded in `backend/tests/test_cases.json` and runnable from the AI Agent dashboard's Eval Runner tab. The engine is considered correct when all 10 pass.

```bash
cd backend
pytest tests/
```
