import assert from "node:assert/strict";
import { computeCatalogDiff, catalogDiffIsEmpty } from "@/lib/onlineStoreCatalogDiffLogic";

// Standalone verification for the draft-vs-baseline diff logic behind
// "submit for review" (task requirement 5). Run via `npx tsx
// scripts/verifyOnlineStoreCatalogDiffLogic.ts`.

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

run("requirement -- track additions: a (style, color) in the draft but not the baseline is reported as added", () => {
  const diff = computeCatalogDiff(
    [{ approvedCatalogStyleId: 1, colorName: "Navy" }],
    []
  );
  assert.deepEqual(diff, [{ approvedCatalogStyleId: 1, colorName: "Navy", changeType: "added" }]);
});

run("requirement -- track removals: a (style, color) in the baseline but not the draft is reported as removed", () => {
  const diff = computeCatalogDiff(
    [],
    [{ approvedCatalogStyleId: 1, colorName: "Navy" }]
  );
  assert.deepEqual(diff, [{ approvedCatalogStyleId: 1, colorName: "Navy", changeType: "removed" }]);
});

run("requirement -- track color changes as a removed+added pair, not a third change type", () => {
  const diff = computeCatalogDiff(
    [{ approvedCatalogStyleId: 1, colorName: "Black" }],
    [{ approvedCatalogStyleId: 1, colorName: "Navy" }]
  );
  assert.equal(diff.length, 2);
  assert.ok(diff.some((d) => d.changeType === "removed" && d.colorName === "Navy"));
  assert.ok(diff.some((d) => d.changeType === "added" && d.colorName === "Black"));
});

run("computeCatalogDiff reports nothing for items present identically in both sets", () => {
  const shared = { approvedCatalogStyleId: 1, colorName: "Navy" };
  const diff = computeCatalogDiff([shared], [shared]);
  assert.deepEqual(diff, []);
});

run("computeCatalogDiff distinguishes by style id, not color alone (same color, different style)", () => {
  const diff = computeCatalogDiff(
    [{ approvedCatalogStyleId: 2, colorName: "Navy" }],
    [{ approvedCatalogStyleId: 1, colorName: "Navy" }]
  );
  assert.equal(diff.length, 2);
});

run("computeCatalogDiff is order-independent (same sets, different array order)", () => {
  const a = { approvedCatalogStyleId: 1, colorName: "Navy" };
  const b = { approvedCatalogStyleId: 2, colorName: "Black" };
  const diff1 = computeCatalogDiff([a, b], [a, b]);
  const diff2 = computeCatalogDiff([b, a], [a, b]);
  assert.deepEqual(diff1, []);
  assert.deepEqual(diff2, []);
});

run("catalogDiffIsEmpty is true for identical sets", () => {
  const shared = { approvedCatalogStyleId: 1, colorName: "Navy" };
  assert.equal(catalogDiffIsEmpty([shared], [shared]), true);
});

run("requirement -- refuse an empty submission: catalogDiffIsEmpty is false when anything differs", () => {
  assert.equal(
    catalogDiffIsEmpty([{ approvedCatalogStyleId: 1, colorName: "Navy" }], []),
    false
  );
});

run("computeCatalogDiff handles multiple colors for the same style independently", () => {
  const diff = computeCatalogDiff(
    [
      { approvedCatalogStyleId: 1, colorName: "Navy" },
      { approvedCatalogStyleId: 1, colorName: "Black" },
    ],
    [{ approvedCatalogStyleId: 1, colorName: "Navy" }]
  );
  assert.deepEqual(diff, [{ approvedCatalogStyleId: 1, colorName: "Black", changeType: "added" }]);
});
