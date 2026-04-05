import jwt from "jsonwebtoken";
import { ERROR_MESSAGES } from "../../../common/constants";
import type { VerifyOTPResult, AuthUser } from "./auth.types";
import type { User } from "../../../../../db/schema";
import { generateOTPCode, sendOTP } from "./auth.utils";
import { cleanPhoneNumber } from "../../../../../config/termi.config";
import {
  getOTPDataRepo,
  clearOTPRepo,
  incrementOTPAttemptsRepo,
  setUserStatusExpiredRepo,
  findByPhoneNumberRepo,
  findUserByIdRepo,
  saveOTPRepo,
  findByGoogleIdRepo,
  findByFacebookIdRepo,
  findByEmailRepo,
  createUserRepo,
  updateUserRepo,
} from "./auth.repository";
import { config } from "../../../../../config/env";
import { logger } from "../../../../../lib/logger";

// Maximum OTP attempts allowed
const MAX_OTP_ATTEMPTS = 3;
const OTP_EXPIRATION_MINUTES = 5;

/**
 * Convert User to AuthUser (public shape exposed to the frontend)
 */
function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    phoneNumber: user.phoneNumber,
    fullName: user.fullName,
    campaignId: user.campaignId,
    email: user.email,
    avatar: user.avatar,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

/**
 * Validate phone number format.
 * Accepts the same formats as cleanPhoneNumber:
 *   10 digits (e.g. "8012345678")
 *   11 digits starting with 0 (e.g. "08012345678")
 *   13 digits starting with 234 (e.g. "2348012345678")
 */
function validatePhoneNumber(phoneNumber: string): boolean {
  const cleaned = phoneNumber.replace(/\D/g, "");
  if (cleaned.length === 10) return true;
  if (cleaned.length === 11 && cleaned.startsWith("0")) return true;
  if (cleaned.length === 13 && cleaned.startsWith("234")) return true;
  return false;
}

/**
 * Request OTP - Production Level
 *
 * Flow:
 * 1. Validate phone number format
 * 2. Check if user exists
 * 3. Determine flow (login or register)
 * 4. Send OTP via SMS
 * 5. Save OTP to database
 *
 * Returns:
 * - flow: "login" (existing user) or "register" (new user)
 * - message: User-friendly message
 * - pinId: For tracking (optional)
 */
