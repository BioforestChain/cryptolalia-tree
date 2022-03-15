import { defineConfig } from "@bfchain/pkgm-bfsp";
export default defineConfig((info) => {
  const config: Bfsp.UserConfig = {
    // author: "Gaubee",
    // license: "MIT",
    name: "@bfchain/cryptolalia-tree",
    exports: {
      ".": "./src/index.ts",
      "./ChatsApp": "./ChatsApp/index.ts",
      "./web/CryptoHelper": "./lib/CryptoHelper#web.ts",
      "./node/CryptoHelper": "./lib/CryptoHelper#node.ts",
      "./web/Storage.fs": "./lib/Storage.fs#web.ts",
      "./node/Storage.fs": "./lib/Storage.fs#node.ts",
      "./web/TimeHelper": "./lib/TimeHelper#web.ts",
      "./node/TimeHelper": "./lib/TimeHelper#node.ts",
    },
    formats: ["esm", "cjs"],
    profiles: ["web", "node"],
    build: [
      {},
      {
        name: "@bfchain/cryptolalia-tree-web",
        profiles: ["web"],
        exports: {
          ".": "./src/index.ts",
          "./ChatsApp": "./ChatsApp/index.ts",
          "./CryptoHelper": "./lib/CryptoHelper#web.ts",
          "./Storage.fs": "./lib/Storage.fs#web.ts",
          "./TimeHelper": "./lib/TimeHelper#web.ts",
        },
      },
      {
        name: "@bfchain/cryptolalia-tree-node",
        profiles: ["node"],
        exports: {
          ".": "./src/index.ts",
          "./ChatsApp": "./ChatsApp/index.ts",
          "./CryptoHelper": "./lib/CryptoHelper#node.ts",
          "./Storage.fs": "./lib/Storage.fs#node.ts",
          "./TimeHelper": "./lib/TimeHelper#node.ts",
        },
      },
    ],
    packageJson: {
      dependencies: {
        idb: "^7.0.0",
        "js-yaml": "^4.1.0",
        "@bfchain/util-dep-inject": "0.0.1-alpha.4",
        "@bfchain/util-extends-promise-out": "0.0.1-alpha.4",
      },
      devDependencies: {
        "@types/js-yaml": "^4.0.3",
      },
    },
  };
  return config;
});
