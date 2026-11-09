import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {decodeMesh,type Placement} from './model';
import {BUSY_REASON,setControlState} from './control-state';
import {sampleAroundLayer,sampleFrame,samplePoint,validateSample,type SampleSelection} from './sample-model';

type Context={radius:number|null;busy:boolean;resultId:string|null;exportable:boolean;layer:Placement|null;};
type Options={scene:THREE.Scene;camera:THREE.PerspectiveCamera;mesh:THREE.Mesh;canvas:HTMLCanvasElement;orbit:OrbitControls;
  context:()=>Context;request:(path:string,body?:unknown)=>Promise<Response>;
  work:(message:string,action:()=>Promise<void>)=>Promise<void>;status:(text:string,error?:boolean)=>void;
  download:(blob:Blob,name:string)=>void;changed:()=>void;};
const html=`<div class="section-title"><span>◇</span><h2>Zkušební výřez</h2></div>
  <p class="hint">Vytiskni jen část měsíce kolem motivu nebo překrytí více obrázků.</p>
  <button id="sample-draw" class="wide">Vyznačit obdélník na Měsíci</button>
  <div class="fields"><label>Okraj kolem motivu <em>mm</em><input id="sample-margin" type="number" min="0" step="1" value="5"></label><button id="sample-layer">Kolem vybrané vrstvy</button></div>
  <div id="sample-bounds" hidden><div class="fields">
    <label>Levý řez <em>mm</em><input id="sample-left" type="number" step="1"></label>
    <label>Pravý řez <em>mm</em><input id="sample-right" type="number" step="1"></label>
    <label>Spodní řez <em>mm</em><input id="sample-bottom" type="number" step="1"></label>
    <label>Horní řez <em>mm</em><input id="sample-top" type="number" step="1"></label>
  </div><p id="sample-size" class="hint"></p>
  <div class="fields"><button id="sample-edit">Posouvat hrany výřezu</button><button id="sample-clear">Zrušit výřez</button></div></div>
  <p id="sample-help" class="hint">Nejprve natoč měsíc čelně k motivu. Pak vyznač obdélník tažením. Rozměry výřezu jsou rovinné, nikoli délky po oblouku.</p>
  <button id="sample-prepare" class="primary wide">Připravit vzorek na podložce</button>
  <p class="hint">Použije ověřenou geometrii se všemi vrstvami. Spodní řez vytvoří stojnou plochu bez přidaného podstavce. Velké výřezy mohou potřebovat podpory.</p>`;

