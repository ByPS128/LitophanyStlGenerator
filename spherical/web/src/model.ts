import * as THREE from 'three';

export interface Placement {
  anchor: number[]; width_mm: number; height_mm: number; angle_deg: number;
  strength: number; min_mm: number; max_mm: number;
}
export function resizeDimensions(width:number,height:number,axis:'width'|'height',next:number,preserve:boolean,max=Infinity) {
  const ratio=width/height;
  let w=axis==='width'?next:width,h=axis==='height'?next:height;
  if(preserve&&Number.isFinite(ratio)&&ratio>0){if(axis==='width')h=w/ratio;else w=h*ratio;}
  if(preserve){const scale=Math.min(1,max/Math.max(w,h));w*=scale;h*=scale;}
  else{w=Math.min(w,max);h=Math.min(h,max);}
  return [w,h] as const;
}
export function validatePlacement(p:Placement,radius:number):Placement {
  if(!p || !Array.isArray(p.anchor)||p.anchor.length!==3||!p.anchor.every(Number.isFinite) ||
    ![p.width_mm,p.height_mm,p.angle_deg,p.strength,p.min_mm,p.max_mm].every(Number.isFinite) ||
    new THREE.Vector3().fromArray(p.anchor).length()<1e-8 || p.width_mm<=0 || p.height_mm<=0 ||
    p.width_mm>Math.PI*radius || p.height_mm>Math.PI*radius || p.min_mm<=0 || p.max_mm<=p.min_mm ||
    p.max_mm>=radius/4 || p.strength<0 || p.strength>1) throw new Error('Neplatné umístění: zkontroluj kotvu, rozměry, dominanci a meze tloušťky.');
  return {...p,anchor:new THREE.Vector3().fromArray(p.anchor).normalize().toArray()};
}
export function basis(anchor: THREE.Vector3) {
  const east = new THREE.Vector3(0, 0, 1).cross(anchor);
  if (east.length() < 1e-8) east.set(0, 1, 0); else east.normalize();
  return {east, north: anchor.clone().cross(east)};
}
export function surfacePoint(x: number, y: number, placement: Placement, radius: number) {
  const anchor = new THREE.Vector3().fromArray(placement.anchor).normalize();
  const {east, north} = basis(anchor);
  const angle = placement.angle_deg * Math.PI / 180;
  const xx = Math.cos(angle)*x - Math.sin(angle)*y;
  const yy = Math.sin(angle)*x + Math.cos(angle)*y;
  const distance = Math.hypot(xx, yy), theta = distance / radius;
  if (distance < 1e-8) return anchor.multiplyScalar(radius);
  return anchor.multiplyScalar(Math.cos(theta)).addScaledVector(east, Math.sin(theta)*xx/distance)
    .addScaledVector(north, Math.sin(theta)*yy/distance).multiplyScalar(radius);
}
export function decodeMesh(buffer: ArrayBuffer) {
  const view = new DataView(buffer);
  if (buffer.byteLength < 8) throw new Error('Neúplná geometrie.');
  const vertices = view.getUint32(0,true), triangles = view.getUint32(4,true);
  if (buffer.byteLength !== 8 + vertices*20 + triangles*12) throw new Error('Neplatná délka geometrie.');
  let offset = 8;
  const positions = new Float32Array(buffer,offset,vertices*3); offset += vertices*12;
  const indices = new Uint32Array(buffer,offset,triangles*3); offset += triangles*12;
  const wall = new Float32Array(buffer,offset,vertices); offset += vertices*4;
  const shell = new Float32Array(buffer,offset,vertices);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  geometry.setIndex(new THREE.BufferAttribute(indices,1));
  geometry.setAttribute('wall',new THREE.BufferAttribute(wall,1));
  geometry.setAttribute('shell',new THREE.BufferAttribute(shell,1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export function kelvinColor(k: number): THREE.Vector3 {
  const t = Math.max(2200,Math.min(7500,k));
  const x = t<=4000 ? -.2661239e9/t**3-.2343580e6/t**2+.8776956e3/t+.179910
    : -3.0258469e9/t**3+2.1070379e6/t**2+.2226347e3/t+.240390;
  const y = t<=2222 ? -.9549476*x**3-1.37418593*x*x+2.09137015*x-.16748867
    : t<=4000 ? -1.1063814*x**3-1.34811020*x*x+2.18555832*x-.20219683
    : 3.0817580*x**3-5.87338670*x*x+3.75112997*x-.37001483;
  const X=x/y,Z=(1-x-y)/y;
  return new THREE.Vector3(Math.max(0,3.2406*X-1.5372-.4986*Z),
    Math.max(0,-.9689*X+1.8758+.0415*Z),Math.max(0,.0557*X-.204+1.057*Z));
}
