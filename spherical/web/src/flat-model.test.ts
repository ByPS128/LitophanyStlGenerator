import {describe,it,expect} from 'vitest';
import {fitPlacement,decodeFlatGrid,plateGeometry,flatMaterial,type Plate} from './flat-model';
import {kelvinColor} from './model';

const plate={width:150,height:100,border_enabled:true,border_mm:5} as Plate;
describe('flat placement',()=>{
  it.each([-180,-45,0,33,90,180])('keeps rotated corners inside frame (%s degrees)',angle=>{
    const p=fitPlacement({x_mm:500,y_mm:-300,width_mm:200,height_mm:100,angle_deg:angle,strength:1},plate);
    const c=Math.cos(angle*Math.PI/180),s=Math.sin(angle*Math.PI/180);
    for(const x of [-p.width_mm/2,p.width_mm/2])for(const y of [-p.height_mm/2,p.height_mm/2]){
      expect(Math.abs(p.x_mm+c*x-s*y)).toBeLessThanOrEqual(70+1e-8);
      expect(Math.abs(p.y_mm+s*x+c*y)).toBeLessThanOrEqual(45+1e-8);
    }
  });
  it('preserves aspect when fitting an oversized layer',()=>{
    const p=fitPlacement({x_mm:0,y_mm:0,width_mm:400,height_mm:200,angle_deg:45,strength:1},plate);
    expect(p.width_mm/p.height_mm).toBeCloseTo(2);
  });
  it('rejects an impossible frame or invalid dimensions',()=>{
    const p={x_mm:0,y_mm:0,width_mm:40,height_mm:20,angle_deg:0,strength:1};
    expect(()=>fitPlacement(p,{...plate,border_mm:60})).toThrow();
    expect(()=>fitPlacement({...p,width_mm:NaN},plate)).toThrow();
  });
});
describe('flat lighting',()=>{
  it.each([2200,3000,7500])('passes finite RGB components to the shader at %s K',kelvin=>{
    const material=flatMaterial(),expected=kelvinColor(kelvin);
    // Same update as the UI: Color.copy(Vector3) silently produces undefined RGB values.
    material.uniforms.color.value.copy(expected);
    const uploaded=material.uniforms.color.value.toArray();
    expect(uploaded.every((component:number)=>Number.isFinite(component))).toBe(true);
    expect(uploaded).toEqual(expected.toArray());
    expect(uploaded.some((component:number)=>component>0)).toBe(true);
    material.dispose();
  });
});
describe('flat geometry',()=>{
  it('uses the exact requested outer dimensions and closed perimeter',()=>{
    const geometry=plateGeometry({x:[0,5,145,150],y:[0,5,95,100],heights:Array(16).fill(2)});
    geometry.computeBoundingBox();const bounds=geometry.boundingBox!;
    expect(bounds.min.toArray()).toEqual([-75,-50,0]);expect(bounds.max.toArray()).toEqual([75,50,2]);
    const position=geometry.getAttribute('position'),index=geometry.index!;
    const edges=new Map<string,number>();
    for(let i=0;i<index.count;i+=3){const vertices=[0,1,2].map(j=>{const k=index.getX(i+j);return [position.getX(k),position.getY(k),position.getZ(k)].join(',');});
      for(let j=0;j<3;j++){const key=[vertices[j],vertices[(j+1)%3]].sort().join('|');edges.set(key,(edges.get(key)??0)+1);}
    }
    expect([...edges.values()].every(count=>count===2)).toBe(true);
  });
  it('rejects truncated .NET buffers',()=>{expect(()=>decodeFlatGrid(new ArrayBuffer(4))).toThrow();});
});
