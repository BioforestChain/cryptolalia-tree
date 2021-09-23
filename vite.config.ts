import { defineConfig } from "vite";
// import { esbuildPluginTsc } from "esbuild-plugin-tsc";
import typescript from "typescript";
import fs from "node:fs";
import path from "node:path";
import { inspect } from "node:util";
import { fileURLToPath } from "node:url";
import type { InputOption } from "rollup";

const libFormat = process.argv
  .find((arg) => arg.startsWith("--format="))
  ?.split("=")[1];
export const input: InputOption = {
  test: "src/test/test.ts",
  index: "src/core/index.ts",
  "CryptoHelper.node": "src/lib/CryptoHelper.node.ts",
  "CryptoHelper.web": "src/lib/CryptoHelper.web.ts",
  "TimeHelper.node": "src/lib/TimeHelper.node.ts",
  "TimeHelper.web": "src/lib/TimeHelper.web.ts",
  "Storage.fs.node": "src/lib/Storage.fs.node.ts",
  "Storage.fs.web": "src/lib/Storage.fs.web.ts",
};

const outDir = libFormat ? `dist/${libFormat}` : undefined;

// https://vitejs.dev/config/
export default defineConfig((info) => {
  return {
    build: {
      target: ["chrome74", "node16"],
      lib: {
        entry:
          info.mode === "development"
            ? "src/test/test.ts"
            : "src/core/index.ts",
        formats: libFormat ? [libFormat] : ["es", "cjs"],
        fileName: `~`, //buildLib ? `lib/${buildLib}.js` : undefined,
      },
      outDir: outDir,
      rollupOptions: {
        input,
        external: [/^@bfchain\/.*/, /^node:.*/, "tslib", "js-yaml"],
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
        const subpathImports = packageJson.imports || {};
        // console.log(subpathImports);
        return {
          name: "Subpath imports",
          resolveId(source) {
            // console.log(source);
            if (source.startsWith("#")) {
              return subpathImports[source]?.node ?? null;
            }
            return null;
          },
        };
      })(),
      (() => {
        const module_extension_name = {
          es: ".mjs",
          cjs: ".cjs",
        };
        const extension = module_extension_name[libFormat] || ".js";
        return {
          name: "rename.~",
          // resolveId(source) {
          //   console.log("source", source);
          //   return null;
          // },
          closeBundle() {
            if (outDir) {
              const getIndex = (filename: string) =>
                parseInt(
                  filename.replace("~." + libFormat, "").slice(0, -3 /* .js */),
                ) || 0;

              const fileList = fs.readdirSync(outDir);

              const inputNames = Object.keys(input);
              const inputFileList = fileList
                .filter((filename) => filename.startsWith("~." + libFormat))
                .sort((a, b) => getIndex(a) - getIndex(b));
              const inputFileRenameMap = new Map(
                inputFileList.map((filename, index) => {
                  const newName = inputNames[index] + extension;
                  return [filename, newName];
                }),
              );

              const renameMap = new Map(
                fileList.map((filename) => {
                  return [
                    filename,
                    inputFileRenameMap.get(filename) ||
                      filename.slice(0, -3 /* .js */) + extension,
                  ];
                }),
              );

              for (const [filename, newName] of renameMap) {
                console.log("output", filename, `=>`, newName);
                const oldFilePath = path.join(outDir, filename);
                const newFilePath = path.join(outDir, newName);
                fs.renameSync(oldFilePath, newFilePath);
                let sourceCode = fs.readFileSync(newFilePath, "utf-8");
                /**
                 * @TODO 使用resolveId与load来达成更加合理的，这里直接替换文件名称明显不够正确
                 */
                let changed = false;
                do {
                  changed = false;
                  for (const [oldFilename, newFilename] of renameMap) {
                    sourceCode = sourceCode.replace("/" + oldFilename, (_) => {
                      changed = true;
                      return "/" + newFilename;
                    });
                  }
                } while (changed);
                fs.writeFileSync(newFilePath, sourceCode);
              }
            }
          },
          enforce: "post",
          apply: "build",
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
