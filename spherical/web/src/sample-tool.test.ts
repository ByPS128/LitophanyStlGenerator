// @vitest-environment jsdom
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {SampleTool} from './sample-tool';

vi.mock('three',async original=>({...await original<typeof import('three')>(),WebGLRenderer:class{
  domElement=document.createElement('canvas');setPixelRatio(){}setSize(){}setAnimationLoop(){}dispose(){}
}}));
vi.mock('three/addons/controls/OrbitControls.js',async()=>({OrbitControls:class{target=new THREE.Vector3();enabled=true;update(){}dispose(){}}}));
let tool:SampleTool,canvas:HTMLCanvasElement;
let context={radius:100 as number|null,busy:false,resultId:'verified' as string|null,exportable:true,
  layer:{anchor:[1,0,0],angle_deg:0,width_mm:40,height_mm:30,strength:.5,min_mm:.7,max_mm:3}};
const button=(id:string)=>document.getElementById(id) as HTMLButtonElement;
const request=vi.fn(),download=vi.fn(),changed=vi.fn();
beforeEach(()=>{
  document.body.innerHTML='<aside><section>Output</section></aside>';
  context={radius:100,busy:false,resultId:'verified',exportable:true,layer:{anchor:[1,0,0],angle_deg:0,width_mm:40,height_mm:30,strength:.5,min_mm:.7,max_mm:3}};
  request.mockReset();download.mockReset();changed.mockReset();
  HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new Event('close'));};
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,1,.1,1000);
  camera.up.set(0,0,1);camera.position.set(350,0,0);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(100,64,48),new THREE.MeshBasicMaterial());scene.add(mesh);mesh.updateMatrixWorld();
  canvas=document.createElement('canvas');document.body.append(canvas);
  canvas.getBoundingClientRect=()=>({left:0,top:0,width:600,height:600} as DOMRect);
  canvas.setPointerCapture=vi.fn();canvas.releasePointerCapture=vi.fn();canvas.hasPointerCapture=()=>false;
  tool=new SampleTool({scene,camera,mesh,canvas,orbit:new OrbitControls(camera,canvas),context:()=>context,
    request,download,changed,status:vi.fn(),work:async(_message,action)=>action()});
  tool.available=true;tool.refresh();
});
afterEach(()=>{tool.invalidateModel();vi.restoreAllMocks();});

it('selects around a layer, edits independent borders and exports only the prepared sample',async()=>{
  const original=structuredClone(context.layer);
  button('sample-layer').click();expect(tool.selection).not.toBeNull();expect(tool.interacting).toBe(true);
  expect(button('sample-prepare').disabled).toBe(false);
  const left=document.getElementById('sample-left') as HTMLInputElement;
  left.value='-30';left.dispatchEvent(new Event('change'));
  expect(tool.selection!.left).toBe(-30);expect(context.layer).toEqual(original);expect(context.resultId).toBe('verified');
  request.mockImplementation(async(path:string)=>path==='/api/sample-prepare'?new Response(JSON.stringify({sample_id:'coupon',dimensions_mm:[60,8,40],warning:'check'})):
    path==='/api/sample-mesh'?new Response(new ArrayBuffer(8)):new Response('STL'));
  button('sample-prepare').click();await vi.waitFor(()=>expect((document.getElementById('sample-dialog') as HTMLDialogElement).open).toBe(true));
  button('sample-export').click();await vi.waitFor(()=>expect(download).toHaveBeenCalled());
  expect(request).toHaveBeenCalledWith('/api/sample-export',{result_id:'verified',sample_id:'coupon'});
  left.value='-32';left.dispatchEvent(new Event('change'));tool.refresh();
  expect(button('sample-export').disabled).toBe(true);
  expect((document.getElementById('sample-dialog') as HTMLDialogElement).open).toBe(false);
});
function pointer(type:string,x:number,y:number){
  const event=new MouseEvent(type,{clientX:x,clientY:y,button:0,bubbles:true});
  Object.defineProperty(event,'pointerId',{value:1});canvas.dispatchEvent(event);
}
it('draws an arbitrary rectangle and cancels a partial replacement without touching layers',()=>{
  button('sample-draw').click();pointer('pointerdown',250,240);pointer('pointermove',350,360);pointer('pointerup',350,360);
  expect(tool.selection!.right-tool.selection!.left).toBeGreaterThan(20);
  expect(tool.selection!.top-tool.selection!.bottom).toBeGreaterThan(20);
  const selected=structuredClone(tool.selection);
  button('sample-draw').click();pointer('pointerdown',260,250);pointer('pointermove',330,330);pointer('pointercancel',330,330);
  expect(tool.selection).toEqual(selected);
});
it('requires verified geometry, handles old services and restores the crop independently',()=>{
  button('sample-layer').click();const selected=structuredClone(tool.selection);
  tool.restore(null);expect(tool.selection).toBeNull();expect(tool.interacting).toBe(false);
  tool.restore(selected);expect(tool.selection).toEqual(selected);
  context.resultId=null;tool.invalidateModel();tool.refresh();
  expect(button('sample-prepare').disabled).toBe(true);expect(button('sample-prepare').title).toContain('ověř');
  tool.available=false;tool.refresh();expect(button('sample-draw').disabled).toBe(true);expect(button('sample-draw').title).toContain('restartuj');
});
