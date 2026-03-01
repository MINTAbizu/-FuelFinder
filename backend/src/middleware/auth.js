const { verifyAccessToken } = require("../utils/tokens");

function auth(req, res, next) {
  const authHeader = req.header("authorization") || "";
  const parts = authHeader.split(" ");

  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return res.status(401).json({ message: "Missing or invalid Authorization header." });
  }

  try {
    const payload = verifyAccessToken(parts[1]);
    req.user = { id: payload.sub, email: payload.email };
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
}

module.exports = auth;
