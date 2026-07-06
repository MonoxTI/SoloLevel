# SoloLevel — Personal Finance & Productivity System

SoloLevel is a self-hosted personal finance and productivity platform built around a Telegram bot interface and a web dashboard. It tracks your money, goals, daily habits, notes, and todos — all running on your own home server with no third-party subscriptions.

---

## What it does

### 💰 Finance tracking
Log expenses and income through Telegram in plain English. The system automatically categorises transactions, updates your net worth in real time, and shows spending breakdowns by category on the dashboard.

```
log R250 Woolworths        → logged as Groceries, net worth updated
income R15000 salary       → logged as Income, net worth updated
spending                   → shows this month's breakdown
net worth                  → shows current net worth and yearly goal progress
```

### 🎯 Goals
Set savings goals with difficulty levels (Easy / Medium / Hard). Each goal awards XP on completion. Track progress via the bot or the dashboard.

```
save R10000 hard by December    → creates a goal, awards 25 XP immediately
save R500 easy                  → easy goal, 50 XP on completion
show goals                      → lists all active goals with progress bars
```

### 📅 Daily habits
Four daily goals tracked every day — gym, code, maths, and reading. Complete them via the bot to earn XP. Miss them at midnight and lose XP. Streaks are tracked.

```
done gym        → +40 XP
done code       → +35 XP
done maths      → +35 XP
done reading    → +30 XP
daily           → shows today's status
```

### 🏆 XP & Levelling
Everything earns XP. There are 15 levels with an exponential curve. Your level and XP bar show on the dashboard overview.

| Action | XP |
|---|---|
| Log expense | +10 XP |
| Complete Easy goal | +50 XP |
| Complete Medium goal | +150 XP |
| Complete Hard goal | +300 XP |
| Daily gym | +40 XP |
| Daily code | +35 XP |
| Daily maths | +35 XP |
| Daily reading | +30 XP |
| Miss a daily | -10 to -15 XP |

### 📓 Notebooks & Notes
Create multiple notebooks on the dashboard — one for work, one for personal, one for studies, etc. Notes inside each notebook are kept forever. Add notes via Telegram (goes to General notebook by default) or write directly on the dashboard.

```
note: call the bank on Monday       → saved to General notebook
note: dissertation deadline June 30 → saved to General notebook
notes                               → shows recent notes
```

On the dashboard you can create named notebooks with custom emojis, write and edit notes inside them, and delete notes you no longer need.

### 📋 Todos
Todos are time-limited tasks. Add them via Telegram, view them on the dashboard. They auto-delete after 24 hours and send you Telegram reminders at 10h, 15h, and 22h after creation so nothing falls through the cracks.

```
todo: finish assignment          → created with 24h timer
todo: reply to client email      → created with 24h timer
todos                            → shows all active todos with time remaining
done todo 1                      → marks todo 1 as complete
```

### 📊 Dashboard
A dark-themed web interface accessible from any device on your home network. Pages:

- **Overview** — net worth, XP bar, spending summary, active goals, daily habits, ML insights
- **Goals** — full goals list with progress bars, create new goals
- **Spending** — category breakdown, recent transactions
- **Notes** — notebook sidebar, write and manage notes
- **Settings** — placeholder for future settings

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Your Home Server                   │
│                                                      │
│  ┌──────────────┐    ┌──────────────┐               │
│  │  Next.js     │    │  FastAPI     │               │
│  │  Dashboard   │───▶│  Python API  │               │
│  │  :3000       │    │  :8000       │               │
│  └──────────────┘    └──────┬───────┘               │
│                             │                        │
│  ┌──────────────┐    ┌──────▼───────┐               │
│  │  Telegram    │    │  Node.js     │               │
│  │  Bot(s)      │◀──▶│  Bot Backend │               │
│  │              │    │  :3001       │               │
│  └──────────────┘    └──────┬───────┘               │
│                             │                        │
│                      ┌──────▼───────┐               │
│                      │  PostgreSQL  │               │
│                      │  :5432       │               │
│                      └──────────────┘               │
└─────────────────────────────────────────────────────┘
         │                        │
         ▼                        ▼
  http://192.168.x.x:3000    Telegram app
  (any device on WiFi)       (anywhere)
