import { useRef } from "react";
import { useI18n } from "../lib/i18n";
import { ArrowRightOnRectangleIcon, UserCircleIcon } from "../lib/icons";

/** User dropdown with the language selector. */
export function UserMenu({
  name,
  username,
  onLogout,
}: {
  name: string;
  username: string;
  onLogout: () => void;
}) {
  const { language, setLanguage, t } = useI18n();
  const menu = useRef<HTMLDetailsElement>(null);

  const choose = (next: "it" | "en") => {
    setLanguage(next);
    menu.current?.removeAttribute("open");
  };

  const optionClass = (active: boolean) =>
    `flex-1 rounded px-2 py-1 text-xs ${
      active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
    }`;

  return (
    <details ref={menu} className="relative">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 [&::-webkit-details-marker]:hidden">
        <UserCircleIcon className="h-5 w-5" aria-hidden="true" />
        <span className="max-w-[14rem] truncate">{name}</span>
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-48 rounded-md border border-slate-200 bg-white p-1 shadow-lg">
        <p className="truncate px-3 py-2 text-xs text-slate-500">{username}</p>
        <fieldset className="mt-1 border-t border-slate-200 pt-1">
          <legend className="px-3 py-1 text-xs text-slate-500">
            Lingua / Language
          </legend>
          <div className="flex gap-1 px-2 pb-1">
            <button
              type="button"
              aria-label="Italiano"
              aria-pressed={language === "it"}
              onClick={() => choose("it")}
              className={optionClass(language === "it")}
            >
              Italiano
            </button>
            <button
              type="button"
              aria-label="English"
              aria-pressed={language === "en"}
              onClick={() => choose("en")}
              className={optionClass(language === "en")}
            >
              English
            </button>
          </div>
        </fieldset>
        <button
          type="button"
          onClick={onLogout}
          className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
        >
          <ArrowRightOnRectangleIcon className="h-4 w-4" aria-hidden="true" />
          {t("app.logout")}
        </button>
      </div>
    </details>
  );
}
