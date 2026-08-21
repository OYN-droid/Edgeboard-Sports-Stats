# EdgeBoard Sports Stats

EdgeBoard is a multi-sport research interface with normalized sports, event, market, and historical-stat models. It supports Stats, Betting, and Both research modes. The app runs entirely in sample mode by default and does not claim live sportsbook or live statistical data.

Reliable Live Data Ticket 9 adds provider-neutral MLB event progression, scores,
inning state, participant context, bounded transition history, and controlled
polling policy. It remains fixture/sample-first and SportsDataIO shadow-only;
polling is disabled by default. See [the Ticket 9 architecture](docs/reliable-live-ticket-9-mlb-live-state.md).

Reliable Live Data Ticket 10 adds a 41-domain MLB certification matrix,
explicit owner-controlled promotion and rollback, independent kill switches,
health-aware failover, and certification-aware public labels. No domain is
currently promoted beyond fixture support. See [the Ticket 10 certification review](docs/reliable-live-ticket-10-mlb-certification.md).

Ticket 10.1 adds explicitly authorized, bounded MLB Shadow validation windows,
per-attempt request budgets, measured entitlement and quality evidence, and
manual discrepancy/mapping review. It does not activate public live data. See
[the Ticket 10.1 Shadow-window architecture](docs/reliable-live-ticket-10-1-shadow-window.md).

Ticket 10.2 adds durable provider-to-canonical identity mappings, centralized
MLB aliases, activity/relevance classification, review queues, and tier-specific
Shadow metrics. Only confirmed or deterministic mappings are consumer-eligible;
the public source remains the fixture. See [the Ticket 10.2 identity architecture](docs/reliable-live-ticket-10-2-identity-reconciliation.md).

## Run the application

Complete browser sample dataset:

```bash
python3 -m server.app --port 9010
```

Then open `http://127.0.0.1:9010/`. This SPA-aware server is also required for
browser regression tests that refresh extensionless client routes such as
`/about`, `/history/records`, and `/markets/screener`. Missing static files still
return HTTP 404.

Optional provider-gateway scaffold:

```bash
python3 -m server.app --port 9010
```

Open `http://127.0.0.1:9010/?provider=gateway` to load the gateway's normalized response. Without the query parameter, the browser continues to use the complete local sample dataset. The SportsDataIO Discovery Lab integration is shadow-only: it validates and compares MLB schedules/entities server-side while the gateway continues serving the validated fixture until certification.

Phase 9 production-boundary server:

```bash
python3 -m server.app --check-config
python3 scripts/migrate.py
python3 -m server.app --port 9010
```

The default remains a clearly attributed recorded fixture. Useful endpoints are
`/api/status`, `/api/status/ready`, `/api/config/public`, and
`/api/provider-data`. No live-data claim is active without a configured,
authenticated, successfully validated provider.

## Portfolio deployment

The canonical deployment path is the single Python web service declared in
[`render.yaml`](render.yaml). EdgeBoard has no third-party production Python
dependencies; the build command compiles the server and scripts, and the start
command serves the frontend, static assets, and relative `/api/*` routes from
the same origin:

```bash
python3 -m server.app --host 0.0.0.0 --port "$PORT"
```

For a local production-mode smoke test with no provider credentials:

```bash
export EDGEBOARD_ENV=production
export EDGEBOARD_DATA_MODE=sample
export SAMPLE_MODE=true
export SAMPLE_MODE_ENABLED=true
export APP_BASE_URL=http://127.0.0.1:10000
export ALLOWED_ORIGINS=http://127.0.0.1:10000
export PORT=10000
python3 -m server.app --host 0.0.0.0 --port "$PORT"
```

Set `APP_BASE_URL` and `ALLOWED_ORIGINS` to the final HTTPS deployment origin;
the Render Blueprint prompts for both instead of hard-coding a future URL.
Render supplies `PORT`. Explicit `--port` wins, followed by `PORT`,
`EDGEBOARD_SERVER_PORT`, and the local `9010` default. Readiness is checked at
`/api/status/ready` and does not require a live provider.

