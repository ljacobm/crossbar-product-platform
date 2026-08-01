"""
Project: Crossbar Product Platform

Purpose:
    Reusable catalog database actions.
"""

from datetime import datetime, timezone

BATCH_SIZE = 500
CHUNK_SIZE = 200  # for .in_() filters, to stay well under URL length limits
PAGE_SIZE = 1000


def upsert_batch(supabase, table_name, rows, conflict_column):
    if not rows:
        return

    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i:i + BATCH_SIZE]
        supabase.table(table_name).upsert(
            batch,
            on_conflict=conflict_column
        ).execute()


def upsert_catalog_products(supabase, product_rows):
    upsert_batch(
        supabase=supabase,
        table_name="catalog_products",
        rows=product_rows,
        conflict_column="crossbar_sku"
    )


def get_catalog_product_ids_by_sku(supabase):
    all_rows = []
    page_size = 1000
    start = 0

    while True:
        result = (
            supabase.table("catalog_products")
            .select("id,crossbar_sku")
            .range(start, start + page_size - 1)
            .execute()
        )

        rows = result.data or []
        all_rows.extend(rows)

        if len(rows) < page_size:
            break

        start += page_size

    return {
        row["crossbar_sku"]: row["id"]
        for row in all_rows
    }


def upsert_supplier_products(supabase, supplier_product_rows):
    upsert_batch(
        supabase=supabase,
        table_name="supplier_products",
        rows=supplier_product_rows,
        conflict_column="supplier_id,supplier_style"
    )


def get_supplier_products_by_style(supabase, supplier_id):
    """Full supplier_product rows for a supplier, keyed by supplier_style.
    Selects every supplier-owned field so callers can diff old vs new
    values for change logging, not just resolve IDs.
    """
    all_rows = []
    start = 0

    while True:
        result = (
            supabase.table("supplier_products")
            .select(
                "id,supplier_style,catalog_product_id,supplier_title,"
                "supplier_brand,supplier_category,supplier_description_html,"
                "active,supplier_status"
            )
            .eq("supplier_id", supplier_id)
            .range(start, start + PAGE_SIZE - 1)
            .execute()
        )

        rows = result.data or []
        all_rows.extend(rows)

        if len(rows) < PAGE_SIZE:
            break

        start += PAGE_SIZE

    return {
        row["supplier_style"]: row
        for row in all_rows
    }


def get_variants_by_supplier_product_ids(supabase, supplier_product_ids):
    """Full product_variant rows for the given supplier_product IDs, keyed
    by supplier_sku. Used to diff a supplier's existing variants against a
    fresh import run (price/inventory changes, additions, removals).
    """
    ids = list(supplier_product_ids)
    all_rows = []

    for i in range(0, len(ids), CHUNK_SIZE):
        chunk = ids[i:i + CHUNK_SIZE]
        start = 0

        while True:
            result = (
                supabase.table("product_variants")
                .select(
                    "id,supplier_sku,catalog_product_id,supplier_product_id,"
                    "color_name,size_name,supplier_price,inventory_qty,grams,"
                    "weight_unit,taxable,requires_shipping,active"
                )
                .in_("supplier_product_id", chunk)
                .range(start, start + PAGE_SIZE - 1)
                .execute()
            )

            rows = result.data or []
            all_rows.extend(rows)

            if len(rows) < PAGE_SIZE:
                break

            start += PAGE_SIZE

    return {
        row["supplier_sku"]: row
        for row in all_rows
    }


def get_supplier_images_by_supplier_product_ids(supabase, supplier_product_ids):
    """Existing supplier-owned product_images (supplier_product_id set) for
    the given supplier_product IDs, keyed by (supplier_product_id,
    color_name, image_url) — the same composite key the upsert conflicts
    on. Crossbar-uploaded images always have supplier_product_id = null,
    so they are structurally excluded from this fetch and can never be
    matched or overwritten by the sync.
    """
    ids = list(supplier_product_ids)
    all_rows = []

    for i in range(0, len(ids), CHUNK_SIZE):
        chunk = ids[i:i + CHUNK_SIZE]
        start = 0

        while True:
            result = (
                supabase.table("product_images")
                .select("id,supplier_product_id,color_name,image_url")
                .in_("supplier_product_id", chunk)
                .range(start, start + PAGE_SIZE - 1)
                .execute()
            )

            rows = result.data or []
            all_rows.extend(rows)

            if len(rows) < PAGE_SIZE:
                break

            start += PAGE_SIZE

    return {
        (row["supplier_product_id"], row["color_name"], row["image_url"]): row
        for row in all_rows
    }


