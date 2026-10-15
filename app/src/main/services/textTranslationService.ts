/* FloatIsland contributors. GPL-3.0. */
/** @file textTranslationService.ts @description Anonymous text translation with bounded inputs and actual service errors. */
import {randomUUID} from 'node:crypto';
import {publicMusicRequest,musicResponseText} from '../music/fusionMusicPluginHost';
const languages=new Set(['auto','zh','zh-CN','zh-TW','en','ja','ko','fr','de','es','ru']);
export interface TextTranslation {targetText:string;source:string;target:string;requestId:string;}
/** MyMemory accepts at most 500 UTF-8 bytes per segment; never split a Unicode code point. */
export function translationSegments(text:string):string[]{const result:string[]=[];let part='',size=0;for(const char of text){const bytes=Buffer.byteLength(char);if(size+bytes>480){result.push(part);part='';size=0;}part+=char;size+=bytes;}if(part)result.push(part);return result;}
export async function translateText(text:string,source:string,target:string,signal:AbortSignal):Promise<TextTranslation>{
 if(typeof text!=='string'||!text.trim()||text.length>5000)throw Error('translation-invalid-text');
 if(!languages.has(source)||!languages.has(target)||target==='auto')throw Error('translation-invalid-language');
 signal.throwIfAborted();if(source===target)return {targetText:text,source,target,requestId:randomUUID()};
 const translated:string[]=[];
 for(const segment of translationSegments(text)){
  signal.throwIfAborted();const url=new URL('https://api.mymemory.translated.net/get');url.searchParams.set('q',segment);url.searchParams.set('langpair',(source==='auto'?'Autodetect':source==='zh'?'zh-CN':source)+'|'+(target==='zh'?'zh-CN':target));
  const response=await publicMusicRequest(url.href,{signal,headers:{'User-Agent':'FloatIsland/1.3.0'}});if(!response.ok){await response.body?.cancel();throw Error('translation-http-'+response.status);}
  const value:unknown=JSON.parse(await musicResponseText(response,1_000_000));
  if(!value||typeof value!=='object'||!('responseStatus'in value)||Number(value.responseStatus)!==200||'quotaFinished'in value&&value.quotaFinished===true)throw Error('translation-quota-or-service');
  const data='responseData'in value?value.responseData:null;if(!data||typeof data!=='object'||!('translatedText'in data)||typeof data.translatedText!=='string'||!data.translatedText.trim())throw Error('translation-invalid-response');translated.push(data.translatedText);
 }
 signal.throwIfAborted();return {targetText:translated.join(''),source,target,requestId:randomUUID()};
}
