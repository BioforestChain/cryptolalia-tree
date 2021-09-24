import yaml, { Type } from "js-yaml";
import { OrderMap } from "../src/CryptolaliaTimelineTree";
import { Storage, StorageBase } from "../src/Storage";

//#region 编解码器

const mapLikeTypeConstructorOptionsFactory = (
  MapCtor: typeof Map,
): yaml.TypeConstructorOptions => {
  const toStringTag = MapCtor.prototype[Symbol.toStringTag];
  return {
    kind: "sequence",
    resolve(data) {
      if (data === null) return true;
      return data.length % 2 === 0;
    },
    construct(data) {
      const result = new MapCtor();
      for (let i = 0; i < data.length; i += 2) {
        result.set(data[i], data[i + 1]);
      }

      return result;
    },
    represent(data) {
      if (!(data instanceof MapCtor)) {
        throw new TypeError(`no an ${toStringTag}`);
      }
      const result = new Array(data.size * 2);
      let i = 0;
      for (const item of data) {
        result[i++] = item[0];
        result[i++] = item[1];
      }

      return result;
    },
    predicate(data) {
      return (
        data instanceof MapCtor && data[Symbol.toStringTag] === toStringTag
      );
    },
  };
};
const schema = yaml.DEFAULT_SCHEMA.extend([
  new Type(
    "tag:bfchain.org,2021:js/ordermap",
    mapLikeTypeConstructorOptionsFactory(OrderMap),
  ),
  new Type(
    "tag:bfchain.org,2021:js/map",
    mapLikeTypeConstructorOptionsFactory(Map),
  ),
  new Type("tag:bfchain.org,2021:js/set", {
    kind: "sequence",
    resolve(data) {
      if (data === null) return true;
      return true;
    },
    construct(data) {
      const result = new Set();
      for (let i = 0; i < data.length; ++i) {
        result.add(data[i]);
      }
      return result;
    },
    represent(data) {
      if (!(data instanceof Set)) {
        throw new TypeError("no an set");
      }
      return [...data];
    },
    predicate(data) {
      return data instanceof Set && data[Symbol.toStringTag] === "Set";
    },
  }),
]);
export const deserialize = <T = unknown>(binary: Uint8Array) =>
  yaml.load(binary.toString(), { schema }) as any;

const textEncoder = new TextEncoder();

export const serialize = (obj: any) =>
  textEncoder.encode(yaml.dump(obj, { schema }));
//#endregion

//#region 内存存储器

type MemoryFolder = Map<string, MemoryFile | { folder: MemoryFolder }>;
type MemoryFile =
  | { binary: Uint8Array; jsobj?: { value: unknown } }
  | { jsobj: { value: unknown }; binary?: Uint8Array }
  | { jsobj: { value: unknown }; binary: Uint8Array };
export class MemoryFilesystemsStorageBase extends StorageBase {
  constructor(readonly currentPaths: Storage.Paths) {
    super();
  }
  readonly _memFolder: MemoryFolder = new Map();
  setBinary(paths: Storage.Paths, data: Uint8Array) {
    const folder = this._makeFolder(paths, paths.length - 2);
    folder.set(paths[paths.length - 1], { binary: data });
  }

  private _makeFolder(paths: Storage.Paths, end = paths.length - 1) {
    let folder = this._memFolder;
    for (let index = 0; index <= end; index++) {
      const path = paths[index];
      let next = folder.get(path);
      if (next === undefined) {
        folder.set(path, (next = { folder: new Map() }));
      }
      if ("folder" in next) {
        folder = next.folder;
      } else {
        throw new Error("no an paths:" + paths);
      }
    }
    return folder;
  }
  private _getFolder(paths: Storage.Paths, end = paths.length - 1) {
    let folder = this._memFolder;
    for (let index = 0; index <= end; index++) {
      const path = paths[index];
      let next = folder.get(path);
      if (next === undefined) {
        return;
      }
      if ("folder" in next) {
        folder = next.folder;
      } else {
        return;
      }
    }
    return folder;
  }

