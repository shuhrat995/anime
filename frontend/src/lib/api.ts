export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";

export type CatalogItem = {
  id: string;
  name: string;
  slug: string;
};

export type User = {
  id: string;
  email: string;
  role: "user" | "dubber" | "admin";
  displayName: string;
  avatarKey: string | null;
  emailVerified: boolean;
  createdAt: string;
};

export type Tokens = {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresIn: string;
};

export type AuthResult = {
  user: User;
  tokens: Tokens;
};

export type Anime = {
  id: string;
  title: string;
  slug: string;
  synopsis: string;
  releaseYear: number | null;
  status: "draft" | "published" | "archived";
  owner: { id: string; displayName: string };
  studio: { id: string; name: string } | null;
  coverKey: string | null;
  bannerKey: string | null;
  genres: CatalogItem[];
  tags: CatalogItem[];
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Episode = {
  id: string;
  animeId: string;
  number: number;
  title: string;
  description: string;
  status: "draft" | "published" | "processing" | "failed";
  durationSeconds: number | null;
  thumbnailKey: string | null;
  publishedAt: string | null;
};

export type PlaybackTicket = {
  playbackPath: string;
  expiresIn: number;
  durationSeconds: number | null;
};

export type Favorite = {
  id: string;
  title: string;
  slug: string;
  cover_key: string | null;
  added_at: string;
};

export type WatchHistory = {
  episode_id: string;
  position_seconds: number;
  completed_at: string | null;
  updated_at: string;
  episode_number: number;
  episode_title: string;
  anime_id: string;
  anime_title: string;
  anime_slug: string;
};

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  message: string;
};

type ApiFailure = {
  success: false;
  error?: { code?: string; message?: string };
  message?: string;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  accessToken?: string,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError("Ulanishda muammo yuz berdi. Internet aloqangizni tekshiring.", 0, "NETWORK_ERROR");
  }

  const payload = (await response.json().catch(() => null)) as
    | ApiEnvelope<T>
    | ApiFailure
    | null;

  if (!response.ok || !payload || !payload.success) {
    const failure = payload as ApiFailure | null;
    throw new ApiError(
      failure?.error?.message ?? failure?.message ?? "So‘rov bajarilmadi.",
      response.status,
      failure?.error?.code,
    );
  }

  return (payload as ApiEnvelope<T>).data;
}
