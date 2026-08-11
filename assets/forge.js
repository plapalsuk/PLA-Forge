
const STORE='plaForgeV02';

const RESET_RELEASE='0.9.8';
function blankOperationalState(){
 return {
   stock:{},
   targets:{},
   parts:{},
   plates:[],
   printHistory:[],
   failedParts:[],
   assembled:{},
   assemblyHistory:[],
   boxes:{},
   boxHistory:[],
   packagingComponents:{clear_boxes:0,inserts:0,stickers:0},
   inserts:{},
   insertHistory:[],
   consumables:{
     clear_boxes:{name:'Flat Clear Boxes',stock:0,reorder:25,unit:'boxes'},
     bottom_cards:{name:'Bottom Card Squares',stock:0,reorder:25,unit:'cards'},
     stickers:{name:'Stickers',stock:0,reorder:25,unit:'stickers'},
     card_210gsm:{name:'210gsm Card',stock:0,reorder:25,unit:'sheets'}
   },
   consumableHistory:[],
   packingJobs:{},
   packingHistory:[],
   finishedStock:{boat:{},cornwall:{}},
   awaitingDispatch:[],
   transfers:[],
   damageHistory:[],
   damageReworkJobs:[],
   reworkHistory:[],
   cornwallReworkStock:{clear_boxes:0,inserts:{}},
   cornwallInsertReplenishment:{},
   damageInsertDemand:{},
   production:{},
   productionPlan:{},
   printers:[],
   printerRoles:{},
   siteSettings:{defaultPrinter:'',defaultLocation:'boat'},
   productAvailability:{},
   customData:{products:[],recipes:[],insert_files:{}},
   shopifyProducts:{},
   resetRelease:RESET_RELEASE
 };
}
function ensureCleanResetRelease(){
 try{
   const raw=localStorage.getItem(STORE);
   if(!raw){
     localStorage.setItem(STORE,JSON.stringify(blankOperationalState()));
     localStorage.setItem('plaForgeLastReset',new Date().toISOString());
   }else{
     const current=JSON.parse(raw);
     if(current && current.resetRelease!==RESET_RELEASE){
       current.resetRelease=RESET_RELEASE;
       localStorage.setItem(STORE,JSON.stringify(current));
     }
   }
 }catch(e){
   // Do not automatically wipe an existing browser store because of a version change.
   console.error('Forge local state could not be read safely:',e);
 }
}
ensureCleanResetRelease();



const CLOUD_PRODUCTION_FIELDS=[
 'stock','parts','printHistory','failedParts','assembled','assemblyHistory','boxes','boxHistory',
 'packagingComponents','inserts','insertHistory','consumables','consumableHistory','packingJobs',
 'packingHistory','finishedStock','awaitingDispatch','transfers','damageHistory','damageReworkJobs',
 'reworkHistory','cornwallReworkStock','cornwallInsertReplenishment','damageInsertDemand','production',
 'productionPlan','plateSeq'
];

let forgeCloudOperationalState=null;

function emptyCloudWorkingState(){
 const s=blankOperationalState();
 s.targets={};
 s.stock={};
 s.productAvailability={};
 return s;
}
function cloudOperationalState(){
 if(!forgeCloudOperationalState)throw new Error('Cloud operational state has not loaded yet.');
 return forgeCloudOperationalState;
}

let forgeProductionCloudReady=false;
let forgeProductionCloudSaving=false;

function productionCloudPayload(s){
 const out={};
 CLOUD_PRODUCTION_FIELDS.forEach(k=>out[k]=s[k]);
 return out;
}

let forgeCloudSyncState='idle';
let forgeCloudSyncMessage='Waiting for sync';

function setForgeCloudSync(state,message){
 forgeCloudSyncState=state;
 forgeCloudSyncMessage=message||state;
 const el=document.querySelector('#forgeCloudSyncBadge');
 if(!el)return;
 const cls=state==='synced'?'ok':state==='error'?'danger':state==='syncing'?'warning':'info';
 el.className='badge '+cls;
 el.textContent=state==='synced'?'Cloud Synced':state==='error'?'Sync Error':state==='syncing'?'Syncing…':'Cloud Ready';
 el.title=forgeCloudSyncMessage;
}

let forgeLiveSyncTimer=null;
let forgeLastCloudStamp=null;
let forgeLiveSyncBusy=false;

async function forgeCloudStamp(){
 try{
   const [d,availability,consumableData]=await Promise.all([
     cloudFetch('/production/sync-status'),
     cloudAvailability(),
     cloudConsumables()
   ]);

   const availabilityStamp=(availability||[])
     .map(x=>`${x.sku}:${x.on_sale?'1':'0'}:${x.release_date||''}:${x.updated_at||''}`)
     .sort()
     .join('|');

   const consumableStamp=(consumableData?.consumables||[])
     .map(x=>`${x.key}:${Number(x.stock||0)}:${Number(x.reorder||0)}:${x.updated_at||''}`)
     .sort()
     .join('|');

   const historyStamp=(consumableData?.history||[])
     .slice(0,5)
     .map(x=>`${x.id}:${x.change}:${x.created_at||''}`)
     .join('|');

   return JSON.stringify({
     production:d?.production?.updated_at||null,
     build_count:Number(d?.build_plates?.count||0),
     build_updated:d?.build_plates?.updated_at||null,
     availability:availabilityStamp,
     consumables:consumableStamp,
     consumable_history:historyStamp
   });
 }catch(e){
   return null;
 }
}

async function startForgeLiveSync(onChange){
 if(forgeLiveSyncTimer)clearInterval(forgeLiveSyncTimer);

 forgeLastCloudStamp=await forgeCloudStamp();

 forgeLiveSyncTimer=setInterval(async()=>{
   if(document.hidden || forgeLiveSyncBusy || forgeProductionCloudSaving)return;
   forgeLiveSyncBusy=true;
   try{
     const stamp=await forgeCloudStamp();
     if(stamp && forgeLastCloudStamp && stamp!==forgeLastCloudStamp){
       setForgeCloudSync('syncing','Another device changed Forge data · refreshing');
       const ok=await hydrateProductionCloud(true);
       if(ok){
         forgeLastCloudStamp=await forgeCloudStamp()||stamp;
         if(typeof onChange==='function')await onChange(cloudOperationalState());
         setForgeCloudSync('synced','Live cloud update received');
       }
     }else if(stamp && !forgeLastCloudStamp){
       forgeLastCloudStamp=stamp;
     }
   }finally{
     forgeLiveSyncBusy=false;
   }
 },2000);
}

window.addEventListener('beforeunload',()=>{
 if(forgeLiveSyncTimer)clearInterval(forgeLiveSyncTimer);
});

function installForgeCloudSyncBadge(){
 if(!['production.html','plates.html','parts.html','assembly.html','pals.html','packing-station.html','packaging.html','availability.html','settings.html','consumables.html'].includes(forgeCurrentPage()))return;
 if(document.querySelector('#forgeCloudSyncBadge'))return;
 const host=document.querySelector('.topbar')||document.querySelector('main')||document.body;
 const wrap=document.createElement('div');
 wrap.className='forge-cloud-sync';
 wrap.innerHTML='<span id="forgeCloudSyncBadge" class="badge info">Cloud Ready</span><button id="forgeCloudRefresh" class="btn ghost" type="button">Refresh Cloud</button>';
 host.appendChild(wrap);
 document.querySelector('#forgeCloudRefresh').onclick=async()=>{
   setForgeCloudSync('syncing','Refreshing from D1');
   const ok=await hydrateProductionCloud(true);
   if(ok)location.reload();
 };
}


function showCloudRequiredError(message){
 const main=document.querySelector('main')||document.body;
 const box=document.createElement('div');
 box.className='card cloud-required-error';
 box.innerHTML=`<h2>Cloud connection required</h2><p>${esc(message||'Forge could not load live data from Cloudflare D1.')}</p><button class="btn" onclick="location.reload()">Try Again</button>`;
 main.prepend(box);
}

async function hydrateProductionCloud(force=false){
 if(!cloudToken())throw new Error('Cloud login required.');
 setForgeCloudSync('syncing','Loading live state from Cloudflare D1');
 try{
   const [st,bp,targetData,availabilityData,consumableData]=await Promise.all([
     cloudFetch('/production/state'),
     cloudFetch('/build-plates'),
     cloudFetch('/targets'),
     cloudAvailability(),
     cloudConsumables()
   ]);

   const s=emptyCloudWorkingState();
   const cloudState=st?.state||{};
   const blank=blankOperationalState();

   CLOUD_PRODUCTION_FIELDS.forEach(k=>{
     s[k]=cloudState[k]!==undefined
       ? JSON.parse(JSON.stringify(cloudState[k]))
       : JSON.parse(JSON.stringify(blank[k]));
   });

   s.targets={};
   (targetData?.targets||[]).forEach(t=>{
     const loc=t.location_id==='factory'?'boat':t.location_id;
     s.targets[targetKey(t.sku,loc)]=Number(t.target_qty||0);
   });

   // One authoritative availability source for every page.
   applyCloudAvailability(s,availabilityData);

   // Consumables are also authoritative from D1.
   applyCloudConsumables(s,consumableData);

   s.plates=(bp?.plates||[]).map(p=>({
     id:p.id,code:p.code,name:p.name||'',colour:p.colour||'',printer:p.printer||'',
     status:p.status||'draft',items:p.items||[],created_at:p.created_at,
     started_at:p.started_at||null,completed_at:p.completed_at||null
   }));

   forgeCloudOperationalState=s;
   forgeProductionCloudReady=true;
   setForgeCloudSync('synced',`Live D1 · ${s.plates.length} active build plate(s)`);
   return s;
 }catch(e){
   forgeCloudOperationalState=null;
   forgeProductionCloudReady=false;
   setForgeCloudSync('error',e.message||'Cloud data unavailable');
   console.error('Cloud production hydrate failed',e);
   throw e;
 }
}
let forgeProductionSaveQueue=Promise.resolve();
function saveProductionCloud(s){
 if(!cloudToken())return Promise.resolve(false);
 const snapshot=JSON.parse(JSON.stringify(s));
 forgeProductionSaveQueue=forgeProductionSaveQueue.then(async()=>{
   setForgeCloudSync('syncing','Saving production changes to D1');
   try{
     await cloudFetch('/production/state',{
       method:'PUT',headers:{'Content-Type':'application/json'},
       body:JSON.stringify({state:productionCloudPayload(snapshot)})
     });

     const cloud=await cloudFetch('/build-plates');
     const localIds=new Set((snapshot.plates||[]).map(p=>p.id));

     for(const p of (cloud.plates||[])){
       if(!localIds.has(p.id)){
         await cloudFetch('/build-plates/'+encodeURIComponent(p.id),{method:'DELETE'});
       }
     }
     for(const p of (snapshot.plates||[])){
       await cloudFetch('/build-plates/'+encodeURIComponent(p.id),{
         method:'PUT',headers:{'Content-Type':'application/json'},
         body:JSON.stringify({plate:p})
       });
     }
     forgeLastCloudStamp=await forgeCloudStamp()||forgeLastCloudStamp;
     setForgeCloudSync('synced',`Saved to D1 · ${(snapshot.plates||[]).length} active build plate(s)`);
     return true;
   }catch(e){
     setForgeCloudSync('error',e.message||'Cloud save failed');
     console.error('Cloud production save failed',e);
     throw e;
   }
 });
 return forgeProductionSaveQueue;
}

function state(){
  let s={};
  try{s=JSON.parse(localStorage.getItem(STORE)||'{}')}catch(e){}
  if(!Object.keys(s).length){try{s=JSON.parse(localStorage.getItem('plaForgeV01')||'{}')}catch(e){}}
  s.targets=s.targets||{}; s.filament=s.filament||{}; s.stock=s.stock||{}; s.parts=s.parts||{};
  s.plates=s.plates||[]; s.printHistory=s.printHistory||[]; s.failedParts=s.failedParts||[]; s.plateSeq=Number(s.plateSeq||1);
  s.printers=s.printers||[]; s.siteSettings=s.siteSettings||{defaultPrinter:'',defaultLocation:'boat'};
  s.assembled=s.assembled||{}; s.assemblyHistory=s.assemblyHistory||[];
  s.boxes=s.boxes||{}; s.boxHistory=s.boxHistory||[]; s.packagingComponents=s.packagingComponents||{clear_boxes:0,inserts:0,stickers:0,barcode_labels:0};
  s.inserts=s.inserts||{}; s.insertHistory=s.insertHistory||[];
  s.consumables=s.consumables||{
    clear_boxes:{name:'Flat Clear Boxes',stock:0,reorder:25,unit:'boxes'},
    bottom_cards:{name:'Bottom Card Squares',stock:0,reorder:25,unit:'cards'},
    stickers:{name:'Stickers',stock:0,reorder:25,unit:'stickers'}
  };
  s.consumables=s.consumables||{};
  s.consumables.card_210gsm=s.consumables.card_210gsm||{name:'210gsm Card',stock:0,reorder:25,unit:'sheets'};
  s.consumableHistory=s.consumableHistory||[];
  s.packingJobs=s.packingJobs||{}; s.packingHistory=s.packingHistory||[];
  s.finishedStock=s.finishedStock||{boat:{},cornwall:{}}; s.transfers=s.transfers||[]; s.awaitingDispatch=s.awaitingDispatch||[];
  s.awaitingDispatch=s.awaitingDispatch||[];
  if(s.consumables && s.consumables.barcode_labels) delete s.consumables.barcode_labels;
  s.printerRoles=s.printerRoles||{};

  s.damageHistory=s.damageHistory||[];
  s.damageReworkJobs=s.damageReworkJobs||[];
  s.damageInsertDemand=s.damageInsertDemand||{};
  s.customData=s.customData||{products:[],recipes:[],insert_files:{}};
  s.customData.products=s.customData.products||[];
  s.customData.recipes=s.customData.recipes||[];
  s.customData.insert_files=s.customData.insert_files||{};
  s.shopifyProducts=s.shopifyProducts||{};
  s.siteSettings=s.siteSettings||{defaultPrinter:'',defaultLocation:'boat'};
  s.siteSettings.shopifyBridgeUrl=s.siteSettings.shopifyBridgeUrl||'';
  s.siteSettings.shopifyVendor=s.siteSettings.shopifyVendor||'PLA Pals';
  s.siteSettings.shopifyProductType=s.siteSettings.shopifyProductType||'PLA Pal';
  s.siteSettings.forgeApiUrl=s.siteSettings.forgeApiUrl||'https://pla-forge-api.plapalsuk.workers.dev';
  s.productAvailability=s.productAvailability||{};
  return s;
}
function save(s){
 if(forgeProductionCloudReady){
   forgeCloudOperationalState=s;
   return saveProductionCloud(s);
 }
 // Legacy pages not migrated yet may still use this path temporarily.
 // New cloud-migrated workflows must never depend on it.
 localStorage.setItem(STORE,JSON.stringify(s));
 return Promise.resolve(true);
}
async function load(name){
 if(name==='products')return await cloudCoreProducts();
 if(name==='recipes')return await cloudCoreRecipes();

 // Non-catalogue static reference files may still be loaded from the deployed site,
 // but operational inventory never comes from browser localStorage.
 const base=await (await fetch('data/'+name+'.json',{cache:'no-store'})).json();
 return base;
}
function badge(txt, cls='info'){return `<span class="badge ${cls}">${txt}</span>`}
function targetKey(sku,loc){return `${sku}:${loc}`}
function getTarget(s,sku,loc){return Number(s.targets[targetKey(sku,loc)]||0)}
function stock(s,sku,loc){return Number((s.stock[sku]||{})[loc]||0)}
function needed(s,sku,loc){return Math.max(0,getTarget(s,sku,loc)-stock(s,sku,loc))}
function totalNeed(s,sku){return needed(s,sku,'boat')+needed(s,sku,'cornwall')}
function awaitingDispatchQty(s,sku){
 return (s.awaitingDispatch||[])
   .filter(x=>x.sku===sku&&x.status==='awaiting_dispatch')
   .reduce((a,x)=>a+Number(x.qty||0),0);
}
function assembledQtyForDemand(s,sku){return Number(s.assembled?.[sku]||0)}
// Quantity still requiring manufacture after allowing for finished Pals already in the workflow.
// Location stock is already deducted by totalNeed(). Packed-but-unallocated and assembled Pals
// must also be deducted so moving a Pal downstream never creates fresh print demand.
function damageReworkQty(s,sku,type){
 return (s.damageReworkJobs||[])
   .filter(x=>x.sku===sku&&x.status==='awaiting_rework'&&(!type||x.type===type))
   .reduce((a,x)=>a+Number(x.qty||0),0);
}
function intactDamageReworkQty(s,sku){
 const legacy=damageReworkQty(s,sku,'box')+damageReworkQty(s,sku,'insert');
 const localItems=(s.damageReworkJobs||[])
   .filter(x=>x.sku===sku&&x.status==='awaiting_rework'&&x.type==='item')
   .filter(x=>damageReworkRequirements(x).route==='cornwall')
   .reduce((a,x)=>a+Number(x.qty||1),0);
 return legacy+localItems;
}
function manufacturingNeed(s,sku){
 return Math.max(0,totalNeed(s,sku)-assembledQtyForDemand(s,sku)-awaitingDispatchQty(s,sku)-intactDamageReworkQty(s,sku));
}
// Quantity still needing assembly. Packed Pals count as completed manufacture and must not
// reappear on The Bench after they leave assembled stock.
function assemblyNeed(s,sku){
 return Math.max(0,totalNeed(s,sku)-awaitingDispatchQty(s,sku)-assembledQtyForDemand(s,sku));
}
function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function groupKey(r){return `group|${r.sku}|${r.filament}|${r.grouped_stl}`}
function recoveryKey(sku,file){return `recovery|${sku}|${file}`}
function partQty(s,key){return Number(s.parts[key]||0)}
function activePlateQty(s,key){return (s.plates||[]).filter(p=>!['complete','cancelled'].includes(p.status)).reduce((sum,p)=>sum+(p.items||[]).filter(i=>i.inventory_key===key).reduce((a,i)=>a+Number(i.qty||0),0),0)}
function statusLabel(st){const m={draft:['Draft','info'],printing:['Printing','warning'],complete:['Complete','ok'],cancelled:['Cancelled','danger']};const x=m[st]||[st,'info'];return badge(x[0],x[1])}
function fmtDate(v){if(!v)return '—';try{return new Date(v).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}catch(e){return v}}
function makeId(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7)}


function cloudToken(){return localStorage.getItem('plaForgeCloudToken')||''}
function setCloudToken(v){if(v)localStorage.setItem('plaForgeCloudToken',v);else localStorage.removeItem('plaForgeCloudToken')}
const FORGE_API_URL='https://pla-forge-api.plapalsuk.workers.dev';
function cloudApiBase(){return FORGE_API_URL}
async function cloudFetch(path,options={}){
 const headers={...(options.headers||{})};
 const token=cloudToken();
 if(token)headers.Authorization=`Bearer ${token}`;
 const res=await fetch(cloudApiBase()+path,{...options,headers});
 const data=await res.json().catch(()=>({}));
 if(res.status===401)setCloudToken('');
 if(!res.ok)throw new Error(data.detail||data.error||`HTTP ${res.status}`);
 return data;
}

async function cloudFetchTimed(path,options={},timeoutMs=12000){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
   return await cloudFetch(path,{...options,signal:controller.signal});
 }catch(e){
   if(e?.name==='AbortError')throw new Error(`Cloud request timed out after ${Math.round(timeoutMs/1000)} seconds.`);
   throw e;
 }finally{
   clearTimeout(timer);
 }
}
async function refreshProductAvailabilityFromD1(s){
 const rows=await cloudAvailability();
 applyCloudAvailability(s,rows);
 return rows;
}


function normaliseCloudProduct(p){
 return {
   ...p,
   type:p.product_type||p.type||'pal',
   description:p.short_description||p.description||'',
   height_cm:Number(p.height_cm||0),
   width_cm:Number(p.width_cm||0),
   depth_cm:Number(p.depth_cm||0),
   price:Number(p.price||0),
   on_sale:Number(p.on_sale||0)===1,
   keyring:Number(p.keyring||0)===1,
   recipe_ready:Number(p.recipe_ready||0)===1,
   active:Number(p.active??1)===1,
   characteristics:[p.characteristic_1,p.characteristic_2,p.characteristic_3].filter(Boolean)
 };
}
function normaliseCloudRecipe(r){
 return {
   ...r,
   filament:r.filament_name||r.filament||'',
   weight_g:Number(r.weight_g||0),
   part_count:Number(r.part_count||1)
 };
}
async function syncCloudCoreState(){
 if(!cloudToken())return {ok:false,reason:'not_logged_in'};
 try{
   const core=await cloudFetch('/core');
   return {
     ok:true,
     core:{
       ...core,
       products:(core.products||[]).map(normaliseCloudProduct),
       recipes:(core.recipes||[]).map(normaliseCloudRecipe)
     }
   };
 }catch(e){
   console.error('Cloud Core sync failed.',e);
   return {ok:false,reason:e.message};
 }
}
async function cloudCoreProducts(){
 if(!cloudToken())throw new Error('Cloud login required.');
 const d=await cloudFetch('/products');
 return (d.products||[]).map(normaliseCloudProduct);
}
async function cloudAvailability(){
 if(!cloudToken())throw new Error('Cloud login required.');
 const d=await cloudFetchTimed('/availability',{},10000);
 return d.availability||[];
}
async function cloudConsumables(){
 if(!cloudToken())throw new Error('Cloud login required.');
 return await cloudFetchTimed('/consumables',{},10000);
}
function applyCloudConsumables(s,data){
 s.consumables={};
 (data?.consumables||[]).forEach(x=>{
   s.consumables[x.key]={
     name:x.name,
     stock:Number(x.stock||0),
     reorder:Number(x.reorder||0),
     unit:x.unit||'units'
   };
 });
 s.consumableHistory=(data?.history||[]).slice();
}
function applyCloudAvailability(s,rows){
 s.productAvailability={};
 (rows||[]).forEach(x=>{
   s.productAvailability[x.sku]={
     on_sale:x.on_sale===true,
     release_date:x.release_date||''
   };
 });
}
async function cloudCoreRecipes(){
 if(!cloudToken())throw new Error('Cloud login required.');
 const d=await cloudFetch('/recipes');
 return (d.recipes||[]).map(normaliseCloudRecipe);
}
function cloudModeBadge(){
 return cloudToken()?badge('CLOUD LIVE','ok'):badge('CLOUD LOGIN REQUIRED','danger');
}


const FORGE_ROLE_PAGES={
 admin:['*'],
 packing:['packing-station.html'],
 retail_staff:['deliveries.html','rework.html']
};
function forgeCurrentPage(){return location.pathname.split('/').pop()||'index.html'}
function roleCanOpen(role,page){
 const allowed=FORGE_ROLE_PAGES[role]||[];
 return allowed.includes('*')||allowed.includes(page);
}
function roleHomePage(role){
 if(role==='packing')return 'packing-station.html';
 if(role==='retail_staff')return 'deliveries.html';
 return 'index.html';
}
function currentForgeUser(){
 try{return JSON.parse(localStorage.getItem('plaForgeUser')||'null')}catch{return null}
}
function setForgeUser(user){if(user)localStorage.setItem('plaForgeUser',JSON.stringify(user));else localStorage.removeItem('plaForgeUser')}
async function forgeRequireLogin(){
 if(forgeCurrentPage()==='login.html')return;
 if(!cloudToken()){
   const returnTo=encodeURIComponent(location.href);
   location.replace(`login.html?return=${returnTo}`);
   return;
 }
 try{
   const me=await cloudFetch('/auth/me');
   const user=me.user||me;
   setForgeUser(user);
   if(!roleCanOpen(user.role,forgeCurrentPage())){
     location.replace(roleHomePage(user.role)+'?denied=1');
     return;
   }
   applyRoleNavigation(user);
   document.body.classList.add('forge-auth-ready');
   setTimeout(()=>applyRolePageRestrictions(user),0);
 }catch(e){
   setCloudToken('');setForgeUser(null);
   const returnTo=encodeURIComponent(location.href);
   location.replace(`login.html?return=${returnTo}`);
 }
}
function applyRoleNavigation(user){
 const role=user?.role||'';
 const current=forgeCurrentPage();

 // Hide every navigation link the role cannot open.
 document.querySelectorAll('.sidebar a').forEach(a=>{
   const href=(a.getAttribute('href')||'').split('?')[0].split('#')[0];
   if(!href)return;
   const page=href.split('/').pop();
   if(page&&page.endsWith('.html')){
     const allowed=roleCanOpen(role,page);
     a.style.display=allowed?'inline-flex':'none';
     a.setAttribute('aria-hidden',allowed?'false':'true');
   }
 });

 // Hide empty section headings/groups after their links have been filtered.
 document.querySelectorAll('.sidebar .navgroup').forEach(group=>{
   const scope=group.parentElement||document;
   let next=group.nextElementSibling;
   let hasVisible=false;
   while(next && !next.classList.contains('navgroup')){
     if(next.matches?.('a') && next.style.display!=='none')hasVisible=true;
     next=next.nextElementSibling;
   }
   group.style.display=hasVisible?'block':'none';
 });

 // On mobile, only keep role-relevant tabs visible and mark active tab.
 document.querySelectorAll('.sidebar a').forEach(a=>{
   const href=(a.getAttribute('href')||'').split('?')[0].split('#')[0];
   const page=href.split('/').pop();
   a.classList.toggle('role-active-tab',page===current);
 });

 // Signed-in user card.
 const side=document.querySelector('.sidebar');
 if(side&&!side.querySelector('.forge-user-card')){
   const card=document.createElement('div');
   card.className='forge-user-card';
   card.innerHTML=`<div><strong>${esc(user.name||user.email||'Forge User')}</strong><div class="small">${esc(role==='retail_staff'?'Retail Staff':role==='packing'?'Packing':'Admin')}</div></div><button class="iconbtn" id="forgeQuickLogout" title="Log out">↪</button>`;
   side.appendChild(card);
   card.querySelector('#forgeQuickLogout').onclick=forgeLogout;
 }
}

