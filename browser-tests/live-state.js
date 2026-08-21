import { createSportsRepository } from "../src/services/sports-repository.js";
import { mockProviderPayload } from "../src/data/mock-provider.js";

const checks = [];
const check = (condition, label) => { if (!condition) throw new Error(label); checks.push(label); };
try {
  const payload = structuredClone(mockProviderPayload);
  const event = payload.events.find((item) => item.league_key === "mlb");
  check(Boolean(event), "MLB fixture event exists");
  event.status = "in_progress";
  event.live_state = {
    id: "mlb-live-browser", eventId: event.event_id, status: "in_progress",
    score: { away: 4, home: 3 }, period: { sport: "baseball", inning: 6, half: "top" }, outs: 1,
    count: { balls: 2, strikes: 1 }, bases: { first: true, second: false, third: true },
    currentBatterId: "mlb-aaron-judge", currentPitcherId: "mlb-gerrit-cole",
    providerUpdatedAt: new Date().toISOString(), fetchedAt: new Date().toISOString(),
    freshness: { state: "fresh", ageSeconds: 8, providerDelaySeconds: 2 }, warnings: [],
    source: "edgeboard-mlb-live-state-fixture", sourceMode: "fixture",
    edgeTrust: { researchQuality: { label: "Limited", score: 49, isProbability: false } },
  };
  const offer = payload.offers.find((item) => item.event_id === event.event_id);
  if (offer?.selections?.length) Object.assign(offer.selections[0], {
    event_status: "in_progress", pregame_context_current: false,
    tracking_state: "event_started", context_review_required: true,
  });
  const repository = createSportsRepository(payload);
  const normalized = repository.getEvents("mlb").find((item) => item.id === event.event_id);
  check(normalized.liveState.status === "in_progress", "canonical live status survives normalization");
  check(normalized.liveState.score.away === 4 && normalized.liveState.score.home === 3, "score survives normalization");
  check(normalized.liveState.period.inning === 6 && normalized.liveState.period.half === "top", "inning survives normalization");
  check(normalized.liveState.outs === 1, "outs survive normalization");
  check(normalized.liveState.count.balls === 2 && normalized.liveState.count.strikes === 1, "count survives normalization");
  check(normalized.liveState.bases.first && normalized.liveState.bases.third, "base occupancy survives normalization");
  check(normalized.liveState.currentBatterId === "mlb-aaron-judge", "canonical batter survives normalization");
  check(normalized.liveState.currentPitcherId === "mlb-gerrit-cole", "canonical pitcher survives normalization");
  check(normalized.liveState.freshness.state === "fresh", "freshness survives normalization");
  check(normalized.liveState.edgeTrust.researchQuality.isProbability === false, "Edge Trust is not probability");
  if (offer?.selections?.length) {
    const market = repository.getMarkets("mlb").find((item) => item.eventId === event.event_id);
    const selection = market?.selections.find((item) => item.id === offer.selections[0].selection_id);
    check(selection?.eventStatus === "in_progress", "market receives event status context");
    check(selection?.pregameContextCurrent === false, "started event expires current pregame context");
    check(selection?.trackingState === "event_started", "started market enters tracking state");
    check(selection?.contextReviewRequired === true, "started market requires research review");
  }
  check(!JSON.stringify(normalized.liveState).includes("providerStatus"), "provider-specific status is absent");
  check(!JSON.stringify(normalized.liveState).match(/api.?key|authorization/i), "credentials are absent");
  document.querySelector("#results").dataset.status = "passed";
  document.querySelector("#results").textContent = `PASS (${checks.length} checks)\n${checks.map((item, index) => `${index + 1} ${item}`).join("\n")}`;
} catch (error) {
  document.querySelector("#results").dataset.status = "failed";
  document.querySelector("#results").textContent = `FAIL\n${error.stack || error}`;
}
