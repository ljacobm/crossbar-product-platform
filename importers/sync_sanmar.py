"""
Project: Crossbar Product Platform

Script:
    sync_sanmar.py

Purpose:
    Safe, incremental synchronizer for SanMar supplier data. Meant to
    replace the old import_sanmar.py for every run after the first import.

    On every run it:
      - Creates catalog_products/supplier_products/product_variants/
        product_images/catalog_settings for SanMar styles seen for the
        first time.
      - Refreshes ONLY supplier-owned fields (supplier_products,
        product_variants, supplier-imported product_images) for styles
        that already exist.
      - Marks styles/SKUs that have disappeared from the feed as
        Discontinued (active=false) on supplier_products/product_variants,
        without touching catalog_products or catalog_settings.

    It never writes to catalog_settings, crossbar_product_data,
    product_resource_links, product_bundle_items, or Crossbar-uploaded
    product_images (rows with a storage_path). See docs/decisions.md and
    the sync report for the full field-ownership breakdown.

Run:
    py importers/sync_sanmar.py               # writes changes to Supabase
    py importers/sync_sanmar.py --dry-run      # computes + prints changes only, no writes
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

import pandas as pd
from dotenv import load_dotenv

from services.supabase_client import get_supabase_client
from services.catalog_service import (
    get_supplier_id_by_code,
    get_catalog_product_ids_by_sku,
    get_supplier_products_by_style,
    get_variants_by_supplier_product_ids,
    get_supplier_images_by_supplier_product_ids,
    insert_new_catalog_products,
    upsert_supplier_products,
    upsert_product_variants,
    upsert_product_images,
    ensure_catalog_settings,
    mark_supplier_products_discontinued,
    mark_variants_inactive,
    create_sync_run,
    complete_sync_run,
    insert_sync_changes,
)

from normalization import (
    normalize_category,
    normalize_size,
    normalize_color,
    normalize_brand,
    normalize_title,
    normalize_slug,
)

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
CSV_PATH = os.getenv("SANMAR_CSV", "data/sanmar_shopify.csv")
OUTPUT_DIR = Path("output")

SUPPLIER_PRODUCT_DIFF_FIELDS = [
    "supplier_title",
    "supplier_brand",
    "supplier_category",
    "supplier_description_html",
]


def clean(value):
    if pd.isna(value):
        return None
    value = str(value).strip()
    return value if value else None


def to_int(value):
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def to_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def to_bool(value):
    return str(value).strip().lower() in ("true", "1", "yes")


def to_comparable_price(value):
    if value is None:
        return None
    try:
        return round(float(value), 2)
    except (TypeError, ValueError):
        return value


def build_supplier_product_candidate(handle, first_row):
    return {
        "supplier_style": handle,
        "supplier_title": clean(first_row["Title"]),
        "supplier_brand": normalize_brand(first_row["Vendor"]),
        "supplier_category": clean(first_row["Type"]),
        "supplier_description_html": clean(first_row["Body (HTML)"]),
        "active": True,
        "supplier_status": "Active",
    }


def diff_supplier_product(existing, candidate):
    """List of (field_name, old_value, new_value) for changed
    supplier-owned fields, plus a synthetic entry if this style is being
    reactivated after a prior Discontinued mark."""
    changes = []
    for field in SUPPLIER_PRODUCT_DIFF_FIELDS:
        old = existing.get(field) or None
        new = candidate.get(field) or None
        if old != new:
            changes.append((field, old, new))
    if existing.get("supplier_status") == "Discontinued":
        changes.append(("supplier_status", "Discontinued", "Active"))
    return changes


def build_variant_candidate(row, catalog_product_id, supplier_product_id):
    return {
        "catalog_product_id": catalog_product_id,
        "supplier_product_id": supplier_product_id,
        "color_name": normalize_color(row["Option1 Value"]),
        "size_name": normalize_size(row["Option2 Value"]),
        "supplier_sku": clean(row["Variant SKU"]),
        "supplier_price": to_float(row["Variant Price"]),
        "inventory_qty": to_int(row["Variant Inventory Qty"]),
        "grams": to_int(row["Variant Grams"]),
        "weight_unit": clean(row["Variant Weight Unit"]),
        "taxable": to_bool(row["Variant Taxable"]),
        "requires_shipping": to_bool(row["Variant Requires Shipping"]),
        "active": True,
    }


def main():
    parser = argparse.ArgumentParser(description="Sync SanMar supplier data into Supabase.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Compute and print intended changes without writing anything to Supabase.",
    )
    args = parser.parse_args()

    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise ValueError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env")

    supabase = get_supabase_client()

    print("Reading SanMar CSV...")
    df = pd.read_csv(CSV_PATH, dtype=str, encoding="utf-8", low_memory=False)
    print(f"Rows read: {len(df):,}")
    print(f"Unique products in file: {df['Handle'].nunique():,}")

    supplier_id = get_supplier_id_by_code(supabase, "SAN")

    print("Loading existing supplier data from Supabase for comparison...")
    existing_supplier_products = get_supplier_products_by_style(supabase, supplier_id)
    existing_catalog_ids_by_sku = get_catalog_product_ids_by_sku(supabase)
    existing_supplier_product_ids = [row["id"] for row in existing_supplier_products.values()]
    existing_variants = get_variants_by_supplier_product_ids(supabase, existing_supplier_product_ids)
    existing_images = get_supplier_images_by_supplier_product_ids(supabase, existing_supplier_product_ids)

    settings_count_result = (
        supabase.table("catalog_settings").select("id", count="exact").limit(1).execute()
    )
    pre_existing_settings_count = settings_count_result.count or 0

    run_id = None
    if not args.dry_run:
        run_id = create_sync_run(supabase, supplier_id, str(CSV_PATH))

    changes = []
    counts = {
        "products_new": 0,
        "products_updated": 0,
        "products_discontinued": 0,
        "variants_new": 0,
        "variants_updated": 0,
        "variants_deactivated": 0,
        "images_new": 0,
        "images_updated": 0,
    }
    price_changes = 0
    inventory_changes = 0
    inventory_qty_delta_total = 0
    errors = []

    try:
        # ---------------------------------------------------------------
        # 1. Products (catalog_products + supplier_products)
        # ---------------------------------------------------------------
        new_catalog_product_rows = []
        new_handles = []
        new_product_change_placeholders = []  # finalized with real IDs after insert
        supplier_product_candidates = []  # (handle, candidate) for every handle in the file

        grouped = df.groupby("Handle")

        for handle, group in grouped:
            first = group.iloc[0]
            crossbar_sku = f"CB-{handle}"
            candidate = build_supplier_product_candidate(handle, first)
            existing = existing_supplier_products.get(handle)

            if existing is None:
                counts["products_new"] += 1
                new_handles.append(handle)
                title = normalize_title(first["Title"])
                slug = f"{normalize_slug(first['Title'])}-{str(handle).lower()}"
                new_catalog_product_rows.append({
                    "crossbar_sku": crossbar_sku,
                    "display_name": title,
                    "product_slug": slug,
                    "description_html": clean(first["Body (HTML)"]),
                    "crossbar_category": normalize_category(first["Type"]),
                    "brand_display": normalize_brand(first["Vendor"]),
                    "active": True,
                })
                new_product_change_placeholders.append(crossbar_sku)
            else:
                field_diffs = diff_supplier_product(existing, candidate)
                if field_diffs:
                    counts["products_updated"] += 1
                    for field_name, old_value, new_value in field_diffs:
                        changes.append({
                            "supplier_product_id": existing["id"],
                            "catalog_product_id": existing["catalog_product_id"],
                            "change_type": "Product Updated",
                            "entity_type": "supplier_product",
                            "field_name": field_name,
                            "old_value": old_value,
                            "new_value": new_value,
                        })

            supplier_product_candidates.append((handle, candidate))

        # Discontinued products: existed before, absent from this file.
        incoming_handles = set(grouped.groups.keys())
        discontinued_handles = [
            h for h, row in existing_supplier_products.items()
            if h not in incoming_handles and row.get("supplier_status") != "Discontinued"
        ]
        counts["products_discontinued"] = len(discontinued_handles)
        discontinued_supplier_product_ids = [existing_supplier_products[h]["id"] for h in discontinued_handles]
        for h in discontinued_handles:
            row = existing_supplier_products[h]
            changes.append({
                "supplier_product_id": row["id"],
                "catalog_product_id": row["catalog_product_id"],
                "change_type": "Product Discontinued",
                "entity_type": "supplier_product",
                "field_name": "supplier_status",
                "old_value": "Active",
                "new_value": "Discontinued",
            })

        # ---------------------------------------------------------------
        # 2. Write products (real run only)
        # ---------------------------------------------------------------
        if not args.dry_run:
            print(f"Inserting new catalog_products: {len(new_catalog_product_rows):,}")
            newly_inserted_ids_by_sku = insert_new_catalog_products(supabase, new_catalog_product_rows)
        else:
            newly_inserted_ids_by_sku = {sku: None for sku in new_product_change_placeholders}

        for crossbar_sku in new_product_change_placeholders:
            changes.append({
                "supplier_product_id": None,
                "catalog_product_id": newly_inserted_ids_by_sku.get(crossbar_sku),
                "change_type": "New Product",
                "entity_type": "catalog_product",
                "field_name": None,
                "old_value": None,
                "new_value": crossbar_sku,
            })

        catalog_id_by_sku = dict(existing_catalog_ids_by_sku)
        catalog_id_by_sku.update(newly_inserted_ids_by_sku)

        full_supplier_product_rows = []
        for handle, candidate in supplier_product_candidates:
            row = dict(candidate)
            row["supplier_id"] = supplier_id
            row["catalog_product_id"] = catalog_id_by_sku.get(f"CB-{handle}")
            full_supplier_product_rows.append(row)

        if not args.dry_run:
            print(f"Upserting supplier_products: {len(full_supplier_product_rows):,}")
            upsert_supplier_products(supabase, full_supplier_product_rows)

            if discontinued_supplier_product_ids:
                print(f"Marking discontinued supplier_products: {len(discontinued_supplier_product_ids):,}")
                mark_supplier_products_discontinued(supabase, discontinued_supplier_product_ids)

            # Refresh so newly-created supplier_products have resolvable IDs
            # for the variant/image steps below.
            supplier_product_by_style = get_supplier_products_by_style(supabase, supplier_id)
        else:
            supplier_product_by_style = existing_supplier_products

        # ---------------------------------------------------------------
        # 3. Variants
        # ---------------------------------------------------------------
        variant_rows = []
        incoming_variant_skus = set()

        for _, row in df.iterrows():
            handle = clean(row["Handle"])
            sp = supplier_product_by_style.get(handle)
            sp_id = sp["id"] if sp else None
            cp_id = (sp["catalog_product_id"] if sp else None) or catalog_id_by_sku.get(f"CB-{handle}")

            candidate = build_variant_candidate(row, cp_id, sp_id)
            sku = candidate["supplier_sku"]
            if not sku:
                continue
            incoming_variant_skus.add(sku)

            existing_variant = existing_variants.get(sku)
            if existing_variant is None:
                counts["variants_new"] += 1
                changes.append({
                    "supplier_product_id": sp_id,
                    "catalog_product_id": cp_id,
                    "change_type": "Variant Added",
                    "entity_type": "variant",
                    "field_name": "supplier_sku",
                    "old_value": None,
                    "new_value": sku,
                })
            else:
                updated = False

                old_price = to_comparable_price(existing_variant.get("supplier_price"))
                new_price = to_comparable_price(candidate["supplier_price"])
                if old_price != new_price:
                    price_changes += 1
                    updated = True
                    changes.append({
                        "supplier_product_id": sp_id,
                        "catalog_product_id": cp_id,
                        "change_type": "Price Changed",
                        "entity_type": "variant",
                        "field_name": "supplier_price",
                        "old_value": existing_variant.get("supplier_price"),
                        "new_value": candidate["supplier_price"],
                    })

                old_qty = existing_variant.get("inventory_qty") or 0
                new_qty = candidate["inventory_qty"] or 0
                if old_qty != new_qty:
                    inventory_changes += 1
                    inventory_qty_delta_total += new_qty - old_qty
                    updated = True

                if existing_variant.get("active") is False:
                    updated = True  # reactivated after a prior deactivation

                if updated:
                    counts["variants_updated"] += 1

            variant_rows.append(candidate)

        discontinued_variant_skus = [
            sku for sku, row in existing_variants.items()
            if sku not in incoming_variant_skus and row.get("active") is not False
        ]
        counts["variants_deactivated"] = len(discontinued_variant_skus)
        for sku in discontinued_variant_skus:
            row = existing_variants[sku]
            changes.append({
                "supplier_product_id": row["supplier_product_id"],
                "catalog_product_id": row["catalog_product_id"],
                "change_type": "Variant Deactivated",
                "entity_type": "variant",
                "field_name": "active",
                "old_value": "true",
                "new_value": "false",
            })

        if not args.dry_run:
            print(f"Upserting product_variants: {len(variant_rows):,}")
            upsert_product_variants(supabase, variant_rows)

            discontinued_variant_ids = [existing_variants[sku]["id"] for sku in discontinued_variant_skus]
            if discontinued_variant_ids:
                print(f"Deactivating variants no longer in feed: {len(discontinued_variant_ids):,}")
                mark_variants_inactive(supabase, discontinued_variant_ids)

        # ---------------------------------------------------------------
        # 4. Supplier-imported images only (never touches Crossbar uploads)
        # ---------------------------------------------------------------
        image_map = {}
        for _, row in df.iterrows():
            handle = clean(row["Handle"])
            sp = supplier_product_by_style.get(handle)
            sp_id = sp["id"] if sp else None
            cp_id = (sp["catalog_product_id"] if sp else None) or catalog_id_by_sku.get(f"CB-{handle}")
            color = normalize_color(row["Option1 Value"])
            image_url = clean(row["Variant Image"]) or clean(row["Image Src"])

            if not image_url:
                continue

            key = (sp_id, color, image_url)
            image_map[key] = {
                "catalog_product_id": cp_id,
                "supplier_product_id": sp_id,
                "color_name": color,
                "image_url": image_url,
                "image_type": "product",
                "sort_order": 0,
                "active": True,
            }

        for key, image_row in image_map.items():
            # image_url is part of the match key itself, so a matched row is
            # always byte-identical to what's already stored -- there is no
            # mutable field left to differ. images_updated stays 0 by
            # design; only genuinely new URLs are counted/logged.
            if key not in existing_images:
                counts["images_new"] += 1
                sp_id, color, url = key
                changes.append({
                    "supplier_product_id": sp_id,
                    "catalog_product_id": image_row["catalog_product_id"],
                    "change_type": "Image Added",
                    "entity_type": "image",
                    "field_name": "image_url",
                    "old_value": None,
                    "new_value": url,
                })

        image_rows = list(image_map.values())

        if not args.dry_run:
            print(f"Upserting product_images: {len(image_rows):,}")
            upsert_product_images(supabase, image_rows)

            settings_created = ensure_catalog_settings(supabase, list(newly_inserted_ids_by_sku.values()))
            print(f"catalog_settings created for new products: {settings_created:,}")
        else:
            settings_created = counts["products_new"]

    except Exception as exc:  # noqa: BLE001 - top-level guard, re-raised after recording
        errors.append(str(exc))
        if run_id is not None:
            complete_sync_run(
                supabase,
                run_id,
                status="failed",
                counts=counts,
                summary_json={"error": str(exc)},
            )
        print(f"\nSYNC FAILED: {exc}")
        raise

    # ---------------------------------------------------------------
    # 5. Change log + run record (real run only)
    # ---------------------------------------------------------------
    if not args.dry_run:
        insert_sync_changes(supabase, run_id, changes)

    summary = {
        **counts,
        "price_changes": price_changes,
        "inventory_changes": inventory_changes,
        "inventory_qty_delta_total": inventory_qty_delta_total,
        "crossbar_settings_preserved": pre_existing_settings_count,
        "catalog_settings_created": settings_created,
        "errors": len(errors),
        "source_filename": str(CSV_PATH),
        "rows_processed": int(len(df)),
        "dry_run": args.dry_run,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }

    if not args.dry_run:
        complete_sync_run(
            supabase,
            run_id,
            status="completed",
            counts=counts,
            summary_json=summary,
        )

    # The JSON file report additionally includes the full change list (each
    # product/variant/image touched, with old/new values) so a reviewer can
    # see exactly what a dry run would do, or what a real run just did --
    # the DB's summary_json stays counts-only since per-change detail
    # already has its own rows in supplier_sync_changes for real runs.
    report = {**summary, "changes": changes}

    print("")
    print("=" * 50)
    print("DRY RUN SUMMARY" if args.dry_run else "SYNC SUMMARY")
    print("=" * 50)
    print(f"Products new: {counts['products_new']}")
    print(f"Products updated: {counts['products_updated']}")
    print(f"Products discontinued: {counts['products_discontinued']}")
    print(f"Variants new: {counts['variants_new']}")
    print(f"Variants updated: {counts['variants_updated']}")
    print(f"Variants deactivated: {counts['variants_deactivated']}")
    print(f"Price changes: {price_changes}")
    print(f"Inventory changes: {inventory_changes}")
    print(f"Crossbar settings preserved: {pre_existing_settings_count}")
    print(f"Errors: {len(errors)}")

    OUTPUT_DIR.mkdir(exist_ok=True)
    report_name = "sanmar_sync_dry_run.json" if args.dry_run else "sanmar_sync_last_run.json"
    report_path = OUTPUT_DIR / report_name
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, default=str)
    print(f"Report written to {report_path}")


if __name__ == "__main__":
    main()
