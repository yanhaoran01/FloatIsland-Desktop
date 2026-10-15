/* FusionIsland. Copyright (C) 2026 contributors. GPL-3.0. */
/** @file verify-packaged-runtime.cjs
 * @description Load packaged dependencies with the shipped Electron runtime; fail on missing transitive/native files.
 * @author 鸡哥
 */
const fs = require('node:fs');
const path = require('node:path');
const { createRequire, builtinModules } = require('node:module');
const [archive, output] = process.argv.slice(2);
if (!archive || !output) throw new Error('Usage: <archive> <output JSON>');
const load = createRequire(path.join(archive, 'package.json'));
const names = new Set();
for (const entry of fs.readdirSync(path.join(archive, 'out/main'), { recursive: true })) {
  if (!entry.endsWith('.js')) continue;
  const code = fs.readFileSync(path.join(archive, 'out/main', entry), 'utf8');
  for (const match of code.matchAll(/require\(["']([^"']+)["']\)/g)) {
    const name = match[1];
    if (!name.startsWith('.') && !name.startsWith('node:') && name !== 'electron' && !builtinModules.includes(name)) names.add(name);
  }
}
const results = [];
for(const name of ['@mozilla/readability','rss-parser','fuse.js','dompurify'])names.add(name);
if (names.size < 8) throw new Error('Runtime dependency scan did not find the application bundle.');
for (const name of names) {
  try { load(name); results.push({name,loaded:true}); }
  catch(error) { results.push({name,loaded:false,error:error.stack}); }
}
try { const core=load.resolve('@mozilla/readability/Readability.js');if(!fs.readFileSync(core,'utf8').includes('Readability'))throw Error('missing-reader-core');results.push({name:'Readability local extraction core',loaded:true}); }
catch(error){results.push({name:'Readability local extraction core',loaded:false,error:error.stack});}
// Actually open the get-windows addon too: its exported functions load the binary lazily.
try { load('get-windows').openWindowsSync(); results.push({name:'get-windows native query',loaded:true}); }
catch(error) { results.push({name:'get-windows native query',loaded:false,error:error.stack}); }
try { const hook=load('uiohook-napi').uIOhook;if(typeof hook.start!=='function'||typeof hook.stop!=='function')throw Error('invalid-hook-addon');results.push({name:'uiohook addon exports',loaded:true}); }
catch(error){results.push({name:'uiohook addon exports',loaded:false,error:error.stack});}
const result = {electron:process.versions.electron,node:process.versions.node,passed:results.every(x=>x.loaded),results};
fs.writeFileSync(output,JSON.stringify(result,null,2));
process.exit(result.passed ? 0 : 1);
