<p align="center">
  <img width="100" src="https://raw.githubusercontent.com/spacebarchat/spacebarchat/master/branding/png/Spacebar__Icon-Rounded-Subtract.png" />
</p>
<h1 align="center">Spacebar Server</h1>

<p align="center">
  <a href="https://matrix.to/#/#spacebar:rory.gay">
    <img src="https://img.shields.io/matrix/spacebar%3Arory.gay?server_fqdn=matrix.rory.gay&fetchMode=summary&logo=matrix&logoColor=fffffff&label=Matrix" />
  </a>
  <a href="https://fermi.chat/invite/NAa7zJ?instance=https%3A%2F%2Fspacebar.chat">
    <img src="https://api.old.server.spacebar.chat/api/guilds/1006649183970562092/shield.svg" />
  </a>
  <a href="https://discord.gg/ZrnGQP6p3d">
    <img src="https://img.shields.io/discord/806142446094385153?color=7489d5&logo=discord&logoColor=ffffff&label=Discord" />
  </a>
  <img src="https://img.shields.io/static/v1?label=Status&message=Development&color=blue">
  <a title="Crowdin" target="_blank" href="https://translate.spacebar.chat/"><img src="https://badges.crowdin.net/fosscord/localized.svg"></a>
   <a href="https://opencollective.com/spacebar">
    <img src="https://opencollective.com/spacebar/tiers/badge.svg">
  </a>
</p>

## [About](https://spacebar.chat)

Spacebar/server is a Discord backend re-implementation and extension.
We aim to reverse engineer and add additional features to the Discord backend, while remaining completely backwards compatible with existing bots, applications, and clients.

This repository contains:

- [API Request/Response Types](/src/schemas)
- [Spacebar HTTP API Server](/src/api)
- [WebSocket Gateway Server](/src/gateway)
- [HTTP CDN Server](/src/cdn)
- [WebRTC Server](/src/webrtc)
- [Utility and Database Models](/src/util)
- Admin API is built into the Node API at `/_spacebar/admin` (OPERATOR-gated)

## [Documentation](https://docs.spacebar.chat)

