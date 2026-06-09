import { renderToStaticMarkup } from "react-dom/server";
import BoringAvatar from "boring-avatars";

export interface ReviewerIdentityValue {
  name: string;
  avatar: string;
  avatarType?: "random" | "qq";
  qqNumber?: string;
}

interface ReviewerIdentityProps {
  value: ReviewerIdentityValue;
  onChange: (value: ReviewerIdentityValue) => void;
}

const AVATAR_COLORS = [
  "#0f172a",
  "#38bdf8",
  "#f8fafc",
  "#f59e0b",
  "#22c55e",
];

function buildBeamAvatarDataUri(seedText: string, size = 72) {
  const svg = renderToStaticMarkup(
    <BoringAvatar
      size={size}
      name={seedText || "匿名用户"}
      variant="beam"
      colors={AVATAR_COLORS}
    />,
  );
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export default function ReviewerIdentity({
  value,
  onChange,
}: ReviewerIdentityProps) {
  const showReviewer = Boolean(value.name || value.avatar || value.qqNumber);
  const avatarType = value.avatarType || "random";
  const qqNumber = value.qqNumber || "";

  const getPreviewAvatarUrl = () => {
    if (avatarType === "qq" && qqNumber) {
      return `https://q1.qlogo.cn/g?b=qq&nk=${qqNumber}&s=640`;
    }
    return buildBeamAvatarDataUri(value.name.trim() || "匿名用户", 96);
  };

  const handleToggle = () => {
    if (showReviewer) {
      onChange({ name: "", avatar: "", avatarType: "random", qqNumber: "" });
    } else {
      onChange({
        name: value.name || "",
        avatar: buildBeamAvatarDataUri("匿名用户"),
        avatarType: "random",
        qqNumber: "",
      });
    }
  };

  const handleNameChange = (name: string) => {
    const newAvatar =
      avatarType === "random"
        ? buildBeamAvatarDataUri(name.trim() || "匿名用户")
        : value.avatar;
    onChange({ ...value, name, avatar: newAvatar, avatarType, qqNumber });
  };

  const handleAvatarTypeChange = (type: "random" | "qq") => {
    const newAvatar =
      type === "random"
        ? buildBeamAvatarDataUri(value.name.trim() || "匿名用户")
        : qqNumber
          ? `https://q1.qlogo.cn/g?b=qq&nk=${qqNumber}&s=640`
          : "";
    onChange({
      ...value,
      avatar: newAvatar,
      avatarType: type,
      qqNumber,
    });
  };

  const handleQqChange = (qq: string) => {
    const cleaned = qq.replace(/\D/g, "");
    const newAvatar = cleaned
      ? `https://q1.qlogo.cn/g?b=qq&nk=${cleaned}&s=640`
      : "";
    onChange({
      ...value,
      avatar: newAvatar,
      avatarType: "qq",
      qqNumber: cleaned,
    });
  };

  return (
    <div className="mb-6" data-tour="tour-reviewer-section">
      <div className="flex items-center justify-between mb-3">
        <label className="text-sm font-semibold text-slate-600">
          显示点评人信息
        </label>
        <button
          type="button"
          onClick={handleToggle}
          className={`relative w-12 h-6 rounded-full transition-colors ${showReviewer ? "bg-cyan-500" : "bg-slate-300"}`}
        >
          <span
            className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${showReviewer ? "left-7" : "left-1"}`}
          />
        </button>
      </div>

      {showReviewer && (
        <div className="p-4 bg-white/60 backdrop-blur rounded-2xl border border-white space-y-4">
          {/* Nickname */}
          <div>
            <label className="block mb-2 text-xs font-medium text-slate-500">
              昵称
            </label>
            <input
              type="text"
              value={value.name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="输入你想显示的昵称"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-cyan-400"
              maxLength={20}
            />
          </div>

          {/* Avatar type */}
          <div>
            <label className="block mb-2 text-xs font-medium text-slate-500">
              头像
            </label>
            <div className="flex gap-3 mb-3">
              <button
                type="button"
                onClick={() => handleAvatarTypeChange("random")}
                className={`flex-1 py-2 px-3 rounded-lg text-sm border transition-all ${
                  avatarType === "random"
                    ? "border-cyan-400 bg-cyan-50 text-cyan-600"
                    : "border-slate-200 text-slate-500"
                }`}
              >
                随机头像
              </button>
              <button
                type="button"
                onClick={() => handleAvatarTypeChange("qq")}
                className={`flex-1 py-2 px-3 rounded-lg text-sm border transition-all ${
                  avatarType === "qq"
                    ? "border-cyan-400 bg-cyan-50 text-cyan-600"
                    : "border-slate-200 text-slate-500"
                }`}
              >
                QQ头像
              </button>
            </div>

            {avatarType === "qq" && (
              <div>
                <input
                  type="text"
                  value={qqNumber}
                  onChange={(e) => handleQqChange(e.target.value)}
                  placeholder="输入QQ号"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-cyan-400"
                />
                <p className="mt-1 text-xs text-slate-400">
                  我们只存储头像链接，不会公开你的 QQ 号
                </p>
              </div>
            )}

            {/* Avatar preview */}
            <div className="mt-3 flex items-center gap-3">
              <img
                src={getPreviewAvatarUrl()}
                alt="头像预览"
                className="w-12 h-12 rounded-full bg-slate-100 object-cover"
              />
              <span className="text-sm text-slate-500">头像预览</span>
            </div>
          </div>
        </div>
      )}

      {!showReviewer && (
        <p className="text-xs text-slate-400">
          关闭后将以"匿名用户"身份发布点评
        </p>
      )}
    </div>
  );
}
