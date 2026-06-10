import { useQuery } from "@tanstack/react-query";
import { Wrench, AlertTriangle } from "lucide-react";
import { useMaintenanceStatus } from "~/lib/queries";
import { fetchSiteRuntimeState } from "~/lib/api";

// ─── Types ───────────────────────────────────────────────────────────────────

interface MaintenanceConfig {
  title?: string;
  description?: string;
  estimatedDowntime?: string;
  contact?: {
    qq?: string;
    email?: string;
  };
}

// ─── Maintenance Overlay ─────────────────────────────────────────────────────

function MaintenanceOverlay({ config }: { config?: MaintenanceConfig }) {
  const { data } = useQuery({
    queryKey: ["maintenance-overlay"],
    queryFn: fetchSiteRuntimeState,
    refetchInterval: 30_000,
    staleTime: 5_000,
    gcTime: 0,
  });

  // Auto-dismiss when maintenance ends
  if (!data?.maintenance.enabled) return null;

  const title = config?.title ?? "系统维护中";
  const description = config?.description ?? "我们正在对系统进行维护升级，预计很快恢复。请稍后再访问。";
  const estimatedDowntime = config?.estimatedDowntime;
  const qq = config?.contact?.qq;
  const email = config?.contact?.email;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-900/95 px-4">
      <div className="mx-auto max-w-md text-center">
        {/* Branding */}
        <h1 className="mb-2 font-brand text-3xl font-bold text-white">
          YOURTJ选课社区
        </h1>

        {/* Icon */}
        <div className="mb-6 inline-flex rounded-full bg-amber-500/20 p-3">
          <AlertTriangle className="size-8 text-amber-400" />
        </div>

        {/* Heading */}
        <h2 className="mb-3 text-xl font-semibold text-white">{title}</h2>

        {/* Description */}
        <p className="mb-4 text-sm leading-relaxed text-slate-300">
          {description}
        </p>

        {/* Estimated time */}
        {estimatedDowntime && (
          <p className="mb-6 rounded-lg bg-amber-500/10 px-4 py-2 text-sm text-amber-300">
            预计恢复时间：{estimatedDowntime}
          </p>
        )}

        {/* Contact */}
        {(qq || email) && (
          <div className="mt-6 space-y-2 text-sm text-slate-400">
            {qq && (
              <p>
                如有疑问，欢迎加入 QQ群：
                <span className="mx-1 font-mono font-medium text-slate-200">{qq}</span>
              </p>
            )}
            {email && (
              <p>
                或发送邮件至：
                <span className="mx-1 font-mono font-medium text-slate-200">{email}</span>
              </p>
            )}
          </div>
        )}

        {/* Auto-refresh note */}
        <p className="mt-8 text-xs text-slate-500">
          页面将自动检查维护状态，维护结束后自动恢复访问
        </p>
      </div>
    </div>
  );
}

// ─── Thin Banner (non-maintenance announcements) ─────────────────────────────

function AnnouncementBanner() {
  const { data } = useQuery({
    queryKey: ["announcement-banner"],
    queryFn: fetchSiteRuntimeState,
    refetchInterval: 30_000,
    staleTime: 10_000,
    gcTime: 5 * 60_000,
  });

  if (!data || data.maintenance.enabled) return null;

  const announcements = (data.announcements ?? []).filter(
    (a) => a.enabled !== false && a.content,
  );

  if (announcements.length === 0) return null;

  const current = announcements[0];

  return (
    <div className="bg-amber-50 border-b border-amber-200">
      <div className="mx-auto max-w-7xl px-4 py-2 flex items-center gap-2">
        <Wrench className="size-4 text-amber-600 shrink-0" />
        <p className="text-sm text-amber-700">{current.content}</p>
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function MaintenanceBar() {
  const maintenanceQueryOptions = useMaintenanceStatus();
  const { data } = useQuery(maintenanceQueryOptions);

  const isMaintenance = data?.maintenance ?? false;
  const message = data?.maintenanceMessage;

  // Use legacy maintenance check for quick first paint;
  // full-screen overlay fetches SiteRuntimeState independently
  // with the maintenance config (estimated downtime, contacts, etc.)

  if (isMaintenance) {
    // Try to extract config from the message if present (legacy JSON)
    let config: MaintenanceConfig | undefined;
    if (message) {
      try {
        config = JSON.parse(message) as MaintenanceConfig;
      } catch {
        config = { description: message };
      }
    }
    return <MaintenanceOverlay config={config} />;
  }

  // Show thin banner for non-maintenance announcements
  return <AnnouncementBanner />;
}
