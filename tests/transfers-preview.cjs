const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
exports.startPreview=async(mf,db,token)=>{
 const state={stock_revision:0,assembled:{PLA001:10,PLA002:5},inserts:{PLA001:{ready:10},PLA002:{ready:5}},stock:{PLA001:{boat:20,cornwall:10,warehouse:30},PLA002:{boat:2,cornwall:3,warehouse:8}},finishedStock:{boat:{PLA001:20,PLA002:2},cornwall:{PLA001:10,PLA002:3},warehouse:{PLA001:30,PLA002:8}},transfers:[],packingHistory:[],productAvailability:{PLA001:{on_sale:true},PLA002:{on_sale:true}},targets:{}};
 await db.prepare("UPDATE forge_operational_state SET json_value=? WHERE state_key='production'").bind(JSON.stringify(state)).run();
 await db.exec("DELETE FROM forge_settings;\nDELETE FROM stock_transfer_requests;\nDELETE FROM packing_batches;\nDELETE FROM packing_allocations;\nUPDATE consumables SET stock=50;");
 const products=[{sku:'PLA001',name:'Test Fox',type:'pal',recipe_ready:true,on_sale:true},{sku:'PLA002',name:'Test Otter',type:'pal',recipe_ready:true,on_sale:true}];
 const shim=`<script>forgeBoot=async fn=>{document.body.classList.remove('forge-protected','forge-auth-checking');await fn();};cloudApiBase=()=>location.origin+'/api';cloudToken=()=>${JSON.stringify(token)};load=async()=>${JSON.stringify(products)};installForgeCloudSyncBadge=()=>{};startForgeLiveSync=async()=>{};hydrateProductionCloud=async()=>{const d=await cloudFetch('/stock/locations');forgeCloudOperationalState=d.state;forgeCloudOperationalState.productAvailability={PLA001:{on_sale:true},PLA002:{on_sale:true}};forgeCloudOperationalState.targets={};forgeProductionCloudReady=true;return forgeCloudOperationalState;};</script>`;
 let drop=false;
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/fixture/drop-next-response'){drop=true;res.end('Next transfer response will be dropped in the local fixture.');return;}
  if(url.pathname.startsWith('/api/')){
   let body='';for await(const c of req)body+=c;
   if(url.pathname==='/api/settings'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({settings:{stock_target_defaults:{boat:3,cornwall:3,warehouse:0}},printers:[]}));return;}
   const response=await mf.dispatchFetch('http://localhost'+req.url.slice(4),{method:req.method,headers:req.headers,body:body||undefined});const text=await response.text();
   if(drop&&url.pathname==='/api/stock/transfers'){drop=false;req.socket.destroy();return;}
   res.writeHead(response.status,{'Content-Type':'application/json'});res.end(text);return;
  }
  let file=path.resolve('.'+(url.pathname==='/'?'/transfers.html':url.pathname));
  if(!file.startsWith(process.cwd()+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end('Not found');return;}
  let data=fs.readFileSync(file);if(file.endsWith('.html'))data=data.toString().replace(/(<script src="assets\/forge.js[^\"]*"><\/script>)/,'$1'+shim);
  res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'application/octet-stream');res.end(data);
 }catch(e){res.writeHead(500);res.end(e.message);}});
 await new Promise(r=>server.listen(8789,'127.0.0.1',r));console.log('Local transfers fixture ready at http://127.0.0.1:8789/transfers.html');await new Promise(()=>{});
};
