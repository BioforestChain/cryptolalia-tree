import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { inspect } from "node:util";
import typescript from "typescript";

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    target: ["chrome74", "node14"],
    outDir: "docs",
  },
  base: "./",
  plugins: [
    svelte(),
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
  ],
});
