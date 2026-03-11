const express = require("express");
const auth = require("../middleware/auth");
const authController = require("../controllers/authController");
const { authLimiter } = require("../middleware/rateLimiters");
const {
  validateRegister,
  validateLogin,
  validateRefresh,
  validateBootstrapSuperAdmin,
  validatePhoneVerification,
  validatePhoneResend,
  validateGoogleAuth
} = require("../middleware/validateAuth");

const router = express.Router();

router.post("/register", authLimiter, validateRegister, authController.register);
router.post(
  "/bootstrap-super-admin",
  authLimiter,
  validateBootstrapSuperAdmin,
  authController.bootstrapSuperAdmin
);
router.post("/login", authLimiter, validateLogin, authController.login);
router.post("/refresh", authLimiter, validateRefresh, authController.refresh);
router.post("/google", authLimiter, validateGoogleAuth, authController.googleAuth);
router.post("/logout", auth, authController.logout);
router.get("/me", auth, authController.me);
router.post("/phone/verify", authLimiter, validatePhoneVerification, authController.verifyPhone);
router.post("/phone/resend", authLimiter, validatePhoneResend, authController.resendPhoneOtp);
router.post("/phone/dev-otp", authLimiter, validatePhoneResend, authController.devGetPhoneOtp);

module.exports = router;
