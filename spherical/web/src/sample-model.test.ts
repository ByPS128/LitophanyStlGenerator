import {expect,it} from 'vitest';
import {sampleAroundLayer,sampleFrame,samplePoint,validateSample} from './sample-model';
import {surfacePoint,type Placement} from './model';

const placement:Placement={anchor:[1,-1,.2],angle_deg:37,width_mm:90,height_mm:60,strength:.65,min_mm:.7,max_mm:3};
it('contains a rotated motif boundary and adds physical margins',()=>{
  const s=sampleAroundLayer(placement,100,5),f=sampleFrame(s);
  for(let x=-.5;x<=.5;x+=.1)for(let y=-.5;y<=.5;y+=.1){
    const p=surfacePoint(x*90,y*60,placement,100);
    expect(p.dot(f.right)).toBeGreaterThanOrEqual(s.left+4.99);
    expect(p.dot(f.right)).toBeLessThanOrEqual(s.right-4.99);
    expect(p.dot(f.up)).toBeGreaterThanOrEqual(s.bottom+4.99);
    expect(p.dot(f.up)).toBeLessThanOrEqual(s.top-4.99);
  }
});
it('draws the exact plane intersections on the sphere at arbitrary poles',()=>{
  for(const anchor of [[0,0,1],[0,0,-1],[1,-2,.2]]){
    const s=validateSample({anchor,angle_deg:63,left:-30,right:40,bottom:-20,top:25},100),f=sampleFrame(s);
    const point=samplePoint(s.left,s.top,s,100);
    expect(point.length()).toBeCloseTo(100,8);
    expect(point.dot(f.right)).toBeCloseTo(-30,8);
    expect(point.dot(f.up)).toBeCloseTo(25,8);
    expect(f.right.clone().cross(f.front.clone().negate()).dot(f.up)).toBeCloseTo(1,8);
  }
});
it('rejects invalid margins, dimensions and selections beyond the silhouette',()=>{
  expect(()=>sampleAroundLayer(placement,100,-1)).toThrow();
  expect(()=>sampleAroundLayer(placement,100,100)).toThrow();
  const s=sampleAroundLayer(placement,100,0);
  for(const patch of [{left:s.right},{top:NaN},{anchor:[0,0,0]},{left:-95,top:95}])expect(()=>validateSample({...s,...patch},100)).toThrow();
});
