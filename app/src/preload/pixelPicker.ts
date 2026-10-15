/* FloatIsland - GPL-3.0. */
/** @file pixelPicker.ts @description Isolated desktop picker bridge: initialize, position or cancel only. @author 鸡哥 */
import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('colorPickerAPI', {
  init: () => ipcRenderer.invoke('fusion:color:init'),
  select: (x: number, y: number) => ipcRenderer.send('fusion:color:selected', [x,y,window.innerWidth,window.innerHeight]),
  cancel: () => ipcRenderer.send('fusion:color:selected', null),
});
