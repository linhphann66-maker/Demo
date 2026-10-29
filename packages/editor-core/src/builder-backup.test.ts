import { it, expect } from "vitest";
import { rigFixture } from "../../rig-core/src/fixture";
import { parseDocument, serialize } from "../../document-core/src";
import {
  builderBackup,
  saveBuilderProject,
  restoreBuilderProject,
  BUILDER_BACKUP_KEY,
} from "./builder-backup";
import { useEditor } from "./store";
const memory = () => {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, v: string) => {
      map.set(key, v);
    },
  };
};
it("restore stays unavailable until a valid snapshot exists and preserves the active project", () => {
  const s = memory(),
    d = rigFixture();
  useEditor.getState().open(d);
  expect(builderBackup(s)).toBe(null);
  expect(restoreBuilderProject(s)).toBe(false);
  expect(useEditor.getState().document).toEqual(parseDocument(d));
  s.setItem(BUILDER_BACKUP_KEY, "{}");
  expect(builderBackup(s)).toBe(null);
  expect(restoreBuilderProject(s)).toBe(false);
});
it("takes a complete backup before replacement and restore supports undo/redo", () => {
  const s = memory(),
    old = rigFixture(),
    next = rigFixture();
  next.metadata.name = "Built";
  next.bones[1].rest.y = 20;
  useEditor.getState().open(old);
  saveBuilderProject(next, old, s);
  expect(serialize(builderBackup(s)!)).toBe(serialize(parseDocument(old)));
  expect(useEditor.getState().document?.metadata.name).toBe("Built");
  expect(restoreBuilderProject(s)).toBe(true);
  expect(useEditor.getState().document?.metadata.name).toBe(old.metadata.name);
  expect(useEditor.getState().document?.bones[1].rest.y).toBe(0);
  useEditor.getState().undo();
  expect(useEditor.getState().document?.bones[1].rest.y).toBe(20);
  useEditor.getState().redo();
  expect(useEditor.getState().document?.bones[1].rest.y).toBe(0);
});
it("storage failure cannot replace the active project or lose the in-memory source", () => {
  const old = rigFixture(),
    next = rigFixture();
  next.metadata.name = "Built";
  useEditor.getState().open(old);
  let writes = 0;
  const storage = {
    getItem: () => null,
    setItem: () => {
      writes++;
      throw Error("quota");
    },
  };
  expect(() => saveBuilderProject(next, old, storage)).toThrow("quota");
  expect(writes).toBe(1);
  expect(useEditor.getState().document?.metadata.name).toBe(old.metadata.name);
});
