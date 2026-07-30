from __future__ import annotations

import hashlib
import hmac
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from .database import Database, utc_now
from .errors import AuthenticationError, AuthorizationError, ConfigurationError


@dataclass(frozen=True)
class Principal:
    mode: str
    user_id: str | None = None
    session_id: str | None = None

    @property
    def authenticated(self) -> bool:
        return self.mode == "authenticated" and bool(self.user_id)


class SessionManager:
    def __init__(self, database: Database, secret: str, issuer: str = "edgeboard", audience: str = "edgeboard-web"):
        self.database = database
        self.secret = secret.encode("utf-8")
        self.issuer = issuer
        self.audience = audience

    def anonymous(self) -> Principal:
        return Principal("anonymous_local")

    def create(self, user_id: str, duration_minutes: int = 60) -> dict[str, str]:
        if len(self.secret) < 16:
            raise ConfigurationError("AUTH_SECRET is not configured for server sessions.")
        session_id = secrets.token_hex(16)
        token = secrets.token_urlsafe(32)
        csrf = secrets.token_urlsafe(24)
        expires = (datetime.now(timezone.utc) + timedelta(minutes=max(1, duration_minutes))).isoformat().replace("+00:00", "Z")
        with self.database.transaction() as connection:
            connection.execute(
                "INSERT INTO sessions(id,user_id,token_hash,csrf_hash,expires_at,created_at) VALUES(?,?,?,?,?,?)",
                (session_id, user_id, self._hash(token), self._hash(csrf), expires, utc_now()),
            )
        return {"sessionId": session_id, "token": token, "csrf": csrf, "expiresAt": expires}

    def authenticate(self, token: str | None) -> Principal:
        if not token:
            return self.anonymous()
        if len(self.secret) < 16:
            raise ConfigurationError("Server authentication is not configured.")
        token_hash = self._hash(token)
        rows = self.database.execute(
            "SELECT id,user_id,expires_at,revoked_at FROM sessions WHERE token_hash = ?",
            (token_hash,),
        )
        if not rows or rows[0]["revoked_at"]:
            raise AuthenticationError("Session is invalid or revoked.")
        expires = datetime.fromisoformat(rows[0]["expires_at"].replace("Z", "+00:00"))
        if expires <= datetime.now(timezone.utc):
            raise AuthenticationError("Session has expired.")
        return Principal("authenticated", rows[0]["user_id"], rows[0]["id"])

    def verify_csrf(self, principal: Principal, csrf: str | None) -> None:
        if not principal.authenticated:
            raise AuthenticationError("Authentication is required.")
        rows = self.database.execute("SELECT csrf_hash FROM sessions WHERE id = ?", (principal.session_id,))
        if not rows or not csrf or not hmac.compare_digest(rows[0]["csrf_hash"], self._hash(csrf)):
            raise AuthorizationError("CSRF validation failed.")

    def logout(self, principal: Principal) -> None:
        if principal.session_id:
            with self.database.transaction() as connection:
                connection.execute("UPDATE sessions SET revoked_at = ? WHERE id = ?", (utc_now(), principal.session_id))

    def delete_account(self, principal: Principal, *, confirmed: bool = False) -> None:
        if not principal.authenticated or not confirmed:
            raise AuthorizationError("Account deletion requires an authenticated explicit confirmation.")
        now = utc_now()
        with self.database.transaction() as connection:
            connection.execute("UPDATE users SET status='deleted',deleted_at=?,updated_at=? WHERE id=?", (now, now, principal.user_id))
            connection.execute("UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL", (now, principal.user_id))
            connection.execute("UPDATE cloud_workspaces SET deleted_at=?,updated_at=? WHERE owner_id=? AND deleted_at IS NULL", (now, now, principal.user_id))

    @staticmethod
    def cookie(token: str, *, secure: bool = True, max_age: int = 3600) -> str:
        attributes = [
            f"edgeboard_session={token}", "Path=/", "HttpOnly", "SameSite=Lax",
            f"Max-Age={max(0, max_age)}",
        ]
        if secure:
            attributes.append("Secure")
        return "; ".join(attributes)

    def _hash(self, value: str) -> str:
        return hmac.new(self.secret, value.encode("utf-8"), hashlib.sha256).hexdigest()
