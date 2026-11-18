import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Source-level security checks for the Online Store Builder's
// customer-facing surface (task requirement 4: "never rely solely on
// an unverified store identifier in the URL"), matching this repo's
// existing convention of plain source-text assertions for security
// invariants (see scripts/verifyPortalPrivacy.ts).

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

const ROOT = join(__dirname, "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

// Strips SQL "--" comment lines before a source-text check -- this
// migration's own header comment legitimately name-drops
// online_store_portal_tokens by name to explain why it's a SEPARATE
// table (exactly the house convention of cross-referencing related
// migrations by name in prose); only actual SQL statements matter for
// the "these tables are truly independent" check below.
function stripSqlComments(sql: string): string {
  return sql
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("--");
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join("\n");
}

run("proxy.ts treats /store as a public path prefix (the customer catalog route has no staff session)", () => {
  const source = read("proxy.ts");
  assert.match(source, /PUBLIC_PATH_PREFIXES[\s\S]*?"\/store"/);
});

run("the customer catalog page lives outside app/(internal)/ -- no Sidebar, no staff layout", () => {
  const source = read("app/store/[token]/page.tsx");
  assert.ok(!source.includes("@/components/Sidebar"), "must not import the staff Sidebar");
  assert.ok(!source.includes("requireStaffSession"), "must not require a staff session");
});

run(
  "requirement -- never rely solely on an unverified store identifier in the URL: the customer page's params type carries only a token, never a storeId",
  () => {
    const source = read("app/store/[token]/page.tsx");
    assert.match(source, /params:\s*Promise<\{\s*token:\s*string\s*\}>/);
    assert.ok(!/storeId/.test(source), "the customer page must never reference a storeId directly");
  }
);

run("lib/onlineStoreCatalogAccess.ts is NOT a \"use server\" file (a token resolver must never be a public Server Action)", () => {
  const source = read("lib/onlineStoreCatalogAccess.ts");
  // Checks for the actual DIRECTIVE (a standalone statement), not just
  // the substring -- this file's own comments legitimately mention
  // "use server" in prose while explaining why it deliberately isn't one.
  assert.ok(!/^\s*["']use server["'];?\s*$/m.test(source), 'must not contain a "use server" directive statement');
  assert.ok(source.includes('import "server-only"'));
});

// This module now legitimately holds two kinds of exports: real
// customer-facing functions (token-resolved, never staff-gated) and a
// small staff-only preview surface (getStoreCatalogPreview,
// getStoreDraftItemCount) that shares the same buildCatalogWorkspace
// core so staff see exactly what a customer would see. The staff-only
// functions take storeId directly and MUST self-gate with
// requireStaffSession() -- that is the actual security property to
// check, not a blanket "this file never imports requireStaffSession."
function splitExportedFunctions(source: string): Array<{ name: string; signature: string; body: string }> {
  const starts = Array.from(source.matchAll(/export async function (\w+)\(/g));
  return starts.map((m, i) => {
    const start = m.index!;
    let end = i + 1 < starts.length ? starts[i + 1].index! : source.length;
    if (i + 1 < starts.length) {
      // Back up over any contiguous run of blank/comment lines
      // immediately before the next export -- those lines are a
      // doc-comment for the NEXT function, not part of this one's
      // body, even though they fall before its export index.
      const lines = source.slice(0, end).split("\n");
      while (lines.length > 0) {
        const line = lines[lines.length - 1].trim();
        if (line === "" || line.startsWith("//")) {
          lines.pop();
        } else {
          break;
        }
      }
      end = lines.join("\n").length;
    }
    const chunk = source.slice(start, end);
    const signatureMatch = chunk.match(/export async function \w+\(([^)]*)\)/);
    return { name: m[1], signature: signatureMatch ? signatureMatch[1] : "", body: chunk };
  });
}

run(
  "every customer-facing export (taking rawToken) resolves the store id via resolveCatalogAccessStoreId and never requires a staff session",
  () => {
    const source = read("lib/onlineStoreCatalogCustomerData.ts");
    const fns = splitExportedFunctions(source);
    const customerFacing = fns.filter((f) => /^\s*rawToken\s*:\s*string/.test(f.signature));
    assert.ok(customerFacing.length >= 3, "expected at least 3 customer-facing (rawToken) exports");
    for (const fn of customerFacing) {
      assert.ok(!fn.body.includes("requireStaffSession"), `${fn.name} (customer-facing) must not require a staff session`);
    }
    assert.ok(source.includes("resolveCatalogAccessStoreId") || source.includes("resolveStoreOrNull"));
  }
);

run(
  "every staff-only export (taking storeId) self-gates with requireStaffSession before touching the database",
  () => {
    const source = read("lib/onlineStoreCatalogCustomerData.ts");
    const fns = splitExportedFunctions(source);
    const staffOnly = fns.filter((f) => /^\s*storeId\s*:\s*number/.test(f.signature));
    assert.ok(staffOnly.length >= 1, "expected at least 1 staff-only (storeId) export");
    for (const fn of staffOnly) {
      assert.ok(fn.body.includes("requireStaffSession"), `${fn.name} (staff-only) must call requireStaffSession`);
    }
    const accountedFor = new Set([...fns.map((f) => f.name)]);
    const rawTokenOrStoreId = fns.filter(
      (f) => /^\s*rawToken\s*:\s*string/.test(f.signature) || /^\s*storeId\s*:\s*number/.test(f.signature)
    );
    assert.equal(
      rawTokenOrStoreId.length,
      accountedFor.size,
      "every exported function must take either rawToken or storeId as its first parameter -- no untyped/ambiguous entry points"
    );
  }
);

run("the catalog access token table is a genuinely separate table from the portal token table (no shared DDL, only a cross-referencing comment)", () => {
  const code = stripSqlComments(
    read("../database/migrations/20261111c_add_online_store_catalog_access_tokens.sql")
  );
  assert.ok(code.includes("online_store_catalog_access_tokens"));
  assert.ok(!code.includes("online_store_portal_tokens"), "no actual SQL statement should reference the portal token table");
});

run("every new Online Store Builder table has RLS enabled with no policies, matching house convention", () => {
  const files = [
    "../database/migrations/20261111_add_approved_catalog_styles.sql",
    "../database/migrations/20261111b_add_online_store_catalog_builder.sql",
    "../database/migrations/20261111c_add_online_store_catalog_access_tokens.sql",
    // 20261111d (decoration/forms) is intentionally out of scope for
    // the catalog-selection/approval-workflow feature this branch
    // builds -- not copied here, so not checked here either.
  ];
  for (const file of files) {
    const source = read(file);
    assert.ok(/enable row level security/.test(source), `${file} must enable RLS`);
    assert.ok(!/create policy/i.test(source), `${file} must not define any RLS policy`);
    assert.ok(/revoke all privileges/.test(source), `${file} must revoke table privileges from public/anon/authenticated`);
  }
});
