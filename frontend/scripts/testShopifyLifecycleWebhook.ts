import "./loadEnv";
import { createHmac, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ShopifyOrderPayload, ShopifyRefundPayload, ShopifyFulfillmentPayload } from "@/lib/shopifyRestAdapter";

// Phase 1, Milestones 2-3: a controlled, repeatable test of the deployed
// Shopify lifecycle webhook pipeline (orders/updated|cancelled|edited,
// fulfillments/create|update, refunds/create, and now orders/create's
// discount capture) against Crossbar OS Staging, using a fully SYNTHETIC
// order -- no real Shopify order or customer is read, modified, or
// created. This script never contacts Shopify or Supabase directly; it
// only POSTs a locally-constructed, locally-signed payload to the staging
// HTTP endpoint, which is the one and only thing that decides which
// Supabase project the resulting rows land in.
//
// Two modes:
// - Legacy/default (no --scenario): Test #1 -- a fresh synthetic order,
//   unchanged from the original version of this script. A new,
//   never-seen-before negative shopify_order_id is generated every run.
// - --scenario <name>: Test #2 -- edits against the ONE existing synthetic
//   order Test #1 already created in staging. Always targets the fixed
//   ids below; never accepts --order-id, specifically so this mode can
//   never accidentally create a second order.
//
// SAFETY MODEL (read before running):
// - The target URL is a hard-coded constant below (STAGING_ENDPOINT) with
//   no CLI flag to override it -- there is no way to accidentally point
//   this script at production, because the option does not exist.
// - This script holds no Supabase credentials at all, by design. Database
//   isolation is therefore structural, not something this script checks at
//   runtime: the ONLY path any data can take is through the pinned staging
//   URL, and that deployed route uses whichever Supabase credentials are
//   configured in the STAGING VERCEL PROJECT's own environment variables --
//   entirely outside this script's control or knowledge. If that pinned URL
//   check ever fails (see assertStagingEndpoint below), the script aborts
//   before building the request at all -- the one failure mode it can
//   actually detect, it fails closed on.
// - SHOPIFY_CLIENT_SECRET is read from frontend/.env.local (via ./loadEnv,
//   the same convention backfillShopifyOrders.ts uses) ONLY to compute the
//   HMAC locally. Its value is never logged, printed, or written to any
//   file by this script -- only the computed digest (which is not
//   reversible back into the secret and is only valid for this one
//   request body) is ever shown, and only in --dry-run output.
// - Every identifier generated or hard-coded (shopify order id, customer
//   id, line item ids, webhook delivery id) is clearly synthetic: all are
//   negative, which a real Shopify id can never be, making every row this
//   test could ever create trivially greppable and safe to clean up (see
//   the cleanup SQL printed at the end of a live run).
// - Default mode is --dry-run: builds the payload, computes the HMAC,
//   prints exactly what WOULD be sent and to where, and sends nothing.
//   --live still requires typing SEND at an interactive prompt before the
//   one HTTP request is actually made -- there is no flag that skips this
//   prompt, in either mode.
//
// KNOWN LIMITATION (relevant to --scenario stale-update specifically): a
// 200 {"status":"processed"} response does NOT confirm sync_shopify_order
// actually applied the write -- its own staleness check can silently
// return applied:false without that ever reaching this script or route.ts's
// HTTP response. The only reliable way to confirm whether an edit (or a
// deliberately-stale non-edit) took effect is the verification SQL printed
// after a live send, comparing actual row values -- never the HTTP status
// alone.
//
// Usage:
//   npx tsx scripts/testShopifyLifecycleWebhook.ts --dry-run
//   npx tsx scripts/testShopifyLifecycleWebhook.ts --live
//   npx tsx scripts/testShopifyLifecycleWebhook.ts --live --order-id -987654321
//   npx tsx scripts/testShopifyLifecycleWebhook.ts --scenario quantity-update
//   npx tsx scripts/testShopifyLifecycleWebhook.ts --scenario quantity-update --live
//   npx tsx scripts/testShopifyLifecycleWebhook.ts --scenario add-line-item --live
//   npx tsx scripts/testShopifyLifecycleWebhook.ts --scenario remove-line-item --live
//   npx tsx scripts/testShopifyLifecycleWebhook.ts --scenario replay-duplicate --live
//   npx tsx scripts/testShopifyLifecycleWebhook.ts --scenario stale-update --live
//   npx tsx scripts/testShopifyLifecycleWebhook.ts --scenario cancel-order
//   npx tsx scripts/testShopifyLifecycleWebhook.ts --scenario cancel-order --live
//   npx tsx scripts/testShopifyLifecycleWebhook.ts --scenario refund-order --live
//   npx tsx scripts/testShopifyLifecycleWebhook.ts --scenario fulfillment-create
//   npx tsx scripts/testShopifyLifecycleWebhook.ts --scenario fulfillment-create --live
//   npx tsx scripts/testShopifyLifecycleWebhook.ts --scenario fulfillment-update --live
//   npx tsx scripts/testShopifyLifecycleWebhook.ts --scenario create-with-discount
//   npx tsx scripts/testShopifyLifecycleWebhook.ts --scenario create-with-discount --live
//   npx tsx scripts/testShopifyLifecycleWebhook.ts --scenario create-no-discount
//   npx tsx scripts/testShopifyLifecycleWebhook.ts --scenario create-no-discount --live
//   npx tsx scripts/testShopifyLifecycleWebhook.ts --help

const STAGING_ENDPOINT = "https://crossbar-os-staging.vercel.app/api/webhooks/shopify";
const TOPIC = "orders/updated";

// Test #2: the existing synthetic order Test #1 created in staging.
// Reused exactly as reported -- never re-derived, never regenerated.
const EXISTING_TEST_ORDER_ID = -1793031279307910;
const EXISTING_TEST_CUSTOMER_ID = -1793031279307911; // orderId - 1, matches Test #1
const ORIGINAL_LINE_ITEM_ID = -1793031279307912; // orderId - 2, matches Test #1
const SECOND_LINE_ITEM_ID = -1793031279307913; // orderId - 3, new, deterministic
// Test #4: synthetic refund id, continuing the same orderId - N sequence.
// bigint columns (shopify_refunds.shopify_refund_id, shopify_refund_line_items.
// shopify_refund_line_item_id) accept negative values with no special
// handling anywhere in the schema or the sync functions -- confirmed by
// direct reading of the migration (plain `bigint`, no check constraint,
// no unsigned-only assumption) -- so this is not a compatibility risk.
const SYNTHETIC_REFUND_ID = -1793031279307914; // orderId - 4, new, deterministic
// Test #5: synthetic fulfillment id, continuing the same orderId - N
// sequence. Reused identically by both fulfillment-create and
// fulfillment-update -- it's the same shopify_fulfillment_id in both
// cases (an update, not a new fulfillment), which is exactly what
// sync_shopify_fulfillment's natural-key upsert expects.
const SYNTHETIC_FULFILLMENT_ID = -1793031279307915; // orderId - 5, new, deterministic

// Test #1's exact original created_at is unknown to this script (never
// recorded durably) and is not load-bearing for anything Test #2 checks --
// a single stable stand-in value is used across every Test #2 scenario so
// order_created_at doesn't flap on every touch (REST payloads always carry
// this key, so whatever is sent here does overwrite it every time, per
// sync_shopify_order's field-presence contract -- see the migration's JSON
// CONTRACT comment).
const APPROXIMATE_EXISTING_ORDER_CREATED_AT = "2026-10-26T00:00:00.000Z";

const SCENARIOS = [
  "quantity-update",
  "add-line-item",
  "remove-line-item",
  "replay-duplicate",
  "stale-update",
  "cancel-order",
  "refund-order",
  "fulfillment-create",
  "fulfillment-update",
  "create-with-discount",
  "create-no-discount",
] as const;
type Scenario = (typeof SCENARIOS)[number];

