/* FusionIsland, derived from eIsland. Copyright (C) 2026 contributors. GPL-3.0. */
/** @file package-fusion.cjs
 * @description Build both Windows targets from the same current output and validated pinned runtime.
 * @author 鸡哥
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { build, Platform, Arch } = require('electron-builder');
const asar = require('@electron/asar');
const { prepareRuntime } = require('./prepare-fusion-runtime.cjs');
const app = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(app, 'package.json')));
const stage = path.resolve(process.env.FUSION_BUILD_DIR || path.join(app,'.fusion-build',pkg.version));
const upstream = process.env.FUSION_UPSTREAM_RESOURCES;
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
if (!fs.existsSync(path.join(stage, 'runtime-provenance.json'))) {
  if (!upstream) throw new Error('FUSION_UPSTREAM_RESOURCES must point to the pinned eIsland v26.7.4 resources directory.');
  prepareRuntime(upstream,stage);
}
fs.copyFileSync(path.join(app,'package.json'),path.join(stage,'package.json'));
const config = JSON.parse(fs.readFileSync(path.join(app,'electron-builder.json')));
config.electronVersion = require('electron/package.json').version;
config.electronDist = path.join(app,'node_modules/electron/dist');
config.beforeBuild = path.join(__dirname,'fusion-before-build.cjs');
config.directories = {buildResources:path.join(app,'resources'),output:path.resolve(process.env.FUSION_OUTPUT_DIR || path.join(stage,'package'))};
config.files = ['package.json',{from:path.join(app,'out'),to:'out',filter:['**/*','!.vite/**/*']},{from:'node_modules',to:'node_modules',filter:['**/*','!**/obj/**']}];
config.asarUnpack = ['node_modules/**/*.node','node_modules/**/*.dll','node_modules/**/*.exe','node_modules/@eisland/**/src/bin/Release/**/*','node_modules/koffi/**/*','node_modules/tesseract.js/**','node_modules/tesseract.js-core/**'];
config.extraResources = config.extraResources.map(item=>({...item,from:path.resolve(item.from.startsWith('node_modules/') ? stage : app,item.from)}));
config.extraResources.push({from:path.join(app,'resources/licenses/reading'),to:'licenses/reading'});
config.extraResources.push({from:path.join(app,'resources/licenses'),to:'licenses'});
config.extraResources.push({from:path.join(app,'resources/music'),to:'music'});

config.extraResources.push({from:path.join(stage,'runtime-provenance.json'),to:'runtime-provenance.json'});
config.win.icon = path.join(app,'resources/icon/float-island.ico');
config.nsis.installerIcon = config.win.icon;
config.nsis.uninstallerIcon = config.win.icon;
delete config.win.artifactName;
config.nsis.artifactName = '${productName}-${version}-Setup.${ext}';
config.portable = {artifactName:'${productName}-${version}-portable.${ext}'};
config.afterPack = async context => {
  const archive = path.join(context.appOutDir,'resources/app.asar');
  let checked = 0;
  function compare(directory,relative='') {
    for (const entry of fs.readdirSync(directory,{withFileTypes:true})) {
      if (entry.name === '.vite') continue;
      const rel = path.join(relative,entry.name);
      if(entry.isDirectory()) compare(path.join(directory,entry.name),rel);
      else {
        if(hash(fs.readFileSync(path.join(directory,entry.name)))!==hash(asar.extractFile(archive,path.join('out',rel)))) throw new Error(`Stale packaged output: ${rel}`);
        checked++;
      }
    }
  }
  compare(path.join(app,'out'));
  const output = path.join(stage,'packaged-runtime-check.json');
  const result = spawnSync(path.join(context.appOutDir,config.productName+'.exe'),[path.join(__dirname,'verify-packaged-runtime.cjs'),archive,output],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},windowsHide:true,timeout:60000});
  if(result.error || result.status!==0) throw new Error(`Packaged runtime failed: ${result.error || result.status}. See ${output}`);
  const report = JSON.parse(fs.readFileSync(output));
  const guiOutput=path.join(stage,'packaged-gui-check.json');
  const guiEnv={...process.env};delete guiEnv.ELECTRON_RUN_AS_NODE;
  const gui=spawnSync(process.execPath,[path.join(__dirname,'verify-packaged-gui.cjs'),path.join(context.appOutDir,config.productName+'.exe'),archive,guiOutput],{env:guiEnv,windowsHide:true,timeout:60000});
  if(gui.error||gui.status!==0)throw Error('GUI native runtime failed: '+(gui.error||gui.status)+'. See '+guiOutput);
  report.gui=JSON.parse(fs.readFileSync(guiOutput));
  report.media=require('./verify-media-runtime.cjs')(path.join(context.appOutDir,'resources/download-runtime'));
  report.music=require('./verify-music-runtime.cjs')(path.join(context.appOutDir,'resources/music'));
  report.compiledFilesMatch = checked;
  fs.writeFileSync(output,JSON.stringify(report,null,2));
};
// Save the exact configuration for auditing. The dedicated stage has no upstream builder config.
const configPath = path.join(stage,'fusion-builder.cjs');
const serializable = {...config};
delete serializable.afterPack;
fs.writeFileSync(configPath,'module.exports = '+JSON.stringify(serializable,null,2)+';\n');
const targets = process.argv.includes('--dir') ? ['dir'] : process.argv.includes('--nsis') ? ['nsis'] : process.argv.includes('--portable') ? ['portable'] : ['portable','nsis'];
const packaging = process.argv.includes('--verify-only')
  ? config.afterPack({appOutDir:path.join(config.directories.output,'win-unpacked')}).then(()=>[])
  : build({projectDir:stage,targets:Platform.WINDOWS.createTarget(targets,Arch.x64),config:{...serializable,extends:null,afterPack:config.afterPack},publish:'never'});
packaging
  .then(files=>console.log(JSON.stringify({artifacts:files,stage})))
  .catch(error=>{console.error(error);process.exitCode=1;});
