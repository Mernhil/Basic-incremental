import '@fontsource/outfit/500.css';
import '@fontsource/outfit/600.css';
import '@fontsource/outfit/700.css';
import '@fontsource/outfit/800.css';
// the pixel-frame shell's two fonts (UI_RULES.md §2, "Shell look"): Pixelify Sans for headings
// and large numbers, Atkinson Hyperlegible for every other text
import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/600.css';
import '@fontsource/pixelify-sans/700.css';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import { installBrowserApi } from './web/installBrowserApi';
import { installLogCapture } from './settings/logBuffer';
import { installMotionPref } from './settings/motion';
import { installDesignScale } from './ui/designScale';
import { installPixelScale } from './ui/pixelFit';

// before anything else: recent log lines for Report an issue, and the reduced-motion override
installLogCapture();
// in a plain browser (the phone build) there is no desktop shell: saves go to browser storage
installBrowserApi();
installMotionPref();
// the whole UI is laid out at 1920 x 1080 and zoomed to the window (before the pixel scale reads it)
installDesignScale();
// Clean pixels (DESIGN.md §12): the screen scale decides every pixel-art size
installPixelScale();

const GALLERY_HASH = '#gallery';

if (import.meta.env.DEV) {
  // Dev only: Ctrl+Shift+G toggles the card gallery.
  window.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'g') {
      location.hash = location.hash === GALLERY_HASH ? '' : GALLERY_HASH;
      location.reload();
    }
  });
}

if (import.meta.env.DEV && location.hash === GALLERY_HASH) {
  void import('./gallery/gallery').then((m) => m.renderGallery());
} else {
  void import('./game-entry').then((m) => m.init());
}