export async function requestOTPService(
  phoneNumber: string,
  fullName?: string,
) {
  try {
    // Step 1: Validate inputs
    if (!phoneNumber || phoneNumber.trim().length === 0) {
      logger.warn("Request OTP: Missing phone number");
      throw new Error(ERROR_MESSAGES.PHONE_NUMBER_REQUIRED);
    }

    if (!validatePhoneNumber(phoneNumber)) {
      logger.warn("Request OTP: Invalid phone number format", { phoneNumber });
      throw new Error(ERROR_MESSAGES.INVALID_PHONE_NUMBER);
    }

    // Step 2: Clean phone number
    let cleanPhone: string;
    try {
      cleanPhone = cleanPhoneNumber(phoneNumber);
    } catch (error) {
      logger.warn("Request OTP: Invalid phone number", { phoneNumber });
      throw new Error(ERROR_MESSAGES.INVALID_PHONE_NUMBER);
    }

    // Step 3: Check if user exists
    const existingUser = await findByPhoneNumberRepo(cleanPhone);

    // Step 4: Determine flow and validate
    if (existingUser && fullName && fullName.trim().length >= 2) {
      // User trying to register with existing number
      logger.info("Request OTP: User already exists", { phone: cleanPhone });
      return {
        message: "This phone number is already registered. Please login to continue.",
        flow: "login" as const,
      };
    }

    if (!existingUser && (!fullName || fullName.trim().length < 2)) {
      // New user without full name — redirect to register
      logger.warn("Request OTP: New user missing full name", { phone: cleanPhone });
      throw new Error(ERROR_MESSAGES.USER_NOT_FOUND_REGISTER_FIRST);
    }

    // Step 5: Generate OTP
    const code = generateOTPCode();

    // Step 6: Send OTP (with fallback for dev/test mode)
    let pinId = "TEST_PIN_" + Date.now();

    if (!config.otpTestMode) {
      const otpResult = await sendOTP(cleanPhone, code, "auth");

      if (!otpResult.success || !otpResult.pinId) {
        logger.error("Request OTP: Failed to send OTP", {
          phone: cleanPhone,
          error: otpResult.message
        });
        throw new Error("Failed to send code. Please check your phone number and try again.");
      }
      pinId = otpResult.pinId;
    } else {
      logger.debug("Request OTP: Using test mode OTP", { code });
    }

    // Step 7: Save OTP to database
    await saveOTPRepo(cleanPhone, code, pinId, OTP_EXPIRATION_MINUTES, fullName);

    logger.info("Request OTP: OTP sent successfully", {
      phone: cleanPhone,
      flow: existingUser ? "login" : "register",
      pinId,
    });

    return {
      message: `A 6-digit code has been sent to ${cleanPhone}. It will expire in ${OTP_EXPIRATION_MINUTES} minutes.`,
      flow: existingUser ? ("login" as const) : ("register" as const),
      pinId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : ERROR_MESSAGES.INTERNAL_ERROR;
    logger.error("Request OTP service error", { error: message });
    throw new Error(message);
  }
}

/**
 * Verify OTP - Production Level
 *
 * Flow:
 * 1. Validate inputs
 * 2. Get OTP from database
 * 3. Check expiration (real-time)
 * 4. Check attempts
 * 5. Verify code matches
 * 6. Clear OTP and create JWT tokens
 *
 * Returns:
 * - accessToken: JWT for API requests (15 min expiry)
 * - refreshToken: JWT for token refresh (7 day expiry)
 * - user: AuthUser object
 */
export async function verifyOTPService(
  phoneNumber: string | undefined,
  code: string | undefined,
): Promise<VerifyOTPResult> {
  try {
    // Step 1: Validate inputs
    if (!phoneNumber || phoneNumber.trim().length === 0) {
      logger.warn("Verify OTP: Missing phone number");
      throw new Error(ERROR_MESSAGES.PHONE_NUMBER_REQUIRED);
    }

    if (!code || code.trim().length === 0) {
      logger.warn("Verify OTP: Missing OTP code");
      throw new Error(ERROR_MESSAGES.OTP_CODE_REQUIRED);
    }

    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      logger.warn("Verify OTP: Invalid OTP format", { code });
      throw new Error(ERROR_MESSAGES.OTP_CODE_REQUIRED);
    }

    // Step 2: Clean phone number
    let cleanPhone: string;
    try {
      cleanPhone = cleanPhoneNumber(phoneNumber);
    } catch (error) {
      logger.warn("Verify OTP: Invalid phone number", { phoneNumber });
      throw new Error(ERROR_MESSAGES.INVALID_PHONE_NUMBER);
    }

    // Step 3: Get OTP data from database
    const otpData = await getOTPDataRepo(cleanPhone);
    const { user, otpCode, otpExpiresAt, otpAttempts } = otpData;

    // Step 4: Validate user exists
    if (!user) {
      logger.warn("Verify OTP: User not found", { phone: cleanPhone });
      throw new Error(ERROR_MESSAGES.USER_NOT_FOUND_REGISTER_FIRST);
    }

    // Step 5: Check if OTP record exists
    if (!otpCode || !otpExpiresAt) {
      logger.warn("Verify OTP: No OTP record found", { userId: user.id });
      throw new Error(ERROR_MESSAGES.OTP_EXPIRED);
    }

    // Step 6: Check if OTP is expired (real-time validation)
    const now = new Date();
    if (now > otpExpiresAt) {
      logger.warn("Verify OTP: OTP expired", { userId: user.id });
      await setUserStatusExpiredRepo(cleanPhone);
      throw new Error(ERROR_MESSAGES.OTP_EXPIRED);
    }

    // Step 7: Check attempts limit
    if (otpAttempts >= MAX_OTP_ATTEMPTS) {
      logger.warn("Verify OTP: Max attempts exceeded", { userId: user.id, attempts: otpAttempts });
      await setUserStatusExpiredRepo(cleanPhone);
      throw new Error(ERROR_MESSAGES.OTP_ATTEMPTS_EXCEEDED);
    }

    // Step 8: Verify code matches
    if (otpCode !== code.trim()) {
      logger.warn("Verify OTP: Code mismatch", {
        userId: user.id,
        attempts: otpAttempts + 1
      });
      await incrementOTPAttemptsRepo(cleanPhone);

      const remaining = MAX_OTP_ATTEMPTS - (otpAttempts + 1);
      if (remaining > 0) {
        throw new Error(`${ERROR_MESSAGES.INVALID_OTP} ${remaining} attempts remaining.`);
      } else {
        throw new Error(ERROR_MESSAGES.OTP_ATTEMPTS_EXCEEDED);
      }
    }

    // Step 9: Clear OTP after successful verification
    await clearOTPRepo(cleanPhone);

    // Step 10: Generate JWT tokens
    const accessToken = jwt.sign(
      {
        id: user.id,
        phoneNumber: user.phoneNumber,
        type: "access"
      },
      config.jwt.consumerSecret,
      { expiresIn: "15m" },
    );

    const refreshToken = jwt.sign(
      {
        id: user.id,
        type: "refresh"
      },
      config.jwt.consumerRefreshSecret,
      { expiresIn: "7d" },
    );

    logger.info("Verify OTP: Successful verification", {
      userId: user.id,
      phone: cleanPhone,
    });

    return {
      accessToken,
      refreshToken,
      user: toAuthUser(user),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : ERROR_MESSAGES.INTERNAL_ERROR;
    logger.error("Verify OTP service error", { error: message });
    throw new Error(message);
  }
}

/**
 * Get user profile
 */
export function getProfileService(user: User): { user: AuthUser } {
  return { user: toAuthUser(user) };
}

/**
 * Refresh user tokens - Production Level
 *
 * Validates refresh token and issues new access + refresh tokens
 */
export async function refreshUserTokensService(refreshToken: string) {
  try {
    if (!refreshToken || refreshToken.trim().length === 0) {
      logger.warn("Refresh tokens: Missing refresh token");
      throw new Error(ERROR_MESSAGES.INVALID_TOKEN);
    }

    let decoded: any;
    try {
      decoded = jwt.verify(
        refreshToken,
        config.jwt.consumerRefreshSecret,
      ) as {
        id: string;
        type?: string;
      };
    } catch (error) {
      const jwtError = error as any;
      if (jwtError.name === "TokenExpiredError") {
        logger.warn("Refresh tokens: Token expired");
        throw new Error(ERROR_MESSAGES.INVALID_TOKEN);
      } else {
        logger.warn("Refresh tokens: Invalid token");
        throw new Error(ERROR_MESSAGES.INVALID_TOKEN);
      }
    }

    // Validate token type
    if (decoded.type !== "refresh") {
      logger.warn("Refresh tokens: Invalid token type", { type: decoded.type });
      throw new Error(ERROR_MESSAGES.INVALID_TOKEN);
    }

    // Get user
    const user = await findUserByIdRepo(decoded.id);
    if (!user) {
      logger.warn("Refresh tokens: User not found", { userId: decoded.id });
      throw new Error(ERROR_MESSAGES.UNAUTHORIZED);
    }

    // Generate new tokens
    const accessToken = jwt.sign(
      {
        id: user.id,
        phoneNumber: user.phoneNumber,
        type: "access"
      },
      config.jwt.consumerSecret,
      { expiresIn: "15m" },
    );

    const newRefreshToken = jwt.sign(
      {
        id: user.id,
        type: "refresh"
      },
      config.jwt.consumerRefreshSecret,
      { expiresIn: "7d" },
    );

    logger.info("Refresh tokens: Tokens refreshed successfully", { userId: user.id });

    return {
      accessToken,
      refreshToken: newRefreshToken,
      user: toAuthUser(user),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : ERROR_MESSAGES.INTERNAL_ERROR;
    logger.error("Refresh tokens service error", { error: message });
    throw new Error(message);
  }
}

/**
 * Handle social login (Google/Facebook)
 */
export async function handleSocialLoginService(data: {
  email: string;
  fullName: string;
  avatar?: string;
  googleId?: string;
  facebookId?: string;
}) {
  try {
    // 1. Find existing user by ID or Email
    let user = data.googleId 
      ? await findByGoogleIdRepo(data.googleId) 
      : data.facebookId 
        ? await findByFacebookIdRepo(data.facebookId)
        : null;

    if (!user && data.email) {
      user = await findByEmailRepo(data.email);
    }

    // 2. Create user if they don't exist
    if (!user) {
      user = await createUserRepo({
        email: data.email,
        fullName: data.fullName,
        avatar: data.avatar,
        googleId: data.googleId,
        facebookId: data.facebookId,
        status: "verified", // Social login users are auto-verified
      });
      logger.info("Social Login: New user created", { userId: user.id });
    } else {
      // Update existing user's social IDs if they were missing
      if (data.googleId && !user.googleId) {
        await updateUserRepo(user.id, { googleId: data.googleId });
      }
      if (data.facebookId && !user.facebookId) {
        await updateUserRepo(user.id, { facebookId: data.facebookId });
      }
      logger.info("Social Login: User logged in", { userId: user.id });
    }

    // 3. Generate JWT tokens
    const accessToken = jwt.sign(
      { id: user.id, type: "access" },
      config.jwt.consumerSecret,
      { expiresIn: "15m" }
    );

    const refreshToken = jwt.sign(
      { id: user.id, type: "refresh" },
      config.jwt.consumerRefreshSecret,
      { expiresIn: "7d" }
    );

    return {
      accessToken,
      refreshToken,
      user: toAuthUser(user),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : ERROR_MESSAGES.INTERNAL_ERROR;
    logger.error("Social login service error", { error: message });
    throw new Error(message);
  }
}
