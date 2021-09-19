import { Injectable } from "@bfchain/util";
import { CryptoHelper } from "./CryptoHelper";
import { CryptolaliaConfig } from "./CryptolaliaConfig";
import { MessageHelper } from "./MessageHelper";
import { Storage } from "./Storage";

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
    private cryptoHelper: CryptoHelper,
    private storage: Storage,
    private messageHelper: MessageHelper<D>,
  ) {}

  async addLeaf(leaf: D) {
    const { messageHelper } = this;
    const createTime = messageHelper.getCreateTime(leaf);
    const branchId = this.config.calcBranchId(createTime);

    /**
     * 整个过程是需要时间的，在没有事务安全的情况下
     * 0. 先判断数据是否已经存在
     * 1. 先进行逐级（从高level到低level）标记branchHash为dirty
     * 2. 将数据正式写入到最底层的branch里头
     */

    //#region Step 0 判断数据是否存在，并顺便构建 Step 2所需要存储的数据(这里可以做一个并发合并作业)
    const level0Path = ["timeline-blocks", `block-${branchId}`];
    const branchData: CryptolaliaTimelineTree.BranchData<D> =
      (await this.storage.getJsObject<CryptolaliaTimelineTree.BranchData<D>>(
        level0Path,
      )) || {
        indexedDigit: 8,
        mapData: new Map(),
      };
    const sign = messageHelper.getSignature(leaf);

    /// 将数据写入到索引表中
    do {
      /// 尝试写入索引
      const indexe = getIndexe(sign, branchData.indexedDigit);

      /**是否发生索引冲突，需要重建索引 */
      let reIndexes = false;
      const oldLeaf = branchData.mapData.get(indexe);
      // 不存在数据，可以直接写入
      if (oldLeaf === undefined) {
        branchData.mapData.set(indexe, leaf);
      }
      // 已经存在数据
      else if (messageHelper.equalSignature(oldLeaf, sign)) {
        return false;
      }
      // 发生冲突，需要重构索引
      else {
        if (branchData.indexedDigit === 256) {
          console.error("signature should be equal", sign, oldLeaf);
          throw new Error(`out of indexedDigit`);
        }
        reIndexes = true;
      }

      /// 重构索引
      const indexedDigit = (branchData.indexedDigit = (branchData.indexedDigit *
        2) as IndexedDigit);

      const newMapData = new Map() as typeof branchData.mapData;
      for (const data of branchData.mapData.values()) {
        newMapData.set(
          getIndexe(messageHelper.getSignature(data), indexedDigit),
          data,
        );
      }
      branchData.mapData = newMapData;
    } while (branchData.indexedDigit <= 256);

    //#endregion

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
        /// 这个脏变动已经存在了，可以直接跳过
        if (branchHashInfo.subDirty.has(info.dirtyBranchId)) {
          continue;
        }
        branchHashInfo.dirty = true;
        branchHashInfo.subDirty.add(info.dirtyBranchId);
        branchHashInfo.subHash.delete(info.dirtyBranchId);
      } else {
        branchHashInfo = {
          hash: EMPTY_SHA256,
          dirty: true,
          subDirty: new Set([info.dirtyBranchId]),
          subHash: new Map(),
        };
      }
      await this.storage.setJsObject(info.paths, branchHashInfo);
    }
    //#endregion

    //#region Step 2 进行最后的数据写入
    await this.storage.setJsObject(level0Path, branchData);
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

  private async _getBlockHash(branchId: number) {
    const binary = await this.storage.getBinary([
      "timeline-blocks",
      `block-${branchId}`,
    ]);
    if (binary) {
      return await this.cryptoHelper.sha256Binary(binary);
    }
    return EMPTY_SHA256;
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
        parentBranchHashInfo.subDirty.has(branchId) ||
        parentBranchHashInfo.subHash.get(branchId);
      let hash = EMPTY_SHA256;
      /// 发现了变动，计算hash并写入缓存
      if (cacheHash === true) {
        hash = await this._getBlockHash(branchId);
        if (hash.length === 0 /* EMPTY_SHA256 */) {
          parentBranchHashInfo.subHash.delete(branchId);
        } else {
          parentBranchHashInfo.subHash.set(branchId, hash);
        }
        parentBranchHashInfo.subDirty.delete(branchId);

        // console.log(parentBranchHashInfo, hash);
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
    if (branchHashInfo.dirty === false) {
      return branchHashInfo.hash;
    }

    /// 处理脏枝干
    if (branchHashInfo.subDirty.size !== 0) {
      const childLevel = level - 1;
      if (childLevel === 0) {
        /// 对0进行加速
        for (const dirtyBranchId of branchHashInfo.subDirty) {
          const blockHash = await this._getBlockHash(dirtyBranchId);
          if (blockHash.length === 0 /* EMPTY_SHA256 */) {
            branchHashInfo.subHash.delete(branchId);
          } else {
            branchHashInfo.subHash.set(branchId, blockHash);
          }
        }
      } else {
        for (const dirtyBranchId of branchHashInfo.subDirty) {
          const hash = await this._getBranchHash(dirtyBranchId, childLevel);
          if (hash.length === 0 /* EMPTY_SHA256 */) {
            branchHashInfo.subHash.delete(branchId);
          } else {
            branchHashInfo.subHash.set(branchId, hash);
          }
        }
      }
      // 清除脏信息
      branchHashInfo.subDirty.clear();
    }
    /// 重新进行hash计算
    const sortSubHashList = [...branchHashInfo.subHash].sort(
      (a, b) => a[0] - b[0],
    );
    switch (sortSubHashList.length) {
      case 0:
        branchHashInfo.hash = EMPTY_SHA256;
        break;
      case 1:
        branchHashInfo.hash = sortSubHashList[0][1];
        break;
      default:
        const hashBuilder = this.cryptoHelper.sha256HashBuilder();
        for (const childHash of sortSubHashList) {
          hashBuilder.update(childHash[1]);
        }
        branchHashInfo.hash = await hashBuilder.digest();
    }
    branchHashInfo.dirty = false;
    // 保存新的计算结果
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

const getLowIndexe = (
  sign: Uint8Array,
  indexedDigit: IndexedDigit.Low,
): number => {
  switch (indexedDigit) {
    case 8:
      return sign[0] || 0;
    case 16: // Big endian
      return ((sign[0] || 0) << 8) + (sign[1] || 0);
    case 32:
      return (getLowIndexe(sign, 16) << 16) + getLowIndexe(sign.slice(16), 16);
  }
};
const getHighIndexe = (
  sign: Uint8Array,
  indexedDigit: IndexedDigit.High,
): bigint => {
  switch (indexedDigit) {
    case 64:
      return (
        (BigInt(getLowIndexe(sign, 32)) << 32n) +
        BigInt(getLowIndexe(sign.slice(32), 32))
      );
    case 128:
      return (
        (BigInt(getHighIndexe(sign, 64)) << 64n) +
        BigInt(getHighIndexe(sign.slice(64), 64))
      );
    case 256:
      return (
        (BigInt(getHighIndexe(sign, 128)) << 128n) +
        BigInt(getHighIndexe(sign.slice(128), 128))
      );
  }
};

const getIndexe = (
  sign: Uint8Array,
  indexedDigit: IndexedDigit,
): number | bigint => {
  if (indexedDigit <= 32) {
    return getLowIndexe(sign, indexedDigit as IndexedDigit.Low);
  }
  return getHighIndexe(sign, indexedDigit as IndexedDigit.High);
};

export declare namespace CryptolaliaTimelineTree {
  type BranchData<D> = {
    indexedDigit: IndexedDigit;
    mapData: Map<bigint | number, D>;
  };
}
const EMPTY_SHA256 = new Uint8Array(0);

type BranchHashInfo = {
  hash: Uint8Array;
  dirty: boolean;
  subDirty: Set<number>;
  subHash: Map<number, Uint8Array>;
};

type IndexedDigit = IndexedDigit.Low | IndexedDigit.High;
declare namespace IndexedDigit {
  type Low = 8 | 16 | 32;
  type High = 64 | 128 | 256;
}
