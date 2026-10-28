import {
  parseDocument,
  type ProjectDocument,
} from "../../../packages/document-core/src";
const uuid = (n: number) =>
  `a2d00000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
const shapes = [
  {
    name: "Áo choàng đỏ",
    en: "Crimson cape",
    x: 247,
    y: 233,
    w: 306,
    h: 376,
    color: "#9f283d",
    s: `<path d="M71 2 229 2 264 112 302 351 235 324 186 374 144 330 79 364 6 325 46 112Z" fill="url(#red)"/><path d="M74 22 45 302 99 283 125 57M222 20 261 303 196 274 180 65" fill="#541d32" opacity=".8"/><path d="m90 70-18 238 61-39-3-178M209 66l31 258-56-55 2-176" fill="#c44453" opacity=".45"/>`,
  },
  {
    name: "Chân trái",
    en: "Left leg",
    x: 317,
    y: 414,
    w: 81,
    h: 224,
    color: "#4b526c",
    s: `<path d="m15 0 61 4-5 94-12 79 13 32-18 13-51-3 6-49 8-77Z" fill="url(#metal)"/><path d="m18 101 50-5-5 45-20 13-22-13Z" fill="#7d8298"/><path d="m24 111 31-4-6 24-16 8Z" fill="#313443"/><path d="m10 174 46 0 9 31-19 9-39-3Z" fill="#222534"/><path d="m16 181 31 1M24 13 61 13 55 77 27 83" fill="none" stroke="#b9a6a1" stroke-width="3"/>`,
  },
  {
    name: "Chân phải",
    en: "Right leg",
    x: 401,
    y: 414,
    w: 81,
    h: 224,
    color: "#4b526c",
    s: `<path d="m5 4 61-4 6 93 8 77 0 49-51 3-18-13 13-32-12-79Z" fill="url(#metal)"/><path d="m12 96 50 5-3 40-22 13-20-13Z" fill="#7d8298"/><path d="m25 107 31 4-8 28-10-8Z" fill="#313443"/><path d="m25 174 46 0 4 37-39 3-19-9Z" fill="#222534"/><path d="m34 182 30-1M18 13 55 13 52 83 25 77" fill="none" stroke="#b9a6a1" stroke-width="3"/>`,
  },
  {
    name: "Giáp thân",
    en: "Chest armor",
    x: 313,
    y: 240,
    w: 174,
    h: 206,
    color: "#535b70",
    s: `<path d="m40 1 95 0 36 43-19 89 12 62-77 9-76-9 12-62L3 44Z" fill="url(#metal)"/><path d="m16 45 43-21 28 24 28-24 43 21-13 62-58 26-58-26Z" fill="#353c50"/><path d="m16 45 43-21 28 24 28-24 43 21-71 43Z" fill="#778095"/><path d="m26 57 46 33 8 30-46-22M148 57l-46 33-8 30 46-22" fill="#202636"/><path d="m87 49 12 32-12 23-12-23Z" fill="#e5a873"/><path d="m87 57 5 24-5 10-5-10Z" fill="#ff7256"/><path d="M28 123 87 143 147 123M26 143 87 160 150 143" fill="none" stroke="#8d8290" stroke-width="3"/><path d="m13 170 74 10 74-10-1 22-73 9-73-9Z" fill="#161e2c"/><path d="m75 174 25 0 4 23-33 0Z" fill="#c49768"/><path d="m80 179 15 0 1 13-17 0Z" fill="#4d3540"/>`,
  },
  {
    name: "Tay trái",
    en: "Left arm",
    x: 264,
    y: 267,
    w: 69,
    h: 202,
    color: "#555c73",
    s: `<path d="m22 0 46 10-12 62-9 61 3 38-13 26-29-9-6-35 15-59Z" fill="url(#metal)"/><path d="m12 87 42 8-9 32-36-5Z" fill="#9b8e9c"/><path d="m9 131 36 7 0 37-17 17-21-13Z" fill="#292c3e"/><path d="m17 140 18 5-4 25M27 14 51 19 42 65" fill="none" stroke="#b6a5ad" stroke-width="3"/>`,
  },
  {
    name: "Tay phải",
    en: "Right arm",
    x: 467,
    y: 267,
    w: 69,
    h: 202,
    color: "#555c73",
    s: `<path d="m1 10 46-10 5 94 15 59-6 35-29 9-13-26 3-38-9-61Z" fill="url(#metal)"/><path d="m15 95 42-8 3 35-36 5Z" fill="#9b8e9c"/><path d="m24 138 36-7 2 48-21 13-17-17Z" fill="#292c3e"/><path d="m34 145 18-5-4 30M18 19 42 14 40 65" fill="none" stroke="#b6a5ad" stroke-width="3"/>`,
  },
  {
    name: "Giáp vai trái",
    en: "Left pauldron",
    x: 262,
    y: 244,
    w: 91,
    h: 69,
    color: "#787c94",
    s: `<path d="m5 22 42-19 40 20-15 36-44 5-25-16Z" fill="url(#metal)"/><path d="m7 23 40-20 40 20-42 14Z" fill="#8a91a7"/><path d="m9 32 35 13 34-12-10 21-37 6Z" fill="#34394d"/><path d="m17 21 29-12 24 13-27 8Z" fill="#b4a6aa"/>`,
  },
  {
    name: "Giáp vai phải",
    en: "Right pauldron",
    x: 448,
    y: 244,
    w: 91,
    h: 69,
    color: "#787c94",
    s: `<path d="m5 22 42-19 40 20-15 36-44 5-25-16Z" fill="url(#metal)"/><path d="m7 23 40-20 40 20-42 14Z" fill="#8a91a7"/><path d="m9 32 35 13 34-12-10 21-37 6Z" fill="#34394d"/><path d="m17 21 29-12 24 13-27 8Z" fill="#b4a6aa"/>`,
  },
  {
    name: "Khăn cổ",
    en: "Neck scarf",
    x: 344,
    y: 212,
    w: 112,
    h: 56,
    color: "#bd4051",
    s: `<path d="m12 3 87 0 10 29-27 18-35 3-43-26Z" fill="url(#red)"/><path d="m14 12 36 19 45-14M24 25 56 40 92 28" fill="none" stroke="#e46a6a" stroke-width="3"/><path d="m10 29 18 8-12 15-13-5Z" fill="#e4b189"/>`,
  },
  {
    name: "Khuôn mặt",
    en: "Face",
    x: 354,
    y: 143,
    w: 94,
    h: 99,
    color: "#ebc2ad",
    s: `<path d="m4 10 83 0 4 41-13 30-31 16-29-16L5 51Z" fill="#dfad9b"/><path d="m13 16 68 0-1 41-14 22-19 11-22-16-12-24Z" fill="#f4d1ba"/><path d="m14 39 24 4-8 8-14-3M78 39l-24 4 8 8 14-3" fill="#fff1df"/><path d="m26 43 5 0 0 7-5 0M64 43h5v7h-5" fill="#d65146"/><path d="m14 35 25 4M78 35l-24 4" stroke="#6f5961" stroke-width="3"/><path d="m46 45-4 16 8 0M38 74l17 0" fill="none" stroke="#b37c75" stroke-width="2"/>`,
  },
  {
    name: "Tóc trắng",
    en: "White hair",
    x: 334,
    y: 100,
    w: 133,
    h: 117,
    color: "#dce2ed",
    s: `<path d="m9 37 19-21 20 1 15-14 22 10 20-1 15 20 9 23-9 47-16-18-10 19-8-43-12 25-13-34-14 32-9-19-16 37-13-27-5-14Z" fill="#b9c3d7"/><path d="m13 40 27-20 20-7 24 5 16-1 17 24-15 32-7-29-12 22-14-30-10 29-12-20-15 30-2-29-16 27Z" fill="#edf0f8"/><path d="m27 30 21-6-15 25M58 23 69 16 82 40M89 22l12 4 8 22" fill="none" stroke="#ffffff" stroke-width="5"/><path d="m9 51-4 25 13 25 1-31M119 55l3 25-12 19-6-28" fill="#8b99b2"/>`,
  },
  {
    name: "Lưỡi kiếm",
    en: "Sword blade",
    x: 529,
    y: 224,
    w: 48,
    h: 258,
    color: "#eeaf71",
    s: `<path d="m24 2 16 32-2 214-14 8-14-8-2-214Z" fill="#bd725c"/><path d="m24 6 10 30-1 207-9 7Z" fill="#ffead0"/><path d="m24 6-10 30 1 207 9 7Z" fill="#d3b8b0"/><path d="M24 40v196" stroke="#eeb284" stroke-width="2"/>`,
  },
  {
    name: "Chuôi kiếm",
    en: "Sword hilt",
    x: 510,
    y: 458,
    w: 86,
    h: 99,
    color: "#d7a568",
    s: `<path d="m36 18 15 0 0 61-15 0Z" fill="#3a3040"/><path d="m35 29 18 9M35 43l18 9M35 57l18 9" stroke="#ba8262" stroke-width="3"/><path d="m5 7 30 9 9-9 9 9 28-9-6 23-24-4-7 9-8-9-24 4Z" fill="#e0aa6e"/><path d="m34 80 10-7 13 7-4 13-18-1Z" fill="#c9a17b"/><path d="m40 12 5-3 7 10-8 9-7-9Z" fill="#dc5658"/>`,
  },
  {
    name: "Lửa kiếm · mẫu tĩnh",
    en: "Sword flame · static sample",
    x: 500,
    y: 174,
    w: 100,
    h: 282,
    color: "#fa7c3b",
    s: `<path d="M48 3C77 49 40 66 77 103 70 76 84 68 90 62 80 115 108 139 81 191 91 156 70 154 69 138 64 181 80 194 60 238L56 279 39 269C22 240 43 213 23 186 10 165 16 136 27 125 20 168 47 165 37 132 20 97 45 76 35 54 56 70 46 92 51 102 73 66 35 38 48 3Z" fill="#f54e28" opacity=".75" stroke="none"/><path d="M51 70C77 104 46 130 65 162 69 143 79 147 75 136 93 180 62 206 61 245L48 272 41 238C35 217 51 194 37 176 30 162 36 153 41 145 34 182 61 169 49 141 38 118 60 103 51 70Z" fill="#ffae3b" stroke="none"/><path d="M54 145C69 177 48 196 58 214L50 263 46 228C41 207 56 197 49 180Z" fill="#fff2a2" stroke="none"/><path d="m13 98 4-10 5 9-4 8ZM86 215l4-11 4 10-5 8ZM31 46l4-11 3 9-4 8Z" fill="#ffb857" stroke="none"/>`,
  },
];
export const demoColors = shapes.map((s) => s.color);
async function raster(svg: string, w: number, h: number): Promise<string> {
  const image = new Image();
  image.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  await image.decode();
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d")!.drawImage(image, 0, 0);
  return c.toDataURL("image/png");
}
export async function createDemo(): Promise<ProjectDocument> {
  const now = "2026-01-01T00:00:00.000Z";
  const assets = await Promise.all(
    shapes.map(async (s, i) => ({
      id: uuid(100 + i),
      name: s.en,
      provenance: "procedural" as const,
      kind: "source" as const,
      dependencies: [],
      width: s.w,
      height: s.h,
      data: await raster(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${s.w}" height="${s.h}" viewBox="0 0 ${s.w} ${s.h}"><defs><linearGradient id="metal" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#68748d"/><stop offset=".45" stop-color="#373e53"/><stop offset="1" stop-color="#1b2031"/></linearGradient><linearGradient id="red" x1="0" x2="1" y2="1"><stop stop-color="#d65c64"/><stop offset=".45" stop-color="#9d2c43"/><stop offset="1" stop-color="#571e33"/></linearGradient></defs><g stroke="#202333" stroke-width="2" stroke-linejoin="round">${s.s}</g></svg>`,
        s.w,
        s.h,
      ),
    })),
  );
  const layers = shapes.map((s, i) => ({
    id: uuid(200 + i),
    assetId: uuid(100 + i),
    parentId: null,
    name: s.name,
    visible: true,
    locked: false,
    opacity: 1,
    x: s.x,
    y: s.y,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
  }));
  return parseDocument({
    schemaVersion: 1,
    projectId: uuid(1),
    metadata: {
      name: "Flame Knight",
      createdAt: now,
      updatedAt: now,
      revision: 0,
    },
    characterDefinitions: [
      {
        id: uuid(2),
        name: "Flame Knight",
        class: "Battle Mage",
        style: "2D anime",
        description:
          "White hair, black armor, red cape, flaming sword. Front-facing neutral pose.",
        plannedAnimations: ["Idle", "Walk", "Run", "Attack", "Hurt"],
        autoRig: true,
        autoMesh: true,
        autoVfx: true,
      },
    ],
    assetReferences: assets,
    layers,
    hierarchy: layers.map((l) => ({ layerId: l.id, parentId: l.parentId })),
    skeletons: [],
    bones: [],
    meshes: [],
    vertexWeights: [],
    equipmentSlots: [],
    attachments: [],
    animationClips: [],
    keyframeTracks: [],
    animationEvents: [],
    vfxGraphs: [],
    aiJobReferences: [],
    revisionHistory: [],
  });
}
