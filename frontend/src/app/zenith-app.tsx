"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type Hls from "hls.js";
import {
  type CSSProperties,
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "./auth-context";
import {
  API_BASE,
  apiFetch,
  ApiError,
  type Anime,
  type CatalogItem,
  type Episode,
  type Favorite,
  type PlaybackTicket,
  type WatchHistory,
} from "@/lib/api";

const detailsHref = (slug: string) => `/details/${encodeURIComponent(slug)}`;
const watchHref = (slug: string, episodeId: string) =>
  `/watch/${encodeURIComponent(slug)}/${encodeURIComponent(episodeId)}`;

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Kutilmagan xatolik yuz berdi.";

const playbackErrorMessage = (error: unknown) => {
  if (!(error instanceof ApiError)) return errorMessage(error);
  if (error.status === 403) return "Bu anime yopiq — uni ko‘rish uchun sizda ruxsat yo‘q. Ruxsat olish uchun administratorga murojaat qiling.";
  if (error.status === 401) return "Seansingiz muddati tugadi. Iltimos, hisobingizga qaytadan kiring.";
  if (error.status === 404) return "Bu epizodning videosi hali tayyor emas.";
  return errorMessage(error);
};

// How many times a playing episode may silently fetch a fresh link before we surface an error.
const MAX_PLAYBACK_RENEWALS = 2;

const formatDuration = (seconds: number | null) => {
  if (!seconds) return "Davomiyligi ko‘rsatilmagan";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

const accentFor = (value: string) => {
  const palette = ["#8357ff", "#ec5b99", "#16b7a8", "#ee8c4c", "#4f8cff", "#d65bd5"];
  const index = [...value].reduce((sum, character) => sum + character.charCodeAt(0), 0) % palette.length;
  return palette[index];
};

function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="zenith">
      <Nav />
      <main>{children}</main>
      <footer className="footer">
        <div>
          <b>Zenith</b>
          <p>Eng sara animelar, shaxsiy ro‘yxatingiz va ko‘rish tarixi — barchasi bir joyda, bir zumda.</p>
        </div>
        <span>Zenith · Anime olami</span>
      </footer>
    </div>
  );
}

function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const { ready, user } = useAuth();
  const [query, setQuery] = useState("");
  const links = [
    ["/", "Bosh sahifa"],
    ["/browse", "Katalog"],
    ["/library", "Kutubxonam"],
  ] as const;

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const search = query.trim();
    router.push(search ? `/browse?search=${encodeURIComponent(search)}` : "/browse");
  };

  return (
    <header className="topbar">
      <Link className="brand" href="/" aria-label="Zenith bosh sahifasi">
        <span className="brand-mark">Z</span>
        <span>Zenith</span>
      </Link>
      <nav aria-label="Asosiy navigatsiya">
        {links.map(([href, label]) => {
          const active = href === "/" ? pathname === href : pathname.startsWith(href);
          return (
            <Link className={active ? "active" : ""} href={href} key={href}>
              {label}
            </Link>
          );
        })}
      </nav>
      <form className="search" onSubmit={submitSearch}>
        <input
          aria-label="Anime qidirish"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Anime qidiring..."
          value={query}
        />
        <button type="submit">Qidirish</button>
      </form>
      {!ready ? (
        <span className="nav-status">Yuklanmoqda...</span>
      ) : user ? (
        <Link className="account-link" href="/account">
          <span className="avatar-initials">{initials(user.displayName)}</span>
          <span>{user.displayName}</span>
        </Link>
      ) : (
        <Link className="account-link sign-in-link" href="/login">
          Kirish
        </Link>
      )}
    </header>
  );
}

function StatePanel({ title, children, tone = "default" }: { title: string; children: ReactNode; tone?: "default" | "error" }) {
  return (
    <section className={`state-panel ${tone === "error" ? "state-error" : ""}`}>
      <h2>{title}</h2>
      <div>{children}</div>
    </section>
  );
}

function Poster({ anime, compact = false }: { anime: Anime; compact?: boolean }) {
  return (
    <div
      className={`poster ${compact ? "poster-compact" : ""}`}
      style={{ "--poster-accent": accentFor(anime.title) } as CSSProperties}
      aria-hidden="true"
    >
      <span>{initials(anime.title)}</span>
      <small>{anime.genres[0]?.name ?? "Anime"}</small>
    </div>
  );
}

function AnimeCard({ anime }: { anime: Anime }) {
  return (
    <article className="anime-card">
      <Link href={detailsHref(anime.slug)}>
        <Poster anime={anime} />
      </Link>
      <div className="card-copy">
        <div className="card-meta">
          <span>{anime.releaseYear ?? "Yili yo‘q"}</span>
          <span>{anime.studio?.name ?? "Studio ko‘rsatilmagan"}</span>
        </div>
        <h3>
          <Link href={detailsHref(anime.slug)}>{anime.title}</Link>
        </h3>
        <p>{anime.synopsis || "Tavsif hali qo‘shilmagan."}</p>
        <Link className="text-link" href={detailsHref(anime.slug)}>
          Tafsilotlarni ochish
        </Link>
      </div>
    </article>
  );
}

