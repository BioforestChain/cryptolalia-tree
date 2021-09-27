import {
  getInjectionToken,
  Inject,
  ModuleStroge,
  OnInit,
  Resolve,
} from "@bfchain/util-dep-inject";
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
export type MySessionInfo = {
  nickname: string;
  badge: number;
  lastMsgPreview: string;
  lastMsgTime: number;
  isCollection: boolean;
};
import { Dchat } from "@bfchain/bnrtc2-dchat";
import {
  DCHAT_DPORT_PREFIX,
  MessageState,
} from "@bfchain/bnrtc2-dchat-typings";
import { bnrtc2Controller, bnrtc2Global } from "@bfchain/bnrtc2-client";
bnrtc2Global.Channel = WebSocket.bind(self);
bnrtc2Global.fetch = fetch.bind(self);

import { PromiseOut } from "@bfchain/util-extends-promise-out";
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
      async sendMessage(
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

        const remoteAddress = sessionInfo.nickname;
        const dchat = this.dchat.value || (await this.dchat.promise);
        const code = await dchat.send(
          remoteAddress,
          this.DCHAT_DPORT,
          textEncoder.encode(JSON.stringify(msg)),
        );
        if (code == MessageState.Success) {
          console.log("send msg to %s ok", remoteAddress);
        } else {
          console.log("send msg to %s failed %d", remoteAddress, code);
        }
      }

      private bchanne = new BroadcastChannel("chatsApp");
      private dchat = new PromiseOut<Dchat>(); // new Dchat();
      private DCHAT_DPORT = DCHAT_DPORT_PREFIX + "chatsApp";

      async bfOnInit() {
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

        const dchat = new Dchat(
          undefined,
          {
            ["C6MbP6yWiAi6rfRo8KBWrCv6tVW9q3r5D"]: 19888,
            ["2et8jGb14fAfzQBNgLRHcwVxLd4Pif1mn"]: 19777,
          }[this.localId],
        );

        console.log(
          "bind local",
          await bnrtc2Controller.bindAddress(this.localId),
        );

        this.dchat.resolve(dchat);
        dchat.onMessage(this.DCHAT_DPORT, (address, dport, data) => {
          this.onNewMessage(JSON.parse(textDecoder.decode(data)));
          return true;
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
