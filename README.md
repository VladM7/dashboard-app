# Dashboard App

A Next.js + Electron dashboard application with Prisma and a local SQLite database.

---

## Prerequisites

- Node.js
- npm

---

## Install

```
npm install
```

---

## Run

### Web (Next.js only)

```
npm run dev
```

Then open `http://localhost:3000` for local development.
For non-localhost deployments, use `https://` to keep data in transit secure.

### Desktop (Electron + Next.js)

```
npm run dev:electron
```

This starts Next.js and launches the Electron shell once the app is ready.

---

## Build

### Web build

```
npm run build
```

### Desktop distributable (not fully working yet)

```
npm run dist
```

---

## Key Commands

- `npm run dev` — run Next.js dev server
- `npm run dev:electron` — run Next.js + Electron together
- `npm run electron` — launch Electron (expects the app to be served)
- `npm run build` — build Next.js
- `npm run start` — start Next.js in production mode
- `npm run lint` — run ESLint
- `npm run dist` — build and package Electron app

---

## Project Structure

```
app/            Next.js app router pages/layouts
components/     UI components and shared building blocks
hooks/          Custom React hooks
lib/            Utilities, helpers, and shared logic
electron/       Electron main process files
prisma/         Prisma schema and migrations
public/         Static assets
scripts/        Project scripts and tooling
```

---

## Notes

- The desktop app uses Electron and bundles the built Next.js output.
- Prisma is configured with a local SQLite database (`dev.db`).
- The `DATABASE_URL` environment variable in `.env` determines where the database file is saved. By default, it points to the project root (`./dev.db`), for example:
  - `DATABASE_URL="file:./dev.db"`
- The database schema can be found in the `./prisma/schema.prisma` file.
- Configuration files live at the repo root (`next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, etc.).

---
