/* FloatIsland contributors. GPL-3.0. */
export interface GenieFrame {image:string;rect:{x:number;y:number;width:number;height:number};}
export interface GenieSnapshot {revision:number;edge:'top'|'bottom'|'left'|'right';width:number;height:number;compact:{x:number;y:number;width:number;height:number};frames:GenieFrame[];compactImage?:string;}
export interface GenieApi {onFusionGenieCancelled:(callback:(revision:number)=>void)=>()=>void;fusionGenie:(command:'prepare'|'begin'|'capture'|'show'|'handoff'|'finish',value:{direction?:'expand'|'collapse';revision?:number;image?:string})=>Promise<GenieSnapshot|null>;}
