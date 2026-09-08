async function transfersPage(){
 const $=id=>document.getElementById(id),names={boat:'Boat',cornwall:'Cornwall',warehouse:'Warehouse'};
 let data=null,busy=false,online=false,revision=0,pending=null;
 const storageKey='forge-test-transfer-pending-v1';
 try{pending=JSON.parse(localStorage.getItem(storageKey)||'null');}catch(_){}
 function status(text,bad=false){$('transferStatus').textContent=text;$('transferStatus').classList.toggle('stock-bad',bad);}
 function remember(value){if(value)localStorage.setItem(storageKey,JSON.stringify(value));else localStorage.removeItem(storageKey);pending=value;}
 async function api(path,body){const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),20000);try{
  const r=await fetch(cloudApiBase()+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${cloudToken()}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:abort.signal,cache:'no-store'});
  const result=await r.json();if(!r.ok)throw Object.assign(new Error(result.detail||result.error||'Transfer could not be saved.'),{definite:r.status>=400&&r.status<500&&![408,429].includes(r.status)});return result;
 }finally{clearTimeout(timer);}}
 function product(){return data?.inventory.find(p=>p.sku===$('transferProduct').value);}
 function render(){
  if(!data)return;
  const p=product(),source=$('transferSource').value,destination=$('transferDestination').value,quantity=Number($('transferQty').value);
  for(const [loc,name]of Object.entries(names)){$('transferTotal'+name).textContent=data.inventory.reduce((n,p)=>n+p[loc],0);}
  const waiting=data.transfers.filter(t=>t.destination==='cornwall'&&t.status==='awaiting_delivery'&&t.transfer_type!=='cornwall_insert_spare');
  $('transferTransit').textContent=waiting.reduce((n,t)=>n+Number(t.qty||0),0);
  $('transferAvailable').textContent=p?`${p[source]} available at ${names[source]}`:'Choose a product to check its stock.';
  $('transferQty').max=p?p[source]:0;
  $('transferSummary').textContent=p&&quantity>0&&source!==destination?`${quantity} × ${p.name}: ${names[source]} → ${names[destination]}. ${destination==='cornwall'?'Leaves source stock now; Cornwall stock increases after receipt.':'Updates both locations immediately.'}`:'Choose a product, quantity and two different locations.';
  $('transferConfirm').disabled=busy||!online||!!pending||!p||source===destination||!Number.isInteger(quantity)||quantity<1||quantity>p[source];
  $('transferConfirm').textContent=destination==='cornwall'?'Send · Awaiting Delivery':'Confirm stock transfer';
  for(const id of ['transferProduct','transferSource','transferDestination','transferQty','transferMinus','transferPlus'])$(id).disabled=busy||!online||!!pending;
  $('transferRetry').hidden=!pending;$('transferRetry').disabled=busy||!online;
  // Preserve checked receipt confirmations while stock refreshes.
  const checked=new Set([...document.querySelectorAll('[data-receive-check]:checked')].map(x=>x.dataset.receiveCheck));
  $('transferWaiting').innerHTML=waiting.length?waiting.map(t=>`<article class="transfer-pending"><div><strong>${esc(t.name||t.sku)} × ${Number(t.qty)}</strong><div class="small">${esc(names[t.source]||'Packing')} → Cornwall</div></div><label class="transfer-check"><input type="checkbox" data-receive-check="${esc(t.id)}" ${checked.has(t.id)?'checked':''} ${busy||pending?'disabled':''}> All arrived in good condition</label><button class="btn secondary" data-receive="${esc(t.id)}" ${busy||!online||pending||!checked.has(t.id)?'disabled':''}>Confirm received</button><a class="small" href="deliveries.html">Damage or delivery check →</a></article>`).join(''):'<p class="small">No finished stock is awaiting Cornwall delivery.</p>';
  const query=$('transferSearch').value.trim().toLowerCase();
  $('transferStockRows').innerHTML=data.inventory.filter(p=>`${p.sku} ${p.name}`.toLowerCase().includes(query)).map(p=>`<tr><td>${esc(p.name)}<div class="small">${esc(p.sku)}</div></td><td data-label="Boat">${p.boat}</td><td data-label="Cornwall">${p.cornwall}</td><td data-label="Warehouse">${p.warehouse}</td><td data-label="Total">${p.boat+p.cornwall+p.warehouse}</td></tr>`).join('')||'<tr><td colspan="5">No matching products.</td></tr>';
  $('transferHistory').innerHTML=data.transfers.filter(t=>t.transfer_type==='location_stock').slice(0,30).map(t=>`<tr><td>${esc(t.name||t.sku)}<div class="small">${esc(t.sku)}</div></td><td data-label="Route">${esc(names[t.source])} → ${esc(names[t.destination])}</td><td data-label="Quantity">${Number(t.qty)}</td><td data-label="Status">${t.status==='awaiting_delivery'?'Awaiting Delivery':'Received'}</td><td data-label="When">${esc(new Date(t.dispatched_at).toLocaleString('en-GB'))}</td></tr>`).join('')||'<tr><td colspan="5">Stock transfers will appear here.</td></tr>';
 }
 function accept(fresh){const old=$('transferProduct').value;data=fresh;online=true;$('transferProduct').innerHTML='<option value="">Choose product</option>'+data.inventory.map(p=>`<option value="${esc(p.sku)}">${esc(p.sku)} · ${esc(p.name)}</option>`).join('');$('transferProduct').value=old;render();}
 async function refresh(){if(busy||document.hidden)return;const version=revision;try{const fresh=await api('/stock/locations');if(version!==revision||busy)return;if(!online&&!pending)status('Stock connected. Select a route to transfer finished items.');accept(fresh);}catch(e){if(version!==revision)return;online=false;status('Stock could not refresh. Reconnecting…',true);render();}}
 async function send(path,body){
  if(busy||!online)return;
  if(!pending){try{remember({path,body:{...body,request_id:crypto.randomUUID()}});}catch(_){status('Browser storage is unavailable. Enable it before transferring stock so retries stay safe.',true);return;}}
  busy=true;revision++;render();
  try{const saved=await api(pending.path,pending.body);const receipt=pending.path.endsWith('/receive');remember(null);accept(saved);$('transferQty').value=1;status(receipt?'Delivery received. Cornwall stock updated.':'Transfer saved. Stock totals are up to date.');}
  catch(e){if(e.definite)remember(null);status((e.name==='AbortError'?'The confirmation timed out.':e.message)+(pending?' Use Retry confirmation; it will not move the stock twice.':''),true);}
  finally{busy=false;render();}
 }
 $('transferForm').onsubmit=e=>{e.preventDefault();if($('transferConfirm').disabled)return;send('/stock/transfers',{sku:product().sku,source:$('transferSource').value,destination:$('transferDestination').value,quantity:Number($('transferQty').value)});};
 $('transferRetry').onclick=()=>send();
 for(const id of ['transferProduct','transferSource','transferDestination'])$(id).onchange=render;
 $('transferQty').oninput=render;$('transferSearch').oninput=render;
 $('transferMinus').onclick=()=>{$('transferQty').value=Math.max(1,Number($('transferQty').value)-1);render();};
 $('transferPlus').onclick=()=>{$('transferQty').value=Math.min(product()?.[$('transferSource').value]||0,Number($('transferQty').value)+1);render();};
 $('transferWaiting').onchange=render;
 $('transferWaiting').onclick=e=>{const b=e.target.closest('[data-receive]');if(b&&!b.disabled)send('/stock/transfers/receive',{transfer_id:b.dataset.receive,all_good:true});};
 await refresh();if(pending){status('An earlier confirmation needs checking. Retry it to recover safely.',true);render();}
 const timer=setInterval(refresh,5000);window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
}
