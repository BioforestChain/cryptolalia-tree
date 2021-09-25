<script lang="ts">
  import { cryptolalia1, cryptolalia2, MyMessage } from "./cryptolalia";
  import Chat from "./Chat.svelte";
  import type { Cryptolalia } from "@bfchain/cryptolalia-tree";

  const SendMsgFactory = (
    sender: string,
    cryptolalia: Cryptolalia<MyMessage>,
  ) => {
    return (text: string) => {
      return cryptolalia.addMsg({
        content: text,
        sender: sender,
        time: Date.now(),
      });
    };
  };
  const SyncMsgFactory = (cryptolalia: Cryptolalia<MyMessage>) => {
    return async () => {
      console.group("do sync");
      await cryptolalia.sync.doSync();
      console.groupEnd();
    };
  };
  const ListMsgFactory = (cryptolalia: Cryptolalia<MyMessage>) => {
    return async () => {
      const list: MyMessage[] = [];
      for (const item of await cryptolalia.getMsgList(Date.now(), {
        offset: 0,
        limit: 100,
        order: -1,
      })) {
        list.push(item.content);
      }
      return list;
    };
  };

  const sendMsg1 = SendMsgFactory("user1", cryptolalia1);
  const sendMsg2 = SendMsgFactory("user2", cryptolalia2);

  const sync1 = SyncMsgFactory(cryptolalia1);
  const sync2 = SyncMsgFactory(cryptolalia2);

  const list1 = ListMsgFactory(cryptolalia1);
  const list2 = ListMsgFactory(cryptolalia2);

  const isSelf1 = (sender) => sender === "user1";
  const isSelf2 = (sender) => sender === "user2";
</script>

<main class="chat-panels">
  <section class="chat-panel panel-1">
    <Chat doSend={sendMsg1} doSync={sync1} getList={list1} isSelf={isSelf1} />
  </section>
  <section class="chat-panel panel-2">
    <Chat doSend={sendMsg2} doSync={sync2} getList={list2} isSelf={isSelf2} />
  </section>
</main>

<style>
  .chat-panels {
    display: flex;
    flex-direction: row;
    width: 100%;
    justify-content: space-around;
  }
  .chat-panel {
    padding: 1em;
  }
</style>
