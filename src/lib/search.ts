import { apiFetch } from "./api";
import type { Diagram } from "./diagrams";
import type {
  Application,
  Environment,
  Paged,
  Project,
  Provider,
  Server,
} from "./inventory";

export type SearchResultType =
  | "provider"
  | "environment"
  | "server"
  | "application"
  | "project"
  | "diagram";

export interface SearchResult {
  type: SearchResultType;
  id: number;
  name: string;
  detail: string | null;
  href: string;
}

const TYPE_ORDER: Record<SearchResultType, number> = {
  provider: 0,
  environment: 1,
  server: 2,
  application: 3,
  project: 4,
  diagram: 5,
};

const TYPE_PATH: Record<SearchResultType, string> = {
  provider: "/providers",
  environment: "/environments",
  server: "/servers",
  application: "/applications",
  project: "/projects",
  diagram: "/diagrams",
};

const PAGE_SIZE = 5;

function searchPath<T>(path: string, q: string): Promise<Paged<T>> {
  const params = new URLSearchParams({
    q,
    pageSize: String(PAGE_SIZE),
  });
  return apiFetch<Paged<T>>(`${path}?${params}`);
}

function result(
  type: SearchResultType,
  id: number,
  name: string,
  detail: string | null,
): SearchResult {
  return {
    type,
    id,
    name,
    detail,
    href: `${TYPE_PATH[type]}/${id}`,
  };
}

/**
 * Search the detail-capable entities with the list endpoints' own filters.
 *
 * shortcut: six parallel list requests per query. Ceiling: large datasets make
 * this slow; move it to a server-side `/api/search` endpoint when it grows.
 */
export async function searchAll(rawQuery: string): Promise<SearchResult[]> {
  const query = rawQuery.trim();
  if (query.length < 2) return [];

  const [providers, environments, servers, applications, projects, diagrams] =
    await Promise.all([
      searchPath<Provider>("/api/providers", query),
      searchPath<Environment>("/api/environments", query),
      searchPath<Server>("/api/servers", query),
      searchPath<Application>("/api/applications", query),
      searchPath<Project>("/api/projects", query),
      searchPath<Diagram>("/api/diagrams", query),
    ]);

  return [
    ...providers.items.map((row) => result("provider", row.id, row.name, null)),
    ...environments.items.map((row) =>
      result("environment", row.id, row.name, row.description || null),
    ),
    ...servers.items.map((row) =>
      result(
        "server",
        row.id,
        row.name,
        [row.ipAddress, row.providerEnvironmentLabel]
          .filter(Boolean)
          .join(" · "),
      ),
    ),
    ...applications.items.map((row) =>
      result(
        "application",
        row.id,
        row.name,
        [row.basePath, row.type].filter(Boolean).join(" · "),
      ),
    ),
    ...projects.items.map((row) =>
      result("project", row.id, row.name, row.description),
    ),
    ...diagrams.items.map((row) =>
      result("diagram", row.id, row.name, row.description),
    ),
  ].sort(
    (a, b) =>
      TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.name.localeCompare(b.name),
  );
}
