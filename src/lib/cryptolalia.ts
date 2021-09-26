import { Inject, ModuleStroge, Resolve } from "@bfchain/util-dep-inject";
import {
  Cryptolalia,
  CryptolaliaConfig,
  MessageHelper,
  CryptolaliaSync,
} from "@bfchain/cryptolalia-tree";
import { TimeHelper } from "@bfchain/cryptolalia-tree/lib/TimeHelper.web";
import { FilesystemStorage } from "@bfchain/cryptolalia-tree/lib/Storage.fs.web";
import {
  ChatsApp,
  ChatsAppHelper,
} from "@bfchain/cryptolalia-tree/lib/ChatsApp";

const moduleMap = new ModuleStroge();
{
  Resolve(TimeHelper, moduleMap);
}
{
  class MyConfig extends CryptolaliaConfig {
    branchGroupCount = 64;
    timespan = 10e3;
    startTime = +new Date("2021-9-15");
  }
  Resolve(MyConfig, moduleMap);
}

export type MyMessage = {
  time: number;
  content: string;
  sender: string;
};
{
  const textEncoder = new TextEncoder();

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
const syncChannel1: CryptolaliaSync.Channel<MyMessage> = {
  postMessage(msg) {},
  get onMessage() {
    return syncChannel2.postMessage;
  },
  set onMessage(cb) {
    syncChannel2.postMessage = cb;
  },
};
const syncChannel2: CryptolaliaSync.Channel<MyMessage> = {
  postMessage(msg) {},
  get onMessage() {
    return syncChannel1.postMessage;
  },
  set onMessage(cb) {
    syncChannel1.postMessage = cb;
  },
};
import { CryptoHelper } from "@bfchain/cryptolalia-tree/lib/CryptoHelper.web";
import type { CryptolaliaTypes } from "../../../src/@types";

const moduleMap1 = new ModuleStroge(
  [[CryptolaliaSync.ARGS.SYNC_CHANNE, syncChannel1]],
  moduleMap,
);
{
  Resolve(
    FilesystemStorage,
    moduleMap1.installMask(
      new ModuleStroge([[FilesystemStorage.ARGS.TARGET_DIR, "user1"]]),
    ),
  );
}

const moduleMap2 = new ModuleStroge(
  [[CryptolaliaSync.ARGS.SYNC_CHANNE, syncChannel2]],
  moduleMap,
);
{
  Resolve(
    FilesystemStorage,
    moduleMap2.installMask(
      new ModuleStroge([[FilesystemStorage.ARGS.TARGET_DIR, "user2"]]),
    ),
  );
}
export const cryptolalia1 = Resolve<Cryptolalia<MyMessage>>(
  Cryptolalia,
  moduleMap1,
);
export const cryptolalia2 = Resolve<Cryptolalia<MyMessage>>(
  Cryptolalia,
  moduleMap2,
);

export const test = async () => {
  await cryptolalia1.storage.del([]);
  await cryptolalia2.storage.del([]);

  console.assert(
    await cryptolalia1.addMsg({
      content: "hi~ I'm Gaubee",
      sender: "gaubee",
      time: Date.now(),
    }),
  );
  console.assert(
    await cryptolalia2.addMsg({
      content: "hi~ I'm Bangeel",
      sender: "bangeel",
      time: Date.now(),
    }),
  );

  await cryptolalia1.sync.doSync();
  await cryptolalia2.sync.doSync();
  console.log("sync done");
};

const appModuleMap1 = new ModuleStroge([], moduleMap);
const appModuleMap2 = new ModuleStroge([], moduleMap);
type MySessionInfo = {
  nickname: string;
  badge: number;
  lastMsgPreview: string;
  lastMsgTime: number;
  isCollection: boolean;
};
{
  type AppChannel = CryptolaliaTypes.MessageChannel<
    ChatsApp.ChatsMsg<MySessionInfo, CryptolaliaTypes.Msg<MyMessage>>
  >;
  const appChannel1: AppChannel = {
    postMessage(msg) {},
    get onMessage() {
      return appChannel2.postMessage;
    },
    set onMessage(cb) {
      appChannel2.postMessage = cb;
    },
  };
  const appChannel2: AppChannel = {
    postMessage(msg) {},
    get onMessage() {
      return appChannel1.postMessage;
    },
    set onMessage(cb) {
      appChannel1.postMessage = cb;
    },
  };
  const APP_CHANNEL = Symbol("appChannel");
  appModuleMap1.set(APP_CHANNEL, appChannel1);
  appModuleMap2.set(APP_CHANNEL, appChannel2);

  const LOCAL_NAME_ID = Symbol("localId");
  appModuleMap1.set(LOCAL_NAME_ID, "app1");
  appModuleMap2.set(LOCAL_NAME_ID, "app2");

  class MyChatsAppHelper extends ChatsAppHelper<
    {
      nickname: string;
      badge: number;
      lastMsgPreview: string;
      lastMsgTime: number;
      isCollection: boolean;
    },
    MyMessage
  > {
    handshakeSession?: <I extends unknown>(
      sessionId: string,
      swapIn?: I,
    ) => BFChainUtil.PromiseMaybe<void | (I extends unknown ? unknown : never)>;
    @Inject(APP_CHANNEL)
    appChannel!: AppChannel;
    @Inject(LOCAL_NAME_ID)
    localId!: string;

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
    ): unknown {
      throw new Error("Method not implemented.");
    }
    public get onNewMessage() {
      return this.appChannel.onMessage;
    }
    public set onNewMessage(value) {
      this.appChannel.onMessage = value;
    }
    // handshakeSession?: <I extends unknown>(sessionId: string, swapIn?: I) => BFChainUtil.PromiseMaybe<void | (I extends unknown ? unknown : never)>;
  }
  Resolve(MyChatsAppHelper, moduleMap);
}
export const chatsApp1 = Resolve(ChatsApp, appModuleMap1);
export const chatsApp2 = Resolve(ChatsApp, appModuleMap2);
