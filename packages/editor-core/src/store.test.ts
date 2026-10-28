import { beforeEach, describe, it, expect, vi } from "vitest";
import { fixture, uid } from "../../document-core/src/fixture";
import { useEditor, STORAGE_KEY } from "./store";
const map = new Map<string, string>();
beforeEach(() => {
  map.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => map.set(k, v),
  });
  useEditor.getState().open(fixture());
});
describe("editing commands", () => {
  it("undoes and redoes transforms without changing source artwork", () => {
    const original = useEditor.getState().document!.assetReferences;
    useEditor.getState().updateLayer(uid(3), { x: 120, rotation: 45 });
    expect(useEditor.getState().document!.layers[0].x).toBe(120);
    useEditor.getState().undo();
    expect(useEditor.getState().document!.layers[0].x).toBe(0);
    useEditor.getState().redo();
    expect(useEditor.getState().document!.layers[0].rotation).toBe(45);
    expect(useEditor.getState().document!.assetReferences).toEqual(original);
  });
  it("updates visibility and order and restores exact structure", () => {
    useEditor.getState().command("add", (d) => {
      d.layers.push({ ...d.layers[0], id: uid(4), name: "B" });
    });
    useEditor.getState().moveOrder(uid(3), 1);
    useEditor.getState().updateLayer(uid(3), { visible: false });
    expect(useEditor.getState().document!.layers[1].visible).toBe(false);
    useEditor.getState().undo();
    useEditor.getState().undo();
    expect(useEditor.getState().document!.layers.map((l) => l.id)).toEqual([
      uid(3),
      uid(4),
    ]);
  });
  it("saves and reloads transforms ordering and metadata", () => {
    useEditor.getState().updateLayer(uid(3), { x: 45, name: "Edited" });
    expect(useEditor.getState().save()).toBe(true);
    expect(map.has(STORAGE_KEY)).toBe(true);
    useEditor.getState().open(fixture());
    expect(useEditor.getState().restore()).toBe(true);
    expect(useEditor.getState().document!.layers[0]).toMatchObject({
      x: 45,
      name: "Edited",
    });
    expect(useEditor.getState().dirty).toBe(false);
  });
  it("rejects invalid commands atomically", () => {
    const before = useEditor.getState().document;
    useEditor.getState().updateLayer(uid(3), { parentId: uid(3) });
    expect(useEditor.getState().document).toBe(before);
    expect(useEditor.getState().past).toHaveLength(0);
    expect(useEditor.getState().error).toBeTruthy();
  });
  it("clears redo after a new command", () => {
    useEditor.getState().updateLayer(uid(3), { x: 1 });
    useEditor.getState().undo();
    useEditor.getState().updateLayer(uid(3), { x: 2 });
    expect(useEditor.getState().future).toHaveLength(0);
  });
  it("reports quota errors and corrupt saved data without destroying them", () => {
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw Error("quota");
      },
      getItem: () => "{bad",
    });
    expect(useEditor.getState().save()).toBe(false);
    expect(useEditor.getState().restore()).toBe(false);
    expect(useEditor.getState().document!.layers).toHaveLength(1);
  });
  it("reparents children on deletion and undo restores hierarchy", () => {
    useEditor.getState().command("child", (d) => {
      d.layers.push({ ...d.layers[0], id: uid(4), parentId: uid(3) });
    });
    useEditor.getState().removeLayer(uid(3));
    expect(useEditor.getState().document!.layers[0].parentId).toBeNull();
    useEditor.getState().undo();
    expect(useEditor.getState().document!.layers[1].parentId).toBe(uid(3));
  });
});
