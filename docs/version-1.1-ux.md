# EdgeBoard 1.1 UX refinement

Version 1.1 keeps the existing normalized data, deterministic research, profiles,
markets, and local workspace architecture. The changes are an assistance layer;
they do not introduce a second query engine or data source.

## Research guidance

- Entity autocomplete keeps canonical profile results and adds context-specific
  research paths. Athlete, team, combat, and motorsport wording adapts to the
  entity type. Current-prop prompts appear only when a matching provider market
  exists.
- Unsupported and empty statistical results retain their honest result state but
  now offer scoped queries instead of a terminal message.
- Complex comparisons, rankings, thresholds, records, trends, streaks,
  milestones, matchup, and parlay questions expand the existing deterministic
  research plan. Simple lookups keep it collapsed.
- Follow-ups remain structured query strings. They never introduce facts and run
  through the same parser, provider rows, validation, and freshness rules as a
  typed query.

## Discovery and profiles

- Today’s research pulse summarizes one validated insight, the next supplied
  event, eligible milestone/streak counts, and line-movement availability for the
  current navigation scope. Missing line history is explicitly labeled
  `Snapshot only`; no movement is inferred from a single line.
- Athlete Overview pages label the featured deterministic insight as “What stands
  out,” expose the supported insight mix, and offer routes to logs, trends, or
  insights when schedule or market context is unavailable.
- All new cards preserve sample-data attribution. Historical observations remain
  separate from odds, projection, edge, and model confidence.

## First visit and personal workspace

- A lightweight first-visit guide explains Stats, Betting, Both, Analyst, and My
  EdgeBoard. Dismissing it stores only the boolean
  `edgeboard-onboarding-v1.1-complete` in local browser storage.
- The balanced My EdgeBoard preset now starts with Continue Research, Today’s
  Insights, Saved Boards, Tracked Research Ideas, Watchlist, Upcoming Events, and
  Data Status. Existing customized layouts are not rewritten.

## Accessibility and motion

- New actions are native buttons with visible focus styles and live-region result
  updates.
- Search keeps listbox/option keyboard behavior; research-path buttons are a
  separate labeled group.
- Tablet and mobile pulse/onboarding grids collapse to two and one columns.
- Hover movement is decorative and is disabled by the existing
  `prefers-reduced-motion` rule.

## Provider limits

All content remains provider-shaped sample data unless the existing coverage and
rollout systems state otherwise. Version 1.1 does not add live feeds, background
monitoring, or a generative factual source.
