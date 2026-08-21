# Recommended live-data provider strategy

## Smallest viable stack

1. **Primary sports data: SportsDataIO Discovery Lab is the Ticket 2 MLB schedule/entity shadow POC.** This validates the provider boundary but does not select a production vendor. A commercial decision may still compare SportsDataIO with Sportradar after contract, coverage, rights, and shadow evidence.
2. **Primary odds/props: The Odds API for the initial POC, or the selected primary provider's odds product if it delivers materially better identity, props, archive rights, and total cost.** Use one primary odds source. A secondary is for shadow checks or incident fallback, not silent value blending.
3. **Specialists: none at initial launch.** Evaluate Stats Perform or Hudl StatsBomb only when soccer spatial depth is a funded requirement; a licensed combat source if UFC/boxing gaps remain; a motorsport specialist only for telemetry; and a commercial golf specialist only if PGA/LPGA depth justifies it.

This is deliberately a 2-provider target, with one statistics provider and one odds provider. It can collapse to one vendor when coverage, rights, reliability, and price are proven. It can expand only for a documented domain gap.

## Roles and constraints

| Role | Preferred | Fallback | Initial leagues/domains | Cost | Credentials | Limits/rights |
| --- | --- | --- | --- | --- | --- | --- |
| Canonical sport/stat feed | Sportradar POC | SportsDataIO POC; select one | MLB, WNBA, UFC/MMA, MLS; schedule, events, entities, results, stats, standings, injuries/lineups where contracted | enterprise quote | server API key/product access | exact competition tiers, history, derived display, retention, SLA |
| Odds/props | The Odds API POC | selected primary vendor odds | event/book markets, props, alternate lines, movement snapshots | self-serve to commercial | server API key | quotas multiply by regions/markets; archive/storage rights |
| Soccer spatial | none initially; Stats Perform or StatsBomb later | honest unavailable | selected competitions only | premium enterprise | separate server credential | tracking/360 rights, limited competition coverage |
| Combat specialist | none initially | honest partial/unavailable | boxing and minor promotions only after gap study | unknown/commercial | separate server credential | no scraping; records and round stats need licensed provenance |
| Motorsport telemetry | none initially | schedule/results without telemetry | F1/IndyCar/MotoGP/WRC only if funded | premium/unknown | separate server credential/stream | high volume, timing and redistribution rights |
| Golf specialist | none initially | primary provider golf | PGA/LPGA fields and detailed stats if commercial rights secured | commercial | server key | Data Golf public terms are not a commercial license |

## Why not one provider immediately

One broad provider minimizes entity reconciliation, but betting archives, niche combat, telemetry, spatial feeds, and media frequently live in separate products or rights packages. Procurement must compare the full required product bundle, not the logo count. Conversely, adding specialists before a measured gap creates duplicate IDs, conflict handling, billing, and correction fan-out.

## Non-negotiable selection gates

- Written rights for a public research product, derived calculations, display, share/export snapshots, caching, and permitted historical retention.
- Stable provider IDs plus change/merge mappings and full correction semantics.
- Real or faithful fixtures for MLB doubleheaders, WNBA overtime/combo stats, UFC opponent/card changes, soccer postponement/abandonment/extra time, and suspended/reopened markets.
- Domain-specific last-updated timestamps, completeness, and source attribution.
- Rate/overage visibility, retry guidance, sandbox/replay, support and SLA.
- No sample fallback represented as live, no source blending without attribution, and no provider activation without certification.

## Owner accounts needed

The MLB Discovery Lab shadow credential is configured server-side. Before production procurement or other provider POCs, the owner must still obtain:

- a commercial/trial server API key and product entitlement from each shortlisted sports-data provider;
- an odds-provider key with the exact sports, books, props, and historical product enabled;
- written terms/contract exhibits for display, redistribution, caching, normalized storage, snapshots, corrections, logos/media, and derived analytics;
- a provider support contact and quota dashboard access;
- staging secret-manager access, managed database/cache accounts, and an approved monthly usage ceiling.

Never send keys in chat or commit them. Place them directly into the deployment secret manager or an ignored local `.env`.
