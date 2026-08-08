
const STORE='plaForgeV02';

function state(){
  let s={};
  try{s=JSON.parse(localStorage.getItem(STORE)||'{}')}catch(e){}
  if(!Object.keys(s).length){try{s=JSON.parse(localStorage.getItem('plaForgeV01')||'{}')}catch(e){}}
  s.targets=s.targets||{}; s.filament=s.filament||{}; s.stock=s.stock||{}; s.parts=s.parts||{};
  s.plates=s.plates||[]; s.printHistory=s.printHistory||[]; s.failedParts=s.failedParts||[]; s.plateSeq=Number(s.plateSeq||1);
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
 const s=state(),ps=await load('products'),rs=await load('recipes'),pals=Object.fromEntries(ps.filter(p=>p.type==='pal').map(p=>[p.sku,p])),colours=[...new Set(rs.map(r=>r.filament).filter(Boolean))].sort();
 let plateDraft={id:null,colour:colours[0]||'',printer:'',name:'',items:[]};
 const colourEl=document.querySelector('#plateColour'),printerEl=document.querySelector('#platePrinter'),nameEl=document.querySelector('#plateName'),checklist=document.querySelector('#plateChecklist'),current=document.querySelector('#currentPlateItems'),platesList=document.querySelector('#platesList'),currentTotal=document.querySelector('#currentPlateTotal'),demandKpi=document.querySelector('#demandKpi'),plannedKpi=document.querySelector('#plannedKpi'),printingKpi=document.querySelector('#printingKpi'),completedKpi=document.querySelector('#completedKpi'),recoveryProduct=document.querySelector('#recoveryProduct'),recoveryFile=document.querySelector('#recoveryFile'),recoveryQty=document.querySelector('#recoveryQty');
 colourEl.innerHTML=colours.map(c=>`<option>${esc(c)}</option>`).join('');recoveryProduct.innerHTML=ps.filter(p=>p.type==='pal').map(p=>`<option value="${p.sku}">${esc(p.name)} · ${p.sku}</option>`).join('');
 function setRecoveryFiles(){const sku=recoveryProduct.value,files=[];rs.filter(r=>r.sku===sku&&r.filament===plateDraft.colour&&r.separate_stls).forEach(r=>r.separate_stls.split(';').map(x=>x.trim()).filter(Boolean).forEach(file=>files.push({file})));recoveryFile.innerHTML=files.length?files.map(x=>`<option value="${esc(x.file)}">${esc(x.file)}</option>`).join(''):`<option value="">No separate recovery files for this colour</option>`}
 function drawChecklist(){const rows=rs.filter(r=>r.filament===plateDraft.colour).map(r=>{const p=pals[r.sku]||{name:r.name||r.animal||r.sku},key=groupKey(r),demand=totalNeed(s,r.sku),inv=partQty(s,key),allocated=activePlateQty(s,key),inDraft=plateDraft.items.filter(i=>i.inventory_key===key).reduce((a,i)=>a+Number(i.qty||0),0),remain=Math.max(0,demand-inv-allocated-inDraft);return{r,p,demand,inv,allocated,remain}}).sort((a,b)=>b.remain-a.remain||a.p.name.localeCompare(b.p.name));
 checklist.innerHTML=rows.map((x,idx)=>`<tr class="${x.remain===0?'dimrow':''}"><td><strong>${esc(x.p.name)}</strong><br><span class="sku">${x.r.sku}</span></td><td>${esc(x.r.parts)}</td><td>${x.r.weight_g}g</td><td>${x.demand}</td><td>${x.inv}</td><td>${x.allocated}</td><td><strong>${x.remain}</strong></td><td><input class="number addqty" id="qty${idx}" min="1" type="number" value="${Math.max(1,Math.min(x.remain||1,5))}"></td><td><button class="btn secondary addgroup" data-row="${idx}">Add</button></td></tr>`).join('')||`<tr><td colspan="9">No recipe groups use ${esc(plateDraft.colour)}.</td></tr>`;
 document.querySelectorAll('.addgroup').forEach(btn=>btn.onclick=()=>{const x=rows[Number(btn.dataset.row)],qty=Math.max(1,Number(document.querySelector('#qty'+btn.dataset.row).value||1));plateDraft.items.push({id:makeId(),kind:'group',sku:x.r.sku,product_name:x.p.name,filament:x.r.filament,label:x.r.parts,file:x.r.grouped_stl,inventory_key:groupKey(x.r),qty,weight_each:Number(x.r.weight_g||0)});drawAll()})}
 function drawCurrent(){current.innerHTML=plateDraft.items.length?plateDraft.items.map(i=>`<div class="plate-line"><div><strong>${esc(i.product_name)}</strong><div class="small">${i.kind==='group'?'Grouped print':'Recovery part'} · ${esc(i.label)}</div><code>${esc(i.file)}</code></div><div class="plate-line-right"><input class="number lineqty" data-id="${i.id}" type="number" min="1" value="${i.qty}"><span>${(Number(i.weight_each||0)*Number(i.qty||0)).toFixed(1)}g</span><button class="iconbtn removeitem" data-id="${i.id}">×</button></div></div>`).join(''):`<div class="empty-state">Choose a filament colour, then add colour-groups from the checklist.</div>`;
 document.querySelectorAll('.removeitem').forEach(b=>b.onclick=()=>{plateDraft.items=plateDraft.items.filter(i=>i.id!==b.dataset.id);drawAll()});document.querySelectorAll('.lineqty').forEach(el=>el.onchange=()=>{const i=plateDraft.items.find(i=>i.id===el.dataset.id);if(i)i.qty=Math.max(1,Number(el.value||1));drawAll()});
 const grams=plateDraft.items.reduce((a,i)=>a+Number(i.weight_each||0)*Number(i.qty||0),0);currentTotal.textContent=`${plateDraft.items.reduce((a,i)=>a+Number(i.qty||0),0)} print set(s) · ${grams.toFixed(1)}g`}
 function drawKpis(){let openDemand=0;rs.forEach(r=>openDemand+=Math.max(0,totalNeed(s,r.sku)-partQty(s,groupKey(r))-activePlateQty(s,groupKey(r))));demandKpi.textContent=openDemand;plannedKpi.textContent=s.plates.filter(p=>p.status==='draft').length;printingKpi.textContent=s.plates.filter(p=>p.status==='printing').length;completedKpi.textContent=s.plates.filter(p=>p.status==='complete').length}
 function plateSummary(p){const grams=(p.items||[]).reduce((a,i)=>a+Number(i.weight_each||0)*Number(i.qty||0),0);return `${(p.items||[]).reduce((a,i)=>a+Number(i.qty||0),0)} set(s) · ${grams.toFixed(1)}g`}
 function drawPlates(){const items=[...s.plates].sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||''));platesList.innerHTML=items.length?items.map(p=>`<div class="saved-plate"><div class="saved-plate-main"><div><strong>${esc(p.code)} · ${esc(p.name||p.colour)}</strong><div class="small">${esc(p.colour)} · ${esc(p.printer||'No printer assigned')} · ${plateSummary(p)}</div></div><div>${statusLabel(p.status)}</div></div><div class="saved-plate-items">${(p.items||[]).map(i=>`<span>${esc(i.product_name)} ×${i.qty}</span>`).join('')}</div><div class="plate-actions">${p.status==='draft'?`<button class="btn secondary loadplate" data-id="${p.id}">Edit</button><button class="btn startplate" data-id="${p.id}">Start Print</button>`:''}${p.status==='printing'?`<button class="btn completeplate" data-id="${p.id}">Complete Print</button>`:''}${p.status!=='complete'?`<button class="btn ghost cancelplate" data-id="${p.id}">Cancel</button>`:''}${p.status==='complete'?`<span class="small">Completed ${fmtDate(p.completed_at)}</span>`:''}</div><div class="completion-panel" id="complete-${p.id}"></div></div>`).join(''):`<div class="empty-state">No build plates yet.</div>`;
 document.querySelectorAll('.loadplate').forEach(b=>b.onclick=()=>{const p=s.plates.find(x=>x.id===b.dataset.id);if(!p)return;plateDraft=JSON.parse(JSON.stringify(p));s.plates=s.plates.filter(x=>x.id!==p.id);save(s);colourEl.value=plateDraft.colour;printerEl.value=plateDraft.printer||'';nameEl.value=plateDraft.name||'';drawAll()});
 document.querySelectorAll('.startplate').forEach(b=>b.onclick=()=>{const p=s.plates.find(x=>x.id===b.dataset.id);if(p){p.status='printing';p.started_at=new Date().toISOString();save(s);drawAll()}});
 document.querySelectorAll('.cancelplate').forEach(b=>b.onclick=()=>{const p=s.plates.find(x=>x.id===b.dataset.id);if(p){p.status='cancelled';save(s);drawAll()}});
 document.querySelectorAll('.completeplate').forEach(b=>b.onclick=()=>openCompletion(b.dataset.id))}
 function openCompletion(id){const p=s.plates.find(x=>x.id===id),panel=document.querySelector('#complete-'+id);if(!p||!panel)return;panel.innerHTML=`<div class="completion-box"><strong>Confirm successful prints</strong><div class="small">Enter how many complete grouped sets / recovery parts passed inspection. Anything not passed is recorded as failed.</div>${(p.items||[]).map(i=>`<div class="completion-line"><div><strong>${esc(i.product_name)}</strong><div class="small">${esc(i.label)}</div></div><div>Planned ${i.qty}</div><label>Passed <input class="number passqty" data-item="${i.id}" type="number" min="0" max="${i.qty}" value="${i.qty}"></label></div>`).join('')}<button class="btn confirmcomplete" data-id="${id}">Confirm Completion</button></div>`;panel.querySelector('.confirmcomplete').onclick=()=>confirmCompletion(id,panel)}
 function confirmCompletion(id,panel){const p=s.plates.find(x=>x.id===id);if(!p)return;const passes={};panel.querySelectorAll('.passqty').forEach(el=>passes[el.dataset.item]=Math.max(0,Math.min(Number(el.max),Number(el.value||0))));(p.items||[]).forEach(i=>{const passed=Number(passes[i.id]??i.qty),failed=Math.max(0,Number(i.qty)-passed);if(passed>0)s.parts[i.inventory_key]=partQty(s,i.inventory_key)+passed;if(failed>0)s.failedParts.push({id:makeId(),plate_id:p.id,plate_code:p.code,sku:i.sku,product_name:i.product_name,filament:i.filament,label:i.label,file:i.file,qty:failed,created_at:new Date().toISOString()})});p.status='complete';p.completed_at=new Date().toISOString();p.result=passes;s.printHistory.push({plate_id:p.id,plate_code:p.code,completed_at:p.completed_at,items:p.items,result:passes});save(s);drawAll()}
 function drawAll(){plateDraft.colour=colourEl.value||plateDraft.colour;plateDraft.printer=printerEl.value;plateDraft.name=nameEl.value;setRecoveryFiles();drawChecklist();drawCurrent();drawPlates();drawKpis()}
 colourEl.onchange=()=>{plateDraft.colour=colourEl.value;plateDraft.items=[];drawAll()};printerEl.oninput=()=>plateDraft.printer=printerEl.value;nameEl.oninput=()=>plateDraft.name=nameEl.value;recoveryProduct.onchange=setRecoveryFiles;
 document.querySelector('#addRecovery').onclick=()=>{const sku=recoveryProduct.value,file=recoveryFile.value,qty=Math.max(1,Number(recoveryQty.value||1));if(!file)return;const p=pals[sku]||{name:sku};plateDraft.items.push({id:makeId(),kind:'recovery',sku,product_name:p.name,filament:plateDraft.colour,label:file,file,inventory_key:recoveryKey(sku,file),qty,weight_each:0});drawAll()};
 document.querySelector('#savePlate').onclick=()=>saveDraft(false);document.querySelector('#startPlate').onclick=()=>saveDraft(true);
 function saveDraft(start){if(!plateDraft.items.length){alert('Add at least one print item to the plate.');return}const code=plateDraft.code||`PLATE-${String(s.plateSeq).padStart(4,'0')}`;if(!plateDraft.code)s.plateSeq++;const p={...plateDraft,id:plateDraft.id||makeId(),code,status:start?'printing':'draft',created_at:plateDraft.created_at||new Date().toISOString()};if(start)p.started_at=new Date().toISOString();s.plates.push(JSON.parse(JSON.stringify(p)));save(s);plateDraft={id:null,colour:colourEl.value,printer:printerEl.value,name:'',items:[]};nameEl.value='';drawAll()}
 drawAll()
}

