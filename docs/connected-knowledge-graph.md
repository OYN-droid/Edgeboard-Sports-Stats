# Connected Sports Knowledge Graph

Version 1.4 Sprint 6 adds a deterministic navigation graph over EdgeBoard's existing canonical entity registry, normalized sports repository, Story Engine, Insight Engine, Historical Explorer, On This Day, visual analytics, Edge Intelligence, and local Workspace. It does not create another identity, statistics, recommendation, or market system.

## Architecture

`src/config/knowledge-graph-config.js` defines the versioned node and edge vocabulary, ranking weights, section order, and display limits. These scores express supported research relevance only. Betting confidence, model edge, historical hit rate, and probability are not ranking inputs.

`src/services/knowledge-graph-service.js` is the provider-neutral composition layer. A request starts with one canonical entity ID and produces an immutable graph with:

- a canonical center entity;
- normalized nodes carrying IDs, type, scope, source, validation state, evidence reason, and an existing EdgeBoard action;
- explicit edges from the center to visible nodes;
- deterministic sections and a ranked `nextResearch` subset;
- sample/source disclosure and relationship limitations.

The service validates graph endpoints, node types, edge types, canonical entity references, and source identity before returning a ready graph. Invalid centers return a defensive `not-found` state; invalid composed graphs do not render partial invented links.

`EntityRegistry.resolveProviderEntity` reconciles exact provider IDs to canonical entities. Matching is scope-aware and case-insensitive because the current recorded provider fixture uses lowercase team IDs. It returns `null` if zero or multiple entities match. It never resolves by a fuzzy display-name guess.

## Relationship rules

The graph can create a link only from one of these supported facts:

1. A direct `relatedEntityIds` reference in the canonical registry.
2. A reverse traversal where another canonical entity explicitly references the center.
3. A normalized event whose participant provider ID resolves unambiguously to the center or its canonical team.
4. A deterministic story or insight that already references the entity or a connected event.
5. A Historical Explorer or On This Day item with the exact canonical entity ID.
6. An open, available normalized market that matches a connected event and participant scope. Stats mode suppresses market nodes.
7. A capability path into an existing EdgeBoard system. Availability is checked by that destination system; the graph does not fabricate visualization data or comparison peers.

Same-league membership, similar names, shared sport, popularity, betting confidence, and inferred narrative relationships are insufficient. Empty evidence sections remain absent instead of being filled with unrelated cards.

Team membership and home venues use directed, machine-readable edge semantics. A league emits `contains_team`; the team emits `member_of_league`. A team emits `home_venue`; a shared venue emits `home_team` for each canonical tenant. Leagues do not own or directly contain venues. For example, the NHL connects to the New York Rangers, and the Rangers connect to Madison Square Garden. The New York Knicks independently connect to the same venue, so the arena remains multi-sport rather than league-exclusive.

## Data flow

```text
canonical entity ID
  -> Entity Registry (explicit direct/reverse links and provider-ID resolution)
  -> normalized Sports Repository (events and eligible markets)
  -> deterministic Story and Insight indexes
  -> optional Historical Explorer and On This Day services
  -> KnowledgeGraphService validation, scoring, deduplication, and sections
  -> shared renderer and existing profile/story/visual/history/research/workspace actions
```

Historical and visualization services remain lazy-loaded. They connect to the graph after their existing bundles load, which clears graph caches so a later request can include those supported paths. The homepage and Today's Markets do not wait for graph composition.

## UI integration

The shared `renderKnowledgeGraph` component appears on athlete profiles, generic entity profiles, visualization pages, story and insight evidence views, historical and anniversary details, statistical results, and structured research answers. Every instance is headed “What should I research next?” and identifies its canonical center.

Actions reuse existing routing and state behavior:

- people and organization nodes open their canonical profile system;
- story and insight nodes open existing evidence dialogs;
- historical nodes use Historical Explorer routes;
- visual nodes use the existing visualization request flow;
- research nodes preserve a canonical graph context while submitting to Edge Intelligence;
- workspace nodes open the existing save dialog with an immutable graph snapshot and canonical entity reference.

User-entered query text still owns normal research state. Typing a different query clears the temporary graph research context. Graph navigation does not clear the research slip.

## Caching, cancellation, and invalidation

Graph cache keys include canonical entity, research mode, local calendar date, and optional-service availability. `clearCache(entityId)` supports targeted invalidation; connecting lazy historical or visualization dependencies clears all graph composition entries. `getEntityGraphAsync` rejects aborted or superseded requests so stale graph work cannot replace newer context.

Provider corrections must continue to invalidate the upstream Story, Insight, Historical, Sports, and entity caches first, then call the graph cache invalidation entry point for affected canonical entities. Saved Workspace graph snapshots remain immutable; refreshing research creates a current graph rather than overwriting the saved snapshot.

## Accessibility and responsive behavior

Graph groups are semantic sections and lists. Profile and historical destinations are links; commands are `button type="button"`. Sources and reasons are visible text rather than tooltip-only content. Actions retain the application's global `:focus-visible` behavior. At tablet width sections collapse to one column; on narrow mobile widths node actions stack without horizontal overflow. Dark and light themes use the existing tokens.

## Current limits

- The graph is sample-labeled because no live provider is certified.
- Relationships are limited to current canonical registry references and existing deterministic evidence. Missing edges are intentionally not inferred.
- Event linking depends on unambiguous provider-ID reconciliation. Unmapped or ambiguous participants remain unlinked.
- Capability nodes describe supported research destinations, not guaranteed data coverage. Each destination retains its own unavailable state.
- The current graph has one-hop composition. Multi-hop exploration occurs by opening a related entity as the new canonical center, avoiding opaque inferred paths.
- Graph persistence is local-only through the existing Workspace implementation.

## Verification

`browser-tests/knowledge-graph.html` covers graph validation, identity reconciliation, relationship isolation, UFC/Boxing and Formula 1/NASCAR separation, Stats-mode market suppression, deterministic order and cache behavior, historical connections, cancellation, canonical page navigation, research handoff, workspace/visual action semantics, themes, keyboard focus, mobile overflow, and browser errors.
