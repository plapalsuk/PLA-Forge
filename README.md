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


## v0.8.9 — Cornwall Spare Stock Controls

- Fixed Cornwall Rework Stock add controls not reliably updating stock.
- `Current Stock` is now display-only.
- Clear Box stock can only be changed by entering a quantity and pressing `Add Boxes`.
- Pal-specific Insert stock can only be changed by selecting the Pal, entering a quantity and pressing `Add Inserts`.
- Add handlers now defensively initialise Cornwall spare-stock data before saving.
- Existing operational data is preserved; no reset is triggered.


## v0.8.10 — Rework Layout & Cornwall Spare Alerts

- Removed Rework History from the Rework page.
- Active Rework is now shown before Cornwall Rework Stock.
- Cornwall Rework Stock has moved below Active Rework.
- Rework KPI cards now show Active, Ready and Waiting only.
- Cornwall spare stock has a minimum threshold of 1.
- Any Cornwall spare stock below 1 is flagged as Factory Replenishment Required.
- Alerts cover Flat Clear Boxes and every On Sale Pal's Cornwall Ready Insert stock.
- Production Planner now includes a Cornwall Spare Replenishment panel for the factory.
- Spare-stock replenishment is a supply alert only and does not create false Pal manufacturing demand.
- Existing operational data is preserved; no reset is triggered.


## v0.8.11 — Cornwall Insert Replenishment Workflow

Cornwall spare Insert low-stock alerts are now connected to real production and dispatch.

Flow:
1. Cornwall Ready Insert stock for an On Sale Pal falls below 1.
2. Forge automatically creates a replenishment requirement of 1 spare Insert.
3. The requirement appears in Insert Production Queue.
4. Factory prints the Insert.
5. Cut & Score completion routes the replenishment Insert into Dispatch instead of normal factory Ready Insert stock.
6. Dispatch shows the item as `Cornwall Spare Insert`, locked to Kitsune Cornwall.
7. Dispatching it creates an Awaiting Cornwall Delivery record.
8. Cornwall confirms receipt.
9. The received quantity is added to Cornwall Rework Stock for that Pal.

Additional behaviour:
- Forge will not repeatedly create duplicate replenishment demand while an Insert is already in production, Awaiting Dispatch or in transit.
- Production Planner shows Cornwall Insert shortages as `IN REPLENISHMENT` while supply is already moving through the workflow.
- Cornwall spare Insert replenishment does not create Pal manufacturing demand.
- Existing operational data is preserved and no reset is triggered.


## v0.8.12 — Cornwall Insert Target Stock 2

- Cornwall spare Pal Inserts now have an agreed target stock of 2 per On Sale Pal.
- Replenishment restores stock back to 2 rather than simply creating one Insert when stock reaches zero.

Examples:
- Cornwall stock 0 → factory requirement 2
- Cornwall stock 1 → factory requirement 1
- Cornwall stock 2 → no requirement
- Cornwall stock above 2 → no requirement

The calculation also accounts for Inserts already:
- in Insert Production
- Awaiting Dispatch
- in transit to Cornwall

This prevents duplicate production while still ensuring the final Cornwall stock returns to 2.

Example:
Phoebe the Pig has 0 Cornwall spare Inserts.
Forge creates a production requirement for 2 Phoebe Inserts.
After both are Cut & Scored they move through Dispatch to Cornwall.
When Cornwall confirms receipt, Phoebe's Cornwall Ready Insert stock becomes 2.

Existing operational data is preserved and no reset is triggered.


## v0.8.13 — Dispatch Item-Type Isolation Fix

Fixed normal Pal dispatch being incorrectly limited by a Cornwall Spare Insert group sharing the same SKU.

Example:
- Todd the Turtle finished Pals: 5
- Todd the Turtle Cornwall spare Inserts: 2

Previous behaviour:
- Clicking the normal Todd Pal dispatch card could resolve the first Todd group by SKU.
- If that first group was the 2 spare Inserts, Forge incorrectly reported `Only 2 ready to dispatch`.

New behaviour:
- Every dispatch card now uses its exact dispatch group key.
- Normal Pal cards can only resolve normal Pal records.
- Cornwall Spare Insert cards can only resolve Cornwall Spare Insert records.
- Rework return cards remain isolated from both.
- Dispatch record consumption also verifies the item type before reducing quantities.

So 5 Todd Pals and 2 Todd spare Inserts can now be dispatched independently.

Existing operational data is preserved and no reset is triggered.


## v0.8.14 — Side Menu Organisation

Updated the Forge side navigation:

**The Workshop**
- Production Planner
- Build Plates
- The Bench
- Rework

**Materials**
- Filament
- Recipes
- Printed Parts
- Consumables

Recipes and Printed Parts have been moved from The Workshop into Materials on every Forge page. No operational data or workflow logic has been changed.


## v0.8.15 — Build Plate Checklist Improvements

- Colour-sorted Print Checklist is now limited to approximately 5 visible rows.
- Additional checklist rows are accessed with a vertical scrollbar.
- The table header remains visible while scrolling.
- Added checklist search by Pal name, SKU, colour group / parts, and filament colour.
- Completing a print now removes the plate from Saved Build Plates.
- Completed plate details remain retained in Print History.
- Completed Plates KPI now reads from Print History.
- Legacy completed/cancelled plates are hidden from Saved Build Plates.
- Existing operational data is preserved and no reset is triggered.


