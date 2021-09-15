import { TimeHelper as AbstractTimeHelper } from "../core/TimeHelper";
import Cryptolalia, { CryptolaliaConfig } from "../core/Cryptolalia";
import { TimeHelper } from "#TimeHelper";
import { FilesystemsStorageAdaptor } from "#StorageAdaptor.fs";

import { ModuleStroge, Resolve, getInjectionToken } from "@bfchain/util";
const moduleMap = new ModuleStroge();

console.log(
  getInjectionToken(TimeHelper) == getInjectionToken(AbstractTimeHelper),
);
Resolve(TimeHelper, moduleMap);
Resolve(FilesystemsStorageAdaptor, moduleMap);

class MyConfig extends CryptolaliaConfig {
  branchUnitCount = 64;
  timespan = 64e3;
  startTime = +new Date("2021-9-15");
}
Resolve(MyConfig, moduleMap);

const cryptolalia = Resolve(Cryptolalia, moduleMap);

console.log(cryptolalia);
