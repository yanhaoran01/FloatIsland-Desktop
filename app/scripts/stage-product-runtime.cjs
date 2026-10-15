/* FusionIsland GPL-3.0. @file stage-product-runtime.cjs @description Physical version-matched runtime dependencies. @author 鸡哥 */
const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const app=path.resolve(__dirname,'..'),base=path.dirname(app),stage=path.resolve(process.env.FUSION_BUILD_DIR||path.join(base,'packaging-runtime-1.3.0-fixed')),old=path.resolve(process.env.FUSION_RUNTIME_SEED||path.join(base,'packaging-runtime'));
fs.mkdirSync(stage,{recursive:true});
if(!fs.existsSync(path.join(stage,'runtime-provenance.json'))){
 if(process.env.FUSION_UPSTREAM_RESOURCES) require('./prepare-fusion-runtime.cjs').prepareRuntime(process.env.FUSION_UPSTREAM_RESOURCES,stage);
 else {
  if(!fs.existsSync(path.join(old,'runtime-provenance.json')))throw Error('Set FUSION_UPSTREAM_RESOURCES to eIsland v26.7.4 resources, or FUSION_RUNTIME_SEED to a verified runtime.');
  fs.cpSync(path.join(old,'node_modules'),path.join(stage,'node_modules'),{recursive:true,dereference:true});
  fs.copyFileSync(path.join(old,'runtime-provenance.json'),path.join(stage,'runtime-provenance.json'));
 }
}
const roots=Object.keys(JSON.parse(fs.readFileSync(path.join(app,'package.json'))).dependencies).filter(name=>!name.startsWith('@eisland/')),seen=new Set(),sources=new Set();
function locate(name,from){const load=createRequire(path.join(from,'package.json'));for(const base of load.resolve.paths(name)||[]){const folder=path.join(base,name),manifest=path.join(folder,'package.json');if(fs.existsSync(manifest))return fs.realpathSync(folder);}throw Error('Package root missing: '+name);}

function copy(name,from){
 if(require('node:module').isBuiltin(name))return;
 const source=locate(name,from),pkg=JSON.parse(fs.readFileSync(path.join(source,'package.json'))),key=name+'@'+pkg.version;
 if(sources.has(source))return;sources.add(source);
 const relative=path.relative(path.join(app,'node_modules'),source);
 if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('Dependency outside node_modules: '+name);
 const dest=path.join(stage,'node_modules',relative);fs.mkdirSync(path.dirname(dest),{recursive:true});if(fs.existsSync(dest)){const absolute=path.resolve(dest),baseModules=path.resolve(stage,'node_modules');if(!absolute.startsWith(baseModules+path.sep))throw Error('Unsafe runtime package path');const backup=path.join(stage,'replaced-packages',relative);fs.mkdirSync(path.dirname(backup),{recursive:true});if(fs.existsSync(backup))fs.renameSync(backup,backup+'-'+Date.now());fs.renameSync(absolute,backup);}fs.cpSync(source,dest,{recursive:true,dereference:true});
 seen.add(key);
 for(const dependency of Object.keys(pkg.dependencies||{}))copy(dependency,source);
 for(const dependency of Object.keys(pkg.optionalDependencies||{})){try{copy(dependency,source);}catch(error){console.log('Optional dependency unavailable: '+dependency+': '+error.message);}}
}
for(const name of roots)copy(name,app);
fs.copyFileSync(path.join(app,'package.json'),path.join(stage,'package.json'));
fs.writeFileSync(path.join(stage,'product-runtime.json'),JSON.stringify({version:JSON.parse(fs.readFileSync(path.join(app,'package.json'))).version,packages:[...seen].sort()},null,2));
const load=createRequire(path.join(stage,'package.json'));for(const name of ['cheerio','mammoth','docx-preview','node-forge','jsonpath-plus','xlsx','mailparser','imapflow'])load(name);
console.log(JSON.stringify({stage,packages:seen.size,dependencyLoad:'passed'}));
