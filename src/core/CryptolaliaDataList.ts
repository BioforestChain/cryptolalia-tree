import { TimeHelper } from "#TimeHelper";
import { Injectable, PromiseOut } from "@bfchain/util";
import { getJsObject } from "./core";
import { CryptolaliaConfig } from "./CryptolaliaConfig";
import { requestTransaction, Storage, TransactionStorage } from "./Storage";

const compareUp = (t1: number, t2: number) => (t1 < t2 ? -1 : t1 > t2 ? 1 : 0);
const compareDown = (t1: number, t2: number) =>
  t1 < t2 ? 1 : t1 > t2 ? -1 : 0;
@Injectable()
class BranchHanlder<D> {
  constructor(
    private config: CryptolaliaConfig,
    private timeHelper: TimeHelper, // private storage: Storage,
  ) {}

  private _cache = new Map<
    number,
    {
      lastUpdateTime: number;
      dataList: BFChainUtil.PromiseMaybe<
        Array<CryptolaliaDataList.DataItem<D>>
      >;
      writerQueue?: PromiseOut<void>;
    }
  >();
  getDataList(transaction: TransactionStorage, branchId: number) {
    const paths = [`receipt-${branchId}`];
    let cache = this._cache.get(branchId);
    if (!cache) {
      cache = {
        lastUpdateTime: this.timeHelper.now(),
        dataList: getJsObject(
          transaction,
          paths,
          (dataList?: Array<CryptolaliaDataList.DataItem<D>>) => dataList || [],
        ),
      };
      this._cache.set(branchId, cache);

      /// 简单的缓存清理机制，清理过期缓存
      if (this._cache.size > 3) {
        const now = this.timeHelper.now();
        for (const [key, cache] of this._cache) {
          /// 如果缓存还没有超过10s，那么后面的肯定都还没有，直接结束循环
          if (cache.lastUpdateTime + 1e4 > now) {
            break;
          }
          /// 如果有写入任务，跳过(理论上不该有，如果有，说明这里的异步任务已经卡了有10s了，可能在断点调试？)
          if (cache.writerQueue === undefined) {
            this._cache.delete(key);
          }
        }
      }
    }
    return cache.dataList;
  }
  setDataList(
    transaction: TransactionStorage,
    branchId: number,
    dataList: Array<CryptolaliaDataList.DataItem<D>>,
  ) {
    let cache = this._cache.get(branchId);
    const now = this.timeHelper.now();
    if (cache) {
      this._cache.delete(branchId); // 删掉在重新写入，是为了进入到队列的莫欸
      cache.lastUpdateTime = now;
      cache.dataList = dataList;
    } else {
      cache = { dataList, lastUpdateTime: now };
    }
    this._cache.set(branchId, cache);

    /// 构建一个异步写入的任务
    let wirterQueue = cache.writerQueue;
    if (wirterQueue === undefined) {
      wirterQueue = cache.writerQueue = new PromiseOut();
      const _cache = cache;
      const _wirterQueue = wirterQueue;
      queueMicrotask(async () => {
        const paths = [`receipt-${branchId}`];
        _cache.writerQueue = undefined;
        /// 正式写入
        try {
          await transaction.setJsObject(paths, _cache.dataList);
          _wirterQueue.resolve();
        } catch (err) {
          _wirterQueue.reject(err);
        }
      });
    }
    return wirterQueue.promise;
  }

