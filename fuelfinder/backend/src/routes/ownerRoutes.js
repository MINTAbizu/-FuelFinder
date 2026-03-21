const express = require("express");
const auth = require("../middleware/auth");
const { requireRole, requireScope } = require("../middleware/authorize");
const ownerStationController = require("../controllers/ownerStationController");
const ownerInventoryController = require("../controllers/ownerInventoryController");
const ownerPaymentController = require("../controllers/ownerPaymentController");
const ownerTeamController = require("../controllers/ownerTeamController");
const promotionController = require("../controllers/promotionController");

const router = express.Router();
const OWNER_ROLES = ["staff", "station_manager", "city_manager", "org_admin", "super_admin"];
const STATION_EXEC_ROLES = ["station_manager", "org_admin", "super_admin"];

router.use(auth, requireRole(OWNER_ROLES));

router.get("/stations", ownerStationController.listMyStations);

router.get(
  "/stations/:stationId",
  requireScope({ stationKey: "stationId", requireAny: true }),
  ownerStationController.getMyStation
);

router.get(
  "/stations/:stationId/fuel-stock/summary",
  requireRole(STATION_EXEC_ROLES),
  requireScope({ stationKey: "stationId", requireAny: true }),
  ownerInventoryController.getStationFuelStockSummary
);

router.patch(
  "/stations/:stationId",
  requireRole(STATION_EXEC_ROLES),
  requireScope({ stationKey: "stationId", requireAny: true }),
  ownerStationController.updateMyStation
);

router.get(
  "/stations/:stationId/payments",
  requireRole(STATION_EXEC_ROLES),
  requireScope({ stationKey: "stationId", requireAny: true }),
  ownerPaymentController.listStationPayments
);

router.get(
  "/stations/:stationId/team",
  requireRole(STATION_EXEC_ROLES),
  requireScope({ stationKey: "stationId", requireAny: true }),
  ownerTeamController.listStationTeam
);

router.get(
  "/stations/:stationId/promotions",
  requireRole(STATION_EXEC_ROLES),
  requireScope({ stationKey: "stationId", requireAny: true }),
  promotionController.listStationPromotions
);

router.post(
  "/stations/:stationId/promotions",
  requireRole(STATION_EXEC_ROLES),
  requireScope({ stationKey: "stationId", requireAny: true }),
  promotionController.createStationPromotion
);

router.patch(
  "/stations/:stationId/promotions/:promotionId",
  requireRole(STATION_EXEC_ROLES),
  requireScope({ stationKey: "stationId", requireAny: true }),
  promotionController.updateStationPromotion
);

router.post(
  "/stations/:stationId/team",
  requireRole(STATION_EXEC_ROLES),
  requireScope({ stationKey: "stationId", requireAny: true }),
  ownerTeamController.createStationTeamUser
);

router.patch(
  "/stations/:stationId/team/:userId",
  requireRole(STATION_EXEC_ROLES),
  requireScope({ stationKey: "stationId", requireAny: true }),
  ownerTeamController.updateStationTeamUser
);

router.patch(
  "/stations/:stationId/team/:userId/block",
  requireRole(STATION_EXEC_ROLES),
  requireScope({ stationKey: "stationId", requireAny: true }),
  ownerTeamController.setStationTeamUserBlocked
);

router.post(
  "/stations/:stationId/team/:userId/force-logout",
  requireRole(STATION_EXEC_ROLES),
  requireScope({ stationKey: "stationId", requireAny: true }),
  ownerTeamController.forceLogoutStationTeamUser
);

module.exports = router;
