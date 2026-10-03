# Homs Walk · حمص

A tiny pixel-art stroll through **Homs, Syria** that plays itself, like a looping video. Open the page and he starts walking: past the Old Clock, down Al-Dablan Street (he stops for a plate of hummus, in Homs), through New Clock Square (he turns his back to the tower and takes a selfie, which pops up as a polaroid drawn from his camera's side: him smiling, the clock behind him showing the real time, in the real light and weather), into the covered souq, past the basalt houses of Old Homs, and on to Khalid ibn al-Walid Mosque. After the mosque the street carries on seamlessly back to the start, so the walk never ends.

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
| `I` or **Homs now** | show the time, date, Hijri date and weather in Homs |
| `P` | try another time of day or weather |
| `M` | soundtrack on/off. It's on by default, and starts on your first tap, click or key, because browsers don't allow sound before that |

Shareable moments: `?t=18:30&w=rain&x=1600` (time, weather, position).
Weather options: `clear` `partly` `overcast` `fog` `rain` `storm` `snow` `dust`.

## Music
The built-in soundtrack is an original lo-fi loop with a Homsi accent: maqam Bayati (with its real quarter-tone E), an oud ostinato, a ney melody, a qanun, a soft maqsum darbuka and some tape crackle. It's all synthesised in the browser.

To use your own track instead, put a file called `music.mp3` next to `index.html`. The page picks it up automatically and loops it. Only use music you have the right to share.

## How it's made
`index.html` (the info panel and controls) plus `main.js` (everything else), around 110 KB in total. All the art is drawn in code on a 180px-tall canvas that's scaled up with crisp pixels. Fonts come from Google Fonts: Pixelify Sans, Silkscreen and Noto Kufi Arabic.

The build prompt is in [`PROMPT.md`](PROMPT.md).
