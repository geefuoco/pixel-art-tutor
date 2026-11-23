import type { LucideIcon } from 'lucide-react';

export interface Chord {
  key: string;
  mod?: boolean;
  shift?: boolean;
}

export interface Control {
  label: string;
  Icon: LucideIcon;
  chords: Chord[];
  run: () => void;
  disabled?: boolean;
  pressed?: boolean;
}

export function matches(chord: Chord, e: KeyboardEvent) {
  return (
    e.key.toLowerCase() === chord.key &&
    (e.ctrlKey || e.metaKey) === !!chord.mod &&
    (chord.shift === undefined || chord.shift === e.shiftKey)
  );
}

function chordLabel({ key, mod, shift }: Chord, ctrl = 'Ctrl', plus = '+') {
  const name = key === '+' ? plus : key[0]!.toUpperCase() + key.slice(1);
  return `${mod ? `${ctrl}+` : ''}${shift ? 'Shift+' : ''}${name}`;
}

export function ControlButton({ control, iconSize }: { control: Control; iconSize: number }) {
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
