# Pila More More — frontend

老師專心教學，每個人都看得見進步。

A Pilates studio app built on Lift More More's frontend (`~/Desktop/liftmoremore/frontend`).
The layout, roles and features match Lift More More; what changed is the Pilates domain:

- **Moves**: the classical repertoire on the reformer, mat, chair, cadillac, barrel and small
  props (`src/data/exercises.ts`, muscles in `src/lib/muscles.ts`).
- **Logging**: each set records the spring setting (e.g. 1紅1藍, `src/lib/springs.ts`) and reps;
  moves off the springs record reps only; the jump board, walks and runs are logged as time.
- **Progress**: most reps per move, total reps, the springs used last time; springs are never
  charted as progress (more springs is not always harder).
- **Not built (yet)**: Lift's training plans and analytics pages.
- Brand: name, rose 玫瑰粉 palette, Reformer logo (`src/config/brand.ts`, `src/index.css`).

It runs in the same two modes as Lift More More:

- **Offline demo** (default): fictional data stored in this browser's `localStorage`; no login.
- **Backend mode**: set `VITE_API_URL` to an API compatible with Lift More More's backend.
  Pilamoremore has no backend of its own yet.

## Run locally

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck (tsc) + production build to dist/
npm run lint
```

Open `/demo` and pick an identity (studio owner, studio teacher and their student, an individual
teacher and their student, or someone practising on their own). Switch any time from the sidebar
(desktop) or the top-right chip (phones); the same dialog resets the demo data.

The earlier group-class prototype is kept outside the project, in `~/Desktop/Pilamoremore-v1-group-classes`.
