# EdgeBoard Sports Stats

EdgeBoard is a multi-sport research interface with normalized sports, event, market, and historical-stat models. It supports Stats, Betting, and Both research modes. The app runs entirely in sample mode by default and does not claim live sportsbook or live statistical data.

## Run the application

Complete browser sample dataset:

```bash
python3 -m http.server 9001 --bind 127.0.0.1
```

Then open `http://127.0.0.1:9001/`.

Optional provider-gateway scaffold:

```bash
python3 -m server.app --port 9010
```

Open `http://127.0.0.1:9010/?provider=gateway` to load the gateway's mock normalized response. Without the query parameter, the browser continues to use the complete local sample dataset.

## Tests

```bash
python3 -m unittest discover -s tests -v
```

The betting browser harness exercises canonical-market parsing, confidence thresholds, the market browser, slip metadata, themes, and a 390px viewport:

```text
http://127.0.0.1:9010/browser-tests/market-depth.html
```

The statistical-research browser harness exercises the normalized stat registry, deterministic parser and calculations, result view models, mode persistence, Both-mode compatibility, stale-response handling, accessibility, and mobile/desktop overflow:

```text
http://127.0.0.1:9010/browser-tests/stats-research.html
```

The Phase 3 advanced-statistics harness covers comparisons, sport-aware presets, team summaries, cross-sport leaderboards, qualification and tie rules, multi-stat filters, historical highs, streaks, head-to-head history, event exploration, safe exports, URL restoration, browser history, and advanced-result accessibility:

```text
http://127.0.0.1:9010/browser-tests/advanced-stats.html
```

The athlete-profile harness covers canonical routes, media fallbacks, sport-aware tabs, calculations, props, keyboard behavior, and responsive layouts:

```text
http://127.0.0.1:9010/browser-tests/athlete-profiles.html
```

## Market taxonomy

`src/config/market-catalog.js` is the provider-neutral source of truth for canonical market definitions and confidence bands. The sports registry declares which definitions a sport can support; the repository maps provider offers to those definitions; and the UI only promotes categories and markets that have an open or explicitly suspended provider instance.

Confidence is model-signal strength, not win probability. The filter spans 0–100 in one-point steps; 0 disables it. The default is 58, and the value persists in local storage and the `confidence` URL parameter.

## Navigation scope

The normalized top-navigation selection is the shared scope for active navigation styling, Today’s Markets, and the research-board league context. League, sport, category, Live, Today, All Sports, and More-menu destinations are serialized in the `scope` URL parameter and local storage. `getVisibleMarketSummaries` in `src/services/navigation-service.js` owns scope filtering and aggregate counts so UI components do not maintain separate league lists.

See [Provider integration](docs/provider-integration.md) for contracts, adapters, environment variables, freshness rules, and the live-provider checklist.

See [Statistical research architecture](docs/statistical-research.md) for the historical provider contract, canonical stat flow, mode behavior, and persistence rules.

See [Athlete profiles](docs/athlete-profiles.md) for profile routing, normalized view models, sport-aware configuration, provider methods, media fallbacks, and deterministic insight rules.

See [Advanced statistical research](docs/advanced-statistical-research.md) for comparison calculations, leaderboard qualification and tie handling, record validation, exports, and Phase 3 provider methods.
