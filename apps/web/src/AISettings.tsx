import * as Dialog from "@radix-ui/react-dialog";
import { useState, useEffect } from "react";
import { aiRequest, aiSettings, AIRequestError } from "./ai-client";
import {
  VISION_MODEL,
  IMAGE_MODEL,
  type AISettings as Settings,
} from "../../../packages/ai-contracts/src/gemini";
const statusLabels: Record<string, string> = {
  not_configured: "Chưa cấu hình",
  not_tested: "Đã lưu · cần kiểm tra",
  connected: "Đã kết nối vision / JSON",
  invalid_key: "API key không hợp lệ",
  region_unavailable: "Khu vực backend không được Google hỗ trợ",
  key_expired: "Key hết hạn hoặc bị thu hồi",
  key_restricted: "Key bị giới hạn quyền gọi từ backend",
  api_disabled: "Gemini API chưa được bật / bị chặn",
  provider_request: "Google từ chối yêu cầu",
  model_unavailable: "Model không khả dụng",
  quota_exceeded: "Hết quota",
  billing_required: "Billing required",
  network_error: "Network error",
  server_error: "Server error",
  session_expired: "Phiên đã hết hạn",
};
export function AISettings({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<Settings | null>(null),
    [apiKey, setKey] = useState(""),
    [show, setShow] = useState(false),
    [vision, setVision] = useState(VISION_MODEL),
    [image, setImage] = useState(IMAGE_MODEL),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const receive = (s: Settings) => {
    setState(s);
    setVision(s.visionModel);
    setImage(s.imageModel);
    window.dispatchEvent(new Event("a2d-ai-settings"));
  };
  useEffect(() => {
    let alive = true;
    aiSettings()
      .then((s) => {
        if (alive) receive(s);
      })
      .catch((e) => {
        if (alive) setError(String(e.message));
      });
    return () => {
      alive = false;
    };
  }, []);
  const action = async (kind: "test" | "save" | "delete" | "models") => {
    setBusy(true);
    setError("");
    setMessage(kind === "test" ? "Đang kiểm tra..." : "Đang xử lý...");
    try {
      const s = await aiRequest<Settings>(
        kind === "models" ? "/models" : kind === "test" ? "/key/test" : "/key",
        {
          method:
            kind === "models"
              ? "GET"
              : kind === "delete"
                ? "DELETE"
                : kind === "test"
                  ? "POST"
                  : "PUT",
          ...(kind === "test" || kind === "save"
            ? {
                body: JSON.stringify({
                  apiKey: apiKey || null,
                  visionModel: vision,
                  imageModel: image,
                  persist: false,
                }),
              }
            : {}),
        },
      );
      receive(s);
      if (kind === "save" || kind === "delete") setKey("");
      setMessage(
        kind === "save"
          ? "Đã lưu key mã hóa trong phiên server."
          : kind === "delete"
            ? "Đã xóa key và hủy job đang chờ."
            : kind === "test"
              ? s.modelAvailability.vision
                ? "Vision và structured output đã kiểm tra bằng API thật."
                : "Vision model không có trong danh sách model của key này."
              : "Đã làm mới danh sách model thật.",
      );
    } catch (e) {
      setMessage("");
      setError(
        (e instanceof AIRequestError
          ? (statusLabels[e.code] ?? e.code) + ": "
          : "") + (e instanceof Error ? e.message : "Lỗi kết nối"),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog.Root
      open
      onOpenChange={(v) => {
        if (!v && !busy) {
          setKey("");
          onClose();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="ai-settings-overlay" />
        <Dialog.Content className="ai-settings-panel">
          <Dialog.Title>Cài đặt AI · Google Gemini</Dialog.Title>
          <Dialog.Description>
            API key được gửi tới backend cùng origin qua HTTPS. Key đã lưu không
            được trả lại trình duyệt.
          </Dialog.Description>
          <label>
            API key
            <input
              aria-label="Gemini API key"
              type={show ? "text" : "password"}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={apiKey}
              onChange={(e) => setKey(e.target.value)}
              placeholder={
                state?.configured
                  ? "Đã có key trên server · nhập để thay"
                  : "Nhập API key của bạn"
              }
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={show}
              onChange={(e) => setShow(e.target.checked)}
            />
            Hiện API key đang nhập
          </label>
          <label>
            Vision model
            <input
              aria-label="Gemini vision model"
              list="gemini-model-options"
              value={vision}
              onChange={(e) => setVision(e.target.value)}
            />
          </label>
          <label>
            Image model
            <input
              aria-label="Gemini image model"
              list="gemini-model-options"
              value={image}
              onChange={(e) => setImage(e.target.value)}
            />
          </label>
          <datalist id="gemini-model-options">
            {state?.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
              </option>
            ))}
          </datalist>
          <p>
            Không tự đổi model. Kiểm tra kết nối gọi danh sách model và một phép
            thử ảnh/JSON nhỏ, có thể phát sinh phí API Google. Chưa gửi ảnh nhân
            vật ở bước này.
          </p>
          <label title="Cần account authentication và database vault bền vững trước khi bật tính năng này.">
            <input type="checkbox" disabled />
            Lưu key cho các phiên sau (chưa hỗ trợ)
          </label>
          <p>{state?.reason ?? "Đang kết nối backend AI..."}</p>
          <div className="ai-settings-actions">
            <button
              disabled={busy || (!apiKey && !state?.configured)}
              onClick={() => void action("test")}
            >
              Kiểm tra kết nối
            </button>
            <button
              disabled={busy || (!apiKey && !state?.configured)}
              onClick={() => void action("save")}
            >
              Lưu API Key
            </button>
            <button
              disabled={busy || !state?.configured}
              onClick={() => void action("delete")}
            >
              Xóa API Key
            </button>
            <button
              disabled={busy || !state?.configured}
              onClick={() => void action("models")}
            >
              Làm mới danh sách model
            </button>
          </div>
          <p role="status">
            {busy
              ? "Đang kiểm tra / xử lý"
              : (statusLabels[state?.status ?? "not_configured"] ??
                state?.status)}{" "}
            {message}
          </p>
          {error && <p role="alert">{error}</p>}
          {state && (
            <>
              <h3>Khả năng đã xác minh</h3>
              <ul className="ai-capabilities">
                <li>
                  Vision model trong danh sách:{" "}
                  {state.modelAvailability.vision
                    ? "Có"
                    : "Chưa xác minh / không có"}
                </li>
                <li>
                  Image model trong danh sách:{" "}
                  {state.modelAvailability.image
                    ? "Có"
                    : "Chưa xác minh / không có"}
                </li>
                <li>
                  Đọc ảnh:{" "}
                  {state.capabilities.imageUnderstanding
                    ? "Đã thử thành công"
                    : "Chưa thử"}
                </li>
                <li>
                  Structured output:{" "}
                  {state.capabilities.structuredOutput
                    ? "Đã thử thành công"
                    : "Chưa thử"}
                </li>
                <li>
                  Tạo ảnh:{" "}
                  {state.capabilities.imageGeneration
                    ? "Đã thử thành công"
                    : "Chưa xác minh — chưa bật"}
                </li>
                <li>
                  Sửa ảnh:{" "}
                  {state.capabilities.imageEditing
                    ? "Đã thử thành công"
                    : "Chưa xác minh — chưa bật"}
                </li>
              </ul>
              <details>
                <summary>
                  Model khả dụng ({state.models.length}) và lịch sử sử dụng
                </summary>
                <ul>
                  {state.models.map((m) => (
                    <li key={m.id}>
                      {m.id} · {m.methods.join(", ")}
                    </li>
                  ))}
                </ul>
                {state.usage.map((u, i) => (
                  <p key={i}>
                    {u.operation} · {u.model} · {u.inputTokens}/{u.outputTokens}{" "}
                    tokens{u.cached ? " · bộ nhớ đệm" : ""}
                  </p>
                ))}
                <p>Không có giới hạn chi tiêu tiền tệ theo thời gian thực.</p>
              </details>
            </>
          )}
          <button
            disabled={busy}
            onClick={() => {
              setKey("");
              onClose();
            }}
          >
            Đóng cài đặt AI
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
