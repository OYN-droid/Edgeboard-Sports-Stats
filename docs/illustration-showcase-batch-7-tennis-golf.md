# EdgeBoard Illustration Showcase Batch 7 — Tennis and Golf

Batch 7 prepares a 24-athlete portrait-first production manifest across every configured EdgeBoard tennis and golf tour. It does not add downloaded or generated artwork, and planned portrait paths remain outside the active registry.

## Coverage

| Sport | Tour | Slots | Selection breadth |
| --- | --- | ---: | --- |
| Tennis | ATP | 6 | Jannik Sinner, Alexander Zverev, Carlos Alcaraz, Félix Auger-Aliassime, Ben Shelton, Novak Djokovic |
| Tennis | WTA | 6 | Aryna Sabalenka, Elena Rybakina, Jessica Pegula, Coco Gauff, Mirra Andreeva, Naomi Osaka |
| Golf | PGA Tour | 6 | Scottie Scheffler, Matt Fitzpatrick, Cameron Young, Collin Morikawa, Ludvig Åberg, Rory McIlroy |
| Golf | LPGA | 6 | Jeeno Thitikul, Nelly Korda, Hyo Joo Kim, Charley Hull, Minjee Lee, Lydia Ko |
| **Total** | **4 configured tours** | **24** | **24 unique canonical athlete IDs** |

The `tour_representative` role is a replaceable editorial production assignment. It does not encode a ranking, endorsement, championship status, or “best player” claim in athlete identity. The collection intentionally includes six athletes per tour so coverage is not limited to only the top one or two.

Selection context was checked on 2026-08-09 against official [ATP singles rankings](https://www.atptour.com/en/rankings/singles?rankRange=0-500), [WTA singles rankings](https://www.wtatennis.com/rankings/singles/), [PGA Tour FedExCup standings](https://www.pgatour.com/stats/detail/02671), and [LPGA Rolex rankings](https://www.lpga.com/stats-and-rankings/rolex). The manifest combines current ranking relevance with major-event and EdgeBoard research relevance; it is not a copy of ranking order. Assignments must be revalidated before production when active status changes.

## Manifest and prompts

`tools/illustration-qa/tennis-golf-illustration-showcase-batch-7.js` stores each canonical athlete ID, tour assignment, likeness notes, restrained outfit context, portrait path, optional-action placeholder, generation and review state, fallback IDs, prompt, and planned registry row.

Tennis action descriptions cover serve, forehand, backhand, and return stance. Golf descriptions cover address, backswing, impact, and follow-through. All action variants remain deferred until all 24 portraits are approved.

Prompts use the locked EdgeBoard editorial style: transparent centered 4:5 compositions, geometric vector-like construction, crisp contours, restrained cel shading, and simplified recognizable likenesses. They explicitly exclude copied photography, exact tour/event/apparel/equipment/sponsor logos, promotional compositions, crowds, scoreboards, sponsor walls, trophies, and achievement claims.

## Registry and fallback behavior

All 24 exact portrait rows are `planned`; none are active. Four active tour fallbacks reuse the approved EdgeBoard individual-sports asset. Runtime resolution is:

`exact athlete → tour → sport → neutral`

The illustration resolver recognizes tour context from either an explicit tour or the canonical league/tour ID. This lets profile and search surfaces resolve ATP, WTA, PGA, and LPGA fallbacks without requiring duplicate identity metadata.

## Validation

Run:

```bash
python3 scripts/report_tennis_golf_showcase_batch_7.py
```

The report checks the 6/6/6/6 tour distribution, canonical mappings, unique athletes, prompt inputs, showcase assignment parity, planned registry state, and complete fallback coverage. The browser illustration suite additionally validates actual tour resolution, prompt safety, asset availability, and application console behavior.
