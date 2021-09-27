import {
  Injectable,
  ModuleStroge,
  Resolve,
  getInjectionToken,
} from "@bfchain/util-dep-inject";
import { PromiseOut } from "@bfchain/util-extends-promise-out";
import {
  Cryptolalia,
  Storage,
  ORDER,
  CryptolaliaSync,
  TimeHelper,
  CryptolaliaConfig,
  MessageHelper,
  CryptoHelper,
  requestTransaction,
  TransactionStorage,
} from "../../src/index";
import { CryptolaliaTypes } from "../../src/@types";
import { ChatsAppHelper } from "./Helper";

const ARGS = {
  CHATS_CHANNE: Symbol("chats-channel"),
};

const CHECK_NEVER = (v: never) => {
  throw new Error(`should never happend`);
};

@Injectable()
export class ChatsApp<
  S,
  D,
  W extends CryptolaliaTypes.Msg = CryptolaliaTypes.Msg,
> {
  static ARGS = ARGS;
  private _store: Storage;
  private _ready = new PromiseOut<void>();
  constructor(
    readonly storage: Storage,
    readonly helper: ChatsAppHelper<S, D, W>,
    readonly config: CryptolaliaConfig,
    private _timeHelper: TimeHelper,
    private _msgHelper: MessageHelper<D>,
    private _cryptoHelper: CryptoHelper,
  ) {
    this._store = storage.fork(["chat-app"]);
    this._initMemory();
    this._initMessageListen();
  }

  private _trs!: Promise<TransactionStorage>;
  /**初始化内存缓存 */
  @requestTransaction(["session"], "_store", "_trs")
  private async _initMemory() {
    const transaction = await this._trs;
    const { files: sessionList } = await transaction.listPaths([]);
    for (const sessionId of sessionList) {
      const sessionInfo = await transaction.getJsObject<S>([sessionId]);
      if (sessionInfo === undefined) {
        await transaction.del([sessionId]);
      } else {
        this._sessionMap.set(sessionId, sessionInfo);
        this._sessionList.push(sessionInfo);
      }
    }
    this._sessionList = [...this._sessionMap.values()].sort((a, b) =>
      this.helper.compare(a, b),
    );
    this._ready.resolve();
  }

  /**初始化消息监听分发
   * 并开始主动消息同步
   */
  private async _initMessageListen() {
    await this._ready.promise;
    this.helper.onNewMessage = async (msg) => {
      switch (msg[0]) {
        case CHATS_APP_MSG_TYPE.MSG:
          {
            const sessionInfo = this._sessionMap.get(msg[1]);
            if (sessionInfo === undefined) {
              return;
            }
            const lalia = this._laliaMap.get(msg[1]);
            if (lalia !== undefined) {
              if (true === (await lalia.cryptolalia.addMsg(msg[2]))) {
                await this.onNewMessage?.([msg[1], msg[2]]);
              }
            }
          }
          break;
        case CHATS_APP_MSG_TYPE.SYNC:
          {
            const lalia = this._laliaMap.get(msg[1]);
            if (lalia !== undefined) {
              await lalia.syncChannel.onMessage?.(msg[2]);
            }
          }
          break;
        case CHATS_APP_MSG_TYPE.SESSION:
          {
            await this.helper.handshakeSession?.(msg[1], msg[2]);
          }
          break;
      }
    };

    /// 根据会话顺序依次同步信息
    /**克隆一份列表，放置调整顺序带来的变动 */
    const sessionList = this._sessionList.slice();
    for (const sessionInfo of sessionList) {
      const sessionId = this.helper.getSessionId(sessionInfo);
      if (this._sessionMap.has(sessionId)) {
        const lalia = await this._getCryptolalia(sessionId);
        await lalia.cryptolalia.sync.doSync();
      }
    }
  }

  //#region 会话管理

  private _sessionMap = new Map<string, S>();
  private _sessionList: S[] = [];
  private _doSort() {
    this._sessionList.sort((a, b) => this.helper.compare(a, b));
  }

  private _orderChangeEntryCollection?: Map<
    string,
    ChatsApp.OrderChangeEntry<S>
  >;
  private get _needEmitOrderChange() {
    return this.onOrderChange !== undefined;
  }
  private _emitOrderChange(entry: ChatsApp.OrderChangeEntry<S>) {
    let collection = this._orderChangeEntryCollection;
    if (collection === undefined) {
      collection = new Map();
      const orderChangeEntryCollection = collection;
      queueMicrotask(() => {
        this._orderChangeEntryCollection = undefined;
        this.onOrderChange?.({ entries: orderChangeEntryCollection.values() });
      });
    }

    //#region 合并事件条目
    let oldEntry = collection.get(entry.sessionId);
    if (oldEntry !== undefined) {
      if (oldEntry.type === "insert") {
        if (entry.type === "insert") {
          throw new TypeError(
            `duplication insert sessionId: '${entry.sessionId}'`,
          );
        } else if (entry.type === "update") {
          oldEntry.index = entry.index;
        } else if (entry.type === "delete") {
          collection.delete(entry.sessionId);
        } else {
          CHECK_NEVER(entry.type);
        }
      } else if (oldEntry.type === "update") {
        if (entry.type === "insert") {
          throw new TypeError(`invalid insert sessionId: '${entry.sessionId}'`);
        } else if (entry.type === "update") {
          oldEntry.index = entry.index;
        } else if (entry.type === "delete") {
          collection.delete(entry.sessionId);
        } else {
          CHECK_NEVER(entry.type);
        }
      } else if (oldEntry.type === "delete") {
        if (entry.type === "insert") {
          collection.set(entry.sessionId, entry);
        } else if (entry.type === "update") {
          throw new TypeError(`invalid update sessionId: '${entry.sessionId}'`);
        } else if (entry.type === "delete") {
          throw new TypeError(
            `duplication delete sessionId: '${entry.sessionId}'`,
          );
        } else {
          CHECK_NEVER(entry.type);
        }
      } else {
        CHECK_NEVER(oldEntry.type);
      }
    } else {
      collection.set(entry.sessionId, entry);
    }
    //#endregion
  }

  /**添加一个会话 */
  async addSession(sessionId: string, sessionInfo: S) {
    this._ready.is_resolved || (await this._ready.promise);
    if (this._sessionMap.has(sessionId)) {
      return false;
    }
    this._sessionMap.set(sessionId, sessionInfo);
    this._sessionList.unshift(sessionInfo);
    this._doSort();
    await this._store.setJsObject(["session", sessionId], sessionInfo);

    if (this._needEmitOrderChange) {
      const newIndex = this._sessionList.indexOf(sessionInfo);
      this._emitOrderChange({
        type: "insert",
        index: newIndex,
        sessionId,
      });
    }

    /// 如果可以，发送握手信息
    if (this.helper.handshakeSession !== undefined) {
      const swap = await this.helper.handshakeSession(sessionId);
      if (swap !== undefined) {
        await this.helper.sendMessage(sessionInfo, [
          CHATS_APP_MSG_TYPE.SESSION,
          sessionId,
          swap,
        ]);
      }
    }

    return true;
  }
  async getSessionInfo(sessionId: string) {
    this._ready.is_resolved || (await this._ready.promise);
    return this._sessionMap.get(sessionId);
  }
  /**修改一个会话的信息 */
  async updateSession(sessionId: string, sessionInfo: S) {
    this._ready.is_resolved || (await this._ready.promise);
    const oldSessionInfo = this._sessionMap.get(sessionId);
    if (oldSessionInfo === undefined) {
      return false;
    }
    const oldIndex = this._sessionList.indexOf(oldSessionInfo);
    // 如果内存引用不一致，需要删除原本的再插入
    if (oldSessionInfo !== sessionInfo) {
      this._sessionMap.set(sessionId, sessionInfo);
      this._sessionList.splice(oldIndex, 1, sessionInfo);
    }
    this._doSort();
    await this._store.setJsObject(["session", sessionId], sessionInfo);

    if (this._needEmitOrderChange) {
      const newIndex = this._sessionList.indexOf(sessionInfo);
      this._emitOrderChange({
        type: "update",
        index: newIndex,
        oldIndex,
        sessionId,
      });
    }
    return true;
  }

  onOrderChange?: ChatsApp.OrderChangeCallback<S>;

  async getSessionList(query: { offset?: number; limit?: number } = {}) {
    this._ready.is_resolved || (await this._ready.promise);
    const { offset = 0, limit = Infinity } = query;
    return this._sessionList.slice(offset, limit + offset);
  }
  //#endregion

  //#region 信息管理

  private _laliaMap = new Map<
    string,
    { cryptolalia: Cryptolalia<D>; syncChannel: CryptolaliaSync.Channel<D> }
  >();
  private _getCryptolalia(sessionId: string) {
    let lalia = this._laliaMap.get(sessionId);
    if (lalia === undefined) {
      const syncChannel: CryptolaliaSync.Channel<D> = {
        postMessage: (msg) => {
          const sessionInfo = this._sessionMap.get(sessionId);
          if (sessionInfo === undefined) {
            return;
          }
          return this.helper.sendMessage(sessionInfo, [
            CHATS_APP_MSG_TYPE.SYNC,
            sessionId,
            msg,
          ]);
        },
      };
      const cryptolalia = Resolve<Cryptolalia<D>>(
        Cryptolalia,
        new ModuleStroge([
          [getInjectionToken(Storage)!, this.storage.fork([sessionId])],
          [CryptolaliaSync.ARGS.SYNC_CHANNE, syncChannel],
          [getInjectionToken(TimeHelper)!, this._timeHelper],
          [getInjectionToken(CryptolaliaConfig)!, this.config],
          [getInjectionToken(MessageHelper)!, this._msgHelper],
          [getInjectionToken(CryptoHelper)!, this._cryptoHelper],
        ]),
      );
      this._laliaMap.set(sessionId, (lalia = { cryptolalia, syncChannel }));
    }
    return lalia;
  }

  async sendMessage(sessionId: string, message: D) {
    this._ready.is_resolved || (await this._ready.promise);
    const sessionInfo = this._sessionMap.get(sessionId);
    if (sessionInfo === undefined) {
      return false;
    }
    const lalia = this._getCryptolalia(sessionId);
    if (await lalia.cryptolalia.addMsg(message)) {
      await this.helper.sendMessage(sessionInfo, [
        CHATS_APP_MSG_TYPE.MSG,
        sessionId,
        message,
      ]);
      return true;
    }
    return false;
  }

  /**该函数与helper里的onNewMessage不一样，该函数时过滤掉垃圾、冗余信息后，真正需要发给用户的数据 */
  onNewMessage?: ChatsApp.NewMessageCallback<[sessionId: string, message: D]>;

  async getMessageList(
    sessionId: string,
    query: {
      timestamp?: number;
      offset?: number;
      limit?: number;
      order?: ORDER;
    },
  ) {
    this._ready.is_resolved || (await this._ready.promise);
    if (this._sessionMap.has(sessionId) === false) {
      return [];
    }
    const lalia = this._getCryptolalia(sessionId);
    return lalia.cryptolalia.getMsgList(
      query.timestamp ?? this._timeHelper.now(),
      query,
    );
  }

  async doSync(sessionId: string) {
    this._ready.is_resolved || (await this._ready.promise);

    if (this._sessionMap.has(sessionId) === false) {
      return [];
    }
    const lalia = this._getCryptolalia(sessionId);
    return lalia.cryptolalia.sync.doSync();
  }
  //#endregion
}

