async function mixedPackingPage() {
  const $ = id => document.getElementById(id);
  const steps = ['Set out clear boxes', 'Add bottom cards', 'Add stickers', 'Add matching inserts', 'Place the Pals', 'Close the boxes'];
  const labels = {boat:'Boat',cornwall:'Cornwall',warehouse:'Warehouse'};
  let data = null, products = [], selected = null, busy = false, online = false, cameraStream = null, cameraRunning = false, revision = 0;
  const pendingKey = 'forge-test-packing-pending-v1';
  let pending = null;
  try { pending = JSON.parse(localStorage.getItem(pendingKey) || 'null'); } catch (_) {}
  function message(text, error = false) { $('mixedStatus').textContent = text; $('mixedStatus').classList.toggle('stock-bad',error); }
  async function api(path, body) {
    const controller = new AbortController(), timer = setTimeout(()=>controller.abort(),20000);
    try {
      const response = await fetch(cloudApiBase()+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${cloudToken()}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:controller.signal,cache:'no-store'});
      const result = await response.json();
      if (!response.ok) throw Object.assign(new Error(result.detail||result.error||'Unable to save packing.'),{definite:response.status>=400&&response.status<500&&![408,429].includes(response.status)});
      return result;
    } finally { clearTimeout(timer); }
  }
  function setPending(value) {
    // Persist before sending: a reload after a lost response must reuse the same ID.
    if (value) localStorage.setItem(pendingKey,JSON.stringify(value)); else localStorage.removeItem(pendingKey);
    pending=value;
  }
  function amount(v) { const n=Number(v); return Number.isFinite(n)?Math.max(0,Math.floor(n)):0; }
  function assembled(p) { return amount(data?.state?.assembled?.[p.sku]??data?.state?.assemblyStock?.[p.sku]??data?.state?.benchStock?.[p.sku]); }
  function available(p) {
    if (!data?.batch || !p) return 0;
    const s=data.state;
    return Math.min(data.batch.quantity-data.batch.allocated,assembled(p),amount(s.inserts?.[p.sku]?.ready),...['clear_boxes','bottom_cards','stickers'].map(k=>amount(s.consumables?.[k]?.stock)));
  }
  function render() {
    if (!data) return;
    const b=data.batch, s=data.state;
    renderPackingKpis(s,products.filter(p=>p.type==='pal'));
    $('mixedStart').hidden=!!b;
    $('mixedBatch').hidden=!b;
    $('mixedStartButton').disabled=busy||!online||!!pending;
    $('mixedNewQty').disabled=busy||!!pending;
    if (b) {
      $('mixedBatchTitle').textContent=`Mixed batch · ${b.quantity} boxes`;
      $('mixedBatchCount').textContent=`${b.allocated} allocated · ${b.quantity-b.allocated} remaining`;
      $('mixedProgress').max=b.quantity; $('mixedProgress').value=b.allocated;
      $('mixedSteps').innerHTML=steps.map((step,i)=>`<li class="${b.step>i?'done':b.step===i?'current':''}"><span class="mixed-step-number">${b.step>i?'✓':i+1}</span><span>${step}</span>${b.step===i?`<button class="btn secondary" data-mixed-step="${i+1}" ${busy||!online||pending?'disabled':''}>Done for all ${b.quantity}</button>`:''}</li>`).join('');
    }
    $('mixedScanHint').textContent=!b?'Start a batch to begin scanning.':b.step<6?'Finish the six preparation steps, then scan a completed box.':'Scan a SKU, choose a quantity and confirm its destination.';
    const scanDisabled=busy||!online||!!pending||!b||b.step<6||!!selected;
    $('mixedScanInput').disabled=scanDisabled;
    $('mixedScanButton').disabled=scanDisabled;
    $('mixedCameraStart').disabled=scanDisabled||cameraRunning;
    $('mixedSelection').hidden=!selected;
    if(selected) {
      $('mixedPalName').textContent=selected.name;
      $('mixedPalSku').textContent=selected.sku;
      const limit=available(selected);
      $('mixedQty').max=limit;
      $('mixedAvailable').textContent=`${limit} can be allocated · ${assembled(selected)} assembled · ${amount(s.inserts?.[selected.sku]?.ready)} matching inserts`;
      $('mixedLocations').textContent=`Boat: ${amount(s.finishedStock?.boat?.[selected.sku])} · Warehouse: ${amount(s.finishedStock?.warehouse?.[selected.sku])} · Cornwall awaiting delivery: ${(s.transfers||[]).filter(t=>t.sku===selected.sku&&t.destination==='cornwall'&&t.status==='awaiting_delivery'&&t.transfer_type!=='cornwall_insert_spare').reduce((n,t)=>n+amount(t.qty),0)}`;
    }
    const qty=Number($('mixedQty').value), dest=$('mixedDestination').value;
    $('mixedConfirm').disabled=busy||!online||!!pending||!selected||!b||b.step!==6||!Number.isInteger(qty)||qty<1||qty>available(selected)||!labels[dest];
    for(const id of ['mixedQty','mixedMinus','mixedPlus','mixedDestination','mixedNext']) $(id).disabled=busy||!!pending;
    $('mixedConfirm').textContent=dest==='cornwall'?'Confirm · Awaiting Delivery':'Confirm · Add to stock';
    $('mixedDestinationNote').textContent=dest==='cornwall'?'Cornwall stock increases after delivery is received.':dest?`Adds directly to ${labels[dest]} stock.`:'Choose where these completed boxes should go.';
    $('mixedRetry').hidden=!pending;
    $('mixedRetry').disabled=busy||!online;
    $('mixedRecent').innerHTML=data.allocations.length?data.allocations.map(a=>`<tr><td>${esc(a.name)}<div class="small">${esc(a.sku)}</div></td><td data-label="Quantity">${a.quantity}</td><td data-label="Destination">${esc(labels[a.destination])}</td><td data-label="Status">${a.destination==='cornwall'?'Awaiting Delivery':'Added to stock'}</td></tr>`).join(''):'<tr><td colspan="4" class="small">Confirmed allocations will appear here.</td></tr>';
  }
  async function refresh() {
    if(busy||document.hidden)return;
    const version=revision;
    try {
      const fresh=await api('/packing/batch');
      if(version!==revision||busy)return;
      data=fresh;
      if(!online&&!pending)message('Stock connected. Your batch progress is saved automatically.');
      online=true;
      if(data.batch)sessionStorage.removeItem('forge-mixed-start-id');
      render();
    }
    catch(e){online=false;message('Stock could not refresh. Reconnecting…',true);render();}
  }
  async function mutate(path,body,success) {
    if(busy)return;
    busy=true;revision++;render();
    try {
      data=await api(path,body);online=true;
      message(success);return true;
    } catch(e){message(e.name==='AbortError'?'Connection timed out. Retry to check whether it saved.':e.message,true);return false;}
    finally {busy=false;render();}
  }
  function selectCode(code) {
    if(busy||pending||selected||!data?.batch||data.batch.step!==6)return;
    const clean=String(code).trim().toUpperCase();
    const p=products.find(p=>p.type==='pal'&&p.sku.toUpperCase()===clean);
    if(!p){message('Unknown SKU. Scan the barcode on a Pal box or enter its SKU.',true);return;}
    selected=p;stopCamera();$('mixedQty').value=1;$('mixedDestination').value='';
    $('mixedScanInput').value='';message(`Selected ${p.name}. Choose how many completed boxes and where they should go.`);render();$('mixedQty').focus();
  }
  async function confirmAllocation() {
    if(busy||!online)return;
    if(!pending) {
      const quantity=Number($('mixedQty').value),destination=$('mixedDestination').value;
      if(!selected||!data.batch||data.batch.step!==6||!Number.isInteger(quantity)||quantity<1||quantity>available(selected)||!labels[destination])return;
      try {setPending({request_id:crypto.randomUUID(),batch_id:data.batch.id,sku:selected.sku,quantity,destination});}
      catch(e){message('Browser storage is unavailable. Enable it before confirming so retries stay safe.',true);return;}
    }
    busy=true;revision++;render();
    try {
      const result=await api('/packing/allocate',pending);
      data=result;online=true;
      const a=result.allocation;
      setPending(null);$('mixedQty').value=1;$('mixedDestination').value='';
      message(`${a.quantity} × ${a.name} ${a.destination==='cornwall'?'sent to Cornwall · Awaiting Delivery':`added to ${labels[a.destination]} stock`}.${!data.batch?' Batch complete.':''}`);
    }catch(e){
      if(e.definite)setPending(null);
      message((e.name==='AbortError'?'The confirmation timed out.':e.message)+(pending?' Use Retry confirmation; it will not count the allocation twice.':''),true);
    }finally{busy=false;render();}
  }
  async function stopCamera() {
    cameraRunning=false;
    if(cameraStream){cameraStream.getTracks().forEach(t=>t.stop());cameraStream=null;}
    if(window.Quagga){try{Quagga.stop();Quagga.offDetected();}catch(_){}}
    $('mixedCamera').hidden=true;$('mixedCameraStop').hidden=true;
    $('mixedCamera').innerHTML='';render();
  }
  async function startCamera() {
    if(cameraRunning||busy||selected||pending)return;
    cameraRunning=true;$('mixedCamera').hidden=false;$('mixedCameraStop').hidden=false;render();
    try {
      const supported=window.BarcodeDetector?await BarcodeDetector.getSupportedFormats():[];
      if(supported.includes('code_128')) {
        const detector=new BarcodeDetector({formats:['code_128']});
        cameraStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
        if(!cameraRunning){cameraStream.getTracks().forEach(t=>t.stop());cameraStream=null;return;}
        const video=document.createElement('video');video.muted=true;video.setAttribute('playsinline','');video.srcObject=cameraStream;$('mixedCamera').append(video);await video.play();
        const tick=async()=>{if(!cameraRunning)return;try{const found=await detector.detect(video);if(found[0])selectCode(found[0].rawValue);}catch(_){}if(cameraRunning)setTimeout(tick,150);};tick();
      } else {
        if(!window.Quagga)throw new Error('Camera scanning is unavailable. Use a USB/Bluetooth scanner or enter the SKU.');
        await new Promise((resolve,reject)=>Quagga.init({inputStream:{type:'LiveStream',target:$('mixedCamera'),constraints:{facingMode:'environment'}},decoder:{readers:['code_128_reader']},locate:true},e=>e?reject(e):resolve()));
        if(!cameraRunning){Quagga.stop();return;}
        Quagga.onDetected(r=>{if(cameraRunning&&r.codeResult?.code)selectCode(r.codeResult.code);});Quagga.start();
      }
      message('Point the camera at the SKU barcode. Scanning pauses when a Pal is identified.');
    }catch(e){await stopCamera();message(e.message||'Camera could not start. Use a scanner or type the SKU.',true);}
  }
  $('mixedStart').onsubmit=async e=>{
    e.preventDefault();const quantity=Number($('mixedNewQty').value);
    if(!Number.isInteger(quantity)||quantity<1)return;
    let requestId=sessionStorage.getItem('forge-mixed-start-id');if(!requestId){requestId=crypto.randomUUID();sessionStorage.setItem('forge-mixed-start-id',requestId);}
    if(await mutate('/packing/batch/start',{quantity,request_id:requestId},'Batch started. Work through each preparation step.'))sessionStorage.removeItem('forge-mixed-start-id');
  };
  $('mixedSteps').onclick=e=>{const b=e.target.closest('[data-mixed-step]');if(b&&data.batch&&!pending)mutate('/packing/batch/step',{batch_id:data.batch.id,step:Number(b.dataset.mixedStep)},'Preparation step saved.');};
  $('mixedScanForm').onsubmit=e=>{e.preventDefault();selectCode($('mixedScanInput').value);};
  $('mixedMinus').onclick=()=>{$('mixedQty').value=Math.max(1,Number($('mixedQty').value)-1);render();};
  $('mixedPlus').onclick=()=>{$('mixedQty').value=Math.min(available(selected),Number($('mixedQty').value)+1);render();};
  $('mixedQty').oninput=render;$('mixedDestination').onchange=render;
  $('mixedConfirm').onclick=confirmAllocation;$('mixedRetry').onclick=confirmAllocation;
  $('mixedNext').onclick=()=>{if(busy||pending)return;selected=null;render();$('mixedScanInput').focus();};
  $('mixedCameraStart').onclick=startCamera;$('mixedCameraStop').onclick=stopCamera;
  window.addEventListener('pagehide',stopCamera);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopCamera();else refresh();});
  products=await load('products');await refresh();
  if(pending){selected=products.find(p=>p.sku===pending.sku);$('mixedQty').value=pending.quantity;$('mixedDestination').value=pending.destination;message('An earlier confirmation needs checking. Use Retry confirmation to recover it safely.',true);render();}
  const timer=setInterval(refresh,5000);window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
}
