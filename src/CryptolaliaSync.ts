import { TimeHelper } from "#TimeHelper";
import { Inject, Injectable } from "@bfchain/util-dep-inject";
import { PromiseOut } from "@bfchain/util-extends-promise-out";
import { CryptolaliaTypes } from "./@types";
import { addManyMsg, CryptolaliaCore } from "./core";
import { CryptolaliaDataList } from "./CryptolaliaDataList";
import { CryptolaliaTimelineTree } from "./CryptolaliaTimelineTree";
import { MessageHelper } from "./MessageHelper";

const ARGS = {
  SYNC_CHANNE: Symbol("syncChannnel"),
};
/**
 * 同步模块，用于提供两个节点同步所需的数据，以及该数据解析；并最终将同步结果写入到本地数据库中
 */
@Injectable()
export class CryptolaliaSync<D = unknown> {
  static readonly ARGS = ARGS;
  constructor(
    @Inject(ARGS.SYNC_CHANNE)
    private syncChannel: CryptolaliaSync.Channel<D>,
    private timelineTree: CryptolaliaTimelineTree<D>,
    private dataList: CryptolaliaDataList<CryptolaliaCore.RawDataItem>,
    private timeHelper: TimeHelper,
    private msgHelper: MessageHelper<D>,
  ) {
    /// 监听数据请求，提供数据响应服务
    syncChannel.onMessage = (data) => {
      if (
        !(Array.isArray(data) && data.length === 2) /* &&
        typeof msg[0] === "number" */
      ) {
        return;
      }
      const [reqId, msg] = data;
      /// req
      if (msg && "cmd" in msg) {
        if (msg.cmd === SYNC_MSG_CMD.ABORT) {
          const task = this.taskSeq.get(msg.reqId);
          if (task) {
            this.taskSeq.delete(msg.reqId);
            task.controller?.abort();
          }
          return;
        }
        if (msg.cmd === SYNC_MSG_CMD.REFUSE) {
          const req = this._reqMap.get(msg.reqId);
          if (req) {
            // this._reqMap.delete(msg.reqId);
            req.reject(REASON_REFUSE_BY_REMOTE);
          }
          return;
        }
        if (
          this.taskSeq.push(reqId, {
            reqId,
            args: msg,
            controller: undefined, // new AbortController(),
          }) === false
        ) {
          this.syncChannel.postMessage([
            0,
            { cmd: SYNC_MSG_CMD.REFUSE, reqId },
          ]);
        }
      }
      /// res
      else {
        const req = this._reqMap.get(reqId);
        if (req) {
          this._reqMap.delete(reqId);
          req.resolve(msg);
        }
      }
    };
    /// 使用队列机制来进行响应任务
    this.responser.startResponse();
  }

  private taskSeq = new Sequencer<CryptolaliaSync.ResponserTaskType<D>, number>(
    {},
  );
  readonly responser = new Responser<CryptolaliaSync.ResponserTaskType<D>>(
    this.taskSeq,
    {
      executeTask: async ({ reqId, args }) => {
        switch (args.cmd) {
          case SYNC_MSG_CMD.GET_BRANCH_ROUTE:
            {
              const res = await this.timelineTree.getBranchRoute(args.leafTime);
              this.syncChannel.postMessage([reqId, res]);
            }
            break;
          case SYNC_MSG_CMD.GET_BRANCH_CHILDREN:
            {
              const res = await this.timelineTree.getBranchChildren(
                args.branchId,
                args.level,
              );
              this.syncChannel.postMessage([reqId, res]);
            }
            break;
          case SYNC_MSG_CMD.DOWNLOAD_BY_BRANCHID:
            {
              const res = await this.timelineTree.getBranchData(args.branchId);
              this.syncChannel.postMessage([reqId, res]);
            }
            break;
          default:
            console.error("unknown task cmd:", args);
        }
      },
    },
  );
  /**reqId默认从1开始，0留给abort等特殊信号 */
  private _reqIdAcc = 1;
  private _reqMap = new Map<
    number,
    {
      resolve: (data: any) => void;
      reject: (reason: unknown) => void;
    }
  >();
  requestMessage<I extends CryptolaliaTypes.Msg.In<CryptolaliaSync.SyncMsg<D>>>(
    msg: I,
    opts?: { signal?: AbortSignal },
  ) {
    return new Promise<
      CryptolaliaTypes.Msg.GetOut<CryptolaliaSync.SyncMsg<D>, I>
    >((resolve, reject) => {
      const signal = opts?.signal;
      /// 如果有中断信号，需要对信号做一些额外的操作
      if (signal) {
        const _reject = reject;
        reject = (e) => {
          // 删除回调
          this._reqMap.delete(reqId);
          // 发送请求中断信号
          if (e !== REASON_REFUSE_BY_REMOTE) {
            this.syncChannel.postMessage([
              0,
              { cmd: SYNC_MSG_CMD.ABORT, reqId },
            ]);
          }
          // 继续返回异常
          _reject(e);
        };
        signal.addEventListener("abort", reject);
        const _resolve = resolve;
        resolve = (r) => {
          // 移除对中断信号的监听
          signal.removeEventListener("abort", reject);
          _resolve(r);
        };
      }
      const reqId = this._reqIdAcc++;
      this._reqMap.set(reqId, { resolve, reject });
      // 发送请求
      this.syncChannel.postMessage([reqId, msg]);
    });
  }

