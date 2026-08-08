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
