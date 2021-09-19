import { Injectable } from "@bfchain/util";

@Injectable()
export abstract class Storage {
  abstract readonly currentPaths: Storage.Paths;
  abstract setBinary(paths: Storage.Paths, data: Uint8Array): Promise<void>;
  // abstract setBlob(paths: Paths, data: AnyBlob): Promise<void>;
  abstract getBinary(paths: Storage.Paths): Promise<Uint8Array | undefined>;

  // abstract getBlob(paths: Paths): Promise<AnyBlob | undefined>;
  abstract getJsObject<T>(paths: Storage.Paths): Promise<T | undefined>;
  abstract setJsObject<T>(paths: Storage.Paths, data: T): Promise<void>;
  abstract has(paths: Storage.Paths): Promise<boolean>;
  abstract del(paths: Storage.Paths): Promise<boolean>;
  abstract listPaths(paths: Storage.Paths): Promise<{
    paths: Storage.Paths;
    files: Storage.Paths;
  }>;
  abstract fork(paths: Storage.Paths): Storage;
}

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
