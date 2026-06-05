# Architecture — OPD Claim Adjudication Tool

An AI-assisted system that automates the approval/rejection of outpatient
(OPD) insurance claims. A user uploads medical documents; the system extracts
the relevant fields, evaluates them against the policy, and returns a decision
(APPROVED / REJECTED / PARTIAL / MANUAL_REVIEW) with reasoning and a confidence
score.

---

## 1. Design principles

1. **Hybrid AI + deterministic split.** The LLM does *language* work
   (reading documents, phrasing explanations); a plain rule engine does all
   *decisions and arithmetic*. The LLM never computes an amount or decides an
   outcome — keeps money exact, decisions reproducible, and logic auditable.
2. **Swappable layers.** OCR, extraction, engine, explanation, and storage
   each sit behind a small interface. Any one can be replaced without touching
   the others.
3. **Config-driven rules.** Coverage limits, sub-limits, waiting periods, and
   exclusions live in `policy_terms.json` — editable live from the admin UI.
4. **The test cases are the spec.** All 10 provided cases are encoded as an
   automated suite; the engine is correct only when all 10 pass.

---

## 2. System architecture

```mermaid
flowchart TB
    subgraph Client["Frontend — React + TypeScript (Vite)"]
        EMP["Employee\nSubmit claims"]
        REV["Reviewer\nReview queue + override"]
        ADM["Admin\nAnalytics + policy editor"]
        AGT["AI Agent\nEval runner + AI logs"]
    end

    subgraph Server["Backend — FastAPI (Python)"]
        AUTH["Auth layer\n/auth/login · /auth/me"]
        R["REST routes\n/adjudicate · /extract · /claims · /policy · /ai-logs · /stats"]
        subgraph Pipeline["Adjudication pipeline"]
            direction TB
            EXT["1 · Document extraction\nLLM vision (images) / text (PDF)"]
            ENG["2 · Decision engine\ndeterministic — no LLM"]
            EXP["3 · Explanation\nLLM phrasing + confidence"]
        end
        DB[("SQLite\nclaims + ai_logs + overrides")]
    end

    LLM{{"LLM provider\nGroq / Together / Ollama"}}
    POLICY[/"policy_terms.json"/]

    Client -->|HTTPS + Bearer token| AUTH
    AUTH --> R
    R --> EXT --> ENG --> EXP --> DB
    EXT -.->|vision / text API| LLM
    EXP -.->|chat API| LLM
    ENG -->|reads rules| POLICY
    DB -->|decision + logs| R
    R -->|response| Client
```

---

## 3. Request lifecycle

### Document upload path
```mermaid
sequenceDiagram
    participant U as User (React)
    participant API as FastAPI
    participant LLM as LLM (Groq vision)
    participant ENG as Decision engine
    participant DB as SQLite

    U->>API: POST /extract (image/PDF)
    API->>LLM: base64 image + extraction prompt
    LLM-->>API: JSON fields (doctor, diagnosis, bill items…)
    API-->>U: pre-filled Claim fields
    U->>U: review + edit extracted fields
    U->>API: POST /adjudicate (structured Claim + Bearer token)
    API->>ENG: adjudicate(Claim, policy)
    ENG-->>API: Decision (status, amount, reasons)
    API->>LLM: explain(Decision) — phrasing only
    LLM-->>API: member-facing notes
    API->>DB: persist claim + decision + ai_log
    API-->>U: Decision + confidence + AI explanation
```

### Direct structured submission (test suite path)
Skips extraction entirely — posts a JSON `Claim` directly to `/adjudicate`.

---

## 4. Components

| # | Layer | Responsibility | Tech | Key files |
|---|-------|----------------|------|-----------|
| — | Frontend | Role-based UI (Employee / Reviewer / Admin / AI Agent) | React 19, TypeScript, Vite, Tailwind | `frontend/src/pages/*` |
| — | Auth | Token-based role auth, session persistence | In-memory token store (production: JWT) | `app/auth.py` |
| 1 | Extraction | Image → LLM vision → validated fields; PDF → text layer → LLM | OpenAI-compatible API (Groq) | `app/llm.py` |
| 2 | Decision engine | Eligibility, coverage, limits, fraud — fixed precedence, pure Python | Pure Python | `app/engine/`, `app/classify.py` |
| 3 | Explanation | LLM writes member-facing notes; blends with engine confidence | LLM (same provider) | `app/llm.py` |
| 4 | Storage | Claims, decisions, AI call logs, reviewer overrides | SQLite (sqlite3) | `app/database.py` |
| — | Policy config | Single source of truth — edited live by admin | JSON | `policy_terms.json` |

---

## 5. Decision engine logic

Checks run in fixed precedence so the *correct* reason fires when several apply.

```mermaid
flowchart TD
    A["Claim received"] --> B{"Prescription\npresent?"}
    B -- No --> RJ1["REJECT · MISSING_DOCUMENTS\nconf 1.00"]
    B -- Yes --> C{"Doctor reg\nvalid?"}
    C -- No --> RJ2["REJECT · DOCTOR_REG_INVALID\nconf 0.97"]
    C -- Yes --> D{"Within waiting\nperiod?"}
    D -- Yes --> RJ3["REJECT · WAITING_PERIOD\nconf 0.96"]
    D -- No --> E{"Excluded\ntreatment?"}
    E -- Yes --> RJ4["REJECT · SERVICE_NOT_COVERED\nconf 0.97"]
    E -- No --> F{"Needs pre-auth\nand missing?"}
    F -- Yes --> RJ5["REJECT · PRE_AUTH_MISSING\nconf 0.94"]
    F -- No --> G{"Claim domain?"}
    G -- General OPD --> H{"Over per-claim\nlimit?"}
    H -- Yes --> RJ6["REJECT · PER_CLAIM_EXCEEDED\nconf 0.98"]
    H -- No --> I["Apply co-pay\nor network discount"]
    G -- Dental --> J["Drop cosmetic lines\ncap at dental sub-limit"]
    G -- Alternative --> K["Cap at sub-limit"]
    I --> L{"Fraud\nindicators?"}
    J --> L
    K --> L
    L -- Yes --> MR["MANUAL_REVIEW\nconf 0.65"]
    L -- No --> AP["APPROVED / PARTIAL\n+ approved amount"]
```

