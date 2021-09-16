import { Injectable } from "@bfchain/util";
import { CryptoHelper } from "./CryptoHelper";
import { CryptolaliaConfig } from "./CryptolaliaConfig";
import { Paths, StorageAdaptor } from "./StorageAdaptor";
import { TimeHelper } from "./TimeHelper";

/**
 * 树状的时间线
 * 这里只存储签名与时间
 * 用来根据发送者的发送时间来管理接收的数据
 * 这种结构在不同节点之间可以进行信息同步
 * 这里主要是保存签名信息
 */

@Injectable()
export class CryptolaliaTimelineTree {
  constructor(
    private config: CryptolaliaConfig,
    private timeHelper: TimeHelper,
    private cryptoHelper: CryptoHelper,
    private storage: StorageAdaptor,
  ) {}

  async addLeaf(leaf: Uint8Array, time: number) {
    const branchIdId = this.config.calcBranchId(time);

    const level1Path = ["timeline-tree", `block-${branchIdId}`];
    const json =
      (await this.storage.getJsObject<TimelineLeafModal[]>(level1Path)) || [];
    json.push({
      leafTime: time,
      content: leaf,
    });
    this.storage.setJsObject(level1Path, json);

    /// 逐级删除tree的hash记录
    let level = 1;
    let levelBranchId = branchIdId;
    do {
      const paths = [
        "timeline-tree-hash",
        `level-${level}`,
        `branch-${levelBranchId}`,
      ];
      if (level !== 1 && false === (await this.storage.has(paths))) {
        break;
      }
      await this.storage.del(paths);
      level += 1;
      levelBranchId = this.config.calcNextBranchId(levelBranchId);
    } while (true);
  }

  private _readBranchHash(
    branchId: number,
    level: number,
    paths: Paths /*  =  ["timeline-tree-hash", `level-${level}`,`branch-${branchId}`] */,
  ) {
    return this.storage.getBinary(paths);
  }
  private async _calcBranchHash(
    branchId: number,
    level: number,
    paths: Paths /*  =  ["timeline-tree-hash", `level-${level}`,`branch-${branchId}`] */,
  ): Promise<Uint8Array> {
    let hash = EMPTY_SHA256;
    if (level === 1) {
      /// 读取数据进行计算
      const binary = await this.storage.getBinary([
        "timeline-tree",
        `block-${branchId}`,
      ]);
      if (binary) {
        hash = await this.cryptoHelper.sha256Binary(binary);
      }
    } else {
      /* 找出与branchId子级范围 */
      const { start, end } = this.config.calcBranchIdRange(branchId);
      const hashList: Uint8Array[] = [];
      if (level === 2) {
        const level1Paths = ["timeline-tree", `block-0`];
        for (let b = start; b <= end; ++b) {
          level1Paths[1] = `block-${b}`;
          /// 读取数据进行计算
          const binary = await this.storage.getBinary(level1Paths);
          if (binary) {
            hashList.push(await this.cryptoHelper.sha256Binary(binary));
          }
        }
      } else {
        const preLevel = level - 1;
        for (let b = start; b <= end; ++b) {
          const hash = await this._getBranchHash(b, preLevel);
          if (hash !== EMPTY_SHA256) {
            hashList.push(hash);
          }
        }
      }
      if (hashList.length !== 0) {
        hash = await hashList
          .reduce(
            (hashBuilder, hash) => hashBuilder.update(hash),
            this.cryptoHelper.sha256HashBuilder(),
          )
          .digest();
      }
    }

    /// 最后对计算结果进行存储
    await this.storage.setBinary(paths, hash);
    return hash;
  }
  /**获取某一个枝干的hash值
   * 优先读取缓存,没有缓存的话进行动态计算,计算完后写入缓存
   */
  private async _getBranchHash(branchId: number, level: number) {
    // if (level < 1) {
    //   throw new RangeError("invalid branch level: " + level);
    // }
    const paths = [
      "timeline-tree-hash",
      `level-${level}`,
      `branch-${branchId}`,
    ];
    return (
      (await this._readBranchHash(branchId, level, paths)) ||
      (await this._calcBranchHash(branchId, level, paths))
    );
  }
  /**获取某一个叶子的枝干路径 */
  async getBranchRoute(leafTime: number) {
    let level = 1;
    let branchId = this.config.calcBranchId(leafTime);
    const routeHashList = [
      {
        level,
        branchId,
        hash: await this._getBranchHash(branchId, level),
      },
    ];
    while (branchId !== 1) {
      branchId = this.config.calcNextBranchId(branchId);
      level += 1;
      routeHashList.push({
        level,
        branchId,
        hash: await this._getBranchHash(branchId, level),
      });
    }
    return routeHashList;
  }
  /**获取某一个枝干的直接孩子
   * level必须>=2
   * 因为level == 1 已经是最小的branch了,它是没有children的
   */
  async getBranchChildren(branchId: number, level: number) {
    if (level < 2) {
      throw new RangeError(
        `invalid branch level: ${level} when get branch(${branchId})`,
      );
    }
    const { start, end } = this.config.calcBranchIdRange(branchId);
    const childLevel = level - 1;
    const childrenHashList: {
      branchId: number;
      level: number;
      hash: Uint8Array;
    }[] = [];
    for (let b = start; b <= end; ++b) {
      const hash = await this._getBranchHash(b, childLevel);
      if (hash === EMPTY_SHA256) {
        childrenHashList.push({ branchId: b, level: childLevel, hash });
      }
    }
    return {
      branchId,
      level,
      children: childrenHashList,
    };
  }
}
interface TimelineLeafModal {
  leafTime: number;
  content: Uint8Array;
}
const EMPTY_SHA256 = new Uint8Array(0);
