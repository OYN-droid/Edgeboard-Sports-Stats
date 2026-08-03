import { DASHBOARD_PRESETS } from "../config/workspace-config.js";
import { calculateHypotheticalResult } from "../services/workspace-service.js";

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const formatDate = (value) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date)
    : "Unavailable";
};

export function workspaceRouteUrl(route = {}) {
  const url = new URL(window.location.href);
  ["workspace", "workspaceView", "board", "saved", "watchlist"].forEach((key) => url.searchParams.delete(key));
  url.searchParams.set("workspace", route.workspaceId || "workspace-local-default");
  url.searchParams.set("workspaceView", route.view || "home");
  if (route.boardId) url.searchParams.set("board", route.boardId);
  if (route.itemId) url.searchParams.set("saved", route.itemId);
  if (route.watchlistId) url.searchParams.set("watchlist", route.watchlistId);
  return `${url.pathname}${url.search}${url.hash}`;
}

function badge(value, className = "") {
  return `<span class="workspace-badge ${className}">${escapeHtml(value)}</span>`;
}

function localDisclosure(viewModel) {
  const unavailable = viewModel.storageDiagnostics?.storageStatus === "unavailable";
  return `<div class="workspace-local-disclosure" role="status">
    <strong>${unavailable ? "Local storage unavailable" : "Local-only workspace"}</strong>
    <span>${unavailable ? "Showing the sample fallback. Changes cannot be persisted until browser storage is available." : "Stored in this browser. No cloud backup or background monitoring is active."}</span>
    ${viewModel.sample ? badge("Sample workspace", "sample") : ""}
  </div>`;
}

function workspaceNavigation(viewModel) {
  const links = [
    ["home", "Dashboard", viewModel.counts.saved],
    ["boards", "Boards", viewModel.counts.boards],
    ["saved", "Saved", viewModel.counts.saved],
    ["watchlists", "Watchlists", viewModel.counts.watched],
    ["alerts", "Alerts", viewModel.counts.alerts],
    ["tracked", "Tracked Ideas", viewModel.counts.tracked],
    ["journal", "Journal", ""],
    ["settings", "Settings", ""],
  ];
  return `<nav class="workspace-nav" aria-label="My EdgeBoard">
    ${links.map(([id, label, count]) => `<a href="${escapeHtml(workspaceRouteUrl({ workspaceId: viewModel.workspace.id, view: id }))}" data-workspace-route="${id}" aria-current="${viewModel.route.view === id ? "page" : "false"}"><span>${escapeHtml(label)}</span>${count !== "" ? `<span aria-label="${count} ${escapeHtml(label.toLowerCase())}">${count}</span>` : ""}</a>`).join("")}
  </nav>`;
}

function boardCard(board, workspaceId) {
  return `<article class="workspace-card board-card${board.isArchived ? " archived" : ""}">
    <div class="workspace-card-heading"><span class="board-marker" aria-hidden="true">${escapeHtml(board.marker || "B")}</span><div><h3><a href="${escapeHtml(workspaceRouteUrl({ workspaceId, view: "board", boardId: board.id }))}" data-workspace-board="${escapeHtml(board.id)}">${escapeHtml(board.title)}</a></h3><p>${escapeHtml(board.description || "No description")}</p></div></div>
    <div class="workspace-card-meta">${badge(`${board.itemCount} item${board.itemCount === 1 ? "" : "s"}`)}${board.isPinned ? badge("Pinned") : ""}${board.isArchived ? badge("Archived") : ""}</div>
    <p>Updated ${formatDate(board.updatedAt)}</p>
    <div class="workspace-card-actions">
      <button type="button" data-board-move="${escapeHtml(board.id)}" data-direction="-1" aria-label="Move ${escapeHtml(board.title)} earlier">↑</button>
      <button type="button" data-board-move="${escapeHtml(board.id)}" data-direction="1" aria-label="Move ${escapeHtml(board.title)} later">↓</button>
      <button type="button" data-board-pin="${escapeHtml(board.id)}">${board.isPinned ? "Unpin" : "Pin"}</button>
      <button type="button" data-board-edit="${escapeHtml(board.id)}">Edit</button>
      <button type="button" data-board-duplicate="${escapeHtml(board.id)}">Duplicate</button>
      <button type="button" data-board-archive="${escapeHtml(board.id)}">${board.isArchived ? "Restore" : "Archive"}</button>
    </div>
  </article>`;
}

