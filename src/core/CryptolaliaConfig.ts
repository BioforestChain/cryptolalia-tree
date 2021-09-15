import { Injectable } from "@bfchain/util";


@Injectable()
export abstract class CryptolaliaConfig {
  abstract branchUnitCount: number; // 每 64 个branch可以组成一个更大 branch
  abstract timespan: number; //64e3 64秒;
  abstract startTime: number;
}
