/* FloatIsland contributors. GPL-3.0. */
/** @file toolPreferences.ts @description Small versioned local tool preferences with bounded recovery. @author 鸡哥 */
import {useState} from 'react';
export function useToolPreference<T>(key:string,initial:T,valid:(value:unknown)=>value is T):[T,(value:T)=>void]{
 const storage='float.tool-preferences.v1.'+key;
 const [value,setValue]=useState<T>(()=>{try{const raw=localStorage.getItem(storage);if(raw&&raw.length<=200000){const parsed:unknown=JSON.parse(raw);if(valid(parsed))return parsed;}}catch{}return initial;});
 return [value,next=>{setValue(next);try{const raw=JSON.stringify(next);if(raw.length<=200000)localStorage.setItem(storage,raw);}catch{}}];
}
