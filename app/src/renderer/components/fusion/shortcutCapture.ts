/* FloatIsland - Copyright (C) 2026 contributors. GPL-3.0. */
/** @file shortcutCapture.ts @description Convert recorded keyboard combinations to Electron accelerators. @author 鸡哥 */
export interface ShortcutKey {key:string;code?:string;ctrlKey:boolean;altKey:boolean;shiftKey:boolean;metaKey:boolean;isComposing?:boolean;}
/** Modifier-only and composition events do not replace a saved shortcut. */
export function shortcutFromKey(event: ShortcutKey): string | null {
  if(event.isComposing || ['Control','Alt','Shift','Meta','AltGraph','Dead','Unidentified','Escape'].includes(event.key))return null;
  const modifiers=[event.ctrlKey?'CommandOrControl':'',event.altKey?'Alt':'',event.shiftKey?'Shift':'',event.metaKey?'Super':''].filter(Boolean);
  if(event.key==='Tab'&&!modifiers.length)return null;
  const keys:Record<string,string>={' ':'Space',ArrowUp:'Up',ArrowDown:'Down',ArrowLeft:'Left',ArrowRight:'Right','+':'Plus'};
  const key=event.code?.match(/^Key([A-Z])$/)?.[1] ?? event.code?.match(/^Digit(\d)$/)?.[1] ?? keys[event.key] ?? (event.key.length===1?event.key.toUpperCase():event.key);
  return [...modifiers,key].join('+');
}
