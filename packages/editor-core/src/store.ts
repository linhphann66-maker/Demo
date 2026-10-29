import {effectAttachments} from '../../vfx-core/src/validation';
import { createSideReferenceClips } from "../../animation-core/src/side-presets";
import {
  pruneCharacterReferences,
  boneInView,
  clipInView,
  activeVariant,
} from "../../document-core/src/character";
import { useAnimation } from "./animation-state";
import { getPreviewDocument } from "./animation-preview";
import {
  recordChanges,
  editPreview,
  setTemporaryPose,
  type EditDomain,
} from "./animation-edit";
import {
  pruneAnimationReferences,
  createClip,
  duplicateClip,
  deleteClip,
  createReferenceClips,
  setKeyframe,
} from "../../animation-core/src";
import {
  removeBone as deleteBone,
  bindLayer,
  solveTwoBone,
  resetPose,
} from "../../rig-core/src";
import {
  prepareHumanoid,
  addBone as createBone,
  editBone,
  prepareReplacement,
} from "./rig-actions";
import type { Bone, Asset } from "../../document-core/src";
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
function reconcileAnimation(doc: ProjectDocument) {
  const state = useAnimation.getState(),
    clip = doc.animationClips.find((c) => c.id === state.activeClipId);
  const keys = new Set(
    doc.keyframeTracks.flatMap((t) => t.keyframes.map((k) => k.id)),
  );
  const time = clip
    ? Math.max(clip.range.start, Math.min(clip.range.end, state.time))
    : 0;
  useAnimation.setState({
    override: null,
    playing: false,
    displayTime: time,
    time,
    elapsed: clip ? time - clip.range.start : 0,
    editVersion: state.editVersion + 1,
    selectedKeys: state.selectedKeys.filter((id) => keys.has(id)),
    selectedTrackId: doc.keyframeTracks.some(
      (t) => t.id === state.selectedTrackId,
    )
      ? state.selectedTrackId
      : null,
    selectedEventId: doc.animationEvents.some(
      (e) => e.id === state.selectedEventId,
    )
      ? state.selectedEventId
      : null,
    activeClipId:
      clip?.id ??
      (state.enabled
        ? (doc.animationClips.find((c) => clipInView(doc, c.id))?.id ?? null)
        : null),
  });
}

