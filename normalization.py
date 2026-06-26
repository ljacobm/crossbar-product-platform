"""
Project: Crossbar Product Platform

Purpose:
    Standardize supplier values into Crossbar-friendly values.
"""

CATEGORY_MAP = {
    "T-Shirts": "T-Shirts",
    "Sweatshirts/Fleece": "Sweatshirts & Fleece",
    "Polos/Knits": "Polos",
    "Activewear": "Activewear",
    "Outerwear": "Outerwear",
    "Caps": "Hats",
    "Bags": "Bags",
    "Accessories": "Accessories",
    "Woven Shirts": "Button-Ups",
    "Women's": "Women's",
    "Youth": "Youth",
    "Infant & Toddler": "Infant & Toddler",
    "Tall": "Tall",
    "Workwear": "Workwear",
    "Personal Protection": "Personal Protection",
}

SIZE_MAP = {
    "OSFA": "One Size",
    "XS": "XS",
    "S": "S",
    "M": "M",
    "L": "L",
    "XL": "XL",
    "XXL": "2XL",
    "2XL": "2XL",
    "3XL": "3XL",
    "4XL": "4XL",
    "5XL": "5XL",
    "6XL": "6XL",
    "LT": "Large Tall",
    "XLT": "XL Tall",
    "2XLT": "2XL Tall",
    "3XLT": "3XL Tall",
    "4XLT": "4XL Tall",
    "2T": "2T",
    "3T": "3T",
    "4T": "4T",
    "5T": "5T",
}

def clean_text(value):
    if value is None:
        return ""
    return str(value).strip()

def normalize_category(value):
    value = clean_text(value)
    return CATEGORY_MAP.get(value, value)

def normalize_size(value):
    value = clean_text(value)
    return SIZE_MAP.get(value, value)

def normalize_color(value):
    value = clean_text(value)
    value = value.replace("/", " / ")
    value = " ".join(value.split())
    return value

def normalize_brand(value):
    return clean_text(value)

def normalize_supplier(value):
    value = clean_text(value).lower()
    if value in ["sanmar", "san mar"]:
        return "SanMar"
    if value in ["s&s", "ss", "s&s activewear", "ss activewear"]:
        return "S&S Activewear"
    return value.title()

import re

def normalize_title(title):
    """
    Convert supplier titles into cleaner Crossbar catalog names.
    Removes trademark symbols and trailing supplier style numbers.
    """

    if title is None:
        return ""

    title = str(title)

    # Remove trademark symbols
    title = title.replace("®", "")
    title = title.replace("™", "")

    # Normalize spaces
    title = re.sub(r"\s+", " ", title).strip()

    # Remove trailing style numbers:
    # ". ST350", ". 108084", "- 110172", " 111", " 112"
    title = re.sub(r"[\.\-\s]+[A-Z]*\d+[A-Z0-9\-]*$", "", title)

    # Clean leftover punctuation/spaces
    title = title.strip(" .-")

    return title.strip()

import re

def normalize_slug(title):
    """
    Create a URL-friendly slug from the display name.
    """

    title = normalize_title(title)

    title = title.lower()

    title = re.sub(r"[^a-z0-9]+", "-", title)

    title = re.sub(r"-+", "-", title)

    return title.strip("-")