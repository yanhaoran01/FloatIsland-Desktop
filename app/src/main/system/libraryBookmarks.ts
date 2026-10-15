/* FloatIsland contributors. GPL-3.0. */
/** @file libraryBookmarks.ts @description Portable bookmark metadata without executable import content. */
import {load} from 'cheerio';
import type {LibraryItem} from '../../preload/types/fusionLibrary';
const escape=(value:string):string=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
export function importBookmarkHtml(html:string):unknown[]{
 const $=load(html),links=$('a[href]').toArray();if(links.length>10000)throw Error('bookmark-limit');
 return links.map(node=>{const a=$(node),dt=a.closest('dt');let folder=a.attr('data-group');
  if(folder===undefined){folder=dt.parents('dl').toArray().reverse().map(dl=>{const list=$(dl);return list.prev('h3').text()||list.parent('dt').children('h3').first().text()||list.prev('dt').children('h3').first().text();}).filter(Boolean).join(' / ');}
  let tags:string[]=(a.attr('tags')||'').split(',').map(s=>s.trim()).filter(Boolean);
  try{const raw=JSON.parse(a.attr('data-tags')||'null');if(Array.isArray(raw)&&raw.every(x=>typeof x==='string'))tags=raw;}catch{/* Ordinary browser TAGS remains a valid fallback. */}
  return {id:a.attr('data-id'),url:a.attr('href'),title:a.text(),folder,tags,note:a.attr('data-note')??dt.next('dd').text(),pinned:a.attr('data-pinned')==='true'};
 });
}
export function exportBookmarkHtml(items:LibraryItem[]):string{
 const groups=new Map<string,LibraryItem[]>();for(const item of items){if(item.kind!=='url'||!item.url)continue;const rows=groups.get(item.group)||[];rows.push(item);groups.set(item.group,rows);}
 const row=(item:LibraryItem):string=>'<DT><A HREF="'+escape(item.url!)+'" DATA-ID="'+escape(item.id)+'" DATA-GROUP="'+escape(item.group)+'" DATA-NOTE="'+escape(item.note)+'" DATA-TAGS="'+escape(JSON.stringify(item.tags))+'" DATA-PINNED="'+item.pinned+'" TAGS="'+escape(item.tags.join(','))+'">'+escape(item.title)+'</A></DT>'+(item.note?'<DD>'+escape(item.note)+'</DD>':'');
 return '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>FloatIsland bookmarks</TITLE>\n<DL>'+[...groups].map(([group,rows])=>group?'<DT><H3>'+escape(group)+'</H3><DL>'+rows.map(row).join('\n')+'</DL></DT>':rows.map(row).join('\n')).join('\n')+'</DL>';
}
