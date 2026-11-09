import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {basis, decodeMesh, kelvinColor, resizeDimensions, surfacePoint, validatePlacement, type Placement} from './model';
import {createMaterial} from './material';
import {defaultImageSettings,hexColor,parseHex,type ImageSettings} from './image-settings';
import {setControlState,moonControlReason,CONTROL_HELP,layerOrderNote,LAYER_REASON} from './control-state';
import './style.css';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
<header><div class="brand"><span class="moon-icon">◒</span><div>LUNA <small>STUDIO LITOFÁNIE</small></div></div><a href="/">Rozcestník</a><a href="/flat.html">Ploché litofánie →</a><span class="local">● Místní pracovní prostor</span></header>
<main><section class="workspace">
  <div class="scene-top"><div><span class="eyebrow">SVĚTLO UKRYTÉ V POVRCHU</span><h1>Tvůj příběh na Měsíci.</h1><p id="model-info">Načti měsíční skořepinu a přidej vlastní motiv.</p></div><button id="demo" class="quiet">Nový projekt</button></div>
  <div id="viewport"><div id="empty">◌<p>Začni načtením modelu STL</p><small>nebo založ nový projekt s ukázkovým motivem</small></div><div class="scene-label"><span id="mode-label">PODSVÍCENÍ</span><span id="quality">Rychlý náhled</span></div><div id="busy" hidden><span class="spinner"></span><p id="busy-text">Počítám…</p></div></div>
  <div class="toolbar"><div class="segmented" id="modes"><button data-mode="0">Povrch</button><button data-mode="1" class="selected">Podsvícení</button><button data-mode="2">Tloušťka</button></div><div class="tools"><button id="move">Umístit motiv</button><button id="original">Původní model</button><button id="home" aria-label="Vrátit kameru">↺ Pohled</button></div></div>
  <div class="scene-foot"><span>Táhni pro otočení · Ctrl + klik umístí motiv · Shift při změně velikosti drží proporce</span><span id="anchor-label">Kotva —</span></div>
  <div class="notice"><span class="dot"></span><p id="status" role="status" aria-live="polite">Soubory i výpočty zůstávají na tomto počítači.</p></div>
