import {
  parseDocument,
  syncHierarchy,
  type ProjectDocument,
  type CharacterPart,
  type CharacterJoint,
} from "../../../packages/document-core/src";
import {
  sideTemplate,
  sideLandmarks,
} from "../../../packages/rig-core/src/side-template";
import { bindLayer, boneMatrices } from "../../../packages/rig-core/src";
import {
  generateMesh,
  putMesh,
  autoWeights,
} from "../../../packages/mesh-core/src";
import {
  registerPart,
  createJointCompletion,
  smoothJointWeights,
} from "../../../packages/mesh-core/src/joint-completion";
import { createSideReferenceClips } from "../../../packages/animation-core/src/side-presets";
const defs = `<defs><linearGradient id="metal" x2="1" y2="1"><stop stop-color="#758197"/><stop offset=".4" stop-color="#30394e"/><stop offset="1" stop-color="#151b29"/></linearGradient><linearGradient id="red" x2="1"><stop stop-color="#571b31"/><stop offset=".6" stop-color="#9e2942"/><stop offset="1" stop-color="#d65462"/></linearGradient></defs>`;
export async function sideRaster(content: string, w: number, h: number) {
  const img = new Image();
  img.src =
    "data:image/svg+xml;charset=utf-8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs}<g stroke="#171d2c" stroke-width="2" stroke-linejoin="round">${content}</g></svg>`,
    );
  await img.decode();
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d")!.drawImage(img, 0, 0);
  return c.toDataURL("image/png");
}
export async function createSideDemo(front: ProjectDocument) {
  const doc = parseDocument({
    ...front,
    assetReferences: [],
    layers: [],
    hierarchy: [],
    skeletons: [],
    bones: [],
    meshes: [],
    vertexWeights: [],
    attachments: [],
    equipmentSlots: [],
    ikTargets: [],
    animationClips: [],
    keyframeTracks: [],
    animationEvents: [],
    characterParts: [],
    characterJoints: [],
    characterVariants: [],
    jointValidation: null,
  });
  doc.characterSettings = {
    characterView: "side_3_4",
    defaultFacing: "right",
    facing: "right",
    movementMode: "horizontal",
    mirrorForOppositeDirection: true,
    enableVerticalFacing: false,
    worldPosition: { ...front.characterSettings.worldPosition },
  };
  const bones = sideTemplate(doc);
  const add = async (
    name: string,
    semantic: string,
    depth: CharacterPart["depth"],
    bone: string,
    x: number,
    y: number,
    w: number,
    h: number,
    svg: string,
    role: CharacterPart["role"] = "body",
    jointId: string | null = null,
  ) => {
    const aid = crypto.randomUUID(),
      id = crypto.randomUUID();
    doc.assetReferences.push({
      id: aid,
      name,
      provenance: "procedural",
      kind: "source",
      dependencies: [],
      width: w,
      height: h,
      data: await sideRaster(svg, w, h),
    });
    doc.layers.push({
      id,
      assetId: aid,
      parentId: null,
      name,
      visible: true,
      locked: false,
      opacity: 1,
      x,
      y,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    });
    bindLayer(doc, id, bones.get(bone)!.id);
    const pivot = boneMatrices(doc, "rest").get(bones.get(bone)!.id)!;
    const layer = doc.layers.find((l) => l.id === id)!;
    layer.pivotX = pivot.tx - x;
    layer.pivotY = pivot.ty - y;
    layer.x = pivot.tx;
    layer.y = pivot.ty;
    const part = await registerPart(doc, id, semantic, depth, role, jointId);
    return part;
  };
  const limb = async (side: "Near" | "Far", leg: boolean) => {
    const near = side === "Near",
      depth = near ? "near" : "far",
      root = side + (leg ? " Thigh" : " Upper Arm"),
      lower = side + (leg ? " Shin" : " Forearm"),
      p = sideLandmarks[root as keyof typeof sideLandmarks],
      q = sideLandmarks[lower as keyof typeof sideLandmarks],
      x = leg ? (near ? 376 : 322) : near ? 402 : 347,
      y = leg ? 410 : 270,
      w = leg ? 125 : near ? 106 : 96,
      h = leg ? 244 : 218,
      width = leg ? (near ? 46 : 42) : near ? 38 : 30,
      a = { x: p[0] - x, y: p[1] - y },
      b = { x: p[2] - x, y: p[3] - y },
      c = { x: q[2] - x, y: q[3] - y };
    const joint: CharacterJoint = {
      id: crypto.randomUUID(),
      name: side + (leg ? " Knee" : " Elbow"),
      kind: leg ? "knee" : "elbow",
      upperBoneId: bones.get(root)!.id,
      lowerBoneId: bones.get(lower)!.id,
      layerIds: [],
      mode: "continuous_mesh",
      overlapSize: 8,
      underlapSize: 10,
      radius: width / 2,
      completion: "procedural_neighbor_fill_v1",
    };
    doc.characterJoints.push(joint);
    const path = (points: { x: number; y: number }[]) =>
      `<path d="M${points.map((p) => p.x + " " + p.y).join(" L")}" fill="none" stroke="${near ? "url(#metal)" : "#252c3f"}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/><path d="M${points.map((p) => p.x - width * 0.22 + " " + p.y).join(" L")}" fill="none" stroke="${near ? "#8b8e9e" : "#4b536b"}" stroke-width="3" stroke-linecap="round"/>`;
    const boot = leg
      ? `<path d="M${c.x - 18} ${c.y - 14} L${c.x + 15} ${c.y - 12} L${c.x + 48} ${c.y + 6} Q${c.x + 55} ${c.y + 12} ${c.x + 43} ${c.y + 19} L${c.x - 19} ${c.y + 19} Z" fill="${near ? "#252b3c" : "#171e2e"}"/><path d="M${c.x - 14} ${c.y + 16} L${c.x + 43} ${c.y + 16}" stroke="#a18a89" stroke-width="3"/>`
      : `<ellipse cx="${c.x}" cy="${c.y}" rx="${width * 0.43}" ry="15" fill="#2a2a3b"/><path d="m${c.x - 8} ${c.y - 2} 15 3" stroke="#b6938e" stroke-width="3"/>`;
    const plate = `<path d="M${b.x - width * 0.42} ${b.y - 12} L${b.x + width * 0.42} ${b.y - 10} L${b.x + width * 0.3} ${b.y + 13} L${b.x - width * 0.3} ${b.y + 13} Z" fill="${near ? "#555f77" : "#333d53"}"/><path d="m${b.x - width * 0.3} ${b.y - 5} ${width * 0.5} 1" stroke="#9e97a1" stroke-width="3"/>`;
    const main = await add(
      side + (leg ? " leg · continuous" : " arm · continuous"),
      leg ? "leg" : "arm",
      depth,
      root,
      x,
      y,
      w,
      h,
      path([a, b, c]) + plate + boot,
      "continuous",
      joint.id,
    );
    joint.layerIds.push(main.layerId);
    const upper = await add(
      side + (leg ? " thigh · overlap" : " upper arm · overlap"),
      leg ? "thigh" : "upper_arm",
      depth,
      root,
      x,
      y,
      w,
      h,
      path([a, { x: b.x + (b.x - a.x) * 0.07, y: b.y + (b.y - a.y) * 0.07 }]),
      "upper",
      joint.id,
    );
    joint.layerIds.push(upper.layerId);
    const low = await add(
      side + (leg ? " shin · overlap" : " forearm · overlap"),
      leg ? "shin" : "forearm",
      depth,
      lower,
      x,
      y,
      w,
      h,
      path([{ x: b.x - (c.x - b.x) * 0.07, y: b.y - (c.y - b.y) * 0.07 }, c]) +
        plate +
        boot,
      "lower",
      joint.id,
    );
    joint.layerIds.push(low.layerId);
    const mesh = await generateMesh(doc, main.layerId);
    putMesh(doc, mesh);
    main.meshId = mesh.id;
    smoothJointWeights(doc, joint);
    await createJointCompletion(doc, joint);
    return joint;
  };
  await add(
    "Hair back · side",
    "hair_back",
    "far",
    "Hair Back",
    350,
    134,
    102,
    155,
    `<path d="M72 3 30 5 5 42 13 72 3 104 28 92 20 139 41 122 61 152 69 103 97 58Z" fill="#a9b6d0"/><path d="M65 12 26 29 22 71 39 54 28 111 47 88 62 130 72 69 91 40Z" fill="#dce4f2"/>`,
  );
  await add(
    "Crimson cape · side",
    "cape",
    "far",
    "Cape Base",
    255,
    260,
    156,
    354,
    `<path d="M108 6 151 22 138 138 129 325 95 303 53 351 28 314 3 334 37 192 72 40Z" fill="url(#red)"/><path d="M99 30 61 262 30 309 52 193 75 64M133 52 107 292 85 276 101 92" fill="#531a32"/><path d="M97 80 78 250 49 297 68 206" fill="#e66c70" opacity=".45"/>`,
  );
  await limb("Far", true);
  await limb("Far", false);
  await add(
    "Far shoulder armor",
    "shoulder_armor",
    "far",
    "Far Upper Arm",
    346,
    270,
    61,
    57,
    `<path d="m5 21 24-17 28 16-8 29-23 3L3 39Z" fill="#30394e"/><path d="m8 21 22-12 22 13-24 10Z" fill="#66718a"/>`,
    "armor",
  );
  await limb("Near", true);
  await add(
    "Black armor · side 3/4",
    "torso",
    "center",
    "Chest",
    350,
    260,
    116,
    195,
    `<path d="M33 4 84 4 110 40 94 123 107 174 72 191 11 175 15 119 4 47Z" fill="url(#metal)"/><path d="M35 14 78 11 99 46 76 79 25 63 12 41Z" fill="#6d7890"/><path d="M18 48 34 65 27 127 13 119Z" fill="#131c2a"/><path d="M37 71 75 89 97 67 89 115 69 133 34 117Z" fill="#242d40"/><path d="m72 41 10 22-12 28-9-24Z" fill="#edaf79"/><path d="m71 50 5 14-5 14-4-13Z" fill="#ff7753"/><path d="M30 132 69 147 94 132M25 152 69 163 99 150" fill="none" stroke="#9b8d9a" stroke-width="3"/><path d="m17 168 50 7 33-12 4 16-34 13-54-10Z" fill="#111a29"/><path d="m64 171 18-2 0 16-17 4Z" fill="#c29a71"/>`,
  );
  await add(
    "Neck scarf · side",
    "scarf",
    "center",
    "Neck",
    378,
    244,
    81,
    48,
    `<path d="m9 2 53 2 15 23-26 18-43-8-6-18Z" fill="url(#red)"/><path d="m9 15 37 14 20-11M15 29 47 38 65 28" fill="none" stroke="#e68180" stroke-width="3"/>`,
  );
  await add(
    "Face · 3/4 right",
    "face",
    "center",
    "Head",
    394,
    156,
    115,
    111,
    `<path d="M9 9 67 2 87 18 89 41 105 57 96 63 92 84 70 104 34 91 16 67 1 37Z" fill="#d79b8c"/><path d="M30 12 70 9 83 26 82 45 98 57 87 63 85 83 68 97 41 84 23 61 17 37Z" fill="#f3cbb4"/><path d="m61 39 22 1-7 13-13-3Z" fill="#fff0d9"/><path d="m72 42 6 0-2 10-5 0Z" fill="#b9403e"/><path d="m37 34 12 4-3 7-8-3Z" fill="#eaded5"/><path d="m44 37 4 1-2 6-3-1Z" fill="#aa3e40"/><path d="m59 32 24 3M35 29l15 4" stroke="#71535b" stroke-width="3"/><path d="m83 47 3 13 10-3M72 78l13-1" fill="none" stroke="#ae756e" stroke-width="2"/><path d="M7 38 Q-4 44 10 59 L19 58" fill="#e7b39e"/>`,
  );
  await add(
    "Hair front · side",
    "hair_front",
    "near",
    "Hair Front",
    366,
    111,
    139,
    129,
    `<path d="m7 41 22-23 24 1 14-16 25 7 20 10 17 24-3 37-12-15-6 28-16-35-1 44-25-39-12 20-12-33-13 31-8-18-13 25-5-30Z" fill="#aab7d0"/><path d="m12 42 25-20 23 1 13-12 19 7 22 14 8 21-12 15-5-24-13 28-13-34-4 31-18-23-12 18-8-24-15 27-1-20-12 21Z" fill="#f1f4fc"/><path d="m36 27 18-3-12 22M75 20l14 3 13 17" fill="none" stroke="#fff" stroke-width="5"/>`,
  );
  await limb("Near", false);
  await add(
    "Near shoulder armor",
    "shoulder_armor",
    "near",
    "Near Upper Arm",
    402,
    272,
    78,
    64,
    `<path d="m4 24 35-20 34 18-9 31-35 8L3 43Z" fill="url(#metal)"/><path d="m7 23 33-15 29 15-37 13Z" fill="#8c94aa"/><path d="m9 32 22 13 32-10-6 15-27 6Z" fill="#30394e"/><path d="m19 23 20-10 17 9-23 6Z" fill="#c4b0af"/>`,
    "armor",
  );
  await add(
    "Sword blade · side",
    "weapon",
    "near",
    "Weapon Socket",
    470,
    225,
    30,
    229,
    `<path d="m18 3 10 29-7 188-13 5-6-10 6-186Z" fill="#f4d6b1"/><path d="m18 8-2 207-8 7-3-10 6-183Z" fill="#aa7d7d"/><path d="m20 33-6 171" stroke="#ffe6b3" stroke-width="3"/>`,
    "weapon",
  );
  await add(
    "Flaming sword · static procedural",
    "weapon_flame",
    "near",
    "Weapon Socket",
    452,
    194,
    72,
    253,
    `<path d="M35 3C65 41 34 68 59 96 61 79 69 72 69 65 76 113 51 138 59 171L34 248 19 229C8 205 28 185 14 162 2 138 21 117 19 100 28 123 25 142 34 148 43 114 24 96 33 70 43 45 29 27 35 3Z" fill="#f25a31" stroke="none" opacity=".85"/><path d="M39 62C56 92 36 116 48 148 58 168 32 189 33 225L27 240 23 213C18 191 38 177 27 158 20 145 32 125 32 111 36 129 44 119 39 103Z" fill="#ffb148" stroke="none"/><path d="M34 147C46 174 25 195 30 228L26 238 23 212C21 191 35 178 30 163Z" fill="#fff0b0" stroke="none"/>`,
    "weapon",
  );
  await add(
    "Sword hilt · side",
    "weapon",
    "near",
    "Weapon Socket",
    452,
    443,
    70,
    69,
    `<path d="m24 13 14 1-1 44-12-2Z" fill="#3a2e3d"/><path d="m24 26 14 4M24 39l13 4" stroke="#c69872" stroke-width="3"/><path d="m5 4 21 7 8-7 9 9 20-3-7 14-18-3-5 5-8-7-17 1Z" fill="#dbaa79"/><path d="m24 56 11-4 8 8-10 6-10-3Z" fill="#c49675"/>`,
    "weapon",
  );
  for (const part of doc.characterParts.filter((p) =>
    ["cape", "hair_front", "hair_back"].includes(p.semantic),
  )) {
    const names =
      part.semantic === "cape"
        ? ["Chest", "Cape Base", "Cape Tip"]
        : part.semantic === "hair_front"
          ? ["Head", "Hair Front"]
          : ["Head", "Hair Back"];
    const mesh = await generateMesh(doc, part.layerId);
    putMesh(doc, mesh);
    autoWeights(
      doc,
      mesh,
      names.map((n) => bones.get(n)!.id),
    );
    part.meshId = mesh.id;
    doc.characterJoints.push({
      id: crypto.randomUUID(),
      name: part.semantic,
      kind: part.semantic === "cape" ? "cape" : "hair",
      upperBoneId: bones.get(names[0])!.id,
      lowerBoneId: bones.get(names.at(-1)!)!.id,
      layerIds: [part.layerId],
      mode: "continuous_mesh",
      overlapSize: 0,
      underlapSize: 0,
      radius: 12,
      completion: "user_authored",
    });
  }
  for (const part of doc.characterParts.filter((p) => p.role === "armor")) {
    const side = part.depth === "near" ? "Near" : "Far";
    doc.characterJoints.push({
      id: crypto.randomUUID(),
      name: side + " shoulder armor",
      kind: "shoulder",
      upperBoneId: bones.get("Chest")!.id,
      lowerBoneId: bones.get(side + " Upper Arm")!.id,
      layerIds: [part.layerId],
      mode: "rigid_segment",
      overlapSize: 12,
      underlapSize: 0,
      radius: 24,
      completion: "user_authored",
    });
  }
  doc.characterJoints.push({
    id: crypto.randomUUID(),
    name: "Weapon Socket",
    kind: "weapon",
    upperBoneId: bones.get("Near Hand")!.id,
    lowerBoneId: bones.get("Weapon Socket")!.id,
    layerIds: doc.characterParts
      .filter((p) => p.role === "weapon")
      .map((p) => p.layerId),
    mode: "rigid_segment",
    overlapSize: 0,
    underlapSize: 0,
    radius: 8,
    completion: "user_authored",
  });
  createSideReferenceClips(doc);
  const sideLayerIds = doc.layers.map((l) => l.id),
    sideBoneIds = doc.bones.map((b) => b.id),
    sideClipIds = doc.animationClips.map((c) => c.id);
  // Original separated artwork, rig, meshes and clips are retained, not flattened or overwritten.
  for (const key of [
    "assetReferences",
    "layers",
    "skeletons",
    "bones",
    "meshes",
    "vertexWeights",
    "attachments",
    "equipmentSlots",
    "ikTargets",
    "animationClips",
    "keyframeTracks",
    "animationEvents",
  ] as const) {
    (doc[key] as unknown[]) = [...front[key], ...doc[key]];
  }
  for (const l of front.layers)
    await registerPart(doc, l.id, "legacy_front", "center");
  doc.characterVariants = [
    {
      id: crypto.randomUUID(),
      name: "Front · original reference",
      view: "front",
      reference: true,
      rootBoneId: front.bones.find((b) => b.name === "Root")?.id ?? null,
      layerIds: front.layers.map((l) => l.id),
      boneIds: front.bones.map((b) => b.id),
      clipIds: front.animationClips.map((c) => c.id),
    },
    {
      id: crypto.randomUUID(),
      name: "Flame Knight · Side 3/4 Right · procedural",
      view: "side_3_4",
      reference: false,
      rootBoneId: bones.get("Root")!.id,
      layerIds: sideLayerIds,
      boneIds: sideBoneIds,
      clipIds: sideClipIds,
    },
  ];
  for (const p of doc.characterParts) {
    p.renderOrder = doc.layers.findIndex((l) => l.id === p.layerId);
    p.meshId = doc.meshes.find((m) => m.layerId === p.layerId)?.id ?? null;
  }
  doc.characterDefinitions[0].description =
    "Procedural side-scrolling 2D Battle Mage, 3/4 right-facing, white hair, black armor, red cape, flaming sword. Original front view retained as editable reference.";
  syncHierarchy(doc);
  return parseDocument(doc);
}
