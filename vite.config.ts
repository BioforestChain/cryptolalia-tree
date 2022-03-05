import { defineConfig } from "vite";
// import { esbuildPluginTsc } from "esbuild-plugin-tsc";
import typescript from "typescript";
import fs from "node:fs";
import path from "node:path";
import { inspect } from "node:util";
import { fileURLToPath } from "node:url";
import type { InputOption, ModuleFormat } from "rollup";

const libFormat = process.argv
  .find((arg) => arg.startsWith("--format="))
  ?.split("=")[1] as ModuleFormat;

const targetPlatform = process.argv
  .find((arg) => arg.startsWith("--platform="))
  ?.split("=")[1] as "node" | "web";

export const input: InputOption = {
  test: "test/test.ts",
  index: "src/index.ts",
  "CryptoHelper.node": "lib/CryptoHelper.node.ts",
  "CryptoHelper.web": "lib/CryptoHelper.web.ts",
  "TimeHelper.node": "lib/TimeHelper.node.ts",
  "TimeHelper.web": "lib/TimeHelper.web.ts",
  "Storage.fs.node": "lib/Storage.fs.node.ts",
  "Storage.fs.web": "lib/Storage.fs.web.ts",
  ChatsApp: "lib/ChatsApp/index.ts",
};

const outDir = libFormat ? `dist/${libFormat}` : undefined;

const extension =
  {
    es: ".mjs",
    esm: ".mjs",
    module: ".mjs",
    cjs: ".cjs",
    commonjs: ".cjs",
  }[libFormat] || ".js";

// https://vitejs.dev/config/
export default defineConfig((info) => {
  return {
    build: {
      target: ["chrome74", "node16"],
      outDir: outDir,
      rollupOptions: {
        preserveEntrySignatures: "strict",
        external: [/^@bfchain\/.*/, /^node:.*/, "tslib", "js-yaml"],
        input,
        output: {
          entryFileNames: `[name]${extension}`,
          chunkFileNames: `chunk/[name]${extension}`,
          format: libFormat,
        },
      },
    },
    plugins: [
      (() => {
        const tsconfigFilepath = path.join(
          fileURLToPath(import.meta.url),
          "../tsconfig.json",
        );
        console.log(tsconfigFilepath);
        const parsedTsConfig: typescript.TranspileOptions = new Function(
          `return ${fs.readFileSync(tsconfigFilepath, "utf-8").trim()}`,
        )();
        parsedTsConfig.compilerOptions.emitDeclarationOnly = false;
        parsedTsConfig.compilerOptions.noEmit = false;
        parsedTsConfig.compilerOptions.sourcemap = false;
        parsedTsConfig.compilerOptions.inlineSources = false;
        parsedTsConfig.compilerOptions.inlineSourceMap = false;

        function printDiagnostics(...args) {
          console.log(inspect(args, false, 10, true));
        }

        return {
          name: "tsc.emitDecoratorMetadata",
          load(source) {
            if (!parsedTsConfig?.compilerOptions?.emitDecoratorMetadata) {
              return null;
            }

            try {
              const ts = fs.readFileSync(source, "utf8");
              if (!ts) {
                return null;
              }

              // Find the decorator and if there isn't one, return out
              const hasDecorator = ts
                .replace(
                  /`(?:\.|(\\\`)|[^\``])*`|"(?:\.|(\\\")|[^\""\n])*"|'(?:\.|(\\\')|[^\''\n])*'/g,
                  "",
                )
                .replace(/\/\/[\w\W]*?\n/g, "")
                .replace(/\/\*[\w\W]*?\*\//g, "")
                .includes("@");
              if (!hasDecorator) {
                return null;
              }

              // console.log("need emitDecoratorMetadata", source);
              const program = typescript.transpileModule(ts, parsedTsConfig);
              // console.log(program.outputText);
              return program.outputText;
            } catch (err) {
              printDiagnostics({ file: source, err });
            }
            return null;
          },
        };
      })(),
      (() => {
        const packageFilepath = path.join(
          fileURLToPath(import.meta.url),
          "../package.json",
        );
        const packageJson = JSON.parse(
          fs.readFileSync(packageFilepath, "utf-8"),
        );
        const subpathImports = {
          "@bfchain/cryptolalia-tree/lib/TimeHelper": {
            node: "./lib/TimeHelper.node.ts",
            default: "./lib/TimeHelper.web.ts",
          },
          "@bfchain/cryptolalia-tree/lib/CryptoHelper": {
            node: "./lib/CryptoHelper.node.ts",
            default: "./lib/CryptoHelper.web.ts",
          },
          "@bfchain/cryptolalia-tree/lib/Storage.fs": {
            node: "./lib/Storage.fs.node.ts",
            default: "./lib/Storage.fs.web.ts",
          },
        };
        // console.log(subpathImports);
        return {
          name: "Subpath imports",
          resolveId(source) {
            // console.log(source);
            if (source.startsWith("#")) {
              const imports = subpathImports[source];
              if (imports) {
                return imports[targetPlatform] ?? imports.default ?? null;
              }
            }
            return null;
          },
        };
      })(),
    ],
    server: {
      fs: {
        // Allow serving files from one level up to the project root
        allow: ["./"],
      },
    },
  };
});
