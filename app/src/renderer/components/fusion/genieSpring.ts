/* FloatIsland - https://github.com/yanhaoran01/FloatIsland. Copyright (C) 2026 contributors. GPL-3.0. */
/** @file genieSpring.ts @description Frame-rate independent damped dock motion. @author 鸡哥 */
/**
 * Advances a critically damped transition while preserving velocity on reversal.
 * @param position - Current progress between the page (0) and capsule (1).
 * @param velocity - Current progress per second.
 * @param target - Requested endpoint.
 * @param seconds - Elapsed time since the last frame.
 * @returns Progress and velocity for the next frame.
 */
export function stepGenieSpring(position:number,velocity:number,target:0|1,seconds:number):{position:number;velocity:number}{
 const dt=Math.max(0,Math.min(.064,seconds)),omega=target===0?18:22;
 const offset=position-target,impulse=velocity+omega*offset,decay=Math.exp(-omega*dt);
 const next=target+(offset+impulse*dt)*decay;
 return {position:Math.max(0,Math.min(1,next)),velocity:next<0||next>1?0:(velocity-omega*impulse*dt)*decay};
}
