const express = require("express");
const router = express.Router();

const paymentController = require("../controllers/chapapayment.controller");

router.post("/initialize", paymentController.initialize);

router.post("/callback", paymentController.callback);
router.get("/callback", paymentController.callback);

router.get("/verify/:tx_ref", paymentController.verify);

module.exports = router;
