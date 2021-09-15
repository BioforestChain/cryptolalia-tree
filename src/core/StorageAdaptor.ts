import { Injectable } from "@bfchain/util";

export type PathSlice = string | number;
export type Paths = ReadonlyArray<PathSlice>;
export type AnyBlob = Blob | import("node:buffer").Blob;

@Injectable()
export abstract class StorageAdaptor {
  abstract readonly currentPaths: Paths;
  abstract setBinary(paths: Paths, data: Uint8Array): Promise<void>;
  abstract setBlob(paths: Paths, data: AnyBlob): Promise<void>;
  abstract getBinary(paths: Paths): Promise<Uint8Array | undefined>;
  abstract getBlob(paths: Paths): Promise<AnyBlob | undefined>;
  abstract getJson<T>(paths: Paths): Promise<T | undefined>;
  abstract setJson<T>(paths: Paths, data: T): Promise<void>;
  abstract has(paths: Paths): Promise<boolean>;
  abstract del(paths: Paths): Promise<boolean>;
  abstract listPaths(paths: Paths): Promise<{
    paths: Paths;
    keys: Paths;
  }>;
  abstract fork(paths: Paths): StorageAdaptor;
}
// class JsonStorageAdaptor extends StorageAdaptor {}
// class IndexeddbStorageAdaptor extends StorageAdaptor {}
// class NodeFilesystemsStorageAdaptor extends StorageAdaptor {}
