<script lang="ts">
  import { Router, Route, Link, createHistory } from "svelte-navigator";
  import Room from "./lib/Room.svelte";
  import Online from "./lib/Online.svelte";

  function getLinkProps({ location, href, isPartiallyCurrent, isCurrent }) {
    const isActive = href === "/" ? isCurrent : isPartiallyCurrent || isCurrent;

    // The object returned here is spread on the anchor element's attributes
    if (isActive) {
      return { class: "nav-item active" };
    }
    return { class: "nav-item" };
  }

  import { createHashHistory } from "history";
  import { onDestroy } from "svelte";
  import { get_current_component } from "svelte/internal";

  function createHashSource() {
    const history = createHashHistory({});
    let listeners = [];

    history.listen((location) => {
      if (history.action === "POP") {
        listeners.forEach((listener) => listener(location));
      }
    });

    return {
      get location() {
        return history.location;
      },
      addEventListener(name, handler) {
        if (name !== "popstate") return;
        listeners.push(handler);
      },
      removeEventListener(name, handler) {
        if (name !== "popstate") return;
        listeners = listeners.filter((fn) => fn !== handler);
      },
      history: {
        get state() {
          return history.location.state;
        },
        pushState(state, title, uri) {
          history.push(uri, state);
        },
        replaceState(state, title, uri) {
          history.replace(uri, state);
        },
        go(to) {
          history.go(to);
        },
      },
    };
  }

  const memoryHistory = createHistory(createHashSource() as any);
  onDestroy(() => {
    console.log("destory");
  });
  export const destory = () => {
    get_current_component().$destroy();
  };
</script>

<Router history={memoryHistory}>
  <header>
    <h1>Cryptolalia Demo</h1>
    <nav>
      <Link getProps={getLinkProps} to="/">Local Chat Demo</Link>
      <Link getProps={getLinkProps} to="/online">Chat Online Demo</Link>
    </nav>
  </header>
  <main>
    <Route path="/">
      <Room />
    </Route>
    <Route path="/online">
      <p class="tip">
        提示：该DEMO使用BroadcastChannel模块网络广播，<a
          href={location.href}
          target="_blank">打开更多同域页面</a
        >即可多账户登录
      </p>
      <Online />
    </Route>
  </main>
</Router>

<style>
  :root {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen,
      Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif;
    background-color: #e0e0e0;
  }
  header {
    padding: 1em 2em;
  }
  h1 {
    text-transform: uppercase;
    /* font-size: larger; */
    color: #e0e0e0;
    text-shadow: 0.05em 0.05em 0.1em #bebebe, -0.025em -0.025em 0.05em #ffffff;
    letter-spacing: 0.25em;
  }

  main {
    text-align: center;
    padding: 1em;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
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

  :global(input) {
    padding: 0.5em 0.5em;
    border: none;
    border-radius: 0.25em;
    background: #e0e0e0;
    box-shadow: inset 3px 3px 6px #bebebe, inset -3px -3px 6px #ffffff;
  }
  :global(input:focus-visible) {
    outline: 1px #fff;
    outline-style: outset;
  }
  :global(button, .button) {
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

    --depth: 3px;
    box-shadow: var(--depth) var(--depth) calc(2 * var(--depth)) #b2b2b2,
      calc(-1 * var(--depth)) calc(-1 * var(--depth)) calc(2 * var(--depth))
        #ffffff;
    cursor: pointer;
  }
  :global(button:active, button.activing, .button.activing) {
    --overlay-color-1: #c8c8c8;
    --overlay-color-2: #eeeeee;
    /* pointer-events: none; */
  }

  nav {
    display: flex;
    flex-wrap: wrap;
  }
  /* nav > a {
  } */
  :global(.nav-item) {
    padding: 0.25em 0.8em;
    background: transparent;
    transition-duration: 0.5s;
    transition-timing-function: cubic-bezier(0.22, 0.61, 0.36, 1);

    color: hsl(0deg 0% 0% / 70%);
    text-decoration: unset;
  }
  :global(.nav-item:active, .nav-item.active) {
    border: none;

    text-shadow: 0.05em 0.05em 0.1em #bebebe, -0.025em -0.025em 0.05em #ffffff;
    border-radius: 0.25em;
    background: #e0e0e0;
    box-shadow: inset 3px 3px 6px #bebebe, inset -3px -3px 6px #ffffff;
  }

  .tip {
    color: #999;
    font-size: small;
  }
</style>
