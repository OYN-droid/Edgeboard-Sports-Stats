# `app.js` staged refactor map

Stage 1 inventory only. This map was prepared after reading the current 8,128-line
`app.js` from start to finish. It does not prescribe a rewrite: Stage 2 should move
one feature at a time while preserving routes, generated markup, focus behavior,
history behavior, and event semantics.

## Existing component boundary

The two existing files under `src/components/` are renderer modules rather than
stateful UI controllers:

- `visualization-renderer.js` exports visualization markup and keeps its formatting,
  SVG, table, and trust-display helpers private.
- `workspace-renderer.js` exports workspace markup and a workspace route URL helper;
  repository mutation, history, dialog, and event orchestration remain in `app.js`.

New extractions should follow that dependency direction: a component receives a
view model plus explicit formatting/action dependencies and returns or mounts the
same DOM. It must not import `app.js` or create a second application state store.

## Actual top-level structure

### 1. Imports, repositories, and lazy feature modules (lines 1-193)

- Imports the service/config surface used by every feature.
- Instantiates the sports, stats, insight, profile, discovery, graph, market,
  screener, parlay, story, and entity services.
- Lazily imports the historical/anniversary, visualization, and workspace bundles.
- `recordWorkspaceActivity()` is a cross-feature bridge used by profiles, research,
  markets, history, visuals, stories, and graph actions.

### 2. Route parsing, restored state, central state, and DOM registry (194-704)

- Loads persisted confidence, navigation, research, insight, and parlay state.
- Parses discovery query routes, `/history` routes, `/markets` routes, `/about`, and
  workspace/profile/visual query-string routes.
- Builds one large mutable `state` object for all views: market board and slip,
  research/stat answers, discovery/stories/insights, athlete/entity profiles,
  visuals, history, market screener/parlay, workspace, and modal state.
- Builds one large `elements` map covering the complete page shell and all feature
  views/dialogs.
- Defines request counters, abort controllers, timers, and return-focus holders.

These two shared registries are the main extraction seam. Components should receive
only the state slice and elements/callbacks they use; moving the global objects into
components would make behavior harder to compare.

### 3. Shell routes and command palette (705-887)

- HTML escaping and recent-search persistence.
- Static and dynamic command definitions/search.
- `/about` metadata, visibility, and history transitions.
- Command-palette rendering, focus management, keyboard selection, and execution.

### 4. Shared formatting, navigation, discovery drawer, and home intent rail (888-1210)

- Clipboard, odds/date conversion, current-league lookup.
- Primary sport/league navigation rendering.
- All-sports discovery drawer cards, grouping, opening/closing, focus restoration.
- Research-intent navigation and the home "today" market board.
- Deferred market-board loading timer.

### 5. Core betting market board and research slip (1211-1689)

- Market filters/catalog and sport-specific selection persistence.
- Player fact, model answer, analyst workflow, market pick cards.
- Research slip calculations, empty/unsupported states, and correlation warnings.
- Matchup/event presentation renderers and freshness timestamp.

### 6. Data provenance, trust, coverage, and shared media/link helpers (1690-2010)

- Data-status dialog and coverage dialog, including URL state and async coverage load.
- Research/market Edge Trust calculation and detail dialog.
- Research-session synchronization and persistence.
- Shared athlete illustration renderer and profile/entity/visual/research URLs.
- These helpers are cross-cutting dependencies, not a page component by themselves.

### 7. Insights, stories, home discovery, graph, and discovery explorer (2011-2342)

- Insight persistence, categorization, sharing, trust, cards, and visibility rules.
- Home discovery action/card/section rendering and featured illustration behavior.
- Knowledge-graph action and section rendering.
- Discovery scope derived from navigation plus workspace preferences.
- Discovery explorer route updates and views for paths, changes, items, topics, and
  category exploration.

### 8. Market Intelligence pages (2343-2741)

- Canonical `/markets` URL construction and research-context creation.
- Market hub cards and detail panels.
- Market screener form, results, comparison, filters, sort/group controls.
- Parlay-builder constraints, legs, exclusions, comparisons, and change history.
- Visibility, async route rendering, and route/history updates for hub, movement,
  screener, parlay builder, and market detail.

### 9. Historical Explorer and anniversaries (2742-2960)

