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


## v0.7.4 — Grouped Dispatch & Split Location Allocation

- Awaiting Dispatch is now grouped by Pal / SKU rather than showing every completed packing batch separately.
- Multiple packing batches of the same Pal are combined into one `Ready to Dispatch` quantity.
- Each dispatch card shows current inventory, target and outstanding need for:
  - Kitsune Boat
  - Kitsune Cornwall
- Dispatch suggests quantities based on each location's outstanding target need.
- Users can manually choose the exact quantity to send to each location.
- Boat + Cornwall allocation cannot exceed the physically finished quantity available.
- Unallocated finished stock remains in Awaiting Dispatch for a later decision.
- Confirming Boat quantity updates Kitsune Boat inventory immediately.
- Confirming Cornwall quantity updates Kitsune Cornwall inventory immediately and creates an Awaiting Cornwall Delivery record.
- `Received in Cornwall` confirms physical receipt without increasing inventory a second time.


## v0.7.5 — The Bench Remaining Need

- The Bench now subtracts already assembled Pals from the Production Planner requirement.
- `Still Needed = Production Planner Need - Assembled Pals`.
- Assembling Pals immediately reduces the Awaiting quantity.
- When the remaining requirement reaches zero, the Pal disappears from Awaiting.
- The Awaiting KPI now shows the remaining quantity still requiring assembly rather than simply counting Pal types.
- Bench cards now show:
  - Production Need
  - Already Assembled
  - Still Needed
- Assembly quantities are limited to useful Production Planner demand when there is an active requirement.


## v0.7.6 — Insert Inventory

- Removed Insert Production History from the Insert Production page.
- Added a live Insert Inventory table for all Pals currently marked On Sale.
- Inventory shows:
  - Printed / Awaiting Cut & Score
  - Cut & Scored / Ready
  - Total inserts in the production pipeline
  - Current quantity still needing to be printed
- Mark Printed and Cut & Score Complete now update this inventory immediately.


## v0.7.7 — Simplified Insert Inventory

- Insert Inventory now shows only On Sale Pals and their Ready insert quantity.
- Printed / Awaiting Cut & Score remains visible in the production queues, but is no longer repeated in the inventory table.


## v0.7.8 — Dispatch Quantity De-duplication
- Fixed Ready to Dispatch totals being doubled.
- Awaiting Dispatch records now link directly to their Packing History record.
- Recovery no longer recreates an already represented packing batch.
- Duplicate recovered records from earlier builds are cleaned automatically.
- Grouped Dispatch includes an additional de-duplication safeguard.


## v0.8.0 — Clean Operational Reset

This release deliberately resets PLA Forge operational data to a clean zero state.

Reset items:
- Location stock
- Stock targets
- Printed Parts inventory
- Build Plates and print history
- Failed print records
- Assembled Pal stock and Assembly history
- Insert production WIP and Ready Insert stock
- Consumable stock and history
- Packing jobs and Packing history
- Finished stock
- Awaiting Dispatch
- Cornwall transfers / receipts
- Production-planner runtime state
- Printer configuration
- Product availability / On Sale runtime state

Preserved in the application files:
- Product catalogue
- SKUs
- Recipes
- STL / recipe metadata
- Insert PDF mapping
- PLA Forge interface and workflow code

Important:
- The old Dispatch recovery system has been disabled.
- Dispatch will no longer recreate completed packing records from historical Packing History.
- A manual `Reset Everything to Zero` control is now available in Settings.


## v0.8.1 — Pipeline-Aware Production Demand

Fixed a core production-demand issue discovered during the clean Axolotl test.

Previous behaviour:
- Build Plates used only the destination inventory deficit.
- When printed parts were assembled, those parts left Printed Parts inventory.
- Forge therefore interpreted them as missing again and requested another print.
- Packing could cause the same problem because packed Pals leave Assembled inventory.

