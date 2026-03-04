const express = require("express");
const auth = require("../middleware/auth");
const { requireRole, requireScope } = require("../middleware/authorize");
const queueController = require("../controllers/queueController");

const router = express.Router();
const STAFF_OPERATION_ROLES = ["staff", "station_manager", "city_manager", "org_admin", "super_admin"];

router.post("/reserve", auth, queueController.reserveQueueSlot);
router.post("/payments/telebirr/auth-token", auth, queueController.exchangeTelebirrAuthToken);
router.post("/payments/telebirr/initiate", auth, queueController.startTelebirrCheckout);
router.post("/payments/telebirr/webhook", queueController.handleTelebirrWebhook);
router.get("/reservation/:reservationId", auth, queueController.getMyReservationStatus);
router.post("/confirm-payment", auth, queueController.confirmReservationPayment);
router.post("/join", auth, queueController.joinQueue);
router.get("/me/:stationId", auth, queueController.getMyTicket);
router.post("/leave", auth, queueController.leaveQueue);
router.post("/check-in/start", auth, queueController.startCheckIn);
router.post("/check-in/verify", auth, requireRole(STAFF_OPERATION_ROLES), queueController.verifyCheckIn);
router.post("/validate-id", auth, requireRole(STAFF_OPERATION_ROLES), queueController.validateReservationIdForStaff);
router.get("/station/:stationId", queueController.getStationQueue);
router.post(
  "/next",
  auth,
  requireRole(STAFF_OPERATION_ROLES),
  requireScope({ stationKey: "stationId", requireAny: true }),
  queueController.nextInQueue
);

module.exports = router;