function LoadingCards() {
  return (
    <div className="catalog-grid" aria-label="Katalog yuklanmoqda">
      {[1, 2, 3, 4].map((item) => <div className="skeleton-card" key={item} />)}
    </div>
  );
}

export function HomeView() {
  const { ready, request, user } = useAuth();
  const [anime, setAnime] = useState<Anime[]>([]);
  const [history, setHistory] = useState<WatchHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [catalog, watchHistory] = await Promise.all([
          apiFetch<Anime[]>("/anime?limit=12"),
          ready && user ? request<WatchHistory[]>("/users/me/history") : Promise.resolve([]),
        ]);
        if (!cancelled) {
          setAnime(catalog);
          setHistory(watchHistory);
        }
      } catch (loadError) {
        if (!cancelled) setError(errorMessage(loadError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [ready, request, user]);

  const genres = useMemo(
    () => Array.from(new Map(anime.flatMap((item) => item.genres).map((genre) => [genre.slug, genre])).values()).slice(0, 7),
    [anime],
  );

  return (
    <AppShell>
      <section className="home-hero">
        <p className="eyebrow">Anime olami</p>
        <h1>Sevimli animelaringizni kashf eting va bir zumda tomosha qiling.</h1>
        <p>Kuchli qidiruv, shaxsiy sevimlilar ro‘yxati va ko‘rish tarixi — har qanday qurilmada doim siz bilan.</p>
        <div className="hero-actions">
          <Link className="primary-action" href="/browse">Katalogni ochish</Link>
          {!user && <Link className="secondary-action" href="/register">Hisob yaratish</Link>}
        </div>
      </section>

      {genres.length > 0 && (
        <section className="content-section">
          <div className="section-head">
            <div>
              <p className="eyebrow">Janrlar</p>
              <h2>Tezkor tanlash</h2>
            </div>
          </div>
          <div className="genre-chips">
            {genres.map((genre) => (
              <Link href={`/browse?genre=${encodeURIComponent(genre.slug)}`} key={genre.id}>
                {genre.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      {user && history.length > 0 && (
        <section className="content-section">
          <div className="section-head">
            <div>
              <p className="eyebrow">Ko‘rish tarixi</p>
              <h2>Davom ettiring</h2>
            </div>
            <Link className="text-link" href="/library">Barchasini ko‘rish</Link>
          </div>
          <div className="history-row">
            {history.slice(0, 4).map((item) => (
              <Link className="history-card" href={watchHref(item.anime_slug, item.episode_id)} key={item.episode_id}>
                <span className="history-number">{item.episode_number}</span>
                <strong>{item.anime_title}</strong>
                <small>{item.episode_title}</small>
                <span>{Math.floor(item.position_seconds / 60)} daqiqa ko‘rilgan</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="content-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">Katalog</p>
            <h2>Oxirgi nashrlar</h2>
          </div>
          <Link className="text-link" href="/browse">To‘liq katalog</Link>
        </div>
        {loading && <LoadingCards />}
        {error && <StatePanel title="Katalogni yuklab bo‘lmadi" tone="error">{error}</StatePanel>}
        {!loading && !error && anime.length === 0 && (
          <StatePanel title="Hozircha nashr etilgan anime yo‘q">
            Kontent yaratuvchisi anime va epizodlarni nashr qilgach, ular shu yerda ko‘rinadi.
          </StatePanel>
        )}
        {!loading && !error && anime.length > 0 && (
          <div className="catalog-grid">{anime.slice(0, 8).map((item) => <AnimeCard anime={item} key={item.id} />)}</div>
        )}
      </section>
    </AppShell>
  );
}

export function BrowseView({ initialSearch = "", initialGenre = "" }: { initialSearch?: string; initialGenre?: string }) {
  const [anime, setAnime] = useState<Anime[]>([]);
  const [genres, setGenres] = useState<CatalogItem[]>([]);
  const [search, setSearch] = useState(initialSearch);
  const [genre, setGenre] = useState(initialGenre);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Reset the loading/error flags during render whenever the active query changes, so the
  // fetch effect below only mutates state from async callbacks (Next 16 set-state-in-effect rule).
  const queryKey = `${search.trim()}|${genre}`;
  const [loadedKey, setLoadedKey] = useState(queryKey);
  if (loadedKey !== queryKey) {
    setLoadedKey(queryKey);
    setLoading(true);
    setError("");
  }

  useEffect(() => {
    let cancelled = false;
    void apiFetch<CatalogItem[]>("/catalog/genres")
      .then((items) => { if (!cancelled) setGenres(items); })
      .catch(() => { if (!cancelled) setGenres([]); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ limit: "48" });
    if (search.trim()) params.set("search", search.trim());
    if (genre) params.set("genre", genre);
    void apiFetch<Anime[]>(`/anime?${params.toString()}`)
      .then((items) => { if (!cancelled) setAnime(items); })
      .catch((loadError) => { if (!cancelled) setError(errorMessage(loadError)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [genre, search]);

  return (
    <AppShell>
      <section className="page-heading">
        <p className="eyebrow">To‘liq katalog</p>
        <h1>Katalog</h1>
        <p>Minglab animelar orasidan qidiring va janrlar bo‘yicha oson saralang.</p>
      </section>
      <section className="browse-layout">
        <aside className="filters">
          <label htmlFor="catalog-search">Qidirish</label>
          <input
            id="catalog-search"
            className="field"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nomi yoki tavsifi..."
            value={search}
          />
          <label htmlFor="genre-select">Janr</label>
          <select className="field" id="genre-select" onChange={(event) => setGenre(event.target.value)} value={genre}>
            <option value="">Barcha janrlar</option>
            {genres.map((item) => <option key={item.id} value={item.slug}>{item.name}</option>)}
          </select>
          <button className="secondary-action" onClick={() => { setSearch(""); setGenre(""); }} type="button">
            Filtrlarni tozalash
          </button>
        </aside>
        <section className="browse-main">
          <div className="section-head">
            <div>
              <h2>{loading ? "Katalog yuklanmoqda" : `${anime.length} ta natija`}</h2>
              <p>{genre ? `Janr: ${genres.find((item) => item.slug === genre)?.name ?? genre}` : "Barcha nashrlar"}</p>
            </div>
          </div>
          {loading && <LoadingCards />}
          {error && <StatePanel title="Qidiruv bajarilmadi" tone="error">{error}</StatePanel>}
          {!loading && !error && anime.length === 0 && (
            <StatePanel title="Natija topilmadi">Qidiruv so‘zini yoki tanlangan janrni o‘zgartirib ko‘ring.</StatePanel>
          )}
          {!loading && !error && anime.length > 0 && <div className="catalog-grid">{anime.map((item) => <AnimeCard anime={item} key={item.id} />)}</div>}
        </section>
      </section>
    </AppShell>
  );
}

function FavoriteButton({ anime, initialFavorite, onChange }: { anime: Anime; initialFavorite: boolean; onChange?: (value: boolean) => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, request } = useAuth();
  const [favorite, setFavorite] = useState(initialFavorite);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  // Re-seed from the parent's value during render (the favorite status loads asynchronously).
  const [syncedFavorite, setSyncedFavorite] = useState(initialFavorite);
  if (syncedFavorite !== initialFavorite) {
    setSyncedFavorite(initialFavorite);
    setFavorite(initialFavorite);
  }

  const toggle = async () => {
    if (!user) {
      router.push(`/login?redirect=${encodeURIComponent(pathname)}`);
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      if (favorite) await request(`/users/me/favorites/${anime.id}`, { method: "DELETE" });
      else await request(`/users/me/favorites/${anime.id}`, { method: "POST", body: "{}" });
      const next = !favorite;
      setFavorite(next);
      onChange?.(next);
      setMessage(next ? "Kutubxonaga qo‘shildi." : "Kutubxonadan olib tashlandi.");
    } catch (toggleError) {
      setMessage(errorMessage(toggleError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="favorite-control">
      <button className={favorite ? "secondary-action is-selected" : "secondary-action"} disabled={busy} onClick={() => void toggle()} type="button">
        {favorite ? "Saqlangan" : "Kutubxonaga qo‘shish"}
      </button>
      {message && <span role="status">{message}</span>}
    </div>
  );
}

export function DetailsView({ slug }: { slug: string }) {
  const { ready, request, user } = useAuth();
  const [anime, setAnime] = useState<Anime | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [suggestions, setSuggestions] = useState<Anime[]>([]);
  const [isFavorite, setIsFavorite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Reset load flags during render when navigating to a different title.
  const [loadedSlug, setLoadedSlug] = useState(slug);
  if (loadedSlug !== slug) {
    setLoadedSlug(slug);
    setLoading(true);
    setError("");
  }

  useEffect(() => {
    let cancelled = false;
    void apiFetch<Anime>(`/anime/${encodeURIComponent(slug)}`)
      .then(async (item) => {
        const list = await apiFetch<Episode[]>(`/anime/${encodeURIComponent(item.id)}/episodes`);
        if (!cancelled) {
          setAnime(item);
          setEpisodes(list);
        }
      })
      .catch((loadError) => { if (!cancelled) setError(errorMessage(loadError)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [slug]);

  useEffect(() => {
    if (!anime) return;
    let cancelled = false;
    const genre = anime.genres[0]?.slug;
    const params = new URLSearchParams({ limit: "8" });
    if (genre) params.set("genre", genre);
    void apiFetch<Anime[]>(`/anime?${params.toString()}`)
      .then((items) => { if (!cancelled) setSuggestions(items.filter((item) => item.id !== anime.id).slice(0, 6)); })
      .catch(() => { if (!cancelled) setSuggestions([]); });
    return () => { cancelled = true; };
  }, [anime]);

  // Clear the favorite flag during render for signed-out viewers (guarded to avoid a render loop).
  if ((!ready || !user || !anime) && isFavorite) setIsFavorite(false);

  useEffect(() => {
    if (!ready || !user || !anime) return;
    let cancelled = false;
    void request<Favorite[]>("/users/me/favorites")
      .then((items) => { if (!cancelled) setIsFavorite(items.some((item) => item.id === anime.id)); })
      .catch(() => { if (!cancelled) setIsFavorite(false); });
    return () => { cancelled = true; };
  }, [anime, ready, request, user]);

  if (loading) return <AppShell><section className="content-section"><LoadingCards /></section></AppShell>;
  if (error || !anime) return <AppShell><section className="content-section"><StatePanel title="Anime topilmadi" tone="error">{error || "Bu anime nashr qilinmagan yoki mavjud emas."}</StatePanel></section></AppShell>;

  return (
    <AppShell>
      <section className="details-hero" style={{ "--hero-accent": accentFor(anime.title) } as CSSProperties}>
        <div className="details-copy">
          <p className="eyebrow">{anime.status === "published" ? "Nashr etilgan" : anime.status}</p>
          <h1>{anime.title}</h1>
          <p>{anime.synopsis || "Tavsif hali qo‘shilmagan."}</p>
          <div className="details-meta">
            <span>{anime.releaseYear ?? "Yili yo‘q"}</span>
            <span>{anime.studio?.name ?? "Studio ko‘rsatilmagan"}</span>
            {anime.genres.map((item) => <span className="pill" key={item.id}>{item.name}</span>)}
          </div>
          <div className="hero-actions">
            {episodes[0] ? <Link className="primary-action" href={watchHref(anime.slug, episodes[0].id)}>1-qismni tomosha qilish</Link> : <span className="muted">Nashr etilgan epizod yo‘q</span>}
            <FavoriteButton anime={anime} initialFavorite={isFavorite} onChange={setIsFavorite} />
          </div>
        </div>
      </section>

      <section className="content-section details-layout">
        <div>
          <div className="section-head">
            <div>
              <p className="eyebrow">Epizodlar</p>
              <h2>{episodes.length} ta epizod</h2>
            </div>
          </div>
          {episodes.length === 0 ? (
            <StatePanel title="Epizod yo‘q">Epizod nashr etilgach, shu sahifada paydo bo‘ladi.</StatePanel>
          ) : (
            <div className="episode-list">
              {episodes.map((episode) => (
                <Link className="episode-row" href={watchHref(anime.slug, episode.id)} key={episode.id}>
                  <span className="episode-number">{episode.number}</span>
                  <span>
                    <b>{episode.title}</b>
                    <small>{episode.description || "Tavsif yo‘q"}</small>
                  </span>
                  <span>{formatDuration(episode.durationSeconds)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
        <aside className="info-panel">
          <h3>Ma’lumotlar</h3>
          <p><span>Muallif</span><b>{anime.owner.displayName}</b></p>
          <p><span>Studio</span><b>{anime.studio?.name ?? "—"}</b></p>
          <p><span>Janr</span><b>{anime.genres.map((item) => item.name).join(", ") || "—"}</b></p>
          <p><span>Taglar</span><b>{anime.tags.map((item) => item.name).join(", ") || "—"}</b></p>
        </aside>
      </section>

      {suggestions.length > 0 && (
        <section className="content-section">
          <div className="section-head">
            <div>
              <p className="eyebrow">O‘xshash kontent</p>
              <h2>Sizga yoqishi mumkin</h2>
            </div>
          </div>
          <div className="catalog-grid suggestion-grid">{suggestions.map((item) => <AnimeCard anime={item} key={item.id} />)}</div>
        </section>
      )}
    </AppShell>
  );
}

function HlsPlayer({ episode, onProgress, onEnded }: { episode: Episode; onProgress: (seconds: number, completed: boolean) => void; onEnded: () => void }) {
  const { request } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastSavedPosition = useRef(0);
  const resumeAt = useRef(0);
  const renewalsRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const [source, setSource] = useState("");
  const [renewals, setRenewals] = useState(0);

  // Drop the previous episode's playback link during render, so both effects below only ever
  // write state from async callbacks (Next 16 set-state-in-effect rule).
  const [loadedEpisodeId, setLoadedEpisodeId] = useState(episode.id);
  if (loadedEpisodeId !== episode.id) {
    setLoadedEpisodeId(episode.id);
    setSource("");
    setError("");
    setPlaying(false);
    setRenewals(0);
  }

  // A new episode starts from the beginning with a fresh renewal budget.
  useEffect(() => {
    resumeAt.current = 0;
    renewalsRef.current = 0;
  }, [episode.id]);

  // Ask the server for a short-lived, personal playback link. Re-runs when a link expires
  // mid-view so that long viewing sessions keep playing instead of dying with an error.
  useEffect(() => {
    let cancelled = false;
    void request<PlaybackTicket>(`/media/${encodeURIComponent(episode.id)}/playback`, { method: "POST", body: "{}" })
      .then((ticket) => { if (!cancelled) setSource(`${API_BASE}${ticket.playbackPath}?file=master.m3u8`); })
      .catch((ticketError) => { if (!cancelled) setError(playbackErrorMessage(ticketError)); });
    return () => { cancelled = true; };
  }, [episode.id, renewals, request]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !source) return;
    let hls: Hls | undefined;
    let cancelled = false;
    lastSavedPosition.current = 0;

    // An expired link is the usual fatal case: take a fresh one and carry on from the same spot.
    const recover = () => {
      if (cancelled || renewalsRef.current >= MAX_PLAYBACK_RENEWALS) return false;
      renewalsRef.current += 1;
      resumeAt.current = video.currentTime || resumeAt.current;
      setRenewals(renewalsRef.current);
      return true;
    };

    const seekToResume = () => { if (resumeAt.current > 0) video.currentTime = resumeAt.current; };
    video.addEventListener("loadedmetadata", seekToResume, { once: true });

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = source;
    } else {
      void import("hls.js").then(({ default: HlsConstructor }) => {
        if (cancelled) return;
        if (!HlsConstructor.isSupported()) {
          setError("Bu brauzer HLS videoni qo‘llab-quvvatlamaydi.");
          return;
        }
        hls = new HlsConstructor();
        hls.loadSource(source);
        hls.attachMedia(video);
        hls.on(HlsConstructor.Events.ERROR, (_event, data) => {
          if (!data.fatal) return;
          if (!recover()) setError("Videoni hozircha yuklab bo‘lmadi. Iltimos, birozdan so‘ng qayta urinib ko‘ring.");
        });
      }).catch(() => setError("Video pleyerini yuklab bo‘lmadi."));
    }

    return () => {
      cancelled = true;
      video.removeEventListener("loadedmetadata", seekToResume);
      hls?.destroy();
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [source]);

  const togglePlayback = async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (video.paused) await video.play();
      else video.pause();
    } catch {
      setError("Videoni ijro etish uchun pleyer boshqaruvidan foydalaning.");
    }
  };

  const seek = (seconds: number) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration)) return;
    video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds));
  };

  const fullscreen = async () => {
    try {
      await videoRef.current?.requestFullscreen();
    } catch {
      setError("To‘liq ekran rejimi mavjud emas.");
    }
  };

  return (
    <div className="video-player">
      <video
        controls
        crossOrigin="anonymous"
        onEnded={() => { onProgress(Math.floor(videoRef.current?.duration || 0), true); onEnded(); }}
        onError={() => { if (source) setError("Videoni yuklab bo‘lmadi."); }}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
        onTimeUpdate={() => {
          const position = Math.floor(videoRef.current?.currentTime || 0);
          if (position > 0 && position - lastSavedPosition.current >= 15) {
            lastSavedPosition.current = position;
            onProgress(position, false);
          }
        }}
        preload="metadata"
        ref={videoRef}
      >
        Brauzeringiz video tegi bilan ishlamaydi.
      </video>
      <div className="player-toolbar">
        <button disabled={!source} onClick={() => void togglePlayback()} type="button">{playing ? "Pauza" : "Ijro"}</button>
        <button disabled={!source} onClick={() => seek(-10)} type="button">−10 soniya</button>
        <button disabled={!source} onClick={() => seek(30)} type="button">+30 soniya</button>
        <button disabled={!source} onClick={() => void fullscreen()} type="button">To‘liq ekran</button>
        {!source && !error && <span className="muted">Video tayyorlanmoqda...</span>}
      </div>
      {error && <p className="player-error" role="alert">{error}</p>}
    </div>
  );
}

export function WatchView({ slug, episodeId }: { slug: string; episodeId: string }) {
  const router = useRouter();
  const { ready, request, user } = useAuth();
  const [anime, setAnime] = useState<Anime | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [suggestions, setSuggestions] = useState<Anime[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [autoNext, setAutoNext] = useState(true);
  const [historyMessage, setHistoryMessage] = useState("");

  // Reset load flags during render when switching to a different title.
  const [loadedSlug, setLoadedSlug] = useState(slug);
  if (loadedSlug !== slug) {
    setLoadedSlug(slug);
    setLoading(true);
    setError("");
  }

  useEffect(() => {
    let cancelled = false;
    void apiFetch<Anime>(`/anime/${encodeURIComponent(slug)}`)
      .then(async (item) => {
        const list = await apiFetch<Episode[]>(`/anime/${encodeURIComponent(item.id)}/episodes`);
        if (!cancelled) {
          setAnime(item);
          setEpisodes(list);
        }
      })
      .catch((loadError) => { if (!cancelled) setError(errorMessage(loadError)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [slug]);

  useEffect(() => {
    if (!anime) return;
    let cancelled = false;
    const genre = anime.genres[0]?.slug;
    const params = new URLSearchParams({ limit: "12" });
    if (genre) params.set("genre", genre);
    void apiFetch<Anime[]>(`/anime?${params.toString()}`)
      .then((items) => { if (!cancelled) setSuggestions(items.filter((item) => item.id !== anime.id).slice(0, 8)); })
      .catch(() => { if (!cancelled) setSuggestions([]); });
    return () => { cancelled = true; };
  }, [anime]);

  const episode = episodes.find((item) => item.id === episodeId) ?? null;
  const currentIndex = episode ? episodes.findIndex((item) => item.id === episode.id) : -1;
  const nextEpisode = currentIndex >= 0 ? episodes[currentIndex + 1] : undefined;

  const saveProgress = useCallback(async (positionSeconds: number, completed: boolean) => {
    if (!user || !episode) return;
    try {
      await request(`/users/me/history/${episode.id}`, {
        method: "PUT",
        body: JSON.stringify({ positionSeconds, completed }),
      });
      setHistoryMessage(completed ? "Tomosha tugallandi." : "Ko‘rish holati saqlandi.");
    } catch (saveError) {
      setHistoryMessage(errorMessage(saveError));
    }
  }, [episode, request, user]);

  const finished = () => {
    if (autoNext && anime && nextEpisode) router.push(watchHref(anime.slug, nextEpisode.id));
  };

  if (loading) return <AppShell><section className="content-section"><LoadingCards /></section></AppShell>;
  if (error || !anime || !episode) return <AppShell><section className="content-section"><StatePanel title="Video topilmadi" tone="error">{error || "Bu epizod nashr qilinmagan yoki boshqa animega tegishli."}</StatePanel></section></AppShell>;

  const signInHref = `/login?redirect=${encodeURIComponent(watchHref(anime.slug, episode.id))}`;

  return (
    <AppShell>
      <section className="watch-layout">
        <div className="watch-main">
          {!ready ? (
            <StatePanel title="Bir zum kuting">Pleyer tayyorlanmoqda...</StatePanel>
          ) : user ? (
            <HlsPlayer episode={episode} onEnded={finished} onProgress={(position, completed) => void saveProgress(position, completed)} />
          ) : (
            <StatePanel title="Tomosha qilish uchun hisobingizga kiring">
              <p>Videolar faqat ro‘yxatdan o‘tgan foydalanuvchilar uchun ochiq. Kirganingizdan so‘ng shu epizodga qaytasiz.</p>
              <Link className="primary-action" href={signInHref}>Kirish yoki hisob yaratish</Link>
            </StatePanel>
          )}
          <div className="watch-title-row">
            <div>
              <p className="eyebrow">{anime.title} · {episode.number}-qism</p>
              <h1>{episode.title}</h1>
              <p>{episode.description || anime.synopsis || "Tavsif hali qo‘shilmagan."}</p>
            </div>
            <Link className="secondary-action" href={detailsHref(anime.slug)}>Epizodlar</Link>
          </div>
          <div className="watch-actions">
            <label className="autoplay-toggle">
              <input checked={autoNext} onChange={(event) => setAutoNext(event.target.checked)} type="checkbox" />
              Keyingi epizod avtomatik ijro etilsin
            </label>
            {nextEpisode && <Link className="primary-action" href={watchHref(anime.slug, nextEpisode.id)}>Keyingi: {nextEpisode.number}-qism</Link>}
          </div>
          {user ? <p className="history-status" role="status">{historyMessage || "Ko‘rish tarixingiz avtomatik saqlanmoqda."}</p> : <p className="history-status"><Link href={signInHref}>Kiring</Link> — tomosha qilish va ko‘rish tarixingiz saqlanib borishi uchun.</p>}
        </div>
        <aside className="up-next-panel">
          <div className="section-head"><div><p className="eyebrow">Siz uchun tavsiyalar</p><h2>Keyingi videolar</h2></div></div>
          {nextEpisode && (
            <Link className="recommendation-card" href={watchHref(anime.slug, nextEpisode.id)}>
              <span className="recommendation-mark">{nextEpisode.number}</span>
              <span><b>{anime.title}</b><small>{nextEpisode.title}</small><em>Keyingi epizod</em></span>
            </Link>
          )}
          {suggestions.length === 0 && !nextEpisode && <p className="muted">Tavsiya uchun katalogda o‘xshash nashr kerak.</p>}
          {suggestions.map((item) => (
            <Link className="recommendation-card" href={detailsHref(item.slug)} key={item.id}>
              <Poster anime={item} compact />
              <span><b>{item.title}</b><small>{item.genres.map((genre) => genre.name).join(", ") || "Anime"}</small><em>{item.studio?.name ?? "Studio"}</em></span>
            </Link>
          ))}
        </aside>
      </section>
    </AppShell>
  );
}

export function LibraryView() {
  const { ready, request, user } = useAuth();
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [history, setHistory] = useState<WatchHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Reset the library during render when the signed-in user changes (guarded against loops).
  const activeUserId = user?.id ?? null;
  const [loadedUserId, setLoadedUserId] = useState(activeUserId);
  if (loadedUserId !== activeUserId) {
    setLoadedUserId(activeUserId);
    setFavorites([]);
    setHistory([]);
    setError("");
    setLoading(Boolean(activeUserId));
  }

  useEffect(() => {
    if (!ready || !user) return;
    let cancelled = false;
    void Promise.all([request<Favorite[]>("/users/me/favorites"), request<WatchHistory[]>("/users/me/history")])
      .then(([favoriteItems, historyItems]) => {
        if (!cancelled) {
          setFavorites(favoriteItems);
          setHistory(historyItems);
        }
      })
      .catch((loadError) => { if (!cancelled) setError(errorMessage(loadError)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ready, request, user]);

  const removeFavorite = async (animeId: string) => {
    setMessage("");
    try {
      await request(`/users/me/favorites/${animeId}`, { method: "DELETE" });
      setFavorites((items) => items.filter((item) => item.id !== animeId));
      setMessage("Anime sevimlilardan olib tashlandi.");
    } catch (removeError) {
      setMessage(errorMessage(removeError));
    }
  };

  if (!ready) return <AppShell><section className="content-section"><StatePanel title="Yuklanmoqda">Bir zum kuting...</StatePanel></section></AppShell>;
  if (!user) return <AppShell><section className="content-section"><StatePanel title="Kutubxona uchun kirish kerak"><Link className="primary-action" href="/login?redirect=%2Flibrary">Kirish yoki hisob yaratish</Link></StatePanel></section></AppShell>;

  return (
    <AppShell>
      <section className="page-heading">
        <p className="eyebrow">{user.displayName}</p>
        <h1>Kutubxonam</h1>
        <p>Sevimlilaringiz va ko‘rish tarixingiz barcha qurilmalarda doim sinxron.</p>
      </section>
      <section className="content-section library-section">
        <div className="section-head"><div><p className="eyebrow">Sevimlilar</p><h2>Saqlangan anime</h2></div></div>
        {loading && <LoadingCards />}
        {error && <StatePanel title="Kutubxona yuklanmadi" tone="error">{error}</StatePanel>}
        {!loading && !error && favorites.length === 0 && <StatePanel title="Sevimlilar ro‘yxati bo‘sh">Anime sahifasidagi “Kutubxonaga qo‘shish” tugmasi orqali sevimlilaringizni to‘plang.</StatePanel>}
        {!loading && !error && favorites.length > 0 && (
          <div className="library-grid">
            {favorites.map((item) => (
              <article className="library-card" key={item.id}>
                <span className="library-badge">{initials(item.title)}</span>
                <div><h3><Link href={detailsHref(item.slug)}>{item.title}</Link></h3><p>Saqlangan: {new Date(item.added_at).toLocaleDateString("uz-UZ")}</p></div>
                <button onClick={() => void removeFavorite(item.id)} type="button">Olib tashlash</button>
              </article>
            ))}
          </div>
        )}
        {message && <p className="inline-status" role="status">{message}</p>}
      </section>
      <section className="content-section library-section">
        <div className="section-head"><div><p className="eyebrow">Ko‘rish tarixi</p><h2>Ko‘rishni davom ettiring</h2></div></div>
        {!loading && !error && history.length === 0 && <StatePanel title="Tarix bo‘sh">Video kamida 15 soniya ijro etilgach, uning holati shu yerda ko‘rinadi.</StatePanel>}
        {!loading && !error && history.length > 0 && (
          <div className="history-list">
            {history.map((item) => (
              <Link className="history-list-item" href={watchHref(item.anime_slug, item.episode_id)} key={item.episode_id}>
                <span>{item.episode_number}</span>
                <div><b>{item.anime_title}</b><small>{item.episode_title}</small></div>
                <em>{item.completed_at ? "Tugallangan" : `${Math.floor(item.position_seconds / 60)} daqiqa`}</em>
              </Link>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}

const safePath = (value: string | undefined, fallback = "/") =>
  value && value.startsWith("/") && !value.startsWith("//") ? value : fallback;

export function AuthView({ mode, redirectTo }: { mode: "login" | "register"; redirectTo?: string }) {
  const router = useRouter();
  const { login, ready, register, user } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const isLogin = mode === "login";
  const destination = safePath(redirectTo);

  // Signed-in visitors never need the auth screen — send them to their destination.
  useEffect(() => {
    if (ready && user) router.replace(destination);
  }, [destination, ready, router, user]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      if (isLogin) await login(email, password);
      else await register(email, password, displayName);
      router.replace(destination);
    } catch (authError) {
      setMessage(errorMessage(authError));
    } finally {
      setBusy(false);
    }
  };

  const query = destination === "/" ? "" : `?redirect=${encodeURIComponent(destination)}`;
  const switchHref = `${isLogin ? "/register" : "/login"}${query}`;

  return (
    <AppShell>
      <section className="account-layout">
        <div className="account-intro">
          <p className="eyebrow">Shaxsiy hisob</p>
          <h1>{isLogin ? "Hisobga kiring" : "Hisob yarating"}</h1>
          <p>Sevimlilaringiz va ko‘rish tarixingiz hisobingizga bog‘lanib, doim saqlanib boradi.</p>
        </div>
        <form className="account-card" onSubmit={(event) => void submit(event)}>
          {!isLogin && (
            <label>
              Ko‘rsatiladigan ism
              <input autoComplete="name" maxLength={100} minLength={1} onChange={(event) => setDisplayName(event.target.value)} required value={displayName} />
            </label>
          )}
          <label>
            Email
            <input autoComplete="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
          </label>
          <label>
            Parol
            <input
              autoComplete={isLogin ? "current-password" : "new-password"}
              minLength={isLogin ? undefined : 12}
              onChange={(event) => setPassword(event.target.value)}
              required
              type={showPassword ? "text" : "password"}
              value={password}
            />
          </label>
          <label className="checkbox-row">
            <input checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} type="checkbox" />
            Parolni ko‘rsatish
          </label>
          {!isLogin && <p className="field-hint">Parol kamida 12 ta belgidan iborat bo‘lishi kerak.</p>}
          <button className="primary-action" disabled={busy} type="submit">
            {busy ? "Yuborilmoqda..." : isLogin ? "Kirish" : "Hisob yaratish"}
          </button>
          <Link className="link-button" href={switchHref}>
            {isLogin ? "Hisobingiz yo‘qmi? Ro‘yxatdan o‘ting" : "Hisobingiz bormi? Kiring"}
          </Link>
          {message && <p className="inline-status" role="alert">{message}</p>}
        </form>
      </section>
    </AppShell>
  );
}

export function AccountView() {
  const router = useRouter();
  const { logout, ready, updateProfile, uploadAvatar, user } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [avatar, setAvatar] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  // Seed the profile field from the signed-in user during render (keyed on identity).
  const [syncedUserId, setSyncedUserId] = useState<string | null>(null);
  if (user && syncedUserId !== user.id) {
    setSyncedUserId(user.id);
    setDisplayName(user.displayName);
  } else if (!user && syncedUserId !== null) {
    setSyncedUserId(null);
  }

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await updateProfile(displayName);
      setMessage("Profil yangilandi.");
    } catch (profileError) {
      setMessage(errorMessage(profileError));
    } finally {
      setBusy(false);
    }
  };

  const saveAvatar = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!avatar) return;
    setBusy(true);
    setMessage("");
    try {
      await uploadAvatar(avatar);
      setAvatar(null);
      setMessage("Avatar yangilandi.");
    } catch (avatarError) {
      setMessage(errorMessage(avatarError));
    } finally {
      setBusy(false);
    }
  };

  if (!ready) {
    return (
      <AppShell>
        <section className="content-section">
          <StatePanel title="Yuklanmoqda">Bir zum kuting...</StatePanel>
        </section>
      </AppShell>
    );
  }

  if (!user) {
    return (
      <AppShell>
        <section className="content-section">
          <StatePanel title="Profil uchun kirish kerak">
            <Link className="primary-action" href="/login?redirect=%2Faccount">Hisobga kirish</Link>
          </StatePanel>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <section className="account-layout">
        <div className="account-intro"><p className="eyebrow">Hisob</p><h1>{user.displayName}</h1><p>{user.email}</p><span className="role-badge">{user.role}</span></div>
        <div className="account-stack">
          <form className="account-card" onSubmit={(event) => void saveProfile(event)}>
            <h2>Profil</h2>
            <label>Ko‘rsatiladigan ism<input maxLength={100} minLength={1} onChange={(event) => setDisplayName(event.target.value)} required value={displayName} /></label>
            <button className="primary-action" disabled={busy} type="submit">Profilni saqlash</button>
          </form>
          <form className="account-card" onSubmit={(event) => void saveAvatar(event)}>
            <h2>Avatar</h2>
            <label>JPEG, PNG yoki WebP<input accept="image/jpeg,image/png,image/webp" onChange={(event) => setAvatar(event.target.files?.[0] ?? null)} type="file" /></label>
            <button className="secondary-action" disabled={busy || !avatar} type="submit">Avatarni yuklash</button>
          </form>
          <button className="danger-action" disabled={busy} onClick={() => void logout().then(() => router.push("/"))} type="button">Chiqish</button>
          {message && <p className="inline-status" role="status">{message}</p>}
        </div>
      </section>
    </AppShell>
  );
}
