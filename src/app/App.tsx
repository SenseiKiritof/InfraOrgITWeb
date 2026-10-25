import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { lazy, Suspense, useState } from "react";
import { NavLink, Outlet, Route, Routes, useLocation } from "react-router-dom";
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
import { CredentialsPage } from "../features/remote/CredentialsPage";
import { ExecutionsPage } from "../features/remote/ExecutionsPage";
import { ReachabilityPage } from "../features/remote/ReachabilityPage";
import type { Menu } from "../lib/api";
import { getMenus } from "../lib/api";
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
  );
}

function AuthenticatedApp() {
  const { session, loading, error } = useAuth();

  if (loading) return <Centered>Caricamento sessione…</Centered>;
  if (error) return <Centered>Errore: {error}</Centered>;
  if (!session) return <Centered>Reindirizzamento al login…</Centered>;

  return (
    <Suspense fallback={<Centered>Caricamento pagina…</Centered>}>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<HomePage />} />
          <Route path="providers" element={<ProvidersPage />} />
          <Route path="providers/:id" element={<ProviderDetailPage />} />
          <Route path="environments" element={<EnvironmentsPage />} />
          <Route path="environments/:id" element={<EnvironmentDetailPage />} />
          <Route path="servers" element={<ServersPage />} />
          <Route path="servers/:id" element={<ServerDetailPage />} />
          <Route path="credentials" element={<CredentialsPage />} />
          <Route path="commands" element={<CommandsPage />} />
          <Route path="reachability" element={<ReachabilityPage />} />
          <Route path="executions" element={<ExecutionsPage />} />
          <Route path="applications" element={<ApplicationsPage />} />
          <Route path="applications/:id" element={<ApplicationDetailPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/:id" element={<ProjectDetailPage />} />
          <Route path="diagrams" element={<DiagramsPage />} />
          <Route path="diagrams/:id" element={<DiagramPage />} />
          <Route path="*" element={<PlaceholderPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

function Shell() {
  const { session, logout } = useAuth();
  const menus = useQuery({ queryKey: ["menus"], queryFn: getMenus });
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const handleLogout = async () => {
    setLogoutError(null);
    if (await logout()) {
      window.location.assign("/auth/login");
      return;
    }
    setLogoutError(
      "Logout non riuscito. La sessione è ancora attiva: riprova.",
    );
  };

  return (
    <div className="flex h-full bg-slate-50 text-slate-900">
      <aside className="w-64 shrink-0 border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-4">
          <p className="text-lg font-semibold">InfraOrgIT</p>
          <p className="text-xs text-slate-500">Infrastructure organizer</p>
        </div>
        <nav aria-label="Menu principale" className="p-3">
          {menus.isLoading && (
            <p className="px-2 text-sm text-slate-500">Caricamento menu…</p>
          )}
          {menus.error && (
            <p className="px-2 text-sm text-red-600">{menus.error.message}</p>
          )}
          {menus.data && <MenuList menus={menus.data} />}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <div>
            <p data-testid="current-user" className="text-sm font-medium">
              {session?.user.name} {session?.user.surname}
            </p>
            <p className="text-xs text-slate-500">{session?.user.username}</p>
          </div>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
          >
            Logout
          </button>
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
      {menus.map((menu) => (
        <li key={menu.id}>
          <NavLink
            to={menu.path}
            end={menu.path === "/"}
            className={({ isActive }) =>
              `block rounded-md px-3 py-2 text-sm ${
                isActive
                  ? "bg-slate-900 text-white"
                  : "text-slate-700 hover:bg-slate-100"
              }`
            }
          >
            {menu.name}
          </NavLink>
          {menu.childrens.length > 0 && (
            <div className="ml-3 border-l border-slate-200 pl-2">
              <MenuList menus={menu.childrens} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function HomePage() {
  const { session } = useAuth();
  return (
    <section className="max-w-3xl">
      <h1 className="text-2xl font-semibold">InfraOrgIT</h1>
      <p className="mt-2 text-slate-600">
        Benvenuto, {session?.user.name} {session?.user.surname}.
      </p>
      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
        Inventario, topologia e diagrammi disponibili. La gestione remota arriva
        nella prossima fase.
      </div>
    </section>
  );
}

function PlaceholderPage() {
  const location = useLocation();
  return (
    <section className="max-w-3xl">
      <p className="text-xs uppercase tracking-wide text-slate-500">Pagina</p>
      <h1 className="mt-1 text-2xl font-semibold">{location.pathname}</h1>
      <p className="mt-2 text-slate-600">
        Sezione in arrivo nella prossima fase.
      </p>
    </section>
  );
}

function LoginErrorPage() {
  return (
    <Centered>
      <div className="max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center">
        <h1 className="text-lg font-semibold">Accesso non riuscito</h1>
        <p className="mt-2 text-sm text-slate-600">
          Il login non è stato completato. Riprova o contatta un amministratore.
        </p>
        <a
          href="/auth/login"
          className="mt-4 inline-block rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
        >
          Riprova
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
