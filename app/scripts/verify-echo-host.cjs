/* FusionIsland, GPL-3.0. EchoIsland integration verification using an isolated data directory. */
const {spawn} = require('node:child_process');
const {createInterface} = require('node:readline');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const root = fs.mkdtempSync(path.join(os.tmpdir(),'float-echo-verification-'));
fs.mkdirSync(root,{recursive:true});
function host() {
  const child=spawn(path.resolve(__dirname,'../resources/echoisland/fusion-host.exe'),[root],{windowsHide:true,stdio:'pipe'});
  let id=0; const pending=new Map();
  const reader=createInterface({input:child.stdout});
  reader.on('line',line=>{const msg=JSON.parse(line); const waiter=pending.get(msg.id);if(!waiter)return;pending.delete(msg.id);clearTimeout(waiter.timer);msg.error?waiter.reject(new Error(msg.error)):waiter.resolve(msg.result);});
  return {async call(method,params={}){return new Promise((resolve,reject)=>{const seq=++id;pending.set(seq,{resolve,reject,timer:setTimeout(()=>reject(new Error('timeout '+method)),10000)});child.stdin.write(JSON.stringify({id:seq,method,params})+'\n');});},
    async close(){await this.call('flush');child.stdin.end();await new Promise(resolve=>child.once('exit',resolve));reader.close();}};
}
function event(source,name,extra={}){return {event:{protocol_version:'1',hook_event_name:name,source,session_id:'same-raw-id',timestamp:new Date().toISOString(),cwd:root,...extra}};}
async function until(app,predicate){for(let n=0;n<50;n++){const value=await app.call('snapshot');if(predicate(value))return value;await new Promise(r=>setTimeout(r,50));}throw new Error('snapshot condition not met');}
(async()=>{
  let app=host();
  await app.call('event',event('codex','UserPromptSubmit',{message:'Synthetic verification only'}));
  await app.call('event',event('claude','UserPromptSubmit',{message:'Independent source'}));
  let snap=await app.call('snapshot');assert.equal(snap.sessions.length,2);assert.notEqual(snap.sessions[0].key,snap.sessions[1].key);
  const approval=app.call('event',event('claude','PermissionRequest',{tool_name:'shell',tool_input:{command:'echo test'}}));
  snap=await until(app,s=>s.pending_permissions.length===1);
  const requestId=snap.pending_permissions[0].request_id;
  await app.call('answer',{requestId,action:'approve'});const approved=await approval;
  await assert.rejects(app.call('answer',{requestId,action:'approve'}));
  const question=app.call('event',event('codex','AskUserQuestion',{question:{text:'Choose',options:[{label:'A'}]}}));
  snap=await until(app,s=>s.pending_questions.length===1);
  await app.call('answer',{requestId:snap.pending_questions[0].request_id,action:'answer',answer:'A'});const answered=await question;
  const disconnect=app.call('event',event('claude','PermissionRequest',{tool_name:'shell'}));
  await until(app,s=>s.pending_permissions.length===1);
  await app.call('disconnect',{source:'claude',sessionId:'same-raw-id'});await disconnect;
  await app.close();app=host();snap=await app.call('snapshot');
  assert(snap.sessions.every(s=>s.restored));assert.equal(snap.pending_permissions.length,0);assert.equal(snap.pending_questions.length,0);
  await app.close();
  const report={passed:true,checks:['source-isolation','blocking-approval','duplicate-answer-rejected','question-answer','peer-disconnect','restored-is-not-live'],approved,answered,profile:root};
  fs.writeFileSync(path.join(root,'echo-host-verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
})().catch(error=>{console.error(error);process.exit(1)});

