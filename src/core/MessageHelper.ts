import { Injectable } from "@bfchain/util";

@Injectable()
/**
 * 提供对泛型数据统一的信息读取解析的工具函数
 */
export abstract class MessageHelper<D> {
  /**获取消息的签名 */
  abstract getSignature(msg: D): Uint8Array;
  /**获取消息的时间 */
  abstract getCreateTime(msg: D): number;
  /**判断消息与指定签名是否匹配
   * @tip 这里只提供最基础的纯JS实现，不同平台或者具体情况应当可以提供更进一步的实现
   */
  msgIsSign(msg: D, expectSign: Uint8Array) {
    return this.signIsSign(this.getSignature(msg), expectSign);
  }
  /**
   * 判断两个签名是否匹配
   * @tip 这里只提供最基础的纯JS实现，不同平台或者具体情况应当可以提供更进一步的实现
   * @todo 签名应该也统一使用泛型来允许用户自定义签名
   */
  signIsSign(s1: Uint8Array, s2: Uint8Array) {
    if (s1.length !== s2.length) {
      return false;
    }
    for (let i = 0; i < s1.length; ++i) {
      if (s2[i] !== s1[i]) {
        return false;
      }
    }
    return true;
  }
  /**对比排序
   * @tip 这里只提供最基础的纯JS实现，不同平台或者具体情况应当可以提供更进一步的实现
   */
  compareMessage(msg1: D, msg2: D) {
    const t1 = this.getCreateTime(msg1);
    const t2 = this.getCreateTime(msg2);
    if (t1 < t2) {
      return -1;
    }
    if (t1 > t2) {
      return 1;
    }
    const s1 = this.getSignature(msg1);
    const s2 = this.getSignature(msg2);
    if (s1.length < s2.length) {
      return -1;
    }
    if (s1.length > s2.length) {
      return 1;
    }
    for (let i = 0; i < s1.length; ++i) {
      const c1 = s1[i];
      const c2 = s2[i];
      if (c1 < c2) {
        return -1;
      }
      if (c1 > c2) {
        return 1;
      }
    }
    return 0;
  }
}
