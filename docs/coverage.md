# Data coverage

The in-app **Data Status** and **Data Coverage** views are the user-facing source of truth for current league and domain coverage. Coverage is league-specific and domain-specific; one verified endpoint never promotes an entire league or all sports.

The repository runs in sample/fixture mode without credentials. Sample, fixture, live, hybrid, degraded, delayed, stale, partial, cached, and offline fallback states must remain distinct. No league is production-certified merely because an adapter or fixture exists.

For operational details, certification evidence, domain gates, rollback, and current blockers, see the [Phase 10 rollout playbook](phase10-rollout-playbook.md) and [provider integration guide](provider-integration.md).

