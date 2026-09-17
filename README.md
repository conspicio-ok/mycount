# mycount

## Architecture de lancement

| Service | Dev (`compose.dev.yaml`) | Prod (`compose.yaml`) |
|---|---|---|
| `back` (API Go) | air, recompilation à chaud, code monté | binaire statique, utilisateur non-root |
| `front` | serveur Vite sur `localhost:5173`, proxy `/api` | Caddy : SPA statique + proxy `/api`, HTTPS automatique |
| Base SQLite | `./data/mycount.db` | volume Docker `mycount_data` |

Chaque `Dockerfile` est multi-stage : `dev` pour le développement, `build` puis `prod` pour la
production. Sans `--target`, c'est `prod` qui est construit.

L'API n'expose aucun port : tout passe par le front (Vite ou Caddy), seul point d'entrée.

## URL d'accès

| Mode de lancement | Commande | URL |
|---|---|---|
| Développement | `docker compose -f compose.yaml -f compose.dev.yaml up` | <http://localhost:5173> |
| Prod locale | `docker compose up -d` | <http://localhost> |
| Prod locale, `HTTP_PORT` changé | `HTTP_PORT=8080 docker compose up -d` | `http://localhost:<HTTP_PORT>` |
| Prod locale, depuis une autre machine | idem, avec `AUTH_COOKIE_SECURE=false` | `http://<ip-de-la-machine>` |
| Serveur avec domaine | `docker compose up -d`, `SITE_ADDRESS` dans `.env` | `https://<SITE_ADDRESS>` |

En dev, Vite affiche `http://localhost:8080/` au démarrage : c'est l'adresse vue depuis
l'intérieur du conteneur. Depuis l'hôte, le port publié est `5173`.

## Prérequis

- Docker avec le plugin Compose ≥ 2.24 (`docker compose version`)
- `openssl` pour générer le secret

## Secret JWT

### Rôle

L'API signe les jetons de session (JWT HS256, en cookies HttpOnly) avec ce secret. Quiconque le
connaît peut forger un jeton pour n'importe quel compte, admin compris : il se traite comme un
mot de passe root. Il n'est jamais versionné (`.secrets/` est dans `.gitignore`).

### Création

À faire une fois par machine (poste de dev, serveur), avant tout lancement. Chaque machine a
son propre secret : ne pas copier celui du dev en prod.

```sh
mkdir -p .secrets
openssl rand -base64 48 > .secrets/JWT_SECRET
```

48 octets aléatoires, encodés en 64 caractères. L'API refuse de démarrer si le secret est
absent ou fait moins de 32 caractères. Les espaces et retours à la ligne autour sont ignorés.

### Emplacement

```
mycount/
├── .secrets/
│   └── JWT_SECRET      ← le fichier, une seule ligne
├── compose.yaml
└── …
```

Compose le monte dans le conteneur de l'API en `/run/secrets/JWT_SECRET`, chemin indiqué à
l'API par `JWT_SECRET_FILE`. Le secret n'apparaît donc ni dans `docker inspect`, ni dans
l'environnement du processus.

### Droits

```sh
chmod 700 .secrets
chmod 644 .secrets/JWT_SECRET
```

- Dossier en `700` : seul le propriétaire peut lister ou ouvrir son contenu. C'est lui qui
  protège le secret sur l'hôte.
- Fichier en `644` : hors Swarm, Compose monte le secret avec les droits de l'hôte. L'API de
  prod tourne sous l'utilisateur `10001`, qui doit pouvoir le lire. En `600`, l'API ne démarre
  pas (`lecture de /run/secrets/JWT_SECRET : permission denied`).
- En dev, l'API tourne en root : `600` suffit, `644` fonctionne aussi.

### Renouvellement

À faire en cas de fuite supposée (secret commité, copié, serveur compromis) :

```sh
openssl rand -base64 48 > .secrets/JWT_SECRET
docker compose up -d --force-recreate back
```

Toutes les sessions sont invalidées : chaque utilisateur doit se reconnecter. Aucune donnée
n'est perdue.

### CI/CD

Le secret reste sur le serveur, créé à la main une fois selon les étapes ci-dessus. Le pipeline
ne le connaît pas et ne le transporte pas.

## Lancement local (prod, à la main)

```sh
docker compose up -d --build
```

Ouvrir <http://localhost>. Sans configuration, Caddy sert en HTTP sur le port 80.

- Port déjà pris : `HTTP_PORT=8080 docker compose up -d`, puis <http://localhost:8080>.
- Accès depuis une autre machine par IP, en HTTP : les cookies de session sont `Secure` et ne
  passent qu'en HTTPS ou sur `localhost`. Ajouter `AUTH_COOKIE_SECURE=false`, à réserver à un
  réseau de confiance (mots de passe en clair).

