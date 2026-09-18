/* Pal Product Master — editable D1-backed source of truth for every Pal. */
let forgeProductMasterCache=null;
async function cloudProductMaster(force=false){
  if(!force&&forgeProductMasterCache)return forgeProductMasterCache;
  if(!cloudToken())throw new Error('Cloud login required.');
  const [pd,sd]=await Promise.all([cloudFetch('/products'),cloudFetch('/settings')]);
  const base=(pd.products||[]).map(normaliseCloudProduct);
  const saved=(sd.settings&&sd.settings.product_master&&typeof sd.settings.product_master==='object')?sd.settings.product_master:{version:1,products:{}};
  saved.version=1;saved.products=saved.products||{};
  base.forEach(p=>{const old=saved.products[p.sku]||{};saved.products[p.sku]=Object.assign({sku:p.sku,name:p.name,first_name:p.first_name||String(p.name||'').split(' the ')[0],animal:p.animal||'',collection:p.collection||'',description:p.description||'',active:p.active!==false,pal_enabled:true,keyring_enabled:!!p.keyring,sticker_enabled:false,keyring_sku:'',sticker_sku:'',barcode:p.barcode||p.sku,box_insert_pdf:'',keyring_insert_pdf:'',keyring_inserts_per_sheet:7,sticker_sheet_pdf:'',target_boat:0,target_cornwall:0},old);});
  forgeProductMasterCache=saved;return saved;
}
async function saveCloudProductMaster(master){
  master=master||{version:1,products:{}};master.version=1;master.updated_at=new Date().toISOString();
  await cloudFetch('/settings/product_master',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({value:master})});forgeProductMasterCache=master;return master;
}
function applyProductMasterToProduct(p,master){
  const m=master&&master.products?master.products[p.sku]:null;if(!m)return p;
  return Object.assign({},p,{name:m.name||p.name,collection:m.collection||p.collection||'',description:m.description||p.description||'',active:m.active!==false,pal_enabled:m.pal_enabled!==false,keyring:!!m.keyring_enabled,keyring_enabled:!!m.keyring_enabled,keyring_sku:m.keyring_sku||'',sticker_enabled:!!m.sticker_enabled,sticker_sku:m.sticker_sku||'',barcode:m.barcode||p.barcode||p.sku,box_insert_pdf:m.box_insert_pdf||'',keyring_insert_pdf:m.keyring_insert_pdf||'',keyring_inserts_per_sheet:Number(m.keyring_inserts_per_sheet||7),target_boat:Number(m.target_boat||0),target_cornwall:Number(m.target_cornwall||0)});
}
async function productMasterPage(){
  installForgeCloudSyncBadge();
  if(!cloudToken()){showCloudRequiredError('Cloud login required.');return;}
  const $=id=>document.getElementById(id);
  let records=[],selectedSku='',filter='',recipeDraft=[];
  const money=n=>'£'+Number(n||0).toFixed(2);
  const number=id=>Math.max(0,Number($(id).value||0));
  const selected=()=>records.find(x=>x.sku===selectedSku)||null;
  const field=(id,value)=>{$(id).value=value==null?'':value;};
  const checked=(id,value)=>{$(id).checked=!!value;};
  const normalise=row=>Object.assign({},row,{price:Number(row.price||0),on_sale:Number(row.on_sale||0)===1,height_cm:Number(row.height_cm||0),width_cm:Number(row.width_cm||0),depth_cm:Number(row.depth_cm||0),recipes:(row.recipes||[]).map(r=>Object.assign({},r,{part_count:Number(r.part_count||1),weight_g:Number(r.weight_g||0)})),cost:row.cost||{},sales:row.sales||{},demand:row.demand||null});
  async function loadData(keepSku){
    setForgeCloudSync('syncing','Loading Pal Product Master');
    const data=await cloudFetch('/pal-master');
    records=(data.pals||[]).map(normalise);
    const querySku=new URLSearchParams(location.search).get('sku')||'';
    selectedSku=(keepSku&&records.some(x=>x.sku===keepSku))?keepSku:(records.some(x=>x.sku===querySku)?querySku:(records[0]?.sku||''));
    setForgeCloudSync('synced',`Loaded ${records.length} Pal records`);
    drawKpis();drawList();drawDetail();
  }
  function drawKpis(){
    $('pmTotal').textContent=records.length;
    $('pmOnSale').textContent=records.filter(x=>x.on_sale).length;
    $('pmRecipesReady').textContent=records.filter(x=>x.recipes.length).length;
    $('pmPackagingReady').textContent=records.filter(x=>x.packaging&&x.packaging.file_id).length;
  }
  function drawList(){
    const q=filter.toLowerCase();
    const shown=records.filter(x=>`${x.name} ${x.sku} ${x.animal||''} ${x.collection||''}`.toLowerCase().includes(q));
    $('pmListCount').textContent=`${shown.length} of ${records.length} Pals`;
    $('pmPalList').innerHTML=shown.map(x=>`<button type="button" class="pal-master-list-row ${x.sku===selectedSku?'selected':''}" data-sku="${esc(x.sku)}"><span><strong>${esc(x.name)}</strong><small>${esc(x.animal||'Animal not set')} · ${esc(x.collection||'No collection')}</small></span><span><b>${esc(x.sku)}</b>${x.on_sale?'<em>ON SALE</em>':'<em class="off">OFF SALE</em>'}</span></button>`).join('')||'<div class="pal-master-no-results">No matching Pals.</div>';
    $('pmPalList').querySelectorAll('[data-sku]').forEach(button=>button.onclick=()=>{selectedSku=button.dataset.sku;history.replaceState(null,'',`?sku=${encodeURIComponent(selectedSku)}`);drawList();drawDetail();});
  }
  function summaryCard(label,value,detail,cls=''){return `<div class="${cls}"><span>${esc(label)}</span><strong>${esc(String(value))}</strong><small>${esc(detail||'')}</small></div>`;}
  function drawSummary(r){
    const d=r.demand||{};
    $('pmSummary').innerHTML=[summaryCard('Boat Stock',d.boat_stock||0,`Target ${d.boat_target||0}`),summaryCard('Cornwall Stock',d.cornwall_stock||0,`Target ${d.cornwall_target||0}`),summaryCard('Warehouse Stock',d.warehouse_stock||0,`Target ${d.warehouse_target||0}`),summaryCard('Assembled',d.assembled||0,'Awaiting packing'),summaryCard('Awaiting Dispatch',d.awaiting_dispatch||0,'Packed Pals'),summaryCard('Need to Make',d.need_to_make||0,`${d.gross_need||0} gross shortage`,'accent')].join('');
  }
  function recipeRow(row,index){
    return `<div class="newpal-recipe-row"><div class="form-field"><label>Filament</label><input data-r="${index}" data-k="filament_name" value="${esc(row.filament_name||'')}"></div><div class="form-field"><label>Parts / Colour Group</label><input data-r="${index}" data-k="parts" value="${esc(row.parts||'')}"></div><div class="form-field"><label>Grouped STL</label><input data-r="${index}" data-k="grouped_stl" value="${esc(row.grouped_stl||'')}"></div><div class="form-field"><label>Individual STL(s)</label><input data-r="${index}" data-k="separate_stls" value="${esc(row.separate_stls||'')}"></div><div class="form-field small-field"><label>Parts</label><input type="number" min="1" data-r="${index}" data-k="part_count" value="${Number(row.part_count||1)}"></div><div class="form-field small-field"><label>Weight (g)</label><input type="number" min="0" step="0.01" data-r="${index}" data-k="weight_g" value="${Number(row.weight_g||0)}"></div><button type="button" class="iconbtn pmRemoveRecipe" data-r="${index}" title="Remove row">×</button></div>`;
  }
  function drawRecipes(){
    $('pmRecipeRows').innerHTML=recipeDraft.map(recipeRow).join('');
    $('pmRecipeRows').querySelectorAll('input[data-r]').forEach(input=>input.oninput=()=>{const i=Number(input.dataset.r),key=input.dataset.k;recipeDraft[i][key]=['part_count','weight_g'].includes(key)?Number(input.value||0):input.value;drawRecipeTotal();});
    $('pmRecipeRows').querySelectorAll('.pmRemoveRecipe').forEach(button=>button.onclick=()=>{if(recipeDraft.length===1)return;recipeDraft.splice(Number(button.dataset.r),1);drawRecipes();});
    drawRecipeTotal();
  }
  function drawRecipeTotal(){$('pmRecipeWeight').textContent=recipeDraft.reduce((sum,row)=>sum+Number(row.weight_g||0),0).toFixed(1)+'g';}
  function drawProfit(){const price=number('pmPrice'),cost=number('pmCost'),profit=price-cost,margin=price>0?(profit/price*100):0;$('pmProfit').textContent=money(profit);$('pmProfit').className=profit<0?'danger-text':'';$('pmMargin').textContent=`${margin.toFixed(1)}% margin`;}
  function infoRows(rows){return `<div class="pal-master-info-list">${rows.map(([label,value])=>`<div><span>${esc(label)}</span><strong>${value}</strong></div>`).join('')}</div>`;}
  function drawDetail(){
    const r=selected();$('pmEmpty').hidden=!!r;$('pmDetail').hidden=!r;if(!r)return;
    $('pmTitle').textContent=r.name;$('pmSkuHeading').textContent=`${r.sku} · ${r.collection||'No collection'}`;
    $('pmHeaderBadges').innerHTML=`${badge(r.on_sale?'ON SALE':'NOT ON SALE',r.on_sale?'ok':'warning')} ${badge(r.recipes.length?'RECIPE READY':'RECIPE MISSING',r.recipes.length?'ok':'danger')} ${badge(r.packaging?.file_id?'PACKAGING LINKED':'NO PACKAGING',r.packaging?.file_id?'ok':'warning')}`;
    field('pmSku',r.sku);field('pmFirstName',r.first_name);field('pmAnimal',r.animal);field('pmName',r.name);field('pmCollection',r.collection);field('pmBarcode',r.barcode||r.sku);field('pmReleaseDate',r.release_date||'');checked('pmOnSale',r.on_sale);field('pmChar1',r.characteristic_1);field('pmChar2',r.characteristic_2);field('pmChar3',r.characteristic_3);field('pmShortDescription',r.short_description);field('pmFullDescription',r.full_description);field('pmCost',r.cost?.total_cost||0);field('pmPrice',r.price);field('pmHeight',r.height_cm);field('pmWidth',r.width_cm);field('pmDepth',r.depth_cm);
    recipeDraft=r.recipes.map(x=>Object.assign({},x));if(!recipeDraft.length)recipeDraft=[{filament_name:'',parts:'',grouped_stl:'',separate_stls:'',part_count:1,weight_g:0}];drawRecipes();drawProfit();drawSummary(r);
    $('pmImage').innerHTML=r.character_image_url?`<img src="${esc(r.character_image_url)}" alt="${esc(r.name)}"><span>Character image</span>`:'<div class="pal-master-image-empty">No Forge image URL saved yet</div>';
    $('pmPackaging').innerHTML=infoRows([['Status',r.packaging?.file_id?'<span class="badge ok">Linked to Pi</span>':'<span class="badge warning">Not linked</span>'],['File',esc(r.packaging?.file_id||'—')],['Updated',r.packaging?.updated_at?esc(fmtDate(r.packaging.updated_at)):'—']]);
    $('pmPackagingFile').value='';$('pmPackagingUploadStatus').textContent='Choose the final PDF for this Pal.';
    const units=Number(r.sales?.units_sold||0),revenue=Number(r.sales?.revenue||0);
    $('pmCommerce').innerHTML=infoRows([['Shopify',r.demand?.mapped?'<span class="badge ok">Mapped</span>':'<span class="badge warning">Not mapped</span>'],['POS Units Sold',String(units)],['POS Revenue',money(revenue)],['Last POS Sale',r.sales?.last_sale?esc(fmtDate(r.sales.last_sale)):'—']])+`<button type="button" class="btn ghost" id="pmCreateShopify">Create / retry Shopify draft</button><div class="form-field" style="margin-top:12px"><label>Shopify product image</label><input id="pmShopifyImage" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"><div class="small">Choose an image, then attach it to the existing Shopify product.</div></div><button type="button" class="btn ghost" id="pmUploadShopifyImage">Upload Shopify image</button><div class="small" id="pmShopifyStatus">Creates a Shopify draft from this Pal record. A missing product image will not block it.</div>`;
    $('pmCreateShopify').onclick=()=>createShopifyDraft(r);
    $('pmUploadShopifyImage').onclick=()=>uploadShopifyImage(r);
    $('pmRecordInfo').innerHTML=infoRows([['Created',r.created_at?esc(fmtDate(r.created_at)):'—'],['Last Updated',r.updated_at?esc(fmtDate(r.updated_at)):'—'],['Product Type',esc(r.product_type||'pal')],['Recipe Rows',String(r.recipes.length)]]);
    $('pmSaveStatus').textContent='';
  }
  function formPayload(){return {product:{name:$('pmName').value.trim(),first_name:$('pmFirstName').value.trim(),animal:$('pmAnimal').value.trim(),collection:$('pmCollection').value,barcode:$('pmBarcode').value.trim(),release_date:$('pmReleaseDate').value,on_sale:$('pmOnSale').checked,characteristic_1:$('pmChar1').value.trim(),characteristic_2:$('pmChar2').value.trim(),characteristic_3:$('pmChar3').value.trim(),short_description:$('pmShortDescription').value.trim(),full_description:$('pmFullDescription').value.trim(),cost_price:number('pmCost'),price:number('pmPrice'),height_cm:number('pmHeight'),width_cm:number('pmWidth'),depth_cm:number('pmDepth'),character_image_url:selected()?.character_image_url||''},recipes:recipeDraft};}
  async function save(){
    const r=selected();if(!r)return;$('pmSave').disabled=true;$('pmSave').textContent='Saving…';$('pmSaveStatus').textContent='Saving every change to Forge…';
    try{await cloudFetch(`/products/${encodeURIComponent(r.sku)}/master`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(formPayload())});$('pmSaveStatus').textContent='Saved successfully.';setForgeCloudSync('synced',`${r.sku} master record saved`);await loadData(r.sku);}
    catch(error){$('pmSaveStatus').textContent=error.message||'Save failed.';setForgeCloudSync('error',error.message||'Pal master save failed');}
    finally{$('pmSave').disabled=false;$('pmSave').textContent='Save Pal Record';}
  }
  async function deletePal(){
    const r=selected();if(!r)return;
    const warning=`Delete ${r.name} (${r.sku}) from Forge? This permanently removes its product record, recipe and linked box-file record. It cannot be undone.`;
    if(!window.confirm(warning))return;
    const typed=window.prompt(`To confirm, type ${r.sku} exactly.`);
    if(typed!==r.sku){$('pmSaveStatus').textContent='Pal was not deleted — confirmation did not match.';return;}
    const button=$('pmDelete');button.disabled=true;button.textContent='Deleting…';$('pmSaveStatus').textContent=`Deleting ${r.sku} from Forge…`;
    try{
      await cloudFetch(`/products/${encodeURIComponent(r.sku)}`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmation:r.sku})});
      forgeProductMasterCache=null;selectedSku='';history.replaceState(null,'',location.pathname);await loadData();$('pmSaveStatus').textContent=`${r.sku} deleted from Forge.`;setForgeCloudSync('synced',`${r.sku} deleted from Forge`);
    }catch(error){$('pmSaveStatus').textContent=error.message||'Pal could not be deleted.';setForgeCloudSync('error',error.message||'Pal deletion failed');}
    finally{button.disabled=false;button.textContent='Delete Pal';}
  }
  async function createShopifyDraft(r){
    const button=$('pmCreateShopify'),status=$('pmShopifyStatus');button.disabled=true;button.textContent='Creating…';status.textContent='Checking Shopify and creating a draft if needed…';
    try{
      const result=await cloudFetch('/shopify/products/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({product:{title:r.name,descriptionHtml:r.full_description||r.short_description||'',vendor:'PLA Pals',productType:'PLA Pal',tags:['PLA Pals',r.collection].filter(Boolean),status:r.on_sale?'ACTIVE':'DRAFT',price:r.price,sku:r.sku,barcode:r.barcode||r.sku},image:{}})});
      const warning=result.sales_channels?.warning;if(warning)status.textContent=`Product is linked, but sales channels still need attention: ${warning}`;else status.textContent=r.on_sale?`Shopify product is active on ${result.sales_channels?.published_count||0} sales channels.`:(result.already_exists?'This SKU already exists in Shopify and is now linked to Forge.':'Shopify draft created and linked to Forge.');setForgeCloudSync(warning?'error':'synced',warning||`${r.sku} Shopify listing ready`);
    }catch(error){status.textContent=error.message||'Shopify draft could not be created.';setForgeCloudSync('error',error.message||'Shopify draft creation failed');}
    finally{button.disabled=false;button.textContent='Create / retry Shopify draft';}
  }
  async function uploadShopifyImage(r){
    const file=$('pmShopifyImage').files?.[0],button=$('pmUploadShopifyImage'),status=$('pmShopifyStatus');
    if(!file){status.textContent='Choose a JPG, PNG or WebP image first.';return;}
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){status.textContent='The product image must be a JPG, PNG or WebP file.';return;}
    if(file.size>20*1024*1024){status.textContent='The product image must be no larger than 20 MB.';return;}
    button.disabled=true;button.textContent='Uploading…';status.textContent='Uploading image to Shopify…';
    try{
      const encoded=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||'').split(',')[1]||'');reader.onerror=()=>reject(new Error('The image could not be read.'));reader.readAsDataURL(file);});
      const result=await cloudFetch('/shopify/products/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({product:{title:r.name,descriptionHtml:r.full_description||r.short_description||'',vendor:'PLA Pals',productType:'PLA Pal',tags:['PLA Pals',r.collection].filter(Boolean),status:r.on_sale?'ACTIVE':'DRAFT',price:r.price,sku:r.sku,barcode:r.barcode||r.sku},image:{filename:file.name,content_type:file.type,content_base64:encoded}})});
      status.textContent=result.image_uploaded?'Image uploaded to the existing Shopify product.':'Shopify did not confirm the image upload.';setForgeCloudSync('synced',`${r.sku} Shopify image uploaded`);
    }catch(error){status.textContent=error.message||'Shopify image could not be uploaded.';setForgeCloudSync('error',error.message||'Shopify image upload failed');}
    finally{button.disabled=false;button.textContent='Upload Shopify image';}
  }
  async function uploadPackaging(){
    const r=selected(),file=$('pmPackagingFile').files?.[0],button=$('pmPackagingUpload'),status=$('pmPackagingUploadStatus');
    if(!r||!file){status.textContent='Choose a PDF first.';return;}
    if(!/\.pdf$/i.test(file.name)||(file.type&&file.type!=='application/pdf')){status.textContent='The packaging file must be a PDF.';return;}
    if(file.size>150*1024*1024){status.textContent='The PDF must be no larger than 150 MB.';return;}
    if(!file.name.toUpperCase().includes(r.sku)){status.textContent=`Rename the PDF so its filename contains ${r.sku}, then choose it again.`;return;}
    button.disabled=true;button.textContent='Uploading…';status.textContent=`Starting ${file.name}…`;
    try{
      const start=await cloudFetch('/box-files/upload/start',{method:'POST',body:JSON.stringify({sku:r.sku,filename:file.name,total_bytes:file.size})});
      const chunkSize=Math.min(Number(start.chunk_size||4*1024*1024),4*1024*1024);
      for(let offset=0;offset<file.size;offset+=chunkSize){
        const end=Math.min(offset+chunkSize,file.size);status.textContent=`Uploading to Pi… ${Math.round(end/file.size*100)}%`;
        const headers={'Content-Type':'application/octet-stream','X-Upload-ID':start.upload_id,'X-Chunk-Offset':String(offset)};const token=cloudToken();if(token)headers.Authorization=`Bearer ${token}`;
        const response=await fetch(cloudApiBase()+'/box-files/upload/chunk',{method:'POST',headers,body:file.slice(offset,end)});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||`Upload failed (HTTP ${response.status}).`);
      }
      status.textContent='Checking the PDF is really on the Pi…';
      const completed=await cloudFetch('/box-files/upload/complete',{method:'POST',body:JSON.stringify({upload_id:start.upload_id,sku:r.sku,filename:file.name})});
      await cloudFetch(`/products/${encodeURIComponent(r.sku)}/packaging`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename:file.name,file_id:completed.file_id||completed.filename||file.name,view_url:completed.view_url||'',print_url:completed.print_url||''})});
      setForgeCloudSync('synced',`${r.sku} packaging verified on Pi`);await loadData(r.sku);$('pmPackagingUploadStatus').textContent=`Confirmed on Pi: ${file.name}`;
    }catch(error){status.textContent=error.message||'The PDF could not be saved on the Pi.';setForgeCloudSync('error',error.message||'Packaging upload failed');}
    finally{button.disabled=false;button.textContent='Upload to Pi';}
  }
  $('pmSearch').oninput=event=>{filter=event.target.value;drawList();};$('pmSave').onclick=save;$('pmDelete').onclick=deletePal;$('pmPackagingUpload').onclick=uploadPackaging;$('pmAddRecipe').onclick=()=>{recipeDraft.push({filament_name:'',parts:'',grouped_stl:'',separate_stls:'',part_count:1,weight_g:0});drawRecipes();};$('pmPrice').oninput=drawProfit;$('pmCost').oninput=drawProfit;
  try{await loadData();}catch(error){setForgeCloudSync('error',error.message||'Could not load Pal Product Master');$('pmEmpty').innerHTML=`<strong>Could not load Pal Product Master</strong><span>${esc(error.message||'Please refresh and try again.')}</span>`;}
}
