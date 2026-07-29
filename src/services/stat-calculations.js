const finite = (value) => value !== null
  && value !== undefined
  && value !== ""
  && Number.isFinite(Number(value));

const ratio = (numerator, denominator, multiplier = 1) => {
  const top = Number(numerator);
  const bottom = Number(denominator);
  return Number.isFinite(top) && Number.isFinite(bottom) && bottom !== 0
    ? (top / bottom) * multiplier
    : null;
};

export function statValueForRow(row, statId) {
  const direct = row?.stats?.[statId];
  if (finite(direct)) return Number(direct);
  const stats = row?.stats || {};
  const completedFights = Number(stats["combat-wins"] || 0)
    + Number(stats["combat-losses"] || 0)
    + Number(stats["combat-draws"] || 0);
  const derived = {
    "basketball-assist-to-turnover-ratio": () => ratio(stats["basketball-assists"], stats["basketball-turnovers"]),
    "football-completion-percentage": () => ratio(stats["football-completions"], stats["football-passing-attempts"], 100),
    "football-yards-per-attempt": () => ratio(stats["football-passing-yards"], stats["football-passing-attempts"]),
    "football-yards-per-carry": () => ratio(stats["football-rushing-yards"], stats["football-rushing-attempts"]),
    "football-yards-per-reception": () => ratio(stats["football-receiving-yards"], stats["football-receptions"]),
    "football-total-touches": () => {
      const attempts = Number(stats["football-rushing-attempts"]);
      const receptions = Number(stats["football-receptions"]);
      return Number.isFinite(attempts) || Number.isFinite(receptions)
        ? (Number.isFinite(attempts) ? attempts : 0) + (Number.isFinite(receptions) ? receptions : 0)
        : null;
    },
    "baseball-total-bases": () => {
      if (finite(stats["baseball-total-bases"])) return Number(stats["baseball-total-bases"]);
      const singles = Number(stats["baseball-singles"]);
      const doubles = Number(stats["baseball-doubles"]);
      const triples = Number(stats["baseball-triples"]);
      const homers = Number(stats["baseball-home-runs"]);
      if (![singles, doubles, triples, homers].some(Number.isFinite)) return null;
      return (Number.isFinite(singles) ? singles : 0)
        + (Number.isFinite(doubles) ? doubles * 2 : 0)
        + (Number.isFinite(triples) ? triples * 3 : 0)
        + (Number.isFinite(homers) ? homers * 4 : 0);
    },
    "baseball-batting-average": () => ratio(stats["baseball-hits"], stats["baseball-at-bats"]),
    "baseball-on-base-percentage": () => ratio(
      Number(stats["baseball-hits"] || 0) + Number(stats["baseball-walks"] || 0),
      stats["baseball-plate-appearances"] ?? (Number(stats["baseball-at-bats"] || 0) + Number(stats["baseball-walks"] || 0)),
    ),
    "baseball-slugging-percentage": () => ratio(statValueForRow(row, "baseball-total-bases"), stats["baseball-at-bats"]),
    "baseball-strikeouts-per-nine": () => ratio(stats["baseball-pitcher-strikeouts"], stats["baseball-innings-pitched"], 9),
    "soccer-save-percentage": () => ratio(
      stats["soccer-goalkeeper-saves"],
      Number(stats["soccer-goalkeeper-saves"] || 0) + Number(stats["soccer-goals-allowed"] || 0),
      100,
    ),
    "combat-knockout-rate": () => ratio(stats["combat-knockout-wins"], completedFights, 100),
    "combat-submission-rate": () => ratio(stats["combat-submission-wins"], completedFights, 100),
    "combat-decision-rate": () => ratio(stats["combat-decision-wins"], completedFights, 100),
    "combat-significant-strikes-landed-per-minute": () => ratio(
      stats["combat-significant-strikes-landed"], stats["combat-average-fight-time"],
    ),
    "combat-significant-strikes-absorbed-per-minute": () => ratio(
      stats["combat-significant-strikes-absorbed"], stats["combat-average-fight-time"],
    ),
    "combat-striking-differential": () => finite(stats["combat-significant-strikes-landed"])
      && finite(stats["combat-significant-strikes-absorbed"])
      ? Number(stats["combat-significant-strikes-landed"]) - Number(stats["combat-significant-strikes-absorbed"])
      : null,
    "combat-takedown-average": () => finite(stats["combat-takedowns-landed"])
      ? Number(stats["combat-takedowns-landed"])
      : null,
    "motorsport-position-change": () => finite(stats["motorsport-average-starting-position"])
      && finite(stats["motorsport-average-finishing-position"])
      ? Number(stats["motorsport-average-starting-position"]) - Number(stats["motorsport-average-finishing-position"])
      : null,
  }[statId];
  const value = derived ? derived() : null;
  return finite(value) ? Number(value) : null;
}

