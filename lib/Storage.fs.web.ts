import { Inject } from "@bfchain/util-dep-inject";
import { PromiseOut } from "@bfchain/util-extends-promise-out";
import * as idb from "idb";
import { openDB } from "idb";
import {
  commonRequestTransaction,
  Storage,
  StorageBase,
  TransactionStorage,
} from "../src/Storage";
import {
  Del,
  deserialize,
  MemoryFilesystemsStorageBase,
  serialize,
} from "./storageHelper";

const enum CONST {
  PATH_SEP = "/",
  FILE_TYPE_FLAG = 1,
  DIR_TYPE_FLAG = 2,
  ROOT_DIR = ":root:",
}

class PathParser {
  readonly paths: Storage.Paths;
  constructor(paths: Storage.Paths | string, cwd?: Storage.Paths | string) {
    let isRoot = false;
    if (typeof paths === "string") {
      isRoot = paths.trimStart().startsWith("/");
      paths = paths.split(CONST.PATH_SEP).map((slice) => slice.trim());
    }
    if (cwd !== undefined) {
      if (typeof cwd === "string") {
        cwd = cwd.split(CONST.PATH_SEP);
      }
      cwd = PathParser.normal(cwd.map((slice) => slice.trim()));

      if (isRoot === false) {
        const mergedPaths = cwd.concat(paths);
        for (let i = 0; i > mergedPaths.length; ++i) {
          const slice = mergedPaths[i];
          if (slice === "..") {
            mergedPaths.splice(i - 1, 2);
            i -= 2;
          }
        }
        paths = mergedPaths;
      }

      if (cwd.length > paths.length) {
        throw new SyntaxError(`'${paths}' no belong to ${cwd}`);
      }
      for (let i = 0; i < cwd.length; ++i) {
        if (cwd[i] !== paths[i]) {
          throw new SyntaxError(`'${paths}' no belong to ${cwd}`);
        }
      }
    }
    this.paths = PathParser.normal(paths);
  }

  static normal(paths: Storage.Paths) {
    return paths.filter(
      (slice) => slice !== "" && slice.endsWith(".") === false,
    );
  }

  get dirname() {
    const parentPaths = this.paths.slice(0, -1);
    if (parentPaths.length > 0) {
      return parentPaths.join(CONST.PATH_SEP);
    }
    return CONST.ROOT_DIR;
  }
  get basename() {
    return this.paths[this.paths.length - 1];
  }
  get fullpath() {
    return this.paths.join(CONST.PATH_SEP);
  }
}

const enum STORE_CONST {
  FILE = "file",
  DIR = "dir",
}
declare namespace IDBFileSystem {
  type DirInfo =
    | {
        type: CONST.FILE_TYPE_FLAG;
        size: number;
        fid: number;
      }
    | { type: CONST.DIR_TYPE_FLAG };
  type DirInfoMap = Map<string, DirInfo>;
  type FSDBTypes = {
    [STORE_CONST.DIR]: { key: string; value: DirInfoMap };
    [STORE_CONST.FILE]: { key: number; value: Uint8Array };
  };
  type IDBPDatabase = idb.IDBPDatabase<FSDBTypes>;
  type DirStore<Mode extends IDBTransactionMode = "readonly"> =
    idb.IDBPObjectStore<IDBFileSystem.FSDBTypes, any, STORE_CONST.DIR, Mode>;
  type FileStore<Mode extends IDBTransactionMode = "readonly"> =
    idb.IDBPObjectStore<IDBFileSystem.FSDBTypes, any, STORE_CONST.FILE, Mode>;
}

const _IDB_CACHE_ = new Map<
  string,
  BFChainUtil.PromiseMaybe<IDBFileSystem.IDBPDatabase>
>();
const _getIdb = (idbName: string) => {
  let idb = _IDB_CACHE_.get(idbName);
  if (idb === undefined) {
    idb = openDB<IDBFileSystem.FSDBTypes>(idbName, 1, {
      upgrade(database, oldVersion, newVersion, transaction) {
        switch (oldVersion) {
          case 0:
            const dirStore = database.createObjectStore(STORE_CONST.DIR, {
              autoIncrement: false,
              keyPath: null,
            });
            dirStore.put(new Map(), CONST.ROOT_DIR);
            // dirStore.createIndex("dirinfo", CONST.DIR_KEY, { unique: true });

            const fileStore = database.createObjectStore(STORE_CONST.FILE, {
              autoIncrement: true,
              keyPath: null,
            });
        }
      },
    }).then((idb) => (_IDB_CACHE_.set(idbName, idb), idb));
    _IDB_CACHE_.set(idbName, idb);
  }
  return idb;
};

