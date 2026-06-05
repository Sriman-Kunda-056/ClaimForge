import secrets

USERS: dict[str, dict] = {
    "employee": {"password": "demo123",  "role": "employee",  "name": "Alex Employee",  "member_id": "EMP_DEMO"},
    "reviewer": {"password": "demo123",  "role": "reviewer",  "name": "Sarah Reviewer", "member_id": None},
    "admin":    {"password": "admin123", "role": "admin",     "name": "Admin",           "member_id": None},
    "ai_agent": {"password": "agent123", "role": "ai_agent",  "name": "AI Agent",        "member_id": None},
}

_tokens: dict[str, dict] = {}


def login(username: str, password: str) -> str | None:
    user = USERS.get(username)
    if not user or user["password"] != password:
        return None
    token = secrets.token_hex(20)
    _tokens[token] = {"username": username, **user}
    return token


def get_user(token: str) -> dict | None:
    return _tokens.get(token)
