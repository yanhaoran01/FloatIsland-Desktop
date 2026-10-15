/* FloatIsland - GPL-3.0. Screen overlay adapted from Caldis/electron-pixel-picker (MIT). */
/** @file fusionColorPicker.ts @description Bounded, isolated desktop sampling with owned cancellation. @author 鸡哥 */
import { app, BrowserWindow, ipcMain, screen, type NativeImage, type WebContents } from 'electron';
import { join } from 'node:path';
import { captureProductImage } from './productCapture';
import { isFusionView } from './fusionWindows';
import { PIXEL_PICKER_HTML } from './pixelPickerOverlay';
import { sampledHex } from './pixelPickerGeometry';

interface Overlay { window: BrowserWindow; image: NativeImage; }
interface Pick { owner: WebContents; host: BrowserWindow; visible: boolean; overlays: Map<WebContents, Overlay>; finish: (hex?: string, error?: Error) => void; }
let current: Pick | undefined;
let quitting = false;

/** Registers only trusted start/cancel and overlay-local initialization/selection commands. */
export function registerFusionColorPicker(): void {
  ipcMain.handle('fusion:color:pick', async (event, command: unknown) => {
    if (!isFusionView(event.sender)) throw Error('untrusted-view');
    if (command === 'cancel') { if (current?.owner === event.sender) current.finish(); return null; }
    if (command !== 'start') throw Error('invalid-command');
    if (current) throw Error('eyedropper-in-use');
    const host = BrowserWindow.fromWebContents(event.sender);
    if (!host) throw Error('window-unavailable');
    return new Promise<string | null>((resolve, reject) => {
      let finished = false;
      const overlays = new Map<WebContents, Overlay>();
      const visible = host.isVisible();
      const owner = event.sender;
      const finish = (hex?: string, error?: Error): void => {
        if (finished) return;
        finished = true; clearTimeout(timeout);
        owner.removeListener('destroyed', cancel); owner.removeListener('render-process-gone', cancel);
        host.removeListener('closed', cancel);
        screen.removeListener('display-removed', displayChanged); screen.removeListener('display-metrics-changed', displayChanged);
        if (current === pick) current = undefined;
        for (const { window } of overlays.values()) if (!window.isDestroyed()) window.destroy();
        overlays.clear();
        if (!quitting && visible && !host.isDestroyed() && !owner.isDestroyed()) { host.show(); host.focus(); }
        error ? reject(error) : resolve(hex || null);
      };
      const cancel = (): void => finish();
      const displayChanged = (): void => finish(undefined, Error('eyedropper-display-changed'));
      const timeout = setTimeout(() => finish(undefined, Error('eyedropper-timeout')), 120000);
      const pick: Pick = { owner, host, visible, overlays, finish }; current = pick;
      owner.once('destroyed', cancel); owner.once('render-process-gone', cancel); host.once('closed', cancel);
      screen.on('display-removed', displayChanged); screen.on('display-metrics-changed', displayChanged);
      // Remove the screen-saver-level island before capture. Sampling is free to leave its bounds.
      host.hide();
      void (async () => {
        await new Promise(done => setTimeout(done, 120));
        if (finished) return;
        const displays = screen.getAllDisplays();
        if (!displays.length || displays.length > 8 || displays.reduce((n, d) => n + d.bounds.width * d.bounds.height * d.scaleFactor ** 2, 0) > 64000000) throw Error('capture-limit');
        const frames: Array<{ display: Electron.Display; image: NativeImage }> = [];
        // Capture every display before displaying any overlay; never sample our own magnifier.
        for (const display of displays) {
          const image = await captureProductImage({ mode: 'region', rect: display.bounds }, true);
          if (finished) return;
          if (image.isEmpty()) throw Error('capture-failed');
          frames.push({ display, image });
        }
        for (const { display, image } of frames) {
          if (finished) return;
          const window = new BrowserWindow({ ...display.bounds, show: false, frame: false, thickFrame: false, transparent: false, backgroundColor: '#1c1d20', alwaysOnTop: true, skipTaskbar: true, resizable: false, movable: false, fullscreenable: false, hasShadow: false,
            webPreferences: { preload: join(__dirname, '../preload/pixelPicker.js'), partition: 'fusion-color-picker', sandbox: true, contextIsolation: true, nodeIntegration: false } });
          overlays.set(window.webContents, { window, image });
          window.setAlwaysOnTop(true, 'screen-saver');
          window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
          window.webContents.on('will-navigate', e => e.preventDefault());
          window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
          window.once('closed', cancel);
          await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(PIXEL_PICKER_HTML));
          if (finished) return;
          window.setBounds(display.bounds); window.show();
        }
        const pointer = screen.getCursorScreenPoint();
        const nearest = screen.getDisplayNearestPoint(pointer);
        const selected = [...overlays.values()].find(o => screen.getDisplayMatching(o.window.getBounds()).id === nearest.id);
        selected?.window.focus();
      })().catch(reason => finish(undefined, reason instanceof Error ? reason : Error(String(reason))));
    });
  });
  ipcMain.handle('fusion:color:init', event => {
    const overlay = current?.overlays.get(event.sender);
    if (!overlay) throw Error('untrusted-picker');
    return { dataUrl: overlay.image.toDataURL() };
  });
  ipcMain.on('fusion:color:selected', (event, point: unknown) => {
    const pick = current, overlay = pick?.overlays.get(event.sender);
    if (!pick || !overlay) return;
    if (point === null) { pick.finish(); return; }
    if (!Array.isArray(point) || point.length !== 4 || !point.every(v => typeof v === 'number' && Number.isFinite(v))) { pick.finish(undefined, Error('invalid-color-position')); return; }
    try {
      const size = overlay.image.getSize(), bounds = overlay.window.getContentBounds();
      if(!Number.isInteger(point[2])||!Number.isInteger(point[3])||Math.abs(bounds.width-point[2])>2||Math.abs(bounds.height-point[3])>2)throw Error('invalid-color-position');
      pick.finish(sampledHex(overlay.image.toBitmap(), size, {width:point[2],height:point[3]}, point[0], point[1]));
    } catch (reason) { pick.finish(undefined, reason instanceof Error ? reason : Error(String(reason))); }
  });
  app.once('before-quit', () => { quitting = true; current?.finish(); });
}
