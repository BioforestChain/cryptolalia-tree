/// <reference types="node"/>

import { TimeHelper as AbstractTimeHelper } from "../core/TimeHelper";
import { performance } from "node:perf_hooks";
export class TimeHelper extends AbstractTimeHelper {
  now(): number {
    return performance.now() + performance.timeOrigin;
  }
}
