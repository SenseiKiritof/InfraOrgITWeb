import type { Menu } from "./api";

/** Menu entries to show as home tiles: sections only, not detail routes. */
export function homeMenus(menus: Menu[]): Menu[] {
  return menus.filter(
    (menu) =>
      menu.path !== "/" && !menu.path.includes("{") && !menu.path.includes(":"),
  );
}
