// Stands in for src/demo/ui.tsx when demos are bundled for the D2 page (see
// build.mjs). The demo site's UI (settings bar, config panels, notes, debug
// views) is Tailwind-styled and has no place on the page, so all of it draws
// nothing here, and DemoDraggable hands what it was mounted with to whoever
// embedded the demo: by default a plain DraggableRenderer.

import { type Draggable, DraggableRenderer } from "dragology";
import { createContext, type ReactNode, useContext, useState } from "react";

export type Mounted<T extends object = any> = {
  draggable: Draggable<T>;
  initialState: T;
  width: number;
  height: number;
  /** Called with the preview state on every frame of a drag, if the demo wants it */
  onDragState?: (state: T) => void;
  /** Called on drop, if the demo controls its state */
  onDropState?: (state: T) => void;
};

/** How an embedding draws a demo's draggable. */
export type Embed = (m: Mounted) => ReactNode;

const defaultEmbed: Embed = (m) => (
  <DraggableRenderer
    draggable={m.draggable}
    initialState={m.initialState}
    width={m.width}
    height={m.height}
    onDragState={m.onDragState}
  />
);

export const EmbedContext = createContext<Embed>(defaultEmbed);

export function DemoDraggable<T extends object>({
  draggable,
  initialState,
  state: controlledState,
  onDropState,
  onDragState,
  width,
  height,
  stateOverride,
}: {
  draggable: Draggable<T>;
  width: number;
  height: number;
  initialState?: T;
  state?: T;
  onDropState?: (state: T) => void;
  onDragState?: (state: T) => void;
  stateOverride?: Partial<T>;
  stateRef?: unknown;
}) {
  const embed = useContext(EmbedContext);
  const [ownState, setOwnState] = useState(
    (initialState ?? controlledState) as T,
  );
  const base = controlledState ?? ownState;
  const state = stateOverride ? { ...base, ...stateOverride } : base;
  return (
    <>
      {embed({
        draggable,
        initialState: state,
        width,
        height,
        onDragState,
        onDropState: onDropState ?? setOwnState,
      })}
    </>
  );
}

const Nothing = (_: any) => null;
export const DemoLink = Nothing;
export const DemoNotes = Nothing;
export const ConfigCheckbox = Nothing;
export const ConfigPanel = Nothing;
export const ConfigSlider = Nothing;
export const ConfigSelect = Nothing;
export const ConfigRadio = Nothing;

export function DemoWithConfig({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export const useDemoSettings = () => ({});
