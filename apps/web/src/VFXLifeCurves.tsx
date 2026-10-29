import {
  type VFXEffect,
  type Emitter,
  type VFXKey,
} from "../../../packages/vfx-core/src";
import { linearCurve } from "../../../packages/vfx-core/src/curves";
export function VFXLifeCurves({
  node,
  index,
  edit,
}: {
  node: Emitter;
  index: number;
  edit: (label: string, fn: (e: VFXEffect) => void) => void;
}) {
  const update = (
    key: "scaleOverLife" | "opacityOverLife" | "colorOverLife",
    fn: (keys: VFXKey[]) => void,
  ) =>
    edit("Lifetime curve", (e) => {
      const keys = e.nodes[index][key];
      if (keys) fn(keys);
    });
  return (
    <details>
      <summary>Đường cong theo tuổi hạt (0–1)</summary>
      {(["scaleOverLife", "opacityOverLife", "colorOverLife"] as const).map(
        (key) => (
          <fieldset key={key}>
            <legend>{key}</legend>
            {!node[key] ? (
              <button
                onClick={() =>
                  edit("Tạo lifetime curve", (e) => {
                    e.nodes[index][key] =
                      key === "colorOverLife"
                        ? [
                            {
                              id: crypto.randomUUID(),
                              time: 0,
                              value: node.color,
                              interpolation: "linear",
                            },
                            {
                              id: crypto.randomUUID(),
                              time: 1,
                              value: node.endColor,
                              interpolation: "linear",
                            },
                          ]
                        : linearCurve(
                            1,
                            key === "scaleOverLife" ? node.endScale : 0,
                          );
                  })
                }
              >
                Tạo curve chỉnh sửa
              </button>
            ) : (
              <>
                <button
                  disabled={node[key]!.length >= 32}
                  onClick={() =>
                    update(key, (keys) => {
                      const sorted = [...keys].sort((a, b) => a.time - b.time);
                      let gap = 0,
                        time = 0.5;
                      for (let i = 1; i < sorted.length; i++)
                        if (sorted[i].time - sorted[i - 1].time > gap) {
                          gap = sorted[i].time - sorted[i - 1].time;
                          time = (sorted[i].time + sorted[i - 1].time) / 2;
                        }
                      keys.push({
                        id: crypto.randomUUID(),
                        time,
                        value: key === "colorOverLife" ? node.color : 1,
                        interpolation: "linear",
                      });
                      keys.sort((a, b) => a.time - b.time);
                    })
                  }
                >
                  + Điểm curve
                </button>
                {node[key]!.map((k) => (
                  <div key={k.id}>
                    <label>
                      Tuổi chuẩn hóa
                      <input
                        type="number"
                        min={0}
                        max={1}
                        step={0.01}
                        value={k.time}
                        onChange={(e) => {
                          if (Number.isFinite(e.target.valueAsNumber))
                            update(key, (keys) => {
                              keys.find((n) => n.id === k.id)!.time = Math.max(
                                0,
                                Math.min(1, e.target.valueAsNumber),
                              );
                              keys.sort((a, b) => a.time - b.time);
                            });
                        }}
                      />
                    </label>
                    <label>
                      Giá trị
                      <input
                        type={key === "colorOverLife" ? "color" : "number"}
                        min={0}
                        max={key === "opacityOverLife" ? 1 : 5}
                        step={0.05}
                        value={k.value}
                        onChange={(e) =>
                          update(key, (keys) => {
                            keys.find((n) => n.id === k.id)!.value =
                              key === "colorOverLife"
                                ? e.target.value
                                : Math.max(
                                    0,
                                    Math.min(
                                      key === "opacityOverLife" ? 1 : 5,
                                      e.target.valueAsNumber,
                                    ),
                                  );
                          })
                        }
                      />
                    </label>
                    <select
                      value={k.interpolation}
                      onChange={(e) =>
                        update(key, (keys) => {
                          keys.find((n) => n.id === k.id)!.interpolation = e
                            .target.value as VFXKey["interpolation"];
                        })
                      }
                    >
                      {["linear", "stepped", "bezier"].map((i) => (
                        <option key={i}>{i}</option>
                      ))}
                    </select>
                    <button
                      disabled={node[key]!.length <= 2}
                      onClick={() =>
                        update(key, (keys) => {
                          keys.splice(
                            keys.findIndex((n) => n.id === k.id),
                            1,
                          );
                        })
                      }
                    >
                      Xóa điểm
                    </button>
                  </div>
                ))}
                <button
                  onClick={() =>
                    edit("Reset lifetime curve", (e) => {
                      delete e.nodes[index][key];
                    })
                  }
                >
                  Reset về tuyến tính mặc định
                </button>
              </>
            )}
          </fieldset>
        ),
      )}
    </details>
  );
}
