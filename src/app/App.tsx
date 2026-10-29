import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { lazy, Suspense, useState } from "react";
import {
  Link,
  NavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import {
  HeaderSlotProvider,
  useHeaderSlotTargets,
} from "../components/PageHeaderSlot";
import { UserMenu } from "../components/UserMenu";
import { GroupsPage } from "../features/admin/GroupsPage";
import { MenusPage } from "../features/admin/MenusPage";
import { RolesPage } from "../features/admin/RolesPage";
import { UsersPage } from "../features/admin/UsersPage";
import {
  ApplicationDetailPage,
  ApplicationsPage,
} from "../features/catalog/ApplicationsPage";
import {
  ProjectDetailPage,
  ProjectsPage,
} from "../features/catalog/ProjectsPage";
import {
  EnvironmentDetailPage,
  EnvironmentsPage,
} from "../features/inventory/EnvironmentsPage";
import {
  ProviderDetailPage,
  ProvidersPage,
} from "../features/inventory/ProvidersPage";
import {
  ServerDetailPage,
  ServersPage,
} from "../features/inventory/ServersPage";
import { CommandsPage } from "../features/remote/CommandsPage";
import {
  ConsoleProvider,
  clearConsoleSessions,
} from "../features/remote/ConsoleProvider";
import { CredentialsPage } from "../features/remote/CredentialsPage";
import { ExecutionsPage } from "../features/remote/ExecutionsPage";
import { ReachabilityPage } from "../features/remote/ReachabilityPage";
import type { Menu } from "../lib/api";
import { getMenus } from "../lib/api";
import { backAction } from "../lib/back";
import { homeMenus } from "../lib/home";
import { LanguageProvider, useI18n } from "../lib/i18n";
import { ArrowLeftIcon, iconForPath, MoonIcon, SunIcon } from "../lib/icons";
import { AuthProvider, useAuth } from "./AuthProvider";

const DiagramPage = lazy(() =>
  import("../features/diagrams/DiagramPage").then((module) => ({
    default: module.DiagramPage,
  })),
);
const DiagramsPage = lazy(() =>
  import("../features/diagrams/DiagramsPage").then((module) => ({
    default: module.DiagramsPage,
  })),
);

export function App() {
  return (
    <LanguageProvider>
      <Routes>
        <Route path="/login-error" element={<LoginErrorPage />} />
        <Route
          path="*"
          element={
            <AuthProvider>
              <AuthenticatedApp />
            </AuthProvider>
          }
        />
      </Routes>
    </LanguageProvider>
  );
}

function AuthenticatedApp() {
  const { session, loading, error } = useAuth();
  const { t } = useI18n();

  if (loading) return <Centered>{t("app.sessionLoading")}</Centered>;
  if (error)
    return <Centered>{t("app.sessionError", { message: error })}</Centered>;
  if (!session) return <Centered>{t("app.redirecting")}</Centered>;

  return (
    <ConsoleProvider>
      <Suspense fallback={<Centered>{t("app.pageLoading")}</Centered>}>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<HomePage />} />
            <Route path="providers" element={<ProvidersPage />} />
            <Route path="providers/:id" element={<ProviderDetailPage />} />
            <Route path="environments" element={<EnvironmentsPage />} />
            <Route
              path="environments/:id"
              element={<EnvironmentDetailPage />}
            />
            <Route path="servers" element={<ServersPage />} />
            <Route path="servers/:id" element={<ServerDetailPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="groups" element={<GroupsPage />} />
            <Route path="roles" element={<RolesPage />} />
            <Route path="menu" element={<MenusPage />} />
            <Route path="credentials" element={<CredentialsPage />} />
            <Route path="commands" element={<CommandsPage />} />
            <Route path="reachability" element={<ReachabilityPage />} />
            <Route path="executions" element={<ExecutionsPage />} />
            <Route path="applications" element={<ApplicationsPage />} />
            <Route
              path="applications/:id"
              element={<ApplicationDetailPage />}
            />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="projects/:id" element={<ProjectDetailPage />} />
            <Route path="diagrams" element={<DiagramsPage />} />
            <Route path="diagrams/:id" element={<DiagramPage />} />
            <Route path="*" element={<PlaceholderPage />} />
          </Route>
        </Routes>
      </Suspense>
    </ConsoleProvider>
  );
}

const DETAIL_ROUTE =
  /^\/(servers|applications|projects|providers|environments|diagrams)\/\d+$/;

function Shell() {
  return (
    <HeaderSlotProvider>
      <ShellLayout />
    </HeaderSlotProvider>
  );
}

function ShellLayout() {
  const { setTitle, setActions } = useHeaderSlotTargets();
  const { session, logout } = useAuth();
  const { language, t } = useI18n();
  const menus = useQuery({
    queryKey: ["menus", language],
    queryFn: () => getMenus(language),
  });
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains("dark"),
  );
  const location = useLocation();
  const navigate = useNavigate();
  const detailParent = DETAIL_ROUTE.exec(location.pathname)?.[1];

  const goBack = () => {
    if (!detailParent) return;
    const action = backAction(window.history.state?.idx ?? 0, detailParent);
    if (action.kind === "history") navigate(-1);
    else navigate(action.to);
  };

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("infraorgit-theme", next ? "dark" : "light");
  };

  const handleLogout = async () => {
    setLogoutError(null);
    if (await logout()) {
      clearConsoleSessions();
      window.location.assign("/auth/login");
      return;
    }
    setLogoutError(t("app.logoutError"));
  };

  return (
    <div
      className="flex h-full overflow-hidden bg-slate-50 text-slate-900"
      style={{ paddingBottom: "var(--console-dock-height, 0px)" }}
    >
      <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="flex h-16 shrink-0 flex-col justify-center border-b border-slate-200 px-4">
          <p className="text-lg leading-tight font-semibold">InfraOrgIT</p>
          <p className="text-xs text-slate-500">
            Infrastructure organizer ·{" "}
            {import.meta.env.VITE_APP_VERSION ?? "dev"}
          </p>
        </div>
        <nav
          aria-label={t("app.mainMenu")}
          className="min-h-0 flex-1 overflow-y-auto p-3"
        >
          {menus.isLoading && (
            <p className="px-2 text-sm text-slate-500">
              {t("app.menuLoading")}
            </p>
          )}
          {menus.error && (
            <p className="px-2 text-sm text-red-600">{menus.error.message}</p>
          )}
          {menus.data && <MenuList menus={menus.data} />}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-6">
          <div className="flex min-w-0 shrink-0 items-center gap-3">
            {detailParent && (
              <Link
                to={`/${detailParent}`}
                onClick={(event) => {
                  if (event.metaKey || event.ctrlKey || event.shiftKey) return;
                  event.preventDefault();
                  goBack();
                }}
                className="flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
              >
                <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
                {t("app.back")}
              </Link>
            )}
          </div>
          <div
            ref={setTitle}
            className="flex min-w-0 flex-1 items-center justify-center px-4 text-sm font-semibold text-slate-700"
          />
          <div className="flex items-center gap-2">
            <div ref={setActions} className="flex items-center gap-2" />
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={dark ? t("app.switchLight") : t("app.switchDark")}
              title={dark ? t("app.themeLight") : t("app.themeDark")}
              className="rounded-md border border-slate-300 p-1.5 text-slate-700 hover:bg-slate-100"
            >
              {dark ? (
                <SunIcon className="h-5 w-5" aria-hidden="true" />
              ) : (
                <MoonIcon className="h-5 w-5" aria-hidden="true" />
              )}
            </button>
            <UserMenu
              name={`${session?.user.name ?? ""} ${session?.user.surname ?? ""}`}
              username={session?.user.username ?? ""}
              onLogout={() => void handleLogout()}
            />
          </div>
        </header>
        {logoutError && (
          <p
            role="alert"
            className="border-b border-red-200 bg-red-50 px-6 py-2 text-sm text-red-700"
          >
            {logoutError}
          </p>
        )}
        <main className="min-h-0 flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function MenuList({ menus }: { menus: Menu[] }) {
  return (
    <ul className="space-y-1">
      {menus.map((menu) => {
        const Icon = iconForPath(menu.path);
        return (
          <li key={menu.id}>
            <NavLink
              to={menu.path}
              end={menu.path === "/"}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                  isActive
                    ? "bg-slate-900 text-white"
                    : "text-slate-700 hover:bg-slate-100"
                }`
              }
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{menu.name}</span>
            </NavLink>
            {menu.children.length > 0 && (
              <div className="ml-3 border-l border-slate-200 pl-2">
                <MenuList menus={menu.children} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function HomePage() {
  const { session } = useAuth();
  const { language, t } = useI18n();
  const menus = useQuery({
    queryKey: ["menus", language],
    queryFn: () => getMenus(language),
  });
  const tiles = homeMenus(menus.data ?? []);

  return (
    <section className="max-w-5xl">
      <h1 className="text-2xl font-semibold">InfraOrgIT</h1>
      <p className="mt-2 text-slate-600">
        {t("app.welcome", {
          name: `${session?.user.name ?? ""} ${session?.user.surname ?? ""}`,
        })}
      </p>
      {menus.isLoading && (
        <p className="mt-6 text-sm text-slate-500">{t("app.homeLoading")}</p>
      )}
      {menus.error && (
        <p className="mt-6 text-sm text-red-600">{menus.error.message}</p>
      )}
      {!menus.isLoading && !menus.error && (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((menu) => {
            const Icon = iconForPath(menu.path);
            return (
              <Link
                key={menu.id}
                to={menu.path}
                className="group flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-300 hover:bg-slate-50"
              >
                <span className="rounded-md bg-slate-100 p-2 text-slate-700 group-hover:bg-slate-200">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="truncate text-sm font-medium text-slate-900">
                  {menu.name}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

function PlaceholderPage() {
  const location = useLocation();
  const { t } = useI18n();
  return (
    <section className="max-w-3xl">
      <p className="text-xs uppercase tracking-wide text-slate-500">
        {t("app.placeholder")}
      </p>
      <h1 className="mt-1 text-2xl font-semibold">{location.pathname}</h1>
      <p className="mt-2 text-slate-600">{t("app.comingSoon")}</p>
    </section>
  );
}

function LoginErrorPage() {
  const [params] = useSearchParams();
  const { t } = useI18n();
  const code = params.get("code");
  return (
    <Centered>
      <div className="max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center">
        <h1 className="text-lg font-semibold">{t("app.loginErrorTitle")}</h1>
        <p className="mt-2 text-sm text-slate-600">{t("app.loginErrorBody")}</p>
        {code && (
          <p className="mt-1 font-mono text-xs text-slate-400">{code}</p>
        )}
        <a
          href="/auth/login"
          className="mt-4 inline-block rounded-md border border-transparent bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
        >
          {t("app.retry")}
        </a>
      </div>
    </Centered>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center bg-slate-50 p-6 text-sm text-slate-600">
      {children}
    </div>
  );
}
