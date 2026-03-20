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
  const rawOrigins = [
    process.env.CLIENT_ORIGIN,
    process.env.CLIENT_ORIGINS,
    process.env.CORS_ALLOWED_ORIGINS,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(",");

  const entries = rawOrigins
    .split(",")
    .map((value) => normalizeOrigin(value))
    .filter(Boolean);

  const exactOrigins = [];
  const wildcardOrigins = [];
  let allowAnyOrigin = false;

  for (const entry of entries) {
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
    return callback(new Error("CORS origin denied."));
  };
}

module.exports = {
  createCorsOriginHandler,
  isAllowedOrigin,
  normalizeOrigin,
};
