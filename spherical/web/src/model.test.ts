import {describe,it,expect} from 'vitest';
import {Vector3} from 'three';
import {basis,decodeMesh,surfacePoint,kelvinColor,resizeDimensions,type Placement} from './model';

const p:Placement={anchor:[1,0,0],width_mm:100,height_mm:70,angle_deg:0,strength:.7,min_mm:.7,max_mm:3};
describe('spherical placement',()=>{
  it('anchors at the selected surface point',()=>expect(surfacePoint(0,0,p,100).toArray()).toEqual([100,0,0]));
  it('uses arc length in millimetres',()=>{const q=surfacePoint(50,0,p,100);expect(q.length()).toBeCloseTo(100);expect(q.angleTo(new Vector3(1,0,0))*100).toBeCloseTo(50);});
  it('rotates the motif basis by 90 degrees',()=>{const q=surfacePoint(10,0,{...p,angle_deg:90},100);expect(q.y).toBeCloseTo(0);expect(q.z).toBeGreaterThan(0);});
  it('handles polar anchors',()=>{const {east,north}=basis(new Vector3(0,0,1));expect(east.length()).toBe(1);expect(north.dot(east)).toBe(0);});
  it('rejects truncated geometry',()=>expect(()=>decodeMesh(new ArrayBuffer(4))).toThrow());
  it('warms the LED without changing the material',()=>{const warm=kelvinColor(2700),cold=kelvinColor(6500);expect(warm.x/warm.z).toBeGreaterThan(cold.x/cold.z);});
  it('locks the current aspect ratio when resizing width',()=>expect(resizeDimensions(150,100,'width',90,true)).toEqual([90,60]));
  it('locks the current aspect ratio when resizing height',()=>expect(resizeDimensions(150,100,'height',120,true)).toEqual([180,120]));
  it('allows independent resizing without Shift',()=>expect(resizeDimensions(150,100,'height',120,false)).toEqual([150,120]));
  it('preserves aspect when the sphere size limit is reached',()=>expect(resizeDimensions(150,100,'height',300,true,300)).toEqual([300,200]));
});
