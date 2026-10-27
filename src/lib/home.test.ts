import { describe, expect, it } from "vitest";
import type { Menu } from "./api";
import { homeMenus } from "./home";

const menu = (id: number, name: string, path: string): Menu => ({
  id,
  name,
  path,
  isActive: true,
  hideBackButton: false,
  isVisible: true,
  order: id,
  parentId: null,
  children: [],
});

describe("homeMenus", () => {
  it("keeps sections and drops home and detail routes", () => {
    const result = homeMenus([
      menu(1, "Home", "/"),
      menu(2, "Servers", "/servers"),
      menu(3, "Server {name}", "/servers/{id}"),
      menu(4, "Menu", "/menu"),
    ]);

    expect(result.map((item) => item.path)).toEqual(["/servers", "/menu"]);
  });
});
