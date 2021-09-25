<script lang="ts">
  import logo from "./assets/svelte.png";
  import Room from "./lib/Room.svelte";
</script>

<h1>
  <img src={logo} alt="BFChain Logo" />Cryptolalia Demo
</h1>
<main>
  <Room />
</main>

<style>
  :root {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen,
      Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif;
    background-color: #e0e0e0;
  }
  h1 {
    display: flex;
    align-items: center;
    text-transform: uppercase;
  }

  img {
    height: 1em;
    width: 1em;
    margin: 0 0.5em;
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
</style>
