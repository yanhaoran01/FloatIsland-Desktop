/* FloatIsland contributors. GPL-3.0. */
/** @file ReadingShelf.tsx @description Referenced and managed books with visible reading actions and saved progress. */
import {useEffect,useState} from 'react';
import {create} from 'zustand';
import {useTranslation} from 'react-i18next';
import {BookOpen,Link,Search,FolderOpen} from 'lucide-react';
import type {LibraryItem} from '../../../../preload/types/fusionLibrary';
import type {SourceBook} from '../../../../preload/types/managedLibrary';
import {useLibrary} from '../libraryState';
import {ToolError} from './ToolControls';

const useShelf=create<{query:string;sort:string;group:string;set:(value:Partial<{query:string;sort:string;group:string}>)=>void}>(set=>({query:'',sort:'recent',group:'',set:value=>set(value)}));
function BookCover({item}:{item:LibraryItem}){
 const [cover,setCover]=useState('');useEffect(()=>{let alive=true;if(item.reading?.cover)void window.api.fusionLibraryReaderCover(item.id).then(value=>{if(alive)setCover(value);}).catch(()=>{});return()=>{alive=false;};},[item.id,item.reading?.cover]);
 return cover?<img className="float-book-cover" src={cover} alt=""/>:<span className="float-book-cover float-book-cover-empty"><BookOpen size={26}/><small>{item.title.split('.').pop()?.toUpperCase()}</small></span>;
}
export function ReadingShelf({localBooks,remoteBooks,onOpen}:{localBooks:LibraryItem[];remoteBooks:SourceBook[];onOpen:(book:SourceBook)=>void}){
 const {t}=useTranslation(),library=useLibrary(),view=useShelf(),[error,setError]=useState(''),[editing,setEditing]=useState(''),[group,setGroup]=useState('');
 const query=view.query.trim().toLocaleLowerCase(),groups=[...new Set(localBooks.map(item=>item.group).filter(Boolean))].sort();
 const filtered=localBooks.filter(item=>(!view.group||item.group===view.group)&&(!query||[item.title,item.reading?.title,item.reading?.author,item.group,item.path,...item.tags].join(' ').toLocaleLowerCase().includes(query))).sort((a,b)=>view.sort==='title'?(a.reading?.title||a.title).localeCompare(b.reading?.title||b.title):view.sort==='progress'?(b.reading?.progress||0)-(a.reading?.progress||0):(b.reading?.updatedAt||b.openedAt||b.createdAt)-(a.reading?.updatedAt||a.openedAt||a.createdAt));
 const recent=[...localBooks].filter(item=>item.reading?.updatedAt).sort((a,b)=>(b.reading?.updatedAt||0)-(a.reading?.updatedAt||0))[0];
 const open=(item:LibraryItem)=>onOpen({id:item.id,sourceId:'',title:item.title,author:item.reading?.author||'',url:'',format:'managed-library'});
 const run=(action:()=>Promise<unknown>)=>{setError('');void action().catch(reason=>setError(String(reason)));};
 const matchesRemote=(book:SourceBook)=>!view.group&&(!query||[book.title,book.author].join(' ').toLocaleLowerCase().includes(query));
 const books=remoteBooks.filter(book=>book.format!=='website'&&matchesRemote(book)),sites=remoteBooks.filter(book=>book.format==='website'&&matchesRemote(book));
 return <section className="float-reading-shelf">
  {recent&&<button className="float-reading-continue" onClick={()=>open(recent)}><BookOpen size={20}/><span><strong>{t('fusion.enhance.reading.continue')}</strong><small>{recent.reading?.title||recent.title} · {Math.round((recent.reading?.progress||0)*100)}%</small></span></button>}
  <div className="float-library-filter"><label className="float-shelf-search"><Search size={16}/><input type="search" aria-label={t('fusion.enhance.reading.searchShelf')} placeholder={t('fusion.enhance.reading.searchShelf')} value={view.query} onChange={event=>view.set({query:event.target.value})}/></label><select aria-label={t('fusion.enhance.reading.sort')} value={view.sort} onChange={event=>view.set({sort:event.target.value})}>{['recent','title','progress'].map(id=><option key={id} value={id}>{t('fusion.enhance.reading.'+id)}</option>)}</select><select aria-label={t('fusion.library.group')} value={view.group} onChange={event=>view.set({group:event.target.value})}><option value="">{t('fusion.library.allGroups')}</option>{groups.map(value=><option key={value}>{value}</option>)}</select></div>
  <ToolError error={error}/>
  {!localBooks.length&&!remoteBooks.some(book=>book.format!=='website')&&<div className="float-reading-empty"><BookOpen size={32} strokeWidth={1.4}/><span>{t('fusion.ui.emptyShelf')}</span></div>}
  <div className="float-book-grid">{filtered.map(item=><article className="float-book-card" key={item.id}>
   <button className="float-book-open" onClick={()=>open(item)}><BookCover item={item}/><span><strong>{item.reading?.title||item.title}</strong><small>{item.reading?.author||item.title.split('.').pop()?.toUpperCase()}</small><small>{item.group||item.path?.split(/[\\/]/).slice(-2,-1).join('')}</small><progress value={item.reading?.progress||0} max={1}/><small>{Math.round((item.reading?.progress||0)*100)}%</small></span></button>
   <div className="float-book-actions"><button onClick={()=>open(item)}><BookOpen size={14}/>{t('fusion.library.read')}</button><button onClick={()=>{setEditing(editing===item.id?'':item.id);setGroup(item.group);}}><FolderOpen size={14}/>{t('fusion.library.group')}</button><button onClick={()=>run(()=>window.api.fusionLibraryPick('rebind',item.id).then(data=>library.set({data})))}><Link size={14}/>{t('fusion.library.rebind')}</button></div>
   {editing===item.id&&<form className="float-library-inline" onSubmit={event=>{event.preventDefault();run(()=>library.write({type:'item',id:item.id,patch:{group}}).then(()=>setEditing('')));}}><input aria-label={t('fusion.library.group')} value={group} onChange={event=>setGroup(event.target.value)}/><button type="submit">{t('fusion.library.save')}</button></form>}
  </article>)}{books.map(book=><article className="float-book-card" key={book.id}><button className="float-book-open" onClick={()=>onOpen(book)}><span className="float-book-cover float-book-cover-empty"><BookOpen size={26}/><small>{book.format?.toUpperCase()}</small></span><span><strong>{book.title}</strong><small>{book.author}</small></span></button><div className="float-book-actions"><button onClick={()=>onOpen(book)}><BookOpen size={14}/>{t('fusion.library.read')}</button></div></article>)}</div>
  {!!sites.length&&<section className="float-reading-sites" aria-label={t('fusion.ui.originalSites')}><h3>{t('fusion.ui.originalSites')}</h3>{sites.map(site=><button key={site.id} onClick={()=>onOpen(site)}><Link size={18}/><span><strong>{site.title}</strong><small>{site.author}</small></span><span>{t('fusion.library.open')}</span></button>)}</section>}
 </section>;
}
