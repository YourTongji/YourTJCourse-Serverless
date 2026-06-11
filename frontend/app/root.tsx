import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteError,
  type LinksFunction,
} from "react-router";

import "./app.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export const links: LinksFunction = () => [];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function Root() {
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  let title = "出错了";
  let message = "页面遇到了意外错误，请稍后重试。";
  if (isRouteErrorResponse(error)) {
    title = `${error.status} 错误`;
    const errorData = error.data as { message?: string } | undefined;
    message = error.statusText || errorData?.message || message;
  }
  return (
    <html lang="zh-CN">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{`${title} — YOURTJ选课社区`}</title>
        <Links />
      </head>
      <body className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md text-center space-y-4">
          <p className="text-6xl font-black text-slate-200">
            {isRouteErrorResponse(error) ? error.status : "!"}
          </p>
          <h1 className="text-xl font-bold text-slate-800">{title}</h1>
          <p className="text-sm text-slate-500">{message}</p>
          <a
            href="/"
            className="inline-flex h-9 items-center justify-center rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-700"
          >
            返回首页
          </a>
        </div>
        <Scripts />
      </body>
    </html>
  );
}
