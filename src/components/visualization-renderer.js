import { evaluateEdgeTrust } from "../services/edge-trust-service.js";

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const finite = (value) => value !== null && value !== "" && Number.isFinite(Number(value));
const format = (value) => finite(value)
  ? Number.isInteger(Number(value)) ? String(Number(value)) : Number(value).toFixed(2)
  : "Missing";

function cartesianSvg(result) {
  const all = result.series.flatMap((series) => series.points.map((point, index) => ({ ...point, index, seriesId: series.id })));
  const values = all.map((point) => Number(point.y)).filter(Number.isFinite);
  if (!values.length) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  const maxPoints = Math.max(...result.series.map((series) => series.points.length), 1);
  const x = (index) => 48 + (index / Math.max(1, maxPoints - 1)) * 564;
  const reverse = result.type === "race_position_chart";
  const y = (value) => reverse
    ? 24 + ((Number(value) - min) / spread) * 244
    : 268 - ((Number(value) - min) / spread) * 244;
  const colors = ["visual-series-a", "visual-series-b", "visual-series-c", "visual-series-d"];
  const threshold = result.request?.filters?.threshold
    ?? result.summaryMetrics.find((metric) => metric.id === "threshold")?.threshold
    ?? result.points.find((point) => finite(point.threshold))?.threshold;
  const paths = result.series.map((series, seriesIndex) => {
    const segments = [];
    let current = [];
    series.points.forEach((point, index) => {
      if (!finite(point.y)) {
        if (current.length) segments.push(current);
        current = [];
        return;
      }
      current.push(`${x(index)},${y(point.y)}`);
    });
    if (current.length) segments.push(current);
    return `
      <g class="visual-series ${colors[seriesIndex % colors.length]}" data-visual-series="${escapeHtml(series.id)}">
        ${segments.map((segment) => `<polyline class="visual-line" points="${segment.join(" ")}" />`).join("")}
        ${series.points.map((point, index) => finite(point.y) ? `
          <circle class="visual-point" cx="${x(index)}" cy="${y(point.y)}" r="5" tabindex="0"
            role="img" aria-label="${escapeHtml(`${series.label}, ${point.label}: ${format(point.y)} ${result.unit}`)}">
            <title>${escapeHtml(`${series.label} · ${point.label}: ${format(point.y)} ${result.unit}`)}</title>
          </circle>` : "").join("")}
      </g>`;
  }).join("");
  return `
    <svg class="visual-chart-svg" viewBox="0 0 640 310" role="img" aria-labelledby="visualSvgTitle visualSvgDescription">
      <title id="visualSvgTitle">${escapeHtml(result.title)}</title>
      <desc id="visualSvgDescription">${escapeHtml(result.accessibleSummary)}</desc>
      <g aria-hidden="true" class="visual-grid">
        <line x1="48" y1="24" x2="48" y2="268" />
        <line x1="48" y1="268" x2="612" y2="268" />
        <line x1="48" y1="146" x2="612" y2="146" />
        <text x="8" y="30">${escapeHtml(format(reverse ? min : max))}</text>
        <text x="8" y="272">${escapeHtml(format(reverse ? max : min))}</text>
      </g>
      ${finite(threshold) ? `<line class="visual-threshold" x1="48" y1="${y(threshold)}" x2="612" y2="${y(threshold)}" aria-hidden="true" /><text class="visual-threshold-label" x="50" y="${Math.max(18, y(threshold) - 5)}">Threshold ${escapeHtml(format(threshold))}</text>` : ""}
      ${paths}
    </svg>`;
}
function barSvg(result) {
  const rows = result.points.filter((point) => finite(point.value ?? point.makes ?? point.landed ?? point.attempted));
  const values = rows.map((row) => Number(row.value ?? row.makes ?? row.landed ?? row.attempted));
  const max = Math.max(...values, 1);
  const width = Math.max(24, Math.min(72, 520 / Math.max(1, rows.length)));
  return `
    <svg class="visual-chart-svg" viewBox="0 0 640 320" role="img" aria-labelledby="visualSvgTitle visualSvgDescription">
      <title id="visualSvgTitle">${escapeHtml(result.title)}</title><desc id="visualSvgDescription">${escapeHtml(result.accessibleSummary)}</desc>
      <line class="visual-axis" x1="42" y1="274" x2="620" y2="274" aria-hidden="true" />
      ${rows.map((row, index) => {
        const value = Number(row.value ?? row.makes ?? row.landed ?? row.attempted);
        const height = (Math.max(0, value) / max) * 220;
        const x = 48 + index * ((564) / Math.max(1, rows.length));
        return `<g tabindex="0" role="img" aria-label="${escapeHtml(`${row.label || row.target || row.zoneId || `Item ${index + 1}`}: ${format(value)} ${result.unit}`)}">
          <rect class="visual-bar visual-series-${String.fromCharCode(97 + (index % 4))}" x="${x}" y="${274 - height}" width="${Math.min(width, 48)}" height="${height}" rx="5"><title>${escapeHtml(`${row.label || row.target}: ${format(value)}`)}</title></rect>
          <text class="visual-axis-label" x="${x}" y="294">${escapeHtml(String(row.label || row.target || row.zoneId || index + 1).slice(0, 10))}</text>
        </g>`;
      }).join("")}
    </svg>`;
}

