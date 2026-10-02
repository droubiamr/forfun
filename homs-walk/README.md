# Homs Walk · حمص

A tiny pixel-art stroll through **Homs, Syria** that plays itself, like a looping video. Open the page and he starts walking from the Old Clock, down Al-Dablan Street past the manakish oven, the hummus shop and the sweets counter, through New Clock Square, into the covered souq, past the basalt houses of Old Homs, and on to Khalid ibn al-Walid Mosque. Then it fades and starts again.

The sky, sun, moon, stars, weather and clocks all follow **Homs right now**.

## Run it
Open `index.html` in a browser, or serve the folder (`python3 -m http.server`). There's no build step.

To put it on the web, turn on GitHub Pages for this repo (Settings → Pages → deploy from branch). The site will be at `/<repo>/homs-walk/`.

## What's live
- **Time**: `Asia/Damascus` (UTC+3). The clock faces in the scene show the real Homs time.
- **Sky**: the real sun and moon position and moon phase for Homs (34.73° N, 36.71° E), calculated in the browser. Stars come out after dusk, and windows, shops and street lamps light up as it gets dark. Shops roll their shutters down at night and on Friday mornings.
- **Weather**: [Open-Meteo](https://open-meteo.com/), which is free and needs no API key. It refreshes every 12 minutes. Clear, cloudy, overcast, fog, drizzle, rain, thunderstorms (lightning), snow and summer dust haze each have their own look. There are puddles and umbrellas in the rain, and it never rains inside the souq.
- **Calendar**: Gregorian and Hijri dates. During Ramadan he says "Ramadan Kareem" after sunset.

## Controls (optional)
| | |
|---|---|
| `Space` | pause or resume the walk |
| `←` `→` (hold `Shift` to hurry) | take over for a bit. Auto-walk comes back after 3 s |
| `P` | preview mode: pick any time of day or weather |
| `M` | soundtrack: an original chiptune in maqam Hijaz with a maqsum darbuka beat (off by default) |
| click the info card | collapse it |

Shareable moments: `?t=18:30&w=rain&x=1600` (time, weather, position).
Weather options: `clear` `partly` `overcast` `fog` `rain` `storm` `snow` `dust`.

## How it's made
`index.html` (the info panel and controls) plus `main.js` (everything else), around 110 KB in total. All the art is drawn in code on a 180px-tall canvas that's scaled up with crisp pixels. Fonts come from Google Fonts: Pixelify Sans, Silkscreen and Noto Kufi Arabic.

The build prompt is in [`PROMPT.md`](PROMPT.md).
