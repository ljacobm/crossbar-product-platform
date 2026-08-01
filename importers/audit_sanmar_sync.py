"""
Project: Crossbar Product Platform

Script:
    audit_sanmar_sync.py

Purpose:
    Acceptance audit for sync_sanmar.py. Snapshots every "curated" catalog
    product (any product a human has actually acted on: workflow status
    moved past Imported, website_ready, team_store_enabled, or approved)
    before and after a sync run, then fails loudly if anything Crossbar
    owns on those products changed.

Run:
    py importers/audit_sanmar_sync.py before
    py importers/sync_sanmar.py --dry-run
    py importers/sync_sanmar.py
    py importers/audit_sanmar_sync.py after
"""

import argparse
import json
import os
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv

from services.supabase_client import get_supabase_client

load_dotenv()

OUTPUT_DIR = Path("output")
BEFORE_PATH = OUTPUT_DIR / "sanmar_sync_before.json"
AFTER_PATH = OUTPUT_DIR / "sanmar_sync_after.json"

PRESERVED_FIELDS = [
    "workflow_status",
    "website_ready",
    "team_store_enabled",
    "active",
    "approved_at",
    "resource_link_count",
    "uploaded_image_count",
    "bundle_reference_count",
]


def is_curated(settings_row):
    return (
        settings_row.get("workflow_status") != "Imported"
        or settings_row.get("website_ready") is True
        or settings_row.get("team_store_enabled") is True
        or settings_row.get("approved_at") is not None
    )


def fetch_all(supabase, table, select, page_size=1000, filters=None):
    all_rows = []
    start = 0
    while True:
        query = supabase.table(table).select(select)
        if filters:
            query = filters(query)
        result = query.range(start, start + page_size - 1).execute()
        rows = result.data or []
        all_rows.extend(rows)
        if len(rows) < page_size:
            break
        start += page_size
    return all_rows


def count_by_key(rows, key):
    counts = {}
    for row in rows:
        k = row.get(key)
        if k is None:
            continue
        counts[k] = counts.get(k, 0) + 1
    return counts


def take_snapshot(supabase):
    print("Fetching catalog_settings...")
    settings_rows = fetch_all(
        supabase,
        "catalog_settings",
        "catalog_product_id,workflow_status,website_ready,team_store_enabled,approved_at",
    )
    curated = [row for row in settings_rows if is_curated(row)]
    curated_ids = [row["catalog_product_id"] for row in curated]

    print(f"Curated products found: {len(curated):,}")

    print("Fetching catalog_products...")
    catalog_rows = fetch_all(supabase, "catalog_products", "id,crossbar_sku,active")
    catalog_by_id = {row["id"]: row for row in catalog_rows}

    print("Fetching resource links...")
    resource_links = fetch_all(supabase, "product_resource_links", "catalog_product_id")
    resource_link_counts = count_by_key(resource_links, "catalog_product_id")

    print("Fetching uploaded Crossbar images...")
    uploaded_images = fetch_all(
        supabase,
        "product_images",
        "catalog_product_id,storage_path",
        filters=lambda q: q.not_.is_("storage_path", "null"),
    )
    uploaded_image_counts = count_by_key(uploaded_images, "catalog_product_id")

    print("Fetching bundle references...")
    bundle_items = fetch_all(supabase, "product_bundle_items", "child_catalog_product_id")
    bundle_reference_counts = count_by_key(bundle_items, "child_catalog_product_id")

    snapshot = {}
    for settings_row in curated:
        cp_id = settings_row["catalog_product_id"]
        catalog_row = catalog_by_id.get(cp_id, {})
        crossbar_sku = catalog_row.get("crossbar_sku") or f"__missing_catalog_product_{cp_id}"

        snapshot[crossbar_sku] = {
            "catalog_product_id": cp_id,
            "crossbar_sku": crossbar_sku,
            "workflow_status": settings_row.get("workflow_status"),
            "website_ready": settings_row.get("website_ready"),
            "team_store_enabled": settings_row.get("team_store_enabled"),
            "active": catalog_row.get("active"),
            "approved_at": settings_row.get("approved_at"),
            "resource_link_count": resource_link_counts.get(cp_id, 0),
            "uploaded_image_count": uploaded_image_counts.get(cp_id, 0),
            "bundle_reference_count": bundle_reference_counts.get(cp_id, 0),
        }

    return snapshot


