import { defineConfig } from "vite";
import monkey from "vite-plugin-monkey";

export default defineConfig({
  plugins: [
    monkey({
      entry: "src/main.ts",
      userscript: {
        name: "Putt Cheats",
        namespace: "http://tampermonkey.net/",
        version: "0.9.0",
        description:
          "Putt Party Cheating Utilities",
        author: "kozika",
        match: ["https://945737671223947305.discordsays.com/*"],
        grant: "none",
        "run-at": "document-start",
      },
      build: {
        fileName: "putt.user.js",
      },
    }),
  ],
  build: {
    minify: "oxc"
  }
});
