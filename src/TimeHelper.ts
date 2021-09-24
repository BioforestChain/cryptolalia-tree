import { Injectable } from "@bfchain/util-dep-inject";

@Injectable()
export abstract class TimeHelper {
  abstract now(): number;
  max(time: number, now = this.now()) {
    return time >= now ? time : now;
  }
}