async function printedParts(){
 const s=state(),ps=await load('products'),rs=await load('recipes'),pals=Object.fromEntries(ps.filter(p=>p.type==='pal').map(p=>[p.sku,p])),q=document.querySelector('#q'),body=document.querySelector('#partsRows'),failures=document.querySelector('#failedRows');
 function draw(){const text=(q.value||'').toLowerCase(),rows=[];rs.forEach(r=>{const qty=partQty(s,groupKey(r));if(qty>0)rows.push({kind:'Grouped set',sku:r.sku,name:(pals[r.sku]||{}).name||r.name||r.animal,filament:r.filament,label:r.parts,qty,key:groupKey(r)})});
 Object.entries(s.parts).filter(([k,v])=>k.startsWith('recovery|')&&Number(v)>0).forEach(([k,v])=>{const bits=k.split('|'),sku=bits[1],file=bits.slice(2).join('|'),r=rs.find(x=>x.sku===sku&&(x.separate_stls||'').includes(file));rows.push({kind:'Recovery part',sku,name:(pals[sku]||{}).name||sku,filament:r?.filament||'',label:file,qty:Number(v),key:k})});
 const shown=rows.filter(x=>`${x.name} ${x.sku} ${x.filament} ${x.label}`.toLowerCase().includes(text));body.innerHTML=shown.length?shown.map(x=>`<tr><td><strong>${esc(x.name)}</strong><br><span class="sku">${x.sku}</span></td><td>${badge(x.kind,x.kind==='Grouped set'?'ok':'info')}</td><td>${esc(x.filament)}</td><td>${esc(x.label)}</td><td><strong>${x.qty}</strong></td><td><button class="iconbtn adjust" data-key="${esc(x.key)}" data-d="-1">−</button> <button class="iconbtn adjust" data-key="${esc(x.key)}" data-d="1">+</button></td></tr>`).join(''):`<tr><td colspan="6">No printed-part inventory yet. Complete a build plate to add stock.</td></tr>`;
 document.querySelectorAll('.adjust').forEach(b=>b.onclick=()=>{s.parts[b.dataset.key]=Math.max(0,partQty(s,b.dataset.key)+Number(b.dataset.d));save(s);draw()});failures.innerHTML=s.failedParts.slice().reverse().slice(0,20).map(x=>`<tr><td>${esc(x.plate_code)}</td><td>${esc(x.product_name)}</td><td>${esc(x.filament)}</td><td>${esc(x.label)}</td><td>${x.qty}</td><td>${fmtDate(x.created_at)}</td></tr>`).join('')||'<tr><td colspan="6">No failed parts recorded.</td></tr>'}
 q.oninput=draw;draw()
}
