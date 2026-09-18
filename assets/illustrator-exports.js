/* Illustrator collection CSV/XML exports. All artwork paths remain on the user's Mac. */
function illustratorExportsPage(){
  installForgeCloudSyncBadge();
  const $=id=>document.getElementById(id);
  const groups=[
    {id:'main-pals',label:'Main Pals',collections:['woodland','birds','safari','aquatic','mystical'],detail:'Woodland, Birds, Safari, Aquatic and Mystical'},
    {id:'christmas',label:'Christmas',collections:['christmas'],detail:'Christmas collection'},
    {id:'halloween',label:'Halloween',collections:['halloween'],detail:'Halloween collection'},
    {id:'valentines',label:'Valentines',collections:['valentines'],detail:'Valentines collection'}
  ];
  const barcodeDefault='file:////Users/jacobdlm-g/Library/CloudStorage/GoogleDrive-plapalsuk@gmail.com/My Drive/Barcodes/Original Barcode/';
  const characterDefault='file:////Users/jacobdlm-g/Library/CloudStorage/GoogleDrive-plapalsuk@gmail.com/My Drive/Comic Photos/';
  let liveRows=[],csvRows=[],collectionOverrides=JSON.parse(localStorage.getItem('forgeIllustratorCollectionOverrides')||'{}');
  const escXml=value=>String(value==null?'':value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
  const clean=value=>String(value==null?'':value).trim();
  const key=value=>clean(value).toLowerCase().replace(/[^a-z0-9]/g,'');
  const csvCell=(row,names)=>{for(const name of names){const found=Object.keys(row).find(column=>key(column)===key(name));if(found&&clean(row[found]))return clean(row[found]);}return '';};
  const csvParse=text=>{
    const rows=[];let row=[],cell='',quoted=false;
    for(let i=0;i<text.length;i++){
      const char=text[i],next=text[i+1];
      if(char==='"'&&quoted&&next==='"'){cell+='"';i++;continue;}
      if(char==='"'){quoted=!quoted;continue;}
      if(char===','&& !quoted){row.push(cell);cell='';continue;}
      if((char==='\n'||char==='\r')&&!quoted){if(char==='\r'&&next==='\n')i++;row.push(cell);if(row.some(value=>clean(value)))rows.push(row);row=[];cell='';continue;}
      cell+=char;
    }
    row.push(cell);if(row.some(value=>clean(value)))rows.push(row);
    const headers=(rows.shift()||[]).map(value=>clean(value).replace(/^\uFEFF/,''));
    return rows.map(values=>Object.fromEntries(headers.map((header,index)=>[header,clean(values[index])]))).filter(row=>csvCell(row,['SKU','sku']));
  };
  const csvEscape=value=>{const text=String(value==null?'':value);return /[",\n\r]/.test(text)?`"${text.replace(/"/g,'""')}"`:text;};
  const canonicalCollection=value=>{
    const valueKey=key(value);
    if(valueKey.includes('christmas'))return 'christmas';
    if(valueKey.includes('halloween'))return 'halloween';
    if(valueKey.includes('valentine'))return 'valentines';
    if(valueKey.includes('woodland')||valueKey.includes('bird')||valueKey.includes('safari')||valueKey.includes('aquatic')||valueKey.includes('myth'))return valueKey.includes('bird')?'birds':valueKey.includes('safari')?'safari':valueKey.includes('aquatic')?'aquatic':valueKey.includes('myth')?'mystical':'woodland';
    return '';
  };
  const slug=value=>clean(value).toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
  const pathFrom=(raw,folder,sku,extension)=>{
    const source=clean(raw);
    if(source&&/\.(png|jpg|jpeg|webp)$/i.test(source)){
      if(/^file:/i.test(source))return source;
      if(source.includes('/')||source.includes('\\'))return `file:///${source.replace(/^\/+/, '')}`;
      return `${folder.replace(/\/?$/,'/')}${source}`;
    }
    return extension?`${folder.replace(/\/?$/,'/')}${sku}${extension}`:'';
  };
  const textNode=(tag,value)=>`\t\t\t\t<${tag}>\n\t\t\t\t\t<p>${escXml(value)}</p>\n\t\t\t\t</${tag}>`;
  const fileNode=(tag,value)=>`\t\t\t\t<${tag}>${escXml(value)}</${tag}>`;
  function mergedRows(){
    const csvBySku=Object.fromEntries(csvRows.map(row=>[csvCell(row,['SKU','sku']).toUpperCase(),row]));
    return liveRows.map(pal=>{
      const source=csvBySku[pal.sku]||{};
      const collection=collectionOverrides[pal.sku]||csvCell(source,['Collection','collection'])||pal.collection||'';
      return {sku:pal.sku,name:csvCell(source,['Name','name'])||pal.name||'',nameF:csvCell(source,['NameF','namef','Full name'])||pal.name||'',description:csvCell(source,['Description','description'])||pal.short_description||pal.full_description||'',barcode:csvCell(source,['@Barcode','Barcode','barcode']),character:csvCell(source,['@Character','Character','character']),animal:csvCell(source,['Animal','animal'])||pal.animal||'',collection};
    }).filter(row=>row.sku);
  }
  function xmlFor(rows,label){
    const barcodeFolder=$('ieBarcodeFolder').value.trim()||barcodeDefault,characterFolder=$('ieCharacterFolder').value.trim()||characterDefault;
    const datasets=rows.map(row=>{
      const dataSetName=`${row.sku}_${slug(row.animal)||slug(row.name)||'pal'}_Box`;
      const barcode=pathFrom(row.barcode,barcodeFolder,row.sku,'.png');
      const character=pathFrom(row.character,characterFolder,row.sku,'');
      return `\t\t\t<v:sampleDataSet dataSetName="${escXml(dataSetName)}">\n${textNode('name',row.name)}\n${textNode('nameF',row.nameF)}\n${textNode('description',row.description)}\n${fileNode('barcode',barcode)}\n${fileNode('character',character)}\n${textNode('animal',row.animal)}\n${textNode('SKU',row.sku)}\n\t\t\t\t<Variable1>true</Variable1>\n\t\t\t</v:sampleDataSet>`;
    }).join('\n');
    return `<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd" [\n\t<!ENTITY ns_flows "http://ns.adobe.com/Flows/1.0/">\n\t<!ENTITY ns_vars "http://ns.adobe.com/Variables/1.0/">\n\t<!ENTITY ns_custom "http://ns.adobe.com/GenericCustomNamespace/1.0/">\n]>\n<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:a="http://ns.adobe.com/AdobeSVGViewerExtensions/3.0/" x="0px" y="0px" width="0px" height="0px" viewBox="0 0 0 0" style="overflow:visible;" xml:space="preserve">\n<variableSets xmlns="&ns_vars;">\n\t<variableSet locked="none" varSetName="${escXml(label)}">\n\t\t<variables>\n\t\t\t<variable category="&ns_flows;" trait="textcontent" varName="name"></variable>\n\t\t\t<variable category="&ns_flows;" trait="textcontent" varName="nameF"></variable>\n\t\t\t<variable category="&ns_flows;" trait="textcontent" varName="description"></variable>\n\t\t\t<variable category="&ns_vars;" trait="fileref" varName="barcode"></variable>\n\t\t\t<variable category="&ns_vars;" trait="fileref" varName="character"></variable>\n\t\t\t<variable category="&ns_flows;" trait="textcontent" varName="animal"></variable>\n\t\t\t<variable category="&ns_flows;" trait="textcontent" varName="SKU"></variable>\n\t\t\t<variable category="&ns_vars;" trait="visibility" varName="Variable1"></variable>\n\t\t</variables>\n\t\t<v:sampleDataSets xmlns="http://ns.adobe.com/GenericCustomNamespace/1.0/" xmlns:v="http://ns.adobe.com/Variables/1.0/">\n${datasets}\n\t\t</v:sampleDataSets>\n\t</variableSet>\n</variableSets>\n</svg>\n`;
  }
  function csvFor(rows){
    const headers=['SKU','Name','NameF','Description','@Barcode','@Character','Animal','Collection'];
    return [headers,...rows.map(row=>[row.sku,row.name,row.nameF,row.description,pathFrom(row.barcode,$('ieBarcodeFolder').value.trim()||barcodeDefault,row.sku,'.png'),pathFrom(row.character,$('ieCharacterFolder').value.trim()||characterDefault,row.sku,''),row.animal,row.collection])].map(row=>row.map(csvEscape).join(',')).join('\r\n')+'\r\n';
  }
  function download(content,name,type){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function rowsFor(group){return mergedRows().filter(row=>group.collections.includes(canonicalCollection(row.collection))).sort((a,b)=>a.sku.localeCompare(b.sku));}
  function drawGroups(){
    $('ieGroups').innerHTML=groups.map(group=>{const rows=rowsFor(group);return `<article class="card illustrator-group"><span class="illustrator-group-count">${rows.length} Pals</span><h2>${group.label}</h2><p class="small">${group.detail}</p><div class="illustrator-group-skus">${rows.length?rows.map(row=>`<span>${esc(row.sku)}</span>`).join(''):'No matching Pals in Product Master.'}</div><div class="illustrator-group-actions"><button type="button" class="btn" data-xml="${group.id}" ${rows.length?'':'disabled'}>Download XML</button><button type="button" class="btn ghost" data-csv="${group.id}" ${rows.length?'':'disabled'}>Download CSV</button></div></article>`;}).join('');
    $('ieGroups').querySelectorAll('[data-xml]').forEach(button=>button.onclick=()=>{const group=groups.find(item=>item.id===button.dataset.xml),rows=rowsFor(group);download(xmlFor(rows,group.label),`PLA-Pals-${group.id}-variables.xml`,'application/xml;charset=utf-8');});
    $('ieGroups').querySelectorAll('[data-csv]').forEach(button=>button.onclick=()=>{const group=groups.find(item=>item.id===button.dataset.csv),rows=rowsFor(group);download(csvFor(rows),`PLA-Pals-${group.id}.csv`,'text/csv;charset=utf-8');});
  }
  function drawPreview(){const rows=mergedRows(),options=['','Woodland','Birds','Safari','Aquatic','Mystical','Christmas','Halloween','Valentines'];const unassigned=rows.filter(row=>!canonicalCollection(row.collection)).length;$('iePreview').innerHTML=rows.length?`<div class="small illustrator-unassigned">${unassigned?`${unassigned} Pals still need an export collection.`:'Every live Pal has an export collection.'}</div><table><thead><tr><th>SKU</th><th>Pal</th><th>Export collection</th><th>Barcode source</th><th>Character source</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${esc(row.sku)}</td><td>${esc(row.name)}</td><td><select class="ie-collection-select" data-sku="${esc(row.sku)}">${options.map(option=>`<option value="${esc(option)}" ${(option&&canonicalCollection(option)===canonicalCollection(row.collection))||(!option&&!canonicalCollection(row.collection))?'selected':''}>${esc(option||'Unassigned')}</option>`).join('')}</select></td><td>${esc(row.barcode||'Forge QR folder')}</td><td>${esc(row.character||'Not set')}</td></tr>`).join('')}</tbody></table>`:'<div class="small">No Pal data is available yet.</div>';$('iePreview').querySelectorAll('.ie-collection-select').forEach(select=>select.onchange=()=>{const sku=select.dataset.sku;if(select.value)collectionOverrides[sku]=select.value;else delete collectionOverrides[sku];localStorage.setItem('forgeIllustratorCollectionOverrides',JSON.stringify(collectionOverrides));refreshView();});}
  function refreshView(){drawGroups();drawPreview();}
  async function loadLive(){
    if(!cloudToken())throw new Error('Cloud login required.');
    setForgeCloudSync('syncing','Loading live Pal records for Illustrator');const payload=await cloudFetch('/pal-master');liveRows=(payload.pals||[]).map(row=>Object.assign({},row,{sku:clean(row.sku).toUpperCase()}));$('ieLiveCount').textContent=`${liveRows.length} live Pals ready`;$('ieSourceStatus').textContent='Product Master is the source of truth.';setForgeCloudSync('synced',`Loaded ${liveRows.length} Pal records for Illustrator`);refreshView();
  }
  $('ieBarcodeFolder').value=localStorage.getItem('forgeIllustratorBarcodeFolder')||barcodeDefault;$('ieCharacterFolder').value=localStorage.getItem('forgeIllustratorCharacterFolder')||characterDefault;
  [$('ieBarcodeFolder'),$('ieCharacterFolder')].forEach(input=>input.onchange=()=>{localStorage.setItem(input.id==='ieBarcodeFolder'?'forgeIllustratorBarcodeFolder':'forgeIllustratorCharacterFolder',input.value.trim());refreshView();});
  const saved=localStorage.getItem('forgeIllustratorCsv');if(saved){csvRows=csvParse(saved);$('ieImportStatus').textContent=`Using saved Illustrator CSV with ${csvRows.length} rows. Choose a replacement CSV whenever you update it.`;}
  $('ieCsvFile').onchange=async event=>{const file=event.target.files?.[0];if(!file)return;try{const text=await file.text();const parsed=csvParse(text);if(!parsed.length)throw new Error('No rows with a SKU were found.');csvRows=parsed;localStorage.setItem('forgeIllustratorCsv',text);$('ieImportStatus').textContent=`Imported ${file.name}: ${parsed.length} Illustrator rows saved in this browser.`;refreshView();}catch(error){$('ieImportStatus').textContent=error.message||'Could not read that CSV.';}finally{event.target.value='';}};
  $('ieClearCsv').onclick=()=>{csvRows=[];localStorage.removeItem('forgeIllustratorCsv');$('ieImportStatus').textContent='Using live Product Master data and the configured QR-code folder.';refreshView();};
  $('ieDownloadSource').onclick=()=>download(csvFor(mergedRows()),'PLA-Pals-Illustrator-source.csv','text/csv;charset=utf-8');
  $('ieRefresh').onclick=async()=>{try{await loadLive();}catch(error){$('ieSourceStatus').textContent=error.message||'Could not refresh the Product Master.';setForgeCloudSync('error',error.message||'Could not load Illustrator export data');}};
  loadLive().catch(error=>{$('ieLiveCount').textContent='Product Master unavailable';$('ieSourceStatus').textContent=error.message||'Could not load live Pal data.';setForgeCloudSync('error',error.message||'Could not load Illustrator export data');refreshView();});
}
