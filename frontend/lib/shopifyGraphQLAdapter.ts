import type {
  NormalizedShopifyCustomer,
  NormalizedShopifyLineItem,
  NormalizedShopifyOrder,
} from "@/lib/shopifyNormalized";
import { shopifyAdminGraphQL } from "@/lib/shopifyAdminClient";

// Adapter from Shopify's GraphQL Admin API order shape into the canonical
// NormalizedShopifyOrder, used only by the historical-import script.
//
// IMPORTANT: the field selections and shapes below are a design based on
// current (as of this implementation) Shopify documentation, not an
// independently-confirmed-against-the-live-schema specification. Before
// relying on this for a real backfill, validate every field here --
// refunds, refund transactions, mailing addresses, customer email/phone,
// customerJourneySummary, and every LineItem field -- against the live
// Admin API schema for the API version actually in use (schema
// introspection / GraphiQL against the real store), and adjust if the live
// schema rejects or reshapes anything. A --dry-run run exercises this for
// free: it's a real Shopify API call, so any invalid field surfaces as a
// GraphQL error before any Supabase write is attempted.

interface GraphQLMoneyBag {
  shopMoney?: { amount?: string | number | null } | null;
}

interface GraphQLCustomAttribute {
  key?: string | null;
  value?: string | null;
}

interface GraphQLLineItemNode {
  id: string;
  product?: { id: string } | null;
  variant?: { id: string } | null;
  vendor?: string | null;
  title?: string | null;
  variantTitle?: string | null;
  sku?: string | null;
  quantity?: number | null;
  currentQuantity?: number | null;
  originalUnitPriceSet?: GraphQLMoneyBag | null;
  totalDiscountSet?: GraphQLMoneyBag | null;
  requiresShipping?: boolean | null;
  taxable?: boolean | null;
  customAttributes?: GraphQLCustomAttribute[] | null;
}

interface GraphQLLineItemConnection {
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
  nodes: GraphQLLineItemNode[];
}

interface GraphQLRefundTransaction {
  status?: string | null;
  amountSet?: GraphQLMoneyBag | null;
}

interface GraphQLRefund {
  totalRefundedSet?: GraphQLMoneyBag | null;
  transactions?: { nodes: GraphQLRefundTransaction[] } | null;
}

interface GraphQLCustomerVisit {
  landingPage?: string | null;
  referrerUrl?: string | null;
}

interface GraphQLCustomer {
  id: string;
  defaultEmailAddress?: { emailAddress?: string | null } | null;
  defaultPhoneNumber?: { phoneNumber?: string | null } | null;
  firstName?: string | null;
  lastName?: string | null;
  numberOfOrders?: number | string | null;
  amountSpent?: { amount?: string | number | null } | null;
}

export interface GraphQLOrderNode {
  id: string;
  name?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  cancelledAt?: string | null;
  displayFinancialStatus?: string | null;
  displayFulfillmentStatus?: string | null;
  currencyCode?: string | null;
  note?: string | null;
  subtotalPriceSet?: GraphQLMoneyBag | null;
  totalTaxSet?: GraphQLMoneyBag | null;
  totalDiscountsSet?: GraphQLMoneyBag | null;
  totalShippingPriceSet?: GraphQLMoneyBag | null;
  totalPriceSet?: GraphQLMoneyBag | null;
  shippingAddress?: Record<string, unknown> | null;
  billingAddress?: Record<string, unknown> | null;
  sourceName?: string | null;
  customerJourneySummary?: { lastVisit?: GraphQLCustomerVisit | null } | null;
  customer?: GraphQLCustomer | null;
  refunds?: GraphQLRefund[] | null;
  lineItems: GraphQLLineItemConnection;
}

function extractNumericId(gid: string | null | undefined): number | null {
  if (!gid) return null;
  const match = gid.match(/(\d+)$/);
  if (!match) return null;
  const num = Number(match[1]);
  return Number.isFinite(num) ? num : null;
}

function toMoneyNumber(moneyBag: GraphQLMoneyBag | null | undefined): number | null {
  const amount = moneyBag?.shopMoney?.amount;
  if (amount == null || amount === "") return null;
  const num = typeof amount === "number" ? amount : Number(amount);
  return Number.isFinite(num) ? num : null;
}

// Conservative by design (per explicit review feedback): does not
// permanently assume the reported totalRefundedSet-reads-zero-with-some-
// gateways bug applies here. Prefers the aggregate field whenever it's
// non-zero; only falls back to summing successful transactions when the
// aggregate reads exactly zero despite refund records existing, and logs a
// warning on any disagreement. Full raw refund data is always preserved in
// rawData regardless of which figure is used, so this can be revisited
// without re-fetching if real responses disagree with the reported bug.
function deriveTotalRefunded(refunds: GraphQLRefund[] | null | undefined): number | null {
  if (!refunds || refunds.length === 0) return null;

  let aggregateSum = 0;
  let transactionSum = 0;

  for (const refund of refunds) {
    aggregateSum += toMoneyNumber(refund.totalRefundedSet) ?? 0;
    const transactions = refund.transactions?.nodes ?? [];
    for (const tx of transactions) {
      if (tx.status === "SUCCESS") {
        transactionSum += toMoneyNumber(tx.amountSet) ?? 0;
      }
    }
  }

  if (aggregateSum > 0) {
    if (transactionSum > 0 && Math.abs(aggregateSum - transactionSum) > 0.01) {
      console.warn(
        `Refund total mismatch: totalRefundedSet sum ${aggregateSum} vs successful-transaction sum ${transactionSum}. Using totalRefundedSet -- inspect raw_data if this matters.`
      );
    }
    return aggregateSum;
  }

  return transactionSum > 0 ? transactionSum : null;
}

