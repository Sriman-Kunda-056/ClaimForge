import secrets
from .database import save_token, get_token, delete_token

USERS: dict[str, dict] = {
    "employee": {"password": "demo123",  "role": "employee",  "name": "Alex Employee",  "member_id": "EMP_DEMO"},
    "reviewer": {"password": "demo123",  "role": "reviewer",  "name": "Sarah Reviewer", "member_id": None},
    "admin":    {"password": "admin123", "role": "admin",     "name": "Admin",           "member_id": None},
    "ai_agent": {"password": "agent123", "role": "ai_agent",  "name": "AI Agent",        "member_id": None},
}


def login(username: str, password: str) -> str | None:
    user = USERS.get(username)
    if not user or user["password"] != password:
        return None
    token = secrets.token_hex(20)
    save_token(token, {"username": username, **user})
    return token


def get_user(token: str) -> dict | None:
    row = get_token(token)
    if not row:
        return None
    username = row["username"]
    user = USERS.get(username)
    if not user:
        return None
    return {"username": username, **user}


def logout(token: str) -> None:
    delete_token(token)
