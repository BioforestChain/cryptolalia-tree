import { Inject, PromiseOut } from "@bfchain/util";
import yaml, { Type } from "js-yaml";
// import { deserialize, serialize } from "node:v8";
import { Buffer } from "node:buffer";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { cwd, env } from "node:process";
import { Storage, StorageBase } from "../core/Storage";

const schema = yaml.DEFAULT_SCHEMA.extend([
  new Type("tag:bfchain.org,2021:js/map", {
    kind: "sequence",
    resolve(data) {
      if (data === null) return true;
      return data.length % 2 === 0;
    },
    construct(data) {
      const result = new Map();
      for (let i = 0; i < data.length; i += 2) {
        result.set(data[i], data[i + 1]);
      }

      return result;
    },
    represent(data) {
      if (!(data instanceof Map)) {
        throw new TypeError("no an map");
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
      return data instanceof Map;
    },
  }),
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
      return data instanceof Set;
    },
  }),
]);
const deserialize = (binary: Uint8Array) =>
  yaml.load(binary.toString(), { schema }) as any;
const serialize = (obj: any) => Buffer.from(yaml.dump(obj, { schema }));

const ARGS = {
  TARGET_DIR: Symbol("targetDir"),
};
class NodeFilesystemsStorageBase extends StorageBase {
  static readonly ARGS = ARGS;
  constructor(
    @Inject(ARGS.TARGET_DIR, { optional: true })
    protected targetDir: string = env.FSS_DIR || cwd() + "/.cache/fs",
  ) {
    super();
    if (!existsSync(targetDir)) {
      fs.mkdir(targetDir, { recursive: true });
    }
  }
  currentPaths: Storage.Paths = path.normalize(this.targetDir).split(path.sep);
  private getFilepath(paths: Storage.Paths) {
    return this.currentPaths.concat(paths).join(path.sep);
  }
  async setBinary(paths: Storage.Paths, data: Uint8Array) {
    const filepath = this.getFilepath(paths);
    await fs.mkdir(path.dirname(filepath), { recursive: true });
    await fs.writeFile(filepath, data);
  }
  async getBinary(paths: Storage.Paths) {
    const filepath = this.getFilepath(paths);
    if (existsSync(filepath)) {
      return fs.readFile(filepath);
    }
  }
  async getJsObject<T>(paths: Storage.Paths) {
    const binary = await this.getBinary(paths);
    if (binary) {
      return deserialize(binary);
    }
  }
  setJsObject<T>(paths: Storage.Paths, data: T) {
    return this.setBinary(paths, serialize(data));
  }
  async has(paths: Storage.Paths) {
    const filepath = this.getFilepath(paths);
    return existsSync(filepath);
  }
  async del(paths: Storage.Paths) {
    const filepath = this.getFilepath(paths);
    if (existsSync(filepath)) {
      await fs.rm(filepath, { recursive: true, force: true });
      return true;
    }
    return false;
  }
  async listPaths(paths: Storage.Paths) {
    const filepath = this.getFilepath(paths);
    const mul_paths: string[] = [];
    const mul_keys: string[] = [];
    if (existsSync(filepath)) {
      for (const item of await fs.readdir(filepath)) {
        try {
          const stat = await fs.stat(path.join(filepath, item));
          if (stat.isFile()) {
            mul_keys.push(item);
          } else {
            mul_paths.push(item);
          }
        } catch {}
      }
    }
    return { paths: mul_paths, files: mul_keys };
  }
  fork(paths: Storage.Paths): Storage {
    throw new Error("Method not implemented.");
  }
}

type DelPathMap = Map<string, DelPathMap>;
/**
 * 删除的路径收集器
 * 路径只会被添加，不会被移除
 * 如果添加了文件或者文件路径，可以直接在cacheStore中找到实例，
 * 这里只是targetStore的遮罩
 */
class Del {
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
      const pathsList: Storage.Paths[] = [prevDelPaths];
      for (const [path, _pathMap] of pathMap) {
        pathsList.push(...lsPaths([...prevDelPaths, path], _pathMap));
      }
      return pathsList;
    };

    return lsPaths([], this._delPathMap);
  }
}

