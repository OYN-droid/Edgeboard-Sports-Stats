from __future__ import annotations

import unittest

from server.database import Database
from server.mlb_identity import MlbIdentityService, normalize_name


class MlbIdentityTicket102Tests(unittest.TestCase):
    def setUp(self):
        self.database = Database()
        self.database.migrate()
        self.service = MlbIdentityService(self.database)

    def tearDown(self):
        self.database.close()

    def test_team_alias_and_rebrand_map_to_one_canonical_team(self):
        result = self.service.reconcile_team({
            "TeamID": 1, "Key": "OAK", "FullName": "Oakland Athletics",
            "Name": "Athletics", "City": "Oakland", "Active": True,
        })
        self.assertEqual("ATH", result["canonicalId"])
        self.assertEqual("deterministic", result["mappingState"])

    def test_venue_and_event_ids_do_not_derive_from_provider_ids(self):
        venue = self.service.reconcile_venue({
            "StadiumID": 98123, "Name": "Example Park", "City": "Example", "State": "NY", "Active": True,
        })
        game = self.service.reconcile_event(
            {"GameID": 847263, "Season": 2026}, "NYY", "BOS", "2026-08-08", 2,
        )
        self.assertEqual("venue-example-park", venue["canonicalId"])
        self.assertEqual("mlb-2026-08-08-nyy-bos-2", game["canonicalId"])
        self.assertNotIn("98123", venue["canonicalId"])
        self.assertNotIn("847263", game["canonicalId"])

    def test_duplicate_names_need_birth_date_and_create_distinct_active_players(self):
        base = {"Name": "Alex Smith", "Team": "NYY", "Position": "P", "Status": "Active", "Active": True}
        first = self.service.reconcile_player({**base, "PlayerID": 1, "BirthDate": "1990-01-01"}, "NYY")
        second = self.service.reconcile_player({**base, "PlayerID": 2, "BirthDate": "1992-01-01"}, "NYY")
        unresolved = self.service.reconcile_player({**base, "PlayerID": 3, "BirthDate": None}, "NYY")
        self.assertNotEqual(first["canonicalId"], second["canonicalId"])
        self.assertEqual("deterministic", first["mappingState"])
        self.assertIsNone(unresolved["canonicalId"])
        self.assertEqual("unresolved", unresolved["mappingState"])

    def test_reschedule_lineage_preserves_event_identity(self):
        original = self.service.reconcile_event({"GameID": 10, "Season": 2026}, "BOS", "NYY", "2026-08-08", 1)
        moved = self.service.reconcile_event(
            {"GameID": 11, "Season": 2026, "RescheduledFromGameID": 10},
            "BOS", "NYY", "2026-08-09", 1,
        )
        self.assertEqual(original["canonicalId"], moved["canonicalId"])

    def test_only_confirmed_and_deterministic_are_provider_mappings(self):
        unresolved = self.service.reconcile_player(
            {"PlayerID": 44, "Name": "Uncertain Person", "Status": "Unknown"}, "",
        )
        row = self.database.connection.execute(
            "SELECT entity_id FROM provider_mappings WHERE provider_id='sportsdataio:player:44'"
        ).fetchone()
        evidence = self.database.connection.execute(
            "SELECT mapping_state FROM provider_mapping_evidence WHERE provider_id='sportsdataio:player:44'"
        ).fetchone()
        self.assertIsNone(unresolved["canonicalId"])
        self.assertIsNone(row)
        self.assertEqual("unresolved", evidence["mapping_state"])

    def test_classification_tiers_metrics_and_review_queue_are_durable(self):
        self.service.reconcile_player({"PlayerID": 51, "Name": "Retired Person", "Status": "Retired", "Active": False}, "")
        self.service.reconcile_player({"PlayerID": 52, "Name": "Current Person", "BirthDate": "2000-01-01", "Position": "C", "Status": "Active", "Active": True}, "NYY")
        metrics = self.service.metrics()
        self.assertEqual("confirmed_and_deterministic_only", metrics["consumerPolicy"])
        self.assertGreaterEqual(metrics["playerClassification"].get("active", 0), 1)
        self.assertGreaterEqual(metrics["domains"]["athlete"]["historical"], 1)
        queue = self.service.list_review_queue(entity_type="athlete")
        self.assertTrue(any(item["providerId"] == "sportsdataio:player:51" for item in queue))

    def test_normalization_handles_accents_and_punctuation(self):
        self.assertEqual("jose ramirez jr", normalize_name("José Ramírez, Jr."))

    def test_public_search_uses_canonical_aliases_and_hides_unresolved_candidates(self):
        self.service.reconcile_player({"PlayerID": 77, "Name": "Private Candidate", "Status": "Unknown"}, "")
        self.assertEqual("ATH", self.service.public_entities("Oakland Athletics")[0]["id"])
        self.assertEqual([], self.service.public_entities("Private Candidate"))


if __name__ == "__main__":
    unittest.main()
