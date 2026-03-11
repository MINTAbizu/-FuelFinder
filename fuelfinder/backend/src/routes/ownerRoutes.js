const express = require("express");
const auth = require("../middleware/auth");
const { requireRole, requireScope } = require("../middleware/authorize");
const ownerStationController = require("../controllers/ownerStationController");

const router = express.Router();
const OWNER_ROLES = ["staff", "station_manager", "city_manager", "org_admin", "super_admin"];

router.use(auth, requireRole(OWNER_ROLES));

router.get("/stations", ownerStationController.listMyStations);

router.get(
  "/stations/:stationId",
  requireScope({ stationKey: "stationId", requireAny: true }),
  ownerStationController.getMyStation
);

module.exports = router;