function isScenario(value: string): value is Scenario {
  return (SCENARIOS as readonly string[]).includes(value);
}

// Scenarios whose payload is a complete Shopify ORDER object (shared shape,
// built by buildScenarioPayload/runLegacyOrScenario) -- excludes
// replay-duplicate (resends raw bytes, builds nothing), refund-order (a
// standalone refund resource payload), the two fulfillment scenarios (a
// standalone fulfillment resource payload), and the two orders/create
// discount scenarios (their own dedicated builder/runner -- unlike every
// scenario above, they generate a FRESH order id each run rather than
// touching EXISTING_TEST_ORDER_ID) -- all structurally different, each
// with its own dedicated builder/runner function.
type OrderPayloadScenario = Exclude<
  Scenario,
  | "replay-duplicate"
  | "refund-order"
  | "fulfillment-create"
  | "fulfillment-update"
  | "create-with-discount"
  | "create-no-discount"
>;

const STATE_FILE_PATH = resolve(__dirname, "shopify_lifecycle_test2_state.json");

interface Test2State {
  lastAppliedUpdatedAt?: string;
  // Test #5: fulfillment-update must never rely on wall-clock time alone
  // to guarantee it lands strictly after fulfillment-create's touch --
  // these two fields make that an explicit, recorded fact instead of an
  // assumption about elapsed real time between two separate invocations.
  // Deliberately separate from lastAppliedUpdatedAt (order-level, a
  // different concept) -- fulfillment-update must never touch that field.
  fulfillmentCreatedAtShopify?: string; // set once, on a successful fulfillment-create; reused verbatim by fulfillment-update, never regenerated
  lastFulfillmentUpdatedAt?: string; // the last successfully-applied updated_at_shopify for SYNTHETIC_FULFILLMENT_ID
  lastLiveRequest?: {
    url: string;
    headers: Record<string, string>;
    body: string;
  };
}

function readState(): Test2State {
  if (!existsSync(STATE_FILE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(STATE_FILE_PATH, "utf8")) as Test2State;
  } catch {
    return {};
  }
}

function writeState(state: Test2State): void {
  writeFileSync(STATE_FILE_PATH, JSON.stringify(state, null, 2) + "\n", "utf8");
}

interface CliOptions {
  mode: "dry-run" | "live";
  orderId: number;
  orderIdExplicit: boolean;
  webhookId: string;
  webhookIdExplicit: boolean;
  scenario: Scenario | null;
}

function printHelp(): void {
  console.log(`
Controlled, synthetic orders/updated test against Crossbar OS Staging.

Legacy mode (Test #1 -- a fresh synthetic order each run):
  --dry-run            Build the payload and HMAC, print what would be
                        sent, send nothing. Default if no mode is given.
  --live                Actually send the request, after a typed
                        confirmation prompt. No bypass flag exists.
  --order-id <n>        Override the synthetic shopify_order_id (must be a
                        negative integer). Default: a fresh negative id
                        derived from the current time, unique per run.
  --webhook-id <uuid>   Override the X-Shopify-Webhook-Id delivery id.
                        Default: a fresh random UUID, unique per run.

Test #2 mode (edits against the ONE existing synthetic order from Test #1
-- always targets shopify_order_id ${EXISTING_TEST_ORDER_ID}; --order-id is
not accepted in this mode, so a second order can never be created):
  --scenario <name>     One of: ${SCENARIOS.join(", ")}.
                        Combine with --dry-run (default) or --live as above.

--help                  Show this message.

Requires SHOPIFY_CLIENT_SECRET in frontend/.env.local, set to the SAME
value configured in the Crossbar OS Staging Vercel project (not
necessarily the same file you use for local production-pointed dev work --
double check which secret is actually in there before running --live).
Optionally also requires SHOPIFY_SHOP_DOMAIN there, if the staging
deployment enforces the X-Shopify-Shop-Domain header check.
`);
}

function parseArgs(argv: string[]): CliOptions {
  let mode: "dry-run" | "live" = "dry-run";
  let orderId: number | null = null;
  let webhookId: string | null = null;
  let scenario: Scenario | null = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--dry-run":
        mode = "dry-run";
        break;
      case "--live":
        mode = "live";
        break;
      case "--order-id": {
        const value = Number(argv[++i]);
        if (!Number.isInteger(value) || value >= 0) {
          throw new Error("--order-id must be a negative integer (synthetic ids are always negative).");
        }
        orderId = value;
        break;
      }
      case "--webhook-id":
        webhookId = argv[++i] ?? null;
        break;
      case "--scenario": {
        const value = argv[++i];
        if (!value || !isScenario(value)) {
          throw new Error(`--scenario must be one of: ${SCENARIOS.join(", ")} (got: ${value ?? "(none)"})`);
        }
        scenario = value;
        break;
      }
      case "--help":
        printHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`Unrecognized argument: ${arg} (see --help)`);
    }
  }

  if (scenario && orderId !== null) {
    throw new Error(
      "--order-id cannot be combined with --scenario -- Test #2 scenarios always target the " +
        `existing fixed test order (shopify_order_id ${EXISTING_TEST_ORDER_ID}), never a new one.`
    );
  }
  if (scenario === "replay-duplicate" && webhookId !== null) {
    throw new Error(
      "--webhook-id cannot be combined with --scenario replay-duplicate -- replaying reuses the " +
        "exact delivery id of whichever request was last sent live, by design."
    );
  }

  // Synthetic, unique-per-run by default: Date.now() (ms) combined with a
  // small random component, negated. Always far outside any real Shopify
  // id's range, and distinct across runs unless explicitly overridden --
  // which is exactly what makes repeated runs of this script safe without
  // manual cleanup between them. Only used in legacy (no --scenario) mode.
  const defaultOrderId = -(Date.now() * 1000 + Math.floor(Math.random() * 1000));

  return {
    mode,
    orderId: orderId ?? defaultOrderId,
    orderIdExplicit: orderId !== null,
    webhookId: webhookId ?? randomUUID(),
    webhookIdExplicit: webhookId !== null,
    scenario,
  };
}

// Topic is scenario-dependent: cancel-order is the one Test #2/#3 scenario
// that isn't an orders/updated touch -- it's a real, distinct Shopify
// webhook topic (orders/cancelled), which is its own entry in
// SHOPIFY_LIFECYCLE_TOPICS_ENABLED's comma list. Enabling orders/updated
// (confirmed by Tests #1/#2) does NOT imply orders/cancelled is also
// enabled -- a live send under this scenario can come back HTTP 200 with
// {"status":"disabled"} and write nothing, which looks like success at a
// glance. Always read the actual response body, not just the status code.
function scenarioTopic(scenario: Scenario | null): string {
  if (scenario === "cancel-order") return "orders/cancelled";
  if (scenario === "refund-order") return "refunds/create";
  if (scenario === "fulfillment-create") return "fulfillments/create";
  if (scenario === "fulfillment-update") return "fulfillments/update";
  if (scenario === "create-with-discount" || scenario === "create-no-discount") return "orders/create";
  return TOPIC;
}

// Fails closed: the only runtime safety check this script can meaningfully
// perform (see the header comment) -- if this constant were ever edited to
// something else, this still catches it, since it compares against the
// one literal URL this entire script exists to target.
function assertStagingEndpoint(url: string): void {
  if (url !== "https://crossbar-os-staging.vercel.app/api/webhooks/shopify") {
    throw new Error(
      `Refusing to proceed: target URL is not the known Crossbar OS Staging endpoint (got "${url}").`
    );
  }
}

