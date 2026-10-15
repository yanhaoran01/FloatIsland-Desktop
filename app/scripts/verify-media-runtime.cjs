/* FloatIsland. Copyright (C) 2026 contributors. GPL-3.0. */
/** @file verify-media-runtime.cjs @description Verify shipped media checksums and offline execution. @author 鸡哥 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');

module.exports = function verifyMediaRuntime(root) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  const files = [];
  for (const component of manifest.components) {
    for (const file of component.files) {
      if (path.basename(file.name) !== file.name) throw Error('Invalid runtime manifest path');
      const digest = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file.name))).digest('hex');
      if (digest !== file.sha256) throw Error('Media runtime checksum mismatch: ' + file.name);
      files.push({name: file.name, sha256: digest});
    }
  }
  const programs = [['yt-dlp.exe', '--version', '2026.08.19'], ['deno.exe', '--version', 'deno 2.9.7'],
    ['ffmpeg.exe', '-version', 'n9.0.2-23-g27b46f0fbc'], ['ffprobe.exe', '-version', 'n9.0.2-23-g27b46f0fbc']];
  const checks = programs.map(([name, flag, expected]) => {
    const result = spawnSync(path.join(root, name), [flag], {encoding: 'utf8', windowsHide: true, timeout: 30000});
    if (result.error || result.status !== 0 || !result.stdout.includes(expected)) throw Error('Bundled media program failed: ' + name);
    return {name, version: result.stdout.split(/\r?\n/)[0], passed: true};
  });
  return {passed: true, files, checks};
};
