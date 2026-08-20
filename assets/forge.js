const STORE = 'plaForgeV02';
const RESET_RELEASE = '0.9.8';
function safeJsonValue(value, fallback) {
    if (fallback === void 0) {
        fallback = {};
    }
    if (value === undefined || value === null || value === '')
        return fallback;
    if (typeof value !== 'string')
        return value;
    try {
        return JSON.parse(value);
    }
    catch (e) {
        return fallback;
    }
}
function forgeClone(value, fallback) {
    if (value === undefined)
        value = fallback;
    if (value === undefined || value === null) {
        if (Array.isArray(fallback))
            return [];
        if (fallback && typeof fallback === 'object')
            return {};
        return fallback === undefined ? null : fallback;
    }
    try {
        return JSON.parse(JSON.stringify(value));
    }
    catch (e) {
        if (Array.isArray(fallback))
            return [];
        if (fallback && typeof fallback === 'object')
            return {};
        return fallback === undefined ? null : fallback;
    }
}
function blankOperationalState() {
    return {
        stock: {},
        targets: {},
        parts: {},
        plates: [],
        printHistory: [],
        failedParts: [],
        assembled: {},
        assemblyHistory: [],
        boxes: {},
        boxHistory: [],
        packagingComponents: { clear_boxes: 0, inserts: 0, stickers: 0 },
        inserts: {},
        insertHistory: [],
        consumables: {
            clear_boxes: { name: 'Flat Clear Boxes', stock: 0, reorder: 25, unit: 'boxes' },
            bottom_cards: { name: 'Bottom Card Squares', stock: 0, reorder: 25, unit: 'cards' },
            stickers: { name: 'Stickers', stock: 0, reorder: 25, unit: 'stickers' },
            card_210gsm: { name: '210gsm Card', stock: 0, reorder: 25, unit: 'sheets' }
        },
        consumableHistory: [],
        packingJobs: {},
        packingHistory: [],
        finishedStock: { boat: {}, cornwall: {} },
        awaitingDispatch: [],
        transfers: [],
        damageHistory: [],
        damageReworkJobs: [],
        reworkHistory: [],
        cornwallReworkStock: { clear_boxes: 0, inserts: {} },
        cornwallInsertReplenishment: {},
        damageInsertDemand: {},
        production: {},
        productionPlan: {},
        printers: [],
        printerRoles: {},
        siteSettings: { defaultPrinter: '', defaultLocation: 'boat' },
        productAvailability: {},
        customData: { products: [], recipes: [], insert_files: {} },
        shopifyProducts: {},
        resetRelease: RESET_RELEASE
    };
}
function ensureCleanResetRelease() {
    try {
        const raw = localStorage.getItem(STORE);
        if (!raw) {
            localStorage.setItem(STORE, JSON.stringify(blankOperationalState()));
            localStorage.setItem('plaForgeLastReset', new Date().toISOString());
        }
        else {
            const current = JSON.parse(raw);
            if (current && current.resetRelease !== RESET_RELEASE) {
                current.resetRelease = RESET_RELEASE;
                localStorage.setItem(STORE, JSON.stringify(current));
            }
        }
    }
    catch (e) {
        // Do not automatically wipe an existing browser store because of a version change.
        console.error('Forge local state could not be read safely:', e);
    }
}
ensureCleanResetRelease();
const CLOUD_PRODUCTION_FIELDS = [
    'stock', 'parts', 'printHistory', 'failedParts', 'assembled', 'assemblyHistory', 'boxes', 'boxHistory',
    'packagingComponents', 'inserts', 'insertHistory', 'consumables', 'consumableHistory', 'packingJobs',
    'packingHistory', 'finishedStock', 'awaitingDispatch', 'transfers', 'damageHistory', 'damageReworkJobs',
    'reworkHistory', 'cornwallReworkStock', 'cornwallInsertReplenishment', 'damageInsertDemand', 'production',
    'productionPlan', 'plateSeq'
];
let forgeCloudOperationalState = null;
function emptyCloudWorkingState() {
    const s = blankOperationalState();
    s.targets = {};
    s.stock = {};
    s.productAvailability = {};
    return s;
}
function cloudOperationalState() {
    if (!forgeCloudOperationalState)
        throw new Error('Cloud operational state has not loaded yet.');
    return forgeCloudOperationalState;
}
let forgeProductionCloudReady = false;
let forgeProductionCloudSaving = false;
function productionCloudPayload(s) {
    const out = {};
    CLOUD_PRODUCTION_FIELDS.forEach(k => out[k] = s[k]);
    return out;
}
let forgeCloudSyncState = 'idle';
let forgeCloudSyncMessage = 'Waiting for sync';
function setForgeCloudSync(state, message) {
    forgeCloudSyncState = state;
    forgeCloudSyncMessage = message || state;
    const el = document.querySelector('#forgeCloudSyncBadge');
    if (!el)
        return;
    const cls = state === 'synced' ? 'ok' : state === 'error' ? 'danger' : state === 'syncing' ? 'warning' : 'info';
    el.className = 'badge ' + cls;
    el.textContent = state === 'synced' ? 'Cloud Synced' : state === 'error' ? 'Sync Error' : state === 'syncing' ? 'Syncing…' : 'Cloud Ready';
    el.title = forgeCloudSyncMessage;
}
let forgeLiveSyncTimer = null;
let forgeLastCloudStamp = null;
let forgeLiveSyncBusy = false;
let forgeLiveSyncLastFullRefresh = 0;
let forgeLiveSyncFailures = 0;
let forgeLiveSyncOnChange = null;
let forgeLiveSyncWakeBound = false;
async function forgeCloudStamp() {
    var _a, _b, _c;
    try {
        const [d, availability, consumableData] = await Promise.all([
            cloudFetch('/production/sync-status'),
            cloudAvailability(),
            cloudConsumables()
        ]);
        const availabilityStamp = (availability || [])
            .map(x => `${x.sku}:${x.on_sale ? '1' : '0'}:${x.release_date || ''}:${x.updated_at || ''}`)
            .sort()
            .join('|');
        const consumableStamp = ((consumableData === null || consumableData === void 0 ? void 0 : consumableData.consumables) || [])
            .map(x => `${x.key}:${Number(x.stock || 0)}:${Number(x.reorder || 0)}:${x.updated_at || ''}`)
            .sort()
            .join('|');
        const historyStamp = ((consumableData === null || consumableData === void 0 ? void 0 : consumableData.history) || [])
            .slice(0, 5)
            .map(x => `${x.id}:${x.change}:${x.created_at || ''}`)
            .join('|');
        return JSON.stringify({
            production: ((_a = d === null || d === void 0 ? void 0 : d.production) === null || _a === void 0 ? void 0 : _a.updated_at) || null,
            build_count: Number(((_b = d === null || d === void 0 ? void 0 : d.build_plates) === null || _b === void 0 ? void 0 : _b.count) || 0),
            build_updated: ((_c = d === null || d === void 0 ? void 0 : d.build_plates) === null || _c === void 0 ? void 0 : _c.updated_at) || null,
            availability: availabilityStamp,
            consumables: consumableStamp,
            consumable_history: historyStamp
        });
    }
    catch (e) {
        return null;
    }
}
async function startForgeLiveSync(onChange) {
    if (forgeLiveSyncTimer)
        clearInterval(forgeLiveSyncTimer);
    forgeLiveSyncOnChange = onChange;
    forgeLiveSyncFailures = 0;
    forgeLiveSyncLastFullRefresh = Date.now();
    try {
        forgeLastCloudStamp = await forgeCloudStamp();
    }
    catch (_) {
        forgeLastCloudStamp = null;
    }
    async function performLiveSync(forceFull = false, reason = '') {
        if (document.hidden || forgeLiveSyncBusy || forgeProductionCloudSaving)
            return;
        forgeLiveSyncBusy = true;
        try {
            const stamp = await forgeCloudStamp();
            const stampChanged = !!(stamp &&
                forgeLastCloudStamp &&
                stamp !== forgeLastCloudStamp);
            // Full refresh is deliberately periodic even when the lightweight
            // production stamp has not changed. Shopify inventory, location
            // targets and shared settings can change independently of it.
            const fullRefreshDue = forceFull ||
                !forgeLiveSyncLastFullRefresh ||
                (Date.now() - forgeLiveSyncLastFullRefresh >= 20000);
            if (stampChanged || fullRefreshDue) {
                setForgeCloudSync('syncing', reason ||
                    (stampChanged
                        ? 'Cloud data changed · refreshing'
                        : 'Checking live Shopify + Forge data'));
                const fresh = await hydrateProductionCloud(true);
                forgeLiveSyncLastFullRefresh = Date.now();
                if (stamp)
                    forgeLastCloudStamp = stamp;
                else {
                    const refreshedStamp = await forgeCloudStamp();
                    if (refreshedStamp)
                        forgeLastCloudStamp = refreshedStamp;
                }
                if (fresh && typeof forgeLiveSyncOnChange === 'function')
                    await forgeLiveSyncOnChange(cloudOperationalState());
                forgeLiveSyncFailures = 0;
                setForgeCloudSync('synced', 'Live cloud data is current');
            }
            else if (stamp && !forgeLastCloudStamp) {
                forgeLastCloudStamp = stamp;
                forgeLiveSyncFailures = 0;
                setForgeCloudSync('synced', 'Cloud connection restored');
            }
        }
        catch (e) {
            forgeLiveSyncFailures += 1;
            // Do not kill live sync on a temporary Wi-Fi / Cloudflare error.
            // The interval continues and retries automatically.
            setForgeCloudSync(forgeLiveSyncFailures >= 2 ? 'error' : 'syncing', `Live sync retry ${forgeLiveSyncFailures} · ${e.message || e}`);
            console.warn('PLA Forge live sync retry', forgeLiveSyncFailures, e);
        }
        finally {
            forgeLiveSyncBusy = false;
        }
    }
    // Lightweight heartbeat. A full refresh is forced every 20 seconds.
    forgeLiveSyncTimer = setInterval(() => performLiveSync(false), 3000);
    // Browsers throttle timers when a tab sleeps/backgrounds. Refresh
    // immediately when the user returns instead of waiting for the next cycle.
    if (!forgeLiveSyncWakeBound) {
        forgeLiveSyncWakeBound = true;
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && typeof forgeLiveSyncOnChange === 'function')
                setTimeout(() => performLiveSync(true, 'Page active · refreshing cloud data'), 100);
        });
        window.addEventListener('focus', () => {
            if (!document.hidden && typeof forgeLiveSyncOnChange === 'function')
                setTimeout(() => performLiveSync(true, 'Window active · refreshing cloud data'), 100);
        });
        window.addEventListener('online', () => {
            if (typeof forgeLiveSyncOnChange === 'function')
                setTimeout(() => performLiveSync(true, 'Network restored · refreshing cloud data'), 100);
        });
    }
}
window.addEventListener('beforeunload', () => {
    if (forgeLiveSyncTimer)
        clearInterval(forgeLiveSyncTimer);
});
function installForgeCloudSyncBadge() {
    if (!['production.html', 'plates.html', 'parts.html', 'assembly.html', 'pals.html', 'packing-station.html', 'packaging.html', 'availability.html', 'settings.html', 'consumables.html'].includes(forgeCurrentPage()))
        return;
    if (document.querySelector('#forgeCloudSyncBadge'))
        return;
    const host = document.querySelector('.topbar') || document.querySelector('main') || document.body;
    const wrap = document.createElement('div');
    wrap.className = 'forge-cloud-sync';
    wrap.innerHTML = '<span id="forgeCloudSyncBadge" class="badge info">Cloud Ready</span><button id="forgeCloudRefresh" class="btn ghost" type="button">Refresh Cloud</button>';
    host.appendChild(wrap);
    document.querySelector('#forgeCloudRefresh').onclick = async () => {
        setForgeCloudSync('syncing', 'Refreshing all live cloud data');
        try {
            const fresh = await hydrateProductionCloud(true);
            forgeLiveSyncLastFullRefresh = Date.now();
            forgeLastCloudStamp = await forgeCloudStamp();
            if (fresh && typeof forgeLiveSyncOnChange === 'function')
                await forgeLiveSyncOnChange(cloudOperationalState());
            setForgeCloudSync('synced', 'Manual cloud refresh complete');
        }
        catch (e) {
            setForgeCloudSync('error', e.message || 'Manual refresh failed');
            alert('Cloud refresh failed: ' + (e.message || e));
        }
    };
}
function showCloudRequiredError(message) {
    const main = document.querySelector('main') || document.body;
    const box = document.createElement('div');
    box.className = 'card cloud-required-error';
    box.innerHTML = `<h2>Cloud connection required</h2><p>${esc(message || 'Forge could not load live data from Cloudflare D1.')}</p><button class="btn" onclick="location.reload()">Try Again</button>`;
    main.prepend(box);
}
async function hydrateProductionCloud(force = false) {
    if (!cloudToken())
        throw new Error('Cloud login required.');
    setForgeCloudSync('syncing', 'Loading live state from Cloudflare D1');
    try {
        const [st, bp, targetData, availabilityData, consumableData, settingsData] = await Promise.all([
            cloudFetch('/production/state'),
            cloudFetch('/build-plates'),
            cloudFetch('/targets'),
            cloudAvailability(),
            cloudConsumables(),
            cloudFetch('/settings')
        ]);
        const s = emptyCloudWorkingState();
        const cloudState = (st === null || st === void 0 ? void 0 : st.state) || {};
        const blank = blankOperationalState();
        CLOUD_PRODUCTION_FIELDS.forEach(k => {
            const fallback = blank[k] !== undefined
                ? blank[k]
                : (['printHistory', 'failedParts', 'assemblyHistory', 'boxHistory', 'insertHistory', 'consumableHistory', 'packingHistory', 'awaitingDispatch', 'transfers', 'damageHistory', 'damageReworkJobs', 'reworkHistory', 'plates'].includes(k) ? [] : {});
            s[k] = forgeClone(cloudState[k], fallback);
        });
        s.targets = {};
        ((targetData === null || targetData === void 0 ? void 0 : targetData.targets) || []).forEach(t => {
            const loc = t.location_id === 'factory' ? 'boat' : t.location_id;
            s.targets[targetKey(t.sku, loc)] = Number(t.target_qty || 0);
        });
        // One authoritative availability source for every page.
        applyCloudAvailability(s, availabilityData);
        // Consumables are also authoritative from D1.
        applyCloudConsumables(s, consumableData);
        // Shared settings are authoritative from D1 too.
        s.printers = (settingsData.printers || []).map(p => Object.assign({}, p));
        s.siteSettings = Object.assign({}, s.siteSettings || {}, {
            defaultPrinter: String((settingsData.settings || {}).default_printer || ''),
            defaultLocation: String((settingsData.settings || {}).default_location || 'boat')
        });
        s.printerRoles = Object.assign({}, s.printerRoles || {}, {
            barcode: String((settingsData.settings || {}).barcode_printer || ''),
            filament_label: String((settingsData.settings || {}).filament_label_printer || ''),
            box_document: String((settingsData.settings || {}).box_document_printer || '')
        });
        s.siteSettings = Object.assign({}, s.siteSettings || {}, {
            boxDocumentPaperSize: String((settingsData.settings || {}).box_document_paper_size || 'A4'),
            boxDocumentOrientation: String((settingsData.settings || {}).box_document_orientation || 'portrait')
        });
        s.plates = ((bp === null || bp === void 0 ? void 0 : bp.plates) || []).map(p => ({
            id: p.id, code: p.code, name: p.name || '', colour: p.colour || '', printer: p.printer || '',
            status: p.status || 'draft', items: p.items || [], created_at: p.created_at,
            started_at: p.started_at || null, completed_at: p.completed_at || null
        }));
        forgeCloudOperationalState = s;
        forgeProductionCloudReady = true;
        setForgeCloudSync('synced', `Live D1 · ${s.plates.length} active build plate(s)`);
        return s;
    }
    catch (e) {
        forgeCloudOperationalState = null;
        forgeProductionCloudReady = false;
        setForgeCloudSync('error', e.message || 'Cloud data unavailable');
        console.error('Cloud production hydrate failed', e);
        throw e;
    }
}
let forgeProductionSaveQueue = Promise.resolve();
function saveProductionCloud(s) {
    if (!cloudToken())
        return Promise.resolve(false);
    const snapshot = JSON.parse(JSON.stringify(s));
    forgeProductionSaveQueue = forgeProductionSaveQueue.then(async () => {
        setForgeCloudSync('syncing', 'Saving production changes to D1');
        try {
            await cloudFetch('/production/state', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ state: productionCloudPayload(snapshot) })
            });
            const cloud = await cloudFetch('/build-plates');
            const localIds = new Set((snapshot.plates || []).map(p => p.id));
            for (const p of (cloud.plates || [])) {
                if (!localIds.has(p.id)) {
                    await cloudFetch('/build-plates/' + encodeURIComponent(p.id), { method: 'DELETE' });
                }
            }
            for (const p of (snapshot.plates || [])) {
                await cloudFetch('/build-plates/' + encodeURIComponent(p.id), {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ plate: p })
                });
            }
            forgeLastCloudStamp = await forgeCloudStamp() || forgeLastCloudStamp;
            setForgeCloudSync('synced', `Saved to D1 · ${(snapshot.plates || []).length} active build plate(s)`);
            return true;
        }
        catch (e) {
            setForgeCloudSync('error', e.message || 'Cloud save failed');
            console.error('Cloud production save failed', e);
            throw e;
        }
    });
    return forgeProductionSaveQueue;
}
function state() {
    let s = {};
    try {
        s = JSON.parse(localStorage.getItem(STORE) || '{}');
    }
    catch (e) { }
    if (!Object.keys(s).length) {
        try {
            s = JSON.parse(localStorage.getItem('plaForgeV01') || '{}');
        }
        catch (e) { }
    }
    s.targets = s.targets || {};
    s.filament = s.filament || {};
    s.stock = s.stock || {};
    s.parts = s.parts || {};
    s.plates = s.plates || [];
    s.printHistory = s.printHistory || [];
    s.failedParts = s.failedParts || [];
    s.plateSeq = Number(s.plateSeq || 1);
    s.printers = s.printers || [];
    s.siteSettings = s.siteSettings || { defaultPrinter: '', defaultLocation: 'boat' };
    s.assembled = s.assembled || {};
    s.assemblyHistory = s.assemblyHistory || [];
    s.boxes = s.boxes || {};
    s.boxHistory = s.boxHistory || [];
    s.packagingComponents = s.packagingComponents || { clear_boxes: 0, inserts: 0, stickers: 0, barcode_labels: 0 };
    s.inserts = s.inserts || {};
    s.insertHistory = s.insertHistory || [];
    s.consumables = s.consumables || {
        clear_boxes: { name: 'Flat Clear Boxes', stock: 0, reorder: 25, unit: 'boxes' },
        bottom_cards: { name: 'Bottom Card Squares', stock: 0, reorder: 25, unit: 'cards' },
        stickers: { name: 'Stickers', stock: 0, reorder: 25, unit: 'stickers' }
    };
    s.consumables = s.consumables || {};
    s.consumables.card_210gsm = s.consumables.card_210gsm || { name: '210gsm Card', stock: 0, reorder: 25, unit: 'sheets' };
    s.consumableHistory = s.consumableHistory || [];
    s.packingJobs = s.packingJobs || {};
    s.packingHistory = s.packingHistory || [];
    s.finishedStock = s.finishedStock || { boat: {}, cornwall: {} };
    s.transfers = s.transfers || [];
    s.awaitingDispatch = s.awaitingDispatch || [];
    s.awaitingDispatch = s.awaitingDispatch || [];
    if (s.consumables && s.consumables.barcode_labels)
        delete s.consumables.barcode_labels;
    s.printerRoles = s.printerRoles || {};
    s.damageHistory = s.damageHistory || [];
    s.damageReworkJobs = s.damageReworkJobs || [];
    s.damageInsertDemand = s.damageInsertDemand || {};
    s.customData = s.customData || { products: [], recipes: [], insert_files: {} };
    s.customData.products = s.customData.products || [];
    s.customData.recipes = s.customData.recipes || [];
    s.customData.insert_files = s.customData.insert_files || {};
    s.shopifyProducts = s.shopifyProducts || {};
    s.siteSettings = s.siteSettings || { defaultPrinter: '', defaultLocation: 'boat' };
    s.siteSettings.shopifyBridgeUrl = s.siteSettings.shopifyBridgeUrl || '';
    s.siteSettings.shopifyVendor = s.siteSettings.shopifyVendor || 'PLA Pals';
    s.siteSettings.shopifyProductType = s.siteSettings.shopifyProductType || 'PLA Pal';
    s.siteSettings.forgeApiUrl = s.siteSettings.forgeApiUrl || 'https://pla-forge-api.plapalsuk.workers.dev';
    s.productAvailability = s.productAvailability || {};
    return s;
}
function save(s) {
    if (forgeProductionCloudReady) {
        forgeCloudOperationalState = s;
        return saveProductionCloud(s);
    }
    // Legacy pages not migrated yet may still use this path temporarily.
    // New cloud-migrated workflows must never depend on it.
    localStorage.setItem(STORE, JSON.stringify(s));
    return Promise.resolve(true);
}
async function load(name) {
    if (name === 'products')
        return await cloudCoreProducts();
    if (name === 'recipes')
        return await cloudCoreRecipes();
    // Non-catalogue static reference files may still be loaded from the deployed site,
    // but operational inventory never comes from browser localStorage.
    const base = await (await fetch('data/' + name + '.json', { cache: 'no-store' })).json();
    return base;
}
function badge(txt, cls = 'info') { return `<span class="badge ${cls}">${txt}</span>`; }
function targetKey(sku, loc) { return `${sku}:${loc}`; }
function getTarget(s, sku, loc) { return Number(s.targets[targetKey(sku, loc)] || 0); }
function stock(s, sku, loc) { return Number((s.stock[sku] || {})[loc] || 0); }
function needed(s, sku, loc) { return Math.max(0, getTarget(s, sku, loc) - stock(s, sku, loc)); }
function totalNeed(s, sku) { return needed(s, sku, 'boat') + needed(s, sku, 'cornwall'); }
function awaitingDispatchQty(s, sku) {
    return (s.awaitingDispatch || [])
        .filter(x => x.sku === sku && x.status === 'awaiting_dispatch')
        .reduce((a, x) => a + Number(x.qty || 0), 0);
}
function assembledQtyForDemand(s, sku) { var _a; return Number(((_a = s.assembled) === null || _a === void 0 ? void 0 : _a[sku]) || 0); }
// Quantity still requiring manufacture after allowing for finished Pals already in the workflow.
// Location stock is already deducted by totalNeed(). Packed-but-unallocated and assembled Pals
// must also be deducted so moving a Pal downstream never creates fresh print demand.
function damageReworkQty(s, sku, type) {
    return (s.damageReworkJobs || [])
        .filter(x => x.sku === sku && x.status === 'awaiting_rework' && (!type || x.type === type))
        .reduce((a, x) => a + Number(x.qty || 0), 0);
}
function intactDamageReworkQty(s, sku) {
    const legacy = damageReworkQty(s, sku, 'box') + damageReworkQty(s, sku, 'insert');
    const localItems = (s.damageReworkJobs || [])
        .filter(x => x.sku === sku && x.status === 'awaiting_rework' && x.type === 'item')
        .filter(x => damageReworkRequirements(x).route === 'cornwall')
        .reduce((a, x) => a + Number(x.qty || 1), 0);
    return legacy + localItems;
}
function manufacturingNeed(s, sku) {
    return Math.max(0, totalNeed(s, sku) - assembledQtyForDemand(s, sku) - awaitingDispatchQty(s, sku) - intactDamageReworkQty(s, sku));
}
// Quantity still needing assembly. Packed Pals count as completed manufacture and must not
// reappear on The Bench after they leave assembled stock.
function assemblyNeed(s, sku) {
    return Math.max(0, totalNeed(s, sku) - awaitingDispatchQty(s, sku) - assembledQtyForDemand(s, sku));
}
function esc(v) { return String(v !== null && v !== void 0 ? v : '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m])); }
function groupKey(r) { return `group|${r.sku}|${r.filament}|${r.grouped_stl}`; }
function recoveryKey(sku, file) { return `recovery|${sku}|${file}`; }
function partQty(s, key) { return Number(s.parts[key] || 0); }
function activePlateQty(s, key) { return (s.plates || []).filter(p => !['complete', 'cancelled'].includes(p.status)).reduce((sum, p) => sum + (p.items || []).filter(i => i.inventory_key === key).reduce((a, i) => a + Number(i.qty || 0), 0), 0); }
function statusLabel(st) { const m = { draft: ['Draft', 'info'], printing: ['Printing', 'warning'], complete: ['Complete', 'ok'], cancelled: ['Cancelled', 'danger'] }; const x = m[st] || [st, 'info']; return badge(x[0], x[1]); }
function fmtDate(v) {
    if (!v)
        return '—';
    try {
        return new Date(v).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    }
    catch (e) {
        return v;
    }
}
function makeId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function cloudToken() { return localStorage.getItem('plaForgeCloudToken') || ''; }
function setCloudToken(v) {
    if (v)
        localStorage.setItem('plaForgeCloudToken', v);
    else
        localStorage.removeItem('plaForgeCloudToken');
}
const FORGE_API_URL = 'https://pla-forge-api.plapalsuk.workers.dev';
function cloudApiBase() { return FORGE_API_URL; }
async function cloudFetch(path, options = {}) {
    const headers = Object.assign({}, (options.headers || {}));
    const token = cloudToken();
    if (token)
        headers.Authorization = `Bearer ${token}`;
    const res = await fetch(cloudApiBase() + path, Object.assign(Object.assign({}, options), { headers }));
    const data = await res.json().catch(() => ({}));
    if (res.status === 401)
        setCloudToken('');
    if (!res.ok)
        throw new Error(data.detail || data.error || `HTTP ${res.status}`);
    return data;
}
async function cloudFetchTimed(path, options = {}, timeoutMs = 12000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await cloudFetch(path, Object.assign(Object.assign({}, options), { signal: controller.signal }));
    }
    catch (e) {
        if ((e === null || e === void 0 ? void 0 : e.name) === 'AbortError')
            throw new Error(`Cloud request timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
        throw e;
    }
    finally {
        clearTimeout(timer);
    }
}
async function refreshProductAvailabilityFromD1(s) {
    const rows = await cloudAvailability();
    applyCloudAvailability(s, rows);
    return rows;
}
function normaliseCloudProduct(p) {
    var _a;
    return Object.assign(Object.assign({}, p), { type: p.product_type || p.type || 'pal', description: p.short_description || p.description || '', height_cm: Number(p.height_cm || 0), width_cm: Number(p.width_cm || 0), depth_cm: Number(p.depth_cm || 0), price: Number(p.price || 0), on_sale: Number(p.on_sale || 0) === 1, keyring: Number(p.keyring || 0) === 1, recipe_ready: Number(p.recipe_ready || 0) === 1, active: Number((_a = p.active) !== null && _a !== void 0 ? _a : 1) === 1, characteristics: [p.characteristic_1, p.characteristic_2, p.characteristic_3].filter(Boolean) });
}
function normaliseCloudRecipe(r) {
    return Object.assign(Object.assign({}, r), { filament: r.filament_name || r.filament || '', weight_g: Number(r.weight_g || 0), part_count: Number(r.part_count || 1) });
}
async function syncCloudCoreState() {
    if (!cloudToken())
        return { ok: false, reason: 'not_logged_in' };
    try {
        const core = await cloudFetch('/core');
        return {
            ok: true,
            core: Object.assign(Object.assign({}, core), { products: (core.products || []).map(normaliseCloudProduct), recipes: (core.recipes || []).map(normaliseCloudRecipe) })
        };
    }
    catch (e) {
        console.error('Cloud Core sync failed.', e);
        return { ok: false, reason: e.message };
    }
}
async function cloudCoreProducts() {
    if (!cloudToken())
        throw new Error('Cloud login required.');
    const d = await cloudFetch('/products');
    return (d.products || []).map(normaliseCloudProduct);
}
async function cloudAvailability() {
    if (!cloudToken())
        throw new Error('Cloud login required.');
    const d = await cloudFetchTimed('/availability', {}, 10000);
    return d.availability || [];
}
async function cloudConsumables() {
    if (!cloudToken())
        throw new Error('Cloud login required.');
    return await cloudFetchTimed('/consumables', {}, 10000);
}
function applyCloudConsumables(s, data) {
    s.consumables = {};
    ((data === null || data === void 0 ? void 0 : data.consumables) || []).forEach(x => {
        s.consumables[x.key] = {
            name: x.name,
            stock: Number(x.stock || 0),
            reorder: Number(x.reorder || 0),
            unit: x.unit || 'units'
        };
    });
    s.consumableHistory = ((data === null || data === void 0 ? void 0 : data.history) || []).slice();
}
function applyCloudAvailability(s, rows) {
    s.productAvailability = {};
    (rows || []).forEach(x => {
        s.productAvailability[x.sku] = {
            on_sale: x.on_sale === true,
            release_date: x.release_date || ''
        };
    });
}
async function cloudCoreRecipes() {
    if (!cloudToken())
        throw new Error('Cloud login required.');
    const d = await cloudFetch('/recipes');
    return (d.recipes || []).map(normaliseCloudRecipe);
}
function cloudModeBadge() {
    return cloudToken() ? badge('CLOUD LIVE', 'ok') : badge('CLOUD LOGIN REQUIRED', 'danger');
}
const FORGE_ROLE_PAGES = {
    admin: ['*'],
    packing: ['packing-station.html'],
    retail_staff: ['deliveries.html', 'rework.html']
};
function forgeCurrentPage() { return location.pathname.split('/').pop() || 'index.html'; }
function roleCanOpen(role, page) {
    const allowed = FORGE_ROLE_PAGES[role] || [];
    return allowed.includes('*') || allowed.includes(page);
}
function roleHomePage(role) {
    if (role === 'packing')
        return 'packing-station.html';
    if (role === 'retail_staff')
        return 'deliveries.html';
    return 'index.html';
}
function currentForgeUser() {
    try {
        return JSON.parse(localStorage.getItem('plaForgeUser') || 'null');
    }
    catch (_a) {
        return null;
    }
}
function setForgeUser(user) {
    if (user)
        localStorage.setItem('plaForgeUser', JSON.stringify(user));
    else
        localStorage.removeItem('plaForgeUser');
}
async function forgeRequireLogin() {
    if (forgeCurrentPage() === 'login.html')
        return true;
    // Fail closed: a protected page never becomes visible until Cloudflare
    // has confirmed both the token and the user's role.
    document.body.classList.remove('forge-auth-ready');
    const returnTo = encodeURIComponent(location.href);
    if (!cloudToken()) {
        setForgeUser(null);
        location.replace(`login.html?return=${returnTo}`);
        return false;
    }
    try {
        const me = await cloudFetch('/auth/me');
        const user = me.user || me;
        if (!user || !user.id || !user.role) {
            throw new Error('Invalid authenticated user response.');
        }
        if (!roleCanOpen(user.role, forgeCurrentPage())) {
            setForgeUser(user);
            location.replace(roleHomePage(user.role) + '?denied=1');
            return false;
        }
        // Cached user data is for display only. Access was granted by /auth/me above.
        setForgeUser(user);
        applyRoleNavigation(user);
        applyRolePageRestrictions(user);
        document.body.classList.remove('forge-auth-checking');
        document.body.classList.add('forge-auth-ready');
        return true;
    }
    catch (e) {
        setCloudToken('');
        setForgeUser(null);
        document.body.classList.remove('forge-auth-ready');
        location.replace(`login.html?return=${returnTo}`);
        return false;
    }
}
async function forgeBoot(initializer) {
    // Every protected page comes through this gate.
    document.body.classList.add('forge-auth-checking');
    const ok = await forgeRequireLogin();
    if (!ok)
        return;
    try {
        if (typeof initializer === 'function')
            await initializer();
    }
    catch (e) {
        console.error('PLA Forge page startup failed:', e);
        const host = document.querySelector('main') || document.body;
        const box = document.createElement('div');
        box.className = 'forge-startup-error';
        box.innerHTML = `<div><strong>PLA Forge could not start this page.</strong><div class="small">${esc((e === null || e === void 0 ? void 0 : e.message) || String(e))}</div></div><button class="btn" onclick="location.reload()">Try Again</button>`;
        host.prepend(box);
    }
}
function applyRoleNavigation(user) {
    const role = (user === null || user === void 0 ? void 0 : user.role) || '';
    const current = forgeCurrentPage();
    // Hide every navigation link the role cannot open.
    document.querySelectorAll('.sidebar a').forEach(a => {
        const href = (a.getAttribute('href') || '').split('?')[0].split('#')[0];
        if (!href)
            return;
        const page = href.split('/').pop();
        if (page && page.endsWith('.html')) {
            const allowed = roleCanOpen(role, page);
            a.style.display = allowed ? 'inline-flex' : 'none';
            a.setAttribute('aria-hidden', allowed ? 'false' : 'true');
        }
    });
    // Hide empty section headings/groups after their links have been filtered.
    document.querySelectorAll('.sidebar .navgroup').forEach(group => {
        var _a;
        const scope = group.parentElement || document;
        let next = group.nextElementSibling;
        let hasVisible = false;
        while (next && !next.classList.contains('navgroup')) {
            if (((_a = next.matches) === null || _a === void 0 ? void 0 : _a.call(next, 'a')) && next.style.display !== 'none')
                hasVisible = true;
            next = next.nextElementSibling;
        }
        group.style.display = hasVisible ? 'block' : 'none';
    });
    // On mobile, only keep role-relevant tabs visible and mark active tab.
    document.querySelectorAll('.sidebar a').forEach(a => {
        const href = (a.getAttribute('href') || '').split('?')[0].split('#')[0];
        const page = href.split('/').pop();
        a.classList.toggle('role-active-tab', page === current);
    });
    // Signed-in user card.
    const side = document.querySelector('.sidebar');
    if (side && !side.querySelector('.forge-user-card')) {
        const card = document.createElement('div');
        card.className = 'forge-user-card';
        card.innerHTML = `<div><strong>${esc(user.name || user.email || 'Forge User')}</strong><div class="small">${esc(role === 'retail_staff' ? 'Retail Staff' : role === 'packing' ? 'Packing' : 'Admin')}</div></div><button class="iconbtn" id="forgeQuickLogout" title="Log out">↪</button>`;
        side.appendChild(card);
        card.querySelector('#forgeQuickLogout').onclick = forgeLogout;
    }
}
function applyRolePageRestrictions(user) {
    if (!user)
        return;
    document.body.classList.add('forge-role-' + String(user.role || '').replace(/_/g, '-'));
    if (user.role === 'retail_staff' && forgeCurrentPage() === 'deliveries.html') {
        const pageTitle = document.querySelector('.pageTitle h1');
        if (pageTitle)
            pageTitle.textContent = 'Cornwall Deliveries';
        const subtitle = document.querySelector('.pageTitle .small');
        if (subtitle)
            subtitle.textContent = 'Receive stock and complete the Cornwall quality check.';
        // Retail staff only need the Cornwall receiving workflow, not factory dispatch allocation.
        const hideHeadings = [
            'Ready to Dispatch',
            'Boat Inventory',
            'Cornwall Inventory'
        ];
        document.querySelectorAll('h1,h2,h3,h4,.stat,.card,.panel,section').forEach(el => {
            const text = (el.textContent || '').trim();
            if (hideHeadings.some(h => text.startsWith(h))) {
                // Prefer hiding the containing card/section rather than a heading alone.
                const card = el.closest('section,.card,.panel,[class*="card"],[class*="panel"]') || el;
                card.style.display = 'none';
            }
        });
        // Hide top summary cards by their labels, including Ready to Dispatch/Boat/Cornwall Inventory.
        document.querySelectorAll('body *').forEach(el => {
            if (el.children.length > 8)
                return;
            const text = (el.textContent || '').trim();
            if (/^(READY TO DISPATCH|BOAT INVENTORY|CORNWALL INVENTORY)\b/i.test(text)) {
                const card = el.closest('.stat-card,.metric-card,.card,[class*="stat"],[class*="metric"]') || el;
                card.style.display = 'none';
            }
        });
        // Keep Awaiting Cornwall Delivery visible.
        document.querySelectorAll('button').forEach(btn => {
            const text = (btn.textContent || '').trim();
            if (/split allocation|confirm dispatch|dispatch to/i.test(text))
                btn.style.display = 'none';
        });
    }
    if (user.role === 'retail_staff' && forgeCurrentPage() === 'rework.html') {
        // Retail staff may work only with Cornwall-held Box and Insert rework.
        const allowed = /box|insert/i;
        document.querySelectorAll('tr').forEach(row => {
            const text = row.textContent || '';
            if (/pal damaged|pal broken|full pal|complete pal|factory|filament|print/i.test(text) && !allowed.test(text))
                row.style.display = 'none';
        });
        document.querySelectorAll('button,[role="button"]').forEach(btn => {
            const text = (btn.textContent || '') + ' ' + (btn.title || '');
            if (/factory|produce pal|print pal|dispatch pal|complete pal/i.test(text))
                btn.style.display = 'none';
        });
    }
}
function forgeLogout() {
    document.body.classList.remove('forge-auth-ready');
    setCloudToken('');
    setForgeUser(null);
    location.replace('login.html');
}
async function availabilityPage() {
    installForgeCloudSyncBadge();
    if (!forgeProductionCloudReady) {
        try {
            await hydrateProductionCloud();
        }
        catch (e) {
            showCloudRequiredError(e.message);
            return;
        }
    }
    let s = cloudOperationalState();
    const ps = await load('products');
    const pals = ps.filter(p => p.type === 'pal');
    const q = document.querySelector('#q');
    const filter = document.querySelector('#availabilityFilter');
    const list = document.querySelector('#availabilityList');
    const saleKpi = document.querySelector('#onSaleKpi');
    const futureKpi = document.querySelector('#futureKpi');
    const offKpi = document.querySelector('#offSaleKpi');
    if (!q || !filter || !list)
        return;
    function status(p) {
        var _a;
        const rec = ((_a = s.productAvailability) === null || _a === void 0 ? void 0 : _a[p.sku]) || {};
        if (rec.on_sale === true)
            return 'sale';
        if (rec.release_date && rec.release_date > new Date().toISOString().slice(0, 10))
            return 'future';
        return 'off';
    }
    function render() {
        const text = (q.value || '').toLowerCase();
        const mode = filter.value;
        const all = pals.map(p => { var _a; return ({ p, rec: ((_a = s.productAvailability) === null || _a === void 0 ? void 0 : _a[p.sku]) || {}, status: status(p) }); });
        if (saleKpi)
            saleKpi.textContent = all.filter(x => x.status === 'sale').length;
        if (futureKpi)
            futureKpi.textContent = all.filter(x => x.status === 'future').length;
        if (offKpi)
            offKpi.textContent = all.filter(x => x.status === 'off').length;
        const data = all
            .filter(x => `${x.p.name} ${x.p.sku}`.toLowerCase().includes(text))
            .filter(x => mode === 'all' || x.status === mode)
            .sort((a, b) => (a.status === 'sale' ? -2 : a.status === 'future' ? -1 : 0) - (b.status === 'sale' ? -2 : b.status === 'future' ? -1 : 0) || a.p.name.localeCompare(b.p.name));
        list.innerHTML = data.map(x => `
     <div class="availability-row">
       <div><strong>${esc(x.p.name)}</strong><div class="sku">${x.p.sku}</div></div>
       <div>${x.status === 'sale' ? badge('ON SALE', 'ok') : x.status === 'future' ? badge('FUTURE RELEASE', 'warning') : badge('NOT ON SALE', '')}</div>
       <label>
         <span class="small">Release Date</span>
         <input class="cloudReleaseDate" data-sku="${x.p.sku}" type="date" value="${esc(x.rec.release_date || '')}">
       </label>
       <button class="btn ${x.status === 'sale' ? 'ghost' : ''} cloudToggleSale" data-sku="${x.p.sku}">
         ${x.status === 'sale' ? 'Take Off Sale' : 'Put On Sale'}
       </button>
     </div>`).join('') || '<div class="bench-empty">No Pals match this view.</div>';
        document.querySelectorAll('.cloudToggleSale').forEach(btn => btn.onclick = async () => {
            var _a;
            const sku = btn.dataset.sku;
            const rec = ((_a = s.productAvailability) === null || _a === void 0 ? void 0 : _a[sku]) || { on_sale: false, release_date: '' };
            const next = !Boolean(rec.on_sale);
            const releaseDate = next ? (rec.release_date || new Date().toISOString().slice(0, 10)) : (rec.release_date || null);
            btn.disabled = true;
            const oldText = btn.textContent;
            btn.textContent = 'Saving to Cloud…';
            try {
                await cloudFetchTimed(`/products/${encodeURIComponent(sku)}/availability`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ on_sale: next, release_date: releaseDate })
                }, 10000);
                // Confirm only the products table. Do not wait for unrelated production endpoints.
                const availability = await refreshProductAvailabilityFromD1(s);
                const confirmed = availability.find(p => p.sku === sku);
                if (!confirmed)
                    throw new Error(`${sku} was not returned by D1 after the update.`);
                if (Boolean(confirmed.on_sale) !== next) {
                    throw new Error(`D1 did not confirm the requested On Sale value for ${sku}.`);
                }
                render();
                setForgeCloudSync('synced', `${sku} ${next ? 'On Sale' : 'Not On Sale'} confirmed by D1`);
            }
            catch (e) {
                btn.disabled = false;
                btn.textContent = oldText;
                setForgeCloudSync('error', e.message || 'Availability update failed');
                alert(`Availability was NOT changed in Cloudflare: ${e.message}`);
            }
        });
        document.querySelectorAll('.cloudReleaseDate').forEach(el => el.onchange = async () => {
            var _a;
            const sku = el.dataset.sku;
            const rec = ((_a = s.productAvailability) === null || _a === void 0 ? void 0 : _a[sku]) || { on_sale: false, release_date: '' };
            const nextDate = el.value || null;
            el.disabled = true;
            try {
                await cloudFetchTimed(`/products/${encodeURIComponent(sku)}/availability`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ on_sale: Boolean(rec.on_sale), release_date: nextDate })
                }, 10000);
                const availability = await refreshProductAvailabilityFromD1(s);
                const confirmed = availability.find(p => p.sku === sku);
                if (!confirmed)
                    throw new Error(`${sku} was not returned by D1 after the update.`);
                render();
                setForgeCloudSync('synced', `${sku} release date confirmed by D1`);
            }
            catch (e) {
                el.disabled = false;
                render();
                setForgeCloudSync('error', e.message || 'Release date update failed');
                alert(`Release date was NOT changed in Cloudflare: ${e.message}`);
            }
        });
    }
    q.oninput = render;
    filter.onchange = render;
    render();
    await startForgeLiveSync(async (fresh) => {
        s = JSON.parse(JSON.stringify(fresh));
        render();
    });
}
async function assemblyPage() {
    installForgeCloudSyncBadge();
    if (!forgeProductionCloudReady) {
        try {
            await hydrateProductionCloud();
        }
        catch (e) {
            showCloudRequiredError(e.message);
            return;
        }
    }
    let s = cloudOperationalState();
    const ps = await load('products');
    const rs = await load('recipes');
    const pals = ps.filter(p => p.type === 'pal');
    let demandSnapshot = await loadPalDemandSnapshot(s, ps);
    const q = document.querySelector('#q');
    const readyBox = document.querySelector('#assemblyReady');
    const awaitingBox = document.querySelector('#assemblyAwaiting');
    const inventorySearch = document.querySelector('#assembledInventorySearch');
    const inventoryBody = document.querySelector('#assembledInventory');
    const kpiReady = document.querySelector('#assemblyReadyKpi');
    const kpiAssembled = document.querySelector('#assembledKpi');
    const kpiWaiting = document.querySelector('#assemblyWaitingKpi');
    const readySectionCount = document.querySelector('#readySectionCount');
    const awaitingSectionCount = document.querySelector('#awaitingSectionCount');
    function recipeGroups(sku) { return rs.filter(r => r.sku === sku); }
    function assembledQty(sku) { var _a; return Number(((_a = s.assembled) === null || _a === void 0 ? void 0 : _a[sku]) || 0); }
    function plannerNeed(sku) {
        const d = demandSnapshot.bySku[sku];
        if (!d)
            return 0;
        return Math.max(0, Number(d.need_to_make || 0) + assembledQty(sku));
    }
    function remainingAssemblyNeed(sku) {
        const d = demandSnapshot.bySku[sku];
        return Math.max(0, Number((d === null || d === void 0 ? void 0 : d.need_to_make) || 0));
    }
    function readyQty(p) {
        const groups = recipeGroups(p.sku);
        if (!groups.length)
            return 0;
        return Math.max(0, Math.min(...groups.map(r => partQty(s, groupKey(r)))));
    }
    function groupStock(p) {
        return recipeGroups(p.sku).map(r => ({
            r,
            have: partQty(s, groupKey(r))
        }));
    }
    function readyCard(x) {
        const maxUseful = Math.max(0, Math.min(x.ready, x.remainingNeed > 0 ? x.remainingNeed : x.ready));
        return `<div class="assembly-card ready">
     <div class="assembly-card-head">
       <div><strong>${esc(x.p.name)}</strong><div class="sku">${x.p.sku}</div></div>
       ${badge(`${x.ready} Ready`, 'ok')}
     </div>
     <div class="assembly-demand-strip">
       <span>Production Need <strong>${x.plannerNeed}</strong></span>
       <span>Already Assembled <strong>${x.assembled}</strong></span>
       <span>Still Needed <strong>${x.remainingNeed}</strong></span>
     </div>
     <div class="assembly-parts">
       ${x.groups.map(g => `<div class="assembly-part"><span>${esc(g.r.filament)} · ${esc(g.r.parts)}</span><strong>${g.have}</strong></div>`).join('') || '<div class="small">No recipe available.</div>'}
     </div>
     <div class="assembly-actions">
       <label><span class="small">Assemble Qty</span><input class="number assembleQty" id="assemble-${x.p.sku}" type="number" min="1" max="${Math.max(1, maxUseful)}" value="1"></label>
       <button class="btn assembleBtn" data-sku="${x.p.sku}">Assemble</button>
     </div>
   </div>`;
    }
    function awaitingCard(x) {
        return `<div class="assembly-card not-ready">
     <div class="assembly-card-head">
       <div><strong>${esc(x.p.name)}</strong><div class="sku">${x.p.sku}</div></div>
       ${badge(`NEED ${x.remainingNeed}`, 'warning')}
     </div>
     <div class="assembly-demand-strip">
       <span>Production Need <strong>${x.plannerNeed}</strong></span>
       <span>Already Assembled <strong>${x.assembled}</strong></span>
       <span>Still Needed <strong class="accent">${x.remainingNeed}</strong></span>
     </div>
     <div class="assembly-parts">
       ${x.groups.map(g => `<div class="assembly-part ${g.have <= 0 ? 'missing' : ''}"><span>${esc(g.r.filament)} · ${esc(g.r.parts)}</span><strong>${g.have}</strong></div>`).join('') || '<div class="small">No recipe available.</div>'}
     </div>
     <div class="awaiting-note"><span class="small">Production Planner still requires ${x.remainingNeed}. Waiting for enough printed parts to assemble more.</span></div>
   </div>`;
    }
    function render() {
        const text = (q.value || '').toLowerCase();
        const all = pals.map(p => ({
            p,
            ready: readyQty(p),
            plannerNeed: plannerNeed(p.sku),
            assembled: assembledQty(p.sku),
            remainingNeed: remainingAssemblyNeed(p.sku),
            groups: groupStock(p)
        })).filter(x => `${x.p.name} ${x.p.sku}`.toLowerCase().includes(text));
        // READY: any Pal for which every required printed colour-group is physically available.
        // Production demand does not control whether it appears here.
        const ready = all
            .filter(x => x.ready > 0)
            .sort((a, b) => b.ready - a.ready || b.remainingNeed - a.remainingNeed || a.p.name.localeCompare(b.p.name));
        // AWAITING: demanded by Production Planning but no complete Pal can be assembled yet.
        const awaiting = all
            .filter(x => x.remainingNeed > 0 && x.ready <= 0)
            .sort((a, b) => b.remainingNeed - a.remainingNeed || a.p.name.localeCompare(b.p.name));
        kpiReady.textContent = ready.reduce((a, x) => a + x.ready, 0);
        kpiAssembled.textContent = Object.values(s.assembled || {}).reduce((a, b) => a + Number(b || 0), 0);
        kpiWaiting.textContent = awaiting.reduce((a, x) => a + x.remainingNeed, 0);
        readySectionCount.textContent = `${ready.length} Ready`;
        awaitingSectionCount.textContent = `${awaiting.length} Awaiting`;
        readyBox.innerHTML = ready.length
            ? ready.map(readyCard).join('')
            : '<div class="bench-empty">No Pals are ready to assemble yet.</div>';
        awaitingBox.innerHTML = awaiting.length
            ? awaiting.map(awaitingCard).join('')
            : '<div class="bench-empty">Nothing is currently awaiting assembly.</div>';
        const inventoryText = ((inventorySearch === null || inventorySearch === void 0 ? void 0 : inventorySearch.value) || '').toLowerCase();
        const assembledRows = pals.map(p => ({
            p,
            qty: assembledQty(p.sku)
        })).filter(x => x.qty > 0)
            .filter(x => `${x.p.name} ${x.p.sku}`.toLowerCase().includes(inventoryText))
            .sort((a, b) => b.qty - a.qty || a.p.name.localeCompare(b.p.name));
        inventoryBody.innerHTML = assembledRows.length ? assembledRows.map(x => `<tr>
     <td><strong>${esc(x.p.name)}</strong><br><span class="sku">${x.p.sku}</span></td>
     <td><strong>${x.qty}</strong></td>
   </tr>`).join('') : '<tr><td colspan="2">No assembled Pals currently in inventory.</td></tr>';
        document.querySelectorAll('.assembleBtn').forEach(btn => btn.onclick = async () => {
            var _a, _b;
            const sku = btn.dataset.sku;
            const p = pals.find(x => x.sku === sku);
            const available = readyQty(p);
            const stillNeeded = remainingAssemblyNeed(sku);
            const maxQty = Math.max(1, Math.min(available, stillNeeded > 0 ? stillNeeded : available));
            const qty = Math.max(1, Math.min(maxQty, Number(((_a = document.querySelector('#assemble-' + sku)) === null || _a === void 0 ? void 0 : _a.value) || 1)));
            if (!available || qty > available)
                return;
            // Snapshot the fields changed by assembly so a failed cloud save can be rolled back safely.
            const beforeParts = JSON.parse(JSON.stringify(s.parts || {}));
            const beforeAssembled = JSON.parse(JSON.stringify(s.assembled || {}));
            const beforeHistory = JSON.parse(JSON.stringify(s.assemblyHistory || []));
            btn.disabled = true;
            btn.textContent = 'Saving…';
            recipeGroups(sku).forEach(r => {
                const key = groupKey(r);
                s.parts[key] = Math.max(0, partQty(s, key) - qty);
            });
            s.assembled[sku] = Number(s.assembled[sku] || 0) + qty;
            s.assemblyHistory.push({
                id: makeId(),
                sku,
                name: p.name,
                qty,
                production_need_before: stillNeeded,
                production_need_after: Math.max(0, stillNeeded - qty),
                created_at: new Date().toISOString(),
                cloud_user: ((_b = currentForgeUser()) === null || _b === void 0 ? void 0 : _b.email) || ''
            });
            try {
                await save(s);
                render();
            }
            catch (e) {
                s.parts = beforeParts;
                s.assembled = beforeAssembled;
                s.assemblyHistory = beforeHistory;
                render();
                alert('Assembly could not be saved to Cloudflare. Printed Parts and Assembled Inventory have been rolled back.');
            }
        });
    }
    q.oninput = render;
    if (inventorySearch)
        inventorySearch.oninput = render;
    render();
    await startForgeLiveSync(async (fresh) => {
        // Replace the Bench state reference completely with the D1-hydrated state.
        s = JSON.parse(JSON.stringify(fresh));
        try {
            demandSnapshot = await loadPalDemandSnapshot(s, ps);
        }
        catch (e) {
            console.error('Bench demand refresh failed', e);
            setForgeCloudSync('error', 'Bench demand could not refresh');
            return;
        }
        render();
    });
}
async function insertScannerPage() {
    installForgeCloudSyncBadge();
    if (!forgeProductionCloudReady) {
        try {
            await hydrateProductionCloud();
        }
        catch (e) {
            showCloudRequiredError(e.message);
            return;
        }
    }
    let s = cloudOperationalState();
    const ps = await load('products');
    const pals = ps.filter(p => p.type === 'pal');
    const palBySku = Object.fromEntries(pals.map(p => [String(p.sku || '').toUpperCase(), p]));
    const cameraHost = document.querySelector('#insertScannerCamera');
    const statusCard = document.querySelector('#insertScanStatus');
    const statusTitle = document.querySelector('#insertScanStatusTitle');
    const statusDetail = document.querySelector('#insertScanStatusDetail');
    const scannedSku = document.querySelector('#insertScannedSku');
    const waitingQty = document.querySelector('#insertScanWaitingQty');
    const readyQty = document.querySelector('#insertScanReadyQty');
    const recentHost = document.querySelector('#insertScanRecent');
    const manualInput = document.querySelector('#insertManualScan');
    const manualBtn = document.querySelector('#insertManualScanBtn');
    const startBtn = document.querySelector('#startInsertScanner');
    const stopBtn = document.querySelector('#stopInsertScanner');
    const scannerEngineStatus = document.querySelector('#insertScannerEngineStatus');
    let nativeStream = null;
    let nativeVideo = null;
    let nativeDetector = null;
    let nativeLoopToken = 0;
    let scannerRunning = false;

    function setEngineStatus(text) {
        if (scannerEngineStatus)
            scannerEngineStatus.textContent = 'Scanner engine: ' + text;
    }
    let scanBusy = false;
    let lastCode = '';
    let lastCodeAt = 0;
    let sameCodeRearmTimer = null;
    let scannerSaveQueue = Promise.resolve();
    let scannerPendingSaves = 0;
    function rec(sku) {
        s.inserts = s.inserts || {};
        s.inserts[sku] = s.inserts[sku] || { awaiting_cut: 0, ready: 0 };
        return s.inserts[sku];
    }
    function setStatus(kind, title, detail, sku) {
        if (!statusCard)
            return;
        statusCard.classList.remove('scan-success', 'scan-warning', 'scan-error', 'scan-idle');
        statusCard.classList.add(kind === 'success' ? 'scan-success' :
            kind === 'warning' ? 'scan-warning' :
                kind === 'error' ? 'scan-error' : 'scan-idle');
        if (statusTitle)
            statusTitle.textContent = title;
        if (statusDetail)
            statusDetail.textContent = detail;
        if (scannedSku)
            scannedSku.textContent = sku || '—';
    }
    function beep(ok) {
        try {
            if (navigator.vibrate)
                navigator.vibrate(ok ? [70] : [120, 80, 120]);
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext)
                return;
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = ok ? 880 : 220;
            gain.gain.setValueAtTime(0.06, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
            osc.start();
            osc.stop(ctx.currentTime + 0.12);
        }
        catch (_v) { }
    }
    function renderCounters(sku) {
        const r = sku ? rec(sku) : { awaiting_cut: 0, ready: 0 };
        if (waitingQty)
            waitingQty.textContent = Number(r.awaiting_cut || 0);
        if (readyQty)
            readyQty.textContent = Number(r.ready || 0);
    }
    function renderRecent() {
        const rows = (s.insertHistory || [])
            .filter(x => x.action === 'scanner_cut_score_complete')
            .slice(-10)
            .reverse();
        if (!recentHost)
            return;
        recentHost.innerHTML = rows.length ? rows.map(x => `
          <div class="scan-recent-row">
            <div><strong>${esc(x.name || x.sku)}</strong><div class="sku">${esc(x.sku)}</div></div>
            <div class="scan-recent-meta"><strong>+${Number(x.qty || 1)} Ready</strong><span>${fmtDate(x.created_at)}</span></div>
          </div>
        `).join('') : '<div class="bench-empty">No inserts scanned yet.</div>';
    }
    function routeCompletedInsert(sku) {
        var _v;
        const r = rec(sku);
        if (Number(r.awaiting_cut || 0) <= 0) {
            return { ok: false, reason: 'No printed inserts are waiting for Cut & Score.' };
        }
        r.awaiting_cut = Math.max(0, Number(r.awaiting_cut || 0) - 1);
        let remaining = 1;
        let route = 'factory_ready';
        // Replacement insert demand is satisfied first.
        s.damageInsertDemand = s.damageInsertDemand || {};
        const damageNeed = Number(s.damageInsertDemand[sku] || 0);
        if (remaining > 0 && damageNeed > 0) {
            r.ready = Number(r.ready || 0) + 1;
            s.damageInsertDemand[sku] = Math.max(0, damageNeed - 1);
            remaining = 0;
            route = 'damage_rework';
        }
        // Then Cornwall spare replenishment.
        s.cornwallInsertReplenishment = s.cornwallInsertReplenishment || {};
        const cornwallNeed = Number(s.cornwallInsertReplenishment[sku] || 0);
        if (remaining > 0 && cornwallNeed > 0) {
            const p = palBySku[String(sku).toUpperCase()];
            const now = new Date().toISOString();
            s.awaitingDispatch = s.awaitingDispatch || [];
            s.awaitingDispatch.push({
                id: makeId(),
                item_type: 'cornwall_insert_spare',
                sku,
                name: (p === null || p === void 0 ? void 0 : p.name) || sku,
                qty: 1,
                status: 'awaiting_dispatch',
                packed_at: now,
                locked_destination: 'cornwall',
                supply_label: 'Cornwall Spare Insert',
                created_by: ((_v = currentForgeUser()) === null || _v === void 0 ? void 0 : _v.email) || ''
            });
            s.cornwallInsertReplenishment[sku] = Math.max(0, cornwallNeed - 1);
            remaining = 0;
            route = 'cornwall_spare';
        }
        // Normal production becomes ready factory stock.
        if (remaining > 0) {
            r.ready = Number(r.ready || 0) + 1;
        }
        return { ok: true, route };
    }
    function queueScannerSave(sku, palName) {
        scannerPendingSaves += 1;

        // Capture the latest optimistic scanner state at the time this save
        // enters the queue. save() already serialises production writes, but
        // this extra queue lets scanning continue without awaiting Cloudflare.
        scannerSaveQueue = scannerSaveQueue
            .then(async () => {
                try {
                    await save(s);
                }
                catch (e) {
                    console.error('Background scanner save failed', e);
                    setStatus(
                        'warning',
                        'Scanned locally · cloud retry needed',
                        `${palName} · ${sku} was accepted by the scanner, but Cloudflare did not confirm the save yet.`,
                        sku
                    );
                    setForgeCloudSync('error', 'Scanner cloud save failed · use Refresh Cloud before rescanning uncertain stock');
                }
                finally {
                    scannerPendingSaves = Math.max(0, scannerPendingSaves - 1);
                }
            });

        return scannerSaveQueue;
    }

    function armSameBarcodeAgain(code) {
        if (sameCodeRearmTimer)
            clearTimeout(sameCodeRearmTimer);

        sameCodeRearmTimer = setTimeout(() => {
            // Only clear if this is still the most recently accepted code.
            // This means another sheet carrying the same SKU can be scanned
            // after the 2.2 second duplicate-protection window.
            if (lastCode === code) {
                lastCode = '';
                lastCodeAt = 0;

                if (statusTitle?.textContent === 'Scanned ✓') {
                    setStatus(
                        'idle',
                        'Ready for next sheet',
                        'The same barcode can now be scanned again.',
                        code
                    );
                }
            }
        }, 2200);
    }

    async function processCode(rawCode) {
        var _v;

        // scanBusy now protects only the tiny synchronous stock mutation,
        // NOT the Cloudflare save. This makes the scanner re-arm immediately.
        if (scanBusy)
            return;

        const code = String(rawCode || '').trim().toUpperCase();
        if (!code)
            return;

        const nowMs = Date.now();

        // Keep the existing protection against one physical barcode being
        // detected repeatedly while it remains in front of the camera.
        if (code === lastCode && nowMs - lastCodeAt < 2200)
            return;

        lastCode = code;
        lastCodeAt = nowMs;
        armSameBarcodeAgain(code);

        const pal = palBySku[code];
        if (!pal) {
            setStatus('error', 'Barcode not recognised', `${code} is not a PLA Pal SKU in Forge.`, code);
            renderCounters('');
            beep(false);
            return;
        }

        const r = rec(pal.sku);
        if (Number(r.awaiting_cut || 0) <= 0) {
            setStatus('warning', 'Nothing waiting to complete', `${pal.name} has no printed inserts currently waiting for Cut & Score.`, pal.sku);
            renderCounters(pal.sku);
            beep(false);
            return;
        }

        scanBusy = true;

        const result = routeCompletedInsert(pal.sku);
        if (!result.ok) {
            scanBusy = false;
            setStatus('warning', 'Nothing waiting to complete', result.reason, pal.sku);
            renderCounters(pal.sku);
            beep(false);
            return;
        }

        s.insertHistory = s.insertHistory || [];
        s.insertHistory.push({
            id: makeId(),
            sku: pal.sku,
            name: pal.name,
            qty: 1,
            action: 'scanner_cut_score_complete',
            route: result.route,
            created_at: new Date().toISOString(),
            updated_by: ((_v = currentForgeUser()) === null || _v === void 0 ? void 0 : _v.email) || ''
        });

        // Update UI immediately. The operator does not wait for D1.
        const routeText = result.route === 'cornwall_spare'
            ? 'Completed and routed to Cornwall Dispatch.'
            : result.route === 'damage_rework'
                ? 'Completed and reserved for rework.'
                : 'Completed and added to Ready Inserts.';

        setStatus('success', 'Scanned ✓', `${pal.name} · ${routeText}`, pal.sku);
        renderCounters(pal.sku);
        renderRecent();
        beep(true);

        // Re-arm camera BEFORE saving to Cloudflare.
        scanBusy = false;

        // Save in the background. Subsequent scans can happen immediately.
        queueScannerSave(pal.sku, pal.name);
    }

    function stopNativeScanner() {
        nativeLoopToken++;
        if (nativeStream) {
            try {
                nativeStream.getTracks().forEach(track => track.stop());
            }
            catch (_v) { }
        }
        nativeStream = null;
        if (nativeVideo) {
            try {
                nativeVideo.pause();
                nativeVideo.srcObject = null;
                nativeVideo.remove();
            }
            catch (_v) { }
        }
        nativeVideo = null;
        nativeDetector = null;
    }

    function stopScanner() {
        scannerRunning = false;
        if (sameCodeRearmTimer) {
            clearTimeout(sameCodeRearmTimer);
            sameCodeRearmTimer = null;
        }
        stopNativeScanner();
        if (window.Quagga && Quagga.stop) {
            try {
                Quagga.stop();
            }
            catch (_v) { }
        }
        if (startBtn)
            startBtn.disabled = false;
        if (stopBtn)
            stopBtn.disabled = true;
        if (cameraHost)
            cameraHost.classList.remove('camera-live');
        setEngineStatus('stopped');
    }

    async function startNativeBarcodeDetector() {
        if (!('BarcodeDetector' in window))
            return false;
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)
            return false;

        let formats = [];
        try {
            if (BarcodeDetector.getSupportedFormats)
                formats = await BarcodeDetector.getSupportedFormats();
        }
        catch (_v) { }

        if (formats.length && !formats.includes('code_128'))
            return false;

        nativeDetector = new BarcodeDetector({ formats: ['code_128'] });
        nativeStream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            },
            audio: false
        });

        nativeVideo = document.createElement('video');
        nativeVideo.setAttribute('playsinline', '');
        nativeVideo.muted = true;
        nativeVideo.autoplay = true;
        nativeVideo.srcObject = nativeStream;
        nativeVideo.style.position = 'absolute';
        nativeVideo.style.inset = '0';
        nativeVideo.style.width = '100%';
        nativeVideo.style.height = '100%';
        nativeVideo.style.objectFit = 'cover';
        cameraHost.insertBefore(nativeVideo, cameraHost.firstChild);
        await nativeVideo.play();

        const token = ++nativeLoopToken;
        setEngineStatus('native Code 128 detector active');

        const tick = async () => {
            if (!scannerRunning || token !== nativeLoopToken || !nativeVideo || !nativeDetector)
                return;
            try {
                if (nativeVideo.readyState >= 2) {
                    const found = await nativeDetector.detect(nativeVideo);
                    if (found && found.length) {
                        const raw = String(found[0].rawValue || '').trim();
                        if (raw)
                            processCode(raw);
                    }
                }
            }
            catch (_v) { }
            window.setTimeout(tick, 120);
        };
        tick();
        return true;
    }

    function startQuaggaScanner() {
        return new Promise((resolve, reject) => {
            if (!window.Quagga)
                return reject(new Error('Quagga scanner library unavailable'));

            try {
                Quagga.offDetected();
            }
            catch (_v) { }

            Quagga.onDetected(function (result) {
                var _v;
                const code = (_v = result === null || result === void 0 ? void 0 : result.codeResult) === null || _v === void 0 ? void 0 : _v.code;
                if (code) {
                    const cleanCode = String(code).replace(/[^A-Za-z0-9_-]/g, '').trim();
                    if (cleanCode)
                        processCode(cleanCode);
                }
            });

            Quagga.init({
                inputStream: {
                    name: 'Live',
                    type: 'LiveStream',
                    target: cameraHost,
                    constraints: {
                        facingMode: 'environment',
                        width: { min: 640, ideal: 1280 },
                        height: { min: 480, ideal: 720 }
                    }
                },
                decoder: {
                    readers: ['code_128_reader']
                },
                locate: true,
                locator: {
                    patchSize: 'medium',
                    halfSample: true
                },
                frequency: 10
            }, function (err) {
                if (err)
                    return reject(err);
                try {
                    Quagga.start();
                    setEngineStatus('Quagga Code 128 detector active');
                    resolve(true);
                }
                catch (e) {
                    reject(e);
                }
            });
        });
    }

    async function startScanner() {
        if (scannerRunning)
            return;

        scannerRunning = true;
        if (startBtn)
            startBtn.disabled = true;
        if (stopBtn)
            stopBtn.disabled = false;
        if (cameraHost)
            cameraHost.classList.add('camera-live');

        setStatus('idle', 'Camera starting…', 'Point the camera at the Code 128 barcode on the insert.', '');
        setEngineStatus('starting');

        try {
            const nativeStarted = await startNativeBarcodeDetector();
            if (!nativeStarted)
                await startQuaggaScanner();
            setStatus('idle', 'Ready to scan', 'Hold the full barcode inside the orange scan window.', '');
        }
        catch (nativeErr) {
            stopNativeScanner();
            try {
                await startQuaggaScanner();
                setStatus('idle', 'Ready to scan', 'Hold the full barcode inside the orange scan window.', '');
            }
            catch (fallbackErr) {
                scannerRunning = false;
                if (startBtn)
                    startBtn.disabled = false;
                if (stopBtn)
                    stopBtn.disabled = true;
                if (cameraHost)
                    cameraHost.classList.remove('camera-live');
                const msg = (fallbackErr && fallbackErr.message) || (nativeErr && nativeErr.message) || 'Unknown camera error';
                setEngineStatus('failed — ' + msg);
                setStatus('error', 'Camera could not start', msg, '');
            }
        }
    }
    if (manualBtn) {
        manualBtn.onclick = () => {
            processCode((manualInput === null || manualInput === void 0 ? void 0 : manualInput.value) || '');
            if (manualInput) {
                manualInput.value = '';
                manualInput.focus();
            }
        };
    }
    if (manualInput) {
        manualInput.onkeydown = e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                manualBtn === null || manualBtn === void 0 ? void 0 : manualBtn.click();
            }
        };
    }
    if (startBtn)
        startBtn.onclick = startScanner;
    if (stopBtn)
        stopBtn.onclick = stopScanner;
    renderRecent();
    renderCounters('');
    setStatus('idle', 'Ready', 'Start the camera or scan/type a Pal barcode.', '');
    // Start automatically on phones/tablets after the first tap if browser policy allows.
    // We leave the visible Start Camera button because iOS may require a user gesture.
    await startForgeLiveSync(async (fresh) => {
        s = JSON.parse(JSON.stringify(fresh));
        renderRecent();
        const current = String((scannedSku === null || scannedSku === void 0 ? void 0 : scannedSku.textContent) || '').trim();
        if (current && current !== '—')
            renderCounters(current);
    });
}
async function insertProductionPage() {
    installForgeCloudSyncBadge();
    if (!forgeProductionCloudReady) {
        try {
            await hydrateProductionCloud();
        }
        catch (e) {
            showCloudRequiredError(e.message);
            return;
        }
    }
    let s = cloudOperationalState();
    const ps = await load('products');
    const files = await load('insert_files');
    let demandSnapshot = { bySku: {} };
    let pals = ps.filter(p => p.type === 'pal' && isOnSale(s, p.sku));
    async function refreshInsertDemand() {
        demandSnapshot = await loadPalDemandSnapshot(s, ps);
        pals = ps.filter(p => p.type === 'pal' && isOnSale(s, p.sku));
    }
    ensureCornwallInsertReplenishment(s, ps);
    const q = document.querySelector('#q');
    const printCards = document.querySelector('#insertPrintCards');
    const cutCards = document.querySelector('#insertCutCards');
    const inventory = document.querySelector('#insertInventory');
    const inventorySearch = document.querySelector('#insertInventorySearch');
    const readyKpi = document.querySelector('#insertReadyKpi');
    const cutKpi = document.querySelector('#insertCutKpi');
    const printKpi = document.querySelector('#insertPrintKpi');
    const urgentKpi = document.querySelector('#insertUrgentKpi');
    const printQueueCount = document.querySelector('#printQueueCount');
    const cutQueueCount = document.querySelector('#cutQueueCount');
    const insertPrintBridgeStatus = document.querySelector('#insertPrintBridgeStatus');
    const liveQueueHost = document.querySelector('#insertLivePrinterQueue');
    const liveQueueCount = document.querySelector('#insertLivePrinterQueueCount');
    const liveQueueUpdated = document.querySelector('#insertLivePrinterQueueUpdated');
    let liveQueueTimer = null;
    let liveQueueLoading = false;
    const extrasBtn = document.querySelector('#openInsertExtras');
    const failedBtn = document.querySelector('#openInsertFailed');
    const extrasModal = document.querySelector('#insertExtrasModal');
    const failedModal = document.querySelector('#insertFailedModal');

    async function refreshInsertPrintBridgeStatus() {
        if (!insertPrintBridgeStatus)
            return;
        insertPrintBridgeStatus.className = 'badge info';
        insertPrintBridgeStatus.textContent = 'Checking Pi…';
        try {
            const result = await cloudFetch('/insert-print/health');
            if (result.online) {
                insertPrintBridgeStatus.className = 'badge ok';
                insertPrintBridgeStatus.textContent = 'Pi Printer Online';
                insertPrintBridgeStatus.title = 'Raspberry Pi Forge Print Bridge is reachable.';
            }
            else {
                insertPrintBridgeStatus.className = 'badge danger';
                insertPrintBridgeStatus.textContent = 'Pi Printer Offline';
                insertPrintBridgeStatus.title = result.error || 'Raspberry Pi Print Bridge is unavailable.';
            }
        }
        catch (e) {
            insertPrintBridgeStatus.className = 'badge danger';
            insertPrintBridgeStatus.textContent = 'Pi Printer Offline';
            insertPrintBridgeStatus.title = e.message || String(e);
        }
    }
    function liveQueueRank(state) {
        return String(state || '').toLowerCase() === 'printing' ? 0 : 1;
    }

    function liveQueueTime(value) {
        if (!value) return '';
        try { return new Date(value).toLocaleString(); }
        catch { return String(value); }
    }

    function renderLiveInsertQueue(data) {
        if (!liveQueueHost) return;
        const jobs = (Array.isArray(data?.jobs) ? data.jobs : [])
            .slice()
            .sort((a,b) =>
                liveQueueRank(a.state) - liveQueueRank(b.state) ||
                String(a.job_id || '').localeCompare(String(b.job_id || ''))
            );

        if (liveQueueCount)
            liveQueueCount.textContent = `${jobs.length} Job${jobs.length === 1 ? '' : 's'}`;
        if (liveQueueUpdated)
            liveQueueUpdated.textContent = `Updated ${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})}`;

        if (!jobs.length) {
            liveQueueHost.innerHTML = '<div class="bench-empty live-printer-empty">No inserts waiting to print</div>';
            return;
        }

        liveQueueHost.innerHTML = jobs.map(job => {
            const state = String(job.state || 'waiting').toLowerCase();
            const sku = job.sku == null ? '' : String(job.sku).toUpperCase();
            const pal = sku ? ps.find(p => String(p.sku || '').toUpperCase() === sku) : null;
            const name = pal?.name || '';
            const quantity = job.quantity == null ? null : Number(job.quantity);
            const meta = sku ? `${esc(sku)}${quantity == null ? '' : ` · ×${quantity}`}` : '';
            const status = job.status || (state === 'printing' ? 'Printing now' : 'Waiting to print');

            return `<div class="live-printer-row ${state === 'printing' ? 'is-printing' : 'is-waiting'}">
              <div class="live-printer-state">${state === 'printing' ? 'PRINTING' : 'WAITING'}</div>
              <div class="live-printer-info">
                ${name ? `<strong>${esc(name)}</strong>` : `<strong>${esc(job.job_id || 'CUPS Job')}</strong>`}
                ${meta ? `<div class="sku">${meta}</div>` : ''}
                <div class="live-printer-status">${esc(status)}</div>
              </div>
              <div class="live-printer-cups">
                <span>CUPS JOB</span>
                <strong>${esc(job.job_id || '—')}</strong>
                ${job.submitted ? `<small>${esc(liveQueueTime(job.submitted))}</small>` : ''}
              </div>
            </div>`;
        }).join('');
    }

    async function refreshLiveInsertQueue() {
        if (liveQueueLoading) return;
        liveQueueLoading = true;
        try {
            const data = await cloudFetch('/insert-print/queue');
            renderLiveInsertQueue(data);
        }
        catch (e) {
            if (liveQueueHost)
                liveQueueHost.innerHTML = `<div class="bench-empty live-printer-error">Printer queue unavailable · ${esc(e.message || String(e))}</div>`;
            if (liveQueueUpdated)
                liveQueueUpdated.textContent = 'Queue unavailable';
        }
        finally {
            liveQueueLoading = false;
        }
    }

    function startLiveInsertQueue() {
        if (liveQueueTimer) clearInterval(liveQueueTimer);
        refreshLiveInsertQueue();
        liveQueueTimer = setInterval(refreshLiveInsertQueue, 5000);
    }

    async function recordPrintedInsert(sku, qty, reasonPrefix) {
        var _x, _y, _z;
        const r = rec(sku);
        const cardStock = Number(((_y = (_x = s.consumables) === null || _x === void 0 ? void 0 : _x.card_210gsm) === null || _y === void 0 ? void 0 : _y.stock) || 0);
        if (cardStock < qty) {
            throw new Error(`Not enough 210gsm Card. Need ${qty} sheet${qty === 1 ? '' : 's'}, but only ${cardStock} available.`);
        }
        s.consumables.card_210gsm.stock = cardStock - qty;
        s.consumableHistory = s.consumableHistory || [];
        s.consumableHistory.push({
            id: makeId(),
            key: 'card_210gsm',
            name: '210gsm Card',
            qty: -qty,
            reason: `${reasonPrefix || 'Insert printed'} · ${sku}`,
            created_at: new Date().toISOString(),
            updated_by: ((_z = currentForgeUser()) === null || _z === void 0 ? void 0 : _z.email) || ''
        });
        r.awaiting_cut = Number(r.awaiting_cut || 0) + qty;
    }
    function rec(sku) {
        s.inserts[sku] = s.inserts[sku] || { awaiting_cut: 0, ready: 0 };
        return s.inserts[sku];
    }
    function ensureInsertPrintHistory() {
        s.insertPrintHistory = s.insertPrintHistory || [];
        return s.insertPrintHistory;
    }
    function addInsertPrintHistory(entry) {
        const history = ensureInsertPrintHistory();
        history.push({
            id: makeId(),
            created_at: new Date().toISOString(),
            created_by: currentForgeUser()?.email || '',
            ...entry
        });
        if (history.length > 1000)
            s.insertPrintHistory = history.slice(-1000);
    }
    function historyForSku(sku) {
        return ensureInsertPrintHistory()
            .filter(x => x.sku === sku)
            .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
            .slice(0, 8);
    }
    function formatHistoryTime(value) {
        try { return new Date(value).toLocaleString(); }
        catch { return String(value || ''); }
    }
    async function sendInsertPrintToPi(sku, qty) {
        const result = await cloudFetch('/insert-print', {
            method: 'POST',
            body: JSON.stringify({ sku, quantity: qty })
        });
        // /print-insert is now asynchronous. HTTP 202 is success even though
        // there is no CUPS job_id yet and printed may still be false.
        if (!result.success || !result.accepted)
            throw new Error(result.error || 'The Pi did not accept the print job.');

        refreshLiveInsertQueue();

        return {
            result,
            accepted: true,
            jobId: String(result.job_id || result.bridge_response?.job_id || result.bridge_response?.id || '')
        };
    }
    function currentProductionNeed(sku) {
        var _r;
        return Math.max(0, Number(((_r = demandSnapshot.bySku[sku]) === null || _r === void 0 ? void 0 : _r.need_to_make) || 0));
    }
    function assembledWaitingForInsert(sku) {
        // Assembled Pals have been manufactured but have not yet consumed
        // their character insert. Packing consumes one Ready Insert per Pal.
        return Math.max(0, Number((s.assembled || {})[sku] || 0));
    }
    function normalInsertPipelineDemand(sku) {
        // Inserts are required for:
        //   1. Pals already assembled and waiting to be packed, and
        //   2. Pals that still need to be manufactured.
        //
        // Awaiting Dispatch / in-transit Pals are intentionally NOT included:
        // their insert was already consumed during Packing Station completion.
        return assembledWaitingForInsert(sku) + currentProductionNeed(sku);
    }
    function factoryBufferRequirement(sku) {
        const cfg = forgeInsertProductionSettings;
        const buffer = Math.max(0, Number(cfg.buffer_target || 0));
        const reorder = Math.max(0, Number(cfg.reorder_level || 0));
        if (buffer <= 0)
            return 0;
        const r = rec(sku);
        const ready = Math.max(0, Number(r.ready || 0));
        const awaiting = Math.max(0, Number(r.awaiting_cut || 0));
        // Replenish the buffer only when usable/WIP insert stock has fallen
        // below the configured reorder point.
        return (ready + awaiting) < reorder ? buffer : 0;
    }
    function insertDemandBreakdown(sku) {
        var _r, _s;
        const r = rec(sku);
        const assembledNeed = assembledWaitingForInsert(sku);
        const manufacturingNeed = currentProductionNeed(sku);
        const bufferNeed = factoryBufferRequirement(sku);
        const damageNeed = Number(((_r = s.damageInsertDemand) === null || _r === void 0 ? void 0 : _r[sku]) || 0);
        const cornwallNeed = Number(((_s = s.cornwallInsertReplenishment) === null || _s === void 0 ? void 0 : _s[sku]) || 0);
        const ready = Math.max(0, Number(r.ready || 0));
        const awaiting = Math.max(0, Number(r.awaiting_cut || 0));
        const required = assembledNeed + manufacturingNeed + bufferNeed + damageNeed + cornwallNeed;
        const need = Math.max(0, required - ready - awaiting);
        return {
            assembledNeed,
            manufacturingNeed,
            bufferNeed,
            damageNeed,
            cornwallNeed,
            ready,
            awaiting,
            required,
            need
        };
    }
    function needPrint(sku) {
        return insertDemandBreakdown(sku).need;
    }
    function renderPrintHistoryRows(sku) {
        const rows = historyForSku(sku);
        if (!rows.length)
            return '<div class="insert-history-empty">No print history yet.</div>';
        return rows.map(h => {
            const modeLabel = h.mode === 'extra' ? 'Extra' : h.mode === 'reprint' ? 'Reprint' : h.mode === 'failed' ? 'Failed' : 'Production';
            const cls = h.mode === 'failed' ? 'danger' : h.mode === 'extra' ? 'info' : 'ok';
            return `<div class="insert-history-row"><div><strong>${esc(modeLabel)} ×${Number(h.quantity || 0)}</strong><span class="badge ${cls}">${esc(String(h.status || 'recorded').toUpperCase())}</span></div><div class="small">${h.job_id ? `CUPS ${esc(h.job_id)}` : 'Manual record'} · ${esc(formatHistoryTime(h.created_at))}</div></div>`;
        }).join('');
    }
    function renderPrintCard(x) {
        var _a;
        const d = insertDemandBreakdown(x.p.sku);
        const reasons = [];
        if (d.assembledNeed > 0) reasons.push(`${d.assembledNeed} assembled waiting to pack`);
        if (d.manufacturingNeed > 0) reasons.push(`${d.manufacturingNeed} still to manufacture`);
        if (d.bufferNeed > 0) reasons.push(`${d.bufferNeed} factory buffer target`);
        if (d.damageNeed > 0) reasons.push(`${d.damageNeed} rework`);
        if (d.cornwallNeed > 0) reasons.push(`${d.cornwallNeed} Cornwall spare`);
        return `<div class="insert-job-card print-job">
     <div class="assembly-card-head">
       <div><strong>${esc(x.p.name)}</strong><div class="sku">${x.p.sku}</div></div>
       ${Number(((_a = s.cornwallInsertReplenishment) === null || _a === void 0 ? void 0 : _a[x.p.sku]) || 0) > 0 ? badge(`CORNWALL +${Number(s.cornwallInsertReplenishment[x.p.sku] || 0)}`, 'info') : x.r.ready < 4 ? badge('URGENT', 'danger') : badge(`PRINT ${x.need}`, 'warning')}
     </div>
     <div class="insert-job-stats">
       <div><span>Ready</span><strong>${d.ready}</strong></div>
       <div><span>In Cut & Score</span><strong>${d.awaiting}</strong></div>
       <div><span>Need Print</span><strong class="accent">${x.need}</strong></div>
     </div>
     <div class="insert-demand-reason">${reasons.length ? `Required for: ${reasons.map(esc).join(' · ')}` : 'No outstanding pipeline demand.'}</div>
     <div class="insert-file-name">${x.file ? 'Artwork mapped · Pi fetches latest PDF from Google Drive' : 'Pi will resolve artwork by SKU from Google Drive'}</div>
     <div class="insert-action-row insert-pi-action-row">
       <label class="compact-label"><span>Qty to Print</span><input class="number printedQty" id="printed-${x.p.sku}" type="number" min="1" max="${Math.max(1, x.need)}" value="${Math.max(1, x.need || 1)}"></label>
       <button class="btn printViaPi" data-sku="${x.p.sku}">Print via Pi</button>
       
       <button class="btn ghost markPrinted" data-sku="${x.p.sku}">Mark Printed Manually</button>
       ${x.file ? `<a class="btn ghost" href="${esc(x.file.view_url)}" target="_blank" rel="noopener">Open PDF</a>` : ''}
     </div>
   </div>`;
    }
    function renderCutCard(x) {
        const awaiting = Number(x.r.awaiting_cut || 0);
        return `<div class="insert-job-card cut-job">
     <div class="assembly-card-head">
       <div><strong>${esc(x.p.name)}</strong><div class="sku">${x.p.sku}</div></div>
       ${badge(`${awaiting} WAITING`, 'warning')}
     </div>
     <div class="cut-score-hero">
       <div class="cut-score-number">${awaiting}</div>
       <div><strong>Printed Insert${awaiting === 1 ? '' : 's'}</strong><div class="small">ready to cut and score</div></div>
     </div>
     <div class="insert-action-row">
       <label class="compact-label"><span>Qty Completed</span><input class="number cutQty" id="cut-${x.p.sku}" type="number" min="1" max="${awaiting}" value="${awaiting}"></label>
       <button class="btn completeCut" data-sku="${x.p.sku}">Cut & Score Complete</button>
     </div>
   </div>`;
    }
    function closeInsertModal(modal) {
        if (!modal) return;
        modal.classList.remove('open');
        modal.setAttribute('aria-hidden', 'true');
    }

    function openInsertModal(modal) {
        if (!modal) return;
        modal.classList.add('open');
        modal.setAttribute('aria-hidden', 'false');
    }

    function palOptionRows({ onlyAwaiting = false } = {}) {
        return pals
            .map(p => {
                const r = rec(p.sku);
                const awaiting = Number(r.awaiting_cut || 0);
                if (onlyAwaiting && awaiting <= 0)
                    return null;
                return {
                    p,
                    awaiting,
                    ready: Number(r.ready || 0),
                    need: needPrint(p.sku)
                };
            })
            .filter(Boolean)
            .sort((a, b) => a.p.name.localeCompare(b.p.name));
    }

    function populateExtrasModal() {
        const select = document.querySelector('#extrasPalSelect');
        const qty = document.querySelector('#extrasQty');
        const summary = document.querySelector('#extrasSummary');
        if (!select || !qty || !summary) return;

        const rows = palOptionRows();
        select.innerHTML = rows.map(x =>
            `<option value="${esc(x.p.sku)}">${esc(x.p.name)} · ${x.p.sku}</option>`
        ).join('');

        function update() {
            const sku = select.value;
            const p = pals.find(x => x.sku === sku);
            const r = rec(sku);
            const need = needPrint(sku);
            summary.innerHTML = p ? `
              <div><span>Pal</span><strong>${esc(p.name)}</strong></div>
              <div><span>Need Print</span><strong>${need}</strong></div>
              <div><span>Cut & Score</span><strong>${Number(r.awaiting_cut || 0)}</strong></div>
              <div><span>Ready</span><strong>${Number(r.ready || 0)}</strong></div>
            ` : '';
        }

        select.onchange = update;
        qty.value = 1;
        update();
    }

    function populateFailedModal() {
        const select = document.querySelector('#failedPalSelect');
        const qty = document.querySelector('#failedModalQty');
        const summary = document.querySelector('#failedSummary');
        const submitWaste = document.querySelector('#failedWasteBtn');
        const submitReprint = document.querySelector('#failedReprintBtn');
        if (!select || !qty || !summary) return;

        const rows = palOptionRows({ onlyAwaiting: true });
        select.innerHTML = rows.length
            ? rows.map(x => `<option value="${esc(x.p.sku)}">${esc(x.p.name)} · ${x.p.sku} · ${x.awaiting} waiting</option>`).join('')
            : '<option value="">No inserts currently in Cut & Score</option>';

        function update() {
            const sku = select.value;
            const p = pals.find(x => x.sku === sku);
            const r = sku ? rec(sku) : { awaiting_cut: 0, ready: 0 };
            const awaiting = Number(r.awaiting_cut || 0);

            qty.max = Math.max(1, awaiting);
            qty.value = awaiting > 0 ? 1 : 0;

            summary.innerHTML = p ? `
              <div><span>Pal</span><strong>${esc(p.name)}</strong></div>
              <div><span>In Cut & Score</span><strong>${awaiting}</strong></div>
              <div><span>Ready</span><strong>${Number(r.ready || 0)}</strong></div>
              <div><span>Action</span><strong>Choose below</strong></div>
            ` : '<div class="bench-empty">Nothing is currently waiting in Cut & Score.</div>';

            if (submitWaste) submitWaste.disabled = awaiting <= 0;
            if (submitReprint) submitReprint.disabled = awaiting <= 0;
        }

        select.onchange = update;
        update();
    }

    async function printExtraFromModal() {
        const select = document.querySelector('#extrasPalSelect');
        const qtyEl = document.querySelector('#extrasQty');
        const submit = document.querySelector('#extrasPrintBtn');

        const sku = String(select?.value || '');
        const p = pals.find(x => x.sku === sku);
        const qty = Math.max(1, Math.min(100, Number(qtyEl?.value || 1)));
        if (!sku || !p) return;

        const cardStock = Number(s.consumables?.card_210gsm?.stock || 0);
        if (cardStock < qty) {
            alert(`Not enough 210gsm Card. Need ${qty}, only ${cardStock} available.`);
            return;
        }

        const original = submit.textContent;
        submit.disabled = true;
        submit.textContent = 'Sending to Pi…';

        try {
            const printed = await sendInsertPrintToPi(sku, qty);
            const before = JSON.parse(JSON.stringify(s));

            try {
                await recordPrintedInsert(sku, qty, 'Pi extra insert print');
                addInsertPrintHistory({
                    sku,
                    quantity: qty,
                    mode: 'extra',
                    status: 'submitted',
                    job_id: printed.jobId
                });
                await save(s);
            }
            catch (saveError) {
                s = before;
                throw new Error(`Extra job printed, but Forge could not record it. ${saveError.message || saveError}`);
            }

            closeInsertModal(extrasModal);
            render();
        }
        catch (e) {
            alert('Extra insert print failed: ' + (e.message || e));
        }
        finally {
            submit.disabled = false;
            submit.textContent = original;
        }
    }

    async function processFailedFromModal(reprint) {
        const select = document.querySelector('#failedPalSelect');
        const qtyEl = document.querySelector('#failedModalQty');
        const button = document.querySelector(reprint ? '#failedReprintBtn' : '#failedWasteBtn');

        const sku = String(select?.value || '');
        const r = sku ? rec(sku) : null;
        const available = Number(r?.awaiting_cut || 0);
        const qty = Math.max(1, Math.min(available, Number(qtyEl?.value || 1)));

        if (!sku || !r || available <= 0)
            return;

        if (reprint) {
            const cardStock = Number(s.consumables?.card_210gsm?.stock || 0);
            if (cardStock < qty) {
                alert(`Not enough 210gsm Card for replacement. Need ${qty}, only ${cardStock} available.`);
                return;
            }
        }

        const original = button.textContent;
        button.disabled = true;
        button.textContent = reprint ? 'Reprinting…' : 'Recording…';

        const before = JSON.parse(JSON.stringify(s));

        try {
            r.awaiting_cut = Math.max(0, available - qty);
            addInsertPrintHistory({
                sku,
                quantity: qty,
                mode: 'failed',
                status: 'waste',
                job_id: ''
            });

            if (reprint) {
                const printed = await sendInsertPrintToPi(sku, qty);
                await recordPrintedInsert(sku, qty, 'Pi replacement insert print');
                addInsertPrintHistory({
                    sku,
                    quantity: qty,
                    mode: 'reprint',
                    status: 'submitted',
                    job_id: printed.jobId
                });
            }

            await save(s);
            closeInsertModal(failedModal);
            render();
        }
        catch (e) {
            s = before;
            render();
            alert((reprint ? 'Replacement print failed: ' : 'Failed print could not be recorded: ') + (e.message || e));
        }
        finally {
            button.disabled = false;
            button.textContent = original;
        }
    }

    function render() {
        const text = (q.value || '').toLowerCase();
        const data = pals.map(p => ({ p, r: rec(p.sku), need: needPrint(p.sku), file: files[p.sku] || null }))
            .filter(x => `${x.p.name} ${x.p.sku}`.toLowerCase().includes(text));
        const printJobs = data.filter(x => x.need > 0)
            .sort((a, b) => (a.r.ready < 4 ? -1 : 0) - (b.r.ready < 4 ? -1 : 0) || b.need - a.need || a.p.name.localeCompare(b.p.name));
        const cutJobs = data.filter(x => Number(x.r.awaiting_cut || 0) > 0)
            .sort((a, b) => Number(b.r.awaiting_cut || 0) - Number(a.r.awaiting_cut || 0) || a.p.name.localeCompare(b.p.name));
        readyKpi.textContent = data.reduce((a, x) => a + Number(x.r.ready || 0), 0);
        cutKpi.textContent = data.reduce((a, x) => a + Number(x.r.awaiting_cut || 0), 0);
        printKpi.textContent = data.reduce((a, x) => a + x.need, 0);
        urgentKpi.textContent = data.filter(x => {
            const reorder = Math.max(0, Number(forgeInsertProductionSettings.reorder_level || 0));
            if (reorder <= 0)
                return false;
            return Number(x.r.ready || 0) + Number(x.r.awaiting_cut || 0) < reorder;
        }).length;
        if (printQueueCount)
            printQueueCount.textContent = `${printJobs.length} Job${printJobs.length === 1 ? '' : 's'}`;
        if (cutQueueCount)
            cutQueueCount.textContent = `${cutJobs.length} Job${cutJobs.length === 1 ? '' : 's'}`;
        printCards.innerHTML = printJobs.length
            ? printJobs.map(renderPrintCard).join('')
            : '<div class="bench-empty">Nothing currently needs printing.</div>';
        cutCards.innerHTML = cutJobs.length
            ? cutJobs.map(renderCutCard).join('')
            : '<div class="bench-empty">Nothing is waiting for Cut & Score.</div>';
        const inventoryText = ((inventorySearch === null || inventorySearch === void 0 ? void 0 : inventorySearch.value) || '').toLowerCase();
        const inventoryRows = data
            .filter(x => `${x.p.name} ${x.p.sku}`.toLowerCase().includes(inventoryText))
            .sort((a, b) => a.p.name.localeCompare(b.p.name));
        inventory.innerHTML = inventoryRows
            .map(x => `<tr>
       <td><strong>${esc(x.p.name)}</strong><br><span class="sku">${x.p.sku}</span></td>
       <td><strong>${Number(x.r.ready || 0)}</strong></td>
     </tr>`).join('') || '<tr><td colspan="2">No matching On Sale Pals.</td></tr>';
        document.querySelectorAll('.printViaPi').forEach(btn => btn.onclick = async () => {
            const sku = btn.dataset.sku;
            const qty = Math.max(1, Math.min(needPrint(sku), Number(document.querySelector('#printed-' + sku)?.value || 1)));
            if (qty <= 0) return;
            const cardStock = Number(s.consumables?.card_210gsm?.stock || 0);
            if (cardStock < qty) return alert(`Not enough 210gsm Card. Need ${qty}, only ${cardStock} available.`);
            const originalText = btn.textContent;
            btn.disabled = true; btn.textContent = 'Sending to Pi…';
            try {
                const printed = await sendInsertPrintToPi(sku, qty);
                const before = JSON.parse(JSON.stringify(s));
                try {
                    await recordPrintedInsert(sku, qty, 'Pi insert print');
                    addInsertPrintHistory({sku, quantity:qty, mode:'production', status:'submitted', job_id:printed.jobId});
                    await save(s);
                } catch (saveError) {
                    s = before;
                    throw new Error(`The Pi accepted the print job, but Forge could not record it. Do not print again until reconciled. ${saveError.message || saveError}`);
                }
                render();
                refreshLiveInsertQueue();
                refreshInsertPrintBridgeStatus();
            } catch (e) {
                btn.disabled = false; btn.textContent = originalText;
                alert('Insert print failed: ' + (e.message || e));
            }
        });


        document.querySelectorAll('.markPrinted').forEach(btn => btn.onclick = async () => {
            var _x;
            const sku = btn.dataset.sku;
            const qty = Math.max(1, Number(((_x = document.querySelector('#printed-' + sku)) === null || _x === void 0 ? void 0 : _x.value) || 1));
            const before = JSON.parse(JSON.stringify(s));
            btn.disabled = true;
            btn.textContent = 'Saving…';
            try {
                await cloudFetch(`/consumables/${encodeURIComponent('card_210gsm')}/adjust`, {
                    method: 'POST',
                    body: JSON.stringify({
                        change: -qty,
                        type: 'manual_insert_print',
                        reason: `Manual insert print · ${sku}`
                    })
                });
                await recordPrintedInsert(sku, qty, 'Manual insert print');
                addInsertPrintHistory({sku, quantity:qty, mode:'production', status:'manual', job_id:''});
                await save(s);
                render();
            }
            catch (e) {
                s = before;
                render();
                alert(e.message || 'Printed inserts could not be saved to Cloudflare.');
            }
        });
        document.querySelectorAll('.completeCut').forEach(btn => btn.onclick = async () => {
            var _a, _b, _c, _d;
            const sku = btn.dataset.sku, r = rec(sku);
            const available = Number(r.awaiting_cut || 0);
            const qty = Math.max(1, Math.min(available, Number(((_a = document.querySelector('#cut-' + sku)) === null || _a === void 0 ? void 0 : _a.value) || 1)));
            if (available <= 0)
                return;
            const before = JSON.parse(JSON.stringify(s));
            r.awaiting_cut = available - qty;
            let remaining = qty;
            // First satisfy full-factory damage replacement insert demand.
            const damageNeed = Number(((_b = s.damageInsertDemand) === null || _b === void 0 ? void 0 : _b[sku]) || 0);
            const damageUsed = Math.min(remaining, damageNeed);
            if (damageUsed > 0) {
                r.ready = Number(r.ready || 0) + damageUsed;
                s.damageInsertDemand[sku] = Math.max(0, damageNeed - damageUsed);
                remaining -= damageUsed;
            }
            // Then route Cornwall spare replenishment directly into Dispatch.
            const cornwallNeed = Number(((_c = s.cornwallInsertReplenishment) === null || _c === void 0 ? void 0 : _c[sku]) || 0);
            const cornwallUsed = Math.min(remaining, cornwallNeed);
            if (cornwallUsed > 0) {
                const p = pals.find(x => x.sku === sku);
                const now = new Date().toISOString();
                s.awaitingDispatch = s.awaitingDispatch || [];
                s.awaitingDispatch.push({
                    id: makeId(),
                    item_type: 'cornwall_insert_spare',
                    sku,
                    name: (p === null || p === void 0 ? void 0 : p.name) || sku,
                    qty: cornwallUsed,
                    status: 'awaiting_dispatch',
                    packed_at: now,
                    locked_destination: 'cornwall',
                    supply_label: 'Cornwall Spare Insert',
                    created_by: ((_d = currentForgeUser()) === null || _d === void 0 ? void 0 : _d.email) || ''
                });
                s.cornwallInsertReplenishment[sku] = Math.max(0, cornwallNeed - cornwallUsed);
                remaining -= cornwallUsed;
            }
            // Any normal insert production becomes factory Ready Insert stock.
            if (remaining > 0)
                r.ready = Number(r.ready || 0) + remaining;
            btn.disabled = true;
            btn.textContent = 'Saving…';
            try {
                await save(s);
                render();
            }
            catch (e) {
                s = before;
                render();
                alert('Cut & Score completion could not be saved to Cloudflare. Insert stock has been rolled back.');
            }
        });
    }
    if (extrasBtn) extrasBtn.onclick = () => {
        populateExtrasModal();
        openInsertModal(extrasModal);
    };
    if (failedBtn) failedBtn.onclick = () => {
        populateFailedModal();
        openInsertModal(failedModal);
    };

    document.querySelectorAll('[data-close-insert-modal]').forEach(btn => {
        btn.onclick = () => closeInsertModal(btn.closest('.forge-modal'));
    });

    const extrasPrintBtn = document.querySelector('#extrasPrintBtn');
    if (extrasPrintBtn) extrasPrintBtn.onclick = printExtraFromModal;

    const failedWasteBtn = document.querySelector('#failedWasteBtn');
    if (failedWasteBtn) failedWasteBtn.onclick = () => processFailedFromModal(false);

    const failedReprintBtn = document.querySelector('#failedReprintBtn');
    if (failedReprintBtn) failedReprintBtn.onclick = () => processFailedFromModal(true);

    q.oninput = render;
    if (inventorySearch)
        inventorySearch.oninput = render;
    try {
        await Promise.all([refreshInsertDemand(), refreshForgeInsertProductionSettings()]);
        ensureCornwallInsertReplenishment(s, ps);
        render();
        setForgeCloudSync('synced', 'Insert demand synced');
    }
    catch (e) {
        showCloudRequiredError(e.message);
        setForgeCloudSync('error', e.message);
        return;
    }
    refreshInsertPrintBridgeStatus();
    startLiveInsertQueue();
    await startForgeLiveSync(async (fresh) => {
        s = JSON.parse(JSON.stringify(fresh));
        await refreshInsertDemand();
        ensureCornwallInsertReplenishment(s, ps);
        render();
    });
}
async function dashboard() {
    installForgeCloudSyncBadge();
    try {
        if (!forgeProductionCloudReady)
            await hydrateProductionCloud();
    }
    catch (e) {
        showCloudRequiredError(e.message);
        return;
    }
    const s = cloudOperationalState();
    let ps, rs, mm, filamentData;
    try {
        [ps, rs, mm, filamentData] = await Promise.all([
            load('products'),
            load('recipes'),
            load('mismatches'),
            cloudFetch('/filaments').catch(() => ({ filaments: [], history: [] }))
        ]);
    }
    catch (e) {
        showCloudRequiredError(e.message);
        return;
    }
    const pals = (ps || []).filter(x => x.type === 'pal' && x.active !== false);
    let dashboardDemandSnapshot = { bySku: {} };
    try {
        dashboardDemandSnapshot = await loadPalDemandSnapshot(s, ps);
    }
    catch (e) {
        dashboardDemandSnapshot = { bySku: {} };
    }
    function dashboardLiveNeed(sku) {
        var _k;
        return Number(((_k = dashboardDemandSnapshot.bySku[sku]) === null || _k === void 0 ? void 0 : _k.need_to_make) || 0);
    }
    const palBySku = Object.fromEntries(pals.map(p => [p.sku, p]));
    const recipesBySku = {};
    (rs || []).forEach(r => {
        if (!recipesBySku[r.sku])
            recipesBySku[r.sku] = [];
        recipesBySku[r.sku].push(r);
    });
    const num = v => Number(v || 0);
    const sumObj = o => Object.values(o || {}).reduce((a, b) => a + num(b), 0);
    const sumRows = (rows, fn) => (rows || []).reduce((a, x) => a + num(fn(x)), 0);
    function palName(sku, fallback = '') {
        return (palBySku[sku] && palBySku[sku].name) || fallback || sku || 'Unknown Pal';
    }
    function remainingPalDemand(sku) {
        return dashboardLiveNeed(sku);
    }
    function groupedRecipeRows(sku) {
        return (recipesBySku[sku] || []).map(r => {
            const key = groupKey(r);
            const need = remainingPalDemand(sku);
            const printed = partQty(s, key);
            const onPlate = activePlateQty(s, key);
            return {
                colour: String(r.filament || '').trim() || 'Unspecified',
                parts: r.parts || 'Grouped set',
                weight: num(r.weight_g),
                need,
                printed,
                onPlate,
                remaining: Math.max(0, need - printed - onPlate)
            };
        });
    }
    function completedRecipeSets(sku) {
        const rows = groupedRecipeRows(sku);
        if (!rows.length)
            return 0;
        return Math.max(0, Math.min(...rows.map(r => r.printed)));
    }
    const demand = pals.map(p => {
        const need = remainingPalDemand(p.sku);
        const rows = groupedRecipeRows(p.sku);
        const onPlates = rows.length ? Math.min(need, Math.max(...rows.map(x => x.onPlate), 0)) : 0;
        const remaining = rows.length ? Math.max(...rows.map(x => x.remaining), 0) : need;
        return { p, need, onPlates, remaining, rows };
    }).filter(x => x.need > 0)
        .sort((a, b) => b.remaining - a.remaining || b.need - a.need || a.p.name.localeCompare(b.p.name));
    const readyToAssemble = pals.reduce((total, p) => {
        const printable = completedRecipeSets(p.sku);
        const alreadyAssembled = num((s.assembled || {})[p.sku]);
        return total + Math.max(0, printable - alreadyAssembled);
    }, 0);
    const awaitingPacking = sumObj(s.assembled);
    const awaitingDispatch = sumRows((s.awaitingDispatch || []).filter(x => x.status === 'awaiting_dispatch'), x => x.qty);
    const reworkQty = sumRows((s.damageReworkJobs || []).filter(x => x.status === 'awaiting_rework'), x => x.qty || 1);
    const activePrinting = (s.plates || []).filter(p => p.status === 'printing');
    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el)
            el.textContent = value;
    };
    const onSalePals = pals.filter(p => {
        const rec = (s.productAvailability || {})[p.sku] || {};
        return rec.on_sale === true;
    });
    setText('dashTotalPals', onSalePals.length);
    setText('dashPrinting', activePrinting.length);
    setText('dashAssembly', readyToAssemble);
    setText('dashPacking', awaitingPacking);
    setText('dashDispatch', awaitingDispatch);
    setText('dashRework', reworkQty);
    const totalPalsToPrint = demand.reduce((a, x) => a + x.remaining, 0);
    setText('dashPalsToPrint', totalPalsToPrint);
    setText('dashPalTypes', `${demand.filter(x => x.remaining > 0).length} product${demand.filter(x => x.remaining > 0).length === 1 ? '' : 's'}`);
    // ---------------------------------------------------------------
    // Pals to Print
    // ---------------------------------------------------------------
    const palHost = document.getElementById('dashPalDemand');
    if (palHost) {
        palHost.innerHTML = demand.length ? demand.slice(0, 16).map((x, idx) => {
            const priority = x.remaining >= 5 ? ['Urgent', 'danger'] : x.remaining >= 3 ? ['High', 'warning'] : ['Normal', 'info'];
            const recipeSummary = x.rows.filter(r => r.remaining > 0)
                .map(r => `<span>${esc(r.colour)} · ${r.remaining} set${r.remaining === 1 ? '' : 's'}</span>`).join('');
            return `<article class="pal-demand-row">
              <div class="pal-demand-main">
                <div class="pal-demand-rank">${idx + 1}</div>
                <div class="pal-demand-name">
                  <strong>${esc(x.p.name)}</strong>
                  <span class="sku">${esc(x.p.sku)}</span>
                </div>
                <div class="pal-demand-stat"><span>Total Need</span><strong>${x.need}</strong></div>
                <div class="pal-demand-stat"><span>On Plates</span><strong>${x.onPlates}</strong></div>
                <div class="pal-demand-stat pal-demand-remaining"><span>Still to Print</span><strong>${x.remaining}</strong></div>
                <div>${badge(priority[0], priority[1])}</div>
              </div>
              ${recipeSummary
                ? `<div class="pal-demand-recipes">${recipeSummary}</div>`
                : `<div class="pal-demand-recipes"><span>No complete recipe data found</span></div>`}
            </article>`;
        }).join('') : `<div class="dashboard-clear-state"><strong>Everything is covered.</strong><span>No Pals currently need printing against production targets.</span></div>`;
    }
    // ---------------------------------------------------------------
    // Colour demand
    // ---------------------------------------------------------------
    const colourMap = {};
    (rs || []).forEach(r => {
        if (!palBySku[r.sku])
            return;
        const key = groupKey(r);
        const remain = Math.max(0, remainingPalDemand(r.sku) - partQty(s, key) - activePlateQty(s, key));
        if (!remain)
            return;
        const colour = String(r.filament || '').trim() || 'Unspecified';
        if (!colourMap[colour])
            colourMap[colour] = { colour, sets: 0, grams: 0, pals: new Set() };
        colourMap[colour].sets += remain;
        colourMap[colour].grams += remain * num(r.weight_g);
        colourMap[colour].pals.add(r.sku);
    });
    const colours = Object.values(colourMap)
        .map(x => (Object.assign(Object.assign({}, x), { palCount: x.pals.size })))
        .sort((a, b) => b.sets - a.sets || b.grams - a.grams);
    const colourHost = document.getElementById('dashColourDemand');
    if (colourHost) {
        colourHost.innerHTML = colours.length ? colours.slice(0, 8).map((x, idx) => `
          <a href="plates.html" class="dashboard-colour-row ${idx === 0 ? 'urgent-colour' : ''}">
            <div><strong>${esc(x.colour)}</strong><span>${x.palCount} Pal${x.palCount === 1 ? '' : 's'}</span></div>
            <div><strong>${x.sets}</strong><span>sets</span></div>
            <div><strong>${x.grams.toFixed(1)}g</strong><span>estimated</span></div>
          </a>`).join('') : `<div class="dashboard-clear-state"><strong>No print demand.</strong><span>There are no outstanding colour groups.</span></div>`;
    }
    // ---------------------------------------------------------------
    // Active printers / plates
    // ---------------------------------------------------------------
    const printerHost = document.getElementById('dashActivePrinters');
    if (printerHost) {
        const printers = (s.printers || []).filter(p => p.active !== false);
        const printerRows = printers.map(printer => {
            const plates = activePrinting.filter(p => p.printer === printer.id);
            return { printer, plates };
        });
        const unassigned = activePrinting.filter(p => !p.printer || !printers.some(x => x.id === p.printer));
        printerHost.innerHTML =
            printerRows.map(x => `<div class="active-printer-row">
            <div class="printer-state-dot ${x.plates.length ? 'running' : 'idle'}"></div>
            <div class="active-printer-name"><strong>${esc(x.printer.name)}</strong><span>${esc(x.printer.model || '3D Printer')}</span></div>
            <div class="active-printer-job">${x.plates.length
                ? x.plates.map(p => `<a href="plates.html">${esc(p.code || p.name || p.id)} · ${esc(p.colour || '')}</a>`).join('')
                : '<span>Idle</span>'}</div>
          </div>`).join('') +
                (unassigned.length ? `<div class="active-printer-row"><div class="printer-state-dot running"></div><div class="active-printer-name"><strong>Unassigned</strong><span>Active plate</span></div><div class="active-printer-job">${unassigned.map(p => esc(p.code || p.name || p.id)).join(', ')}</div></div>` : '') ||
                `<div class="dashboard-clear-state"><strong>No 3D printers configured.</strong><span>Add printers in Settings → 3D Printers.</span></div>`;
    }
    // ---------------------------------------------------------------
    // Stock health
    // ---------------------------------------------------------------
    const filamentRows = (filamentData && filamentData.filaments) || [];
    const lowFilament = filamentRows.filter(f => { var _f, _g; return num((_f = f.grams_in_stock) !== null && _f !== void 0 ? _f : f.stock_g) <= num((_g = f.reorder_level_g) !== null && _g !== void 0 ? _g : f.reorder_g); })
        .sort((a, b) => { var _f, _g; return num((_f = a.grams_in_stock) !== null && _f !== void 0 ? _f : a.stock_g) - num((_g = b.grams_in_stock) !== null && _g !== void 0 ? _g : b.stock_g); });
    const lowFilHost = document.getElementById('dashLowFilament');
    if (lowFilHost) {
        lowFilHost.innerHTML = lowFilament.length ? lowFilament.slice(0, 6).map(f => {
            var _f, _g;
            const stock = num((_f = f.grams_in_stock) !== null && _f !== void 0 ? _f : f.stock_g);
            const reorder = num((_g = f.reorder_level_g) !== null && _g !== void 0 ? _g : f.reorder_g);
            return `<a href="filament.html" class="health-row">
              <div><strong>${esc(f.name)}</strong><span>${esc(f.material || 'PLA')} · ${esc(f.colour || f.name)}</span></div>
              <div class="health-value ${stock <= 0 ? 'danger-text' : 'warning-text'}">${Math.round(stock)}g</div>
              <small>reorder ${Math.round(reorder)}g</small>
            </a>`;
        }).join('') : `<div class="dashboard-clear-state"><strong>Filament healthy.</strong><span>No filament is at or below its reorder level.</span></div>`;
    }
    const lowConsumables = Object.entries(s.consumables || {})
        .map(([key, c]) => (Object.assign(Object.assign({ key }, c), { stock: num(c.stock), reorder: num(c.reorder) })))
        .filter(c => c.reorder > 0 && c.stock <= c.reorder)
        .sort((a, b) => a.stock - b.stock);
    const lowConHost = document.getElementById('dashLowConsumables');
    if (lowConHost) {
        lowConHost.innerHTML = lowConsumables.length ? lowConsumables.slice(0, 6).map(c => `
          <a href="consumables.html" class="health-row">
            <div><strong>${esc(c.name || c.key)}</strong><span>${esc(c.unit || 'units')}</span></div>
            <div class="health-value ${c.stock <= 0 ? 'danger-text' : 'warning-text'}">${c.stock}</div>
            <small>reorder ${c.reorder}</small>
          </a>`).join('') : `<div class="dashboard-clear-state"><strong>Consumables healthy.</strong><span>No consumable is at or below its reorder level.</span></div>`;
    }
    const shortages = pals.map(p => {
        const d = dashboardDemandSnapshot.bySku[p.sku] || {};
        return {
            p,
            boatTarget: Number(d.boat_target || 0),
            cornwallTarget: Number(d.cornwall_target || 0),
            boatStock: Number(d.boat_stock || 0),
            cornwallStock: Number(d.cornwall_stock || 0),
            short: Number(d.gross_need || 0)
        };
    }).filter(x => x.short > 0).sort((a, b) => b.short - a.short);
    const lowFinishedHost = document.getElementById('dashLowFinished');
    if (lowFinishedHost) {
        lowFinishedHost.innerHTML = shortages.length ? shortages.slice(0, 6).map(x => `
          <a href="pals.html" class="health-row">
            <div><strong>${esc(x.p.name)}</strong><span>${esc(x.p.sku)} · Boat ${x.boatStock}/${x.boatTarget} · Cornwall ${x.cornwallStock}/${x.cornwallTarget}</span></div>
            <div class="health-value danger-text">−${x.short}</div>
            <small>short</small>
          </a>`).join('') : `<div class="dashboard-clear-state"><strong>Finished stock covered.</strong><span>All Pal targets are currently met.</span></div>`;
    }
    // ---------------------------------------------------------------
    // Workflow pipeline
    // ---------------------------------------------------------------
    const printedParts = sumObj(s.parts);
    setText('workflowParts', printedParts);
    setText('workflowBench', readyToAssemble + awaitingPacking);
    setText('workflowPacking', awaitingPacking);
    setText('workflowDispatch', awaitingDispatch);
    // ---------------------------------------------------------------
    // Alerts / actions
    // ---------------------------------------------------------------
    const alerts = [];
    lowFilament.slice(0, 4).forEach(f => {
        var _f;
        const stockNow = num((_f = f.grams_in_stock) !== null && _f !== void 0 ? _f : f.stock_g);
        alerts.push({
            level: stockNow <= 0 ? 'danger' : 'warning',
            title: `Low filament: ${f.name}`,
            text: `${Math.round(stockNow)}g remaining`,
            href: 'filament.html'
        });
    });
    lowConsumables.slice(0, 4).forEach(c => {
        alerts.push({
            level: c.stock <= 0 ? 'danger' : 'warning',
            title: `Low consumable: ${c.name || c.key}`,
            text: `${c.stock} ${c.unit || 'units'} remaining`,
            href: 'consumables.html'
        });
    });
    const failedCount = Array.isArray(s.failedParts) ? s.failedParts.length : sumObj(s.failedParts);
    if (failedCount > 0) {
        alerts.push({ level: 'danger', title: 'Failed prints', text: `${failedCount} failed print record${failedCount === 1 ? '' : 's'} need attention`, href: 'parts.html' });
    }
    const offSale = pals.filter(p => {
        const a = (s.productAvailability || {})[p.sku];
        return a && a.status === 'off';
    });
    if (offSale.length) {
        alerts.push({ level: 'info', title: 'Products off sale', text: `${offSale.length} Pal${offSale.length === 1 ? ' is' : 's are'} currently excluded from production`, href: 'settings-availability.html' });
    }
    const missingRecipes = pals.filter(x => !x.recipe_ready);
    if (missingRecipes.length) {
        alerts.push({ level: 'warning', title: 'Missing recipes', text: `${missingRecipes.length} Pal${missingRecipes.length === 1 ? '' : 's'} still need recipe data`, href: 'recipes.html' });
    }
    if ((mm || []).length) {
        alerts.push({ level: 'danger', title: 'Data Health', text: `${mm.length} SKU mismatch${mm.length === 1 ? '' : 'es'} detected`, href: 'data-health.html' });
    }
    if (reworkQty > 0) {
        alerts.push({ level: 'warning', title: 'Rework waiting', text: `${reworkQty} item${reworkQty === 1 ? '' : 's'} waiting for repair`, href: 'rework.html' });
    }
    const alertHost = document.getElementById('dashAlerts');
    if (alertHost) {
        alertHost.innerHTML = alerts.length ? alerts.slice(0, 12).map(a => `
          <a href="${a.href}" class="dashboard-alert">
            <span>${badge(a.level === 'danger' ? 'Action' : a.level === 'warning' ? 'Check' : 'Info', a.level)}</span>
            <div><strong>${esc(a.title)}</strong><div class="small">${esc(a.text)}</div></div>
            <span class="dashboard-alert-arrow">→</span>
          </a>`).join('') : `<div class="dashboard-clear-state"><strong>No blockers detected.</strong><span>Production is clear to keep moving.</span></div>`;
    }
    const dataHealth = document.getElementById('dashDataHealth');
    if (dataHealth) {
        dataHealth.innerHTML = `<a href="data-health.html" class="dashboard-health-link">
          <strong>Data Health</strong>
          <span>${(mm || []).length ? `${mm.length} issue${mm.length === 1 ? '' : 's'} need checking` : 'No SKU mismatches detected'} →</span>
        </a>`;
    }
    // ---------------------------------------------------------------
    // Upcoming Releases
    // ---------------------------------------------------------------
    const todayIso = new Date().toISOString().slice(0, 10);
    const upcomingReleases = pals.map(p => {
        const rec = (s.productAvailability || {})[p.sku] || {};
        const releaseDate = String(rec.release_date || '').trim();
        return {
            p,
            releaseDate,
            onSale: rec.on_sale === true
        };
    }).filter(x => x.releaseDate && x.releaseDate > todayIso && !x.onSale)
        .sort((a, b) => a.releaseDate.localeCompare(b.releaseDate) || a.p.name.localeCompare(b.p.name));
    const upcomingHost = document.getElementById('dashUpcomingReleases');
    if (upcomingHost) {
        function releaseCountdown(dateStr) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const release = new Date(dateStr + 'T00:00:00');
            const days = Math.max(0, Math.ceil((release.getTime() - today.getTime()) / 86400000));
            if (days === 0)
                return 'Today';
            if (days === 1)
                return 'Tomorrow';
            return `${days} days`;
        }
        function releaseDateLabel(dateStr) {
            try {
                return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', {
                    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
                });
            }
            catch (e) {
                return dateStr;
            }
        }
        upcomingHost.innerHTML = upcomingReleases.length
            ? upcomingReleases.slice(0, 12).map((x, idx) => `
              <a href="settings-availability.html" class="upcoming-release-row ${idx === 0 ? 'next-release' : ''}">
                <div class="release-date-block">
                  <strong>${esc(releaseCountdown(x.releaseDate))}</strong>
                  <span>${esc(releaseDateLabel(x.releaseDate))}</span>
                </div>
                <div class="release-pal">
                  <strong>${esc(x.p.name)}</strong>
                  <span class="sku">${esc(x.p.sku)}</span>
                </div>
                <div class="release-status">
                  ${idx === 0 ? badge('NEXT RELEASE', 'warning') : badge('SCHEDULED', 'info')}
                </div>
                <span class="release-arrow">→</span>
              </a>`).join('')
            : `<div class="dashboard-clear-state"><strong>No upcoming releases scheduled.</strong><span>Add a future release date in Product Availability.</span></div>`;
    }
    // ---------------------------------------------------------------
    // Recent activity
    // ---------------------------------------------------------------
    const activity = [];
    const addActivity = (type, title, detail, date, href, icon) => {
        if (!date)
            return;
        const parsed = new Date(date);
        if (Number.isNaN(parsed.getTime()))
            return;
        activity.push({ type, title, detail, date, href, icon, ts: parsed.getTime() });
    };
    (s.printHistory || []).forEach(x => {
        addActivity('print', 'Print completed', `${palName(x.sku, x.product_name || x.name)}${x.qty ? ` · ${num(x.qty)} set${num(x.qty) === 1 ? '' : 's'}` : ''}`, x.completed_at || x.created_at || x.date, 'parts.html', '▱');
    });
    (s.assemblyHistory || []).forEach(x => {
        addActivity('assembly', 'Assembly completed', `${palName(x.sku, x.product_name || x.name)}${x.qty ? ` · ${num(x.qty)}` : ''}`, x.completed_at || x.created_at || x.date, 'assembly.html', '⌁');
    });
    (s.packingHistory || []).forEach(x => {
        addActivity('packing', 'Packing completed', `${palName(x.sku, x.product_name || x.name)}${x.qty ? ` · ${num(x.qty)}` : ''}`, x.completed_at || x.created_at || x.date, 'packing-station.html', '▣');
    });
    (s.transfers || []).forEach(x => {
        addActivity('dispatch', 'Dispatch / transfer', `${palName(x.sku, x.product_name || x.name)}${x.qty ? ` · ${num(x.qty)}` : ''}${x.to ? ` → ${x.to}` : ''}`, x.completed_at || x.dispatched_at || x.created_at || x.date, 'deliveries.html', '⇢');
    });
    (s.reworkHistory || []).forEach(x => {
        addActivity('rework', 'Rework completed', `${palName(x.sku, x.product_name || x.name)}${x.qty ? ` · ${num(x.qty)}` : ''}`, x.completed_at || x.created_at || x.date, 'rework.html', '↻');
    });
    activity.sort((a, b) => b.ts - a.ts);
    const activityHost = document.getElementById('dashRecentActivity');
    if (activityHost) {
        activityHost.innerHTML = activity.length ? activity.slice(0, 12).map(a => `
          <a href="${a.href}" class="activity-row">
            <div class="activity-icon activity-${a.type}">${a.icon}</div>
            <div class="activity-copy"><strong>${esc(a.title)}</strong><span>${esc(a.detail)}</span></div>
            <time>${fmtDate(a.date)}</time>
          </a>`).join('') : `<div class="dashboard-clear-state"><strong>No recent activity yet.</strong><span>Completed prints, assembly, packing and dispatch will appear here.</span></div>`;
    }
    setForgeCloudSync('synced', 'Dashboard live');
}
function isOnSale(s, sku) { var _a, _b; return ((_b = (_a = s.productAvailability) === null || _a === void 0 ? void 0 : _a[sku]) === null || _b === void 0 ? void 0 : _b.on_sale) === true; }
function releaseDateFor(s, sku) { var _a, _b; return ((_b = (_a = s.productAvailability) === null || _a === void 0 ? void 0 : _a[sku]) === null || _b === void 0 ? void 0 : _b.release_date) || ''; }
function stockTargetDefaultsFromSettings(settings) {
    var _m, _o;
    const cfg = (settings === null || settings === void 0 ? void 0 : settings.stock_target_defaults) || {};
    return {
        boat: Math.max(0, Number((_m = cfg.boat) !== null && _m !== void 0 ? _m : 3)),
        cornwall: Math.max(0, Number((_o = cfg.cornwall) !== null && _o !== void 0 ? _o : 3))
    };
}
function palTargetOverrideMap(settings) {
    const cfg = settings === null || settings === void 0 ? void 0 : settings.pal_target_overrides;
    return (cfg && typeof cfg === 'object') ? cfg : {};
}
function pendingCornwallInsertSupply(s, sku) {
    const awaiting = (s.awaitingDispatch || [])
        .filter(x => x.item_type === 'cornwall_insert_spare' && x.sku === sku && x.status === 'awaiting_dispatch')
        .reduce((a, x) => a + Number(x.qty || 0), 0);
    const inTransit = (s.transfers || [])
        .filter(x => x.transfer_type === 'cornwall_insert_spare' && x.sku === sku && x.destination === 'cornwall' && x.status === 'awaiting_delivery')
        .reduce((a, x) => a + Number(x.qty || 0), 0);
    return awaiting + inTransit;
}
function ensureCornwallInsertReplenishment(s, products) {
    s.cornwallInsertReplenishment = s.cornwallInsertReplenishment || {};
    (products || [])
        .filter(p => p.type === 'pal' && isOnSale(s, p.sku))
        .forEach(p => {
        const target = cornwallInsertTarget();
        const stockQty = cornwallInsertStock(s, p.sku);
        const pending = pendingCornwallInsertSupply(s, p.sku);
        s.cornwallInsertReplenishment[p.sku] = Math.max(0, target - stockQty - pending);
    });
}
function inTransitCornwallPalQty(s, sku) {
    return (s.transfers || [])
        .filter(t => t.sku === sku &&
        t.destination === 'cornwall' &&
        t.status === 'awaiting_delivery' &&
        t.transfer_type !== 'cornwall_insert_spare')
        .reduce((a, t) => a + Number(t.qty || 0), 0);
}
async function loadPalDemandSnapshot(s, products) {
    const data = await cloudFetch('/pal-demand');
    const bySku = (data && data.by_sku && typeof data.by_sku === 'object') ? data.by_sku : {};
    return {
        bySku,
        defaults: data.defaults || { boat: 3, cornwall: 3 },
        overrides: data.overrides || {},
        mapped_variants: Number(data.mapped_variants || 0),
        synced_at: data.shopify_synced_at || null,
        operational_updated_at: data.operational_updated_at || null,
        source_of_truth: data.source_of_truth || null
    };
}
function insertProductionSettingsFromSettings(settings) {
    var _r, _s, _t;
    const cfg = (settings === null || settings === void 0 ? void 0 : settings.insert_production_settings) || {};
    return {
        buffer_target: Math.max(0, Math.round(Number((_r = cfg.buffer_target) !== null && _r !== void 0 ? _r : 0))),
        reorder_level: Math.max(0, Math.round(Number((_s = cfg.reorder_level) !== null && _s !== void 0 ? _s : 4))),
        cornwall_target: Math.max(0, Math.round(Number((_t = cfg.cornwall_target) !== null && _t !== void 0 ? _t : 2)))
    };
}
let forgeInsertProductionSettings = { buffer_target: 0, reorder_level: 4, cornwall_target: 2 };
async function refreshForgeInsertProductionSettings() {
    try {
        const data = await cloudFetch('/settings');
        forgeInsertProductionSettings = insertProductionSettingsFromSettings(data.settings || {});
    }
    catch (e) {
        forgeInsertProductionSettings = { buffer_target: 0, reorder_level: 4, cornwall_target: 2 };
    }
    return forgeInsertProductionSettings;
}
async function insertProductionSettingsPage() {
    const badge = document.getElementById('insertProductionSettingsBadge');
    const bufferEl = document.getElementById('factoryInsertBufferTarget');
    const reorderEl = document.getElementById('factoryInsertReorderLevel');
    const cornwallEl = document.getElementById('cornwallInsertSpareTarget');
    const saveBtn = document.getElementById('saveInsertProductionSettings');
    if (!bufferEl || !reorderEl || !cornwallEl || !saveBtn)
        return;
    function setBadge(state, text) {
        if (!badge)
            return;
        badge.className = 'badge ' + (state === 'ok' ? 'success' : state === 'error' ? 'danger' : 'info');
        badge.textContent = text;
    }
    try {
        const data = await cloudFetch('/settings');
        const cfg = insertProductionSettingsFromSettings(data.settings || {});
        bufferEl.value = cfg.buffer_target;
        reorderEl.value = cfg.reorder_level;
        cornwallEl.value = cfg.cornwall_target;
        setBadge('ok', 'Saved');
    }
    catch (e) {
        setBadge('error', 'Load error');
    }
    saveBtn.onclick = async () => {
        const cfg = {
            buffer_target: Math.max(0, Math.round(Number(bufferEl.value || 0))),
            reorder_level: Math.max(0, Math.round(Number(reorderEl.value || 0))),
            cornwall_target: Math.max(0, Math.round(Number(cornwallEl.value || 0)))
        };
        if (cfg.buffer_target > 0 && cfg.reorder_level > cfg.buffer_target) {
            alert('The reorder alert level cannot be higher than the buffer target.');
            return;
        }
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving…';
        setBadge('info', 'Saving…');
        try {
            await cloudFetch('/settings/insert_production_settings', {
                method: 'PUT',
                body: JSON.stringify({ value: cfg })
            });
            forgeInsertProductionSettings = cfg;
            setBadge('ok', 'Saved');
            setForgeCloudSync('synced', 'Insert production settings saved');
        }
        catch (e) {
            setBadge('error', 'Save error');
            alert('Could not save insert production settings: ' + e.message);
        }
        finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Insert Settings';
        }
    };
}
async function stockTargetSettingsPage() {
    const badgeEl = document.getElementById('stockTargetSettingsBadge');
    const boatEl = document.getElementById('defaultBoatTarget');
    const cornwallEl = document.getElementById('defaultCornwallTarget');
    const saveBtn = document.getElementById('saveStockTargetDefaults');
    if (!boatEl || !cornwallEl || !saveBtn)
        return;
    let current = { boat: 3, cornwall: 3 };
    function setBadge(state, text) {
        if (!badgeEl)
            return;
        badgeEl.className = 'badge ' + (state === 'ok' ? 'success' : state === 'error' ? 'danger' : 'info');
        badgeEl.textContent = text;
    }
    try {
        const data = await cloudFetch('/settings');
        current = stockTargetDefaultsFromSettings(data.settings || {});
        boatEl.value = current.boat;
        cornwallEl.value = current.cornwall;
        setBadge('ok', 'Saved');
    }
    catch (e) {
        setBadge('error', 'Load error');
    }
    async function save() {
        const next = {
            boat: Math.max(0, Math.round(Number(boatEl.value || 0))),
            cornwall: Math.max(0, Math.round(Number(cornwallEl.value || 0)))
        };
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving…';
        setBadge('loading', 'Saving…');
        try {
            await cloudFetch('/settings/stock_target_defaults', {
                method: 'PUT',
                body: JSON.stringify({ value: next })
            });
            current = next;
            boatEl.value = current.boat;
            cornwallEl.value = current.cornwall;
            setBadge('ok', 'Saved');
            setForgeCloudSync('synced', 'Stock target defaults saved');
        }
        catch (e) {
            setBadge('error', 'Save error');
            alert('Could not save stock target defaults: ' + e.message);
        }
        finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Default Targets';
        }
    }
    saveBtn.onclick = save;
}
async function inventory(type) {
    installForgeCloudSyncBadge();
    if (!forgeProductionCloudReady) {
        try {
            await hydrateProductionCloud();
        }
        catch (e) {
            showCloudRequiredError(e.message);
            return;
        }
    }
    let s = cloudOperationalState();
    const ps = await load('products');
    let items = ps.filter(x => type === 'sticker' ? x.type === 'sticker' : x.type === 'pal' && (type === 'pal' || x.keyring));
    const tbody = document.querySelector('#rows');
    const q = document.querySelector('#q');
    let shopifyInventory = { inventory: [], mapped_variants: 0, synced_at: null };
    let shopifyBySku = {};
    let targetDefaults = { boat: 3, cornwall: 3 };
    let targetOverrides = {};
    let demandSnapshot = { bySku: {} };
    async function loadTargetSettings() {
        if (type !== 'pal')
            return;
        try {
            const data = await cloudFetch('/settings');
            targetDefaults = stockTargetDefaultsFromSettings(data.settings || {});
            targetOverrides = palTargetOverrideMap(data.settings || {});
        }
        catch (e) {
            targetDefaults = { boat: 3, cornwall: 3 };
            targetOverrides = {};
        }
    }
    function rebuildShopifyIndex() {
        shopifyBySku = {};
        (shopifyInventory.inventory || []).forEach(row => shopifyBySku[row.sku] = row);
    }
    async function refreshShopifyInventory() {
        if (type !== 'pal')
            return;
        const sync = document.querySelector('#palShopifySync');
        if (sync) {
            sync.className = 'badge info';
            sync.textContent = 'Refreshing Shopify…';
        }
        try {
            shopifyInventory = await cloudFetch('/shopify/pal-inventory');
            rebuildShopifyIndex();
            if (sync) {
                sync.className = 'badge success';
                sync.textContent = `Shopify Live · ${Number(shopifyInventory.mapped_variants || 0)} mapped`;
            }
        }
        catch (e) {
            shopifyInventory = { inventory: [], mapped_variants: 0, error: e.message };
            shopifyBySku = {};
            if (sync) {
                sync.className = 'badge danger';
                sync.textContent = 'Shopify Stock Error';
            }
        }
    }
    function shopStock(sku, loc) {
        var _m, _o;
        return Math.max(0, Number(((_o = (_m = shopifyBySku[sku]) === null || _m === void 0 ? void 0 : _m[loc]) === null || _o === void 0 ? void 0 : _o.available) || 0));
    }
    function hasCustomTarget(sku, loc) {
        return (targetOverrides === null || targetOverrides === void 0 ? void 0 : targetOverrides[sku]) && Object.prototype.hasOwnProperty.call(targetOverrides[sku], loc);
    }
    function effectiveTarget(sku, loc) {
        if (hasCustomTarget(sku, loc)) {
            return Math.max(0, Number(targetOverrides[sku][loc] || 0));
        }
        return Math.max(0, Number(targetDefaults[loc] || 0));
    }
    function shopNeed(sku, loc) {
        return Math.max(0, effectiveTarget(sku, loc) - shopStock(sku, loc));
    }
    function totalShopNeed(sku) {
        return shopNeed(sku, 'boat') + shopNeed(sku, 'cornwall');
    }
    function netManufacturingNeed(sku) {
        const d = demandSnapshot.bySku[sku];
        if (d)
            return Math.max(0, Number(d.need_to_make || 0));
        return Math.max(0, totalShopNeed(sku)
            - assembledQtyForDemand(s, sku)
            - awaitingDispatchQty(s, sku)
            - inTransitCornwallPalQty(s, sku)
            - intactDamageReworkQty(s, sku));
    }
    function targetControl(sku, loc) {
        const custom = hasCustomTarget(sku, loc);
        const value = effectiveTarget(sku, loc);
        return `<div class="target-control ${custom ? 'custom' : 'default'}">
          <div class="target-input-row">
            <input class="number pal-target-input" data-sku="${sku}" data-loc="${loc}" type="number" min="0" value="${value}">
            <button type="button" class="target-reset-btn" data-reset-sku="${sku}" data-reset-loc="${loc}" ${custom ? '' : 'disabled'} title="Reset to default">↺</button>
          </div>
          <span class="target-mode">${custom ? 'CUSTOM' : 'DEFAULT'}${custom ? '' : ` · ${targetDefaults[loc]}`}</span>
        </div>`;
    }
    async function saveOverrides() {
        await cloudFetch('/settings/pal_target_overrides', {
            method: 'PUT',
            body: JSON.stringify({ value: targetOverrides })
        });
    }
    function draw() {
        const text = (q.value || '').toLowerCase();
        const shown = items
            .filter(x => `${x.sku} ${x.name}`.toLowerCase().includes(text))
            .sort((a, b) => Number(isOnSale(s, b.sku)) - Number(isOnSale(s, a.sku)) || a.name.localeCompare(b.name));
        tbody.innerHTML = shown.map(x => {
            const useShopify = type === 'pal';
            const b = useShopify ? shopStock(x.sku, 'boat') : stock(s, x.sku, 'boat');
            const c = useShopify ? shopStock(x.sku, 'cornwall') : stock(s, x.sku, 'cornwall');
            const bt = useShopify ? effectiveTarget(x.sku, 'boat') : getTarget(s, x.sku, 'boat');
            const ct = useShopify ? effectiveTarget(x.sku, 'cornwall') : getTarget(s, x.sku, 'cornwall');
            const rawNeed = useShopify ? totalShopNeed(x.sku) : needed(s, x.sku, 'boat') + needed(s, x.sku, 'cornwall');
            const need = useShopify ? netManufacturingNeed(x.sku) : rawNeed;
            const demand = useShopify ? demandSnapshot.bySku[x.sku] : null;
            const sale = isOnSale(s, x.sku);
            const mapped = !!shopifyBySku[x.sku];
            return `<tr class="pal-inventory-card ${sale ? 'on-sale-row' : ''}">
              <td class="pal-product" data-label="Pal">
                <div class="product-name">${esc(x.name)}</div>
                <span class="sku">${x.sku}</span>
                ${useShopify && !mapped ? '<div class="small warning-text">Not mapped to Shopify</div>' : ''}
              </td>
              <td data-label="On Sale">${sale ? badge('ON SALE', 'ok') : badge('NOT ON SALE', '')}</td>
              <td data-label="Recipe">${x.recipe_ready ? badge('Recipe ready', 'ok') : badge('No recipe', 'warning')}</td>
              <td class="stock-cell shopify-stock-cell" data-label="Boat Shopify Stock"><strong>${b}</strong>${useShopify ? '<small>available</small>' : ''}</td>
              <td class="target-cell" data-label="Boat Target">${useShopify ? targetControl(x.sku, 'boat') : `<input class="number t" data-sku="${x.sku}" data-loc="boat" type="number" min="0" value="${bt}">`}</td>
              <td class="stock-cell shopify-stock-cell" data-label="Cornwall Shopify Stock"><strong>${c}</strong>${useShopify ? '<small>available</small>' : ''}</td>
              <td class="target-cell" data-label="Cornwall Target">${useShopify ? targetControl(x.sku, 'cornwall') : `<input class="number t" data-sku="${x.sku}" data-loc="cornwall" type="number" min="0" value="${ct}">`}</td>
              <td class="need-cell" data-label="Need to Make"><strong>${need}</strong>${useShopify && demand ? `<small>${demand.gross_need} shortage · ${demand.assembled} assembled · ${demand.awaiting_dispatch} dispatch · ${demand.in_transit_cornwall} transit · ${demand.intact_rework} rework</small>` : ''}</td>
            </tr>`;
        }).join('');
        if (useShopifyPage()) {
            document.querySelectorAll('.pal-target-input').forEach(el => el.onchange = async () => {
                const sku = el.dataset.sku, loc = el.dataset.loc;
                const qty = Math.max(0, Math.round(Number(el.value || 0)));
                const before = JSON.parse(JSON.stringify(targetOverrides));
                targetOverrides[sku] = targetOverrides[sku] || {};
                targetOverrides[sku][loc] = qty;
                el.disabled = true;
                try {
                    await saveOverrides();
                    draw();
                    setForgeCloudSync('synced', 'Custom Pal target saved');
                }
                catch (e) {
                    targetOverrides = before;
                    alert('Could not save custom Pal target: ' + e.message);
                    draw();
                }
            });
            document.querySelectorAll('.target-reset-btn').forEach(btn => btn.onclick = async () => {
                if (btn.disabled)
                    return;
                const sku = btn.dataset.resetSku, loc = btn.dataset.resetLoc;
                const before = JSON.parse(JSON.stringify(targetOverrides));
                if (targetOverrides[sku]) {
                    delete targetOverrides[sku][loc];
                    if (!Object.keys(targetOverrides[sku]).length)
                        delete targetOverrides[sku];
                }
                btn.disabled = true;
                try {
                    await saveOverrides();
                    draw();
                    setForgeCloudSync('synced', 'Pal target reset to default');
                }
                catch (e) {
                    targetOverrides = before;
                    alert('Could not reset Pal target: ' + e.message);
                    draw();
                }
            });
        }
        else {
            document.querySelectorAll('.t').forEach(el => el.onchange = async () => {
                const sku = el.dataset.sku, loc = el.dataset.loc;
                const qty = Math.max(0, Number(el.value || 0));
                const previous = getTarget(s, sku, loc);
                el.disabled = true;
                try {
                    await cloudFetch(`/targets/${encodeURIComponent(sku)}/${encodeURIComponent(loc)}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ target_qty: qty })
                    });
                    s.targets[targetKey(sku, loc)] = qty;
                    draw();
                }
                catch (e) {
                    s.targets[targetKey(sku, loc)] = previous;
                    alert(`Cloud target update failed: ${e.message}`);
                    draw();
                }
            });
        }
    }
    function useShopifyPage() { return type === 'pal'; }
    q.oninput = draw;
    await Promise.all([refreshShopifyInventory(), loadTargetSettings()]);
    if (type === 'pal')
        demandSnapshot = await loadPalDemandSnapshot(s, ps);
    draw();
    await startForgeLiveSync(async (fresh) => {
        s = fresh;
        await Promise.all([refreshShopifyInventory(), loadTargetSettings()]);
        if (type === 'pal') {
            try {
                demandSnapshot = await loadPalDemandSnapshot(s, ps);
            }
            catch (e) {
                console.error('Pal Inventory demand refresh failed', e);
                setForgeCloudSync('error', 'Pal Inventory demand could not refresh');
                return;
            }
        }
        draw();
    });
}
async function recipes() {
    installForgeCloudSyncBadge();
    const q = document.querySelector('#q');
    const box = document.querySelector('#cards');
    let ps = [];
    let rs = [];
    let productReference = [];
    async function refresh() {
        const core = await Promise.all([
            cloudFetch('/products'),
            cloudFetch('/recipes'),
            fetch('data/products.json', { cache: 'no-store' }).then(r => {
                if (!r.ok)
                    throw new Error('Product reference catalogue unavailable.');
                return r.json();
            }).catch(() => [])
        ]);
        ps = core[0].products || [];
        rs = (core[1].recipes || []).map(normaliseCloudRecipe);
        productReference = Array.isArray(core[2]) ? core[2] : [];
    }
    try {
        await refresh();
        setForgeCloudSync('synced', 'Recipes synced');
    }
    catch (e) {
        showCloudRequiredError(e.message);
        setForgeCloudSync('error', e.message);
        return;
    }
    function recipeRowsFor(sku) {
        return rs.filter(r => r.sku === sku).sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
    }
    function productDisplayName(p, sku) {
        const ref = productReference.find(x => String(x.sku || '').trim() === String(sku || '').trim());
        const referenceName = String((ref || {}).name || '').trim();
        if (referenceName && referenceName.toUpperCase() !== String(sku || '').toUpperCase())
            return referenceName;
        const direct = [
            p && p.product_name,
            p && p.title,
            p && p.display_name,
            p && p.product_title,
            p && p.animal,
            p && p.name
        ].map(v => String(v || '').trim()).find(v => v && v.toUpperCase() !== String(sku || '').toUpperCase());
        if (direct)
            return direct;
        const rr = rs.find(r => r.sku === sku);
        const fromRecipe = [
            rr && rr.product_name,
            rr && rr.name,
            rr && rr.animal
        ].map(v => String(v || '').trim()).find(v => v && v.toUpperCase() !== String(sku || '').toUpperCase());
        return fromRecipe || sku;
    }
    function editorRow(r, i) {
        return `<div class="recipe-edit-row" data-i="${i}">
          <label><span>Filament</span><input data-k="filament" value="${esc(r.filament || '')}"></label>
          <label><span>Parts / Colour Group</span><input data-k="parts" value="${esc(r.parts || '')}"></label>
          <label><span>Grouped STL</span><input data-k="grouped_stl" value="${esc(r.grouped_stl || '')}"></label>
          <label><span>Individual STL(s)</span><input data-k="separate_stls" value="${esc(r.separate_stls || '')}"></label>
          <label class="recipe-small"><span>Parts</span><input class="number" type="number" min="1" data-k="part_count" value="${Number(r.part_count || 1)}"></label>
          <label class="recipe-small"><span>Weight (g)</span><input class="number" type="number" min="0" step="0.01" data-k="weight_g" value="${Number(r.weight_g || 0)}"></label>
          <button class="iconbtn recipeRemove" type="button" title="Remove row">×</button>
        </div>`;
    }
    function openEditor(sku) {
        const p = ps.find(x => x.sku === sku);
        if (!p)
            return;
        const card = document.querySelector(`.recipe-card[data-sku="${sku}"]`);
        if (!card)
            return;
        let draft = recipeRowsFor(sku).map(r => ({
            id: r.id, filament: r.filament || '', parts: r.parts || '',
            grouped_stl: r.grouped_stl || '', separate_stls: r.separate_stls || '',
            part_count: Number(r.part_count || 1), weight_g: Number(r.weight_g || 0)
        }));
        if (!draft.length)
            draft = [{ filament: '', parts: 'Body', grouped_stl: '', separate_stls: '', part_count: 1, weight_g: 0 }];
        const host = card.querySelector('.recipeEditor');
        function drawEditor() {
            host.innerHTML = `<div class="recipe-editor-head"><strong>Edit ${esc(p.name)}</strong><span class="sku">${esc(sku)}</span></div>
              <div class="recipe-edit-rows">${draft.map(editorRow).join('')}</div>
              <div class="recipe-editor-actions">
                <button class="btn ghost recipeAddRow" type="button">＋ Add Colour Group</button>
                <button class="btn recipeSave" type="button">Save Recipe to Cloud</button>
                <button class="btn ghost recipeCancel" type="button">Cancel</button>
              </div>
              <div class="small recipeSaveStatus"></div>`;
            host.querySelectorAll('.recipe-edit-row').forEach((row, i) => {
                row.querySelectorAll('[data-k]').forEach(el => el.oninput = () => {
                    const k = el.dataset.k;
                    draft[i][k] = ['part_count', 'weight_g'].includes(k) ? Number(el.value || 0) : el.value;
                });
                row.querySelector('.recipeRemove').onclick = () => {
                    if (draft.length <= 1)
                        return alert('A recipe must contain at least one colour group.');
                    draft.splice(i, 1);
                    drawEditor();
                };
            });
            host.querySelector('.recipeAddRow').onclick = () => {
                draft.push({ filament: '', parts: 'Body', grouped_stl: '', separate_stls: '', part_count: 1, weight_g: 0 });
                drawEditor();
            };
            host.querySelector('.recipeCancel').onclick = () => { host.innerHTML = ''; };
            host.querySelector('.recipeSave').onclick = async () => {
                const status = host.querySelector('.recipeSaveStatus');
                const btn = host.querySelector('.recipeSave');
                btn.disabled = true;
                status.textContent = 'Saving to cloud…';
                try {
                    await cloudFetch(`/recipes/${encodeURIComponent(sku)}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ recipes: draft })
                    });
                    await refresh();
                    setForgeCloudSync('synced', 'Recipe saved');
                    draw();
                }
                catch (e) {
                    btn.disabled = false;
                    status.textContent = 'Save failed: ' + (e.message || e);
                    setForgeCloudSync('error', e.message || 'Recipe save failed');
                }
            };
        }
        drawEditor();
    }
    function draw() {
        const text = (q.value || '').toLowerCase();
        const filtered = ps.filter(p => p.type === 'pal' && `${p.sku} ${productDisplayName(p, p.sku)} ${(p.filaments || []).join(' ')}`.toLowerCase().includes(text));
        const productSkus = new Set(filtered.map(p => String(p.sku || '')));
        const recipeOnlyProducts = [...new Set(rs.map(r => r.sku).filter(Boolean))]
            .filter(sku => !productSkus.has(String(sku)))
            .map(sku => ({ sku, name: (rs.find(r => r.sku === sku) || {}).name || sku, type: 'pal' }));
        const displayProducts = [...filtered, ...recipeOnlyProducts.filter(p => `${p.sku} ${productDisplayName(p, p.sku)}`.toLowerCase().includes(text))];
        box.innerHTML = displayProducts.map(p => {
            const rr = recipeRowsFor(p.sku);
            const total = rr.reduce((a, r) => a + Number(r.weight_g || 0), 0);
            return `<div class="card recipe-card" data-sku="${esc(p.sku)}">
              <div class="recipe-card-head"><div><h3>${esc(productDisplayName(p, p.sku))}</h3><span class="sku">${esc(p.sku)}</span></div><button class="btn ghost recipeEdit" data-sku="${esc(p.sku)}">Edit Recipe</button></div>
              <div class="small">${rr.length} colour group(s) · ${total.toFixed(1)}g total</div>
              ${rr.map(r => `<div class="listitem" style="margin-top:9px"><div class="colour">${esc(r.filament)}</div><strong>${esc(r.parts)}</strong><div>${Number(r.weight_g || 0)}g · ${Number(r.part_count || 1)} part(s)</div><code>${esc(r.grouped_stl || '')}</code>${r.separate_stls ? `<div class="small">Individual: ${esc(r.separate_stls)}</div>` : ''}</div>`).join('') || '<div class="listitem" style="margin-top:9px">No recipe entered yet.</div>'}
              <div class="recipeEditor"></div>
            </div>`;
        }).join('') || '<div class="card">No matching Pals.</div>';
        document.querySelectorAll('.recipeEdit').forEach(b => b.onclick = () => openEditor(b.dataset.sku));
    }
    q.oninput = draw;
    draw();
    let stamp = JSON.stringify(rs.map(r => [r.id, r.sku, r.filament, r.parts, r.grouped_stl, r.separate_stls, r.weight_g, r.part_count]));
    window.setInterval(async () => {
        if (document.hidden || document.querySelector('.recipeEditor .recipe-edit-row'))
            return;
        try {
            const d = await cloudFetch('/recipes');
            const fresh = (d.recipes || []).map(normaliseCloudRecipe);
            const next = JSON.stringify(fresh.map(r => [r.id, r.sku, r.filament, r.parts, r.grouped_stl, r.separate_stls, r.weight_g, r.part_count]));
            if (next === stamp)
                return;
            rs = fresh;
            stamp = next;
            draw();
            setForgeCloudSync('synced', 'Recipes updated live');
        }
        catch (e) {
            setForgeCloudSync('error', e.message || 'Recipe sync failed');
        }
    }, 2000);
}
async function production() {
    installForgeCloudSyncBadge();
    if (!forgeProductionCloudReady) {
        try {
            await hydrateProductionCloud();
        }
        catch (e) {
            showCloudRequiredError(e.message);
            return;
        }
    }
    const ps = await load('products');
    const rs = await load('recipes');
    const body = document.querySelector('#prod');
    let s = cloudOperationalState();
    let demandSnapshot = { bySku: {} };
    async function refreshDemand() {
        demandSnapshot = await loadPalDemandSnapshot(s, ps);
    }
    function drawProduction() {
        const rows = [];
        ps.filter(p => p.type === 'pal' && isOnSale(s, p.sku)).forEach(p => {
            const d = demandSnapshot.bySku[p.sku];
            const n = Number((d === null || d === void 0 ? void 0 : d.need_to_make) || 0);
            if (n > 0) {
                rows.push({
                    p,
                    n,
                    demand: d,
                    groups: rs.filter(r => r.sku === p.sku)
                });
            }
        });
        rows.sort((a, b) => b.n - a.n || a.p.name.localeCompare(b.p.name));
        body.innerHTML = rows.map(x => `<tr>
          <td>
            <strong>${esc(x.p.name)}</strong><br>
            <span class="sku">${x.p.sku}</span>
          </td>
          <td>
            <strong>${x.n}</strong>
            <div class="small">${x.demand.boat_shortage} Boat · ${x.demand.cornwall_shortage} Cornwall</div>
          </td>
          <td>${x.groups.length}</td>
          <td>${(x.groups.reduce((a, r) => a + Number(r.weight_g || 0), 0) * x.n).toFixed(1)}g</td>
          <td>${x.groups.map(r => esc(r.filament)).join(', ')}</td>
        </tr>`).join('') || '<tr><td colspan="5">No Pal manufacturing currently required.</td></tr>';
        const damage = document.querySelector('#damageProduction');
        if (damage) {
            const labels = { box: 'Repack — Box', insert: 'Print Insert + Repack', pal: 'Print Replacement Pal', writeoff: 'Complete Replacement' };
            const jobs = (s.damageReworkJobs || []).filter(x => x.status === 'awaiting_rework');
            function damageJobLabel(j) {
                if (j.type !== 'item')
                    return labels[j.type] || j.type;
                const r = j.requirements || {};
                if (r.writeoff)
                    return 'Complete Replacement';
                return [r.box ? 'Replace Box' : '', r.insert ? 'Replace Insert' : '', r.pal ? 'Replace Pal' : ''].filter(Boolean).join(' + ');
            }
            damage.innerHTML = jobs.length
                ? jobs.map(j => `<div class="damage-production-row"><div><strong>${esc(j.name)}</strong><div class="sku">${j.sku}${j.damaged_item_index ? ` · Damaged Item ${j.damaged_item_index}` : ''}</div></div><span>${esc(damageJobLabel(j))}</span><strong>× ${j.qty}</strong></div>`).join('')
                : '<div class="bench-empty">No damage rework currently required.</div>';
        }
        const spare = document.querySelector('#cornwallSpareDemand');
        if (spare) {
            ensureCornwallInsertReplenishment(s, ps);
            const salePals = ps.filter(p => p.type === 'pal' && isOnSale(s, p.sku)).sort((a, b) => a.name.localeCompare(b.name));
            const low = [];
            if (cornwallBoxStock(s) < 1) {
                low.push({ item: 'Flat Clear Boxes', detail: 'Cornwall Rework Stock', qty: cornwallBoxStock(s) });
            }
            salePals.forEach(p => {
                const qty = cornwallInsertStock(s, p.sku);
                const pending = pendingCornwallInsertSupply(s, p.sku);
                if (qty + pending < cornwallInsertTarget()) {
                    low.push({ item: `${p.name} Insert`, detail: p.sku, qty, target: cornwallInsertTarget(), pending });
                }
            });
            spare.innerHTML = low.length
                ? low.map(x => `<div class="damage-production-row factory-spare-row">
                    <div><strong>${esc(x.item)}</strong><div class="sku">${esc(x.detail)}</div></div>
                    <span>${x.item === 'Flat Clear Boxes' ? badge('FACTORY SUPPLY', 'danger') : x.pending > 0 ? badge('IN REPLENISHMENT', 'info') : badge('INSERT PRODUCTION', 'danger')}</span>
                    <strong>Stock ${x.qty}${x.target != null ? ` / ${x.target}` : ''}${x.pending != null ? ` · Pending ${x.pending}` : ''}</strong>
                  </div>`).join('')
                : '<div class="bench-empty">Cornwall spare stock is healthy.</div>';
        }
    }
    try {
        await refreshDemand();
        drawProduction();
        setForgeCloudSync('synced', 'Production demand synced');
    }
    catch (e) {
        showCloudRequiredError(e.message);
        setForgeCloudSync('error', e.message);
        return;
    }
    await startForgeLiveSync(async (fresh) => {
        s = fresh;
        await refreshDemand();
        drawProduction();
    });
}
async function dataHealth() {
    const ps = await load('products'), mm = await load('mismatches'), body = document.querySelector('#health'), missing = ps.filter(p => p.type === 'pal' && !p.recipe_ready);
    const rows = [...mm.map(x => ({ level: 'warning', issue: 'Recipe SKU remapped', item: x.recipe, detail: `${x.stated_sku} → ${x.resolved_sku}` })), ...missing.map(x => ({ level: 'danger', issue: 'Missing recipe', item: x.name, detail: x.sku }))];
    body.innerHTML = rows.map(x => `<tr><td>${badge(x.issue, x.level)}</td><td>${esc(x.item)}</td><td>${esc(x.detail)}</td></tr>`).join('') || '<tr><td colspan="3">No data issues detected.</td></tr>';
}
async function filament() {
    installForgeCloudSyncBadge();
    const body = document.querySelector('#fil');
    const history = document.querySelector('#filamentHistory');
    const q = document.querySelector('#q');
    const totalKpi = document.querySelector('#filamentTotalKpi');
    const lowKpi = document.querySelector('#filamentLowKpi');
    const coloursKpi = document.querySelector('#filamentColoursKpi');
    let data;
    async function loadCloud() {
        data = await cloudFetch('/filaments');
        return data;
    }
    try {
        await loadCloud();
        setForgeCloudSync('synced', 'Filament synced');
    }
    catch (e) {
        showCloudRequiredError(e.message);
        setForgeCloudSync('error', e.message);
        return;
    }
    function rows() {
        const text = String((q === null || q === void 0 ? void 0 : q.value) || '').toLowerCase();
        return (data.filaments || [])
            .filter(x => `${x.name} ${x.material || ''} ${x.colour || ''}`.toLowerCase().includes(text))
            .sort((a, b) => String(a.name).localeCompare(String(b.name)));
    }
    function draw() {
        const all = data.filaments || [];
        const low = all.filter(x => Number(x.grams_in_stock || 0) <= Number(x.reorder_level_g || 0));
        if (totalKpi)
            totalKpi.textContent = Math.round(all.reduce((a, x) => a + Number(x.grams_in_stock || 0), 0)) + 'g';
        if (lowKpi)
            lowKpi.textContent = low.length;
        if (coloursKpi)
            coloursKpi.textContent = all.length;
        body.innerHTML = rows().map(x => {
            const grams = Number(x.grams_in_stock || 0);
            const reorder = Number(x.reorder_level_g || 250);
            const spool = Number(x.spool_size_g || 1000);
            const lowStock = grams <= reorder;
            return `<tr>
       <td>
         <strong>${esc(x.name)}</strong>
         <div class="small">${esc(x.material || 'PLA')} · ${esc(x.colour || x.name)}</div>
       </td>
       <td><strong>${Math.round(grams)}g</strong><div class="small">${(grams / spool).toFixed(1)} spool equivalent</div></td>
       <td><input class="number filReorder" data-name="${esc(x.name)}" type="number" min="0" step="50" value="${Math.round(reorder)}"></td>
       <td><input class="number filSpool" data-name="${esc(x.name)}" type="number" min="1" step="50" value="${Math.round(spool)}"></td>
       <td>${lowStock ? badge('Order', 'danger') : badge('OK', 'ok')}</td>
       <td>
         <div class="filament-stock-actions">
           <input class="number filAddQty" id="fil-add-${cssSafe(x.name)}" type="number" min="1" step="50" value="${Math.round(spool)}">
           <button class="btn filAdd" data-name="${esc(x.name)}">Add Stock</button>
           <button class="btn ghost filMinus" data-name="${esc(x.name)}">−100g</button>
         </div>
       </td>
     </tr>`;
        }).join('') || '<tr><td colspan="6">No filament colours are configured.</td></tr>';
        if (history) {
            history.innerHTML = (data.history || []).slice(0, 100).map(h => `<tr>
       <td>${fmtDate(h.created_at)}</td>
       <td><strong>${esc(h.name)}</strong></td>
       <td>${esc(h.type || 'adjustment')}</td>
       <td><strong>${Number(h.change_g) > 0 ? '+' : ''}${Math.round(Number(h.change_g || 0))}g</strong></td>
       <td>${esc(h.reason || '')}</td>
     </tr>`).join('') || '<tr><td colspan="5">No filament movements recorded yet.</td></tr>';
        }
        document.querySelectorAll('.filReorder').forEach(el => el.onchange = async () => {
            try {
                await cloudFetch(`/filaments/${encodeURIComponent(el.dataset.name)}`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ reorder_level_g: Number(el.value || 0) })
                });
                await loadCloud();
                draw();
            }
            catch (e) {
                alert(`Reorder level was not saved: ${e.message}`);
                draw();
            }
        });
        document.querySelectorAll('.filSpool').forEach(el => el.onchange = async () => {
            try {
                await cloudFetch(`/filaments/${encodeURIComponent(el.dataset.name)}`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ spool_size_g: Number(el.value || 1000) })
                });
                await loadCloud();
                draw();
            }
            catch (e) {
                alert(`Spool size was not saved: ${e.message}`);
                draw();
            }
        });
        document.querySelectorAll('.filAdd').forEach(btn => btn.onclick = async () => {
            var _a;
            const name = btn.dataset.name;
            const qty = Math.max(1, Number(((_a = document.querySelector('#fil-add-' + cssSafe(name))) === null || _a === void 0 ? void 0 : _a.value) || 1000));
            btn.disabled = true;
            try {
                await cloudFetch(`/filaments/${encodeURIComponent(name)}/adjust`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ change_g: qty, type: 'restock', reason: 'Filament added in Forge' })
                });
                await loadCloud();
                draw();
            }
            catch (e) {
                alert(`Filament stock was not added: ${e.message}`);
                draw();
            }
        });
        document.querySelectorAll('.filMinus').forEach(btn => btn.onclick = async () => {
            btn.disabled = true;
            try {
                await cloudFetch(`/filaments/${encodeURIComponent(btn.dataset.name)}/adjust`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ change_g: -100, type: 'adjustment', reason: 'Manual filament adjustment' })
                });
                await loadCloud();
                draw();
            }
            catch (e) {
                alert(`Filament stock was not adjusted: ${e.message}`);
                draw();
            }
        });
    }
    function cssSafe(v) { return String(v).replace(/[^a-z0-9_-]/gi, '_'); }
    if (q)
        q.oninput = draw;
    draw();
    let stamp = JSON.stringify((data.filaments || []).map(x => [x.name, x.grams_in_stock, x.reorder_level_g, x.updated_at]));
    window.setInterval(async () => {
        if (document.hidden)
            return;
        try {
            const fresh = await cloudFetch('/filaments');
            const next = JSON.stringify((fresh.filaments || []).map(x => [x.name, x.grams_in_stock, x.reorder_level_g, x.updated_at]));
            if (next === stamp)
                return;
            data = fresh;
            stamp = next;
            draw();
            setForgeCloudSync('synced', 'Filament updated live');
        }
        catch (e) {
            setForgeCloudSync('error', e.message || 'Filament sync failed');
        }
    }, 2000);
}
async function buildPlatePlanner() {
    var _a;
    installForgeCloudSyncBadge();
    if (!forgeProductionCloudReady) {
        try {
            await hydrateProductionCloud();
        }
        catch (e) {
            showCloudRequiredError(e.message);
            return;
        }
    }
    const s = cloudOperationalState();
    const ps = await load('products');
    const rs = await load('recipes');
    // One source of truth: the same Pal demand snapshot used by
    // Pal Inventory and Production Planner.
    let demandSnapshot = await loadPalDemandSnapshot(s, ps);
    const pals = Object.fromEntries(ps.filter(p => p.type === 'pal').map(p => [p.sku, p]));
    const colours = [...new Set(rs.map(r => String(r.filament || '').trim()).filter(Boolean))].sort();
    const colourEl = document.querySelector('#plateColour');
    const printerEl = document.querySelector('#platePrinter');
    const nameEl = document.querySelector('#plateName');
    const checklist = document.querySelector('#plateChecklist');
    const checklistMobile = document.querySelector('#plateChecklistMobile');
    const current = document.querySelector('#currentPlateItems');
    const platesList = document.querySelector('#platesList');
    const currentTotal = document.querySelector('#currentPlateTotal');
    const demandKpi = document.querySelector('#demandKpi');
    const plannedKpi = document.querySelector('#plannedKpi');
    const printingKpi = document.querySelector('#printingKpi');
    const completedKpi = document.querySelector('#completedKpi');
    const colourDemandCards = document.querySelector('#colourDemandCards');
    const colourDemandEmpty = document.querySelector('#colourDemandEmpty');
    const checklistSearch = document.querySelector('#plateChecklistSearch');
    let plateDraft = { id: null, code: '', colour: colours[0] || '', printer: '', name: '', items: [] };
    colourEl.innerHTML = colours.length ? colours.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('') : '<option value="">No filament colours found</option>';
    const activePrinters = (s.printers || []).filter(p => p.active !== false);
    printerEl.innerHTML = activePrinters.length
        ? activePrinters.map(p => `<option value="${esc(p.id)}">${esc(p.name)}${p.model ? ` · ${esc(p.model)}` : ''}</option>`).join('')
        : '<option value="">No printers configured — add one in Settings</option>';
    if (((_a = s.siteSettings) === null || _a === void 0 ? void 0 : _a.defaultPrinter) && activePrinters.some(p => p.id === s.siteSettings.defaultPrinter))
        printerEl.value = s.siteSettings.defaultPrinter;
    plateDraft.printer = printerEl.value || '';
    function printerLabel(id) {
        const p = (s.printers || []).find(x => x.id === id);
        return p ? `${p.name}${p.model ? ` · ${p.model}` : ''}` : 'No printer assigned';
    }
    function recipeKey(r) { return groupKey(r); }
    function demandFor(r) {
        var _w;
        return Math.max(0, Number(((_w = demandSnapshot.bySku[r.sku]) === null || _w === void 0 ? void 0 : _w.need_to_make) || 0));
    }
    function draftQty(key) { return plateDraft.items.filter(i => i.inventory_key === key).reduce((a, i) => a + Number(i.qty || 0), 0); }
    function rowData() {
        const selected = String(plateDraft.colour || '').trim();
        return rs.filter(r => String(r.filament || '').trim() === selected).map(r => {
            const p = pals[r.sku] || { name: r.name || r.animal || r.sku };
            const key = recipeKey(r);
            const demand = demandFor(r);
            const inv = partQty(s, key);
            const allocated = activePlateQty(s, key);
            const local = draftQty(key);
            // Canonical Pal Need to Make minus colour-group work already covered.
            const remain = Math.max(0, demand - inv - allocated - local);
            const recoveryFiles = String(r.separate_stls || '').split(';').map(v => v.trim()).filter(Boolean);
            return { r, p, key, demand, inv, allocated, local, remain, recoveryFiles };
        }).sort((a, b) => b.remain - a.remain || a.p.name.localeCompare(b.p.name));
    }
    function addGrouped(x, qty, kind = 'group') {
        plateDraft.items.push({
            id: makeId(), kind, sku: x.r.sku, product_name: x.p.name,
            filament: String(x.r.filament || '').trim(), label: x.r.parts,
            file: x.r.grouped_stl, inventory_key: x.key, qty: Math.max(1, Number(qty || 1)),
            weight_each: Number(x.r.weight_g || 0), extra: kind === 'extra'
        });
    }
    function colourDemand() {
        const map = {};
        rs.forEach(r => {
            const colour = String(r.filament || '').trim();
            if (!colour)
                return;
            const key = recipeKey(r);
            const remaining = Math.max(0, demandFor(r) - partQty(s, key) - activePlateQty(s, key));
            if (remaining <= 0)
                return;
            if (!map[colour])
                map[colour] = { colour, sets: 0, grams: 0, groups: 0, pals: new Set() };
            map[colour].sets += remaining;
            map[colour].grams += remaining * Number(r.weight_g || 0);
            map[colour].groups += 1;
            map[colour].pals.add(r.sku);
        });
        return Object.values(map).map(x => (Object.assign(Object.assign({}, x), { palCount: x.pals.size }))).sort((a, b) => b.sets - a.sets || b.grams - a.grams);
    }
    function drawColourDemand() {
        if (!colourDemandCards)
            return;
        const cards = colourDemand();
        colourDemandCards.innerHTML = cards.map(x => `<button class="colour-demand-card ${plateDraft.colour === x.colour ? 'selected' : ''}" data-colour="${esc(x.colour)}">
      <div class="colour-demand-top"><strong>${esc(x.colour)}</strong><span>${x.sets} set${x.sets === 1 ? '' : 's'}</span></div>
      <div class="colour-demand-number">${x.grams.toFixed(1)}g</div>
      <div class="small">${x.palCount} Pal${x.palCount === 1 ? '' : 's'} · ${x.groups} colour group${x.groups === 1 ? '' : 's'}</div>
      <div class="colour-demand-action">Plan this colour →</div>
   </button>`).join('');
        if (colourDemandEmpty)
            colourDemandEmpty.style.display = cards.length ? 'none' : 'block';
        document.querySelectorAll('.colour-demand-card').forEach(btn => btn.onclick = () => {
            var _a;
            const colour = btn.dataset.colour;
            plateDraft.colour = colour;
            colourEl.value = colour;
            plateDraft.items = [];
            drawAll();
            (_a = document.querySelector('#printChecklistCard')) === null || _a === void 0 ? void 0 : _a.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }
    function drawChecklist() {
        const searchText = ((checklistSearch === null || checklistSearch === void 0 ? void 0 : checklistSearch.value) || '').trim().toLowerCase();
        const rows = rowData().filter(x => !searchText || `${x.p.name} ${x.r.sku} ${x.r.parts} ${x.r.filament}`.toLowerCase().includes(searchText));
        // Desktop keeps the compact spreadsheet/table view.
        checklist.innerHTML = rows.length ? rows.map((x, idx) => `<tr class="${x.remain === 0 ? 'dimrow' : ''}">
     <td><strong>${esc(x.p.name)}</strong><br><span class="sku">${x.r.sku}</span></td>
     <td>${esc(x.r.parts)}</td>
     <td>${Number(x.r.weight_g || 0).toFixed(2).replace(/\.00$/, '')}g</td>
     <td>${x.demand}</td><td>${x.inv}</td><td>${x.allocated}</td><td><strong>${x.remain}</strong></td>
     <td><input class="number addqty desktop-addqty" id="desktop-qty-${idx}" min="1" type="number" value="${Math.max(1, Math.min(x.remain || 1, 5))}"></td>
     <td><button class="btn secondary desktop-addgroup" data-row="${idx}">Add Required</button></td>
     <td><button class="btn ghost desktop-addextra" data-row="${idx}">+ Extra</button></td>
     <td>${x.recoveryFiles.length ? `<button class="btn ghost desktop-exactpart" data-row="${idx}">Exact Part</button>` : '<span class="small muted">—</span>'}</td>
   </tr>${x.recoveryFiles.length ? `<tr class="exact-row desktop-exact-row" id="desktop-exact-${idx}" style="display:none"><td colspan="11"><div class="exact-part-panel">
       <div><strong>${esc(x.p.name)} — exact part</strong><div class="small">${esc(String(x.r.filament || '').trim())}</div></div>
       <select id="desktop-exact-file-${idx}" class="select">${x.recoveryFiles.map(f => `<option value="${esc(f)}">${esc(f)}</option>`).join('')}</select>
       <label class="small">Qty <input id="desktop-exact-qty-${idx}" class="number" type="number" min="1" value="1"></label>
       <button class="btn desktop-addexact" data-row="${idx}">Add Exact Part</button>
     </div></td></tr>` : ''}`).join('') : `<tr><td colspan="11" class="muted" style="padding:24px">${searchText ? 'No checklist rows match your search.' : `No recipe rows found for ${esc(plateDraft.colour)}.`}</td></tr>`;
        // Mobile gets its own grouped-recipe cards instead of trying to reshape table rows.
        if (checklistMobile) {
            checklistMobile.innerHTML = rows.length ? rows.map((x, idx) => `
       <article class="mobile-recipe-card ${x.remain === 0 ? 'dimrow' : ''}">
         <div class="mobile-recipe-head">
           <div>
             <strong>${esc(x.p.name)}</strong>
             <div class="sku">${x.r.sku}</div>
           </div>
           ${x.remain > 0 ? badge(`${x.remain} Remaining`, 'warning') : badge('Covered', 'ok')}
         </div>

         <div class="mobile-recipe-group">
           <span class="mobile-label">Colour Group</span>
           <strong>${esc(x.r.parts)}</strong>
           <span class="small">${esc(String(x.r.filament || '').trim())} · ${Number(x.r.weight_g || 0).toFixed(2).replace(/\.00$/, '')}g per set</span>
         </div>

         <div class="mobile-recipe-stats">
           <div><span>Demand</span><strong>${x.demand}</strong></div>
           <div><span>Printed</span><strong>${x.inv}</strong></div>
           <div><span>On Plates</span><strong>${x.allocated}</strong></div>
           <div><span>Remaining</span><strong>${x.remain}</strong></div>
         </div>

         <div class="mobile-required-action">
           <label>
             <span class="mobile-label">Grouped Sets Qty</span>
             <input class="number mobile-addqty" id="mobile-qty-${idx}" min="1" type="number" value="${Math.max(1, Math.min(x.remain || 1, 5))}">
           </label>
           <button class="btn mobile-addgroup" data-row="${idx}">Add Grouped Set${x.remain === 1 ? '' : 's'}</button>
         </div>

         <div class="mobile-secondary-actions">
           <button class="btn ghost mobile-addextra" data-row="${idx}">+ Extra Grouped Set</button>
           ${x.recoveryFiles.length ? `<button class="btn ghost mobile-exactpart" data-row="${idx}">Choose Exact Part</button>` : ''}
         </div>

         ${x.recoveryFiles.length ? `<div class="mobile-exact-panel" id="mobile-exact-${idx}" hidden>
           <div class="mobile-exact-title"><strong>Exact Part</strong><span class="small">Use only when you need an individual STL rather than the full grouped set.</span></div>
           <select id="mobile-exact-file-${idx}" class="select">${x.recoveryFiles.map(f => `<option value="${esc(f)}">${esc(f)}</option>`).join('')}</select>
           <label><span class="mobile-label">Qty</span><input id="mobile-exact-qty-${idx}" class="number" type="number" min="1" value="1"></label>
           <button class="btn mobile-addexact" data-row="${idx}">Add Exact Part</button>
         </div>` : ''}
       </article>`).join('')
                : `<div class="empty-state">${searchText ? 'No checklist rows match your search.' : `No recipe rows found for ${esc(plateDraft.colour)}.`}</div>`;
        }
        document.querySelectorAll('.desktop-addgroup').forEach(btn => btn.onclick = () => {
            var _a;
            const idx = Number(btn.dataset.row), x = rows[idx];
            const qty = Math.max(1, Number(((_a = document.querySelector('#desktop-qty-' + idx)) === null || _a === void 0 ? void 0 : _a.value) || 1));
            addGrouped(x, qty, 'group');
            drawAll();
        });
        document.querySelectorAll('.desktop-addextra').forEach(btn => btn.onclick = () => {
            const x = rows[Number(btn.dataset.row)];
            addGrouped(x, 1, 'extra');
            drawAll();
        });
        document.querySelectorAll('.desktop-exactpart').forEach(btn => btn.onclick = () => {
            const row = document.querySelector('#desktop-exact-' + btn.dataset.row);
            if (row)
                row.style.display = row.style.display === 'none' ? 'table-row' : 'none';
        });
        document.querySelectorAll('.desktop-addexact').forEach(btn => btn.onclick = () => {
            var _a, _b;
            const idx = Number(btn.dataset.row), x = rows[idx];
            const file = (_a = document.querySelector('#desktop-exact-file-' + idx)) === null || _a === void 0 ? void 0 : _a.value;
            const qty = Math.max(1, Number(((_b = document.querySelector('#desktop-exact-qty-' + idx)) === null || _b === void 0 ? void 0 : _b.value) || 1));
            if (!file)
                return;
            plateDraft.items.push({ id: makeId(), kind: 'recovery', sku: x.r.sku, product_name: x.p.name,
                filament: String(x.r.filament || '').trim(), label: file, file, inventory_key: recoveryKey(x.r.sku, file), qty, weight_each: 0, exact_part: true });
            drawAll();
        });
        document.querySelectorAll('.mobile-addgroup').forEach(btn => btn.onclick = () => {
            var _a;
            const idx = Number(btn.dataset.row), x = rows[idx];
            const qty = Math.max(1, Number(((_a = document.querySelector('#mobile-qty-' + idx)) === null || _a === void 0 ? void 0 : _a.value) || 1));
            addGrouped(x, qty, 'group');
            drawAll();
        });
        document.querySelectorAll('.mobile-addextra').forEach(btn => btn.onclick = () => {
            const x = rows[Number(btn.dataset.row)];
            addGrouped(x, 1, 'extra');
            drawAll();
        });
        document.querySelectorAll('.mobile-exactpart').forEach(btn => btn.onclick = () => {
            const panel = document.querySelector('#mobile-exact-' + btn.dataset.row);
            if (panel)
                panel.hidden = !panel.hidden;
        });
        document.querySelectorAll('.mobile-addexact').forEach(btn => btn.onclick = () => {
            var _a, _b;
            const idx = Number(btn.dataset.row), x = rows[idx];
            const file = (_a = document.querySelector('#mobile-exact-file-' + idx)) === null || _a === void 0 ? void 0 : _a.value;
            const qty = Math.max(1, Number(((_b = document.querySelector('#mobile-exact-qty-' + idx)) === null || _b === void 0 ? void 0 : _b.value) || 1));
            if (!file)
                return;
            plateDraft.items.push({ id: makeId(), kind: 'recovery', sku: x.r.sku, product_name: x.p.name,
                filament: String(x.r.filament || '').trim(), label: file, file, inventory_key: recoveryKey(x.r.sku, file), qty, weight_each: 0, exact_part: true });
            drawAll();
        });
    }
    function drawCurrent() {
        current.innerHTML = plateDraft.items.length ? plateDraft.items.map(i => `<div class="plate-line"><div><strong>${esc(i.product_name)}</strong><div class="small">${i.kind === 'group' ? 'Required print' : i.kind === 'extra' ? 'Extra grouped set' : 'Exact recovery part'} · ${esc(i.label)}</div><code>${esc(i.file)}</code></div><div class="plate-line-right"><input class="number lineqty" data-id="${i.id}" type="number" min="1" value="${i.qty}"><span>${(Number(i.weight_each || 0) * Number(i.qty || 0)).toFixed(1)}g</span><button class="iconbtn removeitem" data-id="${i.id}">×</button></div></div>`).join('') : '<div class="empty-state">Add required, extra or exact parts from the checklist.</div>';
        document.querySelectorAll('.removeitem').forEach(b => b.onclick = () => { plateDraft.items = plateDraft.items.filter(i => i.id !== b.dataset.id); drawAll(); });
        document.querySelectorAll('.lineqty').forEach(el => el.onchange = () => {
            const i = plateDraft.items.find(i => i.id === el.dataset.id);
            if (i)
                i.qty = Math.max(1, Number(el.value || 1));
            drawAll();
        });
        const grams = plateDraft.items.reduce((a, i) => a + Number(i.weight_each || 0) * Number(i.qty || 0), 0);
        currentTotal.textContent = `${plateDraft.items.reduce((a, i) => a + Number(i.qty || 0), 0)} print set(s) · ${grams.toFixed(1)}g`;
    }
    function drawKpis() {
        let open = 0;
        rs.forEach(r => open += Math.max(0, demandFor(r) - partQty(s, recipeKey(r)) - activePlateQty(s, recipeKey(r))));
        demandKpi.textContent = open;
        plannedKpi.textContent = s.plates.filter(p => p.status === 'draft').length;
        printingKpi.textContent = s.plates.filter(p => p.status === 'printing').length;
        completedKpi.textContent = (s.printHistory || []).length;
    }
    function plateSummary(p) { const g = (p.items || []).reduce((a, i) => a + Number(i.weight_each || 0) * Number(i.qty || 0), 0); return `${(p.items || []).reduce((a, i) => a + Number(i.qty || 0), 0)} set(s) · ${g.toFixed(1)}g`; }
    function drawPlates() {
        const items = [...s.plates].filter(p => p.status === 'draft' || p.status === 'printing').sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
        platesList.innerHTML = items.length ? items.map(p => `<div class="saved-plate"><div class="saved-plate-main"><div><strong>${esc(p.code)} · ${esc(p.name || p.colour)}</strong><div class="small">${esc(p.colour)} · ${esc(printerLabel(p.printer))} · ${plateSummary(p)}</div></div><div>${statusLabel(p.status)}</div></div><div class="saved-plate-items">${(p.items || []).map(i => `<span>${esc(i.product_name)} ×${i.qty}</span>`).join('')}</div><div class="plate-actions">${p.status === 'draft' ? `<button class="btn secondary loadplate" data-id="${p.id}">Edit</button><button class="btn startplate" data-id="${p.id}">Start Print</button>` : ''}${p.status === 'printing' ? `<button class="btn completeplate" data-id="${p.id}">Complete Print</button>` : ''}${p.status !== 'complete' ? `<button class="btn ghost cancelplate" data-id="${p.id}">Cancel</button>` : ''}${p.status === 'complete' ? `<span class="small">Completed ${fmtDate(p.completed_at)}</span>` : ''}</div><div class="completion-panel" id="complete-${p.id}"></div></div>`).join('') : '<div class="empty-state">No saved build plates.</div>';
        document.querySelectorAll('.loadplate').forEach(b => b.onclick = () => {
            const p = s.plates.find(x => x.id === b.dataset.id);
            if (!p)
                return;
            plateDraft = JSON.parse(JSON.stringify(p));
            s.plates = s.plates.filter(x => x.id !== p.id);
            save(s);
            colourEl.value = plateDraft.colour;
            printerEl.value = plateDraft.printer || '';
            nameEl.value = plateDraft.name || '';
            drawAll();
        });
        document.querySelectorAll('.startplate').forEach(b => b.onclick = async () => {
            const p = s.plates.find(x => x.id === b.dataset.id);
            if (p) {
                p.status = 'printing';
                p.started_at = new Date().toISOString();
                await save(s);
                drawAll();
            }
        });
        document.querySelectorAll('.cancelplate').forEach(b => b.onclick = async () => {
            const p = s.plates.find(x => x.id === b.dataset.id);
            if (p) {
                p.status = 'cancelled';
                await save(s);
                drawAll();
            }
        });
        document.querySelectorAll('.completeplate').forEach(b => b.onclick = () => openCompletion(b.dataset.id));
    }
    function recipeForPlateItem(item) {
        return rs.find(r => r.sku === item.sku && String(r.filament || '').trim() === String(item.filament || '').trim() && r.grouped_stl === item.file)
            || rs.find(r => r.sku === item.sku && String(r.filament || '').trim() === String(item.filament || '').trim());
    }
    function recoveryFilesForItem(item) {
        const r = recipeForPlateItem(item);
        return String((r === null || r === void 0 ? void 0 : r.separate_stls) || '').split(';').map(v => v.trim()).filter(Boolean);
    }
    function openCompletion(id) {
        const p = s.plates.find(x => x.id === id), panel = document.querySelector('#complete-' + id);
        if (!p || !panel)
            return;
        panel.innerHTML = `<div class="completion-box">
     <div class="completion-head">
       <div>
         <strong>Confirm print result</strong>
         <div class="small">Confirm full grouped sets, or record a problem with one exact part.</div>
       </div>
     </div>
     ${(p.items || []).map((i, idx) => {
            const files = i.kind === 'recovery' ? [i.file] : recoveryFilesForItem(i);
            return `<div class="completion-item" data-item="${i.id}">
         <div class="completion-item-top">
           <div>
             <strong>${esc(i.product_name)}</strong>
             <div class="small">${esc(i.label)} · ${esc(i.filament)}</div>
           </div>
           <div class="completion-planned">Planned <strong>${i.qty}</strong></div>
         </div>

         <div class="completion-controls">
           <label>
             <span>Complete sets passed</span>
             <input class="number passqty" data-item="${i.id}" type="number" min="0" max="${i.qty}" value="${i.qty}">
           </label>
           ${files.length && i.kind !== 'recovery' ? `<button class="btn ghost partproblem" data-item="${i.id}" type="button">Individual Part Problem</button>` : ''}
         </div>

         ${files.length && i.kind !== 'recovery' ? `<div class="part-problem-panel" id="problem-${i.id}" style="display:none">
           <div class="small" style="margin-bottom:8px">Enter the number of each exact part that failed. Good parts from incomplete sets will be saved as recovery stock.</div>
           <div class="part-failure-grid">
             ${files.map(file => `<label class="part-failure-row">
               <span>${esc(file)}</span>
               <input class="number exactfail" data-parent="${i.id}" data-file="${esc(file)}" type="number" min="0" max="${i.qty}" value="0">
             </label>`).join('')}
           </div>
         </div>` : ''}
       </div>`;
        }).join('')}
     <div class="completion-summary-note">
       <strong>How partial failures work</strong>
       <div class="small">Example: 1 Alex Eye 1 fails. Mark 0 full sets passed for that affected set and enter Eye 1 failed = 1. Forge records Eye 2 as a good spare and Eye 1 as needing reprint.</div>
     </div>
     <button class="btn confirmcomplete" type="button">Confirm Completion</button>
   </div>`;
        panel.querySelectorAll('.partproblem').forEach(btn => btn.onclick = () => {
            const box = panel.querySelector('#problem-' + btn.dataset.item);
            if (box)
                box.style.display = box.style.display === 'none' ? 'block' : 'none';
        });
        // If exact failures are entered, make sure passed sets cannot exceed
        // the number of completely unaffected sets.
        panel.querySelectorAll('.exactfail').forEach(input => input.oninput = () => {
            const parent = input.dataset.parent;
            const item = p.items.find(x => x.id === parent);
            const failInputs = [...panel.querySelectorAll(`.exactfail[data-parent="${parent}"]`)];
            const maxFailed = Math.max(0, ...failInputs.map(x => Number(x.value || 0)));
            const pass = panel.querySelector(`.passqty[data-item="${parent}"]`);
            if (item && pass) {
                const maximumComplete = Math.max(0, Number(item.qty) - maxFailed);
                if (Number(pass.value) > maximumComplete)
                    pass.value = maximumComplete;
            }
        });
        panel.querySelector('.confirmcomplete').onclick = async () => await confirmCompletion(id, panel);
    }
    async function confirmCompletion(id, panel) {
        const p = s.plates.find(x => x.id === id);
        if (!p)
            return;
        const results = {};
        (p.items || []).forEach(i => {
            var _a;
            const planned = Number(i.qty || 0);
            const passed = Math.max(0, Math.min(planned, Number(((_a = panel.querySelector(`.passqty[data-item="${i.id}"]`)) === null || _a === void 0 ? void 0 : _a.value) || 0)));
            const incomplete = Math.max(0, planned - passed);
            const files = i.kind === 'recovery' ? [i.file] : recoveryFilesForItem(i);
            const exactFailures = {};
            if (i.kind !== 'recovery') {
                panel.querySelectorAll(`.exactfail[data-parent="${i.id}"]`).forEach(el => {
                    exactFailures[el.dataset.file] = Math.max(0, Math.min(planned, Number(el.value || 0)));
                });
            }
            results[i.id] = { planned, passed, incomplete, exactFailures };
            // Full successful grouped/recovery units.
            if (passed > 0) {
                s.parts[i.inventory_key] = partQty(s, i.inventory_key) + passed;
            }
            if (i.kind === 'recovery') {
                const failed = Math.max(0, planned - passed);
                if (failed > 0) {
                    s.failedParts.push({
                        id: makeId(), plate_id: p.id, plate_code: p.code, sku: i.sku,
                        product_name: i.product_name, filament: i.filament, label: i.label,
                        file: i.file, qty: failed, created_at: new Date().toISOString(),
                        failure_type: 'exact_part'
                    });
                }
                return;
            }
            if (incomplete <= 0)
                return;
            const hasExactFailures = Object.values(exactFailures).some(v => v > 0);
            if (hasExactFailures && files.length) {
                // For each exact STL, an incomplete set produces one candidate part.
                // Failed units are logged; surviving units become recovery inventory.
                files.forEach(file => {
                    const failed = Math.min(incomplete, Number(exactFailures[file] || 0));
                    const good = Math.max(0, incomplete - failed);
                    if (good > 0) {
                        const key = recoveryKey(i.sku, file);
                        s.parts[key] = partQty(s, key) + good;
                    }
                    if (failed > 0) {
                        s.failedParts.push({
                            id: makeId(), plate_id: p.id, plate_code: p.code, sku: i.sku,
                            product_name: i.product_name, filament: i.filament,
                            label: file, file, qty: failed, created_at: new Date().toISOString(),
                            failure_type: 'individual_part'
                        });
                    }
                });
                // If user marked incomplete sets but did not identify every failed set,
                // retain an audit warning rather than pretending the set passed.
                const greatestFailure = Math.max(0, ...Object.values(exactFailures));
                if (greatestFailure < incomplete) {
                    s.failedParts.push({
                        id: makeId(), plate_id: p.id, plate_code: p.code, sku: i.sku,
                        product_name: i.product_name, filament: i.filament,
                        label: i.label, file: i.file, qty: incomplete - greatestFailure,
                        created_at: new Date().toISOString(),
                        failure_type: 'unallocated_group_failure'
                    });
                }
            }
            else {
                // No exact failure information: record incomplete grouped sets normally.
                s.failedParts.push({
                    id: makeId(), plate_id: p.id, plate_code: p.code, sku: i.sku,
                    product_name: i.product_name, filament: i.filament, label: i.label,
                    file: i.file, qty: incomplete, created_at: new Date().toISOString(),
                    failure_type: 'group'
                });
            }
        });
        const completedAt = new Date().toISOString();
        s.printHistory.push({
            plate_id: p.id,
            plate_code: p.code,
            plate_name: p.name || '',
            colour: p.colour,
            printer: p.printer,
            completed_at: completedAt,
            items: JSON.parse(JSON.stringify(p.items || [])),
            result: results
        });
        s.plates = s.plates.filter(x => x.id !== p.id);
        try {
            await save(s);
            // Every item already carries the per-set calculated recipe weight.
            const usedG = (p.items || []).reduce((sum, item) => {
                return sum + (Number(item.weight_each || 0) * Number(item.qty || 0));
            }, 0);
            const filamentName = String(p.colour || ((p.items || [])[0] || {}).filament || '').trim();
            if (usedG > 0 && filamentName) {
                await cloudFetch('/filaments/consume-plate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        plate_id: p.id,
                        filament: filamentName,
                        grams: usedG
                    })
                });
            }
            drawAll();
        }
        catch (e) {
            alert('Print completion could not be fully saved to Cloudflare: ' + (e.message || e));
            try {
                const fresh = await hydrateProductionCloud(true);
                Object.keys(s).forEach(k => delete s[k]);
                Object.assign(s, fresh);
            }
            catch (_) { }
            drawAll();
        }
    }
    async function saveDraft(startNow) {
        if (!plateDraft.items.length) {
            alert('Add at least one print item to the plate.');
            return;
        }
        // Older cloud state can contain plateSeq as an object. Never stringify
        // that into a code such as PLATE-[object Object].
        function nextPlateNumber() {
            const direct = Number(s.plateSeq);
            if (Number.isFinite(direct) && direct > 0)
                return Math.floor(direct);
            if (s.plateSeq && typeof s.plateSeq === 'object') {
                const candidates = [
                    s.plateSeq.value,
                    s.plateSeq.next,
                    s.plateSeq.seq,
                    s.plateSeq.number
                ].map(Number).filter(Number.isFinite);
                if (candidates.length)
                    return Math.max(1, Math.floor(candidates[0]));
            }
            // Recover safely from existing Build Plate codes in cloud state.
            const existingNumbers = (s.plates || [])
                .map(p => {
                const match = String(p.code || '').match(/^PLATE-(\d+)$/i);
                return match ? Number(match[1]) : 0;
            })
                .filter(Number.isFinite);
            return Math.max(1, ...existingNumbers.map(n => n + 1));
        }
        let code = String(plateDraft.code || '').trim();
        if (!code || code === 'PLATE-[object Object]') {
            const n = nextPlateNumber();
            code = `PLATE-${String(n).padStart(4, '0')}`;
            // Move the sequence forward using a plain number only.
            s.plateSeq = n + 1;
        }
        // New plate drafts must always use a fresh browser id. Existing saved
        // plates retain their id when loaded for editing.
        const p = Object.assign(Object.assign({}, plateDraft), {
            id: plateDraft.id || makeId(),
            code,
            status: startNow ? 'printing' : 'draft',
            created_at: plateDraft.created_at || new Date().toISOString()
        });
        if (startNow)
            p.started_at = new Date().toISOString();
        s.plates.push(JSON.parse(JSON.stringify(p)));
        try {
            await save(s);
            plateDraft = {
                id: null,
                code: '',
                colour: colourEl.value,
                printer: printerEl.value,
                name: '',
                items: []
            };
            nameEl.value = '';
            drawAll();
        }
        catch (e) {
            // Remove only the just-added local plate if the cloud save failed.
            s.plates = (s.plates || []).filter(x => x.id !== p.id);
            alert('Build plate could not be saved to Cloudflare. Please check Cloud Sync before continuing.');
        }
    }
    function drawAll() { plateDraft.colour = String(colourEl.value || plateDraft.colour || '').trim(); plateDraft.printer = printerEl.value || ''; plateDraft.name = nameEl.value || ''; drawColourDemand(); drawChecklist(); drawCurrent(); drawPlates(); drawKpis(); }
    colourEl.onchange = () => { plateDraft.colour = String(colourEl.value || '').trim(); plateDraft.items = []; drawAll(); };
    printerEl.onchange = () => { plateDraft.printer = printerEl.value || ''; };
    nameEl.oninput = () => { plateDraft.name = nameEl.value || ''; };
    if (checklistSearch)
        checklistSearch.oninput = () => drawChecklist();
    document.querySelector('#savePlate').onclick = async () => await saveDraft(false);
    document.querySelector('#startPlate').onclick = async () => await saveDraft(true);
    drawAll();
    await startForgeLiveSync(async (fresh) => {
        // Keep the unsaved in-memory plate draft, but refresh all shared cloud state.
        Object.keys(s).forEach(k => delete s[k]);
        Object.assign(s, fresh);
        try {
            demandSnapshot = await loadPalDemandSnapshot(s, ps);
        }
        catch (e) {
            console.error('Build Plate demand refresh failed', e);
            setForgeCloudSync('error', 'Build Plate demand could not refresh');
            return;
        }
        drawAll();
    });
}
async function printedParts() {
    installForgeCloudSyncBadge();
    if (!forgeProductionCloudReady) {
        try {
            await hydrateProductionCloud();
        }
        catch (e) {
            showCloudRequiredError(e.message);
            return;
        }
    }
    const ps = await load('products');
    const rs = await load('recipes');
    const pals = Object.fromEntries(ps.filter(p => p.type === 'pal').map(p => [p.sku, p]));
    const q = document.querySelector('#q');
    const body = document.querySelector('#partsRows');
    const failures = document.querySelector('#failedRows');
    let s = cloudOperationalState();
    function draw() {
        const text = (q.value || '').toLowerCase();
        const rows = [];
        rs.forEach(r => {
            const qty = partQty(s, groupKey(r));
            if (qty > 0) {
                rows.push({
                    kind: 'Grouped set',
                    sku: r.sku,
                    name: (pals[r.sku] || {}).name || r.name || r.animal,
                    filament: r.filament,
                    label: r.parts,
                    qty,
                    key: groupKey(r)
                });
            }
        });
        Object.entries(s.parts)
            .filter(([k, v]) => k.startsWith('recovery|') && Number(v) > 0)
            .forEach(([k, v]) => {
            const bits = k.split('|');
            const sku = bits[1];
            const file = bits.slice(2).join('|');
            const r = rs.find(x => x.sku === sku && (x.separate_stls || '').includes(file));
            rows.push({
                kind: 'Recovery part',
                sku,
                name: (pals[sku] || {}).name || sku,
                filament: (r === null || r === void 0 ? void 0 : r.filament) || '',
                label: file,
                qty: Number(v),
                key: k
            });
        });
        const shown = rows.filter(x => `${x.name} ${x.sku} ${x.filament} ${x.label}`.toLowerCase().includes(text));
        body.innerHTML = shown.length
            ? shown.map(x => `<tr>
       <td><strong>${esc(x.name)}</strong><br><span class="sku">${x.sku}</span></td>
       <td>${badge(x.kind, x.kind === 'Grouped set' ? 'ok' : 'info')}</td>
       <td>${esc(x.filament)}</td>
       <td>${esc(x.label)}</td>
       <td><strong>${x.qty}</strong></td>
       <td>
         <button class="iconbtn adjust" data-key="${esc(x.key)}" data-d="-1">−</button>
         <button class="iconbtn adjust" data-key="${esc(x.key)}" data-d="1">+</button>
       </td>
     </tr>`).join('')
            : '<tr><td colspan="6">No printed-part inventory yet. Complete a build plate to add stock.</td></tr>';
        document.querySelectorAll('.adjust').forEach(b => b.onclick = async () => {
            const key = b.dataset.key;
            const before = partQty(s, key);
            s.parts[key] = Math.max(0, before + Number(b.dataset.d));
            try {
                await save(s);
                draw();
            }
            catch (e) {
                s.parts[key] = before;
                draw();
                alert('Printed Parts could not be updated in Cloudflare. The change has been rolled back.');
            }
        });
        failures.innerHTML = s.failedParts.slice().reverse().slice(0, 20).map(x => `<tr>
     <td>${esc(x.plate_code)}</td>
     <td>${esc(x.product_name)}</td>
     <td>${esc(x.filament)}</td>
     <td>${esc(x.label)}</td>
     <td>${x.qty}</td>
     <td>${fmtDate(x.created_at)}</td>
   </tr>`).join('') || '<tr><td colspan="6">No failed parts recorded.</td></tr>';
    }
    q.oninput = draw;
    draw();
    await startForgeLiveSync(async (fresh) => {
        s = fresh;
        draw();
    });
}
async function settingsPage() {
    installForgeCloudSyncBadge();
    const $ = id => document.getElementById(id);
    const rows = $('printerRows'), name = $('printerName'), model = $('printerModel'), nozzle = $('printerNozzle');
    const buildX = $('printerBuildX'), buildY = $('printerBuildY'), buildZ = $('printerBuildZ');
    const addBtn = $('addPrinter'), msg = $('settingsMessage');
    let data;
    async function refresh() {
        data = await cloudFetch('/settings');
        return data;
    }
    function flash(text, kind = 'ok') {
        if (!msg)
            return;
        msg.innerHTML = badge(text, kind);
        setTimeout(() => {
            if (msg)
                msg.innerHTML = '';
        }, 2200);
    }
    function render() {
        const printers = data.printers || [];
        rows.innerHTML = printers.length ? printers.map(p => `
          <tr>
            <td><strong>${esc(p.name)}</strong><br><span class="sku">${esc(p.id)}</span></td>
            <td>${esc(p.model || '—')}</td>
            <td>${esc(p.nozzle || '—')}</td>
            <td>${p.build_x || '—'} × ${p.build_y || '—'} × ${p.build_z || '—'} mm</td>
            <td>${p.active !== false ? badge('Active', 'ok') : badge('Disabled', 'danger')}</td>
            <td><button type="button" class="iconbtn togglePrinter" data-id="${esc(p.id)}">${p.active !== false ? 'Disable' : 'Enable'}</button> <button type="button" class="iconbtn deletePrinter" data-id="${esc(p.id)}">Delete</button></td>
          </tr>`).join('') : `<tr><td colspan="6"><div class="empty-state">No printers yet. Add your first printer above.</div></td></tr>`;
        document.querySelectorAll('.togglePrinter').forEach(btn => btn.onclick = async () => {
            const p = printers.find(x => x.id === btn.dataset.id);
            if (!p)
                return;
            btn.disabled = true;
            try {
                await cloudFetch('/printers/' + encodeURIComponent(p.id), {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ active: !p.active })
                });
                await refresh();
                render();
            }
            catch (e) {
                flash('Printer was not updated: ' + e.message, 'danger');
                render();
            }
        });
        document.querySelectorAll('.deletePrinter').forEach(btn => btn.onclick = async () => {
            const p = printers.find(x => x.id === btn.dataset.id);
            if (!p)
                return;
            if (!confirm(`Delete ${p.name}?`))
                return;
            btn.disabled = true;
            try {
                await cloudFetch('/printers/' + encodeURIComponent(p.id), { method: 'DELETE' });
                await refresh();
                render();
                flash('Printer deleted', 'warning');
            }
            catch (e) {
                flash('Printer was not deleted: ' + e.message, 'danger');
                render();
            }
        });
    }
    try {
        await refresh();
        render();
        setForgeCloudSync('synced', 'Printers synced');
    }
    catch (e) {
        showCloudRequiredError(e.message);
        setForgeCloudSync('error', e.message);
        return;
    }
    addBtn.onclick = async () => {
        const n = (name.value || '').trim();
        if (!n) {
            flash('Enter a printer name', 'danger');
            name.focus();
            return;
        }
        addBtn.disabled = true;
        try {
            await cloudFetch('/printers', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: n,
                    model: ((model === null || model === void 0 ? void 0 : model.value) || '').trim(),
                    nozzle: ((nozzle === null || nozzle === void 0 ? void 0 : nozzle.value) || '0.4mm').trim() || '0.4mm',
                    build_x: Number((buildX === null || buildX === void 0 ? void 0 : buildX.value) || 0),
                    build_y: Number((buildY === null || buildY === void 0 ? void 0 : buildY.value) || 0),
                    build_z: Number((buildZ === null || buildZ === void 0 ? void 0 : buildZ.value) || 0)
                })
            });
            [name, model].forEach(el => {
                if (el)
                    el.value = '';
            });
            if (nozzle)
                nozzle.value = '0.4mm';
            if (buildX)
                buildX.value = '256';
            if (buildY)
                buildY.value = '256';
            if (buildZ)
                buildZ.value = '256';
            await refresh();
            render();
            flash('Printer added', 'ok');
        }
        catch (e) {
            flash('Printer was not added: ' + e.message, 'danger');
        }
        addBtn.disabled = false;
    };
    let stamp = JSON.stringify(data);
    window.setInterval(async () => {
        if (document.hidden)
            return;
        try {
            const fresh = await cloudFetch('/settings');
            const next = JSON.stringify(fresh);
            if (next === stamp)
                return;
            data = fresh;
            stamp = next;
            render();
            setForgeCloudSync('synced', 'Printers updated live');
        }
        catch (e) {
            setForgeCloudSync('error', e.message || 'Printer sync failed');
        }
    }, 2000);
}
async function settingsAvailabilityPage() {
    installForgeCloudSyncBadge();
    if (!forgeProductionCloudReady) {
        try {
            await hydrateProductionCloud();
        }
        catch (e) {
            showCloudRequiredError(e.message);
            return;
        }
    }
    let s = cloudOperationalState();
    const ps = await load('products');
    const pals = ps.filter(p => p.type === 'pal');
    const q = document.querySelector('#settingsAvailabilitySearch');
    const filter = document.querySelector('#settingsAvailabilityFilter');
    const list = document.querySelector('#settingsAvailabilityList');
    const saleKpi = document.querySelector('#settingsOnSaleKpi');
    const futureKpi = document.querySelector('#settingsFutureKpi');
    const offKpi = document.querySelector('#settingsOffSaleKpi');
    if (!q || !filter || !list)
        return;
    function status(p) {
        var _a;
        const rec = ((_a = s.productAvailability) === null || _a === void 0 ? void 0 : _a[p.sku]) || {};
        if (rec.on_sale === true)
            return 'sale';
        if (rec.release_date && rec.release_date > new Date().toISOString().slice(0, 10))
            return 'future';
        return 'off';
    }
    function render() {
        const text = (q.value || '').toLowerCase();
        const mode = filter.value;
        const all = pals.map(p => { var _a; return ({ p, rec: ((_a = s.productAvailability) === null || _a === void 0 ? void 0 : _a[p.sku]) || {}, status: status(p) }); });
        if (saleKpi)
            saleKpi.textContent = all.filter(x => x.status === 'sale').length;
        if (futureKpi)
            futureKpi.textContent = all.filter(x => x.status === 'future').length;
        if (offKpi)
            offKpi.textContent = all.filter(x => x.status === 'off').length;
        const data = all
            .filter(x => `${x.p.name} ${x.p.sku}`.toLowerCase().includes(text))
            .filter(x => mode === 'all' || x.status === mode)
            .sort((a, b) => (a.status === 'sale' ? -2 : a.status === 'future' ? -1 : 0) - (b.status === 'sale' ? -2 : b.status === 'future' ? -1 : 0) || a.p.name.localeCompare(b.p.name));
        list.innerHTML = data.map(x => `
     <div class="availability-row">
       <div><strong>${esc(x.p.name)}</strong><div class="sku">${x.p.sku}</div></div>
       <div>${x.status === 'sale' ? badge('ON SALE', 'ok') : x.status === 'future' ? badge('FUTURE RELEASE', 'warning') : badge('NOT ON SALE', '')}</div>
       <label>
         <span class="small">Release Date</span>
         <input class="cloudReleaseDate" data-sku="${x.p.sku}" type="date" value="${esc(x.rec.release_date || '')}">
       </label>
       <button class="btn ${x.status === 'sale' ? 'ghost' : ''} cloudToggleSale" data-sku="${x.p.sku}">
         ${x.status === 'sale' ? 'Take Off Sale' : 'Put On Sale'}
       </button>
     </div>`).join('') || '<div class="bench-empty">No Pals match this view.</div>';
        document.querySelectorAll('.cloudToggleSale').forEach(btn => btn.onclick = async () => {
            var _a;
            const sku = btn.dataset.sku;
            const rec = ((_a = s.productAvailability) === null || _a === void 0 ? void 0 : _a[sku]) || { on_sale: false, release_date: '' };
            const next = !Boolean(rec.on_sale);
            const releaseDate = next ? (rec.release_date || new Date().toISOString().slice(0, 10)) : (rec.release_date || null);
            btn.disabled = true;
            const oldText = btn.textContent;
            btn.textContent = 'Saving to Cloud…';
            try {
                await cloudFetchTimed(`/products/${encodeURIComponent(sku)}/availability`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ on_sale: next, release_date: releaseDate })
                }, 10000);
                // Confirm only the products table. Do not wait for unrelated production endpoints.
                const availability = await refreshProductAvailabilityFromD1(s);
                const confirmed = availability.find(p => p.sku === sku);
                if (!confirmed)
                    throw new Error(`${sku} was not returned by D1 after the update.`);
                if (Boolean(confirmed.on_sale) !== next) {
                    throw new Error(`D1 did not confirm the requested On Sale value for ${sku}.`);
                }
                render();
                setForgeCloudSync('synced', `${sku} ${next ? 'On Sale' : 'Not On Sale'} confirmed by D1`);
            }
            catch (e) {
                btn.disabled = false;
                btn.textContent = oldText;
                setForgeCloudSync('error', e.message || 'Availability update failed');
                alert(`Availability was NOT changed in Cloudflare: ${e.message}`);
            }
        });
        document.querySelectorAll('.cloudReleaseDate').forEach(el => el.onchange = async () => {
            var _a;
            const sku = el.dataset.sku;
            const rec = ((_a = s.productAvailability) === null || _a === void 0 ? void 0 : _a[sku]) || { on_sale: false, release_date: '' };
            const nextDate = el.value || null;
            el.disabled = true;
            try {
                await cloudFetchTimed(`/products/${encodeURIComponent(sku)}/availability`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ on_sale: Boolean(rec.on_sale), release_date: nextDate })
                }, 10000);
                const availability = await refreshProductAvailabilityFromD1(s);
                const confirmed = availability.find(p => p.sku === sku);
                if (!confirmed)
                    throw new Error(`${sku} was not returned by D1 after the update.`);
                render();
                setForgeCloudSync('synced', `${sku} release date confirmed by D1`);
            }
            catch (e) {
                el.disabled = false;
                render();
                setForgeCloudSync('error', e.message || 'Release date update failed');
                alert(`Release date was NOT changed in Cloudflare: ${e.message}`);
            }
        });
    }
    q.oninput = render;
    filter.onchange = render;
    render();
    await startForgeLiveSync(async (fresh) => {
        s = JSON.parse(JSON.stringify(fresh));
        render();
    });
}
async function consumablesPage() {
    installForgeCloudSyncBadge();
    if (!forgeProductionCloudReady) {
        try {
            await hydrateProductionCloud();
        }
        catch (e) {
            showCloudRequiredError(e.message);
            return;
        }
    }
    let s = cloudOperationalState();
    const cards = document.querySelector('#consumableCards');
    const history = document.querySelector('#consumableHistory');
    const totalKpi = document.querySelector('#consumableTotalKpi');
    const lowKpi = document.querySelector('#consumableLowKpi');
    const okKpi = document.querySelector('#consumableOkKpi');
    async function runPackAction(action, successMessage) {
        try {
            await cloudFetch('/consumables/pack-action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action })
            });
            const data = await cloudConsumables();
            applyCloudConsumables(s, data);
            setForgeCloudSync('synced', successMessage);
            render();
        }
        catch (e) {
            alert(e.message || e);
        }
    }

    function render() {
        const entries = Object.entries(s.consumables || {});
        const low = entries.filter(([k, x]) => Number(x.stock || 0) <= Number(x.reorder || 0));
        totalKpi.textContent = entries.reduce((a, [k, x]) => a + Number(x.stock || 0), 0);
        lowKpi.textContent = low.length;
        okKpi.textContent = entries.length - low.length;
        cards.innerHTML = entries.map(([key, x]) => {
            const stock = Number(x.stock || 0);
            const reorder = Number(x.reorder || 0);
            const isLow = stock <= reorder;
            return `<div class="consumable-card ${isLow ? 'low' : ''}">
       <div class="consumable-card-head">
         <div><strong>${esc(x.name)}</strong><div class="small">${esc(x.unit || 'units')}</div></div>
         ${isLow ? badge('ORDER', 'danger') : badge('STOCK OK', 'ok')}
       </div>
       <div class="consumable-stock">${stock}</div>
       <div class="small">currently in stock</div>
       <div class="consumable-meter"><span style="width:${Math.min(100, reorder > 0 ? (stock / (reorder * 2)) * 100 : 100)}%"></span></div>
       <div class="consumable-settings">
         <label><span>Reorder Level</span><input class="number reorderLevel" data-key="${key}" type="number" min="0" value="${reorder}"></label>
         <label><span>Qty</span><input class="number restockQty" id="restock-${key}" type="number" min="1" value="25"></label>
         <button class="btn addConsumable" data-key="${key}">Add Stock</button>
         ${key === 'clear_boxes' ? `<button class="btn secondary consumablePackAction" data-action="add_clear_box_pack">+20 Box Pack</button>` : ''}
         ${key === 'card_210gsm' ? `<button class="btn secondary consumablePackAction" data-action="add_card_pack">+50 Card Pack</button>` : ''}
         ${key === 'bottom_cards' ? `<button class="btn secondary consumablePackAction" data-action="make_bottom_cards">Make 6 · Use 1 Card</button>` : ''}
       </div>
       <div class="consumable-adjust">
         <button class="iconbtn adjustConsumable" data-key="${key}" data-d="-1">−1</button>
         <button class="iconbtn adjustConsumable" data-key="${key}" data-d="1">+1</button>
       </div>
     </div>`;
        }).join('');
        document.querySelectorAll('.reorderLevel').forEach(el => el.onchange = async () => {
            const key = el.dataset.key;
            const x = s.consumables[key];
            const reorder = Math.max(0, Number(el.value || 0));
            el.disabled = true;
            try {
                await cloudFetch(`/consumables/${encodeURIComponent(key)}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ reorder })
                });
                x.reorder = reorder;
                render();
            }
            catch (e) {
                alert(`Reorder level was not saved: ${e.message}`);
                render();
            }
        });
        document.querySelectorAll('.addConsumable').forEach(btn => btn.onclick = async () => {
            var _a;
            const key = btn.dataset.key;
            const qty = Math.max(1, Number(((_a = document.querySelector('#restock-' + key)) === null || _a === void 0 ? void 0 : _a.value) || 1));
            btn.disabled = true;
            try {
                await cloudFetch(`/consumables/${encodeURIComponent(key)}/adjust`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ change: qty, type: 'restock', reason: 'Stock added in Forge' })
                });
                const data = await cloudConsumables();
                applyCloudConsumables(s, data);
                render();
            }
            catch (e) {
                alert(`Stock was not added: ${e.message}`);
                render();
            }
        });
        document.querySelectorAll('.consumablePackAction').forEach(btn => btn.onclick = async () => {
            const action = btn.dataset.action;
            btn.disabled = true;
            try {
                if (action === 'add_clear_box_pack')
                    await runPackAction(action, 'Added a delivery pack of 20 flat clear boxes');
                else if (action === 'add_card_pack')
                    await runPackAction(action, 'Added a delivery pack of 50 sheets of 210gsm card');
                else if (action === 'make_bottom_cards')
                    await runPackAction(action, 'Made 6 bottom cards and used 1 sheet of 210gsm card');
            }
            finally {
                btn.disabled = false;
            }
        });

        document.querySelectorAll('.adjustConsumable').forEach(btn => btn.onclick = async () => {
            const key = btn.dataset.key;
            const d = Number(btn.dataset.d || 0);
            btn.disabled = true;
            try {
                await cloudFetch(`/consumables/${encodeURIComponent(key)}/adjust`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ change: d, type: 'adjustment', reason: 'Manual stock adjustment' })
                });
                const data = await cloudConsumables();
                applyCloudConsumables(s, data);
                render();
            }
            catch (e) {
                alert(`Stock adjustment failed: ${e.message}`);
                render();
            }
        });
        history.innerHTML = (s.consumableHistory || []).slice(0, 50).map(h => `<tr>
     <td>${fmtDate(h.created_at)}</td>
     <td><strong>${esc(h.name)}</strong></td>
     <td>${h.change > 0 ? badge(h.type === 'restock' ? 'STOCK IN' : 'ADJUSTMENT', 'ok') : badge('ADJUSTMENT', 'warning')}</td>
     <td><strong>${h.change > 0 ? '+' : ''}${h.change}</strong></td>
   </tr>`).join('') || '<tr><td colspan="4">No consumable movements recorded yet.</td></tr>';
    }
    render();
    await startForgeLiveSync(async (fresh) => {
        s = JSON.parse(JSON.stringify(fresh));
        render();
    });
}
function code128BSvg(text) {
    const patterns = [
        "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
        "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
        "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
        "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
        "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
        "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
        "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
        "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
        "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
        "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
        "114131", "311141", "411131", "211412", "211214", "211232", "2331112"
    ];
    const vals = [104, ...[...text].map(c => { const n = c.charCodeAt(0); return (n >= 32 && n <= 126) ? n - 32 : 31; })];
    let checksum = 104;
    for (let i = 1; i < vals.length; i++)
        checksum += vals[i] * i;
    vals.push(checksum % 103, 106);
    const quiet = 10, module = 1, total = vals.reduce((a, v) => a + [...patterns[v]].reduce((s, n) => s + Number(n), 0), 0) + quiet * 2;
    let x = quiet, bars = "";
    vals.forEach(v => {
        let black = true;
        for (const d of patterns[v]) {
            const w = Number(d);
            if (black)
                bars += `<rect x="${x}" y="0" width="${w}" height="30"/>`;
            x += w;
            black = !black;
        }
    });
    return `<svg class="barcode-svg" viewBox="0 0 ${total} 30" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">${bars}</svg>`;
}
function getBarcodePrinterName() {
    var _a;
    const s = state();
    return ((_a = s.printerRoles) === null || _a === void 0 ? void 0 : _a.barcode) || localStorage.getItem('plaForgeBarcodePrinter') || 'Barcode / Label Printer';
}
function boxPrintHtml(sku, name, paper, orientation) {
    return `<!doctype html><html><head><meta charset="utf-8"><style>
  @page{size:${paper || 'A4'} ${orientation || 'portrait'};margin:8mm}
  html,body{margin:0;background:white;color:black;font-family:Arial,sans-serif}
  .sheet{min-height:90vh;border:3px solid #111;border-radius:14px;padding:40px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center}
  .brand{font-size:28px;font-weight:900;letter-spacing:2px;margin-bottom:45px}.name{font-size:48px;font-weight:900}.sku{font-size:26px;font-weight:800;margin-top:24px}
  </style></head><body><div class="sheet"><div class="brand">PLA PALS</div><div class="name">${esc(name)}</div><div class="sku">${esc(sku)}</div></div></body></html>`;
}
async function queueSilentBoxPrint(sku, name, qty) {
    const d = await cloudFetch('/settings'), s = d.settings || {};
    const bridge = String(s.box_document_bridge || ''), printer = String(s.box_document_printer || '');
    if (!bridge)
        throw new Error('No Print Bridge selected in Settings → Labels & Printing.');
    if (!printer)
        throw new Error('No Box / Document printer selected.');
    return cloudFetch('/print-jobs', { method: 'POST', body: JSON.stringify({
            bridge_id: bridge, printer_name: printer, job_type: 'box_document', title: `${sku} · ${name}`,
            content_html: boxPrintHtml(sku, name, String(s.box_document_paper_size || 'A4'), String(s.box_document_orientation || 'portrait')),
            paper_size: String(s.box_document_paper_size || 'A4'), orientation: String(s.box_document_orientation || 'portrait'),
            copies: Math.max(1, Math.round(Number(qty || 1)))
        }) });
}
function printPalBarcode(sku, name) {
    const printer = getBarcodePrinterName();
    const w = window.open('', '_blank', 'width=520,height=360');
    if (!w) {
        alert('Please allow pop-ups for PLA Forge so the barcode label can open.');
        return;
    }
    const svg = code128BSvg(sku);
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(sku)} · ${esc(name)}</title>
 <style>
 @page{size:50mm 30mm;margin:0}
 html,body{width:50mm;height:30mm;margin:0;padding:0;background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif}
 .label{box-sizing:border-box;width:50mm;height:30mm;padding:2.2mm 3mm 1.5mm;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;overflow:hidden}
 .barcode-wrap{width:42mm;height:11mm;margin-top:.5mm}.barcode-svg{display:block;width:100%;height:100%}
 .sku{font-size:15pt;line-height:1;font-weight:800;margin-top:1.2mm;letter-spacing:.2mm}
 .name{font-size:8.5pt;line-height:1.05;font-weight:600;margin-top:1mm;white-space:nowrap;max-width:44mm;overflow:hidden;text-overflow:ellipsis}
 .controls{position:fixed;left:0;right:0;bottom:0;background:#f1f1f1;padding:8px;font-size:12px;text-align:center}
 @media print{.controls{display:none}}
 </style></head><body>
 <div class="label"><div class="barcode-wrap">${svg}</div><div class="sku">${esc(sku)}</div><div class="name">${esc(name)}</div></div>
 <div class="controls">Selected in Forge: <b>${esc(printer)}</b> · Choose this label printer in the browser print dialog. <button onclick="window.print()">Print 50 × 30 mm Label</button></div>
 </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 250);
}
async function packingStationPage() {
    installForgeCloudSyncBadge();
    if (!forgeProductionCloudReady) {
        try {
            await hydrateProductionCloud();
        }
        catch (e) {
            showCloudRequiredError(e.message);
            return;
        }
    }
    // Packing Station is cloud-only: all inventory and workflow state comes from D1.
    let s = cloudOperationalState();
    const ps = await load('products');
    let demandSnapshot = await loadPalDemandSnapshot(s, ps);
    let pals = ps.filter(p => p.type === 'pal' && isOnSale(s, p.sku));
    function canonicalManufacturingNeed(sku) {
        const d = demandSnapshot.bySku[sku];
        return Math.max(0, Number((d === null || d === void 0 ? void 0 : d.need_to_make) || 0));
    }
    const readyList = document.querySelector('#packingReadyList'), awaitingList = document.querySelector('#packingAwaitingList'), q = document.querySelector('#q');
    const readyCount = document.querySelector('#packingReadyCount'), awaitingCount = document.querySelector('#packingAwaitingCount');
    const damageReworkList = document.querySelector('#damageReworkList');
    const damageReworkCount = document.querySelector('#damageReworkCount');
    function assembled(sku) {
        if (s.assembled && s.assembled[sku] != null)
            return Number(s.assembled[sku] || 0);
        if (s.assemblyStock && s.assemblyStock[sku] != null)
            return Number(s.assemblyStock[sku] || 0);
        if (s.benchStock && s.benchStock[sku] != null)
            return Number(s.benchStock[sku] || 0);
        return 0;
    }
    function setAssembled(sku, v) {
        v = Math.max(0, Number(v || 0));
        if (s.assembled && s.assembled[sku] != null)
            s.assembled[sku] = v;
        else if (s.assemblyStock && s.assemblyStock[sku] != null)
            s.assemblyStock[sku] = v;
        else if (s.benchStock && s.benchStock[sku] != null)
            s.benchStock[sku] = v;
        else {
            s.assembled = s.assembled || {};
            s.assembled[sku] = v;
        }
    }
    function ins(sku) { var _a, _b; return Number(((_b = (_a = s.inserts) === null || _a === void 0 ? void 0 : _a[sku]) === null || _b === void 0 ? void 0 : _b.ready) || 0); }
    function cs(k) { var _a, _b; return Number(((_b = (_a = s.consumables) === null || _a === void 0 ? void 0 : _a[k]) === null || _b === void 0 ? void 0 : _b.stock) || 0); }
    function maxBatch(p) { return Math.max(0, Math.min(assembled(p.sku), ins(p.sku), cs('clear_boxes'), cs('bottom_cards'), cs('stickers'))); }
    function blockers(p) {
        const b = [];
        if (assembled(p.sku) <= 0)
            b.push('Awaiting assembled Pal');
        if (ins(p.sku) <= 0)
            b.push('Awaiting ready insert');
        if (cs('clear_boxes') <= 0)
            b.push('Need clear boxes');
        if (cs('bottom_cards') <= 0)
            b.push('Need bottom card squares');
        if (cs('stickers') <= 0)
            b.push('Need stickers');
        return b;
    }
    function stockStrip(p) { return `<div class="packing-checks"><span class="${assembled(p.sku) > 0 ? 'stock-good' : 'stock-bad'}">${assembled(p.sku)} Assembled</span><span class="${ins(p.sku) > 0 ? 'stock-good' : 'stock-bad'}">${ins(p.sku)} Inserts</span><span>${cs('clear_boxes')} Clear Boxes</span><span>${cs('bottom_cards')} Bottom Cards</span><span>${cs('stickers')} Stickers</span></div>`; }
    const steps = ['Fold Clear Boxes', 'Fold Printed Inserts', 'Place Bottom Cards', 'Place Stickers', 'Put Printed Inserts In', 'Place Pals', 'Close Boxes', 'Print & Apply Barcodes'];
    function reworkRequirements(job) {
        // New v0.8.6 item-based damage jobs can contain several faults on one Pal.
        if (job.type === 'item') {
            const q = Number(job.qty || 1), req = job.requirements || {};
            return {
                clear_boxes: req.box ? q : 0,
                inserts: req.insert ? q : 0,
                pals: req.pal ? q : 0,
                bottom_cards: req.writeoff ? q : 0,
                stickers: req.writeoff ? q : 0,
                label: req.writeoff ? 'Complete replacement' : [
                    req.box ? 'Replace box' : '',
                    req.insert ? 'Replace insert' : '',
                    req.pal ? 'Replace Pal' : ''
                ].filter(Boolean).join(' + ')
            };
        }
        // Backward compatibility for damage jobs created in v0.8.4 / v0.8.5.
        if (job.type === 'box')
            return { clear_boxes: job.qty, inserts: 0, pals: 0, bottom_cards: 0, stickers: 0, label: 'Replace damaged box' };
        if (job.type === 'insert')
            return { clear_boxes: 0, inserts: job.qty, pals: 0, bottom_cards: 0, stickers: 0, label: 'Replace damaged insert' };
        if (job.type === 'pal')
            return { clear_boxes: 0, inserts: 0, pals: job.qty, bottom_cards: 0, stickers: 0, label: 'Replace broken Pal' };
        return { clear_boxes: job.qty, inserts: job.qty, pals: job.qty, bottom_cards: job.qty, stickers: job.qty, label: 'Complete replacement' };
    }
    function reworkReady(job) {
        const r = reworkRequirements(job);
        return cs('clear_boxes') >= r.clear_boxes && cs('bottom_cards') >= r.bottom_cards && cs('stickers') >= r.stickers && ins(job.sku) >= r.inserts && assembled(job.sku) >= r.pals;
    }
    function drawDamageRework() {
        if (!damageReworkList)
            return;
        const jobs = (s.damageReworkJobs || []).filter(x => x.status === 'awaiting_rework');
        if (damageReworkCount)
            damageReworkCount.textContent = `${jobs.length} Job${jobs.length === 1 ? '' : 's'}`;
        damageReworkList.innerHTML = jobs.length ? jobs.map(job => {
            const r = reworkRequirements(job), ready = reworkReady(job);
            return `<div class="packing-card damage-rework-card">
       <div class="assembly-card-head"><div><strong>${esc(job.name)}</strong><div class="sku">${job.sku}</div></div>${ready ? badge('READY FOR REWORK', 'ok') : badge('WAITING', 'warning')}</div>
       <div class="damage-route-title">${esc(r.label)} × ${job.qty}</div>
       <div class="packing-checks">
         ${r.clear_boxes ? `<span class="${cs('clear_boxes') >= r.clear_boxes ? 'stock-good' : 'stock-bad'}">Clear Boxes ${cs('clear_boxes')} / ${r.clear_boxes}</span>` : ''}
         ${r.inserts ? `<span class="${ins(job.sku) >= r.inserts ? 'stock-good' : 'stock-bad'}">Ready Inserts ${ins(job.sku)} / ${r.inserts}</span>` : ''}
         ${r.pals ? `<span class="${assembled(job.sku) >= r.pals ? 'stock-good' : 'stock-bad'}">Assembled Pals ${assembled(job.sku)} / ${r.pals}</span>` : ''}
         ${r.bottom_cards ? `<span class="${cs('bottom_cards') >= r.bottom_cards ? 'stock-good' : 'stock-bad'}">Bottom Cards ${cs('bottom_cards')} / ${r.bottom_cards}</span>` : ''}
         ${r.stickers ? `<span class="${cs('stickers') >= r.stickers ? 'stock-good' : 'stock-bad'}">Stickers ${cs('stickers')} / ${r.stickers}</span>` : ''}
       </div>
       <div class="packing-actions"><button class="btn completeDamageRework" data-id="${job.id}" ${ready ? '' : 'disabled'}>Complete Rework × ${job.qty}</button></div>
     </div>`;
        }).join('') : '<div class="bench-empty">No damaged Cornwall stock is awaiting rework.</div>';
        document.querySelectorAll('.completeDamageRework').forEach(btn => btn.onclick = async () => {
            const job = s.damageReworkJobs.find(x => x.id === btn.dataset.id);
            if (!job)
                return;
            const before = JSON.parse(JSON.stringify(s));
            if (!completeDamageReworkJob(s, job))
                return;
            try {
                await save(s);
                render();
            }
            catch (e) {
                s = before;
                render();
                alert('Damage rework could not be saved to Cloudflare. The change has been rolled back.');
            }
        });
    }
    function render() {
        const text = (q.value || '').toLowerCase();
        const searched = pals.filter(p => `${p.name} ${p.sku}`.toLowerCase().includes(text));
        // READY: anything physically packable can appear here.
        const ready = searched.filter(p => blockers(p).length === 0 && maxBatch(p) > 0);
        // AWAITING: driven strictly from Production Planner demand.
        // Production Planner itself is based on totalNeed(s, sku) > 0.
        // Hide a Pal when the ONLY blocker is "Awaiting assembled Pal";
        // that belongs upstream at The Bench, not at Packing Station.
        const awaiting = searched.filter(p => {
            // Packing Station must use pipeline-aware manufacturing demand.
            // If the target is already covered by assembled / packed / dispatched stock,
            // the Pal must not reappear here as "needed".
            if (canonicalManufacturingNeed(p.sku) <= 0)
                return false;
            const allBlockers = blockers(p);
            const packagingBlockers = allBlockers.filter(x => x !== 'Awaiting assembled Pal');
            return packagingBlockers.length > 0;
        });
        readyCount.textContent = `${ready.length} Pal${ready.length === 1 ? '' : 's'}`;
        awaitingCount.textContent = `${awaiting.length} Pal${awaiting.length === 1 ? '' : 's'}`;
        drawDamageRework();
        readyList.innerHTML = ready.map(p => {
            let job = s.packingJobs[p.sku] || { step: 1, qty: Math.min(1, maxBatch(p)) };
            job.qty = Math.min(Math.max(1, Number(job.qty || 1)), maxBatch(p));
            s.packingJobs[p.sku] = job;
            return `<div class="packing-card ready-pack-card">
      <div class="assembly-card-head"><div><strong>${esc(p.name)}</strong><div class="sku">${p.sku}</div></div>${badge(`${maxBatch(p)} AVAILABLE`, 'ok')}</div>
      ${stockStrip(p)}
      <div class="batch-pack-bar"><div><strong>Batch Pack</strong><div class="small">Choose how many ${esc(p.name)} you are packing together.</div></div><div class="batch-qty"><button class="iconbtn batchMinus" data-sku="${p.sku}">−</button><input class="number batchQty" id="batch-${p.sku}" data-sku="${p.sku}" type="number" min="1" max="${maxBatch(p)}" value="${job.qty}"><button class="iconbtn batchPlus" data-sku="${p.sku}">+</button></div></div>
      <div class="packing-steps">${steps.map((n, i) => `<div class="${job.step > i + 1 ? 'done' : job.step === i + 1 ? 'active' : ''}"><b>${i + 1}</b><span>${n}</span>${job.qty > 1 ? `<em>× ${job.qty}</em>` : ''}</div>`).join('')}</div>
      <div class="packing-actions"><button class="btn nextPackStep" data-sku="${p.sku}">${job.step < 8 ? `Complete Step ${job.step} for all ${job.qty}` : `Print ${job.qty} Label${job.qty === 1 ? '' : 's'} via Pi`}</button>${job.step === 8 ? `<button class="btn secondary barcodeApplied" data-sku="${p.sku}">All ${job.qty} Barcodes Applied · Complete Batch</button>` : ''}</div>
    </div>`;
        }).join('') || '<div class="bench-empty">No Pals are currently ready to pack.</div>';
        awaitingList.innerHTML = awaiting.map(p => {
            const packagingBlockers = blockers(p).filter(x => x !== 'Awaiting assembled Pal');
            return `<div class="packing-card awaiting-pack-card"><div class="assembly-card-head"><div><strong>${esc(p.name)}</strong><div class="sku">${p.sku}</div></div>${badge(`PRODUCTION NEED ${canonicalManufacturingNeed(p.sku)}`, 'warning')}</div>${stockStrip(p)}<div class="packing-blockers">${packagingBlockers.map(x => `<span>! ${esc(x)}</span>`).join('')}</div></div>`;
        }).join('') || '<div class="bench-empty">Nothing in the Production Planner is currently waiting for packaging materials or inserts.</div>';
        document.querySelectorAll('.batchQty').forEach(el => el.onchange = async () => {
            const sku = el.dataset.sku, p = pals.find(x => x.sku === sku), j = s.packingJobs[sku] || { step: 1, qty: 1 };
            const before = Number(j.qty || 1);
            j.qty = Math.min(maxBatch(p), Math.max(1, Number(el.value || 1)));
            s.packingJobs[sku] = j;
            try {
                await save(s);
                render();
            }
            catch (e) {
                j.qty = before;
                render();
                alert('Packing quantity could not be saved to Cloudflare.');
            }
        });
        document.querySelectorAll('.batchMinus,.batchPlus').forEach(b => b.onclick = async () => {
            const sku = b.dataset.sku, p = pals.find(x => x.sku === sku), j = s.packingJobs[sku] || { step: 1, qty: 1 };
            const before = Number(j.qty || 1);
            j.qty = Math.min(maxBatch(p), Math.max(1, before + (b.classList.contains('batchPlus') ? 1 : -1)));
            s.packingJobs[sku] = j;
            try {
                await save(s);
                render();
            }
            catch (e) {
                j.qty = before;
                render();
                alert('Packing quantity could not be saved to Cloudflare.');
            }
        });
        document.querySelectorAll('.nextPackStep').forEach(b => b.onclick = async () => {
            const sku = b.dataset.sku, p = pals.find(x => x.sku === sku), j = s.packingJobs[sku] || { step: 1, qty: 1 };
            if (j.step < 8) {
                const before = Number(j.step || 1);
                j.step++;
                s.packingJobs[sku] = j;
                try {
                    await save(s);
                    render();
                }
                catch (e) {
                    j.step = before;
                    render();
                    alert('Packing step could not be saved to Cloudflare.');
                }
            }
            else {
                const qty = Math.min(Number(j.qty || 1), maxBatch(p));
                if (qty <= 0)
                    return;
                const originalText = b.textContent;
                b.disabled = true;
                b.textContent = 'Sending labels to Pi…';
                try {
                    const result = await cloudFetch('/label-print', {
                        method: 'POST',
                        body: JSON.stringify({ sku, name: p.name, quantity: qty })
                    });
                    if (!result.success || !result.printed)
                        throw new Error(result.error || 'The Pi did not accept the label job.');
                    b.textContent = `Labels sent × ${qty} ✓`;
                    setForgeCloudSync('synced', `${sku} × ${qty} labels sent to Raspberry Pi printer`);
                    setTimeout(() => render(), 900);
                }
                catch (e) {
                    b.disabled = false;
                    b.textContent = originalText;
                    alert(`Labels could not be printed via the Raspberry Pi. The packing batch has NOT been completed.\n\n${e.message || e}`);
                }
            }
        });
        document.querySelectorAll('.barcodeApplied').forEach(b => b.onclick = async () => {
            var _a;
            const sku = b.dataset.sku, p = pals.find(x => x.sku === sku), j = s.packingJobs[sku];
            if (!j || j.step !== 8)
                return;
            const qty = Math.min(j.qty, maxBatch(p));
            if (qty <= 0)
                return;
            b.disabled = true;
            b.textContent = 'Completing pack…';
            try {
                const result = await cloudFetch('/packing/complete', {
                    method: 'POST',
                    body: JSON.stringify({ sku, name: p.name, quantity: qty })
                });
                if (!result.success)
                    throw new Error(result.error || 'Packing completion failed.');

                // Worker owns the authoritative write. Use the returned state
                // immediately so the UI reflects the exact committed D1 result.
                s = JSON.parse(JSON.stringify(result.state || s));
                const consumableData = await cloudConsumables();
                applyCloudConsumables(s, consumableData);
                demandSnapshot = await loadPalDemandSnapshot(s, ps);
                setForgeCloudSync('synced', `${p.name} × ${qty} packed and consumables deducted`);
                render();
            }
            catch (e) {
                b.disabled = false;
                b.textContent = 'Barcode Applied';
                alert(`Packed batch could not be completed. No stock has been consumed.\n\n${e.message || e}`);
            }
        });
    }
    q.oninput = render;
    render();
    await startForgeLiveSync(async (fresh) => {
        s = JSON.parse(JSON.stringify(fresh));
        try {
            demandSnapshot = await loadPalDemandSnapshot(s, ps);
        }
        catch (e) {
            console.error('Packing demand refresh failed', e);
            setForgeCloudSync('error', 'Packing demand could not refresh');
            return;
        }
        pals = ps.filter(p => p.type === 'pal' && isOnSale(s, p.sku));
        render();
    });
}
async function barcodePrinterSettings() {
    installForgeCloudSyncBadge();
    const host = document.querySelector('#barcodePrinterSettings');
    if (!host)
        return;
    let data;
    async function refresh() {
        data = await cloudFetch('/settings');
        return data;
    }
    function printerOptions(current) {
        const printers = (data.printers || []).filter(p => p.active !== false);
        return '<option value="">Choose printer…</option>' +
            printers.map(p => `<option value="${esc(p.id)}" ${current === p.id ? 'selected' : ''}>${esc(p.name)}${p.model ? ` · ${esc(p.model)}` : ''}</option>`).join('') +
            `<option value="__manual" ${current && !printers.some(p => p.id === current) ? 'selected' : ''}>Other / Manual…</option>`;
    }
    function printerControl(key, title, help, defaultW, defaultH) {
        const settings = data.settings || {};
        const current = String(settings[key + '_printer'] || '');
        const width = Number(settings[key + '_width_mm'] || defaultW);
        const height = Number(settings[key + '_height_mm'] || defaultH);
        const printers = (data.printers || []).filter(p => p.active !== false);
        const manual = current && !printers.some(p => p.id === current);
        return `<div class="card label-setting-card">
          <div class="section-title"><div><h2>${esc(title)}</h2><div class="small">${esc(help)}</div></div><span class="badge info">${width} × ${height} mm</span></div>
          <div class="label-settings-grid">
            <label><span>Printer</span><select class="labelPrinterSelect" data-key="${key}">${printerOptions(current)}</select></label>
            <label class="labelManualWrap" data-key="${key}" style="${manual ? '' : 'display:none'}"><span>Manual Printer Name</span><input class="labelManual" data-key="${key}" value="${manual ? esc(current) : ''}"></label>
            <label><span>Width (mm)</span><input class="number labelWidth" data-key="${key}" type="number" min="10" step="1" value="${width}"></label>
            <label><span>Height (mm)</span><input class="number labelHeight" data-key="${key}" type="number" min="10" step="1" value="${height}"></label>
            <button class="btn saveLabelSetting" data-key="${key}">Save to Cloud</button>
          </div>
        </div>`;
    }
    function documentPrinterControl() {
        const settings = data.settings || {};
        const current = String(settings.box_document_printer || '');
        const printers = (data.printers || []).filter(p => p.active !== false);
        const manual = current && !printers.some(p => p.id === current);
        const paper = String(settings.box_document_paper_size || 'A4');
        const orientation = String(settings.box_document_orientation || 'portrait');
        return `<div class="card label-setting-card">
          <div class="section-title"><div><h2>Box / Document Printer</h2><div class="small">Normal printer used for printing box paperwork and packaging printouts.</div></div><span class="badge info">${esc(paper)} · ${esc(orientation)}</span></div>
          <div class="label-settings-grid document-printer-grid">
            <label><span>Printer</span><select id="boxDocumentPrinter">${printerOptions(current)}</select></label>
            <label id="boxDocumentManualWrap" style="${manual ? '' : 'display:none'}"><span>Manual Printer Name</span><input id="boxDocumentManual" value="${manual ? esc(current) : ''}" placeholder="e.g. Office HP / Canon Printer"></label>
            <label><span>Paper Size</span><select id="boxDocumentPaper"><option value="A4" ${paper === 'A4' ? 'selected' : ''}>A4</option><option value="A5" ${paper === 'A5' ? 'selected' : ''}>A5</option><option value="Letter" ${paper === 'Letter' ? 'selected' : ''}>Letter</option></select></label>
            <label><span>Orientation</span><select id="boxDocumentOrientation"><option value="portrait" ${orientation === 'portrait' ? 'selected' : ''}>Portrait</option><option value="landscape" ${orientation === 'landscape' ? 'selected' : ''}>Landscape</option></select></label>
            <button class="btn" id="saveBoxDocumentPrinter">Save to Cloud</button>
          </div>
        </div>`;
    }
    function bind() {
        const boxSel = host.querySelector('#boxDocumentPrinter');
        const boxManualWrap = host.querySelector('#boxDocumentManualWrap');
        if (boxSel)
            boxSel.onchange = () => {
                if (boxManualWrap)
                    boxManualWrap.style.display = boxSel.value === '__manual' ? '' : 'none';
            };
        const boxSave = host.querySelector('#saveBoxDocumentPrinter');
        if (boxSave)
            boxSave.onclick = async () => {
                const manual = host.querySelector('#boxDocumentManual');
                const paper = host.querySelector('#boxDocumentPaper');
                const orientation = host.querySelector('#boxDocumentOrientation');
                const printer = boxSel.value === '__manual' ? String((manual === null || manual === void 0 ? void 0 : manual.value) || '').trim() : boxSel.value;
                boxSave.disabled = true;
                boxSave.textContent = 'Saving…';
                try {
                    await Promise.all([
                        cloudFetch('/settings/box_document_printer', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: printer }) }),
                        cloudFetch('/settings/box_document_paper_size', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: paper.value }) }),
                        cloudFetch('/settings/box_document_orientation', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: orientation.value }) })
                    ]);
                    await refresh();
                    render();
                    setForgeCloudSync('synced', 'Box printer settings saved');
                }
                catch (e) {
                    alert('Box printer settings were not saved: ' + e.message);
                    boxSave.disabled = false;
                    boxSave.textContent = 'Save to Cloud';
                }
            };
        host.querySelectorAll('.labelPrinterSelect').forEach(sel => {
            sel.onchange = () => {
                const key = sel.dataset.key;
                const wrap = host.querySelector(`.labelManualWrap[data-key="${key}"]`);
                if (wrap)
                    wrap.style.display = sel.value === '__manual' ? '' : 'none';
            };
        });
        host.querySelectorAll('.saveLabelSetting').forEach(btn => btn.onclick = async () => {
            const key = btn.dataset.key;
            const sel = host.querySelector(`.labelPrinterSelect[data-key="${key}"]`);
            const manual = host.querySelector(`.labelManual[data-key="${key}"]`);
            const width = host.querySelector(`.labelWidth[data-key="${key}"]`);
            const height = host.querySelector(`.labelHeight[data-key="${key}"]`);
            const printer = sel.value === '__manual' ? String((manual === null || manual === void 0 ? void 0 : manual.value) || '').trim() : sel.value;
            btn.disabled = true;
            btn.textContent = 'Saving…';
            try {
                await Promise.all([
                    cloudFetch(`/settings/${encodeURIComponent(key + '_printer')}`, {
                        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: printer })
                    }),
                    cloudFetch(`/settings/${encodeURIComponent(key + '_width_mm')}`, {
                        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: Number(width.value || 0) })
                    }),
                    cloudFetch(`/settings/${encodeURIComponent(key + '_height_mm')}`, {
                        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: Number(height.value || 0) })
                    })
                ]);
                await refresh();
                render();
                setForgeCloudSync('synced', 'Label settings saved');
            }
            catch (e) {
                alert('Label settings were not saved: ' + e.message);
                btn.disabled = false;
                btn.textContent = 'Save to Cloud';
            }
        });
    }
    function render() {
        host.innerHTML =
            printerControl('barcode', 'Pal Barcode Label', 'Used at Packing Station for the Pal barcode label.', 50, 30) +
                printerControl('filament_label', 'Filament / RFID Spool Label', 'Reserved for the filament intake and RFID workflow.', 50, 30) +
                documentPrinterControl() +
                `<div class="card" id="silentPrintBridgeCard" style="margin-top:14px"><div class="section-title"><div><h2>Silent Box Printing</h2><div class="small">Cloud print queue → Print Bridge computer → physical printer.</div></div><span class="badge info">PRINT BRIDGE</span></div><div id="silentPrintBridgeInner">Loading bridge…</div></div>`;
        bind();
    }
    async function renderBridgePanel() {
        var _u;
        const hostEl = host.querySelector('#silentPrintBridgeInner');
        if (!hostEl)
            return;
        try {
            const [status, settingsData] = await Promise.all([cloudFetch('/print-bridge/status'), cloudFetch('/settings')]);
            const settings = settingsData.settings || {}, bridges = status.bridges || [];
            const selectedId = String(settings.box_document_bridge || '');
            const selected = bridges.find(b => b.id === selectedId) || bridges[0] || null;
            const printers = (selected === null || selected === void 0 ? void 0 : selected.printers) || [];
            const selectedPrinter = String(settings.box_document_printer || '');
            hostEl.innerHTML = `<div class="label-settings-grid">
              <label><span>Print Bridge</span><select id="silentBridgeSelect"><option value="">Select bridge</option>${bridges.map(b => `<option value="${esc(b.id)}"${b.id === selectedId ? ' selected' : ''}>${esc(b.name || b.id)}</option>`).join('')}</select></label>
              <label><span>Box Printer</span><select id="silentPrinterSelect"><option value="">Select printer</option>${printers.map(p => `<option value="${esc(p)}"${p === selectedPrinter ? ' selected' : ''}>${esc(p)}</option>`).join('')}</select></label>
              <button class="btn" id="saveSilentBridge">Save Bridge & Printer</button>
              <button class="btn secondary" id="testSilentBridge" ${selected && selectedPrinter ? '' : 'disabled'}>Test Silent Print</button>
            </div>
            <div class="print-bridge-detail">${status.configured ? '' : '<strong class="danger-text">PRINT_BRIDGE_KEY is not configured in Cloudflare.</strong>'}${selected ? `<span>${esc(selected.platform || '')}</span><span>Last seen ${fmtDate(selected.last_seen)}</span><span>${printers.length} printer(s)</span><span>${((_u = selected.capabilities) === null || _u === void 0 ? void 0 : _u.ready) === false ? 'Bridge not ready' : 'Bridge ready'}</span>` : '<span>No bridge online yet.</span>'}</div>`;
            const bridgeSel = hostEl.querySelector('#silentBridgeSelect');
            bridgeSel.onchange = async () => { await cloudFetch('/settings/box_document_bridge', { method: 'PUT', body: JSON.stringify({ value: bridgeSel.value }) }); render(); await renderBridgePanel(); };
            const saveBtn = hostEl.querySelector('#saveSilentBridge');
            saveBtn.onclick = async () => { const pr = hostEl.querySelector('#silentPrinterSelect').value; await Promise.all([cloudFetch('/settings/box_document_bridge', { method: 'PUT', body: JSON.stringify({ value: bridgeSel.value }) }), cloudFetch('/settings/box_document_printer', { method: 'PUT', body: JSON.stringify({ value: pr }) })]); setForgeCloudSync('synced', 'Silent printer saved'); render(); await renderBridgePanel(); };
            const test = hostEl.querySelector('#testSilentBridge');
            if (test)
                test.onclick = async () => {
                    test.disabled = true;
                    test.textContent = 'Queuing…';
                    try {
                        await queueSilentBoxPrint('TEST001', 'PLA Forge Silent Print Test', 1);
                        test.textContent = 'Queued ✓';
                    }
                    catch (e) {
                        alert(e.message);
                        test.disabled = false;
                        test.textContent = 'Test Silent Print';
                    }
                };
        }
        catch (e) {
            hostEl.innerHTML = `<div class="small danger-text">Bridge status unavailable: ${esc(e.message)}</div>`;
        }
    }
    try {
        await refresh();
        render();
        await renderBridgePanel();
        setForgeCloudSync('synced', 'Label settings synced');
    }
    catch (e) {
        showCloudRequiredError(e.message);
        setForgeCloudSync('error', e.message);
        return;
    }
    let stamp = JSON.stringify(data);
    window.setInterval(async () => {
        if (document.hidden)
            return;
        try {
            const fresh = await cloudFetch('/settings');
            const next = JSON.stringify(fresh);
            if (next === stamp)
                return;
            data = fresh;
            stamp = next;
            render();
            setForgeCloudSync('synced', 'Label settings updated live');
        }
        catch (e) {
            setForgeCloudSync('error', e.message || 'Label settings sync failed');
        }
    }, 2000);
}
function addForgeInventory(s, sku, loc, qty) {
    qty = Number(qty || 0);
    if (!qty)
        return;
    // Current inventory pages use s.inventory where available.
    if (s.inventory) {
        s.inventory[sku] = s.inventory[sku] || {};
        s.inventory[sku][loc] = Number(s.inventory[sku][loc] || 0) + qty;
    }
    // Some earlier builds use s.stock.
    if (s.stock) {
        s.stock[sku] = s.stock[sku] || {};
        s.stock[sku][loc] = Number(s.stock[sku][loc] || 0) + qty;
    }
    // Finished-stock mirror is always maintained.
    s.finishedStock = s.finishedStock || { boat: {}, cornwall: {} };
    s.finishedStock[loc] = s.finishedStock[loc] || {};
    s.finishedStock[loc][sku] = Number(s.finishedStock[loc][sku] || 0) + qty;
}
function damageReworkRequirements(job) {
    const q = Number(job.qty || 1);
    if (job.type === 'item') {
        const req = job.requirements || {};
        const fullFactory = !!(req.box && req.insert && req.pal);
        if (req.pal) {
            // Pal damage always returns to the factory.
            // If all three faults are selected, this becomes a complete factory replacement.
            return {
                route: 'factory',
                full_factory: fullFactory,
                clear_boxes: fullFactory ? q : 0,
                inserts: fullFactory ? q : 0,
                pals: q,
                bottom_cards: fullFactory ? q : 0,
                stickers: fullFactory ? q : 0,
                label: fullFactory ? 'Full factory replacement' : 'Factory replacement Pal'
            };
        }
        // Box / insert only = local Cornwall repair using Cornwall spare stock.
        return {
            route: 'cornwall',
            full_factory: false,
            clear_boxes: req.box ? q : 0,
            inserts: req.insert ? q : 0,
            pals: 0, bottom_cards: 0, stickers: 0,
            label: [req.box ? 'Replace box' : '', req.insert ? 'Replace insert' : ''].filter(Boolean).join(' + ')
        };
    }
    // Legacy jobs.
    if (job.type === 'pal')
        return { route: 'factory', full_factory: false, clear_boxes: 0, inserts: 0, pals: q, bottom_cards: 0, stickers: 0, label: 'Factory replacement Pal' };
    if (job.type === 'writeoff')
        return { route: 'factory', full_factory: true, clear_boxes: q, inserts: q, pals: q, bottom_cards: q, stickers: q, label: 'Full factory replacement' };
    if (job.type === 'box')
        return { route: 'cornwall', full_factory: false, clear_boxes: q, inserts: 0, pals: 0, bottom_cards: 0, stickers: 0, label: 'Replace damaged box' };
    if (job.type === 'insert')
        return { route: 'cornwall', full_factory: false, clear_boxes: 0, inserts: q, pals: 0, bottom_cards: 0, stickers: 0, label: 'Replace damaged insert' };
    return { route: 'cornwall', full_factory: false, clear_boxes: 0, inserts: 0, pals: 0, bottom_cards: 0, stickers: 0, label: 'Rework' };
}
function forgeAssembledQty(s, sku) {
    if (s.assembled && s.assembled[sku] != null)
        return Number(s.assembled[sku] || 0);
    if (s.assemblyStock && s.assemblyStock[sku] != null)
        return Number(s.assemblyStock[sku] || 0);
    if (s.benchStock && s.benchStock[sku] != null)
        return Number(s.benchStock[sku] || 0);
    return 0;
}
function setForgeAssembledQty(s, sku, v) {
    v = Math.max(0, Number(v || 0));
    if (s.assembled && s.assembled[sku] != null)
        s.assembled[sku] = v;
    else if (s.assemblyStock && s.assemblyStock[sku] != null)
        s.assemblyStock[sku] = v;
    else if (s.benchStock && s.benchStock[sku] != null)
        s.benchStock[sku] = v;
    else {
        s.assembled = s.assembled || {};
        s.assembled[sku] = v;
    }
}
function forgeInsertReady(s, sku) { var _a, _b; return Number(((_b = (_a = s.inserts) === null || _a === void 0 ? void 0 : _a[sku]) === null || _b === void 0 ? void 0 : _b.ready) || 0); }
function forgeConsumableStock(s, key) { var _a, _b; return Number(((_b = (_a = s.consumables) === null || _a === void 0 ? void 0 : _a[key]) === null || _b === void 0 ? void 0 : _b.stock) || 0); }
function cornwallBoxStock(s) { var _a; return Number(((_a = s.cornwallReworkStock) === null || _a === void 0 ? void 0 : _a.clear_boxes) || 0); }
function cornwallInsertStock(s, sku) { var _a, _b; return Number(((_b = (_a = s.cornwallReworkStock) === null || _a === void 0 ? void 0 : _a.inserts) === null || _b === void 0 ? void 0 : _b[sku]) || 0); }
function cornwallInsertTarget() {
    return Math.max(0, Number(forgeInsertProductionSettings.cornwall_target || 0));
}
function damageReworkReady(s, job) {
    const r = damageReworkRequirements(job);
    if (r.route === 'cornwall') {
        return cornwallBoxStock(s) >= r.clear_boxes && cornwallInsertStock(s, job.sku) >= r.inserts;
    }
    return forgeAssembledQty(s, job.sku) >= r.pals &&
        forgeInsertReady(s, job.sku) >= r.inserts &&
        forgeConsumableStock(s, 'clear_boxes') >= r.clear_boxes &&
        forgeConsumableStock(s, 'bottom_cards') >= r.bottom_cards &&
        forgeConsumableStock(s, 'stickers') >= r.stickers;
}
function completeCornwallReworkJob(s, job) {
    const r = damageReworkRequirements(job);
    if (!job || job.status !== 'awaiting_rework' || r.route !== 'cornwall' || !damageReworkReady(s, job))
        return false;
    if (r.clear_boxes)
        s.cornwallReworkStock.clear_boxes = Math.max(0, cornwallBoxStock(s) - r.clear_boxes);
    if (r.inserts) {
        s.cornwallReworkStock.inserts[job.sku] = Math.max(0, cornwallInsertStock(s, job.sku) - r.inserts);
    }
    addForgeInventory(s, job.sku, 'cornwall', Number(job.qty || 1));
    job.status = 'complete';
    job.completed_at = new Date().toISOString();
    job.completed_route = 'cornwall';
    s.reworkHistory = s.reworkHistory || [];
    s.reworkHistory.push({ id: makeId(), job_id: job.id, sku: job.sku, name: job.name, qty: Number(job.qty || 1), label: r.label, route: 'Cornwall', created_at: job.completed_at });
    save(s);
    return true;
}
function sendFactoryReworkToDispatch(s, job) {
    const r = damageReworkRequirements(job);
    if (!job || job.status !== 'awaiting_rework' || r.route !== 'factory' || !damageReworkReady(s, job))
        return false;
    // Consume replacement factory components.
    if (r.pals)
        setForgeAssembledQty(s, job.sku, forgeAssembledQty(s, job.sku) - r.pals);
    if (r.inserts) {
        s.inserts[job.sku] = s.inserts[job.sku] || { awaiting_cut: 0, ready: 0 };
        s.inserts[job.sku].ready = Math.max(0, forgeInsertReady(s, job.sku) - r.inserts);
    }
    if (r.clear_boxes)
        s.consumables.clear_boxes.stock = Math.max(0, forgeConsumableStock(s, 'clear_boxes') - r.clear_boxes);
    if (r.bottom_cards)
        s.consumables.bottom_cards.stock = Math.max(0, forgeConsumableStock(s, 'bottom_cards') - r.bottom_cards);
    if (r.stickers)
        s.consumables.stickers.stock = Math.max(0, forgeConsumableStock(s, 'stickers') - r.stickers);
    const now = new Date().toISOString();
    s.awaitingDispatch = s.awaitingDispatch || [];
    s.awaitingDispatch.push({
        id: makeId(),
        sku: job.sku,
        name: job.name,
        qty: Number(job.qty || 1),
        status: 'awaiting_dispatch',
        packed_at: now,
        destination: null,
        locked_destination: 'cornwall',
        rework_return: true,
        rework_job_id: job.id,
        rework_label: r.label
    });
    job.status = 'awaiting_dispatch';
    job.sent_to_dispatch_at = now;
    save(s);
    return true;
}
function recoverAwaitingDispatch(s) {
    s.awaitingDispatch = s.awaitingDispatch || [];
    // v0.8.0 clean state: never recreate dispatch from historical packing records.
    s.awaitingDispatch = s.awaitingDispatch.filter(x => x.status === 'awaiting_dispatch' && Number(x.qty || 0) > 0);
    save(s);
}
async function cloudDispatchState() {
    if (!cloudToken())
        throw new Error('Cloud login required.');
    return await cloudFetchTimed('/dispatch/state', {}, 10000);
}
async function saveDispatchCloudState(s) {
    if (!cloudToken())
        throw new Error('Cloud login required.');
    return await cloudFetchTimed('/dispatch/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: s })
    }, 12000);
}
async function cloudDispatchStamp() {
    if (!cloudToken())
        return null;
    try {
        const d = await cloudFetchTimed('/dispatch/sync-status', {}, 8000);
        return d.updated_at || null;
    }
    catch (e) {
        return null;
    }
}
function applyDispatchCloudState(data) {
    const s = blankOperationalState();
    Object.assign(s, JSON.parse(JSON.stringify((data === null || data === void 0 ? void 0 : data.state) || {})));
    s.targets = s.targets || {};
    s.awaitingDispatch = s.awaitingDispatch || [];
    s.transfers = s.transfers || [];
    s.packingHistory = s.packingHistory || [];
    s.damageHistory = s.damageHistory || [];
    s.damageReworkJobs = s.damageReworkJobs || [];
    s.damageInsertDemand = s.damageInsertDemand || {};
    s.reworkHistory = s.reworkHistory || [];
    s.cornwallReworkStock = s.cornwallReworkStock || { clear_boxes: 0, inserts: {} };
    s.cornwallReworkStock.inserts = s.cornwallReworkStock.inserts || {};
    s.cornwallInsertReplenishment = s.cornwallInsertReplenishment || {};
    return s;
}
async function deliveriesPage() {
    installForgeCloudSyncBadge();
    let initial;
    try {
        initial = await cloudDispatchState();
    }
    catch (e) {
        showCloudRequiredError(e.message);
        setForgeCloudSync('error', e.message);
        return;
    }
    let s = applyDispatchCloudState(initial);
    let dispatchShopifyBySku = {};
    let dispatchTargetDefaults = { boat: 3, cornwall: 3 };
    let dispatchTargetOverrides = {};
    async function refreshDispatchShopify() {
        try {
            const [palInv, settingsData] = await Promise.all([
                cloudFetch('/shopify/pal-inventory'),
                cloudFetch('/settings')
            ]);
            dispatchShopifyBySku = Object.fromEntries((palInv.inventory || []).map(x => [x.sku, x]));
            dispatchTargetDefaults = stockTargetDefaultsFromSettings(settingsData.settings || {});
            dispatchTargetOverrides = palTargetOverrideMap(settingsData.settings || {});
        }
        catch (e) {
            dispatchShopifyBySku = {};
        }
    }
    function dispatchConfiguredTarget(sku, loc) {
        if ((dispatchTargetOverrides === null || dispatchTargetOverrides === void 0 ? void 0 : dispatchTargetOverrides[sku]) && Object.prototype.hasOwnProperty.call(dispatchTargetOverrides[sku], loc)) {
            return Math.max(0, Number(dispatchTargetOverrides[sku][loc] || 0));
        }
        return Math.max(0, Number(dispatchTargetDefaults[loc] || 0));
    }
    function dispatchShopifyStock(sku, loc) {
        var _p, _q;
        return Math.max(0, Number(((_q = (_p = dispatchShopifyBySku[sku]) === null || _p === void 0 ? void 0 : _p[loc]) === null || _q === void 0 ? void 0 : _q.available) || 0));
    }
    function dispatchNeed(sku, loc) {
        return Math.max(0, dispatchConfiguredTarget(sku, loc) - dispatchShopifyStock(sku, loc));
    }
    async function syncTransferToShopify(transfer) {
        if (!transfer || transfer.item_type === 'cornwall_insert_spare')
            return true;
        if (transfer.shopify_sync_status === 'synced')
            return true;
        try {
            await cloudFetch('/shopify/inventory/dispatch', {
                method: 'POST',
                body: JSON.stringify({
                    sku: transfer.sku,
                    location: transfer.destination,
                    qty: Number(transfer.qty || 0),
                    transfer_id: transfer.id
                })
            });
            transfer.shopify_sync_status = 'synced';
            transfer.shopify_synced_at = new Date().toISOString();
            transfer.shopify_sync_error = null;
            await refreshDispatchShopify();
            return true;
        }
        catch (e) {
            transfer.shopify_sync_status = 'failed';
            transfer.shopify_sync_error = e.message;
            return false;
        }
    }
    let dispatchStamp = initial.updated_at || null;
    recoverAwaitingDispatch(s);
    setForgeCloudSync('synced', 'Dispatch synced');
    const unassigned = document.querySelector('#awaitingDispatch');
    const awaiting = document.querySelector('#awaitingDeliveries');
    const dispatchKpi = document.querySelector('#awaitingDispatchKpi');
    const awaitKpi = document.querySelector('#awaitingDeliveryKpi');
    const boatKpi = document.querySelector('#boatFinishedKpi');
    const cornKpi = document.querySelector('#cornwallFinishedKpi');
    async function persistDispatch(message = 'Dispatch update') {
        try {
            const result = await saveDispatchCloudState(s);
            dispatchStamp = result.updated_at || dispatchStamp;
            setForgeCloudSync('synced', message + ' saved');
            return true;
        }
        catch (e) {
            alert(`${message} could not be saved to Cloudflare: ${e.message}`);
            setForgeCloudSync('error', e.message);
            try {
                const fresh = await cloudDispatchState();
                s = applyDispatchCloudState(fresh);
                dispatchStamp = fresh.updated_at || dispatchStamp;
                recoverAwaitingDispatch(s);
            }
            catch (_) { }
            render();
            return false;
        }
    }
    function groupedDispatch() {
        const map = {};
        const seenDispatch = new Set();
        (s.awaitingDispatch || []).filter(x => x.status === 'awaiting_dispatch' && Number(x.qty || 0) > 0).forEach(x => {
            const identity = x.source_history_id ? `history:${x.source_history_id}` : `record:${x.id}`;
            if (seenDispatch.has(identity))
                return;
            seenDispatch.add(identity);
            const groupKey = x.item_type === 'cornwall_insert_spare'
                ? `${x.sku}|cornwall-insert`
                : x.rework_return ? `${x.sku}|rework|${x.rework_job_id || x.id}` : `${x.sku}|normal`;
            if (!map[groupKey])
                map[groupKey] = {
                    key: groupKey, sku: x.sku, name: x.name || x.sku, qty: 0, records: [],
                    oldest: x.packed_at || x.created_at || '',
                    locked_destination: x.locked_destination || null,
                    rework_return: !!x.rework_return,
                    rework_job_id: x.rework_job_id || null,
                    rework_label: x.rework_label || '',
                    item_type: x.item_type || 'pal',
                    supply_label: x.supply_label || ''
                };
            const g = map[groupKey];
            g.qty += Number(x.qty || 0);
            g.records.push(x);
            const dt = x.packed_at || x.created_at || '';
            if (dt && (!g.oldest || dt < g.oldest))
                g.oldest = dt;
        });
        return Object.values(map).sort((a, b) => (dispatchNeed(b.sku, 'boat') + dispatchNeed(b.sku, 'cornwall')) - (dispatchNeed(a.sku, 'boat') + dispatchNeed(a.sku, 'cornwall')) || a.name.localeCompare(b.name));
    }
    function consumeDispatchRecords(group, qty) {
        let remaining = Math.max(0, Number(qty || 0));
        const expectedType = group.item_type || 'pal';
        const records = [...(group.records || [])]
            .filter(r => (r.item_type || 'pal') === expectedType && r.status === 'awaiting_dispatch')
            .sort((a, b) => (a.packed_at || a.created_at || '').localeCompare(b.packed_at || b.created_at || ''));
        const available = records.reduce((a, r) => a + Number(r.qty || 0), 0);
        if (remaining > available)
            return false;
        records.forEach(r => {
            if (remaining <= 0)
                return;
            const used = Math.min(Number(r.qty || 0), remaining);
            r.qty = Number(r.qty || 0) - used;
            remaining -= used;
            if (r.qty <= 0)
                r.status = 'allocated';
        });
        return remaining === 0;
    }
    function allocationCard(g) {
        const boatStock = dispatchShopifyStock(g.sku, 'boat'), cornStock = dispatchShopifyStock(g.sku, 'cornwall');
        const boatTarget = dispatchConfiguredTarget(g.sku, 'boat'), cornTarget = dispatchConfiguredTarget(g.sku, 'cornwall');
        const boatNeed = dispatchNeed(g.sku, 'boat'), cornNeed = dispatchNeed(g.sku, 'cornwall');
        if (g.item_type === 'cornwall_insert_spare') {
            return `<div class="dispatch-compact-row dispatch-compact-spare">
       <div class="dispatch-compact-product">
         <strong>${esc(g.name)} Insert</strong><span class="sku">${g.sku}</span>
         <span class="dispatch-compact-note">Cornwall rework spare</span>
       </div>
       <div class="dispatch-compact-qty"><span>Ready</span><strong>${g.qty}</strong></div>
       <div class="dispatch-route-pill">→ Kitsune Cornwall</div>
       <button class="btn dispatchCornwallInsertSpare" data-key="${esc(g.key)}">Dispatch</button>
     </div>`;
        }
        if (g.locked_destination === 'cornwall') {
            return `<div class="dispatch-compact-row dispatch-compact-rework">
       <div class="dispatch-compact-product">
         <strong>${esc(g.name)}</strong><span class="sku">${g.sku}</span>
         <span class="dispatch-compact-note">${esc(g.rework_label || 'Factory rework return')}</span>
       </div>
       <div class="dispatch-compact-qty"><span>Ready</span><strong>${g.qty}</strong></div>
       <div class="dispatch-route-pill">→ Kitsune Cornwall</div>
       <button class="btn dispatchReworkCornwall" data-key="${esc(g.key)}">Dispatch</button>
     </div>`;
        }
        const defaultBoat = Math.min(g.qty, boatNeed);
        const defaultCorn = Math.min(Math.max(0, g.qty - defaultBoat), cornNeed);
        return `<div class="dispatch-compact-row dispatch-compact-pal">
     <div class="dispatch-compact-product">
       <strong>${esc(g.name)}</strong><span class="sku">${g.sku}</span>
       <span class="dispatch-compact-note">Packed ${fmtDate(g.oldest)}</span>
     </div>
     <div class="dispatch-compact-qty"><span>Ready</span><strong>${g.qty}</strong></div>
     <label class="dispatch-compact-destination">
       <span><strong>Boat</strong><small>${boatStock}/${boatTarget} · need ${boatNeed}</small></span>
       <input class="number dispatchBoatQty" id="boat-${g.sku}" data-sku="${g.sku}" type="number" min="0" max="${g.qty}" value="${defaultBoat}">
     </label>
     <label class="dispatch-compact-destination">
       <span><strong>Cornwall</strong><small>${cornStock}/${cornTarget} · need ${cornNeed}</small></span>
       <input class="number dispatchCornQty" id="cornwall-${g.sku}" data-sku="${g.sku}" type="number" min="0" max="${g.qty}" value="${defaultCorn}">
     </label>
     <div class="dispatch-compact-action">
       <div class="dispatch-allocation-summary" id="summary-${g.sku}"></div>
       <button class="btn allocateSplit" data-key="${esc(g.key)}" data-sku="${g.sku}">Confirm</button>
     </div>
   </div>`;
    }
    function normaliseDamageItems(t) {
        t.qcDamagedItems = t.qcDamagedItems || [];
        const wanted = Math.max(0, Math.min(Number(t.qty || 0), Number(t.qcDraftDamaged || 0)));
        while (t.qcDamagedItems.length < wanted) {
            t.qcDamagedItems.push({
                id: makeId(),
                box: false,
                insert: false,
                pal: false,
                writeoff: false
            });
        }
        if (t.qcDamagedItems.length > wanted)
            t.qcDamagedItems = t.qcDamagedItems.slice(0, wanted);
        return t.qcDamagedItems;
    }
    function issueLabel(item) {
        if (item.box && item.insert && item.pal)
            return 'Full Factory Replacement';
        const a = [];
        if (item.box)
            a.push('Box Damaged');
        if (item.insert)
            a.push('Insert Damaged');
        if (item.pal)
            a.push('Pal Broken');
        return a.length ? a.join(' + ') : 'No issue selected';
    }
    function damagedItemsHtml(t) {
        const items = normaliseDamageItems(t);
        return items.map((item, idx) => `<div class="damaged-item-card ${item.writeoff ? 'writeoff-item' : ''}">
      <div class="damaged-item-head">
        <div><strong>Damaged Item ${idx + 1}</strong><div class="small">${esc(issueLabel(item))}</div></div>
        ${item.box && item.insert && item.pal ? badge('FULL FACTORY', 'danger') : item.pal ? badge('FACTORY', 'warning') : badge('CORNWALL REPAIR', 'info')}
      </div>
      <div class="damage-toggle-grid">
        <label class="damage-toggle ${item.box ? 'selected' : ''}">
          <input class="damageFault" data-id="${t.id}" data-item="${item.id}" data-field="box" type="checkbox" ${item.box ? 'checked' : ''}>
          <span>Box Damaged</span>
        </label>
        <label class="damage-toggle ${item.insert ? 'selected' : ''}">
          <input class="damageFault" data-id="${t.id}" data-item="${item.id}" data-field="insert" type="checkbox" ${item.insert ? 'checked' : ''}>
          <span>Insert Damaged</span>
        </label>
        <label class="damage-toggle ${item.pal ? 'selected' : ''}">
          <input class="damageFault" data-id="${t.id}" data-item="${item.id}" data-field="pal" type="checkbox" ${item.pal ? 'checked' : ''}>
          <span>Pal Broken</span>
        </label>

      </div>
   </div>`).join('');
    }
    function deliveryCard(t) {
        const qty = Number(t.qty || 0);
        t.qcDraftDamaged = Math.max(0, Math.min(qty, Number(t.qcDraftDamaged || 0)));
        const damaged = t.qcDraftDamaged;
        const good = qty - damaged;
        normaliseDamageItems(t);
        return `<div class="delivery-card qc-delivery-card">
     <div class="delivery-main">
       <strong>${esc(t.name)}</strong>
       <div class="sku">${t.sku}</div>
       <div class="small">Dispatched ${fmtDate(t.dispatched_at || t.packed_at)} · Shipment Qty ${qty}</div>
       ${t.shopify_sync_status === 'failed' ? `<div class="small danger-text">Shopify sync failed: ${esc(t.shopify_sync_error || 'Unknown error')}</div>` : t.shopify_sync_status === 'synced' ? `<div class="small success-text">Shopify stock synced${t.destination === 'cornwall' ? ' after Cornwall receipt/QC' : ' at dispatch'}.</div>` :
            t.shopify_sync_status === 'awaiting_receipt' ? '<div class="small">Shopify stock waiting for Cornwall receipt + QC.</div>' : ''}
     </div>

     <div class="delivery-qc">
       <label><span>Good Condition</span><input class="number goodQty" value="${good}" disabled></label>
       <label><span>Damaged Items</span><input class="number damagedQty" id="damaged-${t.id}" data-id="${t.id}" type="number" min="0" max="${qty}" value="${damaged}"></label>
     </div>

     ${damaged > 0 ? `<div class="damage-breakdown">
       <div class="damage-breakdown-head">
         <div><strong>Damage by Item</strong><div class="small">Each damaged physical Pal appears once. Select every fault that applies to that item.</div></div>
         <span class="badge danger">${damaged} DAMAGED</span>
       </div>
       <div class="damaged-items-list">${damagedItemsHtml(t)}</div>
     </div>` : ''}

     <div class="delivery-qc-footer">
       <div class="small qc-summary" id="qc-summary-${t.id}"></div>
       <button class="btn confirmDeliveryQC" data-id="${t.id}">Confirm Delivery</button>
     </div>
   </div>`;
    }
    function render() {
        var _a, _b;
        const groups = groupedDispatch();
        const awaitingTransfers = (s.transfers || []).filter(t => t.destination === 'cornwall' && t.status === 'awaiting_delivery');
        dispatchKpi.textContent = groups.reduce((a, g) => a + Number(g.qty || 0), 0);
        awaitKpi.textContent = awaitingTransfers.reduce((a, t) => a + Number(t.qty || 0), 0);
        boatKpi.textContent = Object.values(((_a = s.finishedStock) === null || _a === void 0 ? void 0 : _a.boat) || {}).reduce((a, v) => a + Number(v || 0), 0);
        cornKpi.textContent = Object.values(((_b = s.finishedStock) === null || _b === void 0 ? void 0 : _b.cornwall) || {}).reduce((a, v) => a + Number(v || 0), 0);
        unassigned.innerHTML = groups.length ? groups.map(allocationCard).join('') : '<div class="bench-empty">No finished Pals are awaiting dispatch allocation.</div>';
        awaiting.innerHTML = awaitingTransfers.length ? awaitingTransfers.map(t => {
            if (t.transfer_type === 'cornwall_insert_spare') {
                return `<div class="delivery-card qc-delivery-card">
         <div class="delivery-main"><strong>${esc(t.name)} Insert</strong><div class="sku">${t.sku}</div><div class="small">Cornwall spare-stock replenishment · Qty ${t.qty}</div></div>
         <div class="delivery-qc-footer">
           <div class="small">Confirm the spare insert has arrived at Cornwall.</div>
           <button class="btn receiveCornwallInsertSpare" data-id="${t.id}">Confirm Received</button>
         </div>
       </div>`;
            }
            return deliveryCard(t);
        }).join('') : '<div class="bench-empty">No stock is awaiting delivery to Cornwall.</div>';
        function updateSummary(sku) {
            var _a, _b;
            const g = groups.find(x => x.sku === sku && (x.item_type || 'pal') === 'pal' && !x.locked_destination && !x.rework_return);
            if (!g)
                return;
            const b = Math.max(0, Number(((_a = document.querySelector('#boat-' + sku)) === null || _a === void 0 ? void 0 : _a.value) || 0));
            const c = Math.max(0, Number(((_b = document.querySelector('#cornwall-' + sku)) === null || _b === void 0 ? void 0 : _b.value) || 0));
            const total = b + c;
            const el = document.querySelector('#summary-' + sku);
            if (!el)
                return;
            if (total > g.qty)
                el.innerHTML = `<strong class="danger-text">Too many selected: ${total} / ${g.qty}</strong>`;
            else
                el.innerHTML = `Boat <strong>${b}</strong> · Cornwall <strong>${c}</strong> · Leave for later <strong>${g.qty - total}</strong>`;
        }
        document.querySelectorAll('.dispatchBoatQty,.dispatchCornQty').forEach(el => el.oninput = () => updateSummary(el.dataset.sku));
        groups.filter(g => (g.item_type || 'pal') === 'pal' && !g.locked_destination && !g.rework_return).forEach(g => updateSummary(g.sku));
        document.querySelectorAll('.dispatchCornwallInsertSpare').forEach(btn => btn.onclick = async () => {
            const g = groups.find(x => x.key === btn.dataset.key);
            if (!g)
                return;
            if (!consumeDispatchRecords(g, g.qty)) {
                alert('Could not dispatch this Cornwall spare insert.');
                return;
            }
            const now = new Date().toISOString();
            s.transfers.push({
                id: makeId(),
                transfer_type: 'cornwall_insert_spare',
                sku: g.sku,
                name: g.name,
                qty: g.qty,
                destination: 'cornwall',
                status: 'awaiting_delivery',
                packed_at: g.oldest,
                dispatched_at: now,
                received_at: null
            });
            await persistDispatch('Dispatch update');
            render();
        });
        document.querySelectorAll('.dispatchReworkCornwall').forEach(btn => btn.onclick = async () => {
            const g = groups.find(x => x.key === btn.dataset.key);
            if (!g)
                return;
            if (!consumeDispatchRecords(g, g.qty)) {
                alert('Could not dispatch this rework return.');
                return;
            }
            const now = new Date().toISOString();
            // Do NOT add Cornwall inventory yet. The replacement must be physically received first.
            s.transfers.push({
                id: makeId(), sku: g.sku, name: g.name, qty: g.qty, destination: 'cornwall',
                status: 'awaiting_delivery', packed_at: g.oldest, dispatched_at: now, received_at: null,
                good_qty: null, damaged_qty: null, qcDraftDamaged: 0, qcDamagedItems: [],
                rework_return: true, rework_job_id: g.rework_job_id, rework_label: g.rework_label
            });
            await persistDispatch('Dispatch update');
            render();
        });
        document.querySelectorAll('.allocateSplit').forEach(btn => btn.onclick = async () => {
            var _a, _b;
            const g = groups.find(x => x.key === btn.dataset.key);
            if (!g)
                return;
            const boatQty = Math.max(0, Math.floor(Number(((_a = document.querySelector('#boat-' + g.sku)) === null || _a === void 0 ? void 0 : _a.value) || 0)));
            const cornQty = Math.max(0, Math.floor(Number(((_b = document.querySelector('#cornwall-' + g.sku)) === null || _b === void 0 ? void 0 : _b.value) || 0)));
            const total = boatQty + cornQty;
            if (total <= 0) {
                alert('Choose a quantity for Boat and/or Cornwall.');
                return;
            }
            if (total > g.qty) {
                alert(`Only ${g.qty} ready to dispatch.`);
                return;
            }
            if (!consumeDispatchRecords(g, total)) {
                alert('Could not allocate this dispatch quantity.');
                return;
            }
            const now = new Date().toISOString();
            if (boatQty > 0) {
                addForgeInventory(s, g.sku, 'boat', boatQty);
                const boatTransfer = { id: makeId(), sku: g.sku, name: g.name, qty: boatQty, destination: 'boat', status: 'received', packed_at: g.oldest, dispatched_at: now, received_at: now, good_qty: boatQty, damaged_qty: 0, shopify_sync_status: 'pending', shopify_sync_error: null };
                s.transfers.push(boatTransfer);
            }
            if (cornQty > 0) {
                // Cornwall remains IN TRANSIT until Cornwall receives and QC checks it.
                // Do not add it to sellable Forge or Shopify Cornwall stock here.
                const cornTransfer = {
                    id: makeId(), sku: g.sku, name: g.name, qty: cornQty, destination: 'cornwall',
                    status: 'awaiting_delivery', packed_at: g.oldest, dispatched_at: now, received_at: null,
                    good_qty: null, damaged_qty: null, qcDraftDamaged: 0, qcDamagedItems: [],
                    shopify_sync_status: 'awaiting_receipt', shopify_sync_error: null
                };
                s.transfers.push(cornTransfer);
            }
            const saved = await persistDispatch('Dispatch update');
            if (saved) {
                // Boat becomes sellable immediately at dispatch.
                // Cornwall is deliberately excluded until its delivery is received and QC checked.
                const syncTargets = (s.transfers || []).filter(t => t.dispatched_at === now &&
                    t.sku === g.sku &&
                    t.destination === 'boat' &&
                    t.shopify_sync_status === 'pending');
                let allSynced = true;
                for (const transfer of syncTargets) {
                    const ok = await syncTransferToShopify(transfer);
                    if (!ok)
                        allSynced = false;
                }
                await persistDispatch(allSynced ? 'Dispatch + Shopify sync' : 'Dispatch saved · Shopify sync needs attention');
                if (!allSynced) {
                    const failed = syncTargets.filter(t => t.shopify_sync_status === 'failed');
                    alert('The dispatch was saved, but Shopify Boat stock could not update for ' + failed.length +
                        ' stock movement' + (failed.length === 1 ? '' : 's') + '.\n\n' +
                        failed.map(t => `${t.name} → ${t.destination}: ${t.shopify_sync_error}`).join('\n') +
                        '\n\nThe transfer remains marked for Shopify retry and will not be double-added.');
                }
            }
            render();
        });
        function updateQcSummary(t) {
            const damaged = Number(t.qcDraftDamaged || 0);
            const good = Number(t.qty || 0) - damaged;
            const items = normaliseDamageItems(t);
            const incomplete = items.filter(item => !item.box && !item.insert && !item.pal).length;
            const el = document.querySelector('#qc-summary-' + t.id);
            if (!el)
                return;
            if (damaged === 0) {
                el.innerHTML = `All <strong>${good}</strong> confirmed in good condition.`;
            }
            else if (incomplete > 0) {
                el.innerHTML = `<strong class="danger-text">${incomplete} damaged item${incomplete === 1 ? ' has' : 's have'} no fault selected.</strong>`;
            }
            else {
                el.innerHTML = `<strong>${good}</strong> good · <strong class="danger-text">${damaged} damaged</strong> · all damaged items classified.`;
            }
        }
        document.querySelectorAll('.receiveCornwallInsertSpare').forEach(btn => btn.onclick = async () => {
            const t = s.transfers.find(x => x.id === btn.dataset.id);
            if (!t)
                return;
            s.cornwallReworkStock = s.cornwallReworkStock || { clear_boxes: 0, inserts: {} };
            s.cornwallReworkStock.inserts = s.cornwallReworkStock.inserts || {};
            s.cornwallReworkStock.inserts[t.sku] = cornwallInsertStock(s, t.sku) + Number(t.qty || 0);
            t.status = 'received';
            t.received_at = new Date().toISOString();
            await persistDispatch('Dispatch update');
            render();
        });
        document.querySelectorAll('.damagedQty').forEach(el => el.onchange = async () => {
            const t = s.transfers.find(x => x.id === el.dataset.id);
            if (!t)
                return;
            t.qcDraftDamaged = Math.max(0, Math.min(Number(t.qty || 0), Math.floor(Number(el.value || 0))));
            normaliseDamageItems(t);
            await persistDispatch('Dispatch update');
            render();
        });
        document.querySelectorAll('.damageFault').forEach(el => el.onchange = async () => {
            const t = s.transfers.find(x => x.id === el.dataset.id);
            if (!t)
                return;
            const item = (t.qcDamagedItems || []).find(x => x.id === el.dataset.item);
            if (!item)
                return;
            const field = el.dataset.field;
            item[field] = el.checked;
            // No separate "write off" option. Selecting all three faults automatically
            // becomes a full factory replacement.
            item.writeoff = false;
            await persistDispatch('Dispatch update');
            render();
        });
        awaitingTransfers.filter(t => t.transfer_type !== 'cornwall_insert_spare').forEach(updateQcSummary);
        document.querySelectorAll('.confirmDeliveryQC').forEach(btn => btn.onclick = async () => {
            const t = s.transfers.find(x => x.id === btn.dataset.id);
            if (!t)
                return;
            s.damageHistory = s.damageHistory || [];
            s.damageReworkJobs = s.damageReworkJobs || [];
            s.damageInsertDemand = s.damageInsertDemand || {};
            const damaged = Math.max(0, Math.min(Number(t.qty || 0), Number(t.qcDraftDamaged || 0)));
            const good = Number(t.qty || 0) - damaged;
            const items = normaliseDamageItems(t);
            const incomplete = items.filter(item => !item.box && !item.insert && !item.pal);
            if (incomplete.length) {
                alert(`Please select at least one fault for each damaged item.`);
                return;
            }
            const now = new Date().toISOString();
            t.status = 'received';
            t.received_at = now;
            t.good_qty = good;
            t.damaged_qty = damaged;
            t.damage_items = items.map(x => (Object.assign({}, x)));
            // Cornwall stock becomes sellable only after physical receipt + QC.
            // Add only accepted/good Pals. Damaged Pals remain outside sellable stock.
            if (good > 0 && !t.rework_return) {
                addForgeInventory(s, t.sku, 'cornwall', good);
            }
            if (t.rework_return) {
                // Rework replacements were NOT pre-added to Cornwall inventory.
                // Add only the quantity received in good condition.
                if (good > 0)
                    addForgeInventory(s, t.sku, 'cornwall', good);
                const originalJob = (s.damageReworkJobs || []).find(x => x.id === t.rework_job_id);
                if (originalJob) {
                    originalJob.status = damaged > 0 ? 'complete_with_transit_damage' : 'complete';
                    originalJob.completed_at = now;
                    originalJob.completed_route = 'factory_dispatch';
                    s.reworkHistory = s.reworkHistory || [];
                    s.reworkHistory.push({ id: makeId(), job_id: originalJob.id, sku: originalJob.sku, name: originalJob.name, qty: good, label: damageReworkRequirements(originalJob).label, route: 'Factory → Dispatch → Cornwall', created_at: now });
                }
            }
            if (damaged > 0) {
                // Damaged Cornwall items were never added to sellable stock,
                // so there is nothing to subtract here.
                items.forEach((item, index) => {
                    // Each physical damaged Pal creates ONE rework job with a list of requirements.
                    const requirements = {
                        box: !!item.box,
                        insert: !!item.insert,
                        pal: !!item.pal,
                        writeoff: !!(item.box && item.insert && item.pal)
                    };
                    s.damageReworkJobs.push({
                        id: makeId(),
                        transfer_id: t.id,
                        damaged_item_index: index + 1,
                        sku: t.sku,
                        name: t.name,
                        qty: 1,
                        type: 'item',
                        requirements,
                        status: 'awaiting_rework',
                        created_at: now,
                        location: 'cornwall'
                    });
                    if (requirements.insert && requirements.pal && requirements.box) {
                        // All three faults selected = full factory replacement, including a new insert.
                        s.damageInsertDemand[t.sku] = Number(s.damageInsertDemand[t.sku] || 0) + 1;
                    }
                    s.damageHistory.push({
                        id: makeId(),
                        transfer_id: t.id,
                        damaged_item_index: index + 1,
                        sku: t.sku,
                        name: t.name,
                        qty: 1,
                        requirements: Object.assign({}, requirements),
                        location: 'cornwall',
                        created_at: now
                    });
                });
            }
            delete t.qcDraftDamaged;
            delete t.qcDamagedItems;
            // Save the physical receipt/QC result before attempting Shopify.
            t.shopify_sync_status = good > 0 ? 'pending' : 'not_required';
            t.shopify_sync_error = null;
            const receiptSaved = await persistDispatch('Cornwall delivery received');
            if (receiptSaved && good > 0) {
                // syncTransferToShopify normally uses transfer.qty.
                // For Cornwall receipt, only accepted GOOD quantity is sellable.
                const originalQty = t.qty;
                t.qty = good;
                const synced = await syncTransferToShopify(t);
                t.qty = originalQty;
                if (synced) {
                    t.shopify_sync_status = 'synced';
                    t.shopify_synced_qty = good;
                    t.shopify_synced_at = new Date().toISOString();
                    t.shopify_sync_error = null;
                    await persistDispatch('Cornwall received + Shopify synced');
                }
                else {
                    t.shopify_sync_status = 'failed';
                    await persistDispatch('Cornwall received · Shopify sync needs attention');
                    alert(`Cornwall receipt has been saved, but Shopify could not add the ${good} accepted ` +
                        `Pal${good === 1 ? '' : 's'} to Cornwall stock.\n\n` +
                        `The damaged quantity has NOT been added to Shopify.\n` +
                        `This transfer is marked for Shopify retry and will not be double-added.`);
                }
            }
            else if (receiptSaved) {
                await persistDispatch('Cornwall received · no sellable stock');
            }
            await refreshDispatchShopify();
            render();
        });
    }
    render();
    // Retail-safe Dispatch live sync. This does not call Admin-only production endpoints.
    window.setInterval(async () => {
        if (document.hidden)
            return;
        try {
            const latestStamp = await cloudDispatchStamp();
            if (!latestStamp || latestStamp === dispatchStamp)
                return;
            const fresh = await cloudDispatchState();
            s = applyDispatchCloudState(fresh);
            dispatchStamp = fresh.updated_at || latestStamp;
            recoverAwaitingDispatch(s);
            await refreshDispatchShopify();
            render();
            setForgeCloudSync('synced', 'Dispatch updated live');
        }
        catch (e) {
            setForgeCloudSync('error', e.message || 'Dispatch sync failed');
        }
    }, 2000);
}
async function resetForgeData() {
    const user = currentForgeUser();
    if (!user || user.role !== 'admin')
        return alert('Only an Admin can reset PLA Forge operational data.');
    if (!confirm('Reset ALL operational workflow and stock data in Cloudflare D1? Products, recipes, users, printers and settings will be kept.'))
        return;
    const phrase = prompt('This affects every PLA Forge device. Type RESET FORGE exactly to continue:');
    if (phrase !== 'RESET FORGE') {
        if (phrase !== null)
            alert('Reset cancelled — confirmation text did not match.');
        return;
    }
    const btn = document.querySelector('.resetForgeButton');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Resetting Cloud…';
    }
    try {
        const result = await cloudFetch('/system/reset-operational', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ confirmation: 'RESET FORGE' })
        });
        forgeCloudOperationalState = null;
        forgeProductionCloudReady = false;
        alert('PLA Forge operational data has been reset in Cloudflare D1 for all devices.');
        location.href = 'index.html';
        return result;
    }
    catch (e) {
        alert('Cloud reset failed. Nothing should be assumed reset: ' + e.message);
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Reset Everything to Zero';
        }
    }
}
async function cloudReworkState() {
    if (!cloudToken())
        throw new Error('Cloud login required.');
    return await cloudFetchTimed('/rework/state', {}, 10000);
}
async function cloudReworkStamp() {
    if (!cloudToken())
        return null;
    try {
        const d = await cloudFetchTimed('/rework/sync-status', {}, 8000);
        return d.updated_at || null;
    }
    catch (e) {
        return null;
    }
}
async function cloudReworkAction(path, body = {}) {
    return await cloudFetchTimed(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    }, 12000);
}
function applyReworkCloudState(data, baseState = null) {
    const s = baseState || blankOperationalState();
    Object.assign(s, JSON.parse(JSON.stringify((data === null || data === void 0 ? void 0 : data.state) || {})));
    s.damageReworkJobs = s.damageReworkJobs || [];
    s.reworkHistory = s.reworkHistory || [];
    s.awaitingDispatch = s.awaitingDispatch || [];
    s.cornwallReworkStock = s.cornwallReworkStock || { clear_boxes: 0, inserts: {} };
    s.cornwallReworkStock.inserts = s.cornwallReworkStock.inserts || {};
    s.cornwallInsertReplenishment = s.cornwallInsertReplenishment || {};
    s.stock = s.stock || {};
    s.finishedStock = s.finishedStock || { boat: {}, cornwall: {} };
    s.assembled = s.assembled || {};
    s.inserts = s.inserts || {};
    s.consumables = s.consumables || {};
    return s;
}
async function reworkPage() {
    var _a;
    installForgeCloudSyncBadge();
    let initial;
    try {
        initial = await cloudReworkState();
    }
    catch (e) {
        showCloudRequiredError(e.message);
        setForgeCloudSync('error', e.message);
        return;
    }
    let s = applyReworkCloudState(initial);
    let reworkStamp = initial.updated_at || null;
    const ps = await load('products');
    const availability = await cloudAvailability();
    applyCloudAvailability(s, availability);
    let onSale = ps.filter(p => p.type === 'pal' && isOnSale(s, p.sku)).sort((a, b) => a.name.localeCompare(b.name));
    ensureCornwallInsertReplenishment(s, ps);
    const currentRole = ((_a = currentForgeUser()) === null || _a === void 0 ? void 0 : _a.role) || '';
    setForgeCloudSync('synced', 'Rework synced');
    const q = document.querySelector('#q');
    const activeList = document.querySelector('#activeRework');
    const activeKpi = document.querySelector('#reworkActiveKpi');
    const readyKpi = document.querySelector('#reworkReadyKpi');
    const waitKpi = document.querySelector('#reworkWaitingKpi');
    const localBox = document.querySelector('#cornwallBoxStockDisplay');
    const localInsertSku = document.querySelector('#cornwallInsertSku');
    const localInsertQty = document.querySelector('#cornwallInsertQty');
    const localInsertInventory = document.querySelector('#cornwallInsertInventory');
    const factoryAlert = document.querySelector('#cornwallFactoryAlert');
    localInsertSku.innerHTML = onSale.map(p => `<option value="${p.sku}">${esc(p.name)} · ${p.sku}</option>`).join('');
    function issueSummary(job) {
        if (job.type !== 'item') {
            const m = { box: 'Box Damaged', insert: 'Insert Damaged', pal: 'Pal Broken', writeoff: 'Full Factory Replacement' };
            return m[job.type] || job.type;
        }
        const r = job.requirements || {};
        if (r.box && r.insert && r.pal)
            return 'Box Damaged + Insert Damaged + Pal Broken';
        return [r.box ? 'Box Damaged' : '', r.insert ? 'Insert Damaged' : '', r.pal ? 'Pal Broken' : ''].filter(Boolean).join(' + ');
    }
    function requirementPills(job) {
        const r = damageReworkRequirements(job), pills = [];
        if (r.route === 'cornwall') {
            if (r.clear_boxes)
                pills.push({ label: `Cornwall Boxes ${cornwallBoxStock(s)} / ${r.clear_boxes}`, ok: cornwallBoxStock(s) >= r.clear_boxes });
            if (r.inserts)
                pills.push({ label: `Cornwall Inserts ${cornwallInsertStock(s, job.sku)} / ${r.inserts}`, ok: cornwallInsertStock(s, job.sku) >= r.inserts });
        }
        else {
            if (r.pals)
                pills.push({ label: `Factory Assembled Pal ${forgeAssembledQty(s, job.sku)} / ${r.pals}`, ok: forgeAssembledQty(s, job.sku) >= r.pals });
            if (r.inserts)
                pills.push({ label: `Factory Ready Insert ${forgeInsertReady(s, job.sku)} / ${r.inserts}`, ok: forgeInsertReady(s, job.sku) >= r.inserts });
            if (r.clear_boxes)
                pills.push({ label: `Factory Clear Box ${forgeConsumableStock(s, 'clear_boxes')} / ${r.clear_boxes}`, ok: forgeConsumableStock(s, 'clear_boxes') >= r.clear_boxes });
            if (r.bottom_cards)
                pills.push({ label: `Bottom Card ${forgeConsumableStock(s, 'bottom_cards')} / ${r.bottom_cards}`, ok: forgeConsumableStock(s, 'bottom_cards') >= r.bottom_cards });
            if (r.stickers)
                pills.push({ label: `Sticker ${forgeConsumableStock(s, 'stickers')} / ${r.stickers}`, ok: forgeConsumableStock(s, 'stickers') >= r.stickers });
        }
        return pills.map(x => `<span class="${x.ok ? 'stock-good' : 'stock-bad'}">${esc(x.label)}</span>`).join('');
    }
    function waitingReason(job) {
        const r = damageReworkRequirements(job), miss = [];
        if (r.route === 'cornwall') {
            if (r.clear_boxes && cornwallBoxStock(s) < r.clear_boxes)
                miss.push('Cornwall spare box');
            if (r.inserts && cornwallInsertStock(s, job.sku) < r.inserts)
                miss.push('Cornwall spare insert');
        }
        else {
            if (r.pals && forgeAssembledQty(s, job.sku) < r.pals)
                miss.push('factory replacement Pal');
            if (r.inserts && forgeInsertReady(s, job.sku) < r.inserts)
                miss.push('factory insert');
            if (r.clear_boxes && forgeConsumableStock(s, 'clear_boxes') < r.clear_boxes)
                miss.push('factory clear box');
            if (r.bottom_cards && forgeConsumableStock(s, 'bottom_cards') < r.bottom_cards)
                miss.push('bottom card');
            if (r.stickers && forgeConsumableStock(s, 'stickers') < r.stickers)
                miss.push('sticker');
        }
        return miss.length ? `Waiting for ${miss.join(', ')}` : r.route === 'cornwall' ? 'Ready for Cornwall repair' : 'Ready to send through Dispatch';
    }
    function lowCornwallStock() {
        const rows = [];
        if (cornwallBoxStock(s) < 1)
            rows.push({ label: 'Flat Clear Boxes', qty: cornwallBoxStock(s) });
        onSale.forEach(p => {
            const qty = cornwallInsertStock(s, p.sku);
            if (qty < cornwallInsertTarget())
                rows.push({ label: `${p.name} Insert`, sku: p.sku, qty, target: cornwallInsertTarget() });
        });
        return rows;
    }
    function drawLocalStock() {
        var _a;
        const boxQty = cornwallBoxStock(s);
        localBox.textContent = boxQty;
        (_a = localBox.closest('.cornwall-current-stock')) === null || _a === void 0 ? void 0 : _a.classList.toggle('low-stock', boxQty < 1);
        localInsertInventory.innerHTML = onSale.map(p => {
            const qty = cornwallInsertStock(s, p.sku), low = qty < cornwallInsertTarget();
            return `<tr class="${low ? 'low-spare-row' : ''}"><td><strong>${esc(p.name)}</strong><br><span class="sku">${p.sku}</span></td><td><strong>${qty}</strong>${low ? ` ${badge(`NEED ${Math.max(0, cornwallInsertTarget() - qty)}`, 'danger')}` : ''}</td></tr>`;
        }).join('') || '<tr><td colspan="2">No On Sale Pals.</td></tr>';
        const low = lowCornwallStock();
        if (factoryAlert) {
            factoryAlert.innerHTML = low.length ? `<div class="factory-alert-head"><div><strong>Factory Replenishment Required</strong><div class="small">${low.length} Cornwall spare stock item${low.length === 1 ? ' is' : 's are'} below target.</div></div>${badge(`${low.length} LOW`, 'danger')}</div><div class="factory-alert-items">${low.map(x => `<div><span>${esc(x.label)}</span><strong>${x.qty}</strong></div>`).join('')}</div>` : `<div class="factory-alert-ok">${badge('STOCK OK', 'ok')}<span>All Cornwall spare stock is at 1 or above.</span></div>`;
        }
    }
    function draw() {
        drawLocalStock();
        const text = (q.value || '').toLowerCase();
        const active = (s.damageReworkJobs || [])
            .filter(x => x.status === 'awaiting_rework' || x.status === 'awaiting_dispatch')
            .filter(x => `${x.name} ${x.sku} ${issueSummary(x)} ${damageReworkRequirements(x).label}`.toLowerCase().includes(text))
            .sort((a, b) => Number(damageReworkReady(s, b)) - Number(damageReworkReady(s, a)) || (a.created_at || '').localeCompare(b.created_at || ''));
        const open = active.filter(x => x.status === 'awaiting_rework');
        const ready = open.filter(x => damageReworkReady(s, x));
        const waiting = open.filter(x => !damageReworkReady(s, x));
        activeKpi.textContent = open.length;
        readyKpi.textContent = ready.length;
        waitKpi.textContent = waiting.length;
        activeList.innerHTML = active.length ? active.map(job => {
            const r = damageReworkRequirements(job), ready = damageReworkReady(s, job), inDispatch = job.status === 'awaiting_dispatch';
            return `<div class="rework-card ${inDispatch ? 'in-dispatch' : ready ? 'ready' : 'waiting'}">
       <div class="rework-card-head">
         <div><strong>${esc(job.name)}</strong><div class="sku">${job.sku}${job.damaged_item_index ? ` · Damaged Item ${job.damaged_item_index}` : ''}</div><div class="small">Created ${fmtDate(job.created_at)}</div></div>
         ${inDispatch ? badge('IN DISPATCH', 'info') : ready ? badge('READY', 'ok') : badge('WAITING', 'warning')}
       </div>
       <div class="rework-issue"><span>Reported Issue</span><strong>${esc(issueSummary(job))}</strong></div>
       <div class="rework-route"><span>Route</span><strong>${r.route === 'cornwall' ? 'Cornwall Local Repair' : 'Factory → Dispatch → Cornwall'}</strong></div>
       <div class="rework-route"><span>Work Required</span><strong>${esc(r.label || 'Rework')}</strong></div>
       ${!inDispatch ? `<div class="packing-checks">${requirementPills(job) || '<span class="stock-good">No replacement stock required</span>'}</div>` : ''}
       <div class="rework-footer">
         <div class="small">${inDispatch ? 'Replacement is waiting in Dispatch for return to Cornwall.' : esc(waitingReason(job))}</div>
         ${!inDispatch ? (r.route === 'cornwall'
                ? `<button class="btn completeLocalRework" data-id="${job.id}" ${ready ? '' : 'disabled'}>Complete Cornwall Repair</button>`
                : (currentRole === 'admin'
                    ? `<button class="btn sendReworkDispatch" data-id="${job.id}" ${ready ? '' : 'disabled'}>Send to Dispatch</button>`
                    : `<span class="badge warning">FACTORY ACTION · ADMIN</span>`)) : '<a class="btn ghost" href="deliveries.html">Open Dispatch →</a>'}
       </div>
     </div>`;
        }).join('') : '<div class="bench-empty">No active rework jobs.</div>';
        document.querySelectorAll('.completeLocalRework').forEach(btn => btn.onclick = async () => {
            const id = btn.dataset.id;
            btn.disabled = true;
            btn.textContent = 'Saving…';
            try {
                const result = await cloudReworkAction(`/rework/${encodeURIComponent(id)}/complete-cornwall`);
                s = applyReworkCloudState(result, s);
                reworkStamp = result.updated_at || reworkStamp;
                draw();
                setForgeCloudSync('synced', 'Cornwall repair completed');
            }
            catch (e) {
                alert(`Cornwall repair could not be completed: ${e.message}`);
                const fresh = await cloudReworkState().catch(() => null);
                if (fresh) {
                    s = applyReworkCloudState(fresh, s);
                    reworkStamp = fresh.updated_at || reworkStamp;
                }
                draw();
            }
        });
        document.querySelectorAll('.sendReworkDispatch').forEach(btn => btn.onclick = async () => {
            const id = btn.dataset.id;
            btn.disabled = true;
            btn.textContent = 'Saving…';
            try {
                const result = await cloudReworkAction(`/rework/${encodeURIComponent(id)}/send-factory`);
                s = applyReworkCloudState(result, s);
                reworkStamp = result.updated_at || reworkStamp;
                draw();
                setForgeCloudSync('synced', 'Factory rework sent to Dispatch');
            }
            catch (e) {
                alert(`Factory rework could not be sent: ${e.message}`);
                const fresh = await cloudReworkState().catch(() => null);
                if (fresh) {
                    s = applyReworkCloudState(fresh, s);
                    reworkStamp = fresh.updated_at || reworkStamp;
                }
                draw();
            }
        });
    }
    document.querySelector('#addCornwallBoxes').onclick = async () => {
        var _a;
        const qty = Math.max(1, Math.floor(Number(((_a = document.querySelector('#cornwallBoxAddQty')) === null || _a === void 0 ? void 0 : _a.value) || 1)));
        try {
            const result = await cloudReworkAction('/rework/cornwall-boxes/adjust', { change: qty });
            s = applyReworkCloudState(result, s);
            reworkStamp = result.updated_at || reworkStamp;
            draw();
            setForgeCloudSync('synced', 'Cornwall box stock updated');
        }
        catch (e) {
            alert(`Cornwall box stock was not updated: ${e.message}`);
        }
    };
    document.querySelector('#addCornwallInserts').onclick = async () => {
        const sku = localInsertSku.value;
        if (!sku)
            return;
        const qty = Math.max(1, Math.floor(Number(localInsertQty.value || 1)));
        try {
            const result = await cloudReworkAction(`/rework/cornwall-inserts/${encodeURIComponent(sku)}/adjust`, { change: qty });
            s = applyReworkCloudState(result, s);
            reworkStamp = result.updated_at || reworkStamp;
            draw();
            setForgeCloudSync('synced', 'Cornwall insert stock updated');
        }
        catch (e) {
            alert(`Cornwall insert stock was not updated: ${e.message}`);
        }
    };
    q.oninput = draw;
    draw();
    window.setInterval(async () => {
        if (document.hidden)
            return;
        try {
            const latest = await cloudReworkStamp();
            if (!latest || latest === reworkStamp)
                return;
            const fresh = await cloudReworkState();
            s = applyReworkCloudState(fresh, s);
            reworkStamp = fresh.updated_at || latest;
            const avail = await cloudAvailability();
            applyCloudAvailability(s, avail);
            onSale = ps.filter(p => p.type === 'pal' && isOnSale(s, p.sku)).sort((a, b) => a.name.localeCompare(b.name));
            localInsertSku.innerHTML = onSale.map(p => `<option value="${p.sku}">${esc(p.name)} · ${p.sku}</option>`).join('');
            draw();
            setForgeCloudSync('synced', 'Rework updated live');
        }
        catch (e) {
            setForgeCloudSync('error', e.message || 'Rework sync failed');
        }
    }, 2000);
}
function extractDriveFileId(url) {
    const v = String(url || '').trim();
    const m = v.match(/\/d\/([^/]+)/) || v.match(/[?&]id=([^&]+)/);
    return m ? m[1] : '';
}
function nextPalSku(products) {
    let max = 0;
    (products || []).forEach(p => {
        const m = String(p.sku || '').match(/^PLA(\d+)$/i);
        if (m)
            max = Math.max(max, Number(m[1]));
    });
    return `PLA${String(max + 1).padStart(3, '0')}`;
}
async function newPalPage() {
    const s = state();
    const existingProducts = await load('products');
    const existingRecipes = await load('recipes');
    const filamentOptions = [...new Set([
            ...Object.keys(s.filament || {}),
            ...existingRecipes.map(r => String(r.filament || '').trim()).filter(Boolean)
        ])].sort((a, b) => a.localeCompare(b));
    const form = document.querySelector('#newPalForm');
    const status = document.querySelector('#newPalStatus');
    const recipeRows = document.querySelector('#newPalRecipeRows');
    const addRecipe = document.querySelector('#addRecipeRow');
    const review = document.querySelector('#newPalReview');
    const createBtn = document.querySelector('#createNewPal');
    const shopifyBridge = document.querySelector('#newPalShopifyBridge');
    const shopifyStatus = document.querySelector('#shopifyCreateStatus');
    const skuEl = document.querySelector('#npSku');
    skuEl.value = nextPalSku(existingProducts);
    shopifyBridge.value = s.siteSettings.shopifyBridgeUrl || '';
    let recipes = [{ filament: '', parts: 'Body', grouped_stl: '', separate_stls: '', part_count: 1, weight_g: 0 }];
    function recipeHtml(r, idx) {
        return `<div class="newpal-recipe-row">
     <div class="form-field"><label>Filament</label><select data-r="${idx}" data-k="filament">${filamentOptions.length ? `<option value="">Select filament…</option>${filamentOptions.map(f => { var _a; return `<option value="${esc(f)}" ${f === r.filament ? 'selected' : ''}>${esc(f)}${((_a = s.filament) === null || _a === void 0 ? void 0 : _a[f]) ? ` · ${Number(s.filament[f].grams || 0)}g in stock` : ''}</option>`; }).join('')}` : '<option value="">No filaments configured</option>'}</select></div>
     <div class="form-field"><label>Parts / Colour Group</label><input data-r="${idx}" data-k="parts" value="${esc(r.parts)}" placeholder="Body / Eye 1; Eye 2"></div>
     <div class="form-field"><label>Grouped STL</label><input data-r="${idx}" data-k="grouped_stl" value="${esc(r.grouped_stl)}" placeholder="grouped_file.stl"></div>
     <div class="form-field"><label>Individual STL(s)</label><input data-r="${idx}" data-k="separate_stls" value="${esc(r.separate_stls)}" placeholder="part1.stl; part2.stl"></div>
     <div class="form-field small-field"><label>Part Count</label><input class="number" type="number" min="1" data-r="${idx}" data-k="part_count" value="${Number(r.part_count || 1)}"></div>
     <div class="form-field small-field"><label>Weight (g)</label><input class="number" type="number" min="0" step="0.01" data-r="${idx}" data-k="weight_g" value="${Number(r.weight_g || 0)}"></div>
     <button type="button" class="iconbtn removeRecipeRow" data-r="${idx}" title="Remove recipe row">×</button>
   </div>`;
    }
    function drawRecipes() {
        recipeRows.innerHTML = recipes.map(recipeHtml).join('');
        recipeRows.querySelectorAll('input[data-r],select[data-r]').forEach(el => el.oninput = () => {
            const i = Number(el.dataset.r), k = el.dataset.k;
            recipes[i][k] = ['part_count', 'weight_g'].includes(k) ? Number(el.value || 0) : el.value;
            drawReview();
        });
        recipeRows.querySelectorAll('.removeRecipeRow').forEach(b => b.onclick = () => {
            if (recipes.length <= 1)
                return;
            recipes.splice(Number(b.dataset.r), 1);
            drawRecipes();
            drawReview();
        });
    }
    function val(id) { var _a; return String(((_a = document.querySelector('#' + id)) === null || _a === void 0 ? void 0 : _a.value) || '').trim(); }
    function checked(id) { var _a; return !!((_a = document.querySelector('#' + id)) === null || _a === void 0 ? void 0 : _a.checked); }
    function payload() {
        const sku = val('npSku').toUpperCase();
        const first = val('npFirstName'), animal = val('npAnimal');
        const full = val('npFullName') || `${first}${animal ? ' the ' + animal : ''}`;
        const filaments = [...new Set(recipes.map(r => String(r.filament || '').trim()).filter(Boolean))];
        const product = {
            sku, name: full, description: val('npShortDescription'), type: 'pal', keyring: false,
            recipe_rows: recipes.length,
            recipe_weight_g: recipes.reduce((a, r) => a + Number(r.weight_g || 0), 0),
            filaments, recipe_ready: recipes.every(r => r.filament && r.parts),
            animal, first_name: first,
            characteristics: [val('npChar1'), val('npChar2'), val('npChar3')].filter(Boolean),
            full_description: val('npFullDescription'),
            size_height_cm: Number(val('npHeight') || 0),
            size_width_cm: Number(val('npWidth') || 0),
            size_depth_cm: Number(val('npDepth') || 0),
            barcode: val('npBarcode'),
            collection: val('npCollection'),
            price: Number(val('npPrice') || 0)
        };
        const recipeData = recipes.map(r => ({
            stated_sku: sku, sku, animal, name: first,
            filament: String(r.filament || '').trim(),
            parts: String(r.parts || '').trim(),
            grouped_stl: String(r.grouped_stl || '').trim(),
            separate_stls: String(r.separate_stls || '').trim(),
            part_count: Number(r.part_count || 1),
            weight_g: Number(r.weight_g || 0)
        }));
        const drive = val('npInsertUrl'), fileId = extractDriveFileId(drive);
        const insertFile = drive ? { file_id: fileId, view_url: drive, print_url: drive } : null;
        const shopify = {
            title: full,
            descriptionHtml: val('npFullDescription') || val('npShortDescription'),
            vendor: val('npVendor') || s.siteSettings.shopifyVendor || 'PLA Pals',
            productType: val('npProductType') || s.siteSettings.shopifyProductType || 'PLA Pal',
            tags: val('npTags').split(',').map(x => x.trim()).filter(Boolean),
            status: 'DRAFT',
            price: Number(val('npPrice') || 0),
            sku,
            barcode: val('npBarcode'),
            dimensions: { height_cm: Number(val('npHeight') || 0), width_cm: Number(val('npWidth') || 0), depth_cm: Number(val('npDepth') || 0) }
        };
        return { product, recipes: recipeData, insertFile, shopify, onSale: checked('npOnSale'), releaseDate: val('npReleaseDate') };
    }
    function validate(data) {
        const errors = [];
        if (!/^PLA\d{3,}$/.test(data.product.sku))
            errors.push('SKU must look like PLA084.');
        if (existingProducts.some(p => p.sku === data.product.sku))
            errors.push(`${data.product.sku} already exists.`);
        if (!data.product.name)
            errors.push('Pal name is required.');
        if (!data.product.animal)
            errors.push('Animal is required.');
        if (!data.recipes.length || data.recipes.some(r => !r.filament || !r.parts))
            errors.push('Every recipe row needs a filament and parts/colour group.');
        if (data.product.price < 0)
            errors.push('Price cannot be negative.');
        return errors;
    }
    function drawReview() {
        const d = payload(), errs = validate(d);
        review.innerHTML = `<div class="newpal-review-grid">
     <div><span>Pal</span><strong>${esc(d.product.name || '—')}</strong></div>
     <div><span>SKU</span><strong>${esc(d.product.sku || '—')}</strong></div>
     <div><span>Recipe Groups</span><strong>${d.recipes.length}</strong></div>
     <div><span>Filaments</span><strong>${d.product.filaments.length}</strong></div>
     <div><span>Insert PDF</span><strong>${d.insertFile ? 'Linked' : 'Not linked'}</strong></div>
     <div><span>Shopify</span><strong>${shopifyBridge.value.trim() ? 'Bridge configured' : 'Pending bridge'}</strong></div>
   </div>${errs.length ? `<div class="newpal-errors">${errs.map(e => `<div>${esc(e)}</div>`).join('')}</div>` : ''}`;
        createBtn.disabled = errs.length > 0;
    }
    async function sendShopify(d) {
        const url = shopifyBridge.value.trim();
        if (!url) {
            return { ok: false, pending: true, message: 'Forge Pal created. Shopify is pending because no secure Shopify Bridge URL is configured.' };
        }
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'create_pal_product', product: d.shopify })
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok)
                throw new Error(body.error || body.message || `HTTP ${res.status}`);
            return { ok: true, body };
        }
        catch (e) {
            return { ok: false, pending: true, message: `Forge Pal created, but Shopify creation failed: ${e.message}` };
        }
    }
    addRecipe.onclick = () => { recipes.push({ filament: '', parts: '', grouped_stl: '', separate_stls: '', part_count: 1, weight_g: 0 }); drawRecipes(); drawReview(); };
    form.querySelectorAll('input,textarea,select').forEach(el => el.addEventListener('input', drawReview));
    shopifyBridge.addEventListener('change', () => {
        s.siteSettings.shopifyBridgeUrl = shopifyBridge.value.trim();
        save(s);
        drawReview();
    });
    createBtn.onclick = async () => {
        const d = payload(), errors = validate(d);
        if (errors.length) {
            status.innerHTML = badge(errors[0], 'danger');
            return;
        }
        createBtn.disabled = true;
        status.innerHTML = badge('Creating Pal in Forge…', 'warning');
        s.customData.products = s.customData.products.filter(x => x.sku !== d.product.sku);
        s.customData.products.push(d.product);
        s.customData.recipes = s.customData.recipes.filter(x => x.sku !== d.product.sku).concat(d.recipes);
        if (d.insertFile)
            s.customData.insert_files[d.product.sku] = d.insertFile;
        s.productAvailability[d.product.sku] = { on_sale: d.onSale, release_date: d.releaseDate };
        s.shopifyProducts[d.product.sku] = { status: 'pending', created_at: new Date().toISOString(), payload: d.shopify };
        s.siteSettings.shopifyBridgeUrl = shopifyBridge.value.trim();
        save(s);
        status.innerHTML = badge('Forge created · sending Shopify…', 'warning');
        const result = await sendShopify(d);
        if (result.ok) {
            s.shopifyProducts[d.product.sku] = Object.assign(Object.assign({}, s.shopifyProducts[d.product.sku]), { status: 'created', shopify_product_id: result.body.productId || result.body.product_id || result.body.id || '', shopify_variant_id: result.body.variantId || result.body.variant_id || '', response: result.body });
            save(s);
            status.innerHTML = `${badge('PAL CREATED', 'ok')} <span class="small">Forge setup complete and Shopify product created as Draft.</span>`;
            shopifyStatus.innerHTML = badge('Shopify Draft Created', 'ok');
        }
        else {
            save(s);
            status.innerHTML = `${badge('FORGE CREATED', 'ok')} <span class="small">${esc(result.message)}</span>`;
            shopifyStatus.innerHTML = badge('Shopify Pending', 'warning');
        }
        existingProducts.push(d.product);
        skuEl.value = nextPalSku(existingProducts);
        createBtn.disabled = false;
    };
    drawRecipes();
    drawReview();
}
async function cloudMigrationPanel() {
    var _a;
    const s = state();
    const apiInput = document.querySelector('#cloudApiUrl');
    const healthEl = document.querySelector('#cloudHealthStatus');
    const summaryEl = document.querySelector('#cloudMigrationSummary');
    const migrateBtn = document.querySelector('#migrateForgeCloud');
    const verifyBtn = document.querySelector('#verifyForgeCloud');
    const localCountEl = document.querySelector('#cloudLocalProducts');
    const cloudCountEl = document.querySelector('#cloudRemoteProducts');
    if (!apiInput || !migrateBtn)
        return;
    apiInput.value = ((_a = s.siteSettings) === null || _a === void 0 ? void 0 : _a.forgeApiUrl) || 'https://pla-forge-api.plapalsuk.workers.dev';
    function apiBase() {
        return String(apiInput.value || '').trim().replace(/\/+$/, '');
    }
    function setSummary(html) {
        if (summaryEl)
            summaryEl.innerHTML = html;
    }
    function setHealth(text, cls = 'info') {
        if (healthEl)
            healthEl.innerHTML = badge(text, cls);
    }
    async function localPayload() {
        const products = await load('products');
        const recipes = await load('recipes');
        const insertFiles = await load('insert_files');
        return { products, recipes, insert_files: insertFiles, state: s };
    }
    async function checkHealth() {
        const base = apiBase();
        if (!base) {
            setHealth('API URL Missing', 'danger');
            return false;
        }
        try {
            const res = await fetch(base + '/health', { method: 'GET' });
            const data = await res.json();
            if (!res.ok || !data.success)
                throw new Error(data.error || `HTTP ${res.status}`);
            setHealth(`Connected · Schema ${data.schema_version || '?'}`, 'ok');
            return true;
        }
        catch (e) {
            setHealth('Connection Failed', 'danger');
            setSummary(`<div class="cloud-error">${esc(e.message)}</div>`);
            return false;
        }
    }
    async function verify() {
        const payload = await localPayload();
        localCountEl.textContent = payload.products.length;
        try {
            const data = await cloudFetch('/products', { method: 'GET' });
            const remote = Number(data.count || 0);
            cloudCountEl.textContent = remote;
            const ok = remote === payload.products.length;
            setSummary(ok
                ? `${badge('VERIFIED', 'ok')} <span class="small">Cloud products match Forge: ${remote} / ${payload.products.length}.</span>`
                : `${badge('CHECK REQUIRED', 'warning')} <span class="small">Cloud has ${remote} products; local Forge has ${payload.products.length}.</span>`);
            return ok;
        }
        catch (e) {
            cloudCountEl.textContent = '—';
            setSummary(`${badge('VERIFY FAILED', 'danger')} <span class="small">${esc(e.message)}</span>`);
            return false;
        }
    }
    apiInput.onchange = () => {
        s.siteSettings.forgeApiUrl = apiBase();
        save(s);
        checkHealth();
    };
    migrateBtn.onclick = async () => {
        migrateBtn.disabled = true;
        verifyBtn.disabled = true;
        setSummary(`${badge('PREPARING', 'warning')} <span class="small">Collecting current Forge data…</span>`);
        try {
            const healthy = await checkHealth();
            if (!healthy)
                throw new Error('Cloud API health check failed.');
            const payload = await localPayload();
            localCountEl.textContent = payload.products.length;
            const confirmed = confirm(`Copy current PLA Forge data to Cloudflare D1?\n\n` +
                `${payload.products.length} products\n` +
                `${payload.recipes.length} recipe rows\n\n` +
                `This is COPY ONLY. Your current browser data will not be deleted.`);
            if (!confirmed) {
                setSummary(`${badge('CANCELLED', 'info')} <span class="small">No data was changed.</span>`);
                return;
            }
            setSummary(`${badge('MIGRATING', 'warning')} <span class="small">Uploading Forge data to Cloudflare…</span>`);
            const data = await cloudFetch('/migration/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const imported = data.imported || {};
            setSummary(`
       <div class="cloud-success-head">${badge('MIGRATION COMPLETE', 'ok')}<strong>Copied to Cloudflare D1</strong></div>
       <div class="cloud-result-grid">
        <div><span>Products</span><strong>${Number(imported.products || 0)}</strong></div>
        <div><span>Recipes</span><strong>${Number(imported.recipes || 0)}</strong></div>
        <div><span>Filaments</span><strong>${Number(imported.filaments || 0)}</strong></div>
        <div><span>Insert Files</span><strong>${Number(imported.insert_files || 0)}</strong></div>
       </div>
       <div class="small">Verifying cloud product count now…</div>
     `);
            await verify();
        }
        catch (e) {
            setSummary(`${badge('MIGRATION FAILED', 'danger')} <span class="small">${esc(e.message)}</span>`);
        }
        finally {
            migrateBtn.disabled = false;
            verifyBtn.disabled = false;
        }
    };
    verifyBtn.onclick = async () => {
        verifyBtn.disabled = true;
        await verify();
        verifyBtn.disabled = false;
    };
    const payload = await localPayload();
    localCountEl.textContent = payload.products.length;
    await checkHealth();
    await verify();
}
async function cloudAuthPanel() {
    const status = document.querySelector('#cloudAuthStatus');
    const pass = document.querySelector('#cloudPassword');
    const loginBtn = document.querySelector('#cloudLoginBtn');
    const logoutBtn = document.querySelector('#cloudLogoutBtn');
    const user = currentForgeUser();
    if (pass)
        pass.closest('.form-field').style.display = 'none';
    if (loginBtn)
        loginBtn.style.display = 'none';
    if (logoutBtn) {
        logoutBtn.style.display = 'inline-flex';
        logoutBtn.onclick = forgeLogout;
    }
    if (status)
        status.innerHTML = user ? badge(`${user.name || user.email} · ${user.role}`, 'ok') : badge('Authenticated', 'ok');
}
async function cloudCoreStatusPanel() {
    const badgeEl = document.querySelector('#cloudCoreModeBadge');
    if (!badgeEl)
        return;
    const msg = document.querySelector('#cloudCoreMessage');
    if (!cloudToken()) {
        badgeEl.innerHTML = badge('LOCAL FALLBACK', 'warning');
        msg.textContent = 'Log in to Cloud Forge to activate Cloud Core reads and writes.';
        return;
    }
    try {
        const d = await cloudFetch('/core');
        document.querySelector('#cloudCoreProducts').textContent = (d.products || []).length;
        document.querySelector('#cloudCoreRecipes').textContent = (d.recipes || []).length;
        document.querySelector('#cloudCoreFilaments').textContent = (d.filaments || []).length;
        document.querySelector('#cloudCoreTargets').textContent = (d.targets || []).length;
        badgeEl.innerHTML = badge('CLOUD CORE LIVE', 'ok');
        msg.textContent = 'Core catalogue and configuration are reading from Cloudflare D1.';
    }
    catch (e) {
        badgeEl.innerHTML = badge('LOCAL FALLBACK', 'warning');
        msg.textContent = 'Cloud Core unavailable: ' + e.message;
    }
}
async function forgeLoginPage() {
    const email = document.querySelector('#loginEmail');
    const pass = document.querySelector('#loginPassword');
    const btn = document.querySelector('#loginBtn');
    const status = document.querySelector('#loginStatus');
    if (cloudToken()) {
        try {
            const me = await cloudFetch('/auth/me');
            setForgeUser(me.user || me);
            const r = new URLSearchParams(location.search).get('return');
            const target = r ? decodeURIComponent(r) : roleHomePage((me.user || me).role);
            location.replace(target);
            return;
        }
        catch (_a) {
            setCloudToken('');
            setForgeUser(null);
        }
    }
    btn.onclick = async () => {
        var _a, _b, _c, _d;
        const e = String(email.value || '').trim(), p = String(pass.value || '');
        if (!e || !p) {
            status.innerHTML = badge('Enter email and password', 'warning');
            return;
        }
        btn.disabled = true;
        status.innerHTML = badge('Signing in…', 'warning');
        try {
            const res = await fetch(cloudApiBase() + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: e, password: p }) });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success)
                throw new Error(data.error || 'Login failed');
            setCloudToken(data.token);
            setForgeUser(data.user);
            const r = new URLSearchParams(location.search).get('return');
            let target = r ? decodeURIComponent(r) : roleHomePage((_a = data.user) === null || _a === void 0 ? void 0 : _a.role);
            try {
                const page = new URL(target, location.href).pathname.split('/').pop() || 'index.html';
                if (!roleCanOpen((_b = data.user) === null || _b === void 0 ? void 0 : _b.role, page))
                    target = roleHomePage((_c = data.user) === null || _c === void 0 ? void 0 : _c.role);
            }
            catch (_e) {
                target = roleHomePage((_d = data.user) === null || _d === void 0 ? void 0 : _d.role);
            }
            location.replace(target);
        }
        catch (err) {
            status.innerHTML = badge(err.message, 'danger');
            btn.disabled = false;
        }
    };
    pass.addEventListener('keydown', e => {
        if (e.key === 'Enter')
            btn.click();
    });
}
async function employeeAdminPage() {
    installForgeCloudSyncBadge();
    const user = currentForgeUser();
    if (!user || user.role !== 'admin')
        return;
    const host = document.querySelector('#employeeAdmin');
    if (!host)
        return;
    let rows = [];
    async function refresh() {
        const d = await cloudFetch('/users');
        rows = d.users || [];
    }
    function render() {
        host.innerHTML = `<div class="section-title"><div><h2>Employee Accounts</h2><div class="small">All accounts and permissions are stored in Cloudflare.</div></div><span class="badge info">Cloud Users</span></div>
        <div class="employee-create-card">
          <h3>Add Employee</h3>
          <div class="employee-create-grid">
            <label><span>Name</span><input id="newEmpName"></label>
            <label><span>Email</span><input id="newEmpEmail" type="email"></label>
            <label><span>Temporary Password</span><input id="newEmpPassword" type="password" minlength="8"></label>
            <label><span>Role</span><select id="newEmpRole"><option value="packing">Packing</option><option value="retail_staff">Retail Staff</option><option value="admin">Admin</option></select></label>
            <button class="btn" id="addEmployee">+ Add Employee</button>
          </div>
        </div>
        <div class="employee-role-help">
          <div><strong>Admin</strong><span>Full PLA Forge access and administration.</span></div>
          <div><strong>Packing</strong><span>Packing Station only.</span></div>
          <div><strong>Retail Staff</strong><span>Dispatch/Cornwall delivery and authorised rework tools.</span></div>
        </div>
        <div class="employee-list">${rows.map(x => `<div class="employee-row">
          <div><strong>${esc(x.name || x.email)}</strong><div class="small">${esc(x.email)}</div></div>
          <select class="empRole" data-id="${esc(x.id)}"><option value="admin" ${x.role === 'admin' ? 'selected' : ''}>Admin</option><option value="packing" ${x.role === 'packing' ? 'selected' : ''}>Packing</option><option value="retail_staff" ${x.role === 'retail_staff' ? 'selected' : ''}>Retail Staff</option></select>
          <label class="empActive"><input type="checkbox" data-id="${esc(x.id)}" ${Number(x.active) === 1 ? 'checked' : ''}> Active</label>
          <button class="btn ghost resetEmpPassword" data-id="${esc(x.id)}">Reset Password</button>
        </div>`).join('')}</div>`;
        host.querySelector('#addEmployee').onclick = async () => {
            const name = host.querySelector('#newEmpName').value.trim();
            const email = host.querySelector('#newEmpEmail').value.trim();
            const password = host.querySelector('#newEmpPassword').value;
            const role = host.querySelector('#newEmpRole').value;
            if (!name || !email || password.length < 8)
                return alert('Enter a name, email and a temporary password of at least 8 characters.');
            const btn = host.querySelector('#addEmployee');
            btn.disabled = true;
            try {
                await cloudFetch('/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, password, role }) });
                await refresh();
                render();
                setForgeCloudSync('synced', 'Employee created');
            }
            catch (e) {
                alert(e.message);
                btn.disabled = false;
            }
        };
        host.querySelectorAll('.empRole').forEach(el => el.onchange = async () => {
            try {
                await cloudFetch('/users/' + encodeURIComponent(el.dataset.id), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: el.value }) });
                await refresh();
                render();
            }
            catch (e) {
                alert(e.message);
                await refresh();
                render();
            }
        });
        host.querySelectorAll('.empActive input').forEach(el => el.onchange = async () => {
            try {
                await cloudFetch('/users/' + encodeURIComponent(el.dataset.id), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: el.checked }) });
                await refresh();
                render();
            }
            catch (e) {
                alert(e.message);
                await refresh();
                render();
            }
        });
        host.querySelectorAll('.resetEmpPassword').forEach(el => el.onclick = async () => {
            const pw = prompt('Enter a new password (minimum 8 characters):');
            if (!pw)
                return;
            if (pw.length < 8)
                return alert('Password must be at least 8 characters.');
            try {
                await cloudFetch('/users/' + encodeURIComponent(el.dataset.id), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) });
                alert('Password updated in Cloudflare.');
            }
            catch (e) {
                alert(e.message);
            }
        });
    }
    try {
        await refresh();
        render();
        setForgeCloudSync('synced', 'Employees synced');
    }
    catch (e) {
        showCloudRequiredError(e.message);
        setForgeCloudSync('error', e.message);
        return;
    }
    let stamp = JSON.stringify(rows.map(x => [x.id, x.name, x.email, x.role, x.active]));
    window.setInterval(async () => {
        if (document.hidden)
            return;
        try {
            const d = await cloudFetch('/users');
            const fresh = d.users || [];
            const next = JSON.stringify(fresh.map(x => [x.id, x.name, x.email, x.role, x.active]));
            if (next === stamp)
                return;
            rows = fresh;
            stamp = next;
            render();
            setForgeCloudSync('synced', 'Employees updated live');
        }
        catch (e) {
            setForgeCloudSync('error', e.message || 'Employee sync failed');
        }
    }, 2000);
}
async function generalSettingsPage() {
    installForgeCloudSyncBadge();
    const defaultPrinter = document.getElementById('defaultPrinter');
    const defaultLocation = document.getElementById('defaultLocation');
    const msg = document.getElementById('settingsMessage');
    let data;
    async function refresh() {
        data = await cloudFetch('/settings');
        return data;
    }
    function flash(text, kind = 'ok') {
        if (!msg)
            return;
        msg.innerHTML = badge(text, kind);
        setTimeout(() => {
            if (msg)
                msg.innerHTML = '';
        }, 2200);
    }
    function render() {
        const printers = (data.printers || []).filter(p => p.active !== false);
        defaultPrinter.innerHTML = '<option value="">No default</option>' +
            printers.map(p => `<option value="${esc(p.id)}">${esc(p.name)}${p.model ? ` · ${esc(p.model)}` : ''}</option>`).join('');
        defaultPrinter.value = String((data.settings || {}).default_printer || '');
        if (defaultLocation) {
            defaultLocation.value = String((data.settings || {}).default_location || 'boat');
        }
    }
    try {
        await refresh();
        render();
        setForgeCloudSync('synced', 'Settings synced');
    }
    catch (e) {
        showCloudRequiredError(e.message);
        setForgeCloudSync('error', e.message);
        return;
    }
    defaultPrinter.onchange = async () => {
        defaultPrinter.disabled = true;
        try {
            await cloudFetch('/settings/default_printer', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ value: defaultPrinter.value })
            });
            await refresh();
            render();
            flash('Default printer updated', 'ok');
        }
        catch (e) {
            flash('Default printer was not saved: ' + e.message, 'danger');
            await refresh();
            render();
        }
        defaultPrinter.disabled = false;
    };
    if (defaultLocation) {
        defaultLocation.onchange = async () => {
            defaultLocation.disabled = true;
            try {
                await cloudFetch('/settings/default_location', {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ value: defaultLocation.value })
                });
                await refresh();
                render();
                flash('Default location updated', 'ok');
            }
            catch (e) {
                flash('Default location was not saved: ' + e.message, 'danger');
                await refresh();
                render();
            }
            defaultLocation.disabled = false;
        };
    }
    let stamp = JSON.stringify(data);
    window.setInterval(async () => {
        if (document.hidden)
            return;
        try {
            const fresh = await cloudFetch('/settings');
            const next = JSON.stringify(fresh);
            if (next === stamp)
                return;
            data = fresh;
            stamp = next;
            render();
            setForgeCloudSync('synced', 'Settings updated live');
        }
        catch (e) {
            setForgeCloudSync('error', e.message || 'Settings sync failed');
        }
    }, 2000);
}
function installMobileForgeMenu() {
    const toggle = document.getElementById('mobileNavToggle');
    const nav = document.getElementById('forgeNav');
    if (!toggle || !nav)
        return;
    const current = toggle.querySelector('.mobile-nav-current');
    const links = Array.from(nav.querySelectorAll('a'));
    const here = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    const active = links.find(a => {
        const href = String(a.getAttribute('href') || '').split('?')[0].split('#')[0];
        return href.toLowerCase() === here;
    });
    if (current && active)
        current.textContent = active.textContent.trim();
    if (active)
        active.classList.add('mobile-current-page');
    const close = () => {
        nav.classList.remove('mobile-nav-open');
        toggle.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
    };
    toggle.onclick = () => {
        const open = !nav.classList.contains('mobile-nav-open');
        nav.classList.toggle('mobile-nav-open', open);
        toggle.classList.toggle('open', open);
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    links.forEach(a => a.addEventListener('click', close));
    document.addEventListener('click', e => {
        if (window.innerWidth > 980)
            return;
        if (!nav.classList.contains('mobile-nav-open'))
            return;
        if (nav.contains(e.target) || toggle.contains(e.target))
            return;
        close();
    });
    window.addEventListener('resize', () => {
        if (window.innerWidth > 980)
            close();
    });
}
async function shopifyIntegrationPage() {
    installForgeCloudSyncBadge();
    const root = document.getElementById('shopifyIntegrationRoot');
    if (!root)
        return;
    let shopifyRows = [];
    let forgeProducts = [];
    let savedMapping = { version: 1, variants: {} };
    let locationMapping = { version: 1, locations: {} };
    let shopifyLocationsForMapping = [];
    const byId = id => document.getElementById(id);
    const setText = (id, value) => {
        const el = byId(id);
        if (el)
            el.textContent = value;
    };
    function setConnection(state, text) {
        const el = byId('shopifyConnectionBadge');
        if (!el)
            return;
        el.className = 'badge ' + (state === 'ok' ? 'success' : state === 'error' ? 'danger' : 'info');
        el.textContent = text;
    }
    function setMappingDirty(dirty) {
        const el = byId('shopifyMappingSavedBadge');
        if (!el)
            return;
        el.className = 'badge ' + (dirty ? 'warn' : 'success');
        el.textContent = dirty ? 'Unsaved changes' : 'Saved';
    }
    function variantKey(row) { return String(row.variantId || row.inventoryItemId || `${row.productId}:${row.variantTitle}:${row.sku}`); }
    function normSku(v) { return String(v || '').trim().toUpperCase(); }
    function forgeSkuOptions(selected) {
        const s = String(selected || '');
        return `<option value="">— Ignore mapping —</option>` + forgeProducts.map(p => `<option value="${esc(p.sku)}"${p.sku === s ? ' selected' : ''}>${esc(p.sku)} — ${esc(p.name || p.sku)}</option>`).join('');
    }
    function mappingFor(row) {
        const key = variantKey(row);
        const m = savedMapping.variants[key] || {};
        return { included: !!m.included, forge_sku: String(m.forge_sku || '') };
    }
    function autoForgeSku(row) {
        const sku = normSku(row.sku);
        if (!sku)
            return '';
        const p = forgeProducts.find(x => normSku(x.sku) === sku);
        return p ? p.sku : '';
    }
    function mappingState(row, m) {
        if (!m.included)
            return { text: 'Ignored', kind: 'info' };
        if (!row.sku)
            return { text: m.forge_sku ? 'Mapped manually' : 'No Shopify SKU', kind: m.forge_sku ? 'success' : 'warn' };
        if (m.forge_sku)
            return { text: 'Matched', kind: 'success' };
        return { text: 'Needs mapping', kind: 'warn' };
    }
    function renderMapping() {
        var _h, _j;
        const q = String(((_h = byId('shopifyProductSearch')) === null || _h === void 0 ? void 0 : _h.value) || '').toLowerCase().trim();
        const filter = ((_j = byId('shopifyMappingFilter')) === null || _j === void 0 ? void 0 : _j.value) || 'all';
        let included = 0, matched = 0, needs = 0;
        shopifyRows.forEach(row => {
            const m = mappingFor(row), st = mappingState(row, m);
            if (m.included)
                included++;
            if (m.included && m.forge_sku)
                matched++;
            if (m.included && !m.forge_sku)
                needs++;
        });
        setText('shopifyIncludedCount', included);
        setText('shopifyMatchedCount', matched);
        setText('shopifyNeedsMappingCount', needs);
        const visible = shopifyRows.filter(row => {
            const m = mappingFor(row), st = mappingState(row, m);
            const hay = [row.productTitle, row.variantTitle, row.sku, m.forge_sku].join(' ').toLowerCase();
            if (q && !hay.includes(q))
                return false;
            if (filter === 'included' && !m.included)
                return false;
            if (filter === 'ignored' && m.included)
                return false;
            if (filter === 'matched' && !(m.included && m.forge_sku))
                return false;
            if (filter === 'unmatched' && !(m.included && !m.forge_sku))
                return false;
            if (filter === 'nosku' && row.sku)
                return false;
            return true;
        });
        const body = byId('shopifyProductsTable');
        if (!body)
            return;
        body.innerHTML = visible.length ? visible.map(row => {
            const key = variantKey(row), m = mappingFor(row), st = mappingState(row, m);
            return `<tr data-shopify-key="${esc(key)}">
              <td><label class="switch-mini"><input type="checkbox" class="shopify-include"${m.included ? ' checked' : ''}><span></span></label></td>
              <td><strong>${esc(row.productTitle)}</strong></td>
              <td>${esc(row.variantTitle || 'Default')}</td>
              <td><span class="sku">${esc(row.sku || 'No SKU')}</span></td>
              <td>${Number(row.qty || 0)}</td>
              <td><select class="input shopify-forge-sku">${forgeSkuOptions(m.forge_sku)}</select></td>
              <td>${badge(st.text, st.kind)}</td>
            </tr>`;
        }).join('') : `<tr><td colspan="7">No products match this filter.</td></tr>`;
        body.querySelectorAll('tr[data-shopify-key]').forEach(tr => {
            const key = tr.getAttribute('data-shopify-key');
            const include = tr.querySelector('.shopify-include');
            const select = tr.querySelector('.shopify-forge-sku');
            include.onchange = () => {
                const current = savedMapping.variants[key] || {};
                savedMapping.variants[key] = Object.assign(Object.assign({}, current), { included: include.checked, forge_sku: String(select.value || '') });
                setMappingDirty(true);
                renderMapping();
            };
            select.onchange = () => {
                const current = savedMapping.variants[key] || {};
                savedMapping.variants[key] = Object.assign(Object.assign({}, current), { included: include.checked, forge_sku: String(select.value || '') });
                if (select.value && !include.checked)
                    savedMapping.variants[key].included = true;
                setMappingDirty(true);
                renderMapping();
            };
        });
    }
    async function loadForgeProducts() {
        const data = await cloudFetch('/products');
        forgeProducts = (data.products || []).map(p => ({ sku: String(p.sku || ''), name: String(p.name || p.product_name || p.sku || '') })).filter(p => p.sku);
    }
    async function loadSavedMapping() {
        var _h;
        try {
            const data = await cloudFetch('/settings');
            const v = (_h = data.settings) === null || _h === void 0 ? void 0 : _h.shopify_product_mapping;
            if (v && typeof v === 'object' && v.variants)
                savedMapping = v;
            else
                savedMapping = { version: 1, variants: {} };
        }
        catch (e) {
            savedMapping = { version: 1, variants: {} };
        }
    }
    async function saveMapping() {
        const btn = byId('shopifySaveMapping');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Saving…';
        }
        try {
            savedMapping.version = 1;
            savedMapping.updated_at = new Date().toISOString();
            await cloudFetch('/settings/shopify_product_mapping', { method: 'PUT', body: JSON.stringify({ value: savedMapping }) });
            setMappingDirty(false);
            setForgeCloudSync('synced', 'Shopify mapping saved');
        }
        catch (e) {
            alert('Could not save Shopify mapping: ' + e.message);
            setForgeCloudSync('error', 'Shopify mapping save failed');
        }
        finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Save Mapping';
            }
        }
    }
    function setLocationMappingDirty(dirty) {
        const el = byId('shopifyLocationMappingBadge');
        if (!el)
            return;
        el.className = 'badge ' + (dirty ? 'warn' : 'success');
        el.textContent = dirty ? 'Unsaved changes' : 'Saved';
    }
    function renderLocationMapping() {
        const host = byId('shopifyLocationMappingRows');
        if (!host)
            return;
        host.innerHTML = shopifyLocationsForMapping.length ? shopifyLocationsForMapping.map(loc => { var _m; const current = String(((_m = locationMapping.locations) === null || _m === void 0 ? void 0 : _m[loc.id]) || 'ignore'); return `<div class="shopify-location-map-row" data-location-id="${esc(loc.id)}"><div class="shopify-location-map-info"><strong>${esc(loc.name)}</strong><span>${esc([loc.city, loc.country].filter(Boolean).join(', ') || 'No address')} · ${loc.active ? 'Active' : 'Inactive'}</span></div><select class="input shopify-location-map-select"><option value="ignore"${current === 'ignore' ? ' selected' : ''}>Ignore</option><option value="boat"${current === 'boat' ? ' selected' : ''}>Kitsune Boat</option><option value="cornwall"${current === 'cornwall' ? ' selected' : ''}>Kitsune Cornwall</option></select></div>`; }).join('') : `<div class="dashboard-clear-state"><strong>No Shopify locations returned.</strong></div>`;
        host.querySelectorAll('.shopify-location-map-row').forEach(row => { const id = row.getAttribute('data-location-id'), sel = row.querySelector('.shopify-location-map-select'); sel.onchange = () => { locationMapping.locations = locationMapping.locations || {}; locationMapping.locations[id] = sel.value; setLocationMappingDirty(true); }; });
    }
    async function loadLocationMapping() {
        var _m;
        try {
            const [status, settings] = await Promise.all([cloudFetch('/shopify/location-mapping'), cloudFetch('/settings')]);
            shopifyLocationsForMapping = status.locations || [];
            const saved = (_m = settings.settings) === null || _m === void 0 ? void 0 : _m.shopify_location_mapping;
            if (saved && typeof saved === 'object' && saved.locations)
                locationMapping = saved;
            else {
                locationMapping = { version: 1, locations: {} };
                (status.locations || []).forEach(loc => locationMapping.locations[loc.id] = String(loc.forge_location || 'ignore'));
            }
            renderLocationMapping();
            setLocationMappingDirty(false);
        }
        catch (e) {
            shopifyLocationsForMapping = [];
            renderLocationMapping();
            const b = byId('shopifyLocationMappingBadge');
            if (b) {
                b.className = 'badge danger';
                b.textContent = 'Load error';
            }
        }
    }
    async function saveLocationMapping() {
        const btn = byId('shopifySaveLocationMapping');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Saving…';
        }
        try {
            locationMapping.version = 1;
            locationMapping.updated_at = new Date().toISOString();
            await cloudFetch('/settings/shopify_location_mapping', { method: 'PUT', body: JSON.stringify({ value: locationMapping }) });
            setLocationMappingDirty(false);
            setForgeCloudSync('synced', 'Shopify location mapping saved');
        }
        catch (e) {
            alert('Could not save Shopify location mapping: ' + e.message);
        }
        finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Save Location Mapping';
            }
        }
    }
    function money(order) {
        var _h;
        const m = (_h = order === null || order === void 0 ? void 0 : order.totalPriceSet) === null || _h === void 0 ? void 0 : _h.shopMoney;
        if (!m)
            return '';
        try {
            return new Intl.NumberFormat('en-GB', { style: 'currency', currency: m.currencyCode || 'GBP' }).format(Number(m.amount || 0));
        }
        catch (e) {
            return `${m.currencyCode || 'GBP'} ${m.amount || '0.00'}`;
        }
    }
    async function loadStatus() {
        var _h;
        setConnection('loading', 'Checking…');
        try {
            const data = await cloudFetch('/shopify/status'), shop = data.shop || {};
            setConnection('ok', 'Connected');
            byId('shopifyConnectionSummary').innerHTML = `<div class="shopify-connected-banner"><strong>Shopify is connected to PLA Forge.</strong><span>${esc(shop.name || data.configured_shop || 'Shopify Store')}</span></div>`;
            byId('shopifyStoreDetails').innerHTML = `
              <div><span>Store</span><strong>${esc(shop.name || '–')}</strong></div>
              <div><span>MyShopify domain</span><strong>${esc(shop.myshopifyDomain || data.configured_shop || '–')}</strong></div>
              <div><span>Primary domain</span><strong>${esc(((_h = shop.primaryDomain) === null || _h === void 0 ? void 0 : _h.host) || '–')}</strong></div>
              <div><span>Currency</span><strong>${esc(shop.currencyCode || '–')}</strong></div>
              <div><span>API version</span><strong>${esc(data.api_version || '–')}</strong></div>`;
            return data;
        }
        catch (e) {
            setConnection('error', 'Connection Error');
            byId('shopifyConnectionSummary').innerHTML = `<div class="dashboard-clear-state"><strong>Shopify could not connect.</strong><span>${esc(e.message)}</span></div>`;
            throw e;
        }
    }
    async function loadLocations() {
        const data = await cloudFetch('/shopify/locations'), rows = data.locations || [];
        setText('shopifyLocationCount', rows.length);
        byId('shopifyLocations').innerHTML = rows.length ? rows.map(x => { var _h, _j; return `<div class="shopify-list-row"><div><strong>${esc(x.name)}</strong><span>${x.isActive ? 'Active' : 'Inactive'}</span></div><small>${esc([(_h = x.address) === null || _h === void 0 ? void 0 : _h.city, (_j = x.address) === null || _j === void 0 ? void 0 : _j.country].filter(Boolean).join(', ') || 'No address')}</small></div>`; }).join('') : `<div class="dashboard-clear-state"><strong>No locations returned.</strong></div>`;
    }
    async function loadProductsAndInventory() {
        const [pd, id] = await Promise.all([cloudFetch('/shopify/products'), cloudFetch('/shopify/inventory')]);
        const products = pd.products || [], inventory = id.inventory || [];
        setText('shopifyProductCount', products.length);
        setText('shopifyInventoryCount', inventory.length);
        shopifyRows = [];
        products.forEach(product => {
            var _h;
            const variants = ((_h = product.variants) === null || _h === void 0 ? void 0 : _h.nodes) || [];
            variants.forEach(v => {
                var _h;
                return shopifyRows.push({
                    productId: product.id, productTitle: product.title, productStatus: product.status,
                    variantId: v.id, variantTitle: v.title, sku: String(v.sku || ''), qty: Number(v.inventoryQuantity || 0),
                    inventoryItemId: ((_h = v.inventoryItem) === null || _h === void 0 ? void 0 : _h.id) || ''
                });
            });
        });
        renderMapping();
    }
    async function loadOrders() {
        const data = await cloudFetch('/shopify/orders?limit=20'), orders = data.orders || [];
        setText('shopifyOrderCount', orders.length);
        byId('shopifyOrders').innerHTML = orders.length ? orders.map(order => {
            var _h;
            const items = ((_h = order.lineItems) === null || _h === void 0 ? void 0 : _h.nodes) || [], itemText = items.slice(0, 4).map(i => `${i.quantity} × ${i.sku || i.name}`).join(' · ');
            return `<div class="shopify-order-row"><div class="shopify-order-main"><strong>${esc(order.name || 'Order')}</strong><span>${esc(itemText || 'No line items')}</span></div><div class="shopify-order-status"><strong>${esc(money(order))}</strong><span>${esc(order.displayFinancialStatus || '')} · ${esc(order.displayFulfillmentStatus || '')}</span></div><time>${fmtDate(order.createdAt)}</time></div>`;
        }).join('') : `<div class="dashboard-clear-state"><strong>No recent orders returned.</strong></div>`;
    }
    async function refreshAll() {
        const btn = byId('shopifyRefreshAll');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Refreshing…';
        }
        try {
            await Promise.all([loadForgeProducts(), loadSavedMapping(), loadLocationMapping()]);
            await loadStatus();
            await Promise.all([loadLocations(), loadProductsAndInventory(), loadOrders()]);
            setMappingDirty(false);
            setForgeCloudSync('synced', 'Shopify data refreshed');
        }
        catch (e) {
            setForgeCloudSync('error', 'Shopify sync error');
        }
        finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Refresh Shopify Data';
            }
        }
    }
    byId('shopifyProductSearch').oninput = renderMapping;
    byId('shopifyMappingFilter').onchange = renderMapping;
    byId('shopifySaveMapping').onclick = saveMapping;
    byId('shopifyClearSelection').onclick = () => {
        Object.keys(savedMapping.variants).forEach(k => savedMapping.variants[k] = Object.assign(Object.assign({}, savedMapping.variants[k]), { included: false }));
        setMappingDirty(true);
        renderMapping();
    };
    byId('shopifySelectPlaSkus').onclick = () => {
        shopifyRows.forEach(row => {
            const sku = autoForgeSku(row);
            if (sku)
                savedMapping.variants[variantKey(row)] = { included: true, forge_sku: sku };
        });
        setMappingDirty(true);
        renderMapping();
    };
    byId('shopifyTestConnection').onclick = async () => {
        const b = byId('shopifyTestConnection');
        b.disabled = true;
        b.textContent = 'Testing…';
        try {
            await loadStatus();
            alert('Shopify connection successful.');
        }
        catch (e) {
            alert('Shopify connection failed: ' + e.message);
        }
        finally {
            b.disabled = false;
            b.textContent = 'Test Connection';
        }
    };
    byId('shopifyRefreshAll').onclick = refreshAll;
    const saveLocationBtn = byId('shopifySaveLocationMapping');
    if (saveLocationBtn)
        saveLocationBtn.onclick = saveLocationMapping;
    await refreshAll();
}
(function () {
    const page = (location.pathname.split('/').pop() || 'index.html').replace('.html', '').replace(/[^a-z0-9_-]/gi, '-');
    document.body.classList.add('forge-page-' + page);
})();
document.addEventListener('visibilitychange', async () => {
    if (!document.hidden && ['production.html', 'plates.html', 'parts.html', 'assembly.html', 'pals.html', 'packing-station.html', 'packaging.html', 'availability.html', 'settings.html', 'consumables.html'].includes(forgeCurrentPage())) {
        const stamp = await forgeCloudStamp();
        if (stamp && forgeLastCloudStamp && stamp !== forgeLastCloudStamp) {
            // interval will pick this up immediately on its next tick
            forgeLastCloudStamp = null;
        }
    }
});
document.addEventListener('DOMContentLoaded', function () {
    installMobileForgeMenu();
});
