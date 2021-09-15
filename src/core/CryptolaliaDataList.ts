import { StorageAdaptor } from "./StorageAdaptor";
import { TimeHelper } from "#TimeHelper";
import { CryptolaliaConfig } from "./CryptolaliaConfig";
import { Injectable } from "@bfchain/util";

/**
 * 数据列表
 * 根据自己接收到的数据来打上唯一的接收时间戳，并按接收时间归档
 */

@Injectable()
export class CryptolaliaDataList<D> {
  constructor(
    private config: CryptolaliaConfig,
    private timeHelper: TimeHelper,
    private storage: StorageAdaptor,
  ) {}
  private _perTime = 0;
  /**添加元素 */
  async addItem(data: Uint8Array) {
    const now = this.timeHelper.max(this._perTime + 1);
    this._perTime = now;

    const timeId = Math.ceil(
      (now - this.config.startTime) / this.config.timespan,
    );

    const jsonData = await this.storage.getBinary(["data-list", `1-${timeId}`]);
    const json = jsonData ? JSON.parse(new TextDecoder().decode(jsonData)) : [];
    json.push({
      createTime: now,
      data: data,
    });
    this.storage.setBinary(
      ["data-list", `1-${timeId}`],
      new TextEncoder().encode(JSON.stringify(json)),
    );
  }
  /**添加元素 */
  addItems(datas: Iterable<Uint8Array>) {
    for (const data of datas) {
      this.addItem(data);
    }
  }
  /**读取N条数据 */
  readItems(timestamp: number, limit: number) {}
}
