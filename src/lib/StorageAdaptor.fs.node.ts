import { Paths, StorageAdaptor } from "../core/StorageAdaptor";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { deserialize, serialize } from "node:v8";
import { Blob, Buffer } from "node:buffer";
import { Inject } from "@bfchain/util";

const ARGS = {
  TARGET_DIR: Symbol("targetDir"),
};
class NodeFilesystemsStorageAdaptor extends StorageAdaptor {
  static readonly ARGS = ARGS;
  constructor(
    @Inject(ARGS.TARGET_DIR, { optional: true })
    private targetDir: string = process.cwd(),
  ) {
    super();
    if (!existsSync(targetDir)) {
      fs.mkdir(targetDir, { recursive: true });
    }
  }
  currentPaths: Paths = path.normalize(this.targetDir).split(path.sep);
  private getFilepath(paths: Paths) {
    return this.currentPaths.concat(paths).join(path.sep);
  }
  async setBinary(paths: Paths, data: Uint8Array): Promise<void> {
    const filepath = this.getFilepath(paths);
    await fs.mkdir(path.dirname(filepath), { recursive: true });
    await fs.writeFile(filepath, data);
  }
  async setBlob(paths: Paths, data: Blob): Promise<void> {
    return this.setBinary(paths, new Uint8Array(await data.arrayBuffer()));
  }
  async getBinary(paths: Paths): Promise<Uint8Array | undefined> {
    const filepath = this.getFilepath(paths);
    if (existsSync(filepath)) {
      return fs.readFile(filepath);
    }
  }
  async getBlob(paths: Paths): Promise<Blob | undefined> {
    const binary = await this.getBinary(paths);
    if (binary) {
      return new Blob([binary]);
    }
  }
  async getJsObject<T>(paths: Paths): Promise<T | undefined> {
    const binary = await this.getBinary(paths);
    if (binary) {
      return deserialize(binary);
    }
  }
  setJsObject<T>(paths: Paths, data: T): Promise<void> {
    return this.setBinary(paths, serialize(data));
  }
  async has(paths: Paths): Promise<boolean> {
    const filepath = this.getFilepath(paths);
    return existsSync(filepath);
  }
  async del(paths: Paths): Promise<boolean> {
    const filepath = this.getFilepath(paths);
    if (existsSync(filepath)) {
      fs.rm(filepath, { recursive: true });
      return true;
    }
    return false;
  }
  async listPaths(paths: Paths): Promise<{ paths: Paths; keys: Paths }> {
    const filepath = this.getFilepath(paths);
    const mul_paths: string[] = [];
    const mul_keys: string[] = [];
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
    return { paths: mul_paths, keys: mul_keys };
  }
  fork(paths: Paths): StorageAdaptor {
    throw new Error("Method not implemented.");
  }
}

export { NodeFilesystemsStorageAdaptor as FilesystemsStorageAdaptor };
