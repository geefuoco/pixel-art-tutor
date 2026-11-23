import { DatabaseBackup, FileUp } from 'lucide-react';
import { useState, type ChangeEvent } from 'react';
import { readBackup } from '../persistence/backup';
import { Nav } from './Nav';
import { routeHref } from './router';
import { studio } from './studio-store';

type Outcome = { readonly kind: 'error' | 'done'; readonly text: string };

interface ChosenBackup {
  readonly name: string;
  readonly text: string;
  readonly drawings: number;
}

function plural(n: number, noun: string) {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

function download(text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `pixel-art-tutor-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url));
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function Settings() {
  const [fileInput, setFileInput] = useState<HTMLInputElement | null>(null);
  const [chosen, setChosen] = useState<ChosenBackup | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState(false);

  async function downloadBackup() {
    setOutcome(null);
    try {
      download(await studio.backup());
    } catch (error) {
      setOutcome({ kind: 'error', text: `The backup could not be made. ${messageOf(error)}.` });
    }
  }

  async function chooseBackup(e: ChangeEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    setChosen(null);
    setOutcome(null);
    if (!file) return;
    const text = await file.text();
    const reading = readBackup(text);
    if (!reading.ok) {
      setOutcome({
        kind: 'error',
        text: `${reading.message} Your current data has not changed.`,
      });
      return;
    }
    setChosen({ name: file.name, text, drawings: reading.contents.studioDrawings.length });
  }

  async function restoreChosen(backup: ChosenBackup) {
    setBusy(true);
    const result = await studio.restore(backup.text);
    setBusy(false);
    setChosen(null);
    setOutcome(
      result.ok
        ? {
            kind: 'done',
            text: `Restored ${plural(result.drawings, 'drawing')} from ${backup.name}.`,
          }
        : { kind: 'error', text: `${result.message} Your current data has not changed.` },
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
            Your drawings are kept only in this browser. Download a backup file to keep them safe if
            site data is cleared, or to move them to another browser.
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
                Restoring replaces all your current drawings with the{' '}
                {plural(chosen.drawings, 'drawing')} in {chosen.name}.
              </p>
              <button type="submit" className="btn primary" disabled={busy}>
                Replace my drawings
              </button>
              <button type="button" className="btn" disabled={busy} onClick={() => setChosen(null)}>
                Cancel
              </button>
            </form>
          )}
          {outcome?.kind === 'error' && (
            <div className="notice" role="alert">
              <p>{outcome.text}</p>
            </div>
          )}
          {outcome?.kind === 'done' && (
            <div className="notice" role="status">
              <p>{outcome.text}</p>
              <a className="btn" href={routeHref.studio}>
                Open the Studio
              </a>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
