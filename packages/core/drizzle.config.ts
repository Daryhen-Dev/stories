import { defineConfig } from "drizzle-kit";

// Forward-only migrations (design): SQL snapshots checked into core/drizzle/.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
