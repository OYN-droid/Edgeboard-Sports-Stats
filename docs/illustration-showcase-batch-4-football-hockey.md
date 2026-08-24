# Illustration Showcase Batch 4 — NFL and NHL

Batch 4 is a production plan for one replaceable `team_representative` per current NFL and NHL team. It provides 64 canonical assignments: 32 NFL and 32 NHL. A representative is an editorial showcase role, not a factual claim that the athlete is the team's best player.

## Architecture

- `tools/illustration-qa/football-hockey-illustration-showcase-batch-4.js` owns the production manifest, asset-path drafts, portrait prompts, deferred action prompts, and validation.
- `src/data/canonical-entities.js` remains the identity source for every athlete and team. Team membership is contextual and separate from the stable athlete ID.
- `tools/illustration-qa/showcase-illustration-registry.js` records the 64 effective-dated editorial assignments.
- `src/config/illustration-registry.js` activates only existing team, sport, and neutral fallbacks. Planned athlete art never enters the active registry before a reviewed file exists.
- `scripts/report_football_hockey_showcase_batch_4.py` validates counts, unique canonical mappings, assignment parity, prompt completeness, and fallback readiness.

## Coverage and production order

| League | Required teams | Assigned | Portrait prompts | Optional action prompts |
| --- | ---: | ---: | ---: | ---: |
| NFL | 32 | 32 | 32 | 32 deferred |
| NHL | 32 | 32 | 32 | 32 deferred |
| Total | 64 | 64 | 64 | 64 deferred |

Portraits are the only first-pass production requirement. NFL action descriptions cover quarterback throws, carries, receiver routes/catches, defensive stances, and pass rushes. NHL descriptions cover skating, shooting, puck handling, and a goaltender stance. Actions remain `deferred_until_all_portraits_complete`.

## Style and rights safeguards

Every prompt inherits `docs/illustration-style-lock.md`. Uniform colors provide simplified team context only. Prompts prohibit exact league/team logos, sponsor marks, copied photographs, traced artwork, embedded text, crowds, and fabricated achievement context. An approved factual identity-reference package is required before production; the manifest itself contains no downloaded media.

## Fallback and missing assets

The deterministic fallback chain is:

1. exact canonical athlete portrait
2. canonical team fallback
3. generic football or hockey fallback
4. neutral EdgeBoard placeholder

All 64 exact portraits are currently planned rather than active. That is an intentional production gap, not a broken-image state: all 64 canonical athletes resolve to active team fallback art. Registry drafts are ready but remain `planned` until their corresponding original assets pass identity, style, rights, accessibility, dark/light, and responsive review.

Run `python3 scripts/report_football_hockey_showcase_batch_4.py` for the complete canonical assignment and missing-asset report.
