import { useQuery } from "@tanstack/react-query";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { type TranslationKey, useI18n } from "../lib/i18n";
import { iconForPath, MagnifyingGlassIcon } from "../lib/icons";
import {
  type SearchResult,
  type SearchResultType,
  searchAll,
} from "../lib/search";

const TYPE_LABEL: Record<SearchResultType, TranslationKey> = {
  provider: "common.provider",
  environment: "common.environment",
  server: "common.server",
  application: "common.application",
  project: "common.project",
  diagram: "common.diagram",
};

const TYPE_PATH: Record<SearchResultType, string> = {
  provider: "/providers",
  environment: "/environments",
  server: "/servers",
  application: "/applications",
  project: "/projects",
  diagram: "/diagrams",
};

const DEBOUNCE_MS = 250;

function useDebouncedValue(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

/**
 * Global search over the detail-capable entities. Each result carries its
 * entity type, so the listbox shows both the label and the destination.
 */
export function GlobalSearch() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const inputId = useId();
  const listboxId = `${inputId}-listbox`;
  const optionId = (index: number) => `${inputId}-option-${index}`;
  const root = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const term = useDebouncedValue(query.trim(), DEBOUNCE_MS);
  const results = useQuery({
    queryKey: ["global-search", term],
    queryFn: () => searchAll(term),
    enabled: term.length >= 2,
    staleTime: 30_000,
  });
  const items = term.length >= 2 ? (results.data ?? []) : [];
  const waiting = query.trim().length >= 2 && term.length < 2;
  const activeIndex =
    items.length > 0 ? Math.min(highlight, items.length - 1) : -1;
  const activeResult = activeIndex >= 0 ? items[activeIndex] : undefined;
  const pathname = location.pathname;

  // biome-ignore lint/correctness/useExhaustiveDependencies: close the panel on route changes
  useEffect(() => {
    setOpen(false);
    setQuery("");
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onDocumentMouseDown = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocumentMouseDown);
    return () => document.removeEventListener("mousedown", onDocumentMouseDown);
  }, [open]);

  const choose = (result: SearchResult) => {
    setOpen(false);
    setQuery("");
    navigate(result.href);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setHighlight((index) =>
        Math.min(index + 1, Math.max(items.length - 1, 0)),
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && open && activeResult) {
      event.preventDefault();
      choose(activeResult);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  const showPanel = open && query.trim().length > 0;

  return (
    <div ref={root} className="relative px-3 pb-3">
      <div className="relative">
        <MagnifyingGlassIcon
          className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400"
          aria-hidden="true"
        />
        <input
          id={inputId}
          type="search"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={showPanel && items.length > 0 ? listboxId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={
            showPanel && activeResult ? optionId(activeIndex) : undefined
          }
          aria-label={t("search.label")}
          autoComplete="off"
          spellCheck={false}
          value={query}
          placeholder={t("search.placeholder")}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setHighlight(0);
          }}
          onFocus={() => {
            if (query.trim()) setOpen(true);
          }}
          onBlur={(event) => {
            const next = event.relatedTarget as Node | null;
            if (next && !root.current?.contains(next)) setOpen(false);
          }}
          onKeyDown={onKeyDown}
          className="w-full rounded-md border border-slate-300 bg-white py-1.5 pr-3 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
        />
        {showPanel && (
          <div className="absolute top-full left-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border border-slate-300 bg-white shadow-lg">
            {query.trim().length < 2 ? (
              <p className="px-3 py-2 text-sm text-slate-500">
                {t("search.hint")}
              </p>
            ) : waiting || results.isFetching ? (
              <p className="px-3 py-2 text-sm text-slate-500">
                {t("search.loading")}
              </p>
            ) : results.error ? (
              <p className="px-3 py-2 text-sm text-red-600">
                {t("search.error")}
              </p>
            ) : items.length === 0 ? (
              <p className="px-3 py-2 text-sm text-slate-500">
                {t("search.empty")}
              </p>
            ) : (
              <div
                id={listboxId}
                role="listbox"
                aria-label={t("search.results")}
                className="max-h-96 overflow-auto py-1"
              >
                {items.map((item, index) => {
                  const Icon = iconForPath(TYPE_PATH[item.type]);
                  return (
                    <Link
                      key={`${item.type}-${item.id}`}
                      id={optionId(index)}
                      to={item.href}
                      role="option"
                      aria-selected={index === activeIndex}
                      tabIndex={-1}
                      onMouseEnter={() => setHighlight(index)}
                      onClick={() => {
                        setOpen(false);
                        setQuery("");
                      }}
                      className={`flex items-start gap-2 px-3 py-2 ${
                        index === activeIndex ? "bg-slate-100" : ""
                      }`}
                    >
                      <span className="mt-0.5 rounded bg-slate-100 p-1 text-slate-600">
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-900">
                          {item.name}
                        </span>
                        {item.detail && (
                          <span className="block truncate text-xs text-slate-500">
                            {item.detail}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-slate-600 uppercase">
                        {t(TYPE_LABEL[item.type])}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
