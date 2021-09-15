import { Injectable, Resolvable } from "@bfchain/util";
import { CryptolaliaAssets } from "./CryptolaliaAssets";
import { CryptolaliaDataList } from "./CryptolaliaDataList";
import { StorageAdaptor } from "./StorageAdaptor";
import { TimeHelper } from "./TimeHelper";
import { CryptolaliaTimelineTree } from "./index";

@Injectable()
export abstract class CryptolaliaConfig {
  abstract branchUnitCount: number; // 每 64 个branch可以组成一个更大 branch
  abstract timespan: number; //64e3 64秒;
  abstract startTime: number;
}


@Resolvable()
export default class Cryptolalia<D> {
  constructor(
    private config: CryptolaliaConfig,
    private timeHelper: TimeHelper,
    private timelineTree: CryptolaliaTimelineTree,
    private dataList: CryptolaliaDataList<D>,
    private assets: CryptolaliaAssets,
    private storage: StorageAdaptor,
  ) {}
}
