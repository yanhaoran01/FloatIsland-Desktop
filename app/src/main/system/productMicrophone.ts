/* FusionIsland - GPL-3.0. @file productMicrophone.ts @description Shared microphone lease. @author 鸡哥 */
let lease:string|null=null;
/** Claims the microphone for voice or demonstration capture. */
export function claimProductMicrophone(id:string):void {if(lease!==null)throw Error('microphone-in-use');lease=id;}
/** Releases only the current owner's microphone lease. */
export function releaseProductMicrophone(id:string):void {if(lease===id)lease=null;}