function buildSyntheticPayload(orderId: number): ShopifyOrderPayload {
  const now = new Date().toISOString();
  const customerId = orderId - 1; // also negative, also clearly synthetic
  const lineItemId = orderId - 2;

  return {
    id: orderId,
    order_number: Math.abs(orderId) % 100000,
    name: `#TEST${Math.abs(orderId) % 100000}`,
    customer: {
      id: customerId,
      email: `synthetic-customer-${Math.abs(customerId)}@example.invalid`,
      first_name: "Synthetic",
      last_name: "TestCustomer",
      phone: null,
      accepts_marketing: false,
      orders_count: 1,
      total_spent: "42.50",
    },
    email: `synthetic-customer-${Math.abs(customerId)}@example.invalid`,
    phone: null,
    financial_status: "paid",
    fulfillment_status: null,
    currency: "USD",
    subtotal_price: "42.50",
    total_tax: "3.40",
    total_discounts: "0.00",
    total_price: "45.90",
    note: "SYNTHETIC TEST DATA -- Phase 1 Shopify lifecycle sync controlled test. Not a real order.",
    shipping_lines: [{ title: "Synthetic Standard Shipping", price: "0.00" }],
    shipping_address: {
      first_name: "Synthetic",
      last_name: "TestCustomer",
      address1: "123 Test St",
      city: "Testville",
      province: "CA",
      country: "United States",
      zip: "90000",
    },
    billing_address: {
      first_name: "Synthetic",
      last_name: "TestCustomer",
      address1: "123 Test St",
      city: "Testville",
      province: "CA",
      country: "United States",
      zip: "90000",
    },
    source_name: "crossbar_lifecycle_test_script",
    landing_site: null,
    referring_site: null,
    created_at: now,
    updated_at: now,
    cancelled_at: null,
    cancel_reason: null,
    refunds: [],
    line_items: [
      {
        id: lineItemId,
        product_id: null,
        variant_id: null,
        vendor: "Synthetic Test Vendor",
        title: "Synthetic Test Product",
        variant_title: null,
        sku: `TEST-SKU-${Math.abs(lineItemId)}`,
        quantity: 1,
        current_quantity: 1,
        price: "42.50",
        total_discount: "0.00",
        requires_shipping: true,
        taxable: true,
        fulfillment_status: null,
        properties: [],
      },
    ],
    discount_applications: [],
  };
}

function buildLineItem(id: number, title: string, sku: string, quantity: number, price: string) {
  return {
    id,
    product_id: null,
    variant_id: null,
    vendor: "Synthetic Test Vendor",
    title,
    variant_title: null,
    sku,
    quantity,
    current_quantity: quantity,
    price,
    total_discount: "0.00",
    requires_shipping: true,
    taxable: true,
    fulfillment_status: null,
    properties: [],
  };
}

// Test #2: builds the orders/updated payload for one scenario, always
// against the fixed existing test order. Every scenario is a complete
// line-item snapshot (true for every orders/updated touch, per
// isCompleteSnapshotForLifecycleOrderTopic) -- whichever line items are
// included here are the ONLY ones the order has as of this touch; anything
// previously stored but omitted gets removed_at set, never hard-deleted
// (confirmed directly from sync_shopify_order() in the migration).
function buildScenarioPayload(scenario: OrderPayloadScenario, updatedAt: string): ShopifyOrderPayload {
  const lineItemsByScenario: Record<OrderPayloadScenario, ShopifyOrderPayload["line_items"]> = {
    "quantity-update": [
      buildLineItem(ORIGINAL_LINE_ITEM_ID, "Synthetic Test Product", `TEST-SKU-${Math.abs(ORIGINAL_LINE_ITEM_ID)}`, 3, "42.50"),
    ],
    "add-line-item": [
      buildLineItem(ORIGINAL_LINE_ITEM_ID, "Synthetic Test Product", `TEST-SKU-${Math.abs(ORIGINAL_LINE_ITEM_ID)}`, 3, "42.50"),
      buildLineItem(SECOND_LINE_ITEM_ID, "Synthetic Test Product 2", `TEST-SKU-${Math.abs(SECOND_LINE_ITEM_ID)}`, 2, "15.00"),
    ],
    "remove-line-item": [
      buildLineItem(SECOND_LINE_ITEM_ID, "Synthetic Test Product 2", `TEST-SKU-${Math.abs(SECOND_LINE_ITEM_ID)}`, 2, "15.00"),
    ],
    // Deliberately absurd canary value (a real quantity of 999 would never
    // occur) -- chosen so that if staleness rejection ever fails, it's
    // unmistakable in the verification query rather than looking like a
    // plausible real edit.
    "stale-update": [
      buildLineItem(ORIGINAL_LINE_ITEM_ID, "Synthetic Test Product", `TEST-SKU-${Math.abs(ORIGINAL_LINE_ITEM_ID)}`, 999, "42.50"),
    ],
    // CRITICAL: must NOT include the original line item here. It was
    // soft-removed by Test #2's remove-line-item scenario (removed_at
    // set). sync_shopify_order's line-item upsert unconditionally clears
    // removed_at/removed_detected_via on ANY on-conflict touch of a
    // shopify_line_item_id -- re-including it in this snapshot would
    // silently un-remove it, destroying that test's result. Omitting an
    // already-removed item changes nothing (the removal-diff UPDATE only
    // ever touches rows where removed_at is still null), which is exactly
    // what "preserve the existing line-item history" requires here.
    "cancel-order": [
      buildLineItem(SECOND_LINE_ITEM_ID, "Synthetic Test Product 2", `TEST-SKU-${Math.abs(SECOND_LINE_ITEM_ID)}`, 2, "15.00"),
    ],
  };

  return {
    id: EXISTING_TEST_ORDER_ID,
    order_number: Math.abs(EXISTING_TEST_ORDER_ID) % 100000,
    name: "#TEST7910",
    customer: {
      id: EXISTING_TEST_CUSTOMER_ID,
      email: `synthetic-customer-${Math.abs(EXISTING_TEST_CUSTOMER_ID)}@example.invalid`,
      first_name: "Synthetic",
      last_name: "TestCustomer",
      phone: null,
      accepts_marketing: false,
      orders_count: 1,
      total_spent: "42.50",
    },
    email: `synthetic-customer-${Math.abs(EXISTING_TEST_CUSTOMER_ID)}@example.invalid`,
    phone: null,
    // For cancel-order specifically: kept as "paid" rather than guessed as
    // "voided" -- Shopify documents cancellation and refunding as separate
    // operations, so an order cancelled without also being refunded is
    // assumed to keep its prior financial_status. Not independently
    // confirmed against a live payload; adjust here if that assumption
    // turns out to be wrong.
    financial_status: "paid",
    fulfillment_status: null,
    currency: "USD",
    subtotal_price: "42.50",
    total_tax: "3.40",
    total_discounts: "0.00",
    total_price: "45.90",
    note: `SYNTHETIC TEST DATA -- Phase 1 lifecycle Test #2 scenario: ${scenario}. Not a real order.`,
    shipping_lines: [{ title: "Synthetic Standard Shipping", price: "0.00" }],
    shipping_address: {
      first_name: "Synthetic",
      last_name: "TestCustomer",
      address1: "123 Test St",
      city: "Testville",
      province: "CA",
      country: "United States",
      zip: "90000",
    },
    billing_address: {
      first_name: "Synthetic",
      last_name: "TestCustomer",
      address1: "123 Test St",
      city: "Testville",
      province: "CA",
      country: "United States",
      zip: "90000",
    },
    source_name: "crossbar_lifecycle_test_script",
    landing_site: null,
    referring_site: null,
    created_at: APPROXIMATE_EXISTING_ORDER_CREATED_AT,
    updated_at: updatedAt,
    cancelled_at: scenario === "cancel-order" ? updatedAt : null,
    cancel_reason: scenario === "cancel-order" ? "customer" : null,
    refunds: [],
    line_items: lineItemsByScenario[scenario],
    discount_applications: [],
  };
}

