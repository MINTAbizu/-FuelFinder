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

function sendValidationError(res, message) {
  return res.status(400).json({ message });
}

const ALLOWED_ROLES = new Set([
  "customer",
  "staff",
  "station_manager",
  "city_manager",
  "org_admin",
  "super_admin"
]);

exports.validateRegister = (req, res, next) => {
  const name = normalize(req.body.name);
  const phone = normalize(req.body.phone);
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || "");
  const role = normalize(req.body.role || "customer").toLowerCase();
  const adminRegistrationKey = normalize(req.body.adminRegistrationKey);

  if (!name || !email || !password) {
    return sendValidationError(res, "name, email, and password are required.");
  }
  if (name.length > 120) {
    return sendValidationError(res, "name is too long.");
  }
  if (phone.length > 40) {
    return sendValidationError(res, "phone is too long.");
  }
  if (!isValidEmail(email)) {
    return sendValidationError(res, "Invalid email format.");
  }
  if (!isStrongPassword(password)) {
    return sendValidationError(
      res,
      "Password must be 8+ chars and include upper, lower, number, and special character."
    );
  }
  if (!ALLOWED_ROLES.has(role)) {
    return sendValidationError(res, "Invalid role.");
  }

  req.body.name = name;
  req.body.phone = phone;
  req.body.email = email;
  req.body.password = password;
  req.body.role = role;
  req.body.adminRegistrationKey = adminRegistrationKey;
  return next();
};

exports.validateLogin = (req, res, next) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || "");

  if (!email || !password) {
    return sendValidationError(res, "email and password are required.");
  }
  if (!isValidEmail(email)) {
    return sendValidationError(res, "Invalid email format.");
  }

  req.body.email = email;
  req.body.password = password;
  return next();
};

exports.validateRefresh = (req, res, next) => {
  const refreshToken = normalize(req.body.refreshToken);
  if (!refreshToken) {
    return sendValidationError(res, "refreshToken is required.");
  }

  req.body.refreshToken = refreshToken;
  return next();
};
