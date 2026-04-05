import { eq, or } from "drizzle-orm";
import { db } from "../../../../../db";
import { user_otp, users } from "../../../../../db/schema";
import type { User } from "../../../../../db/schema";

/**
 * Find user by phone number
 */
export async function findByPhoneNumberRepo(
  phoneNumber: string,
): Promise<User | undefined> {
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.phoneNumber, phoneNumber))
    .limit(1);
  return row;
}

/**
 * Find user by id
 */
export async function findUserByIdRepo(id: string): Promise<User | undefined> {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row;
}

/**
 * Save OTP to separate user_otp table
 * Creates user if doesn't exist, then creates/updates OTP record
 */
export async function saveOTPRepo(
  phoneNumber: string,
  code: string,
  pinId: string,
  expiresInMinutes: number = 5,
  fullName?: string,
): Promise<void> {
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + expiresInMinutes);

  // Check if user exists
  let existingUser = await findByPhoneNumberRepo(phoneNumber);

  if (!existingUser) {
    // Create new user if doesn't exist
    const newUser = await db
      .insert(users)
      .values({
        phoneNumber,
        fullName: fullName?.trim() || null,
        status: "pending",
      })
      .returning();
    
    existingUser = newUser[0];
  } else {
    // Update existing user status (and fullName if provided) in a single query
    const updateFields: Record<string, unknown> = {
      status: "pending",
      updatedAt: new Date(),
    };
    if (fullName?.trim()) {
      updateFields.fullName = fullName.trim();
    }
    await db
      .update(users)
      .set(updateFields)
      .where(eq(users.phoneNumber, phoneNumber));
  }

  // Check if OTP record exists for this user
  const [existingOTP] = await db
    .select()
    .from(user_otp)
    .where(eq(user_otp.userId, existingUser.id))
    .limit(1);

  if (existingOTP) {
    // Update existing OTP record
    await db
      .update(user_otp)
      .set({
        otpCode: code,
        otpExpiresAt: expiresAt,
        otpPinId: pinId,
        otpAttempts: 0,
        updatedAt: new Date(),
      })
      .where(eq(user_otp.userId, existingUser.id));
  } else {
    // Create new OTP record
    await db.insert(user_otp).values({
      userId: existingUser.id,
      otpCode: code,
      otpExpiresAt: expiresAt,
      otpPinId: pinId,
      otpAttempts: 0,
    });
  }
}

/**
 * Get OTP data for a phone number
 * Joins users and user_otp tables
 */
export async function getOTPDataRepo(phoneNumber: string): Promise<{
  user: User | undefined;
  otpCode: string | null;
  otpExpiresAt: Date | null;
  otpAttempts: number;
}> {
  const user = await findByPhoneNumberRepo(phoneNumber);

  if (!user) {
    return {
      user: undefined,
      otpCode: null,
      otpExpiresAt: null,
      otpAttempts: 0,
    };
  }

  const [otpRecord] = await db
    .select()
    .from(user_otp)
    .where(eq(user_otp.userId, user.id))
    .limit(1);

  return {
    user,
    otpCode: otpRecord?.otpCode || null,
    otpExpiresAt: otpRecord?.otpExpiresAt || null,
    otpAttempts: otpRecord?.otpAttempts || 0,
  };
}

/**
 * Clear OTP fields and set user status to verified after successful verification
 */
export async function clearOTPRepo(phoneNumber: string): Promise<void> {
  const user = await findByPhoneNumberRepo(phoneNumber);

  if (!user) return;

  // Update user status
  await db
    .update(users)
    .set({
      status: "verified",
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));

  // Clear OTP record
  await db
    .update(user_otp)
    .set({
      otpCode: null,
      otpExpiresAt: null,
      otpPinId: null,
      otpAttempts: 0,
      updatedAt: new Date(),
    })
    .where(eq(user_otp.userId, user.id));
}

/**
 * Set user status to expired (wrong OTP or OTP time expired)
 */
export async function setUserStatusExpiredRepo(
  phoneNumber: string,
): Promise<void> {
  const user = await findByPhoneNumberRepo(phoneNumber);

  if (!user) return;

  await db
    .update(users)
    .set({ 
      status: "expired", 
      updatedAt: new Date() 
    })
    .where(eq(users.id, user.id));
}

/**
 * Increment OTP attempts on wrong OTP
 */
export async function incrementOTPAttemptsRepo(
  phoneNumber: string,
): Promise<void> {
  const user = await findByPhoneNumberRepo(phoneNumber);

  if (!user) return;

  // Only increment OTP attempts — do NOT change user status here.
  // Status is only set to "expired" by setUserStatusExpiredRepo when max attempts exceeded or OTP time expires.
  const [otpRecord] = await db
    .select()
    .from(user_otp)
    .where(eq(user_otp.userId, user.id))
    .limit(1);

  if (otpRecord) {
    await db
      .update(user_otp)
      .set({
        otpAttempts: (otpRecord.otpAttempts || 0) + 1,
        updatedAt: new Date(),
      })
      .where(eq(user_otp.userId, user.id));
  }
}

/**
 * Find user by google id
 */
export async function findByGoogleIdRepo(googleId: string): Promise<User | undefined> {
  const [row] = await db.select().from(users).where(eq(users.googleId, googleId)).limit(1);
  return row;
}

/**
 * Find user by facebook id
 */
export async function findByFacebookIdRepo(facebookId: string): Promise<User | undefined> {
  const [row] = await db.select().from(users).where(eq(users.facebookId, facebookId)).limit(1);
  return row;
}

/**
 * Find user by email
 */
export async function findByEmailRepo(email: string): Promise<User | undefined> {
  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return row;
}

/**
 * Create a new user (for social login)
 */
export async function createUserRepo(data: Partial<User>): Promise<User> {
  const [user] = await db.insert(users).values(data as any).returning();
  return user;
}

/**
 * Update user data
 */
export async function updateUserRepo(id: string, data: Partial<User>): Promise<User> {
  const [user] = await db.update(users).set(data as any).where(eq(users.id, id)).returning();
  return user;
}