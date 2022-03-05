const fs = require("node:fs");
const path = require("node:path");
const rootPath = path.join(__dirname, "..");
const packageJsonPath = path.join(rootPath, "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

const getAllTypesPath = (obj, paths = []) => {
  for (const [key, val] of Object.entries(obj)) {
    if (typeof val === "object") {
      getAllTypesPath(val, paths);
    } else if (typeof val === "string") {
      if (key === "types") {
        paths.push(val);
      }
    }
  }
  return paths;
};

const typesVersions = {};
for (const [relativePath, config] of Object.entries(packageJson.exports)) {
  const tsRelativePath = path
    .relative(rootPath, path.join(rootPath, relativePath))
    .replace(/\\/g, "/");
  // console.log("key:%s, path:%s", relativePath, tsRelativePath);
  if (!tsRelativePath) {
    continue;
  }
  const tsTypePaths = getAllTypesPath(config);
  typesVersions[tsRelativePath] = tsTypePaths;
}

packageJson.typesVersions = { "*": typesVersions };
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