## v0.8.16 — Bench Assembled Inventory

- Removed Assembly History from The Bench page.
- Added a live Assembled Inventory section beneath the Ready and Awaiting queues.
- Assembled Inventory shows only Pals with assembled stock currently available for Packing.
- Added a dedicated search box for Assembled Inventory.
- Search supports Pal name and SKU.
- Inventory updates immediately whenever Pals are assembled or consumed downstream.
- Existing operational data is preserved and no reset is triggered.


## v0.8.17 — Insert Inventory Search

- Added a dedicated search bar to Insert Inventory.
- Search filters by Pal name or SKU.
- The Insert Inventory search is independent from the main Insert Production search, so it does not affect Print or Cut & Score queues.
- Existing operational data is preserved and no reset is triggered.


## v0.8.18 — 210gsm Card Consumable

- Added `210gsm Card` to Consumables.
- Unit: sheets.
- Default reorder level: 25 sheets.
- Insert Production now consumes 1 sheet of 210gsm Card for every 1 Insert completed through Cut & Score.
- Cut & Score completion is blocked if there is not enough 210gsm Card stock.
- Card usage is recorded in Consumable History.
- Existing operational data is preserved; no reset is triggered.


## v0.8.19 — 210gsm Card Deduction Timing

- Corrected 210gsm Card consumption timing.
- 1 sheet of 210gsm Card is now deducted when an Insert is marked **Printed**.
- Cut & Score no longer deducts any card.
- If there is not enough 210gsm Card available, `Mark Printed` is blocked and Forge shows the required and available quantities.
- Consumable History records the usage as `Insert printed · SKU`.
- Existing operational data is preserved and no reset is triggered.


## v0.9.0 — New Pal Setup

Added a dedicated `New Pal Setup` page under Administration.

The setup flow captures:
- SKU
- Pal name / animal
- Collection
- Barcode
- Price
- Release date / On Sale status
- 3 characteristics
- Short and full product descriptions
- Height / width / depth
- Production recipe colour groups
- Filament
- Parts / grouped set
- Grouped STL
- Individual recovery STL files
- Part count
- Weight
- Folded Insert Google Drive PDF
- Shopify vendor, product type and tags

### Forge integration
New Pals are stored as persistent custom catalogue data in the browser and automatically merge into the normal Forge data loaders.

This means a newly created Pal becomes available to:
- Pals
- Recipes
- Production Planner
- Build Plates
- Printed Parts
- The Bench
- On Sale / Availability
- Insert Production
- Packing Station
- Dispatch
- Rework

No static JSON file needs to be manually edited for a new Pal.

### Shopify hand-off
New Pal Setup supports a configurable `Secure Shopify Bridge URL`.

For security, Forge does not store a Shopify Admin token in the GitHub Pages JavaScript.

When a Bridge URL is configured, Forge sends a product-creation payload to it and expects the bridge to create a Draft Shopify product and return the Shopify product / variant identifiers.

If no bridge is configured, the Pal is still fully created in Forge and its Shopify status is stored as `Pending`, ready to send once the secure bridge is connected.

Existing operational data is preserved and no reset is triggered.


## v0.9.1 — New Pal Filament Dropdown

- Production Recipe filament entry on New Pal Setup is now a dropdown rather than free text.
- The dropdown is populated from the filaments already configured/used in Forge.
- Existing filament inventory names and recipe filament names are merged and de-duplicated.
- Where a filament has inventory data, its current grams in stock are shown alongside the filament name.
- This prevents spelling differences from accidentally creating duplicate filament colours.
- Existing operational data is preserved and no reset is triggered.


## v0.9.2 — Cloud Database Migration Panel

Added a copy-only Cloudflare D1 migration panel to Data Health.

Features:
- Uses `https://pla-forge-api.plapalsuk.workers.dev` by default.
- Runs `/health` to confirm Worker → D1 connectivity.
- Displays local Forge product count and current cloud product count.
- `Migrate Forge to Cloud` automatically gathers:
  - merged products catalogue
  - recipes
  - Insert PDF mappings
  - current browser operational state
- Sends the payload to `POST /migration/import`.
- Existing localStorage data is not deleted or modified by the migration.
- After import, Forge automatically calls `/products` and verifies that the cloud product count matches the local catalogue.
- `Verify Cloud Data` can be run independently at any time.
- The API URL is stored in Forge site settings for later cloud-mode use.

This release does not yet switch any operational Forge page to D1 as its source of truth. Migration remains copy-only until cloud data has been verified.


## v0.9.3 — Cloud Login & API Security

Before enabling live cloud-backed production writes, the PLA Forge Cloudflare API is now secured.

### Worker authentication
The supplied `pla-forge-api-v2.js` requires two Cloudflare Worker Secrets:
- `FORGE_ADMIN_PASSWORD`
- `FORGE_SESSION_SECRET`

`FORGE_ADMIN_PASSWORD` is the password used to sign into Forge Cloud.
`FORGE_SESSION_SECRET` is a long random secret used only by the Worker to sign 12-hour session tokens.

The Worker uses Cloudflare Web Crypto HMAC signing. The password and signing secret remain in Cloudflare Worker Secrets and are never committed to GitHub Pages.

