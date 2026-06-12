import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";

const CAPTCHA_API_BASE =
  import.meta.env.VITE_CAPTCHA_URL || "https://captcha.07211024.xyz";

interface CaptchaData {
  puzzle_token: string;
  prompt: string;
  images: string[];
}

interface VerifyResult {
  success: boolean;
  token: string;
  message?: string;
}

interface Props {
  value?: string;
  onVerify: (token: string) => void;
}

export default function TongjiCaptchaWidget({ value, onVerify }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "success">("idle");
  const [captchaData, setCaptchaData] = useState<CaptchaData | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [imgFade, setImgFade] = useState(true);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [hasPrefetched, setHasPrefetched] = useState(false);

  const openModal = () => {
    setIsOpen(true);
    if (!captchaData) {
      void fetchCaptcha();
    }
  };

  const fetchCaptcha = async () => {
    setImgFade(false);
    setStatus("loading");
    setSelected([]);
    setMessage(null);
    try {
      const res = await fetch(`${CAPTCHA_API_BASE}/api/captcha`);
      const json = (await res.json()) as CaptchaData;
      setTimeout(() => {
        setCaptchaData(json);
        setHasPrefetched(true);
        setStatus("idle");
        setImgFade(true);
      }, 150);
    } catch {
      setMessage({ type: "error", text: "验证码加载失败，请重试" });
      setStatus("idle");
    }
  };

  const verify = async () => {
    if (!captchaData) return;
    setStatus("loading");
    setMessage(null);
    try {
      const res = await fetch(`${CAPTCHA_API_BASE}/api/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          puzzle_token: captchaData.puzzle_token,
          selected_indices: selected,
        }),
      });
      const resData = (await res.json()) as VerifyResult;

      if (resData.success) {
        setMessage({ type: "success", text: "验证成功啦～ ヽ(✿ﾟ▽ﾟ)ノ" });
        setTimeout(() => {
          setStatus("success");
          setIsOpen(false);
          onVerify(resData.token);
        }, 1000);
      } else {
        setMessage({
          type: "error",
          text: resData.message || "验证失败，请重试",
        });
        setTimeout(() => fetchCaptcha(), 1200);
      }
    } catch {
      setMessage({ type: "error", text: "网络错误，请重试" });
      setStatus("idle");
    }
  };

  const toggleSelect = (idx: number) => {
    if (status === "loading") return;
    if (selected.includes(idx)) setSelected((s) => s.filter((i) => i !== idx));
    else setSelected((s) => [...s, idx]);
  };

  useEffect(() => {
    if (hasPrefetched || captchaData || status === "success") return;
    void fetchCaptcha();
  }, [captchaData, hasPrefetched, status]);

  // Allow parent to reset (e.g., submit failed with expired captcha)
  useEffect(() => {
    if (value === undefined) return;
    if (String(value || "").trim()) return;
    setStatus("idle");
    setCaptchaData(null);
    setHasPrefetched(false);
    setSelected([]);
    setMessage(null);
  }, [value]);

  return (
    <>
      {/* Trigger button */}
      <div
        onClick={openModal}
        className={`border rounded-xl p-3 flex items-center cursor-pointer select-none transition-all ${
          status === "success"
            ? "border-green-400 bg-green-50"
            : "border-slate-200 bg-slate-50 hover:border-cyan-300 hover:bg-cyan-50"
        }`}
        style={{ width: "100%", maxWidth: "320px" }}
      >
        <div
          className={`w-6 h-6 rounded-full border flex items-center justify-center mr-3 transition-all ${
            status === "success"
              ? "bg-green-500 border-green-500"
              : "bg-white border-slate-300"
          }`}
        >
          {status === "success" && (
            <span className="text-white text-sm font-bold">✓</span>
          )}
        </div>
        <span className="text-slate-700 text-sm">
          {status === "success"
            ? "人机验证通过（可点击重新验证）"
            : "点击进行人机验证"}
        </span>
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent
          showCloseButton={false}
          className="max-w-[360px] sm:max-w-[360px] rounded-2xl overflow-hidden p-0 gap-0"
        >
          {captchaData ? (
            <>
              {/* Header */}
              <DialogHeader className="bg-gradient-to-r from-cyan-500 to-blue-500 text-white p-4 gap-0 rounded-t-2xl">
                <p className="text-xs opacity-80 mb-1">YOURTJ人机验证</p>
                <DialogTitle className="text-lg font-bold text-white">
                  {captchaData.prompt}
                </DialogTitle>
              </DialogHeader>

              {/* Message */}
              {message && (
                <div
                  className={`mx-3 mt-3 px-3 py-2 rounded-lg text-sm text-center transition-all ${
                    message.type === "success"
                      ? "bg-green-100 text-green-700 border border-green-200"
                      : "bg-red-100 text-red-700 border border-red-200"
                  }`}
                >
                  {message.text}
                </div>
              )}

              {/* 9-grid images */}
              <div className="p-3">
                <div
                  className="grid grid-cols-3 gap-1.5 transition-opacity duration-200 ease-in-out"
                  style={{ opacity: imgFade ? 1 : 0 }}
                >
                  {captchaData.images.map((img, idx) => (
                    <div
                      key={idx}
                      onClick={() => toggleSelect(idx)}
                      className="relative aspect-square cursor-pointer rounded-lg overflow-hidden"
                    >
                      <img
                        src={
                          img.startsWith("http")
                            ? img
                            : `${CAPTCHA_API_BASE}${img}`
                        }
                        alt=""
                        className="w-full h-full object-cover"
                        draggable={false}
                      />
                      {selected.includes(idx) && (
                        <div className="absolute inset-0 bg-cyan-500/40 border-2 border-cyan-500 flex items-center justify-center">
                          <span className="text-white font-bold text-xl">
                            ✓
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Footer note */}
              <p className="text-xs text-slate-400 text-center px-4 pb-2">
                使用同济建筑物图片均来自于印象同济，包含四平和嘉定校区地标
              </p>

              {/* Actions */}
              <div className="flex justify-between items-center px-4 pb-4">
                <Button
                  variant="ghost"
                  onClick={fetchCaptcha}
                  disabled={status === "loading"}
                  className="text-slate-500 hover:text-slate-700 text-sm gap-1"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  换一组
                </Button>
                <div className="flex gap-2">
                  <DialogClose
                    render={<Button variant="outline" />}
                  >
                    取消
                  </DialogClose>
                  <Button
                    onClick={verify}
                    disabled={status === "loading" || selected.length === 0}
                  >
                    {status === "loading" ? "验证中..." : "确认"}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="p-10 text-center text-slate-500">加载中...</div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
