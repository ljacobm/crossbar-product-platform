import "./loadEnv";

import { writeFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import { fetchOrdersPage, normalizeGraphQLOrder } from "@/lib/shopifyGraphQLAdapter";
import { upsertNormalizedOrder } from "@/lib/shopifyNormalized";

// One-time/re-runnable historical Shopify order importer. Fetches orders
// directly from Shopify's GraphQL Admin API and writes them through the
// exact same normalization/upsert logic the live orders/create webhook
// uses (see lib/shopifyNormalized.ts) -- the only thing specific to this
// script is fetching + GraphQL-shape adaptation (lib/shopifyGraphQLAdapter.ts)
// and this CLI's argument parsing / summary reporting.
//
// Usage:
//   npx tsx scripts/backfillShopifyOrders.ts --limit 10 --dry-run
//   npx tsx scripts/backfillShopifyOrders.ts --since 2025-01-01 --until 2025-03-31 --limit 10
//   npx tsx scripts/backfillShopifyOrders.ts --since 2026-01-01 --until 2026-12-31
//
// Deliberately does NOT import lib/supabase-admin.ts (its "server-only"
// guard throws outside Next's bundler) -- constructs its own admin client
// below instead, same credentials, no guard.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL environment variable.");
}
if (!supabaseServiceRoleKey) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable.");
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface CliOptions {
  limit: number | null;
  since: string | null;
  until: string | null;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { limit: null, since: null, until: null, dryRun: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--limit": {
        const value = argv[++i];
        const parsed = value ? Number(value) : NaN;
        if (!Number.isFinite(parsed) || parsed <= 0) {
          throw new Error(`--limit requires a positive number, got: ${value}`);
        }
        options.limit = parsed;
        break;
      }
      case "--since":
        options.since = argv[++i] ?? null;
        break;
      case "--until":
        options.until = argv[++i] ?? null;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--help":
      case "-h":
        printUsage();
        process.exit(0);
        break;
      default:
        throw new Error(`Unrecognized argument: ${arg} (see --help)`);
    }
  }

  if (options.limit == null && !options.since && !options.until) {
    throw new Error(
      "Provide --limit (most-recent-N mode), and/or --since/--until (date-range mode). See --help."
    );
  }

  return options;
}

function printUsage(): void {
  console.log(`
Historical Shopify order backfill.

  --limit <n>       Cap total orders processed. With no --since/--until,
                     fetches the N most recent orders.
  --since <date>     ISO date (YYYY-MM-DD), inclusive lower bound on created_at.
  --until <date>      ISO date (YYYY-MM-DD), inclusive upper bound on created_at.
  --dry-run          Fetch + normalize only. No Supabase writes.

Examples:
  npx tsx scripts/backfillShopifyOrders.ts --limit 10 --dry-run
  npx tsx scripts/backfillShopifyOrders.ts --since 2025-06-01 --until 2025-06-30 --limit 10
  npx tsx scripts/backfillShopifyOrders.ts --since 2026-01-01 --until 2026-12-31
`);
}

function buildDateQuery(since: string | null, until: string | null): string | null {
  const clauses: string[] = [];
  if (since) clauses.push(`created_at:>=${since}`);
  if (until) clauses.push(`created_at:<=${until}`);
  return clauses.length > 0 ? clauses.join(" ") : null;
}

interface Summary {
  ordersFetched: number;
  ordersInserted: number;
  ordersUpdated: number;
  customersProcessed: number;
  lineItemsProcessed: number;
  unmatchedTeamTags: Set<string>;
  failures: { orderId: string; error: string }[];
  minCreatedAt: string | null;
  maxCreatedAt: string | null;
}

function newSummary(): Summary {
  return {
    ordersFetched: 0,
    ordersInserted: 0,
    ordersUpdated: 0,
    customersProcessed: 0,
    lineItemsProcessed: 0,
    unmatchedTeamTags: new Set<string>(),
    failures: [],
    minCreatedAt: null,
    maxCreatedAt: null,
  };
}

const PAGE_SIZE = 250;

