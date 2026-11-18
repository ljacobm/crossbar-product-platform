// crossbar_category is already a Crossbar-curated, reasonably
// customer-friendly field (confirmed against live MAIN data: 11
// distinct values across the 454 approved styles -- "T-Shirts",
// "Sweatshirts & Fleece", "Activewear", "Outerwear", "Hats", "Polos",
// "Bags", "Accessories", "Women's", "Infant & Toddler", "Button-Ups").
// The ONE safe, explicitly-requested merge is combining the two small,
// overlapping raw categories "Bags" and "Accessories" into a single
// "Bags & Accessories" filter option -- named verbatim in the task's
// own example category list.
//
// No other raw category is split or merged. In particular,
// "Sweatshirts & Fleece" is NOT split into separate "Sweatshirts" and
// "Hoodies" options (also suggested by the task), because
// crossbar_category is the ONLY category field in the schema -- there
// is no secondary field that distinguishes a hoodie from a crewneck
// sweatshirt. Splitting it would mean guessing from product names,
// which risks silently excluding a product from whichever half of the
// split it was guessed into wrong. Same reasoning for leaving
// "Outerwear" unsplit rather than relabeling it "Jackets" (Outerwear
// may legitimately include non-jacket items).
const CATEGORY_GROUP_LABELS: Record<string, string> = {
  Bags: "Bags & Accessories",
  Accessories: "Bags & Accessories",
};

export function catalogCategoryGroupLabel(rawCategory: string): string {
  return CATEGORY_GROUP_LABELS[rawCategory] ?? rawCategory;
}
