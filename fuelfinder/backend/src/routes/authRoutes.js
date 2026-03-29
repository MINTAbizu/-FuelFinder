const express = require("express");
const auth = require("../middleware/auth");
const authController = require("../controllers/authController");
const { authLimiter } = require("../middleware/rateLimiters");
const {
  validateRegister,
  validateLogin,
  validateRefresh,
  validateBootstrapSuperAdmin,
  validateBiometricLogin,
  validateBiometricRegister,
  validateChangePassword,
  validatePhoneVerification,
  validatePhoneResend,
  validateGoogleAuth,
  validateUpdateProfile
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
router.post("/biometric/login", authLimiter, validateBiometricLogin, authController.biometricLogin);
router.post("/logout", auth, authController.logout);
router.get("/me", auth, authController.me);
router.patch("/me", auth, validateUpdateProfile, authController.updateProfile);
router.post("/push-token", auth, authController.registerPushToken);
router.post("/push-token/remove", auth, authController.unregisterPushToken);
router.post("/change-password", auth, validateChangePassword, authController.changePassword);
router.post("/biometric/register", auth, validateBiometricRegister, authController.registerBiometricDevice);
router.post("/biometric/unregister", auth, validateBiometricRegister, authController.unregisterBiometricDevice);
router.post("/two-factor/start", auth, authController.startTwoFactor);
router.post("/two-factor/verify", authLimiter, validatePhoneVerification, authController.verifyTwoFactor);
router.post("/two-factor/resend", authLimiter, validatePhoneResend, authController.resendTwoFactorOtp);
router.post("/two-factor/disable", auth, authController.disableTwoFactor);
router.post("/phone/verify", authLimiter, validatePhoneVerification, authController.verifyPhone);
router.post("/phone/resend", authLimiter, validatePhoneResend, authController.resendPhoneOtp);
router.post("/phone/dev-otp", authLimiter, validatePhoneResend, authController.devGetPhoneOtp);

module.exports = router;
