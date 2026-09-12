# 🚀 Deploy qo'llanmasi — Vercel (frontend) + Neon (Postgres) + Upstash (Redis)

Sayt arxitekturasi: **frontend Vercel'da**, `/api/v1` so'rovlar Next.js rewrites orqali backend'ga proksi qilinadi, bazalar bulutda bepul xizmatlarda turadi.

```
Brauzer ──► Vercel (Next.js frontend + /api/v1 proxy)
                 │  rewrites (next.config.ts)
                 ▼
            Backend API (hozircha sizning PC'da: http://127.0.0.1:3000)
                 │                │
          Neon (Postgres)    Upstash (Redis)
                 │
          S3-mos storage (Cloudflare R2) — video/subtitle fayllar
```

> Backend API'ni ham bulutga ko'chirmoqchi bo'lsangiz: Dockerfile repo ildizida tayyor (Koyeb/Back4app/VPS uchun). Hozirgi qo'llanma frontend'ni Vercel'ga chiqarish uchun.

---

## 1-qadam: Neon — bepul Postgres

1. https://neon.com → GitHub bilan ro'yxatdan o'ting (karta kerak emas)
2. **Create project** → region: yaqin (Frankfurt/AWS)
3. Dashboard'da **Connection string** ni nusxalang:
   `postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require`

## 2-qadam: Upstash — bepul Redis

1. https://upstash.com → GitHub bilan ro'yxatdan o'ting (karta kerak emas)
2. **Create database** → region: yaqin, **Eviction: o'chirilgan** bo'lsin
3. Database sahifasidan **REST'a emas, "Connect → Node.js"** dagi URL kerak:
   `rediss://default:xxxx@xxx.upstash.io:6379` — shuni nusxalang

## 3-qadam: Vercel — frontend

1. https://vercel.com → **Add New → Project** → `shuhrat995/anime` reponi import qiling
2. Sozlamalar:
   - **Framework Preset:** Next.js (avtomatik)
   - **Root Directory:** `frontend` → Edit → `frontend` deb yozing
   - Build command / install: avtomatik qoladi
3. **Environment Variables** bo'limiga quyidagilarni qo'shing:

| Key | Qiymat | Izoh |
|---|---|---|
| `BACKEND_ORIGIN` | backend manzilingiz (masalan `http://IP:3000` yoki tunnel URL) | bo'lmasa lokal `127.0.0.1:3000` ishlatiladi |
| `NEXT_PUBLIC_API_URL` | `/api/v1` | brauzer same-origin so'rov yuboradi (CORS yo'q) |

4. **Deploy** bosing (birinchi build ~2-3 daqiqa)

## 4-qadam: Backend'ni Vercel saytiga ulash

Vercel rewrites **serverda** ishlaydi — backend manzili erkin (HTTP ham bo'ladi, CORS so'ralmaydi):

- **Backend sizning PC'da bo'lsa:** internetga ochish kerak (masalan Cloudflare Tunnel: `cloudflared tunnel --url http://127.0.0.1:3000` → berilgan `https://xxx.trycloudflare.com` ni `BACKEND_ORIGIN` qilib Vercel'da yangilang)
- **VPS bo'lsa:** `http://VPS-IP:3000` ni yozing

Backend `.env` da esa `CORS_ORIGINS` ga Vercel domeningizni qo'shing (agar biror joyda to'g'ridan-to'g'ri brauzer so'rovlari bo'lsa):
`CORS_ORIGINS=https://sizning-sayt.vercel.app,http://localhost:3001`

Har `BACKEND_ORIGIN` o'zgarsa: Vercel → Settings → Environment Variables → yangilang → **Deployments → Redeploy**.

## 5-qadam: Tekshirish

```bash
# 1) Vercel'dagi sayt tirikmi
curl https://SIZNING-SAYT.vercel.app

# 2) Proxy backend'ga yetib borayaptimi (200 qaytishi kerak)
curl https://SIZNING-SAYT.vercel.app/api/v1/health

# 3) Brauzerda registratsiyadan o'tib ko'ring
```

Birinchi registratsiyadan keyin **backend konsolida** `📧 DEV MAIL` blokida email tasdiqlash havolasi chiqadi (SMTP ulanguncha shunday ishlaydi).

---

## Backend env (eslatma)

Backend bulutga ko'chsa quyidagilar kerak bo'ladi (`backent/.env.example` da to'liq ro'yxat):

| Key | Qiymat |
|---|---|
| `DATABASE_URL` / `LOG_DATABASE_URL` | Neon connection string (ikkalasi bir xil bo'lishi mumkin) |
| `REDIS_URL` | Upstash `rediss://...` URL'i |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | kamida 64 belgili tasodifiy satrlar |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | istalgan qiymat (video yuklamaguncha ishlatilmaydi) |
| `CORS_ORIGINS` | `https://sizning-sayt.vercel.app` |

## Xarajatlar (minimal)

| Xizmat | Plan | Narx |
|---|---|---|
| Vercel | Hobby | **$0** (oyiga 100GB trafik, kommerziyasiz) |
| Neon | Free | **$0** (0.5GB, uyqu rejimi bor) |
| Upstash | Free | **$0** (10k buyruq/kun) |
| Backend | sizning PC / VPS | $0 / ~$4-5 oy |
| Cloudflare R2 | Free tier | **$0** (10GB gacha) |

> Pro versiya: backend doim on bo'lishi uchun arzon VPS (~$4-5/oy) eng to'g'ri yo'l — repodagi Dockerfile o'sha joyga to'g'ridan-to'g'ri mos keladi.