New behaviour:
- Build Plate demand now accounts for finished Pals already moving through the manufacturing pipeline.
- Assembled Pals count toward satisfying production demand.
- Packed Pals awaiting dispatch count toward satisfying production demand.
- Once dispatched, destination inventory takes over and continues satisfying the target.
- Moving stock from Printed Parts → Assembly → Packing → Dispatch no longer creates false replacement print demand.
- The Bench uses the same downstream-aware logic so packed Pals do not reappear as requiring assembly.

Example:
If Axolotl has a total target requirement of 10 and you print and assemble 10:
- Build Plate requirement = 0.
If you then pack 5:
- 5 assembled + 5 packed = 10 accounted for.
- Build Plate requirement remains 0.
If you dispatch the packed 5:
- 5 destination stock + 5 assembled = 10 accounted for.
- Build Plate requirement remains 0.

This update does NOT trigger another clean reset. Existing v0.8.0 data is preserved.


## v0.8.2 — Packing Station Pipeline-Aware Awaiting

Fixed another stage of the same pipeline-accounting issue.

Previous behaviour:
- Packing Station `Awaiting` used the raw location stock deficit.
- When the final assembled Pals were packed, Assembled stock reduced.
- Packing Station then incorrectly treated those packed Pals as missing and showed them as still needed.

New behaviour:
- Packing Station `Awaiting` now uses `manufacturingNeed()`.
- Packed Pals awaiting dispatch count toward fulfilling the production requirement.
- Dispatched Pals are represented by location inventory.
- Pals no longer reappear in Packing Station Awaiting simply because they moved from Assembled into Packed / Awaiting Dispatch.

Axolotl example:
- Target requirement: 10
- 10 assembled
- Pack first 5 → 5 assembled + 5 awaiting dispatch = 10 accounted for
- Pack final 5 → 10 awaiting dispatch = 10 accounted for
- Packing Station Awaiting = 0
- Build Plate demand = 0


## v0.8.3 — Cornwall Delivery Quality Check

- Removed the separate `Received in Cornwall` section from Dispatch.
- Cornwall deliveries now remain in `Awaiting Cornwall Delivery` until a receipt check is completed.
- Each delivery requires confirmation of:
  - Quantity delivered in good condition
  - Quantity damaged
- Good Condition + Damaged must equal the original shipment quantity.
- Cornwall inventory is still allocated when dispatch is confirmed.
- When damage is reported at receipt:
  - Damaged quantity is removed from Cornwall usable inventory.
  - The location falls below its target by the damaged quantity.
  - Production Planner therefore automatically creates replacement production demand.
- Damage events are stored in `damageHistory` for future reporting/auditing.
- If the whole delivery arrives correctly, confirming it does not change inventory again.


## v0.8.4 — Damage Type Routing & Rework

Cornwall delivery damage can now be broken down by issue type.

Available issue types:
- Box Damaged
- Insert Damaged
- Pal Broken
- Complete Write Off

Mixed damage is supported. Example: a shipment with 3 damaged units can be recorded as:
- 1 Box Damaged
- 1 Insert Damaged
- 1 Pal Broken

Routing:
- Box Damaged:
  - The Pal itself does not trigger a replacement Pal print.
  - Creates a Damage Rework job requiring a replacement clear box.
- Insert Damaged:
  - The Pal itself does not trigger a replacement Pal print.
  - Creates extra Insert Production demand.
  - Rework waits for a Ready Insert.
- Pal Broken:
  - Cornwall usable stock is reduced.
  - The resulting target deficit creates replacement Pal manufacturing demand.
  - Rework waits for an assembled replacement Pal.
- Complete Write Off:
  - Creates replacement Pal manufacturing demand.
  - Creates replacement Insert demand.
  - Rework requires a full new packaging set.

Packing Station now includes a Damage Rework section.
Completing rework returns the repaired/replaced unit into Cornwall usable inventory.

Production Planner now includes a Damage / Rework Requirements panel so the reason for replacement work remains visible.

This release preserves existing v0.8.x operational data and does not trigger a reset.


## v0.8.5 — Confirm Delivery Migration Fix

