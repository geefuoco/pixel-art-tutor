import { DatabaseBackup, FileUp, TriangleAlert } from 'lucide-react';
import { useState, type ChangeEvent } from 'react';
import { readBackup } from '../persistence/backup';
import { downloadFile } from './download';
import { Nav } from './Nav';
import { plural } from './plural';
import { Palettes } from './Palettes';
import { routeHref } from './router';
import { forgetLessonPlays } from './lesson-plays';
import { personalLessons } from './personal-lessons-store';
import { courseProgress } from './progress-store';
import { studio } from './studio-store';

type Notice = { readonly kind: 'error' | 'done'; readonly text: string };

interface ChosenBackup {
  readonly name: string;
  readonly text: string;
  readonly drawingCount: number;
  readonly paletteCount: number;
}

function contentsOf({ drawingCount, paletteCount }: Omit<ChosenBackup, 'name' | 'text'>) {
  return paletteCount === 0
    ? plural(drawingCount, 'drawing')
    : `${plural(drawingCount, 'drawing')} and ${plural(paletteCount, 'palette')}`;
}

function refused(reason: string): Notice {
  return { kind: 'error', text: `${reason} Your current data has not changed.` };
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function Settings() {
  const [fileInput, setFileInput] = useState<HTMLInputElement | null>(null);
  const [chosen, setChosen] = useState<ChosenBackup | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);

  async function downloadBackup() {
    setNotice(null);
    try {
      downloadFile(
        new Blob([await studio.backup()], { type: 'application/json' }),
        `pixel-art-tutor-backup-${new Date().toISOString().slice(0, 10)}.json`,
      );
    } catch (error) {
      setNotice({ kind: 'error', text: `The backup could not be made. ${messageOf(error)}.` });
    }
  }

  async function chooseBackup(e: ChangeEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    setChosen(null);
    setNotice(null);
    if (!file) return;
    let text: string;
    try {
      text = await file.text();
    } catch {
      setNotice(refused(`${file.name} could not be read.`));
      return;
    }
    const reading = readBackup(text);
    if (!reading.ok) {
      setNotice(refused(reading.message));
      return;
    }
    setChosen({
      name: file.name,
      text,
      drawingCount: reading.contents.studioDrawings.length,
      paletteCount: reading.contents.customPalettes.length,
    });
  }

  async function restoreChosen(backup: ChosenBackup) {
    setBusy(true);
    const result = await studio.restore(backup.text);
    if (result.ok) {
      forgetLessonPlays();
      await Promise.all([courseProgress.reload(), personalLessons.reload()]);
    }
    setBusy(false);
    setChosen(null);
    setNotice(
      result.ok
        ? {
            kind: 'done',
            text: `Restored ${contentsOf(result)} from ${backup.name}.`,
          }
        : refused(result.message),
    );
  }

  return (
    <div className="page">
      <Nav current="settings" />
      <main className="card settings">
        <h1>Settings</h1>
        <section aria-labelledby="backup-heading" className="settings-section">
          <h2 id="backup-heading">Backup</h2>
          <p className="hint">
            Your drawings, palettes, Personal Lessons and Lesson Attempts are kept only in this
            browser. Download a backup file to keep them safe if site data is cleared, or to move
            them to another browser.
          </p>
          <div className="settings-actions">
            <button type="button" className="btn primary" onClick={downloadBackup}>
              <DatabaseBackup aria-hidden size={18} /> Download backup
            </button>
            <button type="button" className="btn" onClick={() => fileInput?.click()}>
              <FileUp aria-hidden size={18} /> Restore backup
            </button>
          </div>
          <input
            ref={setFileInput}
            type="file"
            accept="application/json,.json"
            aria-label="Backup file"
            hidden
            onChange={chooseBackup}
          />
          {chosen && (
            <form
              className="notice confirm-restore"
              aria-label="Restore backup"
              onSubmit={(e) => {
                e.preventDefault();
                void restoreChosen(chosen);
              }}
            >
              <p>
                Restoring replaces all your current drawings, palettes, Personal Lessons and Lesson
                Attempts with the {contentsOf(chosen)} in {chosen.name}.
              </p>
              <button type="submit" className="btn primary" disabled={busy}>
                Replace my drawings
              </button>
              <button type="button" className="btn" disabled={busy} onClick={() => setChosen(null)}>
                Cancel
              </button>
            </form>
          )}
          {notice?.kind === 'error' && (
            <div className="warning-banner" role="alert">
              <TriangleAlert aria-hidden size={20} />
              <p>{notice.text}</p>
            </div>
          )}
          {notice?.kind === 'done' && (
            <div className="notice" role="status">
              <p>{notice.text}</p>
              <a className="btn" href={routeHref.studio}>
                Open the Studio
              </a>
            </div>
          )}
        </section>
        <Palettes />
      </main>
    </div>
  );
}
