// @vitest-environment jsdom
import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {defaultImageSettings} from './image-settings';

// Exercise the real page and its event handlers. Only GPU rendering and I/O are replaced.
vi.mock('three',async importOriginal=>{
  const actual=await importOriginal<typeof import('three')>();
  return {...actual,WebGLRenderer:class{
    domElement=document.createElement('canvas');
    setPixelRatio(){} setSize(){} setAnimationLoop(){} render(){}
  }};
});
vi.mock('three/addons/controls/OrbitControls.js',async()=>{
  const {Vector3}=await import('three');
  return {OrbitControls:class{target=new Vector3();enabled=true;enableDamping=false;update(){}}};
});

const plate={width:150,height:100,min_mm:.6,max_mm:3.6,border_enabled:true,border_mm:5,border_height_mm:.6,allow_overflow:false,
  print_mode:'FDM',nozzle_mm:.4,pixel_ratio:.8,resin_resolution:3,smoothing:'BilateralFilter',resample:'Bicubic',sigma:2,threshold:.5,window:3,spatial:1,range:1};
const info={kind:'flat',plate,layers:[{id:'dragon',image_id:'source',name:'dragon.png',enabled:true,
  placement:{x_mm:0,y_mm:0,width_mm:100,height_mm:60,angle_deg:0,strength:1},image_settings:defaultImageSettings()}],
  scene:{brightness:1,kelvin:3000,attenuation:.78,mode:1},bridge_available:true};
const input=(id:string)=>document.getElementById(id) as HTMLInputElement;
const button=(id:string)=>document.getElementById(id) as HTMLButtonElement;
function json(data:unknown){return new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});}
async function boot(legacy=false){
  const project=structuredClone(info);
  if(legacy){delete (project.plate as any).border_height_mm;delete (project.plate as any).allow_overflow;}
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
    if(url==='/runtime.json')return json({flat_editor_url:'http://127.0.0.1:8767/flat.html'});
    if(url.endsWith('/info')||url.endsWith('/new'))return json(project);
    if(url.endsWith('/preview'))return json({...project,x:[0,150],y:[0,100],heights:[.6,.6,.6,.6]});
    if(url.endsWith('/image-preview'))return new Response(new Blob(['image']));
    if(url.endsWith('/calculate'))return json({result_id:'calculated',triangles:12,samples:4,width:150,height:100});
    if(url.endsWith('/heights')){
      const buffer=new ArrayBuffer(40),view=new DataView(buffer);view.setUint32(0,2,true);view.setUint32(4,2,true);
      new Float32Array(buffer,8).set([0,150,0,100,.6,.6,.6,.6]);return new Response(buffer);
    }
    throw new Error('Unexpected request '+url);
  }));
  await import('./flat-main');
  await vi.waitFor(()=>expect(button('new').disabled).toBe(false));
}
beforeEach(()=>{
  vi.resetModules();vi.useFakeTimers();document.body.innerHTML='<div id="app"></div>';
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
  vi.stubGlobal('createImageBitmap',vi.fn(async()=>({width:12,height:8,close:vi.fn()})));
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({clearRect:vi.fn(),drawImage:vi.fn()} as any);
});
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();});

describe('actual flat editor control workflows',()=>{
  it('lets the user enable overflow in a new compatible project and explains the effect',async()=>{
    await boot();
    expect(input('allow-overflow').disabled).toBe(false);
    expect(input('allow-overflow').title).toContain('Přesah se ořízne');
    input('allow-overflow').closest('label')!.click();
    expect(input('allow-overflow').checked).toBe(true);
    button('new').click();
    await vi.waitFor(()=>expect(button('new').disabled).toBe(false));
    expect(input('allow-overflow').disabled).toBe(false);
    expect(input('allow-overflow').checked).toBe(false);
    expect(document.getElementById('compatibility-banner')!.hidden).toBe(true);
  });
  it('explains the old-service restriction before and after creating a new project and offers the real destination',async()=>{
    await boot(true);
    expect(input('allow-overflow').disabled).toBe(true);
    expect(input('allow-overflow').title).toContain('Nový projekt to nezmění');
    const wrapper=input('allow-overflow').closest('.ux-control')!;
    expect((wrapper.querySelector('.ux-reason') as HTMLElement).hidden).toBe(false);
    expect(document.getElementById('compatibility-banner')!.hidden).toBe(false);
    await vi.waitFor(()=>expect((document.getElementById('current-editor') as HTMLAnchorElement).href).toBe('http://127.0.0.1:8767/flat.html'));
    button('new').click();
    await vi.waitFor(()=>expect(button('new').disabled).toBe(false));
    expect(input('allow-overflow').disabled).toBe(true);
    expect(input('allow-overflow').title).toContain('Otevřít aktuální editor');
  });
  it('explains missing-layer controls together without blocking project-level overflow',async()=>{
    await boot();button('remove').click();
    expect(input('width-mm').disabled).toBe(true);
    expect(input('width-mm').title).toContain('vyber obrazovou vrstvu');
    expect(document.getElementById('layer-state-note')!.hidden).toBe(false);
    expect(document.getElementById('image-state-note')!.hidden).toBe(false);
    expect(input('allow-overflow').disabled).toBe(false);
  });
  it('explains export readiness, enables export after calculation, and restores its reason after an edit',async()=>{
    await boot();expect(button('export').disabled).toBe(true);
    expect(button('export').title).toContain('Přepočítat model v .NET');
    button('calculate').click();
    await vi.waitFor(()=>expect(button('calculate').disabled).toBe(false));
    expect(button('export').disabled).toBe(false);
    expect(button('export').title).not.toContain('Nejdřív');
    input('width-mm').value='80';input('width-mm').dispatchEvent(new Event('input',{bubbles:true}));
    expect(button('export').disabled).toBe(true);
    expect(button('export').title).toContain('Přepočítat model v .NET');
  });
});
