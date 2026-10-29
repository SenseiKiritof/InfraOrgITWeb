import { describe, expect, it } from "vitest";
import { buildGraph, edgeKey, nodeKey } from "./buildGraph";
import type { Topology } from "./diagrams";

const topology: Topology = {
  providers: [
    {
      id: 1,
      name: "Provider A",
      projects: [],
      environments: [
        {
          id: 10,
          environmentId: 100,
          environmentName: "PROD",
          projects: [],
          servers: [
            {
              id: 20,
              name: "srv-1",
              ipAddress: "10.0.0.1",
              hostname: "srv-1.local",
              projects: [],
              applications: [
                {
                  id: 30,
                  applicationVersionId: 300,
                  applicationName: "App",
                  versionNumber: "1.0.0",
                  exposedPort: 8080,
                  projects: [],
                },
              ],
            },
            {
              id: 21,
              name: "srv-2",
              ipAddress: "10.0.0.2",
              hostname: "srv-2.local",
              projects: [],
              applications: [],
            },
          ],
        },
      ],
    },
  ],
  proxyConnections: [
    {
      id: 40,
      sourceServerId: 20,
      targetServerId: 21,
      direction: "Outgoing",
      projects: [],
      routes: [
        {
          id: 50,
          route: "/api",
          mappedTo: "/mapped",
          targetServerApplicationId: 30,
          virtualHost: null,
          listenPort: null,
        },
        {
          id: 51,
          route: "/health",
          mappedTo: null,
          targetServerApplicationId: null,
          virtualHost: null,
          listenPort: null,
        },
      ],
    },
  ],
};

describe("buildGraph", () => {
  it("crea la gerarchia e instrada le route sul target corretto", () => {
    const graph = buildGraph(topology);

    expect(graph.nodes.map((node) => node.id)).toEqual([
      nodeKey("Provider", 1),
      nodeKey("ProviderEnvironment", 10),
      nodeKey("Server", 20),
      nodeKey("ServerApplication", 30),
      nodeKey("Server", 21),
    ]);

    expect(graph.edges.map((edge) => edge.id)).toEqual([
      edgeKey(40, "ServerApplication", 30),
      edgeKey(40, "Server", 21),
    ]);
    expect(
      graph.edges.every((edge) => edge.source === nodeKey("Server", 20)),
    ).toBe(true);
    expect(graph.edges[0].label).toBe("/api → /mapped");
    expect(graph.edges[1].label).toBe("/health");
  });

  it("mostra host e porta nella label della route", () => {
    const [connection] = topology.proxyConnections;
    const graph = buildGraph({
      ...topology,
      proxyConnections: [
        {
          ...connection,
          routes: [
            {
              ...connection.routes[0],
              virtualHost: "shop.acme.example",
              listenPort: 443,
            },
          ],
        },
      ],
    });
    expect(graph.edges[0].label).toBe("shop.acme.example:443/api → /mapped");
  });

  it("rispetta il layout salvato annidato", () => {
    const graph = buildGraph(topology, [
      {
        nodeType: "Provider",
        entityId: 1,
        x: 0,
        y: 0,
        width: 420,
        height: 340,
        collapsed: false,
      },
      {
        nodeType: "ProviderEnvironment",
        entityId: 10,
        x: 16,
        y: 44,
        width: 360,
        height: 260,
        collapsed: false,
      },
      {
        nodeType: "Server",
        entityId: 20,
        x: 16,
        y: 44,
        width: 220,
        height: 90,
        collapsed: false,
      },
      {
        nodeType: "Server",
        entityId: 21,
        x: 16,
        y: 148,
        width: 220,
        height: 60,
        collapsed: false,
      },
      {
        nodeType: "ServerApplication",
        entityId: 30,
        x: 16,
        y: 44,
        width: 170,
        height: 70,
        collapsed: false,
      },
    ]);

    const provider = graph.nodes.find(
      (node) => node.id === nodeKey("Provider", 1),
    );
    const environment = graph.nodes.find(
      (node) => node.id === nodeKey("ProviderEnvironment", 10),
    );
    const server = graph.nodes.find(
      (node) => node.id === nodeKey("Server", 20),
    );
    const application = graph.nodes.find(
      (node) => node.id === nodeKey("ServerApplication", 30),
    );

    expect(provider?.position).toEqual({ x: 0, y: 0 });
    expect(environment?.position).toEqual({ x: 16, y: 44 });
    expect(environment?.parentId).toBe(nodeKey("Provider", 1));
    expect(server?.position).toEqual({ x: 16, y: 44 });
    expect(server?.parentId).toBe(nodeKey("ProviderEnvironment", 10));
    expect(application?.parentId).toBe(nodeKey("Server", 20));
  });

  it("crea contenitori annidati quando non c'è layout salvato", () => {
    const graph = buildGraph(topology);

    const environment = graph.nodes.find(
      (node) => node.id === nodeKey("ProviderEnvironment", 10),
    );
    const server = graph.nodes.find(
      (node) => node.id === nodeKey("Server", 20),
    );
    const application = graph.nodes.find(
      (node) => node.id === nodeKey("ServerApplication", 30),
    );

    expect(environment?.parentId).toBe(nodeKey("Provider", 1));
    expect(server?.parentId).toBe(nodeKey("ProviderEnvironment", 10));
    expect(application?.parentId).toBe(nodeKey("Server", 20));
    expect(environment?.style?.width).toBeGreaterThan(0);
    expect(server?.style?.width).toBeGreaterThan(0);
  });

  it("regge 500 nodi", () => {
    const servers = Array.from({ length: 125 }, (_, index) => ({
      id: 1000 + index,
      name: `srv-${index}`,
      ipAddress: `10.1.0.${index}`,
      hostname: `srv-${index}.local`,
      projects: [],
      applications: Array.from({ length: 3 }, (_, appIndex) => ({
        id: 5000 + index * 3 + appIndex,
        applicationVersionId: 9000 + index,
        applicationName: `App ${index}`,
        versionNumber: "1.0.0",
        exposedPort: 8080,
        projects: [],
      })),
    }));

    const big: Topology = {
      providers: [
        {
          id: 1,
          name: "Big",
          projects: [],
          environments: [
            {
              id: 10,
              environmentId: 100,
              environmentName: "PROD",
              projects: [],
              servers,
            },
          ],
        },
      ],
      proxyConnections: [],
    };

    const graph = buildGraph(big);
    expect(graph.nodes).toHaveLength(2 + 125 + 375);
  });
});