The Blueprint fixes all public league rollouts to `fixture_only` and disables
live data, live odds, provider POC access, server alerts, cloud workspace sync,
and AI explanations. SportsDataIO and other provider credentials are optional
and must not be configured for the portfolio fixture deployment. The public UI
and API continue to label the resulting data as sample/fixture content.

## Tests

```bash
python3 -m unittest discover -s tests -v
```

The MLB schedule/entity proof-of-concept architecture and rollout constraints are documented in [docs/reliable-live-ticket-2-mlb.md](docs/reliable-live-ticket-2-mlb.md). Ticket 4's fixture-primary standings, team-record, qualification, leaderboard, snapshot, and shadow-validation boundary is documented in [docs/reliable-live-ticket-4-mlb.md](docs/reliable-live-ticket-4-mlb.md). Ticket 5's fixture-primary sportsbook, pregame game-market, best-price, freshness, and odds shadow boundary is documented in [docs/reliable-live-ticket-5-mlb-odds.md](docs/reliable-live-ticket-5-mlb-odds.md). Ticket 6's canonical player-prop/stat mapping, threshold evidence, exact-line price comparison, and shadow-only SportsDataIO boundary is documented in [docs/reliable-live-ticket-6-mlb-player-props.md](docs/reliable-live-ticket-6-mlb-player-props.md). Ticket 8's provider-neutral availability and participant context is documented in [docs/reliable-live-ticket-8-mlb-context.md](docs/reliable-live-ticket-8-mlb-context.md), and Ticket 9's event progression and controlled-polling boundary is documented in [docs/reliable-live-ticket-9-mlb-live-state.md](docs/reliable-live-ticket-9-mlb-live-state.md). None of these paths claims live or certified provider coverage.

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

The deterministic research-analyst harness covers the scoped sports-discovery
home, structured planning, evidence identity, research sessions, immutable Edge
Lab scenarios, rejected assumptions, Stats/Betting/Both separation,
stale-market exclusion, transparency, follow-ups, themes, and mobile overflow:

```text
http://127.0.0.1:9010/browser-tests/research-analyst.html
```

The Phase 6 sports-entity harness covers the unified canonical hierarchy,
cross-type autocomplete, generic and athlete-compatible profile routing,
relationships, caching and cancellation, research-assistant identity evidence,
responsive behavior, history restoration, accessibility, and themes:

```text
http://127.0.0.1:9010/browser-tests/entities.html
```

The Phase 7 visual-analytics harness covers the centralized visualization
registry, provider capability gates, normalized visual requests, validation,
sport-specific renderers, honest fallbacks, caching and cancellation, query and
profile integration, shareable controls, accessible tables, themes, and
responsive overflow:

```text
http://127.0.0.1:9010/browser-tests/visualizations.html
```

The Phase 8 workspace harness covers local-only persistence, boards, saved
research, watchlists, in-app alerts, tracked ideas, privacy, search, refresh
history, import/export validation, and cross-tab update detection:

```text
http://127.0.0.1:9010/browser-tests/workspace.html
```

The Historical Explorer harness covers coverage boundaries, record wording,
performance rankings, championships, rivalries, dynasty candidates, comebacks,
upsets, timelines, season routes, search, accessibility, and responsive layouts:

```text
http://127.0.0.1:9010/browser-tests/historical-explorer.html
```

The On This Day harness covers deterministic local-calendar anniversaries,
normalized historical evidence, scope isolation, scoring, trust, stable routes,
search, sharing, accessible timelines, themes, and responsive layouts:

```text
http://127.0.0.1:9010/browser-tests/anniversaries.html
```

The connected-knowledge-graph harness covers canonical direct and reverse
relationships, ambiguity-safe provider identity reconciliation, normalized
events, story/insight/history paths, mode-aware markets, caching and
cancellation, profile-to-research navigation, accessibility, themes, console
errors, and mobile overflow:

```text
http://127.0.0.1:9010/browser-tests/knowledge-graph.html
```

See [On This Day architecture](docs/on-this-day.md) for the normalized model,
date engine, data flow, safety rules, routes, and provider extension point.

See [Connected Sports Knowledge Graph architecture](docs/connected-knowledge-graph.md)
for the Sprint 6 node and edge contracts, canonical relationship rules,
composition flow, UI integration, caching, accessibility, and current limits.

