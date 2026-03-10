import fs from "node:fs/promises";
import path from "node:path";
import { rcedit } from "rcedit";

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export default async function afterPack(context) {
  if (context.electronPlatformName !== "win32") {
    return;
  }

  const iconPath = path.join(process.cwd(), "build", "icon.ico");
  const appOutEntries = await fs.readdir(context.appOutDir);
  const appExeName = appOutEntries.find(
    (entry) => entry.toLowerCase().endsWith(".exe") && entry.toLowerCase() !== "elevate.exe"
  );

  if (!appExeName) {
    return;
  }

  const appExePath = path.join(context.appOutDir, appExeName);

  if (!(await fileExists(iconPath)) || !(await fileExists(appExePath))) {
    return;
  }

  await rcedit(appExePath, { icon: iconPath });
  console.log(`afterPack: patched app icon at ${appExePath}`);
}
