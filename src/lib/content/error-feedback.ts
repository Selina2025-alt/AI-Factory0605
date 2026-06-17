export interface UserFacingError {
  code:
    | "balance_insufficient"
    | "model_timeout"
    | "search_failed"
    | "image_generation_failed"
    | "provider_busy"
    | "invalid_request"
    | "unknown_error";
  message: string;
  detail: string;
  retryable: boolean;
}

function normalizeErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown error";
}

export function toUserFacingError(error: unknown): UserFacingError {
  const detail = normalizeErrorMessage(error);
  const normalized = detail.toLowerCase();

  if (
    normalized.includes("insufficient") ||
    normalized.includes("insufficient_quota") ||
    normalized.includes("quota") ||
    normalized.includes("balance") ||
    normalized.includes("billing") ||
    normalized.includes("payment") ||
    normalized.includes("浣欓") ||
    normalized.includes("402")
  ) {
    return {
      code: "balance_insufficient",
      message: "余额不足，当前模型调用失败，请充值后重试。",
      detail,
      retryable: false
    };
  }

  if (
    normalized.includes("timed out") ||
    normalized.includes("timeout") ||
    normalized.includes("aborterror") ||
    normalized.includes("瓒呮椂")
  ) {
    return {
      code: "model_timeout",
      message: "模型响应超时，请稍后重试。",
      detail,
      retryable: true
    };
  }

  if (
    normalized.includes("search failed") ||
    normalized.includes("no relevant usable results") ||
    normalized.includes("鎼滅储澶辫触")
  ) {
    return {
      code: "search_failed",
      message: "联网搜索失败，请稍后重试或关闭搜索后继续生成。",
      detail,
      retryable: true
    };
  }

  if (
    normalized.includes("image request") ||
    normalized.includes("image generation") ||
    normalized.includes("鍥剧墖鐢熸垚") ||
    normalized.includes("download generated image") ||
    normalized.includes("xiaohongshu image")
  ) {
    return {
      code: "image_generation_failed",
      message: "图片生成失败，请重试或切换图片模型。",
      detail,
      retryable: true
    };
  }

  if (
    normalized.includes("system is too busy") ||
    normalized.includes("503") ||
    normalized.includes("too busy")
  ) {
    return {
      code: "provider_busy",
      message: "模型服务繁忙，请稍后重试。",
      detail,
      retryable: true
    };
  }

  if (
    normalized.includes("invalid") ||
    normalized.includes("bad request") ||
    normalized.includes("400")
  ) {
    return {
      code: "invalid_request",
      message: "请求参数不完整或格式有误，请检查后重试。",
      detail,
      retryable: false
    };
  }

  return {
    code: "unknown_error",
    message: "处理请求时出现未知错误，请稍后重试。",
    detail,
    retryable: true
  };
}