function spatialBackground(id) {
  if (id?.includes("basketball")) return `
    <path d="M165 270 L475 270 L475 32 L165 32 Z M250 270 L250 180 L390 180 L390 270 M285 225 A35 35 0 1 0 355 225 A35 35 0 1 0 285 225 M180 75 Q320 190 460 75" />`;
  if (id?.includes("baseball")) return `<path d="M320 270 L95 90 L320 20 L545 90 Z M320 250 L170 100 L320 45 L470 100 Z" /><circle cx="320" cy="170" r="8" />`;
  if (id?.includes("strike")) return `<rect x="245" y="55" width="150" height="205" rx="14" /><line x1="245" y1="120" x2="395" y2="120" /><line x1="245" y1="195" x2="395" y2="195" />`;
  if (id?.includes("tennis")) return `<rect x="70" y="30" width="500" height="240" /><line x1="320" y1="30" x2="320" y2="270" /><line x1="70" y1="150" x2="570" y2="150" /><line x1="195" y1="30" x2="195" y2="270" /><line x1="445" y1="30" x2="445" y2="270" />`;
  if (id?.includes("hockey")) return `<rect x="50" y="35" width="540" height="235" rx="55" /><line x1="320" y1="35" x2="320" y2="270" /><circle cx="320" cy="152" r="42" /><line x1="135" y1="35" x2="135" y2="270" /><line x1="505" y1="35" x2="505" y2="270" />`;
  if (id?.includes("golf")) return `<ellipse cx="320" cy="150" rx="230" ry="110" /><ellipse cx="320" cy="150" rx="60" ry="42" /><circle cx="320" cy="150" r="5" />`;
  return `<rect x="50" y="30" width="540" height="240" rx="8" /><line x1="320" y1="30" x2="320" y2="270" /><circle cx="320" cy="150" r="48" /><rect x="50" y="90" width="85" height="120" /><rect x="505" y="90" width="85" height="120" />`;
}

