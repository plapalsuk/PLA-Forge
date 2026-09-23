async function mixedPackingPage() {
  const $ = id => document.getElementById(id);
  const steps = ['Set out clear boxes', 'Add bottom cards', 'Add matching inserts', 'Place the Pals', 'Close the boxes'];
  const labels = {boat:'Boat',cornwall:'Cornwall',warehouse:'Warehouse',van:'Van'};
  let data = null, products = [], selected = null, busy = false, online = false, cameraStream = null, cameraVideo = null, barcodeDetector = null, qrScanner = null, qrVideo = null, zxingControls = null, zxingReader = null, zxingVideo = null, cameraRunning = false, nativeLoopToken = 0, nativeFallbackTimer = null, quaggaFallbackTimer = null, scannerKeyBuffer = '', scannerLastKeyAt = 0, revision = 0;
  const pendingKey = 'forge-test-packing-pending-v1';
  let pending = null;
  try { pending = JSON.parse(localStorage.getItem(pendingKey) || 'null'); } catch (_) {}
  function message(text, error = false) { $('mixedStatus').textContent = text; $('mixedStatus').classList.toggle('stock-bad',error); }
  function setScannerEngine(text) { $('mixedScannerEngineStatus').textContent = `Scanner engine: ${text}`; }
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
    return Math.min(data.batch.quantity-data.batch.allocated,assembled(p),amount(s.inserts?.[p.sku]?.ready),...['clear_boxes','bottom_cards'].map(k=>amount(s.consumables?.[k]?.stock)));
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
    $('mixedScanHint').textContent=!b?'Start a batch to begin scanning.':b.step<5?'Finish the five preparation steps, then scan a completed box.':'Scan a SKU, choose a quantity and confirm its destination.';
    const scanDisabled=busy||!online||!!pending||!b||b.step<5||!!selected;
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
      $('mixedLocations').textContent=`Boat: ${amount(s.finishedStock?.boat?.[selected.sku])} · Warehouse: ${amount(s.finishedStock?.warehouse?.[selected.sku])} · Van: ${amount(s.finishedStock?.van?.[selected.sku])} · Cornwall awaiting delivery: ${(s.transfers||[]).filter(t=>t.sku===selected.sku&&t.destination==='cornwall'&&t.status==='awaiting_delivery'&&t.transfer_type!=='cornwall_insert_spare').reduce((n,t)=>n+amount(t.qty),0)}`;
    }
    const qty=Number($('mixedQty').value), dest=$('mixedDestination').value;
    $('mixedConfirm').disabled=busy||!online||!!pending||!selected||!b||b.step!==5||!Number.isInteger(qty)||qty<1||qty>available(selected)||!labels[dest];
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
    if(busy||pending||selected||!data?.batch||data.batch.step!==5)return;
    if(nativeFallbackTimer){clearTimeout(nativeFallbackTimer);nativeFallbackTimer=null;}if(quaggaFallbackTimer){clearTimeout(quaggaFallbackTimer);quaggaFallbackTimer=null;}
    const raw=String(code).trim().toUpperCase();
    const clean=(raw.match(/\bPLA\d{3,}\b/)||[raw])[0];
    const p=products.find(p=>p.type==='pal'&&p.sku.toUpperCase()===clean);
    if(!p){message('Unknown SKU. Scan the barcode on a Pal box or enter its SKU.',true);return;}
    selected=p;stopCamera();$('mixedQty').value=1;$('mixedDestination').value='';
    $('mixedScanInput').value='';message(`Selected ${p.name}. Choose how many completed boxes and where they should go.`);render();$('mixedQty').focus();
  }
  async function confirmAllocation() {
    if(busy||!online)return;
    if(!pending) {
      const quantity=Number($('mixedQty').value),destination=$('mixedDestination').value;
      if(!selected||!data.batch||data.batch.step!==5||!Number.isInteger(quantity)||quantity<1||quantity>available(selected)||!labels[destination])return;
      try {setPending({request_id:crypto.randomUUID(),batch_id:data.batch.id,sku:selected.sku,quantity,destination});}
      catch(e){message('Browser storage is unavailable. Enable it before confirming so retries stay safe.',true);return;}
    }
    busy=true;revision++;render();
    try {
      const result=await api('/packing/allocate',pending);
      data=result;online=true;
      const a=result.allocation;
      if(a.destination!=='cornwall') {
        await api('/shopify/inventory/dispatch',{sku:a.sku,location:a.destination,qty:Number(a.quantity),transfer_id:a.id});
      }
      setPending(null);$('mixedQty').value=1;$('mixedDestination').value='';
      message(`${a.quantity} × ${a.name} ${a.destination==='cornwall'?'sent to Cornwall · Awaiting Delivery':`added to ${labels[a.destination]} stock and Shopify`}.${!data.batch?' Batch complete.':''}`);
    }catch(e){
      if(e.definite)setPending(null);
      message((e.name==='AbortError'?'The confirmation timed out.':e.message)+(pending?' Use Retry confirmation; it will not count the allocation twice.':''),true);
    }finally{busy=false;render();}
  }
  function stopNativeCamera() {
    nativeLoopToken++;
    if(nativeFallbackTimer){clearTimeout(nativeFallbackTimer);nativeFallbackTimer=null;}
    if(cameraStream){try{cameraStream.getTracks().forEach(t=>t.stop());}catch(_){}}
    cameraStream=null;
    if(cameraVideo){try{cameraVideo.pause();cameraVideo.srcObject=null;cameraVideo.remove();}catch(_){}}
    cameraVideo=null; barcodeDetector=null;
  }
  function stopZXingScanner() {
    if(zxingControls){try{zxingControls.stop();}catch(_){}}zxingControls=null;
    if(zxingReader){try{zxingReader.reset();}catch(_){}}zxingReader=null;
    if(zxingVideo){try{zxingVideo.pause();zxingVideo.srcObject=null;zxingVideo.remove();}catch(_){}}zxingVideo=null;
  }
  function stopFastQrScanner() {
    if(qrScanner){try{qrScanner.stop();qrScanner.destroy();}catch(_){}}qrScanner=null;
    if(qrVideo){try{qrVideo.pause();qrVideo.srcObject=null;qrVideo.remove();}catch(_){}}qrVideo=null;
  }
  async function stopCamera() {
    cameraRunning=false;stopNativeCamera();stopFastQrScanner();stopZXingScanner();
    if(quaggaFallbackTimer){clearTimeout(quaggaFallbackTimer);quaggaFallbackTimer=null;}
    if(window.Quagga){try{Quagga.stop();Quagga.offDetected();}catch(_){}}
    $('mixedCamera').hidden=true;$('mixedCameraStop').hidden=true;
    $('mixedCamera').innerHTML='<div class="mixed-scanner-target"><span></span></div>';setScannerEngine('stopped');render();
  }
  async function startNativeBarcodeDetector() {
    if(!('BarcodeDetector' in window)||!navigator.mediaDevices?.getUserMedia)return false;
    let formats=[];try{if(BarcodeDetector.getSupportedFormats)formats=await BarcodeDetector.getSupportedFormats();}catch(_){}
    const wanted=['qr_code','code_128'];
    const supported=formats.length?wanted.filter(format=>formats.includes(format)):wanted;
    if(!supported.length)return false;
    barcodeDetector=new BarcodeDetector({formats:supported});
    cameraStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}},audio:false});
    if(!cameraRunning){stopNativeCamera();return false;}
    cameraVideo=document.createElement('video');cameraVideo.muted=true;cameraVideo.autoplay=true;cameraVideo.setAttribute('playsinline','');cameraVideo.srcObject=cameraStream;
    $('mixedCamera').append(cameraVideo);await cameraVideo.play();
    const token=++nativeLoopToken;setScannerEngine(`native ${supported.includes('qr_code')?'QR + ':''}Code 128 detector active`);
    const tick=async()=>{if(!cameraRunning||token!==nativeLoopToken||!cameraVideo||!barcodeDetector)return;try{if(cameraVideo.readyState>=2){const found=await barcodeDetector.detect(cameraVideo);const code=String(found?.[0]?.rawValue||'').trim();if(code)selectCode(code);}}catch(_){}window.setTimeout(tick,120);};
    tick();
    // Some Chromium builds expose BarcodeDetector but do not reliably decode
    // every QR or Code 128 image. Try ZXing's multi-format reader before the
    // Code-128-only Quagga fallback.
    nativeFallbackTimer=window.setTimeout(async()=>{
      if(!cameraRunning||token!==nativeLoopToken||selected)return;
      stopNativeCamera();
      try{if(await startZXingScanner())message('Using the backup QR and barcode scanner. Hold the full code inside the scan window.');else throw new Error('Multi-format scanner unavailable');}
      catch(e){try{await startQuaggaScanner();message('Using the barcode backup. Hold the full Code 128 barcode inside the scan window.');}catch(error){await stopCamera();message(error?.message||'Camera scanner stopped unexpectedly.',true);}}
    },5000);
    return true;
  }
  async function improveCameraFocus(video) {
    const tune=async()=>{
      const track=video?.srcObject?.getVideoTracks?.()[0];
      const caps=track?.getCapabilities?.();
      if(!track||!caps)return;
      const advanced={};
      if(Array.isArray(caps.focusMode)&&caps.focusMode.includes('continuous'))advanced.focusMode='continuous';
      if(Number(caps.zoom?.max||0)>1)advanced.zoom=Math.min(Number(caps.zoom.max),2);
      if(Object.keys(advanced).length)try{await track.applyConstraints({advanced:[advanced]});}catch(_){}
    };
    video?.addEventListener?.('loadedmetadata',tune,{once:true});
    window.setTimeout(tune,700);
  }
  async function startFastQrScanner() {
    if(!window.QrScanner)return false;
    qrVideo=document.createElement('video');qrVideo.muted=true;qrVideo.autoplay=true;qrVideo.setAttribute('playsinline','');$('mixedCamera').append(qrVideo);
    // Keep processing within the visible square. The library uses an optimised
    // worker on iPhone, so scans continue without locking up the page.
    const scanRegion=video=>{
      const width=video.videoWidth||720, height=video.videoHeight||720;
      const side=Math.max(160,Math.floor(Math.min(width,height)*.88));
      return {x:Math.floor((width-side)/2),y:Math.floor((height-side)/2),width:side,height:side,downScaledWidth:Math.min(720,side),downScaledHeight:Math.min(720,side)};
    };
    window.QrScanner.WORKER_PATH='https://unpkg.com/qr-scanner@1.4.2/qr-scanner-worker.min.js';
    qrScanner=new window.QrScanner(qrVideo,result=>{
      const code=typeof result==='string'?result:result?.data;
      if(code)selectCode(code);
    },{preferredCamera:'environment',maxScansPerSecond:25,calculateScanRegion:scanRegion,returnDetailedScanResult:true,highlightScanRegion:false,highlightCodeOutline:false});
    await qrScanner.start();
    improveCameraFocus(qrVideo);
    setScannerEngine('fast QR scanner active');
    return true;
  }
  async function startZXingScanner() {
    if(!window.ZXingBrowser?.BrowserMultiFormatReader)return false;
    zxingVideo=document.createElement('video');zxingVideo.muted=true;zxingVideo.autoplay=true;zxingVideo.setAttribute('playsinline','');$('mixedCamera').append(zxingVideo);
    const QRReader=window.ZXingBrowser.BrowserQRCodeReader;
    zxingReader=QRReader?new QRReader():new ZXingBrowser.BrowserMultiFormatReader();
    zxingControls=await zxingReader.decodeFromConstraints({video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}},audio:false},zxingVideo,result=>{if(result)selectCode(result.getText());});
    improveCameraFocus(zxingVideo);
    setScannerEngine(QRReader?'ZXing QR scanner active':'ZXing multi-format scanner active');return true;
  }
  function startQuaggaScanner(insertScannerCompatibility=false) {
    return new Promise((resolve,reject)=>{
      if(!window.Quagga)return reject(new Error('Quagga scanner library unavailable'));
      try{Quagga.offDetected();}catch(_){}
      Quagga.onDetected(result=>{const code=String(result?.codeResult?.code||'').replace(/[^A-Za-z0-9_-]/g,'').trim();if(code)selectCode(code);});
      const config=insertScannerCompatibility?{inputStream:{name:'Live',type:'LiveStream',target:$('mixedCamera'),constraints:{facingMode:'environment',width:{min:640,ideal:1280},height:{min:480,ideal:720}}},decoder:{readers:['code_128_reader']},locate:true,locator:{patchSize:'medium',halfSample:true},frequency:10}:{inputStream:{name:'Live',type:'LiveStream',target:$('mixedCamera'),constraints:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}},area:{top:'10%',right:'3%',left:'3%',bottom:'10%'}},decoder:{readers:['code_128_reader'],multiple:false},locate:true,locator:{patchSize:'medium',halfSample:false},numOfWorkers:0,frequency:12};
      Quagga.init(config,error=>{
        if(error)return reject(error);try{Quagga.start();setScannerEngine(insertScannerCompatibility?'Insert Scanner compatibility mode active':'Quagga Code 128 detector active');if(!insertScannerCompatibility){quaggaFallbackTimer=window.setTimeout(async()=>{if(!cameraRunning||selected)return;try{Quagga.stop();Quagga.offDetected();await startQuaggaScanner(true);message('Using Insert Scanner compatibility mode. Hold the full barcode inside the scan window.');}catch(e){await stopCamera();message(e?.message||'Camera scanner stopped unexpectedly.',true);}},6000);}resolve(true);}catch(e){reject(e);}
      });
    });
  }
  async function startCamera() {
    if(cameraRunning||busy||selected||pending)return;
    cameraRunning=true;$('mixedCamera').hidden=false;$('mixedCameraStop').hidden=false;render();setScannerEngine('starting');
    try {
      try { const fastQrStarted=await startFastQrScanner();if(!fastQrStarted){const nativeStarted=await startNativeBarcodeDetector();if(!nativeStarted){const zxingStarted=await startZXingScanner();if(!zxingStarted)await startQuaggaScanner();}} }
      catch(scannerError){stopFastQrScanner();stopNativeCamera();stopZXingScanner();try{const nativeStarted=await startNativeBarcodeDetector();if(!nativeStarted){const zxingStarted=await startZXingScanner();if(!zxingStarted)await startQuaggaScanner();}}catch(fallbackError){throw new Error(fallbackError?.message||scannerError?.message||'Camera could not start.');}}
      message('Camera ready. Centre the QR code inside the square for a fast scan.');
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
  // USB/Bluetooth scanners normally behave like a fast keyboard. Capturing
  // their completed burst at page level means a scan still works if focus has
  // moved away from the text input during packing.
  const usbScannerListener=e=>{
    const now=Date.now();
    if(e.key==='Enter'){
      if(scannerKeyBuffer.length>=3&&now-scannerLastKeyAt<120){e.preventDefault();selectCode(scannerKeyBuffer);}
      scannerKeyBuffer='';scannerLastKeyAt=0;return;
    }
    if(e.key.length!==1||e.ctrlKey||e.metaKey||e.altKey)return;
    scannerKeyBuffer=now-scannerLastKeyAt<80?scannerKeyBuffer+e.key:e.key;
    scannerLastKeyAt=now;
  };
  document.addEventListener('keydown',usbScannerListener);
  $('mixedMinus').onclick=()=>{$('mixedQty').value=Math.max(1,Number($('mixedQty').value)-1);render();};
  $('mixedPlus').onclick=()=>{$('mixedQty').value=Math.min(available(selected),Number($('mixedQty').value)+1);render();};
  $('mixedQty').oninput=render;$('mixedDestination').onchange=render;
  $('mixedConfirm').onclick=confirmAllocation;$('mixedRetry').onclick=confirmAllocation;
  $('mixedNext').onclick=()=>{if(busy||pending)return;selected=null;render();$('mixedScanInput').focus();};
  $('mixedCameraStart').onclick=startCamera;$('mixedCameraStop').onclick=stopCamera;
  window.addEventListener('pagehide',()=>{document.removeEventListener('keydown',usbScannerListener);stopCamera();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopCamera();else refresh();});
  products=await load('products');await refresh();
  if(pending){selected=products.find(p=>p.sku===pending.sku);$('mixedQty').value=pending.quantity;$('mixedDestination').value=pending.destination;message('An earlier confirmation needs checking. Use Retry confirmation to recover it safely.',true);render();}
  const timer=setInterval(refresh,5000);window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
}