export function prepareStatRows(rows = []) {
  const seenRowIds = new Set();
  const seenEventRows = new Set();
  const warnings = [];
  const prepared = [];
  rows.forEach((row) => {
    if (!row || typeof row !== "object" || !row.row_id) {
      warnings.push("A row without a stable row ID was ignored.");
      return;
    }
    if (seenRowIds.has(row.row_id)) {
      warnings.push(`Duplicate row ${row.row_id} was ignored.`);
      return;
    }
    seenRowIds.add(row.row_id);
    if (["postponed", "cancelled"].includes(row.status)) {
      warnings.push(`${row.row_id} is ${row.status} and was excluded.`);
      return;
    }
    if (row.status !== "completed") {
      warnings.push(`${row.row_id} is incomplete and was excluded.`);
      return;
    }
    const eventDate = new Date(row.event_date);
    if (Number.isNaN(eventDate.getTime())) {
      warnings.push(`${row.row_id} has no valid event date and was ignored.`);
      return;
    }
    const logicalEventKey = row.event_id
      ? `${row.entity_id || "unknown-entity"}:${row.event_id}:${row.period || "full-event"}`
      : "";
    if (logicalEventKey && seenEventRows.has(logicalEventKey)) {
      warnings.push(`Duplicate event ${row.event_id} for ${row.entity_id || "unknown entity"} was ignored.`);
      return;
    }
    if (logicalEventKey) seenEventRows.add(logicalEventKey);
    prepared.push({ ...row, eventDate });
  });
  prepared.sort((a, b) => a.eventDate - b.eventDate);
  return { rows: prepared, warnings };
}

export function filterLastN(rows, count) {
  const safeCount = Math.max(0, Math.floor(Number(count) || 0));
  return safeCount ? [...rows].sort((a, b) => new Date(a.event_date) - new Date(b.event_date)).slice(-safeCount) : [...rows];
}

export function filterDateRange(rows, dateRange = {}, now = new Date()) {
  if (!dateRange?.type || dateRange.type === "career") return [...rows];
  if (dateRange.type === "season") {
    const seasons = [...new Set(rows.map((row) => String(row.season || "")).filter(Boolean))]
      .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
    const season = dateRange.value === "previous" ? seasons[1] : seasons[0];
    return season ? rows.filter((row) => String(row.season) === season) : [];
  }
  if (dateRange.type === "last_n_games") return filterLastN(rows, dateRange.value);
  let start = null;
  let end = null;
  if (dateRange.type === "last_n_days") {
    end = new Date(now);
    start = new Date(end.getTime() - Math.max(0, Number(dateRange.value) || 0) * 86400000);
  } else if (dateRange.type === "this_month") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  } else if (dateRange.type === "this_week") {
    end = new Date(now);
    start = new Date(end);
    start.setDate(end.getDate() - end.getDay());
    start.setHours(0, 0, 0, 0);
  } else if (dateRange.type === "yesterday") {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (dateRange.type === "today") {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  } else if (dateRange.type === "since") {
    start = new Date(dateRange.start);
  } else if (dateRange.type === "between") {
    start = new Date(dateRange.start);
    end = new Date(dateRange.end);
  }
  if (start && Number.isNaN(start.getTime())) start = null;
  if (end && Number.isNaN(end.getTime())) end = null;
  return rows.filter((row) => {
    const date = new Date(row.event_date);
    return !Number.isNaN(date.getTime())
      && (!start || date >= start)
      && (!end || date < end);
  });
}

export function filterRowsBySplit(rows, query = {}) {
  return rows.filter((row) => {
    if (query.homeAway && row.home_away !== query.homeAway) return false;
    if (query.starterStatus === "starter" && row.starter !== true) return false;
    if (query.starterStatus === "bench" && row.starter !== false) return false;
    if (query.gameResult && row.result !== query.gameResult) return false;
    if (query.opponentIds?.length && !query.opponentIds.includes(row.opponent_id)) return false;
    if (query.season && String(row.season) !== String(query.season)) return false;
    if (query.seasonType && row.season_type !== query.seasonType) return false;
    if (query.competition && row.competition !== query.competition) return false;
    if (query.competitionStage && row.competition_stage !== query.competitionStage) return false;
    if (query.venueType && row.venue_type !== query.venueType) return false;
    if (query.surfaceType && row.surface_type !== query.surfaceType) return false;
    if (query.trackType && row.track_type !== query.trackType) return false;
    if (query.period && query.period !== "full-event" && row.period !== query.period) return false;
    const minutes = Number(row.stats?.["basketball-minutes"] ?? row.stats?.["soccer-minutes"]);
    if (query.minimumMinutes !== null && query.minimumMinutes !== undefined
      && (!Number.isFinite(minutes) || minutes < Number(query.minimumMinutes))) return false;
    return true;
  });
}

