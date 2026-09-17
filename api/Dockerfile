# Stages : base → dev (air) · base → build → prod (binaire seul).
# Sans --target, c'est prod (dernier stage) qui est construit.

# ── Base : toolchain et dépendances précompilées ───────────────
FROM golang:1.27.1-alpine AS base

WORKDIR /app

# mattn/go-sqlite3 compile le SQLite C : CGO et un compilateur sont requis.
# CGO_CFLAGS remplace le « -O2 -g » par défaut : sans -g, pas d'informations de debug C.
ENV CGO_ENABLED=1 \
    CGO_CFLAGS="-O2"
RUN apk add --no-cache build-base

COPY go.mod go.sum ./
RUN go mod download

# Précompile les dépendances (dont les ~250 000 lignes C de SQLite) dans le cache Go de
# l'image. Couche rejouée seulement si go.mod ou go.sum changent. Le cache n'est réutilisé
# que si l'environnement de compilation est identique : CGO_CFLAGS est donc fixé par ENV.
RUN go build github.com/mattn/go-sqlite3 golang.org/x/crypto/argon2

# ── Dev : rechargement à chaud, code monté en volume ───────────
FROM base AS dev

RUN go install github.com/air-verse/air@v1.67.4

COPY . .

EXPOSE 8080

CMD ["air"]

# ── Build : binaire statique ───────────────────────────────────
FROM base AS build

COPY . .

# Lien statique (musl) : le binaire ne dépend d'aucune bibliothèque de l'image finale.
# -s -w : sans table des symboles ni DWARF.
RUN go build -ldflags='-s -w -linkmode external -extldflags "-static"' -o /out/mycount-api .

# ── Prod : binaire seul, utilisateur non-root ──────────────────
FROM alpine:3 AS prod

# sqlite : sauvegardes à chaud (.backup) depuis le conteneur. wget (busybox) : healthcheck.
RUN apk add --no-cache sqlite \
 && adduser -D -H -u 10001 mycount \
 && mkdir /data \
 && chown mycount:mycount /data

COPY --from=build /out/mycount-api /usr/local/bin/mycount-api

USER mycount

EXPOSE 8080

CMD ["mycount-api"]
