import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

const FIREBASE_EXTERNALS = [
  "firebase-admin",
  "@google-cloud/firestore",
  "@google-cloud/storage",
  "@firebase/firestore",
];

// Vercel Hobby 플랜의 함수 최대 실행 시간(초). Pro로 바꾸면 800까지 올릴 수 있다.
const VERCEL_MAX_DURATION = 300;

export default defineConfig(({ command, mode, isPreview }) => {
  // 로컬 개발: .env / .env.local 의 서버용 변수(GEMINI_API_KEY 등)를 서버 함수의
  // process.env 로 넣는다. 이미 설정된 값(Vercel 환경 변수 등)은 덮어쓰지 않는다.
  for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), ""))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }

  return {
    server: {
      host: "localhost",
      port: 3000,
      strictPort: true,
    },
    resolve: { tsconfigPaths: true },
    ssr: {
      external: FIREBASE_EXTERNALS,
    },
    plugins: [
      tailwindcss(),
      tanstackStart(),
      ...(command === "build" || isPreview
        ? [
            nitro({
              // 로컬에서 node 서버로 확인하려면 NITRO_PRESET=node-server 로 빌드한다.
              preset: process.env.NITRO_PRESET || "vercel",
              // server/plugins/* (polyfill) 자동 등록
              serverDir: "./server",
              externals: {
                external: FIREBASE_EXTERNALS,
              },
              vercel: {
                functions: {
                  maxDuration: VERCEL_MAX_DURATION,
                },
              },
              rollupConfig: {
                output: {
                  banner:
                    "if (typeof globalThis.__dirname === 'undefined') { globalThis.__dirname = process.cwd(); }\nif (typeof globalThis.__filename === 'undefined') { globalThis.__filename = process.cwd(); }\n",
                },
              },
            }),
          ]
        : []),
      viteReact(),
    ],
  };
});
