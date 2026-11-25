import {
  ArrowLeft,
  ArrowRight,
  CaretsToAxisDashedVertical,
  ChevronLeft,
  ChevronRight,
  CopyPlus,
  FilePlus,
  FolderOpen,
  ImageDown,
  Images,
  Layers,
  Play,
  Plus,
  ScanSearch,
  Trash2,
} from 'lucide-react';
import { useState, useSyncExternalStore, type ChangeEvent, type FormEvent } from 'react';
import { frameDrawing, onionSkins } from '../core/animation';
import { MAX_DRAWING_SIZE, type Drawing } from '../core/drawing';
import { findMistakes } from '../core/mistakes';
import type { CustomPalette } from '../core/palettes';
import { drawingFromImage, exportPng, MAX_EXPORT_SCALE } from '../core/png';
import {
  asepriteFrameMap,
  spriteSheet,
  type SheetLayout,
  type SpriteSheet,
} from '../core/sprite-sheet';
import type { SavedDrawing, StorageProblem } from '../persistence/store';
import type { CurrentDrawing } from '../persistence/studio';
import type { Control } from './controls';
import { downloadFile } from './download';
import { DrawingEditor } from './DrawingEditor';
import { FrameStrip } from './FrameStrip';
import { MistakeList } from './MistakeList';
import { Nav } from './Nav';
import { WarningBanner } from './WarningBanner';
import { BUNDLED_CHOICES, choiceMatching, customChoices, STARTER_CHOICE } from './palette-choices';
import { PaletteSwatches } from './PaletteSwatches';
import { decodePngFile } from './png-image';
import { dateTime } from './date-time';
import { thumbnail } from './thumbnail';
import { routeHref } from './router';
import { blankStudioDrawing, studio, useStudio } from './studio-store';

type ExportChoice = 'frame' | SheetLayout;

const EXPORT_CHOICES: Record<ExportChoice, string> = {
  frame: 'This Frame',
  strip: 'Sprite sheet, strip',
  grid: 'Sprite sheet, grid',
};

type Panel = 'new-drawing' | 'export' | 'drawings' | 'mistakes' | null;

const STORAGE_MESSAGES: Record<StorageProblem, string> = {
  unavailable:
    'drawings will not be saved due to site store data being blocked. Try non-private mode, or another browser.',
  full: "browser storage is full, so your latest changes aren't saved. Export a PNG to keep a copy, or free up space and keep drawing.",
};

const EXPORT_SCALES = Array.from({ length: MAX_EXPORT_SCALE }, (_, i) => i + 1);

