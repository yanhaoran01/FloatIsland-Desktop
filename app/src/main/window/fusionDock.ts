/* FloatIsland - Copyright (C) 2026 contributors. GPL-3.0. */
import { registerFusionGenie, genieTransitionActive } from './fusionGenie';
import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  powerMonitor,
  screen
} from 'electron';
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs';
import { join } from 'path';
import { broadcastFusion, isFusionView } from '../system/fusionWindows';
import { hasFusionMedia } from '../system/fusionBrowserService';
import { snapNativeDockEdge } from './nativeDockEdge';
import {
  dockRect,
  dockPosition,
  horizontalDock,
  nearestDockEdge,
  type DockEdge,
  type DockRect
} from './fusionDockGeometry';
import { registerFusionViewport, viewportAdjusting } from './fusionViewport';
import type { FusionDockConfig } from '../../preload/types/fusionWorkspace';
export type { FusionDockConfig } from '../../preload/types/fusionWorkspace';

let getWindow: () => BrowserWindow | null = () => null;
let config: FusionDockConfig = {
  edge: 'top',
  position: 0.5,
  autoHide: true,
  delayMs: 3000,
  shortcut: 'Control+Alt+Space',
  displayId: 'primary',
  mode: 'island',
  quotaDisplay: 'ring'
};
let strip = false,
  expanded = false,
  panel = false,
  lastSize = { width: 760, height: 560 },
  lastOutside = Date.now();
let ready = false,
  shortcutError = '',
  protectedActivity = false,
  recalledUntil = 0;
let dragging: {
  x: number;
  y: number;
  bounds: DockRect;
  moved: boolean;
} | null = null;
let preview: DockEdge | null = null;
const edges: DockEdge[] = ['top', 'bottom', 'left', 'right'];
const positions: Record<DockEdge, number> = {
  top: 0.5,
  bottom: 0.5,
  left: 0.5,
  right: 0.5
};
const targetDisplay = () =>
  screen.getAllDisplays().find((d) => String(d.id) === config.displayId) ||
  screen.getPrimaryDisplay();
const file = () =>
  join(app.getPath('userData'), 'eIsland_store', 'fusion-dock.json');
const snapshot = () => ({ config, strip, preview, shortcutError });
const publish = () => broadcastFusion('fusion:dock:changed', snapshot());
const persist = () => {
  mkdirSync(join(app.getPath('userData'), 'eIsland_store'), {
    recursive: true
  });
  writeFileSync(file() + '.tmp', JSON.stringify({ ...config, positions }));
  renameSync(file() + '.tmp', file());
};
const valid = (v: FusionDockConfig) =>
  edges.includes(v.edge) &&
  Number.isFinite(v.position) &&
  v.position >= 0 &&
  v.position <= 1 &&
  typeof v.autoHide === 'boolean' &&
  Number.isFinite(v.delayMs) &&
  v.delayMs >= 1000 &&
  v.delayMs <= 30000 &&
  typeof v.shortcut === 'string' &&
  v.shortcut.length <= 100 &&
  typeof v.displayId === 'string' &&
  ['simple', 'island'].includes(v.mode) &&
  ['ring', 'number', 'both'].includes(v.quotaDisplay);
