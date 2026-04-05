import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  integer,
} from "drizzle-orm/pg-core";
import { campaigns } from "./campaigns";

export const USER_STATUS = {
  PENDING: "pending",
  VERIFIED: "verified",
  EXPIRED: "expired",
} as const;

export type UserStatus = (typeof USER_STATUS)[keyof typeof USER_STATUS];

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  phoneNumber: varchar("phone_number", { length: 20 }).unique(),
  email: varchar("email", { length: 255 }).unique(),
  googleId: varchar("google_id", { length: 255 }).unique(),
  facebookId: varchar("facebook_id", { length: 255 }).unique(),
  avatar: varchar("avatar", { length: 500 }),
  campaignId: uuid("campaign_id").references(() => campaigns.id),
  fullName: varchar("fullName", { length: 255 }),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const user_otp = pgTable("usersOtp", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id),
  otpCode: varchar("otp_code", { length: 6 }),
  otpExpiresAt: timestamp("otp_expires_at"),
  otpPinId: varchar("otp_pin_id", { length: 255 }),
  otpAttempts: integer("otp_attempts").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
