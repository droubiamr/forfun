# love.sy

Pixel-art walks through the cities of Syria. [Homs](public/homs/) is the first.

- **Run:** `python3 -m http.server -d public`
- **Deploy (Cloudflare):** Workers & Pages → Import repository → keep the defaults (deploy command `npx wrangler deploy`). The config is `wrangler.jsonc` at the repo root.
- **Add a city:** add `public/<city>/`, then give the city a `path` in `public/index.html`.
- **Make your own:** every page has a `PROMPT.md` you can paste into Claude.
