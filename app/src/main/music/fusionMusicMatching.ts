/* FloatIsland contributors, GPL-3.0. */
/** @file fusionMusicMatching.ts @description Strict version-preserving candidates and bounded aggregate search. @author 鸡哥 */
import type {MusicTrack,MusicSearchResult} from '../../preload/types/fusionMusic';
const normalize=(value:string)=>value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,' ').trim();
const artists=(value:string)=>normalize(value).split(/\s*(?:、|&|\/|;|,|，)\s*/).sort().join('|');
/** Leaves live/remix/cover and every title qualifier intact. Missing duration requires manual selection. */
export function identicalMusic(a:MusicTrack,b:MusicTrack):boolean {
  return Boolean(a.artist&&b.artist&&normalize(a.title)===normalize(b.title)&&artists(a.artist)===artists(b.artist)&&a.duration&&b.duration&&Math.abs(a.duration-b.duration)<=2);
}
/** Groups only proven versions and keeps the original metadata/identity for favorites. */
export function aggregateMusic(tracks:MusicTrack[]):MusicTrack[]{
  const output:MusicTrack[]=[];for(const track of tracks){const group=output.find(other=>other.id===track.id||identicalMusic(track,other));if(group){group.candidates=[...new Set([...(group.candidates??[]),track.id])];}else output.push({...track,candidates:[track.id]});}return output;
}
/** Runs at most three cancellable source searches, publishing partial results without hiding failures. */
export async function searchMusicSources(jobs:{id:string;run:()=>Promise<MusicSearchResult>}[],signal:AbortSignal,batch:(value:MusicSearchResult)=>void):Promise<MusicSearchResult>{
  const tracks:MusicTrack[]=[],errors:{sourceId:string;error:string}[]=[];let cursor=0,hasMore=false,total=0;
  const snapshot=():MusicSearchResult=>({tracks:aggregateMusic(tracks),total,hasMore,errors:[...errors]});
  await Promise.all(Array.from({length:Math.min(3,jobs.length)},async()=>{while(cursor<jobs.length&&!signal.aborted){const job=jobs[cursor++];try{const found=await job.run();if(signal.aborted)break;tracks.push(...found.tracks);hasMore ||= found.hasMore===true;total+=found.total;}catch(error){if(signal.aborted)break;errors.push({sourceId:job.id,error:error instanceof Error?error.message:String(error)});}if(!signal.aborted)batch(snapshot());}}));
  if(signal.aborted)throw Error('music-cancelled');return snapshot();
}
