# EdgeBoard Illustration Showcase Batch 6 — Motorsports

Batch 6 is a production manifest, not an artwork bundle. It prepares 62 contextual showcase slots across six configured EdgeBoard series. No image was downloaded or generated, and no unreviewed portrait path is active.

## Coverage

| Series | Slots | Scope |
| --- | ---: | --- |
| Formula 1 | 22 | Broad coverage of the complete current grid |
| NASCAR Cup Series | 12 | Recognizable current Cup competitors across six teams |
| IndyCar | 8 | Recognizable current competitors across five teams |
| MotoGP | 8 | Recognizable current riders across six teams |
| Supercross | 6 | Representative current 450-class riders |
| Motocross | 6 | Representative current riders; Hunter Lawrence reuses the same canonical identity used by Supercross |
| **Total** | **62** | **61 unique canonical competitors; 62 series assignments** |

The slot role is `series_representative`. It is an editable production role, not a ranking, championship designation, or claim that a competitor is the “best.” Formula 1 uses the full grid because the configured target is grid coverage. The other series use bounded first-wave collections and do not claim full-field coverage.

Current roster context was checked on 2026-08-09 against official series material: [Formula 1’s confirmed 2026 line-ups](https://www.formula1.com/en/latest/article/2026-line-ups-confirmed-in-full-who-is-on-the-grid-for-next-season.3TyLfOUjOwpBKOp3KX1PiS), [NASCAR Cup standings](https://www.nascar.com/standings/nascar-cup-series/) and official entry lists, [IndyCar drivers](https://www.indycar.com/Home/Drivers), [MotoGP teams](https://www.motogp.com/en/teams), [Supercross championship standings](https://www.supercrosslive.com/championship-standings/), and [Pro Motocross 450 points](https://promotocross.com/2026/points/450). These assignments must be revalidated before artwork production when rosters change.

## Identity and assignment model

The canonical competitor ID owns the eventual artwork. Series and constructor/team are separate contextual assignment records in the Batch 6 manifest and showcase registry. Changing a team or moving between series does not require a new competitor ID or invalidate approved identity art.

Hunter Lawrence demonstrates the intended cross-series behavior: one canonical competitor ID appears in two distinct `(series, team)` slots. Validation requires uniqueness within a series, not global uniqueness across the manifest.

The manifest lives in `src/config/motorsports-illustration-showcase-batch-6.js`. Canonical competitors and teams live in `src/data/canonical-entities.js`. Replaceable showcase assignments and coverage targets live in `src/config/showcase-illustration-registry.js`.

## Production and registry state

Each slot includes:

- canonical competitor and team IDs;
- display names, series, and driver/rider discipline;
- recognizable physical-characteristic notes and restrained suit-color context;
- portrait and optional portrait-led variant prompts;
- planned portrait and action asset paths;
- generation, review, source, and registry-draft state;
- explicit fallback IDs.

Max Verstappen’s already approved exact illustration remains active. The other 61 portrait rows are `planned` only and are deliberately absent from the active illustration registry until their assets exist and pass review. The manifest’s registry drafts can be promoted individually without changing identity or assignment data.

Prompts use the locked EdgeBoard editorial style. They request transparent, centered 4:5 portraits with simplified likenesses and restrained suit colors. They prohibit copied photo compositions, exact team/series/manufacturer logos, sponsor-heavy suit graphics, promotional liveries, podiums, trophies, and achievement claims. Optional variants are deferred until portrait coverage is complete and remain portrait-led: helmet, helmet under arm, or simplified race suit.

## Fallback behavior

Runtime resolution is deterministic:

`exact driver/rider → constructor/team → series → motorsport → neutral`

Every Batch 6 team/constructor and prioritized series has an active fallback registry row backed by existing approved EdgeBoard art. This means planned portrait paths are never requested at runtime and no broken images are introduced.

## Additional configured series evaluation

The EdgeBoard registry also configures WRC, NASCAR Xfinity, and NASCAR Trucks.

- **WRC:** recommended next production wave with six proposed competitor slots. It is a major global series, but canonical crew/driver modeling should be reviewed before portrait assignments because driver/co-driver relationships differ from the current single-competitor presentation.
- **NASCAR Xfinity:** defer six proposed slots until the Cup wave is complete and drivers participating across series can be reconciled without duplicate identities.
- **NASCAR Trucks:** defer six proposed slots for the same identity-reconciliation reason.

Unconfigured series were not added merely because they are globally prominent. The sports registry remains the authority.

## Validation

Run:

```bash
python3 scripts/report_motorsports_showcase_batch_6.py
```

The report checks the 62-slot series distribution, canonical competitor/team mappings, per-series uniqueness, showcase assignment parity, production fields, and all fallback registry IDs. The focused browser illustration suite additionally checks prompt safety, contextual assignment separation, actual fallback resolution, registry validation, and absence of browser errors.
