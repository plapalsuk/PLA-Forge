
const STORE='plaForgeV02';

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
  s.consumableHistory=s.consumableHistory||[];
  s.packingJobs=s.packingJobs||{}; s.packingHistory=s.packingHistory||[];
  s.finishedStock=s.finishedStock||{boat:{},cornwall:{}}; s.transfers=s.transfers||[]; s.awaitingDispatch=s.awaitingDispatch||[];
  s.awaitingDispatch=s.awaitingDispatch||[];
  if(s.consumables && s.consumables.barcode_labels) delete s.consumables.barcode_labels;
  s.printerRoles=s.printerRoles||{};

  s.productAvailability=s.productAvailability||{};
  return s;
}
function save(s){localStorage.setItem(STORE,JSON.stringify(s))}
async function load(name){return (await fetch('data/'+name+'.json')).json()}
function badge(txt, cls='info'){return `<span class="badge ${cls}">${txt}</span>`}
function targetKey(sku,loc){return `${sku}:${loc}`}
function getTarget(s,sku,loc){return Number(s.targets[targetKey(sku,loc)]||0)}
function stock(s,sku,loc){return Number((s.stock[sku]||{})[loc]||0)}
function needed(s,sku,loc){return Math.max(0,getTarget(s,sku,loc)-stock(s,sku,loc))}
function totalNeed(s,sku){return needed(s,sku,'boat')+needed(s,sku,'cornwall')}
function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function groupKey(r){return `group|${r.sku}|${r.filament}|${r.grouped_stl}`}
function recoveryKey(sku,file){return `recovery|${sku}|${file}`}
function partQty(s,key){return Number(s.parts[key]||0)}
function activePlateQty(s,key){return (s.plates||[]).filter(p=>!['complete','cancelled'].includes(p.status)).reduce((sum,p)=>sum+(p.items||[]).filter(i=>i.inventory_key===key).reduce((a,i)=>a+Number(i.qty||0),0),0)}
function statusLabel(st){const m={draft:['Draft','info'],printing:['Printing','warning'],complete:['Complete','ok'],cancelled:['Cancelled','danger']};const x=m[st]||[st,'info'];return badge(x[0],x[1])}
function fmtDate(v){if(!v)return '—';try{return new Date(v).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}catch(e){return v}}
function makeId(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7)}

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
 const s=state(), ps=await load('products'); let items=ps.filter(x=>type==='sticker'?x.type==='sticker':x.type==='pal'&&(type==='pal'||x.keyring));
 const tbody=document.querySelector('#rows'), q=document.querySelector('#q');
 function draw(){const text=(q.value||'').toLowerCase(),shown=items.filter(x=>`${x.sku} ${x.name}`.toLowerCase().includes(text)).sort((a,b)=>Number(isOnSale(s,b.sku))-Number(isOnSale(s,a.sku))||a.name.localeCompare(b.name));
 tbody.innerHTML=shown.map(x=>{const b=stock(s,x.sku,'boat'),c=stock(s,x.sku,'cornwall'),bt=getTarget(s,x.sku,'boat'),ct=getTarget(s,x.sku,'cornwall'),need=needed(s,x.sku,'boat')+needed(s,x.sku,'cornwall'),sale=isOnSale(s,x.sku);
 return `<tr class="${sale?'on-sale-row':''}"><td><div class="product-name">${esc(x.name)}</div><span class="sku">${x.sku}</span></td><td>${sale?badge('ON SALE','ok'):badge('NOT ON SALE','')}</td><td>${x.recipe_ready?badge('Recipe ready','ok'):badge('No recipe','warning')}</td><td>${b}</td><td><input class="number t" data-sku="${x.sku}" data-loc="boat" type="number" min="0" value="${bt}"></td><td>${c}</td><td><input class="number t" data-sku="${x.sku}" data-loc="cornwall" type="number" min="0" value="${ct}"></td><td><strong>${need}</strong></td></tr>`}).join('');
 document.querySelectorAll('.t').forEach(el=>el.onchange=()=>{s.targets[targetKey(el.dataset.sku,el.dataset.loc)]=Number(el.value||0);save(s);draw()})}
 q.oninput=draw;draw()
}
async function recipes(){
 const ps=await load('products'),rs=await load('recipes'),q=document.querySelector('#q'),box=document.querySelector('#cards');
 function draw(){const text=(q.value||'').toLowerCase(),filtered=ps.filter(p=>p.type==='pal'&&`${p.sku} ${p.name} ${(p.filaments||[]).join(' ')}`.toLowerCase().includes(text));
 box.innerHTML=filtered.map(p=>{const rr=rs.filter(r=>r.sku===p.sku);return `<div class="card recipe-card"><h3>${esc(p.name)}</h3><span class="sku">${p.sku}</span><div class="small">${rr.length} colour group(s) · ${p.recipe_weight_g||0}g total</div>${rr.map(r=>`<div class="listitem" style="margin-top:9px"><div class="colour">${esc(r.filament)}</div><strong>${esc(r.parts)}</strong><div>${r.weight_g}g · ${r.part_count} part(s)</div><code>${esc(r.grouped_stl)}</code></div>`).join('')||'<div class="listitem" style="margin-top:9px">No recipe entered yet.</div>'}</div>`}).join('')}
 q.oninput=draw;draw()
}
async function production(){
 const s=state(),ps=await load('products'),rs=await load('recipes'),body=document.querySelector('#prod'),rows=[];
 ps.filter(p=>p.type==='pal').forEach(p=>{const n=totalNeed(s,p.sku);if(n>0)rows.push({p,n,groups:rs.filter(r=>r.sku===p.sku)})});rows.sort((a,b)=>b.n-a.n);
 body.innerHTML=rows.map(x=>`<tr><td><strong>${esc(x.p.name)}</strong><br><span class="sku">${x.p.sku}</span></td><td>${x.n}</td><td>${x.groups.length}</td><td>${(x.groups.reduce((a,r)=>a+r.weight_g,0)*x.n).toFixed(1)}g</td><td>${x.groups.map(r=>esc(r.filament)).join(', ')}</td></tr>`).join('')||'<tr><td colspan="5">Set inventory targets first to create production demand.</td></tr>';
}
async function dataHealth(){
 const ps=await load('products'),mm=await load('mismatches'),body=document.querySelector('#health'),missing=ps.filter(p=>p.type==='pal'&&!p.recipe_ready);
 const rows=[...mm.map(x=>({level:'warning',issue:'Recipe SKU remapped',item:x.recipe,detail:`${x.stated_sku} → ${x.resolved_sku}`})),...missing.map(x=>({level:'danger',issue:'Missing recipe',item:x.name,detail:x.sku}))];
 body.innerHTML=rows.map(x=>`<tr><td>${badge(x.issue,x.level)}</td><td>${esc(x.item)}</td><td>${esc(x.detail)}</td></tr>`).join('')||'<tr><td colspan="3">No data issues detected.</td></tr>';
}
async function filament(){
 const s=state(),rs=await load('recipes'),body=document.querySelector('#fil'),colours=[...new Set(rs.map(r=>r.filament).filter(Boolean))].sort();
 colours.forEach(c=>{if(!s.filament[c])s.filament[c]={grams:0,reorder:250}});save(s);
 function draw(){body.innerHTML=colours.map(c=>{const x=s.filament[c],low=Number(x.grams)<=Number(x.reorder);return `<tr><td><strong>${esc(c)}</strong></td><td><input class="number fg" data-c="${esc(c)}" data-k="grams" type="number" min="0" value="${x.grams}"></td><td><input class="number fg" data-c="${esc(c)}" data-k="reorder" type="number" min="0" value="${x.reorder}"></td><td>${low?badge('Order','danger'):badge('OK','ok')}</td></tr>`}).join('');document.querySelectorAll('.fg').forEach(el=>el.onchange=()=>{s.filament[el.dataset.c][el.dataset.k]=Number(el.value||0);save(s);draw()})}draw()
}

