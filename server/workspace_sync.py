from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from .auth import Principal
from .database import Database, utc_now
from .errors import AuthorizationError, ValidationError


SYNC_STATES = {
    "local_only", "pending_upload", "synced", "pending_download",
    "conflicted", "failed", "deleted",
}


@dataclass(frozen=True)
class SyncResult:
    accepted: tuple[dict[str, Any], ...]
    conflicts: tuple[dict[str, Any], ...]
    server_revision: int


class WorkspaceSyncService:
    def __init__(self, database: Database):
        self.database = database

    def create_workspace(self, principal: Principal, workspace_id: str, title: str) -> dict[str, Any]:
        self._require_user(principal)
        if not workspace_id or not title:
            raise ValidationError("Workspace ID and title are required.")
        now = utc_now()
        with self.database.transaction() as connection:
            connection.execute(
                """INSERT INTO cloud_workspaces(id,owner_id,title,server_revision,created_at,updated_at)
                   VALUES(?,?,?,?,?,?)""",
                (workspace_id, principal.user_id, title[:240], 1, now, now),
            )
        return {"workspaceId": workspace_id, "ownerId": principal.user_id, "serverRevision": 1, "private": True}

    def push(self, principal: Principal, workspace_id: str, objects: list[dict[str, Any]], base_revision: int) -> SyncResult:
        self._assert_owner(principal, workspace_id)
        if len(objects) > 500:
            raise ValidationError("Workspace sync batch exceeds 500 objects.")
        workspace = self.database.execute(
            "SELECT server_revision FROM cloud_workspaces WHERE id=? AND deleted_at IS NULL",
            (workspace_id,),
        )[0]
        current_workspace_revision = int(workspace["server_revision"])
        accepted: list[dict[str, Any]] = []
        conflicts: list[dict[str, Any]] = []
        next_revision = current_workspace_revision
        with self.database.transaction() as connection:
            for item in objects:
                object_id = str(item.get("id") or "").strip()
                object_type = str(item.get("objectType") or "").strip()
                object_version = int(item.get("objectVersion") or 0)
                if not object_id or not object_type or object_version < 1:
                    conflicts.append({"id": object_id, "state": "failed", "reason": "invalid_object"})
                    continue
                existing = connection.execute(
                    "SELECT object_version,server_revision,payload_json,deleted_at FROM workspace_objects WHERE workspace_id=? AND id=?",
                    (workspace_id, object_id),
                ).fetchone()
                expected_server_revision = item.get("serverRevision")
                if existing and expected_server_revision is not None and int(expected_server_revision) != int(existing["server_revision"]):
                    conflicts.append({
                        "id": object_id, "state": "conflicted", "serverRevision": existing["server_revision"],
                        "serverObject": json.loads(existing["payload_json"]),
                    })
                    continue
                next_revision += 1
                deleted_at = utc_now() if item.get("deletedAt") else None
                payload = item.get("payload") if isinstance(item.get("payload"), dict) else {}
                connection.execute(
                    """INSERT INTO workspace_objects(
                        id,workspace_id,object_type,object_version,local_revision,server_revision,
                        sync_state,payload_json,updated_at,deleted_at
                    ) VALUES(?,?,?,?,?,?,?,?,?,?)
                    ON CONFLICT(workspace_id,id) DO UPDATE SET
                        object_type=excluded.object_type,object_version=excluded.object_version,
                        local_revision=excluded.local_revision,server_revision=excluded.server_revision,
                        sync_state=excluded.sync_state,payload_json=excluded.payload_json,
                        updated_at=excluded.updated_at,deleted_at=excluded.deleted_at""",
                    (
                        object_id, workspace_id, object_type, object_version, item.get("localRevision"),
                        next_revision, "deleted" if deleted_at else "synced",
                        json.dumps(payload, separators=(",", ":"), sort_keys=True), utc_now(), deleted_at,
                    ),
                )
                accepted.append({"id": object_id, "serverRevision": next_revision, "syncState": "deleted" if deleted_at else "synced"})
            if next_revision != current_workspace_revision:
                connection.execute(
                    "UPDATE cloud_workspaces SET server_revision=?,updated_at=? WHERE id=?",
                    (next_revision, utc_now(), workspace_id),
                )
        return SyncResult(tuple(accepted), tuple(conflicts), next_revision)

    def pull(self, principal: Principal, workspace_id: str, since_revision: int = 0) -> dict[str, Any]:
        self._assert_owner(principal, workspace_id)
        rows = self.database.execute(
            """SELECT id,object_type,object_version,server_revision,sync_state,payload_json,updated_at,deleted_at
               FROM workspace_objects WHERE workspace_id=? AND server_revision>? ORDER BY server_revision LIMIT 500""",
            (workspace_id, max(0, since_revision)),
        )
        return {
            "workspaceId": workspace_id,
            "objects": [{
                "id": row["id"], "objectType": row["object_type"], "objectVersion": row["object_version"],
                "serverRevision": row["server_revision"], "syncState": row["sync_state"],
                "payload": json.loads(row["payload_json"]), "updatedAt": row["updated_at"],
                "deletedAt": row["deleted_at"],
            } for row in rows],
            "private": True,
        }

    def _assert_owner(self, principal: Principal, workspace_id: str) -> None:
        self._require_user(principal)
        rows = self.database.execute("SELECT owner_id FROM cloud_workspaces WHERE id=? AND deleted_at IS NULL", (workspace_id,))
        if not rows or rows[0]["owner_id"] != principal.user_id:
            raise AuthorizationError("Workspace is unavailable or not owned by this account.")

    @staticmethod
    def _require_user(principal: Principal) -> None:
        if not principal.authenticated:
            raise AuthorizationError("Cloud workspace synchronization requires optional sign-in.")