export type EditTool = "select" | "bone" | "mesh" | "weight";
type State = {
  editMotion: (
    label: string,
    recipe: (d: ProjectDocument) => void,
    domain: EditDomain,
  ) => void;
  commitPreview: (
    label: string,
    before: ProjectDocument,
    after: ProjectDocument,
    domain: EditDomain,
  ) => void;
  recordPose: () => void;
  createAnimation: () => string | null;
  duplicateAnimation: (id: string) => void;
  deleteAnimation: (id: string) => void;
  addReferenceAnimations: () => Promise<void>;

  tool: EditTool;
  selectedBoneId: string | null;
  selectedVertexId: string | null;
  showBones: boolean;
  showMesh: boolean;
  setTool: (tool: EditTool) => void;
  selectBone: (id: string | null) => void;
  selectVertex: (id: string | null) => void;
  toggleBones: () => void;
  toggleMesh: () => void;
  autoRig: () => Promise<void>;
  addBone: () => void;
  removeBone: (id: string) => void;
  updateBone: (id: string, patch: Partial<Bone>) => void;
  setRigMode: (mode: "rest" | "pose") => void;
  resetPose: () => void;
  bindLayer: (layerId: string, boneId: string | null) => void;
  solveIK: (id: string, x: number, y: number) => void;
  replaceAsset: (layerId: string, asset: Asset) => Promise<void>;

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
  commitPreview: (label, before, after, domain) => {
    const state = useAnimation.getState();
    if (state.enabled && state.activeClipId) {
      if (state.autoKey) {
        get().command("Auto Key · " + label, (d) =>
          recordChanges(
            d,
            before,
            after,
            state.activeClipId!,
            state.time,
            domain,
          ),
        );
      } else setTemporaryPose(after);
    } else
      get().command(label, (d) => {
        Object.assign(d, after);
      });
  },
  editMotion: (label, recipe, domain) => {
    const base = get().document;
    if (!base) return;
    const state = useAnimation.getState();
    if (state.enabled && state.activeClipId) {
      const { before, after } = editPreview(base, recipe);
      get().commitPreview(label, before, after, domain);
    } else get().command(label, recipe);
  },
  recordPose: () => {
    const state = useAnimation.getState(),
      base = get().document;
    if (!base || !state.activeClipId) return;
    const preview = getPreviewDocument(base);
    get().command("Ghi pose vào keyframes", (d) => {
      const boneId = get().selectedBoneId;
      for (const b of preview.bones.filter(
        (b) => boneInView(preview, b.id) && (!boneId || b.id === boneId),
      ))
        for (const property of [
          "x",
          "y",
          "rotation",
          "scaleX",
          "scaleY",
        ] as const)
          setKeyframe(
            d,
            state.activeClipId!,
            b.id,
            ("bone." +
              property) as import("../../document-core/src").AnimationChannel,
            state.time,
            b.pose[property] ?? 1,
          );
    });
  },
  createAnimation: () => {
    let id: string | null = null;
    get().command("Tạo animation", (d) => {
      id = createClip(d).id;
    });
    if (id) {
      get().select(null);
      useAnimation.setState({
        enabled: true,
        activeClipId: id,
        time: 0,
        displayTime: 0,
        playing: false,
        override: null,
        selectedKeys: [],
        selectedEventId: null,
      });
    }
    return id;
  },
  duplicateAnimation: (id) => {
    let next: string | null = null;
    get().command("Nhân đôi animation", (d) => {
      next = duplicateClip(d, id).id;
    });
    if (next)
      useAnimation.setState({
        activeClipId: next,
        time: 0,
        displayTime: 0,
        playing: false,
        override: null,
      });
  },
  deleteAnimation: (id) => {
    get().command("Xóa animation", (d) => deleteClip(d, id));
    if (useAnimation.getState().activeClipId === id)
      useAnimation.setState({
        activeClipId:
          get().document?.animationClips.find((c) =>
            clipInView(get().document!, c.id),
          )?.id ?? null,
        time: 0,
        displayTime: 0,
        playing: false,
        override: null,
        selectedKeys: [],
        selectedEventId: null,
      });
  },
  addReferenceAnimations: async () => {
    const original = get().document;
    if (!original) return;
    try {
      const planned = original.bones.some((b) => boneInView(original, b.id))
        ? structuredClone(original)
        : await prepareHumanoid(original);
      if (planned.characterSettings.characterView === "side_3_4")
        createSideReferenceClips(planned);
      else createReferenceClips(planned);
      if (get().document !== original)
        throw Error("Dự án đã thay đổi; hãy thử lại");
      get().command("Tạo 5 hoạt ảnh mẫu procedural", (d) =>
        Object.assign(d, planned),
      );
      useAnimation.setState({
        enabled: true,
        activeClipId: planned.animationClips.find(
          (c) => clipInView(planned, c.id) && c.name === "Idle",
        )!.id,
        time: 0,
        displayTime: 0,
        playing: false,
      });
    } catch (e) {
      get().setError(String(e));
    }
  },

  tool: "select",
  selectedBoneId: null,
  selectedVertexId: null,
  showBones: false,
  showMesh: false,
  setTool: (tool) =>
    set({
      tool,
      showBones: tool === "bone" ? true : get().showBones,
      showMesh: tool === "mesh" || tool === "weight" ? true : get().showMesh,
    }),
  selectBone: (selectedBoneId) => {
    useAnimation.setState({ selectedKeys: [], selectedEventId: null });
    set({ selectedBoneId, tool: "bone", showBones: true });
  },
  selectVertex: (selectedVertexId) => set({ selectedVertexId }),
  toggleBones: () => set({ showBones: !get().showBones }),
  toggleMesh: () => set({ showMesh: !get().showMesh }),
  autoRig: async () => {
    const original = get().document;
    if (!original) return;
    try {
      const prepared = await prepareHumanoid(original);
      if (get().document !== original)
        throw Error("Dự án đã thay đổi khi tạo rig. Hãy thử lại.");
      get().command("Humanoid Auto Rig · procedural", (d) => {
        Object.assign(d, prepared);
      });
      set({
        showBones: true,
        showMesh: true,
        tool: "bone",
        selectedBoneId: prepared.bones[0].id,
      });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },
  addBone: () => {
    let id: string | null = null;
    get().command("Thêm xương", (d) => {
      id = createBone(d, get().selectedBoneId);
    });
    if (id) get().selectBone(id);
  },
  removeBone: (id) => {
    get().command("Xóa xương", (d) => deleteBone(d, id));
    set({ selectedBoneId: null });
  },
  updateBone: (id, patch) => {
    if (useAnimation.getState().enabled && patch.pose)
      get().editMotion(
        "Chỉnh pose xương",
        (d) => editBone(d, id, patch),
        "bone",
      );
    else get().command("Chỉnh xương", (d) => editBone(d, id, patch));
  },
  setRigMode: (mode) => {
    if (mode === "rest")
      useAnimation.setState({ enabled: false, playing: false, override: null });
    get().command(mode === "rest" ? "Rest Pose" : "Pose Mode", (d) => {
      d.rigSettings.mode = mode;
    });
  },
  resetPose: () =>
    get().command("Reset Pose", (d) => {
      const active = activeVariant(d);
      if (!active) resetPose(d);
      else {
        for (const b of d.bones.filter((b) => active.boneIds.includes(b.id)))
          b.pose = { x: 0, y: 0, rotation: 0 };
        for (const t of d.ikTargets.filter((t) =>
          active.boneIds.includes(t.rootBoneId),
        ))
          t.enabled = false;
      }
    }),
  bindLayer: (layerId, boneId) =>
    get().command("Gắn layer vào xương", (d) => bindLayer(d, layerId, boneId)),
  solveIK: (id, x, y) =>
    get().editMotion(
      "Two-bone IK",
      (d) => {
        solveTwoBone(d, id, { x, y });
      },
      "ik",
    ),
  replaceAsset: async (layerId, asset) => {
    const original = get().document;
    if (!original) return;
    const next = await prepareReplacement(original, layerId, asset);
    if (get().document !== original)
      throw Error("Dự án đã thay đổi. Hãy nhập ảnh lại.");
    get().command("Thay ảnh nguồn", (d) => {
      Object.assign(d, next);
    });
  },

  selectedId: null,
  past: [],
  future: [],
  savedRevision: -1,
  dirty: false,
  error: null,
  setError: (error) => set({ error }),
  select: (selectedId) => {
    useAnimation.setState({ selectedKeys: [], selectedEventId: null });
    set({
      selectedId,
      selectedBoneId: null,
      selectedVertexId: null,
      tool: get().tool === "bone" ? "select" : get().tool,
    });
  },
  open: (input, saved = false) => {
    const document = parseDocument(input);
    useAnimation.getState().reset();
    set({
      document,
      selectedId: null,
      selectedBoneId: null,
      selectedVertexId: null,
      tool: "select",
      showBones: false,
      showMesh: false,
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
        const variant = activeVariant(d);
        if (variant) {
          for (const l of d.layers)
            if (
              !s.document!.layers.some((old) => old.id === l.id) &&
              !d.characterVariants.some((v) => v.layerIds.includes(l.id))
            )
              variant.layerIds.push(l.id);
          for (const b of d.bones)
            if (
              !s.document!.bones.some((old) => old.id === b.id) &&
              !d.characterVariants.some((v) => v.boneIds.includes(b.id))
            ) {
              variant.boneIds.push(b.id);
              if (!variant.rootBoneId && !b.parentId) variant.rootBoneId = b.id;
            }
        }
        syncHierarchy(d);
        const removed =
          s.document!.bones.some((v) => !d.bones.some((x) => x.id === v.id)) ||
          s.document!.layers.some(
            (v) => !d.layers.some((x) => x.id === v.id),
          ) ||
          s.document!.ikTargets.some(
            (v) => !d.ikTargets.some((x) => x.id === v.id),
          ) ||
          s.document!.meshes.some(
            (m) =>
              !d.meshes.some((x) => x.id === m.id) ||
              m.vertices.some(
                (v) =>
                  !d.meshes
                    .find((x) => x.id === m.id)
                    ?.vertices.some((p) => p.id === v.id),
              ),
          );
        if (removed) {
          pruneAnimationReferences(d);
          for(const effect of [...d.vfxGraphs,...(d.vfxPresets??[])]) for(const attachment of effectAttachments(effect))
            if(attachment.boneId&&!d.bones.some(b=>b.id===attachment.boneId)) attachment.boneId=null;
        }
        for(const effect of [...d.vfxGraphs,...(d.vfxPresets??[])])if(effect.trigger){
          if(effect.trigger.clipId&&!d.animationClips.some(c=>c.id===effect.trigger!.clipId)){effect.enabled=false;delete effect.trigger;}
          else if([effect.trigger.startEventId,effect.trigger.stopEventId].some(id=>id&&!d.animationEvents.some(e=>e.id===id))){effect.enabled=false;delete effect.trigger;}
        }
        if(d.characterBuild){d.characterBuild.legacyFaceLayerIds=d.characterBuild.legacyFaceLayerIds?.filter(id=>d.layers.some(l=>l.id===id));d.characterBuild.optionalAttachments=d.characterBuild.optionalAttachments?.filter(a=>!a.layerId||d.layers.some(l=>l.id===a.layerId));const mappings=d.characterBuild.layerMappings.filter(m=>d.layers.some(l=>l.id===m.layerId));if(mappings.length!==d.characterBuild.layerMappings.length){d.characterBuild.layerMappings=mappings;d.characterBuild.approved=false;}}
        pruneCharacterReferences(d);
        for (const clip of d.animationClips) {
          const trackIds = d.keyframeTracks
            .filter((t) => t.clipId === clip.id)
            .map((t) => t.id);
          const eventIds = d.animationEvents
            .filter((e) => e.clipId === clip.id)
            .map((e) => e.id);
          if (
            trackIds.length !== clip.trackIds.length ||
            trackIds.some((id, i) => clip.trackIds[i] !== id)
          )
            clip.trackIds = trackIds;
          if (
            eventIds.length !== clip.eventIds.length ||
            eventIds.some((id, i) => clip.eventIds[i] !== id)
          )
            clip.eventIds = eventIds;
        }
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
      if (useAnimation.getState().enabled) {
        const presentation =
          next.characterSettings !== s.document.characterSettings &&
          next.characterSettings.characterView ===
            s.document.characterSettings.characterView &&
          (Object.keys(next) as (keyof ProjectDocument)[]).every(
            (k) =>
              ["metadata", "revisionHistory", "characterSettings"].includes(
                k,
              ) || next[k] === s.document![k],
          );
        const vfxOnly=(next.vfxGraphs!==s.document.vfxGraphs||next.vfxPresets!==s.document.vfxPresets)&&(Object.keys(next) as (keyof ProjectDocument)[]).every(k=>['metadata','revisionHistory','vfxGraphs','vfxPresets'].includes(k)||next[k]===s.document![k]);
        if (!presentation&&!vfxOnly) reconcileAnimation(next);
        else if (useAnimation.getState().override)
          useAnimation.setState({
            override: {
              ...useAnimation.getState().override!,
              characterSettings: next.characterSettings,
            },
          });
      }
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Thao tác không hợp lệ" });
    }
  },
  updateLayer: (id, patch) => {
    const structural = Object.keys(patch).some(
      (k) =>
        ![
          "x",
          "y",
          "rotation",
          "scaleX",
          "scaleY",
          "opacity",
          "visible",
        ].includes(k),
    );
    if (structural) {
      get().command("Chỉnh thuộc tính lớp", (d) => {
        const l = d.layers.find((l) => l.id === id);
        if (l) Object.assign(l, patch);
      });
      return;
    }
    get().editMotion(
      "Chỉnh sửa lớp",
      (d) => {
        const l = d.layers.find((l) => l.id === id);
        if (l) Object.assign(l, patch);
      },
      "layer",
    );
  },
  undo: () => {
    const s = get();
    const entry = s.past.at(-1);
    if (!entry || !s.document) return;
    useAnimation.setState({
      override: null,
      playing: false,
      editVersion: useAnimation.getState().editVersion + 1,
    });
    set({
      document: entry.document,
      past: s.past.slice(0, -1),
      future: [...s.future, { document: s.document, label: entry.label }],
      dirty: true,
    });
    reconcileAnimation(entry.document);
  },
  redo: () => {
    const s = get();
    const entry = s.future.at(-1);
    if (!entry || !s.document) return;
    useAnimation.setState({
      override: null,
      playing: false,
      editVersion: useAnimation.getState().editVersion + 1,
    });
    set({
      document: entry.document,
      future: s.future.slice(0, -1),
      past: [...s.past, { document: s.document, label: entry.label }],
      dirty: true,
    });
    reconcileAnimation(entry.document);
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
      const removedMeshes = new Set(
        d.meshes.filter((m) => m.layerId === id).map((m) => m.id),
      );
      d.meshes = d.meshes.filter((m) => m.layerId !== id);
      d.vertexWeights = d.vertexWeights.filter(
        (w) => !removedMeshes.has(w.meshId),
      );
      d.attachments = d.attachments.filter((a) => a.layerId !== id);
      for (const c of d.layers)
        if (c.parentId === id) c.parentId = l?.parentId ?? null;
    });
    get().select(null);
  },
}));
