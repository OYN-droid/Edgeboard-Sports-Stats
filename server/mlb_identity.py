from __future__ import annotations

import hashlib
import json
import re
import unicodedata
import uuid
from collections import Counter
from datetime import datetime, timezone
from typing import Any, Iterable

from .database import Database
from .errors import ValidationError


PROVIDER = "sportsdataio"
SOURCE_VERSION = "edgeboard-mlb-identity-v1"
AUTO_CONSUMABLE_STATES = frozenset({"confirmed", "deterministic"})
MAPPING_STATES = frozenset({
    "confirmed", "deterministic", "probable", "ambiguous", "unresolved",
    "rejected", "historical", "superseded",
})
ACTIVITY_CLASSES = frozenset({
    "active", "injured_list", "historical_inactive", "minor_league",
    "free_agent", "unknown",
})

# This is the authoritative MLB alias registry for the server boundary. Provider
# aliases never enter UI code. Canonical IDs are stable league abbreviations.
MLB_TEAMS: dict[str, tuple[str, tuple[str, ...]]] = {
    "ARI": ("Arizona Diamondbacks", ("Diamondbacks", "D-backs")),
    "ATL": ("Atlanta Braves", ("Braves",)), "BAL": ("Baltimore Orioles", ("Orioles",)),
    "BOS": ("Boston Red Sox", ("Red Sox",)), "CHC": ("Chicago Cubs", ("Cubs",)),
    "CIN": ("Cincinnati Reds", ("Reds",)), "CLE": ("Cleveland Guardians", ("Guardians", "Indians")),
    "COL": ("Colorado Rockies", ("Rockies",)), "CWS": ("Chicago White Sox", ("White Sox", "CHW")),
    "DET": ("Detroit Tigers", ("Tigers",)), "HOU": ("Houston Astros", ("Astros",)),
    "KC": ("Kansas City Royals", ("Royals", "KCR")), "LAA": ("Los Angeles Angels", ("Angels",)),
    "LAD": ("Los Angeles Dodgers", ("Dodgers",)), "MIA": ("Miami Marlins", ("Marlins",)),
    "MIL": ("Milwaukee Brewers", ("Brewers",)), "MIN": ("Minnesota Twins", ("Twins",)),
    "NYM": ("New York Mets", ("Mets",)), "NYY": ("New York Yankees", ("Yankees",)),
    "ATH": ("Athletics", ("Oakland Athletics", "A's", "OAK")),
    "PHI": ("Philadelphia Phillies", ("Phillies",)), "PIT": ("Pittsburgh Pirates", ("Pirates",)),
    "SD": ("San Diego Padres", ("Padres", "SDP")), "SEA": ("Seattle Mariners", ("Mariners",)),
    "SF": ("San Francisco Giants", ("Giants", "SFG")), "STL": ("St. Louis Cardinals", ("Cardinals",)),
    "TB": ("Tampa Bay Rays", ("Rays", "TBR")), "TEX": ("Texas Rangers", ("Rangers",)),
    "TOR": ("Toronto Blue Jays", ("Blue Jays",)), "WSH": ("Washington Nationals", ("Nationals", "WAS")),
}
PROVIDER_TEAM_ALIASES = {"CHW": "CWS", "OAK": "ATH", "KCR": "KC", "SDP": "SD", "SFG": "SF", "TBR": "TB", "WAS": "WSH"}
KNOWN_ATHLETES = {
    "aaron judge": "mlb-aaron-judge", "shohei ohtani": "mlb-shohei-ohtani",
    "mookie betts": "mlb-mookie-betts", "gerrit cole": "mlb-gerrit-cole",
    "rafael devers": "mlb-rafael-devers-fixture", "garrett crochet": "mlb-garrett-crochet-fixture",
    "emmanuel clase": "mlb-emmanuel-clase-fixture",
}
KNOWN_VENUES = {"yankee stadium": "venue-yankee-stadium", "dodger stadium": "venue-dodger-stadium"}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def normalize_name(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(char for char in text if not unicodedata.combining(char)).casefold()
    return " ".join(re.sub(r"[^a-z0-9]+", " ", text).split())


def slug(value: Any) -> str:
    return normalize_name(value).replace(" ", "-")


def canonical_team_id(value: Any) -> str:
    key = str(value or "").strip().upper()
    return PROVIDER_TEAM_ALIASES.get(key, key)


def classify_player(row: dict[str, Any], team_id: str) -> tuple[str, str]:
    status = normalize_name(row.get("Status"))
    active_flag = row.get("Active")
    if any(token in status for token in ("injury list", "injured list", "disabled list", " il ")) or status.startswith("il"):
        return "injured_list", "B"
    if any(token in status for token in ("minor", "minors", "farm", "optioned")):
        return "minor_league", "D"
    if any(token in status for token in ("retired", "inactive", "deceased")) or active_flag is False:
        return "historical_inactive", "C"
    if not team_id and any(token in status for token in ("free agent", "waived", "released")):
        return "free_agent", "D"
    if team_id and (active_flag is True or status in {"active", "40 man active", "non roster invitee"}):
        return "active", "B"
    return "unknown", "D"


class MlbIdentityService:
    """Durable, evidence-first reconciliation at the provider boundary.

    It records every provider identifier privately, but returns canonical IDs only
    for confirmed or deterministic mappings. Probable and ambiguous candidates are
    review data and cannot be consumed by search, profiles, research, or markets.
    """

    def __init__(self, database: Database):
        self.database = database
        self._seed_registry()

    def _seed_registry(self) -> None:
        now = utc_now()
        with self.database.transaction() as connection:
            for entity_id, (name, aliases) in MLB_TEAMS.items():
                self._upsert_entity(connection, entity_id, "team", name, True, "confirmed", 1.0, now)
                self._upsert_metadata(connection, entity_id, "active", "A", True, None, None, now)
                for alias in (entity_id, name, *aliases):
                    self._upsert_alias(connection, entity_id, alias, "edgeboard_registry")
            for normalized, entity_id in KNOWN_ATHLETES.items():
                name = " ".join(part.capitalize() for part in normalized.split())
                self._upsert_entity(connection, entity_id, "athlete", name, True, "confirmed", 1.0, now)
                self._upsert_metadata(connection, entity_id, "active", "B", True, None, None, now)
                self._upsert_alias(connection, entity_id, name, "edgeboard_registry")
            for normalized, entity_id in KNOWN_VENUES.items():
                name = " ".join(part.capitalize() for part in normalized.split())
                self._upsert_entity(connection, entity_id, "venue", name, True, "confirmed", 1.0, now)
                self._upsert_metadata(connection, entity_id, "active", "A", True, None, None, now)
                self._upsert_alias(connection, entity_id, name, "edgeboard_registry")

    @staticmethod
    def _upsert_entity(connection: Any, entity_id: str, entity_type: str, name: str, active: bool,
                       review_status: str, confidence: float, now: str) -> None:
        connection.execute(
            """INSERT INTO entities(id, entity_type, display_name, sport_id, league_id, active,
               identity_confidence, review_status, source, provider_version, ingested_at, updated_at)
               VALUES (?, ?, ?, 'baseball', 'mlb', ?, ?, ?, 'edgeboard_identity', ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name, active=excluded.active,
               identity_confidence=MAX(entities.identity_confidence, excluded.identity_confidence),
               updated_at=excluded.updated_at""",
            (entity_id, entity_type, name, int(active), confidence, review_status, SOURCE_VERSION, now, now),
        )

    @staticmethod
    def _upsert_metadata(connection: Any, entity_id: str, activity: str, tier: str, public: bool,
                         position: str | None, team_id: str | None, now: str,
                         metadata: dict[str, Any] | None = None, fingerprint: str | None = None) -> None:
        connection.execute(
            """INSERT INTO entity_identity_metadata(entity_id, activity_class, relevance_tier,
               public_eligible, position, current_team_id, identity_fingerprint, metadata_json, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(entity_id) DO UPDATE SET activity_class=excluded.activity_class,
               relevance_tier=excluded.relevance_tier, position=excluded.position,
               current_team_id=excluded.current_team_id, identity_fingerprint=COALESCE(excluded.identity_fingerprint, entity_identity_metadata.identity_fingerprint),
               metadata_json=excluded.metadata_json, updated_at=excluded.updated_at""",
            (entity_id, activity, tier, int(public), position, team_id, fingerprint,
             json.dumps(metadata or {}, sort_keys=True), now),
        )

    @staticmethod
    def _upsert_alias(connection: Any, entity_id: str, alias: Any, source: str) -> None:
        normalized = normalize_name(alias)
        if not normalized:
            return
        connection.execute(
            """INSERT INTO entity_aliases(entity_id, alias, normalized_alias, source)
               VALUES (?, ?, ?, ?) ON CONFLICT(entity_id, normalized_alias) DO UPDATE SET alias=excluded.alias""",
            (entity_id, str(alias).strip(), normalized, source),
        )

    def _record(self, *, provider_id: str, entity_type: str, canonical_id: str | None,
                state: str, method: str, confidence: float, evidence: dict[str, Any],
                display_name: str = "", active: bool = False, activity: str = "unknown",
                tier: str = "D", position: str = "", team_id: str = "", public: bool = False,
                aliases: Iterable[Any] = ()) -> dict[str, Any]:
        if state not in MAPPING_STATES:
            raise ValueError("Unsupported identity mapping state.")
        now = utc_now()
        recorded_evidence = {**evidence, "activityClass": activity, "relevanceTier": tier}
        with self.database.transaction() as connection:
            previous = connection.execute(
                "SELECT entity_id FROM provider_mappings WHERE provider=? AND provider_id=?",
                (PROVIDER, provider_id),
            ).fetchone()
            previous_evidence = connection.execute(
                "SELECT mapping_state FROM provider_mapping_evidence WHERE provider=? AND provider_id=?",
                (PROVIDER, provider_id),
            ).fetchone()
            first_seen = connection.execute(
                "SELECT first_seen_at FROM provider_mapping_evidence WHERE provider=? AND provider_id=?",
                (PROVIDER, provider_id),
            ).fetchone()
            if canonical_id and state in AUTO_CONSUMABLE_STATES:
                self._upsert_entity(connection, canonical_id, entity_type, display_name or canonical_id, active, state, confidence, now)
                self._upsert_metadata(connection, canonical_id, activity, tier, public, position or None, team_id or None, now,
                                      {"sourceMode": "shadow"}, evidence.get("identityFingerprint"))
                for alias in (display_name, *aliases):
                    self._upsert_alias(connection, canonical_id, alias, PROVIDER)
                connection.execute(
                    """INSERT INTO provider_mappings(provider, provider_id, entity_id, valid_from,
                       metadata_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
                       ON CONFLICT(provider, provider_id) DO UPDATE SET entity_id=excluded.entity_id,
                       valid_to=NULL, metadata_json=excluded.metadata_json, updated_at=excluded.updated_at""",
                    (PROVIDER, provider_id, canonical_id, now, json.dumps({"method": method}, sort_keys=True), now, now),
                )
            connection.execute(
                """INSERT INTO provider_mapping_evidence(provider, provider_id, entity_type,
                   mapping_state, mapping_method, confidence, evidence_json, source_version,
                   first_seen_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(provider, provider_id) DO UPDATE SET entity_type=excluded.entity_type,
                   mapping_state=excluded.mapping_state, mapping_method=excluded.mapping_method,
                   confidence=excluded.confidence, evidence_json=excluded.evidence_json,
                   source_version=excluded.source_version, last_seen_at=excluded.last_seen_at""",
                (PROVIDER, provider_id, entity_type, state, method, confidence,
                 json.dumps(recorded_evidence, sort_keys=True), SOURCE_VERSION,
                 first_seen["first_seen_at"] if first_seen else now, now),
            )
            old_entity = previous["entity_id"] if previous else None
            old_state = previous_evidence["mapping_state"] if previous_evidence else None
            if old_entity != canonical_id or old_state != state:
                connection.execute(
                    """INSERT INTO provider_mapping_audit(id, provider, provider_id, prior_entity_id,
                       new_entity_id, prior_state, new_state, action, reason, actor, evidence_json, created_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, 'reconcile', ?, 'system', ?, ?)""",
                    (f"map-audit-{uuid.uuid4().hex}", PROVIDER, provider_id, old_entity, canonical_id,
                     old_state, state, method, json.dumps(recorded_evidence, sort_keys=True), now),
                )
        return {"providerId": provider_id, "canonicalId": canonical_id if state in AUTO_CONSUMABLE_STATES else None,
                "mappingState": state, "mappingMethod": method, "confidence": confidence,
                "activityClass": activity, "relevanceTier": tier}

    def reconcile_team(self, row: dict[str, Any]) -> dict[str, Any]:
        provider_id = f"sportsdataio:team:{row.get('TeamID')}"
        key = canonical_team_id(row.get("Key"))
        name = str(row.get("FullName") or " ".join(filter(None, (row.get("City"), row.get("Name"))))).strip()
        expected = MLB_TEAMS.get(key)
        normalized_candidates = {normalize_name(name), normalize_name(row.get("Name")), normalize_name(row.get("City"))}
        expected_names = {normalize_name(expected[0]), *(normalize_name(value) for value in expected[1])} if expected else set()
        state = "deterministic" if expected and bool(expected_names & normalized_candidates) else "ambiguous" if expected else "unresolved"
        return self._record(provider_id=provider_id, entity_type="team", canonical_id=key if state == "deterministic" else None,
                            state=state, method="league_key_and_name" if expected else "unknown_team_key", confidence=1.0 if state == "deterministic" else 0.0,
                            evidence={"league": "mlb", "key": key, "nameMatched": bool(expected_names & normalized_candidates)},
                            display_name=name, active=row.get("Active") is not False, activity="active" if row.get("Active") is not False else "historical_inactive",
                            tier="A", public=True, aliases=(key, row.get("City"), row.get("Name"), *(expected[1] if expected else ())))

    def reconcile_venue(self, row: dict[str, Any], home_team_ids: Iterable[str] = ()) -> dict[str, Any]:
        provider_id = f"sportsdataio:venue:{row.get('StadiumID')}"
        name = str(row.get("Name") or "").strip()
        normalized = normalize_name(name)
        location = ", ".join(filter(None, (str(row.get("City") or "").strip(), str(row.get("State") or "").strip())))
        canonical_id = KNOWN_VENUES.get(normalized)
        method = "exact_registry_name"
        if not canonical_id and normalized and location:
            canonical_id = f"venue-{slug(name)}"
            method = "unique_name_and_location"
        state = "deterministic" if canonical_id else "unresolved"
        return self._record(provider_id=provider_id, entity_type="venue", canonical_id=canonical_id,
                            state=state, method=method, confidence=1.0 if method == "exact_registry_name" else 0.95 if canonical_id else 0.0,
                            evidence={"normalizedName": normalized, "location": location, "homeTeamIds": sorted(set(home_team_ids))},
                            display_name=name, active=row.get("Active") is not False, activity="active" if row.get("Active") is not False else "historical_inactive",
                            tier="A", public=canonical_id in KNOWN_VENUES.values(), aliases=(name,))

    def reconcile_player(self, row: dict[str, Any], team_id: str) -> dict[str, Any]:
        provider_id = f"sportsdataio:player:{row.get('PlayerID')}"
        name = str(row.get("Name") or " ".join(filter(None, (row.get("FirstName"), row.get("LastName"))))).strip()
        normalized = normalize_name(name)
        position = str(row.get("Position") or "").strip()
        birth_date = str(row.get("BirthDate") or "")[:10]
        activity, tier = classify_player(row, team_id)
        known = KNOWN_ATHLETES.get(normalized)
        fingerprint = hashlib.sha256(f"mlb|athlete|{normalized}|{birth_date}".encode()).hexdigest() if birth_date else ""
        existing = None
        if fingerprint:
            existing = self.database.connection.execute(
                "SELECT entity_id FROM entity_identity_metadata WHERE identity_fingerprint=?", (fingerprint,)
            ).fetchone()
        canonical_id = known or (existing["entity_id"] if existing else None)
        method = "exact_canonical_alias" if known else "identity_fingerprint" if existing else ""
        if not canonical_id and activity in {"active", "injured_list"} and normalized and birth_date and team_id and position:
            canonical_id = f"mlb-player-{slug(name)}-{fingerprint[:8]}"
            method = "controlled_active_creation"
        state = "confirmed" if known or existing else "deterministic" if canonical_id else "historical" if activity == "historical_inactive" else "unresolved"
        confidence = 1.0 if known else 0.98 if canonical_id else 0.0
        return self._record(provider_id=provider_id, entity_type="athlete", canonical_id=canonical_id,
                            state=state, method=method or "insufficient_identity_evidence", confidence=confidence,
                            evidence={"normalizedName": normalized, "birthDatePresent": bool(birth_date), "teamId": team_id,
                                      "position": position, "identityFingerprint": fingerprint},
                            display_name=name, active=activity in {"active", "injured_list"}, activity=activity, tier=tier,
                            position=position, team_id=team_id, public=bool(known), aliases=(name, row.get("FirstName"), row.get("LastName")))

    def reconcile_event(self, row: dict[str, Any], away_id: str, home_id: str, schedule_date: str,
                        game_number: int | None) -> dict[str, Any]:
        provider_id = f"sportsdataio:game:{row.get('GameID')}"
        previous_provider = row.get("RescheduledFromGameID")
        prior = None
        if previous_provider not in (None, ""):
            prior = self.database.connection.execute(
                "SELECT entity_id FROM provider_mappings WHERE provider=? AND provider_id=?",
                (PROVIDER, f"sportsdataio:game:{previous_provider}"),
            ).fetchone()
        game_no = game_number or 1
        signature = f"mlb|{row.get('Season') or schedule_date[:4]}|{schedule_date}|{away_id}|{home_id}|{game_no}"
        canonical_id = prior["entity_id"] if prior else f"mlb-{schedule_date}-{away_id.casefold()}-{home_id.casefold()}-{game_no}"
        state = "deterministic" if away_id in MLB_TEAMS and home_id in MLB_TEAMS else "unresolved"
        return self._record(provider_id=provider_id, entity_type="event", canonical_id=canonical_id if state == "deterministic" else None,
                            state=state, method="reschedule_lineage" if prior else "schedule_signature",
                            confidence=1.0 if prior else 0.98 if state == "deterministic" else 0.0,
                            evidence={"signature": signature, "awayTeamId": away_id, "homeTeamId": home_id,
                                      "scheduleDate": schedule_date, "doubleheaderGame": game_no,
                                      "rescheduledFromPresent": bool(previous_provider)},
                            display_name=f"{away_id} at {home_id}", active=True, activity="active", tier="A", public=False)

    def metrics(self) -> dict[str, Any]:
        rows = self.database.connection.execute(
            """SELECT e.entity_type, e.mapping_state, e.evidence_json, m.activity_class, m.relevance_tier
               FROM provider_mapping_evidence e
               LEFT JOIN provider_mappings p ON p.provider=e.provider AND p.provider_id=e.provider_id
               LEFT JOIN entity_identity_metadata m ON m.entity_id=p.entity_id
               WHERE e.provider=?""", (PROVIDER,),
        ).fetchall()
        by_type: dict[str, Counter[str]] = {}
        activity = Counter()
        tiers = Counter()
        for row in rows:
            by_type.setdefault(row["entity_type"], Counter())[row["mapping_state"]] += 1
            evidence = json.loads(row["evidence_json"] or "{}")
            activity_value = evidence.get("activityClass") or row["activity_class"]
            tier_value = evidence.get("relevanceTier") or row["relevance_tier"]
            if row["entity_type"] == "athlete" and activity_value:
                activity[activity_value] += 1
            if tier_value:
                tiers[tier_value] += 1
        def domain(item_type: str) -> dict[str, Any]:
            counts = by_type.get(item_type, Counter())
            total = sum(counts.values())
            resolved = sum(counts[state] for state in AUTO_CONSUMABLE_STATES)
            return {"total": total, "confirmed": counts["confirmed"], "deterministic": counts["deterministic"],
                    "ambiguous": counts["ambiguous"], "unresolved": counts["unresolved"], "historical": counts["historical"],
                    "mappingSuccessRate": round(resolved / total, 6) if total else None,
                    "unresolvedRate": round((counts["unresolved"] + counts["ambiguous"]) / total, 6) if total else None}
        return {"sourceVersion": SOURCE_VERSION, "domains": {key: domain(key) for key in ("team", "venue", "athlete", "event")},
                "playerClassification": {key: int(activity[key]) for key in sorted(ACTIVITY_CLASSES)},
                "relevanceTiers": {key: int(tiers[key]) for key in ("A", "B", "C", "D")},
                "consumerPolicy": "confirmed_and_deterministic_only"}

    def list_review_queue(self, *, entity_type: str | None = None, limit: int = 100) -> list[dict[str, Any]]:
        params: list[Any] = [PROVIDER]
        clause = ""
        if entity_type:
            clause = " AND entity_type=?"; params.append(entity_type)
        params.append(max(1, min(limit, 500)))
        rows = self.database.connection.execute(
            f"""SELECT provider_id, entity_type, mapping_state, mapping_method, confidence,
                evidence_json, first_seen_at, last_seen_at FROM provider_mapping_evidence
                WHERE provider=? AND mapping_state NOT IN ('confirmed','deterministic','rejected','superseded')
                {clause} ORDER BY CASE mapping_state WHEN 'ambiguous' THEN 0 WHEN 'probable' THEN 1 ELSE 2 END,
                last_seen_at DESC LIMIT ?""", params,
        ).fetchall()
        return [{"providerId": row["provider_id"], "entityType": row["entity_type"], "state": row["mapping_state"],
                 "method": row["mapping_method"], "confidence": row["confidence"],
                 "evidence": json.loads(row["evidence_json"]), "firstSeenAt": row["first_seen_at"], "lastSeenAt": row["last_seen_at"]}
                for row in rows]

    def public_entities(self, query: str = "", *, canonical_id: str = "", limit: int = 25) -> list[dict[str, Any]]:
        """Return only reviewed canonical identities; never provider candidates."""
        term = normalize_name(query)
        params: list[Any] = []
        where = "WHERE m.public_eligible=1 AND e.review_status IN ('confirmed','deterministic') AND e.deleted_at IS NULL"
        if canonical_id:
            where += " AND e.id=?"; params.append(canonical_id)
        query_limit = 100 if term else max(1, min(limit, 100))
        rows = self.database.connection.execute(
            f"""SELECT e.id,e.entity_type,e.display_name,e.active,m.position,m.current_team_id,
                GROUP_CONCAT(a.alias, '|||') AS aliases
                FROM entities e JOIN entity_identity_metadata m ON m.entity_id=e.id
                LEFT JOIN entity_aliases a ON a.entity_id=e.id {where}
                GROUP BY e.id ORDER BY e.display_name LIMIT ?""",
            (*params, query_limit),
        ).fetchall()
        items = []
        for row in rows:
            aliases = list(dict.fromkeys((row["aliases"] or "").split("|||")))
            if term and not any(term in normalize_name(value) for value in (row["id"], row["display_name"], *aliases)):
                continue
            items.append({"id": row["id"], "type": row["entity_type"], "displayName": row["display_name"],
                          "aliases": aliases, "active": bool(row["active"]), "position": row["position"] or "",
                          "teamId": row["current_team_id"] or "", "identityState": "confirmed"})
        return items[:limit]

    def review(self, provider_id: str, action: str, *, canonical_id: str | None, actor: str, reason: str,
               alias: str | None = None) -> dict[str, Any]:
        if action not in {"confirm", "reject", "create", "add_alias", "defer"}:
            raise ValidationError("Unsupported mapping review action.")
        if not str(provider_id).strip() or not str(actor).strip() or not str(reason).strip():
            raise ValidationError("Provider ID, actor, and review reason are required.")
        if action in {"confirm", "create", "add_alias"} and not canonical_id:
            raise ValidationError("Canonical ID is required for this review action.")
        current = self.database.connection.execute(
            "SELECT * FROM provider_mapping_evidence WHERE provider=? AND provider_id=?", (PROVIDER, provider_id),
        ).fetchone()
        if not current:
            raise ValidationError("Provider mapping candidate was not found.")
        evidence = json.loads(current["evidence_json"])
        target_state = "rejected" if action == "reject" else "probable" if action == "defer" else "confirmed"
        target_id = canonical_id
        if action == "create" and not target_id:
            raise ValidationError("Canonical ID is required for controlled creation.")
        now = utc_now()
        with self.database.transaction() as connection:
            if target_state == "confirmed":
                entity = connection.execute("SELECT id FROM entities WHERE id=?", (target_id,)).fetchone()
                if not entity and action == "create":
                    display_name = str(evidence.get("normalizedName") or target_id).title()
                    self._upsert_entity(connection, target_id or "", current["entity_type"], display_name, True, "confirmed", 1.0, now)
                    self._upsert_metadata(connection, target_id or "", "unknown", "D", False, None, None, now,
                                          {"createdByReview": True})
                    entity = connection.execute("SELECT id FROM entities WHERE id=?", (target_id,)).fetchone()
                if not entity:
                    raise ValidationError("Review cannot confirm an unknown canonical entity.")
                connection.execute(
                    """INSERT INTO provider_mappings(provider, provider_id, entity_id, valid_from, metadata_json, created_at, updated_at)
                       VALUES (?, ?, ?, ?, '{}', ?, ?) ON CONFLICT(provider, provider_id)
                       DO UPDATE SET entity_id=excluded.entity_id, valid_to=NULL, updated_at=excluded.updated_at""",
                    (PROVIDER, provider_id, target_id, now, now, now),
                )
                if alias:
                    self._upsert_alias(connection, target_id, alias, "manual_review")
            connection.execute(
                """UPDATE provider_mapping_evidence SET mapping_state=?, mapping_method=?, confidence=?,
                   reviewed_at=?, reviewed_by=?, review_note=?, last_seen_at=? WHERE provider=? AND provider_id=?""",
                (target_state, f"manual_{action}", 1.0 if target_state == "confirmed" else 0.0,
                 now, actor, reason, now, PROVIDER, provider_id),
            )
            if target_state not in AUTO_CONSUMABLE_STATES:
                connection.execute(
                    "UPDATE provider_mappings SET valid_to=?,updated_at=? WHERE provider=? AND provider_id=?",
                    (now, now, PROVIDER, provider_id),
                )
            connection.execute(
                """INSERT INTO provider_mapping_audit(id, provider, provider_id, new_entity_id,
                   prior_state, new_state, action, reason, actor, evidence_json, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (f"map-audit-{uuid.uuid4().hex}", PROVIDER, provider_id, target_id,
                 current["mapping_state"], target_state, action, reason, actor, json.dumps(evidence, sort_keys=True), now),
            )
            connection.execute(
                """INSERT INTO recalculation_queue(id,league_id,trigger_type,record_id,
                   affected_outputs_json,model_version,input_timestamp,status,created_at)
                   VALUES (?, 'mlb', 'identity_mapping_change', ?, ?, ?, ?, 'queued', ?)""",
                (f"recalc-{uuid.uuid4().hex}", target_id or provider_id,
                 json.dumps(["profiles", "search", "research", "comparisons", "stories", "markets"]),
                 SOURCE_VERSION, now, now),
            )
        return {"providerId": provider_id, "canonicalId": target_id, "state": target_state, "action": action, "reviewedAt": now}
