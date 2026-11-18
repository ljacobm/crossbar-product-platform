import assert from "node:assert/strict";
import { parseStyleCodeInput, matchStyleCodes } from "@/lib/approvedCatalogStyleImportLogic";

// Standalone verification for the Online Store Builder's bulk-import
// logic (task requirement 1). Run via `npx tsx
// scripts/verifyApprovedCatalogStyleImportLogic.ts` -- this repo has no
// test framework installed, see scripts/verifyPortalTokens.ts for the
// established pattern this follows.

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

run("parseStyleCodeInput trims whitespace around each code", () => {
  const { codes } = parseStyleCodeInput("  PC54  \n DT6000 \n");
  assert.deepEqual(codes, ["PC54", "DT6000"]);
});

run("parseStyleCodeInput splits on newlines, commas, and semicolons interchangeably", () => {
  const { codes } = parseStyleCodeInput("PC54,DT6000;ST350\nK500");
  assert.deepEqual(codes, ["PC54", "DT6000", "ST350", "K500"]);
});

run("parseStyleCodeInput deduplicates exact repeats, preserving first-seen order", () => {
  const { codes, duplicatesRemoved } = parseStyleCodeInput("PC54\nDT6000\nPC54\nPC54\nST350");
  assert.deepEqual(codes, ["PC54", "DT6000", "ST350"]);
  assert.deepEqual(duplicatesRemoved, ["PC54"]);
});

run("parseStyleCodeInput ignores blank lines/empty fragments", () => {
  const { codes } = parseStyleCodeInput("PC54\n\n\n,DT6000,,\n");
  assert.deepEqual(codes, ["PC54", "DT6000"]);
});

run("requirement -- keep numeric-looking codes as strings: a purely numeric code is never altered or reinterpreted", () => {
  const { codes } = parseStyleCodeInput("007\n1223\n0042");
  assert.deepEqual(codes, ["007", "1223", "0042"]);
  // Explicitly confirm the leading zero survives -- Number("007") would
  // have silently produced 7, losing it.
  assert.equal(codes[0], "007");
});

run("parseStyleCodeInput treats differently-cased codes as distinct (case-sensitive dedup)", () => {
  const { codes, duplicatesRemoved } = parseStyleCodeInput("pc54\nPC54");
  assert.deepEqual(codes, ["pc54", "PC54"]);
  assert.deepEqual(duplicatesRemoved, []);
});

run("matchStyleCodes matches exact style codes against the candidate map", () => {
  const candidates = new Map([["PC54", { supplierProductId: 1, supplierId: 9 }]]);
  const result = matchStyleCodes(["PC54"], candidates, new Set());
  assert.equal(result.matched.get("PC54")?.supplierProductId, 1);
  assert.deepEqual(result.unmatched, []);
});

run("requirement -- report unmatched styles: a code with no candidate is reported, never silently dropped or guessed", () => {
  const candidates = new Map([["PC54", { supplierProductId: 1, supplierId: 9 }]]);
  const result = matchStyleCodes(["PC54", "NOTREAL"], candidates, new Set());
  assert.deepEqual(result.unmatched, ["NOTREAL"]);
  assert.equal(result.matched.size, 1);
});

run("matchStyleCodes is case-sensitive -- a differently-cased candidate is NOT treated as a match", () => {
  const candidates = new Map([["PC54", { supplierProductId: 1, supplierId: 9 }]]);
  const result = matchStyleCodes(["pc54"], candidates, new Set());
  assert.deepEqual(result.unmatched, ["pc54"]);
});

run("matchStyleCodes separates already-approved matches from fresh ones", () => {
  const candidates = new Map([
    ["PC54", { supplierProductId: 1, supplierId: 9 }],
    ["DT6000", { supplierProductId: 2, supplierId: 9 }],
  ]);
  const result = matchStyleCodes(["PC54", "DT6000"], candidates, new Set([1]));
  assert.deepEqual(result.alreadyApproved, ["PC54"]);
  assert.equal(result.matched.has("DT6000"), true);
  assert.equal(result.matched.has("PC54"), false);
});

run("matchStyleCodes with an empty candidate map reports everything as unmatched", () => {
  const result = matchStyleCodes(["PC54", "DT6000"], new Map(), new Set());
  assert.deepEqual(result.unmatched, ["PC54", "DT6000"]);
  assert.equal(result.matched.size, 0);
});
