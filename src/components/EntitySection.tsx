import type { FormEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { usePagination } from "../lib/pagination";
import { nextSort, type SortState, sortedRows } from "../lib/sort";
import { Pagination } from "./Pagination";
import { SortableTh } from "./SortableTh";

export type FormValues = Record<string, string>;

export interface Field {
  name: string;
  label: string;
  type?: "text" | "number" | "textarea" | "select" | "checkbox";
  options?: { value: string; label: string }[];
  required?: boolean;
}

export interface Column<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  sortable?: boolean;
}

interface EntitySectionProps<T extends { id: number }> {
  title?: string;
  rows: T[] | undefined;
  columns: Column<T>[];
  fields: Field[];
  empty: FormValues;
  toForm: (row: T) => FormValues;
  canWrite: boolean;
  canCreate?: boolean;
  canEditRow?: (row: T) => boolean;
  canDeleteRow?: (row: T) => boolean;
  onSave: (row: T | null, values: FormValues) => Promise<void>;
  onDelete?: (row: T) => Promise<void>;
  rowHref?: (row: T) => string;
  rowActions?: (row: T) => ReactNode;
  createLabel?: string;
}

export function EntitySection<T extends { id: number }>({
  title,
  rows,
  columns,
  fields,
  empty,
  toForm,
  canWrite,
  canCreate = true,
  canEditRow,
  canDeleteRow,
  onSave,
  onDelete,
  rowHref,
  rowActions,
  createLabel = "Nuovo",
}: EntitySectionProps<T>) {
  const [editing, setEditing] = useState<T | "new" | null>(null);
  const [values, setValues] = useState<FormValues>(empty);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sort, setSort] = useState<SortState>(null);
  const firstField = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (editing !== null) firstField.current?.focus();
  }, [editing]);

  const ordered = sortedRows(rows, sort);
  const paginated = usePagination(ordered);

  const startCreate = () => {
    setValues(empty);
    setError(null);
    setEditing("new");
  };

  const startEdit = (row: T) => {
    setValues(toForm(row));
    setError(null);
    setEditing(row);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSave(editing === "new" ? null : editing, values);
      setEditing(null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Errore di salvataggio",
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: T) => {
    if (!onDelete) return;
    if (!window.confirm(`Eliminare "${labelOf(row)}"?`)) return;
    setError(null);
    try {
      await onDelete(row);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Errore di eliminazione",
      );
    }
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        {title ? (
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            {title}
          </h2>
        ) : (
          <span />
        )}
        {canWrite && canCreate && (
          <button
            type="button"
            onClick={startCreate}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
          >
            {createLabel}
          </button>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      {rows === undefined ? (
        <p className="px-4 py-6 text-sm text-slate-500">Caricamento…</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-500">Nessun elemento.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                {columns.map((column) => (
                  <SortableTh
                    key={column.key}
                    label={column.label}
                    sortKey={column.key}
                    sort={sort}
                    sortable={column.sortable !== false}
                    onSort={(key) =>
                      setSort((current) => nextSort(current, key))
                    }
                  />
                ))}
                <th scope="col" className="px-4 py-2">
                  <span className="sr-only">Azioni</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {(paginated.items ?? []).map((row) => {
                const editable = canWrite && (canEditRow?.(row) ?? true);
                const deletable = canWrite && (canDeleteRow?.(row) ?? true);
                return (
                  <tr key={row.id} className="border-t border-slate-100">
                    {columns.map((column) => (
                      <td key={column.key} className="px-4 py-2">
                        {column.render(row)}
                      </td>
                    ))}
                    <td className="space-x-3 px-4 py-2 text-right whitespace-nowrap">
                      {rowHref && (
                        <Link
                          to={rowHref(row)}
                          className="text-sm font-medium text-slate-900 underline"
                        >
                          Apri
                        </Link>
                      )}
                      {rowActions?.(row)}
                      {editable && (
                        <button
                          type="button"
                          onClick={() => startEdit(row)}
                          className="text-sm text-slate-700 underline"
                        >
                          Modifica
                        </button>
                      )}
                      {deletable && onDelete && (
                        <button
                          type="button"
                          onClick={() => void remove(row)}
                          className="text-sm text-red-700 underline"
                        >
                          Elimina
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {rows !== undefined && rows.length > 0 && (
        <Pagination
          page={paginated.page}
          pageCount={paginated.pageCount}
          onPage={paginated.setPage}
        />
      )}

      {editing !== null && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-slate-900/40 p-4">
          <form
            role="dialog"
            aria-modal="true"
            aria-label={editing === "new" ? createLabel : "Modifica"}
            onSubmit={(event) => void submit(event)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setEditing(null);
            }}
            className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl"
          >
            <h2 className="text-lg font-semibold">
              {editing === "new" ? createLabel : "Modifica"}
            </h2>
            <div className="mt-4 space-y-3">
              {fields.map((field, index) => (
                <div key={field.name}>
                  <label
                    htmlFor={`field-${field.name}`}
                    className="block text-sm font-medium text-slate-700"
                  >
                    {field.label}
                  </label>
                  {field.type === "checkbox" ? (
                    <input
                      id={`field-${field.name}`}
                      type="checkbox"
                      checked={values[field.name] === "true"}
                      onChange={(event) =>
                        setValues({
                          ...values,
                          [field.name]: event.target.checked ? "true" : "false",
                        })
                      }
                      className="ml-2 align-middle"
                    />
                  ) : field.type === "select" ? (
                    <select
                      id={`field-${field.name}`}
                      value={values[field.name] ?? ""}
                      onChange={(event) =>
                        setValues({
                          ...values,
                          [field.name]: event.target.value,
                        })
                      }
                      required={field.required}
                      ref={
                        index === 0
                          ? (node) => {
                              firstField.current = node;
                            }
                          : undefined
                      }
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                    >
                      <option value="">—</option>
                      {field.options?.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : field.type === "textarea" ? (
                    <textarea
                      id={`field-${field.name}`}
                      value={values[field.name] ?? ""}
                      onChange={(event) =>
                        setValues({
                          ...values,
                          [field.name]: event.target.value,
                        })
                      }
                      required={field.required}
                      ref={
                        index === 0
                          ? (node) => {
                              firstField.current = node;
                            }
                          : undefined
                      }
                      rows={3}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                    />
                  ) : (
                    <input
                      id={`field-${field.name}`}
                      type={field.type ?? "text"}
                      value={values[field.name] ?? ""}
                      onChange={(event) =>
                        setValues({
                          ...values,
                          [field.name]: event.target.value,
                        })
                      }
                      required={field.required}
                      ref={
                        index === 0
                          ? (node) => {
                              firstField.current = node;
                            }
                          : undefined
                      }
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                    />
                  )}
                </div>
              ))}
            </div>
            {error && (
              <p role="alert" className="mt-3 text-sm text-red-700">
                {error}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              >
                Annulla
              </button>
              <button
                type="submit"
                disabled={busy}
                className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                Salva
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

function labelOf(row: { id: number }): string {
  const candidate = (row as { name?: unknown }).name;
  return typeof candidate === "string" ? candidate : `#${row.id}`;
}
