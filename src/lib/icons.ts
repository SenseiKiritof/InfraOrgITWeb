import {
  Bars3Icon,
  BuildingOffice2Icon,
  ClipboardDocumentListIcon,
  CommandLineIcon,
  FolderIcon,
  GlobeEuropeAfricaIcon,
  HomeIcon,
  KeyIcon,
  ServerStackIcon,
  ShareIcon,
  ShieldCheckIcon,
  ShieldExclamationIcon,
  SignalIcon,
  Squares2X2Icon,
  UserGroupIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";
import type { ComponentType, SVGProps } from "react";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const ICONS: Record<string, Icon> = {
  "/": HomeIcon,
  "/environments": GlobeEuropeAfricaIcon,
  "/applications": Squares2X2Icon,
  "/providers": BuildingOffice2Icon,
  "/servers": ServerStackIcon,
  "/diagrams": ShareIcon,
  "/projects": FolderIcon,
  "/users": UsersIcon,
  "/groups": UserGroupIcon,
  "/roles": ShieldCheckIcon,
  "/menu": Bars3Icon,
  "/credentials": KeyIcon,
  "/commands": CommandLineIcon,
  "/reachability": SignalIcon,
  "/executions": ClipboardDocumentListIcon,
  "/admin-audit": ShieldExclamationIcon,
};

const FALLBACK = Squares2X2Icon;

/** Icona della voce di menu; le route di dettaglio usano quella della lista. */
export function iconForPath(path: string): Icon {
  const normalized = path.replace(/\/\d+$/, "") || "/";
  const exact = ICONS[normalized];
  if (exact) return exact;

  const prefix = Object.keys(ICONS)
    .filter((key) => key !== "/" && normalized.startsWith(`${key}/`))
    .sort((a, b) => b.length - a.length)[0];
  return prefix ? ICONS[prefix] : FALLBACK;
}

export {
  ArrowLeftIcon,
  ArrowRightOnRectangleIcon,
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  HomeIcon,
  MoonIcon,
  ServerStackIcon,
  Squares2X2Icon,
  SunIcon,
  UserCircleIcon,
} from "@heroicons/react/24/outline";
