/* FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 FusionIsland contributors. GPL-3.0. */
/** @file utility.worker.ts @description 工具工作线程可通过终止取消，不阻塞对话。 @author 鸡哥 */
import { executeUtilityJob, type UtilityJob } from './utilityOperations';
self.onmessage = async (event: MessageEvent<UtilityJob>): Promise<void> => {
  try { self.postMessage({ result: await executeUtilityJob(event.data) }); }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : String(error) }); }
};
