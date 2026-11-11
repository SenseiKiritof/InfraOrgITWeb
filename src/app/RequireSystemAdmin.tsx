import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../lib/i18n";
import { useServerAccess } from "../lib/useServerAccess";

/**
 * Non monta la pagina finché `/api/server-access/me` non conferma il ruolo:
 * così una pagina riservata non mostra dati prima del controllo.
 */
export function RequireSystemAdmin({ children }: { children: ReactNode }) {
  const access = useServerAccess();
  const { t } = useI18n();

  if (access.isPending)
    return (
      <p role="status" className="text-sm text-slate-500">
        {t("common.loading")}
      </p>
    );

  if (access.error)
    return (
      <section
        role="alert"
        className="max-w-2xl rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
      >
        <h1 className="text-base font-semibold">{t("app.adminOnlyTitle")}</h1>
        <p className="mt-1">
          {t("app.accessCheckFailed", { message: access.error.message })}
        </p>
        <Link to="/" className="mt-3 inline-block underline">
          {t("app.backHome")}
        </Link>
      </section>
    );

  if (!access.data?.isSystemAdmin)
    return (
      <section
        role="alert"
        className="max-w-2xl rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
      >
        <h1 className="text-base font-semibold">{t("app.adminOnlyTitle")}</h1>
        <p className="mt-1">{t("app.adminOnlyBody")}</p>
        <Link to="/" className="mt-3 inline-block underline">
          {t("app.backHome")}
        </Link>
      </section>
    );

  return children;
}
