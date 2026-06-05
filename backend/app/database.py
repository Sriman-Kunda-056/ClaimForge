import sqlite3
import json
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path

DB_PATH = Path(__file__).resolve().parents[1] / "claims.db"


def init_db() -> None:
    with _conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS claims (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                claim_id        TEXT NOT NULL,
                member_id       TEXT NOT NULL,
                member_name     TEXT NOT NULL,
                treatment_date  TEXT NOT NULL,
                claim_amount    REAL NOT NULL,
                decision        TEXT NOT NULL,
                approved_amount REAL NOT NULL,
                confidence_score REAL NOT NULL,
                claim_json      TEXT NOT NULL,
                decision_json   TEXT NOT NULL,
                submitted_by    TEXT NOT NULL DEFAULT 'employee',
                submitted_at    TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS overrides (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                claim_id      TEXT NOT NULL,
                reviewer      TEXT NOT NULL,
                action        TEXT NOT NULL,
                reason        TEXT,
                overridden_at TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS appeals (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                claim_id      TEXT NOT NULL,
                submitted_by  TEXT NOT NULL,
                message       TEXT NOT NULL,
                status        TEXT NOT NULL DEFAULT 'pending',
                created_at    TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS appeal_messages (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                claim_id    TEXT NOT NULL,
                sender      TEXT NOT NULL,
                sender_role TEXT NOT NULL,
                message     TEXT NOT NULL,
                created_at  TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS ai_logs (
                id                INTEGER PRIMARY KEY AUTOINCREMENT,
                call_type         TEXT NOT NULL,
                model             TEXT NOT NULL,
                prompt_preview    TEXT,
                response_preview  TEXT,
                prompt_tokens     INTEGER DEFAULT 0,
                completion_tokens INTEGER DEFAULT 0,
                latency_ms        INTEGER DEFAULT 0,
                status            TEXT DEFAULT 'success',
                error             TEXT,
                created_at        TEXT NOT NULL
            )
        """)


@contextmanager
def _conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


# ── claims ───────────────────────────────────────────────────────────────────

def save_claim(claim_id: str, claim_dict: dict, decision_dict: dict, submitted_by: str = "employee") -> None:
    with _conn() as conn:
        conn.execute("""
            INSERT INTO claims
                (claim_id, member_id, member_name, treatment_date, claim_amount,
                 decision, approved_amount, confidence_score, claim_json, decision_json,
                 submitted_by, submitted_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            claim_id,
            claim_dict.get("member_id", ""),
            claim_dict.get("member_name", ""),
            str(claim_dict.get("treatment_date", "")),
            float(claim_dict.get("claim_amount", 0)),
            decision_dict.get("decision", ""),
            float(decision_dict.get("approved_amount", 0)),
            float(decision_dict.get("confidence_score", 0)),
            json.dumps(claim_dict, default=str),
            json.dumps(decision_dict, default=str),
            submitted_by,
            datetime.utcnow().isoformat(),
        ))


def get_claims(role: str = "reviewer", member_id: str | None = None) -> list[dict]:
    with _conn() as conn:
        if role in ("reviewer", "admin"):
            rows = conn.execute("SELECT * FROM claims ORDER BY submitted_at DESC").fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM claims WHERE submitted_by = ? ORDER BY submitted_at DESC",
                (member_id or "",)
            ).fetchall()
    result = []
    for r in rows:
        d = dict(r)
        d["claim_json"] = json.loads(d["claim_json"])
        d["decision_json"] = json.loads(d["decision_json"])
        result.append(d)
    return result


def save_override(claim_id: str, reviewer: str, action: str, reason: str) -> None:
    with _conn() as conn:
        conn.execute("UPDATE claims SET decision = ? WHERE claim_id = ?", (action, claim_id))
        conn.execute("""
            INSERT INTO overrides (claim_id, reviewer, action, reason, overridden_at)
            VALUES (?,?,?,?,?)
        """, (claim_id, reviewer, action, reason, datetime.utcnow().isoformat()))


def get_stats() -> dict:
    with _conn() as conn:
        total = conn.execute("SELECT COUNT(*) FROM claims").fetchone()[0]
        rows = conn.execute(
            "SELECT decision, COUNT(*) as cnt FROM claims GROUP BY decision"
        ).fetchall()
        by_decision = {r["decision"]: r["cnt"] for r in rows}
        total_approved = conn.execute(
            "SELECT COALESCE(SUM(approved_amount),0) FROM claims WHERE decision IN ('APPROVED','PARTIAL')"
        ).fetchone()[0]
        avg_claim = conn.execute(
            "SELECT COALESCE(AVG(claim_amount),0) FROM claims"
        ).fetchone()[0]
        pending_review = conn.execute(
            "SELECT COUNT(*) FROM claims WHERE decision='MANUAL_REVIEW'"
        ).fetchone()[0]
        total_ai = conn.execute("SELECT COUNT(*) FROM ai_logs").fetchone()[0]
        total_tokens = conn.execute(
            "SELECT COALESCE(SUM(prompt_tokens+completion_tokens),0) FROM ai_logs"
        ).fetchone()[0]
    return {
        "total_claims": total,
        "by_decision": by_decision,
        "total_approved_amount": round(total_approved, 2),
        "avg_claim_amount": round(avg_claim, 2),
        "pending_review": pending_review,
        "total_ai_calls": total_ai,
        "total_tokens_used": total_tokens,
        "approval_rate": round(
            (by_decision.get("APPROVED", 0) + by_decision.get("PARTIAL", 0)) / total * 100, 1
        ) if total else 0,
    }


# ── same-day count (auto-computed, never user-supplied) ──────────────────────

def count_same_day_claims(member_id: str, treatment_date: str) -> int:
    with _conn() as conn:
        count = conn.execute(
            "SELECT COUNT(*) FROM claims WHERE member_id = ? AND treatment_date = ?",
            (member_id, treatment_date)
        ).fetchone()[0]
    return count


# ── appeals ──────────────────────────────────────────────────────────────────

def submit_appeal(claim_id: str, submitted_by: str, message: str) -> None:
    now = datetime.utcnow().isoformat()
    with _conn() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO appeals (claim_id, submitted_by, message, status, created_at) VALUES (?,?,?,'pending',?)",
            (claim_id, submitted_by, message, now)
        )
        conn.execute(
            "INSERT INTO appeal_messages (claim_id, sender, sender_role, message, created_at) VALUES (?,?,?,?,?)",
            (claim_id, submitted_by, "employee", message, now)
        )


def reply_to_appeal(claim_id: str, reviewer: str, role: str, message: str) -> None:
    now = datetime.utcnow().isoformat()
    with _conn() as conn:
        conn.execute(
            "UPDATE appeals SET status = 'responded' WHERE claim_id = ?",
            (claim_id,)
        )
        conn.execute(
            "INSERT INTO appeal_messages (claim_id, sender, sender_role, message, created_at) VALUES (?,?,?,?,?)",
            (claim_id, reviewer, role, message, now)
        )


def get_appeal_thread(claim_id: str) -> list[dict]:
    with _conn() as conn:
        rows = conn.execute(
            "SELECT * FROM appeal_messages WHERE claim_id = ? ORDER BY created_at ASC",
            (claim_id,)
        ).fetchall()
    return [dict(r) for r in rows]


def get_appeals(role: str = "reviewer") -> list[dict]:
    with _conn() as conn:
        rows = conn.execute("SELECT * FROM appeals ORDER BY created_at DESC").fetchall()
    return [dict(r) for r in rows]


# ── AI logs ──────────────────────────────────────────────────────────────────

def log_ai_call(
    call_type: str,
    model: str,
    prompt_preview: str,
    response_preview: str | None,
    prompt_tokens: int,
    completion_tokens: int,
    latency_ms: int,
    error: str | None = None,
) -> None:
    with _conn() as conn:
        conn.execute("""
            INSERT INTO ai_logs
                (call_type, model, prompt_preview, response_preview,
                 prompt_tokens, completion_tokens, latency_ms, status, error, created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?)
        """, (
            call_type, model,
            prompt_preview[:600] if prompt_preview else "",
            response_preview[:1200] if response_preview else None,
            prompt_tokens, completion_tokens, latency_ms,
            "error" if error else "success",
            error,
            datetime.utcnow().isoformat(),
        ))


def get_ai_logs(limit: int = 100) -> list[dict]:
    with _conn() as conn:
        rows = conn.execute(
            "SELECT * FROM ai_logs ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
    return [dict(r) for r in rows]