export const enum CHATS_APP_MSG_TYPE {
  /**消息 */
  MSG,
  /**会话 */
  SESSION,
  /**同步 */
  SYNC,
}

export declare namespace ChatsApp {
  type OrderChangeEntry<S> =
    | {
        type: "insert" | "delete";
        index: number;
        sessionId: string;
      }
    | {
        type: "update";
        index: number;
        oldIndex: number;
        sessionId: string;
      };

  type OrderChangeEvent<S> = {
    entries: IterableIterator<OrderChangeEntry<S>>;
  };
  type OrderChangeCallback<S> = (event: OrderChangeEvent<S>) => unknown;

  type SessionMsg<D, W extends CryptolaliaTypes.Msg = CryptolaliaTypes.Msg> =
    | [type: CHATS_APP_MSG_TYPE.MSG, sessionId: string, message: D]
    | [
        type: CHATS_APP_MSG_TYPE.SYNC,
        sessionId: string,
        event: CryptolaliaSync.SyncEvent<D>,
      ]
    | [
        type: CHATS_APP_MSG_TYPE.SESSION,
        sessionId: string,
        msg: CryptolaliaTypes.Msg.In<W>,
      ];

  type NewMessageCallback<
    D,
    W extends CryptolaliaTypes.Msg = CryptolaliaTypes.Msg,
  > = CryptolaliaTypes.MessageChannel.Callback<ChatsMsg<D, W>>; // (event: SessionMsg<D>) => unknown;

  type ChatsMsg<
    D,
    W extends CryptolaliaTypes.Msg = CryptolaliaTypes.Msg,
  > = CryptolaliaTypes.Msg<SessionMsg<D, W>>;
}
