import { parse as parseYaml } from "yaml";

export type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type QueryParamKind =
  | "Int"
  | "String"
  | "Bool"
  | "DateTime"
  | "Double"
  | "Decimal";

export interface ParsedQueryParam {
  name: string;
  paramType: QueryParamKind;
}

export interface ParsedApi {
  method: ApiMethod;
  url: string;
  description: string;
  body: string | null;
  queryParams: ParsedQueryParam[];
}

export interface ParsedApiKey {
  name: string;
  location: "Header" | "Query";
}

export interface ParsedSpec {
  apis: ParsedApi[];
  apiKeys: ParsedApiKey[];
}

const METHODS: { key: string; method: ApiMethod }[] = [
  { key: "get", method: "GET" },
  { key: "post", method: "POST" },
  { key: "put", method: "PUT" },
  { key: "patch", method: "PATCH" },
  { key: "delete", method: "DELETE" },
];

const MAX_TEXT = 200;
const MAX_BODY = 100_000;

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function trim(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

/**
 * Legge un documento OpenAPI 3.x o Swagger 2.0 (JSON o YAML) e restituisce
 * le operazioni, con parametri query e body di esempio.
 */
export function parseApiSpec(input: string): ParsedSpec {
  const source = input.trim();
  if (!source) throw new Error("Incolla un documento OpenAPI o Swagger.");

  let document: unknown;
  try {
    document = parseYaml(source);
  } catch (cause) {
    throw new Error(
      `Documento non leggibile: ${cause instanceof Error ? cause.message : "sintassi non valida"}.`,
    );
  }

  const root = record(document);
  if (!root) throw new Error("Il documento non contiene un oggetto radice.");
  if (typeof root.openapi === "string") {
    return {
      apis: parseOpenApi3(root),
      apiKeys: securityKeys(record(record(root.components)?.securitySchemes)),
    };
  }
  if (typeof root.swagger === "string") {
    return {
      apis: parseSwagger2(root),
      apiKeys: securityKeys(record(root.securityDefinitions)),
    };
  }
  throw new Error(
    "Formato non riconosciuto: serve un documento OpenAPI 3.x o Swagger 2.0.",
  );
}

/**
 * Legge i security scheme di tipo apiKey (header o query) dal documento.
 */
function securityKeys(
  schemes: Record<string, unknown> | undefined,
): ParsedApiKey[] {
  if (!schemes) return [];
  const keys: ParsedApiKey[] = [];
  const seen = new Set<string>();

  for (const raw of Object.values(schemes)) {
    const scheme = record(raw);
    if (!scheme || text(scheme.type) !== "apiKey") continue;

    const name = trim(text(scheme.name).trim(), MAX_TEXT);
    const where = text(scheme.in);
    const location: ParsedApiKey["location"] | null =
      where === "header" ? "Header" : where === "query" ? "Query" : null;
    if (!name || !location) continue;

    const id = `${location}:${name}`;
    if (seen.has(id)) continue;
    seen.add(id);
    keys.push({ name, location });
  }

  return keys;
}

function parseOpenApi3(document: Record<string, unknown>): ParsedApi[] {
  const server = record(list(document.servers)[0]);
  const base = text(server?.url);
  return parsePaths(document, base, false);
}

function parseSwagger2(document: Record<string, unknown>): ParsedApi[] {
  const host = text(document.host);
  const basePath = text(document.basePath);
  const scheme = text(list(document.schemes)[0]) || "http";
  const base = host ? `${scheme}://${host}${basePath}` : basePath;
  return parsePaths(document, base, true);
}

function parsePaths(
  document: Record<string, unknown>,
  base: string,
  v2: boolean,
): ParsedApi[] {
  const paths = record(document.paths);
  if (!paths) throw new Error("Il documento non contiene paths.");

  const operations: ParsedApi[] = [];
  for (const [path, rawItem] of Object.entries(paths)) {
    const item = record(rawItem);
    if (!item) continue;
    const sharedParams = list(item.parameters);

    for (const { key, method } of METHODS) {
      const operation = record(item[key]);
      if (!operation) continue;

      const params = [...sharedParams, ...list(operation.parameters)];
      const queryParams = v2
        ? swaggerQueryParams(params)
        : openApiQueryParams(params);
      const description = trim(
        text(operation.summary) ||
          text(operation.description) ||
          text(operation.operationId),
        MAX_TEXT,
      );
      const body = v2 ? swaggerBody(params) : openApiBody(operation);

      operations.push({
        method,
        url: trim(joinUrl(base, path), MAX_TEXT),
        description,
        body,
        queryParams,
      });
    }
  }

  if (operations.length === 0) {
    throw new Error("Nessuna operazione trovata nel documento.");
  }
  return operations;
}

function joinUrl(base: string, path: string): string {
  const cleanBase = base.replace(/\/+$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${cleanBase}${cleanPath}` || "/";
}

function openApiQueryParams(params: unknown[]): ParsedQueryParam[] {
  const result: ParsedQueryParam[] = [];
  const seen = new Set<string>();
  for (const raw of params) {
    const parameter = record(raw);
    if (parameter?.in !== "query") continue;
    const name = trim(text(parameter.name).trim(), MAX_TEXT);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const schema = record(parameter.schema);
    result.push({
      name,
      paramType: mapType(text(schema?.type), text(schema?.format)),
    });
  }
  return result;
}

function swaggerQueryParams(params: unknown[]): ParsedQueryParam[] {
  const result: ParsedQueryParam[] = [];
  const seen = new Set<string>();
  for (const raw of params) {
    const parameter = record(raw);
    if (parameter?.in !== "query") continue;
    const name = trim(text(parameter.name).trim(), MAX_TEXT);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    result.push({
      name,
      paramType: mapType(text(parameter.type), text(parameter.format)),
    });
  }
  return result;
}

function mapType(type: string, format: string): QueryParamKind {
  if (type === "integer") return "Int";
  if (type === "boolean") return "Bool";
  if (type === "number") {
    return format === "decimal" ? "Decimal" : "Double";
  }
  if (type === "string" && (format === "date" || format === "date-time")) {
    return "DateTime";
  }
  return "String";
}

function openApiBody(operation: Record<string, unknown>): string | null {
  const content = record(record(operation.requestBody)?.content);
  if (!content) return null;
  const media =
    record(content["application/json"]) ?? record(Object.values(content)[0]);
  if (!media) return null;
  const schema = record(media.schema);
  return sample(media.example ?? schema?.example ?? schema);
}

function swaggerBody(params: unknown[]): string | null {
  for (const raw of params) {
    const parameter = record(raw);
    if (parameter?.in !== "body") continue;
    const schema = record(parameter.schema);
    return sample(parameter.example ?? schema?.example ?? schema);
  }
  return null;
}

function sample(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  try {
    return JSON.stringify(value, null, 2).slice(0, MAX_BODY);
  } catch {
    return null;
  }
}
