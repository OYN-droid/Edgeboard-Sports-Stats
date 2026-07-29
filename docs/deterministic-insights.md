# Deterministic insights

EdgeBoard Phase 4 turns normalized historical rows into evidence-backed insights.
The historical provider remains the source of truth: display copy is generated only
after a structured claim passes rule, coverage, source-row, and scope validation.
No language model participates in statistical calculation or fact selection.

## Data flow

1. `stats-provider.js` supplies canonical entities and normalized completed-event
   rows, including source, freshness, and coverage metadata.
2. `insight-rules.js` filters configurable rules by sport, league, entity type,
   required stats, minimum sample, and enabled state.
3. `insight-engine.js` orders and deduplicates rows, evaluates the rule, and emits
   a structured candidate with stable identity, claim data, supporting row/event
   IDs, sample size, scope, validation status, and warnings.
4. `insight-service.js` adds a qualified comparison pool, deterministic priority
   score, deduplication, cautious template phrasing, optional compatible current
   market context, caching, and supporting-data lookup.
5. Profile, query, and discovery views consume the high-level service. UI
   components never calculate the factual claim from display strings.

The service cache includes the provider update timestamp. A provider refresh
therefore invalidates old results without requiring UI changes. Home discovery
limits the entity and result count; supporting rows are resolved only when the
user opens the supporting-data dialog.

## Rule evaluation and selection

Rules declare their applicable sports, leagues, entity types, required fields and
stats, minimum sample, comparison pool, time window, weights, suppression rules,
and template. Candidates with missing stats, partial coverage, invalid rows, or
insufficient samples are suppressed.

Priority scoring combines rule priority, recency, rarity, streak or milestone
relevance, query and navigation relevance, source completeness, and compatible
Both-mode market context. Configurable small-sample and stale-data penalties are
subtracted. Scores are normalized rather than capped prematurely, preserving the
ordering signal. Deduplication uses canonical entity, type, stats, and structured
claim data and also honors mutually exclusive rule IDs.

Current rule IDs:

- `basketball-assist-threshold-streak`
- `basketball-three-pointer-streak`
- `basketball-multi-stat-20-5-5`
- `football-passing-touchdown-streak`
- `football-interception-free-streak`
- `baseball-hit-streak`
- `baseball-pitcher-strikeout-streak`
- `hockey-point-streak`
- `hockey-shot-streak`
- `hockey-save-streak`
- `soccer-shot-on-target-streak`
- `soccer-goal-contribution-streak`
- `soccer-clean-sheet-streak`
- `combat-finish-streak`
- `combat-submission-streak`
- `combat-win-streak`
- `motorsport-points-finish-streak`
- `motorsport-top-ten-streak`
- `motorsport-podium-streak`
- `recent-stat-high`
- `available-season-high`
- `recent-vs-season-trend`
- `home-away-stat-difference`
- `stat-consistency`
- `available-data-milestone`
- `available-data-record-candidate`

## Streak interruption rules

Rows are deduplicated by event, restricted to one season unless the rule says
otherwise, and ordered chronologically. Only completed appearances enter an
athlete streak. Postponed and cancelled events are ignored. An event where the
athlete has no appearance row is not treated as a failed threshold. An included
appearance that fails the configured threshold ends the streak. Returned
evidence retains the start event, end event (or active state), dates, and every
qualifying row. Regular-season and playoff rules can scope their rows separately.
Combat and motorsport spacing does not imply missing appearances between cards
or race weekends.

## Rarity comparison pools

Rarity is calculated against compatible, active canonical entities in the same
sport, league, and entity class. Each pool member must independently pass the
same rule and qualification settings. Results disclose pool size, qualifying
entities and events, occurrence rate, percentile, scope, and coverage. Pools
smaller than five receive a warning. Configured labels are `Common`, `Notable`,
`Uncommon`, `Rare`, and `Exceptionally rare`. Uniqueness requires exactly one
qualifier, at least ten pool members, and complete coverage; the sample provider
therefore does not claim verified uniqueness.

## Record validation

- `verified_complete`: sufficient complete data proves the stated scope.
- `provider_asserted`: an attributed provider explicitly supplies the claim.
- `dataset_only`: true only within available rows; broader history is unknown.
- `partial_coverage`: relevant rows may be missing and the polished claim is
  suppressed.
- `incomplete`: too little evidence; suppressed.
- `stale`: outside freshness policy; warned or suppressed.
- `unsupported`: the provider cannot evaluate the requested scope.
- `invalid`: calculation or source validation failed; never rendered.

The record diagnostic checks rule evaluation, coverage, comparison pool,
deduplication identity, supporting events, scope, and wording eligibility.
Franchise, league, world, historic, record-breaking, and all-time wording is not
inferred from partial or dataset-only logs.

## Both mode

Historical insight calculation is independent of betting data. A related market
is attached only when the participant, upcoming event (when supplied), canonical
stat compatibility, full-event period, availability, and freshness match.
Compatibility includes explicit relationships such as hits to total bases,
knockout/finish history to method-of-victory, and top-finish history to matching
motorsport finish markets. Odds, projection, edge, confidence, and historical
results remain separately labeled. A streak is never described as proof of a
future outcome.

## Local saved state

Saved insights retain canonical insight ID and structured claim data in
`localStorage`; dismissed insight IDs and followed entity/rule references share
the same local-only record. Reconciliation archives an ID that is no longer
generated and reports claim changes for recalculated candidates. No account
sync or notifications are included.

## Provider limitations

All current content is demonstration data. Historical coverage is intentionally
small and incomplete; official career, franchise, league, and all-time records
cannot generally be verified. Live-event insight validation, complete opponent
style, venue, role, rest, period, track-type, and longitudinal leaderboard-change
analysis require richer provider rows. Market offers are sample sportsbook data,
not live odds. Athlete media uses original EdgeBoard placeholders and existing
fallback metadata.

Run the Phase 4 browser harness at
`http://localhost:9011/browser-tests/insights.html` while the local server is
running.

