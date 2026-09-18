const assert = require('node:assert/strict');
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
const { build } = require('esbuild');
const { createHmac } = require('node:crypto');

(async () => {
  const bundle = await build({ entryPoints: ['api-test/worker.js'], bundle: true, format: 'esm', write: false });
  const secret = 'local-product-setup-secret';
  const mf = new Miniflare(convertV4MiniflareOptions({ workers: [{ name: 'product-setup-test', modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-08-10', bindings: { ENVIRONMENT: 'test', FORGE_SESSION_SECRET: secret }, d1Databases: ['DB'] }] }));
  try {
    const db = await mf.getD1Database('DB');
    await db.exec(`
CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT,name TEXT,role TEXT,active INTEGER);
CREATE TABLE products(sku TEXT PRIMARY KEY,product_type TEXT NOT NULL DEFAULT 'pal',name TEXT NOT NULL,first_name TEXT,animal TEXT,collection TEXT,short_description TEXT,full_description TEXT,characteristic_1 TEXT,characteristic_2 TEXT,characteristic_3 TEXT,barcode TEXT,height_cm REAL NOT NULL DEFAULT 0,width_cm REAL NOT NULL DEFAULT 0,depth_cm REAL NOT NULL DEFAULT 0,price REAL NOT NULL DEFAULT 0,on_sale INTEGER NOT NULL DEFAULT 0,release_date TEXT,keyring INTEGER NOT NULL DEFAULT 0,recipe_ready INTEGER NOT NULL DEFAULT 0,recipe_weight_g REAL NOT NULL DEFAULT 0,character_image_url TEXT,active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE recipes(id INTEGER PRIMARY KEY,sku TEXT NOT NULL,filament_name TEXT NOT NULL,parts TEXT NOT NULL,grouped_stl TEXT,separate_stls TEXT,part_count INTEGER NOT NULL DEFAULT 1,weight_g REAL NOT NULL DEFAULT 0,sort_order INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE recipe_history(id TEXT PRIMARY KEY,sku TEXT NOT NULL,product_name TEXT NOT NULL,action TEXT NOT NULL,before_json TEXT,after_json TEXT,created_at TEXT NOT NULL,created_by TEXT);
CREATE TABLE activity_log(id INTEGER PRIMARY KEY,action TEXT NOT NULL,entity_type TEXT,entity_id TEXT,details_json TEXT,user_id TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE insert_files(sku TEXT PRIMARY KEY,file_id TEXT,view_url TEXT,print_url TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE forge_operational_state(state_key TEXT PRIMARY KEY,json_value TEXT,updated_at TEXT,updated_by TEXT);
INSERT INTO forge_operational_state VALUES('production','{"finishedStock":{"boat":{},"cornwall":{},"warehouse":{}},"stock":{},"assembled":{}}','initial','admin');
INSERT INTO users VALUES('admin','admin@example.test','Admin','admin',1);`);
    const payload = Buffer.from(JSON.stringify({ uid: 'admin', exp: Date.now() + 3600000 })).toString('base64url');
    const token = payload + '.' + createHmac('sha256', secret).update(payload).digest('base64url');
    async function call(path, method, body) {
      const response = await mf.dispatchFetch('http://localhost' + path, { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      return { status: response.status, body: await response.json() };
    }
    const setup = {
      product: { sku: 'PLA084', name: 'Barry the Bat', first_name: 'Barry', animal: 'Bat', collection: 'Halloween', description: 'Short Barry copy.', full_description: 'Long Barry copy.', characteristics: ['Brave', 'Friendly'], barcode: 'PLA084', price: 6.99, cost_price: 2.5, on_sale: true, release_date: '2026-09-17' },
      recipes: [{ filament: 'Black', parts: 'Body', part_count: 1, weight_g: 22 }]
    };
    const created = await call('/products/setup', 'POST', setup);
    assert.equal(created.status, 201, JSON.stringify(created));
    assert.equal((await db.prepare("SELECT name,on_sale,price FROM products WHERE sku='PLA084'").first()).name, 'Barry the Bat');
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM recipes WHERE sku='PLA084'").first()).n, 1);
    assert.equal((await db.prepare("SELECT total_cost,sale_price FROM product_costs WHERE sku='PLA084'").first()).total_cost, 2.5);
    assert.equal((await call('/products/setup', 'POST', setup)).body.already_created, true);
    const collision = JSON.parse(JSON.stringify(setup)); collision.product.name = 'Different Pal';
    assert.equal((await call('/products/setup', 'POST', collision)).status, 409);
    assert.equal((await call('/products/PLA084/packaging', 'PUT', { filename: 'barry-box.pdf' })).status, 200);
    assert.equal((await db.prepare("SELECT file_id FROM insert_files WHERE sku='PLA084'").first()).file_id, 'barry-box.pdf');
    const master = await call('/pal-master', 'GET');
    assert.equal(master.status, 200, JSON.stringify(master));
    assert.equal(master.body.pals[0].name, 'Barry the Bat');
    setup.product.price = 7.99; setup.product.cost_price = 2.75; setup.product.short_description = 'Updated Barry copy.';
    const updated = await call('/products/PLA084/master', 'PUT', setup);
    assert.equal(updated.status, 200, JSON.stringify(updated));
    const updatedRow = await db.prepare("SELECT price,short_description FROM products WHERE sku='PLA084'").first();
    assert.equal(updatedRow.price, 7.99); assert.equal(updatedRow.short_description, 'Updated Barry copy.');
    assert.equal((await db.prepare("SELECT total_cost FROM product_costs WHERE sku='PLA084'").first()).total_cost, 2.75);
    console.log('PASS: permanent Pal, recipe, cost, availability, idempotency and packaging link.');
  } finally { await mf.dispose(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