def insert_new_catalog_products(supabase, product_rows):
    """Plain INSERT (never upsert) for catalog_products rows already
    confirmed to be brand new. Returns {crossbar_sku: new_id}. Using
    INSERT instead of upsert here is deliberate: it guarantees this
    function can never silently overwrite an existing, possibly
    Crossbar-curated, catalog_products row.
    """
    if not product_rows:
        return {}

    inserted_ids_by_sku = {}

    for i in range(0, len(product_rows), BATCH_SIZE):
        batch = product_rows[i:i + BATCH_SIZE]
        result = supabase.table("catalog_products").insert(batch).execute()
        for row in result.data or []:
            inserted_ids_by_sku[row["crossbar_sku"]] = row["id"]

    return inserted_ids_by_sku


def ensure_catalog_settings(supabase, catalog_product_ids, defaults=None):
    """Insert a default catalog_settings row for any catalog_product_id
    that doesn't already have one. Existing rows are never touched —
    curated workflow_status/website_ready/team_store_enabled/etc. for
    already-organized products is left completely alone.
    """
    ids = list(dict.fromkeys(catalog_product_ids))  # de-dupe, preserve order
    if not ids:
        return 0

    existing_ids = set()
    for i in range(0, len(ids), CHUNK_SIZE):
        chunk = ids[i:i + CHUNK_SIZE]
        result = (
            supabase.table("catalog_settings")
            .select("catalog_product_id")
            .in_("catalog_product_id", chunk)
            .execute()
        )
        existing_ids.update(row["catalog_product_id"] for row in (result.data or []))

    missing = [cid for cid in ids if cid not in existing_ids]
    if not missing:
        return 0

    base = defaults or {"workflow_status": "Imported", "website_ready": False, "team_store_enabled": False}
    rows = [{"catalog_product_id": cid, **base} for cid in missing]

    for i in range(0, len(rows), BATCH_SIZE):
        supabase.table("catalog_settings").insert(rows[i:i + BATCH_SIZE]).execute()

    return len(missing)


def mark_supplier_products_discontinued(supabase, supplier_product_ids):
    """Flip active=false, supplier_status='Discontinued' for the given
    supplier_products, and cascade active=false onto their variants.
    Never touches catalog_products or catalog_settings.
    """
    ids = list(supplier_product_ids)
    if not ids:
        return

    for i in range(0, len(ids), CHUNK_SIZE):
        chunk = ids[i:i + CHUNK_SIZE]
        supabase.table("supplier_products").update(
            {"active": False, "supplier_status": "Discontinued"}
        ).in_("id", chunk).execute()

        supabase.table("product_variants").update(
            {"active": False}
        ).in_("supplier_product_id", chunk).execute()


def mark_variants_inactive(supabase, variant_ids):
    """Flip active=false for specific variants (e.g. a color/size dropped
    while the parent style remains active). Never touches catalog_products
    or catalog_settings.
    """
    ids = list(variant_ids)
    if not ids:
        return

    for i in range(0, len(ids), CHUNK_SIZE):
        chunk = ids[i:i + CHUNK_SIZE]
        supabase.table("product_variants").update({"active": False}).in_("id", chunk).execute()


def create_sync_run(supabase, supplier_id, source_filename):
    result = (
        supabase.table("supplier_sync_runs")
        .insert({
            "supplier_id": supplier_id,
            "status": "running",
            "source_filename": source_filename,
        })
        .execute()
    )
    return result.data[0]["id"]


def complete_sync_run(supabase, run_id, status, counts, summary_json):
    payload = {
        "status": status,
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "summary_json": summary_json,
        **counts,
    }
    supabase.table("supplier_sync_runs").update(payload).eq("id", run_id).execute()


def insert_sync_changes(supabase, run_id, changes):
    if not changes:
        return

    for change in changes:
        change["sync_run_id"] = run_id

    for i in range(0, len(changes), BATCH_SIZE):
        supabase.table("supplier_sync_changes").insert(changes[i:i + BATCH_SIZE]).execute()


def upsert_product_variants(supabase, variant_rows):
    upsert_batch(
        supabase=supabase,
        table_name="product_variants",
        rows=variant_rows,
        conflict_column="supplier_sku"
    )


def upsert_product_images(supabase, image_rows):
    upsert_batch(
        supabase=supabase,
        table_name="product_images",
        rows=image_rows,
        conflict_column="supplier_product_id,color_name,image_url"
    )


def get_supplier_id_by_code(supabase, supplier_code):
    result = (
        supabase.table("suppliers")
        .select("id")
        .eq("code", supplier_code)
        .execute()
    )

    if not result.data:
        raise ValueError(f"Supplier code not found: {supplier_code}")

    return result.data[0]["id"]