class IDBFileSystem {
  constructor(readonly dbName: string /* readonly cwd: Storage.Paths */) {}
  private _idb = _getIdb(this.dbName);

  /**是否存在 */
  async exists(pathname: string | Storage.Paths) {
    const idb = await this._idb;
    const { dirname, basename } = new PathParser(pathname);
    const dirInfo = await idb.get(STORE_CONST.DIR, dirname);
    if (dirInfo !== undefined) {
      return dirInfo.has(basename);
    }
    return false;
  }

  /**写入文件 */
  async writeFile(
    filePathname: string | Storage.Paths,
    fileContent: Uint8Array,
  ) {
    const idb = await this._idb;
    const trs = idb.transaction(
      [STORE_CONST.FILE, STORE_CONST.DIR],
      "readwrite",
    );
    const dirStore = trs.objectStore(STORE_CONST.DIR);
    const fileStore = trs.objectStore(STORE_CONST.FILE);

    const { dirname, basename } = new PathParser(filePathname);
    const dirInfoMap = await dirStore.get(dirname);
    if (dirInfoMap === undefined) {
      throw new Error(`ENOENT: no such file or directory, open '${dirname}'`);
    }
    let fileInfo = dirInfoMap.get(basename);
    if (fileInfo !== undefined) {
      if (fileInfo.type !== CONST.FILE_TYPE_FLAG) {
        throw new Error(
          `EISDIR: illegal operation on a directory, open '${basename}'`,
        );
      }
      fileInfo.size = fileContent.length;
      fileInfo.fid;
    } else {
      fileInfo = {
        type: CONST.FILE_TYPE_FLAG,
        size: fileContent.length,
        fid: -1,
      };
      dirInfoMap.set(basename, fileInfo);
    }

    /// 保存文件，并删除旧文件
    const fileHanlderId = await fileStore.add(fileContent);
    if (fileInfo.fid !== -1) {
      await fileStore.delete(fileInfo.fid);
    }
    fileInfo.fid = fileHanlderId;

    /// 更新目录下的元数据信息
    await dirStore.put(dirInfoMap, dirname);
  }

  private async _mkdir(
    dirname: string,
    recursive: boolean,
    dirStore: IDBFileSystem.DirStore<"readwrite">,
  ): Promise<IDBFileSystem.DirInfoMap> {
    const { dirname: parentDirname, basename: dirBasename } = new PathParser(
      dirname,
    );

    let parentDirInfoMap = await dirStore.get(parentDirname);
    if (parentDirInfoMap === undefined) {
      if (recursive === false) {
        throw new Error(
          `ENOENT: no such file or directory, mkdir '${dirname}'`,
        );
      }
      parentDirInfoMap = await this._mkdir(parentDirname, recursive, dirStore);
    }
    const info = parentDirInfoMap.get(dirBasename);
    if (info?.type === CONST.FILE_TYPE_FLAG) {
      throw new Error(`EEXIST: file already exists, mkdir '${dirname}'`);
    }
    let dirInfoMap: IDBFileSystem.DirInfoMap | undefined;
    if (info !== undefined) {
      dirInfoMap = await dirStore.get(dirname);
    }
    if (dirInfoMap === undefined) {
      dirInfoMap = new Map();
      await dirStore.put(dirInfoMap, dirname);
      parentDirInfoMap.set(dirBasename, { type: CONST.DIR_TYPE_FLAG });
      await dirStore.put(parentDirInfoMap, parentDirname);
    }
    return dirInfoMap;
  }

  async mkdir(dirname: string, options: { recursive?: boolean } = {}) {
    const { recursive = false } = options;
    const idb = await this._idb;
    const trs = idb.transaction(STORE_CONST.DIR, "readwrite");
    const dirStore = trs.objectStore(STORE_CONST.DIR);
    await this._mkdir(new PathParser(dirname).fullpath, recursive, dirStore);
  }

