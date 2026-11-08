import * as THREE from 'three';
import type {ImageSettings} from './image-settings';

export interface Plate {width:number;height:number;min_mm:number;max_mm:number;border_enabled:boolean;border_mm:number;
  print_mode:string;nozzle_mm:number;pixel_ratio:number;resin_resolution:number;smoothing:string;resample:string;
  sigma:number;threshold:number;window:number;spatial:number;range:number;}
export interface FlatPlacement {x_mm:number;y_mm:number;width_mm:number;height_mm:number;angle_deg:number;strength:number;}
export interface FlatLayer {id:string;name:string;image_id:string;enabled:boolean;placement:FlatPlacement;image_settings:ImageSettings;}
export interface Grid {x:number[];y:number[];heights:number[];}
export function fitPlacement(p:FlatPlacement,plate:Plate):FlatPlacement{
  if(!Object.values(p).every(Number.isFinite)||p.width_mm<=0||p.height_mm<=0)throw new Error('Neplatné rozměry nebo umístění vrstvy.');
  const border=plate.border_enabled?plate.border_mm:0,availableX=plate.width-2*border,availableY=plate.height-2*border;
  if(availableX<=1||availableY<=1)throw new Error('Okraj musí ponechat alespoň 1 mm obrazové plochy.');
  const angle=p.angle_deg*Math.PI/180,c=Math.abs(Math.cos(angle)),s=Math.abs(Math.sin(angle));
  const scale=Math.min(1,availableX/(c*p.width_mm+s*p.height_mm),availableY/(s*p.width_mm+c*p.height_mm));
  const w=p.width_mm*scale,h=p.height_mm*scale,hx=(c*w+s*h)/2,hy=(s*w+c*h)/2;
  const clamp=(n:number,low:number,high:number)=>Math.max(low,Math.min(high,n));
  return {...p,width_mm:w,height_mm:h,x_mm:clamp(p.x_mm,-availableX/2+hx,availableX/2-hx),y_mm:clamp(p.y_mm,-availableY/2+hy,availableY/2-hy)};
}

export function decodeFlatGrid(buffer:ArrayBuffer):Grid{
  if(buffer.byteLength<8)throw new Error('Neúplný výstup .NET.');
  const view=new DataView(buffer),w=view.getUint32(0,true),h=view.getUint32(4,true);
  if(w<2||h<2||w*h>600000||buffer.byteLength!==8+4*(w+h+w*h))throw new Error('Poškozená síť z .NET.');
  const values=new Float32Array(buffer,8);
  if(!values.every(Number.isFinite))throw new Error('Neplatné výšky z .NET.');
  return {x:Array.from(values.slice(0,w)),y:Array.from(values.slice(w,w+h)),heights:Array.from(values.slice(w+h))};
}

// Same diagonal, segmented perimeter and bottom fan as FlatLithophaneBridge.
export function plateGeometry(grid:Grid):THREE.BufferGeometry{
  const {x,y,heights}=grid,w=x.length,h=y.length,count=w*h;
  if(heights.length!==count)throw new Error('Neúplná výšková mapa.');
  const positions:number[]=[],thickness:number[]=[],indices:number[]=[];
  const add=(px:number,py:number,pz:number,t:number)=>{positions.push(px-x.at(-1)!/2,y.at(-1)!/2-py,pz);thickness.push(t);return thickness.length-1;};
  for(let row=0;row<h;row++)for(let col=0;col<w;col++)add(x[col],y[row],heights[row*w+col],heights[row*w+col]);
  for(let row=0;row<h-1;row++)for(let col=0;col<w-1;col++){
    const a=row*w+col,b=a+1,c=a+w+1,d=a+w;indices.push(a,c,b,a,d,c);
  }
  const perimeter:number[]=[];
  for(let col=0;col<w;col++)perimeter.push(col);
  for(let row=1;row<h;row++)perimeter.push(row*w+w-1);
  for(let col=w-2;col>=0;col--)perimeter.push((h-1)*w+col);
  for(let row=h-2;row>0;row--)perimeter.push(row*w);
  const low=perimeter.map(i=>add(x[i%w],y[Math.floor(i/w)],0,heights[i]));
  const center=add(x.at(-1)!/2,y.at(-1)!/2,0,heights[Math.floor(h/2)*w+Math.floor(w/2)]);
  for(let i=0;i<perimeter.length;i++){
    const j=(i+1)%perimeter.length,a=perimeter[i],b=perimeter[j];
    indices.push(a,b,low[j],a,low[j],low[i],center,low[i],low[j]);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('thickness',new THREE.Float32BufferAttribute(thickness,1));
  geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

export function flatMaterial():THREE.ShaderMaterial{
  return new THREE.ShaderMaterial({side:THREE.DoubleSide,uniforms:{mode:{value:1},brightness:{value:1},attenuation:{value:.78},color:{value:new THREE.Color(1,.7,.4)},minimum:{value:.6},maximum:{value:3.6}},
    vertexShader:`attribute float thickness;varying float wall;varying vec3 normalView;void main(){wall=thickness;normalView=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform int mode;uniform float brightness;uniform float attenuation;uniform vec3 color;uniform float minimum;uniform float maximum;varying float wall;varying vec3 normalView;
    void main(){vec3 result;float shade=.35+.65*abs(dot(normalize(normalView),normalize(vec3(.3,.6,1.))));
    if(mode==1){result=vec3(.035)+color*brightness*exp(-attenuation*wall)*1.8;}
    else if(mode==2){float t=clamp((wall-minimum)/(maximum-minimum),0.,1.);result=mix(vec3(.2,.85,.9),vec3(.85,.3,.2),t);}
    else result=vec3(.83,.86,.85)*shade;gl_FragColor=vec4(result,1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`});
}
