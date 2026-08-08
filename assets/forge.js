
const STORE='plaForgeV02';

function state(){
  let s={};
  try{s=JSON.parse(localStorage.getItem(STORE)||'{}')}catch(e){}
  if(!Object.keys(s).length){try{s=JSON.parse(localStorage.getItem('plaForgeV01')||'{}')}catch(e){}}
  s.targets=s.targets||{}; s.filament=s.filament||{}; s.stock=s.stock||{}; s.parts=s.parts||{};
  s.plates=s.plates||[]; s.printHistory=s.printHistory||[]; s.failedParts=s.failedParts||[]; s.plateSeq=Number(s.plateSeq||1);
  s.printers=s.printers||[]; s.siteSettings=s.siteSettings||{defaultPrinter:'',defaultLocation:'boat'};
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
async function inventory(type){
 const s=state(), ps=await load('products'); let items=ps.filter(x=>type==='sticker'?x.type==='sticker':x.type==='pal'&&(type==='pal'||x.keyring));
 const tbody=document.querySelector('#rows'), q=document.querySelector('#q');
 function draw(){const text=(q.value||'').toLowerCase(),shown=items.filter(x=>`${x.sku} ${x.name}`.toLowerCase().includes(text));
 tbody.innerHTML=shown.map(x=>{const b=stock(s,x.sku,'boat'),c=stock(s,x.sku,'cornwall'),bt=getTarget(s,x.sku,'boat'),ct=getTarget(s,x.sku,'cornwall'),need=needed(s,x.sku,'boat')+needed(s,x.sku,'cornwall');
 return `<tr><td><div class="product-name">${esc(x.name)}</div><span class="sku">${x.sku}</span></td><td>${x.recipe_ready?badge('Recipe ready','ok'):badge('No recipe','warning')}</td><td>${b}</td><td><input class="number t" data-sku="${x.sku}" data-loc="boat" type="number" min="0" value="${bt}"></td><td>${c}</td><td><input class="number t" data-sku="${x.sku}" data-loc="cornwall" type="number" min="0" value="${ct}"></td><td><strong>${need}</strong></td></tr>`}).join('');
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
 function openCompletion(id){
   const p=s.plates.find(x=>x.id===id),panel=document.querySelector('#complete-'+id);if(!p||!panel)return;
   panel.innerHTML=`<div class="completion-box"><strong>Confirm successful prints</strong><div class="small">Enter how many passed inspection.</div>${(p.items||[]).map(i=>`<div class="completion-line"><div><strong>${esc(i.product_name)}</strong><div class="small">${esc(i.label)}</div></div><div>Planned ${i.qty}</div><label>Passed <input class="number passqty" data-item="${i.id}" type="number" min="0" max="${i.qty}" value="${i.qty}"></label></div>`).join('')}<button class="btn confirmcomplete">Confirm Completion</button></div>`;
   panel.querySelector('.confirmcomplete').onclick=()=>confirmCompletion(id,panel);
 }
 function confirmCompletion(id,panel){
   const p=s.plates.find(x=>x.id===id);if(!p)return;const passes={};
   panel.querySelectorAll('.passqty').forEach(el=>passes[el.dataset.item]=Math.max(0,Math.min(Number(el.max),Number(el.value||0))));
   (p.items||[]).forEach(i=>{const passed=Number(passes[i.id]??i.qty),failed=Math.max(0,Number(i.qty)-passed);if(passed>0)s.parts[i.inventory_key]=partQty(s,i.inventory_key)+passed;if(failed>0)s.failedParts.push({id:makeId(),plate_id:p.id,plate_code:p.code,sku:i.sku,product_name:i.product_name,filament:i.filament,label:i.label,file:i.file,qty:failed,created_at:new Date().toISOString()})});
   p.status='complete';p.completed_at=new Date().toISOString();p.result=passes;s.printHistory.push({plate_id:p.id,plate_code:p.code,completed_at:p.completed_at,items:p.items,result:passes});save(s);drawAll();
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
