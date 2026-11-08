// @vitest-environment jsdom
import {afterEach,beforeEach,it,expect,vi} from 'vitest';

vi.mock('three',async importOriginal=>{
  const actual=await importOriginal<typeof import('three')>();
  return {...actual,WebGLRenderer:class{
    domElement=document.createElement('canvas');
    setPixelRatio(){} setSize(){} setAnimationLoop(){} render(){}
  }};
});
vi.mock('three/addons/controls/OrbitControls.js',async()=>{
  const {Vector3}=await import('three');
  return {OrbitControls:class{target=new Vector3();enabled=true;update(){}}};
});
const button=(id:string)=>document.getElementById(id) as HTMLButtonElement;
const method=()=>document.getElementById('integration-method') as HTMLSelectElement;
function json(data:unknown){return new Response(JSON.stringify(data));}
async function boot(legacy=false,selected='inside'){
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
    if(url==='/api/info')return json({model:{radius:100,min_mm:.7,max_mm:3,name:'moon',triangles:0},layers:[],
      ...(!legacy?{integration_methods:['inside','outside'],integration_method:selected}:{})});
    if(url==='/api/mesh'||url==='/api/verified')return new Response(new ArrayBuffer(8));
    if(url==='/api/preview-layers')return new Response('atlas');
    if(url==='/api/apply')return json({result_id:'verified',exportable:true,min_mm:null,edited_vertices:0,samples:0,untouched_outside:0,repairs:0});
    throw new Error('Unexpected request '+url);
  }));
  await import('./main');
  await vi.waitFor(()=>expect(button('demo').disabled).toBe(false));
}
beforeEach(()=>{
  vi.resetModules();vi.useFakeTimers();document.body.innerHTML='<div id="app"></div>';
  vi.stubGlobal('ResizeObserver',class{observe(){}});
  class Bitmap{width=12;height=8;close(){}}
  vi.stubGlobal('ImageBitmap',Bitmap);
  vi.stubGlobal('createImageBitmap',vi.fn(async()=>new Bitmap()));
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({clearRect:vi.fn(),drawImage:vi.fn()} as any);
});
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();});

it('allows method selection without layers, invalidates export, and sends the selected method for calculation',async()=>{
  await boot();expect(method().disabled).toBe(false);
  button('apply').click();await vi.waitFor(()=>expect(button('apply').disabled).toBe(false));
  expect(button('export').disabled).toBe(false);
  method().value='outside';method().dispatchEvent(new Event('change',{bubbles:true}));
  expect(button('export').disabled).toBe(true);
  expect(document.getElementById('integration-note')!.textContent).toContain('včetně kráterů');
  button('apply').click();await vi.waitFor(()=>expect(button('apply').disabled).toBe(false));
  const calls=vi.mocked(fetch).mock.calls.filter(([url])=>url==='/api/apply');
  expect(JSON.parse(String(calls.at(-1)![1]!.body)).integration_method).toBe('outside');
  expect(button('export').disabled).toBe(false);
});
it('restores the project method',async()=>{
  await boot(false,'outside');expect(method().value).toBe('outside');
});
it('explains an older service instead of pretending front integration works',async()=>{
  await boot(true);expect(method().disabled).toBe(true);expect(method().value).toBe('inside');
  expect(method().title).toContain('pouze zadní integraci');
  const reason=method().closest('.ux-control')!.querySelector('.ux-reason') as HTMLElement;
  expect(reason.hidden).toBe(false);expect(reason.textContent).toContain('Ulož projekt');
});
