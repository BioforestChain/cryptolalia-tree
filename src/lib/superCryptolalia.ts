import {
  Cryptolalia,
  CryptolaliaConfig,
  CryptolaliaSync,
  CryptolaliaTypes,
  MessageHelper,
  ORDER,
} from "@bfchain/cryptolalia-tree";
import {
  ChatsApp,
  ChatsAppHelper,
} from "@bfchain/cryptolalia-tree/lib/ChatsApp";
import { CryptoHelper } from "@bfchain/cryptolalia-tree/lib/CryptoHelper.web";
import { FilesystemStorage } from "@bfchain/cryptolalia-tree/lib/Storage.fs.web";
import { TimeHelper } from "@bfchain/cryptolalia-tree/lib/TimeHelper.web";
import {
  getInjectionToken,
  Inject,
  Injectable,
  ModuleStroge,
  OnInit,
  Resolve,
} from "@bfchain/util-dep-inject";
import { PromiseOut } from "@bfchain/util-extends-promise-out";

const moduleMap = new ModuleStroge();
{
  Resolve(TimeHelper, moduleMap);
}

const SuperCryptolalia_ARGS = {
  USER_ID: Symbol("user-id"),
};
/**
 * 超密聊实例
 * 由多个密聊实例组合而成
 */
@Injectable()
export class SuperCryptolalia<T = MyMessage> {
  constructor(
    @Inject(SuperCryptolalia_ARGS.USER_ID)
    private userId: string,
    private moduleMap: ModuleStroge,
  ) {}
  private readonly _startTimesLsKey = `${this.userId}/times`;
  private _startTimes?: Map<string, Date>;
  private _getStartTimes() {
    if (this._startTimes === undefined) {
      let starTimesStr = localStorage.getItem(this._startTimesLsKey);
      if (typeof starTimesStr !== "string") {
        starTimesStr = SuperCryptolalia.DEFAULT_START_TIME;
        localStorage.setItem(this._startTimesLsKey, starTimesStr);
      }

      const timeMap = new Map<string, Date>();
      for (const dateStr of starTimesStr.split(",").filter(Boolean)) {
        const time = new Date(dateStr);
        timeMap.set(time.toISOString(), time);
      }
      this._startTimes = timeMap;
    }
    return this._startTimes;
  }
  private _addStartTime(timeStr: string) {
    const timeMap = this._getStartTimes();
    const time = new Date(timeStr);
    timeStr = time.toISOString();
    if (timeMap.has(timeStr)) {
      return false;
    }
    timeMap.set(timeStr, time);
    const timeList = [...timeMap.values()].sort(
      (a, b) => a.getTime() - b.getTime(),
    );
    timeMap.clear();
    for (const time of timeList) {
      timeMap.set(time.toISOString(), time);
    }
    this._saveStartTimes(timeMap);
    return true;
  }
  private _saveStartTimes(timeMap: Map<string, Date>) {
    localStorage.setItem(this._startTimesLsKey, [...timeMap.keys()].join(","));
  }
  private _msCache = new Map</* startTime */ string, ModuleStroge>();
  private _getCryptolalias(syncableSet: Set<string>) {
    const cryptolalias: SuperCryptolalia.MsgClItem<T>[] = [];
    for (const startTimeStr of this._getStartTimes().keys()) {
      let item: SuperCryptolalia.MsgClItem<T>;

      let ms = this._msCache.get(startTimeStr);
      if (ms === undefined) {
        const config = new SuperCryptolalia.SuperConfig(startTimeStr);
        const cryptolalia = this._createCl<T>(
          config,
          `${this.userId}-${startTimeStr}`,
          startTimeStr,
        );
        item = {
          cid: startTimeStr,
          cryptolalia,
          syncable: syncableSet.has(startTimeStr),
        };
      } else {
        item = ms.get(getInjectionToken(CryptolaliaConfig))!;
      }

      cryptolalias.push(item);
    }
    return cryptolalias;
  }
  private _createCl<T>(
    config: SuperCryptolalia.SuperConfig,
    dir: string,
    channelId: string,
  ) {
    const ms = new ModuleStroge(
      [
        [getInjectionToken(CryptolaliaConfig), config],
        [
          CryptolaliaSync.ARGS.SYNC_CHANNE,
          MemoryMessageChannel.getPort(channelId, this.userId),
        ],
        [FilesystemStorage.ARGS.TARGET_DIR, dir],
      ],
      this.moduleMap,
    );
    Resolve(FilesystemStorage, ms);
    return Resolve<Cryptolalia<T>>(Cryptolalia, ms);
  }
  /**元数据传输线路
   * 这是一条完全独立的元数据信息，用来传递“不可见消息”的通道
   * 这部分完全可以使用“中心化服务器”替代
   */
  private _meta_cl = (() => {
    const lskey = `${this.userId}/metatime`;
    let metaStartTimeStr = localStorage.getItem(lskey);
    if (typeof metaStartTimeStr !== "string") {
      metaStartTimeStr = SuperCryptolalia.DEFAULT_START_TIME;
      localStorage.setItem(lskey, metaStartTimeStr);
    }
    const config = new SuperCryptolalia.SuperConfig(metaStartTimeStr);
    return this._createCl<SuperCryptolalia.InnerMsgType>(
      config,
      `${this.userId}-metadata`,
      "metadata",
    );
  })();

