import { Injectable } from "@bfchain/util";

@Injectable()
export abstract class CryptolaliaConfig {
  abstract branchGroupCount: number; // 每 64 个branch可以组成一个更大 branch
  abstract timespan: number; //64e3 64秒;
  abstract startTime: number;

  calcBranchId(leafTime: number) {
    const relativeLeafTime = leafTime - this.startTime;
    if (relativeLeafTime < 0) {
      throw new RangeError("invald time: " + leafTime);
    }
    let branchId = relativeLeafTime / this.timespan;
    if (branchId % 1 === 0) {
      branchId += 1;
    }
    return Math.ceil(branchId);
  }
  calcNextBranchId(branchId: number) {
    let nextBranchId = branchId / this.branchGroupCount;
    if (nextBranchId % 1 === 0) {
      nextBranchId += 1;
    }
    return Math.ceil(nextBranchId);
  }
  calcBranchIdRange(highLevelBranchId: number) {
    const start = (highLevelBranchId - 1) * this.branchGroupCount;
    const end = start + this.branchGroupCount - 1;
    return { start: start, end: end };
  }
}