function applyRolePageRestrictions(user){
 if(!user)return;
 document.body.classList.add('forge-role-'+String(user.role||'').replace(/_/g,'-'));
 if(user.role==='retail_staff'&&forgeCurrentPage()==='deliveries.html'){
   const pageTitle=document.querySelector('.pageTitle h1');
   if(pageTitle)pageTitle.textContent='Cornwall Deliveries';
   const subtitle=document.querySelector('.pageTitle .small');
   if(subtitle)subtitle.textContent='Receive stock and complete the Cornwall quality check.';

   // Retail staff only need the Cornwall receiving workflow, not factory dispatch allocation.
   const hideHeadings=[
     'Ready to Dispatch',
     'Boat Inventory',
     'Cornwall Inventory'
   ];
   document.querySelectorAll('h1,h2,h3,h4,.stat,.card,.panel,section').forEach(el=>{
     const text=(el.textContent||'').trim();
     if(hideHeadings.some(h=>text.startsWith(h))){
       // Prefer hiding the containing card/section rather than a heading alone.
       const card=el.closest('section,.card,.panel,[class*="card"],[class*="panel"]')||el;
       card.style.display='none';
     }
   });
   // Hide top summary cards by their labels, including Ready to Dispatch/Boat/Cornwall Inventory.
   document.querySelectorAll('body *').forEach(el=>{
     if(el.children.length>8)return;
     const text=(el.textContent||'').trim();
     if(/^(READY TO DISPATCH|BOAT INVENTORY|CORNWALL INVENTORY)\b/i.test(text)){
       const card=el.closest('.stat-card,.metric-card,.card,[class*="stat"],[class*="metric"]')||el;
       card.style.display='none';
     }
   });
   // Keep Awaiting Cornwall Delivery visible.
   document.querySelectorAll('button').forEach(btn=>{
     const text=(btn.textContent||'').trim();
     if(/split allocation|confirm dispatch|dispatch to/i.test(text))btn.style.display='none';
   });
 }
 if(user.role==='retail_staff'&&forgeCurrentPage()==='rework.html'){
   // Retail staff may work only with Cornwall-held Box and Insert rework.
   const allowed=/box|insert/i;
   document.querySelectorAll('tr').forEach(row=>{
     const text=row.textContent||'';
     if(/pal damaged|pal broken|full pal|complete pal|factory|filament|print/i.test(text)&&!allowed.test(text)) row.style.display='none';
   });
   document.querySelectorAll('button,[role="button"]').forEach(btn=>{
     const text=(btn.textContent||'')+' '+(btn.title||'');
     if(/factory|produce pal|print pal|dispatch pal|complete pal/i.test(text)) btn.style.display='none';
   });
 }
}

function forgeLogout(){
 document.body.classList.remove('forge-auth-ready');
 setCloudToken('');setForgeUser(null);
 location.replace('login.html');
}

async function dashboard(){
 const ps=await load('products'), rs=await load('recipes'), mm=await load('mismatches'), s=state();
 const pals=ps.filter(x=>x.type==='pal'), keys=pals.filter(x=>x.keyring), st=ps.filter(x=>x.type==='sticker');
 document.querySelector('#pals').textContent=pals.length; document.querySelector('#keys').textContent=keys.length;
 document.querySelector('#stickers').textContent=st.length; document.querySelector('#recipes').textContent=new Set(rs.map(x=>x.sku)).size;
 document.querySelector('#filaments').textContent=new Set(rs.map(x=>x.filament).filter(Boolean)).size;
 const missing=pals.filter(x=>!x.recipe_ready);
 document.querySelector('#missingRecipes').innerHTML=missing.slice(0,10).map(x=>`<div class="listitem"><strong>${esc(x.name)}</strong><span class="sku">${x.sku}</span></div>`).join('')||'<div class="listitem">All products have a recipe.</div>';
 document.querySelector('#dataWarnings').innerHTML=mm.slice(0,10).map(x=>`<div class="listitem"><strong>${esc(x.recipe)}</strong><span class="muted">${x.stated_sku} → ${x.resolved_sku}</span></div>`).join('')||'<div class="listitem">No SKU mismatches detected.</div>';
 const mini=document.querySelector('#forgeStatus');
 if(mini){const active=s.plates.filter(p=>p.status==='printing').length,draft=s.plates.filter(p=>p.status==='draft').length,printed=Object.values(s.parts).reduce((a,b)=>a+Number(b||0),0);mini.innerHTML=`<div class="listitem"><strong>${active} plate(s) printing</strong><span class="muted">${draft} draft · ${printed} printed inventory units</span></div>`}
}
function isOnSale(s,sku){return s.productAvailability?.[sku]?.on_sale===true}
function releaseDateFor(s,sku){return s.productAvailability?.[sku]?.release_date||''}

async function inventory(type){
 installForgeCloudSyncBadge();
 // Inventory pages now use live D1 state; never browser operational cache.
 if(!forgeProductionCloudReady){
   try{await hydrateProductionCloud()}
   catch(e){showCloudRequiredError(e.message);return}
 }
 let s=cloudOperationalState();
 const ps=await load('products');
 let items=ps.filter(x=>type==='sticker'?x.type==='sticker':x.type==='pal'&&(type==='pal'||x.keyring));
 const tbody=document.querySelector('#rows');
 const q=document.querySelector('#q');

 function draw(){
   const text=(q.value||'').toLowerCase();
   const shown=items
     .filter(x=>`${x.sku} ${x.name}`.toLowerCase().includes(text))
     .sort((a,b)=>Number(isOnSale(s,b.sku))-Number(isOnSale(s,a.sku))||a.name.localeCompare(b.name));

   tbody.innerHTML=shown.map(x=>{
     const b=stock(s,x.sku,'boat');
     const c=stock(s,x.sku,'cornwall');
     const bt=getTarget(s,x.sku,'boat');
     const ct=getTarget(s,x.sku,'cornwall');
     const need=needed(s,x.sku,'boat')+needed(s,x.sku,'cornwall');
     const sale=isOnSale(s,x.sku);

     return `<tr class="pal-inventory-card ${sale?'on-sale-row':''}">
       <td class="pal-product" data-label="Pal"><div class="product-name">${esc(x.name)}</div><span class="sku">${x.sku}</span></td>
       <td data-label="On Sale">${sale?badge('ON SALE','ok'):badge('NOT ON SALE','')}</td>
       <td data-label="Recipe">${x.recipe_ready?badge('Recipe ready','ok'):badge('No recipe','warning')}</td>
       <td class="stock-cell" data-label="Boat Stock"><strong>${b}</strong></td>
       <td class="target-cell" data-label="Boat Target"><input class="number t" data-sku="${x.sku}" data-loc="boat" type="number" min="0" value="${bt}"></td>
       <td class="stock-cell" data-label="Cornwall Stock"><strong>${c}</strong></td>
       <td class="target-cell" data-label="Cornwall Target"><input class="number t" data-sku="${x.sku}" data-loc="cornwall" type="number" min="0" value="${ct}"></td>
       <td class="need-cell" data-label="Need"><strong>${need}</strong></td>
     </tr>`;
   }).join('');

   document.querySelectorAll('.t').forEach(el=>el.onchange=async()=>{
     const sku=el.dataset.sku;
     const loc=el.dataset.loc;
     const qty=Math.max(0,Number(el.value||0));
     const previous=getTarget(s,sku,loc);

     el.disabled=true;
     try{
       await cloudFetch(`/targets/${encodeURIComponent(sku)}/${encodeURIComponent(loc)}`,{
         method:'PUT',
         headers:{'Content-Type':'application/json'},
         body:JSON.stringify({target_qty:qty})
       });
       s.targets[targetKey(sku,loc)]=qty;
       draw();
     }catch(e){
       s.targets[targetKey(sku,loc)]=previous;
       alert(`Cloud target update failed: ${e.message}`);
       draw();
     }
   });
 }

 q.oninput=draw;
 draw();

 // Keep stock and targets live while the page is open.
 await startForgeLiveSync(async fresh=>{
   s=fresh;
   draw();
 });
}
async function recipes(){
 await syncCloudCoreState();
 const ps=await load('products'),rs=await load('recipes'),q=document.querySelector('#q'),box=document.querySelector('#cards');
 function draw(){const text=(q.value||'').toLowerCase(),filtered=ps.filter(p=>p.type==='pal'&&`${p.sku} ${p.name} ${(p.filaments||[]).join(' ')}`.toLowerCase().includes(text));
 box.innerHTML=filtered.map(p=>{const rr=rs.filter(r=>r.sku===p.sku);return `<div class="card recipe-card"><h3>${esc(p.name)}</h3><span class="sku">${p.sku}</span><div class="small">${rr.length} colour group(s) · ${p.recipe_weight_g||0}g total</div>${rr.map(r=>`<div class="listitem" style="margin-top:9px"><div class="colour">${esc(r.filament)}</div><strong>${esc(r.parts)}</strong><div>${r.weight_g}g · ${r.part_count} part(s)</div><code>${esc(r.grouped_stl)}</code></div>`).join('')||'<div class="listitem" style="margin-top:9px">No recipe entered yet.</div>'}</div>`}).join('')}
 q.oninput=draw;draw()
}
async function production(){
 installForgeCloudSyncBadge();
 if(!forgeProductionCloudReady){try{await hydrateProductionCloud()}catch(e){showCloudRequiredError(e.message);return}}
 const ps=await load('products'),rs=await load('recipes'),body=document.querySelector('#prod');
 let s=cloudOperationalState();
 function drawProduction(){
   const rows=[];
 ps.filter(p=>p.type==='pal').forEach(p=>{const n=manufacturingNeed(s,p.sku);if(n>0)rows.push({p,n,groups:rs.filter(r=>r.sku===p.sku)})});rows.sort((a,b)=>b.n-a.n);
 body.innerHTML=rows.map(x=>`<tr><td><strong>${esc(x.p.name)}</strong><br><span class="sku">${x.p.sku}</span></td><td>${x.n}</td><td>${x.groups.length}</td><td>${(x.groups.reduce((a,r)=>a+r.weight_g,0)*x.n).toFixed(1)}g</td><td>${x.groups.map(r=>esc(r.filament)).join(', ')}</td></tr>`).join('')||'<tr><td colspan="5">No Pal manufacturing currently required.</td></tr>';
 const damage=document.querySelector('#damageProduction');
 if(damage){
   const labels={box:'Repack — Box',insert:'Print Insert + Repack',pal:'Print Replacement Pal',writeoff:'Complete Replacement'};
   const jobs=(s.damageReworkJobs||[]).filter(x=>x.status==='awaiting_rework');
   function damageJobLabel(j){
     if(j.type!=='item')return labels[j.type]||j.type;
     const r=j.requirements||{};
     if(r.writeoff)return 'Complete Replacement';
     return [r.box?'Replace Box':'',r.insert?'Replace Insert':'',r.pal?'Replace Pal':''].filter(Boolean).join(' + ');
   }
   damage.innerHTML=jobs.length?jobs.map(j=>`<div class="damage-production-row"><div><strong>${esc(j.name)}</strong><div class="sku">${j.sku}${j.damaged_item_index?` · Damaged Item ${j.damaged_item_index}`:''}</div></div><span>${esc(damageJobLabel(j))}</span><strong>× ${j.qty}</strong></div>`).join(''):'<div class="bench-empty">No damage rework currently required.</div>';
 }
 const spare=document.querySelector('#cornwallSpareDemand');
 if(spare){
   const salePals=ps.filter(p=>p.type==='pal'&&isOnSale(s,p.sku)).sort((a,b)=>a.name.localeCompare(b.name));
   const low=[];
   if(cornwallBoxStock(s)<1)low.push({item:'Flat Clear Boxes',detail:'Cornwall Rework Stock',qty:cornwallBoxStock(s)});
   salePals.forEach(p=>{
     const qty=cornwallInsertStock(s,p.sku);
     if(qty<cornwallInsertTarget()){
       const pending=pendingCornwallInsertSupply(s,p.sku);
       low.push({
         item:`${p.name} Insert`,
         detail:p.sku,
         qty,
         target:cornwallInsertTarget(),
         pending
       });
     }
   });
   spare.innerHTML=low.length?low.map(x=>`<div class="damage-production-row factory-spare-row"><div><strong>${esc(x.item)}</strong><div class="sku">${esc(x.detail)}</div></div><span>${x.item==='Flat Clear Boxes'?badge('FACTORY SUPPLY','danger'):x.pending>0?badge('IN REPLENISHMENT','info'):badge('INSERT PRODUCTION','danger')}</span><strong>Stock ${x.qty}${x.target!=null?` / ${x.target}`:''}${x.pending!=null?` · Pending ${x.pending}`:''}</strong></div>`).join(''):'<div class="bench-empty">Cornwall spare stock is healthy.</div>';
 }
 }
 drawProduction();
 await startForgeLiveSync(async fresh=>{
   s=fresh;
   drawProduction();
 });

}
async function dataHealth(){
 const ps=await load('products'),mm=await load('mismatches'),body=document.querySelector('#health'),missing=ps.filter(p=>p.type==='pal'&&!p.recipe_ready);
 const rows=[...mm.map(x=>({level:'warning',issue:'Recipe SKU remapped',item:x.recipe,detail:`${x.stated_sku} → ${x.resolved_sku}`})),...missing.map(x=>({level:'danger',issue:'Missing recipe',item:x.name,detail:x.sku}))];
 body.innerHTML=rows.map(x=>`<tr><td>${badge(x.issue,x.level)}</td><td>${esc(x.item)}</td><td>${esc(x.detail)}</td></tr>`).join('')||'<tr><td colspan="3">No data issues detected.</td></tr>';
}
async function filament(){
 const s=state(),body=document.querySelector('#fil');
 let cloudRows=null;

 if(cloudToken()){
   try{
     const d=await cloudFetch('/filaments');
     cloudRows=d.filaments||[];
     cloudRows.forEach(f=>{
       s.filament[f.name]={
         grams:Number(f.grams_in_stock||0),
         reorder:Number(f.reorder_level_g||250)
       };
     });
     save(s);
   }catch(e){
     console.warn('Filament cloud read failed; using local fallback.',e);
   }
 }

 const rs=await load('recipes');
 const colours=[...new Set([
   ...rs.map(r=>r.filament).filter(Boolean),
   ...Object.keys(s.filament||{})
 ])].sort();

 colours.forEach(c=>{
   if(!s.filament[c])s.filament[c]={grams:0,reorder:250};
 });
 save(s);

 function draw(){
   body.innerHTML=colours.map(c=>{
     const x=s.filament[c],low=Number(x.grams)<=Number(x.reorder);
     return `<tr>
       <td><strong>${esc(c)}</strong><div class="small">${cloudToken()?'Cloud backed':'Local fallback'}</div></td>
       <td><input class="number fg" data-c="${esc(c)}" data-k="grams" type="number" min="0" value="${x.grams}"></td>
       <td><input class="number fg" data-c="${esc(c)}" data-k="reorder" type="number" min="0" value="${x.reorder}"></td>
       <td>${low?badge('Order','danger'):badge('OK','ok')}</td>
     </tr>`;
   }).join('');

   document.querySelectorAll('.fg').forEach(el=>el.onchange=async()=>{
     const c=el.dataset.c;
     s.filament[c][el.dataset.k]=Number(el.value||0);
     save(s);draw();

     if(cloudToken()){
       try{
         await cloudFetch(`/filaments/${encodeURIComponent(c)}`,{
           method:'PUT',
           headers:{'Content-Type':'application/json'},
           body:JSON.stringify({
             grams_in_stock:Number(s.filament[c].grams||0),
             reorder_level_g:Number(s.filament[c].reorder||250)
           })
         });
       }catch(e){
         alert(`Filament saved locally, but cloud update failed: ${e.message}`);
       }
     }
   });
 }
 draw();
}

