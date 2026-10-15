/* FusionIsland - Copyright (C) 2026 contributors. GPL-3.0. */
/** @file dataOperations.ts @description Offline CSV and bounded regular expression operations. @author 鸡哥 */
import Papa from 'papaparse';
export type DataJob={kind:'json';mode:'format'|'minify'|'query'|'stringify';text:string;path:string}|{kind:'csv';mode:'csv-json'|'json-csv';text:string;delimiter:string}|{kind:'regex';pattern:string;flags:string;text:string;replacement:string};
export interface DataResult { text:string; rows:string[][]; }
/** Runs inside a disposable worker; input is never executed as JavaScript. */
export function executeDataJob(job:DataJob):DataResult {
 if(job.text.length>5_000_000)throw Error('text-too-large');
 if(job.kind==='json'){
  if(job.mode==='stringify')return {text:JSON.stringify(job.text),rows:[]};
  const data=JSON.parse(job.text);
  if(job.mode==='query'){
   if(job.path.length>1000||!/^\$(?:\.[\w$-]+|\[(?:\d+|\*|"[^"\\]*"|'[^'\\]*')\])*$/.test(job.path))throw Error('invalid-json-path');
   let values:unknown[]=[data];const tokens=job.path.slice(1).match(/\.[\w$-]+|\[(?:\d+|\*|"[^"\\]*"|'[^'\\]*')\]/g)||[];
   for(const token of tokens){const key=token.startsWith('.')?token.slice(1):token.slice(1,-1).replace(/^["']|["']$/g,'');if(['__proto__','constructor','prototype'].includes(key))throw Error('invalid-json-path');values=values.flatMap(value=>{if(value===null||typeof value!=='object')return [];if(key==='*')return Object.values(value);return Object.hasOwn(value,key)?[(value as Record<string,unknown>)[key]]:[];});if(values.length>10000)throw Error('text-too-large');}
   return {text:JSON.stringify(values,null,2),rows:[]};
  }
  return {text:JSON.stringify(data,null,job.mode==='format'?2:undefined),rows:[]};
 }
 if(job.kind==='regex'){
  if(job.pattern.length>4096||job.text.length>200_000||!/^[dgimsuvy]*$/.test(job.flags))throw Error('invalid-expression');
  const regex=new RegExp(job.pattern,job.flags);const rows:string[][]=[];let match:RegExpExecArray|null;
  while((match=regex.exec(job.text))!==null){
   rows.push([String(match.index),...Array.from(match,part=>part??'')]);if(rows.length>10000)throw Error('text-too-large');
   if(!regex.global&&!regex.sticky)break;
   if(match[0]===''){regex.lastIndex+=regex.unicode||regex.unicodeSets?((job.text.codePointAt(regex.lastIndex)??0)>0xffff?2:1):1;}
  }
  return {text:job.text.replace(new RegExp(job.pattern,job.flags),job.replacement),rows};
 }
 if(job.mode==='csv-json'){
  const parsed=Papa.parse<string[]>(job.text,{delimiter:job.delimiter,skipEmptyLines:'greedy'});
  if(parsed.errors.some(error=>error.code!=='UndetectableDelimiter'))throw Error('invalid-csv');
  const [headers,...rows]=parsed.data;if(!headers?.length||new Set(headers).size!==headers.length||headers.some(name=>!name.trim())||rows.some(row=>row.length!==headers.length)||rows.length>10000)throw Error('invalid-csv');
  const records=rows.map(row=>Object.fromEntries(headers.map((header,index)=>[header,row[index]])));
  return {text:JSON.stringify(records,null,2),rows:[headers,...rows]};
 }
 const records:unknown=JSON.parse(job.text);
 if(!Array.isArray(records)||records.length>10000||records.some(row=>!row||typeof row!=='object'||Array.isArray(row)))throw Error('invalid-json-table');
 const headers=[...new Set(records.flatMap(row=>Object.keys(row)))];
 const rows=records.map(row=>headers.map(header=>{const value=row[header];return value===undefined||value===null?'':typeof value==='object'?JSON.stringify(value):String(value);}));
 return {text:Papa.unparse({fields:headers,data:rows},{delimiter:job.delimiter||','}),rows:[headers,...rows]};
}
