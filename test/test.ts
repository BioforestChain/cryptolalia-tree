import { CryptoHelper } from "@bfchain/cryptolalia-tree/lib/CryptoHelper";
import { FilesystemStorage } from "@bfchain/cryptolalia-tree/lib/Storage.fs";
import { TimeHelper } from "@bfchain/cryptolalia-tree/lib/TimeHelper";
import { ModuleStroge, Resolve } from "@bfchain/util-dep-inject";
import { createHash } from "node:crypto";
import path from "node:path";
import { Cryptolalia } from "../src/Cryptolalia";
import { MessageHelper } from "../src/MessageHelper";
import { CryptolaliaConfig } from "../src/CryptolaliaConfig";
import { CryptolaliaSync } from "../src/CryptolaliaSync";
import { TaskList } from "@bfchain/util";

const moduleMap = new ModuleStroge();
{
  Resolve(TimeHelper, moduleMap);
}
{
  class MyConfig extends CryptolaliaConfig {
    branchGroupCount = 64;
    timespan = 64e3;
    startTime = +new Date("2021-9-15");
  }
  Resolve(MyConfig, moduleMap);
}

type MyMessage = {
  time: number;
  content: string;
  sender: string;
};
{
  class MyMessageHelper extends MessageHelper<MyMessage> {
    getSignature(msg: MyMessage): Uint8Array {
      return createHash("sha256").update(JSON.stringify(msg)).digest();
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

import { env, cwd } from "node:process";

const moduleMap1 = new ModuleStroge(
  [[CryptolaliaSync.ARGS.SYNC_CHANNE, syncChannel1]],
  moduleMap,
);
{
  env.FSS_DIR = path.join(cwd(), "./.cache/fs/1");
  Resolve(FilesystemStorage, moduleMap1);
}

const moduleMap2 = new ModuleStroge(
  [[CryptolaliaSync.ARGS.SYNC_CHANNE, syncChannel2]],
  moduleMap,
);
{
  env.FSS_DIR = path.join(cwd(), "./.cache/fs/2");
  Resolve(FilesystemStorage, moduleMap2);
}
const cryptolalia1 = Resolve<Cryptolalia<MyMessage>>(Cryptolalia, moduleMap1);
const cryptolalia2 = Resolve<Cryptolalia<MyMessage>>(Cryptolalia, moduleMap2);
(async () => {
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

  // console.log(await cryptolalia1.timelineTree.getBranchRoute(Date.now()));
  const tasks = new TaskList();
  tasks.next = cryptolalia1.sync.doSync();
  tasks.next = cryptolalia2.sync.doSync();
  for (let i = 0; i < 10; ++i) {
    tasks.next = cryptolalia1.addMsg({
      content: "gaubee noise" + i,
      sender: "gaubee",
      time: Date.now() + Math.random(),
    });
  }
  for (let i = 0; i < 10; ++i) {
    tasks.next = cryptolalia2.addMsg({
      content: "bangeel noise" + i,
      sender: "bangeel",
      time: Date.now() + Math.random(),
    });
  }

  const logMsgList = (msgList: Cryptolalia.CryptolaliaMessage<MyMessage>[]) => {
    console.log("+++++++++++");
    console.log(msgList.map((msg) => msg.content.content));
    console.log("-----------");
  };

  logMsgList(await cryptolalia1.getMsgList(Date.now() + 10));
  logMsgList(await cryptolalia2.getMsgList(Date.now() + 10));

  await tasks.toPromise();
  logMsgList(await cryptolalia1.getMsgList(Date.now() + 10));
  logMsgList(await cryptolalia2.getMsgList(Date.now() + 10));

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
})().catch(console.error);