async function buildPlatePlanner(){
 const s=state();
 const ps=await load('products');
 const rs=await load('recipes');
 const pals=Object.fromEntries(ps.filter(p=>p.type==='pal').map(p=>[p.sku,p]));
 const colours=[...new Set(rs.map(r=>String(r.filament||'').trim()).filter(Boolean))].sort();

 const colourEl=document.querySelector('#plateColour');
 const printerEl=document.querySelector('#platePrinter');
 const nameEl=document.querySelector('#plateName');
 const checklist=document.querySelector('#plateChecklist');
 const current=document.querySelector('#currentPlateItems');
 const platesList=document.querySelector('#platesList');
 const currentTotal=document.querySelector('#currentPlateTotal');
 const demandKpi=document.querySelector('#demandKpi');
 const plannedKpi=document.querySelector('#plannedKpi');
 const printingKpi=document.querySelector('#printingKpi');
 const completedKpi=document.querySelector('#completedKpi');
 const colourDemandCards=document.querySelector('#colourDemandCards');
 const colourDemandEmpty=document.querySelector('#colourDemandEmpty');

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
 function demandFor(r){return totalNeed(s,r.sku)}
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
   const rows=rowData();
   checklist.innerHTML=rows.length?rows.map((x,idx)=>`<tr class="${x.remain===0?'dimrow':''}">
     <td><strong>${esc(x.p.name)}</strong><br><span class="sku">${x.r.sku}</span></td>
     <td>${esc(x.r.parts)}</td>
     <td>${Number(x.r.weight_g||0).toFixed(2).replace(/\.00$/,'')}g</td>
     <td>${x.demand}</td><td>${x.inv}</td><td>${x.allocated}</td><td><strong>${x.remain}</strong></td>
     <td><input class="number addqty" id="qty-${idx}" min="1" type="number" value="${Math.max(1,Math.min(x.remain||1,5))}"></td>
     <td><button class="btn secondary addgroup" data-row="${idx}">Add</button></td>
     <td><button class="btn ghost addextra" data-row="${idx}">+ Extra</button></td>
     <td>${x.recoveryFiles.length?`<button class="btn ghost exactpart" data-row="${idx}">Exact Part</button>`:'<span class="small muted">—</span>'}</td>
   </tr>${x.recoveryFiles.length?`<tr class="exact-row" id="exact-${idx}" style="display:none"><td colspan="11"><div class="exact-part-panel">
       <div><strong>${esc(x.p.name)} — exact part</strong><div class="small">${esc(String(x.r.filament||'').trim())}</div></div>
       <select id="exact-file-${idx}" class="select">${x.recoveryFiles.map(f=>`<option value="${esc(f)}">${esc(f)}</option>`).join('')}</select>
       <label class="small">Qty <input id="exact-qty-${idx}" class="number" type="number" min="1" value="1"></label>
       <button class="btn addexact" data-row="${idx}">Add Exact Part</button>
     </div></td></tr>`:''}`).join(''):`<tr><td colspan="11" class="muted" style="padding:24px">No recipe rows found for ${esc(plateDraft.colour)}.</td></tr>`;

   document.querySelectorAll('.addgroup').forEach(btn=>btn.onclick=()=>{
     const idx=Number(btn.dataset.row),x=rows[idx];
     const qty=Math.max(1,Number(document.querySelector('#qty-'+idx)?.value||1));
     addGrouped(x,qty,'group'); drawAll();
   });
   document.querySelectorAll('.addextra').forEach(btn=>btn.onclick=()=>{
     const x=rows[Number(btn.dataset.row)]; addGrouped(x,1,'extra'); drawAll();
   });
   document.querySelectorAll('.exactpart').forEach(btn=>btn.onclick=()=>{
     const row=document.querySelector('#exact-'+btn.dataset.row);
     if(row) row.style.display=row.style.display==='none'?'table-row':'none';
   });
   document.querySelectorAll('.addexact').forEach(btn=>btn.onclick=()=>{
     const idx=Number(btn.dataset.row),x=rows[idx];
     const file=document.querySelector('#exact-file-'+idx)?.value;
     const qty=Math.max(1,Number(document.querySelector('#exact-qty-'+idx)?.value||1));
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
   completedKpi.textContent=s.plates.filter(p=>p.status==='complete').length;
 }
 function plateSummary(p){const g=(p.items||[]).reduce((a,i)=>a+Number(i.weight_each||0)*Number(i.qty||0),0);return `${(p.items||[]).reduce((a,i)=>a+Number(i.qty||0),0)} set(s) · ${g.toFixed(1)}g`}
 function drawPlates(){
   const items=[...s.plates].sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||''));
   platesList.innerHTML=items.length?items.map(p=>`<div class="saved-plate"><div class="saved-plate-main"><div><strong>${esc(p.code)} · ${esc(p.name||p.colour)}</strong><div class="small">${esc(p.colour)} · ${esc(printerLabel(p.printer))} · ${plateSummary(p)}</div></div><div>${statusLabel(p.status)}</div></div><div class="saved-plate-items">${(p.items||[]).map(i=>`<span>${esc(i.product_name)} ×${i.qty}</span>`).join('')}</div><div class="plate-actions">${p.status==='draft'?`<button class="btn secondary loadplate" data-id="${p.id}">Edit</button><button class="btn startplate" data-id="${p.id}">Start Print</button>`:''}${p.status==='printing'?`<button class="btn completeplate" data-id="${p.id}">Complete Print</button>`:''}${p.status!=='complete'?`<button class="btn ghost cancelplate" data-id="${p.id}">Cancel</button>`:''}${p.status==='complete'?`<span class="small">Completed ${fmtDate(p.completed_at)}</span>`:''}</div><div class="completion-panel" id="complete-${p.id}"></div></div>`).join(''):'<div class="empty-state">No build plates yet.</div>';
   document.querySelectorAll('.loadplate').forEach(b=>b.onclick=()=>{const p=s.plates.find(x=>x.id===b.dataset.id);if(!p)return;plateDraft=JSON.parse(JSON.stringify(p));s.plates=s.plates.filter(x=>x.id!==p.id);save(s);colourEl.value=plateDraft.colour;printerEl.value=plateDraft.printer||'';nameEl.value=plateDraft.name||'';drawAll()});
   document.querySelectorAll('.startplate').forEach(b=>b.onclick=()=>{const p=s.plates.find(x=>x.id===b.dataset.id);if(p){p.status='printing';p.started_at=new Date().toISOString();save(s);drawAll()}});
   document.querySelectorAll('.cancelplate').forEach(b=>b.onclick=()=>{const p=s.plates.find(x=>x.id===b.dataset.id);if(p){p.status='cancelled';save(s);drawAll()}});
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

   panel.querySelector('.confirmcomplete').onclick=()=>confirmCompletion(id,panel);
 }

 function confirmCompletion(id,panel){
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

   p.status='complete';
   p.completed_at=new Date().toISOString();
   p.result=results;
   s.printHistory.push({
     plate_id:p.id,plate_code:p.code,completed_at:p.completed_at,
     items:p.items,result:results
   });
   save(s);
   drawAll();
 }
 function saveDraft(startNow){
   if(!plateDraft.items.length){alert('Add at least one print item to the plate.');return}
   const code=plateDraft.code||`PLATE-${String(s.plateSeq).padStart(4,'0')}`;if(!plateDraft.code)s.plateSeq++;
   const p={...plateDraft,id:plateDraft.id||makeId(),code,status:startNow?'printing':'draft',created_at:plateDraft.created_at||new Date().toISOString()};if(startNow)p.started_at=new Date().toISOString();
   s.plates.push(JSON.parse(JSON.stringify(p)));save(s);plateDraft={id:null,colour:colourEl.value,printer:printerEl.value,name:'',items:[]};nameEl.value='';drawAll();
 }
 function drawAll(){plateDraft.colour=String(colourEl.value||plateDraft.colour||'').trim();plateDraft.printer=printerEl.value||'';plateDraft.name=nameEl.value||'';drawColourDemand();drawChecklist();drawCurrent();drawPlates();drawKpis()}
 colourEl.onchange=()=>{plateDraft.colour=String(colourEl.value||'').trim();plateDraft.items=[];drawAll()};
 printerEl.onchange=()=>{plateDraft.printer=printerEl.value||''};
 nameEl.oninput=()=>{plateDraft.name=nameEl.value||''};
 document.querySelector('#savePlate').onclick=()=>saveDraft(false);
 document.querySelector('#startPlate').onclick=()=>saveDraft(true);
 drawAll();
}

