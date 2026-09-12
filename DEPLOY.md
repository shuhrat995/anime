# 🚀 Deploy qo'llanmasi — Render (backend) + Netlify (frontend)

Bu qo'llanma saytni internetga chiqaradi: **backend Render'da**, **frontend Netlify'da** ishlaydi, `/api/v1` so'rovlar Netlify'dan Render'ga proksi qilinadi.

---

## 1-qadam: Kodni GitHub'ga push qiling

```bash
git add -A
git commit -m "Deploy config"
git push origin main
```

## 2-qadam: Render'da backend'ni ishga tushirish

### 2.1. Postgres bazasi (free)
1. https://dashboard.render.com → **New → Postgres**
2. Nom: `zenith-db`, Plan: **Free**, Region: **Frankfurt**
3. Yaratilgach, ichida **"Connect"** tugmasi → **Internal Database URL** ni nusxalang
   (`postgres://...render-prod...render.com/anime_platform` shaklida). Bu `DATABASE_URL`.

> Eslatma: free Postgres **30 kundan keyin o'chadi** — doimiy ishlatish uchun eng arzon pullik plan ($6/oy) kerak.

### 2.2. Blueprint orqali API + Redis
1. **New → Blueprint** → shu reponi (`shuhrat995/anime`) tanlang
2. Render ildizdagi `render.yaml` ni o'qiydi:
   - `zenith-api` (Docker, `backent/Dockerfile`)
   - `zenith-redis` (Key Value, free)
3. **Apply** bosing. Birinchi deploy ~5 daqiqa.
4. Deploy xatolik berishi mumkin, chunki hali env'lar to'lmagan — `zenith-api` → **Environment** bo'limiga o'tib quyidagilarni to'ldiring:

| Key | Qiymat |
|---|---|
| `DATABASE_URL` | 2.1 dan olingan Internal Database URL |
| `LOG_DATABASE_URL` | xuddi shu URL (bir xil bazada `application_logs` jadvali yaratiladi) |
| `CORS_ORIGINS` | `https://SIZNING-SAYT.netlify.app,http://localhost:3001` |
| `S3_BUCKET` | R2/B2/S3 bucket nomingiz |
| `S3_ENDPOINT` | R2: `https://<accountid>.r2.cloudflarestorage.com` |
| `S3_ACCESS_KEY_ID` | storage access key |
| `S3_SECRET_ACCESS_KEY` | storage secret key |

5. **Save** → avtomatik qayta deploy. Tayyor: `https://zenith-api-xxxx.onrender.com/health` → `{"success":true}` qaytarsa ✅

> Migratsiyalar avtomatik: Dockerfile'dagi CMD har startda `migrate.js` va `logging-migrate.js` ni ishga tushiradi.

> ⚠️ Free plan'da servis 15 daqiqa harakatsizlikdan keyin "uxlaydi" — birinchi so'rov 30–60 soniya kechikadi.

### 2.3. Media storage (video fayllar)
Video paketlar S3-mos storage'ga yuklanadi. **Cloudflare R2** tavsiya etaman (efirga chiqish trafiki bepul):
1. Cloudflare Dashboard → R2 → bucket yarating (`zenith-media`)
2. R2 → Manage API Tokens → Object Read & Write token yarating
3. Token'dagi `Access Key ID`, `Secret`, `Endpoint` ni Render env'lariga yozing (yuqoridagi jadval)

## 3-qadam: Netlify'da frontend

1. https://app.netlify.com → **Add new site → Import an existing project** → `shuhrat995/anime`
2. Sozlamalar (yoki ildizdagi `netlify.toml` dan avtomatik o'qiydi):
   - Base directory: `frontend`
   - Build command: `npm run build`
   - **Environment variables:**

| Key | Qiymat |
|---|---|
| `BACKEND_ORIGIN` | `https://zenith-api-xxxx.onrender.com` (2.2 dagi URL) |
| `NEXT_PUBLIC_API_URL` | `/api/v1` |

3. **Deploy**

## 4-qadam: `netlify.toml` dagi manzilni almashtirish

Repodagi `netlify.toml` faylida `REPLACE-WITH-YOUR-BACKEND` **2 joyda** bor — ularni 2.2 dagi haqiqiy Render URL'iga almashtiring va push qiling:

```bash
# netlify.toml ichida (2 joyda):
https://REPLACE-WITH-YOUR-BACKEND.example.com  →  https://zenith-api-xxxx.onrender.com
```

## 5-qadam: Tekshirish

```bash
# 1) Backend tirikmi
curl https://zenith-api-xxxx.onrender.com/health

# 2) Netlify proxy ishlayaptimi (200 qaytishi kerak)
curl https://SIZNING-SAYT.netlify.app/api/v1/health

# 3) Brauzerda saytni ochib registratsiyadan o'tib ko'ring
```

Birinchi registratsiyadan keyin **Render → zenith-api → Logs** ichida `📧 DEV MAIL` blokida email tasdiqlash havolasi chiqadi (SMTP ulanguncha shunday ishlaydi).

---

## Umumiy arxitektura (deploy'dan keyin)

```
Brauzer ──► Netlify (Next.js frontend, static+SSR)
                 │  /api/v1/*  (proxy, status 200)
                 ▼
            Render (Express API, Docker)
                 │            │
          Postgres (Render)   Redis (Render Key Value)
                 │
          S3-mos storage (R2) — video/subtitle fayllar
```

## Xarajatlar (minimal)
| Xizmat | Plan | Narx |
|---|---|---|
| Netlify | Free | $0 |
| Render API | Free | $0 (15 daq uxlash cheklovi bilan) |
| Render Postgres | Free | $0 (30 kun) → $6/oy |
| Render Key Value | Free | $0 (25MB) |
| Cloudflare R2 | Free tier | $0 (10GB gacha) |