function normalizeGraphQLCustomer(
  customer: GraphQLCustomer | null | undefined
): NormalizedShopifyCustomer | null {
  const shopifyCustomerId = extractNumericId(customer?.id);
  if (!customer || shopifyCustomerId == null) return null;

  return {
    shopifyCustomerId,
    email: customer.defaultEmailAddress?.emailAddress ?? null,
    firstName: customer.firstName ?? null,
    lastName: customer.lastName ?? null,
    phone: customer.defaultPhoneNumber?.phoneNumber ?? null,
    // Not requested in the current GraphQL query -- REST-only for now.
    // Shopify likely exposes this via Customer.emailMarketingConsent, but
    // that field wasn't confirmed against the live schema; add it and wire
    // this up once validated (see file header).
    acceptsMarketing: null,
    ordersCount: customer.numberOfOrders != null ? Number(customer.numberOfOrders) : null,
    totalSpent: toMoneyNumber({ shopMoney: { amount: customer.amountSpent?.amount } }),
    rawData: customer,
  };
}

function normalizeGraphQLLineItem(node: GraphQLLineItemNode): NormalizedShopifyLineItem {
  const shopifyLineItemId = extractNumericId(node.id);
  if (shopifyLineItemId == null) {
    throw new Error(`GraphQL line item missing a parseable id: ${JSON.stringify(node.id)}`);
  }

  return {
    shopifyLineItemId,
    shopifyProductId: extractNumericId(node.product?.id),
    shopifyVariantId: extractNumericId(node.variant?.id),
    vendor: node.vendor ?? null,
    title: node.title ?? null,
    variantTitle: node.variantTitle ?? null,
    sku: node.sku ?? null,
    quantity: node.quantity ?? 1,
    currentQuantity: node.currentQuantity ?? null,
    price: toMoneyNumber(node.originalUnitPriceSet),
    totalDiscount: toMoneyNumber(node.totalDiscountSet),
    requiresShipping: node.requiresShipping ?? null,
    taxable: node.taxable ?? null,
    // No non-deprecated per-line-item fulfillment status field is currently
    // exposed by the Admin API in the fields queried here -- left null for
    // historical imports; the webhook path still populates this going
    // forward for new orders.
    fulfillmentStatus: null,
    // GraphQL uses key/value (Attribute); REST uses name/value. Renamed
    // here so the shared buildPropertiesText() works identically for both
    // sources without needing to know which one produced the data.
    properties:
      node.customAttributes?.map((attr) => ({ name: attr.key ?? "", value: attr.value ?? "" })) ??
      null,
    rawData: node,
  };
}

const LINE_ITEMS_PAGE_QUERY = `
  query OrderLineItemsPage($id: ID!, $after: String) {
    node(id: $id) {
      ... on Order {
        lineItems(first: 250, after: $after) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            product { id }
            variant { id }
            vendor
            title
            variantTitle
            sku
            quantity
            currentQuantity
            originalUnitPriceSet { shopMoney { amount } }
            totalDiscountSet { shopMoney { amount } }
            requiresShipping
            taxable
            customAttributes { key value }
          }
        }
      }
    }
  }
`;

interface OrderLineItemsPageResponse {
  node: { lineItems: GraphQLLineItemConnection } | null;
}

// Ensures every line item for this order is retrieved -- never truncates.
// The initial page comes from the main orders query (first: 250, which
// covers the vast majority of orders in one shot). If that page's
// pageInfo.hasNextPage is true, this fetches the remaining pages via a
// per-order node(id:) query. Throws if a follow-up page fails; the caller
// (the backfill script's per-order try/catch) must treat that as a failed
// order and add it to the failures report -- never upsert a partial
// line-item set.
async function fetchAllLineItems(
  orderGid: string,
  initialConnection: GraphQLLineItemConnection
): Promise<GraphQLLineItemNode[]> {
  const allNodes = [...initialConnection.nodes];
  let hasNextPage = initialConnection.pageInfo.hasNextPage;
  let cursor = initialConnection.pageInfo.endCursor;

  while (hasNextPage) {
    const response = await shopifyAdminGraphQL<OrderLineItemsPageResponse>(LINE_ITEMS_PAGE_QUERY, {
      id: orderGid,
      after: cursor,
    });

    const connection = response.node?.lineItems;
    if (!connection) {
      throw new Error(`Line item pagination follow-up returned no data for order ${orderGid}`);
    }

    allNodes.push(...connection.nodes);
    hasNextPage = connection.pageInfo.hasNextPage;
    cursor = connection.pageInfo.endCursor;
  }

  return allNodes;
}

