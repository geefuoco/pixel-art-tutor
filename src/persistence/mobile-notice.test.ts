import { describe, expect, it } from 'vitest';
import { createMobileNoticeChoice, type DeviceStorage } from './mobile-notice';

class MemoryStorage implements Pick<Storage, 'getItem' | 'setItem'> {
  private readonly items = new Map<string, string>();
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.items.set(key, value);
  }
}

describe('continuing past the mobile notice', () => {
  it('has not been chosen on a fresh device', () => {
    expect(createMobileNoticeChoice(new MemoryStorage()).hasContinued()).toBe(false);
  });

  it('is remembered on the same device after continuing', () => {
    const storage = new MemoryStorage();
    createMobileNoticeChoice(storage).continueAnyway();
    expect(createMobileNoticeChoice(storage).hasContinued()).toBe(true);
  });

  it('still lets the learner continue for this visit when storage is blocked', () => {
    const blocked: DeviceStorage = {
      getItem: () => {
        throw new DOMException('Site data is blocked', 'SecurityError');
      },
      setItem: () => {
        throw new DOMException('Site data is blocked', 'SecurityError');
      },
    };
    const choice = createMobileNoticeChoice(blocked);
    expect(choice.hasContinued()).toBe(false);
    choice.continueAnyway();
    expect(choice.hasContinued()).toBe(true);
  });

  it('tells subscribers when the learner continues, until they unsubscribe', () => {
    const choice = createMobileNoticeChoice(new MemoryStorage());
    const heard: boolean[] = [];
    const unsubscribe = choice.subscribe(() => heard.push(choice.hasContinued()));
    choice.continueAnyway();
    unsubscribe();
    choice.continueAnyway();
    expect(heard).toEqual([true]);
  });

  it('still lets the learner continue when there is no storage at all', () => {
    const choice = createMobileNoticeChoice(undefined);
    choice.continueAnyway();
    expect(choice.hasContinued()).toBe(true);
  });
});
