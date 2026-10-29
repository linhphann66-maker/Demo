import {
  parseDocument,
  serialize,
  type ProjectDocument,
} from "../../document-core/src";
import { STORAGE_KEY, useEditor } from "./store";
export const BUILDER_BACKUP_KEY = "a2dstudio.builder.previous";
export function builderBackup(
  storage: Pick<Storage, "getItem">,
): ProjectDocument | null {
  try {
    const raw = storage.getItem(BUILDER_BACKUP_KEY);
    return raw ? parseDocument(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}
/** Validate both documents before writes. Failure never replaces the active editor. */
export function saveBuilderProject(
  next: ProjectDocument,
  previous: ProjectDocument,
  storage: Pick<Storage, "getItem" | "setItem">,
) {
  const valid = parseDocument(next),
    backup = serialize(parseDocument(previous));
  storage.setItem(BUILDER_BACKUP_KEY, backup);
  storage.setItem(STORAGE_KEY, serialize(valid));
  useEditor.getState().open(valid, true);
}
export function restoreBuilderProject(
  storage: Pick<Storage, "getItem" | "setItem">,
) {
  const previous = builderBackup(storage),
    editor = useEditor.getState();
  if (!previous || !editor.document) return false;
  const current = serialize(editor.document);
  storage.setItem(STORAGE_KEY, serialize(previous));
  storage.setItem(BUILDER_BACKUP_KEY, current);
  // Restoring is an ordinary history entry, preserving both complete documents.
  editor.command("Khôi phục dự án trước Builder", (d) => {
    // A previous project may lack optional fields (characterBuild, presets…).
    // Remove those fields too; a shallow merge can leave dangling source IDs.
    for (const key of Object.keys(d)) Reflect.deleteProperty(d, key);
    Object.assign(d, previous);
  });
  if (useEditor.getState().error) throw Error(useEditor.getState().error!);
  return true;
}
