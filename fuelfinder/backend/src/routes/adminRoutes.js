const express = require("express");
const auth = require("../middleware/auth");
const { requireRole, requireScope } = require("../middleware/authorize");
const { validateAdminCreate } = require("../middleware/validateAdmin");
const { auditAction } = require("../middleware/auditLog");
const adminUserController = require("../controllers/adminUserController");
const adminStationController = require("../controllers/adminStationController");
const adminPaymentController = require("../controllers/adminPaymentController");
const adminLocationController = require("../controllers/adminLocationController");

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

router.patch(
  "/users/:userId",
  requireRole(["super_admin"]),
  auditAction("admin.user.update", { targetType: "user" }),
  adminUserController.updateAdminUser
);

router.patch(
  "/users/:userId/block",
  requireRole(["super_admin"]),
  auditAction("admin.user.block", { targetType: "user" }),
  adminUserController.setAdminUserBlocked
);

router.post(
  "/users/:userId/force-logout",
  requireRole(["super_admin"]),
  auditAction("admin.user.force_logout", { targetType: "user" }),
  adminUserController.forceLogoutAdminUser
);

router.get(
  "/regions",
  requireRole(["super_admin", "org_admin"]),
  adminLocationController.listRegions
);

router.post(
  "/regions",
  requireRole(["super_admin"]),
  auditAction("admin.region.create", { targetType: "region" }),
  adminLocationController.createRegion
);

router.patch(
  "/regions/:regionId",
  requireRole(["super_admin"]),
  auditAction("admin.region.update", { targetType: "region" }),
  adminLocationController.updateRegion
);

router.get(
  "/cities",
  requireRole(["super_admin", "org_admin"]),
  adminLocationController.listCities
);

router.post(
  "/cities",
  requireRole(["super_admin"]),
  auditAction("admin.city.create", { targetType: "city" }),
  adminLocationController.createCity
);

router.patch(
  "/cities/:cityId",
  requireRole(["super_admin"]),
  auditAction("admin.city.update", { targetType: "city" }),
  adminLocationController.updateCity
);

router.get(
  "/woredas",
  requireRole(["super_admin", "org_admin"]),
  adminLocationController.listWoredas
);

router.post(
  "/woredas",
  requireRole(["super_admin"]),
  auditAction("admin.woreda.create", { targetType: "woreda" }),
  adminLocationController.createWoreda
);

router.patch(
  "/woredas/:woredaId",
  requireRole(["super_admin"]),
  auditAction("admin.woreda.update", { targetType: "woreda" }),
  adminLocationController.updateWoreda
);

router.post(
  "/locations/seed-ethiopia",
  requireRole(["super_admin"]),
  auditAction("admin.location.seed_ethiopia", { targetType: "location_directory" }),
  adminLocationController.seedEthiopiaLocations
);

router.get(
  "/stations",
  requireRole(["super_admin", "org_admin"]),
  adminStationController.listStations
);

router.get(
  "/payments",
  requireRole(["super_admin", "org_admin"]),
  adminPaymentController.listPayments
);

router.post(
  "/stations",
  requireRole(["super_admin", "org_admin"]),
  auditAction("admin.station.create", { targetType: "station" }),
  adminStationController.createStation
);

router.patch(
  "/stations/:stationId",
  requireRole(["super_admin", "org_admin"]),
  auditAction("admin.station.update", { targetType: "station" }),
  adminStationController.updateStation
);

router.patch(
  "/stations/:stationId/active",
  requireRole(["super_admin", "org_admin"]),
  auditAction("admin.station.set_active", { targetType: "station" }),
  adminStationController.setStationActive
);

module.exports = router;
