import assert from "node:assert/strict";
import { resolveOrderLastName } from "@/lib/orderLastName";

// Sales Data "Last Name" column: exercises resolveOrderLastName()'s
// fallback priority (shipping -> billing -> customer -> null) directly,
// a real executable test rather than a structural stand-in, matching the
// same approach used for lib/discountDisplayState.ts.
//
// Run via `npx tsx scripts/verifySalesDataLastName.ts`.

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

run("shipping address last name is used when present", () => {
  const result = resolveOrderLastName({
    shipping_address: { last_name: "Shipping" },
    billing_address: { last_name: "Billing" },
    customer: { last_name: "Customer" },
  });
  assert.equal(result, "Shipping");
});

run("falls back to billing address last name when shipping is missing", () => {
  const result = resolveOrderLastName({
    shipping_address: null,
    billing_address: { last_name: "Billing" },
    customer: { last_name: "Customer" },
  });
  assert.equal(result, "Billing");
});

run("falls back to billing address last name when shipping has no last_name field at all", () => {
  const result = resolveOrderLastName({
    shipping_address: {},
    billing_address: { last_name: "Billing" },
    customer: { last_name: "Customer" },
  });
  assert.equal(result, "Billing");
});

run("falls back to billing address last name when shipping's last_name is blank/whitespace-only", () => {
  const result = resolveOrderLastName({
    shipping_address: { last_name: "   " },
    billing_address: { last_name: "Billing" },
    customer: { last_name: "Customer" },
  });
  assert.equal(result, "Billing");
});

run("falls back to the Shopify customer record's last name when both addresses are missing", () => {
  const result = resolveOrderLastName({
    shipping_address: null,
    billing_address: null,
    customer: { last_name: "Customer" },
  });
  assert.equal(result, "Customer");
});

run("returns null (not empty string) when no source has a usable last name", () => {
  const result = resolveOrderLastName({
    shipping_address: null,
    billing_address: null,
    customer: null,
  });
  assert.equal(result, null);
});

run("returns null when every source is present but every last_name is blank", () => {
  const result = resolveOrderLastName({
    shipping_address: { last_name: "" },
    billing_address: { last_name: "   " },
    customer: { last_name: null },
  });
  assert.equal(result, null);
});

run("trims surrounding whitespace from the resolved last name", () => {
  const result = resolveOrderLastName({
    shipping_address: { last_name: "  Smith  " },
    billing_address: null,
    customer: null,
  });
  assert.equal(result, "Smith");
});

run("missing order fields entirely (undefined, not null) are treated the same as null", () => {
  const result = resolveOrderLastName({});
  assert.equal(result, null);
});

if (process.exitCode === 1) {
  console.error("\nOne or more checks failed.");
} else {
  console.log("\nAll Sales Data last-name checks passed.");
}
