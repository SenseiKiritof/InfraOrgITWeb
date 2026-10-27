import { describe, expect, it } from "vitest";
import {
  HomeIcon,
  iconForPath,
  ServerStackIcon,
  Squares2X2Icon,
} from "./icons";

describe("iconForPath", () => {
  it("usa l'icona della home solo per la radice", () => {
    expect(iconForPath("/")).toBe(HomeIcon);
  });

  it("mappa le voci di menu e le route di dettaglio", () => {
    expect(iconForPath("/servers")).toBe(ServerStackIcon);
    expect(iconForPath("/servers/44")).toBe(ServerStackIcon);
  });

  it("ha un fallback per i path sconosciuti", () => {
    expect(iconForPath("/sconosciuto")).toBe(Squares2X2Icon);
  });
});
