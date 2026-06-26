"""
Project: Crossbar Product Platform

Script:
    analyze_sanmar_csv.py

Purpose:
    Analyze the SanMar Shopify catalog export before importing into Supabase.

Input:
    data/sanmar_shopify.csv

Output:
    Console report
    output/sanmar_analysis.txt
"""

import os
from pathlib import Path
from datetime import datetime

import pandas as pd
from dotenv import load_dotenv

import sys
sys.path.append(str(Path(__file__).resolve().parents[1]))

from normalization import normalize_category, normalize_size, normalize_color


load_dotenv()

CSV_PATH = os.getenv("SANMAR_CSV", "data/sanmar_shopify.csv")
OUTPUT_DIR = Path("output")
OUTPUT_DIR.mkdir(exist_ok=True)

REQUIRED_COLUMNS = [
    "Handle",
    "Title",
    "Body (HTML)",
    "Vendor",
    "Type",
    "Option1 Value",
    "Option2 Value",
    "Variant SKU",
    "Variant Inventory Qty",
    "Variant Price",
    "Image Src",
    "Variant Image",
]


def main():
    print("Reading SanMar CSV...")

    df = pd.read_csv(
        CSV_PATH,
        dtype=str,
        encoding="utf-8",
        low_memory=False
    )

    total_rows = len(df)
    total_columns = len(df.columns)

    missing_columns = [col for col in REQUIRED_COLUMNS if col not in df.columns]

    unique_products = df["Handle"].nunique()
    unique_skus = df["Variant SKU"].nunique()
    unique_brands = df["Vendor"].nunique()
    unique_categories = df["Type"].nunique()
    unique_colors = df["Option1 Value"].nunique()
    unique_sizes = df["Option2 Value"].nunique()

    duplicate_skus = df[df["Variant SKU"].duplicated(keep=False)]["Variant SKU"].nunique()

    missing_images = df["Image Src"].isna().sum() + (df["Image Src"].fillna("").str.strip() == "").sum()
    missing_descriptions = df["Body (HTML)"].isna().sum() + (df["Body (HTML)"].fillna("").str.strip() == "").sum()

    top_brands = df["Vendor"].value_counts().head(20)
    top_categories = df["Type"].value_counts().head(20)
    top_sizes = df["Option2 Value"].value_counts().head(30)
    df["Crossbar Category"] = df["Type"].apply(normalize_category)
    df["Crossbar Size"] = df["Option2 Value"].apply(normalize_size)
    df["Crossbar Color"] = df["Option1 Value"].apply(normalize_color)

    top_crossbar_categories = df["Crossbar Category"].value_counts().head(20)
    top_crossbar_sizes = df["Crossbar Size"].value_counts().head(30)

    status = "READY TO IMPORT" if not missing_columns else "NOT READY - MISSING REQUIRED COLUMNS"

    report = []
    report.append("=" * 60)
    report.append("Crossbar Product Platform")
    report.append("SanMar Catalog Analyzer")
    report.append("=" * 60)
    report.append("")
    report.append(f"CSV File: {CSV_PATH}")
    report.append(f"Run Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    report.append("")
    report.append("--- BASIC INFO ---")
    report.append(f"Total Rows: {total_rows:,}")
    report.append(f"Total Columns: {total_columns:,}")
    report.append(f"Unique Products / Handles: {unique_products:,}")
    report.append(f"Unique Variant SKUs: {unique_skus:,}")
    report.append(f"Unique Brands: {unique_brands:,}")
    report.append(f"Unique Categories: {unique_categories:,}")
    report.append(f"Unique Colors: {unique_colors:,}")
    report.append(f"Unique Sizes: {unique_sizes:,}")
    report.append("")
    report.append("--- DATA QUALITY ---")
    report.append(f"Missing Required Columns: {missing_columns if missing_columns else 'None'}")
    report.append(f"Duplicate Variant SKUs: {duplicate_skus:,}")
    report.append(f"Rows Missing Images: {missing_images:,}")
    report.append(f"Rows Missing Descriptions: {missing_descriptions:,}")
    report.append("")
    report.append("--- TOP BRANDS ---")
    report.append(top_brands.to_string())
    report.append("")
    report.append("--- TOP CATEGORIES ---")
    report.append(top_categories.to_string())
    report.append("")
    report.append("--- TOP CROSSBAR CATEGORIES ---")
    report.append(top_crossbar_categories.to_string())
    report.append("")
    report.append("--- TOP CROSSBAR SIZES ---")
    report.append(top_crossbar_sizes.to_string())
    report.append("")
    report.append("--- TOP SIZES ---")
    report.append(top_sizes.to_string())
    report.append("")
    report.append("--- IMPORT STATUS ---")
    report.append(status)
    report.append("")

    final_report = "\n".join(report)

    print(final_report)

    output_file = OUTPUT_DIR / "sanmar_analysis.txt"
    output_file.write_text(final_report, encoding="utf-8")

    print(f"\nReport saved to: {output_file}")


if __name__ == "__main__":
    main()