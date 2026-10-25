import { describe, expect, it } from "vitest";
import type { Menu } from "../lib/api";
import { flattenMenus } from "./menu";

const child = (id: number, parentId: number | null): Menu => ({
  id,
  name: `Menu ${id}`,
  path: `/${id}`,
  isActive: true,
  hideBackButton: true,
  isVisible: true,
  order: id,
  parentId,
  childrens: [],
});

describe("flattenMenus", () => {
  it("flatten albero padre-figlio", () => {
    const root = { ...child(1, null), childrens: [child(2, 1)] };
    expect(flattenMenus([root]).map((menu) => menu.id)).toEqual([1, 2]);
  });
});
