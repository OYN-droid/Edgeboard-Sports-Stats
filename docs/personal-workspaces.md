# Personal workspaces

EdgeBoard’s Phase 8 workspace is a local-first, provider-agnostic research layer. It does not add accounts, cloud synchronization, sportsbook connections, payment data, or real-money wagering.

## Data flow

UI save actions create structured candidates from the existing canonical query, entity, event, market, insight, and visualization IDs. `WorkspaceRepository` validates and normalizes those objects, serializes writes through a queue, and persists one schema-versioned state document through the storage abstraction. The default browser adapter uses IndexedDB; tests use the asynchronous memory adapter.

UI components consume `buildWorkspaceViewModel` output rather than raw IndexedDB records:

```
canonical research state
  → workspace service/repository
  → normalized local records
  → IndexedDB storage adapter
  → workspace view model
  → workspace renderer
```

The sports dashboard does not load the workspace bundle at startup. Workspace services are loaded when a user opens My EdgeBoard, saves or follows content, records eligible activity, or restores a workspace route.

## Saved snapshot versus refreshable research

A snapshot retains the visible structured values, source attribution, data-quality state, and timestamp at save time. Refreshable research also retains the structured request needed to rerun compatible research. Refreshing appends the prior current snapshot to immutable history, sets a new current snapshot, and records a field-level comparison. It never silently replaces the original.

## Local data stored

- workspaces and research boards
- saved structured research references and compact snapshots
- watchlists and canonical target IDs
- in-app alert rules and alert events
- tracked research ideas and optional hypothetical simulation fields
- plain-text notes and normalized tags
- capped recent activity, subject to pause and privacy settings
- dashboard layout and personalization preferences
- read-only share snapshots
- schema and local backup timestamps

EdgeBoard does not store provider credentials, sportsbook credentials, payment details, authentication tokens, browser fingerprints, or full provider datasets in the workspace.

## Alerts

Alert rules run only during an explicit open-app evaluation or refresh. Delivery is in-app only. Cooldowns, last-known values, duplicate suppression, snoozing, pause state, source attribution, and freshness are persisted. Stale values cannot trigger ordinary threshold rules; staleness must be the rule being monitored.

## Tracked research ideas

A research slip is temporary. Saving it creates a tracked research idea containing the hypothesis and the line, odds, source, settlement scope, and timestamp observed at save time. Current values are separate fields. These records are not verified wagers or bet history. Optional stake fields are hypothetical simulations, remain empty by default, and can be hidden.

## Backup, restore, and sharing

Exports are versioned JSON. They omit activity history, provider caches, secrets, alert-event history, and shared-snapshot history. Imports are validated and previewed before merge, duplicate, or replace behavior is selected. Imported strings are rendered as escaped text.

Read-only item snapshots exclude private notes by default and disclose that they are local-device payloads. There is no public sharing service in this phase.

## Cross-tab and failure handling

Writes are queued and roll back in memory when persistence fails. Editable records use versions to reject stale updates. BroadcastChannel signals another open tab; the UI offers loading the newer stored state. IndexedDB unavailability, quota failures, incompatible versions, and corrupted records are surfaced without silently overwriting stored data.

## Phase 9 backend needs

Accounts, encrypted cloud backup, multi-device sync, durable shared links, collaboration permissions, server-side schedules, push/email alerts, and conflict reconciliation across devices require an authenticated backend. The normalized IDs, sync metadata, versions, visibility fields, and provider-independent service boundary are intended to support that work without rewriting the workspace UI.