</section><aside>
  <section><div class="section-title"><span>01</span><h2>Model a motiv</h2></div>
    <button id="open-stl" class="file-button"><span>◇ Měsíční skořepina</span><small id="stl-name">Načíst STL ↗</small></button><input type="file" id="stl" accept=".stl" hidden>
    <button id="open-motif" class="file-button"><span>＋ Přidat vrstvu obrázku</span><small id="motif-name">PNG, JPG nebo WebP ↗</small></button><input type="file" id="motif" accept="image/png,image/jpeg,image/webp" hidden>
    <button id="add-url" class="quiet wide">＋ Přidat obrázek z URL</button><div class="fields"><button id="replace-file">Změnit obrázek z počítače</button><button id="replace-url">Změnit obrázek z URL</button></div><div id="layer-list" class="layer-list" aria-label="Vrstvy motivů"></div>
    <label class="layer-name">Název vybrané vrstvy<input id="layer-name" type="text" maxlength="250" placeholder="Vyber vrstvu"></label>
    <div class="layer-actions"><button id="layer-up" title="Posunout výš">↑</button><button id="layer-down" title="Posunout níž">↓</button><button id="layer-copy">Duplikovat</button><button id="layer-remove">Odebrat</button></div>
    <p id="layer-state-note" class="ux-group-note" role="status" hidden></p><p class="hint">Průhlednost chrání původní povrch. Bílá ztenčuje stěnu, černá ji zesiluje.</p>
  </section>
  <section id="image-editor"><div class="section-title"><span>02</span><h2>Úpravy vybraného PNG</h2></div>
    <p id="image-state-note" class="ux-group-note" hidden></p><canvas id="image-preview" width="280" height="190" aria-label="Náhled upraveného obrázku"></canvas>
    <canvas id="histogram" width="256" height="48" aria-label="Histogram jasů neprůhledných bodů"></canvas>
    <label>Metoda převodu do šedi<select id="gray-method"><option value="luminance">Vážený jas (Rec. 709)</option><option value="average">Průměr RGB</option><option value="lightness">Průměr nejsvětlejší a nejtmavší složky</option><option value="red">Červený kanál</option><option value="green">Zelený kanál</option><option value="blue">Modrý kanál</option></select></label>
    <label class="range">Jas obrázku <output id="image-brightness-value">0</output><input id="image-brightness" type="range" min="-100" max="100" value="0"></label>
    <label class="range">Kontrast <output id="image-contrast-value">1</output><input id="image-contrast" type="range" min=".1" max="3" step=".05" value="1"></label>
    <label class="range">Gama <output id="image-gamma-value">1</output><input id="image-gamma" type="range" min=".2" max="3" step=".05" value="1"></label>
    <div class="fields"><label>Černý bod <em>0–255</em><input id="black-point" type="number" min="0" max="252" value="0"></label><label>Bílý bod <em>0–255</em><input id="white-point" type="number" min="3" max="255" value="255"></label></div>
    <label class="checkbox"><input id="image-invert" type="checkbox"> Obrátit jas (negativ)</label>
    <label class="checkbox"><input id="background-enabled" type="checkbox"> Odstranit zvolenou barvu pozadí</label>
    <div class="background-picker"><input id="background-color" type="color" value="#000000" aria-label="Barva pozadí"><button id="pick-background">Vybrat kliknutím v obrázku</button></div>
    <label class="range">Tolerance barvy <output id="background-tolerance-value">8 %</output><input id="background-tolerance" type="range" min="0" max="100" value="8"></label>
    <label class="range">Měkkost okraje <output id="background-feather-value">5 %</output><input id="background-feather" type="range" min="0" max="100" value="5"></label>
    <button id="reset-image" class="quiet wide">Obnovit původní úpravy</button>
    <p class="hint">Originál se nepřepisuje. Výběr pozadí odstraňuje podobnou barvu v celém obrázku; může zasáhnout i motiv. Histogram respektuje průhlednost.</p>
  </section>
  <section><div class="section-title"><span>03</span><h2>Umístění motivu</h2></div>
    <div class="fields"><label>Šířka <em>mm</em><input id="width" type="number" min="1" value="100" step="1"></label><label>Výška <em>mm</em><input id="height" type="number" min="1" value="75" step="1"></label></div>
    <label class="range">Natočení <output id="angle-value">0°</output><input id="angle" type="range" min="-180" max="180" step="1" value="0"></label>
    <label class="range">Dominance obrázku <output id="strength-value">65 %</output><input id="strength" type="range" min="0" max="100" value="65"></label>
    <label class="checkbox"><input id="guides" type="checkbox" checked> Rámeček a prostorové úchyty</label>
    <p class="hint"><strong>Ctrl + klik</strong> umístí střed. Ctrl + tažení motiv přesouvá. Tyrkysové úchyty mění rozměry, zlatý otáčí. <strong>Shift</strong> při změně velikosti drží poměr stran, také v číselných polích.</p>
  </section>
  <section><div class="section-title"><span>04</span><h2>Tloušťka pro tisk</h2></div>
    <div class="fields"><label>Minimum <em>mm</em><input id="minimum" type="number" min=".1" step=".05" value=".7"></label><label>Maximum <em>mm</em><input id="maximum" type="number" min=".2" step=".05" value="2.7"></label></div>
    <label>Metoda integrace<select id="integration-method" aria-describedby="integration-note"><option value="inside">Zezadu — vnitřní stěna</option><option value="outside">Zepředu — vnější povrch</option></select></label>
    <p id="integration-note" class="hint"></p>
    <p class="hint">Meze se vynucují v upravované oblasti. Rychlý náhled simuluje tloušťku; změnu skutečného povrchu zobrazí až přepočet. Ostrost prosvícení porovnej zkušebním tiskem.</p>
    <button id="apply" class="primary" disabled>Přepočítat a ověřit model <span>→</span></button>
    <p id="validation" class="hint">Před exportem ověříme skutečnou geometrii.</p>
  </section>
  <section><div class="section-title"><span>05</span><h2>Světlo a materiál</h2></div>
    <label class="range">Jas LED <output id="brightness-value">100 %</output><input id="brightness" type="range" min="0" max="500" value="100"></label>
    <label class="range">Teplota světla <output id="kelvin-value">3000 K</output><input id="kelvin" type="range" min="2200" max="7500" value="3000" step="100"></label>
    <label class="range">Útlum materiálu <output id="attenuation-value">0,78 /mm</output><input id="attenuation" type="range" min=".05" max="5" value=".78" step=".01"></label>
    <div class="fields three"><label>LED X <em>mm</em><input id="led-x" type="number" value="0"></label><label>LED Y <em>mm</em><input id="led-y" type="number" value="0"></label><label>LED Z <em>mm</em><input id="led-z" type="number" value="0"></label></div>
    <p class="hint">Průběžné prosvícení je aproximace. Útlum zkalibruj podle zkušebního výtisku a filamentu.</p>
  </section>
  <section><div class="section-title"><span>06</span><h2>Výstup a scéna</h2></div>
    <div class="fields"><button id="export" disabled>Exportovat model pro tisk (.stl)</button><button id="snapshot" disabled>Náhled PNG</button><button id="save" disabled>Uložit projekt (.luna)</button><button id="restore">Otevřít projekt</button></div><input id="settings-file" type="file" accept=".luna,.zip" hidden>
    <p class="hint">Projekt .luna uchová vrstvy a zdroje pro další úpravy. Export .stl je výsledný model pro tisk.</p>
    <button id="render" class="wide" disabled>Vykreslit v Blender Cycles</button><button id="bundle" class="quiet wide" disabled>Stáhnout scénu pro Blender ↗</button><p id="blender-info" class="hint">Zjišťuji dostupnost Blenderu…</p>
  </section>
