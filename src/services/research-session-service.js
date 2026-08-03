const SESSION_SCHEMA_VERSION = 1;

const clone = (value, fallback = null) => {
  try { return structuredClone(value); } catch {
    try { return JSON.parse(JSON.stringify(value)); } catch { return fallback; }
  }
};

const unique = (items = []) => [...new Set(items.filter(Boolean))];
const nowIso = (clock) => new Date(clock()).toISOString();

function sessionId(clock, random) {
  const randomPart = Math.floor(random() * 1e9).toString(36);
  return `research-session-${clock().toString(36)}-${randomPart}`;
}

function counterarguments(answer) {
  return (answer?.sections?.find((section) => section.id === "counterpoints")?.items || [])
    .map((item) => ({ text: String(item.text || ""), evidenceIds: unique(item.evidenceIds || []) }))
    .filter((item) => item.text);
}

function followUps(answer) {
  return (answer?.relatedQuestions || answer?.relatedActions || []).map((item, index) => ({
    id: String(item.id || `follow-up-${index + 1}`),
    label: String(item.label || "Continue research"),
    query: String(item.query || ""),
    type: String(item.type || "query"),
  }));
}

function resultCollection(result, token) {
  if (!result) return [];
  const type = String(result.type || result.kind || "");
  return type.includes(token) ? [clone(result, {})] : [];
}

function step(id, label, status, detail, evidenceIds = []) {
  return Object.freeze({ id, label, status, detail, evidenceIds: Object.freeze(unique(evidenceIds)) });
}

export function createResearchSession(input = {}, options = {}) {
  const clock = options.clock || Date.now;
  const random = options.random || Math.random;
  const timestamp = nowIso(clock);
  const answer = input.answer || null;
  const plan = input.plan || input.researchPlan || answer?.plan || null;
  const statistics = input.statistics ? [clone(input.statistics, {})] : [];
  const visualizations = (input.visualizations || []).map((item) => clone(item, {}));
  const comparisons = input.comparisons || resultCollection(input.statistics, "comparison");
  const insights = (input.insights || answer?.relatedInsights || []).map((item) => clone(item, {}));
  const markets = (input.markets || answer?.relatedProps || []).map((item) => clone(item, {}));
  const evidence = (input.evidence || answer?.evidence || []).map((item) => clone(item, {}));
  const objections = input.counterarguments || counterarguments(answer);
  const questions = input.followUpQuestions || followUps(answer);
  const quality = clone(input.researchQuality || answer?.edgeTrust || null);
  const notes = (input.notes || []).map((note, index) => ({
    id: String(note.id || `note-${index + 1}`),
    text: String(note.text || "").slice(0, 5000),
    createdAt: note.createdAt || timestamp,
  })).filter((note) => note.text);
  const evidenceIds = evidence.map((item) => item.id);
  const status = input.status || (answer ? "ready" : plan ? "researching" : "draft");
  const planSteps = (plan?.stages || []).map((stage) => step(
    `plan-${stage.id || stage.label}`,
    String(stage.label || "Research step"),
    String(stage.status || "pending"),
    String(stage.detail || "Waiting to run."),
  ));
  const workflow = [
    step("question", "Question", input.question ? "complete" : "waiting", input.question || "Add a research question."),
    step("plan", "Research plan", plan ? "complete" : "waiting", plan ? `${planSteps.length} deterministic stages` : "Waiting for an interpreted scope."),
    step("evidence", "Evidence", evidence.length ? "complete" : "limited", evidence.length ? `${evidence.length} sourced evidence item${evidence.length === 1 ? "" : "s"}` : "No supporting evidence is available." , evidenceIds),
    step("statistics", "Statistics", statistics.length ? "complete" : "not_applicable", statistics.length ? "Calculated from normalized source rows." : "No statistics requested or available."),
    step("visualizations", "Visualizations", visualizations.length ? "complete" : "available_on_request", visualizations.length ? `${visualizations.length} validated visualization${visualizations.length === 1 ? "" : "s"}` : "No visualization attached."),
    step("comparisons", "Comparisons", comparisons.length ? "complete" : "not_applicable", comparisons.length ? "Compared with consistent filters." : "No comparison requested."),
    step("insights", "Insights", insights.length ? "complete" : "limited", insights.length ? `${insights.length} calculated insight${insights.length === 1 ? "" : "s"}` : "No validated insight candidate."),
    step("counterarguments", "Counterarguments", objections.length ? "complete" : "limited", objections.length ? `${objections.length} limitation${objections.length === 1 ? "" : "s"} considered` : "No counterargument was supplied."),
    step("markets", "Markets", markets.length ? "complete" : "not_applicable", markets.length ? `${markets.length} provider-confirmed market${markets.length === 1 ? "" : "s"}` : "No compatible current market attached."),
    step("quality", "Research Quality", quality ? "complete" : "waiting", quality?.researchQuality ? `${quality.researchQuality.label} · ${quality.researchQuality.score}%` : "Waiting for Edge Trust."),
    step("notes", "Notes", notes.length ? "complete" : "optional", notes.length ? `${notes.length} private session note${notes.length === 1 ? "" : "s"}` : "No private notes."),
    step("follow-ups", "Follow-up questions", questions.length ? "complete" : "limited", questions.length ? `${questions.length} evidence-aware next question${questions.length === 1 ? "" : "s"}` : "No supported follow-up is available."),
  ];
  const recommendations = questions.map((item) => Object.freeze({
    ...item,
    supportingEvidenceIds: Object.freeze(evidenceIds),
    counterarguments: Object.freeze(objections.map((entry) => entry.text)),
    researchQuality: quality?.researchQuality ? Object.freeze({ ...quality.researchQuality }) : null,
  }));
  return Object.freeze({
    schemaVersion: SESSION_SCHEMA_VERSION,
    id: String(input.id || sessionId(clock, random)),
    revision: Math.max(1, Number(input.revision) || 1),
    status,
    question: String(input.question || ""),
    mode: String(input.mode || "stats"),
    scope: Object.freeze(clone(input.scope || plan?.resolvedScope || {}, {})),
    researchPlan: plan ? Object.freeze(clone(plan, {})) : null,
    planSteps: Object.freeze(planSteps),
    workflow: Object.freeze(workflow),
    evidence: Object.freeze(evidence),
    statistics: Object.freeze(statistics),
    visualizations: Object.freeze(visualizations),
    comparisons: Object.freeze(comparisons.map((item) => Object.freeze(clone(item, {})))),
    insights: Object.freeze(insights),
    counterarguments: Object.freeze(objections.map((item) => Object.freeze(clone(item, {})))),
    markets: Object.freeze(markets),
    researchQuality: quality ? Object.freeze(quality) : null,
    notes: Object.freeze(notes.map((item) => Object.freeze(item))),
    followUpQuestions: Object.freeze(questions.map((item) => Object.freeze(item))),
    recommendations: Object.freeze(recommendations),
    source: Object.freeze(clone(answer?.disclosure || input.source || {}, {})),
    sample: input.sample ?? answer?.disclosure?.sample ?? true,
    createdAt: input.createdAt || timestamp,
    updatedAt: timestamp,
    refreshedAt: input.refreshedAt || null,
    history: Object.freeze((input.history || []).map((item) => Object.freeze(clone(item, {})))),
  });
}