async function printedParts(){
 const s=state(),ps=await load('products'),rs=await load('recipes'),pals=Object.fromEntries(ps.filter(p=>p.type==='pal').map(p=>[p.sku,p])),q=document.querySelector('#q'),body=document.querySelector('#partsRows'),failures=document.querySelector('#failedRows');
 function draw(){const text=(q.value||'').toLowerCase(),rows=[];rs.forEach(r=>{const qty=partQty(s,groupKey(r));if(qty>0)rows.push({kind:'Grouped set',sku:r.sku,name:(pals[r.sku]||{}).name||r.name||r.animal,filament:r.filament,label:r.parts,qty,key:groupKey(r)})});
 Object.entries(s.parts).filter(([k,v])=>k.startsWith('recovery|')&&Number(v)>0).forEach(([k,v])=>{const bits=k.split('|'),sku=bits[1],file=bits.slice(2).join('|'),r=rs.find(x=>x.sku===sku&&(x.separate_stls||'').includes(file));rows.push({kind:'Recovery part',sku,name:(pals[sku]||{}).name||sku,filament:r?.filament||'',label:file,qty:Number(v),key:k})});
 const shown=rows.filter(x=>`${x.name} ${x.sku} ${x.filament} ${x.label}`.toLowerCase().includes(text));body.innerHTML=shown.length?shown.map(x=>`<tr><td><strong>${esc(x.name)}</strong><br><span class="sku">${x.sku}</span></td><td>${badge(x.kind,x.kind==='Grouped set'?'ok':'info')}</td><td>${esc(x.filament)}</td><td>${esc(x.label)}</td><td><strong>${x.qty}</strong></td><td><button class="iconbtn adjust" data-key="${esc(x.key)}" data-d="-1">−</button> <button class="iconbtn adjust" data-key="${esc(x.key)}" data-d="1">+</button></td></tr>`).join(''):`<tr><td colspan="6">No printed-part inventory yet. Complete a build plate to add stock.</td></tr>`;
 document.querySelectorAll('.adjust').forEach(b=>b.onclick=()=>{s.parts[b.dataset.key]=Math.max(0,partQty(s,b.dataset.key)+Number(b.dataset.d));save(s);draw()});failures.innerHTML=s.failedParts.slice().reverse().slice(0,20).map(x=>`<tr><td>${esc(x.plate_code)}</td><td>${esc(x.product_name)}</td><td>${esc(x.filament)}</td><td>${esc(x.label)}</td><td>${x.qty}</td><td>${fmtDate(x.created_at)}</td></tr>`).join('')||'<tr><td colspan="6">No failed parts recorded.</td></tr>'}
 q.oninput=draw;draw()
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
 const s=state();
 const ps=await load('products');
 const rs=await load('recipes');
 const pals=ps.filter(p=>p.type==='pal');

 const q=document.querySelector('#q');
 const readyBox=document.querySelector('#assemblyReady');
 const awaitingBox=document.querySelector('#assemblyAwaiting');
 const history=document.querySelector('#assemblyHistory');
 const kpiReady=document.querySelector('#assemblyReadyKpi');
 const kpiAssembled=document.querySelector('#assembledKpi');
 const kpiWaiting=document.querySelector('#assemblyWaitingKpi');
 const readySectionCount=document.querySelector('#readySectionCount');
 const awaitingSectionCount=document.querySelector('#awaitingSectionCount');

 function recipeGroups(sku){return rs.filter(r=>r.sku===sku)}
 function assembledQty(sku){return Number(s.assembled?.[sku]||0)}
 function plannerNeed(sku){return totalNeed(s,sku)}
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

   // READY: physically possible to assemble, regardless of planner need.
   const ready=all
     .filter(x=>x.ready>0)
     .sort((a,b)=>b.remainingNeed-a.remainingNeed || b.ready-a.ready || a.p.name.localeCompare(b.p.name));

   // AWAITING: only if planner still needs more AND no complete Pal can currently be assembled.
   const awaiting=all
     .filter(x=>x.remainingNeed>0 && x.ready<=0)
     .sort((a,b)=>b.remainingNeed-a.remainingNeed || a.p.name.localeCompare(b.p.name));

   const totalReady=ready.reduce((a,x)=>a+x.ready,0);
   kpiReady.textContent=totalReady;
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

   document.querySelectorAll('.assembleBtn').forEach(btn=>btn.onclick=()=>{
     const sku=btn.dataset.sku;
     const p=pals.find(x=>x.sku===sku);
     const available=readyQty(p);
     const stillNeeded=remainingAssemblyNeed(sku);
     const maxQty=Math.max(1,Math.min(available,stillNeeded>0?stillNeeded:available));
     const qty=Math.max(1,Math.min(maxQty,Number(document.querySelector('#assemble-'+sku)?.value||1)));
     if(!available||qty>available)return;

     recipeGroups(sku).forEach(r=>{
       const key=groupKey(r);
       s.parts[key]=Math.max(0,partQty(s,key)-qty);
     });

     s.assembled[sku]=Number(s.assembled[sku]||0)+qty;
     s.assemblyHistory.push({
       id:makeId(),sku,name:p.name,qty,
       production_need_before:stillNeeded,
       production_need_after:Math.max(0,stillNeeded-qty),
       created_at:new Date().toISOString()
     });
     save(s);
     render();
   });

   history.innerHTML=(s.assemblyHistory||[]).slice().reverse().slice(0,30).map(h=>`
     <tr>
       <td>${fmtDate(h.created_at)}</td>
       <td><strong>${esc(h.name)}</strong><br><span class="sku">${h.sku}</span></td>
       <td>${h.qty}</td>
     </tr>`).join('')||'<tr><td colspan="3">No Pals assembled yet.</td></tr>';
 }

 q.oninput=render;
 render();
}


