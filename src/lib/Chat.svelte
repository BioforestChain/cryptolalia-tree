<script lang="ts">
  import { onMount } from "svelte";
  import { fly } from "svelte/transition";
  import type { MyMessage } from "./superCryptolalia";
  let list: MyMessage[] = [];
  let wordToSend = "";

  let sending = false;
  const _doSend = async () => {
    if (sending) {
      return;
    }
    const text = wordToSend.trim();
    if (text.length === 0) {
      return;
    }
    sending = true;
    try {
      await doSync();
      console.log("do send", text);
      await doSend(text);
      wordToSend = "";
      list = await getList();
    } finally {
      sending = false;
    }
  };

  let isFirst = true;
  let syncing = false;
  const _doSync = async () => {
    if (syncing) {
      return;
    }
    syncing = true;
    try {
      await doSync();
      list = await getList();
    } finally {
      syncing = false;
    }
  };
  const _doClear = async () => {
    syncing = true;
    try {
      await doClear();
      list = await getList();
    } finally {
      syncing = false;
    }
  };
  export let doSend: (text: string) => BFChainUtil.PromiseMaybe<unknown> = (
    text: string,
  ) => {};
  export let doSync: () => BFChainUtil.PromiseMaybe<unknown> = () => {};
  export let getList: () => BFChainUtil.PromiseMaybe<MyMessage[]> = () => {
    return [];
  };
  export let doClear: () => BFChainUtil.PromiseMaybe<void> = () => {};
  export let isSelf = (sender: string) => {
    return false;
  };
  onMount(_doSync);

  export const onListChanged = () => {
    return _doSync();
  };
  function bindEvents(element, events) {
    const listeners = Object.entries(events).map(([event, handler]) => {
      const listener = element.addEventListener(event, handler);

      return [event, listener];
    });

    return {
      destroy() {
        listeners.forEach(([event, listener]) => {
          element.removeEventListener(event, listener);
        });
      },
    };
  }
</script>

<ul class="list" class:syncing>
  {#each list as item, index (item.time)}
    <li
      class="item"
      class:self={isSelf(item.sender)}
      in:fly={{
        delay: Math.log2(index + 1) * 100,
        duration: 300,
        y: isFirst ? -50 : 50,
        opacity: 0,
      }}
      use:bindEvents={index === 0 ? { introend: () => (isFirst = false) } : {}}
    >
      <span class="time-tip">{new Date(item.time).toLocaleTimeString()}</span>
      <div class="content-area">
        <address class="avator">{item.sender}</address>
        <p class="message">{item.content}</p>
      </div>
    </li>
  {/each}
</ul>
<div class="msgcontroller-panel">
  <input
    type="text"
    class="word-to-send"
    disabled={sending}
    bind:value={wordToSend}
    placeholder="请输入要发送的内容"
  />
  <button class="do-send" class:activing={sending} on:click={_doSend}
    >发送</button
  >
</div>
<div class="controller-panel">
  <button class="do-sync" class:activing={syncing} on:click={_doSync}
    >同步</button
  >
  <button class="do-sync" class:activing={syncing} on:click={_doClear}
    >清空</button
  >
</div>

<style>
  .list {
    padding: 1em 0.5em;
    border: none;
    border-radius: 0.25em;
    background: #e0e0e0;
    box-shadow: inset 3px 3px 6px #bebebe, inset -3px -3px 6px #ffffff;

    display: flex;
    flex-direction: column-reverse;
    height: 20em;
    overflow: auto;
    scrollbar-gutter: stable;
  }
  .list:empty {
    justify-content: center;
  }
  .list:empty::before {
    content: "暂无内容";
    opacity: 0.3;
  }
  .list.syncing::before {
    content: "加载中";
  }
  .list .item {
    list-style: none;
    padding: 0.25em 0;
  }
  .time-tip {
    padding: 0.25em;
    font-size: small;
    opacity: 0.2;
    font-family: monospace;
    display: block;
    transform: scale(0.5);
  }
  .content-area {
    display: flex;
    justify-content: flex-start;
    align-items: flex-start;
  }
  .content-area .message {
    color: #333333;
    max-width: 10em;
    margin: 0;
    text-align: left;
    padding: 0.25em 0.8em;
    border-radius: 0.25em;
    background: #e0e0e0;
    box-shadow: 3px 3px 6px #bebebe, -3px -3px 6px #ffffff;
    font-size: 0.8em;
  }
  .content-area .avator {
    color: #00bcd4;
    line-height: 1;
    margin: 0 1em 0 1em;
    width: 3em;
    height: 3em;
    font-size: small;
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    padding: 0.5em;
    word-break: break-all;

    border-radius: 100%;
    background: #e0e0e0;
    box-shadow: 3px 3px 6px #bebebe, -3px -3px 6px #ffffff;
    overflow: hidden;
  }
  .self .content-area {
    flex-direction: row-reverse;
    /* justify-content: flex-end; */
  }

  .self .content-area .avator {
    color: #2196f3;
  }

  .msgcontroller-panel {
    display: flex;
    flex-direction: row;
    margin-top: 0.5em;
  }
  .msgcontroller-panel input {
    flex: 1;
  }
  .msgcontroller-panel button {
    margin-left: 0.8em;
    --depth: 1px;
  }
  .controller-panel {
    display: flex;
    flex-direction: row;
    margin-top: 0.5em;
  }
  .controller-panel button:first-child {
    margin-left: 0;
  }
  .controller-panel button {
    flex: 1;
    margin-left: 0.8em;
    --depth: 1px;
  }
</style>
