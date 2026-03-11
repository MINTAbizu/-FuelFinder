function normalize(value) {
  return String(value || "").trim();
}

function normalizeEmail(value) {
  return normalize(value).toLowerCase();
}

function normalizePhone(value) {
  return normalize(value).replace(/[^\d+]/g, "");
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidPhone(value) {
  return /^\+?\d{7,15}$/.test(value || "");
}

function isStrongPassword(value) {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/.test(value || "");
}

function sendValidationError(res, message) {
  return res.status(400).json({ message });
}

exports.validateRegister = (req, res, next) => {
  const name = normalize(req.body.name);
  const phone = normalizePhone(req.body.phone);
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || "");

  if (!name || !email || !password || !phone) {
    return sendValidationError(res, "name, email, phone, and password are required.");
  }
  if (name.length > 120) {
    return sendValidationError(res, "name is too long.");
  }
  if (phone.length > 40) {
    return sendValidationError(res, "phone is too long.");
  }
  if (!isValidPhone(phone)) {
    return sendValidationError(res, "Invalid phone number format.");
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

  req.body.name = name;
  req.body.phone = phone;
  req.body.email = email;
  req.body.password = password;
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

exports.validateGoogleAuth = (req, res, next) => {
  const idToken = normalize(req.body.idToken);
  if (!idToken) {
    return sendValidationError(res, "idToken is required.");
  }

  req.body.idToken = idToken;
  return next();
};

exports.validateBootstrapSuperAdmin = (req, res, next) => {
  const name = normalize(req.body.name);
  const phone = normalize(req.body.phone);
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || "");
  const bootstrapKey = normalize(req.body.bootstrapKey);

  if (!name || !email || !password || !bootstrapKey) {
    return sendValidationError(res, "name, email, password, and bootstrapKey are required.");
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

  req.body.name = name;
  req.body.phone = phone;
  req.body.email = email;
  req.body.password = password;
  req.body.bootstrapKey = bootstrapKey;
  return next();
};

exports.validatePhoneVerification = (req, res, next) => {
  const verificationToken = normalize(req.body.verificationToken);
  const otpCode = normalize(req.body.otpCode);

  if (!verificationToken || !otpCode) {
    return sendValidationError(res, "verificationToken and otpCode are required.");
  }

  req.body.verificationToken = verificationToken;
  req.body.otpCode = otpCode;
  return next();
};

exports.validatePhoneResend = (req, res, next) => {
  const verificationToken = normalize(req.body.verificationToken);
  if (!verificationToken) {
    return sendValidationError(res, "verificationToken is required.");
  }

  req.body.verificationToken = verificationToken;
  return next();
};
