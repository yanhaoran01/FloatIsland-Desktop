/* FloatIsland - https://github.com/JNTMTMTM/eIsland. Copyright (C) 2026 contributors. GPL-3.0. */
/** @file verify-packaged-gui.cjs @description Check native hooks inside the packaged application's real GUI process. @author 鸡哥 */
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),{spawn}=require('node:child_process');
const [executable,archive,output]=process.argv.slice(2).map(value=>path.resolve(value));
if(!executable||!archive||!output)throw Error('GUI check requires executable, archive and report');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 const profile=path.join(path.dirname(output),'gui-verification-profile');fs.mkdirSync(profile,{recursive:true});
 const port=await new Promise((resolve,reject)=>{const server=net.createServer();server.on('error',reject);server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});});
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const child=spawn(executable,['--user-data-dir='+profile,'--inspect=127.0.0.1:'+port],{env,windowsHide:true,stdio:['ignore','ignore','pipe']});
 let stderr='',socket;child.stderr.on('data',chunk=>{stderr+=chunk;});
 const report={passed:false,checks:[]};
 try{
  let endpoint;const deadline=Date.now()+25000;
  while(Date.now()<deadline){try{const pages=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();endpoint=pages[0]?.webSocketDebuggerUrl;if(endpoint)break;}catch{}await sleep(150);}
  if(!endpoint)throw Error('Packaged inspector unavailable: '+stderr);
  socket=new WebSocket(endpoint);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  const response=await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('Native GUI check timed out')),20000);
   socket.onmessage=event=>{const value=JSON.parse(event.data);if(value.id===1){clearTimeout(timer);value.error?reject(Error(value.error.message)):resolve(value.result);}};
   const expression=`(async()=>{const initializedBy=Date.now()+15000;while(!process.mainModule&&Date.now()<initializedBy)await new Promise(resolve=>setTimeout(resolve,25));if(!process.mainModule)throw Error('Packaged main module did not initialize');const e=process.mainModule.require('electron');await e.app.whenReady();const load=process.mainModule.require('node:module').createRequire(${JSON.stringify(path.join(archive,'package.json'))});const hook=load('uiohook-napi').uIOhook;if(typeof hook.start!=='function'||typeof hook.stop!=='function')throw Error('invalid-hook-addon');return {electron:process.versions.electron,name:e.app.getName(),data:e.app.getPath('userData'),hookApi:true};})()`;
   socket.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true}}));
  });
  if(response.exceptionDetails)throw Error(JSON.stringify(response.exceptionDetails));
  report.runtime=response.result.value;report.passed=Boolean(report.runtime.hookApi)&&report.runtime.data===profile;
  report.checks.push({name:'packaged GUI startup and native hook API',passed:report.passed});
 }catch(error){report.checks.push({name:'packaged GUI startup and native hook API',passed:false,error:String(error)});}
 finally{socket?.close();child.kill();fs.writeFileSync(output,JSON.stringify(report,null,2));}
 console.log(JSON.stringify(report));process.exitCode=report.passed?0:1;
})().catch(error=>{console.error(error);process.exitCode=1;});