function spatialSvg(result) {
  const colors = { made: "visual-made", goal: "visual-made", missed: "visual-missed", saved: "visual-saved", blocked: "visual-blocked", ace: "visual-made", fault: "visual-missed" };
  return `
    <svg class="visual-chart-svg visual-spatial" viewBox="0 0 640 300" role="img" aria-labelledby="visualSvgTitle visualSvgDescription">
      <title id="visualSvgTitle">${escapeHtml(result.title)}</title><desc id="visualSvgDescription">${escapeHtml(result.accessibleSummary)}</desc>
      <g class="visual-schematic" aria-hidden="true">${spatialBackground(result.coordinateSystem?.id)}</g>
      ${result.points.map((point, index) => {
        const cx = 50 + (Number(point.x) / 100) * 540;
        const cy = 270 - (Number(point.y) / 100) * 240;
        const outcome = point.outcome || point.eventKind || point.shotType || "sample";
        const shape = ["missed", "blocked", "fault"].includes(outcome)
          ? `<path d="M${cx - 6} ${cy - 6} L${cx + 6} ${cy + 6} M${cx + 6} ${cy - 6} L${cx - 6} ${cy + 6}" />`
          : `<circle cx="${cx}" cy="${cy}" r="${point.eventKind === "touch" ? 8 : 6}" />`;
        return `<g class="visual-spatial-point ${colors[outcome] || "visual-sample"}" tabindex="0" role="img" aria-label="${escapeHtml(`${outcome}, coordinate ${format(point.x)}, ${format(point.y)}`)}">${shape}<title>${escapeHtml(`${outcome} · ${point.zoneId || point.pitchType || point.eventKind || point.shotType || "sample event"}`)}</title></g>`;
      }).join("")}
    </svg>`;
}

function timelineHtml(result) {
  return `<ol class="visual-timeline" aria-label="${escapeHtml(result.title)}">
    ${result.points.map((point) => `<li tabindex="0"><span aria-hidden="true"></span><div><strong>${escapeHtml(point.label || point.eventKind || "Event")}</strong><small>${escapeHtml(point.timestamp ? new Date(point.timestamp).toLocaleString() : `Round ${point.round || "—"}`)} · ${escapeHtml(point.eventKind || "event")}</small></div></li>`).join("")}
  </ol>`;
}

function radarSvg(result) {
  const labels = [...new Set(result.points.map((point) => point.label))];
  const series = [...new Set(result.points.map((point) => point.seriesId))];
  const center = 320;
  const radius = 110;
  const axisPoint = (index, scale = 1) => {
    const angle = (Math.PI * 2 * index / labels.length) - Math.PI / 2;
    return [center + Math.cos(angle) * radius * scale, 150 + Math.sin(angle) * radius * scale];
  };
  return `<svg class="visual-chart-svg visual-radar" viewBox="0 0 640 300" role="img" aria-labelledby="visualSvgTitle visualSvgDescription">
    <title id="visualSvgTitle">${escapeHtml(result.title)}</title><desc id="visualSvgDescription">${escapeHtml(result.accessibleSummary)}</desc>
    <g class="visual-schematic" aria-hidden="true">${[0.25, 0.5, 0.75, 1].map((scale) => `<polygon points="${labels.map((_, index) => axisPoint(index, scale).join(",")).join(" ")}" />`).join("")}${labels.map((label, index) => { const [x, y] = axisPoint(index, 1.14); return `<text x="${x}" y="${y}">${escapeHtml(label.slice(0, 18))}</text>`; }).join("")}</g>
    ${series.map((id, seriesIndex) => {
      const points = labels.map((label, index) => {
        const value = Number(result.points.find((point) => point.seriesId === id && point.label === label)?.value || 0);
        return axisPoint(index, Math.max(0, Math.min(100, value)) / 100).join(",");
      }).join(" ");
      return `<polygon class="visual-radar-series visual-series-${String.fromCharCode(97 + seriesIndex)}" points="${points}" tabindex="0" role="img" aria-label="${escapeHtml(`${id} normalized descriptive profile`)}"><title>${escapeHtml(id)}</title></polygon>`;
    }).join("")}
  </svg>`;
}

function matrixHtml(result) {
  return `<div class="visual-matrix" role="grid" aria-label="${escapeHtml(result.title)}">${result.points.map((point) => `
    <div role="row" tabindex="0"><span role="gridcell">${escapeHtml(point.label || `${point.leftId} × ${point.rightId}`)}</span><strong role="gridcell">${escapeHtml(format(point.value))}</strong><small role="gridcell">Sample ${escapeHtml(point.sampleSize || result.sampleSize)}</small></div>`).join("")}</div>`;
}