export function statValues(rows, statId) {
  return rows.map((row) => statValueForRow(row, statId)).filter(finite).map(Number);
}

export function sum(values) {
  const safe = values.filter(finite).map(Number);
  return safe.reduce((total, value) => total + value, 0);
}

export function average(values) {
  const safe = values.filter(finite).map(Number);
  return safe.length ? sum(safe) / safe.length : null;
}

export function count(values) {
  return values.filter(finite).length;
}

export function percentage(numerator, denominator) {
  const top = Number(numerator);
  const bottom = Number(denominator);
  return Number.isFinite(top) && Number.isFinite(bottom) && bottom !== 0 ? (top / bottom) * 100 : null;
}

export function minimum(values) {
  const safe = values.filter(finite).map(Number);
  return safe.length ? Math.min(...safe) : null;
}

export function maximum(values) {
  const safe = values.filter(finite).map(Number);
  return safe.length ? Math.max(...safe) : null;
}

export function median(values) {
  const safe = values.filter(finite).map(Number).sort((a, b) => a - b);
  if (!safe.length) return null;
  const middle = Math.floor(safe.length / 2);
  return safe.length % 2 ? safe[middle] : (safe[middle - 1] + safe[middle]) / 2;
}

export function calculateAggregation(rows, statId, aggregation = "average") {
  const values = statValues(rows, statId);
  const calculators = {
    sum,
    total: sum,
    average,
    "per-game": average,
    minimum,
    maximum,
    median,
    count,
    percentage: average,
    rate: average,
  };
  const value = (calculators[aggregation] || average)(values);
  return {
    value,
    values,
    sampleSize: values.length,
    missingCount: Math.max(0, rows.length - values.length),
  };
}

export function thresholdHitCount(rows, statId, operator, threshold) {
  const values = statValues(rows, statId);
  const target = Number(threshold);
  if (!Number.isFinite(target)) return { hitCount: 0, sampleSize: values.length, hitRate: null };
  const comparisons = {
    gt: (value) => value > target,
    gte: (value) => value >= target,
    lt: (value) => value < target,
    lte: (value) => value <= target,
    eq: (value) => value === target,
  };
  const compare = comparisons[operator] || comparisons.gt;
  const hitCount = values.filter(compare).length;
  return {
    hitCount,
    sampleSize: values.length,
    hitRate: percentage(hitCount, values.length),
  };
}

export function calculateEntityStats(rows, statIds, aggregation = "average") {
  return Object.fromEntries(statIds.map((statId) => [statId, calculateAggregation(rows, statId, aggregation)]));
}

export function sortLeaderboard(entries, direction = "desc") {
  const multiplier = direction === "asc" ? 1 : -1;
  return [...entries].sort((a, b) => {
    const left = Number(a.value);
    const right = Number(b.value);
    if (!Number.isFinite(left) && !Number.isFinite(right)) return 0;
    if (!Number.isFinite(left)) return 1;
    if (!Number.isFinite(right)) return -1;
    return (left - right) * multiplier;
  });
}

export function calculationMetadata({
  rows,
  requestedGames = null,
  warnings = [],
  source = "EdgeBoard Mock Historical",
  updatedAt = null,
}) {
  const dates = rows.map((row) => new Date(row.event_date)).filter((date) => !Number.isNaN(date.getTime()));
  return {
    sampleSize: rows.length,
    gamesAvailable: rows.length,
    gamesRequested: requestedGames,
    dateRangeUsed: dates.length ? {
      start: new Date(Math.min(...dates)).toISOString(),
      end: new Date(Math.max(...dates)).toISOString(),
    } : null,
    calculationWarnings: [
      ...warnings,
      ...(requestedGames && rows.length < requestedGames ? [`Only ${rows.length} of ${requestedGames} requested games are available.`] : []),
    ],
    dataFreshness: updatedAt ? "sample-snapshot" : "unknown",
    source,
    lastUpdated: updatedAt,
  };
}
