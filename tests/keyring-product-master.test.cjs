const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const state = { production: {}, consumables: {} };
const rawProducts = [
  { sku: 'PLA001', name: 'Alex the Axolotl', type: 'pal', active: true },
  { sku: 'PLA002', name: 'Patton the Bear', type: 'pal', active: true },
  { sku: 'PLA003', name: 'Inactive Pal', type: 'pal', active: true }
];
const master = { version: 1, products: {
  PLA001: { keyring_enabled: true, keyring_sku: 'K001', keyring_insert_pdf: 'K001_Alex_Keyring.pdf', active: true },
  PLA002: { keyring_enabled: false, active: true },
  PLA003: { keyring_enabled: true, keyring_sku: 'K003', active: false }
} };
const context = {
  console, setTimeout: () => 0, document: { querySelectorAll: () => [] },
  installForgeCloudSyncBadge() {}, forgeProductionCloudReady: true,
  cloudOperationalState: () => state, load: async () => rawProducts,
  cloudToken: () => 'test-token', cloudFetch: async () => ({}),
  normaliseCloudProduct: x => x, esc: x => String(x), badge: x => x,
  setForgeCloudSync() {}, saveProductionCloud: async () => {},
  targetKey: (sku, loc) => `${sku}:${loc}`
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('assets/product-master.js', 'utf8'), context);
context.cloudProductMaster = async () => master;
vm.runInContext(fs.readFileSync('assets/keyring-production.js', 'utf8'), context);

(async () => {
  const workspace = await context.keyringWorkspaceContext();
  assert.deepStrictEqual([...workspace.catalog].map(x => x.sku), ['K001']);
  assert.strictEqual(workspace.catalog[0].pdf, 'K001_Alex_Keyring.pdf');
  workspace.row('K001').target = 8;
  assert.strictEqual(workspace.sheets('K001'), 2);
  workspace.row('K001').cut_inserts = 7;
  assert.strictEqual(workspace.sheets('K001'), 1);
  console.log('Keyring Product Master integration checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
