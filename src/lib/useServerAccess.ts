import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import type { ServerAccess } from "../lib/inventory";

export function useServerAccess() {
  return useQuery({
    queryKey: ["server-access"],
    queryFn: () => apiFetch<ServerAccess>("/api/server-access/me"),
  });
}

export function useIsSystemAdmin(): boolean {
  const access = useServerAccess();
  return access.data?.isSystemAdmin ?? false;
}