### Forge Cloud Login
Data Health now includes a Cloud Login panel.
- Password is submitted directly to `/auth/login`.
- A signed 12-hour token is stored in `sessionStorage` for the current browser tab.
- The password itself is not stored by Forge.
- Logout removes the token.
- Migration and cloud verification calls now use the authenticated token.

### Protected endpoints
All database endpoints except `/health` and `/auth/login` now require authentication.

### Cloud Core API groundwork
The secured Worker also adds:
- `GET /core`
- `GET /targets`
- `PUT /targets/:sku/:location`
- `PUT /products/:sku/availability`
- `PUT /filaments/:name`

These endpoints are the foundation for switching Pals, Recipes, Filaments and stock targets to D1 in the next stage.

No operational Forge page has yet been switched to cloud as the source of truth. Existing local data remains intact.


## v0.9.4 — Cloud Core

PLA Forge has entered the first live cloud-backed stage.

When a valid Cloud Login session is present:

### Cloud-backed reads
- Pals / Products read from D1.
- Recipes read from D1.
- Filaments read from D1.
- On Sale / Release Date state is synchronised from D1.
- Boat / Cornwall stock targets are synchronised from D1.

### Cloud-backed writes
- Changing Boat or Cornwall target stock on the Pals page writes to D1.
- Updating filament stock or reorder level writes to D1.
- Changing On Sale status writes to D1.
- Changing a release date writes to D1.

### Safe fallback
- Cloud data is cached into the existing Forge browser state.
- If Cloudflare is unavailable, the current local/cache data remains available.
- Build Plates, Printed Parts, The Bench, Insert Production, Packing, Dispatch, Rework and live inventory movements remain on the existing local production engine for now.
- This prevents a partial cloud migration from disrupting the proven production workflow.

### Data Health
A new Cloud Core status panel shows the live counts for Products, Recipes, Filaments and Targets.

No operational reset is triggered.


## v0.9.5 — Employee Login & Permissions

Forge is now a login-first application.

### Employee accounts
Cloudflare D1 `users` records now support password authentication with:
- per-user salt
- PBKDF2-SHA256 password hashing
- active / disabled state
- last login timestamp
- role

Passwords are never stored in plaintext.

### Roles
Initial roles:
- **Admin** — full Forge access, employee management and product availability.
- **Factory** — manufacturing, materials, packing and dispatch.
- **Cornwall** — Cornwall stock, delivery and rework workflows.
- **View Only** — read-only operational pages.

The Worker enforces API permissions. The frontend also hides menu items and redirects users away from pages their role cannot access.

### Login
- New `login.html` is the entry point.
- Every Forge page checks for a valid Cloudflare employee session.
- Unauthenticated visitors are redirected to Login before Forge is shown.
- Login persists on that device using the signed session token.
- The employee password is not stored in the browser.
- Sidebar shows the signed-in employee and role with a quick logout control.

### Employee Management
Settings now has an Employee Accounts section for Admin users:
- add employee
- choose role
- enable / disable employee
- reset password

### Required Cloudflare update
1. Run `cloudflare-d1-schema-v2.sql` once in D1.
2. Replace the Worker code with `pla-forge-api-v3.js`.
3. Keep the existing Worker Secrets:
   - `FORGE_ADMIN_PASSWORD`
   - `FORGE_SESSION_SECRET`
4. Temporarily upload `bootstrap.html`.
5. Open `bootstrap.html`, enter the existing Forge Admin Password, and create the first employee Admin account.
6. Delete `bootstrap.html` after the first administrator is created.
7. Open `login.html` and sign in with the new employee account.

No stock or operational data is reset.


## v0.9.6 — PLA Forge Roles

Employee permissions now use the agreed PLA Forge roles:

- **Admin** — unrestricted access to Forge, Settings, employee management and all actions.
- **Packing** — Packing Station only. The API grants only the supporting read access required for packing and packing workflow permissions.
- **Retail Staff** — Awaiting Cornwall Delivery and Cornwall Rework only. Retail Staff can receive Cornwall deliveries and work with Cornwall-held replacement Boxes and Inserts. Factory production, Pal manufacture, materials, settings and employee management are not available.

Both the frontend page guard and Cloudflare Worker role map use these role names. The Worker remains the security boundary; hiding navigation is only an additional UI convenience.

Existing Admin accounts remain Admin. If any test employee was previously assigned Factory, Cornwall or View Only, change/recreate that employee with Packing or Retail Staff after deploying v0.9.6.


### v0.9.6a — Role Landing Page Fix

- Fixed an infinite reload loop affecting restricted employee roles after login.
- Admin now lands on Dashboard.
- Packing now lands directly on Packing Station.
- Retail Staff now lands directly on Awaiting Cornwall Delivery.
- If a restricted user manually opens a page they cannot access, Forge now redirects them to their own permitted home page instead of Dashboard.
- Login return URLs are checked against the employee role before navigation.
- No database or stock data is changed.


### v0.9.6b — Retail Delivery View

Retail Staff no longer see factory dispatch controls on the Deliveries page. The Retail Staff view is restricted to the Cornwall receiving workflow, centred on Awaiting Cornwall Delivery. Admin retains the complete Dispatch page.


### v0.9.6c — Mobile-first UI

