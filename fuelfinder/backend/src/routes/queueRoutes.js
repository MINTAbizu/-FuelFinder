const express = require("express");
const auth = require("../middleware/auth");
const queueController = require("../controllers/queueController");

const router = express.Router();

router.post("/reserve", auth, queueController.reserveQueueSlot);
router.post("/confirm-payment", auth, queueController.confirmReservationPayment);
router.post("/join", auth, queueController.joinQueue);
router.get("/me/:stationId", auth, queueController.getMyTicket);
router.post("/leave", auth, queueController.leaveQueue);
router.get("/station/:stationId", queueController.getStationQueue);
router.post("/next", queueController.nextInQueue); // protect with staff/admin auth later

module.exports = router;
