import adventurer from './art/adventurer.png';
import sadSpeechBubble from './art/sad-speech-bubble.png';
import { mobileNoticeChoice } from './mobile-notice-store';

export function MobileNotice() {
  return (
    <main className="mobile-notice" aria-labelledby="mobile-notice-title">
      <div className="mobile-notice-art">
        <img className="sad-speech-bubble" src={sadSpeechBubble} alt="" />
        <img className="adventurer" src={adventurer} alt="" />
      </div>
      <h1 id="mobile-notice-title">Not supported on mobile</h1>
      <p>
        Pixel Art Tutor is built for drawing with a mouse and keyboard, in a window at least 500
        pixels wide.
      </p>
      <button type="button" className="btn primary" onClick={mobileNoticeChoice.continueAnyway}>
        Continue anyway
      </button>
    </main>
  );
}
