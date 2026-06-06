import {
  type ReactNode,
  createContext,
  useContext,
  createElement,
} from "react";

/**
 * @see https://reactrouter.com/docs/en/v7/start/framework/cloudflare-workers
 */
export function createCloudflareContext(env: Record<string, unknown>) {
  return { cloudflare: { env } };
}

export type CloudflareContext = ReturnType<typeof createCloudflareContext>;

const CloudflareContextCtx = createContext<CloudflareContext | null>(null);

export function CloudflareProvider({
  children,
  context,
}: {
  children: ReactNode;
  context: CloudflareContext;
}) {
  return createElement(CloudflareContextCtx.Provider, {
    value: context,
    children,
  });
}

export function useCloudflare() {
  const ctx = useContext(CloudflareContextCtx);
  if (!ctx) throw new Error("useCloudflare must be used inside a route loader");
  return ctx;
}
