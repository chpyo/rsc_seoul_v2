import fs from "node:fs";
import path from "node:path";

try {
  const publicAssetsDir = path.resolve(".output/public/assets");
  const serverDir = path.resolve(".output/server/_ssr");

  if (fs.existsSync(publicAssetsDir) && fs.existsSync(serverDir)) {
    const publicFiles = fs.readdirSync(publicAssetsDir);
    const existingCss = publicFiles.find(f => f.startsWith("styles-") && f.endsWith(".css"));

    if (existingCss) {
      const serverFiles = fs.readdirSync(serverDir);
      for (const sf of serverFiles) {
        if (sf.endsWith(".mjs") || sf.endsWith(".js")) {
          const content = fs.readFileSync(path.join(serverDir, sf), "utf8");
          const matches = content.matchAll(/\/assets\/(styles-[A-Za-z0-9_-]+\.css)/g);
          for (const m of matches) {
            const requiredCss = m[1];
            const targetPath = path.join(publicAssetsDir, requiredCss);
            if (!fs.existsSync(targetPath)) {
              fs.copyFileSync(path.join(publicAssetsDir, existingCss), targetPath);
              console.log(`[sync-assets] Copied ${existingCss} to ${requiredCss}`);
            }
          }
        }
      }
    }
  }
} catch (e) {
  console.warn("[sync-assets] Note:", e?.message);
}