- Mobile layout now uses a single-column structure.
- Sidebar becomes a compact touch-friendly navigation strip.
- Larger 48px minimum touch targets for buttons and form fields.
- Tables collapse into mobile cards rather than forcing horizontal scrolling.
- Kitsu/header area is reduced on smaller screens.
- Retail Staff delivery page is focused specifically on Cornwall receiving.
- Retail Staff mobile view hides the Kitsu panel to prioritise the delivery workflow.
- Rework controls stack vertically for easier one-handed use.
- Login screen has improved mobile sizing and spacing.
- No Worker, SQL, stock or permission changes are required.


## v0.9.7 — Site-wide Mobile Responsive Pass

The full Forge interface is now responsive, not just Retail Staff pages.

Mobile improvements apply to:
- Dashboard
- Pals
- Keyrings
- Sticker Sheets
- Production Planner
- Recipes
- Build Plates
- Printed Parts
- The Bench
- Rework
- Insert Production
- Packing Station
- Dispatch / Cornwall Delivery
- Filament
- Consumables
- Settings
- Data Health
- New Pal Setup
- Login

Changes include:
- sidebar collapses into compact mobile navigation
- all major grids collapse to one column
- tables become stacked card-style rows
- 46px+ touch targets
- mobile-friendly search/filter toolbars
- responsive forms and modals
- no forced horizontal scrolling
- Build Plate and Packing controls stack cleanly
- Dispatch/Rework allocations use single-column layouts
- New Pal recipe/dimension forms collapse safely
- mobile-specific page classes added for future tuning

No Worker, SQL, stock, permissions or database changes are required.


### v0.9.7a — Role-aware Navigation

The Forge sidebar/mobile navigation now shows only tabs permitted for the signed-in employee.

- **Admin** — all Forge tabs.
- **Packing** — Packing Station only.
- **Retail Staff** — Cornwall Deliveries and Rework only.
- Empty navigation section headings are hidden automatically.
- The current permitted tab is highlighted.
- Manual URL protection remains in place, so hidden pages are still inaccessible even if the URL is entered directly.
- No Worker, SQL, stock or database changes are required.


### v0.9.7b — Navigation Flash Fix

Fixed the mobile/desktop navigation flash seen when moving between Forge pages.

Previously the static HTML sidebar rendered all Admin links for a fraction of a second before the asynchronous employee role check hid unauthorised tabs.

Now:
- navigation links remain hidden while Forge validates the signed-in employee
- the sidebar is revealed only after role permissions are applied
- Retail Staff never briefly see Admin/Factory navigation when changing pages
- Packing users never briefly see other Forge tabs
- Admin navigation appears normally after authentication
- no Worker, SQL, database or permission changes are required


### v0.9.8 — Safe Operational Reset

`Reset Everything to Zero` is now a controlled browser operational reset.

Cleared locally:
- stock quantities
- printed parts
- saved/current build plates
- print history and failed parts
- assembled inventory/history
- box/insert production and history
- consumable physical stock quantities
- packing jobs/history
- finished Boat/Cornwall inventory
- dispatch queues/transfers
- damage/rework jobs/history
- production planner/production quantities

Preserved:
- Cloudflare D1 data
- employee accounts and permissions
- cloud catalogue and recipes
- production targets
- printers and printer roles
- site/API/Shopify settings
- product availability configuration
- locally cached/custom master catalogue data
- Shopify product mappings
- consumable names/reorder levels

Also removed the old behaviour where changing Forge's reset-release version could automatically replace the entire local state.


## v0.9.9 — Cloud Production Stage 1

Stage 1 moves the Production Planner / Build Plate operational source into Cloudflare D1.

New D1 storage:
- `forge_operational_state` — production operational state required by the planner
- `build_plates` — shared saved/printing build plates

New Worker endpoints:
- GET/PUT `/production/state`
- GET `/build-plates`
- PUT/DELETE `/build-plates/:id`

Behaviour:
- Production Planner and Build Plates hydrate from D1 when opened.
- Changes are mirrored back to D1.
- Build plates created on one authenticated Admin device become available to another device.
- Local storage remains as a temporary cache/fallback during migration.
- Existing employee authentication remains unchanged.

Installation order:
1. Run `PLA-FORGE-V099-CLOUD-PRODUCTION.sql` once in the D1 console.
2. Deploy `pla-forge-api-v3e.js`.
3. Upload the v0.9.9 Forge frontend files to GitHub Pages.


### v0.9.9.1 — Cloud Sync Repair

Fixes:
- Worker route variables are now initialised before cloud routes use them.
- Fixes `Cannot access 'm' before initialization`.
- Fixes target writes failing after Worker v3e.
- Fixes Production/Build Plate cloud reads silently falling back to browser data.
- D1 is authoritative for the migrated Build Plate list.
- Build Plate saves are queued and awaited before the UI confirms success.
- Start Print, Cancel and Complete Print now wait for D1 persistence.
- Production Planner and Build Plates show a visible Cloud Sync status.
- Added Refresh Cloud button.
- Added `/production/sync-status` diagnostic endpoint.

No additional SQL migration is required if the v0.9.9 Cloud Production SQL has already been run.


### v0.9.9.2 — Live Multi-Device Sync

Production Planner and Build Plates now update automatically while open.

- Forge checks Cloudflare D1 every 2 seconds.
- If another device changes production state or a Build Plate, the current page hydrates the latest D1 state automatically.
- No manual browser refresh is required.
- Unsaved Current Plate work remains in memory while shared Build Plate data refreshes.
- Tabs pause polling while hidden to reduce unnecessary Worker requests.
- Returning to the tab triggers a fresh cloud comparison.
- Cloud Sync badge reports live updates.
- Local changes update the cloud stamp so Forge does not unnecessarily refresh its own writes.

