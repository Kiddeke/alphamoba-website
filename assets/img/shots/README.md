# Screenshots

Drop captures from the game in this folder and list them in
`data/shots.json`, one entry per picture, in the order they should appear:

```json
[
  { "file": "hushwood-heart.png", "caption": "The Kraken's Wake at seven minutes.", "alt": "Three champions fighting the Kraken in the open central arena" },
  { "file": "champion-select.png", "caption": "Champion select." }
]
```

`caption` is shown under the picture; `alt` is read by screen readers and
falls back to the caption. The front page's "From the wood" section stays
hidden until the list has at least one entry. Landscape captures at 1920×1080
or 1280×720 look best; the grid crops each to 16:9.
