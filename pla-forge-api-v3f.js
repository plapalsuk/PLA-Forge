function corsHeaders(request) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400"
  };
}

function json(request,data,status=200){
  return new Response(JSON.stringify(data,null,2),{
    status,headers:{"Content-Type":"application/json",...corsHeaders(request)}
  });
}
function error(request,message,status=500,detail=null){return json(request,{success:false,error:message,detail},status)}
function now(){return new Date().toISOString()}
function asNumber(v,f=0){const n=Number(v);return Number.isFinite(n)?n:f}
function asInt(v,f=0){return Math.trunc(asNumber(v,f))}
function boolInt(v){return v===true||v===1||v==="1"?1:0}
function textBytes(v){return new TextEncoder().encode(String(v))}
function b64url(bytes){
  let str="";for(const b of new Uint8Array(bytes))str+=String.fromCharCode(b);
  return btoa(str).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
}
function fromB64url(v){
  v=v.replace(/-/g,"+").replace(/_/g,"/");
  while(v.length%4)v+="=";
  const bin=atob(v);return Uint8Array.from(bin,c=>c.charCodeAt(0));
}
async function hmac(secret,data){
  const key=await crypto.subtle.importKey("raw",textBytes(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return crypto.subtle.sign("HMAC",key,textBytes(data));
}
async function makeToken(env,user){
  const payload=b64url(textBytes(JSON.stringify({
    uid:user.id,email:user.email,name:user.name||"",role:user.role,exp:Date.now()+12*60*60*1000
  })));
  const sig=b64url(await hmac(env.FORGE_SESSION_SECRET,payload));
  return `${payload}.${sig}`;
}
async function validateToken(env,token){
  if(!token||!token.includes("."))return null;
  const [payload,sig]=token.split(".");
  try{
    const expected=new Uint8Array(await hmac(env.FORGE_SESSION_SECRET,payload));
    const actual=fromB64url(sig);
    if(expected.length!==actual.length)return null;
    let diff=0;for(let i=0;i<expected.length;i++)diff|=expected[i]^actual[i];
    if(diff!==0)return null;
    const data=JSON.parse(new TextDecoder().decode(fromB64url(payload)));
    if(!data.exp||Date.now()>data.exp)return null;
    const user=await env.DB.prepare("SELECT id,email,name,role,active FROM users WHERE id=? LIMIT 1").bind(data.uid).first();
    if(!user||Number(user.active)!==1)return null;
    return {...data,...user};
  }catch{return null}
}
async function requireAuth(request,env){
  const h=request.headers.get("Authorization")||"";
  return validateToken(env,h.startsWith("Bearer ")?h.slice(7):"");
}
const ROLE_PERMISSIONS = Object.freeze({
  admin: ["*"],
  packing: [
    "core:read","products:read","recipes:read","inventory:read",
    "packing:read","packing:write"
  ],
  retail_staff: [
    "core:read","products:read","inventory:read","dispatch:read",
    "cornwall:read","cornwall:write","rework:read","rework:write"
  ]
});

function permissionsFor(role){return ROLE_PERMISSIONS[role]||[]}
function can(user,permission){
  const perms=permissionsFor(user?.role);
  return perms.includes("*")||perms.includes(permission);
}
function requirePermission(request,user,permission){
  if(!user)return error(request,"Authentication required.",401);
  if(!can(user,permission))return error(request,"You do not have permission for this action.",403);
  return null;
}
function randomId(prefix="usr"){return `${prefix}_${crypto.randomUUID()}`}
function randomSalt(){return b64url(crypto.getRandomValues(new Uint8Array(18)))}
async function passwordHash(password,salt){
  const key=await crypto.subtle.importKey("raw",textBytes(password),"PBKDF2",false,["deriveBits"]);
  const bits=await crypto.subtle.deriveBits(
    {name:"PBKDF2",hash:"SHA-256",salt:textBytes(salt),iterations:100000},key,256
  );
  return b64url(bits);
}
async function verifyPassword(password,salt,stored){
  const test=await passwordHash(password,salt);
  if(test.length!==String(stored||"").length)return false;
  let diff=0;for(let i=0;i<test.length;i++)diff|=test.charCodeAt(i)^stored.charCodeAt(i);
  return diff===0;
}

async function health(request,env){
  const schema=await env.DB.prepare("SELECT value FROM schema_meta WHERE key='schema_version' LIMIT 1").first();
  return json(request,{success:true,service:"PLA Forge API",database:"connected",schema_version:schema?.value||null,auth:"employee",timestamp:now()});
}

async function employeeLogin(request,env){
  let body={};try{body=await request.json()}catch{return error(request,"Valid JSON required.",400)}
  const email=String(body.email||"").trim().toLowerCase();
  const password=String(body.password||"");
  if(!email||!password)return error(request,"Email and password are required.",400);
  const user=await env.DB.prepare(
    "SELECT id,email,name,role,active,password_salt,password_hash FROM users WHERE lower(email)=? LIMIT 1"
  ).bind(email).first();
  if(!user||Number(user.active)!==1||!user.password_hash)return error(request,"Invalid email or password.",401);
  const ok=await verifyPassword(password,user.password_salt,user.password_hash);
  if(!ok)return error(request,"Invalid email or password.",401);
  await env.DB.prepare("UPDATE users SET last_login_at=?,updated_at=? WHERE id=?").bind(now(),now(),user.id).run();
  const token=await makeToken(env,user);
  return json(request,{success:true,token,expires_in_hours:12,user:{id:user.id,email:user.email,name:user.name,role:user.role,permissions:permissionsFor(user.role)}});
}

/* One-time first-admin setup. Requires the existing FORGE_ADMIN_PASSWORD Worker Secret. */
async function bootstrapAdmin(request,env){
  if(!env.FORGE_ADMIN_PASSWORD)return error(request,"FORGE_ADMIN_PASSWORD is not configured.",500);
  const existing=await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE active=1").first();
  if(Number(existing?.n||0)>0)return error(request,"Employee accounts already exist. Bootstrap is disabled.",409);
  let body={};try{body=await request.json()}catch{return error(request,"Valid JSON required.",400)}
  if(String(body.bootstrap_password||"")!==String(env.FORGE_ADMIN_PASSWORD))return error(request,"Invalid bootstrap password.",401);
  const email=String(body.email||"").trim().toLowerCase();
  const name=String(body.name||"").trim();
  const password=String(body.password||"");
  if(!email||!password||password.length<8)return error(request,"Admin email and a password of at least 8 characters are required.",400);
  const salt=randomSalt(),hash=await passwordHash(password,salt),id=randomId();
  await env.DB.prepare(`INSERT INTO users(id,email,name,role,active,password_salt,password_hash,created_at,updated_at)
    VALUES(?,?,?,?,1,?,?,?,?)`).bind(id,email,name||"Administrator","admin",salt,hash,now(),now()).run();
  return json(request,{success:true,message:"First administrator created."},201);
}

async function listUsers(request,env){
  const r=await env.DB.prepare("SELECT id,email,name,role,active,last_login_at,created_at,updated_at FROM users ORDER BY name,email").all();
  return json(request,{success:true,count:r.results.length,users:r.results});
}
async function createUser(request,env){
  let b={};try{b=await request.json()}catch{return error(request,"Valid JSON required.",400)}
  const email=String(b.email||"").trim().toLowerCase(),name=String(b.name||"").trim(),role=String(b.role||"viewer");
  const password=String(b.password||"");
  if(!email||!password||password.length<8)return error(request,"Email and password of at least 8 characters are required.",400);
  if(!ROLE_PERMISSIONS[role])return error(request,"Invalid role.",400);
  const salt=randomSalt(),hash=await passwordHash(password,salt),id=randomId();
  try{
    await env.DB.prepare(`INSERT INTO users(id,email,name,role,active,password_salt,password_hash,created_at,updated_at)
      VALUES(?,?,?,?,1,?,?,?,?)`).bind(id,email,name,role,salt,hash,now(),now()).run();
    return json(request,{success:true,user:{id,email,name,role,active:1}},201);
  }catch(e){return error(request,"Could not create employee.",400,e.message)}
}
async function updateUser(request,env,id){
  let b={};try{b=await request.json()}catch{return error(request,"Valid JSON required.",400)}
  const current=await env.DB.prepare("SELECT * FROM users WHERE id=? LIMIT 1").bind(id).first();
  if(!current)return error(request,"Employee not found.",404);
  const email=String(b.email??current.email).trim().toLowerCase();
  const name=String(b.name??current.name??"").trim();
  const role=String(b.role??current.role);
  const active=b.active===undefined?Number(current.active):boolInt(b.active);
  if(!ROLE_PERMISSIONS[role])return error(request,"Invalid role.",400);
  let salt=current.password_salt,hash=current.password_hash;
  if(b.password){
    if(String(b.password).length<8)return error(request,"Password must be at least 8 characters.",400);
    salt=randomSalt();hash=await passwordHash(String(b.password),salt);
  }
  await env.DB.prepare(`UPDATE users SET email=?,name=?,role=?,active=?,password_salt=?,password_hash=?,updated_at=? WHERE id=?`)
    .bind(email,name,role,active,salt,hash,now(),id).run();
  return json(request,{success:true,user:{id,email,name,role,active}});
}

async function getProducts(request,env){
  const r=await env.DB.prepare("SELECT * FROM products WHERE active=1 ORDER BY name").all();
  return json(request,{success:true,count:r.results.length,products:r.results});
}
async function getRecipes(request,env){
  const r=await env.DB.prepare("SELECT * FROM recipes ORDER BY sku,sort_order,id").all();
  return json(request,{success:true,count:r.results.length,recipes:r.results});
}
async function getFilaments(request,env){
  const r=await env.DB.prepare("SELECT * FROM filaments WHERE active=1 ORDER BY name").all();
  return json(request,{success:true,count:r.results.length,filaments:r.results});
}
async function getConsumables(request,env){
  const r=await env.DB.prepare("SELECT * FROM consumables WHERE active=1 ORDER BY name").all();
  return json(request,{success:true,count:r.results.length,consumables:r.results});
}
async function getTargets(request,env){
  const r=await env.DB.prepare("SELECT sku,location_id,target_qty,updated_at FROM inventory_targets ORDER BY sku,location_id").all();
  return json(request,{success:true,count:r.results.length,targets:r.results});
}
async function getInventory(request,env){
  const finished=await env.DB.prepare(`SELECT fi.sku,p.name,fi.location_id,l.name AS location_name,fi.qty,
    COALESCE(it.target_qty,0) AS target_qty FROM finished_inventory fi LEFT JOIN products p ON p.sku=fi.sku
    LEFT JOIN locations l ON l.id=fi.location_id LEFT JOIN inventory_targets it ON it.sku=fi.sku AND it.location_id=fi.location_id
    ORDER BY fi.sku,fi.location_id`).all();
  const assembled=await env.DB.prepare("SELECT ai.sku,p.name,ai.qty FROM assembled_inventory ai LEFT JOIN products p ON p.sku=ai.sku ORDER BY p.name").all();
  const inserts=await env.DB.prepare("SELECT ii.sku,p.name,ii.awaiting_cut,ii.ready_qty,ii.damage_demand,ii.cornwall_replenishment_demand FROM insert_inventory ii LEFT JOIN products p ON p.sku=ii.sku ORDER BY p.name").all();
  return json(request,{success:true,finished:finished.results,assembled:assembled.results,inserts:inserts.results});
}
async function getCore(request,env){
  const [products,recipes,filaments,targets]=await Promise.all([
    env.DB.prepare("SELECT * FROM products WHERE active=1 ORDER BY name").all(),
    env.DB.prepare("SELECT * FROM recipes ORDER BY sku,sort_order,id").all(),
    env.DB.prepare("SELECT * FROM filaments WHERE active=1 ORDER BY name").all(),
    env.DB.prepare("SELECT sku,location_id,target_qty FROM inventory_targets ORDER BY sku,location_id").all()
  ]);
  return json(request,{success:true,products:products.results,recipes:recipes.results,filaments:filaments.results,targets:targets.results});
}
async function updateTarget(request,env,sku,location){
  if(location==="boat")location="factory";
  let b={};try{b=await request.json()}catch{return error(request,"Valid JSON required.",400)}
  const qty=Math.max(0,asInt(b.target_qty));
  await env.DB.prepare(`INSERT INTO inventory_targets(sku,location_id,target_qty,updated_at) VALUES(?,?,?,?)
    ON CONFLICT(sku,location_id) DO UPDATE SET target_qty=excluded.target_qty,updated_at=excluded.updated_at`)
    .bind(sku,location,qty,now()).run();
  return json(request,{success:true,sku,location_id:location,target_qty:qty});
}
async function updateAvailability(request,env,sku){
  let b={};try{b=await request.json()}catch{return error(request,"Valid JSON required.",400)}
  const onSale=boolInt(b.on_sale),release=b.release_date||null;
  await env.DB.prepare("UPDATE products SET on_sale=?,release_date=?,updated_at=? WHERE sku=?").bind(onSale,release,now(),sku).run();
  return json(request,{success:true,sku,on_sale:!!onSale,release_date:release});
}
async function updateFilament(request,env,name){
  let b={};try{b=await request.json()}catch{return error(request,"Valid JSON required.",400)}
  const grams=Math.max(0,asNumber(b.grams_in_stock)),reorder=Math.max(0,asNumber(b.reorder_level_g,250));
  await env.DB.prepare(`INSERT INTO filaments(name,grams_in_stock,reorder_level_g,active,updated_at) VALUES(?,?,?,1,?)
    ON CONFLICT(name) DO UPDATE SET grams_in_stock=excluded.grams_in_stock,reorder_level_g=excluded.reorder_level_g,active=1,updated_at=excluded.updated_at`)
    .bind(name,grams,reorder,now()).run();
  return json(request,{success:true,name,grams_in_stock:grams,reorder_level_g:reorder});
}


async function getProductionState(request,env){
  const row=await env.DB.prepare("SELECT json_value,updated_at,updated_by FROM forge_operational_state WHERE state_key='production' LIMIT 1").first();
  let state={};
  if(row?.json_value){try{state=JSON.parse(row.json_value)}catch{}}
  return json(request,{success:true,state,updated_at:row?.updated_at||null,updated_by:row?.updated_by||null});
}
async function putProductionState(request,env,user){
  let b={};try{b=await request.json()}catch{return error(request,"Valid JSON required.",400)}
  const state=b.state&&typeof b.state==="object"?b.state:{};
  const stamp=now();
  await env.DB.prepare(`INSERT INTO forge_operational_state(state_key,json_value,updated_at,updated_by)
    VALUES('production',?,?,?)
    ON CONFLICT(state_key) DO UPDATE SET json_value=excluded.json_value,updated_at=excluded.updated_at,updated_by=excluded.updated_by`)
    .bind(JSON.stringify(state),stamp,user.id).run();
  return json(request,{success:true,updated_at:stamp});
}
async function getBuildPlates(request,env){
  const r=await env.DB.prepare("SELECT * FROM build_plates ORDER BY created_at DESC").all();
  const plates=(r.results||[]).map(x=>({...x,items:(()=>{try{return JSON.parse(x.items_json||'[]')}catch{return []}})()}));
  return json(request,{success:true,count:plates.length,plates});
}
async function putBuildPlate(request,env,user,id){
  let b={};try{b=await request.json()}catch{return error(request,"Valid JSON required.",400)}
  const p=b.plate||b;
  if(!p.code)return error(request,"Build plate code is required.",400);
  const stamp=now();
  await env.DB.prepare(`INSERT INTO build_plates(id,code,name,colour,printer,status,items_json,created_at,started_at,completed_at,updated_at,updated_by)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET code=excluded.code,name=excluded.name,colour=excluded.colour,printer=excluded.printer,
      status=excluded.status,items_json=excluded.items_json,created_at=excluded.created_at,started_at=excluded.started_at,
      completed_at=excluded.completed_at,updated_at=excluded.updated_at,updated_by=excluded.updated_by`)
    .bind(id,p.code,String(p.name||""),String(p.colour||""),String(p.printer||""),String(p.status||"draft"),
      JSON.stringify(p.items||[]),p.created_at||stamp,p.started_at||null,p.completed_at||null,stamp,user.id).run();
  return json(request,{success:true,id,updated_at:stamp});
}
async function deleteBuildPlate(request,env,id){
  await env.DB.prepare("DELETE FROM build_plates WHERE id=?").bind(id).run();
  return json(request,{success:true,id});
}

export default {
  async fetch(request,env){
    if(request.method==="OPTIONS")return new Response(null,{status:204,headers:{...corsHeaders(request),"Cache-Control":"public, max-age=86400"}});
    const url=new URL(request.url),path=url.pathname.replace(/\/+$/,"")||"/";
    try{
      if(request.method==="GET"&&path==="/")return json(request,{success:true,service:"PLA Forge API",auth:"employee",cors:"open",worker_version:"3f"});
      if(request.method==="GET"&&path==="/health")return health(request,env);
      if(request.method==="GET"&&path==="/cors-test")return json(request,{success:true,cors:"ok",origin:request.headers.get("Origin")||null});
      if(request.method==="POST"&&path==="/auth/bootstrap")return bootstrapAdmin(request,env);
      if(request.method==="POST"&&path==="/auth/login")return employeeLogin(request,env);

      const user=await requireAuth(request,env);
      if(!user)return error(request,"Authentication required.",401);
      let deny,m;
      if(request.method==="GET"&&path==="/auth/me")return json(request,{success:true,user:{id:user.id,email:user.email,name:user.name,role:user.role,permissions:permissionsFor(user.role)}});

      if(request.method==="GET"&&path==="/production/state"){if(deny=requirePermission(request,user,"*"))return deny;return getProductionState(request,env)}
      if(request.method==="PUT"&&path==="/production/state"){if(deny=requirePermission(request,user,"*"))return deny;return putProductionState(request,env,user)}
      if(request.method==="GET"&&path==="/build-plates"){if(deny=requirePermission(request,user,"*"))return deny;return getBuildPlates(request,env)}
      if(request.method==="GET"&&path==="/production/sync-status"){
        if(deny=requirePermission(request,user,"*"))return deny;
        const ps=await env.DB.prepare("SELECT updated_at,updated_by FROM forge_operational_state WHERE state_key='production' LIMIT 1").first();
        const bp=await env.DB.prepare("SELECT COUNT(*) AS count, MAX(updated_at) AS updated_at FROM build_plates").first();
        return json(request,{success:true,production:ps||null,build_plates:{count:Number(bp?.count||0),updated_at:bp?.updated_at||null}});
      }
      if(request.method==="PUT"&&(m=path.match(/^\/build-plates\/([^/]+)$/))){if(deny=requirePermission(request,user,"*"))return deny;return putBuildPlate(request,env,user,decodeURIComponent(m[1]))}
      if(request.method==="DELETE"&&(m=path.match(/^\/build-plates\/([^/]+)$/))){if(deny=requirePermission(request,user,"*"))return deny;return deleteBuildPlate(request,env,decodeURIComponent(m[1]))}

      if(request.method==="GET"&&path==="/users"){if(deny=requirePermission(request,user,"*"))return deny;return listUsers(request,env)}
      if(request.method==="POST"&&path==="/users"){if(deny=requirePermission(request,user,"*"))return deny;return createUser(request,env)}
      if(request.method==="PUT"&&(m=path.match(/^\/users\/([^/]+)$/))){if(deny=requirePermission(request,user,"*"))return deny;return updateUser(request,env,decodeURIComponent(m[1]))}

      if(request.method==="GET"&&path==="/products"){if(deny=requirePermission(request,user,"products:read"))return deny;return getProducts(request,env)}
      if(request.method==="GET"&&path==="/recipes"){if(deny=requirePermission(request,user,"recipes:read"))return deny;return getRecipes(request,env)}
      if(request.method==="GET"&&path==="/filaments"){if(deny=requirePermission(request,user,"filaments:read"))return deny;return getFilaments(request,env)}
      if(request.method==="GET"&&path==="/targets"){if(deny=requirePermission(request,user,"targets:read"))return deny;return getTargets(request,env)}
      if(request.method==="GET"&&path==="/inventory"){if(deny=requirePermission(request,user,"inventory:read"))return deny;return getInventory(request,env)}
      if(request.method==="GET"&&path==="/consumables"){if(deny=requirePermission(request,user,"consumables:read"))return deny;return getConsumables(request,env)}
      if(request.method==="GET"&&path==="/core"){if(deny=requirePermission(request,user,"core:read"))return deny;return getCore(request,env)}

      if(request.method==="PUT"&&(m=path.match(/^\/targets\/([^/]+)\/([^/]+)$/))){
        if(deny=requirePermission(request,user,"targets:write"))return deny;
        return updateTarget(request,env,decodeURIComponent(m[1]),decodeURIComponent(m[2]));
      }
      if(request.method==="PUT"&&(m=path.match(/^\/products\/([^/]+)\/availability$/))){
        if(user.role!=="admin")return error(request,"Only administrators can change product availability.",403);
        return updateAvailability(request,env,decodeURIComponent(m[1]));
      }
      if(request.method==="PUT"&&(m=path.match(/^\/filaments\/(.+)$/))){
        if(deny=requirePermission(request,user,"filaments:write"))return deny;
        return updateFilament(request,env,decodeURIComponent(m[1]));
      }

      return error(request,"Endpoint not found.",404);
    }catch(err){
      return error(request,"PLA Forge API error.",500,err instanceof Error?err.message:String(err));
    }
  }
};
