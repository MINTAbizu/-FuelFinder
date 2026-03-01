const express = require("express");
const auth = require("../middleware/auth");
const queueController = require("../controllers/queueController");

const router = express.Router();

router.post("/reserve", auth, queueController.reserveQueueSlot);
router.post("/payments/telebirr/auth-token", auth, queueController.exchangeTelebirrAuthToken);
router.post("/payments/telebirr/initiate", auth, queueController.startTelebirrCheckout);
router.post("/payments/telebirr/webhook", queueController.handleTelebirrWebhook);
router.post("/confirm-payment", auth, queueController.confirmReservationPayment);
router.post("/join", auth, queueController.joinQueue);
router.get("/me/:stationId", auth, queueController.getMyTicket);
router.post("/leave", auth, queueController.leaveQueue);
router.get("/station/:stationId", queueController.getStationQueue);
router.post("/next", queueController.nextInQueue); // protect with staff/admin auth later

module.exports = router;
