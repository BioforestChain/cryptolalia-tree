import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const BFCHAIN_MODULES_DIR = path.join(
  __filename,
  "../../node_modules/@bfchain",
);
for (const name of fs.readdirSync(BFCHAIN_MODULES_DIR)) {
  const packageJsonFilepath = path.join(
    BFCHAIN_MODULES_DIR,
    name,
    "package.json",
  );
  const packageJson = JSON.parse(fs.readFileSync(packageJsonFilepath, "utf-8"));
  if (packageJson.type !== "module") {
    packageJson.types = packageJson.type;
    packageJson.type = "module";
  }
  if (packageJson.main.endsWith(".js")) {
    const oldMain = packageJson.main;
    const newMain = oldMain.slice(0, -2) + "cjs";
    fs.renameSync(
      path.join(BFCHAIN_MODULES_DIR, name, oldMain),
      path.join(BFCHAIN_MODULES_DIR, name, newMain),
    );
    packageJson.main = newMain;
  }
  const moduleFilepath = path.join(
    BFCHAIN_MODULES_DIR,
    name,
    packageJson.module,
  );
  {
    const moduleFileContent = fs.readFileSync(moduleFilepath, "utf-8");
    if (moduleFileContent.includes("=require")) {
      fs.writeFileSync(
        moduleFilepath,
        moduleFileContent.replace(/=require/g, "=()=>{}"),
      );
    }
  }

  packageJson.main = "./" + path.posix.normalize(packageJson.main);
  packageJson.module = "./" + path.posix.normalize(packageJson.module);
  packageJson.exports = {
    ".": {
      require: packageJson.main,
      import: packageJson.module,
      module: packageJson.module,
    },
    "./package.json": "./package.json",
  };
  fs.writeFileSync(packageJsonFilepath, JSON.stringify(packageJson, null, 2));
  console.log("fixed", name);
}
