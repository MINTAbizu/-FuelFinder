const mongoose = require("mongoose");

function normalize(value) {
  return String(value || "").trim();
}

function normalizeEmail(value) {
  return normalize(value).toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isStrongPassword(value) {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/.test(value || "");
}

function asIdArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalize(item)).filter(Boolean);
}

function validateObjectIdList(list, fieldName) {
  const hasInvalid = list.some((id) => !mongoose.isValidObjectId(id));
  return hasInvalid ? `${fieldName} contains invalid ObjectId.` : "";
}

const ADMIN_CREATABLE_ROLES = new Set([
  "staff",
  "station_manager",
  "city_manager",
  "org_admin",
  "super_admin"
]);

exports.validateAdminCreate = (req, res, next) => {
  const name = normalize(req.body.name);
  const phone = normalize(req.body.phone);
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || "");
  const role = normalize(req.body.role).toLowerCase();
  const organizationId = normalize(req.body.organizationId);
  const cityIds = asIdArray(req.body.cityIds);
  const stationIds = asIdArray(req.body.stationIds);
  const branchIds = asIdArray(req.body.branchIds);

  if (!name || !email || !password || !role) {
    return res.status(400).json({ message: "name, email, password, and role are required." });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ message: "Invalid email format." });
  }
  if (!isStrongPassword(password)) {
    return res.status(400).json({
      message: "Password must be 8+ chars and include upper, lower, number, and special character."
    });
  }
  if (!ADMIN_CREATABLE_ROLES.has(role)) {
    return res.status(400).json({ message: "Invalid admin/staff role." });
  }
  if (organizationId && !mongoose.isValidObjectId(organizationId)) {
    return res.status(400).json({ message: "organizationId must be a valid ObjectId." });
  }

  const cityIdError = validateObjectIdList(cityIds, "cityIds");
  if (cityIdError) return res.status(400).json({ message: cityIdError });

  const stationIdError = validateObjectIdList(stationIds, "stationIds");
  if (stationIdError) return res.status(400).json({ message: stationIdError });

  const branchIdError = validateObjectIdList(branchIds, "branchIds");
  if (branchIdError) return res.status(400).json({ message: branchIdError });

  req.body.name = name;
  req.body.phone = phone;
  req.body.email = email;
  req.body.password = password;
  req.body.role = role;
  req.body.organizationId = organizationId || null;
  req.body.cityIds = [...new Set(cityIds)];
  req.body.stationIds = [...new Set(stationIds)];
  req.body.branchIds = [...new Set(branchIds)];
  return next();
};

