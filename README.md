# Kinetic Capital Pay LLC — Static Website

This is a responsive, static one-page website scaffold for Kinetic Capital Pay LLC.

## Files
- `index.html` — main page
- `dashboard.html` — account dashboard preview
- `styles.css` — site styles
- `dashboard.js` — dashboard behavior and mock data loading
- `server.js` — Plaid-ready API server skeleton
- `.env.example` — required environment variables for a real Plaid connection
- `script.js` — small JS for nav, smooth scroll, simple form handling

## Quick start
1. Replace placeholder content (company description, testimonials, pricing).
2. Replace Formspree action in `index.html` with your real Formspree ID or your own server endpoint.
3. Install dependencies with `npm install`.
4. Copy `.env.example` to `.env` and add your Plaid credentials.
5. Start the app with `npm start`.

## Live banking integration
This project is ready for a Plaid-based bank connection pattern, but it does not connect to a real bank until you add valid credentials and deploy a backend endpoint. Keep API keys on the server, not in browser code.

## Deploy options
- GitHub Pages: push to `main` and enable Pages in repo settings.
- Netlify: drag-and-drop the folder or connect your repo.
- Vercel: connect repo and deploy.
- Backend: deploy `server.js` to a Node host such as Render, Railway, or a VPS.

## Next steps
- Add branding, logo, colors, and copy
- Configure your live Plaid credentials and link tokens
- Add merchant onboarding flows and dashboard pages
- Add privacy/terms pages and legal disclosures

If you want, I can continue by customizing the branding, connecting a real Plaid flow, or adding a payment dashboard.
