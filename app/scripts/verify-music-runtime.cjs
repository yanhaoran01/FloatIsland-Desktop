/* FloatIsland - https://github.com/yanhaoran01/FloatIsland
 * Copyright (C) 2026 contributors. GPL-3.0. */
/** @file verify-music-runtime.cjs @description Verify pinned source and license resources in the actual distributable. @author 鸡哥 */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
module.exports=function verifyMusicRuntime(directory){
 const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8')),files=[];
 if(manifest.version!==1||manifest.sources.length!==3||!manifest.sources.some(s=>s.project==='lyswhut/lx-music-desktop'&&s.commit==='ad95d5091c9ed689fa72b5e5c849df65f5a679ce'))throw Error('invalid-music-manifest');
 for(const project of manifest.sources)for(const entry of project.files){
  const file=path.resolve(directory,entry.path);
  if(!file.startsWith(path.resolve(directory)+path.sep))throw Error('invalid-music-manifest-path');
  const hash=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if(hash!==entry.sha256)throw Error('music-vendor-hash-mismatch: '+entry.path);
  files.push({file:entry.path,sha256:hash});
 }
 return {passed:true,sources:manifest.sources.map(({project,commit,version,license})=>({project,commit,version,license})),files};
};