  /**
   * 单方面同步对方节点的数据
   * @tip 这里同步并不是要实现两边完全一致。因为我们无法强制让对方下载我们的数据，而只能让自己的数据尽可能完整
   * @tip 所以在这里，如果对方不进行协同同步，会导致每一次比对数据的成本其实是非常高的。因为我并不知道对方数据与我为什么不一致，只能尽可能地下载对面的数据过来比对。
   * @todo 实现双方协同同步算法，让两边同时完成同步，减少不必要的损耗
   */
  async doSync(now = this.timeHelper.now()) {
    const { msgHelper, timelineTree, dataList } = this;
    const ignores = new SyncIgnores();
    const newMsgCollection: D[][] = [];

    const localeBranchRoute = await timelineTree.getBranchRoute(now);

    const remoteBranchRoute = await this.requestMessage({
      cmd: SYNC_MSG_CMD.GET_BRANCH_ROUTE,
      leafTime: now,
    });

    /// 对比两端的BranchRoute，从 high-level 到 low-level 进行同步。虽然这样就意味着随着level的增加每一次同步的成本也会增加，但这样可以确保差异数据的收取是根据时间顺序来的
    localeBranchRoute.sort((a, b) => b.level - a.level);
    remoteBranchRoute.sort((a, b) => b.level - a.level);

    // console.log("localeBranchRoute", localeBranchRoute);
    // console.log("remoteBranchRoute", remoteBranchRoute);

    /// 只需要对比最顶部的hash是否一致，就能知道需不需要进行数据同步
    const localeTopBranch = localeBranchRoute[0];
    const remoteTopBranch = remoteBranchRoute[0];

    const {
      branchId: topBranchId,
      level: topLevel,
      hash: topHash,
    } = remoteTopBranch;
    if (
      localeTopBranch.branchId !== topBranchId ||
      localeTopBranch.level !== topLevel
    ) {
      throw new Error(
        `invalid remote branch info: ${topLevel}(level)/${topBranchId}/(branchId) when ${new Date(
          now,
        ).toLocaleString()}`,
      );
    }

    if (
      // 如果远端没有数据，直接跳过，无需同步
      topHash.length === 0 ||
      // 签名一致，无需同步
      msgHelper.signIsSign(localeTopBranch.hash, topHash)
    ) {
      return false;
    }

    /// 同步数据，收集缺失的数据
    await this._syncBranch(
      msgHelper,
      timelineTree,
      dataList,
      topBranchId,
      topLevel,
      ignores,
      newMsgCollection,
    );

    // 如果有缺失数据，在本地进行保存
    if (newMsgCollection.length > 0) {
      await addManyMsg(
        msgHelper,
        timelineTree,
        dataList,
        newMsgCollection.flat(),
      );
      return true;
    }
    return false;
  }

