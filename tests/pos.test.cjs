const assert = require('node:assert/strict');
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
const { build } = require('esbuild');
const { createHmac, randomUUID } = require('node:crypto');

(async () => {
  const bundle = await build({ entryPoints: ['api-test/worker.js'], bundle: true, format: 'esm', write: false });
  const secret = 'local-pos-test-secret-only';
  const mf = new Miniflare(convertV4MiniflareOptions({ workers: [{ name: 'pos-test', modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-08-10', bindings: { ENVIRONMENT: 'test', FORGE_SESSION_SECRET: secret }, d1Databases: ['DB'] }] }));
  try {
    const db = await mf.getD1Database('DB');
    await db.exec(`CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT,name TEXT,role TEXT,active INTEGER);
CREATE TABLE products(sku TEXT PRIMARY KEY,name TEXT,short_description TEXT,price REAL,on_sale INTEGER,active INTEGER);
CREATE TABLE forge_operational_state(state_key TEXT PRIMARY KEY,json_value TEXT,updated_at TEXT,updated_by TEXT);
INSERT INTO users VALUES('admin','admin@example.test','Admin','admin',1);
INSERT INTO users VALUES('seller','seller@example.test','Seller','pos_staff',1);
INSERT INTO users VALUES('other','other@example.test','Other','pos_staff',1);
INSERT INTO products VALUES('PLA001','Test Fox','A test Pal',6.99,1,1);
INSERT INTO products VALUES('PLA002','Not for sale','Hidden',6.99,0,1);`);
    const state = { finishedStock: { boat: { PLA001: 4 }, cornwall: { PLA001: 2 } }, stock: { PLA001: { boat: 4, cornwall: 2 } }, stock_revision: 0 };
    await db.prepare("INSERT INTO forge_operational_state VALUES('production',?,'initial','admin')").bind(JSON.stringify(state)).run();
    const token = uid => { const p = Buffer.from(JSON.stringify({ uid, exp: Date.now() + 3600000 })).toString('base64url'); return p + '.' + createHmac('sha256', secret).update(p).digest('base64url'); };
    async function call(path, method = 'GET', body, uid = 'admin') {
      const r = await mf.dispatchFetch('http://localhost' + path, { method, headers: { Authorization: 'Bearer ' + token(uid), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      return { status: r.status, body: await r.json() };
    }
    assert.equal((await call('/pos/locations')).status, 200);
    assert.equal((await call('/pos/employee-locations', 'PUT', { user_id: 'seller', location_ids: ['boat'] })).status, 200);
    const event = await call('/pos/events', 'POST', { name: 'Test Market', location_id: 'boat', event_date: '2026-09-17' });
    assert.equal(event.status, 200);
    assert.equal((await call('/pos/catalogue', 'GET', null, 'seller')).body.products.length, 1);
    assert.equal((await call('/pos/events?location_id=boat', 'GET', null, 'seller')).body.events.length, 1);
    assert.equal((await call('/pos/catalogue', 'GET', null, 'other')).status, 200);
    const request_id = randomUUID();
    const sale = await call('/pos/cash-sales', 'POST', { request_id, location_id: 'boat', event_id: event.body.event.id, lines: [{ sku: 'PLA001', quantity: 2 }] }, 'seller');
    assert.equal(sale.status, 200, JSON.stringify(sale));
    assert.equal(sale.body.sale.total, 13.98);
    assert.equal((await db.prepare("SELECT json_value FROM forge_operational_state WHERE state_key='production'").first()).json_value.includes('"boat":2'), true);
    assert.equal((await call('/pos/cash-sales', 'POST', { request_id, location_id: 'boat', event_id: event.body.event.id, lines: [{ sku: 'PLA001', quantity: 2 }] }, 'seller')).body.already_recorded, true);
    assert.equal((await call('/pos/cash-sales', 'POST', { request_id: randomUUID(), location_id: 'cornwall', event_id: event.body.event.id, lines: [{ sku: 'PLA001', quantity: 1 }] }, 'seller')).status, 403);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM pos_sale_lines').first()).n, 1);
    console.log('PASS: POS roles, location assignment, catalogue, event attribution, cash sales, inventory deduction and idempotency.');
  } finally { await mf.dispose(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
