/* FloatIsland contributors, GPL-3.0. */
/** @file MusicPluginHost.ts @description Relays only typed music calls to a terminable, network-less worker. @author 鸡哥 */
type Bridge={request:(id:string,url:string,options:unknown)=>Promise<unknown>;ready:()=>void;result:(id:string,value:unknown,error?:string)=>void;on:(fn:(value:unknown)=>void)=>()=>void};
const bridge=(window as unknown as {musicPluginBridge:Bridge}).musicPluginBridge;
const worker=new Worker(new URL('./musicPluginWorker.ts',import.meta.url),{type:'module'});
bridge.on(value=>worker.postMessage(value));
worker.onmessage=async event=>{
  const message=event.data;if(message?.kind==='http'){
    try{const value=await bridge.request(message.callId,message.url,message.options);worker.postMessage({kind:'http-result',id:message.id,value});}
    catch(error){worker.postMessage({kind:'http-result',id:message.id,error:String(error)});}
  }else if(message?.kind==='result')bridge.result(message.id,message.value,message.error);
  else if(message?.kind==='ready')bridge.ready();
};
worker.onerror=event=>bridge.result('host',null,event.message);
