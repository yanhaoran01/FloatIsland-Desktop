/* FloatIsland contributors. GPL-3.0. */
/** @file bookDownloadBridge.ts @description Books use the existing download queue and its task history. @author 鸡哥 */
export interface BookDownloadRequest {url:string;name:string;sourceId:string;signal:AbortSignal;}
let downloader:((request:BookDownloadRequest)=>Promise<string>)|undefined;
/** Registers the unified HTTP queue. @param download - Task coordinator. */
export function setBookHttpDownloader(download:(request:BookDownloadRequest)=>Promise<string>):void {downloader=download;}
/** Acquires a book through the same queue as ordinary downloads. @param request - Book and cancellation. @returns Verified Books path. */
export function downloadBook(request:BookDownloadRequest):Promise<string>{if(!downloader)return Promise.reject(Error('download-engine-unavailable'));return downloader(request);}
