import {
  ClipboardPaste,
  CaretsToAxisDashedVertical,
  Copy,
  Eraser,
  FilePlus,
  FolderOpen,
  Grid3x3,
  ImageDown,
  Images,
  PaintBucket,
  Pencil,
  Pipette,
  Redo2,
  Scan,
  SquareDashed,
  SquareX,
  Undo2,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from 'lucide-react';
import {
  useCallback,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
} from 'react';
import {
  createDrawing,
  getPixel,
  MAX_DRAWING_SIZE,
  TRANSPARENT,
  type Command,
  type Drawing,
  type Point,
} from '../core/drawing';
import type { Editor } from '../core/editor';
import { STUDIO_PLACEHOLDER_PALETTE } from '../core/palettes';
import { checkImageSize, drawingFromImage, exportPng, MAX_EXPORT_SCALE } from '../core/png';
import { createSelectTool, type SelectTool } from '../core/select';
import type { SavedDrawing, StorageProblem } from '../persistence/store';
import type { CurrentDrawing } from '../persistence/studio';
import { canZoom, FIT_VIEW, panView, viewZoom, zoomView, type View } from '../core/view';
import { Nav } from './Nav';
import { PixelCanvas } from './PixelCanvas';
import { studio, useStudio } from './studio-store';

type Tool = 'pencil' | 'eraser' | 'fill' | 'eyedropper' | 'select';

/** The card open above the canvas, if any. */
type Panel = 'new-drawing' | 'export' | 'drawings' | null;

/** A key press: `key` is KeyboardEvent.key lowercased. `shift` unset means either. */
interface Chord {
  key: string;
  mod?: boolean;
  shift?: boolean;
}

/** A toolbar button and its keyboard shortcuts; the first chord is the one shown. */
interface Control {
  label: string;
  Icon: LucideIcon;
  chords: Chord[];
  run: () => void;
  disabled?: boolean;
  pressed?: boolean;
}

/** How far one arrow key press pans, in screen pixels. */
const PAN_STEP = 32;
/** Wheel scroll, in pixels, that zooms one level; trackpads send many small deltas. */
const WHEEL_STEP = 40;

const selectTools = new WeakMap<Editor, SelectTool>();

/** The Select tool over an Editor, the same one each time. */
function selectToolFor(editor: Editor): SelectTool {
  let tool = selectTools.get(editor);
  if (!tool) {
    tool = createSelectTool(editor);
    selectTools.set(editor, tool);
  }
  return tool;
}

const STORAGE_MESSAGES: Record<StorageProblem, string> = {
  unavailable:
    "This browser isn't letting the site store data, so your drawings won't be kept. Private windows and blocked site data can cause this.",
  full: "Browser storage is full, so your latest changes aren't saved. Export a PNG to keep a copy, or free up space and keep drawing.",
};

const thumbnails = new WeakMap<Drawing, string>();

/** A 1x PNG of the drawing as a data URL, for an <img>. */
function thumbnail(drawing: Drawing): string {
  let url = thumbnails.get(drawing);
  if (!url) {
    let binary = '';
    for (const byte of exportPng(drawing, 1)) binary += String.fromCharCode(byte);
    url = `data:image/png;base64,${btoa(binary)}`;
    thumbnails.set(drawing, url);
  }
  return url;
}

const editedAt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function blankDrawing(width: number, height: number) {
  return createDrawing({ width, height, palette: STUDIO_PLACEHOLDER_PALETTE });
}

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

const EXPORT_SCALES = Array.from({ length: MAX_EXPORT_SCALE }, (_, i) => i + 1);

/** Saves the drawing as a PNG file through the browser's download. */
function downloadPng(drawing: Drawing, scale: number) {
  const bytes = exportPng(drawing, scale);
  const url = URL.createObjectURL(
    new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/png' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `drawing-${drawing.width * scale}x${drawing.height * scale}.png`;
  link.click();
  // Some browsers start the download after click() returns, so revoke later.
  setTimeout(() => URL.revokeObjectURL(url));
}

/** Decodes a PNG file into a Drawing. Rejects with a message to show the user. */
async function readPng(file: File): Promise<Drawing> {
  // Checked by content: the browser's file type can be empty, and it decodes other formats too.
  const signature = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (!PNG_SIGNATURE.every((b, i) => signature[i] === b)) {
    throw new Error(`${file.name} is not a PNG file.`);
  }
  let bitmap: ImageBitmap;
  try {
    // Keep the file's exact color values rather than converting them for the display.
    bitmap = await createImageBitmap(file, {
      colorSpaceConversion: 'none',
      premultiplyAlpha: 'none',
    });
  } catch {
    throw new Error(`${file.name} could not be read as a PNG image.`);
  }
  try {
    checkImageSize(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(bitmap, 0, 0);
    return drawingFromImage(context.getImageData(0, 0, bitmap.width, bitmap.height));
  } finally {
    bitmap.close();
  }
}

function matches(chord: Chord, e: KeyboardEvent) {
  return (
    e.key.toLowerCase() === chord.key &&
    (e.ctrlKey || e.metaKey) === !!chord.mod &&
    (chord.shift === undefined || chord.shift === e.shiftKey)
  );
}

function chordLabel({ key, mod, shift }: Chord, ctrl = 'Ctrl', plus = '+') {
  // Named keys like "escape" read as "Escape"; single characters are upper-cased.
  const name = key === '+' ? plus : key[0]!.toUpperCase() + key.slice(1);
  return `${mod ? `${ctrl}+` : ''}${shift ? 'Shift+' : ''}${name}`;
}

function ControlButton({ control, iconSize }: { control: Control; iconSize: number }) {
  const { label, Icon, chords, run, disabled, pressed } = control;
  return (
    <button
      type="button"
      className="tool"
      aria-label={label}
      title={`${label} (${chordLabel(chords[0]!)})`}
      aria-keyshortcuts={chords.map((c) => chordLabel(c, 'Control', 'Plus')).join(' ')}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={run}
    >
      <Icon aria-hidden size={iconSize} />
    </button>
  );
}

export function Studio() {
  const state = useStudio();
  if (state.status === 'loading') {
    return (
      <div className="page studio">
        <Nav current="studio" />
        <main className="studio-main" aria-busy="true" />
      </div>
    );
  }
  return <StudioEditor current={state.current} drawings={state.drawings} problem={state.problem} />;
}

function StudioEditor({
  current,
  drawings,
  problem,
}: {
  current: CurrentDrawing;
  drawings: readonly SavedDrawing[];
  problem: StorageProblem | null;
}) {
  const { editor } = current;
  const selectTool = selectToolFor(editor);
  const { drawing, canUndo, canRedo } = useSyncExternalStore(editor.subscribe, editor.getState);
  const { selection, canCopy, canPaste } = useSyncExternalStore(
    selectTool.subscribe,
    selectTool.getState,
  );
  const [tool, setTool] = useState<Tool>('pencil');
  const [color, setColor] = useState(0);
  const [showGrid, setShowGrid] = useState(false);
  const [view, setView] = useState<View>(FIT_VIEW);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [exportScale, setExportScale] = useState(1);
  const [openError, setOpenError] = useState<string | null>(null);
  const [fileInput, setFileInput] = useState<HTMLInputElement | null>(null);
  const [mirror, setMirror] = useState(false);
  const panDrag = useRef<{ start: Point; pan: Point } | null>(null);
  const wheelScroll = useRef(0);

  // Wheel zoom at the cursor. Attached natively because React's wheel listener is
  // passive and can't stop the page from scrolling. Stable, so it subscribes once.
  const listenForWheel = useCallback((stage: HTMLDivElement | null) => {
    if (!stage) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      wheelScroll.current += e.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? e.deltaY : e.deltaY * 16;
      if (Math.abs(wheelScroll.current) < WHEEL_STEP) return;
      // One level per event at most, however big the notch.
      const steps = wheelScroll.current < 0 ? 1 : -1;
      wheelScroll.current = 0;
      const rect = stage.getBoundingClientRect();
      const anchor = {
        x: e.clientX - rect.left - rect.width / 2,
        y: e.clientY - rect.top - rect.height / 2,
      };
      setView((v) => zoomView(v, steps, anchor));
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, []);

  const tools: (Control & { tool: Tool })[] = (
    [
      { tool: 'pencil', label: 'Pencil', Icon: Pencil, key: 'b' },
      { tool: 'eraser', label: 'Eraser', Icon: Eraser, key: 'e' },
      { tool: 'fill', label: 'Fill', Icon: PaintBucket, key: 'f' },
      { tool: 'eyedropper', label: 'Eyedropper', Icon: Pipette, key: 'i' },
      { tool: 'select', label: 'Select', Icon: SquareDashed, key: 'm' },
    ] as const
  ).map(({ key, ...t }) => ({
    ...t,
    chords: [{ key }],
    run: () => setTool(t.tool),
    pressed: tool === t.tool,
  }));

  const actions: Control[] = [
    {
      label: 'New drawing',
      Icon: FilePlus,
      chords: [{ key: 'n' }],
      run: () => setPanel('new-drawing'),
    },
    {
      label: 'Drawings',
      Icon: Images,
      chords: [{ key: 'd' }],
      run: () => setPanel((p) => (p === 'drawings' ? null : 'drawings')),
      pressed: panel === 'drawings',
    },
    {
      label: 'Open PNG',
      Icon: FolderOpen,
      chords: [{ key: 'o', mod: true }],
      run: () => fileInput?.click(),
    },
    {
      label: 'Export PNG',
      Icon: ImageDown,
      chords: [{ key: 'e', mod: true, shift: true }],
      run: () => setPanel('export'),
    },
    {
      label: 'Undo',
      Icon: Undo2,
      chords: [{ key: 'z', mod: true, shift: false }],
      run: editor.undo,
      disabled: !canUndo,
    },
    {
      label: 'Redo',
      Icon: Redo2,
      chords: [
        { key: 'z', mod: true, shift: true },
        { key: 'y', mod: true },
      ],
      run: editor.redo,
      disabled: !canRedo,
    },
    {
      label: 'Copy',
      Icon: Copy,
      chords: [{ key: 'c', mod: true }],
      run: selectTool.copy,
      disabled: !canCopy,
    },
    {
      label: 'Paste',
      Icon: ClipboardPaste,
      chords: [{ key: 'v', mod: true }],
      run: () => {
        selectTool.paste();
        // The pasted pixels are selected, ready to drag off.
        setTool('select');
      },
      disabled: !canPaste,
    },
    {
      label: 'Deselect',
      Icon: SquareX,
      chords: [{ key: 'escape' }],
      run: selectTool.deselect,
      disabled: !selection,
    },
    {
      label: 'Zoom in',
      Icon: ZoomIn,
      chords: [{ key: '+' }, { key: '=' }],
      run: () => setView((v) => zoomView(v, 1)),
      disabled: !canZoom(view, 1),
    },
    {
      label: 'Zoom out',
      Icon: ZoomOut,
      chords: [{ key: '-' }],
      run: () => setView((v) => zoomView(v, -1)),
      disabled: !canZoom(view, -1),
    },
    {
      label: 'Fit to view',
      Icon: Scan,
      chords: [{ key: '0' }],
      run: () => setView(FIT_VIEW),
      disabled: view === FIT_VIEW,
    },
    {
      label: 'Pixel grid',
      Icon: Grid3x3,
      chords: [{ key: 'g' }],
      run: () => setShowGrid((g) => !g),
      pressed: showGrid,
    },
    {
      label: 'Mirror symmetry',
      Icon: CaretsToAxisDashedVertical,
      chords: [{ key: 's' }],
      run: () => setMirror((m) => !m),
      pressed: mirror,
    },
  ];

  const panKeys: Record<string, [number, number]> = {
    arrowleft: [PAN_STEP, 0],
    arrowright: [-PAN_STEP, 0],
    arrowup: [0, PAN_STEP],
    arrowdown: [0, -PAN_STEP],
  };

  function strokeCommand(points: readonly Point[]): Command {
    return tool === 'eraser'
      ? { type: 'eraser', points, mirror }
      : { type: 'pencil', color, points, mirror };
  }

  function press(at: Point) {
    switch (tool) {
      case 'pencil':
      case 'eraser':
        editor.apply(strokeCommand([at]));
        return;
      case 'fill':
        editor.apply({ type: 'fill', color, at, mirror });
        return;
      case 'select':
        selectTool.press(at);
        return;
      case 'eyedropper': {
        const picked = getPixel(drawing, at.x, at.y);
        // Picking a transparent pixel means "draw transparency", which is the eraser.
        if (picked === TRANSPARENT) {
          setTool('eraser');
        } else {
          setColor(picked);
          setTool('pencil');
        }
        return;
      }
    }
  }

  function drag(from: Point, to: Point) {
    if (tool === 'pencil' || tool === 'eraser') {
      editor.apply(strokeCommand([from, to]), { mergeWithLast: true });
    } else if (tool === 'select') {
      selectTool.drag(to);
    }
  }

  /** Resets the view and color for a different drawing, which starts with fresh undo history. */
  function switchedTo(next: Drawing) {
    // A different palette's colors don't line up with the old indexes.
    if (next.palette !== drawing.palette) setColor(0);
    setView(FIT_VIEW);
    setPanel(null);
    setOpenError(null);
  }

  /** Starts editing a new drawing; the current one stays in Drawings if it was kept. */
  function startDrawing(next: Drawing) {
    studio.create(next);
    switchedTo(next);
  }

  function openDrawing(entry: SavedDrawing) {
    studio.open(entry.id);
    if (entry.id !== current.id) switchedTo(entry.drawing);
    else setPanel(null);
  }

  function createNewDrawing(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    startDrawing(blankDrawing(Number(form.get('width')), Number(form.get('height'))));
  }

  async function openPng(e: ChangeEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0];
    // Cleared so choosing the same file again still opens it.
    e.currentTarget.value = '';
    if (!file) return;
    try {
      startDrawing(await readPng(file));
    } catch (error) {
      setOpenError(error instanceof Error ? error.message : String(error));
    }
  }

  function exportDrawing(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    downloadPng(drawing, exportScale);
    setPanel(null);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.altKey) {
      return;
    }
    if (e.key === ' ') {
      setSpaceHeld(true);
      // Let Space still press a focused button.
      if (!(e.target instanceof HTMLButtonElement)) e.preventDefault();
      return;
    }
    const pan = !(e.ctrlKey || e.metaKey) && panKeys[e.key.toLowerCase()];
    if (pan) {
      setView((v) => panView(v, ...pan));
      e.preventDefault();
      return;
    }
    const control = [...tools, ...actions].find((c) => c.chords.some((chord) => matches(chord, e)));
    // A disabled control leaves the key to the browser, so Ctrl+C with no selection still copies page text.
    if (!control || control.disabled) return;
    e.preventDefault();
    control.run();
  }

  // Studio-wide keyboard shortcuts. A ref callback with cleanup (not an effect):
  // it re-subscribes each render so the handler always sees current state.
  function listenForKeys(node: HTMLDivElement | null) {
    if (!node) return;
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') setSpaceHeld(false);
    };
    const onBlur = () => setSpaceHeld(false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }

  const zoom = viewZoom(view);
  const longest = Math.max(drawing.width, drawing.height);
  const zoomedStyle = {
    '--w': (zoom * drawing.width) / longest,
    '--h': (zoom * drawing.height) / longest,
    transform: `translate(calc(-50% + ${view.pan.x}px), calc(-50% + ${view.pan.y}px))`,
  } as CSSProperties;

  return (
    <div className="page studio" ref={listenForKeys}>
      <Nav current="studio" />
      <main className="studio-main">
        <div
          className="pill tool-pill"
          role="toolbar"
          aria-label="Tools"
          aria-orientation="vertical"
        >
          {tools.map((t) => (
            <ControlButton key={t.label} control={t} iconSize={22} />
          ))}
        </div>
        <div className="studio-center">
          <div className="pill action-pill" role="toolbar" aria-label="Actions">
            {actions.map((a) => (
              <ControlButton key={a.label} control={a} iconSize={20} />
            ))}
          </div>
          <input
            ref={setFileInput}
            type="file"
            accept="image/png"
            aria-label="PNG file"
            hidden
            onChange={openPng}
          />
          {problem && (
            <div className="card notice" role="alert">
              <p>{STORAGE_MESSAGES[problem]}</p>
            </div>
          )}
          {openError && (
            <div className="card notice" role="alert">
              <p>{openError}</p>
              <button type="button" className="btn" onClick={() => setOpenError(null)}>
                Dismiss
              </button>
            </div>
          )}
          {panel === 'drawings' && (
            <section
              className="card drawings"
              aria-label="Drawings"
              onKeyDown={(e) => e.key === 'Escape' && setPanel(null)}
            >
              {drawings.length === 0 ? (
                <p className="hint">Nothing kept yet. A drawing is kept from its first change.</p>
              ) : (
                <ul className="drawing-list">
                  {drawings.map((d, i) => (
                    <li key={d.id}>
                      <button
                        type="button"
                        className="drawing-item"
                        aria-current={d.id === current.id ? 'true' : undefined}
                        onClick={() => openDrawing(d)}
                        autoFocus={i === 0}
                      >
                        <img
                          src={thumbnail(d.drawing)}
                          alt=""
                          style={{ aspectRatio: `${d.drawing.width} / ${d.drawing.height}` }}
                        />
                        <span className="drawing-size">
                          {d.drawing.width}x{d.drawing.height}
                        </span>
                        <span className="hint">{editedAt.format(d.updatedAt)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button type="button" className="btn" onClick={() => setPanel(null)}>
                Close
              </button>
            </section>
          )}
          {panel === 'export' && (
            <form
              className="card new-drawing export-png"
              aria-label="Export PNG"
              onSubmit={exportDrawing}
              onKeyDown={(e) => e.key === 'Escape' && setPanel(null)}
            >
              <label>
                Scale
                <select
                  value={exportScale}
                  onChange={(e) => setExportScale(Number(e.currentTarget.value))}
                  autoFocus
                >
                  {EXPORT_SCALES.map((s) => (
                    <option key={s} value={s}>
                      {s}x
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="btn primary">
                Export
              </button>
              <button type="button" className="btn" onClick={() => setPanel(null)}>
                Cancel
              </button>
              <p className="hint">
                Saves a {drawing.width * exportScale}x{drawing.height * exportScale} PNG. Each pixel
                becomes a sharp {exportScale}x{exportScale} block.
              </p>
            </form>
          )}
          {panel === 'new-drawing' && (
            <form
              className="card new-drawing"
              aria-label="New drawing"
              onSubmit={createNewDrawing}
              onKeyDown={(e) => e.key === 'Escape' && setPanel(null)}
            >
              <label>
                Width
                <input
                  name="width"
                  type="number"
                  required
                  min={1}
                  max={MAX_DRAWING_SIZE}
                  step={1}
                  defaultValue={drawing.width}
                  autoFocus
                />
              </label>
              <label>
                Height
                <input
                  name="height"
                  type="number"
                  required
                  min={1}
                  max={MAX_DRAWING_SIZE}
                  step={1}
                  defaultValue={drawing.height}
                />
              </label>
              <button type="submit" className="btn primary">
                Create
              </button>
              <button type="button" className="btn" onClick={() => setPanel(null)}>
                Cancel
              </button>
              <p className="hint">
                Up to {MAX_DRAWING_SIZE}x{MAX_DRAWING_SIZE}. The current drawing stays in Drawings.
              </p>
            </form>
          )}
          <div
            ref={listenForWheel}
            className={`stage${spaceHeld ? ' panning' : ''}`}
            onMouseDown={(e) => {
              // Stop the middle button's autoscroll so it can pan instead.
              if (e.button === 1) e.preventDefault();
            }}
            onPointerDownCapture={(e) => {
              if (!(e.button === 1 || (e.button === 0 && spaceHeld))) return;
              // Pan instead of drawing: keep the press from reaching the canvas.
              e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
              panDrag.current = { start: { x: e.clientX, y: e.clientY }, pan: view.pan };
            }}
            onPointerMove={(e) => {
              const start = panDrag.current;
              if (!start) return;
              setView((v) => ({
                ...v,
                pan: {
                  x: start.pan.x + e.clientX - start.start.x,
                  y: start.pan.y + e.clientY - start.start.y,
                },
              }));
            }}
            onLostPointerCapture={() => (panDrag.current = null)}
          >
            <div className="zoomed-canvas" style={zoomedStyle}>
              <PixelCanvas
                drawing={drawing}
                onPress={press}
                onDrag={drag}
                showGrid={showGrid}
                selection={selection}
                showMirrorAxis={mirror}
                label={`Studio canvas, ${drawing.width} by ${drawing.height} pixels`}
              />
            </div>
          </div>
          <p className="hint">
            Scroll to zoom. Pan with Space+drag, the middle mouse button or the arrow keys.
          </p>
        </div>
        <div className="pill palette-pill" role="group" aria-label="Palette">
          {drawing.palette.map((c, i) => (
            <button
              key={c}
              type="button"
              className="swatch"
              style={{ background: c }}
              aria-label={`Color ${c}`}
              title={c}
              aria-pressed={color === i}
              onClick={() => setColor(i)}
            />
          ))}
        </div>
      </main>
    </div>
  );
}
