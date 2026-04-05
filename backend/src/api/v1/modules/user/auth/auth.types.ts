export interface AuthUser {
  id: string;
  phoneNumber?: string | null;
  email?: string | null;
  avatar?: string | null;
  fullName?: string | null;
  campaignId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RequestOTPResult {
  message: string;
  pinId?: string;
  flow?: "login" | "register";
}

export interface VerifyOTPResult {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}