No additional SQL or Worker update is required beyond Worker v3f.


### v0.9.9.3 — Printed Parts Cloud

Printed Parts Inventory now uses the same Cloudflare D1 operational state as Build Plates.

- Completing a Build Plate updates Printed Parts automatically.
- Printed Parts live-sync between devices every 2 seconds.
- Grouped sets and exact recovery parts are shared across devices.
- Failed part records are shared across devices.
- Manual + / − inventory corrections wait for Cloudflare confirmation.
- If a manual correction fails to save, Forge rolls the local change back instead of leaving devices out of sync.
- Printed Parts now shows the Cloud Sync badge and Refresh Cloud control.

No SQL or Worker change is required beyond the existing v0.9.9/v3f cloud production setup.


### v0.9.9.4 — The Bench / Assembly Cloud

The Bench is now connected to the shared Cloudflare D1 operational state.

Assembly now:
- reads Printed Parts and Assembled Inventory from D1
- deducts every required grouped Printed Part for the selected quantity
- adds the completed quantity to Assembled Inventory
- records an Assembly History transaction
- waits for the D1 save before treating the assembly as complete
- rolls Printed Parts, Assembled Inventory and Assembly History back if the cloud save fails
- live-syncs Bench quantities between open devices every 2 seconds
- live-updates Ready, Awaiting and Assembled Inventory without a manual refresh
- shows the same Cloud Sync status used by Build Plates and Printed Parts

No SQL or Worker update is required beyond the existing v0.9.9 / Worker v3f production-cloud setup.


### v0.9.9.5 — Bench Demand + Mobile Consistency

The Bench has been tightened for production use.

- D1 fully replaces all migrated operational fields on hydration.
- Missing cloud fields fall back to clean defaults, never stale browser values.
- Bench Ready now shows only Pals that are actually still needed by Production Planning.
- Ready quantity is capped to the remaining production requirement.
- Awaiting Parts only represents demanded Pals that cannot currently be assembled.
- Bench live sync replaces its state reference with the newest D1 snapshot.
- Added iPhone safe-area handling and improved Kitsu/header spacing on mobile.
- SQL/schema files are removed from the GitHub deployment ZIP.

No Worker or SQL changes are required for this release.


## v0.10.0 — Cloud-Only Production Core

Architectural change: migrated Forge workflows no longer use browser localStorage as a data source.

Cloud-only now applies to:
- Production Planner
- Build Plates
- Printed Parts
- The Bench / Assembled Inventory
- Products and Recipes used by those workflows
- Production targets used by those workflows

Rules:
- D1 is the sole source of truth for migrated operational data.
- Cloud data is held only in memory while the page is open.
- No D1 operational payload is written to localStorage.
- No local cache fallback is used if D1 is unavailable.
- If Cloudflare cannot be reached, Forge shows a Cloud Connection Required error instead of stale numbers.
- The Cloud Sync badge only means a successful live D1 read/write.
- The browser still stores the authentication/session token; this is not inventory or production data.
- Unsaved form/plate draft state remains temporary in memory only.

Important: pages not yet migrated to D1 still retain their legacy local behaviour until they are moved in subsequent stages. Every new migration from this version onward will be cloud-only.

Deployment ZIP is frontend-only. No SQL or Worker files are included.


### v0.10.1 — Ready to Assemble Logic

The Bench "Ready" section now means physically ready to assemble.

A Pal appears in Ready whenever all required printed colour-groups are available, regardless of current Production Planner demand.

- Ready KPI = total complete Pal sets that can currently be assembled.
- Ready badge = actual number of complete buildable sets.
- Production Need / Already Assembled / Still Needed remain visible as context only.
- Awaiting continues to show Pals that are required by Production Planning but cannot yet be assembled.
- Cloudflare D1 remains the sole source of truth for migrated production data.


### v0.10.2 — Mobile Build Plates + Pals Inventory

Build Plates mobile:
- each checklist item is now a dedicated mobile card
- Pal and SKU are clearly identified
- Colour Group, Weight, Demand, Printed, On Plates and Remaining all have labels
- quantity is full width
- Required print uses a prominent `Add Required` button
- Extra print uses `+ Extra Set`
- Exact Part is a separate optional action and opens a clear full-width panel
- Current Plate and Saved Build Plates remain single-column on phones

Pals mobile:
- each Pal is a labelled inventory card
- Boat Stock and Boat Target are explicitly shown
- Cornwall Stock and Cornwall Target are explicitly shown
- Need is explicitly shown
- On Sale and Recipe status remain visible
- targets save directly to D1
- Pals stock/targets are hydrated from live D1 state and live-sync while open

The deployment ZIP remains frontend-only with no SQL or Worker files.


### v0.10.3 — Dedicated Mobile Grouped Build Plate Checklist

The Build Plate page no longer attempts to reshape the desktop table into mobile cards.

On mobile, every recipe colour group now has a dedicated card showing:
- Pal + SKU
- grouped recipe/colour-group description
- filament and weight per grouped set
- Demand
- Printed
- On Plates
- Remaining
- grouped-set quantity
- Add Grouped Set(s)
- + Extra Grouped Set
- Choose Exact Part (secondary/optional)