  private _msg_cl_list = this._getCryptolalias(
    new Set() /* 默认是关闭同步的 */,
  );
  private get _msg_cl() {
    return this._msg_cl_list[this._msg_cl_list.length - 1];
  }
  async getMsgList(
    timestamp: number,
    options?: CryptolaliaTypes.GetMsgListOptions,
  ) {
    const { limit, order } = this._meta_cl.$getMsgListOptionsToQuery(options);
    const cls = this._msg_cl_list.slice();
    if (order === ORDER.DOWN) {
      cls.reverse();
    }
    const mixMsgList: Cryptolalia.CryptolaliaMessage<T>[] = [];
    for (const cl of cls) {
      mixMsgList.push(...(await cl.cryptolalia.getMsgList(timestamp, options)));
      if (mixMsgList.length >= limit) {
        break;
      }
    }
    return mixMsgList;
  }
  async addMsg(msg: T) {
    /// 如果本地没有时间线，那么重新与对方构建一个新的时间线
    if (this._msg_cl === undefined) {
      const now = new Date().toISOString();
      await this._meta_cl.addMsg({
        cmd: "list",
        datetimes: [now],
        time: Date.now(),
      });
      /// 重新添加新的时间线
      this._addStartTime(now);
      /// 使用新的时间线构建新的通话
      this._msg_cl_list = this._getCryptolalias(new Set([now]));
    }
    return this._msg_cl.cryptolalia.addMsg(msg);
  }
  async clear() {
    /// 先发送删除信号
    const timeMap = this._getStartTimes();
    await this._meta_cl.sync.doSync();
    await this._meta_cl.addMsg({
      cmd: "list",
      datetimes: [],
      time: Date.now(),
    });
    /// 清空所有相关的时间线
    timeMap.clear();
    this._saveStartTimes(timeMap);
    /// 最后清空本地所有的消息
    for (const cl of this._msg_cl_list) {
      await cl.cryptolalia.clear();
    }
    this._msg_cl_list.length = 0;
  }
  async doSync() {
    await this._meta_cl.sync.doSync();
    /// 如果收到新的
    for (const msg of await this._meta_cl.getMsgList(Date.now(), {
      limit: 1,
    })) {
      if (msg.content.cmd === "list") {
        const cids = new Set(msg.content.datetimes);
        for (const cl of this._msg_cl_list) {
          cl.syncable = cids.has(cl.cid);
          cids.delete(cl.cid);
        }
        console.log(this.userId, msg.content);
        if (cids.size > 0) {
          for (const datetime of cids) {
            this._addStartTime(datetime);
          }
          /// 使用新的时间线构建新的通话
          this._msg_cl_list = this._getCryptolalias(
            new Set(msg.content.datetimes),
          );
        }
        break; // 只需要处理一条消息
      }
    }
    console.log("doSync meta done");
    for (const cl of this._msg_cl_list) {
      if (cl.syncable) {
        await cl.cryptolalia.sync.doSync();
        console.log("doSync msg done");
      }
    }
    console.log("doSync done");
  }
}
export namespace SuperCryptolalia {
  export type InnerMsgType = {
    /// 这里没有指定发送者，双方都能同时修改这条通用消息
    cmd: "list"; /// 列出自己双方共有消息通道，可以使用这个指令创建一个新的消息通道
    datetimes: string[];
    time: number; // 因为该demo中，InnerMsgType与MyMessage使用了同一个MyMessageHelper，所以这里也需要给出time字段
  };
  export const ARGS = SuperCryptolalia_ARGS;
  export class SuperConfig extends CryptolaliaConfig {
    branchGroupCount = 64;
    timespan = 10e3;
    startTime = +new Date(this._st);
    constructor(private _st: string) {
      super();
    }
  }
  export type MsgClItem<T> = {
    cid: string;
    cryptolalia: Cryptolalia<T>;
    syncable: boolean;
  };
  export const DEFAULT_START_TIME = new Date().toISOString();
}

