import os
import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path

TURSO_URL   = os.getenv("TURSO_URL", "").strip()
TURSO_TOKEN = os.getenv("TURSO_TOKEN", "").strip()

DB_PATH = Path(__file__).resolve().parents[1] / "claims.db"


# ── Turso HTTP adapter ────────────────────────────────────────────────────────

class _TursoCursor:
    """Minimal cursor-like object returned by _TursoConn.execute()."""

    def __init__(self, cols: list[str], rows: list[list]):
        self.description = [(c, None, None, None, None, None, None) for c in cols]
        self._rows = [dict(zip(cols, row)) for row in rows]

    def fetchone(self) -> dict | None:
        return self._rows[0] if self._rows else None

    def fetchall(self) -> list[dict]:
        return self._rows


class _TursoConn:
    """Thin synchronous wrapper around Turso's /v2/pipeline HTTP API."""

    def __init__(self, url: str, token: str):
        url = url.strip()
        if url.startswith("libsql://"):
            url = "https://" + url[len("libsql://"):]
        elif not url.startswith("http"):
            url = "https://" + url
        self._endpoint = url.rstrip("/") + "/v2/pipeline"
        self._headers  = {
            "Authorization": f"Bearer {token}",
            "Content-Type":  "application/json",
        }

    def execute(self, sql: str, params: tuple = ()) -> _TursoCursor:
        import httpx

        args = []
        for p in params:
            if p is None:
                args.append({"type": "null"})
            elif isinstance(p, bool):
                args.append({"type": "integer", "value": "1" if p else "0"})
            elif isinstance(p, int):
                args.append({"type": "integer", "value": str(p)})
            elif isinstance(p, float):
                args.append({"type": "float", "value": p})
            else:
                args.append({"type": "text", "value": str(p)})

        stmt: dict = {"sql": sql}
        if args:
            stmt["args"] = args

        payload = {"requests": [{"type": "execute", "stmt": stmt}, {"type": "close"}]}
        resp = httpx.post(
            self._endpoint,
            json=payload,
            headers=self._headers,
            timeout=15,
        )
        if not resp.is_success:
            raise RuntimeError(
                f"Turso {resp.status_code} — SQL: {sql[:120]} — response: {resp.text[:400]}"
            )

        result = resp.json()["results"][0]["response"]["result"]
        cols = [c["name"] for c in result.get("cols", [])]
        raw_rows = result.get("rows", [])

        rows = []
        for raw in raw_rows:
            row = []
            for cell in raw:
                t, v = cell.get("type"), cell.get("value")
                if t == "null" or v is None:
                    row.append(None)
                elif t == "integer":
                    row.append(int(v))
                elif t == "float":
                    row.append(float(v))
                else:
                    row.append(v)
            rows.append(row)

        return _TursoCursor(cols, rows)

    def commit(self):  # auto-committed via HTTP
        pass

    def close(self):
        pass


# ── SQLite adapter (local) ────────────────────────────────────────────────────

def _row_factory(cursor, row):
    return {col[0]: val for col, val in zip(cursor.description, row)}


class _SQLiteConn:
    """Thin wrapper that gives sqlite3 the same interface as _TursoConn."""

    def __init__(self):
        self._conn = sqlite3.connect(str(DB_PATH))
        self._conn.row_factory = _row_factory

    def execute(self, sql: str, params: tuple = ()):
        return self._conn.execute(sql, params)

    def commit(self):
        self._conn.commit()

    def close(self):
        self._conn.close()


# ── unified context manager ───────────────────────────────────────────────────

@contextmanager
def _conn():
    if TURSO_URL and TURSO_TOKEN:
        conn = _TursoConn(TURSO_URL, TURSO_TOKEN)
    else:
        conn = _SQLiteConn()
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


# ── schema ────────────────────────────────────────────────────────────────────

def init_db() -> None:
    with _conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                token      TEXT PRIMARY KEY,
                username   TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS claims (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                claim_id         TEXT NOT NULL,
                member_id        TEXT NOT NULL,
                member_name      TEXT NOT NULL,
                treatment_date   TEXT NOT NULL,
                claim_amount     REAL NOT NULL,
                decision         TEXT NOT NULL,
                approved_amount  REAL NOT NULL,
                confidence_score REAL NOT NULL,
                claim_json       TEXT NOT NULL,
                decision_json    TEXT NOT NULL,
                submitted_by     TEXT NOT NULL DEFAULT 'employee',
                submitted_at     TEXT NOT NULL
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


# ── sessions (auth) ───────────────────────────────────────────────────────────

def save_token(token: str, user: dict) -> None:
    with _conn() as conn:
        conn.execute(
            "INSERT INTO sessions (token, username) VALUES (?, ?)",
            (token, user["username"]),
        )


def get_token(token: str) -> dict | None:
    if not token:
        return None
    with _conn() as conn:
        return conn.execute(
            "SELECT username FROM sessions WHERE token = ?", (token,)
        ).fetchone()


def delete_token(token: str) -> None:
    with _conn() as conn:
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))


