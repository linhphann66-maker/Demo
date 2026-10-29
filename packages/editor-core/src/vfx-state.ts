import { create } from "zustand";
export const useVFXSession = create<{
  quality: "low" | "medium" | "high";
  gizmos: boolean;
  warnings: string[];
  active: boolean;
  selectedEffectId: string | null;
}>(() => ({
  quality: "medium",
  gizmos: false,
  warnings: [],
  active: true,
  selectedEffectId: null,
}));

export const vfxClipboard: {
  current: {
    channel: import("../../vfx-core/src/schema").VFXTrack["channel"];
    keys: import("../../vfx-core/src/schema").VFXKey[];
  } | null;
} = { current: null };
