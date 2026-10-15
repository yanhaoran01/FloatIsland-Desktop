/* FloatIsland - Copyright (C) 2026 contributors. GPL-3.0. */
/** @file captureEngine.ts @description Local screenshot services are the default; cloud requires explicit selection. @author 鸡哥 */
import {app} from 'electron';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {CAPTURE_SERVICE_STORE_KEY,type ScreenshotOcrEngine} from '../../shared/storeKeys';
/** Old forced-cloud preferences do not opt the user into an account service. */
export function captureEngine():ScreenshotOcrEngine {
  try { return JSON.parse(readFileSync(join(app.getPath('userData'),'eIsland_store',CAPTURE_SERVICE_STORE_KEY+'.json'),'utf8'))==='server'?'server':'local'; }
  catch { return 'local'; }
}
