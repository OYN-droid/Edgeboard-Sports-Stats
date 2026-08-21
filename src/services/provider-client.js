import { mockProviderPayload } from "../data/mock-provider.js";

const GATEWAY_ENDPOINT = "/api/provider-data";
const GATEWAY_TIMEOUT_MS = 10000;

function isProviderPayload(payload) {
  return Boolean(
    payload
    && typeof payload === "object"
    && Array.isArray(payload.league_statuses)
    && Array.isArray(payload.events)
    && Array.isArray(payload.offers)
    && (!Object.hasOwn(payload, "entities") || Array.isArray(payload.entities)),
  );
}

function offlineFallback(error) {
  const now = new Date().toISOString();
  return {
    ...mockProviderPayload,
    provider_status: {
      ...(mockProviderPayload.provider_status || {}),
      state: "offline-fallback",
      offline_fallback: true,
      partial: true,
      fetched_at: now,
      errors: [{ domain: "gateway", code: "gateway_unavailable", message: error?.message || "Provider gateway unavailable." }],
    },
  };
}

export async function loadProviderPayload() {
  const useGateway = new URLSearchParams(window.location.search).get("provider") === "gateway";
  if (!useGateway) return mockProviderPayload;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), GATEWAY_TIMEOUT_MS);
  try {
    const response = await fetch(GATEWAY_ENDPOINT, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Provider gateway returned HTTP ${response.status}.`);
    const payload = await response.json();
    if (!isProviderPayload(payload)) throw new Error("Provider gateway returned an invalid normalized payload.");
    return payload;
  } catch (error) {
    return offlineFallback(error);
  } finally {
    window.clearTimeout(timeout);
  }
}