- Fixed `Confirm Delivery` failing when damage routing is used on browser data created before v0.8.4.
- Existing PLA Forge state now automatically initialises:
  - `damageHistory`
  - `damageReworkJobs`
  - `damageInsertDemand`
- Added defensive initialisation inside the Cornwall delivery confirmation handler as a second safeguard.
- No clean reset is required and existing operational data is preserved.


## v0.8.6 — Per-Item Multi-Fault Damage Reporting

Cornwall damage reporting now works per physical damaged item instead of by issue quantity.

Example:
A shipment of 5 arrives with 1 damaged Pal.
That single damaged item can be marked with:
- Box Damaged
- Insert Damaged

It still counts as only 1 damaged physical Pal.

Each damaged item can independently have:
- Box Damaged
- Insert Damaged
- Pal Broken
- Complete Write Off

Rules:
- Multiple faults can be selected on the same damaged item.
- Complete Write Off overrides the individual fault toggles and creates a full replacement.
- Each damaged physical Pal creates one Damage Rework job with a set of requirements.
- Box + Insert damage on one Pal therefore creates one rework job requiring:
  - 1 clear box
  - 1 ready insert
  - no replacement Pal
- Box + Pal Broken creates one job requiring:
  - 1 clear box
  - 1 replacement assembled Pal
- Insert + Pal Broken creates one job requiring:
  - 1 ready insert
  - 1 replacement assembled Pal
- Complete Write Off requires a new Pal, insert, box, bottom card and sticker.

Production Planner and Packing Station Damage Rework have been updated to understand these combined requirements.

Older v0.8.4 / v0.8.5 damage jobs remain supported.
Existing operational data is preserved and no reset is triggered.


## v0.8.7 — Dedicated Rework Centre

- Added a dedicated `Rework` page to the PLA Forge sidebar.
- Rework is now a first-class workflow instead of being managed only inside Packing Station.
- Active Rework shows:
  - Pal / SKU
  - Damaged item number
  - Reported fault(s)
  - Exact rework route
  - Required components and current availability
  - Ready / Waiting state
- Rework KPIs show:
  - Active jobs
  - Ready jobs
  - Waiting jobs
  - Completed jobs
- Rework can be completed directly from the new page once all required replacement stock is available.
- Completing Rework:
  - consumes only the replacement components actually required
  - returns the repaired/replaced Pal into Cornwall usable inventory
  - records the completion in Rework History
- Packing Station keeps its quick Damage Rework view and now links to the full Rework page.
- Existing v0.8.x data is preserved; no reset is triggered.


## v0.8.8 — Split Rework Routes

Rework now has two distinct operational routes.

### Cornwall Local Repair
Used when the Pal itself is intact:
- Box Damaged
- Insert Damaged
- Box Damaged + Insert Damaged

These jobs use `Cornwall Rework Stock` held locally:
- Flat Clear Boxes
- Pal-specific Ready Inserts

Completing a local repair immediately returns the repaired Pal to Cornwall usable inventory.

### Factory Replacement
Any job containing `Pal Broken` goes back to factory production.

- Pal Broken only:
  - Factory produces a replacement Pal.
  - Rework waits for an assembled replacement Pal.
  - The replacement is sent to Dispatch.
  - Dispatch destination is locked to Kitsune Cornwall.
  - Cornwall inventory is updated only after physical receipt.

- Box + Insert + Pal all selected:
  - There is no separate `Complete Write Off` option anymore.
  - Forge automatically treats all three faults as a Full Factory Replacement.
  - Factory requires a replacement Pal, insert, clear box, bottom card and sticker.
  - The completed replacement goes through Dispatch back to Cornwall.

### Dispatch
Factory rework returns appear in Dispatch separately from normal stock and are locked to Cornwall.

### Cornwall Rework Stock
The Rework page now includes a local spare-stock section:
- Generic Flat Clear Box quantity
- Pal-specific spare Insert quantities for On Sale Pals

Existing operational data is preserved and no reset is triggered.
