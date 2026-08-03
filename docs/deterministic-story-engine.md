# Deterministic Story Engine

Version 1.4 Sprint 2 adds a presentation and orchestration layer over EdgeBoard's existing deterministic research systems. It does not introduce a second statistics engine or use a language model as a factual author.

## Pipeline

1. The canonical navigation scope supplies permitted sport and league IDs plus Live or Today constraints.
2. `DeterministicInsightService` evaluates the existing sport-aware rule registry against canonical completed rows. The Story Engine retains the insight ID, structured claim, evidence, source, freshness, validation, rarity, and optional compatible market.
3. Normalized schedules can produce event stories. Fixture-only examples cover story families without a current calculator. Fixtures are always labeled sample data and never represented as current reports.
4. `validateStoryCandidate` rejects unresolved identities, missing or claim-inconsistent evidence, missing sources, incomplete events, stale data, provider conflict, inadequate samples, invalid lifecycle states, expired events, unsupported record wording, and betting context whose entity, event, period, settlement scope, or freshness does not match.
5. `scoreStoryCandidate` uses centralized weights. Story quality uses recency, evidence, scope relevance, Edge Trust, Research Quality, rarity, milestones, and explicit penalties. Betting confidence is never an input.
6. `deduplicateStories` compares canonical entities, semantic family, stat IDs, event IDs, date scope, and threshold. The strongest equivalent candidate survives and compatible evidence is merged.
7. `phraseStory` converts validated claim data into deterministic text. Templates prohibit guarantees, unsupported historical superlatives, invented quotes, and unsupported causal language.
8. `buildStoryViewModel` is the UI boundary. Components receive presentation-ready media, labels, trust, actions, evidence, and optional secondary market context rather than raw provider or insight rows.

## Candidate and view-model contracts

Calculated stories use stable claim hashes; fixtures and events use stable canonical IDs. Candidates retain story type/family, canonical entity/team/event/competition/stat/insight/record/leaderboard references, immutable claim and evidence objects, scope, sources, freshness, warnings, validation, Edge Trust, Research Quality, lifecycle/correction metadata, and an optional provider-confirmed compatible market.

Saved workspace objects retain the structured claim and rendered text at save time. Refresh metadata stays separate, so recalculation cannot mutate the original snapshot. Existing workspace privacy rules exclude private notes from shared snapshots.

## Scoring and diversity

Weights and display limits live in `src/config/story-config.js`. Homepage selection is deterministic and limits repeated sports in All Sports when another eligible sport exists. A selected sport or league disables that cross-sport diversity rule. Stats omits markets; Betting and Both can show only fresh, open, compatible markets already validated by the insight service.

## Edge Trust and validation

Every candidate is evaluated for historical support, source agreement, freshness, coverage, identity, and completeness. Sample evidence remains capped by the existing Edge Trust service. `dataset_only` displays as Dataset only, never Verified. Conflicting candidates remain indexed for audit/search but cannot render on the homepage.

Freshness policies are story-type aware. Calculated statistical stories require at least three supporting evidence rows; attributed provider assertions and event, correction, comeback, upset, standings, lineup, and market-movement contexts use explicit single-evidence exceptions. Postponed, cancelled, and incomplete evidence rows cannot support a rendered claim.

## Lifecycle, archive, and correction behavior

Supported states are candidate, active, featured, expired, archived, corrected, and retracted. Only active and featured stories appear on the homepage. Live event stories remain eligible until their normalized status changes; upcoming stories expire at their scheduled transition. Corrections preserve the prior claim in audit metadata. Retractions do not remain eligible. Saved workspace snapshots are immutable copies.

The current lifecycle index is local and in-memory. Production persistence, cross-device archive search, and correction distribution require the existing backend/workspace synchronization layer.

## Performance

Generation evaluates only entities in the selected scope, caps work, reuses insight caches, and adds relevant event/fixture candidates. Cache keys include sorted sport/league scope, mode, query, Live/Today state, the local Today date, visible leagues, candidate limit, and provider version. Targeted invalidation accepts league, entity, or event IDs and preserves unrelated cached scopes. Lifecycle overrides survive regeneration, while refresh compares a newly calculated candidate with the immutable prior state. Evidence is read from the story index only when detail opens. Superseded async feature requests reject with `AbortError`.

## Representative sample coverage

Fixture-backed examples demonstrate WNBA assists, NBA three-pointers and dataset highs, MLB hits/strikeouts/ended streaks, NFL milestones, NHL points, soccer clean sheets/comebacks, UFC finishes, boxing knockout milestones, Formula 1 top-10 form, NASCAR position gains, golf course history, tennis upset context, standings movement, provider assertions, source conflict, correction, and expiration.

These are synthetic product fixtures, not current real-world reports. Calculated insight-backed stories continue to use existing historical sample rows.

## Implemented and incomplete story types

All requested type IDs are represented in the canonical registry and share the model, validation, scoring, lifecycle, search, view-model, detail, and safe phrasing fallback.

Fully demonstrated: notable performance, milestone reached/approaching, active/ended streak, dataset/season high, record candidate, comeback, upset, athlete/fighter/driver/team form, upcoming event, standings change, data update, historical context, and fun-fact-style statistical presentation.

Represented but awaiting dedicated upstream calculators or certified provider contracts: breaking statistical change, dominant/unusual performance, leaderboard change/new league leader, fully verified record, rivalry/championship/qualification context, injury/lineup context, market movement, comparison story, visual story, and explicit insufficient/unsupported result cards. The engine does not fabricate these when verified inputs are absent.

## UI and accessibility

Today's Stories consumes story view models. Details are deep-linked with `?story=`, restore focus on close, use logical headings, label status in text, retain media alt/rights metadata, focus the evidence panel on request, and use native buttons/links. Actions can open canonical profiles, logs, events, comparisons, visuals, Edge Intelligence, workspace save, follow, share, evidence, and verified markets where relevant. Reduced-motion behavior inherits the existing application policy.

## Verification and Sprint 3 recommendation

`browser-tests/story-engine.html` covers 132 engine, fixture, claim/evidence consistency, scope, lifecycle, targeted cache invalidation, structured Edge Intelligence context, search, trust, accessibility, large-text layout, detail, mode, and regression checks. Existing browser suites and the Python backend suite remain the broader regression gate.

Sprint 3 should add provider-backed standings deltas, injury/lineup changes, official record assertions, comparison deltas, and visual-result events as explicit upstream candidate producers. Persist lifecycle audit history and paginated archives server-side before production story alerts. Generative phrasing should wait until structured-evidence enforcement and provider certification cross that boundary.