</aside></main><dialog id="url-dialog"><form id="url-form"><h2 id="url-title">Obrázek z URL</h2><label>Přímý odkaz na obrázek<input id="image-url" type="url" required placeholder="https://…/dragon.png"></label><p>Veřejný obrázek do 24 MB. Stažený originál se uloží do projektu.</p><div class="fields"><button type="button" id="url-cancel">Zrušit</button><button type="submit">Načíst obrázek</button></div></form></dialog><footer>LUNA / experimentální studio <span>STL geometrie · lokální zpracování · žádný účet</span></footer>`;

const el = <T extends HTMLElement = HTMLElement>(id:string) => document.getElementById(id) as T;
const value = (id:string) => el<HTMLInputElement>(id).valueAsNumber;
const setValue = (id:string,v:number) => {el<HTMLInputElement>(id).value=String(v);};
const fmt = (n:number,d=2) => n.toLocaleString('cs-CZ',{maximumFractionDigits:d});
let model: {radius:number;center:number[];triangles:number;name:string;repairs:number;min_mm:number;max_mm:number} | null=null;
interface Layer {id:string;name:string;image_id:string;enabled:boolean;placement:Omit<Placement,'min_mm'|'max_mm'>;image_settings:ImageSettings;}
let layers:Layer[]=[],selectedId:string|null=null;
let blenderAvailable=false, integrationAvailable=false;
let hasMotif=false, busy=false, resultId:string|null=null, exportable=false, moving=false, original=false;
let previewTimer:ReturnType<typeof setTimeout>|null=null,previewRevision=0,previewRunning=false,previewAgain=false;
let pickingBackground=false,imageSelectionVersion=0,sourceId:string|null=null,sourceBitmap:ImageBitmap|null=null;
const originalCanvas=document.createElement('canvas');
let imageRect={x:0,y:0,width:0,height:0};
let anchor=new THREE.Vector3(1,-1,.2).normalize(), currentMode=1;
let shiftDown=false,previousWidth=100,previousHeight=75;
window.addEventListener('keydown',event=>{shiftDown=event.shiftKey;});
window.addEventListener('keyup',event=>{shiftDown=event.shiftKey;});
window.addEventListener('blur',()=>{shiftDown=false;});
let baseGeometry:THREE.BufferGeometry|null=null, verifiedGeometry:THREE.BufferGeometry|null=null;
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(38,1,.1,10000); camera.up.set(0,0,1);
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.toneMapping=THREE.ACESFilmicToneMapping;
const viewport=el('viewport'); viewport.prepend(renderer.domElement);
const orbit=new OrbitControls(camera,renderer.domElement); orbit.enableDamping=true;
const material=createMaterial();
const mesh=new THREE.Mesh(new THREE.BufferGeometry(),material); scene.add(mesh);
const guide=new THREE.Group(); scene.add(guide);
const lineMaterial=new THREE.LineBasicMaterial({color:0x8dd6ca,transparent:true,opacity:.8,depthTest:false});
const handles:THREE.Mesh[]=[];
for(const name of ['width','height','angle']){
  const handle=new THREE.Mesh(new THREE.SphereGeometry(1,12,8),new THREE.MeshBasicMaterial({color:name==='angle'?0xe9b971:0x9ce5d4,depthTest:false}));
  handle.userData.kind=name;handle.renderOrder=10;guide.add(handle);handles.push(handle);
}
const outline=new THREE.Line(new THREE.BufferGeometry(),lineMaterial);outline.renderOrder=9;guide.add(outline);
const marker=new THREE.Mesh(new THREE.SphereGeometry(1,12,8),new THREE.MeshBasicMaterial({color:0xf4c278,depthTest:false}));
marker.renderOrder=10;guide.add(marker);
const raycaster=new THREE.Raycaster();
const resize=new ResizeObserver(()=>{const w=viewport.clientWidth,h=viewport.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();});resize.observe(viewport);
renderer.setAnimationLoop(()=>{orbit.update();renderer.render(scene,camera);});

function status(text:string,error=false){el('status').textContent=text;el('status').classList.toggle('error',error);}
function buttons(){
  const state={busy,hasLayer:!!selectedId,index:layers.findIndex(l=>l.id===selectedId),count:layers.length,
    resultReady:!!resultId&&exportable,hasResult:!!resultId,modelLoaded:!!model,blender:blenderAvailable,integrationAvailable};
  document.querySelectorAll<HTMLInputElement|HTMLButtonElement|HTMLSelectElement>('aside input,aside button,aside select,#demo,#move').forEach(control=>{
    const reason=moonControlReason(control.id,state,!!control.closest('#image-editor'));
    setControlState(control,reason,CONTROL_HELP[control.id],reason!==LAYER_REASON&&!['layer-up','layer-down'].includes(control.id));
  });
  const note=layerOrderNote(state);el('layer-state-note').textContent=note;el('layer-state-note').hidden=!note;
  el('image-state-note').textContent=LAYER_REASON;el('image-state-note').hidden=state.hasLayer;
  orbit.enabled=!busy&&!moving;
}
async function work(message:string,action:()=>Promise<void>){
  if(busy)return;busy=true;if(previewTimer)clearTimeout(previewTimer);previewAgain=false;previewRevision++;
  el('busy').hidden=false;el('busy-text').textContent=message;buttons();
  try{while(previewRunning)await new Promise(resolve=>setTimeout(resolve,20));await action();}catch(error){status(error instanceof Error?error.message:String(error),true);}
  finally{busy=false;el('busy').hidden=true;buttons();}
}
async function request(path:string,body?:unknown){
  const response=await fetch(path,body===undefined?undefined:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!response.ok){const data=await response.json().catch(()=>({error:`Požadavek selhal (${response.status}).`}));throw new Error(data.error);}
  return response;
}
function placement():Placement{return {anchor:anchor.toArray(),width_mm:value('width'),height_mm:value('height'),angle_deg:value('angle'),strength:value('strength')/100,min_mm:value('minimum'),max_mm:value('maximum')};}
function sceneSettings(){return {brightness:value('brightness')/100,kelvin:value('kelvin'),attenuation:value('attenuation'),light:[value('led-x'),value('led-y'),value('led-z')],camera:camera.position.clone().sub(orbit.target).toArray()};}
function invalidate(queue=true){
  resultId=null;exportable=false;
  if(verifiedGeometry){verifiedGeometry.dispose();verifiedGeometry=null;}
  if(baseGeometry)mesh.geometry=baseGeometry;
  el('quality').textContent='Rychlý náhled';el('validation').textContent='Nastavení změněno. Před exportem přepočítej geometrii.';buttons();
  if(queue){syncSelected();schedulePreview();}
}
function update(){
  const p=placement(),b=basis(anchor),u=material.uniforms;
  el("integration-note").textContent=el<HTMLSelectElement>("integration-method").value==="outside"
    ?"Mění se vnější povrch v místě motivu, včetně kráterů. Vnitřní stěna zůstává zachovaná. Platí pro všechny vrstvy."
    :"Mění se vnitřní stěna. Vnější krátery zůstávají zachované. Platí pro všechny vrstvy.";
  if(Number.isFinite(p.width_mm)&&p.width_mm>0)previousWidth=p.width_mm;
  if(Number.isFinite(p.height_mm)&&p.height_mm>0)previousHeight=p.height_mm;
  u.anchor.value.copy(anchor);u.east.value.copy(b.east);u.north.value.copy(b.north);
  u.width.value=p.width_mm;u.height.value=p.height_mm;u.angle.value=p.angle_deg*Math.PI/180;
  u.strength.value=p.strength;u.minimum.value=p.min_mm;u.maximum.value=p.max_mm;
  u.hasMotif.value=hasMotif;u.verified.value=!!verifiedGeometry&&!original;u.original.value=original;
  u.mode.value=currentMode;u.brightness.value=value('brightness')/100;u.ledColor.value.copy(kelvinColor(value('kelvin')));
  u.attenuation.value=value('attenuation');u.led.value.set(value('led-x'),value('led-y'),value('led-z'));
  el('angle-value').textContent=`${fmt(p.angle_deg,0)}°`;el('strength-value').textContent=`${fmt(p.strength*100,0)} %`;
  el('brightness-value').textContent=`${value('brightness')} %`;el('kelvin-value').textContent=`${value('kelvin')} K`;
  el('attenuation-value').textContent=`${fmt(value('attenuation'))} /mm`;
  el('anchor-label').textContent=`Kotva ${fmt(Math.atan2(anchor.y,anchor.x)*180/Math.PI,1)}° / ${fmt(Math.asin(anchor.z)*180/Math.PI,1)}°`;
  guide.visible=!!model&&!!selectedId&&!!layers.find(l=>l.id===selectedId)?.enabled&&el<HTMLInputElement>('guides').checked&&!original;
  if(!model||![p.width_mm,p.height_mm,p.angle_deg].every(Number.isFinite))return;
  const r=model.radius*1.018, points:THREE.Vector3[]=[];
  for(let side=0;side<4;side++)for(let j=0;j<=32;j++){
    const t=j/32;const x=side===0?-.5+t:side===1?.5:side===2?.5-t:-.5;
    const y=side===0?-.5:side===1?-.5+t:side===2?.5:.5-t;
    points.push(surfacePoint(x*p.width_mm,y*p.height_mm,p,model.radius).multiplyScalar(r/model.radius));
  }
  outline.geometry.dispose();outline.geometry=new THREE.BufferGeometry().setFromPoints(points);
  const coords=[[p.width_mm/2,0],[0,p.height_mm/2],[0,p.height_mm/2+model.radius*.09]];
  handles.forEach((handle,i)=>{handle.position.copy(surfacePoint(coords[i][0],coords[i][1],p,model!.radius)).multiplyScalar(r/model!.radius);handle.scale.setScalar(model!.radius*.022);});
  marker.position.copy(anchor).multiplyScalar(r);marker.scale.setScalar(model.radius*.012);
}
function home(){if(!model)return;camera.position.copy(anchor).multiplyScalar(model.radius*3.6);orbit.target.set(0,0,0);orbit.minDistance=model.radius*1.12;orbit.maxDistance=model.radius*12;camera.near=model.radius*.002;camera.far=model.radius*60;camera.updateProjectionMatrix();orbit.update();}
function syncSelected(){
  const layer=layers.find(l=>l.id===selectedId);if(!layer)return;
  const {min_mm,max_mm,...p}=placement();layer.placement=p;
}
function composition(){
  if(!model)throw new Error('Nejdřív načti STL.');syncSelected();
  const minimum=value('minimum'),maximum=value('maximum');
  validatePlacement({anchor:[1,0,0],width_mm:1,height_mm:1,angle_deg:0,strength:0,min_mm:minimum,max_mm:maximum},model.radius);
  for(const layer of layers)validatePlacement({...layer.placement,min_mm:minimum,max_mm:maximum},model.radius);
  return {layers:structuredClone(layers),min_mm:minimum,max_mm:maximum,integration_method:el<HTMLSelectElement>('integration-method').value};
}
function selectLayer(id:string|null,saveCurrent=true){
  if(saveCurrent)syncSelected();selectedId=id;const layer=layers.find(l=>l.id===id);
  if(layer){anchor.fromArray(layer.placement.anchor).normalize();setValue('width',layer.placement.width_mm);setValue('height',layer.placement.height_mm);setValue('angle',layer.placement.angle_deg);setValue('strength',layer.placement.strength*100);}
  el<HTMLInputElement>('layer-name').value=layer?.name??'';
  if(layer){layer.image_settings??=defaultImageSettings();writeImageSettings(layer.image_settings);}
  void refreshImagePreview();
  drawLayers();update();buttons();
}
function drawLayers(){
  const list=el('layer-list');list.replaceChildren();
  for(const layer of [...layers].reverse()){
    const row=document.createElement('div');row.className='layer-row'+(layer.id===selectedId?' active':'');
    const check=document.createElement('input');check.type='checkbox';check.checked=layer.enabled;check.ariaLabel=`Viditelnost vrstvy ${layer.name}`;
    check.onchange=()=>{layer.enabled=check.checked;invalidate();update();};
    const button=document.createElement('button');button.textContent=layer.name;button.title=layer.name;
    button.onclick=()=>selectLayer(layer.id);row.append(check,button);list.append(row);
    const reason=busy?'Právě probíhá zpracování. Počkej na jeho dokončení.':null;setControlState(check,reason);setControlState(button,reason);
  }
  const base=document.createElement('div');base.className='base-layer';base.textContent='0 · STL — původní Měsíc (pevná vrstva)';list.append(base);
  el('motif-name').textContent=`${layers.length} ${layers.length===1?'vrstva':'vrstev'} · pořadí shora dolů`;
}
function writeImageSettings(config:ImageSettings){
  el<HTMLSelectElement>('gray-method').value=config.method;
  for(const [id,v] of [['image-brightness',config.brightness*100],['image-contrast',config.contrast],['image-gamma',config.gamma],['black-point',Math.round(config.black*255)],['white-point',Math.round(config.white*255)],['background-tolerance',config.tolerance*100],['background-feather',config.feather*100]] as const)setValue(id,v);
  el<HTMLInputElement>('image-invert').checked=config.invert;el<HTMLInputElement>('background-enabled').checked=config.background_enabled;el<HTMLInputElement>('background-color').value=hexColor(config.background_color);
  imageOutputs();
}
function imageOutputs(){
  for(const id of ['image-brightness','image-contrast','image-gamma','background-tolerance','background-feather'])el(id+'-value').textContent=fmt(value(id))+(id.startsWith('background')?' %':'');
}
function readImageSettings():ImageSettings{return {method:el<HTMLSelectElement>('gray-method').value,brightness:value('image-brightness')/100,contrast:value('image-contrast'),gamma:value('image-gamma'),black:value('black-point')/255,white:value('white-point')/255,invert:el<HTMLInputElement>('image-invert').checked,background_enabled:el<HTMLInputElement>('background-enabled').checked,background_color:parseHex(el<HTMLInputElement>('background-color').value),tolerance:value('background-tolerance')/100,feather:value('background-feather')/100};}
function drawImagePreview(bitmap:ImageBitmap){
  const canvas=el<HTMLCanvasElement>('image-preview'),context=canvas.getContext('2d')!;
  context.clearRect(0,0,canvas.width,canvas.height);
  const scale=Math.min(canvas.width/bitmap.width,canvas.height/bitmap.height);
  imageRect={x:(canvas.width-bitmap.width*scale)/2,y:(canvas.height-bitmap.height*scale)/2,width:bitmap.width*scale,height:bitmap.height*scale};
  context.drawImage(bitmap,imageRect.x,imageRect.y,imageRect.width,imageRect.height);
}
async function refreshImagePreview(){
  const version=++imageSelectionVersion,layer=layers.find(l=>l.id===selectedId);
  if(!layer){const canvas=el<HTMLCanvasElement>('image-preview');canvas.getContext('2d')!.clearRect(0,0,canvas.width,canvas.height);const hist=el<HTMLCanvasElement>('histogram');hist.getContext('2d')!.clearRect(0,0,hist.width,hist.height);return;}
  const source=layer.image_id,config=structuredClone(layer.image_settings??defaultImageSettings());
  try{
    if(sourceId!==source){
      const bitmap=await createImageBitmap(await(await request('/api/source/'+source)).blob());
      if(version!==imageSelectionVersion){bitmap.close();return;}
      sourceBitmap?.close();sourceBitmap=bitmap;sourceId=source;
      originalCanvas.width=bitmap.width;originalCanvas.height=bitmap.height;originalCanvas.getContext('2d')!.drawImage(bitmap,0,0);
    }
    const result=await(await request('/api/image-preview',{image_id:source,image_settings:config})).json();
    if(version!==imageSelectionVersion)return;
    const bytes=Uint8Array.from(atob(result.png),(c:string)=>c.charCodeAt(0));
    const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/png'}));
    if(version!==imageSelectionVersion){bitmap.close();return;}
    drawImagePreview(pickingBackground&&sourceBitmap?sourceBitmap:bitmap);bitmap.close();
    const histogram=el<HTMLCanvasElement>('histogram'),ctx=histogram.getContext('2d')!;ctx.clearRect(0,0,256,48);
    const maximum=Math.max(1,...result.histogram);ctx.fillStyle='#91bfb8';
    result.histogram.forEach((amount:number,i:number)=>{const h=amount/maximum*45;ctx.fillRect(i,48-h,1,h);});
  }catch(error){if(version===imageSelectionVersion)status(String(error),true);}
}
for(const id of ['gray-method','image-brightness','image-contrast','image-gamma','black-point','white-point','image-invert','background-enabled','background-color','background-tolerance','background-feather'])el(id).addEventListener('input',()=>{
  const layer=layers.find(l=>l.id===selectedId);if(!layer)return;layer.image_settings=readImageSettings();imageOutputs();invalidate();update();
});
el('reset-image').onclick=()=>{const layer=layers.find(l=>l.id===selectedId);if(!layer||busy)return;layer.image_settings=defaultImageSettings();writeImageSettings(layer.image_settings);invalidate();update();};
el('pick-background').onclick=()=>{if(!selectedId||busy)return;pickingBackground=!pickingBackground;el('pick-background').classList.toggle('selected',pickingBackground);el('image-preview').style.cursor=pickingBackground?'crosshair':'default';if(pickingBackground&&sourceBitmap)drawImagePreview(sourceBitmap);else void refreshImagePreview();};
el('image-preview').onclick=event=>{
  if(!pickingBackground||!sourceBitmap||busy||!selectedId)return;
  const canvas=el<HTMLCanvasElement>('image-preview'),rect=canvas.getBoundingClientRect();
  const x=(event.clientX-rect.left)*canvas.width/rect.width-imageRect.x,y=(event.clientY-rect.top)*canvas.height/rect.height-imageRect.y;
  if(x<0||y<0||x>=imageRect.width||y>=imageRect.height)return;
  const px=Math.min(originalCanvas.width-1,Math.floor(x/imageRect.width*originalCanvas.width)),py=Math.min(originalCanvas.height-1,Math.floor(y/imageRect.height*originalCanvas.height));
  const color=originalCanvas.getContext('2d')!.getImageData(px,py,1,1).data;
  el<HTMLInputElement>('background-color').value=hexColor(Array.from(color.slice(0,3)));el<HTMLInputElement>('background-enabled').checked=true;
  const layer=layers.find(l=>l.id===selectedId)!;layer.image_settings=readImageSettings();pickingBackground=false;el('pick-background').classList.remove('selected');canvas.style.cursor='default';invalidate();update();
};
function schedulePreview(){
  previewRevision++;if(previewTimer)clearTimeout(previewTimer);
  previewTimer=setTimeout(()=>{previewTimer=null;void refreshComposite();},130);
  el('quality').textContent='Aktualizuji vrstvy…';
}
async function refreshComposite(force=false){
  if(!model||(!force&&busy))return;
  if(previewRunning){previewAgain=true;return;}
  previewRunning=true;const version=previewRevision;
  try{
    const response=await request('/api/preview-layers',composition());
    const image=await createImageBitmap(await response.blob(),{colorSpaceConversion:'none',premultiplyAlpha:'none'});
    if(version!==previewRevision){image.close();return;}
    const old=material.uniforms.motif.value as THREE.Texture;
    if(old.image instanceof ImageBitmap)old.image.close();old.dispose();
    const texture=new THREE.Texture(image);texture.flipY=false;texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;texture.needsUpdate=true;
    material.uniforms.motif.value=texture;material.uniforms.motifSize.value.set(image.width,image.height);material.uniforms.layered.value=true;
    hasMotif=layers.some(l=>l.enabled);el('quality').textContent='Rychlý náhled vrstev';update();
    void refreshImagePreview();
  }catch(error){status(String(error),true);el('quality').textContent='Náhled neaktualizován';}
  finally{previewRunning=false;if(previewAgain){previewAgain=false;if(!busy)void refreshComposite();}}
}
async function loadInfo(info:any,reset:boolean){
  blenderAvailable=!!info.blender;
  integrationAvailable=Array.isArray(info.integration_methods)&&info.integration_methods.includes("outside");
  el<HTMLSelectElement>("integration-method").value=integrationAvailable?(info.integration_method??"inside"):"inside";
  const oldModel=model;model=info.model;layers=info.layers??[];hasMotif=layers.some(l=>l.enabled);selectedId=null;
  el('stl-name').textContent=model?.name||'Načíst STL ↗';
  el('blender-info').textContent=info.blender?'Blender je dostupný. Finální výpočet poběží na tomto počítači.':'Blender nebyl nalezen. Scénu můžeš stáhnout a otevřít na počítači s Blenderem 4.2 nebo novějším.';
  if(model&&(reset||!oldModel)){
    const response=await request('/api/mesh');const geometry=decodeMesh(await response.arrayBuffer());
    invalidate(false);baseGeometry?.dispose();baseGeometry=geometry;mesh.geometry=geometry;
    setValue('minimum',model.min_mm);setValue('maximum',model.max_mm);setValue('width',Math.round(model.radius));
    const aspect=info.image_size?info.image_size[1]/info.image_size[0]:.75;setValue('height',Math.round(model.radius*aspect));
    material.uniforms.radius.value=model.radius;
    el('empty').hidden=true;el('model-info').textContent=`${model.name} · Ø ${fmt(model.radius*2,1)} mm · ${fmt(model.triangles,0)} trojúhelníků`;
    home();
  }
  selectLayer(info.selected_layer_id??layers.at(-1)?.id??null,false);
  if(reset&&info.restored_scene){const light=info.restored_scene;setValue('brightness',light.brightness*100);setValue('kelvin',light.kelvin);setValue('attenuation',light.attenuation);['led-x','led-y','led-z'].forEach((id,i)=>setValue(id,light.light[i]));camera.position.fromArray(light.camera);orbit.target.set(0,0,0);orbit.update();}
  previewRevision++;await refreshComposite(true);
  update();buttons();
}

el('integration-method').addEventListener('change',()=>{invalidate();update();});
for(const id of ['width','height','angle','strength','minimum','maximum'])el(id).addEventListener('input',()=>{
  if((id==='width'||id==='height')&&shiftDown&&Number.isFinite(value(id))&&value(id)>0){
    const [w,h]=resizeDimensions(previousWidth,previousHeight,id,value(id),true,model?Math.PI*model.radius:Infinity);
    setValue('width',Number(w.toFixed(3)));setValue('height',Number(h.toFixed(3)));
  }
  invalidate();update();
});
for(const id of ['brightness','kelvin','attenuation','led-x','led-y','led-z','guides'])el(id).addEventListener('input',update);
el('demo').onclick=()=>work('Načítám STL a měřím původní stěnu…',async()=>{await loadInfo(await(await request('/api/demo',{})).json(),true);status('Nový projekt s ukázkovou vrstvou je připravený. Obrázek můžeš změnit nebo vrstvu odebrat.');});
let replacementTarget:string|null=null;
el('replace-file').onclick=()=>{replacementTarget=selectedId;el<HTMLInputElement>('motif').click();};
let urlTarget:string|null=null;
const urlDialog=el<HTMLDialogElement>('url-dialog');
for(const id of ['add-url','replace-url'])el(id).onclick=()=>{
  urlTarget=id==='replace-url'?selectedId:null;
  el('url-title').textContent=urlTarget?'Změnit obrázek vybrané vrstvy':'Přidat vrstvu z URL';
  el<HTMLInputElement>('image-url').value='';urlDialog.showModal();
};
el('url-cancel').onclick=()=>urlDialog.close();
el('url-form').onsubmit=event=>{
  event.preventDefault();const url=el<HTMLInputElement>('image-url').value.trim(),target=urlTarget;urlDialog.close();
  void work('Stahuji a zpracovávám obrázek…',async()=>{
    invalidate(false);
    await request('/api/layers',composition());
    const info=await(await request('/api/motif-url',{url,layer_id:target})).json();
    invalidate(false);await loadInfo(info,false);status('Obrázek načten. Originál bude součástí uloženého projektu.');
  });
};
for(const id of ['stl','motif']){
  el('open-'+id).onclick=()=>{replacementTarget=null;el<HTMLInputElement>(id).click();};
  el(id).onchange=()=>work(id==='stl'?'Měřím skořepinu…':'Načítám motiv…',async()=>{
    const field=el<HTMLInputElement>(id),file=field.files?.[0];if(!file)return;
    if(id==='motif'&&model){invalidate(false);await request('/api/layers',composition());}
    const response=await fetch('/api/'+id,{method:'POST',headers:{'X-File-Name':encodeURIComponent(file.name),...(id==='motif'&&replacementTarget?{'X-Layer-Id':replacementTarget}:{})},body:file});field.value='';
    if(!response.ok)throw new Error((await response.json()).error);
    invalidate(false);await loadInfo(await response.json(),id==='stl');status('Soubor načten.');
  });
}
el('apply').onclick=()=>work('Přepočítávám zvolený povrch a ověřuji skutečné trojúhelníky…',async()=>{
  const result=await(await request('/api/apply',composition())).json();
  const geometry=decodeMesh(await(await request('/api/verified')).arrayBuffer());
  verifiedGeometry?.dispose();verifiedGeometry=geometry;resultId=result.result_id;exportable=result.exportable;
  original=false;el('original').classList.remove('selected');mesh.geometry=geometry;
  el('quality').textContent='Přepočítaná geometrie';
  const range=result.min_mm===null?'bez zásahu':`${fmt(result.min_mm,3)}–${fmt(result.max_mm,3)} mm`;
  el('validation').textContent=`${fmt(result.edited_vertices,0)} změněných vrcholů · ${fmt(result.samples,0)} vzorků · ${range}.`;
  status(result.exportable?`Model ověřen ve vzorcích. Mimo motiv zůstalo ${fmt(result.untouched_outside,0)} původních vzorků mimo meze. Opravené drobné mezery: ${result.repairs}.`:`Export blokován: ${result.outside} vzorků mimo meze a ${result.invalid} neplatných průsečíků. Rozšiř meze nebo sniž dominanci.`,!result.exportable);
  update();
});
function download(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
el('export').onclick=()=>work('Připravuji STL…',async()=>{download(await(await request('/api/export',{result_id:resultId})).blob(),`moon-${el<HTMLSelectElement>('integration-method').value}.stl`);status('STL uložen. Před tiskem zkontroluj řezy a perimetry v tiskovém programu.');});
el('bundle').onclick=()=>work('Připravuji ověřený model a scénu pro Blender…',async()=>{download(await(await request('/api/bundle',{result_id:resultId,scene:sceneSettings()})).blob(),'luna-blender-scene.zip');status('Balíček obsahuje STL, scénu JSON a skript render_blender.py.');});
let renderPolling=false;
el('render').onclick=()=>work('Předávám scénu Blenderu…',async()=>{
  if(renderPolling)throw new Error('Vykreslování již probíhá.');
  await request('/api/render',{result_id:resultId,scene:sceneSettings()});renderPolling=true;status('Blender vykresluje scénu. Můžeš pokračovat v editoru.');
  const timer=setInterval(async()=>{try{
    const result=await(await request('/api/render-status')).json();if(result.status==='running')return;
    clearInterval(timer);renderPolling=false;if(result.status==='failed')throw new Error(result.error);
    download(await(await request('/api/render.png')).blob(),'luna-render.png');status('Finální obrázek je hotový.');
  }catch(error){clearInterval(timer);renderPolling=false;status(String(error),true);}},3000);
});
el('snapshot').onclick=()=>{const visible=guide.visible;guide.visible=false;renderer.render(scene,camera);renderer.domElement.toBlob(blob=>{if(blob)download(blob,'luna-preview.png');});guide.visible=visible;};
el('save').onclick=()=>work('Ukládám zdrojové STL, originály, upravená PNG a metadata…',async()=>{
  const response=await request('/api/project-save',{...composition(),scene:sceneSettings(),result_id:resultId});
  const included=response.headers.get('X-Luna-Result-Included')==='true';
  download(await response.blob(),'moon-project.luna');
  status(included?'Projekt uložen včetně aktuálního upraveného result.stl.':'Projekt uložen BEZ upraveného STL. Obsahuje zdroje a nastavení pro další úpravy. Pro přiložení výsledku nejdřív přepočítej a ověř model.',!included);
});
el('restore').onclick=()=>el<HTMLInputElement>('settings-file').click();
el('settings-file').onchange=()=>work('Obnovuji celý projekt a měřím STL…',async()=>{
  const field=el<HTMLInputElement>('settings-file'),file=field.files?.[0];if(!file)return;field.value='';
  const response=await fetch('/api/project-open',{method:'POST',body:file});if(!response.ok)throw new Error((await response.json()).error);
  invalidate(false);await loadInfo(await response.json(),true);status('Projekt obnoven včetně zdrojů a pořadí vrstev.');
});
el('layer-name').oninput=()=>{const layer=layers.find(l=>l.id===selectedId);if(layer){layer.name=el<HTMLInputElement>('layer-name').value;drawLayers();}};
el('layer-copy').onclick=()=>{if(busy)return;syncSelected();const source=layers.find(l=>l.id===selectedId);if(!source)return;const copy=structuredClone(source);copy.id=crypto.randomUUID();copy.name=source.name+' — kopie';layers.push(copy);selectLayer(copy.id,false);invalidate();update();};
el('layer-remove').onclick=()=>{if(busy)return;const index=layers.findIndex(l=>l.id===selectedId);if(index<0)return;layers.splice(index,1);selectLayer(layers[Math.min(index,layers.length-1)]?.id??null,false);invalidate();update();};
for(const [id,delta] of [['layer-up',1],['layer-down',-1]] as const)el(id).onclick=()=>{if(busy)return;syncSelected();const index=layers.findIndex(l=>l.id===selectedId),next=index+delta;if(index<0||next<0||next>=layers.length)return;[layers[index],layers[next]]=[layers[next],layers[index]];drawLayers();invalidate();update();};
el('home').onclick=home;
el('original').onclick=()=>{if(busy||!baseGeometry)return;original=!original;el('original').classList.toggle('selected',original);mesh.geometry=original?baseGeometry:(verifiedGeometry??baseGeometry);update();};
el('move').onclick=()=>{if(busy)return;moving=!moving;el('move').classList.toggle('selected',moving);renderer.domElement.style.cursor=moving?'crosshair':'grab';buttons();};
document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button=>button.onclick=()=>{currentMode=Number(button.dataset.mode);document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('selected',b===button));el('mode-label').textContent=['POVRCH','PODSVÍCENÍ','TLOUŠŤKA'][currentMode];update();});

function cast(event:PointerEvent){const rect=renderer.domElement.getBoundingClientRect();raycaster.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2),camera);}
let drag:string|null=null;
renderer.domElement.addEventListener('pointerdown',event=>{
  if(busy||!model||!selectedId||event.button!==0)return;cast(event);
  const hit=guide.visible?raycaster.intersectObjects(handles,false)[0]:null;
  if(hit){drag=hit.object.userData.kind;orbit.enabled=false;event.stopImmediatePropagation();renderer.domElement.setPointerCapture(event.pointerId);}
  else if(moving||event.ctrlKey){drag='anchor';orbit.enabled=false;event.stopImmediatePropagation();renderer.domElement.setPointerCapture(event.pointerId);move(event);}
},true);
function move(event:PointerEvent){
  if(!drag||!model||busy)return;cast(event);
  if(drag==='anchor'){
    const hit=raycaster.intersectObject(mesh,false)[0];if(!hit)return;anchor.copy(hit.point).normalize();
  }else{
    const plane=new THREE.Plane().setFromNormalAndCoplanarPoint(anchor,anchor.clone().multiplyScalar(model.radius));
    const point=raycaster.ray.intersectPlane(plane,new THREE.Vector3());if(!point)return;
    const b=basis(anchor),local=point.sub(anchor.clone().multiplyScalar(model.radius));
    const x=local.dot(b.east),y=local.dot(b.north),a=value('angle')*Math.PI/180;
    if(drag==='angle')setValue('angle',((Math.round(Math.atan2(y,x)*180/Math.PI-90)+540)%360)-180);
    else if(drag==='width'||drag==='height'){
      const distance=drag==='width'?Math.abs(Math.cos(a)*x+Math.sin(a)*y):Math.abs(-Math.sin(a)*x+Math.cos(a)*y);
      const next=Math.max(2,2*model.radius*Math.atan(distance/model.radius));
      const [w,h]=resizeDimensions(value('width'),value('height'),drag,next,event.shiftKey,model.radius*Math.PI);
      setValue('width',Number(w.toFixed(3)));setValue('height',Number(h.toFixed(3)));
    }
  }
  invalidate();orbit.enabled=false;update();
}
renderer.domElement.addEventListener('pointermove',move);
for(const name of ['pointerup','pointercancel'])renderer.domElement.addEventListener(name,()=>{drag=null;buttons();});
work('Otevírám pracovní prostor…',async()=>{await loadInfo(await(await request('/api/info')).json(),true);});
