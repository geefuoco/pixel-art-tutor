Pixel Art Tutor
------------------
An app that teaches pixel art through guided, hands-on lessons. Practical
payoff: learn to make my own game assets.  

Core concept:
  - Built-in pixel editor with lessons layered on top.
  - Step-by-step tracing: a faint guide shows the next shape to draw, in
    order (silhouette, outline, base colors, shading, highlights).
  - Short explanations at each step covering the core techniques: clean
    lines, avoiding "jaggies", limited palettes, shading and light source,
    dithering, anti-aliasing, readability at small sizes.
  - Progression from tracing, to drawing with hints, to drawing freehand
    from a reference image.

The hard (and impressive) parts:
  - Feedback on attempts: score a drawing against the target with something
    smarter than a raw pixel diff (shape similarity, palette use, line
    quality), and point out specific mistakes like jaggies or orphan pixels.
  - Auto-generated lessons: feed in any finished sprite and the app breaks it
    down into ordered steps automatically, so lessons don't all need to be
    authored by hand.
  - Animation lessons (walk cycles, idle bobs) with onion skinning
  - Daily practice prompts and a progress gallery
  - Tile/tileset lessons

Practical considerations:
  - Reference sprites must be my own art or openly licensed (e.g. CC0).
  - Export to PNG / sprite sheets so anything drawn is usable in games.

