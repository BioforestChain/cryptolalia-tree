import { Resolvable } from "@bfchain/util";
import { CryptolaliaAssets } from "./CryptolaliaAssets";
import { CryptolaliaConfig } from "./CryptolaliaConfig";
import { CryptolaliaDataList } from "./CryptolaliaDataList";
import { CryptolaliaSync } from "./CryptolaliaSync";
import { CryptolaliaTimelineTree } from "./CryptolaliaTimelineTree";
import { StorageAdaptor } from "./StorageAdaptor";
import { TimeHelper } from "./TimeHelper";

@Resolvable()
export default class Cryptolalia<D> {
  constructor(
    readonly config: CryptolaliaConfig,
    private timeHelper: TimeHelper,
    readonly timelineTree: CryptolaliaTimelineTree,
    readonly dataList: CryptolaliaDataList<D>,
    readonly assets: CryptolaliaAssets,
    readonly sync: CryptolaliaSync,
    readonly storage: StorageAdaptor,
  ) {}
  /**
   * 添加数据
   * @param msg 消息内容
   * @param msgSign 消息签名，理论上是包含在msg本身中，但因为这里对消息进行了泛型化，所以需要明确声明消息的签名
   * @param msgTime 消息时间，理论上是包含在msg本身中，但因为这里对消息进行了泛型化，所以需要明确声明消息的时间。它还用于存储在时序数据库时，作为参考坐标点
   */
  addMsg(msg: D, msgSign: Uint8Array, msgTime: number) {
    this.dataList.addItem(msg, msgTime);
    this.timelineTree.addLeaf(msgSign, msgTime);
  }
}