- Historical scope and `/history` URL construction.
- Route/history and view visibility.
- Historical cards, evidence, coverage, anniversaries, filters, timelines, and detail.
- Async rendering for history home, search, event detail, anniversaries, and
  anniversary detail.

### 10. Home command center, insight/story dialogs (2961-3255)

- Stable home-section replacement/signatures.
- Schedule, featured story, headlines, story cards, market cards, and quick actions.
- Command-center composition plus lower home discovery sections.
- Insight dialog rendering.
- Story share URL, story URL state, workspace candidate, and story-detail dialog.

### 11. Athlete and entity profile rendering (3256-3673)

- Athlete ID resolution from picks and profile header field selection.
- Trend SVG.
- Athlete header and tabs: overview, game logs, splits, trends, props, matchup,
  insights, plus the profile panel/shell.
- Entity profile rendering for teams and other non-athlete canonical entities.

### 12. Visual Analytics and research result rendering (3674-4393)

- Visual shell, URL serialization, async loading, open/close, and focus restoration.
- Query interpretation and statistical tables/actions.
- Comparison, leaderboard, filtered list, record, head-to-head, and event renderers.
- Edge Lab scenario and full evidence-backed research answer rendering.
- General statistical-answer dispatch and research-mode visibility/composition.

### 13. Personal workspace controller helpers (4394-4629)

- Workspace route parsing/history and visibility/counts.
- Async workspace module load and rendering.
- Open/close behavior, current save-candidate derivation across all app features,
  save/edit/confirmation dialogs, and download helpers.

### 14. Global render orchestration and profile/entity/search controllers (4630-5016)

- `renderAll()` calls nearly every shell/home/market renderer and conditionally
  restores shared stories, history, markets, and discovery.
- Athlete/entity route setters, control reset, async loaders, open/close behavior.
- Unified search results across entities, markets, discovery, history, anniversaries.
- Navigation persistence/focus and selection activation/reset.

### 15. Event wiring: navigation, market pages, history, and market board (5017-5562)

- Primary navigation and discovery drawer delegation.
- History and Market Intelligence open/close/share/save actions.
- Screener/parlay candidate builders, form parsing, submits, changes, and delegated
  result actions.
- Historical Explorer click/submit delegation.
- Market board filters, catalog, picks, matchups, slip, and mobile slip handlers.

### 16. Research execution and research UI events (5563-6206)

- Betting query execution.
- Async stats/research planning, entity resolution, deterministic query execution,
  combined mode, visualization attachment, and error/recovery behavior.
- Query submission and quick prompts.
- Research mode, autocomplete input/keyboard, search result actions, and statistical
  result delegation.

### 17. Edge Lab, research answers, home discovery, and global action delegation (6207-6770)

- Edge Lab dialog/scenario form.
- Research-answer actions including evidence, follow-ups, trust, markets, visuals,
  save/export, and refresh.
- Home discovery query handling shared across several containers.
- Document-level delegation for story/insight/discovery/graph/profile/workspace actions.
- Discovery explorer close, stats keyboard behavior, and athlete-image fallback.

### 18. Visual, entity profile, athlete profile, and insight events (6771-7152)

- Close/mobile-slip/share handlers for profiles and visuals.
- Visual controls, series toggles, source tables, and fallback actions.
- Entity profile actions and follow state.
- Athlete tab/filter/sort/props/insight actions and keyboard tabs.
- Insight dialog lifecycle and share actions.

### 19. Workspace dialogs and workspace event controller (7153-7791)

- Workspace open/save/track flows and follow synchronization.
- Save, duplicate-resolution, edit, destructive confirmation, restore, and error paths.
- Large delegated workspace action handler for routes, boards, saved items, watches,
  alerts, tracked ideas, import/export, backups, and local settings.
- Workspace change/submit/input handlers plus share dialog and remaining global links.

### 20. Browser history reconciliation (7792-7981)

- One `popstate` controller reconciles, in precedence order: About, Market
  Intelligence, History, Discovery, Workspace, shared story, Visual Analytics,
  entity profile, athlete profile, and research query state.
- It owns cancellation/reset/focus behavior for several features, so it should remain
  central until extracted controllers expose explicit `restoreFromLocation()` hooks.

