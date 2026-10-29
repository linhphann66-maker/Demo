import {
  primarySlots,
  type ProjectDocument,
  type PartSlot,
} from "../../../packages/document-core/src";
import { slotTitles } from "../../../packages/character-builder/src/assembly";
export function BuilderReview({
  doc,
  disabled,
  choose,
  editMask,
}: {
  doc: ProjectDocument;
  disabled: boolean;
  choose: (slot: PartSlot, id: string | null) => void;
  editMask: (id: string) => void;
}) {
  const build = doc.characterBuild!;
  return (
    <>
      {(() => {
        const pending = build.candidates.filter(
          (c) =>
            !c.rejected &&
            c.label === "unknown" &&
            !Object.values(build.selection).includes(c.id) &&
            !(build.optionalAttachments ?? []).some(
              (a) => a.candidateId === c.id,
            ),
        );
        return (
          pending.length > 0 && (
            <details className="builder-review-queue">
              <summary>Ảnh cần bạn chọn bộ phận ({pending.length})</summary>
              <p>
                Chọn phần tương ứng cho từng ảnh. Các ảnh này chưa được tự gán
                vì chưa chắc chắn.
              </p>
              <div>
                {pending.map((c) => (
                  <article key={c.id}>
                    <img
                      alt={"Ảnh cần duyệt " + (build.candidates.indexOf(c) + 1)}
                      src={
                        doc.assetReferences.find(
                          (a) => a.id === c.previewAssetId,
                        )?.data
                      }
                    />
                    <select
                      aria-label={"Assign unclassified " + c.id}
                      value=""
                      disabled={disabled}
                      onChange={(e) => {
                        if (e.target.value)
                          choose(e.target.value as PartSlot, c.id);
                      }}
                    >
                      <option value="">Chọn bộ phận</option>
                      {primarySlots.map((slot) => (
                        <option key={slot} value={slot}>
                          {slotTitles[slot]}
                        </option>
                      ))}
                    </select>
                    <button disabled={disabled} onClick={() => editMask(c.id)}>
                      Sửa mask
                    </button>
                  </article>
                ))}
              </div>
            </details>
          )
        );
      })()}
      <div className="builder-slot-cards">
        {primarySlots.map((slot) => {
          const selected = build.candidates.find(
              (c) => c.id === build.selection[slot],
            ),
            asset = doc.assetReferences.find(
              (a) => a.id === selected?.previewAssetId,
            );
          const matches = build.candidates.filter(
            (c) =>
              !c.rejected &&
              c.label === slot &&
              !(build.optionalAttachments ?? []).some(
                (a) => a.candidateId === c.id,
              ) &&
              (!Object.values(build.selection).includes(c.id) ||
                c.id === selected?.id),
          );
          const choices = (
            selected
              ? [selected, ...matches.filter((c) => c.id !== selected.id)]
              : matches
          ).slice(0, 3);
          const alternatives = build.candidates.filter(
            (c) =>
              !c.rejected &&
              !choices.some((a) => a.id === c.id) &&
              !(build.optionalAttachments ?? []).some(
                (a) => a.candidateId === c.id,
              ),
          );
          return (
            <article key={slot} className={selected ? "" : "missing"}>
              <h4>{slotTitles[slot]}</h4>
              {selected?.provider?.id === "google-gemini" && (
                <p>
                  Gợi ý Gemini · {Math.round(selected.confidence * 100)}%
                  {build.aiReview?.needsReviewCandidateIds.includes(selected.id)
                    ? " · Cần bạn kiểm tra"
                    : " · Có thể tiếp tục"}
                </p>
              )}
              <div className="builder-slot-image">
                {asset ? (
                  <img src={asset.data} alt={"Đang chọn " + slotTitles[slot]} />
                ) : (
                  <span>Chưa chọn ảnh</span>
                )}
              </div>
              <select
                id={"builder-slot-" + slot}
                aria-label={"Slot " + slot}
                value={selected?.id ?? ""}
                disabled={disabled}
                onChange={(e) => choose(slot, e.target.value || null)}
              >
                <option value="">Chọn ảnh cho phần này</option>
                {choices.map((c) => (
                  <option key={c.id} value={c.id}>
                    Ảnh {build.candidates.indexOf(c) + 1}
                    {c.label === "unknown" ? " · cần duyệt" : ""}
                  </option>
                ))}
                {alternatives.length > 0 && (
                  <optgroup label="Ảnh khác · gán lại thủ công">
                    {alternatives.map((c) => (
                      <option key={c.id} value={c.id}>
                        Ảnh {build.candidates.indexOf(c) + 1}
                        {Object.values(build.selection).includes(c.id)
                          ? " · đang dùng cho phần khác"
                          : ""}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              <div>
                {selected &&
                  build.aiReview?.needsReviewCandidateIds.includes(
                    selected.id,
                  ) && (
                    <button
                      disabled={disabled}
                      onClick={() => choose(slot, selected.id)}
                    >
                      Xác nhận {slotTitles[slot]}
                    </button>
                  )}
                <button
                  disabled={disabled || !selected}
                  onClick={() => editMask(selected!.id)}
                >
                  Sửa mask
                </button>
                <button
                  disabled={disabled || !selected}
                  onClick={() => choose(slot, null)}
                >
                  Bỏ chọn
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
