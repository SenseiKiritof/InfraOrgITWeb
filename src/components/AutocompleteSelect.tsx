import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

export interface AutocompleteOption {
  value: string;
  label: string;
}

const GAP = 4;
const MARGIN = 8;
const MIN_HEIGHT = 120;

interface ListboxPosition {
  left: number;
  width: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
}

/**
 * Searchable single select: an input with a filtered listbox.
 * The stored value is the option `value`; the input shows the option `label`.
 * The listbox is portaled to the body and fixed-anchored to the input so it
 * escapes overflow-clipping ancestors (modals) and flips above when needed.
 */
export function AutocompleteSelect({
  id,
  value,
  options,
  onChange,
  required,
  disabled,
  className = "mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm",
}: {
  id: string;
  value: string;
  options: AutocompleteOption[];
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const selected = options.find((option) => option.value === value);
  const [query, setQuery] = useState(selected?.label ?? "");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [position, setPosition] = useState<ListboxPosition>();
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listbox = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    const rect = input.current?.getBoundingClientRect();
    if (!rect) return;
    const spaceBelow = window.innerHeight - rect.bottom - GAP - MARGIN;
    const spaceAbove = rect.top - GAP - MARGIN;
    const flip = spaceBelow < MIN_HEIGHT && spaceAbove > spaceBelow;
    setPosition({
      left: rect.left,
      width: rect.width,
      maxHeight: Math.max(MIN_HEIGHT, flip ? spaceAbove : spaceBelow),
      ...(flip
        ? { bottom: window.innerHeight - rect.top + GAP }
        : { top: rect.bottom + GAP }),
    });
  }, []);

  useEffect(() => {
    setQuery(selected?.label ?? "");
  }, [selected?.label]);

  useEffect(() => {
    if (!open) return;
    const onDocument = (event: MouseEvent) => {
      const target = event.target as Node;
      if (root.current?.contains(target) || listbox.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("mousedown", onDocument);
    return () => document.removeEventListener("mousedown", onDocument);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const onScrollOrResize = (event: Event) => {
      // Scrolling the listbox itself must not move it.
      const target = event.target;
      if (target instanceof Node && listbox.current?.contains(target)) return;
      updatePosition();
    };
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [open, updatePosition]);

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
        ref={input}
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
        disabled={disabled}
        placeholder="Cerca…"
        onChange={(event) => {
          setQuery(event.target.value);
          setHighlight(0);
          setOpen(true);
          if (event.target.value.trim() === "") onChange("");
        }}
        onFocus={() => {
          if (!disabled) setOpen(true);
        }}
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
      {open &&
        filtered.length > 0 &&
        position &&
        createPortal(
          <div
            ref={listbox}
            id={`${id}-listbox`}
            role="listbox"
            style={{
              position: "fixed",
              left: position.left,
              width: position.width,
              maxHeight: position.maxHeight,
              top: position.top,
              bottom: position.bottom,
            }}
            className="z-[70] overflow-auto rounded-md border border-slate-300 bg-white text-sm shadow-lg"
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
          </div>,
          document.body,
        )}
    </div>
  );
}
