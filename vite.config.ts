import { defineConfig } from "vite";
// import { esbuildPluginTsc } from "esbuild-plugin-tsc";
import typescript from "typescript";
import fs from "node:fs";
import path from "node:path";
import { inspect } from "node:util";
import { fileURLToPath } from "node:url";

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
        formats: ["es", "cjs"],
      },
      rollupOptions: {
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
    ],
    server: {
      fs: {
        // Allow serving files from one level up to the project root
        allow: ["./"],
      },
    },
  };
});
