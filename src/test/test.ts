import { CryptoHelper } from "#CryptoHelper";
import { FilesystemsStorage } from "#StorageAdaptor.fs";
import { TimeHelper } from "#TimeHelper";
import { ModuleStroge, Resolve, sleep } from "@bfchain/util";
import path from "node:path";
import Cryptolalia, { MessageHelper } from "../core/Cryptolalia";
import { CryptolaliaConfig } from "../core/CryptolaliaConfig";

const moduleMap = new ModuleStroge();
{
  Resolve(TimeHelper, moduleMap);
}
{
  Resolve(
    FilesystemsStorage,
    moduleMap.installMask(
      new ModuleStroge([
        [
          FilesystemsStorage.ARGS.TARGET_DIR,
          path.join(process.cwd(), "./.cache/fs"),
        ],
      ]),
    ),
  );
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
};
import { createHash } from "node:crypto";
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

const cryptolalia = Resolve<Cryptolalia<MyMessage>>(Cryptolalia, moduleMap);
(async () => {
  console.log(cryptolalia.config);
  const { startTime } = cryptolalia.config;
  // await cryptolalia.storage.del([]);

  // console.log(getInjectionToken(FilesystemsStorage));
  // console.log(Reflect.getMetadata("design:paramtypes", StorageAdaptor));

  // console.log(cryptolalia.timelineTree.storage.targetDir);
  // await cryptolalia.timelineTree.addLeaf(Buffer.from("hi"), Date.now());
  // console.log(await cryptolalia.timelineTree.getBranchRoute(Date.now()));
  // for (let i = 0; i < 10; ++i) {
  //   cryptolalia.dataList.addItem("hi~" + i + "~hi", startTime + i * 1e4);
  // }

  // for await (const msg of cryptolalia.dataList.ItemReader(
  //   +new Date(1631798288511.563),
  //   1,
  // )) {
  //   console.log(`[${new Date(msg.createTime).toLocaleString()}] ${msg.data}`);
  // }
  // console.log("----");
  // for await (const msg of cryptolalia.dataList.ItemReader(
  //   +new Date(1631798288511.563),
  //   -1,
  // )) {
  //   console.log(`[${new Date(msg.createTime).toLocaleString()}] ${msg.data}`);
  // }

  await cryptolalia.addMsg({ content: "hi~ I'm Gaubee", time: Date.now() });
  await sleep(1000);
  await cryptolalia.addMsg({ content: "hi~ I'm Bangeel", time: Date.now() });

  console.log(await cryptolalia.getMsgList(Date.now()));
})().catch(console.error);
