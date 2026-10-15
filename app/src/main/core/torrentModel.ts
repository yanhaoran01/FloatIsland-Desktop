/* FloatIsland - https://github.com/yanhaoran01/FloatIsland
 * Copyright (C) 2026 contributors. GPL-3.0. */
/** @file torrentModel.ts @description Validated torrent input and path handling shared by the owned engine. @author 鸡哥 */
import {relative,isAbsolute,sep,resolve} from 'node:path';
/** Accepts supported magnet hashes and discards no user-supplied trackers.
 * @param input - Share text or magnet URL. @returns Normalized magnet.
 */
export function magnetUrl(input:string):string{
 if(typeof input!=='string'||input.length>32768)throw Error('bt-invalid-source');const match=input.match(/magnet:\?[^\s<>"']+/i);if(!match)throw Error('bt-invalid-source');const url=new URL(match[0]);if(url.protocol!=='magnet:'||!url.searchParams.getAll('xt').some(xt=>/^urn:btih:(?:[a-f\d]{40}|[a-z2-7]{32})$/i.test(xt)))throw Error('bt-invalid-source');return url.href;
}
/** Refuses absolute and escaping paths from torrent metadata.
 * @param root - Owned staging folder. @param file - Engine path. @returns Relative safe path.
 */
export function torrentRelativePath(root:string,file:string):string{
 const path=relative(resolve(root),resolve(file));if(!path||isAbsolute(path)||path==='..'||path.startsWith('..'+sep)||path.split(/[\\/]/).some(part=>!part||part==='.'||part==='..'||/[<>:"|?*\x00-\x1f]/.test(part)))throw Error('file-not-authorized');return path;
}
