# About EdgeBoard

EdgeBoard is a multi-sport research interface built around normalized provider data, deterministic calculations, canonical identities, transparent evidence, and visible uncertainty.

Its product vocabulary is consistent across the application: **Edge Intelligence** conducts structured research; **Edge Trust** explains evidence quality; a **Research Session** preserves the workflow; **Stories** phrase validated claims; **Historical Explorer** presents coverage-limited history; **Edge Markets** explains verified market data; **Parlay Builder** explores compatible research legs; and **Workspace** stores personal research locally.

EdgeBoard does not treat confidence as probability, does not present simulations as predictions, and does not silently substitute sample values for live provider data.

The in-app About page is available at `/about`. It is served through the existing single-page route fallback, participates in browser history, and leaves the active Research Slip, query, league, and local Workspace data untouched. Its utility entry points live in the application footer and the Version 1.6 command palette, keeping primary sports navigation focused.

Application version and public status copy come from `src/config/app-config.js`. The About page imports that shared configuration instead of maintaining a second version string. Route-specific title and description metadata are updated without adding an SEO or routing dependency.

The current public data claim remains deliberately narrow: sample and fixture data are available, while live rollout is league- and domain-specific and requires explicit certification. The in-app Data Coverage dialog and [coverage guide](coverage.md) remain authoritative for current availability.