  async readFile(filePathname: string | Storage.Paths) {
    const idb = await this._idb;
    const trs = idb.transaction(
      [STORE_CONST.FILE, STORE_CONST.DIR],
      "readwrite",
    );
    const dirStore = trs.objectStore(STORE_CONST.DIR);
    const fileStore = trs.objectStore(STORE_CONST.FILE);

    const { dirname, basename } = new PathParser(filePathname);
    const dirInfoMap = await dirStore.get(dirname);
    if (dirInfoMap === undefined) {
      throw new Error(`ENOENT: no such file or directory, open '${dirname}'`);
    }
    const fileInfo = dirInfoMap.get(basename);
    if (fileInfo === undefined) {
      throw new Error(
        `ENOENT: no such file or directory, open '${filePathname}'`,
      );
    }
    if (fileInfo.type === CONST.DIR_TYPE_FLAG) {
      throw new Error(`EISDIR: illegal operation on a directory, read`);
    }
    const fileContent = await fileStore.get(fileInfo.fid);
    return fileContent;
  }

  private async _recursive_rmdir(
    pathname: string,
    dirStore: IDBFileSystem.DirStore<"readwrite">,
    fileStore: IDBFileSystem.FileStore<"readwrite">,
  ) {
    const dirInfoMap = await dirStore.get(pathname);
    if (dirInfoMap === undefined) {
      return;
    }

    for (const [childBasename, childInfo] of dirInfoMap) {
      if (childInfo.type === CONST.FILE_TYPE_FLAG) {
        await fileStore.delete(childInfo.fid);
      } else {
        this._recursive_rmdir(
          pathname + CONST.PATH_SEP + childBasename,
          dirStore,
          fileStore,
        );
      }
    }
    await dirStore.delete(pathname);
  }

  private async _rm(
    pathname: string,
    recursive: boolean,
    force: boolean,
    dirStore: IDBFileSystem.DirStore<"readwrite">,
    fileStore: IDBFileSystem.FileStore<"readwrite">,
  ) {
    const { dirname: parentDirname, basename } = new PathParser(pathname);
    const parentDirInfoMap = await dirStore.get(parentDirname);
    let info: IDBFileSystem.DirInfo | undefined;
    if (parentDirInfoMap !== undefined) {
      info = parentDirInfoMap.get(basename);
    }
    if (info === undefined) {
      if (force === false) {
        throw new Error(
          `ENOENT: no such file or directory, stat '${pathname}'`,
        );
      }
      return;
    }

    if (info.type === CONST.FILE_TYPE_FLAG) {
      await fileStore.delete(info.fid);
    } else {
      if (recursive === false) {
        throw new Error(`EISDIR: Path is a directory: '${pathname}'`);
      }
      await this._recursive_rmdir(pathname, dirStore, fileStore);
    }
    parentDirInfoMap!.delete(basename);
    await dirStore.put(parentDirInfoMap!, parentDirname);
  }
  async rm(
    pathname: string,
    options: { recursive?: boolean; force?: boolean } = {},
  ) {
    const { recursive = false, force = false } = options;
    const idb = await this._idb;
    const trs = idb.transaction(
      [STORE_CONST.FILE, STORE_CONST.DIR],
      "readwrite",
    );
    const dirStore = trs.objectStore(STORE_CONST.DIR);
    const fileStore = trs.objectStore(STORE_CONST.FILE);

    await this._rm(pathname, recursive, force, dirStore, fileStore);
  }

  async readdir(dirname: string) {
    const idb = await this._idb;
    const trs = idb.transaction(STORE_CONST.DIR, "readwrite");
    const dirStore = trs.objectStore(STORE_CONST.DIR);
    const dirInfoMap = await dirStore.get(dirname);
    if (dirInfoMap === undefined) {
      throw new Error(
        `ENOENT: no such file or directory, scandir '${dirname}'`,
      );
    }

    return dirInfoMap.entries();
  }
}

