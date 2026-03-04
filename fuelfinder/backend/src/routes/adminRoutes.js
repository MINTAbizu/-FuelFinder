const express = require("express");
const auth = require("../middleware/auth");
const { requireRole, requireScope } = require("../middleware/authorize");
const { validateAdminCreate } = require("../middleware/validateAdmin");
const { auditAction } = require("../middleware/auditLog");
const adminUserController = require("../controllers/adminUserController");

const router = express.Router();

const ADMIN_ROLES = ["staff", "station_manager", "city_manager", "org_admin", "super_admin"];

router.use(auth, requireRole(ADMIN_ROLES));

router.get("/ping", (_req, res) => {
  return res.json({ ok: true, service: "admin" });
});

router.get("/scope-check", requireScope({ requireAny: true }), (req, res) => {
  return res.json({
    ok: true,
    message: "Scope granted.",
    scope: {
      organizationId: req.query.organizationId || req.params.organizationId || req.body.organizationId || "",
      cityId: req.query.cityId || req.params.cityId || req.body.cityId || "",
      stationId: req.query.stationId || req.params.stationId || req.body.stationId || "",
      branchId: req.query.branchId || req.params.branchId || req.body.branchId || ""
    }
  });
});

router.get(
  "/organizations/options",
  requireRole(["super_admin"]),
  adminUserController.listOrganizationOptions
);

router.get(
  "/users",
  requireRole(["super_admin"]),
  adminUserController.listAdminUsers
);

router.post(
  "/users/create-admin",
  requireRole(["super_admin"]),
  validateAdminCreate,
  auditAction("admin.user.create", { targetType: "user" }),
  adminUserController.createAdminUser
);

module.exports = router;
