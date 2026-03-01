// Replace with JWT auth in production.
// Expected header: x-user-id: <Mongo ObjectId>
function mockAuth(req, res, next) {
  const userId = req.header("x-user-id");
  if (!userId) {
    return res.status(401).json({ message: "Missing x-user-id header." });
  }
  req.user = { id: userId };
  return next();
}

module.exports = mockAuth;
