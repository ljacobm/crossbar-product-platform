import assert from "node:assert/strict";
import { catalogCategoryGroupLabel } from "../lib/catalogCategoryGroups";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS: ${name}`);
  } catch (err) {
    console.error(`FAIL: ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

run("requirement -- merges Bags and Accessories into one customer-facing label", () => {
  assert.equal(catalogCategoryGroupLabel("Bags"), "Bags & Accessories");
  assert.equal(catalogCategoryGroupLabel("Accessories"), "Bags & Accessories");
});

run("requirement -- does not invent a split for ambiguous categories: Sweatshirts & Fleece passes through unchanged", () => {
  assert.equal(catalogCategoryGroupLabel("Sweatshirts & Fleece"), "Sweatshirts & Fleece");
});

run("an unrecognized/unknown raw category passes through unchanged rather than being dropped", () => {
  assert.equal(catalogCategoryGroupLabel("Some New Category"), "Some New Category");
});

run("every other known real category passes through unchanged", () => {
  for (const c of ["T-Shirts", "Activewear", "Outerwear", "Hats", "Polos", "Women's", "Infant & Toddler", "Button-Ups"]) {
    assert.equal(catalogCategoryGroupLabel(c), c);
  }
});
