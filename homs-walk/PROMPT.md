# Homs Walk: build prompt

Paste everything below the line into a fresh Claude session (Claude Code works best because it can commit to this repo). First fill in the **`[FILL IN]`** parts using the checklist in [`README.md`](README.md).

---

You're building **Homs Walk**, a small pixel-art side-scroller you can stroll through in the browser. It shows the city of Homs, Syria, synced to Homs's **real local time, date, and weather**. It lives in the `homs-walk/` folder of my `forfun` repo, where everything is built with Claude at full effort, just for fun. Make it charming, polished, and finished, not a tech demo.

## The vibe (reference)
This is inspired by a "Seattle city walk" made in Claude. In that one, a tiny chibi pixel character walks left and right along a sidewalk. Behind them are layered parallax backgrounds: a far mountain (Mt. Rainier), a mid skyline (the Space Needle), and nearby storefronts (Pike Place "MARKET" sign, a flower stall, a COFFEE shop with glowing windows). A road with little pixel cars runs along the bottom, with a crosswalk, streetlamps, birds, and drifting clouds. A small label at the top left names the current area, and buttons at the top right switch time and weather. Everything is chunky, crisp pixels in a warm, cozy palette with a sunset gradient sky.

**Do the same for Homs**, with one key difference: time and weather are **live**, not toggled by default.

## Core requirements
1. **Pixel walk view**
   - Side-scrolling street, walk with ←/→ or A/D and tap/hold on screen halves on mobile. Walk animation of at least 4 frames, idle bob, and a turnaround when changing direction.
   - 3–5 parallax layers: sky → far hills → city silhouette → main street → foreground (lamps, people, cars).
   - Render at a low internal resolution (e.g. 320×180 or 384×216) on a `<canvas>` and scale up with `image-rendering: pixelated` and integer scaling. Every pixel must stay crisp.
   - The street loops or has clear ends with a gentle turnaround, about 4–6 screen-widths long, split into named **zones**. The top-left label updates as you enter each zone (Arabic + English, e.g. `جامع خالد بن الوليد · Khalid ibn al-Walid Mosque`).

2. **Real Homs time**
   - Use `Intl.DateTimeFormat` with `timeZone: 'Asia/Damascus'` (Syria is UTC+3 all year). Never trust the visitor's local clock offset.
   - Compute sun altitude for Homs (lat **34.7324**, lon **36.7137**) with a small inline solar-position function (no library). Use it to drive the sky gradient continuously: night → blue hour → dawn → day → golden hour → sunset → dusk → night. Blend between palette keyframes. No hard switches.
   - At night: lit windows (randomised and stable per building), streetlamp glow, stars, and the moon at the correct phase (computed).

3. **Real Homs weather**
   - Fetch from **Open-Meteo** (free, no API key):
     `https://api.open-meteo.com/v1/forecast?latitude=34.7324&longitude=36.7137&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day,cloud_cover,precipitation&daily=sunrise,sunset&timezone=Asia%2FDamascus`
   - Refresh every 10–15 minutes. Map WMO `weather_code` → scene state: clear, partly cloudy, overcast, fog/haze, drizzle, rain, thunderstorm (lightning flash), snow (rare but possible in winter, so make it magical). Use wind speed for cloud drift and rain slant. Add a summer dust-haze state when it's hot and clear.
   - If the fetch fails, fall back to clear weather silently and show `—` in the panel. Never show a broken UI.

