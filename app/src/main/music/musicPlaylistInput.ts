/* FloatIsland - https://github.com/yanhaoran01/FloatIsland
 * Copyright (C) 2026 contributors. GPL-3.0. */
/** @file musicPlaylistInput.ts @description Strict domestic playlist IDs from platform URLs and shared text. @author 鸡哥 */
/** Parses a platform playlist without guessing unknown domains or executing shared text. */
export function playlistReference(input:string):{sourceId:string;id:string;url:string}|null{
 if(typeof input!=='string'||input.length>8192)throw Error('music-invalid-source');
 if(/^(?:neplaylist|qqplaylist)_\d+$/.test(input))return {sourceId:input.startsWith('ne')?'builtin:netease':'builtin:qq',id:input,url:input.startsWith('ne')?'https://music.163.com/playlist?id='+input.split('_')[1]:'https://y.qq.com/n/ryqq/playlist/'+input.split('_')[1]};
 const text=input.match(/https?:\/\/[^\s<>"“”]+/i)?.[0]?.replace(/[）),，。]+$/,'');if(!text)return null;let url:URL;try{url=new URL(text);}catch{return null;}if(url.username||url.password)return null;
 if(url.hostname==='music.163.com'){const route=new URL(url.href.replace('/#/','/'));if(!/\/playlist(?:\/|\?|$)/.test(route.pathname+route.search))return null;const id=route.searchParams.get('id')||route.pathname.match(/playlist\/(\d+)/)?.[1];if(id&&/^\d+$/.test(id))return {sourceId:'builtin:netease',id:'neplaylist_'+id,url:route.href};}
 if(['y.qq.com','i.y.qq.com'].includes(url.hostname)){if(!/(playlist|playsquare|taoge)/.test(url.pathname))return null;const id=url.pathname.match(/\/(?:playlist|playsquare)\/(\d+)/)?.[1]||url.searchParams.get('disstid')||url.searchParams.get('id');if(id&&/^\d+$/.test(id))return {sourceId:'builtin:qq',id:'qqplaylist_'+id,url:'https://y.qq.com/n/ryqq/playlist/'+id};}
 return null;
}
