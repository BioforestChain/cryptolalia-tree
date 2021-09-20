import { Injectable, Resolvable } from "@bfchain/util";

@Injectable()
export abstract class StorageBase {
  abstract readonly currentPaths: Storage.Paths;
  abstract setBinary(
    paths: Storage.Paths,
    data: Uint8Array,
  ): BFChainUtil.PromiseMaybe<void>;
  // abstract setBlob(paths: Paths, data: AnyBlob): BFChainUtil.PromiseMaybe<void>;
  abstract getBinary(
    paths: Storage.Paths,
  ): BFChainUtil.PromiseMaybe<Uint8Array | undefined>;

  // abstract getBlob(paths: Paths): BFChainUtil.PromiseMaybe<AnyBlob | undefined>;
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
  abstract fork(paths: Storage.Paths): Storage;
}
@Injectable()
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
}

@Resolvable()
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
