export interface ImageSettings {
  method:string; brightness:number; contrast:number; gamma:number; black:number; white:number;
  invert:boolean; background_enabled:boolean; background_color:number[]; tolerance:number; feather:number;
}
export const defaultImageSettings=():ImageSettings=>({method:'luminance',brightness:0,contrast:1,gamma:1,black:0,white:1,invert:false,background_enabled:false,background_color:[0,0,0],tolerance:.08,feather:.05});
export const hexColor=(rgb:number[])=>'#'+rgb.map(c=>Math.round(c).toString(16).padStart(2,'0')).join('');
export function parseHex(hex:string){return [1,3,5].map(offset=>parseInt(hex.slice(offset,offset+2),16));}
