import { Injectable, PromiseOut, Resolvable } from "@bfchain/util";

@Injectable()
export abstract class StorageBase {
  abstract readonly currentPaths: Storage.Paths;
  abstract setBinary(
    paths: Storage.Paths,
    data: Uint8Array,
  ): BFChainUtil.PromiseMaybe<void>;
  abstract getBinary(
    paths: Storage.Paths,
  ): BFChainUtil.PromiseMaybe<Uint8Array | undefined>;

  abstract getJsObject<T>(
    paths: Storage.Paths,
  ): BFChainUtil.PromiseMaybe<T | undefined>;
  abstract setJsObject<T>(
    paths: Storage.Paths,
    data: T,
  ): BFChainUtil.PromiseMaybe<void>;
  abstract has(paths: Storage.Paths): BFChainUtil.PromiseMaybe<boolean>;
  abstract del(paths: Storage.Paths): BFChainUtil.PromiseMaybe<boolean>;
  abstract listPaths(paths: Storage.Paths): BFChainUtil.PromiseMaybe<{
    paths: Storage.Paths;
    files: Storage.Paths;
  }>;
}
export abstract class Storage extends StorageBase {
  /**开始一个事务 */
  abstract startTransaction(
    paths: Storage.Paths,
  ): BFChainUtil.PromiseMaybe<TransactionStorage>;
  /**完成事务并生效 */
  abstract finishTransaction(
    transaction: TransactionStorage,
  ): BFChainUtil.PromiseMaybe<boolean>;
  /**终止事务 */
  abstract stopTransaction(
    transaction: TransactionStorage,
  ): BFChainUtil.PromiseMaybe<boolean>;
  abstract requestTransaction<R>(
    paths: Storage.Paths,
    cb: (transaction: TransactionStorage) => R,
  ): Promise<BFChainUtil.PromiseType<R>>;

  abstract fork(paths: Storage.Paths): Storage;
}

export const commonRequestTransaction = async <R>(
  storage: Storage,
  paths: Storage.Paths,
  cb: (transaction: TransactionStorage) => R,
) => {
  const transaction = await storage.startTransaction(paths);
  try {
    const res = await cb(transaction);
    await storage.finishTransaction(transaction);
    return res as unknown as Promise<BFChainUtil.PromiseType<R>>;
  } catch (err) {
    await storage.stopTransaction(transaction);
    throw err;
  }
};

export const requestTransaction = (
  paths: Storage.Paths,
  inProp: string,
  outProp: string,
) => {
  return (target: any, methodProp: string, description: PropertyDescriptor) => {
    const source_fun = description.value;
    if (typeof source_fun !== "function") {
      throw new TypeError();
    }
    const requestTransactionWrapped = async function (
      this: any,
      ...args: unknown[]
    ) {
      const trsP = new PromiseOut<TransactionStorage>();
      this[outProp] = trsP.promise;
      /// 立即执行，而不是放在requestTransaction回调中，以确保一些参数的初始化时机是遵循原来的
      const res = source_fun.apply(this, args);
      return (this[inProp] as Storage).requestTransaction(
        paths,
        (transaction) => {
          trsP.resolve(transaction);
          return res;
        },
      );
    };
    Reflect.set(requestTransactionWrapped, "source", source_fun);
    description.value = requestTransactionWrapped;
    return description;
  };
};

export abstract class TransactionStorage extends StorageBase {}
export abstract class FileAtomics {
  abstract exists(paths: Storage.Paths): BFChainUtil.PromiseMaybe<boolean>;
  abstract stat(paths: Storage.Paths): BFChainUtil.PromiseMaybe<boolean>;
  abstract open(paths: Storage.Paths): BFChainUtil.PromiseMaybe<number>;
  abstract write(
    hanlder: number,
    data: Uint8Array,
    offset: number,
    end: number,
  ): BFChainUtil.PromiseMaybe<void>;
  abstract read(
    hanlder: number,
    offset: number,
    end: number,
  ): BFChainUtil.PromiseMaybe<Uint8Array>;
  abstract close(paths: Storage.Paths): BFChainUtil.PromiseMaybe<void>;
}

export declare namespace Storage {
  type Stat = {
    // mime: string;
    size: number;
    createTime: number;
    modifyTime: number;
  };
  type PathSlice = string;
  type Paths = ReadonlyArray<PathSlice>;
  // type AnyBlob = Blob | import("node:buffer").Blob;
}

// class JsonStorageAdaptor extends StorageAdaptor {}
// class IndexeddbStorageAdaptor extends StorageAdaptor {}
// class NodeFilesystemsStorageAdaptor extends StorageAdaptor {}
