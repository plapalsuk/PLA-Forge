const assert=require('node:assert/strict');const {randomUUID}=require('node:crypto');
exports.checkTransfers=async(mf,db,token)=>{
 await db.exec("INSERT INTO users VALUES('test-admin','admin@example.test','Test Admin','admin',1);\nALTER TABLE products ADD COLUMN on_sale INTEGER DEFAULT 1;\nCREATE TABLE forge_settings(key TEXT PRIMARY KEY,value_json TEXT);\nCREATE TABLE inventory_targets(sku TEXT,location_id TEXT,target_qty INTEGER);\nCREATE TABLE locations(id TEXT PRIMARY KEY,name TEXT,location_type TEXT,active INTEGER DEFAULT 1);");
 const {readFileSync}=require('node:fs');await db.prepare(readFileSync('api-test/migrations/0001_warehouse.sql','utf8')).run();await db.prepare(readFileSync('api-test/migrations/0001_warehouse.sql','utf8')).run();
 assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM locations WHERE id='warehouse'").first()).n,1);
 async function call(path,body,uid='test-retail',method=body?'POST':'GET'){const r=await mf.dispatchFetch('http://localhost'+path,{method,headers:{Authorization:'Bearer '+token(uid),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json()};}
 async function seed(state){await db.prepare("UPDATE forge_operational_state SET json_value=? WHERE state_key='production'").bind(JSON.stringify(state)).run();}
 const initial={assembled:{PLA001:10},inserts:{PLA001:{ready:10}},stock:{PLA001:{boat:20,cornwall:10,warehouse:30}},finishedStock:{boat:{PLA001:20},cornwall:{PLA001:10},warehouse:{PLA001:30}},transfers:[],packingHistory:[]};
 await seed(initial);
 assert.equal((await call('/stock/locations')).status,200);
 const request={sku:'PLA001',source:'warehouse',destination:'boat',quantity:5,request_id:randomUUID()};
 assert.equal((await call('/stock/transfers',request,'test-packer')).status,403);
 for(const invalid of [{...request,source:'invalid'},{...request,destination:'warehouse'},{...request,quantity:0},{...request,quantity:1.5},{...request,sku:'UNKNOWN'}])assert.equal((await call('/stock/transfers',invalid)).status,400);
 assert.equal((await call('/stock/transfers',{...request,quantity:31})).status,409);
 const first=await call('/stock/transfers',request);assert.equal(first.status,200,JSON.stringify(first));assert.equal(first.body.state.finishedStock.warehouse.PLA001,25);assert.equal(first.body.state.finishedStock.boat.PLA001,25);
 assert.equal((await call('/stock/transfers',request)).body.already_recorded,true);
 assert.equal((await call('/stock/transfers',{...request,quantity:1})).status,409);
 assert.equal((await call('/production/state',{state:initial},'test-admin','PUT')).status,409);
 assert.equal((await call('/dispatch/state',{state:initial},'test-retail','PUT')).status,409);
 for(const source of ['boat','cornwall','warehouse'])for(const destination of ['boat','cornwall','warehouse']){
  if(source===destination)continue;
  const before=(await call('/stock/locations')).body;
  const beforeQty=before.state.finishedStock[source].PLA001,destQty=before.state.finishedStock[destination].PLA001;
  const r=await call('/stock/transfers',{sku:'PLA001',source,destination,quantity:2,request_id:randomUUID()});assert.equal(r.status,200);
  assert.equal(r.body.state.finishedStock[source].PLA001,beforeQty-2);
  assert.equal(r.body.state.finishedStock[destination].PLA001,destQty+(destination==='cornwall'?0:2));
  if(destination==='cornwall'){
   const receive={transfer_id:r.body.transfer_id,all_good:true,request_id:randomUUID()};
   assert.equal((await call('/stock/transfers/receive',{...receive,all_good:false})).status,400);
   const result=await call('/stock/transfers/receive',receive);assert.equal(result.status,200);assert.equal(result.body.state.finishedStock.cornwall.PLA001,destQty+2);
   assert.equal((await call('/stock/transfers/receive',receive)).body.already_recorded,true);
   assert.equal((await call('/stock/transfers/receive',{...receive,request_id:randomUUID()})).status,409);
  }
 }
 const end=(await call('/stock/locations')).body;
 assert.equal(end.inventory.find(p=>p.sku==='PLA001').boat+end.inventory.find(p=>p.sku==='PLA001').cornwall+end.inventory.find(p=>p.sku==='PLA001').warehouse,60);
 assert.deepEqual(end.state.assembled,initial.assembled);assert.deepEqual(end.state.inserts,initial.inserts);
 const materialBefore=(await db.prepare('SELECT stock FROM consumables ORDER BY key').all()).results;
 // Concurrent transfers cannot overdraw the same source stock.
 await seed(initial);
 const attempts=await Promise.all([1,2].map(()=>call('/stock/transfers',{...request,quantity:25,request_id:randomUUID()})));
 assert.deepEqual(attempts.map(r=>r.status).sort(),[200,409]);
 // A failed transaction rolls back the deduction and idempotency ledger.
 await db.exec("CREATE TRIGGER transfer_failure BEFORE UPDATE ON forge_operational_state BEGIN SELECT RAISE(ABORT,'forced local transfer failure'); END;");
 const failedId=randomUUID();assert.equal((await call('/stock/transfers',{...request,quantity:1,request_id:failedId})).status,500);
 assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM stock_transfer_requests WHERE id=?').bind(failedId).first()).n,0);
 await db.exec('DROP TRIGGER transfer_failure;');
 const beforeReceive=(await call('/stock/locations')).body;
 assert.equal(beforeReceive.state.finishedStock.warehouse.PLA001,5);
 assert.deepEqual((await db.prepare('SELECT stock FROM consumables ORDER BY key').all()).results,materialBefore);
 // Warehouse surplus covers retail demand, while a Warehouse reserve target is protected.
 await seed({stock:{},finishedStock:{boat:{PLA001:0},cornwall:{PLA001:0},warehouse:{PLA001:10}}});
 const d=await call('/pal-demand',null,'test-admin');assert.equal(d.status,200,JSON.stringify(d));
 assert.equal(d.body.by_sku.PLA001.warehouse_stock,10);assert.equal(d.body.by_sku.PLA001.need_to_make,0);
 await db.prepare('INSERT INTO forge_settings VALUES(?,?)').bind('stock_target_defaults',JSON.stringify({boat:3,cornwall:3,warehouse:8})).run();
 const reserve=await call('/pal-demand',null,'test-admin');assert.equal(reserve.body.by_sku.PLA001.need_to_make,4);
 await seed({stock:{PLA001:{warehouse:2}}});
 const legacy=await call('/stock/locations');assert.equal(legacy.body.inventory.find(p=>p.sku==='PLA001').warehouse,2);
 const shortage=await call('/pal-demand',null,'test-admin');assert.equal(shortage.body.by_sku.PLA001.warehouse_shortage,6);assert.equal(shortage.body.by_sku.PLA001.need_to_make,12);
 console.log('PASS: all six transfer routes, receipts, conservation of stock, idempotency, permissions, shortages, concurrent transfers, atomic rollback, stale screen rejection, Warehouse demand/targets and legacy stock.');
 return {call,seed,initial};
};