def cmd_before(supabase):
    snapshot = take_snapshot(supabase)
    OUTPUT_DIR.mkdir(exist_ok=True)
    with open(BEFORE_PATH, "w", encoding="utf-8") as f:
        json.dump(snapshot, f, indent=2, default=str)
    print(f"\nWrote {len(snapshot)} curated products to {BEFORE_PATH}")


def cmd_after(supabase):
    if not BEFORE_PATH.exists():
        print(f"ERROR: {BEFORE_PATH} not found. Run 'before' before running 'after'.")
        sys.exit(2)

    with open(BEFORE_PATH, "r", encoding="utf-8") as f:
        before = json.load(f)

    after = take_snapshot(supabase)

    OUTPUT_DIR.mkdir(exist_ok=True)
    with open(AFTER_PATH, "w", encoding="utf-8") as f:
        json.dump(after, f, indent=2, default=str)
    print(f"Wrote {len(after)} curated products to {AFTER_PATH}")

    after_by_id = {v["catalog_product_id"]: v for v in after.values()}

    preserved = []
    unexpected_changes = []
    missing = []
    changed_ids = []

    for sku, before_row in before.items():
        after_row = after.get(sku)

        if after_row is None:
            # Might still exist under the same ID but with a different SKU
            # (a curated product's SKU shouldn't change either, but check).
            by_id = after_by_id.get(before_row["catalog_product_id"])
            if by_id is None:
                missing.append(sku)
            else:
                changed_ids.append({
                    "crossbar_sku": sku,
                    "note": f"SKU no longer matches; product now found as {by_id['crossbar_sku']}",
                })
            continue

        if after_row["catalog_product_id"] != before_row["catalog_product_id"]:
            changed_ids.append({
                "crossbar_sku": sku,
                "before_id": before_row["catalog_product_id"],
                "after_id": after_row["catalog_product_id"],
            })
            continue

        field_diffs = []
        for field in PRESERVED_FIELDS:
            if before_row.get(field) != after_row.get(field):
                field_diffs.append({
                    "field": field,
                    "before": before_row.get(field),
                    "after": after_row.get(field),
                })

        if field_diffs:
            unexpected_changes.append({"crossbar_sku": sku, "changes": field_diffs})
        else:
            preserved.append(sku)

    print("")
    print("=" * 50)
    print("SANMAR SYNC ACCEPTANCE AUDIT")
    print("=" * 50)
    print(f"Curated products checked: {len(before)}")
    print(f"Preserved successfully:   {len(preserved)}")
    print(f"Unexpected changes:       {len(unexpected_changes)}")
    print(f"Missing products:         {len(missing)}")
    print(f"Changed IDs:              {len(changed_ids)}")

    if unexpected_changes:
        print("\n--- UNEXPECTED CHANGES ---")
        for entry in unexpected_changes:
            print(f"  {entry['crossbar_sku']}:")
            for change in entry["changes"]:
                print(f"    {change['field']}: {change['before']!r} -> {change['after']!r}")

    if missing:
        print("\n--- MISSING PRODUCTS ---")
        for sku in missing:
            print(f"  {sku}")

    if changed_ids:
        print("\n--- CHANGED IDS ---")
        for entry in changed_ids:
            print(f"  {entry}")

    ok = not unexpected_changes and not missing and not changed_ids
    print("\nRESULT: " + ("PASS - all curated products preserved." if ok else "FAIL - review the issues above."))

    if not ok:
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Before/after acceptance audit for sync_sanmar.py.")
    parser.add_argument("mode", choices=["before", "after"])
    args = parser.parse_args()

    if not os.getenv("SUPABASE_URL") or not os.getenv("SUPABASE_SERVICE_ROLE_KEY"):
        raise ValueError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env")

    supabase = get_supabase_client()

    if args.mode == "before":
        cmd_before(supabase)
    else:
        cmd_after(supabase)


if __name__ == "__main__":
    main()
