"""
Project: Crossbar Product Platform

Script:
    import_sanmar.py

Purpose:
    Import SanMar Shopify CSV data into Supabase V2 schema.

Run:
    py importers/import_sanmar.py
"""

import os
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

import pandas as pd
from dotenv import load_dotenv

from services.supabase_client import get_supabase_client
from services.catalog_service import (
    get_supplier_id_by_code,
    upsert_catalog_products,
    get_catalog_product_ids_by_sku,
    upsert_supplier_products,
    get_supplier_products_by_style,
    upsert_product_variants,
    upsert_product_images,
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

TEST_MODE = True
TEST_PRODUCT_LIMIT = 10


def clean(value):
    if pd.isna(value):
        return None
    value = str(value).strip()
    return value if value else None


def to_int(value):
    try:
        return int(float(value))
    except:
        return None


def to_float(value):
    try:
        return float(value)
    except:
        return None


def to_bool(value):
    value = str(value).strip().lower()
    return value in ["true", "1", "yes"]


def main():
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise ValueError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env")

    supabase = get_supabase_client()

    print("Reading SanMar CSV...")
    df = pd.read_csv(CSV_PATH, dtype=str, encoding="utf-8", low_memory=False)

    if TEST_MODE:
        test_handles = df["Handle"].drop_duplicates().head(TEST_PRODUCT_LIMIT)
        df = df[df["Handle"].isin(test_handles)]
        print(f"TEST MODE: importing {TEST_PRODUCT_LIMIT} products only")

    print(f"Rows to process: {len(df):,}")
    print(f"Unique products: {df['Handle'].nunique():,}")

    supplier_id = get_supplier_id_by_code(supabase, "SAN")

    # 1. Catalog Products
    product_rows = []
    for handle, group in df.groupby("Handle"):
        first = group.iloc[0]
        title = normalize_title(first["Title"])
        slug = normalize_slug(first["Title"])

        product_rows.append({
            "crossbar_sku": f"CB-{handle}",
            "display_name": title,
            "product_slug": slug,
            "description_html": clean(first["Body (HTML)"]),
            "crossbar_category": normalize_category(first["Type"]),
            "brand_display": normalize_brand(first["Vendor"]),
            "active": True,
        })

    print(f"Upserting catalog_products: {len(product_rows):,}")
    upsert_catalog_products(supabase, product_rows)

    # Pull products back to get IDs
    product_id_by_sku = get_catalog_product_ids_by_sku(supabase)

    # 2. Supplier Products
    supplier_product_rows = []
    for handle, group in df.groupby("Handle"):
        first = group.iloc[0]
        crossbar_sku = f"CB-{handle}"

        supplier_product_rows.append({
            "supplier_id": supplier_id,
            "catalog_product_id": product_id_by_sku[crossbar_sku],
            "supplier_style": handle,
            "supplier_title": clean(first["Title"]),
            "supplier_brand": normalize_brand(first["Vendor"]),
            "supplier_category": clean(first["Type"]),
            "supplier_description_html": clean(first["Body (HTML)"]),
            "active": True,
        })

    print(f"Upserting supplier_products: {len(supplier_product_rows):,}")
    upsert_supplier_products(supabase, supplier_product_rows)

    supplier_product_by_style = get_supplier_products_by_style(supabase, supplier_id)

    # 3. Product Variants
    variant_rows = []
    for _, row in df.iterrows():
        handle = clean(row["Handle"])
        supplier_product = supplier_product_by_style[handle]

        variant_rows.append({
            "catalog_product_id": supplier_product["catalog_product_id"],
            "supplier_product_id": supplier_product["id"],
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
        })

    print(f"Upserting product_variants: {len(variant_rows):,}")
    upsert_product_variants(supabase, variant_rows)

    # 4. Product Images
    image_map = {}

    for _, row in df.iterrows():
        handle = clean(row["Handle"])
        supplier_product = supplier_product_by_style[handle]
        color = normalize_color(row["Option1 Value"])
        image_url = clean(row["Variant Image"]) or clean(row["Image Src"])

        if not image_url:
            continue

        key = (supplier_product["id"], color, image_url)

        image_map[key] = {
            "catalog_product_id": supplier_product["catalog_product_id"],
            "supplier_product_id": supplier_product["id"],
            "color_name": color,
            "image_url": image_url,
            "image_type": "product",
            "sort_order": 0,
            "active": True,
        }

    image_rows = list(image_map.values())

    print(f"Upserting product_images: {len(image_rows):,}")
    upsert_product_images(supabase, image_rows)

    print("")
    print("Import complete.")
    print(f"Products imported/tested: {len(product_rows):,}")
    print(f"Variants imported/tested: {len(variant_rows):,}")
    print(f"Images imported/tested: {len(image_rows):,}")


if __name__ == "__main__":
    main()