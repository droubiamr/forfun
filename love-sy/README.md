# love.sy

Pixel-art walks through the cities of Syria. Each city follows its own real time, sky and weather.

- `love.sy` shows every city as a little pixel postcard of its best-known landmark.
- `love.sy/homs/` is the first walk ([Homs Walk](public/homs/README.md)).

## Layout
```
love-sy/
  wrangler.jsonc      Cloudflare config: serve ./public on love.sy
  public/
    index.html        the city picker
    404.html
    homs/             one folder per city (index.html + main.js)
```

## Add a city
1. Make a folder `public/<city>/` with its `index.html` (copy Homs as a starting point).
2. In `public/index.html`, give the city a `path` in the `CITIES` list (for example `path: '/damascus/'`). Its card switches from "Soon" to "Walk now".

## Run it locally
`python3 -m http.server -d public` then open http://localhost:8000. Preview the cards at another time of day with `?tod=night` (`day`, `dawn`, `dusk`, `night`).

## Deploy to Cloudflare
It's a static site, so it runs as a Worker that only serves files: no server code, and it fits easily in the free plan.

**Easiest: connect the GitHub repo once, and every push deploys itself.**
1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Import a repository** → pick this repo.
2. Set **Root directory** to `love-sy`, **Build command** to empty, **Deploy command** to `npx wrangler deploy`.
3. Deploy. Because `love.sy` is already on your Cloudflare account, the `custom_domain` route in `wrangler.jsonc` attaches the site to it.

**Or from your computer:** `cd love-sy && npx wrangler login && npx wrangler deploy`.

To also serve `www.love.sy`, add `{ "pattern": "www.love.sy", "custom_domain": true }` to `routes`.
