const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "https://fuel-centeral-command.netlify.app",
  "https://fuel-command-center-station.netlify.app",
];

function normalizeOrigin(origin) {
  return String(origin || "").trim().replace(/\/+$/, "");
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildWildcardRegex(pattern) {
  const normalized = normalizeOrigin(pattern);
  if (!normalized.includes("*")) return null;
  const source = `^${normalized.split("*").map(escapeRegex).join(".*")}$`;
  return new RegExp(source, "i");
}

function parseOriginRules() {
  const entries = [
    ...DEFAULT_ALLOWED_ORIGINS,
    process.env.CLIENT_ORIGIN,
    process.env.CLIENT_ORIGINS,
    process.env.CORS_ALLOWED_ORIGINS,
    process.env.OWNER_WEB_ORIGIN,
    process.env.OWNER_WEB_ORIGINS,
  ]
    .flatMap((value) => String(value || "").split(","))
    .map((value) => normalizeOrigin(value))
    .filter(Boolean);

  const uniqueEntries = Array.from(new Set(entries));

  const exactOrigins = [];
  const wildcardOrigins = [];
  let allowAnyOrigin = false;

  for (const entry of uniqueEntries) {
    if (entry === "*") {
      allowAnyOrigin = true;
      continue;
    }

    const wildcardRule = buildWildcardRegex(entry);
    if (wildcardRule) {
      wildcardOrigins.push(wildcardRule);
      continue;
    }

    exactOrigins.push(entry);
  }

  return {
    allowAnyOrigin,
    exactOrigins,
    wildcardOrigins,
  };
}

function isAllowedOrigin(origin, { isProduction = false } = {}) {
  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) return true;

  const rules = parseOriginRules();
  if (rules.allowAnyOrigin && !isProduction) return true;
  if (rules.exactOrigins.includes(normalizedOrigin)) return true;
  return rules.wildcardOrigins.some((rule) => rule.test(normalizedOrigin));
}

function createCorsOriginHandler({ isProduction = false } = {}) {
  return (origin, callback) => {
    if (isAllowedOrigin(origin, { isProduction })) {
      return callback(null, true);
    }
    console.warn(`[cors] blocked origin: ${normalizeOrigin(origin) || "<missing-origin>"}`);
    return callback(new Error("CORS origin denied."));
  };
}

module.exports = {
  createCorsOriginHandler,
  isAllowedOrigin,
  normalizeOrigin,
};
