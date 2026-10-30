import { createContext, type ReactNode, useContext, useState } from "react";
import { createPortal } from "react-dom";

type HeaderSlotTargets = {
  title: HTMLElement | null;
  actions: HTMLElement | null;
  setTitle: (node: HTMLElement | null) => void;
  setActions: (node: HTMLElement | null) => void;
};

const HeaderSlotContext = createContext<HeaderSlotTargets | null>(null);

/**
 * The Shell header is fixed: pages portal their title (centre) and actions
 * (right) into it, so the name and the main action stay visible while the
 * page scrolls.
 */
export function HeaderSlotProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState<HTMLElement | null>(null);
  const [actions, setActions] = useState<HTMLElement | null>(null);

  return (
    <HeaderSlotContext.Provider
      value={{ title, actions, setTitle, setActions }}
    >
      {children}
    </HeaderSlotContext.Provider>
  );
}

export function useHeaderSlotTargets(): HeaderSlotTargets {
  const context = useContext(HeaderSlotContext);
  if (!context)
    throw new Error("HeaderSlotProvider mancante sopra questo componente.");
  return context;
}

export function PageHeaderSlot({
  title,
  actions,
}: {
  title: ReactNode;
  actions?: ReactNode;
}) {
  const context = useContext(HeaderSlotContext);
  if (!context) return null;
  return (
    <>
      {context.title &&
        createPortal(
          <h1 className="truncate text-sm font-semibold">{title}</h1>,
          context.title,
        )}
      {context.actions && actions && createPortal(actions, context.actions)}
    </>
  );
}
