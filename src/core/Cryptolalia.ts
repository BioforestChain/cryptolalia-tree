import { Resolvable } from "@bfchain/util";
import { CryptolaliaAssets } from "./CryptolaliaAssets";
import { CryptolaliaDataList } from "./CryptolaliaDataList";
import { StorageAdaptor } from "./StorageAdaptor";
import { TimeHelper } from "./TimeHelper";
import { CryptolaliaTimelineTree } from "./index";
import { CryptolaliaConfig } from "./CryptolaliaConfig";

@Resolvable()
export default class Cryptolalia<D> {
  constructor(
    readonly config: CryptolaliaConfig,
    private timeHelper: TimeHelper,
    readonly timelineTree: CryptolaliaTimelineTree,
    readonly dataList: CryptolaliaDataList<D>,
    readonly assets: CryptolaliaAssets,
    private storage: StorageAdaptor,
  ) {}
}
