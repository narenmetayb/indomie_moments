export interface FormattedUser {
  id: string;
  phoneNumber: string | null;
  campaignId: string | null;
  createdAt: Date;
  campaign: { id: string; name: string } | null;
}
