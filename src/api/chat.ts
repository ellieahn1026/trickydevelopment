import {
  fetchLocalApi,
  LOCAL_API_CONNECTION_ERROR,
  resolveLocalApiCandidates,
} from "../../lib/resolve-local-api.ts";

export type ChatApiRequest = {
  sessionId: string;
  message: string;
};

export type ChatApiEmotion = {
  mood: string;
  intensity: number;
};

export type ChatApiResponse = {
  message: string;
  emotion?: ChatApiEmotion;
};

export type ChatApiError = {
  error: string;
};

type ImportMetaEnv = ImportMeta & {
  env?: {
    CHAT_API_URL?: string;
    PEPPER_CHAT_API_URL?: string;
  };
};

function readEnvChatApiUrl(): string | null {
  if (typeof import.meta === "undefined") {
    return null;
  }

  const env = (import.meta as ImportMetaEnv).env;
  const configured = env?.CHAT_API_URL?.trim() || env?.PEPPER_CHAT_API_URL?.trim();
  return configured || null;
}

function readRuntimeChatApiUrl(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const runtimeUrl = (
    window as Window & { __PEPPER_CHAT_API_URL__?: string }
  ).__PEPPER_CHAT_API_URL__?.trim();

  return runtimeUrl || null;
}

/** Resolves the chat API URL for the current page context. */
export function resolveChatApiCandidates(): string[] {
  const configured = readEnvChatApiUrl() ?? readRuntimeChatApiUrl();
  if (configured) {
    return [configured];
  }

  return resolveLocalApiCandidates("/chat");
}

async function requestChat(
  url: string,
  request: ChatApiRequest,
): Promise<ChatApiResponse> {
  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });
  } catch {
    throw new Error(LOCAL_API_CONNECTION_ERROR);
  }

  let payload: ChatApiResponse | ChatApiError;

  try {
    payload = (await response.json()) as ChatApiResponse | ChatApiError;
  } catch {
    throw new Error(
      `Chat request failed (${response.status}). 서버가 실행 중인지 확인해 주세요.`,
    );
  }

  if (!response.ok) {
    const errorMessage =
      "error" in payload && payload.error
        ? payload.error
        : `Chat request failed (${response.status}).`;
    throw new Error(errorMessage);
  }

  return payload as ChatApiResponse;
}

export async function postChat(request: ChatApiRequest): Promise<ChatApiResponse> {
  const configured = readEnvChatApiUrl() ?? readRuntimeChatApiUrl();
  if (configured) {
    return requestChat(configured, request);
  }

  try {
    const response = await fetchLocalApi("/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    let payload: ChatApiResponse | ChatApiError;

    try {
      payload = (await response.json()) as ChatApiResponse | ChatApiError;
    } catch {
      throw new Error(
        `Chat request failed (${response.status}). 서버가 실행 중인지 확인해 주세요.`,
      );
    }

    if (!response.ok) {
      const errorMessage =
        "error" in payload && payload.error
          ? payload.error
          : `Chat request failed (${response.status}).`;
      throw new Error(errorMessage);
    }

    return payload as ChatApiResponse;
  } catch (error) {
    if (error instanceof Error && error.message === LOCAL_API_CONNECTION_ERROR) {
      throw error;
    }
    throw error instanceof Error ? error : new Error(LOCAL_API_CONNECTION_ERROR);
  }
}