---

## 6. Data model

**`Claim`** (extraction output → engine input)

`member_id`, `member_name`, `member_join_date?`, `treatment_date`,
`claim_amount`, `hospital?`, `cashless_request`, `pre_authorized`,
`previous_claims_same_day`, `prescription { doctor_name, doctor_reg,
diagnosis, medicines_prescribed[], procedures[], tests_prescribed[],
treatment? }`, `bill { line_item: amount }`.

**`Decision`** (engine output → API response)

`claim_id`, `decision`, `approved_amount`, `rejection_reasons[]`,
`rejected_items[]`, `flags[]`, `deductions { copay | network_discount }`,
`cashless_approved?`, `confidence_score`, `notes`, `next_steps`.

**`AILog`** (logged per LLM call)

`call_type`, `model`, `prompt_preview`, `response_preview`,
`prompt_tokens`, `completion_tokens`, `latency_ms`, `status`, `created_at`.

---

## 7. Role-based UI

| Role | Dashboard | Access |
|------|-----------|--------|
| **Employee** | Submit claims, document upload + AI extraction, own history table | Own claims only |
| **Reviewer** | Review queue (MANUAL_REVIEW flagged), stats bar, override panel with reason | All claims |
| **Admin** | KPI analytics, decision breakdown chart, claims table, **live policy editor** | All claims + policy write |
| **AI Agent** | AI activity log (every LLM call: tokens, latency, I/O), auto-refresh, evaluation runner (10 test cases, accuracy %) | AI logs + all claims |

---

## 8. Technology stack and rationale

| Area | Choice | Why |
|------|--------|-----|
| Frontend | React 19 + TypeScript + Vite + Tailwind | Fast iteration, typed, recommended stack |
| Backend | FastAPI (Python) | Async, Pydantic validation, auto Swagger docs at `/docs` |
| Document AI | LLM vision (Groq llama-4-scout) | No system dependencies, handles handwritten prescriptions, zero OCR setup |
| LLM provider | Open-source via OpenAI-compatible API | No per-call cost lock-in; swap provider with one env var |
| Storage | SQLite (built-in sqlite3) | Zero-config MVP; Postgres-ready schema |
| Auth | In-memory token store | Simple for demo; production replaces with JWT |

Provider switching requires only `.env` changes:
```
LLM_BASE_URL=https://api.groq.com/openai/v1   # or Together / local Ollama
LLM_API_KEY=…
LLM_MODEL=llama-3.3-70b-versatile
LLM_VISION_MODEL=meta-llama/llama-4-scout-17b-16e-instruct
```

---

## 9. Deployment

```mermaid
flowchart LR
    User((User)) --> FE
    subgraph Vercel
        FE["React build (static)"]
    end
    subgraph Host["Render / Railway"]
        BE["FastAPI\n(Python 3.12)"]
        SQL[("SQLite volume")]
    end
    LLMP{{"Groq API"}}
    FE -->|HTTPS| BE
    BE --> SQL
    BE -.->|LLM_API_KEY| LLMP
```

No Tesseract or poppler required — using LLM vision for document reading means
a plain Python deployment with no system-package dependencies.

---

## 10. Scaling to production

- **Stateless API** → multiple FastAPI workers behind a load balancer.
- **Async LLM calls** → move to a task queue (Celery/RQ) so uploads return immediately.
- **Database** → swap SQLite for PostgreSQL; index on `member_id` + `treatment_date` for annual-limit tracking.
- **Document storage** → S3 / object storage instead of memory.
- **Policy cache** → Redis for the policy JSON; version with an audit log.
- **Auth** → JWT with refresh tokens, RBAC roles in DB.
- **Rate limiting** on upload and LLM endpoints.

---

## 11. Resolved ambiguities

The provided rules and expected test outputs conflict in a few places; expected
outputs were treated as ground truth:

1. Co-pay (10%) applies to the whole general-OPD bill; dental and alternative-medicine carry no co-pay.
2. Per-claim limit applies to general OPD only — not dental (dental sub-limit governs).
3. 20% network discount replaces co-pay for network/cashless claims.
4. MRI/CT require pre-authorisation despite the category flag.
5. AYUSH registration formats (`AYUR/State/Number/Year`) are accepted.
6. Exclusions matched semantically — "diet plan" maps to "Weight loss treatments".
7. Confidence scores calibrated to rule determinism (1.00 = certain, 0.65 = manual review).

---

## 12. Implementation status

| Phase | Scope | Status |
|-------|-------|--------|
| 1 | Data contracts, policy loader, deterministic engine, FastAPI | ✅ Done — 10/10 test cases pass |
| 2 | LLM vision extraction from uploaded images/PDFs | ✅ Done |
| 3 | LLM explanation + confidence; SQLite persistence | ✅ Done |
| 4 | React frontend — 4 role dashboards, document upload, history | ✅ Done |
| 5 | Admin policy editor, AI activity log, eval runner, auth | ✅ Done |