# ── claims ────────────────────────────────────────────────────────────────────

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
                (member_id or "",),
            ).fetchall()
    for r in rows:
        r["claim_json"]    = json.loads(r["claim_json"])
        r["decision_json"] = json.loads(r["decision_json"])
    return rows


def save_override(claim_id: str, reviewer: str, action: str, reason: str) -> None:
    with _conn() as conn:
        conn.execute("UPDATE claims SET decision = ? WHERE claim_id = ?", (action, claim_id))
        conn.execute("""
            INSERT INTO overrides (claim_id, reviewer, action, reason, overridden_at)
            VALUES (?,?,?,?,?)
        """, (claim_id, reviewer, action, reason, datetime.utcnow().isoformat()))


def get_stats() -> dict:
    with _conn() as conn:
        total          = conn.execute("SELECT COUNT(*) AS cnt FROM claims").fetchone()["cnt"]
        rows           = conn.execute("SELECT decision, COUNT(*) AS cnt FROM claims GROUP BY decision").fetchall()
        by_decision    = {r["decision"]: r["cnt"] for r in rows}
        total_approved = conn.execute(
            "SELECT COALESCE(SUM(approved_amount),0) AS total FROM claims WHERE decision IN ('APPROVED','PARTIAL')"
        ).fetchone()["total"]
        avg_claim      = conn.execute(
            "SELECT COALESCE(AVG(claim_amount),0) AS avg FROM claims"
        ).fetchone()["avg"]
        pending        = conn.execute(
            "SELECT COUNT(*) AS cnt FROM claims WHERE decision='MANUAL_REVIEW'"
        ).fetchone()["cnt"]
        total_ai       = conn.execute("SELECT COUNT(*) AS cnt FROM ai_logs").fetchone()["cnt"]
        total_tokens   = conn.execute(
            "SELECT COALESCE(SUM(prompt_tokens+completion_tokens),0) AS total FROM ai_logs"
        ).fetchone()["total"]
    return {
        "total_claims":          total,
        "by_decision":           by_decision,
        "total_approved_amount": round(total_approved, 2),
        "avg_claim_amount":      round(avg_claim, 2),
        "pending_review":        pending,
        "total_ai_calls":        total_ai,
        "total_tokens_used":     total_tokens,
        "approval_rate":         round(
            (by_decision.get("APPROVED", 0) + by_decision.get("PARTIAL", 0)) / total * 100, 1
        ) if total else 0,
    }


def count_same_day_claims(member_id: str, treatment_date: str) -> int:
    with _conn() as conn:
        return conn.execute(
            "SELECT COUNT(*) AS cnt FROM claims WHERE member_id = ? AND treatment_date = ?",
            (member_id, treatment_date),
        ).fetchone()["cnt"]


# ── appeals ───────────────────────────────────────────────────────────────────

def submit_appeal(claim_id: str, submitted_by: str, message: str) -> None:
    now = datetime.utcnow().isoformat()
    with _conn() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO appeals (claim_id, submitted_by, message, status, created_at) VALUES (?,?,?,'pending',?)",
            (claim_id, submitted_by, message, now),
        )
        conn.execute(
            "INSERT INTO appeal_messages (claim_id, sender, sender_role, message, created_at) VALUES (?,?,?,?,?)",
            (claim_id, submitted_by, "employee", message, now),
        )


def reply_to_appeal(claim_id: str, reviewer: str, role: str, message: str) -> None:
    now = datetime.utcnow().isoformat()
    with _conn() as conn:
        conn.execute("UPDATE appeals SET status = 'responded' WHERE claim_id = ?", (claim_id,))
        conn.execute(
            "INSERT INTO appeal_messages (claim_id, sender, sender_role, message, created_at) VALUES (?,?,?,?,?)",
            (claim_id, reviewer, role, message, now),
        )


def get_appeal_thread(claim_id: str) -> list[dict]:
    with _conn() as conn:
        return conn.execute(
            "SELECT * FROM appeal_messages WHERE claim_id = ? ORDER BY created_at ASC",
            (claim_id,),
        ).fetchall()


def get_appeals(role: str = "reviewer") -> list[dict]:
    with _conn() as conn:
        return conn.execute("SELECT * FROM appeals ORDER BY created_at DESC").fetchall()


# ── AI logs ───────────────────────────────────────────────────────────────────

def log_ai_call(
    call_type: str, model: str, prompt_preview: str, response_preview: str | None,
    prompt_tokens: int, completion_tokens: int, latency_ms: int, error: str | None = None,
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
        return conn.execute(
            "SELECT * FROM ai_logs ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