And with documentation on how to set up your own server [here](https://docs.spacebar.chat/setup/server), docs to set up either client [here](https://docs.spacebar.chat/setup/clients/), and docs about bots [here](https://docs.spacebar.chat/setup/bots/)

## [Contributing](https://docs.spacebar.chat/contributing/)

## Clients

You _should_ be able to use any client designed for Discord.com to connect to a Spacebar instance.
However, some incompatibilities still exist between Spacebar and Discord. For this reason, not every client will connect.  
We recommend using [Fermi](https://fermi.chat/login?instance=https%3A%2F%2Fspacebar.chat) as a solid starting point on your adventure in the SpaceBar!

# Spacebar Server

Spacebar API, Gateway, CDN, and voice (mediasoup WebRTC). Pairs with the **Fermi** client.

## Overview

- **Spacebar**: Backend with REST API, WebSocket gateway, CDN, and WebRTC voice/video (mediasoup)
- **Fermi**: Web and Electron client with Go Live screen sharing

## Features

- Voice channels with Opus audio
- Video calling with webcam support
- **Go Live** screen sharing at 720p H.264 (Fermi)
- Windows desktop client (.exe) via Fermi
- Self-hosted on your own infrastructure

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       Host / VM                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  Spacebar   │  │    CDN      │  │  mediasoup WebRTC   │ │
│  │   Server    │◄─┤   Server    │  │       SFU           │ │
│  │  (API/GW)   │  │             │  │                     │ │
│  └──────┬──────┘  └─────────────┘  └──────────┬──────────┘ │
│         │                                      │            │
│         │ WebSocket                       UDP Media         │
└─────────┼──────────────────────────────────────┼────────────┘
          │                                      │
          ▼                                      ▼
    ┌───────────┐                         ┌───────────┐
    │  Fermi    │◄────── H.264 720p ──────┤  Fermi    │
    │ Client 1  │         Stream          │ Client 2  │
    └───────────┘                         └───────────┘
```

## Project Structure (server)

```
server/
├── src/
│   ├── webrtc/        # WebRTC/voice (mediasoup)
│   ├── api/           # REST API
│   └── gateway/       # WebSocket gateway
└── nginx.conf.example # Nginx proxy config
```

## Quick Start

### 1. Configure environment

```bash
cd server
cp .env.example .env
# Edit .env: WRTC_LIBRARY=@spacebarchat/mediasoup-webrtc, WRTC_PUBLIC_IP=your-public-ip
```

### 2. Install and start

```bash
npm install
npm run build
npm start
```

After `npm install`, run `npm audit` and `npm audit fix` to check and fix known vulnerabilities.

### Fermi client

Build the Windows desktop client:

```bash
cd ../Fermi
npm install
npm run dist:win
```

Installer: `Fermi/release/`. See [Fermi/DESKTOP_BUILD.md](../Fermi/DESKTOP_BUILD.md).

### Testing ETF encoding

The gateway supports **ETF** (Erlang Term Format) for smaller, faster payloads. ETF uses `@yukikaze-bot/erlpack` (native, optional) when available, and **wetf** (pure-JS) as a fallback, so ETF works even without the native build.

1. **Server** – If you see `ETF: using wetf (pure-JS); @yukikaze-bot/erlpack not available.`, the native optional dep is missing; ETF still works via wetf. To use the native implementation: `npm i @yukikaze-bot/erlpack`.

2. **Script** – With the server running, from `server/`:
   ```bash
   npm run test:etf
   ```
   For the full bundle (`npm start` on port 3001), set `GATEWAY_URL=ws://127.0.0.1:3001` before running. If you see `ETF test OK`, both server→client and client→server ETF work.

## Voice & Video (WebRTC)

Voice and video use **mediasoup** as the WebRTC SFU. It is a normal server dependency (installed with `npm install`).

### Environment

In `.env` (or copy from `.env.example`):

```env
WRTC_LIBRARY=@spacebarchat/mediasoup-webrtc
WRTC_PUBLIC_IP=YOUR_PUBLIC_IP
WRTC_PORT_MIN=10020
WRTC_PORT_MAX=10100
```

Use your server’s public IP so clients can reach the WebRTC ports.

### Ports & Firewall

- **TCP**: 3001 (API), 3002 (Gateway), 3003 (CDN), 3004 (Voice WebSocket)
- **UDP**: `WRTC_PORT_MIN`–`WRTC_PORT_MAX` (e.g. 10020–10100) for media

Open the UDP range on your firewall, e.g.:

```bash
sudo ufw allow 10020:10100/udp
```

### Nginx (Voice WebSocket)

The voice WebSocket is on port 3004. Example:

```nginx
location /voice {
    proxy_pass http://127.0.0.1:3004;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 86400;
    proxy_send_timeout 86400;
}
```

### Docker / docker-compose

`docker-compose.yml` sets `WRTC_LIBRARY=@spacebarchat/mediasoup-webrtc`. In `.env` for compose, set `WRTC_PUBLIC_IP` and ensure the UDP port range is forwarded (e.g. `10020-10100:10020-10100/udp`).

### Codecs (mediasoup)

- **Video**: H.264, VP8, VP9, AV1 — Fermi prefers H.264
- **Audio**: Opus, multiopus (multichannel), PCMU (G.711 μ-law), PCMA (G.711 A-law), G.722, iLBC, ISAC, SILK

### Troubleshooting

| Issue | Checks |
|-------|--------|
| Voice not connecting | `WRTC_PUBLIC_IP` correct; UDP `WRTC_PORT_MIN`–`WRTC_PORT_MAX` open; server logs for WebRTC errors |
| Poor video | Client uplink; UDP not throttled |
| High latency | Use a nearby server; consider TURN for strict NAT |

## Hardware Requirements

**Server** (for ~10 users):

- CPU: Any modern multi-core (encoding is client-side)
- RAM: 2GB minimum
- Network: 100 Mbps upload (40 Mbps actual usage for 10 users at 720p)
- Ports: TCP 3001-3004, UDP 10020–10100 (or your `WRTC_PORT_MIN`–`WRTC_PORT_MAX`)

**Fermi client**:

- Windows 10/11 x64
- 4GB RAM
- Hardware video encoder (Intel Quick Sync, NVIDIA NVENC, or AMD VCE)

## Technology Stack

| Component  | Technology            |
|-----------|------------------------|
| Backend   | Node.js, TypeScript   |
| WebRTC SFU| mediasoup             |
| Database  | PostgreSQL            |
| Client    | Fermi (TypeScript, Electron) |
| Video     | H.264, VP8, VP9, AV1 (Fermi prefers H.264 Baseline) |
| Audio     | Opus, PCMU, PCMA, G.722, iLBC, ISAC, SILK, multiopus |

## Supported Codecs

| Codec | Video | Audio |
|-------|-------|-------|
| H.264 | ✓     | -     |
| VP8   | ✓     | -     |
| VP9   | ✓     | -     |
| AV1   | ✓     | -     |
| Opus  | -     | ✓     |
| multiopus | -  | ✓     |
| PCMU (G.711 μ-law) | - | ✓ |
| PCMA (G.711 A-law) | - | ✓ |
| G.722 | -     | ✓     |
| iLBC  | -     | ✓     |
| ISAC  | -     | ✓     |
| SILK  | -     | ✓     |

## Documentation

- [Fermi Desktop Build](../Fermi/DESKTOP_BUILD.md)
- [Nginx Configuration](nginx.conf.example)

## License

AGPL-3.0

## Credits

- [Spacebar](https://github.com/spacebarchat) — API server
- [Fermi](https://github.com/MathMan05/Fermi) — Web and Electron client
- [mediasoup](https://github.com/versatica/mediasoup) — WebRTC SFU
