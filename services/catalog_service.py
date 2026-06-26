"""
Project: Crossbar Product Platform

Purpose:
    Reusable catalog database actions.
"""

BATCH_SIZE = 500


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
    all_rows = []
    page_size = 1000
    start = 0

    while True:
        result = (
            supabase.table("supplier_products")
            .select("id,supplier_style,catalog_product_id")
            .eq("supplier_id", supplier_id)
            .range(start, start + page_size - 1)
            .execute()
        )

        rows = result.data or []
        all_rows.extend(rows)

        if len(rows) < page_size:
            break

        start += page_size

    return {
        row["supplier_style"]: row
        for row in all_rows
    }


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