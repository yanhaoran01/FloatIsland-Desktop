/* FloatIsland contributors. GPL-3.0. */
/** @file libraryState.ts @description Shared collections and task snapshots survive navigation. */
import {create} from 'zustand';
import {useEffect} from 'react';
import type {LibraryData,LibraryJob,LibraryWrite} from '../../../preload/types/fusionLibrary';
const empty:LibraryData={version:1,revision:0,items:[],scopes:[],templates:[],workspaces:[],feeds:[],entries:[],reminders:[]};
interface State {data:LibraryData;jobs:Record<string,LibraryJob>;error:string;activeItem:string;tab:string;filter:string;group:string;set:(patch:Partial<State>)=>void;write:(command:LibraryWrite)=>Promise<void>;}
export const useLibraryStore=create<State>(set=>({data:empty,jobs:{},error:'',activeItem:'',tab:'files',filter:'all',group:'',set:patch=>set(patch),write:async command=>{try{const data=await window.api.fusionLibraryWrite(command);set({data,error:''});}catch(error){set({error:String(error)});throw error;}}}));
let users=0,dispose:(()=>void)|null=null;
/** A single shared subscription, regardless of how many tools are mounted. */
export function useLibrary(){
 const state=useLibraryStore();
 useEffect(()=>{if(++users===1){let alive=true;void window.api.fusionLibraryGet().then(data=>{if(alive)useLibraryStore.setState(old=>data.revision>=old.data.revision?{data}:{});}).catch(error=>{if(alive)useLibraryStore.setState({error:String(error)});});
  const dataOff=window.api.onFusionLibrary(data=>useLibraryStore.setState(old=>data.revision>=old.data.revision?{data}:{})),jobOff=window.api.onFusionLibraryJob(job=>useLibraryStore.setState(old=>({jobs:{...old.jobs,[job.id]:job}})));
  dispose=()=>{alive=false;dataOff();jobOff();};
 }return()=>{if(--users===0){dispose?.();dispose=null;}};},[]);return state;
}
