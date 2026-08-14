# EdgeBoard Illustration Showcase — Batch 3 Combat Sports

## Status

Batch 3 prepares broad UFC/MMA and boxing production coverage around replaceable weight-class assignments. Fighter artwork remains attached only to canonical fighter IDs. Weight class, showcase role, prominence, and championship context are separate editorial metadata and can change without changing identity.

- Effective date: 2026-08-09
- UFC/MMA: 11 modeled weight classes, 22 assigned fighters
- Boxing: 8 modeled weight classes, 16 assigned fighters
- Total: 38 canonical fighters
- Portrait prompts: 38 prepared
- Fighting-stance action prompts: 38 prepared
- Artwork generated, copied, scraped, or downloaded: none
- Planned art activated: none

Selections were checked against current official UFC division and athlete material, the July 2026 WBC ratings, and current cross-organization boxing division listings. Combat status and weight classes can change quickly; every assignment must be revalidated before generation. No title or championship state is encoded in identity, asset paths, or permanent registry metadata.

## Coverage

| System | Weight class | Representatives |
| --- | --- | --- |
| UFC/MMA | Flyweight | Joshua Van; Alexandre Pantoja |
| UFC/MMA | Bantamweight | Petr Yan; Merab Dvalishvili |
| UFC/MMA | Featherweight | Alexander Volkanovski; Diego Lopes |
| UFC/MMA | Lightweight | Justin Gaethje; Ilia Topuria |
| UFC/MMA | Welterweight | Islam Makhachev; Ian Machado Garry |
| UFC/MMA | Middleweight | Sean Strickland; Khamzat Chimaev |
| UFC/MMA | Light Heavyweight | Carlos Ulberg; Jiří Procházka |
| UFC/MMA | Heavyweight | Tom Aspinall; Ciryl Gane |
| UFC/MMA | Women's Strawweight | Mackenzie Dern; Tatiana Suarez |
| UFC/MMA | Women's Flyweight | Valentina Shevchenko; Natalia Silva |
| UFC/MMA | Women's Bantamweight | Kayla Harrison; Amanda Nunes |
| Boxing | Flyweight | Ricardo Sandoval; Kenshiro Teraji |
| Boxing | Bantamweight | Seiya Tsutsumi; Tenshin Nasukawa |
| Boxing | Featherweight | Nick Ball; Angelo Leo |
| Boxing | Lightweight | Abdullah Mason; Raymond Muratalla |
| Boxing | Welterweight | Devin Haney; Ryan Garcia |
| Boxing | Middleweight | Carlos Adames; Janibek Alimkhanuly |
| Boxing | Light Heavyweight | Dmitry Bivol; David Benavidez |
| Boxing | Heavyweight | Oleksandr Usyk; Tyson Fury |

The two roles per class are `weight_class_representative` and `featured_star`. Neither role asserts a ranking, title, recommendation, or permanent class membership.

## Production manifest

The machine-readable manifest is `src/config/combat-illustration-showcase-batch-3.js`. Each entry includes canonical identity, current editorial weight class, replaceable role, portrait and action descriptions, planned immutable asset paths, review state, source type, fallback metadata, and an inactive registry draft.

```text
assets/illustrations/fighters/edgeboard--{canonical-fighter-id}--portrait--v01.svg
assets/illustrations/fighters/edgeboard--{canonical-fighter-id}--action--v01.svg
```

Prompts directly encode the locked EdgeBoard style. They prohibit copied photography, posters, broadcast graphics, promoter branding, belts, sponsor marks, opponent likenesses, blood, and invented outcomes. Lead side or stance must be confirmed from an approved factual reference package before production rather than inferred.

## Fallback behavior

```text
exact fighter → weight class → MMA or boxing → neutral EdgeBoard placeholder
```

All 19 modeled weight classes now have active contextual fallback mappings using the existing original generic combat illustration. The fallback art is intentionally non-identifying and does not claim an athlete likeness.

## Validation

```bash
python3 scripts/report_combat_showcase_batch_3.py
python3 scripts/report_illustration_coverage.py
```

The Batch 3 report fails on duplicate fighter IDs, missing canonical mappings, incomplete class coverage, fewer or more than two assignments per modeled class, invalid roles, incomplete prompts, missing fallbacks, assignment drift, or accidental activation of unreviewed fighter art.
