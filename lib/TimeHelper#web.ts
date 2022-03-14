/// <reference lib="dom"/>

import { TimeHelper as AbstractTimeHelper } from "../src/TimeHelper";
export class TimeHelper extends AbstractTimeHelper {
  now(): number {
    return Date.now(); //performance.now() + performance.timeOrigin;
  }
}
