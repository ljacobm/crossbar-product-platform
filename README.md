# Crossbar Product Platform

## Overview

The Crossbar Product Platform is a Product Information Management (PIM) system designed specifically for Crossbar Athletics.

Its purpose is to centralize supplier product information, customer catalog management, Shopify integration, team store management, quote requests, and future production workflows into one platform.

The long-term goal is to make this the single source of truth for every product offered by Crossbar Athletics.

---

# Technology Stack

* Python
* Supabase (PostgreSQL)
* Google Sheets
* Shopify API
* Git / GitHub
* VS Code

---

# Current Project Structure

```
SUPABASECATALOG/
│
├── analyze/
│   └── analyze_sanmar_csv.py
│
├── data/
│   └── sanmar_shopify.csv
│
├── output/
│
├── .env
├── .gitignore
├── normalization.py
└── README.md
```

---

# Current Database Tables

Current Supabase tables:

* supplier_products
* supplier_colors
* supplier_variants
* approved_catalog
* quote_requests

**Note:** These tables are considered Version 1 and may be redesigned before importing production data.

---

# Milestones

## ✅ Milestone 0 — Development Environment

Completed

* Supabase project created
* Git repository initialized
* GitHub repository connected
* VS Code project configured
* SanMar FTP catalog downloaded
* CSV analyzer created
* Normalization layer created

---

## 🔄 Milestone 1 — Supplier Data Engine

In Progress

Goals:

* Finalize Product Information Model (PIM)
* Design normalized database schema
* Build SanMar importer
* Populate Supabase
* Validate imported data

---

## Planned Milestones

### Milestone 2

Master Catalog Management

* Google Sheets synchronization
* Product approval workflow
* Pricing rules
* Product categories

### Milestone 3

Website Catalog

* Public searchable catalog
* Product detail pages
* Filtering
* Images
* Product recommendations

### Milestone 4

Quote & Mockup Requests

* Logo upload
* Roster upload
* Quantity builder
* Quote request management

### Milestone 5

Shopify Integration

* Shopify synchronization
* Draft orders
* Payment links
* Team store creation

### Milestone 6

Team Dashboard

* Team catalog management
* Sales reporting
* Fundraiser tracking
* Jersey roster management
* Store management

---

# Design Philosophy

The Crossbar Product Platform is designed around a single source of truth.

Supplier data is imported into Crossbar's own product database rather than being used directly.

This allows multiple suppliers (SanMar, S&S Activewear, Augusta, etc.) to power the same catalog while keeping Crossbar's internal product structure consistent.

---

# Next Session

1. Redesign the Product Information Model (PIM)
2. Create the permanent Supabase schema
3. Build the SanMar importer
4. Import the first supplier catalog into Supabase
