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

const NAME_EXACT = 600;
const NAME_PREFIX = 500;
const NAME_TOKENS_IN_ORDER = 400;
const NAME_SUBSTRING = 300;
const NAME_SOME_TOKENS = 200;
const DETAIL_TOKENS = 100;

type Candidate = {
  result: SearchResult;
  context: string | null;
};

type RankedResult = {
  result: SearchResult;
  score: number;
};

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function searchPath<T>(path: string, q: string): Promise<Paged<T>> {
  const params = new URLSearchParams({
    q,
    pageSize: String(PAGE_SIZE),
  });
  return apiFetch<Paged<T>>(`${path}?${params}`);
}

function inOrder(text: string, tokens: string[]): boolean {
  let cursor = 0;
  for (const token of tokens) {
    const index = text.indexOf(token, cursor);
    if (index < 0) return false;
    cursor = index + token.length;
  }
  return true;
}

function positionBonus(positions: number[]): number {
  if (positions.length === 0) return 0;
  return Math.max(0, 10 - Math.min(...positions));
}

/**
 * Relevance of one result for the normalized query.
 *
 * Tiers, strongest first: exact name, name prefix, all query tokens in the
 * name in order, name substring, some tokens in the name, tokens in the
 * detail/hostname/environment text. Coverage and earlier positions break ties
 * inside a tier; the tiny length term prefers the closer (shorter) name.
 * Type order is only consulted after the score.
 */
function relevance(
  name: string,
  context: string | null,
  query: string,
): number {
  const tokens = query.split(" ");
  const positions = tokens
    .map((token) => name.indexOf(token))
    .filter((index) => index >= 0);
  const coverage = positions.length / tokens.length;
  const lengthPenalty = name.length / 1000;

  if (name === query) return NAME_EXACT + 20 + 10 - lengthPenalty;
  if (name.startsWith(query)) return NAME_PREFIX + 20 + 10 - lengthPenalty;
  if (inOrder(name, tokens)) {
    return NAME_TOKENS_IN_ORDER + 20 + positionBonus(positions) - lengthPenalty;
  }
  if (name.includes(query)) {
    return NAME_SUBSTRING + 20 + positionBonus(positions) - lengthPenalty;
  }
  if (positions.length > 0) {
    return (
      NAME_SOME_TOKENS +
      coverage * 20 +
      positionBonus(positions) -
      lengthPenalty
    );
  }
  if (context) {
    const matched = tokens.filter((token) => context.includes(token)).length;
    if (matched > 0) return DETAIL_TOKENS + (matched / tokens.length) * 20;
  }
  return 0;
}

function result(
  type: SearchResultType,
  id: number,
  name: string,
  detail: string | null,
  context: string | null = detail,
): Candidate {
  return {
    result: {
      type,
      id,
      name,
      detail,
      href: `${TYPE_PATH[type]}/${id}`,
    },
    context,
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
  const normalizedQuery = normalize(query);

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
        [row.ipAddress, row.hostname, row.providerEnvironmentLabel]
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
  ]
    .map<RankedResult>((candidate) => ({
      result: candidate.result,
      score: relevance(
        normalize(candidate.result.name),
        candidate.context ? normalize(candidate.context) : null,
        normalizedQuery,
      ),
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        TYPE_ORDER[a.result.type] - TYPE_ORDER[b.result.type] ||
        a.result.name.localeCompare(b.result.name),
    )
    .map((entry) => entry.result);
}
