# Cryptolalia Tree 密语树

> 基于时间线的去中心的数据存储方案，提供从其它节点数据数的算法

## 原理 principle

在去中心化的角度来说，“时间”是一个不可靠的概念，所以这里我们通过定义两种时间，来确保数据的一致性的同时，也确保了可用性。
其中，一致性是围绕数据的生成时间；可用性则是围绕接收到（存储）数据的时间。
也因此，我们有两张表来存储这些数据，前者是 timelinetree，后者是 datalist。

- timelinetree 是以一个树状的结构去存储数据，随着时间的增长，树会越来越高，也就是 level 会越来越高，但因为是树状的结构，所以可以保证高效的同步，因为我们只需要比对 high-level 的 hash 即可知道某一时间段的数据是否完全一致。
- datalist 则只是根据接收时间存储这些数据，它的作用，是用于聊天界面上，可以根据接收时间，正确地显示先后接收到的信息。因为这些信息的展示顺序是根据接收到的时间来排序，而不会因信息的创建时间来排序，所以能确保用户能不遗漏地收取数据（假象一下，如果只有 timelinetree 的情况下， 你突然收到了一条昨天的数据，根据 timelinetree 的时间排序，要读取到这条信息，用户就得手动去翻取昨天的聊天记录才能看到这条消息）

## 用法 Usage

1. 开发者需要自定义数据格式
1. 开发者需要为自定义数据格式提供工具集
   > 工具集中需要包含两个基本信息
   1. 数据时间
      > 用于数据排序
   1. 数据签名
      > 用于区分两个数据的根本差距，同时对数据做签名保护
1. 开发者需要定义存储配置信息
   1. 每一个时间片是多长？比如一分钟一片数据
   1. 数据的起始时间是什么时候（对于少于这个时间的数据都是非法数据）
   1. 多少片数据能形成一股数据，比如 64 片形成一个分组
1. 开发者需要提供同步所需的通讯通道
   1. 包含 postMessage 发送数据的实现
   1. 包含 onMessage 接收数据的实现

```ts
import { Cryptolalia } from "@bfchain/cryptolalia-tree";
// 生成一个密语实例，它表示一个会话，可以是一个人、两个人、多个人在一起的会话
const cryptolalia1 = Resolve<Cryptolalia<MyMessage>>(Cryptolalia, moduleMap1);
// 清空数据库
await cryptolalia1.storage.del([]);

// 添加一条数据，这里的数据格式是自由定义的，开发者只需要提供messageHelper，确保能从这些消息中提取出createTime与signature这两个元数据信息
await cryptolalia1.addMsg({
   content: "hi~ I'm Gaubee",
   sender: "gaubee",
   time: Date.now(),
}),
```

## 提示 TIP

目前实现了基于**nodejs-fs-apis**的带事务的存储模块，并用在[测试代码](./src/test/test.ts)中。
会很快提供基于 indexedDB 的存储模块，用于浏览器端

```ts
import { env, cwd } from "node:process";
env.FSS_DIR = path.join(cwd(), "./.cache/fs/1");
Resolve(FilesystemsStorage, moduleMap1);
```