export type MyMessage = {
  time: number;
  content: string;
  sender: string;
};
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
{
  class MyMessageHelper extends MessageHelper<MyMessage> {
    getSignature(msg: MyMessage): Uint8Array {
      const binary = textEncoder.encode(JSON.stringify(msg));
      const signature = new Uint8Array(32);
      for (let i = 0; i < binary.length; ++i) {
        const sign_offset = i % signature.length;
        signature[sign_offset] += binary[i];
        for (
          let s = (sign_offset + 1) % signature.length;
          s < signature.length;
          ++s
        ) {
          signature[s] = i * s + signature[sign_offset];
        }
      }
      return signature;
    }
    getCreateTime(msg: MyMessage): number {
      return msg.time;
    }
  }
  Resolve(MyMessageHelper, moduleMap);
}
{
  Resolve(CryptoHelper, moduleMap);
}

/**内存消息通道 */
class MemoryMessageChannel {
  readonly port1: CryptolaliaSync.Channel<MyMessage> = (() => {
    const rootChannel = this;
    return {
      postMessage(msg) {},
      get onMessage() {
        return rootChannel.port2.postMessage;
      },
      set onMessage(cb) {
        rootChannel.port2.postMessage = cb;
      },
    };
  })();
  readonly port2: CryptolaliaSync.Channel<MyMessage> = (() => {
    const rootChannel = this;
    return {
      postMessage(msg) {},
      get onMessage() {
        return rootChannel.port1.postMessage;
      },
      set onMessage(cb) {
        rootChannel.port1.postMessage = cb;
      },
    };
  })();
  static cache = new Map<string, MemoryMessageChannel>();
  static getPort(channelId: string, userId: string) {
    console.log("getport", channelId);
    let channel = this.cache.get(channelId);
    if (channel === undefined) {
      channel = new MemoryMessageChannel();
      this.cache.set(channelId, channel);
    }

    if (userId === moduleMap1.get(SuperCryptolalia_ARGS.USER_ID)) {
      console.log("port1 for", channelId);
      return channel.port1;
    }
    console.log("port2 for", channelId);
    return channel.port2;
  }
}

const moduleMap1 = new ModuleStroge(
  [[SuperCryptolalia_ARGS.USER_ID, "user1"]],
  moduleMap,
);

const moduleMap2 = new ModuleStroge(
  [[SuperCryptolalia_ARGS.USER_ID, "user2"]],
  moduleMap,
);
export const cryptolalia1 = Resolve<SuperCryptolalia<MyMessage>>(
  SuperCryptolalia,
  moduleMap1,
);
// /**更新配置，重新初始化 */
// export const reinitCryptolalia1 = (config: MyConfig) => {
//   moduleMap1.set(getInjectionToken(MyConfig), config);
//   moduleMap1.delete(getInjectionToken(Cryptolalia));
//   return (cryptolalia1 = Resolve<Cryptolalia<MyMessage>>(
//     Cryptolalia,
//     moduleMap1,
//   ));
// };
export const cryptolalia2 = Resolve<SuperCryptolalia<MyMessage>>(
  SuperCryptolalia,
  moduleMap2,
);
/**更新配置，重新初始化 */
// export const reinitCryptolalia2 = (config: MyConfig) => {
//   moduleMap2.set(getInjectionToken(MyConfig), config);
//   moduleMap2.delete(getInjectionToken(Cryptolalia));
//   return (cryptolalia2 = Resolve<Cryptolalia<MyMessage>>(
//     Cryptolalia,
//     moduleMap2,
//   ));
// };

// export const test = async () => {
//   await cryptolalia1.storage.del([]);
//   await cryptolalia2.storage.del([]);

//   console.assert(
//     await cryptolalia1.addMsg({
//       content: "hi~ I'm Gaubee",
//       sender: "gaubee",
//       time: Date.now(),
//     }),
//   );
//   console.assert(
//     await cryptolalia2.addMsg({
//       content: "hi~ I'm Bangeel",
//       sender: "bangeel",
//       time: Date.now(),
//     }),
//   );

//   await cryptolalia1.sync.doSync();
//   await cryptolalia2.sync.doSync();
//   console.log("sync done");
// };
export type MySessionInfo = {
  nickname: string;
  badge: number;
  lastMsgPreview: string;
  lastMsgTime: number;
  isCollection: boolean;
};

export type SwapMsg =
  | CryptolaliaTypes.Msg<undefined, { senderId: string }>
  | CryptolaliaTypes.Msg<{ senderId: string }, undefined>;
