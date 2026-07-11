# Crossbar Product Platform

## Vision

The Crossbar Product Platform is the central product management system for Crossbar Athletics.

Its purpose is to maintain one master catalog that powers:

* Crossbar website catalog
* Shopify products
* Team stores
* Customer quote requests
* Internal production workflows
* Future customer dashboards

The long-term goal is to maintain product information in one place while automatically distributing that information throughout the business.

---

# Current Project Status

## ✅ Completed

### Project Foundation

* GitHub repository created
* Modular Python project structure
* Environment configuration
* Supabase project connected

### Database

Designed and implemented the V2 database schema.

Current tables:

* suppliers
* catalog_products
* supplier_products
* product_variants
* product_images
* catalog_settings
* price_rules
* quote_requests
* quote_request_items

### SanMar Import

Completed full SanMar catalog import.

Current database contents:

* 2,996 Products
* 123,018 Variants
* 20,116 Product Images

### Normalization

Implemented normalization for:

* Product Titles
* Categories
* Sizes
* Colors
* Brands
* URL Slugs

### Service Layer

Created reusable services.

Current services:

* supabase_client.py
* catalog_service.py

---

# Current Project Structure

```text
Crossbar Product Platform
│
├── analyze/
│   └── analyze_sanmar_csv.py
│
├── data/
│   └── sanmar_shopify.csv
│
├── database/
│   └── schema_v2.sql
│
├── importers/
│   └── import_sanmar.py
│
├── services/
│   ├── __init__.py
│   ├── supabase_client.py
│   └── catalog_service.py
│
├── normalization.py
├── requirements.txt
└── README.md
```

---

# Product Architecture

```text
Supplier
      │
      ▼
Supplier Product
      │
      ▼
Catalog Product
      │
      ▼
Variants
      │
      ▼
Images
```

Crossbar SKU Format:

```
CB-ST350
CB-F244
CB-112
```

Customer URL Slugs:

```
sport-tek-posicharge-competitor-tee-st350
nike-dri-fit-micro-pique-polo-746099
```

---

# Planned Development Roadmap

## Phase 1 — Product Platform ✅

* Database
* Product normalization
* SanMar import
* Service layer

Status: COMPLETE

---

## Phase 2 — Catalog Manager

Build an internal web application to manage products.

Features:

* Search products
* Edit customer-facing names
* Edit descriptions
* Set pricing rules
* Manage categories
* Enable/disable products
* Product scoring
* Decoration recommendations
* Internal notes

---

## Phase 3 — Shopify Integration

Automatically publish approved products to Shopify.

Features:

* Create products
* Update products
* Sync pricing
* Sync images
* Sync inventory settings

---

## Phase 4 — Quote System

Allow customers to request quotes.

Features:

* Product selection
* Color selection
* Size quantities
* Team rosters
* Logo uploads
* Mockup requests
* Quote approval

---

## Phase 5 — Team Store Manager

Allow organizations to manage their own stores.

Features:

* Enable/disable products
* Choose logos
* View sales
* Team roster management
* Order tracking
* Store analytics

---

## Phase 6 — Customer Dashboard

Customer portal.

Features:

* Team stores
* Quotes
* Orders
* Sales reports
* Artwork
* Rosters
* Product catalog

---

# Future Suppliers

Planned integrations:

* S&S Activewear
* Alphabroder
* Augusta Sportswear
* Holloway
* Charles River
* Outdoor Cap

---

# Long-Term Goal

Build a centralized operating system for Crossbar Athletics where all supplier data, product information, pricing, customer catalogs, Shopify stores, quotes, production data, and team stores are managed from one platform.


# Crossbar Product Platform

Internal product management platform for Crossbar Athletics.

The goal of this project is to replace spreadsheets with a centralized product database that powers:

- Product Catalog
- Team Store Builder
- Shopify Publishing
- Mockup Generation
- Decoration Management
- Pricing
- AI Product Creation

---

# Tech Stack

Frontend
- Next.js 15
- React
- TypeScript
- Tailwind CSS

Backend
- Supabase
- PostgreSQL
- Row Level Security

Future
- Shopify Admin API
- OpenAI API
- Supabase Storage
- Cloudflare CDN

---

# Current Features

## Dashboard

- Summary statistics
- Product search
- Product table
- Supplier overview

## Product List

- Search by:
  - Product Name
  - SKU
  - Brand
  - Category

- Clean table layout
- Image thumbnails
- Status badges
- Product detail navigation

## Product Detail

- Hero image
- Image gallery
- Dynamic color selection
- Dynamic image switching
- Live inventory
- Supplier pricing
- Supplier SKU
- Overview section

---

# Database

Primary tables

catalog_products
product_variants
product_images
suppliers

Relationships

catalog_products
    ├── product_images
    └── product_variants

---

# Project Structure

frontend/

app/
    page.tsx
    products/[id]/page.tsx

components/
    Sidebar.tsx
    SummaryCards.tsx
    SearchBar.tsx
    ProductTable.tsx
    ProductRow.tsx
    ProductHeroWorkspace.tsx
    ProductColorSelector.tsx
    ProductVariants.tsx
    PageHeader.tsx

lib/
    supabase.ts

---

# Environment

Create:

frontend/.env.local

Required variables

NEXT_PUBLIC_SUPABASE_URL=

NEXT_PUBLIC_SUPABASE_ANON_KEY=

---

# Running

Install

npm install

Development

npm run dev

Build

npm run build

---

# Current Progress

✅ Dashboard

✅ Product Search

✅ Product List

✅ Product Detail

✅ Image Gallery

✅ Dynamic Color Selection

✅ Inventory Display

✅ Supplier Pricing

---

# Next Milestones

## Product Management

- Edit Product
- Add Product
- Delete Product

## Images

- Copy Image
- Download Image
- Upload Crossbar Images
- Replace Supplier Images

## Pricing

- Selling Price
- Decoration Cost
- Margin Calculator

## Decoration

- Embroidery
- DTF
- Screen Print

## Website

- SEO
- Collections
- Tags
- Visibility

## Mockups

- Generate Mockups
- Store Mockups
- Publish Mockups

## Shopify

- Product Sync
- Inventory Sync
- Publish Collections

## AI

- AI Product Descriptions
- AI Mockups
- AI Logo Placement
- AI Product Creation

---

# Long Term Vision

The Crossbar Product Platform will become the central operating system for apparel production.

Instead of managing products across spreadsheets, Shopify, supplier websites, and design files, every product will exist in one place.

This platform will manage:

- Supplier data
- Inventory
- Images
- Pricing
- Decoration
- Mockups
- Website publishing
- AI-assisted product creation

with Shopify serving only as the storefront while this application becomes the single source of truth.