# Visual analytics architecture

Phase 7 adds a provider-neutral visual analytics layer. EdgeBoard still runs in
sample mode: the visualizations do not represent live sportsbook or statistical
data.

## Data flow

1. `src/config/visualization-registry.js` defines canonical visualization IDs,
   compatible sports and entities, required capabilities and fields, minimum
   samples, interactions, coordinate systems, and fallback types.
2. `src/config/provider-visualization-capabilities.js` declares what the current
   mock provider can and cannot supply. An unavailable capability is explicit;
   the UI does not infer tracking data.
3. `src/data/mock-visualization-provider.js` supplies provider-shaped sample
   datasets with source, freshness, units, coverage, and coordinate metadata.
4. `src/services/visualization-service.js` validates a normalized request,
   verifies provider capabilities, filters and validates source rows, calculates
   summaries, and returns a chart-agnostic view model plus an accessible table.
5. `src/components/visualization-renderer.js` renders that view model with native
   HTML and SVG. UI code never reads the mock provider response directly.
6. `src/services/visual-query-service.js` maps explicit visual language such as
   “shot chart,” “race position,” or “odds movement” to a normalized visual
   request. Entity resolution continues to use the canonical entity registry.

The repository is lazy-loaded when a visual is requested, cached by normalized
request identity, deduplicates in-flight requests, and supports abort signals so
an older response cannot replace a newer view.

## Provider contract

A visualization provider should return datasets containing:

- a canonical visualization type, sport, league, entity IDs, and optional event
  IDs;
- typed rows with the fields required by the registry definition;
- field units and a declared coordinate system when coordinates are present;
- provider attribution, sample/live disclosure, source timestamps, and data
  quality;
- capability coverage and explicit partial or unavailable states.

Adapters must normalize vendor IDs before data reaches the repository. Betting
history must retain canonical market identity, sportsbook attribution, and
timestamps. Coordinates must identify their provider scale or be normalized by
the adapter. Missing values remain missing; they must not be converted to zero.

## Validation and honest fallbacks

The service rejects unsupported sport/type combinations and missing
capabilities. It excludes malformed timestamps, non-finite values, duplicate
rows, invalid laps or positions, and out-of-bounds normalized coordinates. It
sorts time, lap, and distance series before rendering, discloses excluded rows,
and emits partial/stale warnings.

When a requested visual cannot be supported, the response uses the registry’s
fallback when that fallback has valid provider rows. Otherwise it returns an
explicit unavailable state. No synthetic tracking points, telemetry, betting
history, records, or advanced metrics are generated.

Long cartesian series are deterministically decimated for display while the
sample count and accessible table retain their disclosed scope. Rolling
averages and summary values are calculated from valid source rows only.

## Rendering and accessibility

Charts use native SVG and existing EdgeBoard styles; no charting dependency was
added. Each rendered view includes:

- an SVG title and description;
- a concise text summary and source/freshness disclosure;
- keyboard-focusable data points where applicable;
- stateful series controls with `aria-pressed`;
- a full accessible data table;
- copy-summary, copy-data, CSV export, and share-link actions;
- sample, stale, partial, and unavailable warnings.

Charts do not use comprehension-delaying animation. Color is supplemented by
labels, symbols, and table values. Mobile and tablet layouts keep the chart and
table inside their containers.

## Shareable state

The application serializes the active visual in:

- `visual`
- `visualEntity`
- `visualSport`
- `visualLeague`
- `visualWindow`
- `visualThreshold`
- `visualSeries`

Mode, research text, navigation scope, athlete/profile routes, and bet-slip
state remain independently preserved. `popstate` rebuilds the request from the
URL, and invalid or unsupported state falls back safely.

## Provider gaps represented today

The registry represents possession maps, rotation timelines, tennis rally maps,
and tournament brackets, but marks them unavailable because the mock provider
does not supply their required tracking or bracket capabilities. Other
sport-specific visualizations are available only for the representative sample
entities and events included by the mock provider.

## Test harness

With the local server running, open:

```text
http://127.0.0.1:9010/browser-tests/visualizations.html
```

The harness covers registry and capability behavior, request and row
validation, sport-specific sample views, deterministic calculations, fallback
states, cache/cancellation behavior, accessible rendering, shareable controls,
research integration, profile entry points, themes, and responsive overflow.
