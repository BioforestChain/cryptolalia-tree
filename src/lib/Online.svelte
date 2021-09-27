<script lang="ts">
  import { fade, scale } from "svelte/transition";
  import Chat from "./Chat.svelte";
  import { ChatsAppBuilder, MySessionInfo } from "./cryptolalia";
  type ChatsApp = ReturnType<typeof ChatsAppBuilder>;
  let chatsApp: ChatsApp | undefined;
  let username = "";
  let bootstrapApp_ing = false;
  const bootstrapApp = async () => {
    bootstrapApp_ing = true;
    try {
      username = username.trim();
      if (username.length === 0) {
        return;
      }
      chatsApp = ChatsAppBuilder(username);
      console.log("chatsApp", chatsApp);
      sessionList = await chatsApp.getSessionList();

      chatsApp.onOrderChange = async () => {
        sessionList = await chatsApp.getSessionList();
      };
      chatsApp.onNewMessage = async ([sessionId, message]) => {
        if (sessionId === selectedSessionId) {
          onListChanged();
        }
        const sessionInfo = await chatsApp.getSessionInfo(sessionId);
        if (sessionInfo !== undefined) {
          sessionInfo.lastMsgPreview = message.content;
          sessionInfo.lastMsgTime = Date.now();
          if (sessionId !== selectedSessionId) {
            sessionInfo.badge += 1;
          }
          await chatsApp.updateSession(sessionId, sessionInfo);
        }
      };
    } finally {
      bootstrapApp_ing = false;
    }
  };

  let sessionList: MySessionInfo[] = [];

  let newFriendName = "";
  let addFriend_ing = false;
  const addFriend = async () => {
    try {
      addFriend_ing = true;
      newFriendName = newFriendName.trim();
      if (newFriendName.length === 0) {
        return;
      }
      const sessionInfo: MySessionInfo = {
        nickname: newFriendName,
        badge: 0,
        lastMsgPreview: "",
        lastMsgTime: Date.now(),
        isCollection: false,
      };
      const sessionId = chatsApp.helper.getSessionId(sessionInfo);
      if (await chatsApp.addSession(sessionId, sessionInfo)) {
        sessionList = await chatsApp.getSessionList();
      }
      newFriendName = "";
    } finally {
      addFriend_ing = false;
    }
  };

  const toggleCollectionFriend = async (sessionInfo: MySessionInfo) => {
    sessionInfo.isCollection = !sessionInfo.isCollection;
    const sessionId = chatsApp.helper.getSessionId(sessionInfo);
    if (await chatsApp.updateSession(sessionId, sessionInfo)) {
      sessionList = await chatsApp.getSessionList();
    }
  };
  let selectedSessionInfo: undefined | MySessionInfo;
  let selectedSessionId = "";
  const selectToChat = (sessionInfo: MySessionInfo) => {
    if (selectedSessionInfo === sessionInfo) {
      selectedSessionInfo = undefined;
    } else {
      selectedSessionInfo = sessionInfo;
    }
    selectedSessionId = selectedSessionInfo
      ? chatsApp.helper.getSessionId(selectedSessionInfo)
      : "";
  };
  const sendMsg = (text: string) => {
    return chatsApp.sendMessage(selectedSessionId, {
      sender: username,
      content: text,
      time: Date.now(),
    });
  };
  const sync = () => {
    // chatsApp.doSync(selectedSessionId);
    console.log("no need sync~");

    if (selectedSessionInfo?.badge !== 0) {
      selectedSessionInfo.badge = 0;
      return chatsApp.updateSession(selectedSessionId, selectedSessionInfo);
    }
  };
  const list = async () => {
    const msgList = await chatsApp.getMessageList(selectedSessionId, {
      limit: 100,
      order: -1,
    });
    return msgList.map((msg) => msg.content);
  };
  const isSelf = (name: string) => {
    return name === username;
  };

  let onListChanged;
</script>

<main in:fade>
  {#if chatsApp === undefined}
    <session class="login-panel">
      <h2>Hi~ Please Login</h2>
      <div class="form">
        <input placeholder="请输入您的名字" bind:value={username} />
        <button
          class="login-btn"
          class:activing={bootstrapApp_ing}
          on:click={bootstrapApp}
        >
          登录
        </button>
      </div>
    </session>
    <!-- <p>Power by @bfchain/bnqkl2</p> -->
  {:else}
    <section>
      <h2>Welcome 💜 {username}</h2>
      <ul class="friend-list">
        <li class="add-friend">
          <input type="text" bind:value={newFriendName} />
          <button class:activing={addFriend_ing} on:click={addFriend}>
            添加好友
          </button>
        </li>
        {#each sessionList as sessionInfo (sessionInfo.nickname)}
          <li class="friend-info">
            <div class="base-info">
              <span class="nickname"
                >{sessionInfo.nickname}
                {#if sessionInfo.badge !== 0}
                  <sup title="未读" class="badge">{sessionInfo.badge}</sup>
                {/if}
              </span>

              <span
                title="收藏"
                class="collection"
                on:click={() => toggleCollectionFriend(sessionInfo)}
              >
                {sessionInfo.isCollection ? "❤️" : "🤍"}
              </span>
              <button
                title="开始聊天"
                class="start-chat-btn"
                on:click={() => selectToChat(sessionInfo)}>💬</button
              >
            </div>
            {#if selectedSessionInfo === sessionInfo}
              <div class="chat-panel" in:scale={{ duration: 300 }}>
                <Chat
                  doSend={sendMsg}
                  doSync={sync}
                  getList={list}
                  {isSelf}
                  bind:onListChanged
                />
              </div>
            {:else if sessionInfo.lastMsgPreview}
              <div class="last-msg" in:scale={{ duration: 300 }}>
                <span class="msg-preview">{sessionInfo.lastMsgPreview}</span>
                <span class="msg-time"
                  >{new Date(
                    sessionInfo.lastMsgTime,
                  ).toLocaleTimeString()}</span
                >
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</main>

<style>
  .login-panel .form {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .login-btn {
    margin-left: 1em;
  }
  .friend-list {
    list-style: none;
  }
  .friend-info {
    background: linear-gradient(145deg, #f0f0f0, #cacaca);
    box-shadow: 3px 3px 6px #bebebe, -3px -3px 6px #ffffff;
    margin-top: 1em;
    min-height: 3em;
    min-width: 18em;
    box-sizing: border-box;
    padding: 0.25em 1em;
  }
  .friend-info .base-info {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .base-info .nickname {
    display: flex;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .base-info .start-chat-btn {
    --depth: 1px;
  }

  .base-info .badge {
    font-size: small;
    width: 1.2em;
    height: 1.2em;
    padding: 0;
    border-radius: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #e91e63;
    color: #fff;
  }
  .base-info .collection {
    display: inline-block;
    cursor: pointer;
  }

  .friend-info .chat-panel {
    margin: 0.5em 0 0.25em 0;
  }
  .friend-info .last-msg {
    display: flex;
    font-size: small;
    background: #e0e0e0;
    border-radius: 0.25em;
    box-shadow: inset 3px 3px 6px #bebebe, inset -3px -3px 6px #ffffff;
    align-items: center;
    margin: 0.5em 0 0.25em 0;
    justify-content: space-between;
    padding: 0.25em 0.5em;
  }
  .last-msg .msg-preview {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