// Test #2: strictly-advancing timestamps for the "advancing" scenarios
// (quantity-update, add-line-item, remove-line-item), and a deliberately
// older one for stale-update. Test #1's exact original updated_at is
// unknown to this script, but that's safe: real time only moves forward,
// so "now" is always after whatever Test #1 used, the first time this
// runs. From then on, this script's own state file tracks what IT last
// applied, so later scenarios keep advancing correctly regardless of how
// much real time has passed between runs.
function computeScenarioUpdatedAt(scenario: OrderPayloadScenario, state: Test2State): string {
  const lastAppliedMs = state.lastAppliedUpdatedAt ? new Date(state.lastAppliedUpdatedAt).getTime() : null;

  if (scenario === "stale-update") {
    if (lastAppliedMs === null) {
      throw new Error(
        "No lastAppliedUpdatedAt recorded yet in shopify_lifecycle_test2_state.json -- run " +
          "quantity-update (or another advancing scenario) at least once with --live before " +
          "stale-update, so there is a known-good timestamp to be deliberately older than."
      );
    }
    return new Date(lastAppliedMs - 60 * 60 * 1000).toISOString();
  }

  const now = Date.now();
  const candidate = lastAppliedMs !== null ? Math.max(now, lastAppliedMs + 1000) : now;
  return new Date(candidate).toISOString();
}

// Test #4: refunds/create expects the refund RESOURCE's own standalone REST
// payload (id, order_id, note, restock, created_at, processed_at,
// transactions, refund_line_items) -- confirmed directly from
// ShopifyRefundPayload/normalizeRestRefund in shopifyRestAdapter.ts and from
// ingestLifecycle.ts's processShopifyRefund reading payload.order_id off
// this same object. This is NOT a complete order payload, unlike every
// other scenario above -- structurally different on purpose, which is why
// it gets its own builder and its own dispatch function rather than being
// folded into buildScenarioPayload/runLegacyOrScenario.
//
// A partial refund: quantity 1 out of the second line item's quantity 2,
// targeting the still-ACTIVE line item (-1793031279307913), deliberately
// never the original, already-soft-removed one (-1793031279307912) --
// nothing in sync_shopify_refund would reject refunding a removed item,
// but there's no reason to make verification ambiguous by doing so.
//
// No staleness/monotonic timestamp tracking is needed here (unlike the
// order-level scenarios): Refund has no updatedAt in Shopify's own model,
// so sync_shopify_refund has no staleness check at all -- confirmed from
// the migration. created_at/processed_at can simply use "now".
//
// refund_line_items[].id is intentionally omitted (left undefined, which
// normalizeRestRefund maps to null) -- shopify_refund_line_item_id is
// reference-only in the schema, never used for matching or uniqueness, so
// there's no reason to invent an extra synthetic id beyond the ones
// actually requested.
function buildRefundPayload(): ShopifyRefundPayload {
  const now = new Date().toISOString();
  return {
    id: SYNTHETIC_REFUND_ID,
    order_id: EXISTING_TEST_ORDER_ID,
    note: "SYNTHETIC TEST DATA -- Phase 1 lifecycle Test #4 scenario: refund-order. Not a real refund.",
    restock: true,
    created_at: now,
    processed_at: now,
    transactions: [{ amount: "15.00" }],
    refund_line_items: [
      {
        line_item_id: SECOND_LINE_ITEM_ID,
        quantity: 1,
        subtotal: "15.00",
        total_tax: "0.00",
        restock_type: "return",
      },
    ],
  };
}

// Test #5: fulfillments/create|update expect the fulfillment RESOURCE's own
// standalone REST payload (id, order_id, status, shipment_status,
// tracking_company, tracking_number(s), tracking_url(s), location_id,
// created_at, updated_at, line_items: [{id, quantity}]) -- confirmed
// directly from ShopifyFulfillmentPayload/normalizeRestFulfillment in
// shopifyRestAdapter.ts and from ingestLifecycle.ts's
// processShopifyFulfillment reading payload.order_id off this same
// object, exactly like refunds. NOT a complete order payload.
//
// UNLIKE refunds, sync_shopify_fulfillment DOES have a staleness check
// (incoming updatedAtShopify compared against the stored
// shopify_fulfillments.updated_at_shopify for this shopify_fulfillment_id)
// -- confirmed from the migration. fulfillment-update's updated_at must
// therefore be strictly after fulfillment-create's, and per the explicit
// safeguard requirement this is NOT left to wall-clock timing between two
// separate invocations: it's tracked in the state file
// (fulfillmentCreatedAtShopify/lastFulfillmentUpdatedAt), and
// fulfillment-update fails closed with a clear error if no successful
// fulfillment-create has been recorded yet.
//
// requiresShipping/displayStatus/inTransitAt/deliveredAt/
// estimatedDeliveryAt are always null via this REST path -- confirmed
// from normalizeRestFulfillment itself, which hard-codes them (GraphQL-only
// concepts with no REST equivalent). Not something this test can exercise.
function buildFulfillmentPayload(
  action: "create" | "update",
  state: Test2State
): { payload: ShopifyFulfillmentPayload; updatedAtUsed: string; createdAtUsed: string } {
  const now = new Date().toISOString();

  if (action === "create") {
    const createdAtUsed = now;
    const updatedAtUsed = now;
    return {
      createdAtUsed,
      updatedAtUsed,
      payload: {
        id: SYNTHETIC_FULFILLMENT_ID,
        order_id: EXISTING_TEST_ORDER_ID,
        status: "success",
        shipment_status: null,
        tracking_company: null,
        tracking_numbers: [],
        tracking_urls: [],
        location_id: null,
        created_at: createdAtUsed,
        updated_at: updatedAtUsed,
        line_items: [{ id: SECOND_LINE_ITEM_ID, quantity: 1 }],
      },
    };
  }

  // action === "update"
  if (!state.fulfillmentCreatedAtShopify) {
    throw new Error(
      "No recorded successful fulfillment-create found in shopify_lifecycle_test2_state.json -- " +
        "run `--scenario fulfillment-create --live` first, so there is a known-good created_at/" +
        "updated_at to build on and to guarantee fulfillment-update lands strictly after it."
    );
  }
  const lastUpdatedMs = state.lastFulfillmentUpdatedAt
    ? new Date(state.lastFulfillmentUpdatedAt).getTime()
    : new Date(state.fulfillmentCreatedAtShopify).getTime();
  const updatedAtUsed = new Date(Math.max(Date.now(), lastUpdatedMs + 1000)).toISOString();

  return {
    createdAtUsed: state.fulfillmentCreatedAtShopify,
    updatedAtUsed,
    payload: {
      id: SYNTHETIC_FULFILLMENT_ID,
      order_id: EXISTING_TEST_ORDER_ID,
      status: "success",
      shipment_status: "in_transit",
      tracking_company: "Synthetic Freight Co",
      tracking_numbers: ["1Z999AA10123456784"],
      tracking_urls: ["https://example.invalid/track/1Z999AA10123456784"],
      location_id: null,
      created_at: state.fulfillmentCreatedAtShopify, // preserved, never regenerated
      updated_at: updatedAtUsed,
      line_items: [{ id: SECOND_LINE_ITEM_ID, quantity: 1 }], // same line item/quantity -- demonstrates convergence, not duplication
    },
  };
}

