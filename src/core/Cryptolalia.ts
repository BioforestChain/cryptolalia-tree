import { Injectable, Resolvable } from "@bfchain/util";
import { CryptolaliaAssets } from "./CryptolaliaAssets";
import { CryptolaliaConfig } from "./CryptolaliaConfig";
import { CryptolaliaDataList, ORDER } from "./CryptolaliaDataList";
import { CryptolaliaSync } from "./CryptolaliaSync";
import { CryptolaliaTimelineTree } from "./CryptolaliaTimelineTree";
import { StorageAdaptor } from "./StorageAdaptor";
import { TimeHelper } from "./TimeHelper";

@Injectable()
/**
 * 提供对泛型数据统一的信息读取解析的工具函数
 */
export abstract class MessageHelper<D> {
  /**获取消息的签名 */
  abstract getSignature(msg: D): Uint8Array;
  /**获取消息的时间 */
  abstract getCreateTime(msg: D): number;
  /**判断消息与指定签名是否匹配
   * 这里只提供最基础的纯JS实现，不同平台或者具体情况应当可以提供更进一步的实现
   */
  equalSignature(msg: D, expectSign: Uint8Array) {
    const msgSign = this.getSignature(msg);
    if (msgSign.length !== expectSign.length) {
      return false;
    }
    for (let i = 0; i < msgSign.length; ++i) {
      if (expectSign[i] !== msgSign[i]) {
        return false;
      }
    }
    return true;
  }
}

@Resolvable()
export default class Cryptolalia<D> {
  constructor(
    private msgHelper: MessageHelper<D>,
    readonly config: CryptolaliaConfig,
    private timeHelper: TimeHelper,
    readonly timelineTree: CryptolaliaTimelineTree<D>,
    readonly dataList: CryptolaliaDataList<RawDataItem>,
    readonly assets: CryptolaliaAssets,
    // readonly sync: CryptolaliaSync,
    readonly storage: StorageAdaptor,
  ) {}
  /**
   * 添加数据
   * @param msg 消息内容
   */
  async addMsg(msg: D) {
    const { branchId } = await this.timelineTree.addLeaf(
      msg,
      this.msgHelper.getCreateTime(msg),
    );
    await this.dataList.addItem({
      sign: this.msgHelper.getSignature(msg),
      branchId,
    });
  }
  async getMsgList(
    timestamp: number,
    options: { offset?: number; limit?: number; order?: ORDER } = {},
  ) {
    const { offset = 0, limit = 40, order = ORDER.DOWN } = options;

    const rawDataList: CryptolaliaDataList.DataItem<RawDataItem>[] = [];
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
        throw new Error("数据发生了残缺丢失的问题，需要对数据重建索引");
      }
      const msgContent = branchData.find((item) =>
        this.msgHelper.equalSignature(item.content, rawData.data.sign),
      );
      if (msgContent === undefined) {
        throw new Error("数据发生了残缺丢失的问题，可能需要同步数据");
      }
      msgList.push({
        receiptTime: rawData.createTime,
        content: msgContent.content,
      });
    }

    return msgList;
  }
}

type RawDataItem = {
  sign: Uint8Array;
  branchId: number;
};

export declare namespace Cryptolalia {
  type CryptolaliaMessage<D> = {
    receiptTime: number;
    content: D;
  };
}