Exact Part is collapsed by default and explicitly described as the individual-STL option. Grouped printing is now the primary mobile action, matching the desktop workflow.

Desktop Build Plates retain the existing table layout.


### v0.10.4 — Build Plate Page Order + Compact Mobile Colour Queue

- Current Plate now sits directly below `Colours You Need to Print` on both desktop and mobile.
- Colour-sorted Print Checklist follows Current Plate.
- Saved Build Plates remains below the checklist.
- Desktop planner content is now a single full-width column after moving Current Plate.
- On mobile, the colour-demand queue uses a compact four-column grid.
- Mobile colour buttons are substantially smaller while still showing colour name, required grams and a short queue summary.
- The Kitsu Print Queue badge is hidden on mobile to reclaim space.
- No Worker or D1 changes are required.


### v0.10.5 — Mobile KPI Row

Top KPI/stat cards now preserve the desktop row layout on mobile instead of stacking vertically.

- Four-card KPI sections render four across.
- Three-card KPI sections render three across.
- Labels, values and supporting text are scaled down for phone widths.
- Applies site-wide anywhere the shared `kpis` layout is used.
- No Worker or D1 changes are required.


### v0.10.6 — Build Plate KPI Navigation

The four Build Plate KPI cards are now page-navigation buttons.

- Open Print Demand → Colours You Need to Print.
- Draft Plates → Saved Build Plates.
- Printing → Saved Build Plates.
- Completed Plates → Saved Build Plates.
- Smooth scrolling and a brief destination highlight make long mobile pages easier to navigate.
- No Worker or D1 changes are required.


### v0.10.7 — Packing Station Cloud

Packing Station is now part of the cloud-only production pipeline.

- Packing Station hydrates assembled stock, inserts, consumables, packing jobs, packing history and awaiting-dispatch stock from D1.
- No operational Packing Station data is read from browser localStorage.
- Batch quantity and step progress are saved to D1.
- Completing a packed batch waits for Cloudflare confirmation before Forge treats it as complete.
- A completed batch deducts assembled Pals, ready inserts, clear boxes, bottom cards and stickers.
- Packed stock is added to Awaiting Dispatch and Packing History in the same cloud transaction payload.
- Critical completion actions roll back in memory if Cloudflare rejects the save.
- Packing Station live-syncs while open so another device sees packing progress and completed batches without refreshing.
- No additional Worker or SQL migration is required because these fields already exist in the shared operational D1 state.


### v0.10.8 — Insert Production Cloud

Insert Production is now cloud-only and live-synced.

- Ready Insert stock and Awaiting Cut & Score stock are read from D1.
- Insert print demand is calculated from the live D1 state.
- Mark Printed deducts 210gsm card and moves inserts into Cut & Score only after Cloudflare accepts the save.
- Cut & Score Complete moves normal inserts into Ready Insert stock.
- Damage-replacement insert demand is satisfied from completed Cut & Score work.
- Cornwall spare-insert replenishment is routed into Awaiting Dispatch from the same cloud state.
- Failed D1 writes roll the in-memory transaction back.
- Insert Production live-syncs across open devices without manual refresh.
- Packing Station therefore sees newly ready inserts automatically.
- No additional Worker or SQL migration is required.


### v0.10.9 — On Sale Cloud Sync

Product availability is now fully cloud-backed.

- `On Sale` is read directly from the D1 `products` table during cloud hydration.
- Pals Inventory now has a clickable `ON SALE / NOT ON SALE` control.
- Toggling availability calls the existing Worker endpoint:
  `PUT /products/:sku/availability`
- Only Admin users can change availability, matching the Worker permission rule.
- On Sale changes are included in Forge's live-sync signature, so open production pages detect changes automatically.
- Product availability is never taken from browser localStorage.
- Insert Production and Packing Station therefore immediately use the same D1 On Sale status.
- No Worker or D1 migration is required because Worker v3f already supports the availability endpoint and the products table already stores `on_sale`.


### v0.10.9.2 — Authoritative On Sale Fix

Root cause fixed: Product Availability was still using browser `state()` and changing its UI before D1 confirmed the write.

Now:
- Product Availability reads exclusively from the D1-hydrated operational state.
- `Put On Sale` / `Take Off Sale` writes to Cloudflare first.
- Forge then re-fetches `/products` from D1 before showing the new status.
- Release-date changes follow the same write-then-reload behaviour.
- If the D1 write fails, Forge explicitly says the availability was NOT changed.
- Pals and Product Availability therefore render from the same D1 source of truth.
- Availability changes live-sync across open Forge devices.
- No local availability fallback or optimistic local save remains on these pages.


### v0.10.9.3 — Direct On Sale Confirmation

Availability writes no longer wait for a full production-state re-hydration.

Flow:
1. PUT product availability to D1.
2. GET `/products`.
3. Confirm the requested SKU and `on_sale` value returned by D1.
4. Update the page.

Both write and verification requests now have timeouts, so the UI cannot remain on `Saving to Cloud…` indefinitely. If D1 fails to confirm the value, Forge shows the actual failure instead of pretending the update worked.


## v0.11.0 — Availability Rebuild

The old mixed availability logic has been removed from the cloud flow.

Worker v3g adds GET /availability and hardens PUT /products/:sku/availability.
Every cloud-enabled Forge page now receives On Sale from the same GET /availability response.
Pals no longer depends on availability being embedded in production state.


