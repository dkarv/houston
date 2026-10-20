# Houston

Remote help for people who aren't comfortable with technology. **Houston** (the helper) sends a link; **Apollo** (the person who needs help) opens it, taps one button, and they're talking. Apollo can then turn on the camera or show their screen.

Architecture and decisions: [docs/architecture.md](docs/architecture.md).

## Repository

```
apps/server     Fastify server: session API, signaling WebSocket, serves the web app, TURN
apps/app        Expo app: web, iOS, Android (Expo Router, react-native-web)
apps/app/modules/houston-android   Android native module: remote control, overlay
apps/desktop    Electron app: the web app plus remote control on Windows, macOS, Linux
packages/core   Call logic shared by all clients (signaling, WebRTC negotiation, media)
packages/protocol  zod schemas for the REST API and signaling messages
packages/turn   Embedded STUN/TURN server (turn-server library, in a worker thread)
e2e             Playwright tests: two browsers make a real call
docker          Dockerfile and compose example
```

## Development

Requires Node 24 and pnpm (`corepack enable`).

```bash
pnpm install
pnpm typecheck
pnpm test        # unit and integration tests
pnpm e2e         # builds the web app, starts the server, runs two-browser call tests (needs Chrome)
```

Run the server and the app's dev server side by side:

```bash
pnpm --filter @houston/server dev                     # http://localhost:3000
EXPO_PUBLIC_HOUSTON_URL=http://localhost:3000 pnpm --filter @houston/app web
```

Or build the web app once and let the server serve it:

```bash
pnpm --filter @houston/app build:web
HOUSTON_WEB_DIR=../app/dist pnpm --filter @houston/server dev
```

On a local network, relayed (TURN) connections only work with `HOUSTON_TURN_ALLOW_PRIVATE_PEERS=true`.

## Deployment

One Docker image with nothing but Node inside. Build it with `pnpm docker:build`, then:

```bash
docker run -d --name houston --network host --restart unless-stopped \
  -e HOUSTON_PUBLIC_URL=https://help.example.com \
  -e HOUSTON_TURN_EXTERNAL_IP=203.0.113.10 \
  -v houston-data:/data \
  houston
```

Put your reverse proxy in front of port 3000 for HTTPS. It must forward WebSocket upgrades on `/api/ws`. Open these ports directly on the server, not through the proxy:

| Port | Use |
|---|---|
| 3478/udp, 3478/tcp | STUN and TURN |
| 49160–49200/udp | TURN relay (change with `HOUSTON_TURN_RELAY_PORTS`) |

### Configuration

| Variable | Default | |
|---|---|---|
| `HOUSTON_PUBLIC_URL` | `http://localhost:3000` | URL people open; used for invite links |
| `HOUSTON_PORT` | `3000` | HTTP port |
| `HOUSTON_DATA_DIR` | `/data` in Docker | Holds the generated TURN secret |
| `HOUSTON_TRUST_PROXY` | `loopback,linklocal,uniquelocal` | Proxies whose `X-Forwarded-For` is trusted |
| `HOUSTON_RATE_LIMIT_PER_MINUTE` | `10` | Per IP, for creating and joining sessions |
| `HOUSTON_TURN_ENABLED` | `true` | |
| `HOUSTON_TURN_HOST` | host of the public URL | Hostname clients use for STUN/TURN |
| `HOUSTON_TURN_PORT` | `3478` | |
| `HOUSTON_TURN_EXTERNAL_IP` | – | Public IP of the server; set it if the server is behind NAT |
| `HOUSTON_TURN_RELAY_PORTS` | `49160-49200` | |
| `HOUSTON_TURN_SECRET` | generated | Shared secret for time-limited TURN credentials |
| `HOUSTON_SMTP_URL` | – | e.g. `smtps://user:pass@mail.example.com:465`. Without it, helpers can't sign in |
| `HOUSTON_MAIL_FROM` | `Houston <houston@your-domain>` | Sender of sign-in codes and ring emails |
| `HOUSTON_MAIL_DIR` | – | Development/tests: write mails as JSON files instead of sending |
| `HOUSTON_WEB_PUSH_ENABLED` | `true` | Browser notifications; keys are generated into the data directory |
| `HOUSTON_APNS_KEY_FILE`, `_KEY_ID`, `_TEAM_ID`, `_BUNDLE_ID` | – | iOS push with an APNs token key (.p8); all four needed |
| `HOUSTON_APNS_PRODUCTION` | `true` | `false` for development builds (Apple's sandbox) |
| `HOUSTON_FCM_SERVICE_ACCOUNT_FILE` | – | Android push: Firebase service account JSON |
| `HOUSTON_DESKTOP_DOWNLOAD_URL` | – | Download page for the desktop app, offered when a helper asks for control in a browser |

Everything works without accounts: anyone can start a session, and Apollo never signs in. Accounts (email code, no passwords) only make a helper reachable by email address.

The data directory holds `houston.db` (SQLite: accounts, ring history, push subscriptions) and generated secrets. Back it up.

## Builds and releases

GitHub Actions build everything:

| Workflow | On | Produces |
|---|---|---|
| CI | every push and pull request | typecheck, unit tests, end-to-end tests |
| Docker image | `main`, tags `v*` | `ghcr.io/<owner>/houston` for amd64 and arm64: `latest` and `main` follow `main`, `v1.2.3` adds `1.2.3` and `1.2` |
| Android app | `main`, tags `v*` | APK (signed with the debug key until a release key is configured) |
| Desktop installers | `main`, tags `v*` | Windows .exe, macOS .dmg/.zip, Linux AppImage/.deb |

Pushing a tag like `v0.1.0` attaches the APK and the installers to a GitHub release.

## Remote control

The helper asks for control from the call screen (web or desktop app); the person has to allow it each time and can stop it at any moment.

| Where the person is | What the helper can do |
|---|---|
| Desktop app on Windows, macOS, Linux X11 | Mouse and keyboard (macOS: after allowing Houston under Accessibility; until then only pointing) |
| Desktop app on Linux Wayland | Mouse and keyboard through the system's remote-desktop dialog |
| Android app | Taps, swipes and typing once "Houston remote help" is on in the accessibility settings; otherwise pointing via "display over other apps" |
| Browser on a computer | Nothing; the person is offered the desktop app, which takes the call over through a `houston://` link |
| iPhone, phone browsers | Nothing (yet) |

### Desktop app

```bash
pnpm --filter @houston/desktop dev                         # opens HOUSTON_DESKTOP_URL, the last server, or the built-in one
HOUSTON_DESKTOP_URL=http://localhost:3000 pnpm --filter @houston/desktop dev
pnpm --filter @houston/desktop dist                        # installers for the current OS into apps/desktop/release
```

The app's own server is set in `apps/desktop/package.json` (`houston.defaultServer`, currently `https://help.punzet.me`). It is trusted without asking; links to any other server ask the person first.

Installers for all three systems are built by the `Desktop installers` GitHub workflow (run it manually or push a `desktop-v*` tag). They are unsigned for now: Windows shows a SmartScreen warning, macOS needs right-click > Open the first time. Signing needs an Apple Developer ID and a Windows code-signing certificate. Before publishing, replace the placeholder icon in `apps/desktop/build`.

### Mobile push

The apps register their native push tokens with your server directly; no Expo push service is involved. iOS needs the APNs variables above. Android needs a Firebase project: put its `google-services.json` next to `apps/app/app.json` and reference it as `android.googleServicesFile`, and give the server the matching service account. Both only work in development or store builds, not in Expo Go.
