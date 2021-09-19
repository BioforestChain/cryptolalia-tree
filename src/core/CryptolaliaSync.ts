import { TimeHelper } from "#TimeHelper";
import { Injectable, Inject, PromiseOut, ModuleStroge } from "@bfchain/util";
import { CryptolaliaTimelineTree } from "./CryptolaliaTimelineTree";

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
    private timeHelper: TimeHelper,
    private moduleMap: ModuleStroge,
  ) {
    /// 监听数据请求，提供数据响应服务
    syncChannel.onMessage((data) => {
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
    });
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
  requestMessage<I extends CryptolaliaSync.Msg.In<CryptolaliaSync.SyncMsg<D>>>(
    msg: I,
    opts?: { signal?: AbortSignal },
  ) {
    return new Promise<
      CryptolaliaSync.Msg.GetOut<CryptolaliaSync.SyncMsg<D>, I>
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
  async doSync() {
    const now = this.timeHelper.now();
    debugger;
    const localeBranchRoute = await this.timelineTree.getBranchRoute(now);
    console.log("localeBranchRoute", localeBranchRoute);

    const remoteBranchRoute = await this.requestMessage({
      cmd: SYNC_MSG_CMD.GET_BRANCH_ROUTE,
      leafTime: now,
    });

    console.log("remoteBranchRoute", remoteBranchRoute);
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
    for (const task of this._queue.values()) {
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

interface MessaageChannel<T> {
  postMessage(msg: [number, CryptolaliaSync.Msg.InOut<T>]): void;
  onMessage(
    callback: (msg: [number, CryptolaliaSync.Msg.InOut<T>]) => unknown,
  ): void;
}

export declare namespace CryptolaliaSync {
  type Channel<D> = MessaageChannel<SyncMsg<D>>;

  type Msg<I = unknown, O = unknown> = { In: I; Out: O };
  namespace Msg {
    type InOut<S> = In<S> | Out<S>;
    type In<S> = S extends Msg<infer I, infer _> ? I : never;
    type Out<S> = S extends Msg<infer _, infer O> ? O : never;
    type GetOut<S, I> = S extends Msg<infer In, infer O>
      ? I extends In
        ? O
        : never
      : never;
  }

  type SyncMsg<D> =
    | Sync.BranchRouteMsg<D>
    | Sync.BranchChildrenMsg<D>
    | Sync.DownloadByBranchIdMsg<D>
    | Sync.AbortMsg
    | Sync.RefuseMsg;
  namespace Sync {
    type BranchRouteMsg<D> = Msg<
      { cmd: SYNC_MSG_CMD.GET_BRANCH_ROUTE; leafTime: number },
      BFChainUtil.PromiseReturnType<
        CryptolaliaTimelineTree<D>["getBranchRoute"]
      >
    >;
    type BranchChildrenMsg<D> = Msg<
      {
        cmd: SYNC_MSG_CMD.GET_BRANCH_CHILDREN;
        branchId: number;
        level: number;
      },
      BFChainUtil.PromiseReturnType<
        CryptolaliaTimelineTree<D>["getBranchChildren"]
      >
    >;
    type DownloadByBranchIdMsg<D> = Msg<
      { cmd: SYNC_MSG_CMD.DOWNLOAD_BY_BRANCHID; branchId: number },
      BFChainUtil.PromiseReturnType<CryptolaliaTimelineTree<D>["getBranchData"]>
    >;
    /**中断请求 */
    type AbortMsg = Msg<{ cmd: SYNC_MSG_CMD.ABORT; reqId: number }, void>;
    /**拒绝响应 */
    type RefuseMsg = Msg<{ cmd: SYNC_MSG_CMD.REFUSE; reqId: number }, void>;
  }

  type ResponserTaskType<D> = {
    reqId: number;
    args: CryptolaliaSync.Msg.In<
      | CryptolaliaSync.Sync.BranchRouteMsg<D>
      | CryptolaliaSync.Sync.BranchChildrenMsg<D>
      | CryptolaliaSync.Sync.DownloadByBranchIdMsg<D>
    >;
    controller?: AbortController;
  };
}
