/* FloatIsland contributors. GPL-3.0. */
import {parentPort,workerData} from 'node:worker_threads';
import {bookRule,type RuleWork} from './bookRuleEngine';
void bookRule((workerData as RuleWork).content,workerData.rule,workerData.elements,workerData.key).then(result=>parentPort?.postMessage({result})).catch(error=>parentPort?.postMessage({error:String(error)}));
