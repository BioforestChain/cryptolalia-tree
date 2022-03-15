import { Inject } from "@bfchain/util-dep-inject";
import { PromiseOut } from "@bfchain/util-extends-promise-out";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { cwd, env } from "node:process";
import {
  commonRequestTransaction,
  Storage,
  StorageBase,
  TransactionStorage,
} from "../src/Storage";
import {
  Del,
  deserialize,
  MemoryStorageBase,
  serialize,
  TransactionStorageBase,
} from "./storageHelper";

const ARGS = {
  TARGET_DIR: Symbol("targetDir"),
};
class NodeFilesystemStorageBase extends StorageBase {
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
    const dir = path.dirname(filepath);
    if (existsSync(dir) === false) {
      await fs.mkdir(dir, { recursive: true });
    }
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
      return deserialize<T>(binary);
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
}

class NodeFilesystemTransactionStorage extends TransactionStorageBase {
  readonly _targetStore = new NodeFilesystemStorageBase(this.sourceTargetDir);
  constructor(readonly sourceTargetDir: string) {
    super();
  }
  currentPaths: Storage.Paths = path
    .normalize(this.sourceTargetDir)
    .split(path.sep);
}

class NodeFilesystemsStorage
  extends NodeFilesystemStorageBase
  implements Storage
{
  private _transactionMap = new Map<
    string,
    {
      transaction: NodeFilesystemTransactionStorage;
      queue: PromiseOut<void>[];
      finished: PromiseOut<void>;
    }
  >();
  // private _
  async startTransaction(paths: Storage.Paths) {
    const targetDir = path.resolve(this.targetDir, ...paths);
    let _lock = this._transactionMap.get(targetDir);
    if (_lock) {
      const waitter = new PromiseOut<void>();
      _lock.queue.push(waitter);
      await waitter.promise;
    }
    const lock = {
      transaction: new NodeFilesystemTransactionStorage(targetDir),
      finished: new PromiseOut<void>(),
      queue: _lock?.queue || [],
    };
    this._transactionMap.set(targetDir, lock);
    lock.finished.onSuccess(() => {
      const resolve = lock.queue.pop()?.resolve;
      if (resolve === undefined) {
        this._transactionMap.delete(targetDir);
      } else {
        resolve();
      }
    });

    return lock.transaction;
  }
  async finishTransaction(transaction: NodeFilesystemTransactionStorage) {
    const lock = this._transactionMap.get(transaction.sourceTargetDir);
    if (lock === undefined || lock.transaction !== transaction) {
      return false;
    }

    for (const paths of transaction._del.ls()) {
      await transaction._targetStore.del(paths);
    }

    const targetStorage = transaction._targetStore;
    for (const [paths, file] of transaction._cacheStore.WalkFiles()) {
      await targetStorage.setBinary(
        paths,
        file.binary || serialize(file.jsobj!.value),
      );
    }

    lock.finished.resolve();
    return true;
  }
  requestTransaction<R>(
    paths: Storage.Paths,
    cb: (transaction: TransactionStorage) => R,
  ): Promise<BFChainUtil.PromiseType<R>> {
    return commonRequestTransaction(this, paths, cb);
  }
  async stopTransaction(transaction: NodeFilesystemTransactionStorage) {
    const lock = this._transactionMap.get(transaction.sourceTargetDir);
    if (lock === undefined || lock.transaction !== transaction) {
      return false;
    }

    lock.finished.resolve();
    return true;
  }
  fork(paths: Storage.Paths): Storage {
    const forkTargetDir = path.join(this.targetDir, ...paths);
    return new NodeFilesystemsStorage(forkTargetDir);
  }
}

export { NodeFilesystemsStorage as FilesystemStorage };
