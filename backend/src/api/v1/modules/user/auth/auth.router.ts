import express from "express";
import { protectConsumer } from "../../../middlewares";
import { otpRateLimiter } from "../../../middlewares/rate-limit";
import {
  requestOTPController,
  verifyOTPController,
  refreshController,
  getProfileController,
  logoutController,
  socialCallbackController,
} from "./auth.controller";
import passport from "passport";

const router = express.Router();

router.post("/request-otp", otpRateLimiter, requestOTPController);
router.post("/verify-otp", verifyOTPController);
router.post("/refresh", refreshController);
router.get("/profile", protectConsumer, getProfileController);
router.post("/logout", logoutController);

// Social Auth Routes
router.get("/google", passport.authenticate("google", { scope: ["profile", "email"] }));
router.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: "/login", session: false }),
  socialCallbackController
);

router.get("/facebook", passport.authenticate("facebook", { scope: ["email"] }));
router.get(
  "/facebook/callback",
  passport.authenticate("facebook", { failureRedirect: "/login", session: false }),
  socialCallbackController
);

export default router;
