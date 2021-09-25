import { ModuleStroge, Resolve } from "@bfchain/util-dep-inject";
import {
  Cryptolalia,
  CryptolaliaConfig,
  MessageHelper,
  CryptolaliaSync,
} from "@bfchain/cryptolalia-tree";
import { TimeHelper } from "@bfchain/cryptolalia-tree/lib/TimeHelper.web";
import { FilesystemStorage } from "@bfchain/cryptolalia-tree/lib/Storage.fs.web";
// import { TimeHelper } from "@bfchain/cryptolalia-tree/test";

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
  onMessage(cb) {
    syncChannel2.postMessage = cb;
  },
};
const syncChannel2: CryptolaliaSync.Channel<MyMessage> = {
  postMessage(msg) {},
  onMessage(cb) {
    syncChannel1.postMessage = cb;
  },
};

import { CryptoHelper } from "@bfchain/cryptolalia-tree/lib/CryptoHelper.web";

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
  // console.log(cryptolalia1.config);
  await cryptolalia1.storage.del([]);
  await cryptolalia2.storage.del([]);

  // console.log(getInjectionToken(FilesystemStorage));
  // console.log(Reflect.getMetadata("design:paramtypes", Storage));

  // console.log(cryptolalia1.timelineTree.storage.targetDir);
  // await cryptolalia1.timelineTree.addLeaf(Buffer.from("hi"), Date.now());
  // console.log(await cryptolalia1.timelineTree.getBranchRoute(Date.now()));
  // for (let i = 0; i < 10; ++i) {
  //   cryptolalia1.dataList.addItem("hi~" + i + "~hi", startTime + i * 1e4);
  // }

  // for await (const msg of cryptolalia1.dataList.ItemReader(
  //   +new Date(1631798288511.563),
  //   1,
  // )) {
  //   console.log(`[${new Date(msg.createTime).toLocaleString()}] ${msg.data}`);
  // }
  // console.log("----");
  // for await (const msg of cryptolalia1.dataList.ItemReader(
  //   +new Date(1631798288511.563),
  //   -1,
  // )) {
  //   console.log(`[${new Date(msg.createTime).toLocaleString()}] ${msg.data}`);
  // }

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

  debugger;
  // console.log(await cryptolalia1.timelineTree.getBranchRoute(Date.now()));
  await cryptolalia1.sync.doSync();
  await cryptolalia2.sync.doSync();
  console.log("sync done");

  // console.group("cryptolalia1");
  // const dataList1 = await cryptolalia1.getMsgList(Date.now());
  // console.log(dataList1);
  // console.groupEnd();

  // console.group("cryptolalia2");
  // const dataList2 = await cryptolalia2.getMsgList(Date.now());
  // console.log(dataList2);
  // console.groupEnd();

  // console.assert(
  //   JSON.stringify(dataList1) === JSON.stringify(dataList2),
  //   "sync fail",
  // );
};
