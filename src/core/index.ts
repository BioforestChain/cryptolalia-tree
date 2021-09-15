import { CryptolaliaConfig } from "./Cryptolalia";
import { AnyBlob, Paths, StorageAdaptor } from "./StorageAdaptor";
import { TimeHelper } from "./TimeHelper";

/**
 * 树状的时间线
 * 用来根据发送者的发送时间来管理接收的数据
 * 这种结构在不同节点之间可以进行信息同步
 */
export class CryptolaliaTimelineTree {
  constructor(
    private config: CryptolaliaConfig,
    private timeHelper: TimeHelper,
    private cryptoHelper: CryptoHelper,
    private storage: StorageAdaptor,
  ) {}
  private _calcBranchId(leafTime: number) {
    const relativeLeafTime = leafTime - this.config.startTime;
    if (relativeLeafTime < 0) {
      throw new RangeError("invald time: " + leafTime);
    }

    return this._calcNextBranchId(relativeLeafTime);
  }
  private _calcNextBranchId(branchId: number) {
    let nextBranchId = Math.ceil(branchId / this.config.timespan);
    if (nextBranchId % 1 === 0) {
      nextBranchId += 1;
    }
    return nextBranchId;
  }
  private _calcBranchIdRange(highLevelBranchId: number) {
    const start = (highLevelBranchId - 1) * this.config.timespan;
    const end = start + this.config.timespan - 1;
    return { start: start, end: end };
  }
  private _calcLevelBranchIdWith(leafTime: number, level: number) {
    let levelBranchId = this._calcBranchId(leafTime);
    for (let l = 0; l <= level; ++l) {
      levelBranchId = Math.ceil(levelBranchId / this.config.timespan);
    }
    return levelBranchId;
  }

  async addLeaf(leaf: Uint8Array, time: number) {
    const branchIdId = this._calcBranchId(time);

    const level1Path = ["timeline-tree", `block-${branchIdId}`];
    const json =
      (await this.storage.getJson<TimelineLeafModal[]>(level1Path)) || [];
    json.push({
      leafTime: time,
      content: leaf,
    });
    this.storage.setJson(level1Path, json);

    /// 逐级删除tree的hash记录
    let level = 1;
    let levelBranchId = branchIdId;
    do {
      const paths = [
        "timeline-tree-hash",
        `level-${level}`,
        `branch-${levelBranchId}`,
      ];
      if (!(await this.storage.has(paths))) {
        break;
      }
      await this.storage.del(paths);
      level += 1;
      levelBranchId = this._calcNextBranchId(levelBranchId);
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
  ) {
    const { start, end } = this._calcBranchIdRange(branchId);
    const hashList: Uint8Array[] = [];
    if (level === 1) {
      const level1Paths = ["timeline-tree", `block-0`];
      for (let b = start; b <= end; ++b) {
        level1Paths[1] = `block-${b}`;
        const blob = await this.storage.getBlob(level1Paths);
        if (blob) {
          hashList.push(await this.cryptoHelper.sha256Blob(blob));
        }
      }
    } else {
      const levelPaths = [
        "timeline-tree-hash",
        `level-${level - 1}`,
        `branch-0`,
      ];
      for (let b = start; b <= end; ++b) {
        levelPaths[2] = `branch-${b}`;
        const hash = await this.storage.getBinary(levelPaths);
        if (hash) {
          hashList.push(hash);
        }
      }
    }
    if (hashList.length === 0) {
      return EMPTY_SHA256;
    }
    const hash = await hashList
      .reduce(
        (hashBuilder, hash) => hashBuilder.update(hash),
        this.cryptoHelper.sha256HashBuilder(),
      )
      .digest();

    this.storage.setBinary(paths, hash);
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
    let branchId = this._calcBranchId(leafTime);
    const routeHashList = [
      {
        level,
        branchId,
        hash: await this._getBranchHash(level, branchId),
      },
    ];
    while (branchId !== 1) {
      branchId = this._calcNextBranchId(branchId);
      level += 1;
      routeHashList.push({
        level,
        branchId,
        hash: await this._getBranchHash(level, branchId),
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
    const { start, end } = this._calcBranchIdRange(branchId);
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

abstract class CryptoHelper {
  abstract sha256Blob(blob: AnyBlob): Promise<Uint8Array>;
  abstract sha256HashBuilder(): HashBuilder;
}
abstract class HashBuilder {
  abstract update(binary: Uint8Array): this;
  abstract digest(): Promise<Uint8Array>;
}

const EMPTY_SHA256 = new Uint8Array(32);
