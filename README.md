<div align="center">

# 🪙 Coin Drift

**A secure 3D browser game with login, two-step verification and a premium player dashboard.**

Slide a glowing cube across floating worlds, collect every coin, and watch your runs turn into stats, achievements and leaderboard ranks.

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)](https://expressjs.com)
[![Three.js](https://img.shields.io/badge/Three.js-r128-000000?logo=three.js&logoColor=white)](https://threejs.org)
[![SQLite](https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white)](https://www.sqlite.org)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[Features](#-features) · [Quick start](#-quick-start) · [Security](#-security) · [API](#-api-overview) · [Deploy](#-deployment)

</div>

---

## ✨ Features

### 🎮 The game
- **Five themed worlds:** Neon Night, Ember Ruins, Frostfield, Storm Spire and Void Core, each with its own lighting, sky, enemies and intro cutscene.
- **Raycasting interaction:** hover a coin to highlight it, click or tap to pull it in with a magnet (costs a charge and 2 seconds).
- **Hearts, hazards and powers:** patrolling sentries, lava bombs, ricocheting ice shards, lightning and chasing stalkers, plus a special power per world (key `E`).
- **Three stars per world:** one for clearing it and one for each of two bonus goals (speed, no damage, no magnet, all gems, time left).
- **Controls for everyone:** `W A S D` and dash on desktop, on-screen joystick on phones and tablets, generated sound effects with mute.

### 📊 The dashboard
- Overview with player level and title, daily quests, stat tiles, interactive chart, records, 12-week activity heatmap and a 3D hero.
- Run history with filters, sorting, pagination and CSV export.
- 12 achievements, all-time and weekly leaderboard with podium, rival tracking.
- Light and dark themes, six accent colours, command palette (`Ctrl + K`), mobile tab bar.
- All statistics are calculated on the server, so the browser cannot fake them.

### 🔐 The security layer
- Peppered, salted bcrypt password hashing, account lockout and a common-password block.
- Two-step verification (TOTP) with QR setup and one-time recovery codes.
- Hashed session tokens, idle timeout, device list with revoke, and an audit log.
- One-time run tokens and server-side score checks against cheating.

---

## 🧰 Tech stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, vanilla JavaScript |
| 3D engine | Three.js r128 (game, login backdrop, dashboard hero) |
| Backend | Node.js, Express 5 |
| Database | SQLite via better-sqlite3 |
| Security | bcryptjs, helmet, express-rate-limit, TOTP 2FA, qrcode |
| Infrastructure | Optional Redis, Docker and Docker Compose |

---

## 🚀 Quick start

**Requirements:** Node.js 18 or newer.

```bash
# 1. Clone
git clone https://github.com/YOUR_USERNAME/coin-drift.git
cd coin-drift

# 2. Install
npm install

# 3. Configure
cp .env.example .env      # Windows PowerShell: copy .env.example .env
# edit .env and set PEPPER to a long random value

# 4. Run
npm start
```

Open **http://localhost:3000**, create an account and press **Play**.

### Run with Docker

```bash
cp .env.example .env      # set PEPPER and REDIS_PASSWORD
docker compose up --build
```

The app runs as a non-root user in a read-only container, and Redis is password protected and not exposed to the host.

---

## ⚙️ Configuration

| Variable | Description | Default |
|---|---|---|
| `PEPPER` | Secret mixed into password hashes. **Required in production.** | dev value (development only) |
| `REDIS_PASSWORD` | Redis password for the Docker setup | none |
| `REDIS_URL` | Enables the Redis store when set | in-memory store |
| `COOKIE_SECURE` | Set `true` when served over HTTPS | `true` in production |
| `SESSION_IDLE_MIN` | Minutes of inactivity before sign-out | `1440` |
| `DB_PATH` | SQLite file path (use a persistent disk in production) | `./data.db` |
| `PORT` | Server port | `3000` |

Generate a strong secret with `openssl rand -hex 32`. **Never commit your `.env` file.**

---

## 🛡 Security

| Area | What is done |
|---|---|
| Passwords | HMAC-SHA256 with a secret pepper, then salted bcrypt (cost 12). Dummy compare hides which usernames exist. |
| Validation | Server-side whitelist rules for username, email and password; common passwords rejected. |
| Injection / XSS | Parameterized SQL only; the UI writes user data with `textContent`; JSON bodies limited to 10 KB. |
| Rate limiting | API, login, 2FA and run saving each have their own limits (HTTP 429). |
| Sessions | Random 256-bit token in an httpOnly, SameSite=Strict cookie; only its SHA-256 is stored. |
| Headers | helmet with a Content Security Policy; JSON-only writes; cross-origin writes blocked. |
| 2FA | RFC 6238 TOTP, secret encrypted with AES-256-GCM, codes cannot be reused, recovery codes stored as hashes. |
| Anti-cheat | One-time run tokens, range checks and a comparison with real elapsed time. |
| Audit | Signups, logins, failures, lockouts, 2FA changes and rejected runs are logged. |

---

## 🔌 API overview

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/signup`, `/api/login`, `/api/logout` | Account access |
| POST | `/api/login/2fa` | Second step of login |
| POST | `/api/2fa/setup`, `/enable`, `/disable`, `/recovery` | Manage two-step verification |
| POST | `/api/runs/start`, `/api/runs` | Get a run token, then save the finished run |
| GET | `/api/dashboard`, `/api/history`, `/api/leaderboard` | Dashboard data |
| GET | `/api/security`, `/api/export.csv` | Security center, CSV export |
| POST | `/api/password`, `/api/account/delete`, `/api/profile` | Account settings |
| GET | `/healthz` | Health check |

---

## 📁 Project structure

```
coin-drift/
├── server.js            Express server, API, auth, security
├── store.js             Redis / in-memory store and rate limiters
├── views/
│   ├── auth.html        Login and signup
│   ├── dashboard.html   Player dashboard
│   └── game.html        3D game page
├── public/
│   ├── Coin.js          Game logic (Three.js, raycasting)
│   ├── levels.js        Data for the five worlds
│   ├── auth.js          Auth page logic
│   ├── auth3d.js        3D login backdrop
│   ├── dashboard.js     Dashboard views and charts
│   ├── dash3d.js        3D dashboard layer
│   └── *.css            Styles
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

---

## ☁️ Deployment

Coin Drift is a single Node.js service, so it runs on platforms such as Render or Railway:

1. Push the repository to GitHub.
2. Create a new Web Service from it with build command `npm install` and start command `npm start`.
3. Set `NODE_ENV=production`, `PEPPER` and `DB_PATH` (for example `/var/data/data.db`).
4. Attach a **persistent disk**. SQLite stores data in a file, so without a disk the database resets on every deploy.

The server already trusts the hosting proxy, so rate limiting sees the real visitor address.

---

## 🗺 Roadmap

- [ ] Email verification and password reset
- [ ] PostgreSQL option for larger traffic
- [ ] Per-world leaderboards
- [ ] More worlds and hazards

---

## 🤝 Contributing

Issues and pull requests are welcome. For larger changes, please open an issue first to discuss what you would like to change.

---

## 📄 License

Released under the [MIT License](LICENSE).

---

<div align="center">

Built by **Farrukh Ahmad** · NED University of Engineering and Technology · Web 3D Programming (CT-401)

⭐ If you like the project, give it a star.

</div>
