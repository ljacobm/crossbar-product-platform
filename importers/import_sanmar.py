"""
Project: Crossbar Product Platform

Script:
    import_sanmar.py  (DEPRECATED)

This script unconditionally overwrote every catalog_products column
(including display_name, description_html, crossbar_category,
brand_display, and active) on every run, which would silently clobber any
manual curation made in the Catalog Manager UI. It also never detected or
flagged products/variants that disappeared from a supplier feed.

It has been replaced by importers/sync_sanmar.py, which:
  - only ever touches supplier-owned fields on existing products
  - creates catalog_products/catalog_settings only for genuinely new items
  - marks missing items Discontinued instead of silently ignoring them
  - supports --dry-run and logs every change to supplier_sync_changes

Run this instead:
    py importers/sync_sanmar.py --dry-run
    py importers/sync_sanmar.py
"""

import sys

MESSAGE = """
import_sanmar.py is deprecated and will not run.

Use the safe synchronizer instead:

    py importers/sync_sanmar.py --dry-run   (preview changes, no writes)
    py importers/sync_sanmar.py             (apply changes)

See importers/audit_sanmar_sync.py for the before/after curation audit.
"""


def main():
    print(MESSAGE)
    sys.exit(1)


if __name__ == "__main__":
    main()
