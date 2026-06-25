import os
import pandas as pd
from dotenv import load_dotenv

load_dotenv()

csv_path = os.getenv("SANMAR_CSV")

if not csv_path:
    raise ValueError("SANMAR_CSV is missing from your .env file")

print(f"Reading: {csv_path}")

df = pd.read_csv(csv_path, dtype=str, encoding="utf-8", low_memory=False)

print("\n--- BASIC INFO ---")
print(f"Total rows: {len(df):,}")
print(f"Total columns: {len(df.columns):,}")

print("\n--- COLUMNS ---")
for col in df.columns:
    print(col)

print("\n--- COUNTS ---")
print(f"Unique handles/products: {df['Handle'].nunique():,}")
print(f"Unique variant SKUs: {df['Variant SKU'].nunique():,}")
print(f"Unique vendors/brands: {df['Vendor'].nunique():,}")
print(f"Unique product types/categories: {df['Type'].nunique():,}")
print(f"Unique colors: {df['Option1 Value'].nunique():,}")
print(f"Unique sizes: {df['Option2 Value'].nunique():,}")

print("\n--- TOP VENDORS ---")
print(df["Vendor"].value_counts().head(20))

print("\n--- TOP CATEGORIES ---")
print(df["Type"].value_counts().head(20))

print("\n--- SAMPLE ROWS ---")
print(df.head(5).to_string())