// Phase 1, Milestone 3: create-with-discount / create-no-discount --
// orders/create discount capture. Unlike every scenario above, these
// generate a FRESH synthetic order each run (never EXISTING_TEST_ORDER_ID)
// since orders/create only ever fires once per order -- "has a discount"
// and "confirmed no discount" are necessarily two separate orders, not
// two touches of the same one. Built on top of buildSyntheticPayload
// (Test #1's own fresh-order builder) rather than duplicating its
// boilerplate -- only the discount-relevant fields differ.
//
// orders/create's order/line-item write (ingest.ts's processShopifyOrder,
// via the OLD upsertNormalizedOrder() path) is UNCONDITIONAL -- never
// gated by SHOPIFY_LIFECYCLE_TOPICS_ENABLED, unlike every scenario above.
// Only the NEW, additive discount-capture call (Phase 1 Milestone 3) is
// flag-gated, and by a DIFFERENT, independent flag: SHOPIFY_CAPTURE_
// DISCOUNTS (never SHOPIFY_LIFECYCLE_TOPICS_ENABLED).
function buildOrderCreatePayload(orderId: number, withDiscount: boolean): ShopifyOrderPayload {
  const base = buildSyntheticPayload(orderId);
  if (!withDiscount) {
    // base already carries discount_applications: [] and no
    // discount_allocations on its one line item -- Shopify's own
    // "confirmed zero discounts" shape, not "no opinion."
    return base;
  }

  // Mirrors real production order #15065 exactly -- the same fixture
  // shape already proven in
  // frontend/scripts/verifyShopifyLifecycleIngestion.ts's unit test and
  // database/tests/shopify_order_lifecycle_sync_test.sql's test 18: a
  // $60.00 fixed-amount discount code, capped by Shopify to $54.72
  // actually allocated against this order's one line item. The
  // configured value (60) and the actually-allocated amount (54.72) must
  // land in separate fields and must never be equal to each other once
  // verified -- see the verification SQL printed after a live send.
  const [lineItem] = base.line_items!;
  const discountedLineItem = {
    ...lineItem,
    price: "54.72",
    discount_allocations: [{ amount: "54.72", discount_application_index: 0 }],
  };

  return {
    ...base,
    subtotal_price: "54.72",
    total_tax: "0.00",
    total_discounts: "54.72",
    total_price: "0.00",
    line_items: [discountedLineItem],
    discount_applications: [
      {
        type: "discount_code",
        code: "8PW77TL",
        value_type: "fixed_amount",
        value: "60.0",
        target_type: "line_item",
        target_selection: "explicit",
        allocation_method: "across",
      },
    ],
  };
}

async function runOrderCreateScenario(options: CliOptions, withDiscount: boolean): Promise<void> {
  const secret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!secret) {
    throw new Error(
      "SHOPIFY_CLIENT_SECRET is not set in frontend/.env.local -- required to sign the request. " +
        "Never printed by this script; set it locally to the SAME value configured on the Crossbar OS Staging Vercel project."
    );
  }
  const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN ?? null;

  const payload = buildOrderCreatePayload(options.orderId, withDiscount);
  const rawBody = JSON.stringify(payload);
  const hmac = computeHmac(rawBody, secret);
  const topic = "orders/create";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Shopify-Topic": topic,
    "X-Shopify-Hmac-Sha256": hmac,
    "X-Shopify-Webhook-Id": options.webhookId,
    ...(shopDomain ? { "X-Shopify-Shop-Domain": shopDomain } : {}),
  };

  console.log(
    `=== Shopify lifecycle webhook test: orders/create (scenario: ${withDiscount ? "create-with-discount" : "create-no-discount"}) ===`
  );
  console.log(`Mode:                 ${options.mode}`);
  console.log(`Target endpoint:      ${STAGING_ENDPOINT}`);
  console.log(`Topic:                ${topic}`);
  console.log(`Shopify order id:     ${payload.id}  (fresh, negative -- cannot collide with a real Shopify order)`);
  console.log(`Shopify customer id:  ${payload.customer!.id}`);
  console.log(`Line item id(s):      ${(payload.line_items ?? []).map((item) => item.id).join(", ")}`);
  console.log(`Webhook delivery id:  ${options.webhookId}`);
  console.log(
    `Shop domain header:   ${shopDomain ?? "(not set locally -- omitted; only required if staging enforces SHOPIFY_SHOP_DOMAIN)"}`
  );
  console.log(`Computed HMAC (sha256, base64): ${hmac}`);
  console.log(`Request body (${rawBody.length} bytes):`);
  console.log(rawBody);

  console.log("\nExpected behavior if sent:");
  console.log("  1. HMAC verified against SHOPIFY_CLIENT_SECRET configured on staging.");
  console.log("  2. A new shopify_webhook_events row inserted (status: received -> processed).");
  console.log("  3. orders/create is UNCONDITIONAL -- never gated by SHOPIFY_LIFECYCLE_TOPICS_ENABLED --");
  console.log("     so a new shopify_orders row, one shopify_order_line_items row, and one");
  console.log("     shopify_customers row are written regardless of that flag's state.");
  if (withDiscount) {
    console.log("  4. ONLY IF SHOPIFY_CAPTURE_DISCOUNTS=true on staging (a SEPARATE flag from");
    console.log("     SHOPIFY_LIFECYCLE_TOPICS_ENABLED): one shopify_order_discounts row (code");
    console.log("     8PW77TL, value_amount 60.00) and one shopify_order_discount_allocations row");
    console.log("     (allocated_amount 54.72) are also written. If that flag is NOT enabled, the");
    console.log("     order/line item above are still written (step 3), but NO discount row is --");
    console.log("     there is no HTTP-visible signal distinguishing these two cases; the");
    console.log("     verification SQL below is the only way to tell.");
  } else {
    console.log('  4. discount_applications is an explicit empty array ("confirmed zero", not "no');
    console.log('     opinion") -- even with SHOPIFY_CAPTURE_DISCOUNTS=true, this must produce ZERO');
    console.log("     shopify_order_discounts rows for this order.");
  }

  if (options.mode === "dry-run") {
    console.log("\n--dry-run: nothing was sent.");
    return;
  }

  console.log("\nAbout to send ONE real HTTP request to the staging endpoint above.");
  const confirmed = await promptForConfirmation(
    'Type exactly "SEND" (without quotes) to proceed, or anything else to abort: '
  );
  if (!confirmed) {
    console.log("Aborted -- nothing was sent.");
    return;
  }

  const response = await sendRequest(rawBody, headers);
  console.log(`\nResponse: ${response.status} ${response.statusText}`);
  console.log(response.text);

  const orderIdForSql = payload.id;
  console.log("\n=== Verification (run in the Crossbar OS Staging SQL Editor) ===");
  console.log(`select * from shopify_webhook_events where shopify_webhook_id = '${options.webhookId}';`);
  console.log(`select * from shopify_orders where shopify_order_id = ${orderIdForSql};`);
  console.log(
    `select shopify_line_item_id, quantity, price from shopify_order_line_items where order_id = (select id from shopify_orders where shopify_order_id = ${orderIdForSql});`
  );
  if (withDiscount) {
    console.log(
      `select id, code, application_type, value_type, value_amount from shopify_order_discounts where order_id = (select id from shopify_orders where shopify_order_id = ${orderIdForSql});`
    );
    console.log(
      `select sum(allocated_amount) as total_allocated from shopify_order_discount_allocations where order_discount_id = (select id from shopify_order_discounts where order_id = (select id from shopify_orders where shopify_order_id = ${orderIdForSql}));`
    );
    console.log("-- Expect: code = '8PW77TL', value_amount = 60.00, total_allocated = 54.72 -- the");
    console.log("-- configured value and the actually-allocated total must be DIFFERENT numbers.");
  } else {
    console.log(
      `select count(*) as discount_row_count from shopify_order_discounts where order_id = (select id from shopify_orders where shopify_order_id = ${orderIdForSql});`
    );
    console.log("-- Expect: discount_row_count = 0.");
  }

  console.log(
    "\n=== Cleanup (run manually in the Crossbar OS Staging SQL Editor, after you're done inspecting -- NOT run automatically) ==="
  );
  console.log("-- Deletes cascade to line items/discounts/fulfillments/refunds via existing FKs.");
  console.log(`delete from shopify_orders where shopify_order_id = ${orderIdForSql};`);
  console.log(`delete from shopify_customers where shopify_customer_id = ${payload.customer!.id};`);
  console.log(`delete from shopify_webhook_events where shopify_webhook_id = '${options.webhookId}';`);

  if (response.status === 200) {
    const state = readState();
    writeState({ ...state, lastLiveRequest: { url: STAGING_ENDPOINT, headers, body: rawBody } });
    console.log(`\n(State saved to ${STATE_FILE_PATH})`);
  }
}

