import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {fitPlacement,resizeFlatPlacement,decodeFlatGrid,plateGeometry,flatMaterial,type Plate,type FlatLayer,type Grid} from './flat-model';
import {defaultImageSettings,hexColor,parseHex} from './image-settings';
import {kelvinColor} from './model';
import './style.css';

const numeric=(id:string,label:string,value:number,min:number,max:number,step=1)=>`<label>${label}<input id="${id}" type="number" value="${value}" min="${min}" max="${max}" step="${step}"></label>`;
document.querySelector('#app')!.innerHTML=`
<header><div class="brand"><span class="moon-icon">▱</span><div>LUNA <small>PLOCHÉ LITOFÁNIE · .NET</small></div></div><a href="/">Přejít na Měsíc →</a></header>
<main><section class="workspace"><div class="scene-top"><div><span class="eyebrow">SVĚTLO ZA OBRAZEM</span><h1>Obraz pro tvůj rámeček.</h1><p id="model-info">Původní .NET generátor, prostorový náhled a vrstvy.</p></div><button id="new">Nový projekt</button></div>
<div id="viewport"><div class="scene-label"><span id="mode-label">PODSVÍCENÍ</span><span id="quality">Rychlý náhled</span></div><div id="busy" hidden><span class="spinner"></span><p id="busy-text"></p></div></div>
<div class="toolbar"><div class="segmented" id="modes"><button data-mode="0">Povrch</button><button data-mode="1" class="selected">Podsvícení</button><button data-mode="2">Tloušťka</button></div><button id="home">↺ Čelní pohled</button></div>
<div class="scene-foot">Táhni pro otočení · Ctrl + klik nebo tažení umístí motiv · Shift drží poměr stran · úchyty mění rozměry a natočení</div>
<div class="notice"><span class="dot"></span><p id="status" role="status" aria-live="polite">Načítám editor…</p></div></section><aside>
<section><div class="section-title"><span>01</span><h2>Deska a chráněný okraj</h2></div><div class="fields">
${numeric('plate-width','Celková šířka (mm)',150,10,1000)}${numeric('plate-height','Celková výška (mm)',100,10,1000)}</div>
<label class="checkbox"><input id="border-enabled" type="checkbox" checked> Okraj pro uchycení do rámečku</label>
${numeric('border-mm','Šířka okraje na každé straně (mm)',5,0,499,.5)}<p id="area" class="hint"></p>
<p class="hint">Okraj je součástí celkových rozměrů. Má maximální tloušťku desky a zůstává bez motivu. Vrstvy držíme celé uvnitř obrazové plochy.</p>
<div class="fields">${numeric('min-mm','Minimum tloušťky (mm)',.6,.1,10,.05)}${numeric('max-mm','Maximum tloušťky (mm)',3.6,.2,20,.05)}</div></section>
<section><div class="section-title"><span>02</span><h2>Obrazové vrstvy</h2></div>
<div class="fields"><button id="add-file">＋ Z počítače</button><button id="add-url">＋ Z URL</button></div>
<input id="file" type="file" accept="image/png,image/jpeg,image/webp" hidden><div id="layer-list" class="layer-list"></div>
<label class="layer-name">Název vrstvy<input id="layer-name" maxlength="250"></label>
<div class="layer-actions"><button id="up">↑</button><button id="down">↓</button><button id="copy">Duplikovat</button><button id="remove">Odebrat</button></div>
<div class="fields"><button id="replace-file">Změnit z počítače</button><button id="replace-url">Změnit z URL</button></div>
<div id="layer-controls"><div class="fields">${numeric('x-mm','Střed X (mm)',0,-1000,1000,.5)}${numeric('y-mm','Střed Y (mm)',0,-1000,1000,.5)}${numeric('width-mm','Šířka motivu (mm)',100,.1,1000,.5)}${numeric('height-mm','Výška motivu (mm)',75,.1,1000,.5)}</div>
<label class="range">Natočení <output id="angle-output"></output><input id="angle-deg" type="range" min="-180" max="180" value="0"></label>
<label class="range">Dominance <output id="strength-output"></output><input id="strength" type="range" min="0" max="100" value="100"></label></div></section>
<section id="image-editor"><div class="section-title"><span>03</span><h2>Úpravy obrázku</h2></div>
<canvas id="image-preview" width="280" height="190"></canvas><label>Metoda převodu do šedi<select id="gray-method"><option value="luminance">Vážený jas</option><option value="average">Průměr RGB</option><option value="lightness">Světlost</option><option value="red">Červená</option><option value="green">Zelená</option><option value="blue">Modrá</option></select></label>
<div class="fields">${numeric('image-brightness','Jas',0,-1,1,.05)}${numeric('image-contrast','Kontrast',1,.1,3,.05)}${numeric('image-gamma','Gama',1,.2,3,.05)}${numeric('image-black','Černý bod',0,0,.99,.01)}${numeric('image-white','Bílý bod',1,.01,1,.01)}</div>
<label class="checkbox"><input id="image-invert" type="checkbox"> Obrátit jas</label>
<label class="checkbox"><input id="background-enabled" type="checkbox"> Odstranit barvu pozadí</label>
<div class="background-picker"><input id="background-color" type="color" value="#000000"><button id="pick-background">Vybrat z originálu</button></div>
<div class="fields">${numeric('tolerance','Tolerance barvy',.08,0,1,.01)}${numeric('feather','Měkkost okraje',.05,0,1,.01)}</div><button id="reset-image" class="quiet wide">Obnovit úpravy obrázku</button>
<p class="hint">Průhlednost propouští nižší vrstvy; prázdné místo má minimální tloušťku. Výběr barvy zasáhne podobné barvy v celém obrázku. Originál zůstává uložený.</p></section>
<section><div class="section-title"><span>04</span><h2>Původní .NET výpočet</h2></div>
<label>Tisk<select id="print-mode"><option value="FDM">FDM</option><option value="Resin">Pryskyřice</option></select></label><div class="fields">
${numeric('nozzle-mm','Průměr trysky (mm)',.4,.1,2,.05)}${numeric('pixel-ratio','Poměr bod / tryska',.8,.5,1,.05)}${numeric('resin-resolution','Pryskyřice: vzorky / mm',3,1,20)}</div>
<label>Převzorkování<select id="resample"><option>Bicubic</option><option>Bilinear</option></select></label>
<label>Vyhlazování<select id="smoothing"><option value="BilateralFilter">Bilaterální filtr</option><option value="GaussianBlur">Gaussovo vyhlazení</option><option value="MedianFilter">Medián</option><option value="None">Bez vyhlazení</option></select></label>
<details><summary>Parametry vyhlazování</summary><div class="fields">${numeric('sigma','Gauss: sigma',2,.1,10,.1)}${numeric('threshold','Gauss: práh',.5,.1,2,.1)}${numeric('window','Medián: liché okno',3,3,15,2)}${numeric('spatial','Bilaterální: prostor',1,.1,5,.1)}${numeric('range','Bilaterální: výška',1,.1,5,.1)}</div></details>
<p class="hint">Povrch tvoří původní .NET převodník spojité plochy. Náhled během úprav nepočítá vyhlazení. Přesný výsledek zobrazí přepočet.</p>
<button id="calculate" class="primary">Přepočítat model v .NET →</button><p id="validation" class="hint"></p></section>
<section><div class="section-title"><span>05</span><h2>Podsvícení za deskou</h2></div>
<label class="range">Jas LED<input id="brightness" type="range" min="0" max="500" value="100"></label><label class="range">Teplota LED (K)<input id="kelvin" type="range" min="2200" max="7500" value="3000" step="100"></label>
${numeric('attenuation','Útlum materiálu (1/mm)',.78,.05,5,.01)}<p class="hint">Náhled počítá rovnoměrné světlo za deskou. Prosvícení je odhad; útlum dolaď podle zkušebního výtisku.</p></section>
<section><div class="section-title"><span>06</span><h2>Projekt a tisk</h2></div><div class="fields"><button id="save">Uložit projekt (.luna)</button><button id="open">Otevřít projekt</button><button id="export">Exportovat model pro tisk (.stl)</button><button id="snapshot">Náhled PNG</button></div>
<input id="project-file" type="file" accept=".luna,.zip" hidden><p class="hint">Projekt uchová obrázky, vrstvy a nastavení pro další úpravy. STL je přepočítaný model pro tisk. Aktuální STL se přibalí i do projektu, pokud existuje.</p></section>
</aside></main><dialog id="url-dialog"><form id="url-form"><h2>Obrázek z veřejné URL</h2><input id="image-url" type="url" required placeholder="https://…/image.png"><div class="fields"><button type="button" id="url-cancel">Zrušit</button><button type="submit">Načíst</button></div></form></dialog>
<footer>LUNA / ploché litofánie <span>Tvoje .NET jádro · místní zpracování</span></footer>`;

