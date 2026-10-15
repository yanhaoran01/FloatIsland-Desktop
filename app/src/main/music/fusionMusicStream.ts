/* FloatIsland - https://github.com/yanhaoran01/FloatIsland
 * Copyright (C) 2026 FloatIsland contributors. GPL-3.0. */
/** @file fusionMusicStream.ts @description Keeps network cancellation alive through the complete audio stream. @author 鸡哥 */
/** Releases the request only when streaming finishes or the consumer cancels. */
export function retainMusicStream(response:Response,release:()=>void):Response {
  if(!response.body){release();return response;}
  const reader=response.body.getReader();let released=false;
  const finish=()=>{if(!released){released=true;release();}};
  const body=new ReadableStream<Uint8Array>({
    async pull(controller){
      try{const part=await reader.read();if(part.done){finish();controller.close();}else controller.enqueue(part.value);}
      catch(error){finish();controller.error(error);}
    },
    async cancel(reason){try{await reader.cancel(reason);}finally{finish();}}
  });
  return new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers});
}
