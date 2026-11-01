export type DocSnap = {
  html: string;
  width: number;
  height: number;
};

export type History = {
  past: DocSnap[];
  present: DocSnap;
  future: DocSnap[];
  /** A typing burst replaces the present instead of stacking a state per key. */
  burst: boolean;
};

const CAP = 50;

export function historyOf(present: DocSnap): History {
  return { past: [], present, future: [], burst: false };
}

function same(a: DocSnap, b: DocSnap) {
  return a.html === b.html && a.width === b.width && a.height === b.height;
}

export function record(history: History, next: DocSnap, burst = false): History {
  if (same(history.present, next)) return history;
  if (burst && history.burst) return { ...history, present: next, future: [] };
  const past = [...history.past, history.present];
  return {
    past: past.length > CAP ? past.slice(past.length - CAP) : past,
    present: next,
    future: [],
    burst,
  };
}

export function undo(history: History): History {
  const previous = history.past[history.past.length - 1];
  if (!previous) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
    burst: false,
  };
}

export function redo(history: History): History {
  const next = history.future[0];
  if (!next) return history;
  return {
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1),
    burst: false,
  };
}

export function canUndo(history: History) {
  return history.past.length > 0;
}

export function canRedo(history: History) {
  return history.future.length > 0;
}
