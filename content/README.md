# Lesson content

`course.json` lists the Course's Lesson ids in order. Each Lesson lives in `lessons/<id>/`:

- `reference.png`: the Reference Sprite, 8x8, 16x16 or 32x32, every pixel fully opaque or fully transparent. Its colors are the Lesson's fixed palette.
- `manifest.json`: what the image can't say.
- `examples/*.png`: Example Sprites the explanations show.
- `CREDITS.md`: author, source and licence of every image. Art must be good-quality CC0.

```json
{
  "id": "red-potion",
  "title": "Red potion",
  "roles": { "#849be4": "outline", "#df3e23": "base", "#b4202a": "shadow", "#e3e6ff": "highlight" },
  "explanations": {
    "silhouette": "Markdown. ![Caption](examples/silhouette.png)",
    "outline": "...",
    "base": "...",
    "shadow": "...",
    "highlight": "..."
  },
  "overrides": { "silhouetteColor": "#df3e23" }
}
```

- `id` matches the folder name.
- `roles` gives every sprite color one Role: `outline`, `base`, `shadow` or `highlight`.
- Steps follow from the Roles: Silhouette is every opaque pixel, blocked in one color, then one Step per Role that has colors, in the order outline, base, shadow, highlight. `explanations` has one entry per Step the sprite has, and no others.
- Explanations are a Markdown subset: paragraphs, `- ` lists, `**strong**`, `*emphasis*`, `` `code` `` and images. A paragraph of only images shows them side by side, each captioned with its alt text. Images must be files in `examples/`.
- `overrides` is optional. `silhouetteColor` picks the color the Silhouette Step is blocked in; by default it is the most used base color. While checking the Silhouette Step, a pixel already drawn in its final color also counts as right, so drawing ahead is never marked wrong.

## Animation Lessons

An animation Lesson has one Step per Frame instead of the silhouette-to-highlight Steps. Its `reference.png` is a horizontal strip of square Frames (8x8, 16x16 or 32x32 each), in playback order. Its manifest has `animation` in place of `explanations` and `overrides`:

```json
{
  "id": "slime-idle",
  "title": "Slime idle bob",
  "roles": { "#3e8948": "base", "...": "..." },
  "animation": {
    "fps": 6,
    "steps": [
      { "frame": 1, "pose": "key", "explanation": "Markdown." },
      { "frame": 3, "pose": "key", "explanation": "..." },
      { "frame": 2, "pose": "in-between", "explanation": "..." },
      { "frame": 4, "pose": "in-between", "explanation": "..." }
    ]
  }
}
```

- `fps` is how fast the animation plays, 1 to 30.
- `steps` lists every Frame exactly once, counted from 1, in the order they are drawn: all key poses first, then the in-betweens.
- `roles` still gives every color a Role. Freehand uses them to score Palette.
- Each Frame-Step is checked against its whole Frame in its final colors.

## Tileset Lessons

A tileset Lesson teaches a small set of 16x16 tiles, such as a ground tile and its edges, with one Step per tile. Autotile sets are out of scope. Its `reference.png` is a horizontal strip of 16x16 tiles, and its manifest has `tileset` in place of `explanations` and `overrides`:

```json
{
  "id": "grass-path",
  "title": "Grass path tiles",
  "roles": { "#84c669": "base", "...": "..." },
  "tileset": {
    "tiles": [
      { "name": "Grass", "seamless": ["left-right", "top-bottom"], "explanation": "Markdown." },
      { "name": "Path top edge", "seamless": ["left-right"], "explanation": "..." }
    ]
  }
}
```

- `tiles` has one entry per tile, in strip order, and the Steps follow that order.
- `seamless` lists the edges that repeat: `left-right`, `top-bottom`, both or neither. Check marks a seam where those edges do not continue each other.
- Each tile Step is checked against its whole tile in its final colors, and the Lesson shows a live Tiling Preview.

## Technique Drills

A Technique Drill gives a starting sprite and asks for one technique a Course Lesson has taught. `drills/techniques.json` names the Lesson that teaches each technique, and the Daily Prompt only gives a drill once that Lesson has been passed:

```json
{ "outline": "red-potion", "shading": "red-potion", "tiling": "grass-path" }
```

Each drill lives in `drills/<id>/`:

- `start.png`: the starting sprite, 8x8, 16x16 or 32x32, every pixel fully opaque or fully transparent. The learner draws on top of it.
- `manifest.json`: what the image can't say.
- `CREDITS.md`: author, source and licence. Art must be good-quality CC0.

```json
{
  "id": "shade-red-slime",
  "title": "Shade a red slime",
  "technique": "shading",
  "instruction": "Plain text shown under the title.",
  "roles": { "#e43b44": "base", "#9e2835": "shadow", "#f6757a": "highlight", "...": "..." },
  "checks": ["shadow-away-from-light", "highlight-toward-light"],
  "light": "top-left"
}
```

- `technique` is `outline`, `shading` or `tiling`.
- `roles` gives every color in `start.png` a Role, and can add colors the sprite doesn't use yet, such as the shadow and highlight for a shading drill. Together they are the drill's palette.
- `checks` lists what Check reports as met or not, on top of the drawing's Mistakes:
  - `shadow-away-from-light` and `highlight-toward-light`: the shadow pixels sit on the side away from `light` (`top-left`, `top-right`, `above`, `left` or `right`), and the highlight pixels on the side facing it.
  - `closed-outline`: every pixel on the edge of the shape is an outline color.
  - `clean-outline`: the outline is 1 pixel wide, with no jaggies.
  - `seamless`: no seam on the edges listed in `seamless` (`left-right`, `top-bottom`). The drill shows a Tiling Preview.

The app reads drills with `readTechniqueDrills` in `src/core/technique-drill.ts`, which rejects content that breaks these rules.

To turn a Personal Lesson into a built-in one, use its **Copy manifest** and **Download reference.png** buttons on the Lessons page, put both in `lessons/<id>/`, add the id to `course.json`, and rewrite the templated explanations.

The app reads a Lesson with `readLesson` in `src/core/lesson-content.ts`, which rejects content that breaks these rules.
