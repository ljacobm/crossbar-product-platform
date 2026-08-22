import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

// Loads frontend/.env.local into process.env for standalone script
// execution via tsx. Unlike `next dev`/`next build`, running a script
// directly does not automatically read .env.local -- this makes the two
// consistent. Import this FIRST (before any module that reads
// process.env.SHOPIFY_*/SUPABASE_* at module-evaluation time) -- ES module
// imports are evaluated top-to-bottom in the order they're written, so a
// side-effect-only `import "./loadEnv"` as the very first line guarantees
// env vars are set before anything else runs.
const envPath = resolve(__dirname, "..", ".env.local");

if (existsSync(envPath)) {
  const contents = readFileSync(envPath, "utf8");
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}
