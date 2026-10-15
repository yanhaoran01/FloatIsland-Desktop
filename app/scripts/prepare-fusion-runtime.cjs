/* FusionIsland, derived from eIsland. Copyright (C) 2026 contributors. GPL-3.0. */
/** @file prepare-fusion-runtime.cjs
 * @description Prepare a physical runtime tree from the pinned upstream Windows release.
 * @author 鸡哥
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const asar = require('@electron/asar');

/** Copy the pinned runtime without npm junctions or an incomplete dependency collector. */
function prepareRuntime(upstreamResources, destination) {
  const archive = path.join(upstreamResources, 'app.asar');
  const upstream = JSON.parse(asar.extractFile(archive, 'package.json'));
  if (upstream.name !== 'eisland' || upstream.version !== '26.7.4') {
    throw new Error('The runtime must come from eIsland v26.7.4.');
  }
  const sourceRoot = path.resolve(__dirname, '..');
  const pkg = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'package.json')));
  fs.mkdirSync(destination, { recursive: true });
  const manifest = [];
  for (const entry of asar.listPackage(archive)) {
    const relative = entry.replaceAll('\\', '/').replace(/^\//, '');
    if (!relative.startsWith('node_modules/')) continue;
    const info = asar.statFile(archive, path.normalize(relative));
    if (info.files) continue;
    if (info.link) throw new Error(`Unexpected upstream link: ${relative}`);
    const target = path.resolve(destination, relative);
    if (!target.startsWith(path.resolve(destination) + path.sep)) throw new Error('Unsafe archive entry');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const content = asar.extractFile(archive, path.normalize(relative));
    fs.writeFileSync(target, content);
    if (/\.(dll|node|exe)$/i.test(relative)) {
      manifest.push({file:relative,bytes:content.length,sha256:crypto.createHash('sha256').update(content).digest('hex')});
    }
  }
  // The JavaScript native bindings must match the pinned source (line endings excluded).
  for (const name of Object.keys(pkg.dependencies).filter(name => name.startsWith('@eisland/'))) {
    const local = path.resolve(sourceRoot, pkg.dependencies[name].slice(5));
    for (const file of ['index.js', 'ffi-loader.js']) {
      const origin = path.join(local, file);
      if (!fs.existsSync(origin)) continue;
      const normalized = p => fs.readFileSync(p, 'utf8').replaceAll('\r', '');
      if (normalized(origin) !== normalized(path.join(destination, 'node_modules', name, file))) {
        throw new Error(`Native binding differs from pinned source: ${name}/${file}`);
      }
    }
  }
  // FFmpeg was a build dependency upstream; the FusionIsland main process loads it at runtime.
  fs.cpSync(path.join(sourceRoot, 'node_modules/ffmpeg-static'), path.join(destination, 'node_modules/ffmpeg-static'), {recursive:true,dereference:true});
  fs.writeFileSync(path.join(destination, 'runtime-provenance.json'), JSON.stringify({upstream:'eIsland v26.7.4',archiveSha256:crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex'),nativeFiles:manifest},null,2));
  return manifest;
}
module.exports = { prepareRuntime };
if (require.main === module) {
  const [upstream, destination] = process.argv.slice(2);
  if (!upstream || !destination) throw new Error('Usage: node scripts/prepare-fusion-runtime.cjs <upstream resources> <destination>');
  console.log(JSON.stringify({nativeFiles:prepareRuntime(upstream,destination).length}));
}
