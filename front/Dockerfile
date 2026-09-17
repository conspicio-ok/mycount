# Stages : deps → dev (vite dev) · deps → build → prod (Caddy + build statique).
# Sans --target, c'est prod (dernier stage) qui est construit.

# ── Deps : dépendances figées par le lock ──────────────────────
FROM node:22-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# ── Dev : serveur Vite, code monté en volume ───────────────────
FROM deps AS dev

COPY . .

EXPOSE 8080

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "8080"]

# ── Build : SPA statique dans /app/build ───────────────────────
FROM deps AS build

COPY . .

RUN npm run build

# ── Prod : Caddy sert la SPA et relaie /api vers l'API ─────────
FROM caddy:2-alpine AS prod

COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/build /srv

EXPOSE 80 443
