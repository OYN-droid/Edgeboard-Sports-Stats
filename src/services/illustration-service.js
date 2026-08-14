import { ILLUSTRATION_ASSET_TYPES, ILLUSTRATION_REGISTRY, ILLUSTRATION_VARIANTS } from "../config/illustration-registry.js";

const VALID_TYPES = new Set(ILLUSTRATION_ASSET_TYPES);
const VALID_VARIANTS = new Set(ILLUSTRATION_VARIANTS);
const CONTEXT_VARIANTS = Object.freeze({
  profile: ["profile", "portrait", "action", "story", "compact"], story: ["story", "action", "portrait", "profile", "compact"],
  comparison: ["portrait", "profile", "compact", "action"], compact: ["compact", "portrait", "profile"],
  market: ["compact", "portrait", "profile"], parlay: ["compact", "portrait", "profile"],
});

const normalized = (value) => String(value || "").trim().toLowerCase();
const providerShaped = (value) => /^\d+$/.test(String(value || "")) || /^(provider|sportsdataio|sportradar|statsperform|optasports)[:_-]/i.test(String(value || ""));

export function validateIllustrationRegistry(entries = ILLUSTRATION_REGISTRY, { assetExists } = {}) {
  const errors = []; const seenIds = new Set(); const seenVariants = new Set();
  entries.forEach((entry, index) => {
    const label = entry?.id || `entry ${index}`;
    if (!entry?.id || seenIds.has(entry.id)) errors.push(`${label}: duplicate or missing registry ID`);
    seenIds.add(entry?.id);
    if (!entry?.canonicalEntityId || providerShaped(entry.canonicalEntityId)) errors.push(`${label}: canonical entity ID is missing or provider-shaped`);
    const variantKey = `${entry?.canonicalEntityId}:${entry?.variant}`;
    if (seenVariants.has(variantKey)) errors.push(`${label}: duplicate canonical variant`);
    seenVariants.add(variantKey);
    if (!VALID_TYPES.has(entry?.assetType)) errors.push(`${label}: invalid asset type`);
    if (!VALID_VARIANTS.has(entry?.variant)) errors.push(`${label}: invalid variant`);
    if (!entry?.assetPath) errors.push(`${label}: missing asset path`);
    if (!entry?.source) errors.push(`${label}: missing source metadata`);
    if (entry?.status !== "active") errors.push(`${label}: inactive registry entry`);
    if (assetExists && entry?.assetPath && !assetExists(entry.assetPath)) errors.push(`${label}: asset file does not exist`);
  });
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors), entryCount: entries.length });
}

function variantOrder(context, desiredVariant) {
  return [...new Set([desiredVariant, ...(CONTEXT_VARIANTS[context] || CONTEXT_VARIANTS.compact), ...ILLUSTRATION_VARIANTS].filter(Boolean))];
}

function best(entries, context, desiredVariant) {
  const variants = variantOrder(context, desiredVariant);
  return [...entries].sort((left, right) => variants.indexOf(left.variant) - variants.indexOf(right.variant)
    || Number(right.priority || 0) - Number(left.priority || 0) || left.id.localeCompare(right.id))[0] || null;
}

export class IllustrationResolver {
  constructor(entries = ILLUSTRATION_REGISTRY) {
    const validation = validateIllustrationRegistry(entries);
    if (!validation.valid) throw new Error(`Invalid illustration registry: ${validation.errors.join("; ")}`);
    this.entries = Object.freeze([...entries]);
  }

  resolve(entity, options = {}) {
    const canonicalEntityId = String(entity?.id || entity?.canonicalEntityId || "").trim();
    const sport = normalized(options.sport || entity?.sportId || entity?.sport);
    const league = normalized(options.league || entity?.leagueId || entity?.league);
    const teamId = String(options.teamId || entity?.teamId || "").trim();
    const weightClass = normalized(options.weightClass || entity?.weightClass || entity?.metadata?.weightClass);
    const series = normalized(options.series || entity?.series || entity?.metadata?.series);
    const tour = normalized(options.tour || entity?.tour || entity?.metadata?.tour || league);
    const context = options.context || "compact";
    const desiredVariant = options.desiredVariant || (context === "profile" ? "profile" : context === "story" ? "story" : "compact");
    const active = this.entries.filter((entry) => entry.status === "active");
    const levels = [
      ["exact", active.filter((entry) => canonicalEntityId && entry.canonicalEntityId === canonicalEntityId && !["generic_sport", "team"].includes(entry.entityType))],
      ["team", active.filter((entry) => teamId && entry.assetType === "team_fallback" && entry.teamId === teamId)],
      ["competition", active.filter((entry) => league && entry.assetType === "competition_fallback" && normalized(entry.league) === league && (!sport || normalized(entry.sport) === sport))],
      ["weight_class", active.filter((entry) => weightClass && entry.assetType === "weight_class_fallback" && normalized(entry.weightClass) === weightClass && (!sport || normalized(entry.sport) === sport))],
      ["tour", active.filter((entry) => tour && entry.assetType === "tour_fallback" && (normalized(entry.tour) === tour || normalized(entry.league) === tour) && (!sport || normalized(entry.sport) === sport))],
      ["series", active.filter((entry) => series && entry.assetType === "series_fallback" && normalized(entry.series) === series && (!sport || normalized(entry.sport) === sport))],
      ["generic_sport", active.filter((entry) => sport && entry.assetType === "generic_sport" && normalized(entry.sport) === sport)],
      ["neutral", active.filter((entry) => entry.assetType === "placeholder")],
    ];
    const [fallbackLevel, entry] = levels.map(([level, candidates]) => [level, best(candidates, context, desiredVariant)]).find(([, candidate]) => candidate) || ["none", null];
    if (!entry) return null;
    const displayName = String(entity?.displayName || entity?.name || "Sports entity");
    const decorative = options.decorative === true;
    return Object.freeze({
      assetPath: entry.assetPath, assetType: entry.assetType, variant: entry.variant, fallbackLevel,
      altText: decorative ? "" : fallbackLevel === "exact" ? `${displayName} editorial illustration` : entry.altText || `${displayName} sports illustration`,
      source: entry.source, canonicalEntityId: canonicalEntityId || null, registryId: entry.id,
      decorative, loading: "lazy", decoding: "async", priority: entry.priority,
      requestedVariant: desiredVariant, variantFallback: entry.variant !== desiredVariant,
    });
  }
}

const defaultResolver = new IllustrationResolver();
export function getIllustration(entity, context = {}) { return defaultResolver.resolve(entity, context); }
export function createIllustrationResolver(entries) { return new IllustrationResolver(entries); }
