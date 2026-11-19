import assert from "node:assert/strict";
import {
  slugify,
  trimOrNull,
  normalizeVendorTeamTag,
  validateFundraiserRatePercent,
  isLikelyValidEmail,
  validateStoreFields,
  STORE_NAME_REQUIRED_ERROR,
  CONTACT_EMAIL_INVALID_ERROR,
} from "@/lib/onlineStoreProvisioningLogic";

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

const baseInput = {
  name: "Lakeside Lacrosse",
  vendorTeamTag: "",
  fundraiserRatePercent: "",
  organizationType: "",
  sport: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  notes: "",
};

run("slugify lowercases, hyphenates, and trims edge hyphens", () => {
  assert.equal(slugify("  Lakeside Lacrosse! 2026  "), "lakeside-lacrosse-2026");
});

run("trimOrNull returns null for empty/whitespace-only input", () => {
  assert.equal(trimOrNull("   "), null);
  assert.equal(trimOrNull(""), null);
  assert.equal(trimOrNull("  hello  "), "hello");
});

run("normalizeVendorTeamTag collapses irregular internal whitespace (acceptance test 7)", () => {
  assert.equal(
    normalizeVendorTeamTag("North  Cheektowaga   AAA"),
    "North Cheektowaga AAA"
  );
});

run("normalizeVendorTeamTag preserves case exactly -- never folds it (acceptance test 8)", () => {
  assert.equal(normalizeVendorTeamTag("Lakeside LACROSSE"), "Lakeside LACROSSE");
  assert.notEqual(normalizeVendorTeamTag("Lakeside LACROSSE"), "lakeside lacrosse");
});

run("normalizeVendorTeamTag returns null for empty input", () => {
  assert.equal(normalizeVendorTeamTag("   "), null);
});

run("validateFundraiserRatePercent accepts the lower boundary, 0 (acceptance test 9)", () => {
  const result = validateFundraiserRatePercent("0");
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.rate, 0);
});

run("validateFundraiserRatePercent accepts the upper boundary, 100 (acceptance test 9)", () => {
  const result = validateFundraiserRatePercent("100");
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.rate, 1);
});

run("validateFundraiserRatePercent accepts a decimal percentage", () => {
  const result = validateFundraiserRatePercent("17.5");
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.rate, 0.175);
});

run("validateFundraiserRatePercent rejects below 0 (acceptance test 9)", () => {
  const result = validateFundraiserRatePercent("-1");
  assert.equal(result.ok, false);
});

run("validateFundraiserRatePercent rejects above 100 (acceptance test 9)", () => {
  const result = validateFundraiserRatePercent("101");
  assert.equal(result.ok, false);
});

run("validateFundraiserRatePercent rejects non-numeric input", () => {
  const result = validateFundraiserRatePercent("abc");
  assert.equal(result.ok, false);
});

run("isLikelyValidEmail is a light '@' check, not full RFC validation (acceptance test 10)", () => {
  assert.equal(isLikelyValidEmail("coach@lakesidelacrosse.org"), true);
  assert.equal(isLikelyValidEmail("not-an-email"), false);
});

run("validateStoreFields rejects an empty store name", () => {
  const result = validateStoreFields({ ...baseInput, name: "   " });
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.error, STORE_NAME_REQUIRED_ERROR);
});

run("validateStoreFields rejects a malformed contact email", () => {
  const result = validateStoreFields({ ...baseInput, contactEmail: "not-an-email" });
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.error, CONTACT_EMAIL_INVALID_ERROR);
});

run("validateStoreFields defaults fundraiser rate to 20% when left blank", () => {
  const result = validateStoreFields(baseInput);
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.fields.fundraiserRate, 0.2);
});

run("validateStoreFields accepts a fully-populated, valid submission", () => {
  const result = validateStoreFields({
    name: "  Lakeside Lacrosse  ",
    vendorTeamTag: "Lakeside  Lacrosse",
    fundraiserRatePercent: "25",
    organizationType: "Club",
    sport: "Lacrosse",
    contactName: "Jamie Smith",
    contactEmail: "jamie@lakesidelacrosse.org",
    contactPhone: "555-0100",
    notes: "Launching spring 2027.",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.fields.name, "Lakeside Lacrosse");
    assert.equal(result.fields.vendorTeamTag, "Lakeside Lacrosse");
    assert.equal(result.fields.fundraiserRate, 0.25);
    assert.equal(result.fields.organizationType, "Club");
    assert.equal(result.fields.contactEmail, "jamie@lakesidelacrosse.org");
  }
});

run("validateStoreFields treats blank optional fields as null, never empty string", () => {
  const result = validateStoreFields(baseInput);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.fields.vendorTeamTag, null);
    assert.equal(result.fields.organizationType, null);
    assert.equal(result.fields.notes, null);
  }
});