function networkSvg(result) {
  return `<svg class="visual-chart-svg visual-spatial" viewBox="0 0 640 300" role="img" aria-labelledby="visualSvgTitle visualSvgDescription">
    <title id="visualSvgTitle">${escapeHtml(result.title)}</title><desc id="visualSvgDescription">${escapeHtml(result.accessibleSummary)}</desc>
    <g class="visual-schematic" aria-hidden="true">${spatialBackground("soccer")}</g>
    ${result.points.map((point) => `<g tabindex="0" role="img" aria-label="${escapeHtml(`${point.fromId} to ${point.toId}: ${point.value} passes`)}">
      <line class="visual-network-link" x1="${50 + point.fromX * 5.4}" y1="${270 - point.fromY * 2.4}" x2="${50 + point.toX * 5.4}" y2="${270 - point.toY * 2.4}" style="stroke-width:${Math.max(2, point.value / 4)}" />
      <circle class="visual-network-node" cx="${50 + point.fromX * 5.4}" cy="${270 - point.fromY * 2.4}" r="8" />
      <circle class="visual-network-node" cx="${50 + point.toX * 5.4}" cy="${270 - point.toY * 2.4}" r="8" />
      <title>${escapeHtml(`${point.fromId} → ${point.toId}: ${point.completed}/${point.value} completed`)}</title>
    </g>`).join("")}
  </svg>`;
}

function chartBody(result) {
  if (result.status !== "ready") return `<div class="visual-unavailable"><strong>${escapeHtml(result.title)}</strong><p>${escapeHtml(result.accessibleSummary)}</p>${result.fallbackPresentation.available ? `<button type="button" class="text-button" data-visual-fallback="${escapeHtml(result.fallbackPresentation.type)}">Show ${escapeHtml(result.fallbackPresentation.label)}</button>` : ""}</div>`;
  if (result.family === "spatial") return result.type === "passing_network" ? networkSvg(result) : spatialSvg(result);
  if (result.family === "timeline") return timelineHtml(result);
  if (result.family === "bar" || result.family === "distribution") return barSvg(result);
  if (result.family === "radar") return radarSvg(result);
  if (result.family === "matrix") return matrixHtml(result);
  return cartesianSvg(result);
}

