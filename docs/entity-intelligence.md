# Sports entity intelligence

Phase 6 extends EdgeBoard’s existing canonical athlete identity system into a
single sports-entity graph. It does not create a second athlete registry.

## Canonical model

`src/data/canonical-sports-entities.js` adapts the existing
`CANONICAL_ENTITIES` records and adds non-athlete entity records. Every record
uses the same identity contract:

- stable canonical `id` and typed `type`
- `sportId`/`sport` and `leagueId`/`league`
- display name and aliases
- provider IDs and active status
- media rights/fallback metadata
- related canonical entity IDs
- metadata, statistics, historical-data, insight, and link containers

Entity kinds and their profile strategy are defined in
`src/config/entity-types.js`. Fighters, boxers, and drivers reuse the established
sport-aware athlete profile pipeline. Other entity kinds use the generic entity
profile pipeline. League entities are derived from the normalized sports
registry, so league availability is not maintained in a second UI list.

## Data flow

```text
existing athlete/team identities + sports registry + mock entity identities
                              |
                              v
                 unified canonical entity registry
                      |                   |
              autocomplete/search   relationship graph
                      |                   |
                      v                   v
       athlete profile route      generic entity profile route
                      \                   /
                       provider-normalized events,
                       markets, stats, and insights
```

`EntityRegistry` owns lookup, context-aware autocomplete, typed results, and
relationship resolution. `EntityProfileRepository` is the replaceable
repository boundary for generic profiles. It:

- lazy-loads profile view models
- caches successful profiles
- reuses in-flight requests
- accepts `AbortSignal` cancellation
- reads only normalized schedules and markets
- adds deterministic team/league insights only when source rows exist
- exposes source, timestamp, freshness, partial coverage, and sample status
- uses explicit unavailable values instead of invented statistics

`src/data/mock-entity-profiles.js` is provider-shaped sample metadata. A future
adapter can replace it without changing profile rendering or search routing.

## Routing and state

- Athlete-compatible profiles continue to use `?player=<canonical-id>&tab=<tab>`.
- Generic profiles use `?entityProfile=<canonical-id>`.
- Both routes are refresh-safe and participate in browser back/forward history.
- Opening either profile system cancels or invalidates stale work from the
  other system.
- Research query text, selected navigation scope, research mode, followed
  entities, and the shared bet slip remain in their existing state stores.

## Research and betting integration

The research planner receives typed matches from the same entity registry.
Entity-only questions produce canonical identity evidence and a profile link;
they do not synthesize unsupported statistics. Generic profiles display only
markets already present in the normalized sports repository. Stale, suspended,
invalid, or unavailable selections cannot be added to the shared slip.

Confidence retains its existing definition as model signal strength, not win
probability.

## Provider gaps

Sample mode intentionally leaves many fields unavailable: rosters, depth
charts, injuries, current coaches, rankings, brackets, advanced metrics,
weather, venue capacity, and complete historical records. The UI labels those
gaps instead of displaying plausible-looking placeholder numbers.

Before live data is enabled, provider adapters should map identities to the
canonical IDs above and supply relationship updates, media-rights metadata,
freshness timestamps, and partial-data warnings.

## Validation

Open the Phase 6 browser harness while the repository is served locally:

```text
http://127.0.0.1:9010/browser-tests/entities.html
```

It covers the entity contract, all entity types, typed search, canonical
routing, cache/cancellation behavior, relationships, team and organizational
profiles, assistant identity evidence, accessibility, responsive overflow,
history restoration, and both themes.
