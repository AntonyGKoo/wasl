"use client";
// One place that touches the browser's history, so the phone's Back button (or a back swipe)
// closes the dialog on top, then goes to the screen you were on before, instead of leaving Wasl.
//
// Opening a dialog or a screen adds a step. Closing a dialog with its own button takes its step
// out again with history.back(), which only lands a moment later; anything added in that moment
// has to wait, or the late back() would undo the wrong thing. That waiting is what this file does.

type Step = { added: boolean; closed: boolean };
const dialogs: Step[] = []; // dialog steps, oldest first
let undoing = 0; // our own history.back() calls that haven't landed yet
let waiting: { step?: Step; url?: string }[] = []; // steps to add once they have
const listeners = new Set<() => void>();
let wired = false;

function push(entry: { step?: Step; url?: string }) {
  if (entry.step?.closed) return; // closed before it ever reached the history
  window.history.pushState(window.history.state, "", entry.url);
  if (entry.step) entry.step.added = true;
}
function settle() {
  // take out the steps of dialogs that were closed with their own button, top first
  while (!undoing && dialogs.length && dialogs[dialogs.length - 1].closed) {
    const step = dialogs.pop()!;
    if (step.added) {
      undoing++;
      window.history.back();
      return;
    }
  }
  if (!undoing && waiting.length) {
    const run = waiting;
    waiting = [];
    run.forEach(push);
  }
}
function wire() {
  if (wired || typeof window === "undefined") return;
  wired = true;
  window.addEventListener("popstate", () => {
    if (undoing > 0) {
      // one of our own back() calls landing: nobody needs to hear about it
      undoing--;
      settle();
      return;
    }
    // the person went back: the dialog on top (if any) is the step they left
    for (let i = dialogs.length - 1; i >= 0; i--)
      if (dialogs[i].added && !dialogs[i].closed) {
        dialogs[i].closed = true;
        dialogs.splice(i, 1);
        break;
      }
    listeners.forEach((listener) => listener());
  });
}
function add(entry: { step?: Step; url?: string }) {
  if (undoing) waiting.push(entry);
  else push(entry);
}

// A dialog opened. Returns what to call when it closes (by its button, or because Back was used).
export function dialogOpened(onBack: () => void) {
  wire();
  const step: Step = { added: false, closed: false };
  dialogs.push(step);
  add({ step });
  const listener = () => {
    // Back was pressed and this dialog's step is gone: close it
    if (step.closed) onBack();
  };
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (step.closed) return; // Back already took its step out
    step.closed = true;
    settle();
  };
}
// Moving to another screen adds a step with its address.
export function screenOpened(url: string) {
  wire();
  add({ url });
}
// Back was pressed (for the screens: show the one the address names).
export function onBack(listener: () => void) {
  wire();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
