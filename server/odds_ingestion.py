from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import dataclass
from typing import Any

from .config import ProviderTerms
from .database import Database, utc_now
from .domain_validation import validate_market, validate_records


@dataclass(frozen=True)
class OddsIngestionResult:
    accepted_markets: int
    accepted_snapshots: int
    duplicate_snapshots: int
    rejected_markets: int
    warnings: tuple[str, ...]


class OddsIngestor:
    def __init__(self, database: Database, terms: ProviderTerms):
        self.database = database
        self.terms = terms

    def ingest(self, offers: list[dict[str, Any]], provider: str) -> OddsIngestionResult:
        validation = validate_records(offers, validate_market)
        snapshots = 0
        duplicates = 0
        warnings = list(validation.warnings)
        for offer in validation.accepted:
            market_id = offer["offer_id"]
            updated_at = offer.get("last_updated_at") or offer.get("updated_at") or utc_now()
            with self.database.transaction() as connection:
                connection.execute(
                    """INSERT INTO markets(
                        id,event_id,canonical_market_id,provider_market_id,sportsbook_id,
                        period,settlement_scope,status,source,opened_at,updated_at,closed_at
                    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
                    ON CONFLICT(id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at,
                        closed_at=excluded.closed_at,deleted_at=NULL""",
                    (
                        market_id, offer["event_id"], offer["canonical_market_id"],
                        offer["provider_market_id"], offer.get("sportsbook_id") or offer["source"],
                        offer.get("period") or "full-event", offer["settlement_scope"], offer["status"],
                        provider, offer.get("opened_at"), updated_at, offer.get("closed_at"),
                    ),
                )
            if not self.terms.odds_history_storage_allowed:
                warnings.append("Provider terms do not permit odds-history storage; snapshots were not retained.")
                continue
            for selection in offer["selections"]:
                identity_payload = {
                    "market": market_id,
                    "selection": selection["selection_id"],
                    "line": selection.get("line"),
                    "odds": selection.get("american_odds"),
                    "suspended": offer["status"] == "suspended" or selection.get("suspended") is True,
                }
                digest = hashlib.sha256(
                    json.dumps(identity_payload, sort_keys=True, separators=(",", ":")).encode()
                ).hexdigest()
                inserted = self.database.insert_odds_snapshot({
                    "id": uuid.uuid4().hex,
                    "market_id": market_id,
                    "selection_id": selection["selection_id"],
                    "side": selection.get("side"),
                    "line": selection.get("line") if isinstance(selection.get("line"), (int, float)) else None,
                    "american_odds": selection.get("american_odds"),
                    "is_live": offer.get("is_live") is True,
                    "suspended": identity_payload["suspended"],
                    "source": provider,
                    "provider_updated_at": selection.get("last_updated_at") or updated_at,
                    "payload_hash": digest,
                })
                snapshots += int(inserted)
                duplicates += int(not inserted)
        return OddsIngestionResult(
            len(validation.accepted), snapshots, duplicates, len(validation.rejected), tuple(dict.fromkeys(warnings)),
        )