const ARGS = {
  IDB_NAME: Symbol("idbName"),
  TARGET_DIR: Symbol("targetDir"),
};
class IndexeddbFilesystemStorageBase extends StorageBase {
  static readonly ARGS = ARGS;
  constructor(
    @Inject(ARGS.TARGET_DIR, { optional: true })
    protected targetDir: string = "usr",
    @Inject(ARGS.IDB_NAME, { optional: true })
    readonly idbName: string = "cryptolalia-tree-fs",
  ) {
    super();
  }
  currentPaths: Storage.Paths = this.targetDir
    .split(CONST.PATH_SEP)
    .map((slice) => slice.trim())
    .filter(Boolean);
  private _fs = new IDBFileSystem(this.idbName);

  async setBinary(paths: Storage.Paths, data: Uint8Array) {
    const { dirname: dir, fullpath: filepath } = new PathParser(
      paths,
      this.currentPaths,
    );
    if ((await this._fs.exists(dir)) === false) {
      await this._fs.mkdir(dir, { recursive: true });
    }
    await this._fs.writeFile(filepath, data);
  }
  async getBinary(paths: Storage.Paths) {
    const { fullpath: filepath } = new PathParser(paths, this.currentPaths);
    if (await this._fs.exists(filepath)) {
      return this._fs.readFile(filepath);
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
    const { fullpath: filepath } = new PathParser(paths, this.currentPaths);
    return await this._fs.exists(filepath);
  }
  async del(paths: Storage.Paths) {
    const { fullpath: filepath } = new PathParser(paths, this.currentPaths);
    if (await this._fs.exists(filepath)) {
      await this._fs.rm(filepath, { recursive: true, force: true });
      return true;
    }
    return false;
  }
  async listPaths(paths: Storage.Paths) {
    const { fullpath: filepath } = new PathParser(paths, this.currentPaths);
    const mul_paths: string[] = [];
    const mul_keys: string[] = [];
    if (await this._fs.exists(filepath)) {
      for (const [item, info] of await this._fs.readdir(filepath)) {
        try {
          if (info.type === CONST.FILE_TYPE_FLAG) {
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

class IndexeddbFilesystemTransactionStorage extends StorageBase {
  readonly _cacheStore = new MemoryFilesystemsStorageBase(["transaction"]);
  readonly _targetStore = new IndexeddbFilesystemStorageBase(
    this.sourceTargetDir,
  );
  readonly _del = new Del();
  constructor(
    readonly sourceTargetDir: string,
    readonly idbName: string = "cryptolalia-tree-fs",
  ) {
    super();
  }
  currentPaths: Storage.Paths = new PathParser(this.sourceTargetDir).paths;

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
      return await this._cacheStore.getJsObject<T>(paths);
    }
    if (this._del.isDel(paths)) {
      return undefined;
    }
    return await this._targetStore.getJsObject<T>(paths);
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
}

class IndexeddbFilesystemsStorage
  extends IndexeddbFilesystemStorageBase
  implements Storage
{
  private _transactionMap = new Map<
    string,
    {
      transaction: IndexeddbFilesystemTransactionStorage;
      queue: PromiseOut<void>[];
      finished: PromiseOut<void>;
    }
  >();
  // private _
  async startTransaction(paths: Storage.Paths) {
    const targetDir = new PathParser(paths, this.targetDir).fullpath;
    let _lock = this._transactionMap.get(targetDir);
    if (_lock) {
      debugger;
      const waitter = new PromiseOut<void>();
      _lock.queue.push(waitter);
      await waitter.promise;
    }
    const lock = {
      transaction: new IndexeddbFilesystemTransactionStorage(targetDir),
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
  async finishTransaction(transaction: IndexeddbFilesystemTransactionStorage) {
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
  async stopTransaction(transaction: IndexeddbFilesystemTransactionStorage) {
    const lock = this._transactionMap.get(transaction.sourceTargetDir);
    if (lock === undefined || lock.transaction !== transaction) {
      return false;
    }

    lock.finished.resolve();
    return true;
  }
  fork(paths: Storage.Paths): Storage {
    const forkTargetDir = new PathParser(paths, this.targetDir).fullpath;
    return new IndexeddbFilesystemsStorage(forkTargetDir);
  }
}

export { IndexeddbFilesystemsStorage as FilesystemStorage };
