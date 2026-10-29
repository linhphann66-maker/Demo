import { useEditor } from "../../../packages/editor-core/src/store";
import { useAnimation } from "../../../packages/editor-core/src/animation-state";
import { getPreviewDocument } from "../../../packages/editor-core/src/animation-preview";
export function useEditingDocument() {
  const source = useEditor((s) => s.document)!;
  useAnimation((s) => s.displayTime);
  useAnimation((s) => s.editVersion);
  useAnimation((s) => s.enabled);
  return getPreviewDocument(source);
}
