import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

let currentDir = process.cwd();
let currentFile = process.cwd();

try {
  if (typeof import.meta !== "undefined" && import.meta.url) {
    currentFile = fileURLToPath(import.meta.url);
    currentDir = dirname(currentFile);
  }
} catch {
  // fallback to cwd
}

const g = globalThis as any;
if (typeof g.__dirname === "undefined") {
  g.__dirname = currentDir;
}
if (typeof g.__filename === "undefined") {
  g.__filename = currentFile;
}

if (typeof global !== "undefined") {
  const gl = global as any;
  if (typeof gl.__dirname === "undefined") {
    gl.__dirname = currentDir;
  }
  if (typeof gl.__filename === "undefined") {
    gl.__filename = currentFile;
  }
}
