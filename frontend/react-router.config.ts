import type { Config } from "@react-router/dev/config";

export default {
  ssr: true,
  serverBuildFile: "build/server/index.js",
} satisfies Config;
