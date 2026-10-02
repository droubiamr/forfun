# Homs Walk

A tiny pixel-art stroll through **Homs, Syria** in your browser. The sky, sun, moon, and weather follow the city's real local time and live conditions.

> Status: **not built yet.** The build prompt is in [`PROMPT.md`](PROMPT.md).

## What to fill in before building

Answer these in `PROMPT.md` where it says `[FILL IN]`:

1. **Your character.** A reference image (a pixel avatar, a photo, or even a doodle) or a short description: hair, glasses, outfit colours, anything iconic. The more specific, the more it'll look like you.
2. **Personal places.** Any spots in Homs that matter to you (a street, school, café, family shop, or a view from a rooftop), with a line each about what they look like.
3. **Tone.** How should the city feel? The suggested default is *warm, hopeful, lived-in, no war imagery*, but it's your call.
4. **Language.** Arabic + English labels, English only, or Arabic first.
5. **Sound.** None, or an optional ambient toggle (street murmur, birds, distant adhan at prayer times), off by default.
6. **Optional extras:**
   - Real photos of landmarks you want captured accurately. These are for Claude to look at only, not to ship.
   - A colour mood (e.g. "dusty gold summer afternoon" or "cool basalt grey").
   - Hosting: should it be set up for GitHub Pages?

## Already decided (no input needed)

- **Time:** `Asia/Damascus` timezone (UTC+3), sun position calculated for Homs (34.7324° N, 36.7137° E).
- **Weather:** [Open-Meteo](https://open-meteo.com/), which is free and needs no API key.
- **Stack:** one HTML file, canvas, no frameworks, no build step. Small enough to load instantly.
