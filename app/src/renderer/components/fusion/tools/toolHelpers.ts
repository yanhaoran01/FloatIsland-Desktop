/* FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 FusionIsland contributors. GPL-3.0. */
/** @file toolHelpers.ts @description 文本、日期、颜色和密码的离线纯函数。 @author 鸡哥 */
/** 处理普通文本，不把输入当作正则或代码。
 * @param text - 原始文本。
 * @param action - 处理操作。
 * @param find - 普通查找文本。
 * @param replacement - 替换文本。
 * @returns 处理结果。
 */
export function transformText(text: string, action: string, find = '', replacement = ''): string {
  if (action === 'dedupe') return [...new Set(text.split(/\r?\n/))].join('\n');
  if (action === 'trim') return text.split(/\r?\n/).map(line=>line.trim()).join('\n');
  if (action === 'sort') return text.split(/\r?\n/).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).join('\n');
  if (action === 'reverse') return text.split(/\r?\n/).reverse().join('\n');
  if (action === 'empty') return text.split(/\r?\n/).filter(line => line.trim()).join('\n');
  if (action === 'upper') return text.toUpperCase();
  if (action === 'lower') return text.toLowerCase();
  if (action === 'replace') return find ? text.split(find).join(replacement) : text;
  return text;
}
/** 解析明确的公历日期，避免夏令时改变天数。
 * @param value - YYYY-MM-DD 日期。
 * @returns UTC 毫秒。
 */
export function dateMilliseconds(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('invalid-date');
  const time = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) throw new Error('invalid-date');
  return time;
}
/** 转换颜色为可复制的三种格式。
 * @param value - 三位或六位 HEX 色值。
 * @returns HEX、RGB、HSL。
 */
export function colorFormats(value: string): { hex: string; rgb: string; hsl: string } {
  value = value.trim();
  const rgbInput = value.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
  const hslInput = value.match(/^hsl\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%\s*\)$/i);
  if (rgbInput) {
    const parts = rgbInput.slice(1).map(Number);
    if (parts.some(part => part > 255)) throw new Error('invalid-color');
    value = '#' + parts.map(part => part.toString(16).padStart(2, '0')).join('');
  } else if (hslInput) {
    const [angle, saturation, lightness] = hslInput.slice(1).map(Number);
    if (saturation > 100 || lightness > 100) throw new Error('invalid-color');
    const hue = ((angle % 360) + 360) % 360 / 60;
    const chroma = (1 - Math.abs(2 * lightness / 100 - 1)) * saturation / 100;
    const second = chroma * (1 - Math.abs(hue % 2 - 1));
    const base = lightness / 100 - chroma / 2;
    const parts = hue < 1 ? [chroma, second, 0] : hue < 2 ? [second, chroma, 0] : hue < 3 ? [0, chroma, second] : hue < 4 ? [0, second, chroma] : hue < 5 ? [second, 0, chroma] : [chroma, 0, second];
    value = '#' + parts.map(part => Math.round((part + base) * 255).toString(16).padStart(2, '0')).join('');
  }
  if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) throw new Error('invalid-color');
  const hex = (value.length === 4 ? `#${value.slice(1).split('').map(char => char + char).join('')}` : value).toLowerCase();
  const values = [1, 3, 5].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16));
  const [r, g, b] = values.map(component => component / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const difference = max - min;
  const lightness = (max + min) / 2;
  let hue = 0;
  if (difference) {
    if (max === r) hue = ((g - b) / difference) % 6;
    else if (max === g) hue = (b - r) / difference + 2;
    else hue = (r - g) / difference + 4;
  }
  const saturation = difference ? difference / (1 - Math.abs(2 * lightness - 1)) : 0;
  return { hex, rgb: `rgb(${values.join(', ')})`, hsl: `hsl(${Math.round((hue * 60 + 360) % 360)}, ${Math.round(saturation * 100)}%, ${Math.round(lightness * 100)}%)` };
}
/** 使用拒绝采样选择密码字符，确保勾选类别均出现。
 * @param length - 4 到 128 的密码长度。
 * @param categories - 至少一个非空字符类别。
 * @returns 不持久化的随机密码。
 */
export function generatePassword(length: number, categories: string[]): string {
  if (!Number.isInteger(length) || length < 4 || length > 128 || !categories.length || categories.length > length || categories.join('').length > 256 || categories.some(group => !group.length)) throw new Error('invalid-password-options');
  const random = (limit: number): number => {
    const ceiling = Math.floor(256 / limit) * limit;
    let value = 255;
    while (value >= ceiling) value = crypto.getRandomValues(new Uint8Array(1))[0];
    return value % limit;
  };
  const alphabet = categories.join('');
  const result = categories.map(group => group[random(group.length)]);
  while (result.length < length) result.push(alphabet[random(alphabet.length)]);
  for (let index = result.length - 1; index > 0; index--) { const other = random(index + 1); [result[index], result[other]] = [result[other], result[index]]; }
  return result.join('');
}
/** 下载应用生成的文件。
 * @param name - 建议文件名。
 * @param data - 导出数据。
 * @param mime - MIME 类型。
 */
export function downloadToolFile(name: string, data: BlobPart, mime = 'text/plain'): void {
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
