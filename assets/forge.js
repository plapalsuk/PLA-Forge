
const STORE='plaForgeV01';
const state=()=>JSON.parse(localStorage.getItem(STORE)||'{"targets":{},"filament":{},"stock":{},"parts":{},"plates":[]}');
const save=s=>localStorage.setItem(STORE,JSON.stringify(s));
async function load(name){return (await fetch('data/'+name+'.json')).json()}
function badge(txt, cls='info'){return `<span class="badge ${cls}">${txt}</span>`}
function shellTitle(title,sub){document.querySelector('.pageTitle').innerHTML=`<h1>${title}</h1><div class="small">${sub||''}</div>`}
function targetKey(sku,loc){return `${sku}:${loc}`}
function getTarget(s,sku,loc){return Number(s.targets[targetKey(sku,loc)]||0)}
function stock(s,sku,loc){return Number((s.stock[sku]||{})[loc]||0)}
function needed(s,sku,loc){return Math.max(0,getTarget(s,sku,loc)-stock(s,sku,loc))}
async function dashboard(){
 const ps=await load('products'), rs=await load('recipes'), mm=await load('mismatches');
 const pals=ps.filter(x=>x.type==='pal'), keys=pals.filter(x=>x.keyring), st=ps.filter(x=>x.type==='sticker');
 document.querySelector('#pals').textContent=pals.length; document.querySelector('#keys').textContent=keys.length;
 document.querySelector('#stickers').textContent=st.length; document.querySelector('#recipes').textContent=new Set(rs.map(x=>x.sku)).size;
 document.querySelector('#filaments').textContent=new Set(rs.map(x=>x.filament).filter(Boolean)).size;
 const missing=pals.filter(x=>!x.recipe_ready);
 document.querySelector('#missingRecipes').innerHTML=missing.slice(0,10).map(x=>`<div class="listitem"><strong>${x.name}</strong><span class="sku">${x.sku}</span></div>`).join('')||'<div class="listitem">All products have a recipe.</div>';
 document.querySelector('#dataWarnings').innerHTML=mm.slice(0,10).map(x=>`<div class="listitem"><strong>${x.recipe}</strong><span class="muted">${x.stated_sku} → ${x.resolved_sku}</span></div>`).join('')||'<div class="listitem">No SKU mismatches detected.</div>';
}
async function inventory(type){
 const s=state(), ps=await load('products'); let items=ps.filter(x=>type==='sticker'?x.type==='sticker':x.type==='pal'&&(type==='pal'||x.keyring));
 const tbody=document.querySelector('#rows'), q=document.querySelector('#q');
 function draw(){
  const text=(q.value||'').toLowerCase();
  const shown=items.filter(x=>`${x.sku} ${x.name}`.toLowerCase().includes(text));
  tbody.innerHTML=shown.map(x=>{
   const b=stock(s,x.sku,'boat'), c=stock(s,x.sku,'cornwall'), bt=getTarget(s,x.sku,'boat'), ct=getTarget(s,x.sku,'cornwall'), need=needed(s,x.sku,'boat')+needed(s,x.sku,'cornwall');
   return `<tr><td><div class="product-name">${x.name}</div><span class="sku">${x.sku}</span></td><td>${x.recipe_ready?badge('Recipe ready','ok'):badge('No recipe','warning')}</td><td>${b}</td><td><input class="number t" data-sku="${x.sku}" data-loc="boat" type="number" min="0" value="${bt}"></td><td>${c}</td><td><input class="number t" data-sku="${x.sku}" data-loc="cornwall" type="number" min="0" value="${ct}"></td><td><strong>${need}</strong></td></tr>`
  }).join('');
  document.querySelectorAll('.t').forEach(el=>el.onchange=()=>{s.targets[targetKey(el.dataset.sku,el.dataset.loc)]=Number(el.value||0);save(s);draw()})
 }
 q.oninput=draw; draw()
}
async function recipes(){
 const ps=await load('products'), rs=await load('recipes'), q=document.querySelector('#q'), box=document.querySelector('#cards');
 function draw(){
  const text=(q.value||'').toLowerCase();
  const filtered=ps.filter(p=>p.type==='pal'&&`${p.sku} ${p.name} ${(p.filaments||[]).join(' ')}`.toLowerCase().includes(text));
  box.innerHTML=filtered.map(p=>{
   const rr=rs.filter(r=>r.sku===p.sku);
   return `<div class="card recipe-card"><h3>${p.name}</h3><span class="sku">${p.sku}</span><div class="small">${rr.length} colour group(s) · ${p.recipe_weight_g||0}g total</div>${rr.map(r=>`<div class="listitem" style="margin-top:9px"><div class="colour">${r.filament}</div><strong>${r.parts}</strong><div>${r.weight_g}g · ${r.part_count} part(s)</div><code>${r.grouped_stl}</code></div>`).join('')||'<div class="listitem" style="margin-top:9px">No recipe entered yet.</div>'}</div>`
  }).join('')
 }
 q.oninput=draw; draw()
}
async function production(){
 const s=state(), ps=await load('products'), rs=await load('recipes'), body=document.querySelector('#prod');
 const rows=[];
 ps.filter(p=>p.type==='pal').forEach(p=>{
  const n=needed(s,p.sku,'boat')+needed(s,p.sku,'cornwall');
  if(n>0) rows.push({p,n,groups:rs.filter(r=>r.sku===p.sku)})
 });
 rows.sort((a,b)=>b.n-a.n);
 body.innerHTML=rows.map(x=>`<tr><td><strong>${x.p.name}</strong><br><span class="sku">${x.p.sku}</span></td><td>${x.n}</td><td>${x.groups.length}</td><td>${(x.groups.reduce((a,r)=>a+r.weight_g,0)*x.n).toFixed(1)}g</td><td>${x.groups.map(r=>r.filament).join(', ')}</td></tr>`).join('')||'<tr><td colspan="5">Set inventory targets first to create production demand.</td></tr>';
}
async function dataHealth(){
 const ps=await load('products'), rs=await load('recipes'), mm=await load('mismatches'), body=document.querySelector('#health');
 const missing=ps.filter(p=>p.type==='pal'&&!p.recipe_ready);
 const rows=[...mm.map(x=>({level:'warning',issue:'Recipe SKU remapped',item:x.recipe,detail:`${x.stated_sku} → ${x.resolved_sku}`})),
 ...missing.map(x=>({level:'danger',issue:'Missing recipe',item:x.name,detail:x.sku}))];
 body.innerHTML=rows.map(x=>`<tr><td>${badge(x.issue,x.level)}</td><td>${x.item}</td><td>${x.detail}</td></tr>`).join('')||'<tr><td colspan="3">No data issues detected.</td></tr>';
}
async function filament(){
 const s=state(), rs=await load('recipes'), body=document.querySelector('#fil');
 const colours=[...new Set(rs.map(r=>r.filament).filter(Boolean))].sort();
 colours.forEach(c=>{if(!s.filament[c])s.filament[c]={grams:0,reorder:250}});save(s);
 function draw(){body.innerHTML=colours.map(c=>{const x=s.filament[c],low=Number(x.grams)<=Number(x.reorder);return `<tr><td><strong>${c}</strong></td><td><input class="number fg" data-c="${c}" data-k="grams" type="number" min="0" value="${x.grams}"></td><td><input class="number fg" data-c="${c}" data-k="reorder" type="number" min="0" value="${x.reorder}"></td><td>${low?badge('Order','danger'):badge('OK','ok')}</td></tr>`}).join('');document.querySelectorAll('.fg').forEach(el=>el.onchange=()=>{s.filament[el.dataset.c][el.dataset.k]=Number(el.value||0);save(s);draw()})} draw()
}
