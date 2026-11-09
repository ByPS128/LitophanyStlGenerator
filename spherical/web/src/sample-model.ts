import * as THREE from 'three';
import {basis, surfacePoint, type Placement} from './model';

export interface SampleSelection {anchor:number[];angle_deg:number;left:number;right:number;bottom:number;top:number;}
export function sampleFrame(s:SampleSelection){
  const front=new THREE.Vector3().fromArray(s.anchor).normalize(),{east,north}=basis(front);
  const a=s.angle_deg*Math.PI/180,c=Math.cos(a),sn=Math.sin(a);
  return {front,right:east.clone().multiplyScalar(c).addScaledVector(north,sn),up:north.clone().multiplyScalar(c).addScaledVector(east,-sn)};
}
export function validateSample(s:SampleSelection,radius:number):SampleSelection{
  if(!s||!Array.isArray(s.anchor)||s.anchor.length!==3||!s.anchor.every(Number.isFinite)||
    ![s.angle_deg,s.left,s.right,s.bottom,s.top].every(Number.isFinite)||
    !Number.isFinite(Math.hypot(...s.anchor))||Math.hypot(...s.anchor)<1e-8||s.right-s.left<1||s.top-s.bottom<1)
    throw new Error('Výřez musí mít platnou kotvu a rozměry alespoň 1 × 1 mm.');
  if(Math.max(s.left*s.left,s.right*s.right)+Math.max(s.bottom*s.bottom,s.top*s.top)>=(.98*radius)**2)
    throw new Error('Výřez přesahuje viditelnou polokouli. Zmenši jej nebo otoč pohled a vyber oblast znovu.');
  return {...s,anchor:s.anchor.map(v=>v/Math.hypot(...s.anchor))};
}
export function samplePoint(x:number,y:number,s:SampleSelection,radius:number){
  const f=sampleFrame(s);
  return f.right.multiplyScalar(x).addScaledVector(f.up,y).addScaledVector(f.front,Math.sqrt(Math.max(0,radius*radius-x*x-y*y)));
}
export function sampleAroundLayer(p:Placement,radius:number,margin:number):SampleSelection{
  if(!Number.isFinite(margin)||margin<0)throw new Error('Okraj musí být nezáporný počet milimetrů.');
  const s:SampleSelection={anchor:[...p.anchor],angle_deg:p.angle_deg,left:Infinity,right:-Infinity,bottom:Infinity,top:-Infinity};
  const f=sampleFrame(s);
  // The motif uses arc lengths; project its whole boundary into the cut frame.
  for(let side=0;side<4;side++)for(let i=0;i<=64;i++){
    const t=i/64,x=side===0?-.5+t:side===1?.5:side===2?.5-t:-.5;
    const y=side===0?-.5:side===1?-.5+t:side===2?.5:.5-t;
    const point=surfacePoint(x*p.width_mm,y*p.height_mm,p,radius);
    if(point.dot(f.front)<=0)throw new Error('Motiv přesahuje přední polokouli. Vyber menší oblast ručně.');
    s.left=Math.min(s.left,point.dot(f.right));s.right=Math.max(s.right,point.dot(f.right));
    s.bottom=Math.min(s.bottom,point.dot(f.up));s.top=Math.max(s.top,point.dot(f.up));
  }
  s.left-=margin;s.right+=margin;s.bottom-=margin;s.top+=margin;
  return validateSample(s,radius);
}
