import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    // `**/` matters: a bare `node_modules/**` only masks the root one, so any
    // nested copy (e.g. a git worktree under .claude/) gets its vendored tests collected.
    exclude: ["e2e/**", "**/node_modules/**", ".claude/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: [
        "src/lib/domain.ts",
        "src/lib/reminders.ts",
        "src/lib/events-api.ts",
        "src/lib/datetime.ts",
        // The one file that sends real email to real people — the threshold should
        // actually enforce its coverage rather than leaving it implicitly exempt.
        "src/routes/api/public/run-reminders.ts",
      ],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