function downloadPng(drawing: Drawing, scale: number, filename: string) {
  const bytes = exportPng(drawing, scale);
  downloadFile(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/png' }), filename);
}

function scaledFilenameStem(prefix: string, drawing: Drawing, scale: number) {
  return `${prefix}-${drawing.width * scale}x${drawing.height * scale}`;
}

function downloadSheetPng(sheet: SpriteSheet, scale: number) {
  downloadPng(sheet.image, scale, `${scaledFilenameStem('sprite-sheet', sheet.image, scale)}.png`);
}

function downloadFrameMap(sheet: SpriteSheet, fps: number, scale: number) {
  const stem = scaledFilenameStem('sprite-sheet', sheet.image, scale);
  const map = asepriteFrameMap(sheet, { fps, scale, image: `${stem}.png` });
  downloadFile(
    new Blob([JSON.stringify(map, null, 2)], { type: 'application/json' }),
    `${stem}.json`,
  );
}

function exportedFramesLabel(choice: ExportChoice, frame: number, frameCount: number) {
  if (choice !== 'frame') return `all ${frameCount} Frames as `;
  return frameCount > 1 ? `Frame ${frame + 1} as ` : '';
}

async function readPng(file: File): Promise<Drawing> {
  return drawingFromImage(await decodePngFile(file));
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
  return (
    <StudioEditor
      current={state.current}
      drawings={state.drawings}
      palettes={state.palettes}
      problem={state.problem}
    />
  );
}

function StudioEditor({
  current,
  drawings,
  palettes,
  problem,
}: {
  current: CurrentDrawing;
  drawings: readonly SavedDrawing[];
  palettes: readonly CustomPalette[];
  problem: StorageProblem | null;
}) {
  const { editor } = current;
  const { drawing, animation, frame } = useSyncExternalStore(editor.subscribe, editor.getState);
  const lastFrame = animation.frames.length - 1;
  const [onionShown, setOnionShown] = useState(false);
  const [onionOpacity, setOnionOpacity] = useState(0.3);
  const [previewShown, setPreviewShown] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [exportScale, setExportScale] = useState(1);
  const [chosenExport, setChosenExport] = useState<ExportChoice>('frame');
  const exportChoice = lastFrame > 0 ? chosenExport : 'frame';
  const sheet =
    panel === 'export' && exportChoice !== 'frame' ? spriteSheet(animation, exportChoice) : null;
  const imageToExport = sheet?.image ?? drawing;
  const [openError, setOpenError] = useState<string | null>(null);
  const [fileInput, setFileInput] = useState<HTMLInputElement | null>(null);
  const [mirror, setMirror] = useState(false);
  const [chosenBudget, setChosenBudget] = useState<number | null>(null);
  const colorBudget = Math.min(chosenBudget ?? drawing.palette.length, drawing.palette.length);
  const mistakes = panel === 'mistakes' ? findMistakes(drawing, { colorBudget }) : null;

  const leadingActions: Control[] = [
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
  ];

  const trailingActions: Control[] = [
    {
      label: 'Mirror symmetry',
      Icon: CaretsToAxisDashedVertical,
      chords: [{ key: 's' }],
      run: () => setMirror((m) => !m),
      pressed: mirror,
    },
    {
      label: 'Check for Mistakes',
      Icon: ScanSearch,
      chords: [{ key: 'c' }],
      run: () => setPanel((p) => (p === 'mistakes' ? null : 'mistakes')),
      pressed: panel === 'mistakes',
    },
  ];

  const frameControls: Control[] = [
    {
      label: 'Previous Frame',
      Icon: ChevronLeft,
      chords: [{ key: ',' }],
      run: () => editor.selectFrame(frame - 1),
      disabled: frame === 0,
    },
    {
      label: 'Next Frame',
      Icon: ChevronRight,
      chords: [{ key: '.' }],
      run: () => editor.selectFrame(frame + 1),
      disabled: frame === lastFrame,
    },
    {
      label: 'Add Frame',
      Icon: Plus,
      chords: [],
      run: () => editor.applyToFrames({ type: 'add-frame', at: frame + 1 }),
    },
    {
      label: 'Duplicate Frame',
      Icon: CopyPlus,
      chords: [],
      run: () => editor.applyToFrames({ type: 'add-frame', at: frame + 1, copyOf: frame }),
    },
    {
      label: 'Move Frame earlier',
      Icon: ArrowLeft,
      chords: [],
      run: () => editor.applyToFrames({ type: 'move-frame', from: frame, to: frame - 1 }),
      disabled: frame === 0,
    },
    {
      label: 'Move Frame later',
      Icon: ArrowRight,
      chords: [],
      run: () => editor.applyToFrames({ type: 'move-frame', from: frame, to: frame + 1 }),
      disabled: frame === lastFrame,
    },
    {
      label: 'Delete Frame',
      Icon: Trash2,
      chords: [],
      run: () => editor.applyToFrames({ type: 'remove-frame', frame }),
      disabled: lastFrame === 0,
    },
    {
      label: 'Onion skin',
      Icon: Layers,
      chords: [{ key: 'o' }],
      run: () => setOnionShown((shown) => !shown),
      pressed: onionShown,
    },
    {
      label: 'Play preview',
      Icon: Play,
      chords: [{ key: 'p' }],
      run: () => setPreviewShown((shown) => !shown),
      pressed: previewShown,
    },
  ];

  function closePanels() {
    setPanel(null);
    setOpenError(null);
  }

  function startDrawing(next: Drawing) {
    studio.create(next);
    closePanels();
  }

  function openDrawing(entry: SavedDrawing) {
    studio.open(entry.id);
    if (entry.id !== current.id) closePanels();
    else setPanel(null);
  }

  async function openPng(e: ChangeEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0];
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
    if (sheet) {
      downloadSheetPng(sheet, exportScale);
      return;
    }
    downloadPng(drawing, exportScale, `${scaledFilenameStem('drawing', drawing, exportScale)}.png`);
    setPanel(null);
  }

  return (
    <div className="page studio">
      <Nav current="studio" />
      <DrawingEditor
        editor={editor}
        canvasLabel={`Studio canvas, ${drawing.width} by ${drawing.height} pixels${lastFrame > 0 ? `, Frame ${frame + 1} of ${lastFrame + 1}` : ''}`}
        mirror={mirror}
        onion={onionShown ? { ...onionSkins(animation, frame), opacity: onionOpacity } : undefined}
        shortcuts={frameControls}
        below={
          <FrameStrip
            editor={editor}
            animation={animation}
            frame={frame}
            controls={frameControls}
            onionShown={onionShown}
            onionOpacity={onionOpacity}
            onOnionOpacity={setOnionOpacity}
            previewShown={previewShown}
          />
        }
        leadingActions={leadingActions}
        trailingActions={trailingActions}
        marks={
          mistakes
            ? { guide: null, missing: [], extra: [], mistakes: mistakes.flatMap((m) => m.pixels) }
            : undefined
        }
      >
        <input
          ref={setFileInput}
          type="file"
          accept="image/png"
          aria-label="PNG file"
          hidden
          onChange={openPng}
        />
        {problem && <WarningBanner>{STORAGE_MESSAGES[problem]}</WarningBanner>}
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
                        src={thumbnail(frameDrawing(d.animation, 0))}
                        alt=""
                        style={{ aspectRatio: `${d.animation.width} / ${d.animation.height}` }}
                      />
                      <span className="drawing-size">
                        {d.animation.width}x{d.animation.height}
                      </span>
                      <span className="hint">{dateTime.format(d.updatedAt)}</span>
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
        {mistakes && (
          <section
            className="card mistakes-panel"
            aria-label="Check for Mistakes"
            onKeyDown={(e) => e.key === 'Escape' && setPanel(null)}
          >
            <label>
              Color budget
              <input
                type="number"
                min={1}
                max={drawing.palette.length}
                step={1}
                value={colorBudget}
                onChange={(e) => {
                  const value = e.currentTarget.valueAsNumber;
                  if (Number.isInteger(value) && value >= 1) setChosenBudget(value);
                }}
              />
            </label>
            <MistakeList mistakes={mistakes} />
            <p className="hint">The check updates as you draw.</p>
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
            {lastFrame > 0 && (
              <label>
                Frames
                <select
                  value={exportChoice}
                  onChange={(e) => setChosenExport(e.currentTarget.value as ExportChoice)}
                  autoFocus
                >
                  {Object.entries(EXPORT_CHOICES).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Scale
              <select
                value={exportScale}
                onChange={(e) => setExportScale(Number(e.currentTarget.value))}
                autoFocus={lastFrame === 0}
              >
                {EXPORT_SCALES.map((s) => (
                  <option key={s} value={s}>
                    {s}x
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="btn primary">
              {sheet ? 'Export PNG' : 'Export'}
            </button>
            {sheet && (
              <button
                type="button"
                className="btn primary"
                onClick={() => downloadFrameMap(sheet, animation.fps, exportScale)}
              >
                Export JSON
              </button>
            )}
            <button type="button" className="btn" onClick={() => setPanel(null)}>
              {sheet ? 'Done' : 'Cancel'}
            </button>
            <p className="hint">
              Saves {exportedFramesLabel(exportChoice, frame, lastFrame + 1)}a{' '}
              {imageToExport.width * exportScale}x{imageToExport.height * exportScale} PNG. Each
              pixel becomes a sharp {exportScale}x{exportScale} block.
              {sheet &&
                ' The JSON is an Aseprite-style frame map giving where each Frame is and how long it shows.'}
            </p>
          </form>
        )}
        {panel === 'new-drawing' && (
          <NewDrawingForm
            drawing={drawing}
            palettes={palettes}
            onCreate={startDrawing}
            onCancel={() => setPanel(null)}
          />
        )}
      </DrawingEditor>
    </div>
  );
}

function NewDrawingForm({
  drawing,
  palettes,
  onCreate,
  onCancel,
}: {
  drawing: Drawing;
  palettes: readonly CustomPalette[];
  onCreate: (drawing: Drawing) => void;
  onCancel: () => void;
}) {
  const ownChoices = customChoices(palettes);
  const paletteChoices = [STARTER_CHOICE, ...BUNDLED_CHOICES, ...ownChoices];
  const [newPaletteValue, setNewPaletteValue] = useState(
    () => choiceMatching(paletteChoices, drawing.palette).value,
  );
  const newPalette = paletteChoices.find((c) => c.value === newPaletteValue) ?? STARTER_CHOICE;

  function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    onCreate(
      blankStudioDrawing(Number(form.get('width')), Number(form.get('height')), newPalette.colors),
    );
  }

  return (
    <form
      className="card new-drawing"
      aria-label="New drawing"
      onSubmit={create}
      onKeyDown={(e) => e.key === 'Escape' && onCancel()}
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
      <label className="palette-choice">
        Palette
        <select
          value={newPalette.value}
          onChange={(e) => setNewPaletteValue(e.currentTarget.value)}
        >
          <option value={STARTER_CHOICE.value}>{STARTER_CHOICE.label}</option>
          <optgroup label="Bundled">
            {BUNDLED_CHOICES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </optgroup>
          {ownChoices.length > 0 && (
            <optgroup label="Yours">
              {ownChoices.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
      <PaletteSwatches colors={newPalette.colors} />
      <button type="submit" className="btn primary">
        Create
      </button>
      <button type="button" className="btn" onClick={onCancel}>
        Cancel
      </button>
      <p className="hint">
        Up to {MAX_DRAWING_SIZE}x{MAX_DRAWING_SIZE}. The current drawing stays in Drawings.{' '}
        <a href={routeHref.settings}>Make your own palette in Settings.</a>
      </p>
    </form>
  );
}
