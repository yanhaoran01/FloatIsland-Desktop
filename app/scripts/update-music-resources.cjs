/* FloatIsland contributors, GPL-3.0. */
/** @file update-music-resources.cjs @description Maintains source hashes, license notices and bilingual music labels. @author 鸡哥 */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),directory=path.join(root,'resources/music');
const files=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);
const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'));
manifest.sources=manifest.sources.filter(s=>s.project!=='lyswhut/lx-music-desktop');
manifest.sources.push({project:'lyswhut/lx-music-desktop',version:'2026-09-19',commit:'ad95d5091c9ed689fa72b5e5c849df65f5a679ce',license:'Apache-2.0',files:[]});
for(const source of manifest.sources){const dir=source.project.startsWith('listen1/')?'listen1':source.project.startsWith('qier222/')?'yesplaymusic':'lx';source.files=files(path.join(directory,dir)).map(file=>({path:path.relative(directory,file).replaceAll('\\','/'),sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}));}
manifest.dependency={'node-forge':'1.4.0','crypto-js':'4.2.0',cheerio:'1.2.0'};
fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const labels={
  en:{title:'Music sources',all:'All sources',builtin:'Built in',importFile:'Import source file',importLink:'Import source link',address:'HTTPS source or subscription URL',enable:'Enable {{name}}',search:'Search',playback:'Full playback',lyrics:'Lyrics',unknown:'Unverified',passed:'Verified',failed:'Unavailable',detect:'Check source',update:'Update',rollback:'Restore previous version',delete:'Remove source',partial:'{{count}} sources failed',choose:'Choose another source'},
  zh:{title:'音源管理',all:'全部音源',builtin:'内置',importFile:'导入音源文件',importLink:'导入音源链接',address:'HTTPS 音源或订阅地址',enable:'启用 {{name}}',search:'搜索',playback:'完整播放',lyrics:'歌词',unknown:'未验证',passed:'已验证',failed:'不可用',detect:'检测音源',update:'更新',rollback:'恢复上一版本',delete:'移除音源',partial:'{{count}} 个音源未响应',choose:'选择其他音源'}
};
const errors={
 'music-no-enabled-source':['No enabled music source. Open music sources to enable or import one.','暂无启用音源，请在音源管理中启用或导入。'],
 'music-source-missing':['Music source was removed.','音源已移除。'],
 'music-plugin-invalid':['Invalid source file or manifest.','音源文件或清单无效。'],
 'music-plugin-version':['This plugin protocol version is unsupported.','不支持此插件协议版本。'],
 'music-plugin-timeout':['Music source timed out and was stopped.','音源超时，已停止。'],
 'music-plugin-host-crashed':['Music source stopped unexpectedly. Retry or change source.','音源运行异常，请重试或更换。'],
 'music-plugin-unsupported-capability':['This source does not provide this feature.','此音源未提供这项能力。'],
 'music-plugin-private-network':['The source requested an internal network address.','音源请求了不支持的内网地址。'],
 'music-plugin-direct-network':['This plugin needs an unsupported network API.','此插件使用了不支持的网络接口。'],
 'music-plugin-request-denied':['The source request exceeded supported limits.','音源请求超出支持范围。'],
 'music-plugin-https-required':['Import sources using an HTTPS link.','请使用 HTTPS 音源链接。'],
 'music-plugin-permission':['The plugin has not declared this network permission.','插件未声明所需网络权限。'],
 'music-plugin-cursor':['Search this source in page order.','请按顺序翻页搜索此音源。'],
 'music-source-no-backup':['No previous source version is saved.','没有可恢复的旧音源版本。'],
 'music-source-not-updatable':['Re-import this source file to update it.','请重新导入文件更新此音源。'],
 'music-source-builtin':['Built-in sources can be disabled.','内置音源可以停用。'],
 'music-response-too-large':['The source response is too large.','音源响应过大。']
};
for(const lang of ['en-US','zh-CN']){const file=path.join(root,'i18n',lang+'.json'),data=JSON.parse(fs.readFileSync(file,'utf8'));Object.assign(data.fusion.product.tabs,{csv:'CSV',text:lang==='zh-CN'?'文本':'Text',regex:lang==='zh-CN'?'正则':'Regex'});fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');}
for(const [lang,key] of [['en-US','en'],['zh-CN','zh']]){const file=path.join(root,'i18n',lang+'.json'),data=JSON.parse(fs.readFileSync(file,'utf8'));data.fusion.music.sources=labels[key];Object.assign(data.fusion.music.provider,{kuwo:key==='zh'?'酷我':'Kuwo',kugou:key==='zh'?'酷狗':'Kugou',qianqian:key==='zh'?'千千':'Qianqian'});data.fusion.toolbox.items.encoding=key==='zh'?'编码工具':'Encoding';data.fusion.toolbox.descriptions.encoding=key==='zh'?'JSON、Base64 与 URL 编解码':'JSON, Base64 and URL encoding';Object.assign(data.fusion.product.tabs,{json:'JSON',base64:'Base64',url:'URL',countdown:key==='zh'?'倒计时':'Countdown',stopwatch:key==='zh'?'秒表':'Stopwatch'});for(const [code,value]of Object.entries(errors))data.fusion.toolbox.errors[code]=value[key==='zh'?1:0];fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');}