class NodeFilesystemsTransactionStorage extends StorageBase {
  readonly _cacheStore = new NodeFilesystemsStorageBase(this.transactionDir);
  readonly _targetStore = new NodeFilesystemsStorageBase(this.sourceTargetDir);
  readonly _del = new Del();
  constructor(
    readonly transactionDir: string,
    readonly sourceTargetDir: string,
  ) {
    super();
  }
  currentPaths: Storage.Paths = path
    .normalize(this.sourceTargetDir)
    .split(path.sep);
  setBinary(paths: Storage.Paths, data: Uint8Array) {
    return this._cacheStore.setBinary(paths, data);
  }
  async getBinary(paths: Storage.Paths) {
    const binary = await this._cacheStore.getBinary(paths);
    if (binary !== undefined) {
      return binary;
    }
    if (this._del.isDel(paths)) {
      return undefined;
    }
    return await this._targetStore.getBinary(paths);
  }
  async getJsObject<T>(paths: Storage.Paths) {
    if (await this._cacheStore.has(paths)) {
      return await this._cacheStore.getJsObject(paths);
    }
    if (this._del.isDel(paths)) {
      return undefined;
    }
    return await this._targetStore.getJsObject(paths);
  }
  setJsObject<T>(paths: Storage.Paths, data: T) {
    return this._cacheStore.setJsObject(paths, data);
  }

  async has(paths: Storage.Paths) {
    if (await this._cacheStore.has(paths)) {
      return true;
    }
    if (this._del.isDel(paths)) {
      return false;
    }
    return await this._targetStore.has(paths);
  }
  async del(paths: Storage.Paths) {
    /// 缓冲区没有可以删除的
    if ((await this._cacheStore.del(paths)) === false) {
      /// 判断遮罩是否已经已经删除过了
      if (this._del.isDel(paths)) {
        return false;
      }
    }
    /// 往遮罩中添加删除的路径
    this._del.addDel(paths);
    return true;
  }
  listPaths(
    paths: Storage.Paths,
  ): BFChainUtil.PromiseMaybe<{ paths: Storage.Paths; files: Storage.Paths }> {
    throw new Error("Method not implemented.");
  }
  fork(paths: Storage.Paths): Storage {
    throw new Error("Method not implemented.");
  }
}

class NodeFilesystemsStorage
  extends NodeFilesystemsStorageBase
  implements Storage
{
  private _tmpDirRoot = tmpdir();
  private _transactionMap = new Map<
    string,
    {
      transaction: NodeFilesystemsTransactionStorage;
      queue: PromiseOut<void>[];
      finished: PromiseOut<void>;
    }
  >();
  // private _
  async startTransaction(paths: Storage.Paths) {
    const tmpName = `nfs-trs-${Math.random().toString(36).substr(2)}`;

    const targetDir = path.resolve(this.targetDir, ...paths);
    let lock = this._transactionMap.get(targetDir);
    if (lock) {
      const waitter = new PromiseOut<void>();
      lock.queue.push(waitter);
      await waitter.promise;
    }
    lock = {
      transaction: new NodeFilesystemsTransactionStorage(
        path.join(this._tmpDirRoot, tmpName),
        targetDir,
      ),
      finished: new PromiseOut<void>(),
      queue: this._transactionMap.get(targetDir)?.queue || [],
    };
    this._transactionMap.set(targetDir, lock);
    lock.finished.onSuccess(() => {
      this._transactionMap.get(targetDir)?.queue.pop()?.resolve();
    });

    return lock.transaction;
  }
  async finishTransaction(transaction: NodeFilesystemsTransactionStorage) {
    const lock = this._transactionMap.get(transaction.sourceTargetDir);
    if (lock === undefined || lock.transaction !== transaction) {
      return false;
    }

    for (const paths of transaction._del.ls()) {
      await transaction._targetStore.del(paths);
    }
    await fs.cp(transaction.transactionDir, transaction.sourceTargetDir, {
      recursive: true,
    });
    await transaction._cacheStore.del([]);
    return true;
  }
  async stopTransaction(transaction: NodeFilesystemsTransactionStorage) {
    const lock = this._transactionMap.get(transaction.sourceTargetDir);
    if (lock === undefined || lock.transaction !== transaction) {
      return false;
    }
    await transaction._cacheStore.del([]);
    lock.finished.resolve();
    return true;
  }
}

export { NodeFilesystemsStorage as FilesystemsStorage };
