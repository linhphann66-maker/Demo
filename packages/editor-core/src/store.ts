import { create } from "zustand";
import { produce } from "immer";
import {
  parseDocument,
  syncHierarchy,
  type ProjectDocument,
  type Layer,
} from "../../document-core/src";
export const STORAGE_KEY = "a2dstudio.project.v1";
type Entry = { document: ProjectDocument; label: string };
type State = {
  document: ProjectDocument | null;
  selectedId: string | null;
  past: Entry[];
  future: Entry[];
  savedRevision: number;
  dirty: boolean;
  error: string | null;
  setError: (e: string | null) => void;
  open: (d: ProjectDocument, saved?: boolean) => void;
  select: (id: string | null) => void;
  command: (label: string, recipe: (d: ProjectDocument) => void) => void;
  updateLayer: (id: string, patch: Partial<Layer>) => void;
  undo: () => void;
  redo: () => void;
  save: () => boolean;
  restore: () => boolean;
  moveOrder: (id: string, delta: number) => void;
  removeLayer: (id: string) => void;
};
export const useEditor = create<State>((set, get) => ({
  document: null,
  selectedId: null,
  past: [],
  future: [],
  savedRevision: -1,
  dirty: false,
  error: null,
  setError: (error) => set({ error }),
  select: (selectedId) => set({ selectedId }),
  open: (input, saved = false) => {
    const document = parseDocument(input);
    set({
      document,
      selectedId: null,
      past: [],
      future: [],
      savedRevision: saved ? document.metadata.revision : -1,
      dirty: !saved,
      error: null,
    });
  },
  command: (label, recipe) => {
    const s = get();
    if (!s.document) return;
    try {
      const next = produce(s.document, (d) => {
        recipe(d);
        syncHierarchy(d);
        d.metadata.revision++;
        d.metadata.updatedAt = new Date().toISOString();
        d.revisionHistory.push({
          id: crypto.randomUUID(),
          at: d.metadata.updatedAt,
          label,
        });
        d.revisionHistory = d.revisionHistory.slice(-100);
      });
      parseDocument(next);
      set({
        document: next,
        past: [...s.past, { document: s.document, label }].slice(-80),
        future: [],
        dirty: true,
        error: null,
      });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Thao tác không hợp lệ" });
    }
  },
  updateLayer: (id, patch) =>
    get().command("Chỉnh sửa lớp", (d) => {
      const l = d.layers.find((l) => l.id === id);
      if (l) Object.assign(l, patch);
    }),
  undo: () => {
    const s = get();
    const entry = s.past.at(-1);
    if (!entry || !s.document) return;
    set({
      document: entry.document,
      past: s.past.slice(0, -1),
      future: [...s.future, { document: s.document, label: entry.label }],
      dirty: true,
    });
  },
  redo: () => {
    const s = get();
    const entry = s.future.at(-1);
    if (!entry || !s.document) return;
    set({
      document: entry.document,
      future: s.future.slice(0, -1),
      past: [...s.past, { document: s.document, label: entry.label }],
      dirty: true,
    });
  },
  save: () => {
    const d = get().document;
    if (!d) return false;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parseDocument(d)));
      set({ savedRevision: d.metadata.revision, dirty: false, error: null });
      return true;
    } catch {
      set({
        error:
          "Không thể lưu: bộ nhớ trình duyệt đã đầy hoặc bị khóa. Hãy xuất tệp dự án.",
      });
      return false;
    }
  },
  restore: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      get().open(parseDocument(JSON.parse(raw)), true);
      return true;
    } catch {
      set({
        error:
          "Không thể khôi phục dữ liệu đã lưu. Bản lưu được giữ nguyên; bạn có thể mở tệp dự án khác.",
      });
      return false;
    }
  },
  moveOrder: (id, delta) =>
    get().command("Thứ tự lớp", (d) => {
      const i = d.layers.findIndex((l) => l.id === id);
      const target = i + delta;
      if (i >= 0 && target >= 0 && target < d.layers.length) {
        const [l] = d.layers.splice(i, 1);
        d.layers.splice(target, 0, l);
      }
    }),
  removeLayer: (id) => {
    get().command("Xóa lớp", (d) => {
      const l = d.layers.find((l) => l.id === id);
      d.layers = d.layers.filter((l) => l.id !== id);
      for (const c of d.layers)
        if (c.parentId === id) c.parentId = l?.parentId ?? null;
    });
    get().select(null);
  },
}));