## v0.11.1 — Consumables Cloud

Consumables are now D1-backed.

- Consumable stock and reorder levels are read from D1.
- Restocks and +/- adjustments write directly to D1.
- Every stock movement creates a consumable-history record.
- Insert Production and Packing Station now receive consumable stock through cloud hydration.
- No browser-local consumable inventory is used by migrated production pages.
- Consumables live-sync between devices.


## v0.11.2 — Consumables Live Sync

Consumables are now part of Forge's global cloud-change signature.

- Changes to stock, reorder levels or recent consumable history trigger live re-hydration.
- Consumables pages update automatically without refresh.
- Insert Production and Packing Station also receive updated consumable stock automatically while open.
- No Worker or D1 changes are required for this update.


## v0.12.0 — Dispatch Cloud

Dispatch is now part of the cloud-only operational pipeline.

- Awaiting Dispatch reads directly from D1 operational state.
- Boat / Cornwall split allocations save to D1.
- Boat stock is updated centrally when dispatched.
- Cornwall transfers remain Awaiting Delivery until physically received.
- Cornwall delivery QC, good/damaged quantities and fault selections save to D1.
- Damage findings create shared Rework jobs in the same cloud state.
- Cornwall spare inserts and factory rework returns use the same cloud Dispatch queue.
- Dispatch live-syncs while open on multiple devices.
- No browser-local operational Dispatch state is used by the page.
- No Worker or SQL change is required for this migration.


## v0.12.1 — Retail Staff Dispatch Permissions

Dispatch no longer requires the Admin-only `/production/state` or `/production/sync-status` endpoints.

Worker v3k adds a restricted Dispatch API:
- GET `/dispatch/state`
- PUT `/dispatch/state`
- GET `/dispatch/sync-status`

Retail Staff receives `dispatch:write` in addition to existing Dispatch/Cornwall/Rework permissions.

The Worker only exposes and accepts the operational fields required for:
- Awaiting Dispatch
- Boat/Cornwall allocation
- Cornwall delivery receipt/QC
- damaged item classification
- Rework job creation
- Cornwall spare/rework stock

Retail Staff cannot use the dedicated Dispatch endpoint to alter build plates, printed parts, assembly, consumables, production planning, employees, settings, or product availability.


## v0.12.2 — Rework Cloud

Rework is now cloud-only with a dedicated restricted API.

Worker v3l:
- GET `/rework/state`
- GET `/rework/sync-status`
- POST `/rework/:id/complete-cornwall`
- POST `/rework/:id/send-factory`
- POST `/rework/cornwall-boxes/adjust`
- POST `/rework/cornwall-inserts/:sku/adjust`

Permissions:
- Retail Staff can view Rework, manage Cornwall spare boxes/inserts, and complete Cornwall-local repairs.
- Factory replacement actions are Admin-only.
- Completing a Cornwall repair consumes Cornwall spare stock and restores the repaired Pal to Cornwall inventory.
- Admin factory replacement consumes the required factory components and creates a locked Cornwall return in Dispatch.
- Rework updates live across devices without localStorage operational state.


## v0.12.3 — Retail Staff Rework Navigation

Fixed role-page routing for Retail Staff.

- Retail Staff can now open both `deliveries.html` and `rework.html`.
- Rework appears in the desktop and mobile role-filtered navigation.
- Retail Staff still cannot access factory/admin pages.
- Existing Rework restrictions remain in place: Cornwall-local repair actions are available, factory replacement actions remain Admin-only.
- No Worker or D1 change is required.


## v0.12.4 — Authentication Fail-Closed

Authentication boot order has been rebuilt across all protected pages.

- Protected HTML is hidden at CSS level before JavaScript starts.
- `/auth/me` must confirm a valid session and role before the page becomes visible.
- Page-specific initializers do not run until authentication succeeds.
- A locally cached user record never grants access; it is display-only.
- Missing/expired/invalid sessions redirect to Login.
- If authentication JavaScript fails on an old browser, protected content remains hidden rather than exposing the application shell.
- A static "Connecting to Forge / Checking secure session" gate is shown during authentication.
- Retail Staff page access remains Dispatch + Rework.
- Login and First Admin Bootstrap remain outside the protected-page gate.
- No Worker or D1 change is required.


## v0.13.0 — Filament Cloud

Filament is now cloud-authoritative.

- Existing D1 `filaments` stock table is retained.
- `filament_meta` adds material, display colour and spool size without destructively changing the existing table.
- `filament_history` records restocks, adjustments and print usage.
- Stock changes live-sync while the Filament page is open.
- Completed Build Plates call a de-duplicated Worker endpoint so filament is deducted once per plate.
- Reorder levels and spool sizes are cloud-backed.
- Operational browser-local filament fallback has been removed from the Filament page.
- Structure is ready for future RFID spool intake.


### Build Plate filament deduction

When `Complete Print` is confirmed, Forge first saves the completed production state to D1. It then sends the plate ID, filament colour and calculated gram usage to the Worker. The Worker records `plate:<plate-id>` in filament history, preventing the same plate from being deducted twice.


## v0.14.0 — Recipes Cloud

Recipes are now editable directly against D1.

