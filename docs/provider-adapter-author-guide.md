# Provider adapter author guide

This guide describes the boundary created by Reliable Live Data Ticket 1. It does not authorize
a live integration.

1. Select one proof-of-concept provider only after product coverage, licensing, retention,
   attribution, cost, and stable-ID questions are answered.
2. Keep credentials and every upstream field name in a server-only adapter. Browser modules may
   consume normalized EdgeBoard records only.
3. Subclass `ProviderAdapterBase`. Declare an immutable capability for each exact
   provider/league/domain combination. Do not declare untested sibling leagues or domains.
4. Map provider records to the canonical identifiers in `ProviderDomain`; never add a vendor term
   to shared application services. Add a compatibility alias only for an existing EdgeBoard name.
5. Validate the raw contract before normalization, reject bad siblings safely, and attach a
   `ProvenanceEnvelope` without inventing missing timestamps or IDs.
6. Return explicit unsupported errors for unimplemented domains. An empty method that suggests
   support is not acceptable.
7. Add deterministic, contract-permitted fixtures and tests for configuration, malformed data,
   attribution, freshness, correction, outage, and redaction. Tests must make no vendor request.
8. Run in internal and shadow states. Certification and public rollout are separate, audited
   decisions; configuration and successful transport never promote data automatically.

Ticket 2 should implement one server-only POC adapter and contract fixtures. It must keep all
capabilities non-public, compare normalized evidence in shadow mode, document provider terms, and
stop before production certification.