  private _getFile(paths: Storage.Paths) {
    let folder = this._memFolder;
    for (let index = 0, end = paths.length - 2; index <= end; index++) {
      const path = paths[index];
      const next = folder.get(path);
      if (next === undefined || !("folder" in next)) {
        return;
      }
      folder = next.folder;
    }
    const file = folder.get(paths[paths.length - 1]);
    if (file === undefined || "folder" in file) {
      return;
    }
    return file;
  }
  getBinary(paths: Storage.Paths) {
    const file = this._getFile(paths);
    if (file === undefined) {
      return;
    }
    if ("binary" in file) {
      return file.binary;
    }
    return (file.binary = serialize(file.jsobj));
  }
  getJsObject<T>(
    paths: Storage.Paths,
  ): BFChainUtil.PromiseMaybe<T | undefined> {
    const file = this._getFile(paths);
    if (file === undefined) {
      return;
    }
    if ("jsobj" in file) {
      return file.jsobj!.value as T;
    }

    return (file.jsobj = { value: deserialize<T>(file.binary) }).value as T;
  }
  setJsObject<T>(paths: Storage.Paths, data: T) {
    const folder = this._makeFolder(paths, paths.length - 2);
    folder.set(paths[paths.length - 1], { jsobj: { value: data } });
  }
  has(paths: Storage.Paths) {
    const folder = this._getFolder(paths, paths.length - 2);
    if (folder === undefined) {
      return false;
    }
    return folder.has(paths[paths.length - 1]);
  }
  /**
   * @todo 需要支持del([])
   * @param paths
   * @returns
   */
  del(paths: Storage.Paths): BFChainUtil.PromiseMaybe<boolean> {
    const folder = this._getFolder(paths, paths.length - 2);
    if (folder === undefined) {
      return false;
    }
    folder.clear();
    return true;
  }
  listPaths(
    paths: Storage.Paths,
  ): BFChainUtil.PromiseMaybe<{ paths: Storage.Paths; files: Storage.Paths }> {
    const folder = this._getFolder(paths, paths.length - 2);
    const res = {
      paths: [] as string[],
      files: [] as string[],
    };

    if (folder !== undefined) {
      for (const [key, val] of folder) {
        if ("folder" in val) {
          res.paths.push(key);
        } else {
          res.files.push(key);
        }
      }
    }
    return res;
  }
  *WalkFiles(
    paths: Storage.Paths = [],
    folder = this._memFolder,
  ): Generator<[Storage.Paths, MemoryFile]> {
    for (const [path, fileOrFolder] of folder) {
      const subPaths = [...paths, path];
      if ("folder" in fileOrFolder) {
        yield* this.WalkFiles(subPaths, fileOrFolder.folder);
      } else {
        yield [subPaths, fileOrFolder];
      }
    }
  }
}
//#endregion

//#region 路径收集器

type DelPathMap = Map<string, DelPathMap>;
/**
 * 删除的路径收集器
 * 路径只会被添加，不会被移除
 * 如果添加了文件或者文件路径，可以直接在cacheStore中找到实例，
 * 这里只是targetStore的遮罩
 */
export class Del {
  private _delPathMap = new Map() as DelPathMap;
  addDel(paths: Storage.Paths) {
    let delPathMap = this._delPathMap;
    for (const path of paths) {
      let nextDelPathMap = delPathMap.get(path);
      if (nextDelPathMap === undefined) {
        nextDelPathMap = new Map();
        delPathMap.set(path, nextDelPathMap);
      }
      delPathMap = nextDelPathMap;
    }
    delPathMap.clear();
  }
  isDel(paths: Storage.Paths) {
    let delPathMap = this._delPathMap;

    /// 这里以尝试 cd paths 的逻辑来判定路径是否被删除
    for (const path of paths) {
      const nextDelPathMap = delPathMap.get(path);
      /// 如果没有这层被删除的路径，说明它能进入这层文件夹canIn，那么就是没有被删除
      if (nextDelPathMap === undefined) {
        return false;
      }
      /// 如果发现这层路径没有子集，说明所有的子集已经全部被删除，那么就无法进入canotIn
      if (nextDelPathMap.size === 0) {
        return true;
      }
      // 如果有子集，那么进一步探索子集的情况
      delPathMap = nextDelPathMap;
    }

    // 如果所有的路径都走完了，还是没有结论，说明这个路径只是被删除了一部分，没有删完
    return false;
  }
  ls() {
    const lsPaths = (
      prevDelPaths: Storage.Paths,
      pathMap: DelPathMap,
    ): Storage.Paths[] => {
      const pathsList: Storage.Paths[] = [];
      if (pathMap.size === 0) {
        if (prevDelPaths.length !== 0) {
          pathsList.push(prevDelPaths);
        }
      }
      for (const [path, _pathMap] of pathMap) {
        pathsList.push(...lsPaths([...prevDelPaths, path], _pathMap));
      }
      return pathsList;
    };

    return lsPaths([], this._delPathMap);
  }
}
//#endregion
