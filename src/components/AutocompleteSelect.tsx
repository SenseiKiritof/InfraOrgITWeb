import { useEffect, useMemo, useRef, useState } from "react";

export interface AutocompleteOption {
  value: string;
  label: string;
}

/**
 * Searchable single select: an input with a filtered listbox.
 * The stored value is the option `value`; the input shows the option `label`.
 */
export function AutocompleteSelect({
  id,
  value,
  options,
  onChange,
  required,
  className = "mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm",
}: {
  id: string;
  value: string;
  options: AutocompleteOption[];
  onChange: (value: string) => void;
  required?: boolean;
  className?: string;
}) {
  const selected = options.find((option) => option.value === value);
  const [query, setQuery] = useState(selected?.label ?? "");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(selected?.label ?? "");
  }, [selected?.label]);

  useEffect(() => {
    if (!open) return;
    const onDocument = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocument);
    return () => document.removeEventListener("mousedown", onDocument);
  }, [open]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle || query === selected?.label) return options;
    return options.filter((option) =>
      option.label.toLowerCase().includes(needle),
    );
  }, [options, query, selected?.label]);

  const choose = (option: AutocompleteOption) => {
    onChange(option.value);
    setQuery(option.label);
    setOpen(false);
  };

  return (
    <div ref={root} className="relative">
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        aria-autocomplete="list"
        aria-activedescendant={
          open && filtered[highlight] ? `${id}-option-${highlight}` : undefined
        }
        autoComplete="off"
        value={query}
        required={required}
        placeholder="Cerca…"
        onChange={(event) => {
          setQuery(event.target.value);
          setHighlight(0);
          setOpen(true);
          if (event.target.value.trim() === "") onChange("");
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setHighlight((index) => Math.min(index + 1, filtered.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setHighlight((index) => Math.max(index - 1, 0));
          } else if (event.key === "Enter" && open && filtered[highlight]) {
            event.preventDefault();
            choose(filtered[highlight]);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        className={className}
      />
      {open && filtered.length > 0 && (
        <div
          id={`${id}-listbox`}
          role="listbox"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-slate-300 bg-white text-sm shadow-lg"
        >
          {filtered.map((option, index) => (
            <div
              key={option.value}
              id={`${id}-option-${index}`}
              role="option"
              tabIndex={-1}
              aria-selected={option.value === value}
              onMouseDown={(event) => {
                event.preventDefault();
                choose(option);
              }}
              className={`cursor-pointer px-3 py-1.5 ${
                index === highlight ? "bg-slate-100" : ""
              }`}
            >
              {option.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
