import { Injectable } from "@bfchain/util";
import { CryptoHelper } from "./CryptoHelper";
import { CryptolaliaConfig } from "./CryptolaliaConfig";
import { Storage } from "./Storage";
import { TimeHelper } from "./TimeHelper";

/**
 * 树状的时间线
 * 这里只存储签名与时间
 * 用来根据发送者的发送时间来管理接收的数据
 * 这种结构在不同节点之间可以进行信息同步
 * 这里主要是保存签名信息
 */

@Injectable()
export class CryptolaliaTimelineTree<D> {
  constructor(
    private config: CryptolaliaConfig,
    private timeHelper: TimeHelper,
    private cryptoHelper: CryptoHelper,
    private storage: Storage,
  ) {}

  async addLeaf(leaf: D, time: number) {
    const branchId = this.config.calcBranchId(time);

    /**
     * 整个过程是需要时间的，在没有事务安全的情况下
     * 1. 先进行逐级（从高level到低level）标记branchHash为dirty
     * 2. 将数据正式写入到最底层的branch里头
     */
    //#region Step 1.

    let curlevel = 0;
    let curBranchId = 0;
    let preBranchId = branchId;
    const dirtyBranchHashInfoList: {
      paths: Storage.Paths;
      dirtyBranchId: number;
    }[] = [];
    do {
      ++curlevel;
      curBranchId = this.config.calcNextBranchId(preBranchId);

      dirtyBranchHashInfoList.unshift({
        paths: [
          "timeline-tree-hash",
          `level-${curlevel}`,
          `branch-${curBranchId}`,
        ],
        dirtyBranchId: preBranchId,
      });

      preBranchId = curBranchId;
    } while (curBranchId !== 1);

    for (const info of dirtyBranchHashInfoList) {
      let branchHashInfo = await this.storage.getJsObject<BranchHashInfo>(
        info.paths,
      );
      if (branchHashInfo !== undefined) {
        branchHashInfo.dirty.add(info.dirtyBranchId);
        branchHashInfo.subHash.delete(info.dirtyBranchId);
      } else {
        branchHashInfo = {
          hash: EMPTY_SHA256,
          dirty: new Set([info.dirtyBranchId]),
          subHash: new Map(),
        };
      }
      await this.storage.setJsObject(info.paths, branchHashInfo);
    }
    //#endregion

    //#region Step 2
    const level0Path = ["timeline-blocks", `block-${branchId}`];
    const json =
      (await this.storage.getJsObject<CryptolaliaTimelineTree.BranchData<D>>(
        level0Path,
      )) || [];
    json.push({
      leafTime: time,
      content: leaf,
    });
    json.sort((a, b) => a.leafTime - b.leafTime);
    this.storage.setJsObject(level0Path, json);
    //#endregion

    return { branchId };
  }
  async getBranchData(branchId: number) {
    const level1Path = ["timeline-blocks", `block-${branchId}`];
    return (
      this.storage.getJsObject<CryptolaliaTimelineTree.BranchData<D>>(
        level1Path,
      ) || []
    );
  }

  /**获取某一个枝干的hash值
   * 优先读取缓存,没有缓存的话进行动态计算,计算完后写入缓存
   */
  private async _getBranchHash(branchId: number, level: number) {
    /// level 0 是最底层的存在，没有子集，所以它不会独立存在，因为形成不了完整的BranchHashInfo，所以只会直接存在于父级。所以我们直接读取父级
    if (level === 0) {
      /// 读取父级HashInfo信息。从里头读取hash缓存；如果发现被标记了变动，那么写入hash缓存
      const parentBranchId = this.config.calcNextBranchId(branchId);
      const parentPaths = [
        "timeline-tree-hash",
        `level-${1}`,
        `branch-${parentBranchId}`,
      ];
      const parentBranchHashInfo =
        await this.storage.getJsObject<BranchHashInfo>(parentPaths);
      if (parentBranchHashInfo === undefined) {
        return EMPTY_SHA256;
      }
      /// 读取到缓存
      const cacheHash =
        parentBranchHashInfo.dirty.has(branchId) ||
        parentBranchHashInfo.subHash.get(branchId);
      let hash = EMPTY_SHA256;
      /// 发现了变动，计算hash并写入缓存
      if (cacheHash === true) {
        /// 读取数据进行计算
        const binary = await this.storage.getBinary([
          "timeline-tree",
          `block-${branchId}`,
        ]);
        if (binary) {
          hash = await this.cryptoHelper.sha256Binary(binary);
          parentBranchHashInfo.subHash.set(branchId, hash);
        } else {
          parentBranchHashInfo.subHash.delete(branchId);
        }
        parentBranchHashInfo.dirty.delete(branchId);
        await this.storage.setJsObject<BranchHashInfo>(
          parentPaths,
          parentBranchHashInfo,
        );
      } else if (cacheHash !== undefined) {
        hash = cacheHash;
      }

      return hash;
    }

    const paths = [
      "timeline-tree-hash",
      `level-${level}`,
      `branch-${branchId}`,
    ];
    const branchHashInfo = await this.storage.getJsObject<BranchHashInfo>(
      paths,
    );
    if (branchHashInfo === undefined) {
      return EMPTY_SHA256;
    }
    if (branchHashInfo.dirty.size === 0) {
      return branchHashInfo.hash;
    }

    /// 处理脏枝干
    const childLevel = level - 1;
    if (childLevel === 0) {
      /// 对0进行加速
      for (const dirtyBranchId of branchHashInfo.dirty) {
        const binary = await this.storage.getBinary([
          "timeline-tree",
          `block-${dirtyBranchId}`,
        ]);
        if (binary) {
          branchHashInfo.subHash.set(
            branchId,
            await this.cryptoHelper.sha256Binary(binary),
          );
        } else {
          branchHashInfo.subHash.delete(branchId);
        }
      }
    } else {
      for (const dirtyBranchId of branchHashInfo.dirty) {
        const hash = await this._getBranchHash(dirtyBranchId, childLevel);
        if (hash.length === 0 /* EMPTY_SHA256 */) {
          branchHashInfo.subHash.delete(branchId);
        } else {
          branchHashInfo.subHash.set(branchId, hash);
        }
      }
    }
    // 清除脏信息
    branchHashInfo.dirty.clear();
    /// 重新进行hash计算
    const hashBuilder = this.cryptoHelper.sha256HashBuilder();
    for (const childHash of [...branchHashInfo.subHash].sort(
      (a, b) => a[0] - b[0],
    )) {
      hashBuilder.update(childHash[1]);
    }
    branchHashInfo.hash = await hashBuilder.digest();

    await this.storage.setJsObject<BranchHashInfo>(paths, branchHashInfo);
    return branchHashInfo.hash;
  }
  /**获取某一个叶子的枝干路径 */
  async getBranchRoute(leafTime: number) {
    let level = 0;
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
    if (level < 1) {
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
      if (hash.length === 0 /* EMPTY_SHA256 */) {
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

export declare namespace CryptolaliaTimelineTree {
  interface LeafModal<D> {
    leafTime: number;
    content: D;
  }
  type BranchData<D> = LeafModal<D>[];
}
const EMPTY_SHA256 = new Uint8Array(0);

type BranchHashInfo = {
  hash: Uint8Array;
  dirty: Set<number>;
  subHash: Map<number, Uint8Array>;
};
