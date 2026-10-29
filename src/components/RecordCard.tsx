import { Fragment, useId } from "react";
import { useI18n } from "../lib/i18n";
import { AutocompleteSelect } from "./AutocompleteSelect";

export interface RecordField {
  name: string;
  label: string;
  type?: "text" | "number" | "textarea" | "select";
  options?: { value: string; label: string }[];
  required?: boolean;
  readOnly?: boolean;
  wide?: boolean;
}

/**
 * One record shown as a card: editable form for who can write, definition
 * list otherwise. Used where a one-row table with pagination made no sense.
 */
export function RecordCard<T extends Record<string, string>>({
  title,
  fields,
  values,
  onChange,
  canWrite,
  onSubmit,
  message,
}: {
  title: string;
  fields: RecordField[];
  values: T;
  onChange: (values: T) => void;
  canWrite: boolean;
  onSubmit: () => void;
  message?: string | null;
}) {
  const { t } = useI18n();
  const uid = useId();
  const display = (field: RecordField) =>
    field.options?.find((option) => option.value === values[field.name])
      ?.label ?? values[field.name];

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h2>
      {canWrite ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
          className="mt-3 space-y-3"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map((field) => {
              const id = `${uid}-${field.name}`;
              const className = `flex flex-col gap-1 ${
                field.wide || field.type === "textarea" ? "sm:col-span-2" : ""
              }`;
              if (field.readOnly) {
                return (
                  <div key={field.name} className={className}>
                    <span className="text-xs text-slate-500">
                      {field.label}
                    </span>
                    <span>{display(field) || "—"}</span>
                  </div>
                );
              }
              return (
                <label key={field.name} htmlFor={id} className={className}>
                  <span className="text-xs text-slate-500">{field.label}</span>
                  {field.type === "textarea" ? (
                    <textarea
                      id={id}
                      rows={3}
                      value={values[field.name] ?? ""}
                      onChange={(event) =>
                        onChange({
                          ...values,
                          [field.name]: event.target.value,
                        })
                      }
                      required={field.required}
                      className="rounded-md border border-slate-300 px-3 py-1.5"
                    />
                  ) : field.type === "select" ? (
                    <AutocompleteSelect
                      id={id}
                      value={values[field.name] ?? ""}
                      options={field.options ?? []}
                      onChange={(value) =>
                        onChange({ ...values, [field.name]: value } as T)
                      }
                      required={field.required}
                      className="w-full rounded-md border border-slate-300 px-3 py-1.5"
                    />
                  ) : (
                    <input
                      id={id}
                      type={field.type ?? "text"}
                      value={values[field.name] ?? ""}
                      onChange={(event) =>
                        onChange({
                          ...values,
                          [field.name]: event.target.value,
                        })
                      }
                      required={field.required}
                      className="rounded-md border border-slate-300 px-3 py-1.5"
                    />
                  )}
                </label>
              );
            })}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="rounded-md border border-transparent bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
            >
              {t("common.save")}
            </button>
            {message && (
              <p role="status" className="text-sm text-slate-600">
                {message}
              </p>
            )}
          </div>
        </form>
      ) : (
        <dl className="mt-3 grid gap-2 sm:grid-cols-2">
          {fields.map((field) => (
            <Fragment key={field.name}>
              <dt className="text-slate-500">{field.label}</dt>
              <dd>{display(field) || "—"}</dd>
            </Fragment>
          ))}
        </dl>
      )}
    </section>
  );
}
