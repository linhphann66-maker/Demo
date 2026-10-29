/** Provider diagnostics may be shown only after removing credentials and URLs. */
export function googleDiagnostic(
  error: unknown,
  key = "",
): { code: string; message: string; status: number } | null {
  const e = error as { status?: number; code?: number; message?: string };
  const status = Number(e?.status ?? e?.code);
  if (![400, 401, 402, 403, 404, 429].includes(status)) return null;
  let message = typeof e.message === "string" ? e.message : "";
  try {
    const parsed = JSON.parse(message);
    message =
      typeof parsed.error?.message === "string"
        ? parsed.error.message
        : typeof parsed.message === "string"
          ? parsed.message
          : message;
  } catch {
    /* Some SDK errors have plain-text provider messages. */
  }
  if (
    /location.*not supported|unsupported.*location|region.*not supported/i.test(
      message,
    )
  )
    return {
      code: "region_unavailable",
      message:
        "Google không hỗ trợ vị trí/khu vực của backend hiện tại. Đổi model hoặc công khai site không giải quyết được giới hạn này.",
      status: 400,
    };
  if (/expired|API_KEY_EXPIRED|reported as leaked|key.*revoked/i.test(message))
    return {
      code: "key_expired",
      message:
        "Google báo key đã hết hạn, bị thu hồi hoặc bị đánh dấu lộ. Tạo key mới trong Google AI Studio và thay key đang lưu.",
      status: 401,
    };
  if (
    /API_KEY_HTTP_REFERRER_BLOCKED|referer.*blocked|referrer.*blocked|API_KEY_IP_ADDRESS_BLOCKED|IP address.*blocked/i.test(
      message,
    )
  )
    return {
      code: "key_restricted",
      message:
        "Key bị giới hạn website/IP. Lời gọi Gemini xuất phát từ backend; kiểm tra Application restrictions của key trong Google Cloud.",
      status: 403,
    };
  if (
    /SERVICE_DISABLED|API_KEY_SERVICE_BLOCKED|has not been used.*before|API.*not enabled/i.test(
      message,
    )
  )
    return {
      code: "api_disabled",
      message:
        "Gemini API chưa được bật hoặc bị giới hạn trong project của key. Kiểm tra Generative Language API và API restrictions trong Google Cloud.",
      status: 403,
    };
  if (
    status === 400 &&
    /API_KEY_INVALID|api key not valid|invalid api key|API key not found/i.test(
      message,
    )
  )
    return {
      code: "invalid_key",
      message:
        "Google không chấp nhận API key này. Kiểm tra key Gemini trong Google AI Studio.",
      status: 401,
    };
  if (status !== 400) return null;
  if (!key) message = ""; // No credential-aware redaction context: never echo arbitrary provider text.
  for (const secret of [key, encodeURIComponent(key)].filter(Boolean))
    message = message.split(secret).join("[KEY ĐÃ ẨN]");
  message = message
    .replace(/AIza[A-Za-z0-9_-]{10,}/g, "[KEY ĐÃ ẨN]")
    .replace(/https?:\/\/[^\s"<>]+/g, "[URL ĐÃ ẨN]")
    .slice(0, 320);
  message = Array.from(message, (c) =>
    c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? " " : c,
  ).join("");
  return {
    code: "provider_request",
    message:
      "Google trả HTTP 400 (yêu cầu không hợp lệ)." +
      (message ? " Chi tiết đã lọc: " + message : ""),
    status: 400,
  };
}
