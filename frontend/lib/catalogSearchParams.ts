import type { CatalogSortOption } from "@/lib/onlineStoreCatalogTypes";
import type { CatalogWorkspaceFilters } from "@/lib/onlineStoreCatalogCustomerData";

// Shared by the customer catalog page and the staff preview page so
// both parse the exact same URL shape into the exact same
// CatalogWorkspaceFilters -- "staff preview should show the same ...
// filtering experience as customers," not a second, independently
// drifting implementation of query-param parsing.
//
// Multi-select values are repeated query params (?category=A&category=B),
// which Next.js's searchParams gives back as a plain string when there's
// exactly one occurrence and a string[] when there's more than one --
// toArray() normalizes both (and "missing") into a single string[] shape.

export type CatalogRawSearchParams = {
  q?: string;
  category?: string | string[];
  brand?: string | string[];
  gender?: string | string[];
  ageGroup?: string | string[];
  sort?: string;
  page?: string;
};

export const VALID_CATALOG_SORTS: CatalogSortOption[] = ["name-asc", "brand-asc", "category-asc", "newest"];

export function toArray(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

export function parseCatalogSearchParams(
  sp: CatalogRawSearchParams,
  pageSize: number
): {
  filters: CatalogWorkspaceFilters;
  sort: CatalogSortOption;
  page: number;
  preservedParams: Record<string, string | string[] | undefined>;
} {
  const sort: CatalogSortOption = VALID_CATALOG_SORTS.includes(sp.sort as CatalogSortOption)
    ? (sp.sort as CatalogSortOption)
    : "name-asc";
  const page = Math.max(1, parseInt(sp.page || "1", 10) || 1);

  const categories = toArray(sp.category);
  const brands = toArray(sp.brand);
  const genders = toArray(sp.gender);
  const ageGroups = toArray(sp.ageGroup);

  return {
    filters: {
      query: sp.q,
      categories,
      brands,
      genders,
      ageGroups,
      sort,
      page,
      pageSize,
    },
    sort,
    page,
    preservedParams: {
      q: sp.q || undefined,
      category: categories.length > 0 ? categories : undefined,
      brand: brands.length > 0 ? brands : undefined,
      gender: genders.length > 0 ? genders : undefined,
      ageGroup: ageGroups.length > 0 ? ageGroups : undefined,
      sort: sort !== "name-asc" ? sort : undefined,
    },
  };
}