  /**缓存最近使用一个数据 */
  private _metaCache?: {
    groupId: number;
    cache: BFChainUtil.PromiseMaybe<BranchMetaGroup | undefined>;
  };
  /**
   * 这里只是简单地做二级分组，足够满足绝大多数使用场景的响应速度
   * 这里假设2小时为一个branch，64为一个group，使用这套算法的那个人活100年。
   * 那么一生只会有不到7000个group，用强遍历也没问题~~
   */
  private _getBranchMetaGroup(
    transaction: TransactionStorage,
    groupId: number,
  ) {
    if (this._metaCache?.groupId !== groupId) {
      this._metaCache = {
        groupId,
        cache: undefined,
      };
      const metaCache = this._metaCache;
      getJsObject(
        transaction,
        ["meta-branch", `group-${groupId}`],
        (map?: BranchMetaGroup) => {
          metaCache.cache = map;
          return map;
        },
      );
    }
    return this._metaCache.cache;
  }
  private _setBranchMetaGroup(
    transaction: TransactionStorage,
    groupId: number,
    metaGroup: BranchMetaGroup,
  ) {
    this._metaCache = { groupId, cache: metaGroup };
    return transaction.setJsObject<BranchMetaGroup>(
      ["meta-branch", `group-${groupId}`],
      metaGroup,
    );
  }
  async getBranchMeta(transaction: TransactionStorage, branchId: number) {
    const groupId = this.config.calcNextBranchId(branchId);
    const group = await this._getBranchMetaGroup(transaction, groupId);
    return group?.map.get(branchId);
  }
  async setBranchMeta(
    transaction: TransactionStorage,
    branchId: number,
    meta: BranchMeta,
  ) {
    const groupId = this.config.calcNextBranchId(branchId);
    const group = (await this._getBranchMetaGroup(transaction, groupId)) || {
      groupId,
      map: new Map(),
    };
    group.map.set(branchId, meta);
    return this._setBranchMetaGroup(transaction, groupId, group);
  }
  async upsertBranchMeta(
    transaction: TransactionStorage,
    branchId: number,
    metaSlice: Partial<BranchMeta>,
  ) {
    const meta = (await this.getBranchMeta(transaction, branchId)) || {
      preBranchId: branchId,
      nextBranchId: branchId,
    };
    return this.setBranchMeta(
      transaction,
      branchId,
      Object.assign(meta, metaSlice),
    );
  }

  async *BranchIdWalker(
    transaction: TransactionStorage,
    startBranchId: number,
    order = ORDER.UP,
  ) {
    const startGroupId = this.config.calcNextBranchId(startBranchId);
    let metaGroup: BranchMetaGroup | undefined;
    // 如果可以，先在同组里头查找，注意，这里可能因为startBranchId本身就是临界值，所以可能找空。但我们可以使用next/pre的指针来进行索引
    metaGroup = await this._getBranchMetaGroup(transaction, startGroupId);

    /// 找不到，进度暴力遍历模式，列出所有的组
    if (metaGroup === undefined) {
      const { files: keys } = await transaction.listPaths(["meta-branch"]);
      const groupIdList: number[] = [];
      for (const key of keys) {
        if (key.startsWith("group-")) {
          groupIdList.push(+key.slice(6));
        }
      }
      groupIdList.sort(order === ORDER.DOWN ? compareDown : compareUp);

      let index = groupIdList.findIndex(
        (groupId) => compareUp(startGroupId, groupId) !== order,
      );

      if (index === -1) {
        return;
      }
      while (index < groupIdList.length) {
        const groupId = groupIdList[index];
        metaGroup = await this._getBranchMetaGroup(transaction, groupId);
        if (metaGroup === undefined) {
          console.error(
            new Error(
              `数据库异常，可能发生数据丢失(${transaction.currentPaths}, ${[
                "meta-branch",
                `group-${groupId}`,
              ]})`,
            ),
          );
          index++;
        } else {
          break;
        }
      }
    }

    do {
      if (metaGroup === undefined) {
        return;
      }

      /// 开始遍历metaGroup里头的元素，并根据meta的信息一直往下循环
      const branchIdList = [...metaGroup.map.keys()].sort(
        order === ORDER.DOWN ? compareDown : compareUp,
      );
      if (branchIdList.length === 0) {
        throw new Error(
          `数据库异常，可能是数据丢失，索引断链，需要重新整理数据重建索引(${transaction.currentPaths}, ${metaGroup.groupId})`,
        );
      }
      /**
       * startBranchId: 3
       * order:  1
       * branchIdList:  1, 2, 3, 4, 5, 6
       * compareUp:     1, 1, 0,-1,-1,-1
       * compareDown:  -1,-1, 0, 1, 1, 1
       *
       * order: -1
       * branchIdList:  6, 5, 4, 3, 2, 1
       * compareUp:    -1,-1,-1, 0, 1, 1
       * compareDown:   1, 1, 1, 0,-1,-1
       */
      let index = branchIdList.findIndex(
        (branchId) => compareDown(startBranchId, branchId) === order,
      );

      if (index !== -1) {
        do {
          yield branchIdList[index];
        } while (++index < branchIdList.length);
      }
      /// 定位到下一个metaGroup
      const lastBranchMeta = metaGroup.map.get(
        branchIdList[branchIdList.length - 1],
      )!;
      const nextBranchId =
        order === ORDER.UP
          ? lastBranchMeta.nextBranchId
          : lastBranchMeta.preBranchId;
      const nextGroupId = this.config.calcNextBranchId(nextBranchId);
      /// 下一个groupId与当前的的一样，说明已经遍历到末尾了
      if (nextGroupId === metaGroup.groupId) {
        return;
      }
      metaGroup = await this._getBranchMetaGroup(transaction, nextGroupId);
    } while (true);
  }
}