const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const val=(id:string)=>el<HTMLInputElement>(id).valueAsNumber;
const checked=(id:string)=>el<HTMLInputElement>(id).checked;
const set=(id:string,value:number|string)=>{el<HTMLInputElement>(id).value=String(value);};
let plate:Plate,layers:FlatLayer[]=[],selectedId:string|null=null,resultId:string|null=null;
let busy=false,revision=0,previewTimer:ReturnType<typeof setTimeout>|null=null,previewPromise:Promise<void>|null=null;
let shift=false,picking=false,imageVersion=0;let originalBitmap:ImageBitmap|null=null;
let imageRect={x:0,y:0,w:0,h:0};let replacement:string|null=null,urlTarget:string|null=null;
const selected=()=>layers.find(l=>l.id===selectedId);
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,1,.1,10000);
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
el('viewport').prepend(renderer.domElement);const orbit=new OrbitControls(camera,renderer.domElement);orbit.enableDamping=true;
const material=flatMaterial(),mesh=new THREE.Mesh(new THREE.BufferGeometry(),material),guides=new THREE.Group();scene.add(mesh,guides);
const raycaster=new THREE.Raycaster(),plane=new THREE.Plane(new THREE.Vector3(0,0,1),0);
new ResizeObserver(()=>{const {width,height}=el('viewport').getBoundingClientRect();renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();}).observe(el('viewport'));
renderer.setAnimationLoop(()=>{orbit.update();renderer.render(scene,camera);});
window.addEventListener('keydown',e=>{shift=e.shiftKey;});window.addEventListener('keyup',e=>{shift=e.shiftKey;});window.addEventListener('blur',()=>{shift=false;});
function status(text:string,error=false){el('status').textContent=text;el('status').classList.toggle('error',error);}
function controls(){
  document.querySelectorAll<HTMLInputElement|HTMLButtonElement|HTMLSelectElement>('aside input,aside button,aside select,#new').forEach(c=>c.disabled=busy);
  document.querySelectorAll<HTMLInputElement|HTMLButtonElement|HTMLSelectElement>('#layer-controls input,#image-editor input,#image-editor button,#image-editor select,#layer-name,#replace-file,#replace-url,#copy,#remove').forEach(c=>c.disabled=busy||!selectedId);
  const index=layers.findIndex(l=>l.id===selectedId);el<HTMLButtonElement>('up').disabled=busy||index<0||index===layers.length-1;el<HTMLButtonElement>('down').disabled=busy||index<=0;
  el<HTMLButtonElement>('export').disabled=busy||!resultId;orbit.enabled=!busy;
}
async function request(path:string,data?:unknown){
  const response=await fetch('/api/flat/'+path,data===undefined?undefined:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  if(!response.ok)throw new Error((await response.json()).error||'Požadavek selhal.');return response;
}
async function work(text:string,action:()=>Promise<void>){
  if(busy)return;busy=true;revision++;if(previewTimer)clearTimeout(previewTimer);previewTimer=null;controls();el('busy').hidden=false;el('busy-text').textContent=text;
  try{if(previewPromise)await previewPromise;await action();}catch(error){status(error instanceof Error?error.message:String(error),true);}
  finally{busy=false;el('busy').hidden=true;controls();}
}
const plateFields:Record<string,keyof Plate>={'plate-width':'width','plate-height':'height','min-mm':'min_mm','max-mm':'max_mm','border-mm':'border_mm','nozzle-mm':'nozzle_mm','pixel-ratio':'pixel_ratio','resin-resolution':'resin_resolution',sigma:'sigma',threshold:'threshold',window:'window',spatial:'spatial',range:'range'};
function writePlate(){for(const [id,key] of Object.entries(plateFields))set(id,plate[key] as number);el<HTMLInputElement>('border-enabled').checked=plate.border_enabled;set('print-mode',plate.print_mode);set('smoothing',plate.smoothing);set('resample',plate.resample);}
function composition(){return {plate:structuredClone(plate),layers:structuredClone(layers)};}
function lights(){material.uniforms.brightness.value=val('brightness')/100;material.uniforms.color.value.copy(kelvinColor(val('kelvin')));material.uniforms.attenuation.value=val('attenuation');}
function sceneSettings(){return {brightness:val('brightness')/100,kelvin:val('kelvin'),attenuation:val('attenuation'),camera:camera.position.toArray(),target:orbit.target.toArray(),mode:material.uniforms.mode.value};}
function home(){camera.position.set(0,0,Math.max(plate.width,plate.height)*1.9);orbit.target.set(0,0,0);orbit.update();}
el('home').onclick=home;
function redrawGuides(){
  for(const child of [...guides.children]){guides.remove(child);const object=child as THREE.Mesh;object.geometry?.dispose();const m=object.material;if(Array.isArray(m))m.forEach(x=>x.dispose());else m?.dispose();}
  const draw=(points:THREE.Vector3[],color:number)=>{const line=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color,depthTest:false}));line.renderOrder=5;guides.add(line);};
  const b=plate.border_enabled?plate.border_mm:0,z=plate.max_mm+.2;
  if(b)draw([new THREE.Vector3(-plate.width/2+b,-plate.height/2+b,z),new THREE.Vector3(plate.width/2-b,-plate.height/2+b,z),new THREE.Vector3(plate.width/2-b,plate.height/2-b,z),new THREE.Vector3(-plate.width/2+b,plate.height/2-b,z)],0xc9a06c);
  const layer=selected();if(!layer||!layer.enabled)return;const p=layer.placement,a=p.angle_deg*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  const point=(x:number,y:number)=>new THREE.Vector3(p.x_mm+c*x-s*y,p.y_mm+s*x+c*y,z+.2);
  draw([point(-p.width_mm/2,-p.height_mm/2),point(p.width_mm/2,-p.height_mm/2),point(p.width_mm/2,p.height_mm/2),point(-p.width_mm/2,p.height_mm/2)],0x8dd6ca);
  for(const [kind,x,y] of [['width',p.width_mm/2,0],['height',0,p.height_mm/2],['angle',0,p.height_mm/2+7]] as const){
    const handle=new THREE.Mesh(new THREE.SphereGeometry(Math.max(1.2,Math.max(plate.width,plate.height)*.009),12,8),new THREE.MeshBasicMaterial({color:kind==='angle'?0xe9bc81:0x8dd6ca,depthTest:false}));handle.position.copy(point(x,y));handle.userData.kind=kind;handle.renderOrder=6;guides.add(handle);
  }
}
function updateInfo(){
  const b=plate.border_enabled?plate.border_mm:0;el('area').textContent=`Obrazová plocha ${Math.round((plate.width-2*b)*100)/100} × ${Math.round((plate.height-2*b)*100)/100} mm.`;
  el('model-info').textContent=`Deska ${plate.width} × ${plate.height} mm · ${layers.length} obrazových vrstev · původní .NET jádro`;
  plane.constant=-plate.max_mm;material.uniforms.minimum.value=plate.min_mm;material.uniforms.maximum.value=plate.max_mm;redrawGuides();
}
function showGrid(grid:Grid){mesh.geometry.dispose();mesh.geometry=plateGeometry(grid);updateInfo();}
function changed(){
  resultId=null;revision++;el('quality').textContent='Aktualizuji náhled…';el('validation').textContent='Nastavení změněno. Před tiskem přepočítej model.';controls();updateInfo();
  if(previewTimer)clearTimeout(previewTimer);previewTimer=setTimeout(()=>{previewTimer=null;void preview();},180);
}
async function preview(){
  if(busy)return;
  if(previewPromise){previewTimer=setTimeout(()=>void preview(),100);return;}
  const version=revision;
  previewPromise=(async()=>{try{
    const info=await(await request('preview',composition())).json();if(version!==revision)return;
    layers=info.layers;showGrid(info);writeLayer();drawLayers();controls();el('quality').textContent='Rychlý náhled bez vyhlazení';void imagePreview();
  }catch(error){if(version===revision)status(String(error),true);}})();
  await previewPromise;previewPromise=null;
}
function drawLayers(){
  const list=el('layer-list');list.replaceChildren();
  for(const layer of [...layers].reverse()){
    const row=document.createElement('div');row.className='layer-row'+(layer.id===selectedId?' active':'');
    const visible=document.createElement('input');visible.type='checkbox';visible.checked=layer.enabled;visible.disabled=busy;visible.onchange=()=>{layer.enabled=visible.checked;changed();};
    const button=document.createElement('button');button.textContent=layer.name;button.onclick=()=>select(layer.id);row.append(visible,button);list.append(row);
  }
  const base=document.createElement('p');base.className='hint';base.textContent='0 · Základní deska a chráněný okraj';list.append(base);
}
const placementFields={'x-mm':'x_mm','y-mm':'y_mm','width-mm':'width_mm','height-mm':'height_mm','angle-deg':'angle_deg'} as const;
const imageFields={'image-brightness':'brightness','image-contrast':'contrast','image-gamma':'gamma','image-black':'black','image-white':'white',tolerance:'tolerance',feather:'feather'} as const;
function writeLayer(){
  const layer=selected();set('layer-name',layer?.name??'');if(!layer)return;
  for(const [id,key] of Object.entries(placementFields))set(id,Math.round(layer.placement[key]*1000)/1000);
  set('strength',layer.placement.strength*100);el('angle-output').textContent=`${Math.round(layer.placement.angle_deg)}°`;el('strength-output').textContent=`${Math.round(layer.placement.strength*100)} %`;
  for(const [id,key] of Object.entries(imageFields))set(id,layer.image_settings[key]);
  set('gray-method',layer.image_settings.method);set('background-color',hexColor(layer.image_settings.background_color));
  el<HTMLInputElement>('image-invert').checked=layer.image_settings.invert;el<HTMLInputElement>('background-enabled').checked=layer.image_settings.background_enabled;
}
function select(id:string|null){selectedId=id;picking=false;originalBitmap?.close();originalBitmap=null;el('pick-background').classList.remove('selected');writeLayer();drawLayers();redrawGuides();controls();void imagePreview();}
async function load(info:any,reset=false){
  plate=info.plate;layers=info.layers;writePlate();
  if(reset){set('brightness',info.scene.brightness*100);set('kelvin',info.scene.kelvin);set('attenuation',info.scene.attenuation);home();if(info.scene.camera){camera.position.fromArray(info.scene.camera);orbit.target.fromArray(info.scene.target??[0,0,0]);orbit.update();}const button=document.querySelector<HTMLButtonElement>(`#modes button[data-mode="${info.scene.mode??1}"]`);button?.click();}
  select(info.selected_layer_id??layers.at(-1)?.id??null);lights();
  const data=await(await request('preview',composition())).json();showGrid(data);el('quality').textContent='Rychlý náhled bez vyhlazení';
  if(!info.bridge_available)status('Chybí sestavený .NET adaptér. Spusť Start-Luna.ps1.',true);
}
for(const id of [...Object.keys(plateFields),'border-enabled','print-mode','smoothing','resample'])el(id).addEventListener('change',()=>{
  try{
    const candidate={...plate};for(const [field,key] of Object.entries(plateFields))(candidate as any)[key]=val(field);
    candidate.border_enabled=checked('border-enabled');candidate.print_mode=el<HTMLSelectElement>('print-mode').value;candidate.smoothing=el<HTMLSelectElement>('smoothing').value;candidate.resample=el<HTMLSelectElement>('resample').value;
    if(!Object.values(candidate).filter(v=>typeof v==='number').every(Number.isFinite)||candidate.min_mm>=candidate.max_mm)throw new Error('Zkontroluj rozměry a meze tloušťky.');
    const updated=layers.map(layer=>({...layer,placement:fitPlacement(layer.placement,candidate)}));plate=candidate;layers=updated;writeLayer();changed();
  }catch(error){status(String(error),true);writePlate();}
});
for(const [id,key] of Object.entries(placementFields))el(id).addEventListener('input',()=>{
  const layer=selected();if(!layer)return;
  try{const previous=layer.placement;
    layer.placement=key==='width_mm'||key==='height_mm'
      ?resizeFlatPlacement(previous,plate,key,val(id),shift)
      :fitPlacement({...previous,[key]:val(id)},plate);
    writeLayer();changed();
  }catch(error){status(String(error),true);}
});
el('strength').oninput=()=>{const layer=selected();if(layer){layer.placement.strength=val('strength')/100;writeLayer();changed();}};
el('layer-name').oninput=()=>{const layer=selected();if(layer){layer.name=el<HTMLInputElement>('layer-name').value;drawLayers();changed();}};
for(const id of [...Object.keys(imageFields),'gray-method','image-invert','background-enabled','background-color'])el(id).addEventListener('input',()=>{
  const layer=selected();if(!layer)return;for(const [field,key] of Object.entries(imageFields))layer.image_settings[key]=val(field);
  layer.image_settings.method=el<HTMLSelectElement>('gray-method').value as typeof layer.image_settings.method;layer.image_settings.invert=checked('image-invert');layer.image_settings.background_enabled=checked('background-enabled');layer.image_settings.background_color=parseHex(el<HTMLInputElement>('background-color').value);changed();
});
el('reset-image').onclick=()=>{const layer=selected();if(layer){layer.image_settings=defaultImageSettings();writeLayer();changed();}};
for(const id of ['up','down','copy','remove'])el(id).onclick=()=>{
  const index=layers.findIndex(l=>l.id===selectedId);if(index<0||busy)return;
  if(id==='copy'){const copy=structuredClone(layers[index]);copy.id=crypto.randomUUID();copy.name+=' · kopie';layers.splice(index+1,0,copy);selectedId=copy.id;}
  else if(id==='remove'){layers.splice(index,1);selectedId=layers[Math.min(index,layers.length-1)]?.id??null;}
  else{const target=index+(id==='up'?1:-1);if(target<0||target>=layers.length)return;[layers[index],layers[target]]=[layers[target],layers[index]];}
  select(selectedId);changed();
};
for(const id of ['brightness','kelvin','attenuation'])el(id).addEventListener('input',lights);
document.querySelectorAll<HTMLButtonElement>('#modes button').forEach(button=>button.onclick=()=>{material.uniforms.mode.value=Number(button.dataset.mode);document.querySelectorAll('#modes button').forEach(b=>b.classList.toggle('selected',b===button));el('mode-label').textContent=button.textContent!.toUpperCase();});
el('new').onclick=()=>work('Zakládám nový plochý projekt…',async()=>{resultId=null;await load(await(await request('new',{})).json(),true);status('Nový projekt připravený.');});
async function sync(){resultId=null;await request('sync',composition());}
el('add-file').onclick=()=>{replacement=null;el<HTMLInputElement>('file').click();};el('replace-file').onclick=()=>{replacement=selectedId;el<HTMLInputElement>('file').click();};
el('file').onchange=()=>work('Načítám obrázek…',async()=>{
  const input=el<HTMLInputElement>('file'),file=input.files?.[0];if(!file)return;await sync();
  const response=await fetch('/api/flat/image',{method:'POST',headers:{'X-File-Name':encodeURIComponent(file.name),...(replacement?{'X-Layer-Id':replacement}:{})},body:file});input.value='';if(!response.ok)throw new Error((await response.json()).error);
  await load(await response.json());status('Obrázek načten.');
});
const dialog=el<HTMLDialogElement>('url-dialog');for(const id of ['add-url','replace-url'])el(id).onclick=()=>{urlTarget=id==='replace-url'?selectedId:null;set('image-url','');dialog.showModal();};el('url-cancel').onclick=()=>dialog.close();
el('url-form').onsubmit=event=>{event.preventDefault();const url=el<HTMLInputElement>('image-url').value.trim(),target=urlTarget;dialog.close();void work('Stahuji obrázek…',async()=>{await sync();await load(await(await request('url',{url,layer_id:target})).json());status('Obrázek z URL načten a připravený pro uložení do projektu.');});};
function download(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
el('calculate').onclick=()=>work('Původní .NET jádro počítá tloušťky, vyhlazení a STL…',async()=>{
  const result=await(await request('calculate',composition())).json();const grid=decodeFlatGrid(await(await request('heights',{result_id:result.result_id})).arrayBuffer());
  showGrid(grid);resultId=result.result_id;el('quality').textContent='Skutečná geometrie .NET';el('validation').textContent=`${result.samples.toLocaleString('cs-CZ')} vzorků · ${result.triangles.toLocaleString('cs-CZ')} trojúhelníků · ${result.width} × ${result.height} mm`;
  status('Výpočet dokončen. Náhled zobrazuje přepočítaný povrch a model lze exportovat pro tisk.');
});
el('export').onclick=()=>work('Připravuji model pro tisk…',async()=>{download(await(await request('export',{result_id:resultId})).blob(),'flat-lithophane.stl');status('Výsledné STL staženo.');});
el('save').onclick=()=>work('Ukládám obrázky, vrstvy a nastavení…',async()=>{
  const response=await request('save',{...composition(),scene:sceneSettings(),result_id:resultId}),included=response.headers.get('X-Luna-Result-Included')==='true';
  download(await response.blob(),'flat-project.luna');status(included?'Projekt uložen včetně aktuálního result.stl.':'Projekt uložen BEZ výsledného STL. Obsahuje obrázky a nastavení pro další úpravy; STL přiložíme po přepočtu modelu.',!included);
});
el('open').onclick=()=>el<HTMLInputElement>('project-file').click();el('project-file').onchange=()=>work('Otevírám plochý projekt…',async()=>{
  const input=el<HTMLInputElement>('project-file'),file=input.files?.[0];if(!file)return;
  const response=await fetch('/api/flat/open',{method:'POST',body:file});input.value='';if(!response.ok)throw new Error((await response.json()).error);
  resultId=null;await load(await response.json(),true);status('Projekt obnoven. Před exportem znovu přepočítej model.');
});
el('snapshot').onclick=()=>{guides.visible=false;renderer.render(scene,camera);renderer.domElement.toBlob(blob=>{if(blob)download(blob,'flat-preview.png');});guides.visible=true;};

function drawImage(bitmap:ImageBitmap){
  const canvas=el<HTMLCanvasElement>('image-preview'),ctx=canvas.getContext('2d')!;ctx.clearRect(0,0,canvas.width,canvas.height);
  const scale=Math.min(canvas.width/bitmap.width,canvas.height/bitmap.height);imageRect={x:(canvas.width-bitmap.width*scale)/2,y:(canvas.height-bitmap.height*scale)/2,w:bitmap.width*scale,h:bitmap.height*scale};ctx.drawImage(bitmap,imageRect.x,imageRect.y,imageRect.w,imageRect.h);
}
async function imagePreview(){
  const version=++imageVersion,layer=selected();if(!layer){el<HTMLCanvasElement>('image-preview').getContext('2d')!.clearRect(0,0,280,190);return;}
  try{const response=await request(picking?'source/'+layer.image_id:'image-preview',picking?undefined:{image_id:layer.image_id,image_settings:layer.image_settings});const bitmap=await createImageBitmap(await response.blob());if(version!==imageVersion){bitmap.close();return;}
    drawImage(bitmap);if(picking){originalBitmap?.close();originalBitmap=bitmap;}else bitmap.close();
  }catch(error){if(version===imageVersion)status(String(error),true);}
}
el('pick-background').onclick=()=>{picking=!picking;el('pick-background').classList.toggle('selected',picking);void imagePreview();};
el('image-preview').onclick=event=>{
  const layer=selected();if(!picking||!originalBitmap||!layer)return;const canvas=el<HTMLCanvasElement>('image-preview'),rect=canvas.getBoundingClientRect();
  const x=(event.clientX-rect.left)*canvas.width/rect.width-imageRect.x,y=(event.clientY-rect.top)*canvas.height/rect.height-imageRect.y;if(x<0||y<0||x>=imageRect.w||y>=imageRect.h)return;
  const source=document.createElement('canvas');source.width=originalBitmap.width;source.height=originalBitmap.height;const ctx=source.getContext('2d')!;ctx.drawImage(originalBitmap,0,0);const color=ctx.getImageData(Math.floor(x/imageRect.w*source.width),Math.floor(y/imageRect.h*source.height),1,1).data;
  layer.image_settings.background_color=[color[0],color[1],color[2]];layer.image_settings.background_enabled=true;picking=false;el('pick-background').classList.remove('selected');writeLayer();changed();
};
let dragging:string|null=null;
function pointer(event:PointerEvent){const rect=renderer.domElement.getBoundingClientRect();raycaster.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),camera);return raycaster.ray.intersectPlane(plane,new THREE.Vector3());}
function place(event:PointerEvent){const layer=selected(),point=pointer(event);if(!layer||!point)return;const p={...layer.placement},a=p.angle_deg*Math.PI/180,dx=point.x-p.x_mm,dy=point.y-p.y_mm;
  if(dragging==='width')Object.assign(p,resizeFlatPlacement(p,plate,'width_mm',Math.max(.1,2*(Math.cos(a)*dx+Math.sin(a)*dy)),event.shiftKey));
  else if(dragging==='height')Object.assign(p,resizeFlatPlacement(p,plate,'height_mm',Math.max(.1,2*(-Math.sin(a)*dx+Math.cos(a)*dy)),event.shiftKey));
  else if(dragging==='angle')p.angle_deg=((Math.atan2(dy,dx)*180/Math.PI-90+540)%360)-180;
  else{p.x_mm=point.x;p.y_mm=point.y;}
  layer.placement=dragging==='width'||dragging==='height'?p:fitPlacement(p,plate);writeLayer();changed();orbit.enabled=false;
}
renderer.domElement.addEventListener('pointerdown',event=>{
  if(busy||!selectedId||event.button!==0)return;pointer(event);const hit=raycaster.intersectObjects(guides.children).find(h=>h.object.userData.kind);
  if(!event.ctrlKey&&!hit)return;event.stopImmediatePropagation();dragging=event.ctrlKey?'move':hit!.object.userData.kind;orbit.enabled=false;renderer.domElement.setPointerCapture(event.pointerId);place(event);
},true);
renderer.domElement.addEventListener('pointermove',event=>{if(dragging){event.stopImmediatePropagation();place(event);}},true);
for(const type of ['pointerup','pointercancel'])renderer.domElement.addEventListener(type,()=>{dragging=null;orbit.enabled=!busy;},true);
void work('Připravuji plochý projekt…',async()=>{await load(await(await request('info')).json(),true);status('Vlož motiv, nastav okraj a přepočítej model původním .NET jádrem.');});