// Normalizes one GraphQL order node into the canonical shape. Async because
// it may need to fetch additional line-item pages (see fetchAllLineItems)
// before it can safely produce a complete result -- callers must let a
// thrown error here fail the whole order (per-order try/catch), never
// upsert with an incomplete line-item set.
export async function normalizeGraphQLOrder(node: GraphQLOrderNode): Promise<NormalizedShopifyOrder> {
  const shopifyOrderId = extractNumericId(node.id);
  if (shopifyOrderId == null) {
    throw new Error(`GraphQL order missing a parseable id: ${JSON.stringify(node.id)}`);
  }

  const lineItemNodes = await fetchAllLineItems(node.id, node.lineItems);

  return {
    shopifyOrderId,
    orderNumber: node.name ?? null,
    customer: normalizeGraphQLCustomer(node.customer),
    email: node.customer?.defaultEmailAddress?.emailAddress ?? null,
    phone: node.customer?.defaultPhoneNumber?.phoneNumber ?? null,
    financialStatus: node.displayFinancialStatus ?? null,
    fulfillmentStatus: node.displayFulfillmentStatus ?? null,
    currency: node.currencyCode ?? null,
    subtotalPrice: toMoneyNumber(node.subtotalPriceSet),
    totalTax: toMoneyNumber(node.totalTaxSet),
    totalDiscounts: toMoneyNumber(node.totalDiscountsSet),
    totalShipping: toMoneyNumber(node.totalShippingPriceSet),
    totalRefunded: deriveTotalRefunded(node.refunds),
    totalPrice: toMoneyNumber(node.totalPriceSet),
    customerNote: node.note ?? null,
    // No confirmed GraphQL field equivalent to REST's shipping_lines[0].title
    // is queried here yet -- left null rather than guessing an unconfirmed
    // field name and risking the whole query failing (see file header).
    shippingMethod: null,
    shippingAddress: node.shippingAddress ?? null,
    billingAddress: node.billingAddress ?? null,
    sourceName: node.sourceName ?? null,
    landingSite: node.customerJourneySummary?.lastVisit?.landingPage ?? null,
    referringSite: node.customerJourneySummary?.lastVisit?.referrerUrl ?? null,
    createdAt: node.createdAt ?? null,
    updatedAt: node.updatedAt ?? null,
    cancelledAt: node.cancelledAt ?? null,
    rawData: node,
    lineItems: lineItemNodes.map(normalizeGraphQLLineItem),
  };
}

const ORDERS_PAGE_QUERY = `
  query BackfillOrders($first: Int!, $after: String, $query: String, $reverse: Boolean) {
    orders(first: $first, after: $after, sortKey: CREATED_AT, reverse: $reverse, query: $query) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        name
        createdAt
        updatedAt
        cancelledAt
        displayFinancialStatus
        displayFulfillmentStatus
        currencyCode
        note
        subtotalPriceSet { shopMoney { amount } }
        totalTaxSet { shopMoney { amount } }
        totalDiscountsSet { shopMoney { amount } }
        totalShippingPriceSet { shopMoney { amount } }
        totalPriceSet { shopMoney { amount } }
        shippingAddress { address1 address2 city provinceCode zip countryCode phone }
        billingAddress { address1 address2 city provinceCode zip countryCode phone }
        sourceName
        customerJourneySummary {
          lastVisit { landingPage referrerUrl }
        }
        customer {
          id
          defaultEmailAddress { emailAddress }
          defaultPhoneNumber { phoneNumber }
          firstName
          lastName
          numberOfOrders
          amountSpent { amount }
        }
        refunds {
          totalRefundedSet { shopMoney { amount } }
          transactions(first: 20) { nodes { status amountSet { shopMoney { amount } } } }
        }
        lineItems(first: 250) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            product { id }
            variant { id }
            vendor
            title
            variantTitle
            sku
            quantity
            currentQuantity
            originalUnitPriceSet { shopMoney { amount } }
            totalDiscountSet { shopMoney { amount } }
            requiresShipping
            taxable
            customAttributes { key value }
          }
        }
      }
    }
  }
`;

interface OrdersPageResponse {
  orders: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: GraphQLOrderNode[];
  };
}

export interface OrdersPageResult {
  orders: GraphQLOrderNode[];
  hasNextPage: boolean;
  endCursor: string | null;
}

export async function fetchOrdersPage(options: {
  first: number;
  after?: string | null;
  dateQuery?: string | null;
  reverse?: boolean;
}): Promise<OrdersPageResult> {
  const response = await shopifyAdminGraphQL<OrdersPageResponse>(ORDERS_PAGE_QUERY, {
    first: options.first,
    after: options.after ?? null,
    query: options.dateQuery ?? null,
    reverse: options.reverse ?? false,
  });

  return {
    orders: response.orders.nodes,
    hasNextPage: response.orders.pageInfo.hasNextPage,
    endCursor: response.orders.pageInfo.endCursor,
  };
}