## Market taxonomy

`src/config/market-catalog.js` is the provider-neutral source of truth for canonical market definitions and confidence bands. The sports registry declares which definitions a sport can support; the repository maps provider offers to those definitions; and the UI only promotes categories and markets that have an open or explicitly suspended provider instance.

Confidence is model-signal strength, not win probability. The filter spans 0–100 in one-point steps; 0 disables it. The default is 58, and the value persists in local storage and the `confidence` URL parameter.

## Navigation scope

The normalized top-navigation selection is the shared scope for active navigation styling, Today’s Markets, and the research-board league context. League, sport, category, Live, Today, All Sports, and More-menu destinations are serialized in the `scope` URL parameter and local storage. `getVisibleMarketSummaries` in `src/services/navigation-service.js` owns scope filtering and aggregate counts so UI components do not maintain separate league lists.

See [Provider integration](docs/provider-integration.md) for contracts, adapters, environment variables, freshness rules, and the live-provider checklist, plus the [provider adapter author guide](docs/provider-adapter-author-guide.md) for the fail-closed Ticket 2 boundary.

See the [Reliable live-data architecture audit](docs/live-data-architecture-audit.md)
for the current provider boundary, fixture assumptions, normalization gaps, and
security findings. Its companion documents cover the [domain inventory](docs/live-data-domain-inventory.md),
[league coverage matrix](docs/live-data-coverage-matrix.md), [provider candidates](docs/live-data-provider-candidates.md),
[recommended stack](docs/live-data-provider-strategy.md), [rollout plan](docs/live-data-rollout-plan.md),
[Edge Trust requirements](docs/live-data-edge-trust-requirements.md), [ingestion and storage](docs/live-data-ingestion-storage.md),
[cost controls](docs/live-data-cost-rate-limits.md), [backend security](docs/live-data-backend-security.md),
[ticket backlog](docs/live-data-ticket-backlog.md), [environment inventory](docs/live-data-environment.md),
and [unresolved owner decisions](docs/live-data-unresolved-decisions.md). The
SportsDataIO MLB proof of concept is opt-in and shadow-only; it does not change
the fixture-primary public rollout or certify any live domain.

See [Statistical research architecture](docs/statistical-research.md) for the historical provider contract, canonical stat flow, mode behavior, and persistence rules.

See [Historical Explorer architecture and coverage](docs/historical-explorer.md) for the league-by-league sample coverage audit, validation wording, eligibility rules, routing, and known gaps.

See [Athlete profiles](docs/athlete-profiles.md) for profile routing, normalized view models, sport-aware configuration, provider methods, media fallbacks, and deterministic insight rules.

See [Deterministic insights](docs/deterministic-insights.md) for the Phase 4 rule
registry, evidence pipeline, scoring, streak handling, rarity pools, record
validation, Both-mode market compatibility, saved-state behavior, and provider
limitations.

See [Deterministic research analyst](docs/research-analyst.md) for the Phase 5
planner, evidence contract, explanation layer, Research Completeness rules, and
mode-specific behavior.

See [Sports entity intelligence](docs/entity-intelligence.md) for the Phase 6
canonical hierarchy, shared athlete/generic profile strategy, entity graph,
search, routing, caching, provider gaps, and validation harness.

See [Visual analytics architecture](docs/visual-analytics.md) for the Phase 7
registry, provider contract, request and validation flow, native SVG renderer,
accessibility behavior, shareable state, and explicit provider gaps.

See [Advanced statistical research](docs/advanced-statistical-research.md) for comparison calculations, leaderboard qualification and tie handling, record validation, exports, and Phase 3 provider methods.

See [Personal workspaces](docs/personal-workspaces.md) for the Phase 8 normalized
domain, IndexedDB persistence, snapshot semantics, privacy boundaries, local
alert evaluation, tracked-research distinction, and Phase 9 backend needs.

See [Production data foundation](docs/production-data-foundation.md) for the
Phase 9 server boundary, normalized contracts, persistence, reconciliation,
cache and failover behavior, ingestion, auth/sync foundations, API operations,
deployment, and rollback.

