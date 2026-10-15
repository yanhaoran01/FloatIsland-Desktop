/* FloatIsland contributors. GPL-3.0. */
/** @file libraryUtils.ts @description Pure template expansion and collection helpers. */
export function templateVariables(text:string):string[]{return [...new Set([...text.matchAll(/\{\{([\w\u4e00-\u9fff -]+)\}\}/g)].map(match=>match[1].trim()).filter(key=>!['date','time'].includes(key)))];}
export function expandTemplate(text:string,values:Record<string,string>,now=new Date()):string {
 const date=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
 const time=now.toTimeString().slice(0,8);
 return text.replace(/\{\{([\w\u4e00-\u9fff -]+)\}\}/g,(_all,key:string)=>key.trim()==='date'?date:key.trim()==='time'?time:values[key.trim()]??'{{'+key+'}}');
}
