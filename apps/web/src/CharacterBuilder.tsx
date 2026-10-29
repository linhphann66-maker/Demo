import { BuilderReview } from "./BuilderReview";
import { AISettings } from "./AISettings";
import { aiSettings, analyzeWithGemini } from "./ai-client";
import { geminiInput } from "./gemini-input";
import {
  validateAIAnalysis,
  type AISettings as GeminiSettings,
} from "../../../packages/ai-contracts/src/gemini";
import { applyGeminiAnalysis } from "../../../packages/character-builder/src/gemini";
import {
  builderBackup,
  saveBuilderProject,
  restoreBuilderProject,
} from "../../../packages/editor-core/src/builder-backup";
import {
  ensureAssembly,
  candidateAnchors,
  setAnchor,
} from "../../../packages/character-builder/src/layout";
import type { PartSlot, AnchorName } from "../../../packages/document-core/src";
import { refreshBuilderSegments } from "../../../packages/character-builder/src/joint-segments";
import { BuilderModelPanel } from "./BuilderModelPanel";
import { builderProviderStatus, requestBuilderModel } from "./builder-provider";
import {
  providerDetection,
  generatedVariant,
  applyClassification,
  candidateWorldPoint,
} from "../../../packages/character-builder/src/model-results";
import type {
  BuilderProviderStatus,
  BuilderCapability,
  BuilderModelResult,
} from "../../../packages/character-builder/src/provider";
import {
  boneMatrices,
  inverse,
  transform,
} from "../../../packages/rig-core/src";
import {
  alphaOf,
  completionTexture,
} from "../../../packages/mesh-core/src/joint-completion";
import { validateRaster } from "../../../packages/exporters/src";
import { rasterDimensions } from "../../../packages/exporters/src/raster-header";
import * as Dialog from "@radix-ui/react-dialog";
import { useRef, useState, useEffect } from "react";
import { useEditor } from "../../../packages/editor-core/src/store";
import {
  parseDocument,
  worldMatrix,
  primarySlots,
  type ProjectDocument,
  type Asset,
  type CharacterBuild,
  type PartCandidate,
} from "../../../packages/document-core/src";
import {
  importRaster,
  packageProject,
  download,
} from "../../../packages/exporters/src";
import {
  detectAssets,
  extractCandidate,
  combineCandidates,
  splitCandidate,
} from "../../../packages/character-builder/src/images";
import { recommend } from "../../../packages/character-builder/src/detect";
import {
  emptyBuild,
  assemble,
  rigAssembly,
  meshAssembly,
  validateAssembly,
  addBuilderAnimations,
  slotTitles,
  poseBuilderJoint,
} from "../../../packages/character-builder/src/assembly";
import { prepareJointEdit } from "../../../packages/mesh-core/src/joint-completion";
import { solveTwoBone } from "../../../packages/rig-core/src";
import { BuilderPreview } from "./BuilderPreview";
import { BuilderMaskEditor } from "./BuilderMaskEditor";
const steps = [
  "Tải ảnh",
  "Phát hiện",
  "Duyệt 7 phần",
  "Lắp ráp",
  "Rig",
  "Mesh / Khớp",
  "Hoàn tất",
];
type Draft = {
  doc: ProjectDocument;
  stage: "parts" | "assembly" | "rig" | "mesh" | "validated";
};
const clone = (d: Draft): Draft => {
  const n = structuredClone(d);
  n.doc.assetReferences.forEach((a) => {
    const old = d.doc.assetReferences.find((o) => o.id === a.id);
    if (old) a.data = old.data;
  });
  return n;
};
function clearGenerated(doc: ProjectDocument, keepLayers = false) {
  const b = doc.characterBuild!;
  doc.assetReferences = doc.assetReferences.filter(
    (a) =>
      b.sourceAssetIds.includes(a.id) ||
      b.candidates.some((c) => c.previewAssetId === a.id),
  );
  doc.layers = keepLayers
    ? doc.layers.filter(
        (l) =>
          b.layerMappings.some((m) => m.layerId === l.id) ||
          (b.optionalAttachments ?? []).some((a) => a.layerId === l.id) ||
          (b.legacyFaceLayerIds ?? []).includes(l.id),
      )
    : [];
  doc.hierarchy = doc.layers.map((l) => ({
    layerId: l.id,
    parentId: l.parentId,
  }));
  if (!keepLayers) {
    b.layerMappings = [];
    b.legacyFaceLayerIds = [];
    for (const a of b.optionalAttachments ?? []) a.layerId = null;
  }
  doc.skeletons = [];
  doc.bones = [];
  doc.meshes = [];
  doc.vertexWeights = [];
  doc.ikTargets = [];
  doc.equipmentSlots = [];
  doc.attachments = [];
  doc.characterParts = [];
  doc.characterJoints = [];
  doc.characterVariants = [];
  doc.animationClips = [];
  doc.keyframeTracks = [];
  doc.animationEvents = [];
  doc.jointValidation = null;
  doc.rigSettings.mode = "rest";
}
export function CharacterBuilder({ onClose }: { onClose: () => void }) {
  const editor = useEditor(),
    original = useRef(editor.document!),
    base = original.current,
    [mode, setMode] = useState<"sheet" | "layers" | "complete">("sheet"),
    [sources, setSources] = useState<Asset[]>([]),
    [name, setName] = useState("Imported adventurer"),
    [draft, setDraft] = useState<Draft | null>(null),
    ref = useRef<Draft | null>(null),
    [past, setPast] = useState<Draft[]>([]),
    [future, setFuture] = useState<Draft[]>([]),
    [step, setStep] = useState(0),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [advanced, setAdvanced] = useState(false),
    [maskEditing, setMaskEditing] = useState(false),
    [tolerance, setTolerance] = useState(24),
    [selected, setSelected] = useState<string | null>(null),
    [checks, setChecks] = useState<string[]>([]),
    [layerId, setLayerId] = useState<string | null>(null),
    [boneId, setBoneId] = useState<string | null>(null),
    [approved, setApproved] = useState(false),
    [rightFacing, setRightFacing] = useState(false),
    controller = useRef<AbortController | null>(null),
    epoch = useRef(0);
  const [gemini, setGemini] = useState<GeminiSettings | null>(null),
    [geminiError, setGeminiError] = useState(""),
    [geminiOpen, setGeminiOpen] = useState(false),
    [geminiConsent, setGeminiConsent] = useState(false),
    [hasBackup] = useState(() => !!builderBackup(localStorage));
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      void aiSettings()
        .then((s) => {
          if (alive) {
            setGemini(s);
            setGeminiError("");
          }
        })
        .catch(() => {
          if (alive)
            setGeminiError(
              "Backend Gemini chưa kết nối. Mở Cài đặt AI để kiểm tra.",
            );
        });
    };
    refresh();
    window.addEventListener("a2d-ai-settings", refresh);
    return () => {
      alive = false;
      window.removeEventListener("a2d-ai-settings", refresh);
    };
  }, []);
  const [provider, setProvider] = useState<BuilderProviderStatus>({
      configured: false,
      ready: false,
      capabilities: [],
      providerId: null,
      model: null,
      reason: "Đang kiểm tra API/provider",
    }),
    [consent, setConsent] = useState(false);
  useEffect(() => {
    let alive = true;
    void builderProviderStatus().then((status) => {
      if (alive) setProvider(status);
    });
    return () => {
      alive = false;
    };
  }, []);
  const set = (next: Draft | null) => {
    ref.current = next;
    setDraft(next);
  };
  const commit = (next: Draft, label: string, fresh = false) => {
    next.doc.metadata.revision++;
    if (fresh && next.doc.jointValidation)
      next.doc.jointValidation.sourceRevision = next.doc.metadata.revision;
    next.doc.revisionHistory.push({
      id: crypto.randomUUID(),
      label,
      at: new Date().toISOString(),
    });
    next.doc.revisionHistory = next.doc.revisionHistory.slice(-100);
    next.doc = parseDocument(next.doc);
    if (ref.current) setPast((p) => [...p, ref.current!].slice(-12));
    setFuture([]);
    set(next);
    setApproved(false);
  };
  const mutate = (label: string, fn: (d: Draft) => void) => {
    if (!ref.current || busy) return;
    try {
      const next = clone(ref.current);
      fn(next);
      commit(next, label);
    } catch (e) {
      setError(String(e));
    }
  };
  const run = async (
    task: (
      signal: AbortSignal,
      update: (p: number, label: string) => void,
    ) => Promise<void>,
  ) => {
    const token = ++epoch.current,
      c = new AbortController();
    controller.current = c;
    setBusy(true);
    setError("");
    try {
      await task(c.signal, (p, label) => {
        if (token === epoch.current) {
          setProgress(p);
          setStatus(label);
        }
      });
    } catch (e) {
      if (token === epoch.current)
        setError(
          c.signal.aborted ? "Đã hủy; bản nháp trước vẫn được giữ." : String(e),
        );
    } finally {
      if (token === epoch.current) {
        setBusy(false);
        controller.current = null;
      }
    }
  };
  const upload = (files: FileList | File[]) =>
    run(async (signal, update) => {
      const list = Array.from(files);
      if (!list.length) return;
      if (
        list.length > 16 ||
        list.reduce((n, f) => n + f.size, 0) > 8 * 1024 * 1024
      )
        throw Error("Tối đa 16 ảnh và 8 MiB tổng upload.");
      if (mode !== "layers" && list.length !== 1)
        throw Error("Chế độ sheet/ảnh hoàn chỉnh dùng đúng một file.");
      const assets: Asset[] = [];
      let pixels = 0;
      for (let i = 0; i < list.length; i++) {
        if (signal.aborted) throw new DOMException("Hủy", "AbortError");
        const bytes = new Uint8Array(await list[i].arrayBuffer());
        let raw = "";
        for (let n = 0; n < bytes.length; n += 8192)
          raw += String.fromCharCode(...bytes.subarray(n, n + 8192));
        const size = rasterDimensions(raw);
        pixels += size.width * size.height;
        if (pixels > 32 * 1024 * 1024)
          throw Error("Tổng ảnh vượt 32 megapixel");
        assets.push(await importRaster(list[i]));
        update((i + 1) / list.length, "Đã kiểm tra ảnh " + (i + 1));
      }
      if (signal.aborted) return;
      setSources(assets);
      set(null);
      setPast([]);
      setFuture([]);
      setStep(0);
      setApproved(false);
    });

  const pipeline = async (
    input: Draft,
    signal: AbortSignal,
    update: (p: number, label: string) => void,
  ) => {
    const next = clone(input);
    if (next.stage === "parts") {
      update(0.05, "Đang ghép 7 phần");
      next.doc = assemble(next.doc);
      next.stage = "assembly";
    }
    if (signal.aborted) throw new DOMException("Hủy", "AbortError");
    if (next.stage === "assembly") {
      update(0.2, "Tạo rig từ landmark/alpha của các part");
      next.doc = rigAssembly(next.doc);
      next.stage = "rig";
    }
    if (next.stage === "rig") {
      next.doc = await meshAssembly(next.doc, signal, (p, label) =>
        update(0.25 + p * 0.6, label),
      );
      next.stage = "mesh";
    }
    if (signal.aborted) throw new DOMException("Hủy", "AbortError");
    update(0.9, "Pose sweep 0/20/45/70/90/120°");
    next.doc = addBuilderAnimations(next.doc);
    next.doc = validateAssembly(next.doc);
    next.stage = "validated";
    if (signal.aborted) throw new DOMException("Hủy", "AbortError");
    commit(next, "Auto Character Builder · procedural", true);
    setStep(5);
    update(
      1,
      "Bản nháp đã có rig, mesh, clips và báo cáo. Cần người dùng duyệt.",
    );
  };
  const automatic = (useGemini = false) =>
    void run(async (signal, update) => {
      if (
        mode === "complete" &&
        (!provider.ready || !provider.capabilities.includes("segmentation"))
      )
        throw Error(
          provider.reason ?? "Segmentation provider thật chưa khả dụng",
        );
      if (!sources.length) throw Error("Chọn ảnh trước");
      setStep(1);
      let model: { result: BuilderModelResult; jobId: string } | null = null;
      if (mode === "complete")
        model = await requestBuilderModel(
          "segmentation",
          sources,
          [],
          consent,
          signal,
          (p, label) => update(p * 0.3, label),
        );
      const detected = model
        ? await providerDetection(sources, model.result, model.jobId)
        : await detectAssets(
            sources,
            mode as "sheet" | "layers",
            tolerance,
            signal,
            (p, label) => update(p * 0.4, label),
          );
      const build: CharacterBuild = {
        version: 2,
        id: crypto.randomUUID(),
        mode,
        sourceAssetIds: sources.map((a) => a.id),
        candidates: detected.candidates,
        selection: detected.selection,
        layerMappings: [],
        method: model ? "provider" : "procedural",
        provider: model
          ? { id: model.result.providerId, model: model.result.model }
          : null,
        warnings: [
          model
            ? "Mask và nhãn từ provider; cần duyệt trước khi lưu."
            : "Phân loại heuristic; không có model semantic đang chạy.",
          "Hướng và các phần bị che khuất cần người dùng xác nhận.",
        ],
        approved: false,
        optionalAttachments: detected.candidates
          .filter((c) => c.label === "unknown" && !c.rejected)
          .flatMap((c) => {
            const filename =
              detected.assets.find((a) => a.id === c.sourceAssetId)?.name ?? "";
            const kind = /cloak|cape|ao.?choang/i.test(filename)
              ? ("cloak" as const)
              : /sword|weapon|kiem/i.test(filename)
                ? ("sword" as const)
                : null;
            return kind ? [{ kind, candidateId: c.id, layerId: null }] : [];
          })
          .filter((v, i, arr) => arr.findIndex((a) => a.kind === v.kind) === i),
      };
      const next: Draft = {
        doc: emptyBuild(base, detected.assets, build, name),
        stage: "parts",
      };
      if (useGemini) {
        if (!geminiConsent)
          throw Error(
            "Cần đồng ý gửi ảnh tới Gemini; thao tác có thể phát sinh phí API.",
          );
        const input = await geminiInput(next.doc);
        const output = await analyzeWithGemini(input, signal, (p, label) =>
          update(0.45 + p * 0.5, label),
        );
        applyGeminiAnalysis(
          next.doc,
          validateAIAnalysis(output.analysis, input),
          output.model,
          output.jobId,
        );
      }
      if (signal.aborted) return;
      commit(next, "Phát hiện và trích alpha");
      setSelected(detected.candidates[0]?.id ?? null);
      setStep(2);
      update(1, "Đã chuẩn bị ảnh. Duyệt 7 phần rồi bấm Lắp thử.");
    });
  const recognizeAgain = () =>
    void run(async (signal, update) => {
      if (!ref.current) throw Error("Tải và trích ảnh trước");
      if (!geminiConsent) throw Error("Cần đồng ý gửi ảnh tới Gemini.");
      const original = ref.current,
        next = clone(original),
        input = await geminiInput(next.doc);
      const output = await analyzeWithGemini(input, signal, update);
      if (signal.aborted) return;
      if (ref.current !== original)
        throw Error("Bản nháp đã thay đổi; phân tích lại trước khi áp dụng.");
      clearGenerated(next.doc);
      next.stage = "parts";
      applyGeminiAnalysis(
        next.doc,
        validateAIAnalysis(output.analysis, input),
        output.model,
        output.jobId,
      );
      commit(next, "Gemini · nhận diện 7 phần");
      setStep(2);
      update(1, "Đã nhận gợi ý Gemini. Chỉ cần xác nhận các phần có cảnh báo.");
    });
  const updateCandidate = async (c: PartCandidate) => {
    if (!ref.current) return;
    const original = ref.current;
    await run(async (signal, update) => {
      const next = clone(original),
        source = next.doc.assetReferences.find(
          (a) => a.id === c.sourceAssetId,
        )!;
      update(0.2, "Đang tạo lại PNG alpha");
      const asset = await extractCandidate(source, c);
      if (signal.aborted) return;
      if (ref.current !== original) throw Error("Bản nháp đã thay đổi");
      next.doc.assetReferences = next.doc.assetReferences.map((a) =>
        a.id === asset.id ? asset : a,
      );
      next.doc.characterBuild!.candidates =
        next.doc.characterBuild!.candidates.map((old) =>
          old.id === c.id ? c : old,
        );
      clearGenerated(next.doc);
      next.stage = "parts";
      commit(next, "Chỉnh alpha mask/candidate");
      update(1, "Mask đã cập nhật. Lắp/rig lại từ bản duyệt khi sẵn sàng.");
    });
  };
  const applyModel = async (
    cap: BuilderCapability,
    result: BuilderModelResult,
    jobId: string,
    candidateId: string | undefined,
    revision: number,
  ) => {
    const original = ref.current;
    if (!original || original.doc.metadata.revision !== revision)
      throw Error("Bản nháp đã thay đổi; yêu cầu lại model trước khi áp dụng");
    const next = clone(original),
      b = next.doc.characterBuild!,
      target = b.candidates.find((c) => c.id === candidateId);
    if (cap === "classification") {
      applyClassification(b, result, jobId);
      clearGenerated(next.doc);
      next.stage = "parts";
    } else if (cap === "inpainting" || cap === "background_removal") {
      if (!target || !result.image) throw Error("Chọn candidate đích");
      await validateRaster(result.image.data, result.image);
      const variant = await generatedVariant(next.doc, target, result, jobId);
      next.doc.assetReferences.push(variant.source, variant.preview);
      b.sourceAssetIds.push(variant.source.id);
      b.candidates.push(variant.part);
      for (const slot of primarySlots)
        if (b.selection[slot] === target.id)
          b.selection[slot] = variant.part.id;
      clearGenerated(next.doc);
      next.stage = "parts";
      setSelected(variant.part.id);
    } else if (cap === "segmentation") {
      const sources = next.doc.assetReferences.filter((a) =>
        b.sourceAssetIds.includes(a.id),
      );
      const detected = await providerDetection(sources, result, jobId);
      next.doc.assetReferences.push(
        ...detected.assets.filter((a) => !sources.some((s) => s.id === a.id)),
      );
      b.candidates.push(...detected.candidates);
      b.selection = recommend(b.candidates);
      b.provider = { id: result.providerId, model: result.model };
      b.method = "provider";
      clearGenerated(next.doc);
      next.stage = "parts";
    } else if (cap === "assembly") {
      clearGenerated(next.doc);
      for (const p of result.assembly) {
        if (!b.candidates.some((c) => c.id === p.candidateId && !c.rejected))
          throw Error("Assembly candidate invalid");
        b.selection[p.slot] = p.candidateId;
      }
      next.doc = assemble(next.doc);
      for (const p of result.assembly) {
        const layer = next.doc.layers.find(
          (l) =>
            l.id ===
            next.doc.characterBuild!.layerMappings.find(
              (m) => m.candidateId === p.candidateId,
            )?.layerId,
        );
        if (layer) {
          layer.x = p.x;
          layer.y = p.y;
          layer.rotation = p.rotation;
          layer.scaleX = layer.scaleY = p.scale;
        }
      }
      next.stage = "assembly";
    } else if (cap === "landmarks") {
      next.doc.rigSettings.mode = "rest";
      if (!target || !next.doc.bones.length)
        throw Error("Cần chọn part đã Assembly/rig");
      for (const point of result.landmarks) {
        const bone = next.doc.bones.find((b) => b.name === point.name);
        if (!bone)
          throw Error(
            "Landmark cần tên bone semantic chính xác: " + point.name,
          );
        const world = candidateWorldPoint(next.doc, target.id, point),
          parent = bone.parentId
            ? boneMatrices(next.doc, "rest").get(bone.parentId)
            : null,
          local = parent ? transform(inverse(parent), world) : world;
        bone.rest.x = local.x;
        bone.rest.y = local.y;
      }
      const keep = new Set(b.layerMappings.map((m) => m.layerId));
      next.doc.layers = next.doc.layers.filter((l) => keep.has(l.id));
      next.doc.attachments = next.doc.attachments.filter((a) =>
        keep.has(a.layerId),
      );
      next.doc.meshes = [];
      next.doc.vertexWeights = [];
      next.doc.characterParts = [];
      next.doc.characterJoints = [];
      next.doc.jointValidation = null;
      next.doc.animationClips = [];
      next.doc.keyframeTracks = [];
      next.doc.animationEvents = [];
      next.doc.hierarchy = next.doc.layers.map((l) => ({
        layerId: l.id,
        parentId: l.parentId,
      }));
      next.stage = "rig";
    }
    if (ref.current !== original) throw Error("Bản nháp đã thay đổi");
    commit(next, "Áp dụng model được duyệt · " + cap);
    setStep(next.stage === "parts" ? 2 : next.stage === "assembly" ? 3 : 4);
  };
  const b = draft?.doc.characterBuild,
    candidate = b?.candidates.find((c) => c.id === selected),
    chosenLayer = draft?.doc.layers.find((l) => l.id === layerId),
    chosenBone = draft?.doc.bones.find((b) => b.id === boneId);
  const missing = b
    ? primarySlots.filter((slot) => !b.selection[slot])
    : [...primarySlots];
  const selectedCount = primarySlots.length - missing.length;
  const uncertain = (b?.aiReview?.needsReviewCandidateIds ?? []).filter((id) =>
    Object.values(b?.selection ?? {}).includes(id),
  );
  const focusSlot = (slot: (typeof primarySlots)[number]) => {
    setStep(2);
    requestAnimationFrame(() => {
      const input = document.getElementById("builder-slot-" + slot);
      input?.scrollIntoView({ block: "nearest" });
      input?.focus({ preventScroll: true });
    });
  };
  const canVisit = (target: number) => {
    if (target <= 1) return true;
    if (!draft) return false;
    if (target === 2) return true;
    if (target === 3) return selectedCount > 0;
    if (target === 4 || target === 5)
      return missing.length === 0 && uncertain.length === 0;
    return (
      missing.length === 0 &&
      uncertain.length === 0 &&
      draft.doc.bones.length > 0 &&
      draft.doc.meshes.length > 0
    );
  };
  const navigate = (target: number) => {
    if (busy) return;
    if (!canVisit(target)) {
      if (missing.length) {
        setError("Còn thiếu: " + missing.map((s) => slotTitles[s]).join(", "));
        focusSlot(missing[0]);
      }
      return;
    }
    setError("");
    if (target === 3 && ref.current?.stage === "parts") {
      mutate("Ghép các phần đã chọn", (d) => {
        d.doc = assemble(d.doc, { allowPartial: true });
        d.stage = "assembly";
      });
      if (ref.current?.doc.layers.length) {
        setStep(3);
        setStatus(
          missing.length
            ? "Đã ghép thử " +
                selectedCount +
                " phần. Bổ sung phần thiếu trước khi tạo rig."
            : "Đã ghép đủ 7 phần; chỉnh vị trí hoặc tiếp tục tạo rig.",
        );
      }
      return;
    }
    if (target === 4 && !ref.current?.doc.bones.length) {
      mutate("Ghép và tạo bộ xương", (d) => {
        if (d.stage === "parts") d.doc = assemble(d.doc);
        d.doc = rigAssembly(d.doc);
        d.stage = "rig";
      });
      if (ref.current?.doc.bones.length) {
        setStep(4);
        setStatus("Bộ xương đã tạo. Có thể chỉnh khớp rồi tạo mesh.");
      }
      return;
    }
    if (target === 5 && !ref.current?.doc.meshes.length) {
      void run((signal, update) => pipeline(ref.current!, signal, update));
      return;
    }
    setStep(target);
  };
  useEffect(() => {
    if (busy || !draft || step < 3) return;
    if (!draft.doc.layers.length) setStep(2);
    else if (step >= 4 && (missing.length > 0 || !draft.doc.bones.length))
      setStep(3);
    else if (step >= 5 && !draft.doc.meshes.length) setStep(4);
  }, [busy, draft, step, missing.length]);
  const chooseSlot = (slot: PartSlot, value: string | null) =>
    mutate("Chọn " + slotTitles[slot], (d) => {
      const build = d.doc.characterBuild!;
      if (value && build.aiReview)
        build.aiReview.needsReviewCandidateIds =
          build.aiReview.needsReviewCandidateIds.filter((id) => id !== value);
      for (const key of primarySlots)
        if (build.selection[key] === value) build.selection[key] = null;
      build.selection[slot] = value;
      const candidate = build.candidates.find((c) => c.id === value);
      if (candidate) {
        candidate.label = slot;
        candidate.confidence = 1;
        candidate.method = "manual";
      }
      build.optionalAttachments = build.optionalAttachments?.filter(
        (a) => a.candidateId !== value,
      );
      clearGenerated(d.doc);
      d.stage = "parts";
    });
  const layoutAction = (
    label: string,
    change: (doc: ProjectDocument) => void,
  ) =>
    mutate(label, (d) => {
      change(d.doc);
      clearGenerated(d.doc);
      if (Object.values(d.doc.characterBuild!.selection).some(Boolean)) {
        d.doc = assemble(d.doc, { allowPartial: true });
        d.stage = "assembly";
        setStep(3);
      } else d.stage = "parts";
    });
  const editJoint = (
    jointId: string,
    patch: Parameters<typeof prepareJointEdit>[2],
    repair = false,
  ) =>
    void run(async (signal, update) => {
      const original = ref.current!;
      const doc = await prepareJointEdit(original.doc, jointId, patch, repair);
      const joint = doc.characterJoints.find((j) => j.id === jointId)!;
      await refreshBuilderSegments(doc, joint);
      if (["shoulder", "hip"].includes(joint.kind)) {
        const main = doc.layers.find(
          (l) =>
            joint.layerIds.includes(l.id) &&
            doc.characterBuild!.layerMappings.some((m) => m.layerId === l.id),
        )!;
        const position = boneMatrices(doc, "rest").get(joint.lowerBoneId)!;
        const center = transform(inverse(worldMatrix(doc, main)), {
          x: position.tx,
          y: position.ty,
        });
        for (const part of doc.characterParts.filter(
          (p) =>
            p.jointId === jointId &&
            (p.role === "underlap" || p.semantic === "joint_cover"),
        )) {
          const asset = doc.assetReferences.find(
            (a) => a.id === part.sourceAssetId,
          )!;
          asset.data = await completionTexture(
            doc,
            main.assetId,
            center,
            Math.min(60, joint.radius * 0.6 + joint.underlapSize),
          );
          part.alphaMask = await alphaOf(asset.data);
        }
      }
      if (signal.aborted) return;
      const next = { ...clone(original), doc: validateAssembly(doc) };
      commit(
        next,
        repair ? "Procedural joint repair" : "Chỉnh joint deformation",
        true,
      );
      update(1, "Đã cập nhật cover/weights bằng procedural; có thể Undo.");
    });
  const cancel = () => controller.current?.abort();
  const close = () => {
    epoch.current++;
    controller.current?.abort();
    onClose();
  };
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="builder-backdrop" />
        <Dialog.Content
          className="builder-window"
          aria-label="Tự động tạo nhân vật"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => {
            if (busy) e.preventDefault();
          }}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <header>
            <Dialog.Title asChild>
              <h2>Tự động tạo nhân vật</h2>
            </Dialog.Title>
            <button onClick={close}>Đóng · giữ dự án hiện tại</button>
          </header>
          <Dialog.Description>
            Tải ảnh → Duyệt 7 phần → Chuẩn hóa → Lắp ráp → Rig → Mesh/Khớp. Gợi
            ý cục bộ cần được bạn kiểm tra trước khi ghép.
          </Dialog.Description>
          <nav>
            {steps.map((label, i) => (
              <button
                key={label}
                className={step === i ? "active" : ""}
                disabled={busy || !canVisit(i)}
                onClick={() => navigate(i)}
              >
                {i + 1}. {label}
              </button>
            ))}
          </nav>
          <div className="builder-toolbar">
            <button
              disabled={!past.length || busy}
              onClick={() => {
                setFuture((f) => [ref.current!, ...f]);
                const p = [...past],
                  last = p.pop()!;
                setPast(p);
                set(last);
              }}
            >
              Undo Builder
            </button>
            <button
              disabled={!future.length || busy}
              onClick={() => {
                setPast((p) => [...p, ref.current!]);
                const [next, ...rest] = future;
                setFuture(rest);
                set(next);
              }}
            >
              Redo Builder
            </button>
            <button
              aria-pressed={advanced}
              onClick={() => setAdvanced(!advanced)}
            >
              {advanced
                ? "Quay về chế độ đơn giản"
                : "Chuyển sang chế độ nâng cao"}
            </button>
          </div>
          {b && (
            <section
              className={
                "builder-readiness " + (missing.length ? "incomplete" : "ready")
              }
              aria-label="Assembly readiness"
            >
              <strong>{selectedCount}/7 phần đã chọn</strong>
              {missing.length ? (
                <>
                  <span>
                    {" "}
                    Còn thiếu: {missing.map((s) => slotTitles[s]).join(", ")}.
                    Bấm tên phần để chọn ảnh.
                  </span>
                  <div className="builder-missing-slots">
                    {missing.map((slot) => (
                      <button
                        key={slot}
                        disabled={busy}
                        onClick={() => focusSlot(slot)}
                      >
                        {slotTitles[slot]}
                      </button>
                    ))}
                  </div>
                  <small>
                    Có thể ghép thử phần đã có; cần đủ 7 phần trước khi tạo rig.
                    Chọn đúng ảnh ở từng phần trước khi tạo rig.
                  </small>
                </>
              ) : (
                <span>
                  {" "}
                  Đã đủ phần. Bấm Ghép nhân vật để xem và chỉnh vị trí.
                </span>
              )}
              {step === 2 && (
                <button
                  className="builder-primary"
                  disabled={busy || selectedCount === 0}
                  onClick={() => navigate(3)}
                >
                  {missing.length
                    ? "Ghép thử " + selectedCount + " phần"
                    : "Ghép nhân vật"}
                </button>
              )}
            </section>
          )}
          {error && (
            <p className="builder-error" role="alert">
              {error}
            </p>
          )}
          {busy && (
            <div role="status">
              <progress max={1} value={progress} />
              {status}
              <button onClick={cancel}>Hủy xử lý</button>
            </div>
          )}
          <div className="builder-content">
            <main>
              {step <= 1 && (
                <section
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    void upload(e.dataTransfer.files);
                  }}
                >
                  <h3>1. Tải ảnh / kéo thả vào đây</h3>
                  <label>
                    Tên nhân vật
                    <input
                      aria-label="Builder character name"
                      value={name}
                      maxLength={100}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                  <label>
                    Chế độ
                    <select
                      aria-label="Builder import mode"
                      value={mode}
                      disabled={busy}
                      onChange={(e) => {
                        setMode(e.target.value as typeof mode);
                        setSources([]);
                        set(null);
                      }}
                    >
                      <option value="sheet">
                        A · Sprite sheet đã tách phần
                      </option>
                      <option value="layers">
                        B · Nhiều ảnh/layer độc lập
                      </option>
                      <option value="complete">
                        C · Ảnh hoàn chỉnh (cần provider thật)
                      </option>
                    </select>
                  </label>
                  <input
                    aria-label="Builder images"
                    type="file"
                    multiple={mode === "layers"}
                    accept="image/png,image/jpeg,image/webp"
                    disabled={busy}
                    onChange={(e) => {
                      if (e.target.files) void upload(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  <p>
                    PNG/JPG/WebP, tối đa 4096 px/cạnh, 16 ảnh, 8 MiB tổng
                    upload. PNG alpha được giữ; ảnh nền liền màu dùng flood-fill
                    từ viền.
                  </p>
                  {sources.map((a) => (
                    <figure key={a.id}>
                      <img src={a.data} alt={a.name} />
                      <figcaption>
                        {a.name} · {a.width}×{a.height}
                      </figcaption>
                    </figure>
                  ))}
                  {advanced && (
                    <label>
                      Ngưỡng nền liền màu
                      <input
                        type="number"
                        value={tolerance}
                        min={1}
                        max={48}
                        onChange={(e) =>
                          setTolerance(
                            Math.max(1, Math.min(48, Number(e.target.value))),
                          )
                        }
                      />
                    </label>
                  )}
                  <button
                    className="builder-primary"
                    disabled={!sources.length || busy}
                    onClick={() => automatic(false)}
                  >
                    Tự động tạo nhân vật
                  </button>
                  <section className="builder-gemini-controls">
                    <button onClick={() => setGeminiOpen(true)}>
                      Cài đặt AI
                    </button>
                    <p>
                      {gemini?.configured
                        ? "Gemini: " + gemini.visionModel
                        : geminiError ||
                          "Chưa lưu Gemini key. Có thể tiếp tục bản procedural ở trên."}
                    </p>
                    <label>
                      <input
                        type="checkbox"
                        checked={geminiConsent}
                        onChange={(e) => setGeminiConsent(e.target.checked)}
                      />
                      Đồng ý gửi ảnh tới Gemini; có thể phát sinh phí API
                      Google.
                    </label>
                    <button
                      className="builder-primary"
                      disabled={
                        busy ||
                        !sources.length ||
                        mode === "complete" ||
                        !gemini?.configured ||
                        !gemini.capabilities.imageUnderstanding ||
                        !geminiConsent
                      }
                      onClick={() => automatic(true)}
                    >
                      Tự động tạo nhân vật bằng Gemini
                    </button>
                    {mode === "complete" && (
                      <p>
                        Gemini nhận diện ý nghĩa ảnh; tách mask từng bộ phận của
                        ảnh nguyên người vẫn cần segmentation provider riêng.
                      </p>
                    )}
                  </section>
                  {mode === "complete" && (
                    <>
                      <p>
                        {provider.ready
                          ? "Provider: " +
                            provider.providerId +
                            " / " +
                            provider.model
                          : provider.reason}
                      </p>
                      <label>
                        <input
                          type="checkbox"
                          aria-label="Complete-image provider consent"
                          checked={consent}
                          disabled={!provider.ready}
                          onChange={(e) => setConsent(e.target.checked)}
                        />
                        Đồng ý gửi ảnh tới model đã cấu hình. Kết quả cần được
                        duyệt.
                      </label>
                      <button
                        disabled={busy}
                        onClick={() =>
                          void builderProviderStatus().then(setProvider)
                        }
                      >
                        Kiểm tra lại provider
                      </button>
                    </>
                  )}
                </section>
              )}
              {b && step === 2 && (
                <section>
                  <h3>3. Duyệt 7 phần nhân vật</h3>
                  <p>
                    Đầu đã gồm mặt; tóc là ảnh riêng. Mỗi phần chỉ dùng một ảnh.
                  </p>
                  {uncertain.length > 0 && (
                    <p role="status">
                      Có {uncertain.length} phần cần xác nhận, nhất là bên
                      trái/phải theo cơ thể nhân vật. Xác nhận hoặc đổi ảnh
                      trong các thẻ trước khi tạo xương.
                    </p>
                  )}
                  <div className="builder-review-actions">
                    <button
                      disabled={
                        busy ||
                        !gemini?.configured ||
                        !gemini.capabilities.imageUnderstanding ||
                        !geminiConsent
                      }
                      onClick={recognizeAgain}
                    >
                      Tự nhận diện lại bằng Gemini
                    </button>
                    <button onClick={() => setGeminiOpen(true)}>
                      Cài đặt AI
                    </button>
                    <label>
                      <input
                        type="checkbox"
                        checked={geminiConsent}
                        onChange={(e) => setGeminiConsent(e.target.checked)}
                      />
                      Cho phép gửi ảnh Gemini (có thể mất phí)
                    </label>
                    <button
                      onClick={() => {
                        setAdvanced(true);
                        setStatus(
                          "Chọn ảnh trong chế độ nâng cao để sửa anchor 0–1.",
                        );
                      }}
                    >
                      Chỉnh điểm nối
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        mutate("Tự gán lại", (d) => {
                          d.doc.characterBuild!.selection = recommend(
                            d.doc.characterBuild!.candidates,
                          );
                          d.doc.characterBuild!.optionalAttachments =
                            d.doc.characterBuild!.optionalAttachments?.filter(
                              (a) =>
                                !Object.values(
                                  d.doc.characterBuild!.selection,
                                ).includes(a.candidateId),
                            );
                          clearGenerated(d.doc);
                          d.stage = "parts";
                        })
                      }
                    >
                      Tự gán lại
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        layoutAction("Chuẩn hóa kích cỡ", (doc) => {
                          ensureAssembly(doc).normalized = true;
                        })
                      }
                    >
                      Chuẩn hóa kích cỡ
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        layoutAction("Khôi phục scale gốc", (doc) => {
                          ensureAssembly(doc).normalized = false;
                        })
                      }
                    >
                      Khôi phục scale gốc
                    </button>
                    <button
                      disabled={busy || !selectedCount}
                      onClick={() => navigate(3)}
                    >
                      Lắp thử
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        layoutAction("Đặt lại anchor", (doc) => {
                          ensureAssembly(doc).anchors = [];
                        })
                      }
                    >
                      Đặt lại anchor
                    </button>
                  </div>
                  <BuilderReview
                    doc={draft!.doc}
                    disabled={busy}
                    choose={chooseSlot}
                    editMask={(id) => {
                      setSelected(id);
                      setMaskEditing(true);
                      requestAnimationFrame(() =>
                        document
                          .querySelector(".builder-mask-editor")
                          ?.scrollIntoView({ block: "start" }),
                      );
                    }}
                  />
                  {advanced && (
                    <>
                      <div className="builder-grid">
                        {b.candidates.map((c) => (
                          <article
                            key={c.id}
                            className={c.id === selected ? "selected" : ""}
                          >
                            <input
                              type="checkbox"
                              aria-label={"Select candidate " + c.id}
                              checked={checks.includes(c.id)}
                              onChange={(e) =>
                                setChecks((ids) =>
                                  e.target.checked
                                    ? [...ids, c.id]
                                    : ids.filter((id) => id !== c.id),
                                )
                              }
                            />
                            <button onClick={() => setSelected(c.id)}>
                              <img
                                src={
                                  draft!.doc.assetReferences.find(
                                    (a) => a.id === c.previewAssetId,
                                  )?.data
                                }
                                alt={"Candidate " + c.label}
                              />
                            </button>
                            <select
                              aria-label={"Candidate label " + c.id}
                              value={c.label}
                              disabled={busy}
                              onChange={(e) =>
                                mutate("Nhãn thủ công", (d) => {
                                  const item =
                                    d.doc.characterBuild!.candidates.find(
                                      (n) => n.id === c.id,
                                    )!;
                                  item.label = e.target
                                    .value as typeof item.label;
                                  d.doc.characterBuild!.optionalAttachments =
                                    d.doc.characterBuild!.optionalAttachments?.filter(
                                      (a) => a.candidateId !== item.id,
                                    );
                                  item.confidence = 1;
                                  item.method = "manual";
                                  for (const key of primarySlots)
                                    if (
                                      d.doc.characterBuild!.selection[key] ===
                                      c.id
                                    )
                                      d.doc.characterBuild!.selection[key] =
                                        null;
                                  if (item.label !== "unknown")
                                    d.doc.characterBuild!.selection[
                                      item.label
                                    ] = item.id;
                                  clearGenerated(d.doc);
                                  d.stage = "parts";
                                })
                              }
                            >
                              <option value="unknown">Chưa biết</option>
                              {primarySlots.map((s) => (
                                <option key={s} value={s}>
                                  {slotTitles[s]}
                                </option>
                              ))}
                            </select>
                            <span className="builder-candidate-choice">
                              {primarySlots.some((s) => b.selection[s] === c.id)
                                ? "Đang dùng: " +
                                  slotTitles[
                                    primarySlots.find(
                                      (s) => b.selection[s] === c.id,
                                    )!
                                  ]
                                : "Biến thể dự phòng · chưa dùng"}
                            </span>
                            <small>
                              {Math.round(c.confidence * 100)}% · {c.method} ·{" "}
                              {c.orientation}
                            </small>
                            <label>
                              <input
                                type="checkbox"
                                checked={c.rejected}
                                disabled={busy}
                                onChange={(e) =>
                                  mutate("Bỏ/khôi phục candidate", (d) => {
                                    d.doc.characterBuild!.candidates.find(
                                      (n) => n.id === c.id,
                                    )!.rejected = e.target.checked;
                                    if (e.target.checked)
                                      for (const s of primarySlots)
                                        if (
                                          d.doc.characterBuild!.selection[s] ===
                                          c.id
                                        )
                                          d.doc.characterBuild!.selection[s] =
                                            null;
                                    clearGenerated(d.doc);
                                    d.stage = "parts";
                                  })
                                }
                              />
                              Bỏ ứng viên
                            </label>
                          </article>
                        ))}
                      </div>
                      <button
                        disabled={
                          busy || checks.length < 2 || b.candidates.length >= 64
                        }
                        onClick={() =>
                          void run(async (signal, update) => {
                            const original = ref.current!,
                              next = clone(original),
                              list = next.doc.characterBuild!.candidates.filter(
                                (c) => checks.includes(c.id),
                              ),
                              source = next.doc.assetReferences.find(
                                (a) => a.id === list[0].sourceAssetId,
                              )!,
                              merged = combineCandidates(list, source),
                              asset = await extractCandidate(source, merged);
                            if (signal.aborted) return;
                            next.doc.assetReferences.push(asset);
                            next.doc.characterBuild!.candidates.push(merged);
                            for (const c of list) c.rejected = true;
                            next.doc.characterBuild!.selection = recommend(
                              next.doc.characterBuild!.candidates,
                            );
                            clearGenerated(next.doc);
                            next.stage = "parts";
                            commit(next, "Gộp candidate mask");
                            setChecks([]);
                            setSelected(merged.id);
                            update(1, "Đã gộp");
                          })
                        }
                      >
                        Gộp các mask đã chọn
                      </button>
                      <button
                        disabled={
                          busy || !candidate || b.candidates.length >= 63
                        }
                        onClick={() =>
                          void run(async (signal, update) => {
                            const next = clone(ref.current!),
                              parts = splitCandidate(candidate!),
                              source = next.doc.assetReferences.find(
                                (a) => a.id === candidate!.sourceAssetId,
                              )!;
                            for (const c of parts)
                              next.doc.assetReferences.push(
                                await extractCandidate(source, c),
                              );
                            if (signal.aborted) return;
                            next.doc.characterBuild!.candidates.find(
                              (c) => c.id === candidate!.id,
                            )!.rejected = true;
                            next.doc.characterBuild!.candidates.push(...parts);
                            next.doc.characterBuild!.selection = recommend(
                              next.doc.characterBuild!.candidates,
                            );
                            clearGenerated(next.doc);
                            next.stage = "parts";
                            commit(next, "Chia candidate mask theo trục dọc");
                            setSelected(parts[0].id);
                            update(1, "Đã chia");
                          })
                        }
                      >
                        Chia mask đang chọn (dọc)
                      </button>
                      <button
                        disabled={
                          busy || primarySlots.some((s) => !b.selection[s])
                        }
                        onClick={() =>
                          void run((signal, update) =>
                            pipeline(ref.current!, signal, update),
                          )
                        }
                      >
                        Lắp → Rig → Mesh → Validate từ bản duyệt
                      </button>
                    </>
                  )}
                </section>
              )}
              {draft && step >= 3 && (
                <section>
                  <BuilderPreview
                    doc={draft.doc}
                    bones={step >= 4}
                    selected={layerId}
                  />
                  <p data-testid="builder-assembly-summary">
                    {draft.doc.layers.length} layer (
                    {draft.doc.characterBuild!.layerMappings.length} phần đã
                    ghép + lớp phụ), {draft.doc.bones.length} xương,{" "}
                    {draft.doc.meshes.length} mesh.{" "}
                    {advanced && <>Stage: {draft.stage}.</>}
                  </p>
                  {step === 3 && (
                    <div className="builder-assembly-actions">
                      {missing.length ? (
                        <>
                          <p>
                            Bản ghép thử còn thiếu {missing.length} phần. Không
                            tự tạo thêm ảnh hoặc ghép các biến thể đầu/tóc khác
                            nhau cùng lúc.
                          </p>
                          <button onClick={() => focusSlot(missing[0])}>
                            Bổ sung phần còn thiếu
                          </button>
                        </>
                      ) : (
                        <button
                          className="builder-primary"
                          disabled={busy}
                          onClick={() => navigate(4)}
                        >
                          {draft.doc.bones.length
                            ? "Mở bộ xương"
                            : "Tiếp tục · tạo bộ xương"}
                        </button>
                      )}
                    </div>
                  )}
                  {step === 3 && (
                    <>
                      <select
                        aria-label="Assembly layer"
                        value={layerId ?? ""}
                        onChange={(e) => setLayerId(e.target.value)}
                      >
                        <option value="">Chọn part để chỉnh</option>
                        {draft.doc.characterBuild!.layerMappings.map((m) => (
                          <option key={m.layerId} value={m.layerId}>
                            {slotTitles[m.slot]}
                          </option>
                        ))}
                      </select>
                      {chosenLayer &&
                        (
                          [
                            "x",
                            "y",
                            "rotation",
                            "scaleX",
                            "scaleY",
                            "pivotX",
                            "pivotY",
                          ] as const
                        ).map((key) => (
                          <label key={key}>
                            {key}
                            <input
                              aria-label={"Assembly " + key}
                              type="number"
                              value={chosenLayer[key] ?? 0}
                              min={key.startsWith("scale") ? 0.01 : -10000}
                              max={key.startsWith("scale") ? 20 : 10000}
                              step={key.startsWith("scale") ? 0.05 : 1}
                              disabled={busy}
                              onChange={(e) => {
                                const value = e.target.valueAsNumber;
                                if (!Number.isFinite(value)) return;
                                mutate("Chỉnh assembly transform", (d) => {
                                  clearGenerated(d.doc, true);
                                  d.doc.layers.find(
                                    (l) => l.id === chosenLayer.id,
                                  )![key] = value;
                                  d.stage = "assembly";
                                });
                              }}
                            />
                          </label>
                        ))}
                      {chosenLayer && (
                        <button
                          onClick={() =>
                            mutate("Đổi layer order", (d) => {
                              const i = d.doc.layers.findIndex(
                                  (l) => l.id === chosenLayer.id,
                                ),
                                l = d.doc.layers.splice(i, 1)[0];
                              d.doc.layers.push(l);
                              d.doc.hierarchy = d.doc.layers.map((l) => ({
                                layerId: l.id,
                                parentId: l.parentId,
                              }));
                              d.doc.characterParts.forEach(
                                (p) =>
                                  (p.renderOrder = d.doc.layers.findIndex(
                                    (l) => l.id === p.layerId,
                                  )),
                              );
                            })
                          }
                        >
                          Đưa part lên trên
                        </button>
                      )}
                    </>
                  )}
                  {step === 4 && (
                    <>
                      <select
                        aria-label="Builder bone"
                        value={boneId ?? ""}
                        onChange={(e) => setBoneId(e.target.value)}
                      >
                        <option value="">Chọn xương</option>
                        {draft.doc.bones.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                      {chosenBone && (
                        <>
                          <label>
                            Gập thử · góc xoay (Pose)
                            <input
                              aria-label="Builder bone rotation"
                              type="range"
                              min={chosenBone.constraints.minRotation}
                              max={chosenBone.constraints.maxRotation}
                              value={chosenBone.pose.rotation}
                              onChange={(e) =>
                                mutate("Pose xương", (d) => {
                                  poseBuilderJoint(
                                    d.doc,
                                    chosenBone.id,
                                    Number(e.target.value),
                                  );
                                })
                              }
                            />
                          </label>
                          {(["x", "y"] as const).map((axis) => (
                            <label key={axis}>
                              Rest {axis} · thay đổi khung xương
                              <input
                                type="number"
                                value={chosenBone.rest[axis]}
                                onChange={(e) => {
                                  if (Number.isFinite(e.target.valueAsNumber))
                                    mutate("Chỉnh rest landmark", (d) => {
                                      const b = d.doc.bones.find(
                                        (b) => b.id === chosenBone.id,
                                      )!;
                                      b.rest[axis] = e.target.valueAsNumber;
                                      d.doc.rigSettings.mode = "rest";
                                    });
                                }}
                              />
                            </label>
                          ))}
                        </>
                      )}
                      {draft.doc.ikTargets.map((t) => (
                        <label key={t.id}>
                          IK{" "}
                          {
                            draft.doc.bones.find((b) => b.id === t.endBoneId)
                              ?.name
                          }
                          <input
                            aria-label={"Builder IK X " + t.id}
                            type="number"
                            value={t.x}
                            onChange={(e) => {
                              if (Number.isFinite(e.target.valueAsNumber))
                                mutate("IK target", (d) => {
                                  d.doc.rigSettings.mode = "pose";
                                  solveTwoBone(d.doc, t.id, {
                                    x: e.target.valueAsNumber,
                                    y: t.y,
                                  });
                                });
                            }}
                          />
                          <input
                            aria-label={"Builder IK Y " + t.id}
                            type="number"
                            value={t.y}
                            onChange={(e) => {
                              if (Number.isFinite(e.target.valueAsNumber))
                                mutate("IK target Y", (d) => {
                                  d.doc.rigSettings.mode = "pose";
                                  solveTwoBone(d.doc, t.id, {
                                    x: t.x,
                                    y: e.target.valueAsNumber,
                                  });
                                });
                            }}
                          />
                        </label>
                      ))}
                    </>
                  )}
                  {step === 5 && (
                    <>
                      <button
                        disabled={busy || !draft.doc.meshes.length}
                        onClick={() =>
                          mutate("Run builder joint validation", (d) => {
                            d.doc = validateAssembly(d.doc);
                          })
                        }
                      >
                        Run Joint Validation
                      </button>
                      <p>
                        0°,20°,45°,70°,90°,120° (elbow dùng hướng gập âm). Báo
                        cáo alpha/mesh là cảnh báo, không chứng nhận mọi ảnh
                        liền mạch.
                      </p>
                      {draft.doc.jointValidation && (
                        <div>
                          <strong>
                            {draft.doc.jointValidation.uncoveredSamples}/
                            {draft.doc.jointValidation.samples} mẫu alpha chưa
                            phủ · {draft.doc.jointValidation.issues.length} cảnh
                            báo
                          </strong>
                          {draft.doc.jointValidation.issues
                            .slice(0, 30)
                            .map((i) => (
                              <p key={i.id}>
                                {i.kind} {i.angle}° · {i.message} ·{" "}
                                {i.suggestions.join(", ")}
                              </p>
                            ))}
                        </div>
                      )}
                      {draft.doc.characterJoints.map((j) => (
                        <div key={j.id}>
                          {j.name} · {j.mode}
                          <select
                            aria-label={"Joint deformation " + j.id}
                            value={j.mode}
                            disabled={busy}
                            onChange={(e) =>
                              editJoint(j.id, {
                                mode: e.target.value as typeof j.mode,
                              })
                            }
                          >
                            <option
                              value="continuous_mesh"
                              disabled={
                                !draft.doc.meshes.some((m) =>
                                  j.layerIds.includes(m.layerId),
                                )
                              }
                            >
                              Mesh liền · blend weights
                            </option>
                            <option
                              value="overlap_only"
                              disabled={
                                ["elbow", "knee"].includes(j.kind) &&
                                !draft.doc.characterParts.some(
                                  (p) =>
                                    p.jointId === j.id && p.role === "upper",
                                )
                              }
                            >
                              Overlap / underlap
                            </option>
                            <option value="rigid_segment">
                              Rigid · mảnh cứng
                            </option>
                          </select>
                          {(["overlapSize", "underlapSize"] as const).map(
                            (key) => (
                              <label key={key}>
                                {key === "overlapSize" ? "Overlap" : "Underlap"}
                                <input
                                  key={j[key]}
                                  aria-label={key + " " + j.id}
                                  type="number"
                                  min={0}
                                  max={48}
                                  defaultValue={j[key]}
                                  disabled={busy}
                                  onBlur={(e) => {
                                    const n = e.target.valueAsNumber;
                                    if (Number.isFinite(n) && n !== j[key])
                                      editJoint(j.id, {
                                        [key]: Math.max(0, Math.min(48, n)),
                                      });
                                  }}
                                />
                              </label>
                            ),
                          )}
                          {!draft.doc.meshes.some((m) =>
                            j.layerIds.includes(m.layerId),
                          ) && (
                            <small>
                              Part cứng một mảnh: chọn chất liệu mềm ở Duyệt và
                              tạo lại để gập bằng mesh.
                            </small>
                          )}
                          <button
                            disabled={busy}
                            onClick={() => editJoint(j.id, {}, true)}
                          >
                            Procedural repair
                          </button>
                        </div>
                      ))}
                    </>
                  )}
                  {step === 6 && (
                    <>
                      <p>
                        Kết quả vẫn là ảnh/layer, rig, mesh và keyframe chỉnh
                        sửa được. Mở editor để chỉnh vertex/weights, IK, pivot
                        và VFX nâng cao.
                      </p>
                      <label>
                        <input
                          aria-label="Confirm right-facing parts"
                          type="checkbox"
                          checked={rightFacing}
                          onChange={(e) => setRightFacing(e.target.checked)}
                        />
                        Tôi đã kiểm tra các phần là góc 3/4 hướng phải; pipeline
                        không giả tạo góc nhìn khác.
                      </label>
                      <label>
                        <input
                          aria-label="Approve assembled character"
                          type="checkbox"
                          checked={approved}
                          onChange={(e) => setApproved(e.target.checked)}
                        />
                        Tôi đã duyệt 7 phần và hiểu các cảnh báo; mở kết quả như
                        một dự án mới.
                      </label>
                      <button
                        disabled={
                          busy ||
                          !draft.doc.bones.length ||
                          !draft.doc.meshes.length ||
                          !approved ||
                          !rightFacing ||
                          draft.doc.characterBuild!.candidates.some(
                            (c) =>
                              c.orientation === "left" &&
                              Object.values(
                                draft.doc.characterBuild!.selection,
                              ).includes(c.id),
                          )
                        }
                        onClick={() => {
                          try {
                            const next = clone(draft);
                            if (!next.doc.animationClips.length)
                              next.doc = addBuilderAnimations(next.doc);
                            if (!next.doc.jointValidation)
                              next.doc = validateAssembly(next.doc);
                            for (const c of next.doc.characterBuild!.candidates)
                              if (
                                c.provider &&
                                Object.values(
                                  next.doc.characterBuild!.selection,
                                ).includes(c.id)
                              )
                                c.provider.approved = true;
                            next.doc.characterBuild!.approved = true;
                            saveBuilderProject(next.doc, base, localStorage);
                            onClose();
                          } catch (e) {
                            setError(
                              "Chưa mở vì backup/lưu không thành công: " +
                                String(e) +
                                ". Hãy tải bản .a2dstudio trước.",
                            );
                          }
                        }}
                      >
                        Lưu & mở trong Animation / VFX Studio
                      </button>
                      <button
                        onClick={() =>
                          download(
                            new Uint8Array(packageProject(draft.doc)),
                            "built-character.a2dstudio",
                            "application/zip",
                          )
                        }
                      >
                        Tải dự án Builder .a2dstudio
                      </button>
                      <button
                        onClick={() =>
                          download(
                            new Uint8Array(packageProject(base)),
                            "previous-project-backup.a2dstudio",
                            "application/zip",
                          )
                        }
                      >
                        Tải bản gốc đang mở
                      </button>
                    </>
                  )}
                </section>
              )}
            </main>
            <aside>
              {b && (
                <>
                  <h3>Trạng thái</h3>
                  {(b.assembly?.warnings ?? []).map((w, i) => (
                    <p key={i} className="builder-proportion-warning">
                      {w}
                    </p>
                  ))}
                  <p>
                    {selectedCount}/7 phần đã chọn
                    {advanced && (
                      <>
                        {" "}
                        · {b.candidates.length} ảnh · {b.method}
                      </>
                    )}
                  </p>
                  <button onClick={() => setStep(2)}>
                    Duyệt part / sửa mask
                  </button>
                  {candidate && (advanced || maskEditing) && (
                    <>
                      <strong>
                        {slotTitles[
                          candidate.label as keyof typeof slotTitles
                        ] ?? "Chưa phân loại"}
                      </strong>
                      {!advanced && (
                        <button onClick={() => setMaskEditing(false)}>
                          Đóng sửa mask
                        </button>
                      )}
                      {advanced && (
                        <>
                          {candidate.warnings.slice(0, 4).map((w, i) => (
                            <p key={i}>{w}</p>
                          ))}
                          <label>
                            Hướng part (duyệt thủ công)
                            <select
                              value={candidate.orientation}
                              disabled={busy}
                              onChange={(e) =>
                                mutate("Xác nhận hướng part", (d) => {
                                  d.doc.characterBuild!.candidates.find(
                                    (c) => c.id === candidate.id,
                                  )!.orientation = e.target
                                    .value as PartCandidate["orientation"];
                                })
                              }
                            >
                              <option value="unknown">Chưa xác nhận</option>
                              <option value="right">Hướng phải</option>
                              <option value="left">
                                Hướng trái · cần sửa trước khi finish
                              </option>
                            </select>
                          </label>
                          <label>
                            Chất liệu
                            <select
                              value={candidate.material}
                              disabled={busy}
                              onChange={(e) =>
                                mutate("Kiểu biến dạng part", (d) => {
                                  d.doc.characterBuild!.candidates.find(
                                    (c) => c.id === candidate.id,
                                  )!.material = e.target.value as
                                    | "soft"
                                    | "rigid";
                                  clearGenerated(d.doc);
                                  d.stage = "parts";
                                })
                              }
                            >
                              <option value="soft">
                                Mềm · continuous mesh
                              </option>
                              <option value="rigid">
                                Cứng · một mảnh rigid
                              </option>
                            </select>
                          </label>
                        </>
                      )}
                      <BuilderMaskEditor
                        disabled={busy}
                        source={
                          draft!.doc.assetReferences.find(
                            (a) => a.id === candidate.sourceAssetId,
                          )!
                        }
                        candidate={candidate}
                        onChange={(mask) =>
                          void updateCandidate({
                            ...structuredClone(candidate),
                            mask,
                            method: "manual",
                            confidence: 1,
                          })
                        }
                      />
                    </>
                  )}
                  {(advanced ? b.warnings : []).slice(0, 10).map((w, i) => (
                    <p key={i}>{w}</p>
                  ))}
                </>
              )}
              {advanced && draft && (
                <BuilderModelPanel
                  status={provider}
                  consent={consent}
                  setConsent={setConsent}
                  images={draft.doc.assetReferences}
                  candidates={b?.candidates.filter((c) => !c.rejected) ?? []}
                  selected={candidate}
                  busy={busy}
                  run={run}
                  apply={applyModel}
                  revision={draft.doc.metadata.revision}
                />
              )}
              {advanced && (
                <>
                  <p>
                    AI capabilities:{" "}
                    {provider.ready
                      ? provider.capabilities.join(", ")
                      : provider.reason}
                  </p>
                </>
              )}
              {advanced && draft && (
                <>
                  <h3>Anchor (tọa độ 0–1 trên ảnh)</h3>
                  {candidate &&
                    (() => {
                      const slot =
                        primarySlots.find(
                          (s) => b!.selection[s] === candidate.id,
                        ) ??
                        (candidate.label === "unknown"
                          ? null
                          : candidate.label);
                      if (!slot)
                        return <p>Gán ảnh vào một phần để sửa anchor.</p>;
                      return Object.entries(
                        candidateAnchors(draft.doc, candidate, slot),
                      ).map(([key, p]) => (
                        <label key={key}>
                          {key}
                          {(["x", "y"] as const).map((axis) => (
                            <input
                              key={axis}
                              aria-label={"Anchor " + key + " " + axis}
                              type="number"
                              min={0}
                              max={1}
                              step={0.01}
                              value={p![axis]}
                              onChange={(e) => {
                                const n = e.target.valueAsNumber;
                                if (Number.isFinite(n))
                                  layoutAction("Chỉnh anchor", (doc) =>
                                    setAnchor(
                                      doc,
                                      candidate.id,
                                      key as AnchorName,
                                      { ...p!, [axis]: n },
                                    ),
                                  );
                              }}
                            />
                          ))}
                        </label>
                      ));
                    })()}
                  <h3>Phụ kiện không bắt buộc</h3>
                  {(["cloak", "sword"] as const).map((kind) => (
                    <label key={kind}>
                      {kind === "cloak" ? "Áo choàng" : "Kiếm"}
                      <select
                        aria-label={"Optional " + kind}
                        value={
                          b!.optionalAttachments?.find((a) => a.kind === kind)
                            ?.candidateId ?? ""
                        }
                        onChange={(e) =>
                          mutate("Chọn phụ kiện", (d) => {
                            const build = d.doc.characterBuild!,
                              id = e.target.value;
                            build.optionalAttachments = (
                              build.optionalAttachments ?? []
                            ).filter(
                              (a) => a.kind !== kind && a.candidateId !== id,
                            );
                            if (id)
                              build.optionalAttachments.push({
                                kind,
                                candidateId: id,
                                layerId: null,
                              });
                            clearGenerated(d.doc);
                            d.stage = "parts";
                          })
                        }
                      >
                        <option value="">Không dùng</option>
                        {b!.candidates
                          .filter(
                            (c) =>
                              !c.rejected &&
                              !Object.values(b!.selection).includes(c.id),
                          )
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              Ảnh {b!.candidates.indexOf(c) + 1}
                            </option>
                          ))}
                      </select>
                    </label>
                  ))}
                  <h3>Chạy từng stage thật</h3>
                  <button
                    disabled={
                      busy ||
                      draft.stage !== "parts" ||
                      primarySlots.some((s) => !b!.selection[s])
                    }
                    onClick={() =>
                      mutate("Auto Assembly", (d) => {
                        d.doc = assemble(d.doc);
                        d.stage = "assembly";
                        setStep(3);
                      })
                    }
                  >
                    Auto Assembly
                  </button>
                  <button
                    disabled={
                      busy || draft.stage !== "assembly" || missing.length > 0
                    }
                    onClick={() =>
                      mutate("Auto Rig", (d) => {
                        d.doc = rigAssembly(d.doc);
                        d.stage = "rig";
                        setStep(4);
                      })
                    }
                  >
                    Auto Rig
                  </button>
                  <button
                    disabled={busy || draft.stage !== "rig"}
                    onClick={() =>
                      void run(async (signal, update) => {
                        const next = clone(ref.current!);
                        next.doc = await meshAssembly(next.doc, signal, update);
                        next.stage = "mesh";
                        commit(next, "Auto Mesh");
                        setStep(5);
                      })
                    }
                  >
                    Auto Mesh
                  </button>
                </>
              )}
              {draft && (
                <button
                  disabled={busy || !canVisit(6)}
                  onClick={() => navigate(6)}
                >
                  Duyệt & hoàn tất
                </button>
              )}
            </aside>
          </div>
          <footer>
            {status}
            <button
              disabled={busy || !hasBackup}
              onClick={() => {
                try {
                  if (restoreBuilderProject(localStorage)) onClose();
                } catch (error) {
                  setError(String(error));
                }
              }}
            >
              Khôi phục dự án trước
            </button>
            <button
              disabled={busy || !draft}
              onClick={() => setStep(Math.max(0, step - 1))}
            >
              Quay lại
            </button>
            <button
              disabled={
                busy || !draft || step === 6 || !canVisit(Math.min(6, step + 1))
              }
              onClick={() => navigate(Math.min(6, step + 1))}
            >
              {step === 2
                ? "Tiếp theo · xem bản ghép"
                : step === 3
                  ? "Tạo bộ xương"
                  : step === 4
                    ? "Tạo mesh & kiểm tra"
                    : step === 5
                      ? "Duyệt & lưu"
                      : "Tiếp theo"}
            </button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
      {geminiOpen && <AISettings onClose={() => setGeminiOpen(false)} />}
    </Dialog.Root>
  );
}
