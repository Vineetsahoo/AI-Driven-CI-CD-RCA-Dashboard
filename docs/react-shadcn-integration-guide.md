# React + shadcn + Tailwind Integration Guide

This repository originally used a static frontend under `public/`. It now includes a React + TypeScript + Tailwind frontend at `frontend/` with shadcn-compatible structure.

## What was added

- React + TypeScript app scaffold (`frontend/`)
- Tailwind CSS configuration
- shadcn config (`frontend/components.json`)
- SaaS template component at `frontend/src/components/ui/saa-s-template.tsx`
- Demo entry at `frontend/src/demo.tsx`
- Live backend integration for:
  - `/api/overview`
  - `/api/incidents`
  - `/api/rca/providers`

## Default component path and why

In shadcn projects, the default component path is typically `src/components/ui` (aliased as `@/components/ui`).

Why this matters:

- Keeps all reusable UI primitives in one predictable location.
- Matches shadcn CLI generated imports and examples.
- Reduces broken imports during copy/paste integration.

If your project uses a different layout, either:

- Align the folder to `src/components/ui`, or
- Update aliases in `components.json`, `tsconfig`, and bundler config.

## If you need to set up from scratch with CLI

Inside `frontend/`:

```bash
npm install
npx tailwindcss init -p
npx shadcn@latest init
```

Choose:

- TypeScript: yes
- Tailwind CSS: yes
- Components path: `src/components`

Then place UI components in `src/components/ui`.

## External dependencies used

Frontend dependencies:

- `react`, `react-dom`
- `typescript`, `vite`, `@vitejs/plugin-react`
- `tailwindcss`, `postcss`, `autoprefixer`
- `lucide-react`
- `clsx`, `tailwind-merge`, `class-variance-authority`

## Required context/questions before reuse

- What props/data will be passed to the component?
- Do you need app-level state management (Redux, Zustand, React Query)?
- Which image assets are allowed (CDN, local, signed URLs)?
- What responsive breakpoints are required for mobile/tablet/desktop?
- Where should the component live in app routing (home page, dashboard, marketing)?

## Images and icons

- Replaced template image URLs with Unsplash URLs known to exist.
- Replaced inline SVG icons with `lucide-react` icons.

## Run commands

Backend (existing):

```bash
npm install
npm run dev
```

Frontend (new React app):

```bash
cd frontend
npm install
npm run dev
```

Optional root shortcuts:

```bash
npm run frontend:dev
npm run frontend:build
```

Production flow:

1. Build frontend: `npm run frontend:build`
2. Start backend: `npm run start`
3. Backend serves `frontend/dist` when available; otherwise it falls back to `public/`.
