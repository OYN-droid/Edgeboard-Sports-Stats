# Edge Intelligence research sessions

Version 1.3 turns each Edge Intelligence request into a structured research
session. It extends the existing deterministic planner, evidence models, Edge
Trust, visual analytics, comparisons, insights, markets, and local workspace. It
does not introduce a second provider, entity, query, or storage system.

## Session model

`src/services/research-session-service.js` owns the provider-neutral session
shape. Every session always contains these fields, even when a section is empty
or not applicable:

- question and mode;
- resolved research scope and complete research plan;
- sourced evidence and calculated statistics;
- validated visualizations and comparisons;
- deterministic insights and counterarguments;
- provider-confirmed compatible markets;
- Edge Trust Research Quality;
- private notes and supported follow-up questions.

The session also contains a 12-step public workflow. Each step has a status,
plain-language explanation, and relevant evidence IDs. “Not applicable” is an
explicit state; it is not treated as failed research.

The workflow exposes what EdgeBoard researched, the interpreted scope, the
calculations and source evidence used, and remaining uncertainty. It does not
expose or depend on private model chain-of-thought. Structured evidence and
deterministic calculations remain the factual source.

## Lifecycle

- **Start new** clears only the active research result. It does not clear the
  bet slip or delete saved workspace objects.
- **Resume** restores the saved structured query, canonical scope, and session
  snapshot through the existing workspace route.
- **Save** stores the session as a versioned local workspace research object.
- **Refresh** reruns the deterministic query under the current provider state,
  retains the same session ID, advances its revision, preserves notes, and adds
  the prior quality/count metadata to session history.
- **Share** creates a read-only local-device snapshot. Private notes and prior
  revision history are excluded.
- **Export** supports Markdown for human review and CSV for portable evidence,
  counterargument, follow-up, and quality rows. CSV values are protected from
  spreadsheet formula execution.

Saving an updated duplicate now appends the prior saved snapshot before applying
the new revision. The original snapshot is therefore not overwritten. Workspace
schema and migration behavior remain unchanged because the versioned session is
stored inside the existing `researchSnapshot` boundary.

## Recommendations and uncertainty

Every recommended follow-up stores supporting evidence IDs, the counterarguments
considered, and the current Research Quality label and score. The UI displays
these disclosures beside each related question. A follow-up is an invitation to
continue research, not a predicted outcome or betting recommendation.

Missing or unsupported sections stay visible as limited, waiting, optional, or
not applicable. Edge Intelligence does not create a replacement statistic,
market, visualization, insight, or conclusion when normalized evidence is
absent. Research Quality remains separate from model confidence, historical hit
rate, projection, edge, and probability.

## Privacy and sharing

Active session notes are private and remain in memory until the session is saved
to the local workspace. Saved notes remain local under the existing workspace
storage rules. Both active-session sharing and saved-workspace sharing remove
embedded session notes by default. Sharing remains a read-only local snapshot;
no public hosting or cloud collaboration is implied.

## Current limitations

- Research sessions are local-first; cloud synchronization still requires the
  existing optional backend configuration.
- Refresh uses the currently configured deterministic providers. In sample mode
  it remains a sample refresh and is labeled accordingly.
- Visualizations opened as research are attached to the active session and can
  be saved, but the dedicated visualization screen retains its existing layout.
- There is no autonomous background research or live provider claim.

## Verification

The research analyst harness covers normalized fields, workflow visibility,
recommendation disclosures, revision history, notes, sharing, exports, mobile
overflow, themes, keyboard controls, and application errors. The workspace
harness covers immutable saved revisions and private-note exclusion. All prior
browser and backend suites remain part of the release gate.
