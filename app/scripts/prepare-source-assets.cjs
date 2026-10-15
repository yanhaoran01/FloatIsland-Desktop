/* FloatIsland, derived from eIsland. Copyright (C) 2026 contributors. GPL-3.0. */
/** @file prepare-source-assets.cjs
 * @description Restore pinned audio build assets omitted from the source-only repository.
 * @author 鸡哥
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const asar = require('@electron/asar');

const app = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(app, 'resources/source-assets.json'), 'utf8'));
const archive = process.argv[2];
if (!archive) throw new Error('Usage: node scripts/prepare-source-assets.cjs <upstream-resources/app.asar> [--check]');
const check = process.argv.includes('--check');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
let verified = 0;
for (const item of manifest.files) {
  if (!item.path.startsWith('src/renderer/public/audio/') || item.path.includes('..') || path.isAbsolute(item.path)) {
    throw new Error('Unsafe audio asset path');
  }
  const target = path.resolve(app, item.path);
  if (!target.startsWith(app + path.sep)) throw new Error('Asset outside project');
  if (fs.existsSync(target) && hash(fs.readFileSync(target)) === item.sha256) {
    verified++;
    continue;
  }
  const data = asar.extractFile(path.resolve(archive), path.normalize(item.archivePath));
  if (data.length !== item.bytes || hash(data) !== item.sha256) throw new Error('Audio asset checksum mismatch: ' + item.path);
  if (!check) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
  }
  verified++;
}
console.log(JSON.stringify({ verified, restored: !check }));
