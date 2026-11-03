import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import type { ServerAccess } from "../lib/inventory";

export function fetchServerAccess(): Promise<ServerAccess> {
  return apiFetch<ServerAccess>("/api/server-access/me");
}

export function useServerAccess() {
  return useQuery({
    queryKey: ["server-access"],
    queryFn: fetchServerAccess,
  });
}

export function useIsSystemAdmin(): boolean {
  const access = useServerAccess();
  return access.data?.isSystemAdmin ?? false;
}
