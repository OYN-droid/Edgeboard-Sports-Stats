# Edge Trust provider metadata requirements

Edge Trust describes evidence quality. It is never betting confidence, model confidence, or win probability.

## Mandatory provenance envelope

Every provider-backed record needs: `providerId`, `providerProduct`, `providerRecordId`, `providerSchemaVersion`, `providerUpdatedAt`, `retrievedAt`, `normalizedAt`, `lastSuccessfulValidationAt`, `sourceMode`, `freshnessState`, `cacheState`, `fallbackUsed`, `providerHealthState`, `identityResolutionState`, `identityConfidence`, `fieldCompleteness`, `historicalCoverage`, `correctionRevision`, `correctionStatus`, `eventFinality`, `warnings`, and `requestId`.

Domain extensions:

- lineup: `confirmationState`, `confirmedAt`, `confirmationSource`;
- injury/availability: `confirmationState`, effective time, status taxonomy and source;
- market: `bookId`, provider/book timestamps, `period`, `settlementScope`, `status`, `suspensionReason`, alternate/live flags;
- multi-source: compared fields, source timestamps, agreement state, retained source and unresolved conflicts;
- history: earliest/latest season, missing seasons/events, qualification coverage, correction window.

## Public states and gates

| State | Required evidence |
| --- | --- |
| Verified | certified league-domain, resolved canonical identity, required fields complete, valid finality/status, fresh provider time, successful validation, healthy provider, no material unresolved conflict, no fallback/sample |
| Strong supporting data | verified provenance and identity with high completeness and sufficient declared sample/history; may be one supporting domain short of full research completeness |
| Partial coverage | source and timestamps valid, but declared missing fields/events/seasons/domains; limitations list mandatory; claims scoped to available data |
| Awaiting confirmation | projected/unconfirmed lineup, injury, participant, result, or provider correction state; observed values may display but cannot drive confirmation-dependent claims |
| Conflicting sources | same canonical field/scope has material disagreement; both sources/times and retained primary shown; no silent average/merge |
| Delayed | age is greater than the domain fresh threshold but no more than the delayed threshold; actual age and expected cadence visible |
| Stale | age exceeds delayed threshold or stale cache is used; current-market/alert/lineup-dependent research suppressed or explicitly warned |
| Unavailable | no permitted valid record, failed identity, unsupported domain, expired cache, or provider circuit open without fallback |
| Sample | explicit fixture/mock source, sample flag, non-live label and capped Research Quality; never upgraded by recent local generation time |

`source agreement` is `not_evaluated` when only one source exists, not automatically “verified.” `identityConfidence` may guide manual review but an ambiguous match cannot become verified from a numeric threshold alone. Historical event age is not freshness; freshness applies to when the historical record was last validated/corrected.

## Suppression rules

- Stale or suspended odds cannot trigger current value alerts or enter a parlay build without a visible unavailable state.
- Projected lineups never satisfy confirmed-lineup filters.
- Incomplete historical coverage cannot produce universal record wording.
- Provider health can demote a live domain to delayed/degraded but cannot certify it.
- Sample, fixture, cached, and live records are never blended into one unlabeled calculation.
- Betting confidence is excluded from Edge Trust and story/discovery quality.