async function run(options: CliOptions): Promise<Summary> {
  const dateQuery = buildDateQuery(options.since, options.until);
  // "Most recent N" mode only applies when no explicit date range was
  // given -- reverse chronological, single concept, matches "import last
  // 10 orders." Any date range is walked forward (oldest-to-newest within
  // the range) regardless of --limit.
  const reverse = !dateQuery && options.limit != null;

  const summary = newSummary();
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    if (options.limit != null && summary.ordersFetched >= options.limit) break;

    const remaining = options.limit != null ? options.limit - summary.ordersFetched : PAGE_SIZE;
    const first = Math.max(1, Math.min(PAGE_SIZE, remaining));

    const page = await fetchOrdersPage({ first, after: cursor, dateQuery, reverse });

    for (const node of page.orders) {
      if (options.limit != null && summary.ordersFetched >= options.limit) break;

      summary.ordersFetched += 1;
      const orderLabel = node.name ?? node.id;

      if (node.createdAt) {
        if (!summary.minCreatedAt || node.createdAt < summary.minCreatedAt) {
          summary.minCreatedAt = node.createdAt;
        }
        if (!summary.maxCreatedAt || node.createdAt > summary.maxCreatedAt) {
          summary.maxCreatedAt = node.createdAt;
        }
      }

      try {
        // normalizeGraphQLOrder is where line-item pagination happens too
        // (see shopifyGraphQLAdapter.ts) -- if it can't retrieve every line
        // item for this order, it throws, and this catch block ensures the
        // order is reported as a failure rather than imported incomplete.
        const normalized = await normalizeGraphQLOrder(node);

        if (options.dryRun) {
          summary.customersProcessed += normalized.customer ? 1 : 0;
          summary.lineItemsProcessed += normalized.lineItems.length;
          continue;
        }

        const result = await upsertNormalizedOrder(supabase, normalized, {
          source: "historical_import",
        });

        if (result.isNewOrder) summary.ordersInserted += 1;
        else summary.ordersUpdated += 1;
        if (result.customerProcessed) summary.customersProcessed += 1;
        summary.lineItemsProcessed += result.lineItemCount;
        for (const tag of result.unmatchedTeamTags) summary.unmatchedTeamTags.add(tag);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Failed to import order ${orderLabel}: ${message}`);
        summary.failures.push({ orderId: orderLabel, error: message });
      }
    }

    hasNextPage = page.hasNextPage;
    cursor = page.endCursor;
  }

  return summary;
}

function printSummary(summary: Summary, options: CliOptions, durationMs: number): void {
  const title = options.dryRun ? "DRY RUN SUMMARY" : "BACKFILL SUMMARY";
  const divider = "=".repeat(50);
  const unmatchedList = Array.from(summary.unmatchedTeamTags);

  console.log("");
  console.log(divider);
  console.log(title);
  console.log(divider);
  console.log(`Date/order range requested: ${options.since ?? "(none)"} .. ${options.until ?? "(none)"}${options.limit != null ? `, limit ${options.limit}` : ""}`);
  console.log(`Date range actually processed: ${summary.minCreatedAt ?? "n/a"} .. ${summary.maxCreatedAt ?? "n/a"}`);
  console.log(`Orders fetched: ${summary.ordersFetched}`);
  if (!options.dryRun) {
    console.log(`Orders inserted (new): ${summary.ordersInserted}`);
    console.log(`Orders updated (already existed): ${summary.ordersUpdated}`);
  }
  console.log(`Customers processed: ${summary.customersProcessed}`);
  console.log(`Line items processed: ${summary.lineItemsProcessed}`);
  console.log(
    `Unmatched team_tags (${unmatchedList.length}): ${unmatchedList.length > 0 ? unmatchedList.join(", ") : "none"}`
  );
  console.log(`Failures: ${summary.failures.length}`);
  for (const failure of summary.failures) {
    console.log(`  - ${failure.orderId}: ${failure.error}`);
  }
  console.log(`Duration: ${(durationMs / 1000).toFixed(1)}s`);
  console.log(divider);
}

function writeReport(summary: Summary, options: CliOptions): void {
  const reportPath = resolve(
    __dirname,
    options.dryRun ? "shopify_backfill_dry_run_last.json" : "shopify_backfill_last_run.json"
  );

  const report = {
    ranAt: new Date().toISOString(),
    dryRun: options.dryRun,
    limit: options.limit,
    since: options.since,
    until: options.until,
    ordersFetched: summary.ordersFetched,
    ordersInserted: summary.ordersInserted,
    ordersUpdated: summary.ordersUpdated,
    customersProcessed: summary.customersProcessed,
    lineItemsProcessed: summary.lineItemsProcessed,
    unmatchedTeamTags: Array.from(summary.unmatchedTeamTags),
    failures: summary.failures,
    minCreatedAt: summary.minCreatedAt,
    maxCreatedAt: summary.maxCreatedAt,
  };

  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Report written to ${reportPath}`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const startedAt = Date.now();

  const summary = await run(options);

  printSummary(summary, options, Date.now() - startedAt);
  writeReport(summary, options);

  if (summary.failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  printUsage();
  process.exit(1);
});
