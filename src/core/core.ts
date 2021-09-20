import type { CryptolaliaTimelineTree } from "./CryptolaliaTimelineTree";
import type { CryptolaliaDataList } from "./CryptolaliaDataList";
import type { MessageHelper } from "./MessageHelper";
import type { Storage, StorageBase } from "./Storage";
/**
 * 添加数据
 * @param msg 消息内容
 */
export const addMsg = async <D>(
  msgHelper: MessageHelper<D>,
  timelineTree: CryptolaliaTimelineTree<D>,
  dataList: CryptolaliaDataList<CryptolaliaCore.RawDataItem>,
  msg: D,
) => {
  const success = await timelineTree.addLeaf(msg);
  if (success !== false) {
    const { branchId } = success;
    await dataList.addItem({
      sign: msgHelper.getSignature(msg),
      branchId,
    });
    return true;
  }
  return false;
};
export const addManyMsg = async <D>(
  msgHelper: MessageHelper<D>,
  timelineTree: CryptolaliaTimelineTree<D>,
  dataList: CryptolaliaDataList<CryptolaliaCore.RawDataItem>,
  msgs: Iterable<D>,
) => {
  const resultList = await timelineTree.addManyLeaf(msgs);
  const datas: { sign: Uint8Array; branchId: number }[] = [];

  const successList = [];
  for (const result of resultList) {
    if (result.success !== false) {
      datas.push({
        sign: msgHelper.getSignature(result.leaf),
        branchId: result.success.branchId,
      });
      successList.push(true);
    } else {
      successList.push(false);
    }
  }
  await dataList.addManyItem(datas);
  return successList;
};

export const getJsObject = <T, R>(
  storage: StorageBase,
  paths: Storage.Paths,
  onfulfilled: (val?: T) => R,
) => {
  const obj = storage.getJsObject<T>(paths);
  if (obj !== undefined && "then" in obj) {
    return obj.then((obj) => onfulfilled(obj)) as PromiseLike<
      BFChainUtil.PromiseType<R>
    >;
  }
  return onfulfilled(obj) as R;
};

// type DefaultHelper<T> =
//   | { builder: () => BFChainUtil.PromiseMaybe<T> }
//   | { value: T };
// const _objGetter = <T>(obj: T | undefined, defaultHelper: DefaultHelper<T>) => {
//   return obj === undefined
//     ? obj
//     : "value" in defaultHelper
//     ? defaultHelper.value
//     : defaultHelper.builder();
// };

export declare namespace CryptolaliaCore {
  type RawDataItem = {
    sign: Uint8Array;
    branchId: number;
  };
}
