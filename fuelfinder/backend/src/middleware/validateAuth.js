function normalize(value) {
  return String(value || "").trim();
}

function normalizeEmail(value) {
  return normalize(value).toLowerCase();
}

function normalizePhone(value) {
  return normalize(value).replace(/[^\d+]/g, "");
}

function normalizeStationType(value) {
  const stationType = normalize(value).toLowerCase();
  if (stationType === "fuel" || stationType === "electric") {
    return stationType;
  }
  return "";
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

exports.validatePasswordResetStart = (req, res, next) => {
  const email = normalizeEmail(req.body.email);
  if (!email) {
    return sendValidationError(res, "email is required.");
  }
  if (!isValidEmail(email)) {
    return sendValidationError(res, "Invalid email format.");
  }

  req.body.email = email;
  return next();
};

exports.validatePasswordResetComplete = (req, res, next) => {
  const resetToken = normalize(req.body.resetToken);
  const newPassword = String(req.body.newPassword || "");

  if (!resetToken || !newPassword) {
    return sendValidationError(res, "resetToken and newPassword are required.");
  }
  if (!isStrongPassword(newPassword)) {
    return sendValidationError(
      res,
      "Password must be 8+ chars and include upper, lower, number, and special character."
    );
  }

  req.body.resetToken = resetToken;
  req.body.newPassword = newPassword;
  return next();
};

exports.validateEmailToken = (req, res, next) => {
  const token = normalize(req.body.token || req.query.token);
  if (!token) {
    return sendValidationError(res, "token is required.");
  }

  if (req.body && Object.prototype.hasOwnProperty.call(req.body, "token")) {
    req.body.token = token;
  }
  if (req.query && Object.prototype.hasOwnProperty.call(req.query, "token")) {
    req.query.token = token;
  }
  req.emailVerificationToken = token;
  return next();
};

exports.validateEmailChangeStart = (req, res, next) => {
  const nextEmail = normalizeEmail(req.body.nextEmail);
  if (!nextEmail) {
    return sendValidationError(res, "nextEmail is required.");
  }
  if (!isValidEmail(nextEmail)) {
    return sendValidationError(res, "Invalid email format.");
  }

  req.body.nextEmail = nextEmail;
  return next();
};

exports.validateUpdateProfile = (req, res, next) => {
  const name = normalize(req.body.name);
  const phone = normalizePhone(req.body.phone);
  const email = normalizeEmail(req.body.email);
  const preferredStationTypeRaw = req.body.preferredStationType;
  const preferredStationType = normalizeStationType(preferredStationTypeRaw);

  if (!name || !email) {
    return sendValidationError(res, "name and email are required.");
  }
  if (name.length > 120) {
    return sendValidationError(res, "name is too long.");
  }
  if (phone.length > 40) {
    return sendValidationError(res, "phone is too long.");
  }
  if (phone && !isValidPhone(phone)) {
    return sendValidationError(res, "Invalid phone number format.");
  }
  if (!isValidEmail(email)) {
    return sendValidationError(res, "Invalid email format.");
  }
  if (preferredStationTypeRaw !== undefined && preferredStationTypeRaw !== null && !preferredStationType) {
    return sendValidationError(res, "preferredStationType must be one of: fuel, electric.");
  }

  req.body.name = name;
  req.body.phone = phone;
  req.body.email = email;
  req.body.preferredStationType = preferredStationType || undefined;
  return next();
};

exports.validateChangePassword = (req, res, next) => {
  const currentPassword = String(req.body.currentPassword || "");
  const newPassword = String(req.body.newPassword || "");

  if (!newPassword) {
    return sendValidationError(res, "newPassword is required.");
  }
  if (!isStrongPassword(newPassword)) {
    return sendValidationError(
      res,
      "Password must be 8+ chars and include upper, lower, number, and special character."
    );
  }

  req.body.currentPassword = currentPassword;
  req.body.newPassword = newPassword;
  return next();
};

exports.validateBiometricRegister = (req, res, next) => {
  const deviceId = normalize(req.body.deviceId);
  const deviceLabel = normalize(req.body.deviceLabel);

  if (!deviceId) {
    return sendValidationError(res, "deviceId is required.");
  }
  if (deviceId.length > 160) {
    return sendValidationError(res, "deviceId is too long.");
  }
  if (deviceLabel.length > 120) {
    return sendValidationError(res, "deviceLabel is too long.");
  }

  req.body.deviceId = deviceId;
  req.body.deviceLabel = deviceLabel;
  return next();
};

exports.validateBiometricLogin = (req, res, next) => {
  const deviceId = normalize(req.body.deviceId);
  const biometricSecret = normalize(req.body.biometricSecret);

  if (!deviceId || !biometricSecret) {
    return sendValidationError(res, "deviceId and biometricSecret are required.");
  }
  if (deviceId.length > 160) {
    return sendValidationError(res, "deviceId is too long.");
  }
  if (biometricSecret.length > 255) {
    return sendValidationError(res, "biometricSecret is too long.");
  }

  req.body.deviceId = deviceId;
  req.body.biometricSecret = biometricSecret;
  return next();
};
