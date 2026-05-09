import { common, createLowlight } from 'lowlight';
import css from 'highlight.js/lib/languages/css';
import html from 'highlight.js/lib/languages/xml';
import java from 'highlight.js/lib/languages/java';
import js from 'highlight.js/lib/languages/javascript';
import python from 'highlight.js/lib/languages/python';
import ts from 'highlight.js/lib/languages/typescript';
import kotlin from 'highlight.js/lib/languages/kotlin';

export const SHARED_LOWLIGHT = (() => {
  const lowlight = createLowlight(common);

  lowlight.register('html', html);
  lowlight.register('css', css);
  lowlight.register('js', js);
  lowlight.register('ts', ts);
  lowlight.register('python', python);
  lowlight.register('java', java);
  lowlight.register('kotlin', kotlin);

  return lowlight;
})();
