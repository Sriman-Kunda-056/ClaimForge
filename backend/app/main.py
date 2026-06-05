"""
OPD Claim Adjudication API

  POST /auth/login              username + password  -> token + user info
  GET  /auth/me                 token header         -> current user

  POST /adjudicate              structured Claim     -> Decision  (saves to DB)
  POST /extract                 file upload          -> extracted fields (AI)
  POST /claims/upload           file upload          -> extract + adjudicate

  GET  /claims                  token header         -> claim history (role-filtered)
  POST /claims/{id}/override    reviewer only        -> override decision

  GET  /policy                  returns policy config
  GET  /health                  liveness
"""
from __future__ import annotations

import os
import secrets
from datetime import datetime
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, File, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from .auth import get_user, login as auth_login
from .database import (get_claims, get_ai_logs, get_stats, init_db, save_claim, save_override,
                       count_same_day_claims, submit_appeal, reply_to_appeal,
                       get_appeal_thread, get_appeals)
from .engine import adjudicate as run_adjudicate
from .policy import get_policy, save_policy
from .schemas import Claim, Decision

load_dotenv()

app = FastAPI(
    title="OPD Claim Adjudication API",
    version="0.2.0",
    description="Automated adjudication of outpatient (OPD) insurance claims.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi import APIRouter
router = APIRouter(prefix="/api")


@app.on_event("startup")
def startup() -> None:
    init_db()


# ── helpers ──────────────────────────────────────────────────────────────────

def _token_from_header(authorization: str | None) -> str:
    if not authorization:
        return ""
    return authorization.replace("Bearer ", "").strip()


def _require_user(authorization: str | None) -> dict:
    user = get_user(_token_from_header(authorization))
    if not user:
        raise HTTPException(401, "Unauthorised — please log in")
    return user


def _gen_claim_id() -> str:
    ts = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    rand = secrets.token_hex(3).upper()
    return f"CLM-{ts}-{rand}"


# ── auth ─────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/auth/login", tags=["auth"])
def login(body: LoginRequest) -> dict:
    token = auth_login(body.username, body.password)
    if not token:
        raise HTTPException(401, "Invalid username or password")
    user = get_user(token)
    return {"token": token, "user": {k: v for k, v in user.items() if k != "password"}}


@router.get("/auth/me", tags=["auth"])
def me(authorization: str | None = Header(default=None)) -> dict:
    user = _require_user(authorization)
    return {k: v for k, v in user.items() if k != "password"}


# ── meta ─────────────────────────────────────────────────────────────────────

@router.get("/health", tags=["meta"])
def health() -> dict:
    return {"status": "ok"}


@router.get("/policy", tags=["meta"])
def policy() -> dict:
    return get_policy()


@router.put("/policy", tags=["meta"])
def update_policy(
    body: dict,
    authorization: str | None = Header(default=None),
) -> dict:
    user = _require_user(authorization)
    if user["role"] != "admin":
        raise HTTPException(403, "Only admins can update the policy")
    save_policy(body)
    return {"status": "ok", "message": "Policy updated successfully"}


# ── adjudication ─────────────────────────────────────────────────────────────

@router.post("/adjudicate", response_model=Decision, tags=["claims"])
def adjudicate_claim(
    claim: Claim,
    authorization: str | None = Header(default=None),
) -> Decision:
    user = get_user(_token_from_header(authorization))
    submitted_by = user["username"] if user else "anonymous"

    claim_id = _gen_claim_id()
    # Auto-compute same-day submissions from DB.
    # Take the max of DB count and any provided value so test cases can simulate history,
    # but real users cannot cheat by sending 0 to bypass fraud detection.
    same_day_db = count_same_day_claims(claim.member_id, str(claim.treatment_date))
    same_day = max(same_day_db, claim.previous_claims_same_day or 0)
    claim = claim.model_copy(update={"previous_claims_same_day": same_day})
    decision = run_adjudicate(claim, get_policy(), claim_id=claim_id)

    if os.getenv("LLM_API_KEY"):
        from .llm import explain_decision
        from concurrent.futures import ThreadPoolExecutor

        claim_dict    = claim.model_dump(mode="json")
        decision_dict = decision.model_dump(mode="json")

        # AI fraud analysis is shelved for now — kept in llm.py, re-enable when ready
        # from .llm import analyze_fraud
        # do_fraud = decision.decision in ("APPROVED", "PARTIAL")

        with ThreadPoolExecutor(max_workers=1) as pool:
            fut_explain = pool.submit(explain_decision, claim_dict, decision_dict)
            try:
                explanation = fut_explain.result(timeout=15)
                if explanation:
                    decision.notes = explanation
            except Exception:
                pass

    save_claim(
        claim_id,
        claim.model_dump(mode="json"),
        decision.model_dump(mode="json"),
        submitted_by,
    )
    return decision


# ── document extraction (AI) ─────────────────────────────────────────────────

@router.post("/extract", tags=["claims"])
async def extract_document(
    file: UploadFile = File(...),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    """
    Upload a prescription image or bill PDF.
    Returns extracted fields to pre-fill the claim form.
    Requires LLM_API_KEY to be set in the environment.
    """
    _require_user(authorization)

    if not os.getenv("LLM_API_KEY"):
        raise HTTPException(
            503,
            "AI extraction requires LLM_API_KEY. "
            "Add it to backend/.env (see .env.example).",
        )

    content = await file.read()
    media_type = file.content_type or "image/jpeg"

    from .llm import extract_from_image, extract_from_text

    if "pdf" in media_type:
        try:
            import pymupdf  # type: ignore
            doc = pymupdf.open(stream=content, filetype="pdf")
            text = "\n".join(page.get_text() for page in doc)
            extracted = extract_from_text(text)
        except ImportError:
            raise HTTPException(
                503,
                "PDF text extraction requires pymupdf. "
                "Run: pip install pymupdf",
            )
    else:
        extracted = extract_from_image(content, media_type)

    return extracted


@router.post("/claims/upload", tags=["claims"])
async def upload_and_adjudicate(
    file: UploadFile = File(...),
    authorization: str | None = Header(default=None),
) -> JSONResponse:
    """Extract fields from document then adjudicate (full pipeline stub)."""
    return JSONResponse(
        status_code=501,
        content={
            "detail": "Full pipeline not yet wired end-to-end.",
            "hint": "Use POST /extract to get form fields, then POST /adjudicate.",
        },
    )


# ── claims history ────────────────────────────────────────────────────────────

@router.get("/claims", tags=["claims"])
def list_claims(
    authorization: str | None = Header(default=None),
) -> list[dict]:
    user = _require_user(authorization)
    return get_claims(
        role=user["role"],
        member_id=user["username"],   # filter employee history by who submitted
    )


class OverrideRequest(BaseModel):
    action: str   # "APPROVED" | "REJECTED"
    reason: str


class AppealRequest(BaseModel):
    message: str


class ReplyRequest(BaseModel):
    message: str


@router.post("/claims/{claim_id}/appeal", tags=["claims"])
def appeal_claim(
    claim_id: str,
    body: AppealRequest,
    authorization: str | None = Header(default=None),
) -> dict:
    user = _require_user(authorization)
    if not body.message.strip():
        raise HTTPException(400, "Appeal message cannot be empty")
    submit_appeal(claim_id, user["username"], body.message.strip())
    return {"status": "ok", "claim_id": claim_id}


@router.post("/claims/{claim_id}/reply", tags=["claims"])
def reply_claim(
    claim_id: str,
    body: ReplyRequest,
    authorization: str | None = Header(default=None),
) -> dict:
    user = _require_user(authorization)
    if user["role"] not in ("reviewer", "admin"):
        raise HTTPException(403, "Only reviewers and admins can reply")
    if not body.message.strip():
        raise HTTPException(400, "Reply message cannot be empty")
    reply_to_appeal(claim_id, user["username"], user["role"], body.message.strip())
    return {"status": "ok"}


@router.get("/claims/{claim_id}/thread", tags=["claims"])
def claim_thread(
    claim_id: str,
    authorization: str | None = Header(default=None),
) -> list[dict]:
    _require_user(authorization)
    return get_appeal_thread(claim_id)


@router.get("/appeals", tags=["claims"])
def list_appeals(authorization: str | None = Header(default=None)) -> list[dict]:
    user = _require_user(authorization)
    if user["role"] not in ("reviewer", "admin"):
        raise HTTPException(403, "Only reviewers and admins can view all appeals")
    return get_appeals()


@router.post("/claims/{claim_id}/override", tags=["claims"])
def override_claim(
    claim_id: str,
    body: OverrideRequest,
    authorization: str | None = Header(default=None),
) -> dict:
    user = _require_user(authorization)
    if user["role"] not in ("reviewer", "admin"):
        raise HTTPException(403, "Only reviewers and admins can override decisions")
    if body.action not in ("APPROVED", "REJECTED"):
        raise HTTPException(400, "action must be APPROVED or REJECTED")
    save_override(claim_id, user["username"], body.action, body.reason)
    return {"status": "ok", "claim_id": claim_id, "new_decision": body.action}


# ── AI logs + stats ───────────────────────────────────────────────────────────

@router.get("/ai-logs", tags=["ai"])
def ai_logs(
    limit: int = 100,
    authorization: str | None = Header(default=None),
) -> list[dict]:
    user = _require_user(authorization)
    if user["role"] not in ("admin", "ai_agent"):
        raise HTTPException(403, "Only admin and ai_agent can view AI logs")
    return get_ai_logs(limit=limit)


@router.get("/stats", tags=["meta"])
def stats(authorization: str | None = Header(default=None)) -> dict:
    user = _require_user(authorization)
    if user["role"] not in ("admin", "reviewer", "ai_agent"):
        raise HTTPException(403, "Not authorised")
    return get_stats()


app.include_router(router)
