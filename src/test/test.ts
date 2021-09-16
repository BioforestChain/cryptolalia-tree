import Cryptolalia from "../core/Cryptolalia";
import { CryptolaliaConfig } from "../core/CryptolaliaConfig";
import { TimeHelper } from "#TimeHelper";
import { FilesystemsStorage } from "#StorageAdaptor.fs";
import { CryptoHelper } from "#CryptoHelper";

import { ModuleStroge, Resolve, getInjectionToken } from "@bfchain/util";
import path from "node:path";
import { StorageAdaptor } from "../core/StorageAdaptor";

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
{
  Resolve(CryptoHelper, moduleMap);
}

const cryptolalia = Resolve(Cryptolalia, moduleMap);
(async () => {
  console.log(cryptolalia.config);
  console.log(getInjectionToken(FilesystemsStorage));
  console.log(Reflect.getMetadata("design:paramtypes", StorageAdaptor));
  // console.log(cryptolalia.timelineTree.storage.targetDir);
  // await cryptolalia.timelineTree.addLeaf(Buffer.from("hi"), Date.now());
  // console.log(await cryptolalia.timelineTree.getBranchRoute(Date.now()));
  // cryptolalia.dataList.addItem(Buffer.from("hi"));

  for await (const msg of cryptolalia.dataList.ItemReader(
    +new Date(1631798288511.563),
    1,
  )) {
    console.log(
      `[${new Date(msg.createTime).toLocaleString()}] ${Buffer.from(
        msg.data,
      ).toString()}`,
    );
  }
  console.log("----");
  for await (const msg of cryptolalia.dataList.ItemReader(
    +new Date(1631798288511.563),
    -1,
  )) {
    console.log(
      `[${new Date(msg.createTime).toLocaleString()}] ${Buffer.from(
        msg.data,
      ).toString()}`,
    );
  }
})().catch(console.error);
