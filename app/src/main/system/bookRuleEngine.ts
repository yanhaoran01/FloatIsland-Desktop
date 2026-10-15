/* Adapted from AnyReader Legado analyzers, aooiuu and contributors, GPL-3.0.
 * Upstream 582056d3abab43e32437103c254a934a5e5bbb38. Replaced Jsoup/isolated-vm
 * with Cheerio and bounded QuickJS; network and Android helpers are not exposed. */
import {load} from 'cheerio';
import {JSONPath} from 'jsonpath-plus';
import {DOMParser} from '@xmldom/xmldom';
import xpath from 'xpath';
import {getQuickJS} from 'quickjs-emscripten';
export function unsupportedBookRule(value:unknown):string|undefined{const text=JSON.stringify(value);if(/java\s*\.|Packages\.|JavaImporter|android\.|javax\.|webView|loginUrl|loginUi|require\s*\(|import\s*\(/i.test(text))return 'unsupported-native-or-login-rule';return undefined;}
const stringify=(value:unknown):string=>typeof value==='string'?value:JSON.stringify(value);
async function javascript(code:string,result:unknown,key:string):Promise<unknown>{const module=await getQuickJS(),runtime=module.newRuntime();runtime.setMemoryLimit(64*1024*1024);runtime.setMaxStackSize(512*1024);const deadline=Date.now()+2000;runtime.setInterruptHandler(()=>Date.now()>deadline);const vm=runtime.newContext();try{const init=vm.evalCode(`globalThis.result=${JSON.stringify(result)};globalThis.key=${JSON.stringify(key)};`);if(init.error){const error=vm.dump(init.error);init.error.dispose();throw Error(JSON.stringify(error));}init.value.dispose();const value=vm.evalCode(code);if(value.error){const error=vm.dump(value.error);value.error.dispose();throw Error(JSON.stringify(error));}const output:unknown=vm.dump(value.value);value.value.dispose();return output;}finally{vm.dispose();runtime.dispose();}}
/** A bounded subset of Legado rules. Unknown syntax errors rather than yielding a false success. */
export async function bookRule(content:unknown,raw:unknown,elements=false,key=''):Promise<unknown[]>{
 if(typeof raw!=='string'||!raw.trim())return [];let rule=raw.trim();const script=rule.match(/(?:<js>([\s\S]*?)<\/js>|@js:([\s\S]*))$/);if(script){const before=rule.slice(0,script.index).trim();const initial=before?(await bookRule(content,before,elements,key)):content;const result=await javascript(script[1]||script[2],initial,key);return Array.isArray(result)?result:[result];}
 if(rule.includes('||')){for(const r of rule.split('||')){const result=await bookRule(content,r,elements,key);if(result.length&&String(result[0]||'').trim())return result;}return [];}
 if(rule.includes('&&'))return (await Promise.all(rule.split('&&').map(r=>bookRule(content,r,elements,key)))).flat();
 const replace=rule.split('##');rule=replace[0];let result:unknown[];
 if(rule.startsWith('@json:')||rule.startsWith('$')){const json=typeof content==='string'?JSON.parse(content):content;const path=rule.replace(/^@json:/,'');result=JSONPath({path,json:json as object,eval:false,wrap:true}) as unknown[];}
 else if(rule.startsWith('@XPath:')||rule.startsWith('//')){const xml=load(stringify(content),{xml:true}).xml(),doc=new DOMParser().parseFromString(xml,'application/xml'),selected=xpath.select(rule.replace(/^@XPath:/,''),doc as unknown as Parameters<typeof xpath.select>[1]);result=Array.isArray(selected)?selected.map(x=>typeof x==='object'&&x!==null&&'nodeType'in x?(elements?String(x):('textContent'in x?x.textContent:String(x))):x):[selected];}
 else if(rule.startsWith(':')){const pattern=new RegExp(rule.slice(1),'g');result=[...stringify(content).matchAll(pattern)].slice(0,10000).map(m=>m[1]??m[0]);}
 else{const html=stringify(content),$=load(html);rule=rule.replace(/^@css:/,'');let selector=rule,attribute='text';if(!elements){const pos=rule.lastIndexOf('@');if(pos>=0){selector=rule.slice(0,pos);attribute=rule.slice(pos+1);}}
  selector=selector.replace(/(?:^|@)class\.([\w-]+)/g,'.$1').replace(/(?:^|@)id\.([\w-]+)/g,'#$1').replace(/(?:^|@)tag\.([\w-]+)/g,'$1').replace(/@/g,' ');
  let nodes=selector?$(selector):$('body').children();if(elements)result=nodes.toArray().map(node=>$.html(node));else if(!selector){result=[attribute==='html'?$('body').html()||'':attribute==='text'?$('body').text():$('body').children().first().attr(attribute)||''];}else result=nodes.toArray().map(node=>{const el=$(node);return attribute==='text'?el.text().trim():attribute==='html'?el.html()||'':el.attr(attribute)||'';});
 }
 if(replace.length>1){const regex=new RegExp(replace[1],'g');result=result.map(value=>stringify(value).replace(regex,replace[2]||''));}return result;
}
export interface RuleWork {mode:'rule';content:unknown;rule:unknown;elements?:boolean;key?:string;}