function savedCard(item, workspaceId, board = null) {
  return `<article class="workspace-card saved-card${item.isArchived ? " archived" : ""}" data-saved-object="${escapeHtml(item.id)}">
    <div class="workspace-card-heading"><div><p class="eyebrow">${escapeHtml(item.type.replaceAll("_", " "))}</p><h3><a href="${escapeHtml(workspaceRouteUrl({ workspaceId, view: "item", itemId: item.id }))}" data-workspace-item="${escapeHtml(item.id)}">${escapeHtml(item.title)}</a></h3></div>${item.isPinned ? badge("Pinned") : ""}</div>
    <p>${escapeHtml(item.description || item.researchSnapshot?.summary || "Saved structured research")}</p>
    <div class="workspace-card-meta">${board ? badge(board.title) : ""}${item.saveMode.includes("refreshable") ? badge("Refreshable") : badge("Snapshot")}${item.sample ? badge("Sample data", "sample") : ""}</div>
    <p class="workspace-source">Saved ${formatDate(item.createdAt)} · data snapshot ${formatDate(item.dataSnapshotAt)}</p>
    <div class="workspace-tags">${(item.tags || []).map((tag) => badge(`#${tag}`)).join("")}</div>
    <div class="workspace-card-actions"><button type="button" data-open-saved="${escapeHtml(item.id)}">Open research</button><button type="button" data-share-saved="${escapeHtml(item.id)}">Share snapshot</button><button type="button" data-archive-saved="${escapeHtml(item.id)}">${item.isArchived ? "Restore" : "Archive"}</button></div>
  </article>`;
}

function dashboardModule(module, viewModel) {
  const recent = viewModel.savedObjects.filter((item) => !item.isArchived).sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt)).slice(0, 3);
  const moduleContent = {
    "continue-research": recent.length ? recent.map((item) => `<a href="${escapeHtml(workspaceRouteUrl({ workspaceId: viewModel.workspace.id, view: "item", itemId: item.id }))}" data-workspace-item="${escapeHtml(item.id)}">${escapeHtml(item.title)}</a>`).join("") : "<p>No saved research yet.</p>",
    "today-insights": "<p>Open Today’s Markets to review fresh, scope-aware sample insights. Workspace loading never blocks that board.</p>",
    "saved-boards": `<strong>${viewModel.counts.boards}</strong><span>active research boards</span>`,
    "watchlist-updates": `<strong>${viewModel.counts.watched}</strong><span>watched targets · sample freshness disclosed</span>`,
    "alert-center": `<strong>${viewModel.counts.alerts}</strong><span>unread in-app alerts</span>`,
    "followed-entities": `<strong>${viewModel.watchlists.reduce((sum, list) => sum + list.items.filter((item) => ["entity", "athlete", "team", "fighter", "driver"].includes(item.targetType)).length, 0)}</strong><span>followed canonical entities</span>`,
    "upcoming-events": "<p>No provider-confirmed workspace event update is available.</p>",
    "milestones": "<p>Open a saved insight or profile to review provider-confirmed milestones.</p>",
    "active-streaks": "<p>Streak updates are evaluated only when compatible data is refreshed.</p>",
    "saved-visuals": `<strong>${viewModel.savedObjects.filter((item) => item.type === "saved_visualization").length}</strong><span>saved visualizations</span>`,
    "tracked-ideas": `<strong>${viewModel.counts.tracked}</strong><span>tracked research ideas · not verified wagers</span>`,
    "recently-viewed": viewModel.activity.length ? viewModel.activity.slice(0, 3).map((item) => `<span>${escapeHtml(item.label || item.action)}</span>`).join("") : "<p>No local activity recorded.</p>",
    "journal-summary": `<strong>${viewModel.journal.resolved}/${viewModel.journal.total}</strong><span>resolved tracked ideas</span>${viewModel.journal.warning ? `<small>${escapeHtml(viewModel.journal.warning)}</small>` : ""}`,
    "data-status": "<p>Workspace state is local. Sports and market data remain provider-shaped sample data.</p>",
  }[module.id] || "<p>No module data.</p>";
  return `<article class="workspace-dashboard-module" data-dashboard-module="${escapeHtml(module.id)}">
    <div><h3>${escapeHtml(module.label)}</h3><button type="button" data-dashboard-hide="${escapeHtml(module.id)}" aria-label="Hide ${escapeHtml(module.label)}">Hide</button></div>
    <div class="workspace-module-content">${moduleContent}</div>
    <div class="workspace-module-actions"><button type="button" data-dashboard-move="${escapeHtml(module.id)}" data-direction="-1" aria-label="Move ${escapeHtml(module.label)} earlier">↑</button><button type="button" data-dashboard-move="${escapeHtml(module.id)}" data-direction="1" aria-label="Move ${escapeHtml(module.label)} later">↓</button></div>
  </article>`;
}

function dashboardView(viewModel) {
  return `<section aria-labelledby="workspaceDashboardTitle">
    <div class="workspace-section-heading"><div><p class="eyebrow">Personal sports intelligence</p><h2 id="workspaceDashboardTitle">My EdgeBoard dashboard</h2><p>Continue local research without changing the live sports-discovery experience.</p></div>
      <label>Layout preset<select data-dashboard-preset>${Object.keys(DASHBOARD_PRESETS).map((preset) => `<option value="${preset}" ${viewModel.dashboard.preset === preset ? "selected" : ""}>${escapeHtml(preset.replaceAll("-", " "))}</option>`).join("")}<option value="custom" ${viewModel.dashboard.preset === "custom" ? "selected" : ""}>Custom</option></select></label>
    </div>
    <div class="workspace-dashboard-grid">${viewModel.dashboard.modules.map((module) => dashboardModule(module, viewModel)).join("")}</div>
  </section>`;
}

function boardsView(viewModel) {
  return `<section aria-labelledby="workspaceBoardsTitle"><div class="workspace-section-heading"><div><p class="eyebrow">Organize research</p><h2 id="workspaceBoardsTitle">Research boards</h2></div><button type="button" class="primary-button" data-create-board>Create board</button></div>
    <div class="workspace-board-grid">${viewModel.boards.map((board) => boardCard(board, viewModel.workspace.id)).join("") || '<div class="workspace-empty">No boards exist.</div>'}</div>
  </section>`;
}

function boardView(viewModel) {
  const board = viewModel.boards.find((item) => item.id === viewModel.route.boardId);
  if (!board) return `<div class="workspace-empty" role="status"><h2>Board unavailable</h2><p>The local board ID is invalid or has been deleted.</p></div>`;
  const items = viewModel.savedObjects.filter((item) => item.boardId === board.id);
  return `<section aria-labelledby="workspaceBoardTitle"><div class="workspace-section-heading"><div><p class="eyebrow">Research board</p><h2 id="workspaceBoardTitle">${escapeHtml(board.title)}</h2><p>${escapeHtml(board.description || "Local structured research")}</p></div><div><button type="button" data-board-share="${escapeHtml(board.id)}">Share summary</button><button type="button" data-board-export="${escapeHtml(board.id)}">Export board</button><button type="button" data-board-edit="${escapeHtml(board.id)}">Edit</button><button type="button" class="danger-button" data-board-delete="${escapeHtml(board.id)}">Delete</button></div></div>
    <div class="workspace-saved-grid">${items.map((item) => savedCard(item, viewModel.workspace.id, board)).join("") || '<div class="workspace-empty"><h3>No saved items</h3><p>Save research into this board from an answer, profile, insight, visualization, or research slip.</p></div>'}</div></section>`;
}

function savedView(viewModel) {
  const boardById = new Map(viewModel.boards.map((board) => [board.id, board]));
  const filters = viewModel.route.filters || {};
  const option = (value, current) => value === current ? "selected" : "";
  return `<section aria-labelledby="workspaceSavedTitle"><div class="workspace-section-heading"><div><p class="eyebrow">Local research library</p><h2 id="workspaceSavedTitle">Saved research</h2></div></div>
    <div class="workspace-filter-row"><label>Search saved research<input type="search" data-workspace-search value="${escapeHtml(viewModel.route.query || "")}" autocomplete="off" /></label>
      <label>Type<select data-workspace-filter="type"><option value="">All types</option>${[...new Set(viewModel.savedObjects.map((item) => item.type))].map((type) => `<option value="${escapeHtml(type)}" ${option(type, filters.type)}>${escapeHtml(type.replaceAll("_", " "))}</option>`).join("")}</select></label>
      <label>Sport<select data-workspace-filter="sportId"><option value="">All sports</option>${[...new Set(viewModel.savedObjects.map((item) => item.sourceState.sportId).filter(Boolean))].map((id) => `<option value="${escapeHtml(id)}" ${option(id, filters.sportId)}>${escapeHtml(id)}</option>`).join("")}</select></label>
      <label>League<select data-workspace-filter="leagueId"><option value="">All leagues</option>${[...new Set(viewModel.savedObjects.map((item) => item.sourceState.leagueId).filter(Boolean))].map((id) => `<option value="${escapeHtml(id)}" ${option(id, filters.leagueId)}>${escapeHtml(id.toUpperCase())}</option>`).join("")}</select></label>
      <label>Board<select data-workspace-filter="boardId"><option value="">All boards</option>${viewModel.boards.map((board) => `<option value="${escapeHtml(board.id)}" ${option(board.id, filters.boardId)}>${escapeHtml(board.title)}</option>`).join("")}</select></label>
      <label>Tag<input data-workspace-filter="tag" value="${escapeHtml(filters.tag || "")}" /></label>
      <label>Saved state<select data-workspace-filter="archived"><option value="">Active</option><option value="true" ${option(true, filters.archived)}>Archived</option></select></label>
      <label>Save behavior<select data-workspace-filter="saveMode"><option value="">Any</option><option value="snapshot" ${option("snapshot", filters.saveMode)}>Snapshot only</option><option value="refreshable" ${option("refreshable", filters.saveMode)}>Refreshable</option><option value="snapshot_and_refreshable" ${option("snapshot_and_refreshable", filters.saveMode)}>Snapshot + refreshable</option></select></label>
      <label><input type="checkbox" data-workspace-filter="pinned" ${filters.pinned ? "checked" : ""} /> Pinned only</label>
      <button type="button" data-clear-workspace-filters>Clear</button></div>
    <div class="workspace-saved-grid" data-workspace-search-results>${viewModel.savedObjects.filter((item) => filters.archived === true ? item.isArchived : !item.isArchived).map((item) => savedCard(item, viewModel.workspace.id, boardById.get(item.boardId))).join("") || '<div class="workspace-empty">No saved research matches this view.</div>'}</div></section>`;
}

function itemView(viewModel) {
  const item = viewModel.savedObjects.find((record) => record.id === viewModel.route.itemId);
  if (!item) return `<div class="workspace-empty" role="status"><h2>Saved research unavailable</h2><p>The local item ID is invalid or has been deleted.</p></div>`;
  const notes = viewModel.notes.filter((note) => note.attachmentId === item.id);
  const snapshots = [...(item.snapshots || []), { id: "current", capturedAt: item.dataSnapshotAt, data: item.researchSnapshot }];
  const session = item.researchSnapshot?.id?.startsWith("research-session-") ? item.researchSnapshot : null;
  return `<article class="workspace-item-detail" aria-labelledby="workspaceItemTitle">
    <header><div><p class="eyebrow">${escapeHtml(item.type.replaceAll("_", " "))}</p><h2 id="workspaceItemTitle">${escapeHtml(item.title)}</h2><p>${escapeHtml(item.description || "Saved structured research")}</p></div>${item.sample ? badge("Sample data", "sample") : ""}</header>
    <dl class="workspace-detail-list"><div><dt>Save type</dt><dd>${escapeHtml(item.saveMode)}</dd></div><div><dt>Mode</dt><dd>${escapeHtml(item.sourceState.mode)}</dd></div><div><dt>Scope</dt><dd>${escapeHtml(item.sourceState.sportId || "All sports")} · ${escapeHtml(item.sourceState.leagueId || "No league")}</dd></div><div><dt>Snapshot</dt><dd>${formatDate(item.dataSnapshotAt)}</dd></div><div><dt>Sync</dt><dd>Local only</dd></div></dl>
    ${item.sourceState.queryText ? `<section><h3>Saved query</h3><p>${escapeHtml(item.sourceState.queryText)}</p></section>` : ""}
    ${session ? `<section class="workspace-session-summary"><div class="workspace-section-heading"><div><p class="eyebrow">Structured research session</p><h3>Revision ${session.revision} · ${escapeHtml(session.status)}</h3></div>${badge(`${session.researchQuality?.researchQuality?.label || "Unavailable"} Research Quality`)}</div><dl class="workspace-detail-list"><div><dt>Evidence</dt><dd>${session.evidence?.length || 0}</dd></div><div><dt>Statistics</dt><dd>${session.statistics?.length || 0}</dd></div><div><dt>Visualizations</dt><dd>${session.visualizations?.length || 0}</dd></div><div><dt>Comparisons</dt><dd>${session.comparisons?.length || 0}</dd></div><div><dt>Insights</dt><dd>${session.insights?.length || 0}</dd></div><div><dt>Markets</dt><dd>${session.markets?.length || 0}</dd></div></dl><details><summary>Research workflow · ${session.workflow?.length || 0} steps</summary><ol>${(session.workflow || []).map((step) => `<li><strong>${escapeHtml(step.label)}</strong> · ${escapeHtml(String(step.status || "unknown").replaceAll("_", " "))}<br><small>${escapeHtml(step.detail)}</small></li>`).join("")}</ol></details></section>` : ""}
    <section><h3>Snapshot history</h3><div class="workspace-snapshot-list">${snapshots.map((snapshot) => `<button type="button" data-view-snapshot="${escapeHtml(snapshot.id)}">${formatDate(snapshot.capturedAt)}${snapshot.id === "current" ? " · current" : ""}</button>`).join("")}</div><pre class="workspace-snapshot-preview">${escapeHtml(JSON.stringify(item.researchSnapshot, null, 2))}</pre></section>
    <section><div class="workspace-section-heading"><h3>Notes</h3><button type="button" data-add-note="${escapeHtml(item.id)}">Add note</button></div>${notes.length ? notes.map((note) => `<article class="workspace-note"><p>${escapeHtml(note.text).replaceAll("\n", "<br>")}</p><small>Updated ${formatDate(note.updatedAt)}</small><button type="button" data-delete-note="${escapeHtml(note.id)}">Delete</button></article>`).join("") : '<p class="workspace-empty">No private notes.</p>'}</section>
    <div class="workspace-card-actions"><button type="button" data-open-saved="${escapeHtml(item.id)}">Resume research</button>${item.saveMode !== "snapshot" ? `<button type="button" data-refresh-saved="${escapeHtml(item.id)}">${session ? "Resume and refresh" : "Refresh sample snapshot"}</button>` : ""}<button type="button" data-share-saved="${escapeHtml(item.id)}">Share read-only snapshot</button><button type="button" class="danger-button" data-delete-saved="${escapeHtml(item.id)}">Delete</button></div>
  </article>`;
}

function watchlistsView(viewModel) {
  return `<section aria-labelledby="workspaceWatchlistsTitle"><div class="workspace-section-heading"><div><p class="eyebrow">Canonical targets</p><h2 id="workspaceWatchlistsTitle">Watchlists</h2><p>Evaluated only when EdgeBoard is open and data is refreshed.</p></div><button type="button" class="primary-button" data-create-watchlist>Create watchlist</button></div>
    <div class="workspace-watchlist-grid">${viewModel.watchlists.map((watchlist) => `<article class="workspace-card"><h3>${escapeHtml(watchlist.title)}</h3><p>${watchlist.items.length} target${watchlist.items.length === 1 ? "" : "s"}</p><div>${watchlist.items.map((item) => `<div class="watchlist-row"><div><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.targetType)} · ${escapeHtml(item.leagueId || item.sportId || "scope unavailable")}</span><small>${escapeHtml(item.lastKnownState?.freshness || "Not evaluated")} · ${item.sample ? "sample data" : "provider data"}</small></div><button type="button" data-watch-pause="${escapeHtml(item.id)}">${item.isPaused ? "Resume" : "Pause"}</button><button type="button" data-watch-remove="${escapeHtml(item.id)}">Remove</button></div>`).join("") || '<p class="workspace-empty">No watched targets.</p>'}</div></article>`).join("")}</div></section>`;
}

function alertsView(viewModel) {
  const events = viewModel.alertEvents.filter((item) => !item.isDismissed && !item.isArchived);
  return `<section aria-labelledby="workspaceAlertsTitle"><div class="workspace-section-heading"><div><p class="eyebrow">In-app evaluation only</p><h2 id="workspaceAlertsTitle">Alert center</h2><p>No push, email, or background monitoring is active.</p></div><div><button type="button" data-evaluate-alerts>Test sample alerts</button><button type="button" data-mark-alerts-read>Mark all read</button><button type="button" data-create-alert>Create rule</button></div></div>
    <div class="workspace-alert-layout"><div><h3>Rules</h3>${viewModel.alertRules.map((rule) => `<article class="workspace-card alert-rule"><div><strong>${escapeHtml(rule.name)}</strong>${badge(rule.category)}${badge(rule.isEnabled ? "Enabled" : "Paused")}</div><p>${escapeHtml(rule.condition.metric)} ${escapeHtml(rule.condition.operator.replaceAll("_", " "))} ${escapeHtml(rule.condition.value)}</p><small>In-app only · ${rule.sample ? "sample rule" : "local rule"}${rule.snoozedUntil ? ` · snoozed until ${formatDate(rule.snoozedUntil)}` : ""}</small><button type="button" data-alert-pause="${escapeHtml(rule.id)}">${rule.isEnabled ? "Pause" : "Resume"}</button><button type="button" data-alert-snooze="${escapeHtml(rule.id)}">Snooze 1 hour</button><button type="button" data-alert-delete="${escapeHtml(rule.id)}">Delete</button></article>`).join("") || '<p class="workspace-empty">No alert rules.</p>'}</div>
      <div><h3>Events <span aria-label="${events.filter((item) => !item.isRead).length} unread">${events.filter((item) => !item.isRead).length} unread</span></h3>${events.map((event) => `<article class="workspace-card alert-event${event.isRead ? "" : " unread"}"><div><strong>${escapeHtml(event.title)}</strong>${badge(event.category)}${event.sample ? badge("Sample", "sample") : ""}</div><p>${escapeHtml(event.explanation)}</p><dl><div><dt>Old</dt><dd>${escapeHtml(event.oldValue ?? "Unavailable")}</dd></div><div><dt>New</dt><dd>${escapeHtml(event.newValue ?? "Unavailable")}</dd></div><div><dt>Freshness</dt><dd>${escapeHtml(event.freshness)}</dd></div></dl><small>${escapeHtml(event.source)} · ${formatDate(event.triggeredAt)}</small><button type="button" data-alert-read="${escapeHtml(event.id)}">${event.isRead ? "Read" : "Mark read"}</button><button type="button" data-alert-dismiss="${escapeHtml(event.id)}">Dismiss</button><button type="button" data-alert-archive="${escapeHtml(event.id)}">Archive</button></article>`).join("") || '<p class="workspace-empty">No alert events. Rules evaluate only during an open-app refresh.</p>'}</div></div></section>`;
}

function trackedView(viewModel) {
  return `<section aria-labelledby="workspaceTrackedTitle"><div class="workspace-section-heading"><div><p class="eyebrow">Research hypotheses</p><h2 id="workspaceTrackedTitle">Tracked research ideas</h2><p>Informational research tracking—not verified wager history.</p></div><button type="button" data-track-slip>Save current research slip</button></div>
    <p class="workspace-responsible-note">Research tracking is informational and does not guarantee future outcomes.</p>
    <div class="workspace-saved-grid">${viewModel.trackedIdeas.map((idea) => {
      const simulation = calculateHypotheticalResult(idea);
      return `<article class="workspace-card tracked-card"><div><p class="eyebrow">${escapeHtml(idea.status)}</p><h3>${escapeHtml(idea.title)}</h3>${idea.sample ? badge("Sample", "sample") : ""}</div><p>${escapeHtml(idea.thesis || "No thesis recorded.")}</p><p><strong>${idea.legs.length}</strong> saved leg${idea.legs.length === 1 ? "" : "s"} · result ${escapeHtml(idea.resultStatus)}</p>${idea.legs.map((leg) => `<div class="tracked-line"><span>${escapeHtml(leg.canonicalMarketId || leg.selectionId)}</span><span>Saved ${escapeHtml(leg.savedLine ?? "—")} / ${escapeHtml(leg.savedOdds ?? "—")}</span><span>Current ${escapeHtml(leg.currentLine ?? "Unavailable")} / ${escapeHtml(leg.currentOdds ?? "Unavailable")}</span></div>`).join("")}${simulation.available ? `<p>Hypothetical P/L: ${simulation.profit.toFixed(2)} units</p><small>${escapeHtml(simulation.disclaimer)}</small>` : ""}<div class="workspace-card-actions"><button type="button" data-idea-status="${escapeHtml(idea.id)}">Update status</button><button type="button" data-idea-outcome="${escapeHtml(idea.id)}">Review outcome</button></div></article>`;
    }).join("") || '<p class="workspace-empty">No tracked research ideas.</p>'}</div></section>`;
}

function journalView(viewModel) {
  const summary = viewModel.journal;
  return `<section aria-labelledby="workspaceJournalTitle"><div class="workspace-section-heading"><div><p class="eyebrow">Evidence-aware review</p><h2 id="workspaceJournalTitle">Research journal</h2></div></div>
    <div class="journal-summary"><article><strong>${summary.total}</strong><span>tracked ideas</span></article><article><strong>${summary.resolved}</strong><span>resolved</span></article><article><strong>${summary.unresolved}</strong><span>unresolved</span></article><article><strong>${summary.averageLineMovement === null ? "Unavailable" : summary.averageLineMovement.toFixed(2)}</strong><span>average line movement · sample ${summary.lineMovementSampleSize}</span></article></div>
    ${summary.warning ? `<p class="data-warning">${escapeHtml(summary.warning)} Win rate alone is not model-quality evidence.</p>` : ""}
    <div class="workspace-card"><h3>Outcome breakdown</h3><dl class="workspace-detail-list">${Object.entries(summary.breakdown).map(([key, value]) => `<div><dt>${escapeHtml(key)}</dt><dd>${value}</dd></div>`).join("")}</dl><p>Missing closing lines remain unavailable and are excluded from line-movement averages.</p></div>
  </section>`;
}

function settingsView(viewModel) {
  const preferences = viewModel.preferences;
  return `<section aria-labelledby="workspaceSettingsTitle"><div class="workspace-section-heading"><div><p class="eyebrow">Local data and personalization</p><h2 id="workspaceSettingsTitle">Workspace settings</h2></div></div>
    <div class="workspace-settings-grid">
      <form class="workspace-card" data-preferences-form><h3>Personalization</h3>
        <label>Favorite sports<input name="favoriteSportIds" value="${escapeHtml((preferences.favoriteSportIds || []).join(", "))}" placeholder="basketball, soccer" /></label>
        <label>Favorite leagues<input name="favoriteLeagueIds" value="${escapeHtml((preferences.favoriteLeagueIds || []).join(", "))}" placeholder="wnba, mlb" /></label>
        <label>Favorite canonical entities<input name="favoriteEntityIds" value="${escapeHtml((preferences.favoriteEntityIds || []).join(", "))}" placeholder="canonical IDs" /></label>
        <label>Hidden sports<input name="hiddenSportIds" value="${escapeHtml((preferences.hiddenSportIds || []).join(", "))}" placeholder="Still available through All Sports" /></label>
        <label>Preferred mode<select name="preferredResearchMode"><option value="stats" ${preferences.preferredResearchMode === "stats" ? "selected" : ""}>Stats</option><option value="betting" ${preferences.preferredResearchMode === "betting" ? "selected" : ""}>Betting</option><option value="both" ${preferences.preferredResearchMode === "both" ? "selected" : ""}>Both</option></select></label>
        <label>Odds format<select name="preferredOddsFormat"><option value="american">American</option><option value="decimal" ${preferences.preferredOddsFormat === "decimal" ? "selected" : ""}>Decimal</option><option value="fractional" ${preferences.preferredOddsFormat === "fractional" ? "selected" : ""}>Fractional</option></select></label>
        <label>Default confidence<input name="preferredConfidenceThreshold" type="number" min="0" max="100" value="${preferences.preferredConfidenceThreshold}" /></label>
        <label>Default date window<input name="preferredDateWindow" type="number" min="1" max="100" value="${preferences.preferredDateWindow}" /></label>
        <label>Preferred chart<select name="preferredChartType"><option value="line_chart">Line</option><option value="bar_chart" ${preferences.preferredChartType === "bar_chart" ? "selected" : ""}>Bar</option><option value="scatter_plot" ${preferences.preferredChartType === "scatter_plot" ? "selected" : ""}>Scatter</option></select></label>
        <label>Research emphasis<select name="emphasis"><option value="balanced">Balanced</option><option value="stats" ${preferences.emphasis === "stats" ? "selected" : ""}>Stats only</option><option value="betting" ${preferences.emphasis === "betting" ? "selected" : ""}>Betting context</option></select></label>
        <label>Density<select name="density"><option value="comfortable">Comfortable</option><option value="compact" ${preferences.density === "compact" ? "selected" : ""}>Compact</option></select></label>
        <label><input name="reduceMotion" type="checkbox" ${preferences.reduceMotion ? "checked" : ""} /> Reduce motion</label>
        <label><input name="privacyMode" type="checkbox" ${preferences.privacyMode ? "checked" : ""} /> Privacy mode: do not retain query text in activity</label>
        <label><input name="activityPaused" type="checkbox" ${preferences.activityPaused ? "checked" : ""} /> Pause activity history</label>
        <label><input name="financialSimulationVisible" type="checkbox" ${preferences.financialSimulationVisible ? "checked" : ""} /> Show optional hypothetical simulation fields</label>
        <button type="submit">Save preferences</button><button type="button" data-reset-preferences>Reset personalization</button>
      </form>
      <div class="workspace-card"><h3>Backup and restore</h3><p>Exports are versioned JSON and omit secrets, activity history, provider caches, and authentication data.</p><button type="button" data-export-workspace>Export workspace</button><label class="file-button">Import workspace<input type="file" accept="application/json" data-import-workspace /></label><div data-import-preview aria-live="polite"></div></div>
      <div class="workspace-card"><h3>Local data</h3><dl><div><dt>Storage</dt><dd>IndexedDB in this browser</dd></div><div><dt>Encryption</dt><dd>Not claimed</dd></div><div><dt>Cloud backup</dt><dd>Not active</dd></div><div><dt>Last backup</dt><dd>${formatDate(viewModel.storage?.lastBackupAt)}</dd></div><div><dt>Approximate usage</dt><dd>${viewModel.storage?.usage ? `${Math.ceil(viewModel.storage.usage / 1024)} KB` : "Calculating…"}</dd></div></dl><button type="button" data-clear-activity>Clear recently viewed</button><button type="button" data-clear-alerts>Clear alert events</button><button type="button" class="danger-button" data-delete-workspace>Delete this workspace</button><button type="button" class="danger-button" data-delete-all>Delete all local EdgeBoard workspace data</button></div>
    </div>
  </section>`;
}

export function renderWorkspace(viewModel) {
  if (viewModel.status !== "ready") {
    return `<div class="workspace-empty" role="alert"><h1>Workspace unavailable</h1><p>The requested local workspace does not exist.</p></div>`;
  }
  const content = viewModel.route.view === "boards" ? boardsView(viewModel)
    : viewModel.route.view === "board" ? boardView(viewModel)
      : viewModel.route.view === "saved" ? savedView(viewModel)
        : viewModel.route.view === "item" ? itemView(viewModel)
          : viewModel.route.view === "watchlists" ? watchlistsView(viewModel)
            : viewModel.route.view === "alerts" ? alertsView(viewModel)
              : viewModel.route.view === "tracked" ? trackedView(viewModel)
                : viewModel.route.view === "journal" ? journalView(viewModel)
                  : viewModel.route.view === "settings" ? settingsView(viewModel)
                    : dashboardView(viewModel);
  return `<div class="workspace-shell" data-density="${escapeHtml(viewModel.preferences.density)}" data-reduce-motion="${viewModel.preferences.reduceMotion}">
    <header class="workspace-header"><div><p class="eyebrow">Private personal workspace</p><h1>${escapeHtml(viewModel.workspace.title)}</h1><p>${escapeHtml(viewModel.workspace.description || "Organize saved sports research.")}</p></div><div class="workspace-header-actions"><button type="button" data-rename-workspace>Rename</button><button type="button" data-close-workspace>Back to sports</button></div></header>
    ${localDisclosure(viewModel)}
    <div class="workspace-body"><aside>${workspaceNavigation(viewModel)}<button type="button" class="workspace-mobile-nav" data-toggle-workspace-nav aria-expanded="false">Workspace menu</button></aside><main>${content}</main></div>
  </div>`;
}

export function renderSaveDialogFields({ boards, candidate, duplicate = null }) {
  return `<form method="dialog" id="workspaceSaveForm">
    <div class="dialog-heading"><div><p class="eyebrow">Save structured research</p><h2 id="workspaceSaveDialogTitle">${duplicate ? "Already saved" : "Save to My EdgeBoard"}</h2></div><button type="button" data-close-save-dialog aria-label="Close save dialog">Close</button></div>
    ${duplicate ? `<div class="data-warning" role="status"><strong>A matching item already exists.</strong><p>${escapeHtml(duplicate.title)}</p></div>` : ""}
    <label>Title<input name="title" required maxlength="240" value="${escapeHtml(candidate.title || "")}" /></label>
    <label>Board<select name="boardId" required>${boards.filter((board) => !board.isArchived).map((board) => `<option value="${escapeHtml(board.id)}" ${board.id === candidate.boardId ? "selected" : ""}>${escapeHtml(board.title)}</option>`).join("")}</select></label>
    <label>Private note<textarea name="note" rows="3" maxlength="10000"></textarea></label>
    <label>Tags<input name="tags" placeholder="wnba, comparison" /></label>
    <label><input type="checkbox" name="isPinned" /> Pin saved item</label>
    <fieldset><legend>Save behavior</legend><label><input type="radio" name="saveMode" value="snapshot" /> Snapshot only</label><label><input type="radio" name="saveMode" value="refreshable" /> Refreshable research</label><label><input type="radio" name="saveMode" value="snapshot_and_refreshable" checked /> Snapshot and refreshable research</label></fieldset>
    <p>Snapshots preserve visible values and source timestamps. Refreshable research preserves the structured request and never overwrites the original snapshot.</p>
    <div class="dialog-actions">${duplicate ? '<button type="submit" value="open-existing" data-save-strategy="open">Open existing</button><button type="submit" value="update-existing" data-save-strategy="update">Update existing</button><button type="submit" value="copy" data-save-strategy="copy">Save another copy</button>' : '<button type="submit" value="save">Save</button>'}<button type="button" data-close-save-dialog>Cancel</button></div>
  </form>`;
}
