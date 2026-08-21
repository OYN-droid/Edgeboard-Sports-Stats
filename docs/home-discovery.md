# Sports discovery home architecture

Version 1.4 Sprint 1 adds a deterministic discovery composition layer above the
existing EdgeBoard research surfaces. It does not replace Edge Intelligence,
Edge Trust, Today’s Markets, profiles, comparisons, visual analytics, or the
workspace.

## Page hierarchy

The home route now presents these sections in order:

1. Stories behind the numbers (the all-sports portfolio launch view; scoped views retain Today’s Stories)
2. Trending Research
3. Did You Know?
4. On This Day
5. Upcoming Milestones
6. Active Streaks
7. Current Leaders
8. Today’s Games
9. Today’s Markets
10. Edge Intelligence

Stories behind the numbers is the only primary `h1` hero on the fresh all-sports home route. The existing
research form is retained intact in the Edge Intelligence section below market
discovery.

## Composition boundary

`src/services/home-discovery-service.js` builds a read-only home model from:

- the canonical navigation selection and its visible normalized leagues;
- validated deterministic insight candidates;
- completed normalized historical statistic rows;
- qualified leaderboard calculations;
- normalized current events and schedules;
- provider-confirmed market availability exposed by Today’s Markets;
- the canonical Stats, Betting, or Both mode.

The service does not maintain a second entity, event, insight, leaderboard, or
market model. Cards reference canonical IDs and produce supported destinations
for profiles, game logs, comparisons, visualizations, markets, and Edge
Intelligence queries.

## Deterministic section rules

- **Stories behind the numbers / Today’s Stories** prioritizes validated scoped insights, then normalized
  current-day events. Live scope uses live events only.
- **Trending Research** means deterministic priority from validation, relevance,
  sample quality, and existing insight scoring. It is not public popularity or
  behavioral tracking.
- **Did You Know?** uses remaining validated calculated insights; no random fact
  fallback exists.
- **On This Day** matches the user’s local month and day against completed
  historical rows in the available dataset. It is explicitly dataset-scoped.
- **Upcoming Milestones** uses existing milestone distance, eligibility, and
  sample rules.
- **Active Streaks** uses chronologically ordered completed events and existing
  streak validation.
- **Current Leaders** calls the historical provider’s qualified leaderboard
  calculation and displays its sample size and source.
- **Today’s Games** uses exact local-date matching on normalized event start
  times and excludes cancelled or postponed events.

If a section has no eligible source record, it renders an honest empty state.
No near match, unrelated league, historical substitute, or generated statistic
is inserted.

## Scope and mode behavior

Every model build receives the same canonical selection used by top navigation
and Today’s Markets. League and sport selections restrict all cards to those
visible leagues. Live scope suppresses historical discovery cards so only live
normalized events can appear.

Stats mode omits market actions. Betting mode exposes market research actions
where an entity or event can be queried. Both mode keeps statistical navigation
and adds compatible market destinations. Mode changes rebuild the home model;
they do not modify typed query text, saved workspace state, or the research slip.

All cards disclose their source, timestamp, sample status, validation state,
classification, and Edge Trust Research Quality. Research Quality is not
probability or betting confidence.

## Current limitations

- The default provider is sample data. “Today” and “On This Day” may therefore
  be empty for the current local date.
- Trending Research does not use search-volume, social, or user-activity data.
- Current Leaders selects the first provider-supported statistic with a
  qualified entry for each scoped league. A future editorial configuration may
  choose a preferred headline statistic without changing the calculation path.
- Cards submit structured natural-language requests through the existing query
  flow; they do not create a separate routing or calculation system.

## Verification

The research-analyst browser harness tests section order, immutable source
classifications, canonical league scope, Live isolation, Stats/Betting/Both
actions, honest date-sensitive empty states, action semantics, sample labels,
responsive overflow, themes, and application errors. Existing market, stats,
profile, entity, insight, visualization, workspace, and backend suites remain
regression gates.
