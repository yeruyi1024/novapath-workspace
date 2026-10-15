import { writeFileSync } from 'fs';
import { resolve } from 'path';

import { generateAllThemesCSS } from '../engine/css-generator';
import { allThemes } from '../themes/index';

const css = generateAllThemesCSS(allThemes);
const outPath = resolve(__dirname, __dirname.includes('scripts') ? '..' : 'src/renderer/theme', 'css', 'themes.css');
writeFileSync(outPath, css, 'utf-8');
console.log(`✅ Generated ${outPath} (${css.length} bytes)`);
