# PLA Forge v0.2

## Build Plate Planner
- Colour-first planning
- Mix different Pals using the same filament
- Remaining-to-print = demand - printed stock - active plate allocation
- Add grouped production STLs
- Add individual recovery/spare STLs manually
- Draft / Printing / Complete / Cancelled plate states
- Plate IDs: PLATE-0001, PLATE-0002...
- Optional printer and plate note
- Estimated filament grams
- Passed/failed confirmation on completion
- Successful output moves to Printed Parts Inventory
- Failed quantities recorded
- Printed Parts page with grouped sets and recovery spares

## Updating GitHub Pages
You only need to replace/upload these changed files for v0.2:
- assets/forge.js
- assets/forge.css
- plates.html
- parts.html
- index.html
- README.md

Your existing data folder can stay as it is.

## Storage
v0.2 still uses browser localStorage for operational state until the shared backend is built.


## v0.2.1 Settings upgrade

- New site-wide `Settings` page
- Add / disable / delete printers
- Store printer name, model, nozzle and build volume
- Choose a default printer
- Build Plate Planner now pulls its printer dropdown from Settings
- No more free-text printer names on plates


## v0.2.2 hotfix
- Fixed Add Printer handling on Settings
- Added visible success/error feedback
- Build Plate Planner printer control is now a true Settings-backed dropdown
- Added cache-busted CSS/JS references so GitHub Pages does not serve the old interface
- Restyled all text boxes, number fields and dropdowns to the dark PLA Forge theme

## v0.2.3 Build Plate UX
- Removed the separate Extra / Recovery Part panel
- Added an `Extra` column directly to every colour-group row
- `+ Extra` adds one additional grouped print set even when Remaining is zero
- Extra successful prints are stored in the same Printed Parts inventory and reduce future print demand

## v0.2.4 Exact Part Printing
- Keeps inline Add and + Extra controls
- Adds Exact Part on any row with separate recovery STL files
- Exact Part expands directly below the same Pal/colour group
- Select one specific STL and quantity
- Exact recovery parts are stored separately in Printed Parts Inventory

## v0.2.7 Kitsu Print Queue
- New `Colours You Need to Print` section above the existing Build Plate Planner
- Only colours with outstanding production demand are shown
- Each colour shows outstanding grouped sets, estimated filament grams, number of Pals, and number of recipe groups
- Colours are prioritised by outstanding quantity
- Clicking a colour selects it in the existing detailed checklist below
- Existing Add / + Extra / Exact Part workflow remains unchanged

## v0.2.8 Granular Print Completion
- Complete Print can now record an individual failed STL inside a grouped print
- Full grouped sets passed are still recorded normally
- `Individual Part Problem` expands the recovery STL list for that colour group
- Enter failed quantity against the exact STL that went wrong
- Good parts from an incomplete grouped set are automatically saved into Recovery Parts inventory
- Failed exact parts are recorded in Failed Prints so they can be added back to a future plate

## v0.3.0 Assembly
- Assembly Queue calculates how many complete Pals can be built from Printed Parts Inventory
- The lowest available recipe colour-group determines Ready to Assemble quantity
- Assemble any quantity up to the available amount
- Assembly consumes the required grouped printed parts automatically
- Completed Pals move into Assembled Pals stock ready for Packaging
- Assembly History records each transaction


## v0.7.3 — Packing Station Awaiting Logic

- Packing Station `Ready to Pack` continues to show Pals that have:
  - an assembled Pal
  - a ready insert
  - clear box stock
  - bottom card stock
  - sticker stock
- Packing Station `Awaiting` is now driven by Production Planner demand.
- A Pal only appears in `Awaiting` when Production Planner says it is currently required.
- `Awaiting assembled Pal` is no longer shown as a Packing Station blocker.
- If the only missing item is the assembled Pal, the product remains upstream at The Bench.
- Packing Station `Awaiting` now only shows packaging-stage blockers such as:
  - Awaiting ready insert
  - Need clear boxes
  - Need bottom card squares
  - Need stickers
- Awaiting cards show the current Production Planner requirement.

## Recent workflow milestones

### v0.7.2 — Dispatch Recovery Fix
- Fixed completed packing batches not reliably appearing in Awaiting Dispatch.
- Added recovery logic for completed packing history that had not been routed into Dispatch.

### v0.7.1 — Dispatch Destination Control
- Removed Boat / Cornwall destination selection from Packing Station.
- Completed batches now enter Awaiting Dispatch.
- Destination is chosen on the Dispatch page.
- Choosing a location updates Forge location inventory.
- Cornwall allocations remain Awaiting Delivery until physically received.

### v0.6.4 — Batch Packing
- Added batch quantities to Packing Station.
- All eight packing steps can be completed for a batch together.
- Batch completion consumes assembled Pals, inserts and packaging materials together.

### v0.6.2 — Barcode Labels
- Added Code 128 Pal barcode generation.
- Barcode label formatted to 50 mm × 30 mm.
- Added separate Barcode / Label Printer configuration in Settings.
- Removed Barcode Labels from Consumables.

### v0.6.0 — Consumables
- Added consumable stock tracking for:
  - Flat Clear Boxes
  - Bottom Card Squares
  - Stickers
- Added reorder levels, restocking and movement history.

### v0.5.2 — Insert Production Split
- Split Insert Production into Print Queue and Cut & Score Queue.
- Print queue links directly to the correct Google Drive PDF by SKU.
- Cut & Score moves printed inserts into Ready Insert stock.
