import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canRedo, canUndo, historyOf, record, redo, undo, type DocSnap } from "./history.ts";

function doc(html: string, width = 960, height = 540): DocSnap {
  return { html, width, height };
}

describe("history", () => {
  it("does nothing when there is nowhere to go", () => {
    const history = historyOf(doc("a"));
    assert.equal(undo(history), history);
    assert.equal(redo(history), history);
    assert.equal(canUndo(history), false);
    assert.equal(canRedo(history), false);
  });

  it("ignores a record that did not change the document", () => {
    const history = historyOf(doc("a"));
    assert.equal(record(history, doc("a")), history);
  });

  it("treats canvas size as part of the document", () => {
    const next = record(historyOf(doc("a", 960, 540)), doc("a", 1920, 1080));
    assert.equal(next.present.width, 1920);
    assert.equal(undo(next).present.width, 960);
  });

  it("drops redo when a new edit happens after undo", () => {
    const edited = record(record(historyOf(doc("a")), doc("b")), doc("c"));
    const back = undo(edited);
    assert.equal(back.present.html, "b");
    assert.equal(canRedo(back), true);
    const branched = record(back, doc("d"));
    assert.equal(branched.present.html, "d");
    assert.equal(canRedo(branched), false);
    assert.equal(undo(branched).present.html, "b");
  });

  it("collapses a typing burst into one state", () => {
    const first = record(historyOf(doc("a")), doc("ab"), true);
    const burst = record(first, doc("abc"), true);
    assert.equal(burst.past.length, 1);
    assert.equal(burst.present.html, "abc");
    const back = undo(burst);
    assert.equal(back.present.html, "a");
    const again = record(back, doc("z"), true);
    assert.equal(undo(again).present.html, "a");
  });

  it("keeps a drag as its own state after typing", () => {
    const typed = record(record(historyOf(doc("a")), doc("ab"), true), doc("abc"), true);
    const dragged = record(typed, doc("abc moved"));
    assert.equal(dragged.past.length, 2);
    assert.equal(undo(dragged).present.html, "abc");
    assert.equal(undo(undo(dragged)).present.html, "a");
  });

  it("forgets states older than 50", () => {
    let history = historyOf(doc("0"));
    for (let n = 1; n <= 60; n += 1) history = record(history, doc(String(n)));
    assert.equal(history.past.length, 50);
    assert.equal(history.past[0].html, "10");
    assert.equal(history.present.html, "60");
    assert.equal(canRedo(history), false);
  });

  it("stops at the ends", () => {
    const once = record(historyOf(doc("a")), doc("b"));
    const back = undo(once);
    assert.equal(undo(back), back);
    const forward = redo(back);
    assert.equal(forward.present.html, "b");
    assert.equal(redo(forward), forward);
  });
});
