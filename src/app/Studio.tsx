import {
  ClipboardPaste,
  CaretsToAxisDashedVertical,
  Copy,
  Eraser,
  FilePlus,
  FolderOpen,
  Grid3x3,
  ImageDown,
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
import { createEditor } from '../core/editor';
import { STUDIO_PLACEHOLDER_PALETTE } from '../core/palettes';
import { checkImageSize, drawingFromImage, exportPng, MAX_EXPORT_SCALE } from '../core/png';
import { createSelectTool } from '../core/select';
import { canZoom, FIT_VIEW, panView, viewZoom, zoomView, type View } from '../core/view';
import { Nav } from './Nav';
import { PixelCanvas } from './PixelCanvas';

type Tool = 'pencil' | 'eraser' | 'fill' | 'eyedropper' | 'select';

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
const DEFAULT_SIZE = 16;

/** An Editor for the drawing and the Select tool over it. */
function editing(drawing: Drawing) {
  const editor = createEditor(drawing);
  return { editor, selectTool: createSelectTool(editor) };
}

function blankDrawing(width: number, height: number) {
  return createDrawing({ width, height, palette: STUDIO_PLACEHOLDER_PALETTE });
}

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
  URL.revokeObjectURL(url);
}

/** Decodes a PNG file into a Drawing. Rejects with a message to show the user. */
async function readPng(file: File): Promise<Drawing> {
  if (file.type !== 'image/png') throw new Error(`${file.name} is not a PNG file.`);
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
  const [{ editor, selectTool }, setEditing] = useState(() =>
    editing(blankDrawing(DEFAULT_SIZE, DEFAULT_SIZE)),
  );
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
  const [newDrawingOpen, setNewDrawingOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
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
      run: () => setNewDrawingOpen(true),
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
      run: () => setExportOpen(true),
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

  /** Starts editing `next` in place of the current drawing, with fresh undo history. */
  function replaceDrawing(next: Drawing) {
    setEditing(editing(next));
    // A different palette's colors don't line up with the old indexes.
    if (next.palette !== drawing.palette) setColor(0);
    setView(FIT_VIEW);
    setNewDrawingOpen(false);
    setExportOpen(false);
    setOpenError(null);
  }

  function createNewDrawing(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    replaceDrawing(blankDrawing(Number(form.get('width')), Number(form.get('height'))));
  }

  async function openPng(e: ChangeEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0];
    // Cleared so choosing the same file again still opens it.
    e.currentTarget.value = '';
    if (!file) return;
    try {
      replaceDrawing(await readPng(file));
    } catch (error) {
      setOpenError(error instanceof Error ? error.message : String(error));
    }
  }

  function exportDrawing(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    downloadPng(drawing, exportScale);
    setExportOpen(false);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.altKey) return;
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
          {openError && (
            <div className="card notice" role="alert">
              <p>{openError}</p>
              <button type="button" className="btn" onClick={() => setOpenError(null)}>
                Dismiss
              </button>
            </div>
          )}
          {exportOpen && (
            <form
              className="card new-drawing export-png"
              aria-label="Export PNG"
              onSubmit={exportDrawing}
              onKeyDown={(e) => e.key === 'Escape' && setExportOpen(false)}
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
              <button type="button" className="btn" onClick={() => setExportOpen(false)}>
                Cancel
              </button>
              <p className="hint">
                Saves a {drawing.width * exportScale}x{drawing.height * exportScale} PNG. Each pixel
                becomes a sharp {exportScale}x{exportScale} block.
              </p>
            </form>
          )}
          {newDrawingOpen && (
            <form
              className="card new-drawing"
              aria-label="New drawing"
              onSubmit={createNewDrawing}
              onKeyDown={(e) => e.key === 'Escape' && setNewDrawingOpen(false)}
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
              <button type="button" className="btn" onClick={() => setNewDrawingOpen(false)}>
                Cancel
              </button>
              <p className="hint">
                Up to {MAX_DRAWING_SIZE}x{MAX_DRAWING_SIZE}. Replaces the current drawing.
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
