/// <reference types="@cloudflare/workers-types" />
import { createRequestHandler } from "react-router";

// virtual:react-router/server-build is resolved at build time by @react-router/dev
const handler = createRequestHandler(
  () => import("virtual:react-router/server-build") as any,
  undefined
);

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return handler(request, { cloudflare: { env, ctx } } as any);
  },
} satisfies ExportedHandler<Env>;

interface Env {
  API: Fetcher;
}