/** Independent selection: changing a crop never changes a layer or invalidates the moon. */
export class SampleTool{
  selection:SampleSelection|null=null;
  available=false;
  interacting=false;
  private drawing=false;
  private drag:string|null=null;
  private start:THREE.Vector2|null=null;
  private pending:SampleSelection|null=null;
  private activePointer:number|null=null;
  private originalSelection:SampleSelection|null=null;
  private sampleId:string|null=null;
  private revision=0;
  private group=new THREE.Group();
  private outline:THREE.Line;
  private handles:THREE.Mesh[]=[];
  private ray=new THREE.Raycaster();
  private panel:HTMLElement;
  private dialog:HTMLDialogElement;
  private previewRenderer:THREE.WebGLRenderer|null=null;
  private previewGeometry:THREE.BufferGeometry|null=null;
  private previewOrbit:OrbitControls|null=null;
  constructor(private o:Options){
    this.panel=document.createElement('section');this.panel.id='sample-panel';this.panel.innerHTML=html;
    document.querySelector('aside')!.lastElementChild!.before(this.panel);
    this.dialog=document.createElement('dialog');this.dialog.id='sample-dialog';
    this.dialog.innerHTML='<h2>Zkušební vzorek na podložce</h2><div id="sample-preview"></div><p id="sample-summary"></p><p id="sample-warning" class="hint"></p><div class="fields"><button id="sample-export">Exportovat vzorek STL</button><button id="sample-close">Zpět na Měsíc</button></div>';
    document.body.append(this.dialog);
    this.outline=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xffb65b,depthTest:false}));
    this.outline.renderOrder=15;this.group.add(this.outline);
    for(const side of ['left','right','bottom','top']){
      const handle=new THREE.Mesh(new THREE.SphereGeometry(1,12,8),new THREE.MeshBasicMaterial({color:0xffb65b,depthTest:false}));
      handle.userData.side=side;handle.renderOrder=16;this.group.add(handle);this.handles.push(handle);
    }
    o.scene.add(this.group);this.group.visible=false;
    this.button('sample-draw').onclick=()=>{
      this.drawing=!this.drawing;this.interacting=this.drawing;this.render();this.refresh();o.changed();
    };
    this.button('sample-layer').onclick=()=>{
      try{const c=o.context();if(!c.layer||!c.radius)return;
        this.commit(sampleAroundLayer(c.layer,c.radius,this.input('sample-margin').valueAsNumber));
        this.drawing=false;this.interacting=true;this.render();this.refresh();o.changed();
        o.status('Výřez vytvořen. Oranžové úchyty posouvají jednotlivé řezné hrany.');
      }catch(e){o.status(String(e),true);}
    };
    this.button('sample-edit').onclick=()=>{this.interacting=!this.interacting;this.drawing=false;this.render();this.refresh();o.changed();};
    this.button('sample-clear').onclick=()=>{this.restore(null);o.changed();};
    for(const key of ['left','right','bottom','top'] as const)this.input('sample-'+key).onchange=()=>{
      if(!this.selection)return;
      try{this.commit({...this.selection,[key]:this.input('sample-'+key).valueAsNumber});}
      catch(e){o.status(String(e),true);this.render();}
    };
    this.button('sample-prepare').onclick=()=>void o.work('Řežu ověřenou skořepinu a uzavírám stojnou plochu…',async()=>{
      const c=o.context();if(!this.selection||!c.resultId)return;
      const revision=this.revision;
      const result=await(await o.request('/api/sample-prepare',{result_id:c.resultId,selection:this.selection})).json();
      const geometry=decodeMesh(await(await o.request('/api/sample-mesh')).arrayBuffer());
      if(revision!==this.revision||c.resultId!==o.context().resultId){geometry.dispose();return;}
      this.sampleId=result.sample_id;
      this.showPreview(geometry,result.dimensions_mm,result.warning);this.refresh();
      o.status('Vzorek je připravený na podložce. Exportuje se stejná geometrie jako v tomto náhledu.');
    });
    this.button('sample-export').onclick=()=>void o.work('Zapisuji samostatný vzorek STL…',async()=>{
      if(!this.sampleId)return;
      try{
        o.download(await(await o.request('/api/sample-export',{result_id:o.context().resultId,sample_id:this.sampleId})).blob(),'moon-sample.stl');
        const message='Vzorek STL uložen. V tiskovém programu ověř převisy a přilnavost stojné plochy.';
        document.getElementById('sample-warning')!.textContent=message;o.status(message);
      }catch(error){document.getElementById('sample-warning')!.textContent=String(error);throw error;}
    });
    this.button('sample-close').onclick=()=>this.dialog.close();
    this.dialog.addEventListener('close',()=>this.disposePreview());
    o.canvas.addEventListener('pointerdown',e=>this.down(e),true);
    o.canvas.addEventListener('pointermove',e=>this.move(e),true);
    o.canvas.addEventListener('pointerup',e=>this.end(e,false),true);
    o.canvas.addEventListener('pointercancel',e=>this.end(e,true),true);
    o.canvas.addEventListener('lostpointercapture',e=>this.end(e,true),true);
    window.addEventListener('keydown',e=>{if(e.key==='Escape'&&!this.dialog.open){this.cancel();this.interacting=this.drawing=false;this.render();this.refresh();o.changed();}});
  }
  private button(id:string){return document.getElementById(id) as HTMLButtonElement;}
  private input(id:string){return document.getElementById(id) as HTMLInputElement;}
  stopInteraction(){this.cancel();this.interacting=this.drawing=false;this.render();this.refresh();}
  restore(selection:SampleSelection|null){
    this.cancel();this.selection=null;this.interacting=this.drawing=false;
    if(selection&&this.o.context().radius){
      try{this.selection=validateSample(selection,this.o.context().radius!);}catch(e){this.o.status(String(e),true);}
    }
    this.invalidateModel();this.render();this.refresh();
  }
  invalidateModel(){this.revision++;this.sampleId=null;if(this.dialog.open)this.dialog.close();this.disposePreview();}
  refresh(){
    const c=this.o.context();
    for(const control of Array.from(this.panel.querySelectorAll<HTMLInputElement|HTMLButtonElement>('input,button'))){
      let reason=c.busy?BUSY_REASON:!this.available?'Tato běžící služba výřez neumí. Ulož projekt a restartuj Lunu.':!c.radius?'Nejdřív načti měsíční STL.':null;
      if(!reason&&control.id==='sample-layer'&&!c.layer)reason='Nejdřív vyber obrazovou vrstvu, nebo vyznač oblast ručně.';
      if(!reason&&control.id==='sample-prepare')reason=!this.selection?'Nejdřív vyznač oblast nebo zvol „Kolem vybrané vrstvy“.':!c.resultId||!c.exportable?'Nejdřív přepočítej a ověř aktuální model.':null;
      setControlState(control,reason);
    }
    setControlState(this.button('sample-export'),c.busy?BUSY_REASON:!this.sampleId?'Nejdřív připrav aktuální vzorek.':null);
    this.button('sample-draw').classList.toggle('selected',this.drawing);
    this.button('sample-edit').classList.toggle('selected',this.interacting&&!this.drawing);
    this.o.orbit.enabled=!c.busy&&!this.interacting;
    if(this.interacting)this.o.canvas.style.cursor='crosshair';else this.o.canvas.style.cursor='grab';
    document.getElementById('sample-help')!.textContent=this.drawing?'Táhni přes požadovanou oblast. Escape výběr ukončí. Pravou a levou hranici i výšku můžeš následně doladit.':
      this.interacting?'Táhni za oranžové úchyty nebo změň číselné polohy řezů. „Posouvat hrany výřezu“ znovu uvolní otáčení měsíce.':
      'Nejprve natoč měsíc čelně k motivu. Vyznač obdélník tažením. Rozměry výřezu jsou rovinné, nikoli délky po oblouku.';
  }
  private commit(selection:SampleSelection){
    this.selection=validateSample(selection,this.o.context().radius!);this.invalidateModel();this.render();this.refresh();
  }
  private render(){
    const s=this.selection,r=this.o.context().radius;
    document.getElementById('sample-bounds')!.hidden=!s;
    this.group.visible=!!s&&!!r;
    if(!s||!r)return;
    const points:THREE.Vector3[]=[];
    for(let side=0;side<4;side++)for(let i=0;i<=40;i++){
      const t=i/40,x=side===0?s.left+t*(s.right-s.left):side===1?s.right:side===2?s.right-t*(s.right-s.left):s.left;
      const y=side===0?s.bottom:side===1?s.bottom+t*(s.top-s.bottom):side===2?s.top:s.top-t*(s.top-s.bottom);
      points.push(samplePoint(x,y,s,r));
    }
    this.outline.geometry.dispose();this.outline.geometry=new THREE.BufferGeometry().setFromPoints(points);
    const coords=[[s.left,(s.bottom+s.top)/2],[s.right,(s.bottom+s.top)/2],[(s.left+s.right)/2,s.bottom],[(s.left+s.right)/2,s.top]];
    this.handles.forEach((h,i)=>{h.position.copy(samplePoint(...coords[i] as [number,number],s,r));h.scale.setScalar(r*.018);h.visible=this.interacting&&!this.drawing;});
    for(const key of ['left','right','bottom','top'] as const)this.input('sample-'+key).value=s[key].toFixed(2);
    document.getElementById('sample-size')!.textContent=`Výřez ${(s.right-s.left).toFixed(1)} × ${(s.top-s.bottom).toFixed(1)} mm. Spodní hrana bude stát na podložce.`;
  }
  private cast(e:PointerEvent){
    const rect=this.o.canvas.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,1-(e.clientY-rect.top)/rect.height*2),this.o.camera);
  }
  private point(s:SampleSelection):THREE.Vector2|null{
    const hit=this.ray.intersectObject(this.o.mesh,false)[0];if(!hit)return null;
    const f=sampleFrame(s);if(hit.point.dot(f.front)<=0)return null;
    return new THREE.Vector2(hit.point.dot(f.right),hit.point.dot(f.up));
  }
  private down(e:PointerEvent){
    const c=this.o.context();if(!this.interacting||c.busy||!c.radius||e.button!==0)return;
    this.cast(e);
    if(this.drawing){
      const front=this.o.camera.position.clone().sub(this.o.orbit.target).normalize();
      this.pending={anchor:front.toArray(),angle_deg:0,left:0,right:0,bottom:0,top:0};
      this.start=this.point(this.pending);if(!this.start)return;
      this.drag='draw';
    }else{
      const hit=this.ray.intersectObjects(this.handles,false)[0];if(!hit)return;
      this.drag=hit.object.userData.side;
    }
    this.originalSelection=this.selection?structuredClone(this.selection):null;
    this.activePointer=e.pointerId;this.o.canvas.setPointerCapture(e.pointerId);e.stopImmediatePropagation();e.preventDefault();
  }
  private move(e:PointerEvent){
    if(!this.drag||e.pointerId!==this.activePointer||this.o.context().busy)return;
    this.cast(e);const s=this.drag==='draw'?this.pending:this.selection;if(!s)return;
    const point=this.point(s);if(!point)return;
    const next={...s};
    if(this.drag==='draw'&&this.start){next.left=Math.min(this.start.x,point.x);next.right=Math.max(this.start.x,point.x);next.bottom=Math.min(this.start.y,point.y);next.top=Math.max(this.start.y,point.y);}
    else if(this.drag==='left'||this.drag==='right')next[this.drag]=point.x;
    else if(this.drag==='bottom'||this.drag==='top')next[this.drag]=point.y;
    try{this.commit(next);}catch{/* Keep the last valid rectangle while dragging past the silhouette. */}
    e.stopImmediatePropagation();
  }
  private end(e:PointerEvent,cancel:boolean){
    if(!this.drag||e.pointerId!==this.activePointer)return;
    if(cancel)this.selection=this.originalSelection;
    this.drag=null;this.start=null;this.pending=null;this.activePointer=null;
    if(this.o.canvas.hasPointerCapture(e.pointerId))this.o.canvas.releasePointerCapture(e.pointerId);
    this.drawing=false;this.render();this.refresh();this.o.changed();
  }
  private cancel(){
    if(this.drag)this.selection=this.originalSelection;
    this.drag=null;this.activePointer=null;this.start=null;this.pending=null;
  }
  private disposePreview(){
    this.previewRenderer?.setAnimationLoop(null);this.previewOrbit?.dispose();this.previewRenderer?.dispose();
    this.previewGeometry?.dispose();this.previewRenderer=null;this.previewGeometry=null;this.previewOrbit=null;
    document.getElementById('sample-preview')!.replaceChildren();
  }
  private showPreview(geometry:THREE.BufferGeometry,dimensions:number[],warning:string){
    this.disposePreview();this.previewGeometry=geometry;
    const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});this.previewRenderer=renderer;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,1,.01,10000);camera.up.set(0,0,1);
    const material=new THREE.MeshNormalMaterial({side:THREE.DoubleSide});scene.add(new THREE.Mesh(geometry,material));
    const size=Math.max(...dimensions,10),grid=new THREE.GridHelper(size*1.6,10,0x9ce5d4,0x485960);
    grid.rotation.x=Math.PI/2;grid.position.z=-.02;scene.add(grid);
    const orbit=new OrbitControls(camera,renderer.domElement);this.previewOrbit=orbit;
    orbit.target.set(0,0,dimensions[2]/2);camera.position.set(size*1.4,-size*2,size*1.1);orbit.update();
    const host=document.getElementById('sample-preview')!;host.append(renderer.domElement);
    document.getElementById('sample-summary')!.textContent=`${dimensions.map(n=>n.toFixed(1)).join(' × ')} mm · uzavřená skořepina · spodní řez na Z = 0. Tažením otočíš náhled.`;
    document.getElementById('sample-warning')!.textContent=warning;
    this.dialog.showModal();
    const width=host.clientWidth||600;renderer.setSize(width,360);camera.aspect=width/360;camera.updateProjectionMatrix();
    renderer.setAnimationLoop(()=>{orbit.update();renderer.render(scene,camera);});
    // Dispose scene-only GPU resources on close; the geometry is owned above.
    this.dialog.addEventListener('close',()=>{material.dispose();grid.geometry.dispose();
      if(Array.isArray(grid.material))grid.material.forEach(m=>m.dispose());else grid.material.dispose();},{once:true});
  }
}
