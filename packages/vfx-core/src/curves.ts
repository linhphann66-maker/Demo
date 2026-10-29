import type { VFXKey } from "./extended-schema";
export function linearCurve(start: number, end: number): VFXKey[] {
  return [
    { id: crypto.randomUUID(), time: 0, value: start, interpolation: "linear" },
    { id: crypto.randomUUID(), time: 1, value: end, interpolation: "linear" },
  ];
}
