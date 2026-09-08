# Login backdrop clip (optional)

`web/src/components/SeaBackdrop.tsx` looks for a looping clip here and fades it in over the drawn
water if it finds one. Nothing breaks if this folder stays empty — the canvas sea is the default,
not a placeholder.

    login.webm    preferred, much smaller at the same quality
    login.mp4     fallback for Safari

Keep it short (8-15 s), silent, and seamless end-to-end; it is muted and looped. Keep it small:
there is no git-lfs in this repo, and the demo has to survive the venue WiFi dying, so the clip is
bundled, not streamed. Under ~4 MB is a sensible ceiling. Crop to roughly 16:9 — it is drawn with
`object-fit: cover` behind the sign-in panel.
