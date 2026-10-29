import { create } from "zustand";
import type { ProjectDocument } from "../../document-core/src";
import type { CopiedKey, FiredEvent } from "../../animation-core/src";
export type Transition = {
  fromId: string;
  fromTime: number;
  elapsed: number;
  duration: number;
};
type AnimationState = {
  enabled: boolean;
  activeClipId: string | null;
  time: number;
  elapsed: number;
  displayTime: number;
  playing: boolean;
  speed: number;
  autoKey: boolean;
  snap: boolean;
  selectedKeys: string[];
  selectedTrackId: string | null;
  selectedEventId: string | null;
  clipboard: CopiedKey[];
  override: ProjectDocument | null;
  editVersion: number;
  startEvents: boolean;
  eventLog: FiredEvent[];
  transition: Transition | null;
  transitionDuration: number;
  audition: string[];
  auditionElapsed: number;
  onion: { enabled: boolean; previous: number; next: number; opacity: number };
  seek: (time: number) => void;
  pause: () => void;
  reset: () => void;
};
const initial = {
  enabled: false,
  activeClipId: null,
  time: 0,
  elapsed: 0,
  displayTime: 0,
  playing: false,
  speed: 1,
  autoKey: false,
  snap: true,
  selectedKeys: [],
  selectedTrackId: null,
  selectedEventId: null,
  clipboard: [],
  override: null,
  editVersion: 0,
  startEvents: true,
  eventLog: [],
  transition: null,
  transitionDuration: 0.25,
  audition: [],
  auditionElapsed: 0,
  onion: { enabled: false, previous: 1, next: 1, opacity: 0.18 },
};
export const useAnimation = create<AnimationState>((set, get) => ({
  ...initial,
  seek: (time) =>
    set({
      time,
      displayTime: time,
      override: null,
      playing: false,
      transition: null,
      editVersion: get().editVersion + 1,
      startEvents: false,
    }),
  pause: () =>
    set({
      playing: false,
      displayTime: get().time,
      editVersion: get().editVersion + 1,
    }),
  reset: () =>
    set({
      ...initial,
      onion: { ...initial.onion },
      selectedKeys: [],
      eventLog: [],
    }),
}));