export function refreshResearchSession(previous, nextInput = {}, options = {}) {
  if (!previous?.id) return createResearchSession(nextInput, options);
  const historyEntry = {
    revision: previous.revision,
    capturedAt: previous.updatedAt,
    researchQuality: clone(previous.researchQuality),
    evidenceCount: previous.evidence?.length || 0,
    statisticsCount: previous.statistics?.length || 0,
    marketCount: previous.markets?.length || 0,
  };
  return createResearchSession({
    ...nextInput,
    id: previous.id,
    revision: previous.revision + 1,
    createdAt: previous.createdAt,
    refreshedAt: new Date((options.clock || Date.now)()).toISOString(),
    notes: previous.notes,
    history: [...(previous.history || []), historyEntry],
  }, options);
}

export function addResearchSessionNote(session, text, options = {}) {
  const clean = String(text || "").trim().slice(0, 5000);
  if (!session?.id || !clean) return session;
  const clock = options.clock || Date.now;
  const note = { id: `note-${clock().toString(36)}`, text: clean, createdAt: nowIso(clock) };
  return createResearchSession({ ...session, notes: [...session.notes, note], updatedAt: nowIso(clock) }, options);
}

export function researchSessionShareSnapshot(session) {
  if (!session?.id) return null;
  const { notes: _privateNotes, history: _history, ...publicSession } = clone(session, {});
  return Object.freeze({
    type: "edgeboard_research_session_snapshot",
    readOnly: true,
    localDeviceOnly: true,
    privateNotesExcluded: true,
    sharedAt: new Date().toISOString(),
    session: publicSession,
  });
}

function csvSafe(value) {
  const text = String(value ?? "");
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function researchSessionToCsv(session) {
  if (!session?.id) return "";
  const rows = [["section", "label", "value", "source", "sample"]];
  rows.push(["session", "Question", session.question, session.source?.source || "Unavailable", session.sample]);
  session.evidence.forEach((item) => rows.push(["evidence", item.label || item.type || item.id, item.value ?? item.text ?? "", item.source?.provider || item.source || "Unavailable", session.sample]));
  session.counterarguments.forEach((item) => rows.push(["counterargument", "Limitation", item.text, session.source?.source || "Unavailable", session.sample]));
  session.followUpQuestions.forEach((item) => rows.push(["follow_up", item.label, item.query, "EdgeBoard deterministic workflow", session.sample]));
  rows.push(["quality", "Research Quality", `${session.researchQuality?.researchQuality?.label || "Unavailable"} ${session.researchQuality?.researchQuality?.score ?? ""}`.trim(), "Edge Trust", session.sample]);
  return rows.map((row) => row.map(csvSafe).join(",")).join("\n");
}

export function researchSessionToMarkdown(session) {
  if (!session?.id) return "";
  const quality = session.researchQuality?.researchQuality;
  return [
    `# ${session.question || "EdgeBoard research session"}`,
    "",
    `- Session: ${session.id} · revision ${session.revision}`,
    `- Mode: ${session.mode}`,
    `- Research Quality: ${quality ? `${quality.label} · ${quality.score}%` : "Unavailable"}`,
    `- Source: ${session.source?.source || "Unavailable"}`,
    `- Sample data: ${session.sample ? "Yes" : "No"}`,
    "",
    "## Research plan",
    ...session.planSteps.map((item) => `- ${item.label}: ${item.detail}`),
    "",
    "## Evidence",
    ...(session.evidence.length ? session.evidence.map((item) => `- ${item.label || item.type || item.id}: ${item.value ?? item.text ?? "See structured source row"}`) : ["- No supported evidence available."]),
    "",
    "## Counterarguments",
    ...(session.counterarguments.length ? session.counterarguments.map((item) => `- ${item.text}`) : ["- No counterargument was supplied."]),
    "",
    "## Follow-up questions",
    ...(session.followUpQuestions.length ? session.followUpQuestions.map((item) => `- ${item.label}: ${item.query}`) : ["- No supported follow-up is available."]),
    "",
    "Research Quality describes source trust. It is not betting confidence, projection, edge, hit rate, or probability.",
  ].join("\n");
}
