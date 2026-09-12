# Zenith backend (Express) — repo ildizidagi Dockerfile.
# Render standart ravishda ./Dockerfile ni izlaydi; backent/ ichidagi ham xuddi shu
# tarzda ishlaydi (render.yaml dockerfilePath orqali). Ikkalasi sinxron bo'lishi kerak.
FROM node:24-alpine AS build
WORKDIR /app
COPY backent/package*.json ./
RUN npm ci
COPY backent/tsconfig.json ./
COPY backent/src ./src
RUN npm run build

FROM node:24-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY backent/package*.json ./
RUN npm ci --omit=dev
# Compiled JS plus the SQL migrations it loads from import.meta.dirname at runtime.
COPY --from=build /app/dist ./dist
EXPOSE 3000
# Apply schema + logging migrations before booting; the API 503s on /health/ready until they exist.
CMD ["sh", "-c", "node dist/database/migrate.js && node dist/database/logging-migrate.js && node dist/server.js"]