export const ChatsAppBuilder = (username: string) => {
  const appModuleMap = new ModuleStroge([], moduleMap);

  {
    type MyChatsMsg = ChatsApp.ChatsMsg<
      MySessionInfo,
      CryptolaliaTypes.Msg<MyMessage>
    >;

    const LOCAL_NAME_ID = Symbol("localId");
    appModuleMap.set(LOCAL_NAME_ID, username);

    class MyChatsAppHelper
      extends ChatsAppHelper<MySessionInfo, MyMessage, SwapMsg>
      implements OnInit
    {
      @Inject(LOCAL_NAME_ID)
      readonly localId!: string;

      getSessionId(sessionInfo: {
        nickname: string;
        badge: number;
        lastMsgPreview: string;
        lastMsgTime: number;
        isCollection: boolean;
      }): string {
        return [this.localId, sessionInfo.nickname].sort().join("-");
      }
      compare(
        a: {
          nickname: string;
          badge: number;
          lastMsgPreview: string;
          lastMsgTime: number;
          isCollection: boolean;
        },
        b: {
          nickname: string;
          badge: number;
          lastMsgPreview: string;
          lastMsgTime: number;
          isCollection: boolean;
        },
      ): number {
        if (a.isCollection && !b.isCollection) {
          return -1;
        }
        if (b.isCollection && !a.isCollection) {
          return 1;
        }
        return b.lastMsgTime - a.lastMsgTime;
      }
      sendMessage(
        sessionInfo: {
          nickname: string;
          badge: number;
          lastMsgPreview: string;
          lastMsgTime: number;
          isCollection: boolean;
        },
        msg: ChatsApp.SessionMsg<
          MyMessage,
          CryptolaliaTypes.Msg<unknown, unknown>
        >,
      ) {
        this.bchanne.postMessage(["chatsApp", sessionInfo.nickname, msg]);
      }
      private bchanne = new BroadcastChannel("chatsApp");
      bfOnInit() {
        this.bchanne.addEventListener("message", (event) => {
          console.log("event", event.data);
          if (this.onNewMessage === undefined) {
            return;
          }
          const { data } = event;
          if (
            Array.isArray(data) &&
            data.length === 3 &&
            data[0] === "chatsApp" &&
            data[1] === this.localId
          ) {
            this.onNewMessage(data[2]);
          }
        });
      }
      onNewMessage?: CryptolaliaTypes.MessageChannel.Callback<MyChatsMsg>;

      @Inject(ChatsApp)
      app!: ChatsApp<MySessionInfo, MyMessage, SwapMsg>;

      handshakeSession = async <I extends CryptolaliaTypes.Msg.In<SwapMsg>>(
        sessionId: string,
        swapIn?: I,
      ) => {
        if (swapIn === undefined) {
          return { senderId: this.localId };
        } else {
          await this.app.addSession(sessionId, {
            nickname: swapIn.senderId,
            badge: 0,
            lastMsgPreview: "",
            lastMsgTime: Date.now(),
            isCollection: false,
          });
          return;
        }
        throw new Error("Wrong handshake progress");
      };

      // handshakeSession<I extends CryptolaliaTypes.Msg.In<>>(
      //   sessionId: string,
      //   swapIn?: I,
      // ){
      //   if (swapIn === undefined) {
      //     return { senderId: this.localId };
      //   }
      // }
      // handshakeSession?: <I extends unknown>(sessionId: string, swapIn?: I) => BFChainUtil.PromiseMaybe<void | (I extends unknown ? unknown : never)>;
    }
    console.log("MyChatsAppHelper", getInjectionToken(MyChatsAppHelper));
    Resolve(MyChatsAppHelper, appModuleMap);
  }
  {
    Resolve(
      FilesystemStorage,
      appModuleMap.installMask(
        new ModuleStroge([
          [FilesystemStorage.ARGS.TARGET_DIR, "online-" + username],
        ]),
      ),
    );
  }
  const chatsApp = Resolve<ChatsApp<MySessionInfo, MyMessage, SwapMsg>>(
    ChatsApp,
    appModuleMap,
  );
  return chatsApp;
};
//   type AppChannel = CryptolaliaTypes.MessageChannel<
//     ChatsApp.ChatsMsg<MySessionInfo, CryptolaliaTypes.Msg<MyMessage>>
//   >;
//   const appChannel1: AppChannel = {
//     postMessage(msg) {},
//     get onMessage() {
//       return appChannel2.postMessage;
//     },
//     set onMessage(cb) {
//       appChannel2.postMessage = cb;
//     },
//   };
//   const appChannel2: AppChannel = {
//     postMessage(msg) {},
//     get onMessage() {
//       return appChannel1.postMessage;
//     },
//     set onMessage(cb) {
//       appChannel1.postMessage = cb;
//     },
//   };