async function insertProductionPage(){
 const s=state(), ps=await load('products'), files=await load('insert_files');
 const pals=ps.filter(p=>p.type==='pal' && isOnSale(s,p.sku));
 const q=document.querySelector('#q');
 const printCards=document.querySelector('#insertPrintCards');
 const cutCards=document.querySelector('#insertCutCards');
 const inventory=document.querySelector('#insertInventory');
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
   return Math.max(0,target()-Number(r.ready||0)-Number(r.awaiting_cut||0));
 }
 function renderPrintCard(x){
   return `<div class="insert-job-card print-job">
     <div class="assembly-card-head">
       <div><strong>${esc(x.p.name)}</strong><div class="sku">${x.p.sku}</div></div>
       ${x.r.ready<4?badge('URGENT','danger'):badge(`PRINT ${x.need}`,'warning')}
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

   inventory.innerHTML=data
     .sort((a,b)=>a.p.name.localeCompare(b.p.name))
     .map(x=>`<tr>
       <td><strong>${esc(x.p.name)}</strong><br><span class="sku">${x.p.sku}</span></td>
       <td><strong>${Number(x.r.ready||0)}</strong></td>
     </tr>`).join('')||'<tr><td colspan="2">No On Sale Pals.</td></tr>';

   document.querySelectorAll('.markPrinted').forEach(btn=>btn.onclick=()=>{
     const sku=btn.dataset.sku, p=pals.find(x=>x.sku===sku), r=rec(sku);
     const qty=Math.max(1,Number(document.querySelector('#printed-'+sku)?.value||1));
     r.awaiting_cut=Number(r.awaiting_cut||0)+qty;
     save(s);render();
   });

   document.querySelectorAll('.completeCut').forEach(btn=>btn.onclick=()=>{
     const sku=btn.dataset.sku, r=rec(sku);
     const available=Number(r.awaiting_cut||0);
     const qty=Math.max(1,Math.min(available,Number(document.querySelector('#cut-'+sku)?.value||1)));
     if(available<=0)return;
     r.awaiting_cut=available-qty;
     r.ready=Number(r.ready||0)+qty;
     save(s);render();
   });
 }
 q.oninput=render;
 render();
}

async function availabilityPage(){
 const s=state(),ps=await load('products'),pals=ps.filter(p=>p.type==='pal');
 const q=document.querySelector('#q'),filter=document.querySelector('#availabilityFilter'),list=document.querySelector('#availabilityList');
 const saleKpi=document.querySelector('#onSaleKpi'),futureKpi=document.querySelector('#futureKpi'),offKpi=document.querySelector('#offSaleKpi');
 function status(p){const r=s.productAvailability[p.sku]||{};if(r.on_sale)return'sale';if(r.release_date&&r.release_date>new Date().toISOString().slice(0,10))return'future';return'off'}
 function render(){
  const text=(q.value||'').toLowerCase(),mode=filter.value;
  const all=pals.map(p=>({p,rec:s.productAvailability[p.sku]||{},status:status(p)}));
  saleKpi.textContent=all.filter(x=>x.status==='sale').length;futureKpi.textContent=all.filter(x=>x.status==='future').length;offKpi.textContent=all.filter(x=>x.status==='off').length;
  const data=all.filter(x=>`${x.p.name} ${x.p.sku}`.toLowerCase().includes(text)).filter(x=>mode==='all'||x.status===mode).sort((a,b)=>(a.status==='sale'?-2:a.status==='future'?-1:0)-(b.status==='sale'?-2:b.status==='future'?-1:0)||a.p.name.localeCompare(b.p.name));
  list.innerHTML=data.map(x=>`<div class="availability-row"><div><strong>${esc(x.p.name)}</strong><div class="sku">${x.p.sku}</div></div><div>${x.status==='sale'?badge('ON SALE','ok'):x.status==='future'?badge('FUTURE RELEASE','warning'):badge('NOT ON SALE','')}</div><label><span class="small">Release Date</span><input class="releaseDate" data-sku="${x.p.sku}" type="date" value="${esc(x.rec.release_date||'')}"></label><button class="btn ${x.status==='sale'?'ghost':''} toggleSale" data-sku="${x.p.sku}">${x.status==='sale'?'Take Off Sale':'Put On Sale'}</button></div>`).join('')||'<div class="bench-empty">No Pals match this view.</div>';
  document.querySelectorAll('.toggleSale').forEach(btn=>btn.onclick=()=>{const sku=btn.dataset.sku,r=s.productAvailability[sku]||{};r.on_sale=!r.on_sale;if(r.on_sale&&!r.release_date)r.release_date=new Date().toISOString().slice(0,10);s.productAvailability[sku]=r;save(s);render()});
  document.querySelectorAll('.releaseDate').forEach(el=>el.onchange=()=>{const sku=el.dataset.sku,r=s.productAvailability[sku]||{};r.release_date=el.value;s.productAvailability[sku]=r;save(s);render()});
 }
 q.oninput=render;filter.onchange=render;render();
}


async function settingsAvailabilityPage(){
 const s=state(), ps=await load('products'), pals=ps.filter(p=>p.type==='pal');
 const q=document.querySelector('#settingsAvailabilitySearch');
 const filter=document.querySelector('#settingsAvailabilityFilter');
 const list=document.querySelector('#settingsAvailabilityList');
 const saleKpi=document.querySelector('#settingsOnSaleKpi');
 const futureKpi=document.querySelector('#settingsFutureKpi');
 const offKpi=document.querySelector('#settingsOffSaleKpi');

 if(!q || !filter || !list)return;

 function status(p){
   const rec=s.productAvailability[p.sku]||{};
   if(rec.on_sale)return 'sale';
   if(rec.release_date && rec.release_date>new Date().toISOString().slice(0,10))return 'future';
   return 'off';
 }

 function render(){
   const text=(q.value||'').toLowerCase();
   const mode=filter.value;
   const all=pals.map(p=>({p,rec:s.productAvailability[p.sku]||{},status:status(p)}));

   saleKpi.textContent=all.filter(x=>x.status==='sale').length;
   futureKpi.textContent=all.filter(x=>x.status==='future').length;
   offKpi.textContent=all.filter(x=>x.status==='off').length;

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
         <input class="settingsReleaseDate" data-sku="${x.p.sku}" type="date" value="${esc(x.rec.release_date||'')}">
       </label>
       <button class="btn ${x.status==='sale'?'ghost':''} settingsToggleSale" data-sku="${x.p.sku}">
         ${x.status==='sale'?'Take Off Sale':'Put On Sale'}
       </button>
     </div>`).join('') || '<div class="bench-empty">No Pals match this view.</div>';

   document.querySelectorAll('.settingsToggleSale').forEach(btn=>btn.onclick=()=>{
      const sku=btn.dataset.sku;
      const rec=s.productAvailability[sku]||{};
      rec.on_sale=!rec.on_sale;
      if(rec.on_sale && !rec.release_date)rec.release_date=new Date().toISOString().slice(0,10);
      s.productAvailability[sku]=rec;
      save(s);
      render();
   });

   document.querySelectorAll('.settingsReleaseDate').forEach(el=>el.onchange=()=>{
      const sku=el.dataset.sku;
      const rec=s.productAvailability[sku]||{};
      rec.release_date=el.value;
      s.productAvailability[sku]=rec;
      save(s);
      render();
   });
 }

 q.oninput=render;
 filter.onchange=render;
 render();
}

