/* FusionIsland - GPL-3.0. @file scrollWorker.ts @description Bounded scroll matching and composition. @author 鸡哥 */
import { parentPort,workerData } from 'node:worker_threads';
import { scrollInset } from '../../shared/esearchCore';
interface Frame {width:number;height:number;pixels:Uint8Array;}
const frames:Frame[]=workerData;
try {
 const first=frames[0];if(!first||frames.length>60||first.width*first.height>16_000_000)throw Error('capture-limit');
 const w=first.width,h=first.height,inset=scrollInset(h),shifts:number[]=[0];
 for(let n=1;n<frames.length;n++){
  const a=frames[n-1],b=frames[n];if(a.width!==w||b.width!==w||a.height!==h||b.height!==h)throw Error('capture-size-changed');
  let best=Infinity,second=Infinity,shift=0;
  // Keep the inner-strip leading edge to exclude fixed headers, but allow its
  // template to match farther down the previous frame. Cropping both ends by
  // one third had rejected ordinary 40% scroll steps, particularly at high DPI.
  const bottom=Math.min(inset,24),maxShift=Math.max(0,h-inset-bottom-28);
  const score=(dy:number):number=>{let sum=0,count=0;for(let y=inset;y<h-bottom-dy;y+=7)for(let x=Math.floor(w*.12);x<w*.88;x+=11){const p=((y+dy)*w+x)*4,q=(y*w+x)*4;sum+=Math.abs(a.pixels[p]-b.pixels[q])+Math.abs(a.pixels[p+1]-b.pixels[q+1])+Math.abs(a.pixels[p+2]-b.pixels[q+2]);count+=3;}return count?sum/count:Infinity;};
  for(let d=0;d<=maxShift;d+=4){const value=score(d);if(value<best){second=best;best=value;shift=d;}else second=Math.min(second,value);}
  for(let d=Math.max(0,shift-4);d<=Math.min(maxShift,shift+4);d++){const value=score(d);if(value<best){best=value;shift=d;}}
  if(best>22||!Number.isFinite(best))throw Error('scroll-match-failed');
  if(shift>0&&best>8&&Math.abs(second-best)<.05)throw Error('scroll-match-ambiguous');
  shifts.push(shift);
 }
 const height=h+shifts.reduce((a,b)=>a+b,0);if(w*height>64_000_000)throw Error('capture-limit');
 const output=new Uint8Array(w*height*4);output.set(first.pixels);let offset=0;
 for(let n=1;n<frames.length;n++){const d=shifts[n];if(!d)continue;offset+=d;const start=inset;output.set(frames[n].pixels.subarray(start*w*4),(offset+start)*w*4);}
 parentPort?.postMessage({width:w,height,pixels:output});
}catch(error){parentPort?.postMessage({error:error instanceof Error?error.message:String(error)});}
