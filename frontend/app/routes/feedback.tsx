/// <reference types="vite/client" />

import { useEffect, useRef, useState } from "react";

import { Card } from "~/components/ui/card";

declare global {
  interface Window {
    Waline?: {
      init: (options: {
        el: HTMLElement;
        serverURL: string;
        lang: string;
        locale?: Record<string, string>;
        emoji?: string[];
        dark?: boolean;
        meta?: string[];
        requiredMeta?: string[];
        pageSize?: number;
        wordLimit?: number[];
        [key: string]: unknown;
      }) => void;
    };
  }
}

export default function Feedback() {
  const walineRef = useRef<HTMLDivElement>(null);
  const walineServerUrl = import.meta.env.VITE_WALINE_SERVER_URL || "";
  const [walineReady, setWalineReady] = useState(false);

  useEffect(() => {
    if (!walineServerUrl) return;
    if (!walineRef.current) return;

    let cancelled = false;
    let observer: IntersectionObserver | null = null;

    const initWaline = () => {
      if (cancelled) return;

      // Load CSS
      const cssLink = document.createElement("link");
      cssLink.rel = "stylesheet";
      cssLink.href = "https://unpkg.com/@waline/client@v3/dist/waline.css";
      document.head.appendChild(cssLink);

      // Load JS via script tag (ESM import from CDN doesn't work with Vite bundler)
      const script = document.createElement("script");
      script.src = "https://unpkg.com/@waline/client@v3/dist/waline.js";
      script.async = true;
      script.crossOrigin = "anonymous";
      script.onload = () => {
        if (cancelled) return;
        if (window.Waline && walineRef.current) {
          window.Waline.init({
            el: walineRef.current,
            serverURL: walineServerUrl,
            lang: "zh-CN",
            locale: {
              placeholder: "欢迎留言反馈，说说你的想法吧...",
              sofa: "来发评论吧~",
              submit: "提交",
              comment: "评论",
              refresh: "刷新",
              more: "加载更多...",
              preview: "预览",
              emoji: "表情",
              uploadImage: "上传图片",
              seconds: "秒前",
              minutes: "分钟前",
              hours: "小时前",
              days: "天前",
              now: "刚刚",
              uploading: "正在上传",
              login: "登录",
              logout: "退出",
              admin: "管理",
              sticky: "置顶",
              word: "字",
              wordHint:
                "评论字数应在 $0 到 $1 字之间！\\n当前字数：$2",
              anonymous: "匿名",
              approved: "通过",
              waiting: "待审核",
              spam: "垃圾",
              unsticky: "取消置顶",
              oldest: "按倒序",
              latest: "按正序",
              hottest: "按热度",
              reactionTitle: "你认为这篇文章怎么样？",
            },
            emoji: [
              "https://unpkg.com/@waline/emojis@1.2.0/weibo",
              "https://unpkg.com/@waline/emojis@1.2.0/bilibili",
            ],
            dark: false,
            meta: ["nick", "mail"],
            requiredMeta: ["nick"],
            pageSize: 10,
            wordLimit: [0, 1000],
          });
          setWalineReady(true);
        }
      };
      document.head.appendChild(script);
    };

    observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        initWaline();
        observer?.disconnect();
        observer = null;
      },
      { rootMargin: "200px 0px" },
    );
    observer.observe(walineRef.current);

    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [walineServerUrl]);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <Card className="p-6 md:p-8">
        <div className="max-w-3xl">
          <h1 className="text-2xl md:text-3xl font-bold text-slate-800 mb-2">
            反馈留言板
          </h1>
          <p className="text-sm md:text-base text-slate-500">
            欢迎在这里留下你的建议、反馈或想法，我们会认真倾听每一条留言
          </p>
        </div>
      </Card>

      {/* Usage notes */}
      <Card className="p-6 md:p-8">
        <div className="prose prose-slate max-w-none">
          <h3 className="text-lg font-bold text-slate-800 mb-3">
            留言说明
          </h3>
          <ul className="text-sm text-slate-600 space-y-2">
            <li>
              留言系统的账号登录仅用于方便展示昵称与头像，你可以选择不登录，填写昵称即可
            </li>
            <li>留言支持 Markdown 语法</li>
            <li>支持表情符号，点击输入框下方的表情按钮即可选择</li>
            <li>留言会经过审核后显示，请文明发言，不要灌水/打广告/谈论无关信息</li>
            <li>
              如有紧急问题，请通过"关于"页面的联系方式直接联系我们
            </li>
          </ul>
        </div>
      </Card>

      {/* Waline comment area */}
      <Card className="p-6 md:p-8">
        <div className="relative">
          {!walineReady && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-500 pointer-events-none">
              正在加载评论区...
            </div>
          )}
          <div
            ref={walineRef}
            id="waline-feedback"
            className="h-[70vh] min-h-[720px] overflow-auto"
            style={{ visibility: walineReady ? "visible" : "hidden" }}
          />
        </div>
      </Card>
    </div>
  );
}