Arrêt : `docker compose down` (les données restent dans le volume).

## Déploiement sur un serveur (HTTPS)

Prérequis : un nom de domaine pointant sur le serveur, ports 80 et 443 ouverts.

Créer le fichier `.env` (non versionné) depuis le modèle, puis y renseigner le domaine :

```sh
cp .env.example .env
```

```sh
SITE_ADDRESS=mycount.example.com
```

Puis :

```sh
docker compose up -d --build
```

Caddy obtient et renouvelle seul le certificat Let's Encrypt (port 80 requis pour la
validation). Les certificats sont conservés dans le volume `mycount_caddy_data`.

### Premier compte

L'inscription n'est ouverte que tant que la base est vide : le premier compte créé devient
administrateur et l'inscription se ferme. **Créer ce compte immédiatement après le premier
déploiement.** Les comptes suivants se créent depuis la page Compte, section Administration.

### Mise à jour

```sh
git pull
docker compose up -d --build
```

Le schéma de la base est rejoué au démarrage de l'API (instructions idempotentes). Une colonne
ajoutée à une table existante demande une migration manuelle, indiquée avec le changement.

## Développement

```sh
docker compose -f compose.yaml -f compose.dev.yaml up --build
```

Ouvrir <http://localhost:5173>.

- Le code de `api/` et `front/` est monté dans les conteneurs : air recompile l'API, Vite
  recharge le front.
- Première compilation de l'API longue (SQLite en C) : le front attend que l'API réponde.
- Base de dev : `./data/mycount.db`, distincte du volume de prod.
- Dépendance npm ajoutée : relancer avec `--build` (les `node_modules` vivent dans l'image).

Le fichier de dev n'est pas nommé `compose.override.yaml` exprès : chargé automatiquement,
il transformerait tout `docker compose up` en lancement de dev.

## Variables

À placer dans `.env` à la racine (modèle commenté : `.env.example`), ou dans l'environnement
du shell.

| Variable | Défaut | Rôle |
|---|---|---|
| `SITE_ADDRESS` | `:80` | Domaine → HTTPS automatique ; `:80` → HTTP simple |
| `HTTP_PORT` | `80` | Port HTTP publié sur l'hôte |
| `HTTPS_PORT` | `443` | Port HTTPS publié sur l'hôte |
| `AUTH_COOKIE_SECURE` | `true` | `false` uniquement pour un accès HTTP hors `localhost` |
| `MYCOUNT_REGISTRY` | `mycount` | Préfixe des images (registry en CI/CD) |
| `MYCOUNT_TAG` | `latest` | Tag des images |

Fixées dans `compose.yaml`, à ne changer qu'avec l'architecture :

| Variable | Valeur | Rôle |
|---|---|---|
| `TRUSTED_PROXY_HOPS` | `1` | Nombre de proxys devant l'API ; l'IP du client (bannissement après 5 échecs de connexion) est lue dans `X-Forwarded-For`. À passer à `2` si un reverse proxy est ajouté devant Caddy |
| `DB_PATH` | `/data/mycount.db` | Base SQLite dans le conteneur |

## Sauvegarde et restauration (prod)

Sauvegarde à chaud, cohérente même pendant des écritures :

```sh
docker compose exec back sqlite3 /data/mycount.db ".backup /data/backup.db"
docker compose cp back:/data/backup.db ./mycount-$(date +%F).db
```

Restauration, API arrêtée :

```sh
docker compose stop back
docker run --rm -v mycount_data:/data -v "$PWD":/src alpine sh -c \
  'cp /src/mycount-AAAA-MM-JJ.db /data/mycount.db \
   && rm -f /data/mycount.db-wal /data/mycount.db-shm \
   && chown 10001:10001 /data/mycount.db'
docker compose start back
```

La même commande importe une base de dev (`./data/mycount.db`) dans la prod.

## CI/CD GitLab

Pipeline non écrit à ce jour. Principe prévu, sur la même base que ci-dessus :

1. **build** : `docker build --target prod` de `api/` et `front/`, poussées vers le GitLab
   Container Registry, taguées avec le hash du commit.
2. **deploy** : connexion SSH au serveur, puis dans le dossier du projet :
   ```sh
   export MYCOUNT_REGISTRY=registry.gitlab.com/<groupe>/mycount MYCOUNT_TAG=<commit>
   docker compose pull
   docker compose up -d
   ```

Le serveur ne compile rien : il tire les images. Il garde en local `.secrets/JWT_SECRET` et
`.env` ; aucun secret ne transite par le dépôt.

Hébergement sur GitHub en parallèle : GitLab reste la source, un *push mirror* (Settings →
Repository → Mirroring repositories) recopie chaque push vers GitHub.
