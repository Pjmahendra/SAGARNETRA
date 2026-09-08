# Sign-in backdrop

`web/src/components/SeaBackdrop.tsx` layers three things, each covering the one below if present.

    login.jpg           the backdrop photo. This is what normally shows.
    login.webm / .mp4   optional looping clip; fades in over the still if you add one.
    (canvas)            a sea drawn in code, underneath both, so the page is never blank.

## Swapping the image

    python scripts/fit_login_bg.py ~/Desktop/your-photo.jpg

That fits the **whole** photo to a 16:9 frame and fills the leftover margin with a blurred,
enlarged copy of itself, so nothing is cropped out — a wide page would otherwise cut a third off a
5:4 aerial, usually including the ship. It writes `login.jpg`; reload the page and it is there.

Darkening and desaturation are **not** baked into the file. `SeaBackdrop` applies them in CSS, so
any photo you drop in is graded the same way and the sign-in panel stays readable.

Two things to check each time:

- **Set the credit.** `BACKDROP_CREDIT` at the top of `src/pages/Login.tsx` is rendered
  bottom-right. An empty string shows nothing, which is only right when the image needs no
  attribution. A *wrong* credit is worse than none.
- **Check you may use it.** Press photographs of real spills are almost always copyrighted, and
  this goes in front of judges. Safe: your own captures, self-stitched satellite imagery (below),
  NASA / ESA / Copernicus, or explicit CC0.

## The satellite alternative

    python scripts/stitch_login_bg.py

Rebuilds the backdrop from Esri World Imagery — the same tile service the console's maps use — for
the Chennai–Ennore sector, 80.12–80.62 E / 12.94–13.34 N at zoom 13. It is blurred, which also
hides the rectangular tonal steps where Esri joins captures of different dates along this coast.
If you use it, set `BACKDROP_CREDIT` to:

    Chennai–Ennore · imagery © Esri, Maxar, Earthstar Geographics

## A clip instead

Short (8–15 s), silent, seamlessly looping — it is muted and looped. Keep it small: no git-lfs here
and the demo has to work with the network off, so it is bundled, not streamed. Under ~4 MB, 16:9.
