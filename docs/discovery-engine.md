# Deterministic Sports Discovery and Exploration Engine

Version 1.4 Sprint 3 adds a discovery orchestration layer over EdgeBoard's existing normalized sports registry, statistics repository, canonical entity registry, Insight Engine, Story Engine, Edge Trust, Edge Intelligence, and local Workspace. It does not create a second statistics engine, infer public popularity, or turn sample relevance into a prediction.

## Architecture

`src/config/discovery-config.js` is the central contract for discovery item types, scoring weights, result limits, exploration categories, and sport-specific topic taxonomies. A topic is eligible only when its required canonical stat, entity type, relationship, or event is present in the existing repositories.

`src/services/discovery-service.js` composes immutable `DiscoveryItem` records. Each record retains a stable ID and type, sport and league scope, canonical entity/event/story/stat/market references, a structured Edge Intelligence query, a refresh-safe route, source signals, attribution, freshness, sample/local labels, validation state, Edge Trust, and Research Quality. The service exposes:

- scoped and diversified discovery results;
- deterministic Trending Research;
- sport-aware categories and supported topics;
- progressive Stats, Betting, and Both exploration paths;
- related research for canonical entities, stories, and events;
- local-only Continue Exploring results from Workspace activity and saved objects;
- fixture-backed Recently Changed results with retained old/new values;
- grouped search suggestions after canonical direct matches;
- bounded caching, targeted invalidation, and stale-request cancellation.

`src/services/home-discovery-service.js` consumes this interface for Trending Research, Continue Exploring, Recently Changed, and Explore Sports. Existing Today's Stories, Today's Games, Today's Markets, facts, milestones, streaks, leaders, and research entry points remain intact.

The UI in `app.js` renders reusable discovery view models, opens progressive topic/path/detail views, restores routes through browser history, and passes the full structured discovery context to Edge Intelligence. The planner and answer services retain that context as explicit evidence. Research text may explain why an item is relevant but cannot claim measured public popularity, strengthen validation, or convert historical facts into odds or predictions.

## Deterministic scoring and diversity

Scoring inputs are configurable and currently include selected sport/league, explicit local favorites, Story Engine score, freshness, Edge Trust, Research Quality, drill-down depth, novelty, optional current-market availability, and opted-in local interest. Stale, partial, small-sample, and repeatedly displayed items receive penalties. Betting confidence is intentionally absent from the formula.

Cross-sport lists apply league/type caps so one sport cannot take over the homepage. A single-league selection never falls back to unrelated leagues. Stats mode omits market topics and market steps; Betting mode labels market topics explicitly; Both mode keeps factual/statistical steps first and adds only provider-confirmed current market context.

## Local personalization and privacy

Continue Exploring reads the existing versioned Workspace domain model rather than creating separate discovery storage. Results are labeled `Local only` and never described as community trends. Users can disable personalized discovery independently, pause activity collection, enable privacy mode so query text is not surfaced, clear activity, or reset personalization. Explicit searches and selected sport/league always override personalization. Initial sports discovery renders before Workspace modules finish loading.

## Routing, accessibility, and performance

Explore, topic, item, path, and change routes use stable query parameters and include sport/league context. Initial loads and browser back/forward restore the same canonical scope. Invalid IDs produce an honest empty state. Links remain links, actions remain buttons, category state uses `aria-pressed`, the explorer is focusable, grouped search results retain listbox semantics, and card grids collapse from three to two to one column without horizontal overflow.

Discovery generation is synchronous and bounded for the current fixture dataset. Results are cached by canonical scope, mode, provider update timestamp, explicit favorite signals, and displayed-item history. Exploration paths are built only when requested. Targeted invalidation removes affected cached scopes without discarding unrelated provider data. Async requests use sequence cancellation so an older scope cannot overwrite a newer result.

## Sample fixtures and limitations

`src/data/mock-discovery-fixtures.js` demonstrates a leaderboard change, streak extension, ended streak, milestone, event reschedule, and line movement. Every fixture is labeled sample data and preserves source, occurrence time, old value, new value, and warning. The engine does not claim these are current real-world changes.

The current repository does not provide public search-volume data, a production recommendation model, complete live change streams, or server-synchronized discovery history. Topics without normalized evidence are hidden. WNBA currently has no sample market offers, so Betting discovery correctly exposes no WNBA market topic. Local preferences do not sync across devices.

## Verification

`browser-tests/discovery-engine.html` contains 143 checks covering the canonical model, validation, taxonomy, scoring, diversity, exact sport/league scope, mode separation, paths, local privacy controls, meaningful changes, related discovery, grouped search, Edge Intelligence context, caching, cancellation, deep links, browser history, accessibility, responsive layouts, themes, console errors, and existing feature presence.

Existing browser suites and the Python backend test suite remain the broader regression gate.

## Sprint 4 recommendation (not implemented)

Sprint 4 should add a provider-certified change-event contract for standings, official injury/lineup status, schedule corrections, record assertions, and market movement, then connect those events to targeted discovery invalidation. Production rollout should require domain-level freshness and certification metadata before any item is labeled live. Server-side, privacy-aware preference sync and paginated discovery history can follow once authentication and conflict policies are approved.
