const { verifyAccessToken } = require("../utils/tokens");
const User = require("../models/User");

async function auth(req, res, next) {
  const authHeader = req.header("authorization") || "";
  const parts = authHeader.split(" ");

  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return res.status(401).json({ message: "Missing or invalid Authorization header." });
  }

  try {
    const payload = verifyAccessToken(parts[1]);
    const user = await User.findById(payload.sub).select(
      "_id email role isBlocked organizationId cityIds stationIds branchIds"
    );
    if (!user) {
      return res.status(401).json({ message: "User not found for this token." });
    }
    if (user.isBlocked) {
      return res.status(403).json({ message: "Account is blocked. Contact administrator." });
    }

    req.user = {
      id: String(user._id),
      email: user.email,
      role: user.role || "customer",
      organizationId: user.organizationId ? String(user.organizationId) : "",
      cityIds: (user.cityIds || []).map((id) => String(id)),
      stationIds: (user.stationIds || []).map((id) => String(id)),
      branchIds: (user.branchIds || []).map((id) => String(id))
    };
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
}

module.exports = auth;
