import { useQuery } from "@tanstack/react-query";
import { Wrench } from "lucide-react";
import { useMaintenanceStatus } from "~/lib/queries";

export default function MaintenanceBar() {
  const maintenanceQueryOptions = useMaintenanceStatus();
  const { data } = useQuery(maintenanceQueryOptions);

  const isMaintenance = data?.maintenance ?? false;
  const message = data?.maintenanceMessage;

  if (!isMaintenance) return null;

  return (
    <div className="bg-amber-50 border-b border-amber-200">
      <div className="mx-auto max-w-7xl px-4 py-2 flex items-center gap-2">
        <Wrench className="size-4 text-amber-600 shrink-0" />
        <p className="text-sm text-amber-700">
          {message || "系统维护中，部分功能暂不可用"}
        </p>
      </div>
    </div>
  );
}
