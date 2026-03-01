const express = require("express");
const auth = require("../middleware/auth");
const authController = require("../controllers/authController");
const { authLimiter } = require("../middleware/rateLimiters");
const {
  validateRegister,
  validateLogin,
  validateRefresh
} = require("../middleware/validateAuth");

const router = express.Router();

router.post("/register", authLimiter, validateRegister, authController.register);
router.post("/login", authLimiter, validateLogin, authController.login);
router.post("/refresh", authLimiter, validateRefresh, authController.refresh);
router.post("/logout", auth, authController.logout);
router.get("/me", auth, authController.me);

module.exports = router;
