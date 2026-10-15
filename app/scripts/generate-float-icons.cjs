/* FloatIsland - Copyright (C) 2026 contributors. GPL-3.0. */
/** @file generate-float-icons.cjs @description Reproduce the original floating-capsule mark, Windows ICO and themed tray icons. @author 鸡哥 */
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const dest = path.join(root, 'resources/icon');
const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
// A floating capsule that is also the companion: slanted eyes look up-right, a soft shadow marks the hover.
const body = fill => `<g transform="rotate(-8 128 124)"><rect x="38" y="80" width="180" height="90" rx="45" fill="${fill}"/></g>`;
const eyes = fill => `<g transform="rotate(-8 128 124)"><rect x="140" y="102" width="13" height="32" rx="6.5" transform="rotate(-14 146.5 118)" fill="${fill}"/><rect x="170" y="102" width="13" height="32" rx="6.5" transform="rotate(-14 176.5 118)" fill="${fill}"/></g>`;
const master = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 256 256"><defs><linearGradient id="tile" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#2c2f38"/><stop offset="1" stop-color="#121317"/></linearGradient><linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ffffff" stop-opacity=".09"/><stop offset=".5" stop-color="#ffffff" stop-opacity="0"/></linearGradient><linearGradient id="island" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ffffff"/><stop offset="1" stop-color="#d8dce5"/></linearGradient><radialGradient id="shade"><stop stop-color="#000000" stop-opacity=".6"/><stop offset="1" stop-color="#000000" stop-opacity="0"/></radialGradient></defs><rect x="8" y="8" width="240" height="240" rx="58" fill="url(#tile)"/><rect x="8" y="8" width="240" height="240" rx="58" fill="url(#sheen)"/><rect x="8.5" y="8.5" width="239" height="239" rx="57.5" fill="none" stroke="#ffffff" stroke-opacity=".08"/><ellipse cx="128" cy="198" rx="64" ry="9" fill="url(#shade)"/>${body('url(#island)')}${eyes('#1c1f27')}</svg>`;
if (!process.versions.electron) {
 fs.mkdirSync(dest, {recursive: true});
 fs.writeFileSync(path.join(dest, 'float-island.svg'), master);
 fs.copyFileSync(path.join(dest, 'float-island.svg'), path.join(root, 'src/renderer/assets/float-island.svg'));
 for (const [name, color] of [['light', '#f1f3f8'], ['dark', '#252938']]) {
  const mark = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 256 256"><defs><mask id="m"><rect width="256" height="256" fill="white"/>${eyes('black')}</mask></defs><g mask="url(#m)" transform="translate(0 6)">${body(color)}</g></svg>`;
  fs.writeFileSync(path.join(dest, `float-tray-${name}.svg`), mark);
 }
 const env = {...process.env}; delete env.ELECTRON_RUN_AS_NODE;
 const result = spawnSync(require('electron'), [__filename, '--render'], {env, stdio: 'inherit', windowsHide: true, timeout: 60000});
 if (result.error) throw result.error;
 process.exitCode = result.status ?? 1;
} else {
 const {app, BrowserWindow} = require('electron');
 app.disableHardwareAcceleration();
 app.whenReady().then(async () => {
  const window = new BrowserWindow({width: 1024, height: 1024, show: false, transparent: true, backgroundColor: '#00000000', webPreferences: {nodeIntegration: false, contextIsolation: true, backgroundThrottling: false}});
  for (const name of ['float-island', 'float-tray-light', 'float-tray-dark']) {
   const svg = fs.readFileSync(path.join(dest, `${name}.svg`), 'utf8');
   await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<style>html,body{margin:0;width:1024px;height:1024px;background:transparent;overflow:hidden}</style>' + svg));
   await window.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
   const image = await window.webContents.capturePage();
   if (image.isEmpty()) throw new Error(`Empty rendered icon: ${name}`);
   fs.writeFileSync(path.join(dest, `${name}.png`), image.resize({width: name === 'float-island' ? 256 : 32, height: name === 'float-island' ? 256 : 32, quality: 'best'}).toPNG());
   if (name === 'float-island') {
    fs.writeFileSync(path.join(dest, `${name}-1024.png`), image.resize({width: 1024, height: 1024, quality: 'best'}).toPNG());
    const pngs = sizes.map(size => {
     const png = image.resize({width: size, height: size, quality: 'best'}).toPNG();
     fs.writeFileSync(path.join(dest, `${name}-${size}.png`), png);
     return png;
    });
    const header = Buffer.alloc(6 + sizes.length * 16);
    header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
    let offset = header.length;
    sizes.forEach((size, i) => {
     const at = 6 + i * 16; header[at] = size === 256 ? 0 : size; header[at + 1] = header[at];
     header.writeUInt16LE(1, at + 4); header.writeUInt16LE(32, at + 6);
     header.writeUInt32LE(pngs[i].length, at + 8); header.writeUInt32LE(offset, at + 12); offset += pngs[i].length;
    });
    fs.writeFileSync(path.join(dest, `${name}.ico`), Buffer.concat([header, ...pngs]));
   }
  }
  window.destroy(); console.log('FloatIsland SVG, native PNG sizes, ICO and themed tray icons generated.'); app.quit();
 }).catch(error => {console.error(error); app.exit(1);});
}
