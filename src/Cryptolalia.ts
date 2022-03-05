import { Injectable } from "@bfchain/util-dep-inject";
import { addMsg, CryptolaliaCore } from "./core";
import { CryptolaliaAssets } from "./CryptolaliaAssets";
import { CryptolaliaConfig } from "./CryptolaliaConfig";
import { CryptolaliaDataList, ORDER } from "./CryptolaliaDataList";
import { CryptolaliaSync } from "./CryptolaliaSync";
import { CryptolaliaTimelineTree } from "./CryptolaliaTimelineTree";
import { MessageHelper } from "./MessageHelper";
import { Storage } from "./Storage";
import { TimeHelper } from "./TimeHelper";

@Injectable()
export class Cryptolalia<D> {
  constructor(
    private msgHelper: MessageHelper<D>,
    readonly config: CryptolaliaConfig,
    private timeHelper: TimeHelper,
    readonly timelineTree: CryptolaliaTimelineTree<D>,
    readonly dataList: CryptolaliaDataList<CryptolaliaCore.RawDataItem>,
    readonly assets: CryptolaliaAssets,
    readonly sync: CryptolaliaSync,
    readonly storage: Storage,
  ) {}
  addMsg(msg: D) {
    return addMsg(this.msgHelper, this.timelineTree, this.dataList, msg);
  }

  async getMsgList(
    timestamp: number,
    query: {
      offset?: number;
      limit?: number;
      order?: ORDER;
    } = {},
  ) {
    const { offset = 0, limit = 40, order = ORDER.DOWN } = query;

    const rawDataList: CryptolaliaDataList.DataItem<CryptolaliaCore.RawDataItem>[] =
      [];
    const branchMap = new Map<
      number,
      BFChainUtil.PromiseMaybe<
        CryptolaliaTimelineTree.BranchData<D> | undefined
      >
    >();
    let skipped = 0;
    /**读取数据库的索引数据 */
    for await (const rawData of this.dataList.ItemReader(timestamp, order)) {
      if (skipped < offset) {
        ++skipped;
        continue;
      }
      if (rawDataList.length >= limit) {
        break;
      }

      rawDataList.push(rawData);
      if (branchMap.has(rawData.data.branchId) === false) {
        branchMap.set(
          rawData.data.branchId,
          this.timelineTree.getBranchData(rawData.data.branchId),
        );
      }
    }

    const msgList: Cryptolalia.CryptolaliaMessage<D>[] = [];
    /**将索引数据补全成完整的信息数据 */
    for (const rawData of rawDataList) {
      let branchData = branchMap.get(rawData.data.branchId);
      if (branchData && "then" in branchData) {
        branchData = await branchData;
        branchMap.set(rawData.data.branchId, branchData);
      }
      if (branchData === undefined) {
        console.error(
          new Error("数据发生了残缺丢失的问题，需要对数据重建索引"),
        );
        continue;
      }
      const msgContent = this.timelineTree.getLeafFromBranchData(
        branchData,
        rawData.data.sign,
      );
      if (msgContent === undefined) {
        console.error(new Error("数据发生了残缺丢失的问题，可能需要同步数据"));
        continue;
      }
      msgList.push({
        receiptTime: rawData.insertTime,
        content: msgContent,
      });
    }

    return msgList;
  }

  clear() {
    return this.storage.del([]);
  }
}

export declare namespace Cryptolalia {
  type CryptolaliaMessage<D> = {
    receiptTime: number;
    content: D;
  };
}
