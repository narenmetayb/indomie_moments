import { Request, Response } from "express";
import { config } from "../../../../../config/env";
import { HTTP_STATUS, ERROR_MESSAGES } from "../../../common/constants";
import {
  successResponse,
  errorResponse,
} from "../../../utils/responseFormatter";
import {
  requestOTPService,
  verifyOTPService,
  getProfileService,
  refreshUserTokensService,
} from "./auth.service";

export async function requestOTPController(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { phoneNumber, fullName } = req.body;
    const result = await requestOTPService(phoneNumber, fullName);
    successResponse(res, {
      flow: result.flow,
      message: result.message,
      pinId: result.pinId,
    });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : ERROR_MESSAGES.INTERNAL_ERROR;
    const isClientError =
      msg === ERROR_MESSAGES.INVALID_PHONE_NUMBER ||
      msg === ERROR_MESSAGES.PHONE_NUMBER_REQUIRED ||
      msg === ERROR_MESSAGES.FULL_NAME_REQUIRED ||
      msg === ERROR_MESSAGES.USER_NOT_FOUND_REGISTER_FIRST;
    errorResponse(res, msg, isClientError ? HTTP_STATUS.BAD_REQUEST : HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

export async function verifyOTPController(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { phoneNumber, code } = req.body;
    const result = await verifyOTPService(phoneNumber, code);
    const accessOpts = config.app.cookieOptions(config.isProduction, 15 * 60);
    const refreshOpts = config.app.refreshCookieOptions(config.isProduction);
    res.cookie(
      config.app.cookieNames.userAccess,
      result.accessToken,
      accessOpts,
    );
    res.cookie(
      config.app.cookieNames.userRefresh,
      result.refreshToken,
      refreshOpts,
    );
    successResponse(res, {
      message: "Login successful.",
      user: result.user,
    });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : ERROR_MESSAGES.INTERNAL_ERROR;
    // Match against ERROR_MESSAGES constants used by the service
    const isUnauthorized =
      msg === ERROR_MESSAGES.INVALID_OTP ||
      msg.startsWith(ERROR_MESSAGES.INVALID_OTP) ||
      msg === ERROR_MESSAGES.OTP_EXPIRED ||
      msg === ERROR_MESSAGES.OTP_CODE_REQUIRED ||
      msg === ERROR_MESSAGES.USER_NOT_FOUND_REGISTER_FIRST;
    const isForbidden = msg === ERROR_MESSAGES.OTP_ATTEMPTS_EXCEEDED;
    const isBadRequest =
      msg === ERROR_MESSAGES.PHONE_NUMBER_REQUIRED ||
      msg === ERROR_MESSAGES.INVALID_PHONE_NUMBER;
    const status = isForbidden
      ? HTTP_STATUS.FORBIDDEN
      : isBadRequest
        ? HTTP_STATUS.BAD_REQUEST
        : isUnauthorized
          ? HTTP_STATUS.UNAUTHORIZED
          : HTTP_STATUS.INTERNAL_SERVER_ERROR;
    errorResponse(res, msg, status);
  }
}

export async function getProfileController(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    if (!req.user) {
      errorResponse(res, ERROR_MESSAGES.UNAUTHORIZED, HTTP_STATUS.UNAUTHORIZED);
      return;
    }
    const result = getProfileService(req.user);
    successResponse(res, result);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : ERROR_MESSAGES.INTERNAL_ERROR;
    errorResponse(res, msg, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

export async function refreshController(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const refreshToken =
      req.cookies?.[config.app.cookieNames.userRefresh] ??
      req.header("X-Refresh-Token");
    if (!refreshToken) {
      errorResponse(
        res,
        ERROR_MESSAGES.ACCESS_DENIED_NO_TOKEN,
        HTTP_STATUS.UNAUTHORIZED,
      );
      return;
    }
    const result = await refreshUserTokensService(refreshToken);
    const accessOpts = config.app.cookieOptions(config.isProduction, 15 * 60);
    const refreshOpts = config.app.refreshCookieOptions(config.isProduction);
    res.cookie(
      config.app.cookieNames.userAccess,
      result.accessToken,
      accessOpts,
    );
    res.cookie(
      config.app.cookieNames.userRefresh,
      result.refreshToken,
      refreshOpts,
    );
    successResponse(res, { message: "Token refreshed successfully.", user: result.user });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : ERROR_MESSAGES.INTERNAL_ERROR;
    errorResponse(res, msg, HTTP_STATUS.UNAUTHORIZED);
  }
}

export function logoutController(_req: Request, res: Response): void {
  res.clearCookie(config.app.cookieNames.userAccess, { path: "/" });
  res.clearCookie(config.app.cookieNames.userRefresh, { path: "/" });
  successResponse(res, { message: "Logged out successfully." });
}

/**
 * Handle success callback from Google/Facebook
 */
export async function socialCallbackController(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const result = req.user as any; 
    if (!result || !result.accessToken) {
      res.redirect(`${config.app.frontendBaseUrl}/login?error=auth_failed`);
      return;
    }

    const accessOpts = config.app.cookieOptions(config.isProduction, 15 * 60);
    const refreshOpts = config.app.refreshCookieOptions(config.isProduction);
    
    res.cookie(config.app.cookieNames.userAccess, result.accessToken, accessOpts);
    res.cookie(config.app.cookieNames.userRefresh, result.refreshToken, refreshOpts);

    // Redirect to frontend home page
    res.redirect(`${config.app.frontendBaseUrl}/?social=success`);
  } catch (err) {
    res.redirect(`${config.app.frontendBaseUrl}/login?error=social_error`);
  }
}
