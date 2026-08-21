import { createSportsRepository } from "../src/services/sports-repository.js";
import { mockProviderPayload } from "../src/data/mock-provider.js";
import { recordMeetsParlayConstraints, explainParlayExclusion } from "../src/services/parlay-builder-service.js";

const checks = [];
const check = (condition, label) => { if (!condition) throw new Error(label); checks.push(label); };

try {
  const response = await fetch("/api/certification/mlb");
  const report = await response.json();
  check(response.ok, "public certification endpoint loads");
  check(report.leagueId === "mlb" && report.certificationVersion === "mlb-ticket10-v1", "matrix is canonical and versioned");
  check(report.domains.length === 41, "every implemented MLB domain is represented");
  check(report.domains.every((item) => item.state === "fixture_supported" && item.publicLabel === "Fixture"), "fixture state is explicit for every current domain");
  check(report.automaticPromotion === false && report.ownerActivationReady === false, "public report cannot imply automatic activation");
  check(report.domains.every((item) => !("criteria" in item) && !("controls" in item)), "internal criteria and controls stay protected");
  check(!JSON.stringify(report).match(/api.?key|authorization|subscription.key/i), "public report contains no credentials");

  const coverage = await (await fetch("/api/coverage")).json();
  const mlb = coverage.leagues.find((item) => item.leagueId === "mlb");
  check(mlb.certificationDomains.length === 41, "Data Coverage receives domain certification states");
  check(coverage.liveProviderVerified === false, "fixture certification never creates a false live-provider claim");

  const fixturePayload = structuredClone(mockProviderPayload);
  const liveEvent = fixturePayload.events.find((item) => item.league_key === "mlb");
  liveEvent.status = "in_progress";
  liveEvent.live_state = { status: "in_progress", eventId: liveEvent.event_id, score: { away: 1, home: 2 }, period: { inning: 4, half: "top" }, providerUpdatedAt: new Date().toISOString(), fetchedAt: new Date().toISOString(), freshness: { state: "fresh", ageSeconds: 1, providerDelaySeconds: 1 }, source: "fixture", sourceMode: "fixture", warnings: [] };
  fixturePayload.mlb_certification = report;
  const fixtureRepo = createSportsRepository(fixturePayload);
  check(fixtureRepo.getEvents("mlb").find((item) => item.id === liveEvent.event_id).liveBadgeEligible === false, "fresh fixture score does not receive a Live badge");

  const limitedPayload = structuredClone(fixturePayload);
  limitedPayload.mlb_certification.domains.find((item) => item.domain === "live_score").state = "limited_live";
  limitedPayload.mlb_certification.domains.find((item) => item.domain === "live_score").providerHealth = "healthy";
  const limitedEvent = createSportsRepository(limitedPayload).getEvents("mlb").find((item) => item.id === liveEvent.event_id);
  check(limitedEvent.liveBadgeEligible === true, "fresh Limited Live score with healthy provider can receive a Live badge");
  limitedPayload.events.find((item) => item.event_id === liveEvent.event_id).live_state.freshness.state = "stale";
  check(createSportsRepository(limitedPayload).getEvents("mlb").find((item) => item.id === liveEvent.event_id).liveBadgeEligible === false, "stale score removes the Live badge");

  const offer = limitedPayload.offers.find((item) => item.league_key === "mlb");
  if (offer) {
    offer.source_mode = "live_verified";
    offer.selections.forEach((item) => { item.source_mode = "live_verified"; });
  }
  const marketDomain = limitedPayload.mlb_certification.domains.find((item) => item.domain === "player_props");
  marketDomain.state = "limited_live"; marketDomain.providerHealth = "healthy";
  let repository = createSportsRepository(limitedPayload);
  const market = repository.getMarkets("mlb").find((item) => item.certification?.domain === "player_props");
  check(market?.certification?.liveEligible === true, "Limited Live market domain is carried through normalization");
  const eligible = { valid: true, model: { status: "available" }, sourceMode: "live_verified", liveMarketEligible: true, sportId: "baseball", leagueId: "mlb", marketType: "player prop", marketName: "Strikeouts", sportsbook: "Book", researchQuality: 90, marketTrustScore: 90, freshness: "fresh", lineupConfirmed: true, conflictCount: 0, providerAgreement: "aligned", injuryUncertain: false, historicalCoverage: 10 };
  check(recordMeetsParlayConstraints(eligible, {}), "eligible Limited Live market can enter live research selection");
  const suspended = { ...eligible, liveMarketEligible: false, certificationState: "suspended" };
  check(!recordMeetsParlayConstraints(suspended, {}), "suspended live market is excluded");
  check(explainParlayExclusion(suspended, {}).some((item) => /not eligible/i.test(item)), "Parlay exclusion explains certification failure");
  const fixtureResearch = { ...eligible, sourceMode: "fixture", sample: true, liveMarketEligible: false };
  check(recordMeetsParlayConstraints(fixtureResearch, {}), "clearly labeled fixture research remains available outside live-only use");
  check(!recordMeetsParlayConstraints(fixtureResearch, { onlyLiveCertifiedData: true }), "fixture market cannot silently satisfy live-certified constraint");

  document.querySelector("#results").dataset.status = "passed";
  document.querySelector("#results").textContent = `PASS (${checks.length} checks)\n${checks.map((item, index) => `${index + 1} ${item}`).join("\n")}`;
} catch (error) {
  document.querySelector("#results").dataset.status = "failed";
  document.querySelector("#results").textContent = `FAIL\n${error.stack || error}`;
}