async function consumablesPage(){
 const s=state();
 const cards=document.querySelector('#consumableCards');
 const history=document.querySelector('#consumableHistory');
 const totalKpi=document.querySelector('#consumableTotalKpi');
 const lowKpi=document.querySelector('#consumableLowKpi');
 const okKpi=document.querySelector('#consumableOkKpi');

 const defaults={
   clear_boxes:{name:'Flat Clear Boxes',stock:0,reorder:25,unit:'boxes'},
   bottom_cards:{name:'Bottom Card Squares',stock:0,reorder:25,unit:'cards'},
   stickers:{name:'Stickers',stock:0,reorder:25,unit:'stickers'}
 };
 Object.entries(defaults).forEach(([k,v])=>s.consumables[k]=Object.assign({},v,s.consumables[k]||{}));
 save(s);

 function render(){
   const entries=Object.entries(s.consumables);
   const low=entries.filter(([k,x])=>Number(x.stock||0)<=Number(x.reorder||0));
   totalKpi.textContent=entries.reduce((a,[k,x])=>a+Number(x.stock||0),0);
   lowKpi.textContent=low.length;
   okKpi.textContent=entries.length-low.length;

   cards.innerHTML=entries.map(([key,x])=>{
     const stock=Number(x.stock||0), reorder=Number(x.reorder||0), isLow=stock<=reorder;
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

   document.querySelectorAll('.reorderLevel').forEach(el=>el.onchange=()=>{
     s.consumables[el.dataset.key].reorder=Math.max(0,Number(el.value||0));
     save(s);render();
   });
   document.querySelectorAll('.addConsumable').forEach(btn=>btn.onclick=()=>{
     const key=btn.dataset.key,x=s.consumables[key];
     const qty=Math.max(1,Number(document.querySelector('#restock-'+key)?.value||1));
     x.stock=Number(x.stock||0)+qty;
     s.consumableHistory.push({id:makeId(),key,name:x.name,change:qty,type:'restock',created_at:new Date().toISOString()});
     save(s);render();
   });
   document.querySelectorAll('.adjustConsumable').forEach(btn=>btn.onclick=()=>{
     const key=btn.dataset.key,x=s.consumables[key],d=Number(btn.dataset.d||0);
     const before=Number(x.stock||0); x.stock=Math.max(0,before+d);
     const actual=x.stock-before;
     if(actual!==0)s.consumableHistory.push({id:makeId(),key,name:x.name,change:actual,type:'adjustment',created_at:new Date().toISOString()});
     save(s);render();
   });

   history.innerHTML=(s.consumableHistory||[]).slice().reverse().slice(0,40).map(h=>`<tr>
     <td>${fmtDate(h.created_at)}</td><td><strong>${esc(h.name)}</strong></td>
     <td>${h.change>0?badge('STOCK IN','ok'):badge('ADJUSTMENT','warning')}</td>
     <td><strong>${h.change>0?'+':''}${h.change}</strong></td>
   </tr>`).join('')||'<tr><td colspan="4">No consumable movements recorded yet.</td></tr>';
 }
 render();
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
 const s=state(),ps=await load('products'),pals=ps.filter(p=>p.type==='pal'&&isOnSale(s,p.sku));
 const readyList=document.querySelector('#packingReadyList'),awaitingList=document.querySelector('#packingAwaitingList'),q=document.querySelector('#q');
 const readyCount=document.querySelector('#packingReadyCount'),awaitingCount=document.querySelector('#packingAwaitingCount');

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
    if(totalNeed(s,p.sku)<=0)return false;
    const allBlockers=blockers(p);
    const packagingBlockers=allBlockers.filter(x=>x!=='Awaiting assembled Pal');
    return packagingBlockers.length>0;
  });
  readyCount.textContent=`${ready.length} Pal${ready.length===1?'':'s'}`;awaitingCount.textContent=`${awaiting.length} Pal${awaiting.length===1?'':'s'}`;

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
    return `<div class="packing-card awaiting-pack-card"><div class="assembly-card-head"><div><strong>${esc(p.name)}</strong><div class="sku">${p.sku}</div></div>${badge(`PRODUCTION NEED ${totalNeed(s,p.sku)}`,'warning')}</div>${stockStrip(p)}<div class="packing-blockers">${packagingBlockers.map(x=>`<span>! ${esc(x)}</span>`).join('')}</div></div>`;
  }).join('')||'<div class="bench-empty">Nothing in the Production Planner is currently waiting for packaging materials or inserts.</div>';

  document.querySelectorAll('.batchQty').forEach(el=>el.onchange=()=>{const sku=el.dataset.sku,p=pals.find(x=>x.sku===sku),j=s.packingJobs[sku]||{step:1,qty:1};j.qty=Math.min(maxBatch(p),Math.max(1,Number(el.value||1)));save(s);render()});
  document.querySelectorAll('.batchMinus,.batchPlus').forEach(b=>b.onclick=()=>{const sku=b.dataset.sku,p=pals.find(x=>x.sku===sku),j=s.packingJobs[sku]||{step:1,qty:1};j.qty=Math.min(maxBatch(p),Math.max(1,Number(j.qty||1)+(b.classList.contains('batchPlus')?1:-1)));save(s);render()});
  document.querySelectorAll('.nextPackStep').forEach(b=>b.onclick=()=>{const sku=b.dataset.sku,p=pals.find(x=>x.sku===sku),j=s.packingJobs[sku]||{step:1,qty:1};if(j.step<8){j.step++;save(s);render()}else{for(let n=0;n<j.qty;n++)printPalBarcode(sku,p.name)}});
  document.querySelectorAll('.barcodeApplied').forEach(b=>b.onclick=()=>{const sku=b.dataset.sku,p=pals.find(x=>x.sku===sku),j=s.packingJobs[sku];if(!j||j.step!==8)return;const qty=Math.min(j.qty,maxBatch(p));setAssembled(sku,assembled(sku)-qty);s.inserts[sku].ready=Math.max(0,ins(sku)-qty);['clear_boxes','bottom_cards','stickers'].forEach(k=>s.consumables[k].stock=Math.max(0,cs(k)-qty));s.awaitingDispatch=s.awaitingDispatch||[];
const packedAt=new Date().toISOString(),historyId=makeId();
s.packingHistory.push({id:historyId,sku,name:p.name,qty,created_at:packedAt,status:'complete'});
s.awaitingDispatch.push({id:makeId(),source_history_id:historyId,sku:sku,name:p.name,qty:Number(qty),status:'awaiting_dispatch',packed_at:packedAt,destination:null});
delete s.packingJobs[sku];
save(s);render()});
  save(s);
 }
 q.oninput=render;render();
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

