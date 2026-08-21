# Live-data unresolved owner decisions

1. Public/commercial product model, target jurisdictions and whether sportsbook comparison/affiliate use changes provider licensing.
2. Production sports-data selection: the SportsDataIO Discovery Lab MLB shadow POC is underway, but commercial SportsDataIO versus Sportradar coverage, rights, SLA, and cost remain undecided.
3. Initial odds POC: The Odds API versus the selected broad provider's odds package.
4. Monthly and three-year budget ceilings, acceptable overage, and which live domains are essential during budget degradation.
5. Required launch books/regions/props and whether historical line movement is essential for day one.
6. Minimum historical seasons per proving league and whether derived research/export/share cards may retain provider-derived values.
7. Written rights for normalized storage, immutable workspace snapshots, correction history, odds archives, caching and redistribution.
8. Whether MLS remains the soccer proving competition after exact contract coverage is known.
9. Boxing/minor combat importance versus the provider gap; no scraping is an option.
10. Motorsport scope: schedule/results only or funded lap/telemetry products.
11. Soccer spatial priority and whether a premium specialist is justified.
12. Media/logo strategy: separate licensed product, user-safe fallback assets, or text-first launch.
13. Hosting region/vendor, managed PostgreSQL, Redis, queue/scheduler, secret manager and observability stack.
14. Provider SLA/freshness/correction thresholds and shadow observation window required for certification.
15. Data deletion/export obligations when a provider contract ends or retention terms change.

Until these are answered and certification gates pass, user-facing league domains remain fixture-primary and all public live feature flags remain false. MLB may run in protected shadow mode without changing that public behavior.
