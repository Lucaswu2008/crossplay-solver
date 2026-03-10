import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const sourceDir = path.resolve(root, "web");
const targetDir = path.resolve(root, "dist-web");

await fs.rm(targetDir, { recursive: true, force: true });
await fs.mkdir(targetDir, { recursive: true });
await fs.cp(sourceDir, targetDir, { recursive: true });

console.log(`Copied ${sourceDir} -> ${targetDir}`);
