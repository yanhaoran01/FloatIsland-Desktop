/* Adapted from eSearch 15.6.0, commit 6f3f56241cccc8ada2c503df642566322dc67a3e.
 * Copyright xushengfeng and contributors. GPL-3.0. See vendor/esearch.
 * @file esearchCore.ts @description Portable pin and scroll geometry. @author 鸡哥 */
/** Clips static edges using eSearch's longMatch inner-strip definition. */
export function scrollInset(value:number):number {
 const x=value-Math.max(value/3,50);return Math.floor(Math.max(x,0)/2);
}
/** Applies eSearch's minimum pin zoom while retaining aspect ratio. */
export function pinZoom(value:number):number { return Math.max(.05,Math.min(8,value)); }
/** Converts pin percentage opacity to a bounded scalar. */
export function pinOpacity(value:number):number { return Math.max(.1,Math.min(1,value/100)); }