- Existing `recipes` remains the authoritative recipe table.
- Admin users can replace all colour-group rows for a Pal in one cloud transaction.
- Recipe edits include filament, parts/group, grouped STL, individual STLs, part count and weight.
- Recipe changes live-refresh across open devices when no editor is active.
- Every save records an audit snapshot in `recipe_history`.
- Build Plates continue to load recipe rows from the cloud, so new plate calculations use the latest saved weights and filament colours.
- No operational recipe edits are stored in browser localStorage.


## v0.14.1 — Recipes Display Fix

Fixes the Recipes page incorrectly showing “No matching Pals” when the cloud product records do not use `type: "pal"`.

- Products are now recognised as Pals if they have recipe rows, or use `type`, `product_type`, or `category` values indicating Pal.
- Existing recipe rows can render even when a corresponding product record is missing or shaped differently.
- No D1 recipe data is changed or re-imported.
- Recipe editing and cloud saving remain unchanged.


## v0.14.2 — Recipe Product Name Fix

Recipe cards now resolve the Pal name from multiple cloud product fields (`name`, `product_name`, `title`, `display_name`, `product_title`, `animal`) before falling back to the SKU.

This fixes recipe cards showing `PLA001`, `PLA002`, etc. as the product name when the cloud product response uses a different name field.


## v0.14.3 — Recipe Catalogue Name Resolution

The Recipes page now resolves human-readable Pal names by SKU against the deployed `data/products.json` reference catalogue before using cloud product fields.

Example: `PLA001` is displayed as `Alex the Axolotl`.

Cloud recipes and cloud product records remain authoritative for operational data; the static catalogue is used only to resolve the product display name and is fetched with `cache: no-store`.


## v0.15.0 — General Settings + Printers Cloud

- Printer register is D1-backed.
- Add, enable/disable and delete printer actions save directly to Cloudflare.
- Default printer is stored in `forge_settings`.
- Default location is stored in `forge_settings`.
- Barcode/label printer selection is stored in `forge_settings`.
- Settings and printer pages live-refresh across open devices.
- These settings no longer use local browser state for operational configuration.


## v0.16.0 — Complete Settings Cloud Integration

The full Settings section is now cloud-authoritative.

### General / Printers
- D1-backed printer register, default printer and default location.
- Build Plates now hydrate the shared printer register and defaults directly from `/settings`.

### Labels & Printing
- Pal barcode label printer and size are stored in `forge_settings`.
- Filament/RFID spool label printer and size are stored in `forge_settings`.
- Live updates across open devices.

### Employees
- User creation, roles, activation and password resets remain Cloudflare-backed.
- Employees page now live-refreshes and uses an inline creation form.

### System & Data
- Reset is now a Worker/D1 operation, not a localStorage reset.
- Requires Admin role plus the exact confirmation phrase `RESET FORGE`.
- Preserves products, recipes, users, printers, settings and master definitions.
- Resets production workflow, plates/history, targets, finished/assembled/insert stock,
  filament stock/history and consumable stock/history for every device.

No new D1 tables are required for v0.16.0.

## v0.16.1 — 3D Printers + Box / Document Printer

- Settings `Printers` renamed to `3D Printers`.
- Added cloud-backed `Box / Document Printer` under Labels & Printing.
- Stores printer, paper size and orientation using the existing settings API.
- Defaults: A4, Portrait.
- No Worker or D1 migration required.

## v0.16.2 — Mobile Dropdown Menu

- Replaced the long horizontal mobile navigation button strip with a single `Menu` dropdown.
- The closed menu shows the current page.
- Opening it reveals the existing grouped navigation vertically.
- The current page is highlighted.
- Selecting a page automatically closes the dropdown.
- Desktop sidebar navigation is unchanged.
- No Worker or D1 changes required.

## v0.17.0 — Operations Dashboard

- Dashboard is now cloud-hydrated and operations-focused.
- Added workflow KPIs for print demand, active plates, bench, packing, dispatch and rework.
- Added `Pals to Print`, showing product name/SKU, demand, active plate coverage and remaining quantity.
- Each Pal row shows the outstanding recipe colours/sets, so product demand is visible before colour grouping.
- Added colour-group demand alongside Pal demand for efficient build-plate planning.
- Added stock/material/data-health alerts and quick operational actions.
- Responsive mobile dashboard included.
- No Worker or D1 changes required.


## v0.18.0 — Full Operations Dashboard

Forge Control is now a complete live operations dashboard.

### Summary
- Total active Pals
- Active Build Plates
- Ready to Assemble
- Awaiting Packing
- Awaiting Dispatch
- Rework

### Production Today
- Pals to Print by product/SKU
- Demand, active-plate coverage and remaining quantity
- Outstanding recipe colour groups per Pal
- Most urgent colours by sets and estimated grams
- Active 3D printers and the plates currently running on each printer

### Stock Health
- Low filament using cloud filament reorder levels
- Low consumables using cloud reorder levels
- Low finished Pal stock against Boat + Cornwall targets

### Workflow Status
- Printed Parts → Bench → Packing → Dispatch pipeline with live quantities

### Alerts & Actions
- Low filament
- Low consumables
- Failed prints
- Products off sale
- Missing recipes
- SKU/data-health issues
- Rework waiting

### Quick Actions
- New Build Plate
- Add Filament
- Add Consumable Stock
- New Pal
- Dispatch

### Recent Activity
- Print completions
- Assembly completions
- Packing completions
- Dispatch/transfers
- Rework completions

No Worker or D1 schema change is required.
