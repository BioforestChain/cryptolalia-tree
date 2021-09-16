import Cryptolalia from "../core/Cryptolalia";
import { CryptolaliaConfig } from "../core/CryptolaliaConfig";
import { TimeHelper } from "#TimeHelper";
import { FilesystemsStorageAdaptor } from "#StorageAdaptor.fs";
import { CryptoHelper } from "#CryptoHelper";

import { ModuleStroge, Resolve, getInjectionToken } from "@bfchain/util";
import path from "node:path";

const moduleMap = new ModuleStroge();
{
  Resolve(TimeHelper, moduleMap);
}
{
  Resolve(
    FilesystemsStorageAdaptor,
    moduleMap.installMask(
      new ModuleStroge([
        [
          FilesystemsStorageAdaptor.ARGS.TARGET_DIR,
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
  await cryptolalia.timelineTree.addLeaf(
    new Uint8Array(Buffer.from("hi")),
    Date.now(),
  );
  console.log(await cryptolalia.timelineTree.getBranchRoute(Date.now()));
})();
