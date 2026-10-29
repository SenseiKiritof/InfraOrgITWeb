import type { ReactNode } from "react";
import { useI18n } from "../lib/i18n";

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-slate-600">{description}</p>
        )}
      </div>
      {children}
    </header>
  );
}

export function SearchForm({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const { t } = useI18n();
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="flex gap-2"
    >
      <label htmlFor="search" className="sr-only">
        {t("common.search")}
      </label>
      <input
        id="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t("common.searchEllipsis")}
        className="w-64 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
      />
      <button
        type="submit"
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
      >
        {t("common.search")}
      </button>
    </form>
  );
}