export declare namespace CryptolaliaDataList {
  type DataItem<D> = {
    insertTime: number;
    data: D;
  };
}
/**方便定位上一片、下一片数据的位置
 * 因为它本来是一个数组，只是因为分片技术而分成多片
 */
type BranchMeta = {
  preBranchId: number;
  nextBranchId: number;
};
type BranchMetaGroup = { groupId: number; map: Map<number, BranchMeta> };

@Injectable()
class MetaHanlder<D> {
  constructor(
    private config: CryptolaliaConfig,
    private timeHelper: TimeHelper,
    // private storage: Storage,
    private _branchHanlder: BranchHanlder<D>,
  ) {}
  private _meta?: BFChainUtil.PromiseMaybe<Meta>;
  getMeta(transaction: TransactionStorage) {
    if (this._meta === undefined) {
      this._meta = getJsObject(transaction, ["meta"], async (meta?: Meta) => {
        /// 需要进行校准操作
        if (meta) {
          /// 因为可能写入了时间之后才写入了data-item
          if (meta.firstBranchId !== 0) {
            const dataList = await this._branchHanlder.getDataList(
              transaction,
              meta.firstBranchId,
            );
            if (dataList.length === 0) {
              meta.firstBranchId = 0;
            }
          }

          if (meta.lastBranchId !== meta.secondLastBranchId) {
            const dataList = await this._branchHanlder.getDataList(
              transaction,
              meta.lastBranchId,
            );
            if (dataList.length === 0) {
              meta.lastBranchId = meta.secondLastBranchId;
            }
          }
        }
        return (this._meta = meta ?? {
          firstBranchId: 0,
          lastBranchId: 0,
          secondLastBranchId: 0,
        });
      });
    }
    return this._meta;
  }
  setMeta(transaction: TransactionStorage, meta: Meta) {
    return transaction.setJsObject(["meta"], meta);
  }
}
/**
 * dataList的元数据信息，用来快速定位起点和终点
 * 因为branchId起点值是1，所以0代表空置
 */
type Meta = {
  /**第一个数据写入的时间分区，用来快速定位起点 */
  firstBranchId: number;
  /**最后一个数据写入的时间分区，用来快速定位起点 */
  lastBranchId: number;
  /**这边存储倒数两个时间分区，其中secondLast是已经确定数据库中存有的值，last则是预期中最后的一个值，可能数据库被中途打断，没有真正写入，所以pre可以用来校准恢复 */
  secondLastBranchId: number;
};

/**
 * 数据列表
 * 根据自己接收到的数据来打上唯一的接收时间戳，并按接收时间归档
 */
@Injectable()
export class CryptolaliaDataList<D> {
  constructor(
    private config: CryptolaliaConfig,
    private timeHelper: TimeHelper,
    storage: Storage,
    private _branchHanlder: BranchHanlder<D>,
    private _metaHanlder: MetaHanlder<D>,
  ) {
    this._store = storage.fork(["datalist"]);
  }
  private _store: Storage;