export function fusionDockReady(): boolean {
  return ready;
}
export function fusionDockKeepsVisible(): boolean {
  if (!ready) return false;
  if (
    config.mode === 'simple' ||
    expanded ||
    panel ||
    protectedActivity ||
    strip ||
    !config.autoHide ||
    Date.now() < recalledUntil ||
    genieTransitionActive()
  )
    return true;
  const win = getWindow();
  if (!win || win.isDestroyed()) return false;
  const p = screen.getCursorScreenPoint(),
    b = win.getBounds();
  return (
    p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height
  );
}
export function fusionDockBounds(rect: DockRect): DockRect {
  if (!ready || dragging) return rect;
  const horizontal = horizontalDock(config.edge);
  if (expanded) lastSize = { width: rect.width, height: rect.height };
  const compact =
    config.mode === 'simple'
      ? horizontal
        ? { width: 400, height: 44 }
        : { width: 44, height: 400 }
      : horizontal
        ? { width: 260, height: 42 }
        : { width: 48, height: 260 };
  const size =
    panel && !expanded
      ? { width: 480, height: 440 }
      : expanded
        ? lastSize
        : config.mode === 'island' && hasFusionMedia()
          ? { width: 360, height: 72 }
          : compact;
  return dockRect(
    targetDisplay().workArea,
    strip
      ? horizontal
        ? { width: 64, height: 10 }
        : { width: 10, height: 64 }
      : size,
    config.edge,
    config.position,
    strip
  );
}
export function snapFusionDock(win: BrowserWindow, bounds: DockRect): void {
  if (ready && !dragging)
    snapNativeDockEdge(win, config.edge, bounds, targetDisplay().scaleFactor);
}
const place = (): void => {
  if (dragging) return;
  const win = getWindow();
  if (!win || win.isDestroyed()) return;
  const b = fusionDockBounds({ ...win.getBounds(), ...lastSize }),
    c = win.getBounds();
  if (
    Object.keys(b).some(
      (k) => Math.abs(b[k as keyof DockRect] - c[k as keyof DockRect]) >= 1
    )
  )
    win.setBounds(b);
  snapFusionDock(win, b);
  win.setShape([{ x: 0, y: 0, width: b.width, height: b.height }]);
  win.setIgnoreMouseEvents(false);
  win.webContents.invalidate();
};
export function revealFusionIsland(): void {
  strip = false;
  lastOutside = Date.now();
  recalledUntil = lastOutside + config.delayMs + 500;
  place();
  publish();
  getWindow()?.showInactive();
}
function finishDrag(cancel = false): boolean {
  if (!dragging) return false;
  const moved = dragging.moved,
    win = getWindow();
  dragging = null;
  if (moved && !cancel && win) {
    const display = screen.getDisplayMatching(win.getBounds()),
      area = display.workArea;
    config.displayId = String(display.id);
    config.edge = nearestDockEdge(area, screen.getCursorScreenPoint());
    const size = fusionDockBounds(win.getBounds());
    const current = win.getBounds();
    config.position = dockPosition(
      area,
      { ...current, width: size.width, height: size.height },
      config.edge
    );
    positions[config.edge] = config.position;
    persist();
  }
  preview = null;
  lastOutside = Date.now();
  place();
  publish();
  return moved;
}
export function registerFusionDock(
  getIsland: () => BrowserWindow | null
): void {
  getWindow = getIsland;
  try {
    const saved = JSON.parse(readFileSync(file(), 'utf8'));
    const { positions: _positions, ...settings } = saved;
    const next = { ...config, ...settings };
    if (valid(next)) {
      config = next;
      for (const edge of edges)
        if (Number.isFinite(saved.positions?.[edge]))
          positions[edge] = Math.max(0, Math.min(1, saved.positions[edge]));
      positions[config.edge] = config.position;
    }
  } catch {
    /* Defaults preserve existing preferences until a successful save. */
  }
  ready = true;
  registerFusionGenie(getWindow, () => config);
  const recall = () => {
    revealFusionIsland();
    getWindow()?.webContents.send('fusion:dock:reveal');
  };
  if (config.shortcut && !globalShortcut.register(config.shortcut, recall))
    shortcutError = 'shortcut-conflict';
  const trusted = (event: Electron.IpcMainInvokeEvent) => {
    if (!isFusionView(event.sender)) throw Error('untrusted-view');
  };
  ipcMain.handle('fusion:dock:get', (e) => {
    trusted(e);
    return snapshot();
  });
  ipcMain.handle('fusion:dock:reveal-compact', (e) => {
    trusted(e);
    revealFusionIsland();
    return snapshot();
  });
  ipcMain.handle('fusion:hud:panel', (e, open: boolean) => {
    trusted(e);
    if (e.sender !== getWindow()?.webContents || typeof open !== 'boolean')
      return;
    if (config.mode !== 'simple') return;
    panel = open;
    strip = false;
    lastOutside = Date.now();
    place();
    if (open) getWindow()?.showInactive();
  });
  ipcMain.handle('fusion:dock:save', (e, patch: Partial<FusionDockConfig>) => {
    trusted(e);
    if (viewportAdjusting() || dragging) throw Error('resize-in-progress');
    if (!patch || Object.keys(patch).some((k) => !Object.hasOwn(config, k)))
      throw Error('invalid-dock-settings');
    const next = { ...config, ...patch };
    if (
      patch.edge &&
      patch.edge !== config.edge &&
      patch.position === undefined
    )
      next.position = positions[patch.edge];
    if (!valid(next)) throw Error('invalid-dock-settings');
    if (
      next.shortcut !== config.shortcut ||
      (Object.hasOwn(patch, 'shortcut') && shortcutError)
    ) {
      if (next.shortcut && !globalShortcut.register(next.shortcut, recall))
        throw Error('shortcut-conflict');
      if (
        config.shortcut &&
        next.shortcut !== config.shortcut &&
        !shortcutError
      )
        globalShortcut.unregister(config.shortcut);
      shortcutError = '';
    }
    config = next;
    if (config.mode !== 'simple') panel = false;
    positions[config.edge] = config.position;
    strip = false;
    persist();
    place();
    publish();
    return snapshot();
  });
  ipcMain.handle('fusion:dock:reset', (e) => {
    trusted(e);
    config = { ...config, edge: 'top', position: 0.5, displayId: 'primary' };
    persist();
    revealFusionIsland();
    return snapshot();
  });
  ipcMain.handle(
    'fusion:dock:activity',
    (e, isExpanded: boolean, keepVisible = false) => {
      trusted(e);
      if (typeof isExpanded !== 'boolean' || typeof keepVisible !== 'boolean')
        throw Error('invalid-dock-activity');
      if (e.sender !== getWindow()?.webContents) return;
      expanded = isExpanded;
      protectedActivity = keepVisible;
      if (expanded || protectedActivity) strip = false;
      lastOutside = Date.now();
      place();
      publish();
    }
  );
  ipcMain.handle('fusion:dock:drag', (e, action: string) => {
    trusted(e);
    const win = getWindow();
    if (!win || e.sender !== win.webContents) return;
    const point = screen.getCursorScreenPoint();
    if (action === 'start') {
      if (viewportAdjusting() || genieTransitionActive()) return;
      dragging = { ...point, bounds: win.getBounds(), moved: false };
      return;
    }
    if (!dragging) return;
    if (action === 'end' || action === 'cancel') {
      finishDrag(action === 'cancel');
      return;
    }
    if (action !== 'move') throw Error('invalid-drag-action');
    if (
      !dragging.moved &&
      Math.hypot(point.x - dragging.x, point.y - dragging.y) <= 6
    )
      return;
    dragging.moved = true;
    const area = screen.getDisplayNearestPoint(point).workArea,
      b = dragging.bounds;
    const x = Math.max(
        area.x,
        Math.min(area.x + area.width - b.width, b.x + point.x - dragging.x)
      ),
      y = Math.max(
        area.y,
        Math.min(area.y + area.height - b.height, b.y + point.y - dragging.y)
      );
    win.setPosition(Math.round(x), Math.round(y));
    const edge = nearestDockEdge(area, point);
    if (edge !== preview) {
      preview = edge;
      publish();
    }
  });
  const timer = setInterval(() => {
    const win = getWindow();
    if (
      !win ||
      win.isDestroyed() ||
      !win.isVisible() ||
      dragging ||
      viewportAdjusting() ||
      genieTransitionActive()
    )
      return;
    if (
      config.mode === 'simple' ||
      panel ||
      expanded ||
      protectedActivity ||
      hasFusionMedia() ||
      !config.autoHide
    ) {
      lastOutside = Date.now();
      return;
    }
    const p = screen.getCursorScreenPoint(),
      b = win.getBounds(),
      inside =
        p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height;
    if (inside) lastOutside = Date.now();
    else if (!strip && Date.now() - lastOutside >= config.delayMs) {
      strip = true;
      place();
      publish();
    }
  }, 100);
  const resync = () => {
    finishDrag(true);
    if (config.displayId !== 'primary' && !screen.getAllDisplays().some((d) => String(d.id) === config.displayId)) {
      config.displayId = 'primary';
      persist();
    }
    place();
    publish();
  };
  screen.on('display-removed', resync);
  screen.on('display-added', resync);
  screen.on('display-metrics-changed', resync);
  powerMonitor.on('resume', resync);
  getWindow()?.on('blur', () => finishDrag(true));
  getWindow()?.on('hide', () =>
    getWindow()?.webContents.send('fusion:voice:hidden', 'window-hidden')
  );
  app.once('will-quit', () => {
    clearInterval(timer);
    if (config.shortcut && !shortcutError)
      globalShortcut.unregister(config.shortcut);
    screen.removeListener('display-removed', resync);
    screen.removeListener('display-added', resync);
    screen.removeListener('display-metrics-changed', resync);
    powerMonitor.removeListener('resume', resync);
  });
  registerFusionViewport({
    getWindow,
    dock: () => ({ edge: config.edge, expanded, dragging: !!dragging }),
    commit: persist,
    apply: (rect) => {
      lastSize = { width: rect.width, height: rect.height };
      config.position = dockPosition(
        targetDisplay().workArea,
        rect,
        config.edge
      );
      positions[config.edge] = config.position;
      place();
    }
  });
  place();
}
