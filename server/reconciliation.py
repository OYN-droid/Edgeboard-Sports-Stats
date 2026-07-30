from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from typing import Any


RECONCILIATION_STATES = {
    "confirmed", "high_confidence", "ambiguous", "conflicting", "unresolved", "manually_overridden",
}


def normalize_identity_text(value: object) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(character for character in text if not unicodedata.combining(character))
    return re.sub(r"[^a-z0-9]+", " ", text.casefold()).strip()


@dataclass(frozen=True)
class ProviderMapping:
    provider: str
    provider_id: str
    valid_from: str | None = None
    valid_to: str | None = None


@dataclass
class CanonicalEntity:
    canonical_id: str
    entity_type: str
    display_name: str
    sport_id: str = ""
    league_id: str = ""
    provider_mappings: list[ProviderMapping] = field(default_factory=list)
    aliases: list[str] = field(default_factory=list)
    identity_confidence: float = 1.0
    review_status: str = "confirmed"
    active: bool = True
    historical_relationships: list[dict[str, Any]] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "canonicalId": self.canonical_id,
            "entityType": self.entity_type,
            "displayName": self.display_name,
            "sportId": self.sport_id,
            "leagueId": self.league_id,
            "providerMappings": [
                {
                    "provider": mapping.provider,
                    "providerId": mapping.provider_id,
                    "validFrom": mapping.valid_from,
                    "validTo": mapping.valid_to,
                }
                for mapping in self.provider_mappings
            ],
            "aliases": list(self.aliases),
            "identityConfidence": self.identity_confidence,
            "reviewStatus": self.review_status,
            "active": self.active,
            "historicalRelationships": list(self.historical_relationships),
        }


@dataclass(frozen=True)
class ReconciliationResult:
    state: str
    canonical_id: str | None
    confidence: float
    candidates: tuple[str, ...]
    reason: str


class EntityReconciler:
    def __init__(self, entities: list[CanonicalEntity] | None = None, manual_overrides: dict[tuple[str, str], str] | None = None):
        self.entities: dict[str, CanonicalEntity] = {}
        self.provider_index: dict[tuple[str, str], str] = {}
        self.alias_index: dict[tuple[str, str], set[str]] = {}
        self.manual_overrides = dict(manual_overrides or {})
        self.conflicts: list[dict[str, Any]] = []
        for entity in entities or []:
            self.register(entity)

    def register(self, entity: CanonicalEntity) -> None:
        if entity.review_status not in RECONCILIATION_STATES:
            raise ValueError("Unsupported reconciliation state.")
        self.entities[entity.canonical_id] = entity
        for mapping in entity.provider_mappings:
            key = (mapping.provider.casefold(), mapping.provider_id)
            existing = self.provider_index.get(key)
            if existing and existing != entity.canonical_id:
                self.conflicts.append({"type": "provider_mapping", "key": key, "candidates": [existing, entity.canonical_id]})
                continue
            self.provider_index[key] = entity.canonical_id
        for alias in [entity.display_name, *entity.aliases]:
            key = (entity.entity_type, normalize_identity_text(alias))
            self.alias_index.setdefault(key, set()).add(entity.canonical_id)

    def resolve(
        self,
        provider: str,
        provider_id: str,
        *,
        entity_type: str,
        name: str = "",
        sport_id: str = "",
        league_id: str = "",
        team_id: str = "",
        historical_at: str | None = None,
    ) -> ReconciliationResult:
        key = (provider.casefold(), str(provider_id))
        override = self.manual_overrides.get(key)
        if override:
            return ReconciliationResult("manually_overridden", override, 1.0, (override,), "Explicit manual override.")
        exact = self.provider_index.get(key)
        if exact:
            entity = self.entities[exact]
            if entity.entity_type != entity_type:
                return self._conflicting((exact,), "Provider mapping conflicts with the requested entity type.")
            return ReconciliationResult("confirmed", exact, 1.0, (exact,), "Exact provider mapping.")

        normalized_name = normalize_identity_text(name)
        candidates = set(self.alias_index.get((entity_type, normalized_name), set()))
        scoped = [
            self.entities[candidate_id]
            for candidate_id in candidates
            if (not sport_id or self.entities[candidate_id].sport_id == sport_id)
            and (not league_id or self._matches_league(self.entities[candidate_id], league_id, historical_at))
        ]
        if team_id:
            team_scoped = [
                entity for entity in scoped
                if any(
                    relationship.get("type") in {"member_of", "roster"}
                    and relationship.get("targetId") == team_id
                    and self._relationship_active(relationship, historical_at)
                    for relationship in entity.historical_relationships
                )
            ]
            if len(team_scoped) == 1:
                entity = team_scoped[0]
                return ReconciliationResult("high_confidence", entity.canonical_id, 0.95, (entity.canonical_id,), "Unique alias and team relationship.")
            if scoped and not team_scoped:
                return self._conflicting(tuple(sorted(entity.canonical_id for entity in scoped)), "Name matched, but team assignment conflicts.")
            scoped = team_scoped
        if len(scoped) == 1:
            entity = scoped[0]
            return ReconciliationResult("high_confidence", entity.canonical_id, 0.9, (entity.canonical_id,), "Unique normalized alias within scope.")
        if len(scoped) > 1:
            return ReconciliationResult("ambiguous", None, 0.0, tuple(sorted(entity.canonical_id for entity in scoped)), "Multiple canonical entities share this name and scope.")
        return ReconciliationResult("unresolved", None, 0.0, (), "No safe canonical match.")

    def add_manual_override(self, provider: str, provider_id: str, canonical_id: str) -> None:
        if canonical_id not in self.entities:
            raise KeyError("Manual override references an unknown canonical entity.")
        self.manual_overrides[(provider.casefold(), provider_id)] = canonical_id

    def _conflicting(self, candidates: tuple[str, ...], reason: str) -> ReconciliationResult:
        self.conflicts.append({"type": "resolution", "candidates": list(candidates), "reason": reason})
        return ReconciliationResult("conflicting", None, 0.0, candidates, reason)

    @staticmethod
    def _relationship_active(relationship: dict[str, Any], historical_at: str | None) -> bool:
        if not historical_at:
            return not relationship.get("validTo")
        return (not relationship.get("validFrom") or relationship["validFrom"] <= historical_at) and (
            not relationship.get("validTo") or historical_at <= relationship["validTo"]
        )

    @classmethod
    def _matches_league(cls, entity: CanonicalEntity, league_id: str, historical_at: str | None) -> bool:
        if entity.league_id == league_id:
            return True
        return any(
            relationship.get("type") == "league_membership"
            and relationship.get("targetId") == league_id
            and cls._relationship_active(relationship, historical_at)
            for relationship in entity.historical_relationships
        )