function computeHmac(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
}

async function promptForConfirmation(question: string): Promise<boolean> {
  const readline = await import("node:readline/promises");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(question);
    return answer.trim() === "SEND";
  } finally {
    rl.close();
  }
}

function describeExpectedBehavior(scenario: Scenario | null): void {
  console.log("\nExpected behavior if sent:");
  if (scenario === null) {
    console.log("  1. HMAC verified against SHOPIFY_CLIENT_SECRET configured on staging.");
    console.log("  2. A new shopify_webhook_events row inserted (status: received -> processed).");
    console.log(`  3. If SHOPIFY_LIFECYCLE_TOPICS_ENABLED on staging includes "${TOPIC}": a new`);
    console.log("     shopify_orders row is created (this order id has never been seen before) via");
    console.log("     sync_shopify_order, plus one shopify_order_line_items row, plus one");
    console.log("     shopify_customers row.");
    console.log(`  4. If "${TOPIC}" is NOT enabled on staging: the event is recorded and marked`);
    console.log('     processed with status "disabled" -- no business-table row is written at all.');
    return;
  }
  switch (scenario) {
    case "quantity-update":
      console.log(`  The existing line item (shopify_line_item_id ${ORIGINAL_LINE_ITEM_ID}) has its`);
      console.log("  quantity updated from whatever it currently is to 3. No new row is created.");
      break;
    case "add-line-item":
      console.log(`  The existing line item (${ORIGINAL_LINE_ITEM_ID}) is retained at quantity 3, and a`);
      console.log(`  new second line item (${SECOND_LINE_ITEM_ID}) is inserted. Two rows should exist`);
      console.log("  afterward, both with removed_at still null.");
      break;
    case "remove-line-item":
      console.log(`  The original line item (${ORIGINAL_LINE_ITEM_ID}) is OMITTED from this complete`);
      console.log("  snapshot, so sync_shopify_order sets its removed_at/removed_detected_via -- the");
      console.log(`  row is NOT deleted. The second item (${SECOND_LINE_ITEM_ID}) stays untouched.`);
      break;
    case "stale-update":
      console.log("  updated_at is deliberately older than the last applied touch, so sync_shopify_order");
      console.log("  should reject this entirely -- the quantity-999 canary value must NOT appear in");
      console.log("  shopify_order_line_items afterward. The HTTP response alone cannot confirm this --");
      console.log("  see the verification SQL printed after sending.");
      break;
    case "cancel-order":
      console.log(`  Topic is orders/cancelled, not orders/updated. shopify_orders.cancelled_at/cancel_reason`);
      console.log("  should be populated; financial_status is sent as \"paid\" (unchanged -- see comment in");
      console.log(`  buildScenarioPayload). line_items carries ONLY the second item (${SECOND_LINE_ITEM_ID});`);
      console.log(`  the original, already-removed item (${ORIGINAL_LINE_ITEM_ID}) is deliberately omitted`);
      console.log("  so its removed_at marker is preserved, not cleared.");
      console.log('  IMPORTANT: check the actual response body below for "processed" vs "disabled" --');
      console.log("  orders/cancelled may not be in SHOPIFY_LIFECYCLE_TOPICS_ENABLED on staging even though");
      console.log('  orders/updated is; a "disabled" response means nothing was written despite the 200.');
      break;
  }
}

async function sendRequest(
  rawBody: string,
  headers: Record<string, string>
): Promise<{ status: number; statusText: string; text: string }> {
  const response = await fetch(STAGING_ENDPOINT, { method: "POST", headers, body: rawBody });
  const text = await response.text();
  return { status: response.status, statusText: response.statusText, text };
}

async function runLegacyOrScenario(options: CliOptions): Promise<void> {
  const secret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!secret) {
    throw new Error(
      "SHOPIFY_CLIENT_SECRET is not set in frontend/.env.local -- required to sign the request. " +
        "Never printed by this script; set it locally to the SAME value configured on the Crossbar OS Staging Vercel project."
    );
  }
  const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN ?? null;

  const scenario = options.scenario as OrderPayloadScenario | null;
  const state = readState();

  const payload = scenario
    ? buildScenarioPayload(scenario, computeScenarioUpdatedAt(scenario, state))
    : buildSyntheticPayload(options.orderId);

  const rawBody = JSON.stringify(payload);
  const hmac = computeHmac(rawBody, secret);
  const topic = scenarioTopic(scenario);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Shopify-Topic": topic,
    "X-Shopify-Hmac-Sha256": hmac,
    "X-Shopify-Webhook-Id": options.webhookId,
    ...(shopDomain ? { "X-Shopify-Shop-Domain": shopDomain } : {}),
  };

  console.log(`=== Shopify lifecycle webhook test: ${topic}${scenario ? ` (scenario: ${scenario})` : ""} ===`);
  console.log(`Mode:                 ${options.mode}`);
  console.log(`Target endpoint:      ${STAGING_ENDPOINT}`);
  console.log(`Topic:                ${topic}`);
  console.log(`Shopify order id:     ${payload.id}  (negative -- cannot collide with a real Shopify order)`);
  console.log(`Shopify customer id:  ${payload.customer!.id}`);
  console.log(`Line item id(s):      ${(payload.line_items ?? []).map((item) => item.id).join(", ")}`);
  console.log(`updated_at:           ${payload.updated_at}`);
  console.log(`Webhook delivery id:  ${options.webhookId}`);
  console.log(`Shop domain header:   ${shopDomain ?? "(not set locally -- omitted; only required if staging enforces SHOPIFY_SHOP_DOMAIN)"}`);
  console.log(`Computed HMAC (sha256, base64): ${hmac}`);
  console.log(`Request body (${rawBody.length} bytes):`);
  console.log(rawBody);
  describeExpectedBehavior(scenario);

  if (options.mode === "dry-run") {
    console.log("\n--dry-run: nothing was sent.");
    return;
  }

  console.log("\nAbout to send ONE real HTTP request to the staging endpoint above.");
  const confirmed = await promptForConfirmation('Type exactly "SEND" (without quotes) to proceed, or anything else to abort: ');
  if (!confirmed) {
    console.log("Aborted -- nothing was sent.");
    return;
  }

  const response = await sendRequest(rawBody, headers);
  console.log(`\nResponse: ${response.status} ${response.statusText}`);
  console.log(response.text);

  const orderIdForSql = payload.id;
  console.log("\n=== Verification (run in the Crossbar OS Staging SQL Editor) ===");
  console.log(`select * from shopify_webhook_events where shopify_webhook_id = '${options.webhookId}';`);
  console.log(`select * from shopify_orders where shopify_order_id = ${orderIdForSql};`);
  console.log(
    `select shopify_line_item_id, quantity, removed_at, removed_detected_via from shopify_order_line_items where order_id = (select id from shopify_orders where shopify_order_id = ${orderIdForSql}) order by shopify_line_item_id desc;`
  );
  if (scenario === "cancel-order") {
    // Order-level cancellation fields, checked separately from the
    // line-items query above (which confirms preservation: the original
    // item's removed_at/removed_detected_via must be unchanged, still set
    // from Test #2's remove-line-item scenario, and the second item must
    // still be present and active).
    console.log(
      `select financial_status, cancelled_at, cancel_reason from shopify_orders where shopify_order_id = ${orderIdForSql};`
    );
  }

  if (!scenario) {
    console.log("\n=== Cleanup (run manually in the Crossbar OS Staging SQL Editor, after you're done inspecting) ===");
    console.log("-- Deletes cascade to line items/discounts/fulfillments/refunds via existing FKs.");
    console.log(`delete from shopify_orders where shopify_order_id = ${orderIdForSql};`);
    console.log(`delete from shopify_customers where shopify_customer_id = ${payload.customer!.id};`);
    console.log(`delete from shopify_webhook_events where shopify_webhook_id = '${options.webhookId}';`);
    return;
  }

  // Test #2 state persistence: only on a successful send, and never for
  // stale-update (that touch must not become the new "last known good"
  // baseline, since it's expected to be rejected).
  if (response.status === 200) {
    const newState: Test2State = { ...state, lastLiveRequest: { url: STAGING_ENDPOINT, headers, body: rawBody } };
    if (scenario !== "stale-update") {
      newState.lastAppliedUpdatedAt = payload.updated_at!;
    }
    writeState(newState);
    console.log(`\n(State saved to ${STATE_FILE_PATH})`);
  }
}

