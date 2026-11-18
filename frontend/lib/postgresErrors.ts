// Postgres error code 23505 = unique_violation. Extracted as its own
// tiny, pure function so the duplicate-submission race protection in
// lib/onlineStoreCatalogCustomerData.ts (catching a violation of
// online_store_catalog_submissions_one_active_per_store, see
// database/migrations/20261114_add_unique_active_catalog_submission_per_store.sql)
// is directly unit-testable without needing a real database connection.
export function isUniqueViolationError(error: { code?: string } | null | undefined): boolean {
  return error?.code === "23505";
}