async function buildPlatePlanner(){
 installForgeCloudSyncBadge();
 if(!forgeProductionCloudReady){try{await hydrateProductionCloud()}catch(e){showCloudRequiredError(e.message);return}}
 const s=cloudOperationalState();
 const ps=await load('products');
 const rs=await load('recipes');
 const pals=Object.fromEntries(ps.filter(p=>p.type==='pal').map(p=>[p.sku,p]));
 const colours=[...new Set(rs.map(r=>String(r.filament||'').trim()).filter(Boolean))].sort();

 const colourEl=document.querySelector('#plateColour');
 const printerEl=document.querySelector('#platePrinter');
 const nameEl=document.querySelector('#plateName');
 const checklist=document.querySelector('#plateChecklist');
 const checklistMobile=document.querySelector('#plateChecklistMobile');
 const current=document.querySelector('#currentPlateItems');
 const platesList=document.querySelector('#platesList');
 const currentTotal=document.querySelector('#currentPlateTotal');
 const demandKpi=document.querySelector('#demandKpi');
 const plannedKpi=document.querySelector('#plannedKpi');
 const printingKpi=document.querySelector('#printingKpi');
 const completedKpi=document.querySelector('#completedKpi');
 const colourDemandCards=document.querySelector('#colourDemandCards');
 const colourDemandEmpty=document.querySelector('#colourDemandEmpty');
 const checklistSearch=document.querySelector('#plateChecklistSearch');

 let plateDraft={id:null,colour:colours[0]||'',printer:'',name:'',items:[]};

 colourEl.innerHTML=colours.length?colours.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join(''):'<option value="">No filament colours found</option>';
 const activePrinters=(s.printers||[]).filter(p=>p.active!==false);
 printerEl.innerHTML=activePrinters.length
   ? activePrinters.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}${p.model?` · ${esc(p.model)}`:''}</option>`).join('')
   : '<option value="">No printers configured — add one in Settings</option>';
 if(s.siteSettings?.defaultPrinter && activePrinters.some(p=>p.id===s.siteSettings.defaultPrinter)) printerEl.value=s.siteSettings.defaultPrinter;
 plateDraft.printer=printerEl.value||'';

 function printerLabel(id){
   const p=(s.printers||[]).find(x=>x.id===id);
   return p?`${p.name}${p.model?` · ${p.model}`:''}`:'No printer assigned';
 }
 function recipeKey(r){return groupKey(r)}
 function demandFor(r){return manufacturingNeed(s,r.sku)}
 function draftQty(key){return plateDraft.items.filter(i=>i.inventory_key===key).reduce((a,i)=>a+Number(i.qty||0),0)}
 function rowData(){
   const selected=String(plateDraft.colour||'').trim();
   return rs.filter(r=>String(r.filament||'').trim()===selected).map(r=>{
     const p=pals[r.sku]||{name:r.name||r.animal||r.sku};
     const key=recipeKey(r);
     const demand=demandFor(r);
     const inv=partQty(s,key);
     const allocated=activePlateQty(s,key);
     const local=draftQty(key);
     const remain=Math.max(0,demand-inv-allocated-local);
     const recoveryFiles=String(r.separate_stls||'').split(';').map(v=>v.trim()).filter(Boolean);
     return {r,p,key,demand,inv,allocated,local,remain,recoveryFiles};
   }).sort((a,b)=>b.remain-a.remain||a.p.name.localeCompare(b.p.name));
 }
 function addGrouped(x,qty,kind='group'){
   plateDraft.items.push({
     id:makeId(),kind,sku:x.r.sku,product_name:x.p.name,
     filament:String(x.r.filament||'').trim(),label:x.r.parts,
     file:x.r.grouped_stl,inventory_key:x.key,qty:Math.max(1,Number(qty||1)),
     weight_each:Number(x.r.weight_g||0),extra:kind==='extra'
   });
 }

 function colourDemand(){
   const map={};
   rs.forEach(r=>{
     const colour=String(r.filament||'').trim();
     if(!colour)return;
     const key=recipeKey(r);
     const remaining=Math.max(0,demandFor(r)-partQty(s,key)-activePlateQty(s,key));
     if(remaining<=0)return;
     if(!map[colour])map[colour]={colour,sets:0,grams:0,groups:0,pals:new Set()};
     map[colour].sets+=remaining;
     map[colour].grams+=remaining*Number(r.weight_g||0);
     map[colour].groups+=1;
     map[colour].pals.add(r.sku);
   });
   return Object.values(map).map(x=>({...x,palCount:x.pals.size})).sort((a,b)=>b.sets-a.sets || b.grams-a.grams);
 }
 function drawColourDemand(){
   if(!colourDemandCards)return;
   const cards=colourDemand();
   colourDemandCards.innerHTML=cards.map(x=>`<button class="colour-demand-card ${plateDraft.colour===x.colour?'selected':''}" data-colour="${esc(x.colour)}">
      <div class="colour-demand-top"><strong>${esc(x.colour)}</strong><span>${x.sets} set${x.sets===1?'':'s'}</span></div>
      <div class="colour-demand-number">${x.grams.toFixed(1)}g</div>
      <div class="small">${x.palCount} Pal${x.palCount===1?'':'s'} · ${x.groups} colour group${x.groups===1?'':'s'}</div>
      <div class="colour-demand-action">Plan this colour →</div>
   </button>`).join('');
   if(colourDemandEmpty)colourDemandEmpty.style.display=cards.length?'none':'block';
   document.querySelectorAll('.colour-demand-card').forEach(btn=>btn.onclick=()=>{
     const colour=btn.dataset.colour;
     plateDraft.colour=colour;
     colourEl.value=colour;
     plateDraft.items=[];
     drawAll();
     document.querySelector('#printChecklistCard')?.scrollIntoView({behavior:'smooth',block:'start'});
   });
 }

 function drawChecklist(){
   const searchText=(checklistSearch?.value||'').trim().toLowerCase();
   const rows=rowData().filter(x=>!searchText||`${x.p.name} ${x.r.sku} ${x.r.parts} ${x.r.filament}`.toLowerCase().includes(searchText));

   // Desktop keeps the compact spreadsheet/table view.
   checklist.innerHTML=rows.length?rows.map((x,idx)=>`<tr class="${x.remain===0?'dimrow':''}">
     <td><strong>${esc(x.p.name)}</strong><br><span class="sku">${x.r.sku}</span></td>
     <td>${esc(x.r.parts)}</td>
     <td>${Number(x.r.weight_g||0).toFixed(2).replace(/\.00$/,'')}g</td>
     <td>${x.demand}</td><td>${x.inv}</td><td>${x.allocated}</td><td><strong>${x.remain}</strong></td>
     <td><input class="number addqty desktop-addqty" id="desktop-qty-${idx}" min="1" type="number" value="${Math.max(1,Math.min(x.remain||1,5))}"></td>
     <td><button class="btn secondary desktop-addgroup" data-row="${idx}">Add Required</button></td>
     <td><button class="btn ghost desktop-addextra" data-row="${idx}">+ Extra</button></td>
     <td>${x.recoveryFiles.length?`<button class="btn ghost desktop-exactpart" data-row="${idx}">Exact Part</button>`:'<span class="small muted">—</span>'}</td>
   </tr>${x.recoveryFiles.length?`<tr class="exact-row desktop-exact-row" id="desktop-exact-${idx}" style="display:none"><td colspan="11"><div class="exact-part-panel">
       <div><strong>${esc(x.p.name)} — exact part</strong><div class="small">${esc(String(x.r.filament||'').trim())}</div></div>
       <select id="desktop-exact-file-${idx}" class="select">${x.recoveryFiles.map(f=>`<option value="${esc(f)}">${esc(f)}</option>`).join('')}</select>
       <label class="small">Qty <input id="desktop-exact-qty-${idx}" class="number" type="number" min="1" value="1"></label>
       <button class="btn desktop-addexact" data-row="${idx}">Add Exact Part</button>
     </div></td></tr>`:''}`).join(''):`<tr><td colspan="11" class="muted" style="padding:24px">${searchText?'No checklist rows match your search.':`No recipe rows found for ${esc(plateDraft.colour)}.`}</td></tr>`;

   // Mobile gets its own grouped-recipe cards instead of trying to reshape table rows.
   if(checklistMobile){
     checklistMobile.innerHTML=rows.length?rows.map((x,idx)=>`
       <article class="mobile-recipe-card ${x.remain===0?'dimrow':''}">
         <div class="mobile-recipe-head">
           <div>
             <strong>${esc(x.p.name)}</strong>
             <div class="sku">${x.r.sku}</div>
           </div>
           ${x.remain>0?badge(`${x.remain} Remaining`,'warning'):badge('Covered','ok')}
         </div>

         <div class="mobile-recipe-group">
           <span class="mobile-label">Colour Group</span>
           <strong>${esc(x.r.parts)}</strong>
           <span class="small">${esc(String(x.r.filament||'').trim())} · ${Number(x.r.weight_g||0).toFixed(2).replace(/\.00$/,'')}g per set</span>
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
             <input class="number mobile-addqty" id="mobile-qty-${idx}" min="1" type="number" value="${Math.max(1,Math.min(x.remain||1,5))}">
           </label>
           <button class="btn mobile-addgroup" data-row="${idx}">Add Grouped Set${x.remain===1?'':'s'}</button>
         </div>

         <div class="mobile-secondary-actions">
           <button class="btn ghost mobile-addextra" data-row="${idx}">+ Extra Grouped Set</button>
           ${x.recoveryFiles.length?`<button class="btn ghost mobile-exactpart" data-row="${idx}">Choose Exact Part</button>`:''}
         </div>

         ${x.recoveryFiles.length?`<div class="mobile-exact-panel" id="mobile-exact-${idx}" hidden>
           <div class="mobile-exact-title"><strong>Exact Part</strong><span class="small">Use only when you need an individual STL rather than the full grouped set.</span></div>
           <select id="mobile-exact-file-${idx}" class="select">${x.recoveryFiles.map(f=>`<option value="${esc(f)}">${esc(f)}</option>`).join('')}</select>
           <label><span class="mobile-label">Qty</span><input id="mobile-exact-qty-${idx}" class="number" type="number" min="1" value="1"></label>
           <button class="btn mobile-addexact" data-row="${idx}">Add Exact Part</button>
         </div>`:''}
       </article>`).join('')
       :`<div class="empty-state">${searchText?'No checklist rows match your search.':`No recipe rows found for ${esc(plateDraft.colour)}.`}</div>`;
   }

   document.querySelectorAll('.desktop-addgroup').forEach(btn=>btn.onclick=()=>{
     const idx=Number(btn.dataset.row),x=rows[idx];
     const qty=Math.max(1,Number(document.querySelector('#desktop-qty-'+idx)?.value||1));
     addGrouped(x,qty,'group'); drawAll();
   });
   document.querySelectorAll('.desktop-addextra').forEach(btn=>btn.onclick=()=>{
     const x=rows[Number(btn.dataset.row)]; addGrouped(x,1,'extra'); drawAll();
   });
   document.querySelectorAll('.desktop-exactpart').forEach(btn=>btn.onclick=()=>{
     const row=document.querySelector('#desktop-exact-'+btn.dataset.row);
     if(row)row.style.display=row.style.display==='none'?'table-row':'none';
   });
   document.querySelectorAll('.desktop-addexact').forEach(btn=>btn.onclick=()=>{
     const idx=Number(btn.dataset.row),x=rows[idx];
     const file=document.querySelector('#desktop-exact-file-'+idx)?.value;
     const qty=Math.max(1,Number(document.querySelector('#desktop-exact-qty-'+idx)?.value||1));
     if(!file)return;
     plateDraft.items.push({id:makeId(),kind:'recovery',sku:x.r.sku,product_name:x.p.name,
       filament:String(x.r.filament||'').trim(),label:file,file,inventory_key:recoveryKey(x.r.sku,file),qty,weight_each:0,exact_part:true});
     drawAll();
   });

   document.querySelectorAll('.mobile-addgroup').forEach(btn=>btn.onclick=()=>{
     const idx=Number(btn.dataset.row),x=rows[idx];
     const qty=Math.max(1,Number(document.querySelector('#mobile-qty-'+idx)?.value||1));
     addGrouped(x,qty,'group'); drawAll();
   });
   document.querySelectorAll('.mobile-addextra').forEach(btn=>btn.onclick=()=>{
     const x=rows[Number(btn.dataset.row)]; addGrouped(x,1,'extra'); drawAll();
   });
   document.querySelectorAll('.mobile-exactpart').forEach(btn=>btn.onclick=()=>{
     const panel=document.querySelector('#mobile-exact-'+btn.dataset.row);
     if(panel)panel.hidden=!panel.hidden;
   });
   document.querySelectorAll('.mobile-addexact').forEach(btn=>btn.onclick=()=>{
     const idx=Number(btn.dataset.row),x=rows[idx];
     const file=document.querySelector('#mobile-exact-file-'+idx)?.value;
     const qty=Math.max(1,Number(document.querySelector('#mobile-exact-qty-'+idx)?.value||1));
     if(!file)return;
     plateDraft.items.push({id:makeId(),kind:'recovery',sku:x.r.sku,product_name:x.p.name,
       filament:String(x.r.filament||'').trim(),label:file,file,inventory_key:recoveryKey(x.r.sku,file),qty,weight_each:0,exact_part:true});
     drawAll();
   });
 }
 function drawCurrent(){
   current.innerHTML=plateDraft.items.length?plateDraft.items.map(i=>`<div class="plate-line"><div><strong>${esc(i.product_name)}</strong><div class="small">${i.kind==='group'?'Required print':i.kind==='extra'?'Extra grouped set':'Exact recovery part'} · ${esc(i.label)}</div><code>${esc(i.file)}</code></div><div class="plate-line-right"><input class="number lineqty" data-id="${i.id}" type="number" min="1" value="${i.qty}"><span>${(Number(i.weight_each||0)*Number(i.qty||0)).toFixed(1)}g</span><button class="iconbtn removeitem" data-id="${i.id}">×</button></div></div>`).join(''):'<div class="empty-state">Add required, extra or exact parts from the checklist.</div>';
   document.querySelectorAll('.removeitem').forEach(b=>b.onclick=()=>{plateDraft.items=plateDraft.items.filter(i=>i.id!==b.dataset.id);drawAll()});
   document.querySelectorAll('.lineqty').forEach(el=>el.onchange=()=>{const i=plateDraft.items.find(i=>i.id===el.dataset.id);if(i)i.qty=Math.max(1,Number(el.value||1));drawAll()});
   const grams=plateDraft.items.reduce((a,i)=>a+Number(i.weight_each||0)*Number(i.qty||0),0);
   currentTotal.textContent=`${plateDraft.items.reduce((a,i)=>a+Number(i.qty||0),0)} print set(s) · ${grams.toFixed(1)}g`;
 }
 function drawKpis(){
   let open=0;
   rs.forEach(r=>open+=Math.max(0,demandFor(r)-partQty(s,recipeKey(r))-activePlateQty(s,recipeKey(r))));
   demandKpi.textContent=open;
   plannedKpi.textContent=s.plates.filter(p=>p.status==='draft').length;
   printingKpi.textContent=s.plates.filter(p=>p.status==='printing').length;
   completedKpi.textContent=(s.printHistory||[]).length;
 }
 function plateSummary(p){const g=(p.items||[]).reduce((a,i)=>a+Number(i.weight_each||0)*Number(i.qty||0),0);return `${(p.items||[]).reduce((a,i)=>a+Number(i.qty||0),0)} set(s) · ${g.toFixed(1)}g`}
 function drawPlates(){
   const items=[...s.plates].filter(p=>p.status==='draft'||p.status==='printing').sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||''));
   platesList.innerHTML=items.length?items.map(p=>`<div class="saved-plate"><div class="saved-plate-main"><div><strong>${esc(p.code)} · ${esc(p.name||p.colour)}</strong><div class="small">${esc(p.colour)} · ${esc(printerLabel(p.printer))} · ${plateSummary(p)}</div></div><div>${statusLabel(p.status)}</div></div><div class="saved-plate-items">${(p.items||[]).map(i=>`<span>${esc(i.product_name)} ×${i.qty}</span>`).join('')}</div><div class="plate-actions">${p.status==='draft'?`<button class="btn secondary loadplate" data-id="${p.id}">Edit</button><button class="btn startplate" data-id="${p.id}">Start Print</button>`:''}${p.status==='printing'?`<button class="btn completeplate" data-id="${p.id}">Complete Print</button>`:''}${p.status!=='complete'?`<button class="btn ghost cancelplate" data-id="${p.id}">Cancel</button>`:''}${p.status==='complete'?`<span class="small">Completed ${fmtDate(p.completed_at)}</span>`:''}</div><div class="completion-panel" id="complete-${p.id}"></div></div>`).join(''):'<div class="empty-state">No saved build plates.</div>';
   document.querySelectorAll('.loadplate').forEach(b=>b.onclick=()=>{const p=s.plates.find(x=>x.id===b.dataset.id);if(!p)return;plateDraft=JSON.parse(JSON.stringify(p));s.plates=s.plates.filter(x=>x.id!==p.id);save(s);colourEl.value=plateDraft.colour;printerEl.value=plateDraft.printer||'';nameEl.value=plateDraft.name||'';drawAll()});
   document.querySelectorAll('.startplate').forEach(b=>b.onclick=async()=>{const p=s.plates.find(x=>x.id===b.dataset.id);if(p){p.status='printing';p.started_at=new Date().toISOString();await save(s);drawAll()}});
   document.querySelectorAll('.cancelplate').forEach(b=>b.onclick=async()=>{const p=s.plates.find(x=>x.id===b.dataset.id);if(p){p.status='cancelled';await save(s);drawAll()}});
   document.querySelectorAll('.completeplate').forEach(b=>b.onclick=()=>openCompletion(b.dataset.id));
 }

 function recipeForPlateItem(item){
   return rs.find(r=>r.sku===item.sku && String(r.filament||'').trim()===String(item.filament||'').trim() && r.grouped_stl===item.file)
     || rs.find(r=>r.sku===item.sku && String(r.filament||'').trim()===String(item.filament||'').trim());
 }
 function recoveryFilesForItem(item){
   const r=recipeForPlateItem(item);
   return String(r?.separate_stls||'').split(';').map(v=>v.trim()).filter(Boolean);
 }

 function openCompletion(id){
   const p=s.plates.find(x=>x.id===id),panel=document.querySelector('#complete-'+id);
   if(!p||!panel)return;

   panel.innerHTML=`<div class="completion-box">
     <div class="completion-head">
       <div>
         <strong>Confirm print result</strong>
         <div class="small">Confirm full grouped sets, or record a problem with one exact part.</div>
       </div>
     </div>
     ${(p.items||[]).map((i,idx)=>{
       const files=i.kind==='recovery'?[i.file]:recoveryFilesForItem(i);
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
           ${files.length && i.kind!=='recovery'?`<button class="btn ghost partproblem" data-item="${i.id}" type="button">Individual Part Problem</button>`:''}
         </div>

         ${files.length && i.kind!=='recovery'?`<div class="part-problem-panel" id="problem-${i.id}" style="display:none">
           <div class="small" style="margin-bottom:8px">Enter the number of each exact part that failed. Good parts from incomplete sets will be saved as recovery stock.</div>
           <div class="part-failure-grid">
             ${files.map(file=>`<label class="part-failure-row">
               <span>${esc(file)}</span>
               <input class="number exactfail" data-parent="${i.id}" data-file="${esc(file)}" type="number" min="0" max="${i.qty}" value="0">
             </label>`).join('')}
           </div>
         </div>`:''}
       </div>`;
     }).join('')}
     <div class="completion-summary-note">
       <strong>How partial failures work</strong>
       <div class="small">Example: 1 Alex Eye 1 fails. Mark 0 full sets passed for that affected set and enter Eye 1 failed = 1. Forge records Eye 2 as a good spare and Eye 1 as needing reprint.</div>
     </div>
     <button class="btn confirmcomplete" type="button">Confirm Completion</button>
   </div>`;

   panel.querySelectorAll('.partproblem').forEach(btn=>btn.onclick=()=>{
     const box=panel.querySelector('#problem-'+btn.dataset.item);
     if(box)box.style.display=box.style.display==='none'?'block':'none';
   });

   // If exact failures are entered, make sure passed sets cannot exceed
   // the number of completely unaffected sets.
   panel.querySelectorAll('.exactfail').forEach(input=>input.oninput=()=>{
     const parent=input.dataset.parent;
     const item=p.items.find(x=>x.id===parent);
     const failInputs=[...panel.querySelectorAll(`.exactfail[data-parent="${parent}"]`)];
     const maxFailed=Math.max(0,...failInputs.map(x=>Number(x.value||0)));
     const pass=panel.querySelector(`.passqty[data-item="${parent}"]`);
     if(item && pass){
       const maximumComplete=Math.max(0,Number(item.qty)-maxFailed);
       if(Number(pass.value)>maximumComplete)pass.value=maximumComplete;
     }
   });

   panel.querySelector('.confirmcomplete').onclick=async()=>await confirmCompletion(id,panel);
 }

 async function confirmCompletion(id,panel){
   const p=s.plates.find(x=>x.id===id);
   if(!p)return;

   const results={};
   (p.items||[]).forEach(i=>{
     const planned=Number(i.qty||0);
     const passed=Math.max(0,Math.min(planned,Number(panel.querySelector(`.passqty[data-item="${i.id}"]`)?.value||0)));
     const incomplete=Math.max(0,planned-passed);
     const files=i.kind==='recovery'?[i.file]:recoveryFilesForItem(i);
     const exactFailures={};

     if(i.kind!=='recovery'){
       panel.querySelectorAll(`.exactfail[data-parent="${i.id}"]`).forEach(el=>{
         exactFailures[el.dataset.file]=Math.max(0,Math.min(planned,Number(el.value||0)));
       });
     }

     results[i.id]={planned,passed,incomplete,exactFailures};

     // Full successful grouped/recovery units.
     if(passed>0){
       s.parts[i.inventory_key]=partQty(s,i.inventory_key)+passed;
     }

     if(i.kind==='recovery'){
       const failed=Math.max(0,planned-passed);
       if(failed>0){
         s.failedParts.push({
           id:makeId(),plate_id:p.id,plate_code:p.code,sku:i.sku,
           product_name:i.product_name,filament:i.filament,label:i.label,
           file:i.file,qty:failed,created_at:new Date().toISOString(),
           failure_type:'exact_part'
         });
       }
       return;
     }

     if(incomplete<=0)return;

     const hasExactFailures=Object.values(exactFailures).some(v=>v>0);

     if(hasExactFailures && files.length){
       // For each exact STL, an incomplete set produces one candidate part.
       // Failed units are logged; surviving units become recovery inventory.
       files.forEach(file=>{
         const failed=Math.min(incomplete,Number(exactFailures[file]||0));
         const good=Math.max(0,incomplete-failed);

         if(good>0){
           const key=recoveryKey(i.sku,file);
           s.parts[key]=partQty(s,key)+good;
         }
         if(failed>0){
           s.failedParts.push({
             id:makeId(),plate_id:p.id,plate_code:p.code,sku:i.sku,
             product_name:i.product_name,filament:i.filament,
             label:file,file,qty:failed,created_at:new Date().toISOString(),
             failure_type:'individual_part'
           });
         }
       });

       // If user marked incomplete sets but did not identify every failed set,
       // retain an audit warning rather than pretending the set passed.
       const greatestFailure=Math.max(0,...Object.values(exactFailures));
       if(greatestFailure<incomplete){
         s.failedParts.push({
           id:makeId(),plate_id:p.id,plate_code:p.code,sku:i.sku,
           product_name:i.product_name,filament:i.filament,
           label:i.label,file:i.file,qty:incomplete-greatestFailure,
           created_at:new Date().toISOString(),
           failure_type:'unallocated_group_failure'
         });
       }
     } else {
       // No exact failure information: record incomplete grouped sets normally.
       s.failedParts.push({
         id:makeId(),plate_id:p.id,plate_code:p.code,sku:i.sku,
         product_name:i.product_name,filament:i.filament,label:i.label,
         file:i.file,qty:incomplete,created_at:new Date().toISOString(),
         failure_type:'group'
       });
     }
   });

   const completedAt=new Date().toISOString();
   s.printHistory.push({
     plate_id:p.id,
     plate_code:p.code,
     plate_name:p.name||'',
     colour:p.colour,
     printer:p.printer,
     completed_at:completedAt,
     items:JSON.parse(JSON.stringify(p.items||[])),
     result:results
   });
   s.plates=s.plates.filter(x=>x.id!==p.id);
   save(s);
   drawAll();
 }
 async function saveDraft(startNow){
   if(!plateDraft.items.length){alert('Add at least one print item to the plate.');return}
   const code=plateDraft.code||`PLATE-${String(s.plateSeq).padStart(4,'0')}`;if(!plateDraft.code)s.plateSeq++;
   const p={...plateDraft,id:plateDraft.id||makeId(),code,status:startNow?'printing':'draft',created_at:plateDraft.created_at||new Date().toISOString()};if(startNow)p.started_at=new Date().toISOString();
   s.plates.push(JSON.parse(JSON.stringify(p)));
   try{
     await save(s);
     plateDraft={id:null,colour:colourEl.value,printer:printerEl.value,name:'',items:[]};
     nameEl.value='';
     drawAll();
   }catch(e){
     alert('Build plate could not be saved to Cloudflare. Please check Cloud Sync before continuing.');
   }
 }
 function drawAll(){plateDraft.colour=String(colourEl.value||plateDraft.colour||'').trim();plateDraft.printer=printerEl.value||'';plateDraft.name=nameEl.value||'';drawColourDemand();drawChecklist();drawCurrent();drawPlates();drawKpis()}
 colourEl.onchange=()=>{plateDraft.colour=String(colourEl.value||'').trim();plateDraft.items=[];drawAll()};
 printerEl.onchange=()=>{plateDraft.printer=printerEl.value||''};
 nameEl.oninput=()=>{plateDraft.name=nameEl.value||''};
 if(checklistSearch)checklistSearch.oninput=()=>drawChecklist();
 document.querySelector('#savePlate').onclick=async()=>await saveDraft(false);
 document.querySelector('#startPlate').onclick=async()=>await saveDraft(true);
 drawAll();

 await startForgeLiveSync(async fresh=>{
   // Keep the unsaved in-memory plate draft, but refresh all shared cloud state.
   Object.keys(s).forEach(k=>delete s[k]);
   Object.assign(s,fresh);
   drawAll();
 });
}

async function printedParts(){
 installForgeCloudSyncBadge();
 if(!forgeProductionCloudReady){try{await hydrateProductionCloud()}catch(e){showCloudRequiredError(e.message);return}}

 const ps=await load('products');
 const rs=await load('recipes');
 const pals=Object.fromEntries(ps.filter(p=>p.type==='pal').map(p=>[p.sku,p]));
 const q=document.querySelector('#q');
 const body=document.querySelector('#partsRows');
 const failures=document.querySelector('#failedRows');
 let s=cloudOperationalState();

 function draw(){
   const text=(q.value||'').toLowerCase();
   const rows=[];

   rs.forEach(r=>{
     const qty=partQty(s,groupKey(r));
     if(qty>0){
       rows.push({
         kind:'Grouped set',
         sku:r.sku,
         name:(pals[r.sku]||{}).name||r.name||r.animal,
         filament:r.filament,
         label:r.parts,
         qty,
         key:groupKey(r)
       });
     }
   });

   Object.entries(s.parts)
     .filter(([k,v])=>k.startsWith('recovery|')&&Number(v)>0)
     .forEach(([k,v])=>{
       const bits=k.split('|');
       const sku=bits[1];
       const file=bits.slice(2).join('|');
       const r=rs.find(x=>x.sku===sku&&(x.separate_stls||'').includes(file));
       rows.push({
         kind:'Recovery part',
         sku,
         name:(pals[sku]||{}).name||sku,
         filament:r?.filament||'',
         label:file,
         qty:Number(v),
         key:k
       });
     });

   const shown=rows.filter(x=>
     `${x.name} ${x.sku} ${x.filament} ${x.label}`.toLowerCase().includes(text)
   );

   body.innerHTML=shown.length
     ? shown.map(x=>`<tr>
       <td><strong>${esc(x.name)}</strong><br><span class="sku">${x.sku}</span></td>
       <td>${badge(x.kind,x.kind==='Grouped set'?'ok':'info')}</td>
       <td>${esc(x.filament)}</td>
       <td>${esc(x.label)}</td>
       <td><strong>${x.qty}</strong></td>
       <td>
         <button class="iconbtn adjust" data-key="${esc(x.key)}" data-d="-1">−</button>
         <button class="iconbtn adjust" data-key="${esc(x.key)}" data-d="1">+</button>
       </td>
     </tr>`).join('')
     : '<tr><td colspan="6">No printed-part inventory yet. Complete a build plate to add stock.</td></tr>';

   document.querySelectorAll('.adjust').forEach(b=>b.onclick=async()=>{
     const key=b.dataset.key;
     const before=partQty(s,key);
     s.parts[key]=Math.max(0,before+Number(b.dataset.d));

     try{
       await save(s);
       draw();
     }catch(e){
       s.parts[key]=before;
       draw();
       alert('Printed Parts could not be updated in Cloudflare. The change has been rolled back.');
     }
   });

   failures.innerHTML=s.failedParts.slice().reverse().slice(0,20).map(x=>`<tr>
     <td>${esc(x.plate_code)}</td>
     <td>${esc(x.product_name)}</td>
     <td>${esc(x.filament)}</td>
     <td>${esc(x.label)}</td>
     <td>${x.qty}</td>
     <td>${fmtDate(x.created_at)}</td>
   </tr>`).join('')||'<tr><td colspan="6">No failed parts recorded.</td></tr>';
 }

 q.oninput=draw;
 draw();

 await startForgeLiveSync(async fresh=>{
   s=fresh;
   draw();
 });
}


async function settingsPage(){
 const s=state();
 const $=id=>document.getElementById(id);
 const rows=$('printerRows'), name=$('printerName'), model=$('printerModel'), nozzle=$('printerNozzle');
 const buildX=$('printerBuildX'), buildY=$('printerBuildY'), buildZ=$('printerBuildZ');
 const addBtn=$('addPrinter'), defaultPrinter=$('defaultPrinter'), msg=$('settingsMessage');
 if(!rows||!name||!addBtn||!defaultPrinter){console.error('PLA Forge Settings: required controls missing');return;}

 function flash(text,kind='ok'){
   if(!msg)return;
   msg.innerHTML=badge(text,kind);
   setTimeout(()=>{if(msg)msg.innerHTML=''},2400);
 }
 function nextPrinterId(){
   let n=1; const used=new Set((s.printers||[]).map(p=>p.id));
   while(used.has('PRN-'+String(n).padStart(3,'0')))n++;
   return 'PRN-'+String(n).padStart(3,'0');
 }
 function render(){
   const printers=s.printers||[];
   rows.innerHTML=printers.length?printers.map(p=>`
     <tr>
       <td><strong>${esc(p.name)}</strong><br><span class="sku">${esc(p.id)}</span></td>
       <td>${esc(p.model||'—')}</td>
       <td>${esc(p.nozzle||'—')}</td>
       <td>${p.build_x||'—'} × ${p.build_y||'—'} × ${p.build_z||'—'} mm</td>
       <td>${p.active!==false?badge('Active','ok'):badge('Disabled','danger')}</td>
       <td><button type="button" class="iconbtn togglePrinter" data-id="${p.id}">${p.active!==false?'Disable':'Enable'}</button> <button type="button" class="iconbtn deletePrinter" data-id="${p.id}">Delete</button></td>
     </tr>`).join(''):`<tr><td colspan="6"><div class="empty-state">No printers yet. Add your first printer above.</div></td></tr>`;

   const active=printers.filter(p=>p.active!==false);
   defaultPrinter.innerHTML='<option value="">No default</option>'+active.map(p=>`<option value="${p.id}">${esc(p.name)}${p.model?` · ${esc(p.model)}`:''}</option>`).join('');
   defaultPrinter.value=s.siteSettings.defaultPrinter||'';

   document.querySelectorAll('.togglePrinter').forEach(b=>b.addEventListener('click',()=>{
     const p=s.printers.find(x=>x.id===b.dataset.id); if(!p)return;
     p.active=p.active===false; save(s); render();
   }));
   document.querySelectorAll('.deletePrinter').forEach(b=>b.addEventListener('click',()=>{
     const p=s.printers.find(x=>x.id===b.dataset.id); if(!p)return;
     if(!confirm(`Delete ${p.name}?`))return;
     s.printers=s.printers.filter(x=>x.id!==b.dataset.id);
     if(s.siteSettings.defaultPrinter===b.dataset.id)s.siteSettings.defaultPrinter='';
     save(s); render(); flash('Printer deleted','warning');
   }));
 }

 addBtn.type='button';
 addBtn.addEventListener('click',()=>{
   const n=(name.value||'').trim();
   if(!n){flash('Enter a printer name','danger');name.focus();return;}
   const printer={
     id:nextPrinterId(), name:n, model:(model?.value||'').trim(), nozzle:(nozzle?.value||'0.4mm').trim()||'0.4mm',
     build_x:Number(buildX?.value||0), build_y:Number(buildY?.value||0), build_z:Number(buildZ?.value||0), active:true
   };
   s.printers.push(printer);
   if(!s.siteSettings.defaultPrinter)s.siteSettings.defaultPrinter=printer.id;
   save(s);
   [name,model,nozzle,buildX,buildY,buildZ].forEach(el=>{if(el)el.value=''});
   render(); flash(`${printer.name} added`,'ok');
 });
 defaultPrinter.addEventListener('change',()=>{s.siteSettings.defaultPrinter=defaultPrinter.value;save(s);flash('Default printer updated','ok')});
 render();
}


async function assemblyPage(){
 installForgeCloudSyncBadge();
 if(!forgeProductionCloudReady){try{await hydrateProductionCloud()}catch(e){showCloudRequiredError(e.message);return}}

 let s=cloudOperationalState();
 const ps=await load('products');
 const rs=await load('recipes');
 const pals=ps.filter(p=>p.type==='pal');

 const q=document.querySelector('#q');
 const readyBox=document.querySelector('#assemblyReady');
 const awaitingBox=document.querySelector('#assemblyAwaiting');
 const inventorySearch=document.querySelector('#assembledInventorySearch');
 const inventoryBody=document.querySelector('#assembledInventory');
 const kpiReady=document.querySelector('#assemblyReadyKpi');
 const kpiAssembled=document.querySelector('#assembledKpi');
 const kpiWaiting=document.querySelector('#assemblyWaitingKpi');
 const readySectionCount=document.querySelector('#readySectionCount');
 const awaitingSectionCount=document.querySelector('#awaitingSectionCount');

 function recipeGroups(sku){return rs.filter(r=>r.sku===sku)}
 function assembledQty(sku){return Number(s.assembled?.[sku]||0)}
 function plannerNeed(sku){return Math.max(0,totalNeed(s,sku)-awaitingDispatchQty(s,sku))}
 function remainingAssemblyNeed(sku){
   return Math.max(0,plannerNeed(sku)-assembledQty(sku));
 }
 function readyQty(p){
   const groups=recipeGroups(p.sku);
   if(!groups.length)return 0;
   return Math.max(0,Math.min(...groups.map(r=>partQty(s,groupKey(r)))));
 }
 function groupStock(p){
   return recipeGroups(p.sku).map(r=>({
     r,
     have:partQty(s,groupKey(r))
   }));
 }

 function readyCard(x){
   const maxUseful=Math.max(0,Math.min(x.ready,x.remainingNeed>0?x.remainingNeed:x.ready));
   return `<div class="assembly-card ready">
     <div class="assembly-card-head">
       <div><strong>${esc(x.p.name)}</strong><div class="sku">${x.p.sku}</div></div>
       ${badge(`${x.ready} Ready`,'ok')}
     </div>
     <div class="assembly-demand-strip">
       <span>Production Need <strong>${x.plannerNeed}</strong></span>
       <span>Already Assembled <strong>${x.assembled}</strong></span>
       <span>Still Needed <strong>${x.remainingNeed}</strong></span>
     </div>
     <div class="assembly-parts">
       ${x.groups.map(g=>`<div class="assembly-part"><span>${esc(g.r.filament)} · ${esc(g.r.parts)}</span><strong>${g.have}</strong></div>`).join('')||'<div class="small">No recipe available.</div>'}
     </div>
     <div class="assembly-actions">
       <label><span class="small">Assemble Qty</span><input class="number assembleQty" id="assemble-${x.p.sku}" type="number" min="1" max="${Math.max(1,maxUseful)}" value="1"></label>
       <button class="btn assembleBtn" data-sku="${x.p.sku}">Assemble</button>
     </div>
   </div>`;
 }

 function awaitingCard(x){
   return `<div class="assembly-card not-ready">
     <div class="assembly-card-head">
       <div><strong>${esc(x.p.name)}</strong><div class="sku">${x.p.sku}</div></div>
       ${badge(`NEED ${x.remainingNeed}`,'warning')}
     </div>
     <div class="assembly-demand-strip">
       <span>Production Need <strong>${x.plannerNeed}</strong></span>
       <span>Already Assembled <strong>${x.assembled}</strong></span>
       <span>Still Needed <strong class="accent">${x.remainingNeed}</strong></span>
     </div>
     <div class="assembly-parts">
       ${x.groups.map(g=>`<div class="assembly-part ${g.have<=0?'missing':''}"><span>${esc(g.r.filament)} · ${esc(g.r.parts)}</span><strong>${g.have}</strong></div>`).join('')||'<div class="small">No recipe available.</div>'}
     </div>
     <div class="awaiting-note"><span class="small">Production Planner still requires ${x.remainingNeed}. Waiting for enough printed parts to assemble more.</span></div>
   </div>`;
 }

 function render(){
   const text=(q.value||'').toLowerCase();

   const all=pals.map(p=>({
     p,
     ready:readyQty(p),
     plannerNeed:plannerNeed(p.sku),
     assembled:assembledQty(p.sku),
     remainingNeed:remainingAssemblyNeed(p.sku),
     groups:groupStock(p)
   })).filter(x=>`${x.p.name} ${x.p.sku}`.toLowerCase().includes(text));

   // READY: any Pal for which every required printed colour-group is physically available.
   // Production demand does not control whether it appears here.
   const ready=all
     .filter(x=>x.ready>0)
     .sort((a,b)=>b.ready-a.ready || b.remainingNeed-a.remainingNeed || a.p.name.localeCompare(b.p.name));

   // AWAITING: demanded by Production Planning but no complete Pal can be assembled yet.
   const awaiting=all
     .filter(x=>x.remainingNeed>0 && x.ready<=0)
     .sort((a,b)=>b.remainingNeed-a.remainingNeed || a.p.name.localeCompare(b.p.name));

   kpiReady.textContent=ready.reduce((a,x)=>a+x.ready,0);
   kpiAssembled.textContent=Object.values(s.assembled||{}).reduce((a,b)=>a+Number(b||0),0);
   kpiWaiting.textContent=awaiting.reduce((a,x)=>a+x.remainingNeed,0);
   readySectionCount.textContent=`${ready.length} Ready`;
   awaitingSectionCount.textContent=`${awaiting.length} Awaiting`;

   readyBox.innerHTML=ready.length
     ?ready.map(readyCard).join('')
     :'<div class="bench-empty">No Pals are ready to assemble yet.</div>';

   awaitingBox.innerHTML=awaiting.length
     ?awaiting.map(awaitingCard).join('')
     :'<div class="bench-empty">Nothing is currently awaiting assembly.</div>';

   const inventoryText=(inventorySearch?.value||'').toLowerCase();
   const assembledRows=pals.map(p=>({
     p,
     qty:assembledQty(p.sku)
   })).filter(x=>x.qty>0)
     .filter(x=>`${x.p.name} ${x.p.sku}`.toLowerCase().includes(inventoryText))
     .sort((a,b)=>b.qty-a.qty||a.p.name.localeCompare(b.p.name));

   inventoryBody.innerHTML=assembledRows.length?assembledRows.map(x=>`<tr>
     <td><strong>${esc(x.p.name)}</strong><br><span class="sku">${x.p.sku}</span></td>
     <td><strong>${x.qty}</strong></td>
   </tr>`).join(''):'<tr><td colspan="2">No assembled Pals currently in inventory.</td></tr>';

   document.querySelectorAll('.assembleBtn').forEach(btn=>btn.onclick=async()=>{
     const sku=btn.dataset.sku;
     const p=pals.find(x=>x.sku===sku);
     const available=readyQty(p);
     const stillNeeded=remainingAssemblyNeed(sku);
     const maxQty=Math.max(1,Math.min(available,stillNeeded>0?stillNeeded:available));
     const qty=Math.max(1,Math.min(maxQty,Number(document.querySelector('#assemble-'+sku)?.value||1)));
     if(!available||qty>available)return;

     // Snapshot the fields changed by assembly so a failed cloud save can be rolled back safely.
     const beforeParts=JSON.parse(JSON.stringify(s.parts||{}));
     const beforeAssembled=JSON.parse(JSON.stringify(s.assembled||{}));
     const beforeHistory=JSON.parse(JSON.stringify(s.assemblyHistory||[]));

     btn.disabled=true;
     btn.textContent='Saving…';

     recipeGroups(sku).forEach(r=>{
       const key=groupKey(r);
       s.parts[key]=Math.max(0,partQty(s,key)-qty);
     });

     s.assembled[sku]=Number(s.assembled[sku]||0)+qty;
     s.assemblyHistory.push({
       id:makeId(),
       sku,
       name:p.name,
       qty,
       production_need_before:stillNeeded,
       production_need_after:Math.max(0,stillNeeded-qty),
       created_at:new Date().toISOString(),
       cloud_user:currentForgeUser()?.email||''
     });

     try{
       await save(s);
       render();
     }catch(e){
       s.parts=beforeParts;
       s.assembled=beforeAssembled;
       s.assemblyHistory=beforeHistory;
       render();
       alert('Assembly could not be saved to Cloudflare. Printed Parts and Assembled Inventory have been rolled back.');
     }
   });
 }

 q.oninput=render;
 if(inventorySearch)inventorySearch.oninput=render;
 render();

 await startForgeLiveSync(async fresh=>{
   // Replace the Bench state reference completely with the D1-hydrated state.
   s=JSON.parse(JSON.stringify(fresh));
   render();
 });
}



function pendingCornwallInsertSupply(s,sku){
 const planned=Number(s.cornwallInsertReplenishment?.[sku]||0);
 const dispatch=(s.awaitingDispatch||[])
   .filter(x=>x.item_type==='cornwall_insert_spare'&&x.sku===sku&&x.status==='awaiting_dispatch')
   .reduce((a,x)=>a+Number(x.qty||0),0);
 const transit=(s.transfers||[])
   .filter(x=>x.transfer_type==='cornwall_insert_spare'&&x.sku===sku&&x.status==='awaiting_delivery')
   .reduce((a,x)=>a+Number(x.qty||0),0);
 return planned+dispatch+transit;
}
function ensureCornwallInsertReplenishment(s,products){
 s.cornwallInsertReplenishment=s.cornwallInsertReplenishment||{};
 (products||[]).filter(p=>p.type==='pal'&&isOnSale(s,p.sku)).forEach(p=>{
   const have=cornwallInsertStock(s,p.sku);
   const pending=pendingCornwallInsertSupply(s,p.sku);
   const target=cornwallInsertTarget();
   const required=Math.max(0,target-have-pending);

   // Keep the factory replenishment quantity aligned to the amount still
   // required to restore Cornwall spare Insert stock back to Target 2.
   const currentlyPlanned=Number(s.cornwallInsertReplenishment[p.sku]||0);
   const downstreamPending=Math.max(0,pending-currentlyPlanned);
   s.cornwallInsertReplenishment[p.sku]=Math.max(0,target-have-downstreamPending);
 });
}

async function insertProductionPage(){
 installForgeCloudSyncBadge();
 if(!forgeProductionCloudReady){
   try{await hydrateProductionCloud()}
   catch(e){showCloudRequiredError(e.message);return}
 }

 let s=cloudOperationalState();
 const ps=await load('products');
 const files=await load('insert_files');
 let pals=ps.filter(p=>p.type==='pal' && isOnSale(s,p.sku));
 ensureCornwallInsertReplenishment(s,ps);
 const q=document.querySelector('#q');
 const printCards=document.querySelector('#insertPrintCards');
 const cutCards=document.querySelector('#insertCutCards');
 const inventory=document.querySelector('#insertInventory');
 const inventorySearch=document.querySelector('#insertInventorySearch');
 const readyKpi=document.querySelector('#insertReadyKpi');
 const cutKpi=document.querySelector('#insertCutKpi');
 const printKpi=document.querySelector('#insertPrintKpi');
 const urgentKpi=document.querySelector('#insertUrgentKpi');
 const printQueueCount=document.querySelector('#printQueueCount');
 const cutQueueCount=document.querySelector('#cutQueueCount');

 function rec(sku){
   s.inserts[sku]=s.inserts[sku]||{awaiting_cut:0,ready:0};
   return s.inserts[sku];
 }
 function target(){return 10}
 function needPrint(sku){
   const r=rec(sku);
   const damageNeed=Number(s.damageInsertDemand?.[sku]||0);
   const cornwallNeed=Number(s.cornwallInsertReplenishment?.[sku]||0);
   return Math.max(0,target()+damageNeed+cornwallNeed-Number(r.ready||0)-Number(r.awaiting_cut||0));
 }
 function renderPrintCard(x){
   return `<div class="insert-job-card print-job">
     <div class="assembly-card-head">
       <div><strong>${esc(x.p.name)}</strong><div class="sku">${x.p.sku}</div></div>
       ${Number(s.cornwallInsertReplenishment?.[x.p.sku]||0)>0?badge(`CORNWALL +${Number(s.cornwallInsertReplenishment[x.p.sku]||0)}`,'info'):x.r.ready<4?badge('URGENT','danger'):badge(`PRINT ${x.need}`,'warning')}
     </div>
     <div class="insert-job-stats">
       <div><span>Ready</span><strong>${Number(x.r.ready||0)}</strong></div>
       <div><span>In Cut & Score</span><strong>${Number(x.r.awaiting_cut||0)}</strong></div>
       <div><span>Need Print</span><strong class="accent">${x.need}</strong></div>
     </div>
     <div class="insert-file-name">${x.file?'PDF linked from Google Drive':'No PDF mapped for this SKU'}</div>
     <div class="insert-action-row">
       ${x.file?`<a class="btn secondary" href="${esc(x.file.view_url)}" target="_blank" rel="noopener">Open / Print PDF</a>`:`<button class="btn secondary" disabled>No PDF</button>`}
       <label class="compact-label"><span>Qty Printed</span><input class="number printedQty" id="printed-${x.p.sku}" type="number" min="1" value="${Math.max(1,x.need||1)}"></label>
       <button class="btn markPrinted" data-sku="${x.p.sku}">Mark Printed</button>
     </div>
   </div>`;
 }
 function renderCutCard(x){
   const awaiting=Number(x.r.awaiting_cut||0);
   return `<div class="insert-job-card cut-job">
     <div class="assembly-card-head">
       <div><strong>${esc(x.p.name)}</strong><div class="sku">${x.p.sku}</div></div>
       ${badge(`${awaiting} WAITING`,'warning')}
     </div>
     <div class="cut-score-hero">
       <div class="cut-score-number">${awaiting}</div>
       <div><strong>Printed Insert${awaiting===1?'':'s'}</strong><div class="small">ready to cut and score</div></div>
     </div>
     <div class="insert-action-row">
       <label class="compact-label"><span>Qty Completed</span><input class="number cutQty" id="cut-${x.p.sku}" type="number" min="1" max="${awaiting}" value="${awaiting}"></label>
       <button class="btn completeCut" data-sku="${x.p.sku}">Cut & Score Complete</button>
     </div>
   </div>`;
 }
 function render(){
   const text=(q.value||'').toLowerCase();
   const data=pals.map(p=>({p,r:rec(p.sku),need:needPrint(p.sku),file:files[p.sku]||null}))
     .filter(x=>`${x.p.name} ${x.p.sku}`.toLowerCase().includes(text));

   const printJobs=data.filter(x=>x.need>0)
     .sort((a,b)=>(a.r.ready<4?-1:0)-(b.r.ready<4?-1:0)||b.need-a.need||a.p.name.localeCompare(b.p.name));
   const cutJobs=data.filter(x=>Number(x.r.awaiting_cut||0)>0)
     .sort((a,b)=>Number(b.r.awaiting_cut||0)-Number(a.r.awaiting_cut||0)||a.p.name.localeCompare(b.p.name));

   readyKpi.textContent=data.reduce((a,x)=>a+Number(x.r.ready||0),0);
   cutKpi.textContent=data.reduce((a,x)=>a+Number(x.r.awaiting_cut||0),0);
   printKpi.textContent=data.reduce((a,x)=>a+x.need,0);
   urgentKpi.textContent=data.filter(x=>Number(x.r.ready||0)<4).length;

   if(printQueueCount)printQueueCount.textContent=`${printJobs.length} Job${printJobs.length===1?'':'s'}`;
   if(cutQueueCount)cutQueueCount.textContent=`${cutJobs.length} Job${cutJobs.length===1?'':'s'}`;

   printCards.innerHTML=printJobs.length
     ? printJobs.map(renderPrintCard).join('')
     : '<div class="bench-empty">Nothing currently needs printing.</div>';

   cutCards.innerHTML=cutJobs.length
     ? cutJobs.map(renderCutCard).join('')
     : '<div class="bench-empty">Nothing is waiting for Cut & Score.</div>';

   const inventoryText=(inventorySearch?.value||'').toLowerCase();
   const inventoryRows=data
     .filter(x=>`${x.p.name} ${x.p.sku}`.toLowerCase().includes(inventoryText))
     .sort((a,b)=>a.p.name.localeCompare(b.p.name));

   inventory.innerHTML=inventoryRows
     .map(x=>`<tr>
       <td><strong>${esc(x.p.name)}</strong><br><span class="sku">${x.p.sku}</span></td>
       <td><strong>${Number(x.r.ready||0)}</strong></td>
     </tr>`).join('')||'<tr><td colspan="2">No matching On Sale Pals.</td></tr>';

   document.querySelectorAll('.markPrinted').forEach(btn=>btn.onclick=async()=>{
     const sku=btn.dataset.sku, r=rec(sku);
     const qty=Math.max(1,Number(document.querySelector('#printed-'+sku)?.value||1));
     const cardStock=Number(s.consumables?.card_210gsm?.stock||0);
     if(cardStock<qty){
       alert(`Not enough 210gsm Card. Need ${qty} sheet${qty===1?'':'s'}, but only ${cardStock} available.`);
       return;
     }

     const before=JSON.parse(JSON.stringify(s));
     s.consumables.card_210gsm.stock=cardStock-qty;
     s.consumableHistory=s.consumableHistory||[];
     s.consumableHistory.push({
       id:makeId(),
       key:'card_210gsm',
       name:'210gsm Card',
       qty:-qty,
       reason:`Insert printed · ${sku}`,
       created_at:new Date().toISOString(),
       updated_by:currentForgeUser()?.email||''
     });
     r.awaiting_cut=Number(r.awaiting_cut||0)+qty;

     btn.disabled=true;
     btn.textContent='Saving…';
     try{
       await save(s);
       render();
     }catch(e){
       s=before;
       render();
       alert('Printed inserts could not be saved to Cloudflare. Card stock and Cut & Score quantities have been rolled back.');
     }
   });

   document.querySelectorAll('.completeCut').forEach(btn=>btn.onclick=async()=>{
     const sku=btn.dataset.sku, r=rec(sku);
     const available=Number(r.awaiting_cut||0);
     const qty=Math.max(1,Math.min(available,Number(document.querySelector('#cut-'+sku)?.value||1)));
     if(available<=0)return;

     const before=JSON.parse(JSON.stringify(s));
     r.awaiting_cut=available-qty;
     let remaining=qty;

     // First satisfy full-factory damage replacement insert demand.
     const damageNeed=Number(s.damageInsertDemand?.[sku]||0);
     const damageUsed=Math.min(remaining,damageNeed);
     if(damageUsed>0){
       r.ready=Number(r.ready||0)+damageUsed;
       s.damageInsertDemand[sku]=Math.max(0,damageNeed-damageUsed);
       remaining-=damageUsed;
     }

     // Then route Cornwall spare replenishment directly into Dispatch.
     const cornwallNeed=Number(s.cornwallInsertReplenishment?.[sku]||0);
     const cornwallUsed=Math.min(remaining,cornwallNeed);
     if(cornwallUsed>0){
       const p=pals.find(x=>x.sku===sku);
       const now=new Date().toISOString();
       s.awaitingDispatch=s.awaitingDispatch||[];
       s.awaitingDispatch.push({
         id:makeId(),
         item_type:'cornwall_insert_spare',
         sku,
         name:p?.name||sku,
         qty:cornwallUsed,
         status:'awaiting_dispatch',
         packed_at:now,
         locked_destination:'cornwall',
         supply_label:'Cornwall Spare Insert',
         created_by:currentForgeUser()?.email||''
       });
       s.cornwallInsertReplenishment[sku]=Math.max(0,cornwallNeed-cornwallUsed);
       remaining-=cornwallUsed;
     }

     // Any normal insert production becomes factory Ready Insert stock.
     if(remaining>0)r.ready=Number(r.ready||0)+remaining;

     btn.disabled=true;
     btn.textContent='Saving…';
     try{
       await save(s);
       render();
     }catch(e){
       s=before;
       render();
       alert('Cut & Score completion could not be saved to Cloudflare. Insert stock has been rolled back.');
     }
   });
 }
 q.oninput=render;
 if(inventorySearch)inventorySearch.oninput=render;
 render();

 await startForgeLiveSync(async fresh=>{
   s=JSON.parse(JSON.stringify(fresh));
   pals=ps.filter(p=>p.type==='pal' && isOnSale(s,p.sku));
   ensureCornwallInsertReplenishment(s,ps);
   render();
 });
}

async function availabilityPage(){
 installForgeCloudSyncBadge();
 if(!forgeProductionCloudReady){
   try{await hydrateProductionCloud()}
   catch(e){showCloudRequiredError(e.message);return}
 }

 let s=cloudOperationalState();
 const ps=await load('products');
 const pals=ps.filter(p=>p.type==='pal');

 const q=document.querySelector('#q');
 const filter=document.querySelector('#availabilityFilter');
 const list=document.querySelector('#availabilityList');
 const saleKpi=document.querySelector('#onSaleKpi');
 const futureKpi=document.querySelector('#futureKpi');
 const offKpi=document.querySelector('#offSaleKpi');
 if(!q||!filter||!list)return;

 function status(p){
   const rec=s.productAvailability?.[p.sku]||{};
   if(rec.on_sale===true)return 'sale';
   if(rec.release_date && rec.release_date>new Date().toISOString().slice(0,10))return 'future';
   return 'off';
 }

 function render(){
   const text=(q.value||'').toLowerCase();
   const mode=filter.value;
   const all=pals.map(p=>({p,rec:s.productAvailability?.[p.sku]||{},status:status(p)}));

   if(saleKpi)saleKpi.textContent=all.filter(x=>x.status==='sale').length;
   if(futureKpi)futureKpi.textContent=all.filter(x=>x.status==='future').length;
   if(offKpi)offKpi.textContent=all.filter(x=>x.status==='off').length;

   const data=all
     .filter(x=>`${x.p.name} ${x.p.sku}`.toLowerCase().includes(text))
     .filter(x=>mode==='all'||x.status===mode)
     .sort((a,b)=>(a.status==='sale'?-2:a.status==='future'?-1:0)-(b.status==='sale'?-2:b.status==='future'?-1:0)||a.p.name.localeCompare(b.p.name));

   list.innerHTML=data.map(x=>`
     <div class="availability-row">
       <div><strong>${esc(x.p.name)}</strong><div class="sku">${x.p.sku}</div></div>
       <div>${x.status==='sale'?badge('ON SALE','ok'):x.status==='future'?badge('FUTURE RELEASE','warning'):badge('NOT ON SALE','')}</div>
       <label>
         <span class="small">Release Date</span>
         <input class="cloudReleaseDate" data-sku="${x.p.sku}" type="date" value="${esc(x.rec.release_date||'')}">
       </label>
       <button class="btn ${x.status==='sale'?'ghost':''} cloudToggleSale" data-sku="${x.p.sku}">
         ${x.status==='sale'?'Take Off Sale':'Put On Sale'}
       </button>
     </div>`).join('') || '<div class="bench-empty">No Pals match this view.</div>';

   document.querySelectorAll('.cloudToggleSale').forEach(btn=>btn.onclick=async()=>{
     const sku=btn.dataset.sku;
     const rec=s.productAvailability?.[sku]||{on_sale:false,release_date:''};
     const next=!Boolean(rec.on_sale);
     const releaseDate=next?(rec.release_date||new Date().toISOString().slice(0,10)):(rec.release_date||null);

     btn.disabled=true;
     const oldText=btn.textContent;
     btn.textContent='Saving to Cloud…';

     try{
       await cloudFetchTimed(`/products/${encodeURIComponent(sku)}/availability`,{
         method:'PUT',
         headers:{'Content-Type':'application/json'},
         body:JSON.stringify({on_sale:next,release_date:releaseDate})
       },10000);

       // Confirm only the products table. Do not wait for unrelated production endpoints.
       const availability=await refreshProductAvailabilityFromD1(s);
       const confirmed=availability.find(p=>p.sku===sku);
       if(!confirmed)throw new Error(`${sku} was not returned by D1 after the update.`);
       if(Boolean(confirmed.on_sale)!==next){
         throw new Error(`D1 did not confirm the requested On Sale value for ${sku}.`);
       }

       render();
       setForgeCloudSync('synced',`${sku} ${next?'On Sale':'Not On Sale'} confirmed by D1`);
     }catch(e){
       btn.disabled=false;
       btn.textContent=oldText;
       setForgeCloudSync('error',e.message||'Availability update failed');
       alert(`Availability was NOT changed in Cloudflare: ${e.message}`);
     }
   });

   document.querySelectorAll('.cloudReleaseDate').forEach(el=>el.onchange=async()=>{
     const sku=el.dataset.sku;
     const rec=s.productAvailability?.[sku]||{on_sale:false,release_date:''};
     const nextDate=el.value||null;
     el.disabled=true;

     try{
       await cloudFetchTimed(`/products/${encodeURIComponent(sku)}/availability`,{
         method:'PUT',
         headers:{'Content-Type':'application/json'},
         body:JSON.stringify({on_sale:Boolean(rec.on_sale),release_date:nextDate})
       },10000);

       const availability=await refreshProductAvailabilityFromD1(s);
       const confirmed=availability.find(p=>p.sku===sku);
       if(!confirmed)throw new Error(`${sku} was not returned by D1 after the update.`);
       render();
       setForgeCloudSync('synced',`${sku} release date confirmed by D1`);
     }catch(e){
       el.disabled=false;
       render();
       setForgeCloudSync('error',e.message||'Release date update failed');
       alert(`Release date was NOT changed in Cloudflare: ${e.message}`);
     }
   });
 }

 q.oninput=render;
 filter.onchange=render;
 render();

 await startForgeLiveSync(async fresh=>{
   s=JSON.parse(JSON.stringify(fresh));
   render();
 });
}

async function settingsAvailabilityPage(){
 installForgeCloudSyncBadge();
 if(!forgeProductionCloudReady){
   try{await hydrateProductionCloud()}
   catch(e){showCloudRequiredError(e.message);return}
 }

 let s=cloudOperationalState();
 const ps=await load('products');
 const pals=ps.filter(p=>p.type==='pal');

 const q=document.querySelector('#settingsAvailabilitySearch');
 const filter=document.querySelector('#settingsAvailabilityFilter');
 const list=document.querySelector('#settingsAvailabilityList');
 const saleKpi=document.querySelector('#settingsOnSaleKpi');
 const futureKpi=document.querySelector('#settingsFutureKpi');
 const offKpi=document.querySelector('#settingsOffSaleKpi');
 if(!q||!filter||!list)return;

 function status(p){
   const rec=s.productAvailability?.[p.sku]||{};
   if(rec.on_sale===true)return 'sale';
   if(rec.release_date && rec.release_date>new Date().toISOString().slice(0,10))return 'future';
   return 'off';
 }

 function render(){
   const text=(q.value||'').toLowerCase();
   const mode=filter.value;
   const all=pals.map(p=>({p,rec:s.productAvailability?.[p.sku]||{},status:status(p)}));

   if(saleKpi)saleKpi.textContent=all.filter(x=>x.status==='sale').length;
   if(futureKpi)futureKpi.textContent=all.filter(x=>x.status==='future').length;
   if(offKpi)offKpi.textContent=all.filter(x=>x.status==='off').length;

   const data=all
     .filter(x=>`${x.p.name} ${x.p.sku}`.toLowerCase().includes(text))
     .filter(x=>mode==='all'||x.status===mode)
     .sort((a,b)=>(a.status==='sale'?-2:a.status==='future'?-1:0)-(b.status==='sale'?-2:b.status==='future'?-1:0)||a.p.name.localeCompare(b.p.name));

   list.innerHTML=data.map(x=>`
     <div class="availability-row">
       <div><strong>${esc(x.p.name)}</strong><div class="sku">${x.p.sku}</div></div>
       <div>${x.status==='sale'?badge('ON SALE','ok'):x.status==='future'?badge('FUTURE RELEASE','warning'):badge('NOT ON SALE','')}</div>
       <label>
         <span class="small">Release Date</span>
         <input class="cloudReleaseDate" data-sku="${x.p.sku}" type="date" value="${esc(x.rec.release_date||'')}">
       </label>
       <button class="btn ${x.status==='sale'?'ghost':''} cloudToggleSale" data-sku="${x.p.sku}">
         ${x.status==='sale'?'Take Off Sale':'Put On Sale'}
       </button>
     </div>`).join('') || '<div class="bench-empty">No Pals match this view.</div>';

   document.querySelectorAll('.cloudToggleSale').forEach(btn=>btn.onclick=async()=>{
     const sku=btn.dataset.sku;
     const rec=s.productAvailability?.[sku]||{on_sale:false,release_date:''};
     const next=!Boolean(rec.on_sale);
     const releaseDate=next?(rec.release_date||new Date().toISOString().slice(0,10)):(rec.release_date||null);

     btn.disabled=true;
     const oldText=btn.textContent;
     btn.textContent='Saving to Cloud…';

     try{
       await cloudFetchTimed(`/products/${encodeURIComponent(sku)}/availability`,{
         method:'PUT',
         headers:{'Content-Type':'application/json'},
         body:JSON.stringify({on_sale:next,release_date:releaseDate})
       },10000);

       // Confirm only the products table. Do not wait for unrelated production endpoints.
       const availability=await refreshProductAvailabilityFromD1(s);
       const confirmed=availability.find(p=>p.sku===sku);
       if(!confirmed)throw new Error(`${sku} was not returned by D1 after the update.`);
       if(Boolean(confirmed.on_sale)!==next){
         throw new Error(`D1 did not confirm the requested On Sale value for ${sku}.`);
       }

       render();
       setForgeCloudSync('synced',`${sku} ${next?'On Sale':'Not On Sale'} confirmed by D1`);
     }catch(e){
       btn.disabled=false;
       btn.textContent=oldText;
       setForgeCloudSync('error',e.message||'Availability update failed');
       alert(`Availability was NOT changed in Cloudflare: ${e.message}`);
     }
   });

   document.querySelectorAll('.cloudReleaseDate').forEach(el=>el.onchange=async()=>{
     const sku=el.dataset.sku;
     const rec=s.productAvailability?.[sku]||{on_sale:false,release_date:''};
     const nextDate=el.value||null;
     el.disabled=true;

     try{
       await cloudFetchTimed(`/products/${encodeURIComponent(sku)}/availability`,{
         method:'PUT',
         headers:{'Content-Type':'application/json'},
         body:JSON.stringify({on_sale:Boolean(rec.on_sale),release_date:nextDate})
       },10000);

       const availability=await refreshProductAvailabilityFromD1(s);
       const confirmed=availability.find(p=>p.sku===sku);
       if(!confirmed)throw new Error(`${sku} was not returned by D1 after the update.`);
       render();
       setForgeCloudSync('synced',`${sku} release date confirmed by D1`);
     }catch(e){
       el.disabled=false;
       render();
       setForgeCloudSync('error',e.message||'Release date update failed');
       alert(`Release date was NOT changed in Cloudflare: ${e.message}`);
     }
   });
 }

 q.oninput=render;
 filter.onchange=render;
 render();

 await startForgeLiveSync(async fresh=>{
   s=JSON.parse(JSON.stringify(fresh));
   render();
 });
}

async function consumablesPage(){
 installForgeCloudSyncBadge();
 if(!forgeProductionCloudReady){
   try{await hydrateProductionCloud()}
   catch(e){showCloudRequiredError(e.message);return}
 }
 let s=cloudOperationalState();

 const cards=document.querySelector('#consumableCards');
 const history=document.querySelector('#consumableHistory');
 const totalKpi=document.querySelector('#consumableTotalKpi');
 const lowKpi=document.querySelector('#consumableLowKpi');
 const okKpi=document.querySelector('#consumableOkKpi');

 function render(){
   const entries=Object.entries(s.consumables||{});
   const low=entries.filter(([k,x])=>Number(x.stock||0)<=Number(x.reorder||0));

   totalKpi.textContent=entries.reduce((a,[k,x])=>a+Number(x.stock||0),0);
   lowKpi.textContent=low.length;
   okKpi.textContent=entries.length-low.length;

   cards.innerHTML=entries.map(([key,x])=>{
     const stock=Number(x.stock||0);
     const reorder=Number(x.reorder||0);
     const isLow=stock<=reorder;
     return `<div class="consumable-card ${isLow?'low':''}">
       <div class="consumable-card-head">
         <div><strong>${esc(x.name)}</strong><div class="small">${esc(x.unit||'units')}</div></div>
         ${isLow?badge('ORDER','danger'):badge('STOCK OK','ok')}
       </div>
       <div class="consumable-stock">${stock}</div>
       <div class="small">currently in stock</div>
       <div class="consumable-meter"><span style="width:${Math.min(100,reorder>0?(stock/(reorder*2))*100:100)}%"></span></div>
       <div class="consumable-settings">
         <label><span>Reorder Level</span><input class="number reorderLevel" data-key="${key}" type="number" min="0" value="${reorder}"></label>
         <label><span>Qty</span><input class="number restockQty" id="restock-${key}" type="number" min="1" value="25"></label>
         <button class="btn addConsumable" data-key="${key}">Add Stock</button>
       </div>
       <div class="consumable-adjust">
         <button class="iconbtn adjustConsumable" data-key="${key}" data-d="-1">−1</button>
         <button class="iconbtn adjustConsumable" data-key="${key}" data-d="1">+1</button>
       </div>
     </div>`;
   }).join('');

   document.querySelectorAll('.reorderLevel').forEach(el=>el.onchange=async()=>{
     const key=el.dataset.key;
     const x=s.consumables[key];
     const reorder=Math.max(0,Number(el.value||0));
     el.disabled=true;
     try{
       await cloudFetch(`/consumables/${encodeURIComponent(key)}`,{
         method:'PUT',
         headers:{'Content-Type':'application/json'},
         body:JSON.stringify({reorder})
       });
       x.reorder=reorder;
       render();
     }catch(e){
       alert(`Reorder level was not saved: ${e.message}`);
       render();
     }
   });

   document.querySelectorAll('.addConsumable').forEach(btn=>btn.onclick=async()=>{
     const key=btn.dataset.key;
     const qty=Math.max(1,Number(document.querySelector('#restock-'+key)?.value||1));
     btn.disabled=true;
     try{
       await cloudFetch(`/consumables/${encodeURIComponent(key)}/adjust`,{
         method:'POST',
         headers:{'Content-Type':'application/json'},
         body:JSON.stringify({change:qty,type:'restock',reason:'Stock added in Forge'})
       });
       const data=await cloudConsumables();
       applyCloudConsumables(s,data);
       render();
     }catch(e){
       alert(`Stock was not added: ${e.message}`);
       render();
     }
   });

   document.querySelectorAll('.adjustConsumable').forEach(btn=>btn.onclick=async()=>{
     const key=btn.dataset.key;
     const d=Number(btn.dataset.d||0);
     btn.disabled=true;
     try{
       await cloudFetch(`/consumables/${encodeURIComponent(key)}/adjust`,{
         method:'POST',
         headers:{'Content-Type':'application/json'},
         body:JSON.stringify({change:d,type:'adjustment',reason:'Manual stock adjustment'})
       });
       const data=await cloudConsumables();
       applyCloudConsumables(s,data);
       render();
     }catch(e){
       alert(`Stock adjustment failed: ${e.message}`);
       render();
     }
   });

   history.innerHTML=(s.consumableHistory||[]).slice(0,50).map(h=>`<tr>
     <td>${fmtDate(h.created_at)}</td>
     <td><strong>${esc(h.name)}</strong></td>
     <td>${h.change>0?badge(h.type==='restock'?'STOCK IN':'ADJUSTMENT','ok'):badge('ADJUSTMENT','warning')}</td>
     <td><strong>${h.change>0?'+':''}${h.change}</strong></td>
   </tr>`).join('')||'<tr><td colspan="4">No consumable movements recorded yet.</td></tr>';
 }

 render();

 await startForgeLiveSync(async fresh=>{
   s=JSON.parse(JSON.stringify(fresh));
   render();
 });
}


function code128BSvg(text){
 const patterns=[
 "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213",
 "221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
 "221231","213212","223112","312131","311222","321122","321221","312212","322112","322211",
 "212123","212321","232121","111323","131123","131321","112313","132113","132311","211313",
 "231113","231311","112133","112331","132131","113123","113321","133121","313121","211331",
 "231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
 "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214",
 "112412","122114","122411","142112","142211","241211","221114","413111","241112","134111",
 "111242","121142","121241","114212","124112","124211","411212","421112","421211","212141",
 "214121","412121","111143","111341","131141","114113","114311","411113","411311","113141",
 "114131","311141","411131","211412","211214","211232","2331112"];
 const vals=[104,...[...text].map(c=>{const n=c.charCodeAt(0);return (n>=32&&n<=126)?n-32:31})];
 let checksum=104; for(let i=1;i<vals.length;i++) checksum+=vals[i]*i;
 vals.push(checksum%103,106);
 const quiet=10,module=1,total=vals.reduce((a,v)=>a+[...patterns[v]].reduce((s,n)=>s+Number(n),0),0)+quiet*2;
 let x=quiet,bars="";
 vals.forEach(v=>{let black=true; for(const d of patterns[v]){const w=Number(d);if(black)bars+=`<rect x="${x}" y="0" width="${w}" height="30"/>`;x+=w;black=!black}});
 return `<svg class="barcode-svg" viewBox="0 0 ${total} 30" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">${bars}</svg>`;
}
function getBarcodePrinterName(){
 const s=state();
 return s.printerRoles?.barcode||localStorage.getItem('plaForgeBarcodePrinter')||'Barcode / Label Printer';
}
function printPalBarcode(sku,name){
 const printer=getBarcodePrinterName();
 const w=window.open('','_blank','width=520,height=360');
 if(!w){alert('Please allow pop-ups for PLA Forge so the barcode label can open.');return}
 const svg=code128BSvg(sku);
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
 setTimeout(()=>w.print(),250);
}
async function packingStationPage(){
 installForgeCloudSyncBadge();
 if(!forgeProductionCloudReady){
   try{await hydrateProductionCloud()}
   catch(e){showCloudRequiredError(e.message);return}
 }

 // Packing Station is cloud-only: all inventory and workflow state comes from D1.
 let s=cloudOperationalState();
 const ps=await load('products');
 let pals=ps.filter(p=>p.type==='pal'&&isOnSale(s,p.sku));
 const readyList=document.querySelector('#packingReadyList'),awaitingList=document.querySelector('#packingAwaitingList'),q=document.querySelector('#q');
 const readyCount=document.querySelector('#packingReadyCount'),awaitingCount=document.querySelector('#packingAwaitingCount');
 const damageReworkList=document.querySelector('#damageReworkList');
 const damageReworkCount=document.querySelector('#damageReworkCount');

 function assembled(sku){
   if(s.assembled&&s.assembled[sku]!=null)return Number(s.assembled[sku]||0);
   if(s.assemblyStock&&s.assemblyStock[sku]!=null)return Number(s.assemblyStock[sku]||0);
   if(s.benchStock&&s.benchStock[sku]!=null)return Number(s.benchStock[sku]||0);
   return 0;
 }
 function setAssembled(sku,v){
   v=Math.max(0,Number(v||0));
   if(s.assembled&&s.assembled[sku]!=null)s.assembled[sku]=v;
   else if(s.assemblyStock&&s.assemblyStock[sku]!=null)s.assemblyStock[sku]=v;
   else if(s.benchStock&&s.benchStock[sku]!=null)s.benchStock[sku]=v;
   else{s.assembled=s.assembled||{};s.assembled[sku]=v}
 }
 function ins(sku){return Number(s.inserts?.[sku]?.ready||0)}
 function cs(k){return Number(s.consumables?.[k]?.stock||0)}
 function maxBatch(p){return Math.max(0,Math.min(assembled(p.sku),ins(p.sku),cs('clear_boxes'),cs('bottom_cards'),cs('stickers')))}
 function blockers(p){const b=[];if(assembled(p.sku)<=0)b.push('Awaiting assembled Pal');if(ins(p.sku)<=0)b.push('Awaiting ready insert');if(cs('clear_boxes')<=0)b.push('Need clear boxes');if(cs('bottom_cards')<=0)b.push('Need bottom card squares');if(cs('stickers')<=0)b.push('Need stickers');return b}
 function stockStrip(p){return `<div class="packing-checks"><span class="${assembled(p.sku)>0?'stock-good':'stock-bad'}">${assembled(p.sku)} Assembled</span><span class="${ins(p.sku)>0?'stock-good':'stock-bad'}">${ins(p.sku)} Inserts</span><span>${cs('clear_boxes')} Clear Boxes</span><span>${cs('bottom_cards')} Bottom Cards</span><span>${cs('stickers')} Stickers</span></div>`}
 const steps=['Fold Clear Boxes','Fold Printed Inserts','Place Bottom Cards','Place Stickers','Put Printed Inserts In','Place Pals','Close Boxes','Print & Apply Barcodes'];

 function reworkRequirements(job){
   // New v0.8.6 item-based damage jobs can contain several faults on one Pal.
   if(job.type==='item'){
     const q=Number(job.qty||1),req=job.requirements||{};
     return {
       clear_boxes:req.box?q:0,
       inserts:req.insert?q:0,
       pals:req.pal?q:0,
       bottom_cards:req.writeoff?q:0,
       stickers:req.writeoff?q:0,
       label:req.writeoff?'Complete replacement':[
         req.box?'Replace box':'',
         req.insert?'Replace insert':'',
         req.pal?'Replace Pal':''
       ].filter(Boolean).join(' + ')
     };
   }
   // Backward compatibility for damage jobs created in v0.8.4 / v0.8.5.
   if(job.type==='box')return {clear_boxes:job.qty,inserts:0,pals:0,bottom_cards:0,stickers:0,label:'Replace damaged box'};
   if(job.type==='insert')return {clear_boxes:0,inserts:job.qty,pals:0,bottom_cards:0,stickers:0,label:'Replace damaged insert'};
   if(job.type==='pal')return {clear_boxes:0,inserts:0,pals:job.qty,bottom_cards:0,stickers:0,label:'Replace broken Pal'};
   return {clear_boxes:job.qty,inserts:job.qty,pals:job.qty,bottom_cards:job.qty,stickers:job.qty,label:'Complete replacement'};
 }
 function reworkReady(job){
   const r=reworkRequirements(job);
   return cs('clear_boxes')>=r.clear_boxes && cs('bottom_cards')>=r.bottom_cards && cs('stickers')>=r.stickers && ins(job.sku)>=r.inserts && assembled(job.sku)>=r.pals;
 }
 function drawDamageRework(){
   if(!damageReworkList)return;
   const jobs=(s.damageReworkJobs||[]).filter(x=>x.status==='awaiting_rework');
   if(damageReworkCount)damageReworkCount.textContent=`${jobs.length} Job${jobs.length===1?'':'s'}`;
   damageReworkList.innerHTML=jobs.length?jobs.map(job=>{
     const r=reworkRequirements(job),ready=reworkReady(job);
     return `<div class="packing-card damage-rework-card">
       <div class="assembly-card-head"><div><strong>${esc(job.name)}</strong><div class="sku">${job.sku}</div></div>${ready?badge('READY FOR REWORK','ok'):badge('WAITING','warning')}</div>
       <div class="damage-route-title">${esc(r.label)} × ${job.qty}</div>
       <div class="packing-checks">
         ${r.clear_boxes?`<span class="${cs('clear_boxes')>=r.clear_boxes?'stock-good':'stock-bad'}">Clear Boxes ${cs('clear_boxes')} / ${r.clear_boxes}</span>`:''}
         ${r.inserts?`<span class="${ins(job.sku)>=r.inserts?'stock-good':'stock-bad'}">Ready Inserts ${ins(job.sku)} / ${r.inserts}</span>`:''}
         ${r.pals?`<span class="${assembled(job.sku)>=r.pals?'stock-good':'stock-bad'}">Assembled Pals ${assembled(job.sku)} / ${r.pals}</span>`:''}
         ${r.bottom_cards?`<span class="${cs('bottom_cards')>=r.bottom_cards?'stock-good':'stock-bad'}">Bottom Cards ${cs('bottom_cards')} / ${r.bottom_cards}</span>`:''}
         ${r.stickers?`<span class="${cs('stickers')>=r.stickers?'stock-good':'stock-bad'}">Stickers ${cs('stickers')} / ${r.stickers}</span>`:''}
       </div>
       <div class="packing-actions"><button class="btn completeDamageRework" data-id="${job.id}" ${ready?'':'disabled'}>Complete Rework × ${job.qty}</button></div>
     </div>`;
   }).join(''):'<div class="bench-empty">No damaged Cornwall stock is awaiting rework.</div>';

   document.querySelectorAll('.completeDamageRework').forEach(btn=>btn.onclick=async()=>{
     const job=s.damageReworkJobs.find(x=>x.id===btn.dataset.id);if(!job)return;
     const before=JSON.parse(JSON.stringify(s));
     if(!completeDamageReworkJob(s,job))return;
     try{
       await save(s);
       render();
     }catch(e){
       s=before;
       render();
       alert('Damage rework could not be saved to Cloudflare. The change has been rolled back.');
     }
   });
 }

 function render(){
  const text=(q.value||'').toLowerCase();
  const searched=pals.filter(p=>`${p.name} ${p.sku}`.toLowerCase().includes(text));

  // READY: anything physically packable can appear here.
  const ready=searched.filter(p=>blockers(p).length===0 && maxBatch(p)>0);

  // AWAITING: driven strictly from Production Planner demand.
  // Production Planner itself is based on totalNeed(s, sku) > 0.
  // Hide a Pal when the ONLY blocker is "Awaiting assembled Pal";
  // that belongs upstream at The Bench, not at Packing Station.
  const awaiting=searched.filter(p=>{
    // Packing Station must use pipeline-aware manufacturing demand.
    // If the target is already covered by assembled / packed / dispatched stock,
    // the Pal must not reappear here as "needed".
    if(manufacturingNeed(s,p.sku)<=0)return false;
    const allBlockers=blockers(p);
    const packagingBlockers=allBlockers.filter(x=>x!=='Awaiting assembled Pal');
    return packagingBlockers.length>0;
  });
  readyCount.textContent=`${ready.length} Pal${ready.length===1?'':'s'}`;awaitingCount.textContent=`${awaiting.length} Pal${awaiting.length===1?'':'s'}`;
  drawDamageRework();

  readyList.innerHTML=ready.map(p=>{
    let job=s.packingJobs[p.sku]||{step:1,qty:Math.min(1,maxBatch(p))};
    job.qty=Math.min(Math.max(1,Number(job.qty||1)),maxBatch(p));s.packingJobs[p.sku]=job;
    return `<div class="packing-card ready-pack-card">
      <div class="assembly-card-head"><div><strong>${esc(p.name)}</strong><div class="sku">${p.sku}</div></div>${badge(`${maxBatch(p)} AVAILABLE`,'ok')}</div>
      ${stockStrip(p)}
      <div class="batch-pack-bar"><div><strong>Batch Pack</strong><div class="small">Choose how many ${esc(p.name)} you are packing together.</div></div><div class="batch-qty"><button class="iconbtn batchMinus" data-sku="${p.sku}">−</button><input class="number batchQty" id="batch-${p.sku}" data-sku="${p.sku}" type="number" min="1" max="${maxBatch(p)}" value="${job.qty}"><button class="iconbtn batchPlus" data-sku="${p.sku}">+</button></div></div>
      <div class="packing-steps">${steps.map((n,i)=>`<div class="${job.step>i+1?'done':job.step===i+1?'active':''}"><b>${i+1}</b><span>${n}</span>${job.qty>1?`<em>× ${job.qty}</em>`:''}</div>`).join('')}</div>
      <div class="packing-actions"><button class="btn nextPackStep" data-sku="${p.sku}">${job.step<8?`Complete Step ${job.step} for all ${job.qty}`:`Print ${job.qty} Barcode${job.qty===1?'':'s'}`}</button>${job.step===8?`<button class="btn secondary barcodeApplied" data-sku="${p.sku}">All ${job.qty} Barcodes Applied · Complete Batch</button>`:''}</div>
    </div>`;
  }).join('')||'<div class="bench-empty">No Pals are currently ready to pack.</div>';

  awaitingList.innerHTML=awaiting.map(p=>{
    const packagingBlockers=blockers(p).filter(x=>x!=='Awaiting assembled Pal');
    return `<div class="packing-card awaiting-pack-card"><div class="assembly-card-head"><div><strong>${esc(p.name)}</strong><div class="sku">${p.sku}</div></div>${badge(`PRODUCTION NEED ${manufacturingNeed(s,p.sku)}`,'warning')}</div>${stockStrip(p)}<div class="packing-blockers">${packagingBlockers.map(x=>`<span>! ${esc(x)}</span>`).join('')}</div></div>`;
  }).join('')||'<div class="bench-empty">Nothing in the Production Planner is currently waiting for packaging materials or inserts.</div>';

  document.querySelectorAll('.batchQty').forEach(el=>el.onchange=async()=>{
    const sku=el.dataset.sku,p=pals.find(x=>x.sku===sku),j=s.packingJobs[sku]||{step:1,qty:1};
    const before=Number(j.qty||1);
    j.qty=Math.min(maxBatch(p),Math.max(1,Number(el.value||1)));
    s.packingJobs[sku]=j;
    try{await save(s);render()}catch(e){j.qty=before;render();alert('Packing quantity could not be saved to Cloudflare.')}
  });

  document.querySelectorAll('.batchMinus,.batchPlus').forEach(b=>b.onclick=async()=>{
    const sku=b.dataset.sku,p=pals.find(x=>x.sku===sku),j=s.packingJobs[sku]||{step:1,qty:1};
    const before=Number(j.qty||1);
    j.qty=Math.min(maxBatch(p),Math.max(1,before+(b.classList.contains('batchPlus')?1:-1)));
    s.packingJobs[sku]=j;
    try{await save(s);render()}catch(e){j.qty=before;render();alert('Packing quantity could not be saved to Cloudflare.')}
  });

  document.querySelectorAll('.nextPackStep').forEach(b=>b.onclick=async()=>{
    const sku=b.dataset.sku,p=pals.find(x=>x.sku===sku),j=s.packingJobs[sku]||{step:1,qty:1};
    if(j.step<8){
      const before=Number(j.step||1);
      j.step++;
      s.packingJobs[sku]=j;
      try{await save(s);render()}catch(e){j.step=before;render();alert('Packing step could not be saved to Cloudflare.')}
    }else{
      for(let n=0;n<j.qty;n++)printPalBarcode(sku,p.name);
    }
  });

  document.querySelectorAll('.barcodeApplied').forEach(b=>b.onclick=async()=>{
    const sku=b.dataset.sku,p=pals.find(x=>x.sku===sku),j=s.packingJobs[sku];
    if(!j||j.step!==8)return;
    const qty=Math.min(j.qty,maxBatch(p));
    if(qty<=0)return;

    const before=JSON.parse(JSON.stringify(s));

    setAssembled(sku,assembled(sku)-qty);
    s.inserts[sku].ready=Math.max(0,ins(sku)-qty);
    ['clear_boxes','bottom_cards','stickers'].forEach(k=>s.consumables[k].stock=Math.max(0,cs(k)-qty));
    s.awaitingDispatch=s.awaitingDispatch||[];

    const packedAt=new Date().toISOString(),historyId=makeId();
    s.packingHistory.push({
      id:historyId,sku,name:p.name,qty,
      created_at:packedAt,status:'complete',
      packed_by:currentForgeUser()?.email||''
    });
    s.awaitingDispatch.push({
      id:makeId(),source_history_id:historyId,sku:sku,name:p.name,qty:Number(qty),
      status:'awaiting_dispatch',packed_at:packedAt,destination:null
    });
    delete s.packingJobs[sku];

    b.disabled=true;
    b.textContent='Saving to Cloud…';
    try{
      await save(s);
      render();
    }catch(e){
      s=before;
      render();
      alert('Packed batch could not be saved to Cloudflare. No stock has been consumed.');
    }
  });
 }

 q.oninput=render;
 render();

 await startForgeLiveSync(async fresh=>{
   s=JSON.parse(JSON.stringify(fresh));
   pals=ps.filter(p=>p.type==='pal'&&isOnSale(s,p.sku));
   render();
 });
}

function barcodePrinterSettings(){
 const s=state();
 const host=document.querySelector('#barcodePrinterSettings');
 if(!host)return;
 const printers=(s.printers||[]).map((p,i)=>({id:p.id||p.name||String(i),name:p.name||p.label||p.model||('Printer '+(i+1))}));
 const current=s.printerRoles?.barcode||'';
 host.innerHTML=`<div class="card"><div class="section-title"><div><h2>Barcode / Label Printer</h2><div class="small">Used for the 50 × 30 mm Pal barcode label at Packing Station step 8.</div></div><span class="badge info">50 × 30 mm</span></div>
 <div class="printer-role-row"><label><span>Label Printer</span><select id="barcodePrinterSelect"><option value="">Choose printer…</option>${printers.map(p=>`<option value="${esc(p.name)}" ${current===p.name?'selected':''}>${esc(p.name)}</option>`).join('')}<option value="__manual" ${current&&!printers.some(p=>p.name===current)?'selected':''}>Other / Manual…</option></select></label>
 <label id="barcodeManualWrap" style="${current&&!printers.some(p=>p.name===current)?'':'display:none'}"><span>Printer Name</span><input id="barcodePrinterManual" value="${current&&!printers.some(p=>p.name===current)?esc(current):''}" placeholder="e.g. Zebra / Brother Label Printer"></label>
 <button class="btn" id="saveBarcodePrinter">Save Barcode Printer</button></div>
 <div class="small" style="margin-top:8px">Browsers cannot silently choose a physical printer. Forge will format the label correctly and remember which printer you intend to use; select that printer in the system print dialog.</div></div>`;
 const sel=document.querySelector('#barcodePrinterSelect'),mw=document.querySelector('#barcodeManualWrap');
 sel.onchange=()=>mw.style.display=sel.value==='__manual'?'':'none';
 document.querySelector('#saveBarcodePrinter').onclick=()=>{
   const val=sel.value==='__manual'?document.querySelector('#barcodePrinterManual').value.trim():sel.value;
   s.printerRoles=s.printerRoles||{};s.printerRoles.barcode=val;save(s);
   alert(val?`Barcode printer saved: ${val}`:'Barcode printer selection cleared.');
 };
}


function addForgeInventory(s,sku,loc,qty){
 qty=Number(qty||0);
 if(!qty)return;
 // Current inventory pages use s.inventory where available.
 if(s.inventory){
   s.inventory[sku]=s.inventory[sku]||{};
   s.inventory[sku][loc]=Number(s.inventory[sku][loc]||0)+qty;
 }
 // Some earlier builds use s.stock.
 if(s.stock){
   s.stock[sku]=s.stock[sku]||{};
   s.stock[sku][loc]=Number(s.stock[sku][loc]||0)+qty;
 }
 // Finished-stock mirror is always maintained.
 s.finishedStock=s.finishedStock||{boat:{},cornwall:{}};
 s.finishedStock[loc]=s.finishedStock[loc]||{};
 s.finishedStock[loc][sku]=Number(s.finishedStock[loc][sku]||0)+qty;
}


function damageReworkRequirements(job){
 const q=Number(job.qty||1);
 if(job.type==='item'){
   const req=job.requirements||{};
   const fullFactory=!!(req.box&&req.insert&&req.pal);
   if(req.pal){
     // Pal damage always returns to the factory.
     // If all three faults are selected, this becomes a complete factory replacement.
     return {
       route:'factory',
       full_factory:fullFactory,
       clear_boxes:fullFactory?q:0,
       inserts:fullFactory?q:0,
       pals:q,
       bottom_cards:fullFactory?q:0,
       stickers:fullFactory?q:0,
       label:fullFactory?'Full factory replacement':'Factory replacement Pal'
     };
   }
   // Box / insert only = local Cornwall repair using Cornwall spare stock.
   return {
     route:'cornwall',
     full_factory:false,
     clear_boxes:req.box?q:0,
     inserts:req.insert?q:0,
     pals:0,bottom_cards:0,stickers:0,
     label:[req.box?'Replace box':'',req.insert?'Replace insert':''].filter(Boolean).join(' + ')
   };
 }
 // Legacy jobs.
 if(job.type==='pal')return {route:'factory',full_factory:false,clear_boxes:0,inserts:0,pals:q,bottom_cards:0,stickers:0,label:'Factory replacement Pal'};
 if(job.type==='writeoff')return {route:'factory',full_factory:true,clear_boxes:q,inserts:q,pals:q,bottom_cards:q,stickers:q,label:'Full factory replacement'};
 if(job.type==='box')return {route:'cornwall',full_factory:false,clear_boxes:q,inserts:0,pals:0,bottom_cards:0,stickers:0,label:'Replace damaged box'};
 if(job.type==='insert')return {route:'cornwall',full_factory:false,clear_boxes:0,inserts:q,pals:0,bottom_cards:0,stickers:0,label:'Replace damaged insert'};
 return {route:'cornwall',full_factory:false,clear_boxes:0,inserts:0,pals:0,bottom_cards:0,stickers:0,label:'Rework'};
}
function forgeAssembledQty(s,sku){
 if(s.assembled&&s.assembled[sku]!=null)return Number(s.assembled[sku]||0);
 if(s.assemblyStock&&s.assemblyStock[sku]!=null)return Number(s.assemblyStock[sku]||0);
 if(s.benchStock&&s.benchStock[sku]!=null)return Number(s.benchStock[sku]||0);
 return 0;
}
function setForgeAssembledQty(s,sku,v){
 v=Math.max(0,Number(v||0));
 if(s.assembled&&s.assembled[sku]!=null)s.assembled[sku]=v;
 else if(s.assemblyStock&&s.assemblyStock[sku]!=null)s.assemblyStock[sku]=v;
 else if(s.benchStock&&s.benchStock[sku]!=null)s.benchStock[sku]=v;
 else{s.assembled=s.assembled||{};s.assembled[sku]=v}
}
function forgeInsertReady(s,sku){return Number(s.inserts?.[sku]?.ready||0)}
function forgeConsumableStock(s,key){return Number(s.consumables?.[key]?.stock||0)}
function cornwallBoxStock(s){return Number(s.cornwallReworkStock?.clear_boxes||0)}
function cornwallInsertStock(s,sku){return Number(s.cornwallReworkStock?.inserts?.[sku]||0)}
function cornwallInsertTarget(){return 2}
function damageReworkReady(s,job){
 const r=damageReworkRequirements(job);
 if(r.route==='cornwall'){
   return cornwallBoxStock(s)>=r.clear_boxes && cornwallInsertStock(s,job.sku)>=r.inserts;
 }
 return forgeAssembledQty(s,job.sku)>=r.pals &&
        forgeInsertReady(s,job.sku)>=r.inserts &&
        forgeConsumableStock(s,'clear_boxes')>=r.clear_boxes &&
        forgeConsumableStock(s,'bottom_cards')>=r.bottom_cards &&
        forgeConsumableStock(s,'stickers')>=r.stickers;
}
function completeCornwallReworkJob(s,job){
 const r=damageReworkRequirements(job);
 if(!job||job.status!=='awaiting_rework'||r.route!=='cornwall'||!damageReworkReady(s,job))return false;
 if(r.clear_boxes)s.cornwallReworkStock.clear_boxes=Math.max(0,cornwallBoxStock(s)-r.clear_boxes);
 if(r.inserts){
   s.cornwallReworkStock.inserts[job.sku]=Math.max(0,cornwallInsertStock(s,job.sku)-r.inserts);
 }
 addForgeInventory(s,job.sku,'cornwall',Number(job.qty||1));
 job.status='complete';
 job.completed_at=new Date().toISOString();
 job.completed_route='cornwall';
 s.reworkHistory=s.reworkHistory||[];
 s.reworkHistory.push({id:makeId(),job_id:job.id,sku:job.sku,name:job.name,qty:Number(job.qty||1),label:r.label,route:'Cornwall',created_at:job.completed_at});
 save(s);
 return true;
}
function sendFactoryReworkToDispatch(s,job){
 const r=damageReworkRequirements(job);
 if(!job||job.status!=='awaiting_rework'||r.route!=='factory'||!damageReworkReady(s,job))return false;

 // Consume replacement factory components.
 if(r.pals)setForgeAssembledQty(s,job.sku,forgeAssembledQty(s,job.sku)-r.pals);
 if(r.inserts){
   s.inserts[job.sku]=s.inserts[job.sku]||{awaiting_cut:0,ready:0};
   s.inserts[job.sku].ready=Math.max(0,forgeInsertReady(s,job.sku)-r.inserts);
 }
 if(r.clear_boxes)s.consumables.clear_boxes.stock=Math.max(0,forgeConsumableStock(s,'clear_boxes')-r.clear_boxes);
 if(r.bottom_cards)s.consumables.bottom_cards.stock=Math.max(0,forgeConsumableStock(s,'bottom_cards')-r.bottom_cards);
 if(r.stickers)s.consumables.stickers.stock=Math.max(0,forgeConsumableStock(s,'stickers')-r.stickers);

 const now=new Date().toISOString();
 s.awaitingDispatch=s.awaitingDispatch||[];
 s.awaitingDispatch.push({
   id:makeId(),
   sku:job.sku,
   name:job.name,
   qty:Number(job.qty||1),
   status:'awaiting_dispatch',
   packed_at:now,
   destination:null,
   locked_destination:'cornwall',
   rework_return:true,
   rework_job_id:job.id,
   rework_label:r.label
 });
 job.status='awaiting_dispatch';
 job.sent_to_dispatch_at=now;
 save(s);
 return true;
}

function recoverAwaitingDispatch(s){
 s.awaitingDispatch=s.awaitingDispatch||[];
 // v0.8.0 clean state: never recreate dispatch from historical packing records.
 s.awaitingDispatch=s.awaitingDispatch.filter(x=>x.status==='awaiting_dispatch'&&Number(x.qty||0)>0);
 save(s);
}


async function cloudDispatchState(){
 if(!cloudToken())throw new Error('Cloud login required.');
 return await cloudFetchTimed('/dispatch/state',{},10000);
}
async function saveDispatchCloudState(s){
 if(!cloudToken())throw new Error('Cloud login required.');
 return await cloudFetchTimed('/dispatch/state',{
   method:'PUT',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({state:s})
 },12000);
}
async function cloudDispatchStamp(){
 if(!cloudToken())return null;
 try{
   const d=await cloudFetchTimed('/dispatch/sync-status',{},8000);
   return d.updated_at||null;
 }catch(e){
   return null;
 }
}
function applyDispatchCloudState(data){
 const s=blankOperationalState();
 Object.assign(s,JSON.parse(JSON.stringify(data?.state||{})));
 s.targets=s.targets||{};
 s.awaitingDispatch=s.awaitingDispatch||[];
 s.transfers=s.transfers||[];
 s.packingHistory=s.packingHistory||[];
 s.damageHistory=s.damageHistory||[];
 s.damageReworkJobs=s.damageReworkJobs||[];
 s.damageInsertDemand=s.damageInsertDemand||{};
 s.reworkHistory=s.reworkHistory||[];
 s.cornwallReworkStock=s.cornwallReworkStock||{clear_boxes:0,inserts:{}};
 s.cornwallReworkStock.inserts=s.cornwallReworkStock.inserts||{};
 s.cornwallInsertReplenishment=s.cornwallInsertReplenishment||{};
 return s;
}

async function deliveriesPage(){
 installForgeCloudSyncBadge();

 let initial;
 try{
   initial=await cloudDispatchState();
 }catch(e){
   showCloudRequiredError(e.message);
   setForgeCloudSync('error',e.message);
   return;
 }

 let s=applyDispatchCloudState(initial);
 let dispatchStamp=initial.updated_at||null;
 recoverAwaitingDispatch(s);
 setForgeCloudSync('synced','Dispatch synced');

 const unassigned=document.querySelector('#awaitingDispatch');
 const awaiting=document.querySelector('#awaitingDeliveries');
 const dispatchKpi=document.querySelector('#awaitingDispatchKpi');
 const awaitKpi=document.querySelector('#awaitingDeliveryKpi');
 const boatKpi=document.querySelector('#boatFinishedKpi');
 const cornKpi=document.querySelector('#cornwallFinishedKpi');

 async function persistDispatch(message='Dispatch update'){
   try{
     const result=await saveDispatchCloudState(s);
     dispatchStamp=result.updated_at||dispatchStamp;
     setForgeCloudSync('synced',message+' saved');
     return true;
   }catch(e){
     alert(`${message} could not be saved to Cloudflare: ${e.message}`);
     setForgeCloudSync('error',e.message);
     try{
       const fresh=await cloudDispatchState();
       s=applyDispatchCloudState(fresh);
       dispatchStamp=fresh.updated_at||dispatchStamp;
       recoverAwaitingDispatch(s);
     }catch(_){}
     render();
     return false;
   }
 }

 function groupedDispatch(){
   const map={};
   const seenDispatch=new Set();
   (s.awaitingDispatch||[]).filter(x=>x.status==='awaiting_dispatch'&&Number(x.qty||0)>0).forEach(x=>{
     const identity=x.source_history_id?`history:${x.source_history_id}`:`record:${x.id}`;
     if(seenDispatch.has(identity))return;
     seenDispatch.add(identity);
     const groupKey=x.item_type==='cornwall_insert_spare'
       ?`${x.sku}|cornwall-insert|${x.id}`
       :x.rework_return?`${x.sku}|rework|${x.rework_job_id||x.id}`:`${x.sku}|normal`;
     if(!map[groupKey])map[groupKey]={
       key:groupKey,sku:x.sku,name:x.name||x.sku,qty:0,records:[],
       oldest:x.packed_at||x.created_at||'',
       locked_destination:x.locked_destination||null,
       rework_return:!!x.rework_return,
       rework_job_id:x.rework_job_id||null,
       rework_label:x.rework_label||'',
       item_type:x.item_type||'pal',
       supply_label:x.supply_label||''
     };
     const g=map[groupKey];
     g.qty+=Number(x.qty||0);
     g.records.push(x);
     const dt=x.packed_at||x.created_at||'';
     if(dt&&(!g.oldest||dt<g.oldest))g.oldest=dt;
   });
   return Object.values(map).sort((a,b)=>(needed(s,b.sku,'boat')+needed(s,b.sku,'cornwall'))-(needed(s,a.sku,'boat')+needed(s,a.sku,'cornwall'))||a.name.localeCompare(b.name));
 }

 function consumeDispatchRecords(group,qty){
   let remaining=Math.max(0,Number(qty||0));
   const expectedType=group.item_type||'pal';
   const records=[...(group.records||[])]
     .filter(r=>(r.item_type||'pal')===expectedType&&r.status==='awaiting_dispatch')
     .sort((a,b)=>(a.packed_at||a.created_at||'').localeCompare(b.packed_at||b.created_at||''));

   const available=records.reduce((a,r)=>a+Number(r.qty||0),0);
   if(remaining>available)return false;

   records.forEach(r=>{
     if(remaining<=0)return;
     const used=Math.min(Number(r.qty||0),remaining);
     r.qty=Number(r.qty||0)-used;
     remaining-=used;
     if(r.qty<=0)r.status='allocated';
   });
   return remaining===0;
 }

 function allocationCard(g){
   const boatStock=stock(s,g.sku,'boat'),cornStock=stock(s,g.sku,'cornwall');
   const boatTarget=getTarget(s,g.sku,'boat'),cornTarget=getTarget(s,g.sku,'cornwall');
   const boatNeed=needed(s,g.sku,'boat'),cornNeed=needed(s,g.sku,'cornwall');
   if(g.item_type==='cornwall_insert_spare'){
     return `<div class="dispatch-pal-card rework-dispatch-card">
       <div class="dispatch-pal-head">
         <div><strong>${esc(g.name)} Insert</strong><div class="sku">${g.sku}</div><div class="small">Cornwall spare-stock replenishment</div></div>
         <div class="dispatch-ready-total"><span>Ready to Dispatch</span><strong>${g.qty}</strong></div>
       </div>
       <div class="dispatch-locked-route">
         <div><span>Destination</span><strong>Kitsune Cornwall</strong></div>
         <div><span>Stock Type</span><strong>Rework Spare Insert</strong></div>
       </div>
       <div class="dispatch-allocation-footer">
         <div class="dispatch-allocation-summary">Factory-produced spare insert for Cornwall Rework Stock.</div>
         <button class="btn dispatchCornwallInsertSpare" data-key="${esc(g.key)}">Dispatch to Cornwall</button>
       </div>
     </div>`;
   }
   if(g.locked_destination==='cornwall'){
     return `<div class="dispatch-pal-card rework-dispatch-card">
       <div class="dispatch-pal-head">
         <div><strong>${esc(g.name)}</strong><div class="sku">${g.sku}</div><div class="small">${esc(g.rework_label||'Factory rework return')}</div></div>
         <div class="dispatch-ready-total"><span>Rework Return</span><strong>${g.qty}</strong></div>
       </div>
       <div class="dispatch-locked-route">
         <div><span>Destination</span><strong>Kitsune Cornwall</strong></div>
         <div><span>Route</span><strong>Factory Replacement → Cornwall</strong></div>
       </div>
       <div class="dispatch-allocation-footer">
         <div class="dispatch-allocation-summary">This rework replacement is locked to Cornwall.</div>
         <button class="btn dispatchReworkCornwall" data-key="${esc(g.key)}">Dispatch to Cornwall</button>
       </div>
     </div>`;
   }
   return `<div class="dispatch-pal-card">
     <div class="dispatch-pal-head">
       <div><strong>${esc(g.name)}</strong><div class="sku">${g.sku}</div><div class="small">Oldest packed ${fmtDate(g.oldest)}</div></div>
       <div class="dispatch-ready-total"><span>Ready to Dispatch</span><strong>${g.qty}</strong></div>
     </div>
     <div class="dispatch-location-grid">
       <div class="dispatch-location-card">
         <div class="dispatch-location-title"><strong>Kitsune Boat</strong>${boatNeed>0?badge(`NEED ${boatNeed}`,'warning'):badge('TARGET MET','ok')}</div>
         <div class="dispatch-stock-line"><span>Current</span><strong>${boatStock}</strong></div>
         <div class="dispatch-stock-line"><span>Target</span><strong>${boatTarget}</strong></div>
         <div class="dispatch-stock-line need-line"><span>Need</span><strong>${boatNeed}</strong></div>
         <label class="dispatch-qty-label"><span>Send Qty</span><input class="number dispatchBoatQty" id="boat-${g.sku}" data-sku="${g.sku}" type="number" min="0" max="${g.qty}" value="${Math.min(g.qty,boatNeed)}"></label>
       </div>
       <div class="dispatch-location-card">
         <div class="dispatch-location-title"><strong>Kitsune Cornwall</strong>${cornNeed>0?badge(`NEED ${cornNeed}`,'warning'):badge('TARGET MET','ok')}</div>
         <div class="dispatch-stock-line"><span>Current</span><strong>${cornStock}</strong></div>
         <div class="dispatch-stock-line"><span>Target</span><strong>${cornTarget}</strong></div>
         <div class="dispatch-stock-line need-line"><span>Need</span><strong>${cornNeed}</strong></div>
         <label class="dispatch-qty-label"><span>Send Qty</span><input class="number dispatchCornQty" id="cornwall-${g.sku}" data-sku="${g.sku}" type="number" min="0" max="${g.qty}" value="${Math.min(Math.max(0,g.qty-Math.min(g.qty,boatNeed)),cornNeed)}"></label>
       </div>
     </div>
     <div class="dispatch-allocation-footer">
       <div class="dispatch-allocation-summary" id="summary-${g.sku}"></div>
       <button class="btn allocateSplit" data-key="${esc(g.key)}" data-sku="${g.sku}">Confirm Dispatch Allocation</button>
     </div>
   </div>`;
 }

 function normaliseDamageItems(t){
   t.qcDamagedItems=t.qcDamagedItems||[];
   const wanted=Math.max(0,Math.min(Number(t.qty||0),Number(t.qcDraftDamaged||0)));
   while(t.qcDamagedItems.length<wanted){
     t.qcDamagedItems.push({
       id:makeId(),
       box:false,
       insert:false,
       pal:false,
       writeoff:false
     });
   }
   if(t.qcDamagedItems.length>wanted)t.qcDamagedItems=t.qcDamagedItems.slice(0,wanted);
   return t.qcDamagedItems;
 }

 function issueLabel(item){
   if(item.box&&item.insert&&item.pal)return 'Full Factory Replacement';
   const a=[];
   if(item.box)a.push('Box Damaged');
   if(item.insert)a.push('Insert Damaged');
   if(item.pal)a.push('Pal Broken');
   return a.length?a.join(' + '):'No issue selected';
 }

 function damagedItemsHtml(t){
   const items=normaliseDamageItems(t);
   return items.map((item,idx)=>`<div class="damaged-item-card ${item.writeoff?'writeoff-item':''}">
      <div class="damaged-item-head">
        <div><strong>Damaged Item ${idx+1}</strong><div class="small">${esc(issueLabel(item))}</div></div>
        ${item.box&&item.insert&&item.pal?badge('FULL FACTORY','danger'):item.pal?badge('FACTORY','warning'):badge('CORNWALL REPAIR','info')}
      </div>
      <div class="damage-toggle-grid">
        <label class="damage-toggle ${item.box?'selected':''}">
          <input class="damageFault" data-id="${t.id}" data-item="${item.id}" data-field="box" type="checkbox" ${item.box?'checked':''}>
          <span>Box Damaged</span>
        </label>
        <label class="damage-toggle ${item.insert?'selected':''}">
          <input class="damageFault" data-id="${t.id}" data-item="${item.id}" data-field="insert" type="checkbox" ${item.insert?'checked':''}>
          <span>Insert Damaged</span>
        </label>
        <label class="damage-toggle ${item.pal?'selected':''}">
          <input class="damageFault" data-id="${t.id}" data-item="${item.id}" data-field="pal" type="checkbox" ${item.pal?'checked':''}>
          <span>Pal Broken</span>
        </label>

      </div>
   </div>`).join('');
 }

 function deliveryCard(t){
   const qty=Number(t.qty||0);
   t.qcDraftDamaged=Math.max(0,Math.min(qty,Number(t.qcDraftDamaged||0)));
   const damaged=t.qcDraftDamaged;
   const good=qty-damaged;
   normaliseDamageItems(t);

   return `<div class="delivery-card qc-delivery-card">
     <div class="delivery-main">
       <strong>${esc(t.name)}</strong>
       <div class="sku">${t.sku}</div>
       <div class="small">Dispatched ${fmtDate(t.dispatched_at||t.packed_at)} · Shipment Qty ${qty}</div>
     </div>

     <div class="delivery-qc">
       <label><span>Good Condition</span><input class="number goodQty" value="${good}" disabled></label>
       <label><span>Damaged Items</span><input class="number damagedQty" id="damaged-${t.id}" data-id="${t.id}" type="number" min="0" max="${qty}" value="${damaged}"></label>
     </div>

     ${damaged>0?`<div class="damage-breakdown">
       <div class="damage-breakdown-head">
         <div><strong>Damage by Item</strong><div class="small">Each damaged physical Pal appears once. Select every fault that applies to that item.</div></div>
         <span class="badge danger">${damaged} DAMAGED</span>
       </div>
       <div class="damaged-items-list">${damagedItemsHtml(t)}</div>
     </div>`:''}

     <div class="delivery-qc-footer">
       <div class="small qc-summary" id="qc-summary-${t.id}"></div>
       <button class="btn confirmDeliveryQC" data-id="${t.id}">Confirm Delivery</button>
     </div>
   </div>`;
 }

 function render(){
   const groups=groupedDispatch();
   const awaitingTransfers=(s.transfers||[]).filter(t=>t.destination==='cornwall'&&t.status==='awaiting_delivery');

   dispatchKpi.textContent=groups.reduce((a,g)=>a+Number(g.qty||0),0);
   awaitKpi.textContent=awaitingTransfers.reduce((a,t)=>a+Number(t.qty||0),0);
   boatKpi.textContent=Object.values(s.finishedStock?.boat||{}).reduce((a,v)=>a+Number(v||0),0);
   cornKpi.textContent=Object.values(s.finishedStock?.cornwall||{}).reduce((a,v)=>a+Number(v||0),0);

   unassigned.innerHTML=groups.length?groups.map(allocationCard).join(''):'<div class="bench-empty">No finished Pals are awaiting dispatch allocation.</div>';
   awaiting.innerHTML=awaitingTransfers.length?awaitingTransfers.map(t=>{
     if(t.transfer_type==='cornwall_insert_spare'){
       return `<div class="delivery-card qc-delivery-card">
         <div class="delivery-main"><strong>${esc(t.name)} Insert</strong><div class="sku">${t.sku}</div><div class="small">Cornwall spare-stock replenishment · Qty ${t.qty}</div></div>
         <div class="delivery-qc-footer">
           <div class="small">Confirm the spare insert has arrived at Cornwall.</div>
           <button class="btn receiveCornwallInsertSpare" data-id="${t.id}">Confirm Received</button>
         </div>
       </div>`;
     }
     return deliveryCard(t);
   }).join(''):'<div class="bench-empty">No stock is awaiting delivery to Cornwall.</div>';

   function updateSummary(sku){
     const g=groups.find(x=>x.sku===sku&&(x.item_type||'pal')==='pal'&&!x.locked_destination&&!x.rework_return);if(!g)return;
     const b=Math.max(0,Number(document.querySelector('#boat-'+sku)?.value||0));
     const c=Math.max(0,Number(document.querySelector('#cornwall-'+sku)?.value||0));
     const total=b+c;
     const el=document.querySelector('#summary-'+sku);
     if(!el)return;
     if(total>g.qty)el.innerHTML=`<strong class="danger-text">Too many selected: ${total} / ${g.qty}</strong>`;
     else el.innerHTML=`Boat <strong>${b}</strong> · Cornwall <strong>${c}</strong> · Leave for later <strong>${g.qty-total}</strong>`;
   }

   document.querySelectorAll('.dispatchBoatQty,.dispatchCornQty').forEach(el=>el.oninput=()=>updateSummary(el.dataset.sku));
   groups.filter(g=>(g.item_type||'pal')==='pal'&&!g.locked_destination&&!g.rework_return).forEach(g=>updateSummary(g.sku));

   document.querySelectorAll('.dispatchCornwallInsertSpare').forEach(btn=>btn.onclick=async()=>{
     const g=groups.find(x=>x.key===btn.dataset.key);if(!g)return;
     if(!consumeDispatchRecords(g,g.qty)){alert('Could not dispatch this Cornwall spare insert.');return}
     const now=new Date().toISOString();
     s.transfers.push({
       id:makeId(),
       transfer_type:'cornwall_insert_spare',
       sku:g.sku,
       name:g.name,
       qty:g.qty,
       destination:'cornwall',
       status:'awaiting_delivery',
       packed_at:g.oldest,
       dispatched_at:now,
       received_at:null
     });
     await persistDispatch('Dispatch update');render();
   });

   document.querySelectorAll('.dispatchReworkCornwall').forEach(btn=>btn.onclick=async()=>{
     const g=groups.find(x=>x.key===btn.dataset.key);if(!g)return;
     if(!consumeDispatchRecords(g,g.qty)){alert('Could not dispatch this rework return.');return}
     const now=new Date().toISOString();
     // Do NOT add Cornwall inventory yet. The replacement must be physically received first.
     s.transfers.push({
       id:makeId(),sku:g.sku,name:g.name,qty:g.qty,destination:'cornwall',
       status:'awaiting_delivery',packed_at:g.oldest,dispatched_at:now,received_at:null,
       good_qty:null,damaged_qty:null,qcDraftDamaged:0,qcDamagedItems:[],
       rework_return:true,rework_job_id:g.rework_job_id,rework_label:g.rework_label
     });
     await persistDispatch('Dispatch update');render();
   });

   document.querySelectorAll('.allocateSplit').forEach(btn=>btn.onclick=async()=>{
     const g=groups.find(x=>x.key===btn.dataset.key);if(!g)return;
     const boatQty=Math.max(0,Math.floor(Number(document.querySelector('#boat-'+g.sku)?.value||0)));
     const cornQty=Math.max(0,Math.floor(Number(document.querySelector('#cornwall-'+g.sku)?.value||0)));
     const total=boatQty+cornQty;
     if(total<=0){alert('Choose a quantity for Boat and/or Cornwall.');return}
     if(total>g.qty){alert(`Only ${g.qty} ready to dispatch.`);return}
     if(!consumeDispatchRecords(g,total)){alert('Could not allocate this dispatch quantity.');return}

     const now=new Date().toISOString();
     if(boatQty>0){
       addForgeInventory(s,g.sku,'boat',boatQty);
       s.transfers.push({id:makeId(),sku:g.sku,name:g.name,qty:boatQty,destination:'boat',status:'received',packed_at:g.oldest,dispatched_at:now,received_at:now,good_qty:boatQty,damaged_qty:0});
     }
     if(cornQty>0){
       addForgeInventory(s,g.sku,'cornwall',cornQty);
       s.transfers.push({
         id:makeId(),sku:g.sku,name:g.name,qty:cornQty,destination:'cornwall',
         status:'awaiting_delivery',packed_at:g.oldest,dispatched_at:now,received_at:null,
         good_qty:null,damaged_qty:null,qcDraftDamaged:0,qcDamagedItems:[]
       });
     }
     await persistDispatch('Dispatch update');render();
   });

   function updateQcSummary(t){
     const damaged=Number(t.qcDraftDamaged||0);
     const good=Number(t.qty||0)-damaged;
     const items=normaliseDamageItems(t);
     const incomplete=items.filter(item=>!item.box&&!item.insert&&!item.pal).length;
     const el=document.querySelector('#qc-summary-'+t.id);if(!el)return;

     if(damaged===0){
       el.innerHTML=`All <strong>${good}</strong> confirmed in good condition.`;
     }else if(incomplete>0){
       el.innerHTML=`<strong class="danger-text">${incomplete} damaged item${incomplete===1?' has':'s have'} no fault selected.</strong>`;
     }else{
       el.innerHTML=`<strong>${good}</strong> good · <strong class="danger-text">${damaged} damaged</strong> · all damaged items classified.`;
     }
   }

   document.querySelectorAll('.receiveCornwallInsertSpare').forEach(btn=>btn.onclick=async()=>{
     const t=s.transfers.find(x=>x.id===btn.dataset.id);if(!t)return;
     s.cornwallReworkStock=s.cornwallReworkStock||{clear_boxes:0,inserts:{}};
     s.cornwallReworkStock.inserts=s.cornwallReworkStock.inserts||{};
     s.cornwallReworkStock.inserts[t.sku]=cornwallInsertStock(s,t.sku)+Number(t.qty||0);
     t.status='received';
     t.received_at=new Date().toISOString();
     await persistDispatch('Dispatch update');render();
   });

   document.querySelectorAll('.damagedQty').forEach(el=>el.onchange=async()=>{
     const t=s.transfers.find(x=>x.id===el.dataset.id);if(!t)return;
     t.qcDraftDamaged=Math.max(0,Math.min(Number(t.qty||0),Math.floor(Number(el.value||0))));
     normaliseDamageItems(t);
     await persistDispatch('Dispatch update');render();
   });

   document.querySelectorAll('.damageFault').forEach(el=>el.onchange=async()=>{
     const t=s.transfers.find(x=>x.id===el.dataset.id);if(!t)return;
     const item=(t.qcDamagedItems||[]).find(x=>x.id===el.dataset.item);if(!item)return;
     const field=el.dataset.field;

     item[field]=el.checked;
     // No separate "write off" option. Selecting all three faults automatically
     // becomes a full factory replacement.
     item.writeoff=false;
     await persistDispatch('Dispatch update');render();
   });

   awaitingTransfers.filter(t=>t.transfer_type!=='cornwall_insert_spare').forEach(updateQcSummary);

   document.querySelectorAll('.confirmDeliveryQC').forEach(btn=>btn.onclick=async()=>{
     const t=s.transfers.find(x=>x.id===btn.dataset.id);if(!t)return;

     s.damageHistory=s.damageHistory||[];
     s.damageReworkJobs=s.damageReworkJobs||[];
     s.damageInsertDemand=s.damageInsertDemand||{};

     const damaged=Math.max(0,Math.min(Number(t.qty||0),Number(t.qcDraftDamaged||0)));
     const good=Number(t.qty||0)-damaged;
     const items=normaliseDamageItems(t);

     const incomplete=items.filter(item=>!item.box&&!item.insert&&!item.pal);
     if(incomplete.length){
       alert(`Please select at least one fault for each damaged item.`);
       return;
     }

     const now=new Date().toISOString();

     t.status='received';
     t.received_at=now;
     t.good_qty=good;
     t.damaged_qty=damaged;
     t.damage_items=items.map(x=>({...x}));

     if(t.rework_return){
       // Rework replacements were NOT pre-added to Cornwall inventory.
       // Add only the quantity received in good condition.
       if(good>0)addForgeInventory(s,t.sku,'cornwall',good);
       const originalJob=(s.damageReworkJobs||[]).find(x=>x.id===t.rework_job_id);
       if(originalJob){
         originalJob.status=damaged>0?'complete_with_transit_damage':'complete';
         originalJob.completed_at=now;
         originalJob.completed_route='factory_dispatch';
         s.reworkHistory=s.reworkHistory||[];
         s.reworkHistory.push({id:makeId(),job_id:originalJob.id,sku:originalJob.sku,name:originalJob.name,qty:good,label:damageReworkRequirements(originalJob).label,route:'Factory → Dispatch → Cornwall',created_at:now});
       }
     }

     if(damaged>0){
       // Remove each damaged physical item once from Cornwall usable stock.
       if(!t.rework_return){
         s.stock[t.sku]=s.stock[t.sku]||{};
         s.stock[t.sku].cornwall=Math.max(0,Number(s.stock[t.sku].cornwall||0)-damaged);

         s.finishedStock=s.finishedStock||{boat:{},cornwall:{}};
         s.finishedStock.cornwall=s.finishedStock.cornwall||{};
         s.finishedStock.cornwall[t.sku]=Math.max(0,Number(s.finishedStock.cornwall[t.sku]||0)-damaged);
       }

       items.forEach((item,index)=>{
         // Each physical damaged Pal creates ONE rework job with a list of requirements.
         const requirements={
           box:!!item.box,
           insert:!!item.insert,
           pal:!!item.pal,
           writeoff:!!(item.box&&item.insert&&item.pal)
         };

         s.damageReworkJobs.push({
           id:makeId(),
           transfer_id:t.id,
           damaged_item_index:index+1,
           sku:t.sku,
           name:t.name,
           qty:1,
           type:'item',
           requirements,
           status:'awaiting_rework',
           created_at:now,
           location:'cornwall'
         });

         if(requirements.insert&&requirements.pal&&requirements.box){
           // All three faults selected = full factory replacement, including a new insert.
           s.damageInsertDemand[t.sku]=Number(s.damageInsertDemand[t.sku]||0)+1;
         }

         s.damageHistory.push({
           id:makeId(),
           transfer_id:t.id,
           damaged_item_index:index+1,
           sku:t.sku,
           name:t.name,
           qty:1,
           requirements:{...requirements},
           location:'cornwall',
           created_at:now
         });
       });
     }

     delete t.qcDraftDamaged;
     delete t.qcDamagedItems;

     await persistDispatch('Dispatch update');render();
   });
 }
 render();

 // Retail-safe Dispatch live sync. This does not call Admin-only production endpoints.
 window.setInterval(async()=>{
   if(document.hidden)return;
   try{
     const latestStamp=await cloudDispatchStamp();
     if(!latestStamp||latestStamp===dispatchStamp)return;

     const fresh=await cloudDispatchState();
     s=applyDispatchCloudState(fresh);
     dispatchStamp=fresh.updated_at||latestStamp;
     recoverAwaitingDispatch(s);
     render();
     setForgeCloudSync('synced','Dispatch updated live');
   }catch(e){
     setForgeCloudSync('error',e.message||'Dispatch sync failed');
   }
 },2000);
}

function resetForgeData(){
 if(!confirm('Reset Forge operational data to zero? Your cloud catalogue, recipes, employee accounts, permissions and master configuration will be kept.'))return;
 if(!confirm('This will permanently clear LOCAL production queues, build plates, print history, parts, assembly, inserts, packing, dispatch, rework, stock counts and consumable quantities on this browser. Continue?'))return;

 const current=state();
 const clean=blankOperationalState();

 // Preserve local master/configuration data. Cloudflare D1 itself is never deleted by this reset.
 clean.targets=current.targets||{};
 clean.printers=current.printers||[];
 clean.printerRoles=current.printerRoles||{};
 clean.siteSettings=current.siteSettings||clean.siteSettings;
 clean.productAvailability=current.productAvailability||{};
 clean.customData=current.customData||clean.customData;
 clean.shopifyProducts=current.shopifyProducts||{};
 clean.cloudCore=current.cloudCore||current.cloudCore;

 // Preserve consumable definitions/reorder levels, but zero physical stock.
 if(current.consumables){
   clean.consumables={};
   Object.entries(current.consumables).forEach(([key,item])=>{
     clean.consumables[key]={...item,stock:0};
   });
 }

 localStorage.setItem(STORE,JSON.stringify(clean));
 localStorage.setItem('plaForgeLastReset',new Date().toISOString());
 alert('Operational browser data has been reset to zero. Cloudflare D1, employee accounts, permissions and master data were not deleted.');
 window.location.href='index.html';
}


async function reworkPage(){
 const s=state();
 const ps=await load('products');
 const onSale=ps.filter(p=>p.type==='pal'&&isOnSale(s,p.sku)).sort((a,b)=>a.name.localeCompare(b.name));
 ensureCornwallInsertReplenishment(s,ps);
 const q=document.querySelector('#q');
 const activeList=document.querySelector('#activeRework');
 const activeKpi=document.querySelector('#reworkActiveKpi');
 const readyKpi=document.querySelector('#reworkReadyKpi');
 const waitKpi=document.querySelector('#reworkWaitingKpi');
 const localBox=document.querySelector('#cornwallBoxStockDisplay');
 const localInsertSku=document.querySelector('#cornwallInsertSku');
 const localInsertQty=document.querySelector('#cornwallInsertQty');
 const localInsertInventory=document.querySelector('#cornwallInsertInventory');
 const factoryAlert=document.querySelector('#cornwallFactoryAlert');

 localInsertSku.innerHTML=onSale.map(p=>`<option value="${p.sku}">${esc(p.name)} · ${p.sku}</option>`).join('');

 function issueSummary(job){
   if(job.type!=='item'){
     const m={box:'Box Damaged',insert:'Insert Damaged',pal:'Pal Broken',writeoff:'Full Factory Replacement'};
     return m[job.type]||job.type;
   }
   const r=job.requirements||{};
   if(r.box&&r.insert&&r.pal)return 'Box Damaged + Insert Damaged + Pal Broken';
   return [r.box?'Box Damaged':'',r.insert?'Insert Damaged':'',r.pal?'Pal Broken':''].filter(Boolean).join(' + ');
 }
 function requirementPills(job){
   const r=damageReworkRequirements(job),pills=[];
   if(r.route==='cornwall'){
     if(r.clear_boxes)pills.push({label:`Cornwall Boxes ${cornwallBoxStock(s)} / ${r.clear_boxes}`,ok:cornwallBoxStock(s)>=r.clear_boxes});
     if(r.inserts)pills.push({label:`Cornwall Inserts ${cornwallInsertStock(s,job.sku)} / ${r.inserts}`,ok:cornwallInsertStock(s,job.sku)>=r.inserts});
   }else{
     if(r.pals)pills.push({label:`Factory Assembled Pal ${forgeAssembledQty(s,job.sku)} / ${r.pals}`,ok:forgeAssembledQty(s,job.sku)>=r.pals});
     if(r.inserts)pills.push({label:`Factory Ready Insert ${forgeInsertReady(s,job.sku)} / ${r.inserts}`,ok:forgeInsertReady(s,job.sku)>=r.inserts});
     if(r.clear_boxes)pills.push({label:`Factory Clear Box ${forgeConsumableStock(s,'clear_boxes')} / ${r.clear_boxes}`,ok:forgeConsumableStock(s,'clear_boxes')>=r.clear_boxes});
     if(r.bottom_cards)pills.push({label:`Bottom Card ${forgeConsumableStock(s,'bottom_cards')} / ${r.bottom_cards}`,ok:forgeConsumableStock(s,'bottom_cards')>=r.bottom_cards});
     if(r.stickers)pills.push({label:`Sticker ${forgeConsumableStock(s,'stickers')} / ${r.stickers}`,ok:forgeConsumableStock(s,'stickers')>=r.stickers});
   }
   return pills.map(x=>`<span class="${x.ok?'stock-good':'stock-bad'}">${esc(x.label)}</span>`).join('');
 }
 function waitingReason(job){
   const r=damageReworkRequirements(job),miss=[];
   if(r.route==='cornwall'){
     if(r.clear_boxes&&cornwallBoxStock(s)<r.clear_boxes)miss.push('Cornwall spare box');
     if(r.inserts&&cornwallInsertStock(s,job.sku)<r.inserts)miss.push('Cornwall spare insert');
   }else{
     if(r.pals&&forgeAssembledQty(s,job.sku)<r.pals)miss.push('factory replacement Pal');
     if(r.inserts&&forgeInsertReady(s,job.sku)<r.inserts)miss.push('factory insert');
     if(r.clear_boxes&&forgeConsumableStock(s,'clear_boxes')<r.clear_boxes)miss.push('factory clear box');
     if(r.bottom_cards&&forgeConsumableStock(s,'bottom_cards')<r.bottom_cards)miss.push('bottom card');
     if(r.stickers&&forgeConsumableStock(s,'stickers')<r.stickers)miss.push('sticker');
   }
   return miss.length?`Waiting for ${miss.join(', ')}`:r.route==='cornwall'?'Ready for Cornwall repair':'Ready to send through Dispatch';
 }
 function lowCornwallStock(){
   const rows=[];
   if(cornwallBoxStock(s)<1)rows.push({label:'Flat Clear Boxes',qty:cornwallBoxStock(s)});
   onSale.forEach(p=>{
     const qty=cornwallInsertStock(s,p.sku);
     if(qty<cornwallInsertTarget())rows.push({label:`${p.name} Insert`,sku:p.sku,qty,target:cornwallInsertTarget()});
   });
   return rows;
 }
 function drawLocalStock(){
   const boxQty=cornwallBoxStock(s);
   localBox.textContent=boxQty;
   localBox.closest('.cornwall-current-stock')?.classList.toggle('low-stock',boxQty<1);
   localInsertInventory.innerHTML=onSale.map(p=>{
     const qty=cornwallInsertStock(s,p.sku),low=qty<cornwallInsertTarget();
     return `<tr class="${low?'low-spare-row':''}"><td><strong>${esc(p.name)}</strong><br><span class="sku">${p.sku}</span></td><td><strong>${qty}</strong>${low?` ${badge(`NEED ${Math.max(0,cornwallInsertTarget()-qty)}`,'danger')}`:''}</td></tr>`;
   }).join('')||'<tr><td colspan="2">No On Sale Pals.</td></tr>';

   const low=lowCornwallStock();
   if(factoryAlert){
     factoryAlert.innerHTML=low.length?`<div class="factory-alert-head"><div><strong>Factory Replenishment Required</strong><div class="small">${low.length} Cornwall spare stock item${low.length===1?' is':'s are'} below target.</div></div>${badge(`${low.length} LOW`,'danger')}</div><div class="factory-alert-items">${low.map(x=>`<div><span>${esc(x.label)}</span><strong>${x.qty}</strong></div>`).join('')}</div>`:`<div class="factory-alert-ok">${badge('STOCK OK','ok')}<span>All Cornwall spare stock is at 1 or above.</span></div>`;
   }
 }
 function draw(){
   drawLocalStock();
   const text=(q.value||'').toLowerCase();
   const active=(s.damageReworkJobs||[])
     .filter(x=>x.status==='awaiting_rework'||x.status==='awaiting_dispatch')
     .filter(x=>`${x.name} ${x.sku} ${issueSummary(x)} ${damageReworkRequirements(x).label}`.toLowerCase().includes(text))
     .sort((a,b)=>Number(damageReworkReady(s,b))-Number(damageReworkReady(s,a))||(a.created_at||'').localeCompare(b.created_at||''));

   const open=active.filter(x=>x.status==='awaiting_rework');
   const ready=open.filter(x=>damageReworkReady(s,x));
   const waiting=open.filter(x=>!damageReworkReady(s,x));

   activeKpi.textContent=open.length;
   readyKpi.textContent=ready.length;
   waitKpi.textContent=waiting.length;

   activeList.innerHTML=active.length?active.map(job=>{
     const r=damageReworkRequirements(job),ready=damageReworkReady(s,job),inDispatch=job.status==='awaiting_dispatch';
     return `<div class="rework-card ${inDispatch?'in-dispatch':ready?'ready':'waiting'}">
       <div class="rework-card-head">
         <div><strong>${esc(job.name)}</strong><div class="sku">${job.sku}${job.damaged_item_index?` · Damaged Item ${job.damaged_item_index}`:''}</div><div class="small">Created ${fmtDate(job.created_at)}</div></div>
         ${inDispatch?badge('IN DISPATCH','info'):ready?badge('READY','ok'):badge('WAITING','warning')}
       </div>
       <div class="rework-issue"><span>Reported Issue</span><strong>${esc(issueSummary(job))}</strong></div>
       <div class="rework-route"><span>Route</span><strong>${r.route==='cornwall'?'Cornwall Local Repair':'Factory → Dispatch → Cornwall'}</strong></div>
       <div class="rework-route"><span>Work Required</span><strong>${esc(r.label||'Rework')}</strong></div>
       ${!inDispatch?`<div class="packing-checks">${requirementPills(job)||'<span class="stock-good">No replacement stock required</span>'}</div>`:''}
       <div class="rework-footer">
         <div class="small">${inDispatch?'Replacement is waiting in Dispatch for return to Cornwall.':esc(waitingReason(job))}</div>
         ${!inDispatch?(r.route==='cornwall'
           ?`<button class="btn completeLocalRework" data-id="${job.id}" ${ready?'':'disabled'}>Complete Cornwall Repair</button>`
           :`<button class="btn sendReworkDispatch" data-id="${job.id}" ${ready?'':'disabled'}>Send to Dispatch</button>`):'<a class="btn ghost" href="deliveries.html">Open Dispatch →</a>'}
       </div>
     </div>`;
   }).join(''):'<div class="bench-empty">No active rework jobs.</div>';

   document.querySelectorAll('.completeLocalRework').forEach(btn=>btn.onclick=()=>{
     const job=s.damageReworkJobs.find(x=>x.id===btn.dataset.id);
     if(!job||!completeCornwallReworkJob(s,job)){alert('This Cornwall repair is not ready yet.');return}
     draw();
   });
   document.querySelectorAll('.sendReworkDispatch').forEach(btn=>btn.onclick=()=>{
     const job=s.damageReworkJobs.find(x=>x.id===btn.dataset.id);
     if(!job||!sendFactoryReworkToDispatch(s,job)){alert('The factory replacement is not ready yet.');return}
     draw();
   });
 }

 document.querySelector('#addCornwallBoxes').onclick=()=>{
   const qty=Math.max(1,Math.floor(Number(document.querySelector('#cornwallBoxAddQty')?.value||1)));
   s.cornwallReworkStock=s.cornwallReworkStock||{clear_boxes:0,inserts:{}};
   s.cornwallReworkStock.inserts=s.cornwallReworkStock.inserts||{};
  s.cornwallInsertReplenishment=s.cornwallInsertReplenishment||{};
   s.cornwallReworkStock.clear_boxes=cornwallBoxStock(s)+qty;
   save(s);draw();
 };
 document.querySelector('#addCornwallInserts').onclick=()=>{
   const sku=localInsertSku.value;if(!sku)return;
   const qty=Math.max(1,Math.floor(Number(localInsertQty.value||1)));
   s.cornwallReworkStock=s.cornwallReworkStock||{clear_boxes:0,inserts:{}};
   s.cornwallReworkStock.inserts=s.cornwallReworkStock.inserts||{};
   s.cornwallReworkStock.inserts[sku]=cornwallInsertStock(s,sku)+qty;
   save(s);draw();
 };

 q.oninput=draw;
 draw();
}


function extractDriveFileId(url){
 const v=String(url||'').trim();
 const m=v.match(/\/d\/([^/]+)/)||v.match(/[?&]id=([^&]+)/);
 return m?m[1]:'';
}
function nextPalSku(products){
 let max=0;
 (products||[]).forEach(p=>{
   const m=String(p.sku||'').match(/^PLA(\d+)$/i);
   if(m)max=Math.max(max,Number(m[1]));
 });
 return `PLA${String(max+1).padStart(3,'0')}`;
}
async function newPalPage(){
 const s=state();
 const existingProducts=await load('products');
 const existingRecipes=await load('recipes');
 const filamentOptions=[...new Set([
   ...Object.keys(s.filament||{}),
   ...existingRecipes.map(r=>String(r.filament||'').trim()).filter(Boolean)
 ])].sort((a,b)=>a.localeCompare(b));
 const form=document.querySelector('#newPalForm');
 const status=document.querySelector('#newPalStatus');
 const recipeRows=document.querySelector('#newPalRecipeRows');
 const addRecipe=document.querySelector('#addRecipeRow');
 const review=document.querySelector('#newPalReview');
 const createBtn=document.querySelector('#createNewPal');
 const shopifyBridge=document.querySelector('#newPalShopifyBridge');
 const shopifyStatus=document.querySelector('#shopifyCreateStatus');
 const skuEl=document.querySelector('#npSku');

 skuEl.value=nextPalSku(existingProducts);
 shopifyBridge.value=s.siteSettings.shopifyBridgeUrl||'';

 let recipes=[{filament:'',parts:'Body',grouped_stl:'',separate_stls:'',part_count:1,weight_g:0}];

 function recipeHtml(r,idx){
   return `<div class="newpal-recipe-row">
     <div class="form-field"><label>Filament</label><select data-r="${idx}" data-k="filament">${filamentOptions.length?`<option value="">Select filament…</option>${filamentOptions.map(f=>`<option value="${esc(f)}" ${f===r.filament?'selected':''}>${esc(f)}${s.filament?.[f]?` · ${Number(s.filament[f].grams||0)}g in stock`:''}</option>`).join('')}`:'<option value="">No filaments configured</option>'}</select></div>
     <div class="form-field"><label>Parts / Colour Group</label><input data-r="${idx}" data-k="parts" value="${esc(r.parts)}" placeholder="Body / Eye 1; Eye 2"></div>
     <div class="form-field"><label>Grouped STL</label><input data-r="${idx}" data-k="grouped_stl" value="${esc(r.grouped_stl)}" placeholder="grouped_file.stl"></div>
     <div class="form-field"><label>Individual STL(s)</label><input data-r="${idx}" data-k="separate_stls" value="${esc(r.separate_stls)}" placeholder="part1.stl; part2.stl"></div>
     <div class="form-field small-field"><label>Part Count</label><input class="number" type="number" min="1" data-r="${idx}" data-k="part_count" value="${Number(r.part_count||1)}"></div>
     <div class="form-field small-field"><label>Weight (g)</label><input class="number" type="number" min="0" step="0.01" data-r="${idx}" data-k="weight_g" value="${Number(r.weight_g||0)}"></div>
     <button type="button" class="iconbtn removeRecipeRow" data-r="${idx}" title="Remove recipe row">×</button>
   </div>`;
 }
 function drawRecipes(){
   recipeRows.innerHTML=recipes.map(recipeHtml).join('');
   recipeRows.querySelectorAll('input[data-r],select[data-r]').forEach(el=>el.oninput=()=>{
     const i=Number(el.dataset.r),k=el.dataset.k;
     recipes[i][k]=['part_count','weight_g'].includes(k)?Number(el.value||0):el.value;
     drawReview();
   });
   recipeRows.querySelectorAll('.removeRecipeRow').forEach(b=>b.onclick=()=>{
     if(recipes.length<=1)return;
     recipes.splice(Number(b.dataset.r),1);drawRecipes();drawReview();
   });
 }
 function val(id){return String(document.querySelector('#'+id)?.value||'').trim()}
 function checked(id){return !!document.querySelector('#'+id)?.checked}
 function payload(){
   const sku=val('npSku').toUpperCase();
   const first=val('npFirstName'),animal=val('npAnimal');
   const full=val('npFullName')||`${first}${animal?' the '+animal:''}`;
   const filaments=[...new Set(recipes.map(r=>String(r.filament||'').trim()).filter(Boolean))];
   const product={
     sku,name:full,description:val('npShortDescription'),type:'pal',keyring:false,
     recipe_rows:recipes.length,
     recipe_weight_g:recipes.reduce((a,r)=>a+Number(r.weight_g||0),0),
     filaments,recipe_ready:recipes.every(r=>r.filament&&r.parts),
     animal,first_name:first,
     characteristics:[val('npChar1'),val('npChar2'),val('npChar3')].filter(Boolean),
     full_description:val('npFullDescription'),
     size_height_cm:Number(val('npHeight')||0),
     size_width_cm:Number(val('npWidth')||0),
     size_depth_cm:Number(val('npDepth')||0),
     barcode:val('npBarcode'),
     collection:val('npCollection'),
     price:Number(val('npPrice')||0)
   };
   const recipeData=recipes.map(r=>({
     stated_sku:sku,sku,animal,name:first,
     filament:String(r.filament||'').trim(),
     parts:String(r.parts||'').trim(),
     grouped_stl:String(r.grouped_stl||'').trim(),
     separate_stls:String(r.separate_stls||'').trim(),
     part_count:Number(r.part_count||1),
     weight_g:Number(r.weight_g||0)
   }));
   const drive=val('npInsertUrl'),fileId=extractDriveFileId(drive);
   const insertFile=drive?{file_id:fileId,view_url:drive,print_url:drive}:null;
   const shopify={
     title:full,
     descriptionHtml:val('npFullDescription')||val('npShortDescription'),
     vendor:val('npVendor')||s.siteSettings.shopifyVendor||'PLA Pals',
     productType:val('npProductType')||s.siteSettings.shopifyProductType||'PLA Pal',
     tags:val('npTags').split(',').map(x=>x.trim()).filter(Boolean),
     status:'DRAFT',
     price:Number(val('npPrice')||0),
     sku,
     barcode:val('npBarcode'),
     dimensions:{height_cm:Number(val('npHeight')||0),width_cm:Number(val('npWidth')||0),depth_cm:Number(val('npDepth')||0)}
   };
   return {product,recipes:recipeData,insertFile,shopify,onSale:checked('npOnSale'),releaseDate:val('npReleaseDate')};
 }
 function validate(data){
   const errors=[];
   if(!/^PLA\d{3,}$/.test(data.product.sku))errors.push('SKU must look like PLA084.');
   if(existingProducts.some(p=>p.sku===data.product.sku))errors.push(`${data.product.sku} already exists.`);
   if(!data.product.name)errors.push('Pal name is required.');
   if(!data.product.animal)errors.push('Animal is required.');
   if(!data.recipes.length||data.recipes.some(r=>!r.filament||!r.parts))errors.push('Every recipe row needs a filament and parts/colour group.');
   if(data.product.price<0)errors.push('Price cannot be negative.');
   return errors;
 }
 function drawReview(){
   const d=payload(), errs=validate(d);
   review.innerHTML=`<div class="newpal-review-grid">
     <div><span>Pal</span><strong>${esc(d.product.name||'—')}</strong></div>
     <div><span>SKU</span><strong>${esc(d.product.sku||'—')}</strong></div>
     <div><span>Recipe Groups</span><strong>${d.recipes.length}</strong></div>
     <div><span>Filaments</span><strong>${d.product.filaments.length}</strong></div>
     <div><span>Insert PDF</span><strong>${d.insertFile?'Linked':'Not linked'}</strong></div>
     <div><span>Shopify</span><strong>${shopifyBridge.value.trim()?'Bridge configured':'Pending bridge'}</strong></div>
   </div>${errs.length?`<div class="newpal-errors">${errs.map(e=>`<div>${esc(e)}</div>`).join('')}</div>`:''}`;
   createBtn.disabled=errs.length>0;
 }
 async function sendShopify(d){
   const url=shopifyBridge.value.trim();
   if(!url){
     return {ok:false,pending:true,message:'Forge Pal created. Shopify is pending because no secure Shopify Bridge URL is configured.'};
   }
   try{
     const res=await fetch(url,{
       method:'POST',
       headers:{'Content-Type':'application/json'},
       body:JSON.stringify({action:'create_pal_product',product:d.shopify})
     });
     const body=await res.json().catch(()=>({}));
     if(!res.ok)throw new Error(body.error||body.message||`HTTP ${res.status}`);
     return {ok:true,body};
   }catch(e){
     return {ok:false,pending:true,message:`Forge Pal created, but Shopify creation failed: ${e.message}`};
   }
 }

 addRecipe.onclick=()=>{recipes.push({filament:'',parts:'',grouped_stl:'',separate_stls:'',part_count:1,weight_g:0});drawRecipes();drawReview()};
 form.querySelectorAll('input,textarea,select').forEach(el=>el.addEventListener('input',drawReview));
 shopifyBridge.addEventListener('change',()=>{
   s.siteSettings.shopifyBridgeUrl=shopifyBridge.value.trim();save(s);drawReview();
 });

 createBtn.onclick=async()=>{
   const d=payload(),errors=validate(d);
   if(errors.length){status.innerHTML=badge(errors[0],'danger');return}
   createBtn.disabled=true;
   status.innerHTML=badge('Creating Pal in Forge…','warning');

   s.customData.products=s.customData.products.filter(x=>x.sku!==d.product.sku);
   s.customData.products.push(d.product);
   s.customData.recipes=s.customData.recipes.filter(x=>x.sku!==d.product.sku).concat(d.recipes);
   if(d.insertFile)s.customData.insert_files[d.product.sku]=d.insertFile;
   s.productAvailability[d.product.sku]={on_sale:d.onSale,release_date:d.releaseDate};
   s.shopifyProducts[d.product.sku]={status:'pending',created_at:new Date().toISOString(),payload:d.shopify};
   s.siteSettings.shopifyBridgeUrl=shopifyBridge.value.trim();
   save(s);

   status.innerHTML=badge('Forge created · sending Shopify…','warning');
   const result=await sendShopify(d);
   if(result.ok){
     s.shopifyProducts[d.product.sku]={
       ...s.shopifyProducts[d.product.sku],
       status:'created',
       shopify_product_id:result.body.productId||result.body.product_id||result.body.id||'',
       shopify_variant_id:result.body.variantId||result.body.variant_id||'',
       response:result.body
     };
     save(s);
     status.innerHTML=`${badge('PAL CREATED','ok')} <span class="small">Forge setup complete and Shopify product created as Draft.</span>`;
     shopifyStatus.innerHTML=badge('Shopify Draft Created','ok');
   }else{
     save(s);
     status.innerHTML=`${badge('FORGE CREATED','ok')} <span class="small">${esc(result.message)}</span>`;
     shopifyStatus.innerHTML=badge('Shopify Pending','warning');
   }

   existingProducts.push(d.product);
   skuEl.value=nextPalSku(existingProducts);
   createBtn.disabled=false;
 };
 drawRecipes();drawReview();
}


async function cloudMigrationPanel(){
 const s=state();
 const apiInput=document.querySelector('#cloudApiUrl');
 const healthEl=document.querySelector('#cloudHealthStatus');
 const summaryEl=document.querySelector('#cloudMigrationSummary');
 const migrateBtn=document.querySelector('#migrateForgeCloud');
 const verifyBtn=document.querySelector('#verifyForgeCloud');
 const localCountEl=document.querySelector('#cloudLocalProducts');
 const cloudCountEl=document.querySelector('#cloudRemoteProducts');

 if(!apiInput||!migrateBtn)return;

 apiInput.value=s.siteSettings?.forgeApiUrl||'https://pla-forge-api.plapalsuk.workers.dev';

 function apiBase(){
   return String(apiInput.value||'').trim().replace(/\/+$/,'');
 }
 function setSummary(html){if(summaryEl)summaryEl.innerHTML=html}
 function setHealth(text,cls='info'){if(healthEl)healthEl.innerHTML=badge(text,cls)}

 async function localPayload(){
   const products=await load('products');
   const recipes=await load('recipes');
   const insertFiles=await load('insert_files');
   return {products,recipes,insert_files:insertFiles,state:s};
 }

 async function checkHealth(){
   const base=apiBase();
   if(!base){setHealth('API URL Missing','danger');return false}
   try{
     const res=await fetch(base+'/health',{method:'GET'});
     const data=await res.json();
     if(!res.ok||!data.success)throw new Error(data.error||`HTTP ${res.status}`);
     setHealth(`Connected · Schema ${data.schema_version||'?'}`,'ok');
     return true;
   }catch(e){
     setHealth('Connection Failed','danger');
     setSummary(`<div class="cloud-error">${esc(e.message)}</div>`);
     return false;
   }
 }

 async function verify(){
   const payload=await localPayload();
   localCountEl.textContent=payload.products.length;
   try{
     const data=await cloudFetch('/products',{method:'GET'});
     const remote=Number(data.count||0);
     cloudCountEl.textContent=remote;
     const ok=remote===payload.products.length;
     setSummary(ok
       ?`${badge('VERIFIED','ok')} <span class="small">Cloud products match Forge: ${remote} / ${payload.products.length}.</span>`
       :`${badge('CHECK REQUIRED','warning')} <span class="small">Cloud has ${remote} products; local Forge has ${payload.products.length}.</span>`);
     return ok;
   }catch(e){
     cloudCountEl.textContent='—';
     setSummary(`${badge('VERIFY FAILED','danger')} <span class="small">${esc(e.message)}</span>`);
     return false;
   }
 }

 apiInput.onchange=()=>{
   s.siteSettings.forgeApiUrl=apiBase();
   save(s);
   checkHealth();
 };

 migrateBtn.onclick=async()=>{
   migrateBtn.disabled=true;
   verifyBtn.disabled=true;
   setSummary(`${badge('PREPARING','warning')} <span class="small">Collecting current Forge data…</span>`);

   try{
     const healthy=await checkHealth();
     if(!healthy)throw new Error('Cloud API health check failed.');

     const payload=await localPayload();
     localCountEl.textContent=payload.products.length;

     const confirmed=confirm(
       `Copy current PLA Forge data to Cloudflare D1?\n\n`+
       `${payload.products.length} products\n`+
       `${payload.recipes.length} recipe rows\n\n`+
       `This is COPY ONLY. Your current browser data will not be deleted.`
     );
     if(!confirmed){
       setSummary(`${badge('CANCELLED','info')} <span class="small">No data was changed.</span>`);
       return;
     }

     setSummary(`${badge('MIGRATING','warning')} <span class="small">Uploading Forge data to Cloudflare…</span>`);

     const data=await cloudFetch('/migration/import',{
       method:'POST',
       headers:{'Content-Type':'application/json'},
       body:JSON.stringify(payload)
     });

     const imported=data.imported||{};
     setSummary(`
       <div class="cloud-success-head">${badge('MIGRATION COMPLETE','ok')}<strong>Copied to Cloudflare D1</strong></div>
       <div class="cloud-result-grid">
        <div><span>Products</span><strong>${Number(imported.products||0)}</strong></div>
        <div><span>Recipes</span><strong>${Number(imported.recipes||0)}</strong></div>
        <div><span>Filaments</span><strong>${Number(imported.filaments||0)}</strong></div>
        <div><span>Insert Files</span><strong>${Number(imported.insert_files||0)}</strong></div>
       </div>
       <div class="small">Verifying cloud product count now…</div>
     `);

     await verify();
   }catch(e){
     setSummary(`${badge('MIGRATION FAILED','danger')} <span class="small">${esc(e.message)}</span>`);
   }finally{
     migrateBtn.disabled=false;
     verifyBtn.disabled=false;
   }
 };

 verifyBtn.onclick=async()=>{
   verifyBtn.disabled=true;
   await verify();
   verifyBtn.disabled=false;
 };

 const payload=await localPayload();
 localCountEl.textContent=payload.products.length;
 await checkHealth();
 await verify();
}


async function cloudAuthPanel(){
 const status=document.querySelector('#cloudAuthStatus');
 const pass=document.querySelector('#cloudPassword');
 const loginBtn=document.querySelector('#cloudLoginBtn');
 const logoutBtn=document.querySelector('#cloudLogoutBtn');
 const user=currentForgeUser();
 if(pass)pass.closest('.form-field').style.display='none';
 if(loginBtn)loginBtn.style.display='none';
 if(logoutBtn){logoutBtn.style.display='inline-flex';logoutBtn.onclick=forgeLogout}
 if(status)status.innerHTML=user?badge(`${user.name||user.email} · ${user.role}`,'ok'):badge('Authenticated','ok');
}


async function cloudCoreStatusPanel(){
 const badgeEl=document.querySelector('#cloudCoreModeBadge');
 if(!badgeEl)return;
 const msg=document.querySelector('#cloudCoreMessage');
 if(!cloudToken()){
   badgeEl.innerHTML=badge('LOCAL FALLBACK','warning');
   msg.textContent='Log in to Cloud Forge to activate Cloud Core reads and writes.';
   return;
 }
 try{
   const d=await cloudFetch('/core');
   document.querySelector('#cloudCoreProducts').textContent=(d.products||[]).length;
   document.querySelector('#cloudCoreRecipes').textContent=(d.recipes||[]).length;
   document.querySelector('#cloudCoreFilaments').textContent=(d.filaments||[]).length;
   document.querySelector('#cloudCoreTargets').textContent=(d.targets||[]).length;
   badgeEl.innerHTML=badge('CLOUD CORE LIVE','ok');
   msg.textContent='Core catalogue and configuration are reading from Cloudflare D1.';
 }catch(e){
   badgeEl.innerHTML=badge('LOCAL FALLBACK','warning');
   msg.textContent='Cloud Core unavailable: '+e.message;
 }
}


async function forgeLoginPage(){
 const email=document.querySelector('#loginEmail');
 const pass=document.querySelector('#loginPassword');
 const btn=document.querySelector('#loginBtn');
 const status=document.querySelector('#loginStatus');
 if(cloudToken()){
   try{
     const me=await cloudFetch('/auth/me');
     setForgeUser(me.user||me);
     const r=new URLSearchParams(location.search).get('return');
     const target=r?decodeURIComponent(r):roleHomePage((me.user||me).role);
     location.replace(target);
     return;
   }catch{setCloudToken('');setForgeUser(null)}
 }
 btn.onclick=async()=>{
   const e=String(email.value||'').trim(),p=String(pass.value||'');
   if(!e||!p){status.innerHTML=badge('Enter email and password','warning');return}
   btn.disabled=true;status.innerHTML=badge('Signing in…','warning');
   try{
     const res=await fetch(cloudApiBase()+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:e,password:p})});
     const data=await res.json().catch(()=>({}));
     if(!res.ok||!data.success)throw new Error(data.error||'Login failed');
     setCloudToken(data.token);setForgeUser(data.user);
     const r=new URLSearchParams(location.search).get('return');
     let target=r?decodeURIComponent(r):roleHomePage(data.user?.role);
     try{
       const page=new URL(target,location.href).pathname.split('/').pop()||'index.html';
       if(!roleCanOpen(data.user?.role,page))target=roleHomePage(data.user?.role);
     }catch{
       target=roleHomePage(data.user?.role);
     }
     location.replace(target);
   }catch(err){status.innerHTML=badge(err.message,'danger');btn.disabled=false}
 };
 pass.addEventListener('keydown',e=>{if(e.key==='Enter')btn.click()});
}
async function employeeAdminPage(){
 const user=currentForgeUser();
 if(!user||user.role!=='admin')return;
 const host=document.querySelector('#employeeAdmin');
 if(!host)return;
 async function loadUsers(){
   const d=await cloudFetch('/users');
   const rows=d.users||[];
   host.innerHTML=`<div class="section-title"><div><h2>Employee Accounts</h2><div class="small">Create employees and control which parts of Forge they can access.</div></div><button class="btn" id="addEmployee">+ Add Employee</button></div>
   <div class="employee-role-help">
    <div><strong>Admin</strong><span>Everything, including employees and product availability.</span></div>
    <div><strong>Packing</strong><span>Packing Station only.</span></div>
    <div><strong>Retail Staff</strong><span>Awaiting Cornwall Delivery plus Cornwall Box and Insert rework.</span></div>
   </div>
   <div class="employee-list">${rows.map(x=>`<div class="employee-row">
      <div><strong>${esc(x.name||x.email)}</strong><div class="small">${esc(x.email)}</div></div>
      <select class="empRole" data-id="${x.id}"><option value="admin" ${x.role==='admin'?'selected':''}>Admin</option><option value="packing" ${x.role==='packing'?'selected':''}>Packing</option><option value="retail_staff" ${x.role==='retail_staff'?'selected':''}>Retail Staff</option></select>
      <label class="empActive"><input type="checkbox" data-id="${x.id}" ${Number(x.active)===1?'checked':''}> Active</label>
      <button class="btn ghost resetEmpPassword" data-id="${x.id}">Reset Password</button>
   </div>`).join('')}</div>`;
   host.querySelector('#addEmployee').onclick=()=>showCreate();
   host.querySelectorAll('.empRole').forEach(el=>el.onchange=async()=>{await cloudFetch('/users/'+encodeURIComponent(el.dataset.id),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({role:el.value})});await loadUsers()});
   host.querySelectorAll('.empActive input').forEach(el=>el.onchange=async()=>{await cloudFetch('/users/'+encodeURIComponent(el.dataset.id),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({active:el.checked})});await loadUsers()});
   host.querySelectorAll('.resetEmpPassword').forEach(el=>el.onclick=async()=>{const pw=prompt('Enter a new password (minimum 8 characters):');if(!pw)return;await cloudFetch('/users/'+encodeURIComponent(el.dataset.id),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:pw})});alert('Password updated.')});
 }
 function showCreate(){
   const name=prompt('Employee name:');if(name===null)return;
   const email=prompt('Employee email:');if(!email)return;
   const password=prompt('Temporary password (minimum 8 characters):');if(!password)return;
   const role=prompt('Role: admin, packing or retail_staff','packing');if(!role)return;
   cloudFetch('/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,email,password,role})})
     .then(loadUsers).catch(e=>alert(e.message));
 }
 await loadUsers();
}


(function(){
 const page=(location.pathname.split('/').pop()||'index.html').replace('.html','').replace(/[^a-z0-9_-]/gi,'-');
 document.body.classList.add('forge-page-'+page);
})();

document.addEventListener('visibilitychange',async()=>{
 if(!document.hidden && ['production.html','plates.html','parts.html','assembly.html','pals.html','packing-station.html','packaging.html','availability.html','settings.html','consumables.html'].includes(forgeCurrentPage())){
   const stamp=await forgeCloudStamp();
   if(stamp && forgeLastCloudStamp && stamp!==forgeLastCloudStamp){
     // interval will pick this up immediately on its next tick
     forgeLastCloudStamp=null;
   }
 }
});