  /**
   *
   * @param msgHelper
   * @param timelineTree
   * @param dataList
   * @param branchId
   * @param level
   * @returns 是否有本地缺失的数据？
   */
  private async _syncBranch(
    msgHelper: MessageHelper<D>,
    timelineTree: CryptolaliaTimelineTree<D>,
    dataList: CryptolaliaDataList<CryptolaliaCore.RawDataItem>,
    branchId: number,
    level: number,
    ignores: SyncIgnores,
    newMsgCollection: D[][],
  ): Promise<boolean> {
    // 被列入忽略名单，已经通过过，本次任务内无需再同步
    if (ignores.has(branchId, level)) {
      return false;
    }

    if (level === 0) {
      const remoteBranchData = await this.requestMessage({
        cmd: SYNC_MSG_CMD.DOWNLOAD_BY_BRANCHID,
        branchId: branchId,
      });
      if (remoteBranchData === undefined) {
        /// 数据空了？可能对方删除了数据？
        return false;
      }

      /// 写入远端的数据（会自动合并本地数据）
      const remoteMsgList = [...remoteBranchData.mapData.values()];
      const hasMsgList = await timelineTree.hasManyLeaf(remoteMsgList);
      const newMsgList = remoteMsgList.filter(
        (_, i) => hasMsgList[i] === false,
      );
      // console.log("remoteMsgList", remoteMsgList);
      // console.log("hasMsgList", hasMsgList);
      if (newMsgList.length > 0) {
        newMsgCollection.push(newMsgList);
        return true;
      }
      return false;
    }

    /// level !== 0
    const remoteBranchChildren = await this.requestMessage({
      cmd: SYNC_MSG_CMD.GET_BRANCH_CHILDREN,
      branchId: branchId,
      level: level,
    });
    const localBranchChildren = await timelineTree.getBranchChildren(
      branchId,
      level,
    );

    /// 找出差集
    const diffBranchIdList: number[] = [];
    for (const [branchId, remoteHash] of remoteBranchChildren) {
      const localeHash = localBranchChildren.get(branchId);
      if (
        (localeHash !== undefined &&
          msgHelper.signIsSign(remoteHash, localeHash)) === false
      ) {
        diffBranchIdList.push(branchId);
      }
    }
    diffBranchIdList.sort();
    // console.log("parentLevel", level, "diffBranchIdList", diffBranchIdList);
    let hasChanged = false;
    for (const diffBranchId of diffBranchIdList) {
      const _hasChanged = await this._syncBranch(
        msgHelper,
        timelineTree,
        dataList,
        diffBranchId,
        level - 1,
        ignores,
        newMsgCollection,
      );
      hasChanged ||= _hasChanged;
    }

    return hasChanged;
  }
}

class SyncIgnores {
  private _s = new Map<number, Set<number>>();
  add(branchId: number, level: number) {
    let ls = this._s.get(level);
    if (ls === undefined) {
      this._s.set(level, (ls = new Set()));
    }
    ls.add(branchId);
  }
  has(branchId: number, level: number) {
    const ls = this._s.get(level);
    if (ls !== undefined) {
      return ls.has(branchId);
    }
    return false;
  }
}

const enum SYNC_MSG_CMD {
  REFUSE,
  ABORT,
  GET_BRANCH_ROUTE,
  GET_BRANCH_CHILDREN,
  DOWNLOAD_BY_BRANCHID,
}
const REASON_REFUSE_BY_REMOTE = Symbol("reason:refuse by remote");

class Sequencer<T, I = unknown> {
  constructor(
    private config: {
      /**
       * 最大队列数，如果无法合并，那么超过这个数值泽无法再添加
       * @todo
       */
      maxQueue?: number;
      /**
       * 自定义合并，添加元素时，会尝试与已有的元素进行合并
       * @todo
       */
      merger?: () => unknown;
      /**
       * 自定义排序，添加元素时，会尝试与已有的元素进行排序
       * @todo
       */
      sorter?: () => unknown;
    },
  ) {}
  private _queue = new Map<I, T>();
  private _waitter?: PromiseOut<T>;
  /**
   * 往队列中添加元素
   * @param id
   * @param item
   * @returns 如果返回 false 则意味着id冲突
   */
  push(id: I, item: T) {
    if (this._waitter) {
      this._waitter.resolve(item);
      this._waitter = undefined;
    } else {
      if (this._queue.has(id)) {
        return false;
      }
      this._queue.set(id, item);
    }
    return true;
  }
  get(id: I) {
    return this._queue.get(id);
  }
  has(id: I) {
    return this._queue.has(id);
  }
  delete(id: I) {
    return this._queue.delete(id);
  }
  /**返回队列最前面的一个元素 */
  shift() {
    if (this._queue.size === 0) {
      return (this._waitter = new PromiseOut()).promise;
    }
    for (const [key, task] of this._queue) {
      this._queue.delete(key);
      return task;
    }
    throw 1;
  }
}

