import crypto from "crypto";
import { axiosPost } from "../../../utils/axiosUtils";
import {
  termiConfig,
  cleanPhoneNumber,
  type TermiiTokenRequest,
  type TermiiTokenResponse,
} from "../../../../../config/termi.config";
import { config } from "../../../../../config/env";
import { logger } from "../../../../../lib/logger";

export interface SendOTPResult {
  success: boolean;
  pinId?: string;
  message?: string;
  smsResponse?: {
    verification_type: string;
    status: string;
    response_code: string[];
    response_message: string;
  };
}

/**
 * Generate a 6-digit numeric OTP code (cryptographically secure)
 */
export function generateOTPCode(): string {
  return crypto.randomInt(100000, 999999).toString();
}

/**
 * Send mock SMS in development mode
 */
function sendMockSMS(phoneNumber: string, code: string): boolean {
  logger.debug(`[MOCK SMS] Sending OTP ${code} to ${phoneNumber}`);
  return true;
}

// ============================================================
// Nigerian Network Prefix Tables (without leading "234")
// ============================================================
const MTN_PREFIXES = new Set([
  '816','814','7026','7025','916','810','913','903',
  '706','806','803','707','704','813','906','703'
]);
const AIRTEL_PREFIXES = new Set([
  '912','907','808','902','708','904','802','701','901','812'
]);
const GLO_PREFIXES = new Set([
  '805','905','807','811','815','915','705'
]);
const ETISALAT_PREFIXES = new Set([
  '809','909','908','817','818'
]);

function detectNetwork(phone: string) {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = '234' + digits.slice(1);
  if (!digits.startsWith('234')) digits = '234' + digits;
  
  const local = digits.slice(3);
  const p4 = local.slice(0, 4);
  const p3 = local.slice(0, 3);
  
  if (MTN_PREFIXES.has(p4) || MTN_PREFIXES.has(p3)) return 'MTN';
  if (AIRTEL_PREFIXES.has(p4) || AIRTEL_PREFIXES.has(p3)) return 'AIRTEL';
  if (GLO_PREFIXES.has(p4) || GLO_PREFIXES.has(p3)) return 'GLO';
  if (ETISALAT_PREFIXES.has(p4) || ETISALAT_PREFIXES.has(p3)) return 'ETISALAT';
  
  return 'UNKNOWN';
}

function getSenderId(network: string) {
  return network === 'AIRTEL' ? 'OFFBIGTEL' : 'Bigture';
}

/**
 * Send OTP via Bigture SMS service
 */
