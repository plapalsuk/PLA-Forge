const ALLOWED_ORIGINS = new Set([
  "https://plapalsuk.github.io"
]);

function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  const allowed = origin && ALLOWED_ORIGINS.has(origin)
    ? origin
    : "https://plapalsuk.github.io";

  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function json(request, data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(request)
    }
  });
}

function error(request, message, status = 500, detail = null) {
  return json(request, { success: false, error: message, detail }, status);
}

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function asInt(value, fallback = 0) { return Math.trunc(asNumber(value, fallback)); }
function boolInt(value) { return value === true || value === 1 || value === "1" ? 1 : 0; }
function now() { return new Date().toISOString(); }
function textBytes(v) { return new TextEncoder().encode(v); }
function b64url(bytes) {
  let str = "";
  for (const b of new Uint8Array(bytes)) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
}
function fromB64url(v) {
  v = v.replace(/-/g,"+").replace(/_/g,"/");
  while (v.length % 4) v += "=";
  const bin = atob(v);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}
async function hmac(secret, data) {
  const key = await crypto.subtle.importKey(
    "raw", textBytes(secret), {name:"HMAC", hash:"SHA-256"}, false, ["sign","verify"]
  );
  return crypto.subtle.sign("HMAC", key, textBytes(data));
}
async function makeToken(env, role="admin") {
  const payload = b64url(textBytes(JSON.stringify({role, exp:Date.now()+12*60*60*1000})));
  const sig = b64url(await hmac(env.FORGE_SESSION_SECRET, payload));
  return `${payload}.${sig}`;
}
async function validateToken(env, token) {
  if (!token || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  try {
    const expected = new Uint8Array(await hmac(env.FORGE_SESSION_SECRET, payload));
    const actual = fromB64url(sig);
    if (expected.length !== actual.length) return null;
    let diff = 0;
    for (let i=0;i<expected.length;i++) diff |= expected[i]^actual[i];
    if (diff !== 0) return null;
    const data = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
    if (!data.exp || Date.now() > data.exp) return null;
    return data;
  } catch { return null; }
}
async function requireAuth(request, env) {
  const header = request.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return validateToken(env, token);
}

async function health(request, env) {
  const schema = await env.DB.prepare(
    "SELECT value FROM schema_meta WHERE key = ? LIMIT 1"
  ).bind("schema_version").first();
  return json(request, {
    success:true, service:"PLA Forge API", database:"connected",
    schema_version:schema?.value||null, auth:"enabled", timestamp:now()
  });
}

async function login(request, env) {
  if (!env.FORGE_ADMIN_PASSWORD || !env.FORGE_SESSION_SECRET) {
    return error(request, "Worker authentication secrets are not configured.", 500);
  }
  let body={};
  try { body = await request.json(); } catch { return error(request,"Valid JSON required.",400); }
  if (String(body.password||"") !== String(env.FORGE_ADMIN_PASSWORD)) {
    return error(request,"Invalid password.",401);
  }
  const token = await makeToken(env,"admin");
  return json(request,{success:true,token,expires_in_hours:12,role:"admin"});
}

async function getProducts(request, env) {
  const result = await env.DB.prepare("SELECT * FROM products WHERE active=1 ORDER BY name").all();
  return json(request,{success:true,count:result.results.length,products:result.results});
}
async function getRecipes(request, env) {
  const result = await env.DB.prepare("SELECT * FROM recipes ORDER BY sku, sort_order, id").all();
  return json(request,{success:true,count:result.results.length,recipes:result.results});
}
async function getFilaments(request, env) {
  const result = await env.DB.prepare("SELECT * FROM filaments WHERE active=1 ORDER BY name").all();
  return json(request,{success:true,count:result.results.length,filaments:result.results});
}
async function getConsumables(request, env) {
  const result = await env.DB.prepare("SELECT * FROM consumables WHERE active=1 ORDER BY name").all();
  return json(request,{success:true,count:result.results.length,consumables:result.results});
}
async function getTargets(request, env) {
  const result = await env.DB.prepare("SELECT sku, location_id, target_qty, updated_at FROM inventory_targets ORDER BY sku, location_id").all();
  return json(request,{success:true,count:result.results.length,targets:result.results});
}
async function getInventory(request, env) {
  const finished = await env.DB.prepare(`
    SELECT fi.sku,p.name,fi.location_id,l.name AS location_name,fi.qty,
           COALESCE(it.target_qty,0) AS target_qty
    FROM finished_inventory fi
    LEFT JOIN products p ON p.sku=fi.sku
    LEFT JOIN locations l ON l.id=fi.location_id
    LEFT JOIN inventory_targets it ON it.sku=fi.sku AND it.location_id=fi.location_id
    ORDER BY fi.sku,fi.location_id`).all();
  const assembled = await env.DB.prepare(`SELECT ai.sku,p.name,ai.qty FROM assembled_inventory ai LEFT JOIN products p ON p.sku=ai.sku ORDER BY p.name`).all();
  const inserts = await env.DB.prepare(`SELECT ii.sku,p.name,ii.awaiting_cut,ii.ready_qty,ii.damage_demand,ii.cornwall_replenishment_demand FROM insert_inventory ii LEFT JOIN products p ON p.sku=ii.sku ORDER BY p.name`).all();
  return json(request,{success:true,finished:finished.results,assembled:assembled.results,inserts:inserts.results});
}
async function getCore(request, env) {
  const [products,recipes,filaments,targets] = await Promise.all([
    env.DB.prepare("SELECT * FROM products WHERE active=1 ORDER BY name").all(),
    env.DB.prepare("SELECT * FROM recipes ORDER BY sku,sort_order,id").all(),
    env.DB.prepare("SELECT * FROM filaments WHERE active=1 ORDER BY name").all(),
    env.DB.prepare("SELECT sku,location_id,target_qty FROM inventory_targets ORDER BY sku,location_id").all()
  ]);
  return json(request,{success:true,products:products.results,recipes:recipes.results,filaments:filaments.results,targets:targets.results});
}

async function updateTarget(request, env, sku, location) {
  if (location === "boat") location = "factory";
  if (!["factory","cornwall"].includes(location)) return error(request,"Invalid location.",400);
  let body={}; try{body=await request.json()}catch{return error(request,"Valid JSON required.",400)}
  const qty=Math.max(0,asInt(body.target_qty));
  await env.DB.prepare(`INSERT INTO inventory_targets(sku,location_id,target_qty,updated_at)
    VALUES(?,?,?,?) ON CONFLICT(sku,location_id) DO UPDATE SET target_qty=excluded.target_qty,updated_at=excluded.updated_at`)
    .bind(sku,location,qty,now()).run();
  await env.DB.prepare(`INSERT INTO activity_log(action,entity_type,entity_id,details_json,created_at) VALUES(?,?,?,?,?)`)
    .bind("target_update","product",sku,JSON.stringify({location,target_qty:qty}),now()).run();
  return json(request,{success:true,sku,location_id:location,target_qty:qty});
}
async function updateAvailability(request, env, sku) {
  let body={}; try{body=await request.json()}catch{return error(request,"Valid JSON required.",400)}
  const onSale=boolInt(body.on_sale), release=body.release_date||null;
  const result=await env.DB.prepare(`UPDATE products SET on_sale=?,release_date=?,updated_at=? WHERE sku=?`)
    .bind(onSale,release,now(),sku).run();
  return json(request,{success:true,sku,on_sale:!!onSale,release_date:release});
}
async function updateFilament(request, env, name) {
  let body={}; try{body=await request.json()}catch{return error(request,"Valid JSON required.",400)}
  const grams=Math.max(0,asNumber(body.grams_in_stock));
  const reorder=Math.max(0,asNumber(body.reorder_level_g,250));
  await env.DB.prepare(`INSERT INTO filaments(name,grams_in_stock,reorder_level_g,active,updated_at)
    VALUES(?,?,?,1,?) ON CONFLICT(name) DO UPDATE SET grams_in_stock=excluded.grams_in_stock,reorder_level_g=excluded.reorder_level_g,active=1,updated_at=excluded.updated_at`)
    .bind(name,grams,reorder,now()).run();
  return json(request,{success:true,name,grams_in_stock:grams,reorder_level_g:reorder});
}

async function importMigration(request, env) {
  let body; try{body=await request.json()}catch{return error(request,"Request body must be valid JSON.",400)}
  const products=Array.isArray(body.products)?body.products:[];
  const recipes=Array.isArray(body.recipes)?body.recipes:[];
  const insertFiles=body.insert_files&&typeof body.insert_files==="object"?body.insert_files:{};
  const state=body.state&&typeof body.state==="object"?body.state:{};
  if(!products.length)return error(request,"Migration payload must contain a products array.",400);
  const statements=[];
  const productStmt=env.DB.prepare(`INSERT INTO products(sku,product_type,name,first_name,animal,collection,short_description,full_description,characteristic_1,characteristic_2,characteristic_3,barcode,height_cm,width_cm,depth_cm,price,on_sale,release_date,keyring,recipe_ready,recipe_weight_g,character_image_url,active,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(sku) DO UPDATE SET product_type=excluded.product_type,name=excluded.name,first_name=excluded.first_name,animal=excluded.animal,collection=excluded.collection,short_description=excluded.short_description,full_description=excluded.full_description,characteristic_1=excluded.characteristic_1,characteristic_2=excluded.characteristic_2,characteristic_3=excluded.characteristic_3,barcode=excluded.barcode,height_cm=excluded.height_cm,width_cm=excluded.width_cm,depth_cm=excluded.depth_cm,price=excluded.price,on_sale=excluded.on_sale,release_date=excluded.release_date,keyring=excluded.keyring,recipe_ready=excluded.recipe_ready,recipe_weight_g=excluded.recipe_weight_g,character_image_url=excluded.character_image_url,active=excluded.active,updated_at=excluded.updated_at`);
  for(const p of products){const sku=String(p.sku||"").trim();if(!sku)continue;const av=state.productAvailability?.[sku]||{};const c=Array.isArray(p.characteristics)?p.characteristics:[];statements.push(productStmt.bind(sku,p.type||"pal",p.name||sku,p.first_name||p.name?.split(" ")[0]||"",p.animal||"",p.collection||"",p.description||p.short_description||"",p.full_description||"",p.characteristic_1||c[0]||"",p.characteristic_2||c[1]||"",p.characteristic_3||c[2]||"",p.barcode||"",asNumber(p.height_cm??p.size_height_cm),asNumber(p.width_cm??p.size_width_cm),asNumber(p.depth_cm??p.size_depth_cm),asNumber(p.price),boolInt(av.on_sale??p.on_sale),av.release_date||p.release_date||null,boolInt(p.keyring),boolInt(p.recipe_ready),asNumber(p.recipe_weight_g),p.character_image_url||p.character_path||"",p.active===false?0:1,now()))}
  const filamentNames=new Set();for(const r of recipes)if(r.filament)filamentNames.add(String(r.filament).trim());for(const n of Object.keys(state.filament||{}))filamentNames.add(n);
  const filamentStmt=env.DB.prepare(`INSERT INTO filaments(name,grams_in_stock,reorder_level_g,active,updated_at) VALUES(?,?,?,1,?) ON CONFLICT(name) DO UPDATE SET grams_in_stock=excluded.grams_in_stock,reorder_level_g=excluded.reorder_level_g,active=1,updated_at=excluded.updated_at`);
  for(const name of filamentNames){const d=state.filament?.[name]||{};statements.push(filamentStmt.bind(name,asNumber(d.grams),asNumber(d.reorder,250),now()))}
  const recipeSkus=[...new Set(recipes.map(r=>String(r.sku||"").trim()).filter(Boolean))];for(const sku of recipeSkus)statements.push(env.DB.prepare("DELETE FROM recipes WHERE sku=?").bind(sku));
  const recipeStmt=env.DB.prepare(`INSERT INTO recipes(sku,filament_name,parts,grouped_stl,separate_stls,part_count,weight_g,sort_order,updated_at) VALUES(?,?,?,?,?,?,?,?,?)`);const sort={};for(const r of recipes){const sku=String(r.sku||"").trim();if(!sku)continue;sort[sku]=(sort[sku]||0)+1;statements.push(recipeStmt.bind(sku,r.filament||"",r.parts||"",r.grouped_stl||"",r.separate_stls||"",asInt(r.part_count,1),asNumber(r.weight_g),sort[sku],now()))}
  const insertStmt=env.DB.prepare(`INSERT INTO insert_files(sku,file_id,view_url,print_url,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(sku) DO UPDATE SET file_id=excluded.file_id,view_url=excluded.view_url,print_url=excluded.print_url,updated_at=excluded.updated_at`);for(const [sku,f] of Object.entries(insertFiles))statements.push(insertStmt.bind(sku,f?.file_id||"",f?.view_url||"",f?.print_url||f?.view_url||"",now()));
  const targetStmt=env.DB.prepare(`INSERT INTO inventory_targets(sku,location_id,target_qty,updated_at) VALUES(?,?,?,?) ON CONFLICT(sku,location_id) DO UPDATE SET target_qty=excluded.target_qty,updated_at=excluded.updated_at`);for(const [key,qty] of Object.entries(state.targets||{})){const i=key.lastIndexOf(":");if(i<0)continue;const sku=key.slice(0,i);let loc=key.slice(i+1);if(loc==="boat")loc="factory";statements.push(targetStmt.bind(sku,loc,asInt(qty),now()))}
  const finishedStmt=env.DB.prepare(`INSERT INTO finished_inventory(sku,location_id,qty,updated_at) VALUES(?,?,?,?) ON CONFLICT(sku,location_id) DO UPDATE SET qty=excluded.qty,updated_at=excluded.updated_at`);for(const p of products){const sku=p.sku;statements.push(finishedStmt.bind(sku,"factory",asInt(state.stock?.[sku]?.boat??state.finishedStock?.boat?.[sku]??0),now()),finishedStmt.bind(sku,"cornwall",asInt(state.stock?.[sku]?.cornwall??state.finishedStock?.cornwall?.[sku]??0),now()))}
  const assembledStmt=env.DB.prepare(`INSERT INTO assembled_inventory(sku,qty,updated_at) VALUES(?,?,?) ON CONFLICT(sku) DO UPDATE SET qty=excluded.qty,updated_at=excluded.updated_at`);for(const [sku,qty] of Object.entries(state.assembled||{}))statements.push(assembledStmt.bind(sku,asInt(qty),now()));
  const consumableStmt=env.DB.prepare(`INSERT INTO consumables(key,name,stock_qty,reorder_level,unit,active,updated_at) VALUES(?,?,?,?,?,1,?) ON CONFLICT(key) DO UPDATE SET name=excluded.name,stock_qty=excluded.stock_qty,reorder_level=excluded.reorder_level,unit=excluded.unit,active=1,updated_at=excluded.updated_at`);for(const [key,item] of Object.entries(state.consumables||{}))statements.push(consumableStmt.bind(key,item.name||key,asNumber(item.stock),asNumber(item.reorder),item.unit||"units",now()));
  statements.push(env.DB.prepare(`INSERT INTO activity_log(action,entity_type,entity_id,details_json,created_at) VALUES(?,?,?,?,?)`).bind("migration_import","system","browser_localstorage",JSON.stringify({products:products.length,recipes:recipes.length,imported_at:now()}),now()));
  try{for(let i=0;i<statements.length;i+=75)await env.DB.batch(statements.slice(i,i+75));return json(request,{success:true,message:"PLA Forge migration imported successfully.",imported:{products:products.length,recipes:recipes.length,filaments:filamentNames.size,insert_files:Object.keys(insertFiles).length,statements:statements.length}})}catch(err){return error(request,"Migration failed.",500,err instanceof Error?err.message:String(err))}
}

export default {
  async fetch(request, env) {
    if(request.method==="OPTIONS")return new Response(null,{status:204,headers:corsHeaders(request)});
    const url=new URL(request.url), path=url.pathname.replace(/\/+$/,"")||"/";
    try {
      if(request.method==="GET"&&path==="/")return json(request,{success:true,service:"PLA Forge API",auth:"enabled"});
      if(request.method==="GET"&&path==="/health")return health(request,env);
      if(request.method==="POST"&&path==="/auth/login")return login(request,env);

      const auth=await requireAuth(request,env);
      if(!auth)return error(request,"Authentication required.",401);
      if(request.method==="GET"&&path==="/auth/me")return json(request,{success:true,role:auth.role,expires_at:new Date(auth.exp).toISOString()});
      if(request.method==="GET"&&path==="/products")return getProducts(request,env);
      if(request.method==="GET"&&path==="/recipes")return getRecipes(request,env);
      if(request.method==="GET"&&path==="/filaments")return getFilaments(request,env);
      if(request.method==="GET"&&path==="/targets")return getTargets(request,env);
      if(request.method==="GET"&&path==="/inventory")return getInventory(request,env);
      if(request.method==="GET"&&path==="/consumables")return getConsumables(request,env);
      if(request.method==="GET"&&path==="/core")return getCore(request,env);
      if(request.method==="POST"&&path==="/migration/import")return importMigration(request,env);

      let m;
      if(request.method==="PUT"&&(m=path.match(/^\/targets\/([^/]+)\/([^/]+)$/)))return updateTarget(request,env,decodeURIComponent(m[1]),decodeURIComponent(m[2]));
      if(request.method==="PUT"&&(m=path.match(/^\/products\/([^/]+)\/availability$/)))return updateAvailability(request,env,decodeURIComponent(m[1]));
      if(request.method==="PUT"&&(m=path.match(/^\/filaments\/(.+)$/)))return updateFilament(request,env,decodeURIComponent(m[1]));
      return error(request,"Endpoint not found.",404);
    } catch(err) {
      return error(request,"PLA Forge API error.",500,err instanceof Error?err.message:String(err));
    }
  }
};
