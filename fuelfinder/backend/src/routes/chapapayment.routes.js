const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const paymentController = require("../controllers/chapapayment.controller");

router.post("/initialize", auth, paymentController.initialize);

router.post("/callback", paymentController.callback);
router.get("/callback", paymentController.callback);

router.get("/verify/:tx_ref", auth, paymentController.verify);

module.exports = router;
