/* FloatIsland - https://github.com/yanhaoran01/FloatIsland
 * Copyright (C) 2026 contributors. GPL-3.0. */
/** @file release-workflow.cjs @description One source identity for build, runtime, checks and packaging. @author 鸡哥 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawnSync, spawn} = require('node:child_process');
const app = path.resolve(__dirname, '..');
const delivery = path.resolve(process.env.FUSION_OUTPUT_DIR || path.join(app, '.fusion-build', 'release'));
const stage = path.resolve(process.env.FUSION_BUILD_DIR || path.join(delivery, 'runtime'));
const evidence = path.join(delivery, 'evidence');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const excluded = new Set(['node_modules', 'target', 'out', 'dist', 'bin', 'obj', '.git', 'coverage', '__pycache__']);
function files(root, filter = () => true) {
  const rows = [];
  function walk(folder) {
    for (const entry of fs.readdirSync(folder, {withFileTypes:true})) {
      if (entry.isSymbolicLink() || excluded.has(entry.name)) continue;
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (filter(file)) rows.push({file:path.relative(root, file).replaceAll('\\','/'),sha256:hash(fs.readFileSync(file))});
    }
  }
  walk(root); return rows.sort((a,b) => a.file.localeCompare(b.file, 'en'));
}
function sourceIdentity() {
  const roots = new Set(['src','i18n','resources','scripts','plugins','native','vendor','assets','sdk','web']);
  const rows = [];
  for (const entry of fs.readdirSync(app,{withFileTypes:true})) {
    if (entry.isDirectory() && roots.has(entry.name)) rows.push(...files(path.join(app,entry.name)).map(row=>({...row,file:entry.name+'/'+row.file})));
    else if (entry.isFile() && /\.(json|ts)$/.test(entry.name) && !entry.name.endsWith('.tsbuildinfo')) rows.push({file:entry.name,sha256:hash(fs.readFileSync(path.join(app,entry.name)))});
  }
  const vendorRoot=path.join(app,'..','vendor','EchoIsland');
  if(fs.existsSync(vendorRoot))rows.push(...files(vendorRoot,file=>/\.(rs|toml|lock)$/.test(file)).map(row=>({...row,file:'../vendor/EchoIsland/'+row.file})));
  const sidecarScript=path.join(app,'..','scripts','build-echoisland-sidecar.ps1');
  if(fs.existsSync(sidecarScript))rows.push({file:'../scripts/build-echoisland-sidecar.ps1',sha256:hash(fs.readFileSync(sidecarScript))});
  rows.sort((a,b)=>a.file.localeCompare(b.file,'en'));
  return {sourceDigest:hash(JSON.stringify(rows)),lockDigest:hash(fs.readFileSync(path.join(app,'package-lock.json'))),files:rows};
}
function run(executable, args, label) {
  const log = fs.openSync(path.join(evidence,label+'.log'),'w');
  const result = spawnSync(executable,args,{cwd:app,env:{...process.env,FUSION_BUILD_DIR:stage,FUSION_OUTPUT_DIR:delivery},stdio:['ignore',log,log],windowsHide:true});
  fs.closeSync(log);
  if (result.error || result.status !== 0) throw Error(label+' failed: '+(result.error || result.status));
}
function verify() {
  const identity = JSON.parse(fs.readFileSync(path.join(app,'out','build-identity.json')));
  if (identity.sourceDigest !== sourceIdentity().sourceDigest) throw Error('Source changed after build; rebuild before acceptance.');
  const rows = files(path.join(app,'out'),file=>!file.endsWith('build-identity.json'));
  if (hash(JSON.stringify(rows)) !== identity.compiledDigest) throw Error('Compiled output changed after build.');
  return identity;
}
function verifyRuntime() {
  const identity = verify();
  const rows = files(path.join(stage,'out'),file=>!file.endsWith('build-identity.json'));
  if (hash(JSON.stringify(rows)) !== identity.compiledDigest) throw Error('Runtime does not match current build.');
  const runtime = JSON.parse(fs.readFileSync(path.join(stage,'out','build-identity.json')));
  if (runtime.buildId !== identity.buildId) throw Error('Runtime identity mismatch.');
  return identity;
}
fs.mkdirSync(evidence,{recursive:true});
const command = process.argv[2] || 'build';
try {
  if (command === 'checks') {
    const before=sourceIdentity();
    for (const project of ['node','web']) run(process.execPath,[path.join(app,'node_modules/typescript/bin/tsc'),'--noEmit','-p','tsconfig.'+project+'.json'],'types-'+project);
    run(process.execPath,['--experimental-strip-types',path.join(__dirname,'check-i18n-completeness.ts')],'i18n');
    if(before.sourceDigest!==sourceIdentity().sourceDigest)throw Error('Source changed during checks.');
    fs.writeFileSync(path.join(evidence,'checks-identity.json'),JSON.stringify(before,null,2));
  } else if (command === 'build') {
    const before=sourceIdentity();
    run(process.execPath,[path.join(app,'node_modules/electron-vite/bin/electron-vite.js'),'build'],'build');
    if(before.sourceDigest!==sourceIdentity().sourceDigest)throw Error('Source changed during build.');
    const compiledDigest=hash(JSON.stringify(files(path.join(app,'out'),file=>!file.endsWith('build-identity.json'))));
    const identity={version:1,buildId:before.sourceDigest.slice(0,16)+'-'+compiledDigest.slice(0,16),sourceDigest:before.sourceDigest,lockDigest:before.lockDigest,compiledDigest,builtAt:new Date().toISOString()};
    fs.writeFileSync(path.join(app,'out','build-identity.json'),JSON.stringify(identity,null,2));
    fs.writeFileSync(path.join(evidence,'source-manifest.json'),JSON.stringify(before,null,2));
    fs.writeFileSync(path.join(evidence,'build-identity.json'),JSON.stringify(identity,null,2));
  } else if (command === 'stage') {
    verify();run(process.execPath,[path.join(__dirname,'stage-product-runtime.cjs')],'stage');
    if(fs.existsSync(path.join(stage,'out'))){const target=path.resolve(stage,'out');if(path.dirname(target)!==stage)throw Error('Unsafe stage output');fs.renameSync(target,path.join(stage,'previous-out-'+Date.now()));}
    fs.cpSync(path.join(app,'out'),path.join(stage,'out'),{recursive:true});
    verifyRuntime();
  } else if (command === 'verify') {
    const identity=verifyRuntime();fs.writeFileSync(path.join(evidence,'runtime-identity.json'),JSON.stringify({identity,executable:path.join(app,'node_modules/electron/dist/electron.exe'),runtime:stage},null,2));
  } else if (command === 'launch') {
    const identity=verifyRuntime(),profile=path.join(delivery,'qa-profile');
    const executable=path.join(app,'node_modules/electron/dist/electron.exe');
    const environment={...process.env};delete environment.ELECTRON_RUN_AS_NODE;
    const child=spawn(executable,[stage,'--user-data-dir='+profile,'--remote-debugging-port=9584','--inspect=127.0.0.1:9585'],{cwd:app,env:environment,windowsHide:true,detached:true,stdio:['ignore',fs.openSync(path.join(evidence,'native-stdout.log'),'a'),fs.openSync(path.join(evidence,'native-stderr.log'),'a')]});
    child.unref();fs.writeFileSync(path.join(evidence,'native-session.json'),JSON.stringify({pid:child.pid,executable,runtime:stage,profile,identity},null,2));
  } else if (command === 'package') {
    const identity=verifyRuntime();const checks=JSON.parse(fs.readFileSync(path.join(evidence,'checks-identity.json')));
    if(checks.sourceDigest!==identity.sourceDigest)throw Error('Checks are not for this build.');
    run(process.execPath,[path.join(__dirname,'package-fusion.cjs'),...process.argv.slice(3)],'package');
    verifyRuntime();
  } else throw Error('Unknown command: '+command);
  console.log(JSON.stringify({command,delivery,stage,ok:true}));
} catch(error) {console.error(error);process.exitCode=1;}