  /**梳理元数据 */
  private async _upsertMetaWhenAddNewItem(
    transaction: TransactionStorage,
    branchId: number,
  ) {
    const meta = await this._metaHanlder.getMeta(transaction);
    if (meta.firstBranchId === 0) {
      meta.firstBranchId = branchId;
      meta.secondLastBranchId = branchId;
      meta.lastBranchId = branchId;
      await this._metaHanlder.setMeta(transaction, meta);
    } else if (meta.lastBranchId !== branchId) {
      const preBranchId = (meta.secondLastBranchId = meta.lastBranchId);
      meta.lastBranchId = branchId;
      await this._metaHanlder.setMeta(transaction, meta);
      await this._branchHanlder.upsertBranchMeta(transaction, preBranchId, {
        nextBranchId: branchId,
      });
      await this._branchHanlder.setBranchMeta(transaction, branchId, {
        preBranchId,
        nextBranchId: branchId,
      });
    }
  }

  private _trs!: Promise<TransactionStorage>;
  private _perNow = 0;
  /**添加元素 */
  @requestTransaction([], "_store", "_trs")
  async addItem(data: D, time = this.timeHelper.now()) {
    const now = this.timeHelper.max(this._perNow + 1, time);
    this._perNow = now;
    const branchId = this.config.calcBranchId(now);

    const transaction = await this._trs;

    // 梳理元数据
    await this._upsertMetaWhenAddNewItem(transaction, branchId);

    const dataList = await this._branchHanlder.getDataList(
      transaction,
      branchId,
    );
    dataList.push({
      insertTime: now,
      data: data,
    });
    await this._branchHanlder.setDataList(transaction, branchId, dataList);

    return time;
  }
  /**同一时间添加多个元素 */
  @requestTransaction([], "_store", "_trs")
  async addManyItem(datas: Iterable<D>, time = this.timeHelper.now()) {
    const transaction = await this._trs;
    let dataList: Array<CryptolaliaDataList.DataItem<D>> | undefined;
    let perBranchId = 0;
    const timeList: number[] = [];
    for (const data of datas) {
      const now = this.timeHelper.max(this._perNow + 1, time);
      timeList.push(now);
      this._perNow = now;
      const branchId = this.config.calcBranchId(now);
      if (branchId !== perBranchId) {
        perBranchId = branchId;
        // 梳理元数据
        await this._upsertMetaWhenAddNewItem(transaction, branchId);
        if (dataList) {
          await this._branchHanlder.setDataList(
            transaction,
            branchId,
            dataList,
          );
          dataList = undefined;
        }
      }
      if (dataList === undefined) {
        dataList = await this._branchHanlder.getDataList(transaction, branchId);
      }
      dataList.push({
        insertTime: now,
        data: data,
      });
    }

    if (dataList) {
      await this._branchHanlder.setDataList(transaction, perBranchId, dataList);
    }
    return timeList;
  }
  /**从某一个时间点开始读取数据 */
  async *ItemReader(timestamp: number, order = ORDER.UP) {
    let branchWalker: AsyncGenerator<number> | undefined;
    let branchId = this.config.calcBranchId(timestamp);
    do {
      const dataList = await this._branchHanlder.getDataList(
        this._store,
        branchId,
      );

      let start = 0;
      let end = dataList.length;
      if (dataList.length !== 0) {
        if (order === ORDER.DOWN) {
          start = end - 1;
          end = -1;
          // [start, end] = [end, start];
        }

        while (start !== end) {
          const item = dataList[start];
          /**
           * timestamp: 3
           * order:  1
           * dataList:  1, 2, 3, 4, 5, 6
           * compare:   1, 1, 0,-1,-1,-1
           *
           * order: -1
           * dataList:  6, 5, 4, 3, 2, 1
           * compare:  -1,-1,-1, 0, 1, 1
           */
          if (compareUp(timestamp, item.insertTime) !== order) {
            yield item;
          }

          start += order;
        }
      }

      branchWalker ??= this._branchHanlder.BranchIdWalker(
        this._store,
        branchId,
        order,
      );
      const walkInfo = await branchWalker.next();
      if (walkInfo.done) {
        return;
      }
      branchId = walkInfo.value;
    } while (true);
  }
}

export const enum ORDER {
  UP = 1,
  DOWN = -1,
}
