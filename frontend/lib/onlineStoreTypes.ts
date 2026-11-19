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
  // Creator 3.0, Phase 1 (Store Provisioning) -- additive intake/contact
  // fields, all nullable. See docs/creator3-phase1-store-provisioning.md.
  organization_type: string | null;
  sport: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
