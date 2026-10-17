/* FloatIsland contributors. GPL-3.0. Public catalog adapters; no account or paid acquisition. */
import {createHash} from 'node:crypto';
import {load} from 'cheerio';
import type {BookSource,SourceBook,BookChapter} from '../../preload/types/managedLibrary';
export const BUILTIN_BOOK_SOURCES:readonly BookSource[]=[
 {id:'builtin-wikisource-zh',name:'中文维基文库',kind:'wikisource',url:'https://zh.wikisource.org/w/api.php',enabled:true,order:0,updated:0,builtin:true,capabilities:['search','chapters','content'],health:{status:'unverified'}},
 {id:'builtin-gutenberg',name:'Project Gutenberg',kind:'opds',url:'https://www.gutenberg.org/ebooks/search.opds/',enabled:true,order:1,updated:0,builtin:true,capabilities:['search','browse','download'],health:{status:'unverified'}},
];
/** Seed each preset once. Disabled/deleted presets and imported identities survive upgrades. */
export function seedBookSources(sources:BookSource[],seeded:string[]=[]):{sources:BookSource[];seeded:string[]}{
 const result=structuredClone(sources).filter(source=>source.id!=='builtin-zlibrary'||Boolean(source.url)),seen=new Set(seeded);
 for(const preset of BUILTIN_BOOK_SOURCES){if(!seen.has(preset.id)&&!result.some(s=>s.id===preset.id||Boolean(preset.url)&&s.url===preset.url))result.push({...structuredClone(preset),order:result.length});seen.add(preset.id);}
 return {sources:result,seeded:[...seen]};
}
type FetchText=(url:string,signal:AbortSignal)=>Promise<{text:string;url:string}>;
const apiUrl=(source:BookSource,params:Record<string,string>)=>{const url=new URL(source.url);if(url.origin!=='https://zh.wikisource.org'||url.pathname!=='/w/api.php')throw Error('invalid-book-source');for(const [key,value] of Object.entries({...params,format:'json',formatversion:'2'}))url.searchParams.set(key,value);return url.href;};
const bookId=(sourceId:string,url:string)=>createHash('sha256').update(sourceId+'\n'+url).digest('hex');
const pageUrl=(title:string)=>'https://zh.wikisource.org/wiki/'+encodeURIComponent(title.replace(/ /g,'_'));
export function wikiPageTitle(url:string):string{const parsed=new URL(url);if(parsed.origin!=='https://zh.wikisource.org'||!parsed.pathname.startsWith('/wiki/'))throw Error('invalid-book-url');return decodeURIComponent(parsed.pathname.slice(6)).replace(/_/g,' ');}
export async function searchWikisource(source:BookSource,query:string,signal:AbortSignal,fetch:FetchText):Promise<SourceBook[]>{
 const response=await fetch(apiUrl(source,{action:'query',list:'search',srnamespace:'0',srsearch:query,srlimit:'30',utf8:'1'}),signal);
 const data=JSON.parse(response.text);if(data.error)throw Error(String(data.error.info||'book-search-failed'));if(!Array.isArray(data.query?.search))throw Error('invalid-book-response');
 return data.query.search.map((row:{title:string})=>{const url=pageUrl(row.title);return {id:bookId(source.id,url),sourceId:source.id,title:row.title,author:'',url};});
}
export async function wikiPage(source:BookSource,url:string,signal:AbortSignal,fetch:FetchText):Promise<{html:string;title:string}>{
 const response=await fetch(apiUrl(source,{action:'parse',page:wikiPageTitle(url),prop:'text|displaytitle',disableeditsection:'1'}),signal),data=JSON.parse(response.text);
 if(data.error||typeof data.parse?.text!=='string')throw Error(String(data.error?.info||'book-content-empty'));return {html:data.parse.text,title:data.parse.title};
}
/** Restrict chapters to the work's own subpages; never follow unrelated navigation. */
export function wikiChapters(html:string,book:SourceBook):BookChapter[]{
 const $=load(html),title=wikiPageTitle(book.url),seen=new Set<string>(),chapters:BookChapter[]=[];
 $('.mw-parser-output a[href]').each((_i,node)=>{const href=$(node).attr('href');if(!href)return;try{const url=new URL(href,book.url);if(url.hash||url.origin!=='https://zh.wikisource.org')return;const candidate=wikiPageTitle(url.href);if(!candidate.startsWith(title+'/')||seen.has(candidate))return;seen.add(candidate);const label=$(node).text().trim();if(label)chapters.push({title:label,url:pageUrl(candidate)});}catch{/* Non-work links are not chapters. */}});
 return chapters.length?chapters:[{title:book.title,url:book.url}];
}
export function wikiText(html:string):string{const $=load(html);$('.mw-editsection,.noprint,script,style,nav,.navbox,.metadata').remove();$('br').replaceWith('\n');$('p,div,h1,h2,h3,li,tr').append('\n');const text=$('.mw-parser-output').length?$('.mw-parser-output').text():$('body').text();return text.replace(/[\t ]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();}
