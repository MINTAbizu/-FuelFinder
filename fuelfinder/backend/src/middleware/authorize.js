function readScopedId(req, key) {
  const paramValue = req.params ? req.params[key] : undefined;
  const queryValue = req.query ? req.query[key] : undefined;
  const bodyValue = req.body ? req.body[key] : undefined;

  const rawValue = paramValue ?? queryValue ?? bodyValue;
  const text = String(rawValue || "").trim();
  return text || "";
}

function hasId(list, targetId) {
  return Array.isArray(list) && list.map((value) => String(value)).includes(String(targetId));
}

function requireRole(allowedRoles = []) {
  const accepted = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  const acceptedSet = new Set(accepted.filter(Boolean));

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required." });
    }

    const role = String(req.user.role || "");
    if (!acceptedSet.has(role)) {
      return res.status(403).json({ message: "Forbidden: insufficient role." });
    }

    return next();
  };
}

function requireScope(options = {}) {
  const {
    organizationKey = "organizationId",
    cityKey = "cityId",
    stationKey = "stationId",
    branchKey = "branchId",
    requireAny = false
  } = options;

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required." });
    }

    if (req.user.role === "super_admin") {
      return next();
    }

    const organizationId = readScopedId(req, organizationKey);
    const cityId = readScopedId(req, cityKey);
    const stationId = readScopedId(req, stationKey);
    const branchId = readScopedId(req, branchKey);

    const requested = [organizationId, cityId, stationId, branchId].filter(Boolean);
    if (requireAny && !requested.length) {
      return res.status(400).json({
        message: `At least one scope key is required: ${organizationKey}, ${cityKey}, ${stationKey}, or ${branchKey}.`
      });
    }

    if (organizationId) {
      const ownedOrgId = String(req.user.organizationId || "");
      if (!ownedOrgId || ownedOrgId !== organizationId) {
        return res.status(403).json({ message: "Forbidden: organization scope denied." });
      }
    }

    if (cityId && req.user.cityIds.length && !hasId(req.user.cityIds, cityId)) {
      return res.status(403).json({ message: "Forbidden: city scope denied." });
    }

    if (stationId && req.user.stationIds.length && !hasId(req.user.stationIds, stationId)) {
      return res.status(403).json({ message: "Forbidden: station scope denied." });
    }

    if (branchId && req.user.branchIds.length && !hasId(req.user.branchIds, branchId)) {
      return res.status(403).json({ message: "Forbidden: branch scope denied." });
    }

    return next();
  };
}

module.exports = {
  requireRole,
  requireScope
};

