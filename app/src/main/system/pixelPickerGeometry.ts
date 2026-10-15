/* FloatIsland - GPL-3.0. */
/** @file pixelPickerGeometry.ts @description Validated DIP-to-bitmap sampling, including mixed display scaling. @author 鸡哥 */
export function sampledHex(pixels: Uint8Array, size: { width: number; height: number }, viewport: { width: number; height: number }, x: number, y: number): string {
  if (![size.width,size.height,viewport.width,viewport.height,x,y].every(Number.isFinite) || size.width < 1 || size.height < 1 || viewport.width < 1 || viewport.height < 1 || x < 0 || y < 0 || x >= viewport.width || y >= viewport.height || pixels.length !== size.width * size.height * 4) throw Error('invalid-color-position');
  const px = Math.min(size.width - 1, Math.floor(x / viewport.width * size.width));
  const py = Math.min(size.height - 1, Math.floor(y / viewport.height * size.height));
  const at = (py * size.width + px) * 4;
  // Electron NativeImage uses BGRA on Windows.
  const rgb = process.platform === 'win32' ? [pixels[at+2],pixels[at+1],pixels[at]] : [pixels[at],pixels[at+1],pixels[at+2]];
  return '#' + rgb.map(v => v.toString(16).padStart(2,'0')).join('');
}
