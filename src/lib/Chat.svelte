<script lang="ts">
  import { onMount } from "svelte";

  import type { MyMessage } from "./cryptolalia";
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
  export let doSend: (text: string) => BFChainUtil.PromiseMaybe<unknown> = (
    text: string,
  ) => {};
  export let doSync: () => BFChainUtil.PromiseMaybe<unknown> = () => {};
  export let getList: () => BFChainUtil.PromiseMaybe<MyMessage[]> = () => {
    return [];
  };
  export let isSelf = (sender: string) => {
    return false;
  };
  onMount(_doSync);
</script>

<ul class="list">
  {#each list as item (item.time)}
    <li class="item" class:self={isSelf(item.sender)}>
      <span class="time-tip">{new Date(item.time).toLocaleTimeString()}</span>
      <div class="content-area">
        <address class="avator">{item.sender}</address>
        <p class="message">{item.content}</p>
      </div>
    </li>
  {/each}
</ul>
<div class="controller-panel">
  <input
    type="text"
    class="word-to-send"
    disabled={sending}
    bind:value={wordToSend}
    placeholder="请输入要发送的内容"
  />
  <button class="do-send" class:running={sending} on:click={_doSend}
    >发送</button
  >
  <button class="do-sync" class:running={syncing} on:click={_doSync}
    >同步</button
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
    max-height: 20em;
    overflow: auto;
    scrollbar-gutter: stable;
  }
  .list:empty::before {
    content: "暂无内容";
    opacity: 0.3;
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
  }
  .self .content-area {
    flex-direction: row-reverse;
    /* justify-content: flex-end; */
  }

  .self .content-area .avator {
    color: #2196f3;
  }

  .controller-panel {
    display: flex;
    flex-direction: row;
  }
  .controller-panel button {
    margin-left: 0.8em;
  }

  @property --overlay-color-1 {
    syntax: "<color>";
    inherits: false;
    initial-value: black;
  }
  @property --overlay-color-2 {
    syntax: "<color>";
    inherits: false;
    initial-value: white;
  }

  input {
    padding: 0.5em 0.5em;
    border: none;
    border-radius: 0.25em;
    background: #e0e0e0;
    box-shadow: inset 3px 3px 6px #bebebe, inset -3px -3px 6px #ffffff;
  }
  input:focus-visible {
    outline: 1px #fff;
    outline-style: outset;
  }
  button {
    padding: 0.25em 0.8em;
    border: none;
    transition-property: --overlay-color-1, --overlay-color-2;
    transition-duration: 0.5s;
    transition-timing-function: cubic-bezier(0.22, 0.61, 0.36, 1);
    border-radius: 0.25em;
    --overlay-color-1: #eeeeee;
    --overlay-color-2: #c8c8c8;
    background: linear-gradient(
      145deg,
      var(--overlay-color-1),
      var(--overlay-color-2)
    );
    box-shadow: 3px 3px 6px #b2b2b2, -3px -3px 6px #ffffff;
    cursor: pointer;
  }
  button:active,
  button.running {
    --overlay-color-1: #c8c8c8;
    --overlay-color-2: #eeeeee;
  }
</style>
