import assert from "node:assert/strict";
import { getColorSwatchHex } from "@/lib/colorSwatchLogic";

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

run("getColorSwatchHex resolves a known common color name", () => {
  assert.equal(getColorSwatchHex("Black"), "#1a1a1a");
});

run("getColorSwatchHex is case-insensitive", () => {
  assert.equal(getColorSwatchHex("NAVY"), getColorSwatchHex("navy"));
});

run("getColorSwatchHex trims surrounding whitespace", () => {
  assert.equal(getColorSwatchHex("  Red  "), getColorSwatchHex("Red"));
});

run("getColorSwatchHex returns null (never throws, never guesses) for an unknown color name", () => {
  assert.equal(getColorSwatchHex("Some Completely Made Up SanMar Color 12345"), null);
});

run("getColorSwatchHex resolves a real multi-word SanMar color name", () => {
  assert.equal(getColorSwatchHex("Athletic Heather"), "#9a9a9d");
});