async function runReplayDuplicate(mode: "dry-run" | "live"): Promise<void> {
  const state = readState();
  const last = state.lastLiveRequest;
  if (!last) {
    throw new Error(
      "No prior live request recorded in shopify_lifecycle_test2_state.json -- run another " +
        "scenario with --live at least once before replay-duplicate, so there is a real request to resend."
    );
  }

  console.log("=== Shopify lifecycle webhook test: replay-duplicate ===");
  console.log(`Mode:              ${mode}`);
  console.log(`Target endpoint:   ${last.url}`);
  console.log("Resending the exact bytes/headers of the last live scenario request, including its");
  console.log("original X-Shopify-Webhook-Id, to verify delivery-level deduplication.");
  console.log(`Headers: ${JSON.stringify(last.headers, null, 2)}`);
  console.log(`Body (${last.body.length} bytes):`);
  console.log(last.body);
  console.log('\nExpected behavior: HTTP 200 {"status":"duplicate"}, and shopify_webhook_events must');
  console.log("still show exactly ONE row for this delivery id -- the resend must not insert a second one,");
  console.log("and must not re-run normalization (no row's data should change as a result of this resend).");

  if (mode === "dry-run") {
    console.log("\n--dry-run: nothing was sent.");
    return;
  }

  console.log("\nAbout to resend ONE real HTTP request (an exact duplicate) to the staging endpoint above.");
  const confirmed = await promptForConfirmation('Type exactly "SEND" (without quotes) to proceed, or anything else to abort: ');
  if (!confirmed) {
    console.log("Aborted -- nothing was sent.");
    return;
  }

  const response = await sendRequest(last.body, last.headers);
  console.log(`\nResponse: ${response.status} ${response.statusText}`);
  console.log(response.text);

  const webhookId = last.headers["X-Shopify-Webhook-Id"];
  console.log("\n=== Verification (run in the Crossbar OS Staging SQL Editor) ===");
  console.log(`select status, count(*) from shopify_webhook_events where shopify_webhook_id = '${webhookId}' group by status;`);
  console.log("-- Expect exactly one row total (status: processed), not two.");
}

// Test #4: refund-order gets its own dedicated flow, parallel to
// runReplayDuplicate above, rather than being folded into
// runLegacyOrScenario -- its payload is a standalone refund resource, not
// an order payload, so the shared order-shaped logging/dispatch in that
// function doesn't apply here.
async function runRefundOrderScenario(options: CliOptions): Promise<void> {
  const secret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!secret) {
    throw new Error(
      "SHOPIFY_CLIENT_SECRET is not set in frontend/.env.local -- required to sign the request. " +
        "Never printed by this script; set it locally to the SAME value configured on the Crossbar OS Staging Vercel project."
    );
  }
  const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN ?? null;

  const payload = buildRefundPayload();
  const rawBody = JSON.stringify(payload);
  const hmac = computeHmac(rawBody, secret);
  const topic = scenarioTopic("refund-order");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Shopify-Topic": topic,
    "X-Shopify-Hmac-Sha256": hmac,
    "X-Shopify-Webhook-Id": options.webhookId,
    ...(shopDomain ? { "X-Shopify-Shop-Domain": shopDomain } : {}),
  };

  console.log("=== Shopify lifecycle webhook test: refunds/create (scenario: refund-order) ===");
  console.log(`Mode:                 ${options.mode}`);
  console.log(`Target endpoint:      ${STAGING_ENDPOINT}`);
  console.log(`Topic:                ${topic}`);
  console.log(`Shopify order id:     ${payload.order_id}  (existing synthetic order -- reused, never created fresh)`);
  console.log(`Synthetic refund id:  ${payload.id}`);
  console.log(`Refunding line item:  ${payload.refund_line_items![0].line_item_id}  (quantity ${payload.refund_line_items![0].quantity})`);
  console.log(`Webhook delivery id:  ${options.webhookId}`);
  console.log(`Shop domain header:   ${shopDomain ?? "(not set locally -- omitted; only required if staging enforces SHOPIFY_SHOP_DOMAIN)"}`);
  console.log(`Computed HMAC (sha256, base64): ${hmac}`);
  console.log(`Request body (${rawBody.length} bytes):`);
  console.log(rawBody);
  console.log("\nExpected behavior if sent:");
  console.log("  A new shopify_refunds row (shopify_refund_id " + payload.id + ") and one");
  console.log("  shopify_refund_line_items row (quantity 1 against line item " + payload.refund_line_items![0].line_item_id + ").");
  console.log("  Neither existing shopify_order_line_items row is modified by this -- sync_shopify_refund");
  console.log("  never touches that table or shopify_orders at all, only shopify_refunds/_line_items.");
  console.log('  IMPORTANT: check the actual response body below for "processed" vs "disabled" -- refunds/create');
  console.log("  is its own separate entry in SHOPIFY_LIFECYCLE_TOPICS_ENABLED, independent of orders/updated");
  console.log("  and orders/cancelled. Unlike those, sync_shopify_refund has no staleness check at all (Refund");
  console.log('  has no updatedAt in Shopify\'s model), so once enabled, a real "processed" response here can');
  console.log("  be trusted directly -- there is no silent no-op path to double-check against.");

  if (options.mode === "dry-run") {
    console.log("\n--dry-run: nothing was sent.");
    return;
  }

  console.log("\nAbout to send ONE real HTTP request to the staging endpoint above.");
  const confirmed = await promptForConfirmation('Type exactly "SEND" (without quotes) to proceed, or anything else to abort: ');
  if (!confirmed) {
    console.log("Aborted -- nothing was sent.");
    return;
  }

  const response = await sendRequest(rawBody, headers);
  console.log(`\nResponse: ${response.status} ${response.statusText}`);
  console.log(response.text);

  console.log("\n=== Verification (run in the Crossbar OS Staging SQL Editor) ===");
  console.log(`select * from shopify_webhook_events where shopify_webhook_id = '${options.webhookId}';`);
  console.log(`select * from shopify_refunds where shopify_refund_id = ${payload.id};`);
  console.log(
    `select shopify_line_item_id, quantity, subtotal, total_tax, restock_type, restocked from shopify_refund_line_items where refund_id = (select id from shopify_refunds where shopify_refund_id = ${payload.id});`
  );
  console.log(
    `select shopify_line_item_id, quantity, removed_at, removed_detected_via from shopify_order_line_items where order_id = (select id from shopify_orders where shopify_order_id = ${EXISTING_TEST_ORDER_ID}) order by shopify_line_item_id desc;`
  );
  console.log("-- Last query confirms both existing line items are unchanged by this refund (quantities,");
  console.log("-- removed_at/removed_detected_via all identical to before sending).");

  // lastAppliedUpdatedAt is deliberately NOT touched here -- irrelevant to
  // a refund event, and changing it would misrepresent the order's own
  // last-known updated_at for future order-level scenarios.
  if (response.status === 200) {
    const state = readState();
    writeState({ ...state, lastLiveRequest: { url: STAGING_ENDPOINT, headers, body: rawBody } });
    console.log(`\n(State saved to ${STATE_FILE_PATH})`);
  }
}

