/* FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 contributors. GPL-3.0. */
/** @file productWorker.ts @description Offline processors outside the main event loop. @author 鸡哥 */
import { parentPort,workerData } from 'node:worker_threads';
import { executeUtilityJob,type UtilityJob } from '../../shared/utilityOperations';
void executeUtilityJob(workerData as UtilityJob).then(result=>parentPort?.postMessage({result}),error=>parentPort?.postMessage({error:error instanceof Error?error.message:String(error)}));