### 21. Theme, onboarding, command events, and bootstrap (7982-8128)

- Theme persistence and brand-home behavior.
- Onboarding rendering and persistence.
- Command-palette mouse/keyboard wiring and global Command/Ctrl-K shortcut.
- Initial visibility/persistence/render calls, deferred workspace/history loads,
  coverage deep link, and restoration of workspace/profile/entity/visual/query routes.

## Page/feature ownership summary

| Feature | Rendering / route logic | Event wiring | Important shared dependencies |
| --- | --- | --- | --- |
| About | 757-795 | brand/global navigation near 7764-8010 | route metadata, all view visibility |
| Home command center/discovery | 1114-1200, 2011-2342, 2961-3125 | 5434-5443, 6400-6569 | story, insight, market, graph, workspace |
| Core betting research/slip | 1211-1689 | 5450-5562, 5563-5662 | sports repository, shared state, workspace |
| Statistical/AI research | 3793-4393 | 5663-6451 | parsers, entity resolution, visuals, graph |
| Market Intelligence | 2343-2741 | 5088-5327 | screener/parlay services, story/insight/workspace |
| Historical Explorer | 2742-2960 | 5079-5087, 5328-5433 | lazy historical modules, story/workspace |
| Athlete profile | 3256-3555, 4680-4794 | 6771, 6924-7132 | media, insights, markets, visuals, workspace |
| Entity profile | 3586-3673, 4795-4872 | 6772, 6885-6923 | entity registry, graph, visuals, workspace |
| Visual Analytics | 3674-3792 | 6773-6884 | lazy visual modules, profiles, slip/workspace |
| Personal Workspace | 4394-4629 | 7153-7791 | save candidates from nearly every feature |
| Stories/insights | 2011-2196, 3126-3255 | 6294-6569, 7074-7152 | home, profiles, research, workspace |
| Discovery drawer/explorer | 981-1087, 2237-2342 | 5038-5063, 5441-5449, 6452-6569 | navigation, workspace preferences, history |

## Coupling and invariants to preserve

- `renderAll()` is the current composition root. An extraction should replace one
  call at a time, not reorganize its order.
- URL state is split between path routes and query parameters. Back/forward behavior
  is centralized in `popstate`; route ownership cannot silently move without a
  browser-regression assertion.
- Many handlers use delegation and `data-*` contracts. Generated markup, attributes,
  accessible names, focus restoration, and bubbling must remain identical.
- Async views use request sequence numbers and/or `AbortController`; those guards must
  stay shared or be transferred with the loader and tested as one unit.
- Workspace save/activity hooks cross every feature. They should be injected as
  callbacks rather than imported through a circular dependency.
- Shared `escapeHtml`, formatting, trust, media, and URL helpers should remain in
  `app.js` during the first extractions or move later to a neutral UI utility module.

## Recommended Stage 2 order

1. **Historical Explorer**: the smallest genuinely routed page whose render/route
   functions are contiguous (2742-2960) and whose main handlers form a bounded block
   (5328-5433). Extract a component/controller factory that receives the historical
   module loader, state slice, DOM nodes, formatting/render callbacks, workspace
   callbacks, and navigation callback. Keep the global `popstate` branch as a thin
   call into that controller for the first pass.
2. **Market Intelligence**: extract only after History is green. Its page boundary is
   clear, but screener/parlay state and handlers make it substantially larger.
3. **Athlete profile**: extract its renderers and bounded event controller third. It
   has more shared media/insight/visual/workspace links, so it is a poor first move.

The About route is smaller than History, but it is mostly shell visibility rather
than a self-contained rendered feature. Data-status/coverage dialogs are also small,
but extracting them first would not reduce a page section. Home, research, workspace,
and the global `popstate` controller should remain until later sessions because they
are the primary integration hubs.

## Per-feature verification gate for Stage 2

For each extraction, in a separate change:

1. Compare the moved templates and `data-*` attributes against the pre-move source.
2. Run `python3 scripts/run_browser_regression.py`.
3. Start the app and manually exercise the extracted page: direct URL, in-app open,
   primary actions/forms, keyboard/focus behavior, close/back, and forward restore.
4. Record the command result and manual checks before selecting the next feature.
