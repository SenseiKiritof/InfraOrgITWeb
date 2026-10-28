import { describe, expect, it } from "vitest";
import { parseApiSpec } from "./openapi";

const openApi3 = JSON.stringify({
  openapi: "3.0.3",
  servers: [{ url: "https://api.example.com/v1" }],
  paths: {
    "/servers": {
      get: {
        summary: "Elenca server",
        parameters: [
          { in: "query", name: "limit", schema: { type: "integer" } },
          { in: "query", name: "q", schema: { type: "string" } },
        ],
      },
      post: {
        description: "Crea server",
        requestBody: {
          content: { "application/json": { example: { name: "ws1" } } },
        },
      },
    },
    "/servers/{id}": {
      delete: {
        operationId: "deleteServer",
        parameters: [{ in: "path", name: "id", schema: { type: "string" } }],
      },
    },
  },
});

const swagger2 = `swagger: "2.0"
host: api.example.com
basePath: /v2
schemes: [https]
paths:
  /items:
    get:
      summary: Lista
      parameters:
        - in: query
          name: page
          type: integer
        - in: query
          name: since
          type: string
          format: date-time
        - in: body
          name: body
          schema:
            example:
              name: item
`;

describe("parseApiSpec", () => {
  it("legge OpenAPI 3 con server, query param e body", () => {
    const api = parseApiSpec(openApi3);

    expect(api).toHaveLength(3);
    const list = api.find((item) => item.method === "GET");
    expect(list?.url).toBe("https://api.example.com/v1/servers");
    expect(list?.description).toBe("Elenca server");
    expect(list?.queryParams).toEqual([
      { name: "limit", paramType: "Int" },
      { name: "q", paramType: "String" },
    ]);

    const create = api.find((item) => item.method === "POST");
    expect(create?.url).toBe("https://api.example.com/v1/servers");
    expect(create?.body).toContain('"name": "ws1"');

    const remove = api.find((item) => item.method === "DELETE");
    expect(remove?.url).toBe("https://api.example.com/v1/servers/{id}");
    expect(remove?.queryParams).toEqual([]);
  });

  it("legge Swagger 2 da YAML con host, basePath e tipi", () => {
    const api = parseApiSpec(swagger2);

    expect(api).toHaveLength(1);
    expect(api[0].method).toBe("GET");
    expect(api[0].url).toBe("https://api.example.com/v2/items");
    expect(api[0].queryParams).toEqual([
      { name: "page", paramType: "Int" },
      { name: "since", paramType: "DateTime" },
    ]);
    expect(api[0].body).toContain('"name": "item"');
  });

  it("rifiuta documenti non OpenAPI", () => {
    expect(() => parseApiSpec('{"name":"x"}')).toThrow(/OpenAPI/);
  });
});
