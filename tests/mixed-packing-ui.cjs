const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
exports.checkUI=async function(mf,db,token,initial){
  const {chromium}=require('/Users/jacobdlm-g/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  await db.exec('DELETE FROM packing_allocations;\nDELETE FROM packing_batches;\nDELETE FROM consumable_history;\nUPDATE consumables SET stock=50;');
  await db.prepare("UPDATE forge_operational_state SET json_value=? WHERE state_key='production'").bind(JSON.stringify(initial)).run();
  const shared=fs.readFileSync('assets/forge.js','utf8');
  const helpers=shared.slice(shared.indexOf('function packingKpiSummary('),shared.indexOf('async function packingStationPage('));
  const html=fs.readFileSync('packing-station.html','utf8').replace(/<script src="assets\/forge.js[^\"]*"><\/script>/,`<script>const esc=s=>String(s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));const cloudApiBase=()=>location.origin+'/api';const cloudToken=()=>${JSON.stringify(token)};const load=async()=>[{sku:'PLA001',name:'Test Fox',type:'pal'},{sku:'PLA002',name:'Test Otter',type:'pal'}];const forgeBoot=fn=>{document.body.classList.remove('forge-protected');return fn();};${helpers}</script>`).replace(/<script src="https:[^\"]*"><\/script>/g,'');
  let loseResponse=false;
  const server=http.createServer(async(req,res)=>{
    try{
      if(req.url.startsWith('/api/')){
        let body='';for await(const chunk of req)body+=chunk;
        const r=await mf.dispatchFetch('http://localhost'+req.url.slice(4),{method:req.method,headers:req.headers,body:body||undefined});
        const text=await r.text();
        if(loseResponse&&req.url==='/api/packing/allocate'){loseResponse=false;req.socket.destroy();return;}
        res.writeHead(r.status,{'Content-Type':'application/json'});res.end(text);return;
      }
      const url=new URL(req.url,'http://localhost');
      if(url.pathname==='/'||url.pathname==='/packing-station.html'){res.setHeader('Content-Type','text/html');res.end(html);return;}
      const p=path.join(process.cwd(),url.pathname);
      if(!p.startsWith(process.cwd())||!fs.existsSync(p)){res.writeHead(404);res.end();return;}
      res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':p.endsWith('.png')?'image/png':'text/plain');res.end(fs.readFileSync(p));
    }catch(e){res.writeHead(500);res.end(e.message);}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1100}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.getByRole('button',{name:'Start batch',exact:true}).click();
    await page.getByText('Mixed batch · 40 boxes').waitFor();
    for(let step=1;step<=3;step++)await page.locator(`[data-mixed-step="${step}"]`).click();
    await page.reload();await page.locator('[data-mixed-step="4"]').waitFor();
    for(let step=4;step<=6;step++)await page.locator(`[data-mixed-step="${step}"]`).click();
    await page.locator('#mixedScanInput').fill('PLA001');await page.getByRole('button',{name:'Find Pal',exact:true}).click();
    await page.locator('#mixedQty').fill('15');await page.locator('#mixedDestination').selectOption('boat');
    await page.locator('#mixedConfirm').click();await page.getByText('15 allocated · 25 remaining').waitFor();
    await page.locator('#mixedQty').fill('10');await page.locator('#mixedDestination').selectOption('warehouse');
    loseResponse=true;await page.locator('#mixedConfirm').click();await page.locator('#mixedRetry').waitFor();
    await page.reload();await page.locator('#mixedRetry').click();await page.getByText('25 allocated · 15 remaining').waitFor();
    await page.locator('#mixedNext').click();await page.locator('#mixedScanInput').fill('PLA002');await page.locator('#mixedScanButton').click();
    await page.locator('#mixedQty').fill('16');await page.locator('#mixedDestination').selectOption('cornwall');assert.equal(await page.locator('#mixedConfirm').isDisabled(),true);
    await page.locator('#mixedQty').fill('15');
    await page.screenshot({path:'/tmp/pla-forge-mixed-packing-desktop.png',fullPage:true});
    await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/pla-forge-mixed-packing-mobile.png',fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'No mobile horizontal overflow');
    await page.locator('#mixedConfirm').click();await page.getByRole('button',{name:'Start batch',exact:true}).waitFor();
    const state=JSON.parse((await db.prepare("SELECT json_value FROM forge_operational_state WHERE state_key='production'").first()).json_value);
    assert.equal(state.finishedStock.boat.PLA001,15);assert.equal(state.finishedStock.warehouse.PLA001,10);assert.equal(state.transfers.at(-1).status,'awaiting_delivery');assert.equal(state.assembled.PLA001,5);
    assert.deepEqual(errors,[]);
    console.log('PASS: desktop/mobile UI, six steps, reload resume, scan selection, quantity limit, three destinations, lost-response retry after reload, and exact final stock.');
  }finally{await browser.close();await new Promise(r=>server.close(r));}
};
