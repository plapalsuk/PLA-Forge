# PLA Forge v0.1

Manufacturing & Inventory System for PLA Pals.

## Run
GitHub Pages works directly. For local testing use:
`python3 -m http.server 8000`

## Current build
- PLA Forge dark/orange application shell
- Kitsu Kitsune system identity
- 83 Pals and 5 sticker-sheet products loaded from current Master File
- Recipe viewer with per-colour grouped STL, part count and grams
- Master-data recipe resolution (does not blindly trust mismatched recipe SKUs)
- Data Health page
- Pals / Keyrings / Sticker Sheets pages with editable Boat & Cornwall targets
- Production-demand page
- Filament inventory with 250g reorder alerts
- Build Plates, Printed Parts, Assembly, Packing and Dispatch module scaffolds

## Important
Stock is local browser data in v0.1. Shopify Admin credentials must never be placed in GitHub Pages JavaScript.
The Shopify connection will use a secure backend/API layer.
