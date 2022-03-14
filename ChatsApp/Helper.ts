import { Injectable } from "@bfchain/util-dep-inject";
import type { ChatsApp } from "./ChatsApp";
import { CryptolaliaTypes } from "../src/typings";

/**
 * 提供对泛型数据统一的信息读取解析的工具函数
 */

@Injectable()
export abstract class ChatsAppHelper<
  S,
  D,
  W extends CryptolaliaTypes.Msg = CryptolaliaTypes.Msg,
> {
  /**根据会话信息获取会话ID */
  abstract getSessionId(sessionInfo: S): string;
  /**对比两个会话的顺序 */
  abstract compare(a: S, b: S): number;
  /**数据网络出口 */
  abstract sendMessage(sessionInfo: S, msg: ChatsApp.SessionMsg<D>): unknown;
  /**数据网络入口 */
  abstract onNewMessage?: (msg: ChatsApp.SessionMsg<D, W>) => unknown;

  /**交换会话信息进行握手
   * 可以不实现，等于完全拒绝与他人建立连接
   */
  abstract handshakeSession?: <I extends CryptolaliaTypes.Msg.In<W>>(
    sessionId: string,
    swapIn?: I,
  ) => BFChainUtil.PromiseMaybe<CryptolaliaTypes.Msg.GetOut<W, I> | undefined>;
}
