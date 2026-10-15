/* FusionIsland - GPL-3.0. @file productSharing.ts @description LocalSend v2 HTTPS discovery and confirmed streaming transfer. @author 鸡哥 */
import {app,BrowserWindow,dialog,ipcMain,type WebContents} from 'electron';
import {createServer,request as httpsRequest,type Server} from 'node:https';
import {request as httpRequest,type IncomingMessage,type ServerResponse,type ClientRequest} from 'node:http';
import {TLSSocket} from 'node:tls';
import {createSocket,type Socket} from 'node:dgram';
import {createReadStream,createWriteStream,readFileSync,writeFileSync,mkdirSync,rmSync,copyFileSync,constants,lstatSync,realpathSync} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {Transform} from 'node:stream';
import {join,basename,extname} from 'node:path';
import {randomUUID,createHash,X509Certificate} from 'node:crypto';
import {networkInterfaces,hostname} from 'node:os';
import {generate} from 'selfsigned';
import type {ShareState,SharePeer,ShareRequest} from '../../preload/types/fusionProduct';
import {isLocalAddress,safeReceiveName} from '../../shared/localSendRules';
import {isFusionView} from './fusionWindows';
import {requireArtifact,artifactMetadata,grantArtifact} from './productArtifacts';
import {createProductTask,publishProductTask,type ProductTask} from './productJobs';
interface RemoteFile {id:string;fileName:string;size:number;fileType?:string;sha256?:string;}
interface Incoming {request:ShareRequest;files:RemoteFile[];response:ServerResponse;address:string;timer:NodeJS.Timeout;}
interface Receiving {id:string;address:string;directory:string;files:Map<string,{file:RemoteFile;token:string;used:boolean}>;task:ProductTask;temporary:Set<string>;received:number;total:number;}
let owner:WebContents|null=null,server:Server|null=null,udp:Socket|null=null,leaseTimer:NodeJS.Timeout|null=null,heartbeat=0;
let state:ShareState={active:false,port:0,peers:[],requests:[],jobs:[]};
let ownerCleanup:(()=>void)|null=null;
let certificate:{cert:string;private:string}|null=null,fingerprint='';
const incoming=new Map<string,Incoming>(),receiving=new Map<string,Receiving>(),outgoing=new Map<string,ProductTask>();
const publish=():ShareState=>{state.requests=[...incoming.values()].map(x=>x.request);state.jobs=[...receiving.values()].map(x=>x.task.value).concat([...outgoing.values()].map(x=>x.value));if(owner&&!owner.isDestroyed())owner.send('fusion:product:share-state',structuredClone(state));return structuredClone(state);};
const info=(announce=false):object=>({alias:hostname().slice(0,80),version:'2.0',deviceModel:'FloatIsland',deviceType:'desktop',fingerprint,port:state.port,protocol:'https',download:false,announce});
const response=(res:ServerResponse,status:number,value?:unknown):void=>{if(res.destroyed||res.writableEnded)return;res.writeHead(status,{'Content-Type':'application/json'});res.end(value===undefined?'':JSON.stringify(value));};
const parseBody=async(req:IncomingMessage):Promise<unknown>=>{const chunks:Buffer[]=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>1_048_576)throw Error('metadata-too-large');chunks.push(Buffer.from(chunk));}return JSON.parse(Buffer.concat(chunks).toString('utf8'));};
const object=(value:unknown):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value);
const peer=(value:unknown,address:string,port=53317):SharePeer=>{
 if(!object(value)||!isLocalAddress(address)||typeof value.alias!=='string'||typeof value.fingerprint!=='string'||!value.fingerprint||value.fingerprint.length>256)throw Error('invalid-peer');
 const number=value.port===undefined?port:Number(value.port);if(!Number.isInteger(number)||number<1||number>65535||!['https','http'].includes(String(value.protocol??'https')))throw Error('invalid-peer');
 return {alias:value.alias.slice(0,80),fingerprint:value.fingerprint,address:address.replace(/^::ffff:/,''),port:number,protocol:value.protocol==='http'?'http':'https'};
};
const add=(item:SharePeer):void=>{if(item.fingerprint===fingerprint)return;state.peers=[...state.peers.filter(x=>x.fingerprint!==item.fingerprint),item].slice(-128);publish();};
/** Verify the discovered HTTPS identity before request bytes leave the TLS socket. */
const pinPeer=(req:ClientRequest,target:SharePeer):void=>{
 if(target.protocol!=='https'||!/^[a-f0-9]{64}$/i.test(target.fingerprint))return;
 req.on('socket',socket=>{if(!(socket instanceof TLSSocket)){req.destroy(Error('peer-certificate-unavailable'));return;}
  const verify=():void=>{const raw=socket.getPeerCertificate().raw;if(!raw||createHash('sha256').update(raw).digest('hex').toLowerCase()!==target.fingerprint.toLowerCase())req.destroy(Error('peer-certificate-changed'));};
  if(socket.connecting)socket.prependOnceListener('secureConnect',verify);else verify();
 });
};
const request=async(target:SharePeer,path:string,body:object|undefined,signal?:AbortSignal):Promise<unknown>=>{
 if(!isLocalAddress(target.address)||!Number.isInteger(target.port)||target.port<1||target.port>65535)throw Error('invalid-peer');
 const bytes=body?Buffer.from(JSON.stringify(body)):undefined;
 return new Promise((resolve,reject)=>{const req=(target.protocol==='https'?httpsRequest:httpRequest)({hostname:target.address,port:target.port,path,method:body?'POST':'GET',...(target.protocol==='https'?{rejectUnauthorized:false,cert:certificate?.cert,key:certificate?.private}:{}),headers:bytes?{'Content-Type':'application/json','Content-Length':bytes.length}:{},signal},res=>{
  if(target.protocol==='https'&&/^[a-f0-9]{64}$/i.test(target.fingerprint)){const socket=res.socket;if('getPeerCertificate' in socket&&typeof socket.getPeerCertificate==='function'){const cert=socket.getPeerCertificate();if(cert.raw&&createHash('sha256').update(cert.raw).digest('hex').toLowerCase()!==target.fingerprint.toLowerCase()){req.destroy(Error('peer-certificate-changed'));return;}}}
  const chunks:Buffer[]=[];let size=0;res.on('data',chunk=>{size+=chunk.length;if(size>1_048_576){req.destroy(Error('response-too-large'));return;}chunks.push(Buffer.from(chunk));});res.on('end',()=>{if((res.statusCode??500)>=400){reject(Error('localsend-http-'+res.statusCode));return;}const value=Buffer.concat(chunks).toString('utf8');try{resolve(value?JSON.parse(value):{});}catch(error){reject(error);}});res.on('error',reject);
 });pinPeer(req,target);req.setTimeout(120000,()=>req.destroy(Error('network-timeout')));req.on('error',reject);req.end(bytes);});
};
const announce=(reply=false):void=>{const bytes=Buffer.from(JSON.stringify(info(!reply)));udp?.send(bytes,53317,'224.0.0.167',error=>{if(error){state.error=error.message;publish();}});};
const cleanTemporary=(path:string):void=>{try{rmSync(path,{force:true});}catch{setTimeout(()=>{try{rmSync(path,{force:true});}catch(error){console.error('[LocalSend] temporary cleanup failed',error);}},500);}};
const stop=():void=>{
 state.active=false;if(owner&&ownerCleanup)owner.removeListener('destroyed',ownerCleanup);ownerCleanup=null;if(leaseTimer)clearInterval(leaseTimer);leaseTimer=null;
 for(const pending of incoming.values()){clearTimeout(pending.timer);response(pending.response,403);}incoming.clear();
 for(const session of receiving.values()){session.task.controller.abort();publishProductTask(session.task,{state:'cancelled'});for(const path of session.temporary)cleanTemporary(path);}receiving.clear();
 for(const task of outgoing.values()){task.controller.abort();publishProductTask(task,{state:'cancelled'});}outgoing.clear();
 if(udp){try{udp.close();}catch{}udp=null;}if(server){server.closeAllConnections();server.close();server=null;}state.requests=[];state.jobs=[];publish();owner=null;
};
const route=async(req:IncomingMessage,res:ServerResponse):Promise<void>=>{
 const address=(req.socket.remoteAddress??'').replace(/^::ffff:/,''),url=new URL(req.url??'/','https://localhost');if(!state.active||!owner||!isLocalAddress(address)){response(res,403);return;}
 try{
  if(url.pathname==='/api/localsend/v2/info'&&req.method==='GET'){response(res,200,info());return;}
  if(url.pathname==='/api/localsend/v2/register'&&req.method==='POST'){add(peer(await parseBody(req),address));response(res,200,info());return;}
  if(url.pathname==='/api/localsend/v2/prepare-upload'&&req.method==='POST'){
   if(incoming.size+receiving.size>=8){response(res,409);return;}const body=await parseBody(req);if(!object(body)||!object(body.info)||!object(body.files))throw Error('invalid-metadata');const source=peer(body.info,address),files:RemoteFile[]=[];
   for(const [id,value] of Object.entries(body.files)){if(!object(value)||value.id!==id||typeof value.fileName!=='string'||typeof value.size!=='number'||!Number.isSafeInteger(value.size)||value.size<0||value.size>2_147_483_648||id.length>200)throw Error('invalid-metadata');files.push({id,fileName:safeReceiveName(value.fileName),size:value.size,fileType:typeof value.fileType==='string'?value.fileType:undefined,sha256:typeof value.sha256==='string'?value.sha256:undefined});}
   if(!files.length||files.length>1000||files.reduce((s,f)=>s+f.size,0)>2_147_483_648)throw Error('transfer-limit');
   const id=randomUUID(),pending:Incoming={request:{id,alias:source.alias,files:files.map(f=>({id:f.id,name:f.fileName,size:f.size}))},files,response:res,address,timer:setTimeout(()=>{incoming.delete(id);response(res,403);publish();},120000)};incoming.set(id,pending);res.once('close',()=>{if(incoming.has(id)){clearTimeout(pending.timer);incoming.delete(id);publish();}});publish();return;
  }
  const session=receiving.get(url.searchParams.get('sessionId')??'');
  if(url.pathname==='/api/localsend/v2/cancel'&&req.method==='POST'){if(session&&session.address===address){session.task.controller.abort();receiving.delete(session.id);publishProductTask(session.task,{state:'cancelled'});for(const path of session.temporary)cleanTemporary(path);publish();}response(res,200);return;}
  if(url.pathname==='/api/localsend/v2/upload'&&req.method==='POST'){
   const entry=session?.files.get(url.searchParams.get('fileId')??'');if(!session||session.address!==address||!entry||entry.used||entry.token!==url.searchParams.get('token')){response(res,403);return;}entry.used=true;
   const temp=join(session.directory,'.fusion-transfer-'+randomUUID()+'.part');session.temporary.add(temp);let bytes=0;const hash=createHash('sha256');
   const meter=new Transform({transform(chunk:Buffer,_encoding,callback){bytes+=chunk.length;if(bytes>entry.file.size){callback(Error('size-mismatch'));return;}hash.update(chunk);session.received+=chunk.length;publishProductTask(session.task,{progress:session.total?session.received/session.total:0});publish();callback(null,chunk);}});
   try{await pipeline(req,meter,createWriteStream(temp,{flags:'wx'}),{signal:session.task.controller.signal});if(bytes!==entry.file.size||entry.file.sha256&&hash.digest('hex').toLowerCase()!==entry.file.sha256.toLowerCase()){response(res,422);throw Error('checksum-mismatch');}
    session.task.controller.signal.throwIfAborted();let name=entry.file.fileName,path=join(session.directory,name),index=1;const ext=extname(name),base=basename(name,ext);
    while(true){try{copyFileSync(temp,path,constants.COPYFILE_EXCL);break;}catch(error){if(error instanceof Error&&'code'in error&&error.code==='EEXIST'){name=base+' ('+index+++')'+ext;path=join(session.directory,name);continue;}throw error;}}
    const result=grantArtifact(owner,path);publishProductTask(session.task,{result:[...session.task.value.result,result]});response(res,200);
    if(session.task.value.result.length===session.files.size){publishProductTask(session.task,{state:'done',progress:1});receiving.delete(session.id);}publish();
   }catch(error){if(!res.writableEnded)response(res,session.task.controller.signal.aborted?403:500);publishProductTask(session.task,{state:session.task.controller.signal.aborted?'cancelled':'error',error:String(error)});receiving.delete(session.id);publish();}finally{cleanTemporary(temp);session.temporary.delete(temp);}return;
  }response(res,404);
 }catch(error){response(res,400,{error:String(error)});}
};
/** Starts discovery only for the currently visible sharing view. */
export function registerProductSharing():void {
 const handle=<A extends unknown[],R>(name:string,fn:(sender:WebContents,...args:A)=>R):void=>{ipcMain.handle('fusion:product:'+name,(event,...args:A)=>{if(!isFusionView(event.sender))throw Error('untrusted-view');return fn(event.sender,...args);});};
 handle('share',async(sender,command:'start'|'stop'|'discover',address?:string)=>{
  if(command==='stop'){if(owner===sender)stop();return structuredClone(state);}
  if(command==='start'){
   heartbeat=Date.now();if(owner===sender&&state.active)return publish();if(owner&&owner!==sender)throw Error('sharing-in-use');owner=sender;
   try{if(!certificate){const directory=join(app.getPath('userData'),'fusion-products');mkdirSync(directory,{recursive:true});const file=join(directory,'lan-certificate.json');try{const saved:unknown=JSON.parse(readFileSync(file,'utf8'));if(!object(saved)||typeof saved.cert!=='string'||typeof saved.private!=='string')throw Error('invalid-certificate');certificate={cert:saved.cert,private:saved.private};new X509Certificate(certificate.cert);}catch{const generated=await generate([{name:'commonName',value:'FloatIsland'}],{algorithm:'sha256',notAfterDate:new Date(Date.now()+5*365*86400000)});certificate={cert:generated.cert,private:generated.private};writeFileSync(file,JSON.stringify(certificate),{mode:0o600});}fingerprint=createHash('sha256').update(new X509Certificate(certificate.cert).raw).digest('hex');}
    server=createServer({...certificate,key:certificate.private,requestCert:true,rejectUnauthorized:false},(req,res)=>{void route(req,res);});server.headersTimeout=15000;server.requestTimeout=120000;
    await new Promise<void>((resolve,reject)=>{const first=(error:NodeJS.ErrnoException):void=>{server?.removeListener('listening',ready);if(error.code==='EADDRINUSE'){server?.once('error',reject);server?.once('listening',resolve);server?.listen(0,'0.0.0.0');}else reject(error);};const ready=():void=>{server?.removeListener('error',first);resolve();};server?.once('error',first);server?.once('listening',ready);server?.listen(53317,'0.0.0.0');});
    const bound=server.address();if(!bound||typeof bound==='string')throw Error('network-unavailable');state={active:true,port:bound.port,peers:[],requests:[],jobs:[]};
    udp=createSocket({type:'udp4',reuseAddr:true});udp.on('error',error=>{state.error=error.message;publish();});udp.on('message',(bytes,remote)=>{if(bytes.length>4096||!state.active)return;try{const value:unknown=JSON.parse(bytes.toString('utf8')),item=peer(value,remote.address);add(item);if(object(value)&&value.announce===true&&item.fingerprint!==fingerprint){void request(item,'/api/localsend/v2/register',info()).then(result=>add(peer(result,item.address,item.port))).catch(()=>announce(true));announce(true);}}catch{}});
    await new Promise<void>(resolve=>udp?.bind(53317,()=>{for(const entries of Object.values(networkInterfaces()))for(const network of entries??[])if(network.family==='IPv4'&&!network.internal)try{udp?.addMembership('224.0.0.167',network.address);}catch(error){state.error=String(error);}resolve();}));announce();
    leaseTimer=setInterval(()=>{if(!owner||owner.isDestroyed()||Date.now()-heartbeat>3500||!BrowserWindow.fromWebContents(owner)?.isVisible())stop();},500);ownerCleanup=()=>{if(owner===sender)stop();};sender.once('destroyed',ownerCleanup);return publish();
   }catch(error){state.error=String(error);stop();throw error;}
  }
  if(command==='discover'&&owner===sender&&state.active){heartbeat=Date.now();if(address){const parsed=new URL(address.includes('://')?address:'https://'+address+':53317');if(!isLocalAddress(parsed.hostname))throw Error('invalid-peer');const target:SharePeer={alias:'',fingerprint:'manual',address:parsed.hostname,port:Number(parsed.port||53317),protocol:parsed.protocol==='http:'?'http':'https'};const result=await request(target,'/api/localsend/v2/register',info());add(peer({...object(result)?result:{},port:target.port,protocol:target.protocol},target.address));}else announce();return publish();}throw Error('sharing-not-active');
 });
 handle('share-reply',async(sender,id:string,accept:boolean)=>{
  if(owner!==sender||!state.active)throw Error('sharing-not-active');const pending=incoming.get(id);if(!pending)throw Error('invalid-request');incoming.delete(id);clearTimeout(pending.timer);
  if(!accept){response(pending.response,403);return publish();}const window=BrowserWindow.fromWebContents(sender),selected=window?await dialog.showOpenDialog(window,{properties:['openDirectory','createDirectory']}):await dialog.showOpenDialog({properties:['openDirectory','createDirectory']});
  if(selected.canceled||!state.active||pending.response.destroyed){response(pending.response,403);return publish();}const directory=realpathSync(selected.filePaths[0]);if(!lstatSync(directory).isDirectory())throw Error('invalid-directory');
  const task=createProductTask(sender,'share'),session:Receiving={id:randomUUID(),address:pending.address,directory,files:new Map(pending.files.map(file=>[file.id,{file,token:randomUUID(),used:false}])),task,temporary:new Set(),received:0,total:pending.files.reduce((s,f)=>s+f.size,0)};
  receiving.set(session.id,session);response(pending.response,200,{sessionId:session.id,files:Object.fromEntries([...session.files].map(([id,value])=>[id,value.token]))});return publish();
 });
 handle('share-send',(sender,target:SharePeer,ids:string[])=>{
  if(owner!==sender||!state.active||!ids.length||ids.length>1000||!state.peers.some(p=>p.fingerprint===target.fingerprint&&p.address===target.address&&p.port===target.port&&p.protocol===target.protocol))throw Error('invalid-peer');
  const files=ids.map(id=>({id,grant:requireArtifact(sender,id)})),total=files.reduce((s,f)=>s+f.grant.size,0);if(total>2_147_483_648)throw Error('transfer-limit');const task=createProductTask(sender,'share');outgoing.set(task.value.id,task);publish();
  void(async()=>{let sessionId='',sent=0;try{const prepared=await request(target,'/api/localsend/v2/prepare-upload',{info:info(),files:Object.fromEntries(files.map(file=>[file.id,{id:file.id,fileName:file.grant.name,size:file.grant.size,fileType:artifactMetadata(file.id,file.grant).mime}]))},task.controller.signal);
   if(!object(prepared)||typeof prepared.sessionId!=='string'||!object(prepared.files))throw Error('invalid-response');sessionId=prepared.sessionId;
   for(const file of files){task.controller.signal.throwIfAborted();const token=prepared.files[file.id];if(typeof token!=='string')continue;
    await new Promise<void>((resolve,reject)=>{const path='/api/localsend/v2/upload?'+new URLSearchParams({sessionId,fileId:file.id,token});const req=(target.protocol==='https'?httpsRequest:httpRequest)({hostname:target.address,port:target.port,path,method:'POST',headers:{'Content-Type':'application/octet-stream','Content-Length':file.grant.size},signal:task.controller.signal,...(target.protocol==='https'?{rejectUnauthorized:false,cert:certificate?.cert,key:certificate?.private}:{})},res=>{res.resume();res.once('end',()=>{(res.statusCode??500)>=400?reject(Error('localsend-http-'+res.statusCode)):resolve();});res.once('error',reject);});pinPeer(req,target);req.setTimeout(120000,()=>req.destroy(Error('network-timeout')));req.once('error',reject);
     const meter=new Transform({transform(chunk:Buffer,_enc,callback){sent+=chunk.length;publishProductTask(task,{progress:total?sent/total:0});publish();callback(null,chunk);}});void pipeline(createReadStream(file.grant.path),meter,req,{signal:task.controller.signal}).catch(reject);
    });
   }publishProductTask(task,{state:'done',progress:1,result:files.map(f=>artifactMetadata(f.id,f.grant))});
  }catch(error){if(sessionId)void request(target,'/api/localsend/v2/cancel?'+new URLSearchParams({sessionId}),{}).catch(()=>undefined);publishProductTask(task,{state:task.controller.signal.aborted?'cancelled':'error',error:String(error)});}finally{outgoing.delete(task.value.id);publish();}})();return {...task.value};
 });
 app.once('will-quit',stop);
}
