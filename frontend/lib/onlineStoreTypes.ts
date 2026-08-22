// Shared shape for online_stores rows. Kept in its own plain module (no
// "use server") because a "use server" file may only export async
// functions, not types -- see lib/onlineStoreData.ts.
export interface OnlineStore {
  id: number;
  name: string;
  slug: string | null;
  vendor_team_tag: string | null;
  active: boolean;
  fundraiser_rate: number;
  created_at: string;
  updated_at: string;
}
