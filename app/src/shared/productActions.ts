/* FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 contributors. GPL-3.0. */
/** @file productActions.ts @description Typed offline capability routing and flow validation. @author 鸡哥 */
import type { ArtifactKind,ProductAction,ProductFlow } from '../preload/types/fusionProduct';
export const PRODUCT_ACTIONS:Record<ProductAction,{input:ArtifactKind[];output:ArtifactKind|'same'}>={
 ocr:{input:['image'],output:'text'},'text-clean':{input:['text','table'],output:'text'},
 'image-convert':{input:['image'],output:'image'},pdf:{input:['pdf','image'],output:'pdf'},
 csv:{input:['text','table'],output:'text'},url:{input:['text'],output:'text'},
 hash:{input:['image','pdf','text','table','archive','media','file'],output:'text'},
 rename:{input:['image','pdf','text','table','archive','media','file'],output:'same'},
 zip:{input:['image','pdf','text','table','archive','media','file'],output:'archive'},
 copy:{input:['image','pdf','text','table','archive','media','file'],output:'same'},
 export:{input:['image','pdf','text','table','archive','media','file'],output:'same'},
};
/** Checks adjacent step types without running them. @param flow - Saved step list. @returns Throws for invalid or incompatible steps. */
export function validateProductFlow(flow:ProductFlow):void {
 if(!flow||typeof flow.id!=='string'||typeof flow.name!=='string'||flow.name.length>120||!Array.isArray(flow.steps)||!flow.steps.length||flow.steps.length>32)throw Error('invalid-flow');
 let output:ArtifactKind|undefined;const ids=new Set<string>();
 for(const step of flow.steps){
  if(!step||typeof step.id!=='string'||ids.has(step.id)||!Object.hasOwn(PRODUCT_ACTIONS,step.action)||!step.options||typeof step.options!=='object'||Object.values(step.options).some(v=>!['string','number','boolean'].includes(typeof v)))throw Error('invalid-flow');
  ids.add(step.id);const action=PRODUCT_ACTIONS[step.action];if(output&&!action.input.includes(output))throw Error('flow-type-mismatch');if(action.output!=='same')output=action.output;
 }
}
export const PRODUCT_PRESETS:ProductFlow[]=[
 {id:'preset-capture',name:'@capture',steps:[{id:'ocr',action:'ocr',options:{}},{id:'clean',action:'text-clean',options:{empty:true}},{id:'copy',action:'copy',options:{}}]},
 {id:'preset-image',name:'@image',steps:[{id:'image',action:'image-convert',options:{format:'jpg',width:1600,quality:85}},{id:'export',action:'export',options:{}}]},
 {id:'preset-rename',name:'@rename',steps:[{id:'rename',action:'rename',options:{numbered:true,start:1,digits:3}},{id:'zip',action:'zip',options:{}},{id:'export',action:'export',options:{}}]},
];
/** Supplies editable primitive controls without script or shell configuration. */
export const PRODUCT_OPTION_DEFAULTS:Record<ProductAction,import('../preload/types/fusionProduct').ProductOptions>={
 ocr:{},'text-clean':{empty:true,dedupe:false,find:'',replace:''},
 'image-convert':{format:'jpg',width:1600,quality:85},pdf:{mode:'merge',pages:'',rotation:90},
 csv:{mode:'csv-json',delimiter:',',encoding:'utf-8'},url:{mode:'encode'},hash:{algorithm:'sha256'},
 rename:{prefix:'',suffix:'',find:'',replace:'',numbered:true,start:1,digits:3},
 zip:{},copy:{},export:{},
};
