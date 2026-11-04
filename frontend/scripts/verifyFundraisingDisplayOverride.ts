import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isFundraisingHiddenForStore } from "@/lib/fundraisingDisplayOverrides";

// TEMPORARY LVC Coaches fundraising-card override: exercises
// isFundraisingHiddenForStore() directly (real, executable tests), plus
// structural checks confirming SalesSummaryCards actually hides/keeps
// the right cards, both pages wire the flag through correctly, and the
// customer portal never exposes the underlying store slug.
//
// Run via `npx tsx scripts/verifyFundraisingDisplayOverride.ts`.

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

function readSource(relativePath: string): string {
  return readFileSync(resolve(__dirname, "..", relativePath), "utf8");
}

function stripLineComments(source: string): string {
  return source
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

// --- isFundraisingHiddenForStore: real, executable ------------------------

run("LVC Coaches' slug (lvc-coaches) is hidden", () => {
  assert.equal(isFundraisingHiddenForStore("lvc-coaches"), true);
});

run("matching is case-insensitive and tolerates surrounding whitespace", () => {
  assert.equal(isFundraisingHiddenForStore("LVC-Coaches"), true);
  assert.equal(isFundraisingHiddenForStore("  lvc-coaches  "), true);
});

run("every other store's slug is NOT hidden", () => {
  assert.equal(isFundraisingHiddenForStore("north-cheektowaga-aaa"), false);
  assert.equal(isFundraisingHiddenForStore("some-other-team"), false);
  assert.equal(isFundraisingHiddenForStore("lvc-coaches-jv"), false); // similar but not exact
});

run("null/undefined/empty slug is never hidden", () => {
  assert.equal(isFundraisingHiddenForStore(null), false);
  assert.equal(isFundraisingHiddenForStore(undefined), false);
  assert.equal(isFundraisingHiddenForStore(""), false);
});

// --- SalesSummaryCards structural checks -----------------------------------

// Finds every "<StatCard" occurrence and checks whether the text
// immediately preceding it (within a short window -- just enough for
// "{!hideFundraisingCards && (" plus whitespace, never spanning back to
// an earlier, already-closed card) contains the guard.
function findGuardedStatCards(source: string): { title: string; guarded: boolean }[] {
  const results: { title: string; guarded: boolean }[] = [];
  const statCardRegex = /<StatCard/g;
  let match: RegExpExecArray | null;
  while ((match = statCardRegex.exec(source)) !== null) {
    const start = match.index;
    const preceding = source.slice(Math.max(0, start - 40), start);
    const guarded = preceding.includes("{!hideFundraisingCards && (");
    const titleMatch = source.slice(start, start + 200).match(/title=\{?[`"]([^`"]+)/);
    results.push({ title: titleMatch ? titleMatch[1] : "(unknown)", guarded });
  }
  return results;
}

run("SalesSummaryCards hides exactly the three fundraiser cards when hideFundraisingCards is true, keeps the rest unconditional", () => {
  const source = readSource("components/SalesSummaryCards.tsx");
  const cards = findGuardedStatCards(source);
  assert.equal(cards.length, 6, "expected exactly 6 StatCard elements");

  const guardedTitles = cards.filter((c) => c.guarded).map((c) => c.title.replace(/\s*\(\$\{rangeLabel\}\)/, ""));
  const unguardedTitles = cards.filter((c) => !c.guarded).map((c) => c.title.replace(/\s*\(\$\{rangeLabel\}\)/, ""));

  assert.deepEqual(
    new Set(guardedTitles),
    new Set(["Fundraiser Earned", "Lifetime Paid Out", "Lifetime Balance Due"])
  );
  assert.deepEqual(
    new Set(unguardedTitles),
    new Set(["Total Sales", "Total Items", "Total Discounts"])
  );
});

run("hideFundraisingCards defaults to false on SalesSummaryCards", () => {
  const source = readSource("components/SalesSummaryCards.tsx");
  assert.ok(/hideFundraisingCards\s*=\s*false/.test(source));
});

// --- Grid width: 3 cards get a 3-column desktop grid, 6 cards get a -------
// --- 6-column one, both never cramped at the narrow end of "desktop" -------

run("the grid uses 3 desktop columns when fundraising cards are hidden, 6 when they are not", () => {
  const source = readSource("components/SalesSummaryCards.tsx");
  const condMatch = source.match(/const gridClassName = hideFundraisingCards\s*\n\s*\?\s*"([^"]+)"\s*\n\s*:\s*"([^"]+)";/);
  assert.ok(condMatch, "expected to find the conditional gridClassName assignment");
  const [, hiddenClassName, shownClassName] = condMatch;

  assert.ok(hiddenClassName.includes("md:grid-cols-3"), "the 3-card grid must reach 3 columns");
  assert.equal(/grid-cols-6/.test(hiddenClassName), false, "the 3-card grid must never go to 6 columns");

  assert.ok(shownClassName.includes("xl:grid-cols-6"), "the 6-card grid must reach 6 columns");
});

run("the 6-card grid waits until xl (not the narrower lg) to go to 6 columns, so currency values stay comfortable", () => {
  const source = readSource("components/SalesSummaryCards.tsx");
  assert.equal(source.includes("lg:grid-cols-6"), false, "6 columns must not kick in as early as lg");
  assert.ok(source.includes("xl:grid-cols-6"));
});

run("StatCard itself (shared by unrelated dashboards) is untouched by this layout change", () => {
  const source = readSource("components/StatCard.tsx");
  assert.equal(/grid-cols/.test(source), false, "StatCard must not contain any grid-column class");
  assert.equal(source.includes("text-2xl"), false, "StatCard's value text size must be unchanged");
});

// --- Wiring: staff page -----------------------------------------------------

run("the internal staff Sales page computes hideFundraisingCards from the store's slug via isFundraisingHiddenForStore", () => {
  const source = stripLineComments(readSource("app/(internal)/stores/[storeId]/sales/page.tsx"));
  assert.ok(source.includes('import { isFundraisingHiddenForStore } from "@/lib/fundraisingDisplayOverrides"'));
  assert.ok(source.includes("hideFundraisingCards={isFundraisingHiddenForStore(store.slug)}"));
});

// --- Wiring: customer portal -------------------------------------------------

run("getStoreNameAndRate computes hideFundraisingCards server-side and getCustomerPortalData forwards only the boolean", () => {
  const source = stripLineComments(readSource("lib/customerPortalSalesData.ts"));
  assert.ok(source.includes("isFundraisingHiddenForStore(data.slug)"));
  assert.ok(source.includes("hideFundraisingCards: store.hideFundraisingCards,"));
});

run("CustomerPortalData never exposes the store's slug itself -- only the derived hideFundraisingCards boolean", () => {
  const source = readSource("lib/customerPortalSalesData.ts");
  const typeMatch = source.match(/export type CustomerPortalData = \{([\s\S]*?)\n\};/);
  assert.ok(typeMatch, "expected to find the CustomerPortalData type definition");
  assert.ok(/\bhideFundraisingCards\s*:\s*boolean/.test(typeMatch![1]));
  assert.equal(/\bslug\s*:/.test(typeMatch![1]), false, "CustomerPortalData must not declare a slug field");

  // Nothing in this file returns the raw slug string anywhere as data --
  // the only place "slug" appears at all is the select list and the
  // isFundraisingHiddenForStore() call that consumes it immediately.
  const selectIndex = source.indexOf('.select("name, fundraiser_rate, slug")');
  assert.ok(selectIndex !== -1, "expected the extended select including slug");
  const returnMatch = source.match(/return \{\s*name: data\.name,[\s\S]*?\n  \};/);
  assert.ok(returnMatch, "expected getStoreNameAndRate's return object");
  assert.equal(/\bdata\.slug\b/.test(returnMatch![0].replace(/isFundraisingHiddenForStore\(data\.slug\)/, "")), false, "slug must only be read inside isFundraisingHiddenForStore(), never returned as its own field");
});

run("the customer portal page destructures and forwards hideFundraisingCards to SalesSummaryCards", () => {
  const source = stripLineComments(readSource("app/portal/[token]/page.tsx"));
  assert.ok(source.includes("hideFundraisingCards"));
  assert.ok(source.includes("hideFundraisingCards={hideFundraisingCards}"));
});

// --- Safeguards: nothing else changed ---------------------------------------

run("isFundraisingHiddenForStore never touches fundraiser_rate, payouts, sales, or discount calculations -- it's a pure string predicate", () => {
  const source = stripLineComments(readSource("lib/fundraisingDisplayOverrides.ts"));
  for (const forbidden of ["fundraiser_rate", "fundraiserRate", "total_discounts", "payout", "supabaseAdmin", ".from(", ".select("]) {
    assert.equal(source.includes(forbidden), false, `fundraisingDisplayOverrides.ts unexpectedly references "${forbidden}"`);
  }
});

run("the override is explicitly documented as temporary, pending configurable fundraising settings", () => {
  const source = readSource("lib/fundraisingDisplayOverrides.ts").toLowerCase();
  assert.ok(source.includes("temporary"));
  assert.ok(source.includes("team store creator"));
});

if (process.exitCode === 1) {
  console.error("\nOne or more checks failed.");
} else {
  console.log("\nAll LVC Coaches fundraising-card override checks passed.");
}