function dataTable(result) {
  if (!result.table.columns.length) return `<p class="visual-empty">No source rows are available.</p>`;
  return `<div class="visual-table-wrap"><table class="stats-table visual-data-table">
    <caption>${escapeHtml(result.table.caption)} · ${result.coverage.sample ? "sample data" : "provider data"}</caption>
    <thead><tr>${result.table.columns.map((column) => `<th scope="col">${escapeHtml(column.replaceAll(/([A-Z])/g, " $1"))}</th>`).join("")}</tr></thead>
    <tbody>${result.table.rows.map((row) => `<tr>${row.map((value, index) => index === 0 ? `<th scope="row">${escapeHtml(value)}</th>` : `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("")}</tbody>
  </table></div>`;
}

export function renderVisualization(result, options = {}) {
  const typeOptions = options.availableVisualizations || [];
  const dateValue = result.request?.dateRange?.value || 10;
  const threshold = result.request?.filters?.threshold ?? "";
  const edgeTrust = result.edgeTrust?.researchQuality ? result.edgeTrust : evaluateEdgeTrust({
    components: {
      visualizations: result.status === "ready" ? result.coverage?.sample ? "sample" : "verified" : "unavailable",
      freshness: result.dataFreshness?.status || "unavailable",
      coverage: result.coverage?.partial ? .5 : result.status === "ready" ? 1 : 0,
      identity: result.scope?.entityIds?.length ? "verified" : "pending",
      completeness: result.status === "ready" ? 1 : 0,
    },
    applicable: ["visualizations", "freshness", "coverage", "identity", "completeness"],
    sample: result.coverage?.sample === true,
    lastValidation: result.dataFreshness?.lastUpdatedAt,
  });
  return `<article class="visualization-card" aria-labelledby="visualizationTitle" aria-describedby="visualizationSummary">
    <header class="visualization-header">
      <div><p class="eyebrow">EdgeBoard visual analytics · ${result.coverage.sample ? "Sample data" : "Provider data"}</p><h1 id="visualizationTitle">${escapeHtml(result.title)}</h1><p>${escapeHtml(result.subtitle)}</p></div>
      <div><span class="visual-status" data-status="${escapeHtml(result.dataFreshness.status)}">${escapeHtml(result.status === "ready" ? result.dataFreshness.status : "unavailable")}</span><details class="visual-edge-trust"><summary>Research Quality · ${escapeHtml(edgeTrust.researchQuality.label)} · ${edgeTrust.researchQuality.score}%</summary><dl>${edgeTrust.details.map((item) => `<div><dt>${escapeHtml(item.label)}</dt><dd>${escapeHtml(item.status)}${Number.isFinite(item.percentage) ? ` · ${item.percentage}%` : ""}</dd></div>`).join("")}</dl><p>Not betting confidence, projection, edge, hit rate, or probability.</p></details></div>
    </header>
    <div class="visual-controls" aria-label="Visualization controls">
      <label>Visual<select data-visual-control="type">${typeOptions.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === result.requestedType || item.id === result.type ? "selected" : ""} ${item.available ? "" : "disabled"}>${escapeHtml(item.label)}${item.available ? "" : " · unavailable"}</option>`).join("")}</select></label>
      <label>Window<select data-visual-control="window">${[5, 10, 20].map((value) => `<option value="${value}" ${Number(dateValue) === value ? "selected" : ""}>Last ${value}</option>`).join("")}<option value="season" ${dateValue === "season" ? "selected" : ""}>Season</option></select></label>
      <label>Threshold<input data-visual-control="threshold" type="number" step="0.5" value="${escapeHtml(threshold)}" aria-label="Optional chart threshold" /></label>
      <button type="button" class="text-button" data-visual-reset>Reset</button>
    </div>
    ${result.series.length > 1 ? `<div class="visual-legend" aria-label="Chart series">${result.series.map((series) => `<button type="button" aria-pressed="true" data-series-toggle="${escapeHtml(series.id)}"><span aria-hidden="true"></span>${escapeHtml(series.label)}</button>`).join("")}</div>` : ""}
    <div class="visual-layout">
      <div class="visual-chart-region" role="region" aria-label="${escapeHtml(result.title)} interactive chart" tabindex="0">${chartBody(result)}</div>
      <aside class="visual-context">
        <p id="visualizationSummary">${escapeHtml(result.accessibleSummary)}</p>
        ${result.summaryMetrics.length ? `<dl>${result.summaryMetrics.map((metric) => `<div><dt>${escapeHtml(metric.label)}</dt><dd>${escapeHtml(format(metric.value))} ${escapeHtml(metric.unit)}</dd></div>`).join("")}</dl>` : ""}
        <p class="stats-source">${escapeHtml(result.sources[0]?.provider)} · updated ${escapeHtml(result.sources[0]?.lastUpdatedAt || "unavailable")} · sample ${result.sampleSize}</p>
      </aside>
    </div>
    ${result.warnings.length ? `<div class="visual-warnings" role="status"><strong>Data limitations</strong><ul>${result.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul></div>` : ""}
    <div class="visual-actions">
      <button type="button" class="text-button" data-copy-visual-summary>Copy summary</button>
      <button type="button" class="text-button" data-copy-visual-data>Copy data</button>
      <button type="button" class="text-button" data-download-visual-csv>Download CSV</button>
      <button type="button" class="text-button" data-copy-visual-link>Copy link</button>
      <span class="visual-action-status" role="status" aria-live="polite"></span>
    </div>
    <details class="visual-table-details"><summary>Accessible data table · ${result.sampleSize} rows</summary>${dataTable(result)}</details>
  </article>`;
}
