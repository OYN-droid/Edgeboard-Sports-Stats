# Edge Lab scenario architecture

Version 1.4 adds a deterministic scenario layer to Edge Intelligence research
sessions. Edge Lab does not write to historical rows, normalized provider data,
model results, current markets, or the research slip. It creates an immutable
copy of a research-session revision and derives a separate sandbox view.

## Data flow

```text
normalized providers + calculated research
                    |
                    v
           research session revision
                    |
              immutable clone
                    |
     controlled, validated assumptions
                    |
                    v
  Edge Lab derived research/comparisons/visuals/
       insights/markets/quality/differences
```

`src/services/edge-lab-service.js` owns this boundary. Its public creation and
update functions are pure from the caller's perspective: each recalculation
starts from `originalData`, applies the complete ordered assumption list, and
returns a new deeply frozen scenario. It never chains changes onto a previously
derived result. This makes the same baseline and assumptions deterministic.

## Scenario contract

Each scenario stores:

- the original session ID, revision, and complete immutable snapshot;
- normalized modified assumptions with canonical evidence or market targets;
- updated research, statistics, comparisons, visuals, insights, and markets;
- Edge Trust Research Quality and explicit counterarguments;
- exact before/after scenario differences and rejected assumptions;
- creation/update timestamps and a non-prediction disclaimer.

Only numeric evidence values and existing provider-confirmed market line or odds
fields can be changed in Version 1.4. Set, additive, and percentage operations
are supported. Missing targets, nonnumeric evidence, unavailable fields,
non-finite values, and invalid American odds are rejected. EdgeBoard does not
substitute a nearby field or fabricate a fallback value.

Derived market rows have `scenarioOnly: true`, `actionable: false`, and
`available: false`. They cannot enter the existing research slip. Historical
insight claims remain unchanged and receive scenario context rather than being
rewritten as new facts. Visual and comparison objects retain their original
source data and receive explicit scenario-overlay metadata.

## Meaning labels

The service and UI expose five classifications:

- `historical_fact`
- `current_provider_data`
- `model_output`
- `scenario_assumption`
- `future_simulation`

Scenario assumptions and future simulations are never labeled predictions.
Research Quality describes source support, assumption coverage, and validation;
it is capped under sample/conditional rules and is not probability, predictive
accuracy, model confidence, edge, or historical hit rate.

## Workspace, sharing, and exports

Scenarios use the existing workspace domain as `saved_scenario` objects. New
workspaces include an Edge Lab board; an older workspace can select any existing
board in the save dialog without requiring a destructive storage migration.
Opening a saved scenario restores its baseline research session and scenario
overlay. The original snapshot is preserved by existing workspace revision
semantics.

Read-only scenario sharing removes notes nested in both the original session and
derived research by default. Markdown and CSV exports include the baseline,
classifications, before/after values, Research Quality, counterarguments, and
the non-prediction disclosure. CSV fields retain spreadsheet-formula injection
protection.

## Current limitations

- Edge Lab is local-first and does not run Monte Carlo, probabilistic forecasts,
  or external model jobs.
- Version 1.4 recalculates explicit scalar overlays. Complex provider-derived
  rankings or charts retain their source rows and show scenario metadata until
  a future calculation adapter explicitly supports that transformation.
- A refreshed research session does not silently rebase an existing scenario.
  Users can discard it and start from the new revision, preserving auditability.
- Sample sessions and scenarios remain clearly sample-based; no live-data or
  predictive claim is introduced.

## Verification

The research-analyst harness verifies immutable baselines, deterministic
differences, rejected assumptions, classifications, non-prediction language,
Research Quality separation, private-note exclusion, safe exports, accessible
controls, themes, and 390px overflow. The workspace harness verifies scenario
storage and nested-note removal from shared snapshots. All existing browser and
backend suites remain regression gates.