/**响应器，可以用来处理任务队列 */
class Responser<T> {
  constructor(
    readonly taskSeq: Sequencer<T>,
    private config: {
      /**
       * 响应的最大频率，可以通过控制该参数来宏观地影响响应的资源的占用率
       * @todo
       */
      maxFrames?: number;
      executeTask: (task: T) => unknown;
    },
  ) {}
  private async *_ResponseQueue() {
    do {
      const task = await this.taskSeq.shift();
      try {
        await this.config.executeTask(task);
      } catch (err) {
        console.error("responser execute task error:", task, err);
      }
      yield; // 暂停，等待外部做响应频率的调控
    } while (true);
  }
  private _looper?: AsyncGenerator;

  /**开始响应 */
  startResponse() {
    if (this._looper !== undefined) {
      return false;
    }

    const looper = (this._looper = this._ResponseQueue());
    (async () => {
      for await (const _ of looper) {
        /// @TODO 这里可以做响应调控
        //  this.config.maxFrames;
      }
    })().catch((reason) => {
      console.info("responser stoped.", reason);
    });
    return true;
  }
  /**暂停响应，不会清空队列 */
  stopResponse(reason?: unknown) {
    if (this._looper === undefined) {
      return false;
    }

    this._looper.throw(reason);
    this._looper = undefined;
    return true;
  }
}

export declare namespace CryptolaliaSync {
  type Channel<D> = CryptolaliaTypes.MessageChannel<SyncMsg<D>>;

  type SyncMsg<D> =
    | Sync.BranchRouteMsg<D>
    | Sync.BranchChildrenMsg<D>
    | Sync.DownloadByBranchIdMsg<D>
    | Sync.AbortMsg
    | Sync.RefuseMsg;

  type SyncEvent<D> = CryptolaliaTypes.MessageChannel.Event<SyncMsg<D>>;
  namespace Sync {
    type BranchRouteMsg<D> = CryptolaliaTypes.Msg<
      { cmd: SYNC_MSG_CMD.GET_BRANCH_ROUTE; leafTime: number },
      BFChainUtil.PromiseReturnType<
        CryptolaliaTimelineTree<D>["getBranchRoute"]
      >
    >;
    type BranchChildrenMsg<D> = CryptolaliaTypes.Msg<
      {
        cmd: SYNC_MSG_CMD.GET_BRANCH_CHILDREN;
        branchId: number;
        level: number;
      },
      BFChainUtil.PromiseReturnType<
        CryptolaliaTimelineTree<D>["getBranchChildren"]
      >
    >;
    type DownloadByBranchIdMsg<D> = CryptolaliaTypes.Msg<
      { cmd: SYNC_MSG_CMD.DOWNLOAD_BY_BRANCHID; branchId: number },
      BFChainUtil.PromiseReturnType<CryptolaliaTimelineTree<D>["getBranchData"]>
    >;
    /**中断请求 */
    type AbortMsg = CryptolaliaTypes.Msg<
      { cmd: SYNC_MSG_CMD.ABORT; reqId: number },
      void
    >;
    /**拒绝响应 */
    type RefuseMsg = CryptolaliaTypes.Msg<
      { cmd: SYNC_MSG_CMD.REFUSE; reqId: number },
      void
    >;
  }

  type ResponserTaskType<D> = {
    reqId: number;
    args: CryptolaliaTypes.Msg.In<
      | CryptolaliaSync.Sync.BranchRouteMsg<D>
      | CryptolaliaSync.Sync.BranchChildrenMsg<D>
      | CryptolaliaSync.Sync.DownloadByBranchIdMsg<D>
    >;
    controller?: AbortController;
  };
}