See [Phase 10 rollout playbook](docs/phase10-rollout-playbook.md) for per-league
rollout states, the MLB/WNBA/UFC/MLS readiness matrix, certification gates,
shadow validation, limited-live behavior, corrections, usage monitoring, and
rollback. No live league is currently certified.

See [Version 1.1 UX refinement](docs/version-1.1-ux.md) for proactive research
guidance, scoped search paths, Today’s research pulse, first-visit onboarding,
workspace defaults, accessibility behavior, and provider limits.

See [Edge Trust architecture](docs/edge-trust.md) for Version 1.2 Research
Quality, provider-conflict handling, sport-aware applicability, league
certification states, coverage projection, protected diagnostics, and history.

See [Edge Intelligence research sessions](docs/research-sessions.md) for Version
1.3 session structure, visible workflow steps, revision history, workspace
resume/save behavior, note privacy, sharing, and Markdown/CSV exports.

See [Edge Lab scenario architecture](docs/edge-lab.md) for Version 1.4 immutable
scenario overlays, controlled assumptions, data classifications, derived-output
boundaries, workspace behavior, sharing, exports, and current limitations.

See [Sports discovery home architecture](docs/home-discovery.md) for Version 1.4
Sprint 1 section composition, deterministic source rules, canonical navigation
scope, mode-aware actions, empty states, and current provider limitations.

See [Deterministic Story Engine](docs/deterministic-story-engine.md) for Version
1.4 Sprint 2 candidate contracts, eligibility, scoring, deduplication, phrasing,
Edge Trust, lifecycle, workspace snapshots, detail routing, and fixture limits.

See [Deterministic Sports Discovery and Exploration Engine](docs/discovery-engine.md)
for Version 1.4 Sprint 3 canonical discovery items, sport-aware taxonomies,
deterministic ranking and diversity, guided paths, local personalization and
privacy controls, grouped search, Edge Intelligence context, routing, caching,
fixture limits, and the Sprint 4 recommendation.

See [Edge Markets architecture](docs/edge-markets.md) for Version 1.5 Sprint 1
canonical market research models, hub and detail routes, observed movement,
verified price comparison, Edge Trust integration, provider gaps, and the
focused browser validation harness.

## Product guides

- [Getting started](docs/getting-started.md)
- [Research guide](docs/research-guide.md)
- [Edge Intelligence guide](docs/edge-intelligence.md)
- [Edge Intelligence and Research Sessions](docs/research-sessions.md)
- [Edge Trust](docs/edge-trust.md)
- [Historical Explorer](docs/historical-explorer.md)
- [Parlay Builder](docs/parlay-builder.md)
- [Keyboard shortcuts](docs/keyboard-shortcuts.md)
- [Data coverage](docs/coverage.md)
- [FAQ](docs/faq.md)
- [About EdgeBoard](docs/about.md)
- [Changelog](docs/changelog.md)
- [Version 1.6 launch-readiness architecture](docs/launch-readiness.md)

The in-app About EdgeBoard experience is available at `/about`. The production-boundary server provides refresh-safe fallback routing for this path.

See [Market Intelligence and Explain the Market](docs/market-explanations.md) for
Version 1.5 Sprint 2 timeline and causality contracts, verified sportsbook
comparison, lineup and injury impact references, structured Edge Intelligence
evidence, Research Quality visuals, search routing, and provider limitations.

See [Market Screener and Opportunity Explorer](docs/market-screener.md) for
Version 1.5 Sprint 3 normalized research filters, deterministic evidence ranking,
windowed rendering, cancellation, comparisons, Workspace presets, Edge
Intelligence context, safety language, and provider-coverage limitations.

See [Edge Markets Parlay Builder](docs/parlay-builder.md) for the deterministic constraint, correlation, refinement, Workspace, and evidence architecture.

See [Reliable Live Data Ticket 7](docs/reliable-live-ticket-7-market-movement.md) for normalized market history, retention controls, verified-cause rules, and the bounded shadow-capture workflow.

See [Reliable Live Data Ticket 9](docs/reliable-live-ticket-9-mlb-live-state.md) for the provider-neutral MLB live-state contract, deterministic versions, transition and correction audit, event-aware polling policy, shadow validation, and strict no-background-loop boundary.
