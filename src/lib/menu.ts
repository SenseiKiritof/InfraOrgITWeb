import type { Menu } from "./api";

export function flattenMenus(menus: Menu[]): Menu[] {
  return menus.flatMap((menu) => [menu, ...flattenMenus(menu.childrens)]);
}
