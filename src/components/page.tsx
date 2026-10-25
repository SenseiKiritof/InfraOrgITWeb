import type { ReactNode } from "react";

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
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="flex gap-2"
    >
      <label htmlFor="search" className="sr-only">
        Cerca
      </label>
      <input
        id="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Cerca…"
        className="w-64 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
      />
      <button
        type="submit"
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
      >
        Cerca
      </button>
    </form>
  );
}
