"use client";

import { useEffect, useRef, useState } from "react";
import { AutosaveQueue, type SaveState } from "@/lib/autosave";

export type { SaveState };

/** React wrapper around AutosaveQueue that also warns before leaving with unsaved changes. */
export function useAutosave<T>(save: (value: T) => Promise<boolean>, delay = 1500) {
  const [state, setState] = useState<SaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const saveRef = useRef(save);
  const queueRef = useRef<AutosaveQueue<T> | null>(null);

  useEffect(() => {
    saveRef.current = save;
  });

  // Created lazily from event handlers and effects only, never during render.
  const queue = () => {
    queueRef.current ??= new AutosaveQueue<T>({
      delay,
      save: (v) => saveRef.current(v),
      onState: (s, at) => {
        setState(s);
        if (at) setLastSavedAt(at);
      },
    });
    return queueRef.current;
  };

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (queueRef.current?.hasPending) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      const q = queueRef.current;
      if (!q) return;
      const leftover = q.takePending();
      if (leftover !== null) void saveRef.current(leftover);
      q.dispose();
    };
  }, []);

  return {
    state,
    lastSavedAt,
    schedule: (value: T) => queue().schedule(value),
    flush: () => queue().flush(),
    hasPending: () => queueRef.current?.hasPending ?? false,
  };
}