async function sendBigtureOTP(
  phoneNumber: string,
  code: string,
  smsType: string = "generic",
): Promise<SendOTPResult> {
  const cleanPhone = cleanPhoneNumber(phoneNumber);
  const network = detectNetwork(cleanPhone);
  const senderId = getSenderId(network);

  const payload = {
    systemId: config.bigture.systemId,
    destinationMsisdn: cleanPhone,
    sender_id: senderId,
    messageContent: `Your Indomie verification code is < ${code} >. Valid for 5 minutes.`,
    template_slug: 'Otp_verification',
    template_vars: {
      code: code,
      minutes: '5',
      company_name: 'Indomie Nigeria',
    }
  };

  const result = await axiosPost<any>(
    `${config.bigture.baseUrl}/api/sms/send`,
    payload,
    {
      headers: {
        'Authorization': `Bearer ${config.bigture.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      timeout: 20000,
    }
  );

  logger.info("OTP sent successfully via Bigture", {
    phone: cleanPhone,
    network,
    senderId,
    bigtureResponse: result,
  });

  return {
    success: true,
    pinId: `BIGTURE_${Date.now()}`,
    message: "SMS - Sent successfully.",
    smsResponse: {
      verification_type: smsType === "generic" ? "SMS" : smsType,
      status: "Success",
      response_code: ["SMS_SUCCESS"],
      response_message: "SMS - Sent successfully.",
    }
  };
}

/**
 * Send OTP via Termi SMS service
 */
async function sendTermiiOTP(
  phoneNumber: string,
  code: string,
  smsType: string = "generic",
): Promise<SendOTPResult> {
  let smsResponse = {
    verification_type: smsType === "generic" ? "SMS" : smsType,
    status: "Fail",
    response_code: [] as string[],
    response_message: "",
  };

  try {
    // Clean phone number - remove + and ensure it starts with country code
    const cleanPhone = cleanPhoneNumber(phoneNumber);

    const tokenData: TermiiTokenRequest = {
      api_key: termiConfig.apiKey || "",
      pin_type: "NUMERIC",
      to: cleanPhone,
      from: termiConfig.senderId || "",
      channel: "dnd",
      pin_attempts: 10,
      pin_time_to_live: 5, // 5 minutes
      pin_length: 6,
      pin_placeholder: "< 123456 >",
      message_text: `Your Indomie verification code is < ${code} >. Valid for 5 minutes.`,
    };

    const result = await axiosPost<TermiiTokenResponse>(
      `${termiConfig.baseUrl}/api/sms/otp/send`,
      tokenData,
      {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        timeout: 15000, // 15 second timeout
      },
    );

    logger.debug("Termii OTP response", { status: result.status, smsStatus: result.smsStatus });

    // ✅ Case 1: SMS API worked
    if (result.status === "200" && result.smsStatus === "Message Sent") {
      logger.info("OTP sent successfully via Termii Token API", {
        pinId: result.pinId,
        phone: result.phone_number,
        status: result.smsStatus,
      });

      smsResponse.status = "Success";
      smsResponse.response_code.push("SMS_SUCCESS");
      smsResponse.response_message += "SMS - Sent successfully.";
      return {
        success: true,
        pinId: result.pinId,
        message: smsResponse.response_message,
        smsResponse,
      };
    }

    // ❌ Case 2: Termii API responded with error
    smsResponse.response_code.push(result?.status || "TERMII_API_ERROR");
    smsResponse.response_message += `SMS - ${result?.smsStatus || "API failed to send message."} `;

    smsResponse.status = "Fail";
    return {
      success: false,
      message:
        "Server not responding due to a network issue. Failed to send verification. Please try again later.",
      smsResponse,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("OTP sending error", { error: message, phone: phoneNumber });

    smsResponse.response_code.push("SMS_EXCEPTION");
    smsResponse.response_message += `SMS - ${message}. `;

    const { config } = await import("../../../../../config/env");
    if (config.isDevelopment) {
      logger.debug("Falling back to mock SMS in development mode");
      const mockSuccess = sendMockSMS(phoneNumber, code);
      return {
        success: mockSuccess,
        pinId: "MOCK_PIN_ID_" + Date.now(), // Mock pinId for development
        message: "Mock SMS sent (development mode)",
        smsResponse: {
          verification_type: smsType === "generic" ? "SMS" : smsType,
          status: "Success",
          response_code: ["MOCK"],
          response_message: "Mock SMS sent",
        },
      };
    }

    smsResponse.status = "Fail";
    return {
      success: false,
      message:
        "Server not responding due to a network issue. Failed to send verification. Please try again later.",
      smsResponse,
    };
  }
}

/**
 * Send OTP Main entry point (Primary: Bigture, Fallback: Termii)
 */
export async function sendOTP(
  phoneNumber: string,
  code: string,
  smsType: string = "generic",
): Promise<SendOTPResult> {
  try {
    logger.info("Attempting OTP via Bigture", { phone: phoneNumber });
    return await sendBigtureOTP(phoneNumber, code, smsType);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Bigture OTP failed, falling back to Termii", { error: message, phone: phoneNumber });
    // Fallback to Termii
    return await sendTermiiOTP(phoneNumber, code, smsType);
  }
}
