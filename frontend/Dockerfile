# Zenith frontend (Next.js 16) — production image
FROM node:24-alpine
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Install all deps (build needs the dev toolchain: typescript, tailwind, etc.)
COPY package*.json ./
RUN npm ci

# Build. NEXT_PUBLIC_API_URL is baked in here (from .env.local / api.ts default).
COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001
CMD ["npm", "start"]