function recoverAwaitingDispatch(s){
 s.awaitingDispatch=s.awaitingDispatch||[];
 s.packingHistory=s.packingHistory||[];
 s.transfers=s.transfers||[];
 s.awaitingDispatch=s.awaitingDispatch.filter(x=>Number(x.qty||0)>0);

 const represented=new Set();
 s.awaitingDispatch.forEach(x=>{if(x.source_history_id)represented.add(x.source_history_id)});
 s.transfers.forEach(x=>{if(x.source_history_id)represented.add(x.source_history_id)});

 function legacyMatch(h){
   const stamp=h.created_at||'';
   return s.awaitingDispatch.some(x=>!x.source_history_id&&x.sku===h.sku&&Number(x.qty||0)===Number(h.qty||0)&&(x.packed_at||x.created_at||'')===stamp)
      || s.transfers.some(x=>!x.source_history_id&&x.sku===h.sku&&Number(x.qty||0)===Number(h.qty||0)&&(x.packed_at||x.created_at||'')===stamp);
 }

 s.packingHistory.forEach(h=>{
   if(h.status!=='complete'||h.destination)return;
   if(represented.has(h.id)||legacyMatch(h))return;
   s.awaitingDispatch.push({
     id:makeId(),source_history_id:h.id,sku:h.sku,name:h.name,
     qty:Number(h.qty||1),status:'awaiting_dispatch',
     packed_at:h.created_at||new Date().toISOString(),destination:null,recovered:true
   });
   represented.add(h.id);
 });

 const seen=new Set();
 s.awaitingDispatch=s.awaitingDispatch.filter(x=>{
   if(!x.source_history_id)return true;
   if(seen.has(x.source_history_id))return false;
   seen.add(x.source_history_id);
   return true;
 });
 save(s);
}