```

| Service | Purpose | Port |
|---|---|---|
| Next.js dashboard | Web UI | 3000 |
| FastAPI Python backend | Finance logic, ML insights, API | 8000 |
| Node.js bot backend | Telegram bot, notes/todos, webhooks | 3001 |
| PostgreSQL | Database | 5432 |

---

## Tech stack

**Backend (Python)**
- FastAPI — REST API
- SQLAlchemy (async) — ORM
- PostgreSQL — database
- APScheduler — scheduled jobs (ML insights, daily miss penalties)
- scikit-learn — spending anomaly detection and goal predictions

**Backend (Node.js)**
- grammy — Telegram bot framework
- Prisma — ORM for notes, todos, notebooks
- Express — internal webhook server
- TypeScript

**Frontend**
- Next.js 14 (App Router)
- Tailwind CSS — dark theme
- TypeScript

**Infrastructure**
- Docker + Docker Compose — all services containerised
- Ubuntu — home server OS
- PostgreSQL in Docker — self-contained, no external DB needed

---

## Running it

### Prerequisites
- Docker and Docker Compose installed on your server
- A Telegram bot token (get one from [@BotFather](https://t.me/BotFather))
- Your server's local IP address (e.g. `192.168.10.148`)

### Setup

```bash
# Clone
git clone https://github.com/YOUR_USERNAME/SoloLevel.git
cd SoloLevel

# Configure
cp .env.example .env
nano .env   # fill in your values

# Build and start
docker compose up -d --build

# Check everything is running
docker compose ps
```

### `.env` values

```env
POSTGRES_PASSWORD=strong_password_here
SECRET_KEY=long_random_string_here
DEFAULT_USER_ID=c2888153-9809-46f5-840a-35bc1c0bd2a8

TELEGRAM_BOT_TOKEN=your_primary_bot_token
TELEGRAM_BOT_TOKEN_2=your_second_bot_token_optional
TELEGRAM_CHAT_ID=your_telegram_chat_id

NEXT_PUBLIC_API_URL=http://YOUR_SERVER_IP:8000
```

### Access

| URL | What |
|---|---|
| `http://YOUR_SERVER_IP:3000` | Dashboard (any device on WiFi) |
| `http://YOUR_SERVER_IP:8000/docs` | API documentation |
| `http://YOUR_SERVER_IP:8000/health` | Health check |

---

## Updating

```bash
git pull
docker compose up -d --build
```

Only changed containers rebuild. Database data is preserved in a Docker volume.

---

## All bot commands

```
💰 Expenses
  log R250 Woolworths
  spent R150 Uber
  paid R500 doctor

💵 Income
  income R5000 salary
  received R3000 freelance

💎 Net Worth
  set net worth R50000
  net worth

🎯 Goals
  save R1000 easy
  save R5000 medium by December
  save R10000 hard by August
  show goals

📅 Daily Goals
  daily
  done gym
  done code
  done maths
  done reading

📝 Notes
  note: buy milk
  note: call mom tomorrow
  notes

📋 Todos (auto-delete after 24h)
  todo: finish report
  todo: reply to client
  todos
  done todo 1

📊 Stats
  spending
  budget
  net worth
```

---

## Project structure

```
SoloLevel/
├── docker-compose.yml
├── .env.example
├── python-backend/          Python FastAPI
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py
│       ├── config.py
│       ├── models/          SQLAlchemy models
│       ├── routers/         API endpoints
│       └── services/        Business logic, ML, schedulers
├── node-backend/            Node.js Telegram bot
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── index.ts         Entry point, Express server
│       ├── ai/brain.ts      Intent parser (regex-based)
│       ├── bot/handlers.ts  Bot command handlers
│       ├── db/              Prisma client + schema
│       ├── routes/          REST routes for notes/todos
│       └── services/        Business logic, schedulers
└── dashboard/               Next.js web app
    ├── Dockerfile
    ├── app/dashboard/       Page components
    ├── components/          Reusable UI components
    └── lib/                 API client, types, utils
```

---

## Hardware

Running on a **Lenovo ThinkCentre M83** home server:
- Intel i5-4460
- 20GB RAM
- 500GB SSD
- 1TB HDD
- Ubuntu Server

Total resource usage across all containers: ~800MB RAM, minimal CPU at idle.
