import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  sourcemap: true,
  clean: true,
  target: "node22",
  banner: { js: "#!/usr/bin/env node" },
  // The SDK is bundled in, as the reference's CLI does: commander is the only runtime dependency.
  noExternal: ["@rumoro-dev/sdk"],
});
