# Here are your Instructions

## Repository entry file

`index.html` lives in the repository root and is the project entry page for **Six6Fix — SME Business Operating System**.
It is a self-contained, dependency-free landing page (no build step, no CDN): open it directly in a browser, or serve the
repo root with any static server.

```bash
# from the repository root
python3 -m http.server 8080     # then open http://localhost:8080/index.html
```

What's in it:

- Hero with a live HTML/CSS mock of the workspace (sidebar, KPI strip, revenue chart, recent invoices).
- The six work areas (Overview, Customers, Sales, Money, Operations, People) and the system layer
  (Communications, Automations, Team & Access, Business Brain / Executive Cockpit).
- Engineering notes with syntax-highlighted excerpts from the real backend and frontend files.
- Quick start commands and the required `backend/.env` configuration.
- Dark-first theme with a light toggle (persisted in `localStorage`), responsive down to 360px,
  reduced-motion support and `data-testid` hooks on interactive elements.

To point the "Launch workspace" buttons at a deployed app, set `APP_URL` inside the inline `<script>` at the bottom of
`index.html`; when it is empty those buttons scroll to the Quick start section instead.

## Running the full application

See `memory/PRD.md` for the product spec, `render.yaml` for deployment, and `frontend/README.md` for frontend notes.

```bash
# API  → http://localhost:8001
cd backend && pip install -r requirements.txt && uvicorn server:app --reload --port 8001

# Web  → http://localhost:3000
cd frontend && npm install && REACT_APP_BACKEND_URL=http://localhost:8001 npm start
```
