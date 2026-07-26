import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const alias = { "@": path.resolve(__dirname, "src") };

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        // Pure logic: index math, sort comparators, URL parsing, data assembly,
        // discovery core. No DOM, so it stays fast.
        resolve: { alias },
        test: {
          name: "lib",
          environment: "node",
          include: ["src/lib/**/*.test.ts", "scripts/**/*.test.ts"],
        },
      },
      {
        // Component behaviour. The URL-state round-trip in Leaderboard.tsx is the
        // reason this project exists: it typechecks whatever it does, so only a
        // rendering test can catch a regression there.
        plugins: [react()],
        resolve: { alias },
        test: {
          name: "ui",
          environment: "jsdom",
          include: ["src/components/**/*.test.tsx"],
          setupFiles: ["./vitest.setup.ts"],
        },
      },
    ],
  },
});