async function deliveriesPage(){
 const s=state();
 recoverAwaitingDispatch(s);

 const unassigned=document.querySelector('#awaitingDispatch');
 const awaiting=document.querySelector('#awaitingDeliveries');
 const received=document.querySelector('#receivedDeliveries');
 const dispatchKpi=document.querySelector('#awaitingDispatchKpi');
 const awaitKpi=document.querySelector('#awaitingDeliveryKpi');
 const boatKpi=document.querySelector('#boatFinishedKpi');
 const cornKpi=document.querySelector('#cornwallFinishedKpi');

 function groupedDispatch(){
   const map={};
   const seenDispatch=new Set();
   (s.awaitingDispatch||[]).filter(x=>x.status==='awaiting_dispatch' && Number(x.qty||0)>0).forEach(x=>{
     const identity=x.source_history_id?`history:${x.source_history_id}`:`record:${x.id}`;
     if(seenDispatch.has(identity))return;
     seenDispatch.add(identity);
     if(!map[x.sku])map[x.sku]={sku:x.sku,name:x.name||x.sku,qty:0,records:[],oldest:x.packed_at||x.created_at||''};
     map[x.sku].qty+=Number(x.qty||0);
     map[x.sku].records.push(x);
     const dt=x.packed_at||x.created_at||'';
     if(dt && (!map[x.sku].oldest || dt<map[x.sku].oldest))map[x.sku].oldest=dt;
   });
   return Object.values(map).sort((a,b)=>{
     const an=needed(s,a.sku,'boat')+needed(s,a.sku,'cornwall');
     const bn=needed(s,b.sku,'boat')+needed(s,b.sku,'cornwall');
     return bn-an || a.name.localeCompare(b.name);
   });
 }

 function consumeDispatchRecords(group,qty){
   let remaining=Math.max(0,Number(qty||0));
   const records=[...group.records].sort((a,b)=>(a.packed_at||a.created_at||'').localeCompare(b.packed_at||b.created_at||''));
   records.forEach(r=>{
     if(remaining<=0)return;
     const available=Number(r.qty||0);
     const used=Math.min(available,remaining);
     r.qty=available-used;
     remaining-=used;
     if(r.qty<=0)r.status='allocated';
   });
   return remaining===0;
 }

 function allocationCard(g){
   const boatStock=stock(s,g.sku,'boat');
   const cornStock=stock(s,g.sku,'cornwall');
   const boatTarget=getTarget(s,g.sku,'boat');
   const cornTarget=getTarget(s,g.sku,'cornwall');
   const boatNeed=needed(s,g.sku,'boat');
   const cornNeed=needed(s,g.sku,'cornwall');

   return `<div class="dispatch-pal-card">
     <div class="dispatch-pal-head">
       <div>
         <strong>${esc(g.name)}</strong>
         <div class="sku">${g.sku}</div>
         <div class="small">Oldest packed ${fmtDate(g.oldest)}</div>
       </div>
       <div class="dispatch-ready-total">
         <span>Ready to Dispatch</span>
         <strong>${g.qty}</strong>
       </div>
     </div>

     <div class="dispatch-location-grid">
       <div class="dispatch-location-card">
         <div class="dispatch-location-title"><strong>Kitsune Boat</strong>${boatNeed>0?badge(`NEED ${boatNeed}`,'warning'):badge('TARGET MET','ok')}</div>
         <div class="dispatch-stock-line"><span>Current</span><strong>${boatStock}</strong></div>
         <div class="dispatch-stock-line"><span>Target</span><strong>${boatTarget}</strong></div>
         <div class="dispatch-stock-line need-line"><span>Need</span><strong>${boatNeed}</strong></div>
         <label class="dispatch-qty-label">
           <span>Send Qty</span>
           <input class="number dispatchBoatQty" id="boat-${g.sku}" data-sku="${g.sku}" type="number" min="0" max="${g.qty}" value="${Math.min(g.qty,boatNeed)}">
         </label>
       </div>

       <div class="dispatch-location-card">
         <div class="dispatch-location-title"><strong>Kitsune Cornwall</strong>${cornNeed>0?badge(`NEED ${cornNeed}`,'warning'):badge('TARGET MET','ok')}</div>
         <div class="dispatch-stock-line"><span>Current</span><strong>${cornStock}</strong></div>
         <div class="dispatch-stock-line"><span>Target</span><strong>${cornTarget}</strong></div>
         <div class="dispatch-stock-line need-line"><span>Need</span><strong>${cornNeed}</strong></div>
         <label class="dispatch-qty-label">
           <span>Send Qty</span>
           <input class="number dispatchCornQty" id="cornwall-${g.sku}" data-sku="${g.sku}" type="number" min="0" max="${g.qty}" value="${Math.min(Math.max(0,g.qty-Math.min(g.qty,boatNeed)),cornNeed)}">
         </label>
       </div>
     </div>

     <div class="dispatch-allocation-footer">
       <div class="dispatch-allocation-summary" id="summary-${g.sku}">Allocate up to ${g.qty} finished Pal${g.qty===1?'':'s'}.</div>
       <button class="btn allocateSplit" data-sku="${g.sku}">Confirm Dispatch Allocation</button>
     </div>
   </div>`;
 }

 function render(){
   const groups=groupedDispatch();
   const a=(s.transfers||[]).filter(t=>t.destination==='cornwall'&&t.status==='awaiting_delivery');
   const r=(s.transfers||[]).filter(t=>t.destination==='cornwall'&&t.status==='received').slice().reverse();

   dispatchKpi.textContent=groups.reduce((x,g)=>x+Number(g.qty||0),0);
   awaitKpi.textContent=a.reduce((x,t)=>x+Number(t.qty||0),0);
   boatKpi.textContent=Object.values(s.finishedStock?.boat||{}).reduce((x,v)=>x+Number(v||0),0);
   cornKpi.textContent=Object.values(s.finishedStock?.cornwall||{}).reduce((x,v)=>x+Number(v||0),0);

   unassigned.innerHTML=groups.length
     ?groups.map(allocationCard).join('')
     :'<div class="bench-empty">No finished Pals are awaiting dispatch allocation.</div>';

   awaiting.innerHTML=a.length?a.map(t=>`<div class="delivery-card awaiting-delivery">
      <div><strong>${esc(t.name)}</strong><div class="sku">${t.sku}</div><div class="small">Dispatched ${fmtDate(t.dispatched_at||t.packed_at)}</div></div>
      <div class="delivery-qty">× ${t.qty}</div>
      <button class="btn receiveDelivery" data-id="${t.id}">Received in Cornwall</button>
   </div>`).join(''):'<div class="bench-empty">No stock is awaiting delivery to Cornwall.</div>';

   received.innerHTML=r.length?r.map(t=>`<div class="delivery-card received-delivery">
      <div><strong>${esc(t.name)}</strong><div class="sku">${t.sku}</div><div class="small">Received ${fmtDate(t.received_at)}</div></div>
      <div class="delivery-qty">× ${t.qty}</div>${badge('RECEIVED','ok')}
   </div>`).join(''):'<div class="bench-empty">No Cornwall deliveries received yet.</div>';

   function updateSummary(sku){
     const g=groups.find(x=>x.sku===sku);if(!g)return;
     const b=Math.max(0,Number(document.querySelector('#boat-'+sku)?.value||0));
     const c=Math.max(0,Number(document.querySelector('#cornwall-'+sku)?.value||0));
     const total=b+c;
     const remain=Math.max(0,g.qty-total);
     const el=document.querySelector('#summary-'+sku);
     if(!el)return;
     if(total>g.qty)el.innerHTML=`<strong class="danger-text">Too many selected: ${total} / ${g.qty}</strong>`;
     else el.innerHTML=`Boat <strong>${b}</strong> · Cornwall <strong>${c}</strong> · Leave for later <strong>${remain}</strong>`;
   }

   document.querySelectorAll('.dispatchBoatQty,.dispatchCornQty').forEach(el=>el.oninput=()=>updateSummary(el.dataset.sku));
   groups.forEach(g=>updateSummary(g.sku));

   document.querySelectorAll('.allocateSplit').forEach(btn=>btn.onclick=()=>{
     const sku=btn.dataset.sku,g=groups.find(x=>x.sku===sku);if(!g)return;
     const boatQty=Math.max(0,Math.floor(Number(document.querySelector('#boat-'+sku)?.value||0)));
     const cornQty=Math.max(0,Math.floor(Number(document.querySelector('#cornwall-'+sku)?.value||0)));
     const total=boatQty+cornQty;

     if(total<=0){alert('Choose a quantity for Kitsune Boat and/or Kitsune Cornwall.');return}
     if(total>g.qty){alert(`You only have ${g.qty} ${g.name} ready to dispatch.`);return}

     // Consume grouped finished-dispatch stock once for the total allocation.
     if(!consumeDispatchRecords(g,total)){alert('Could not allocate this dispatch quantity.');return}

     const now=new Date().toISOString();

     if(boatQty>0){
       addForgeInventory(s,sku,'boat',boatQty);
       s.transfers.push({
         id:makeId(),sku,name:g.name,qty:boatQty,destination:'boat',
         status:'received',packed_at:g.oldest,dispatched_at:now,received_at:now
       });
     }

     if(cornQty>0){
       // Inventory is allocated immediately when destination/qty is confirmed.
       addForgeInventory(s,sku,'cornwall',cornQty);
       s.transfers.push({
         id:makeId(),sku,name:g.name,qty:cornQty,destination:'cornwall',
         status:'awaiting_delivery',packed_at:g.oldest,dispatched_at:now,received_at:null
       });
     }

     save(s);render();
   });

   document.querySelectorAll('.receiveDelivery').forEach(btn=>btn.onclick=()=>{
     const t=s.transfers.find(x=>x.id===btn.dataset.id);if(!t)return;
     t.status='received';t.received_at=new Date().toISOString();
     // Location inventory was already updated when dispatch allocation was confirmed.
     save(s);render();
   });
 }
 render();
}
