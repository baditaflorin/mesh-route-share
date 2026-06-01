# mesh-route-share

[![pages](https://img.shields.io/badge/live-baditaflorin.github.io%2Fmesh-route-share-6366f1)](https://baditaflorin.github.io/mesh-route-share/)
[![version](https://img.shields.io/badge/version-0.1.1-blue)](https://github.com/baditaflorin/mesh-route-share/blob/main/package.json)
[![license](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

> A shared live map: everyone in the room sees each other's location dot and breadcrumb trail, plus a "who's reached the checkpoint" rally view.

Live: **https://baditaflorin.github.io/mesh-route-share/**

Source: **https://github.com/baditaflorin/mesh-route-share**

Tip the dev: **https://www.paypal.com/paypalme/florinbadita**

---

## What it is

A peer-to-peer live-location map. Type a name and hit **share my route** — your dot and a growing breadcrumb trail appear on every other peer's map in the same room. Drop a **checkpoint** and the app shows, live, who has reached it. Everything is opt-in and in-memory: nothing is sent until you tap share, and it's gone the moment every tab closes.

**Try it in 30 seconds:** open the live link in two browser tabs (they auto-join the same room), grant location in one, hit share, and watch your dot + trail appear in the other tab.

No backend of its own beyond the self-hosted WebRTC stack listed below. Built on `@baditaflorin/mesh-common`, hosted on GitHub Pages from `docs/`.

## Quickstart (local)

```bash
git clone https://github.com/baditaflorin/mesh-common
git clone https://github.com/baditaflorin/mesh-route-share
cd mesh-route-share
npm install
npm run dev
```

`mesh-common` must sit as a **sibling** directory because `package.json` references it via `file:../mesh-common`.

## Self-hosted infrastructure

| Repo                                              | Endpoint                               | Purpose                     |
| ------------------------------------------------- | -------------------------------------- | --------------------------- |
| https://github.com/baditaflorin/signaling-server  | `wss://turn.0docker.com/ws`            | y-webrtc signaling fan-out  |
| https://github.com/baditaflorin/turn-token-server | `https://turn.0docker.com/credentials` | HMAC TURN creds, 1-hour TTL |
| https://github.com/baditaflorin/coturn-hetzner    | `turn:turn.0docker.com:3479`           | TURN relay                  |

## Settings overrides (localStorage keys)

The settings drawer lets the user override signaling and TURN endpoints. Keys:

- `mesh-route-share:signalingUrl`
- `mesh-route-share:turnTokenUrl`
- `mesh-route-share:iceServers`
- `mesh-route-share:room`

If endpoints are blank or unreachable, the app falls back to STUN-only.

## Build & deploy

GitHub Pages serves the committed `docs/` directory on the `main` branch. There is **no GitHub Actions build workflow**; the Husky pre-commit + pre-push hooks gate formatting / typecheck / smoke build locally.

```bash
npm run smoke   # build + sanity-check docs/
```

## Privacy

See `docs/privacy.md` for the threat model — what other peers in the mesh see, what the self-hosted infra sees, what stays local.

## License

MIT — see `LICENSE`.