4. **Info panel (top right)**
   - A small pixel-styled card showing the Homs time (live, with seconds or a blinking colon), the Gregorian date, the **Hijri date** (`Intl` with `calendar: 'islamic-umalqura'`), the temperature (°C), a pixel weather icon with its condition, plus sunrise/sunset.
   - Collapsible. Behind a toggle, include a **"preview" mode** with time slider and weather override (like the Seattle demo's buttons) so people can see night/rain even when it's sunny at noon. A clear "Live" button snaps back.
   - Bilingual where it's cheap to do (`[FILL IN: Arabic+English / English only / Arabic first]`).

5. **Homs, done lovingly.** Draw these as recognisable pixel landmarks, all procedurally drawn or hand-placed pixel art, no external images:
   - **Khalid ibn al-Walid Mosque**: the striped black-basalt and white-limestone (ablaq) walls, the two slender Ottoman pencil minarets, and the silvery domes. This is the hero landmark.
   - **The Clock Tower in the main square** (Sa'a al-Jadida, the "new clock"). Its pixel clock face should show the **real Homs time**.
   - The **Old City**: black basalt houses, wooden mashrabiya balconies, arched doorways, jasmine and bougainvillea spilling over walls, the covered **souq** (Souq al-Masqouf) with hanging lanterns and shop awnings.
   - **Umm al-Zennar Church**, with its bell tower near the mosque, as a quiet nod to the city's shared fabric.
   - The **Orontes river (Al-Assi)** with a waterwheel or riverside cafe and trees.
   - On the far horizon: the **Citadel mound**, and on a clear day the hills toward **Krak des Chevaliers** to the west.
   - Street life: a sweets shop with **halawet el-jibn** (Homs's famous sweet), a falafel stand, a coffee seller with a dallah, a ka'ak cart, a cat or two, pigeons that scatter when you walk past, old Peugeots or taxis (yellow) and minibuses on the road.
   - `[FILL IN: any personal places, such as my street, school, family's shop, favourite café, with a one-line description each]`
   - Tone: `[FILL IN: e.g. "Homs as it is remembered and as it is being rebuilt: warm, hopeful, lived-in. No war imagery."]`

6. **Character**
   - `[FILL IN: describe me or attach a reference image. Hair, glasses, clothing colours, anything iconic such as a keffiyeh, backpack, or headphones.]`
   - Chibi proportions about 24–32px tall at internal resolution, with a 1px dark outline and a soft shadow underneath. Add a reflection in puddles when it's raining.

7. **Small touches (pick the best ones, don't drown it)**
   - Stand still for about 3 seconds near a shop and a small speech bubble pops up (e.g. "صباح الخير!" / "Sabah el-kheir!" in the morning).
   - Rain makes puddles that ripple, and umbrellas appear on passersby.
   - Birds over the minarets at golden hour.
   - Friday morning is calmer, with fewer cars.
   - During Ramadan (detect via Hijri month 9), add lanterns and fanous strung across the souq after sunset.
   - `[FILL IN: sound? "no sound" / "optional ambient toggle, off by default"]`

## Technical constraints
- **Lightweight is a hard requirement.** Use a single `index.html` with inline CSS + JS, or at most `index.html` + `main.js`. No frameworks, no build step, no npm. Aim for under ~150 KB total. Load no fonts from the network if possible, and draw pixel text with a tiny bitmap font you define inline. (One Google Font for Arabic, like *Noto Kufi Arabic*, is acceptable if it really helps.)
- All art is generated in code: palettes + drawing functions, or small sprite strings decoded at startup. Pre-render static layers to offscreen canvases once and redraw them only when the sky palette changes meaningfully.
- 60fps on a mid-range phone. Use `requestAnimationFrame` and pause when the tab is hidden.
- Works offline after first load, apart from the weather fetch.
- Responsive: fits landscape phones up to desktop, letterboxed with a sky-coloured background. Show a gentle "rotate your phone" hint in portrait, or just show a narrower view.
- Accessible enough: `aria-live` on the info panel, keyboard controls listed in a small `?` overlay, and respect `prefers-reduced-motion` (no rain streaks or lightning flashes; use calmer alternatives).
- Opens by double-clicking `index.html` *and* works on GitHub Pages.

## Deliverables
- `homs-walk/index.html` (+ `main.js` if split)
- Update `homs-walk/README.md`: what it is, controls, how the live time and weather work, and credits (Open-Meteo).
- Add a row for it in the root `README.md` projects table.
- Before you finish, run it in a headless browser, take screenshots at **noon clear, sunset, night, and rain** (use preview mode), look at them critically, fix anything ugly, then commit.

Take your time on the art. That's the whole point. Make someone from Homs smile when they see it.