// Test #5: fulfillment-create and fulfillment-update share this one flow
// (parallel to runRefundOrderScenario) -- their payload shape and dispatch
// are identical, differing only in field values via buildFulfillmentPayload.
async function runFulfillmentScenario(options: CliOptions, action: "create" | "update"): Promise<void> {
  const secret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!secret) {
    throw new Error(
      "SHOPIFY_CLIENT_SECRET is not set in frontend/.env.local -- required to sign the request. " +
        "Never printed by this script; set it locally to the SAME value configured on the Crossbar OS Staging Vercel project."
    );
  }
  const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN ?? null;

  const state = readState();
  // buildFulfillmentPayload itself fails closed (throws) for action ===
  // "update" when no prior successful fulfillment-create is recorded --
  // deliberately not caught here, so the error surfaces plainly.
  const { payload, updatedAtUsed, createdAtUsed } = buildFulfillmentPayload(action, state);

  const rawBody = JSON.stringify(payload);
  const hmac = computeHmac(rawBody, secret);
  const scenario: Scenario = action === "create" ? "fulfillment-create" : "fulfillment-update";
  const topic = scenarioTopic(scenario);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Shopify-Topic": topic,
    "X-Shopify-Hmac-Sha256": hmac,
    "X-Shopify-Webhook-Id": options.webhookId,
    ...(shopDomain ? { "X-Shopify-Shop-Domain": shopDomain } : {}),
  };

  console.log(`=== Shopify lifecycle webhook test: ${topic} (scenario: ${scenario}) ===`);
  console.log(`Mode:                 ${options.mode}`);
  console.log(`Target endpoint:      ${STAGING_ENDPOINT}`);
  console.log(`Topic:                ${topic}`);
  console.log(`Shopify order id:     ${payload.order_id}  (existing synthetic order -- reused, never created fresh)`);
  console.log(`Synthetic fulfillment id: ${payload.id}`);
  console.log(`Fulfilled line item:  ${payload.line_items![0].id}  (quantity ${payload.line_items![0].quantity})`);
  console.log(`created_at (Shopify): ${createdAtUsed}${action === "update" ? "  (preserved from fulfillment-create)" : ""}`);
  console.log(`updated_at (Shopify): ${updatedAtUsed}`);
  console.log(`status/shipment_status: ${payload.status} / ${payload.shipment_status ?? "(none)"}`);
  console.log(`tracking: ${payload.tracking_company ?? "(none)"} ${payload.tracking_numbers?.join(", ") || "(none)"}`);
  console.log(`Webhook delivery id:  ${options.webhookId}`);
  console.log(`Shop domain header:   ${shopDomain ?? "(not set locally -- omitted; only required if staging enforces SHOPIFY_SHOP_DOMAIN)"}`);
  console.log(`Computed HMAC (sha256, base64): ${hmac}`);
  console.log(`Request body (${rawBody.length} bytes):`);
  console.log(rawBody);
  console.log("\nExpected behavior if sent:");
  if (action === "create") {
    console.log(`  A new shopify_fulfillments row (shopify_fulfillment_id ${payload.id}) and one`);
    console.log(`  shopify_fulfillment_line_items row (quantity 1 against line item ${payload.line_items![0].id}).`);
  } else {
    console.log(`  The SAME shopify_fulfillments row (shopify_fulfillment_id ${payload.id}) is updated in`);
    console.log("  place (natural-key upsert, not a second row) with the new tracking/shipment_status");
    console.log("  fields. Its one line-item row is deleted and reinserted (full-replace), converging to");
    console.log("  the same single row again -- not duplicated.");
  }
  console.log("  Neither existing shopify_order_line_items row is modified by this -- sync_shopify_fulfillment");
  console.log("  never touches that table or shopify_orders at all (beyond a stub-order insert that doesn't");
  console.log("  apply here, since the order already exists), only shopify_fulfillments/_line_items.");
  console.log('  IMPORTANT: a "processed" HTTP response confirms the request was accepted and dispatched');
  console.log("  without an exception -- it does NOT by itself confirm the row was written as expected.");
  console.log(`  fulfillments/${action === "create" ? "create" : "update"} is its own separate entry in`);
  console.log("  SHOPIFY_LIFECYCLE_TOPICS_ENABLED, independent of every other topic tested so far -- a");
  console.log('  "disabled" response means nothing was written despite the 200. And unlike refunds,');
  console.log("  sync_shopify_fulfillment DOES have a staleness check, so even a \"processed\" response");
  console.log("  could in principle reflect a silent no-op if updated_at somehow wasn't actually newer --");
  console.log("  the verification SQL below, not the response body, is the only real confirmation.");

  if (options.mode === "dry-run") {
    console.log("\n--dry-run: nothing was sent.");
    return;
  }

  console.log("\nAbout to send ONE real HTTP request to the staging endpoint above.");
  const confirmed = await promptForConfirmation('Type exactly "SEND" (without quotes) to proceed, or anything else to abort: ');
  if (!confirmed) {
    console.log("Aborted -- nothing was sent.");
    return;
  }

  const response = await sendRequest(rawBody, headers);
  console.log(`\nResponse: ${response.status} ${response.statusText}`);
  console.log(response.text);

  console.log("\n=== Verification (run in the Crossbar OS Staging SQL Editor) ===");
  console.log(`select * from shopify_webhook_events where shopify_webhook_id = '${options.webhookId}';`);
  console.log(`select * from shopify_fulfillments where shopify_fulfillment_id = ${payload.id};`);
  console.log(
    `select order_line_item_id, shopify_line_item_id, quantity from shopify_fulfillment_line_items where fulfillment_id = (select id from shopify_fulfillments where shopify_fulfillment_id = ${payload.id});`
  );
  console.log(
    `select shopify_line_item_id, quantity, removed_at, removed_detected_via from shopify_order_line_items where order_id = (select id from shopify_orders where shopify_order_id = ${EXISTING_TEST_ORDER_ID}) order by shopify_line_item_id desc;`
  );
  console.log("-- Last query confirms both existing line items are unchanged by this fulfillment event.");

  // lastAppliedUpdatedAt is deliberately NOT touched here -- irrelevant to
  // a fulfillment event, same reasoning as refunds.
  if (response.status === 200) {
    const newState: Test2State = {
      ...state,
      lastLiveRequest: { url: STAGING_ENDPOINT, headers, body: rawBody },
    };
    if (action === "create") {
      newState.fulfillmentCreatedAtShopify = createdAtUsed;
    }
    newState.lastFulfillmentUpdatedAt = updatedAtUsed;
    writeState(newState);
    console.log(`\n(State saved to ${STATE_FILE_PATH})`);
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  assertStagingEndpoint(STAGING_ENDPOINT);

  if (options.scenario === "replay-duplicate") {
    await runReplayDuplicate(options.mode);
    return;
  }

  if (options.scenario === "refund-order") {
    await runRefundOrderScenario(options);
    return;
  }

  if (options.scenario === "fulfillment-create" || options.scenario === "fulfillment-update") {
    await runFulfillmentScenario(options, options.scenario === "fulfillment-create" ? "create" : "update");
    return;
  }

  if (options.scenario === "create-with-discount" || options.scenario === "create-no-discount") {
    await runOrderCreateScenario(options, options.scenario === "create-with-discount");
    return;
  }

  await runLegacyOrScenario(options);
}

main().catch((err) => {
  console.error("FAILED:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
