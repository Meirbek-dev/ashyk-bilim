/**
 * Theme definitions for the application
 * This file contains all the predefined themes
 */

import { createThemeFromCSS } from './theme-utils';

export const defaultTheme = createThemeFromCSS(
  'default',
  'Default',
  `
  --primary: oklch(0.6231 0.188 259.8145);
  --secondary: oklch(0.967 0.0029 264.5419);
  --accent: oklch(0.9514 0.025 236.8242);
  `,
  'The default Ashyq Bilim theme',
);

export const blackTheme = createThemeFromCSS(
  'black',
  'Black',
  `
  --primary: oklch(0.2050 0 0);
  --secondary: oklch(0.9700 0 0);
  --accent: oklch(0.9700 0 0);
  `,
  'Minimalistic black and white theme',
);

export const amberMinimalTheme = createThemeFromCSS(
  'amberminimal',
  'Amber Minimal',
  `
  --primary: oklch(0.7686 0.1647 70.0804);
  --secondary: oklch(0.9670 0.0029 264.5419);
  --accent: oklch(0.9869 0.0214 95.2774);
  `,
  'Minimalistic amber theme',
);

export const amethystHazeTheme = createThemeFromCSS(
  'amethysthaze',
  'Amethyst Haze',
  `
  --primary: oklch(0.6104 0.0767 299.7335);
  --secondary: oklch(0.8957 0.0265 300.2416);
  --accent: oklch(0.7889 0.0802 359.9375);
  `,
  'Soft purple haze theme with amethyst accents',
);

export const boldTechTheme = createThemeFromCSS(
  'boldtech',
  'Bold Tech',
  `
  --primary: oklch(0.6056 0.2189 292.7172);
  --secondary: oklch(0.9618 0.0202 295.1913);
  --accent: oklch(0.9319 0.0316 255.5855);
  `,
  'Bold purple tech theme with vibrant accents',
);

export const bubblegumTheme = createThemeFromCSS(
  'bubblegum',
  'Bubblegum',
  `
  --primary: oklch(0.6209 0.1801 348.1385);
  --secondary: oklch(0.8095 0.0694 198.1863);
  --accent: oklch(0.9195 0.0801 87.6670);
  `,
  'Playful pink bubblegum theme with flat shadows',
);

export const caffeineTheme = createThemeFromCSS(
  'caffeine',
  'Caffeine',
  `
  --primary: oklch(0.4341 0.0392 41.9938);
  --secondary: oklch(0.9200 0.0651 74.3695);
  --accent: oklch(0.9310 0 0);
  `,
  'Warm coffee-inspired theme with rich brown tones',
);

export const candylandTheme = createThemeFromCSS(
  'candyland',
  'Candyland',
  `
  --primary: oklch(0.8677 0.0735 7.0855);
  --secondary: oklch(0.8148 0.0819 225.7537);
  --accent: oklch(0.9680 0.2110 109.7692);
  `,
  'Sweet candy-colored theme with pastel rainbow accents',
);

export const catppuccinTheme = createThemeFromCSS(
  'catppuccin',
  'Catppuccin',
  `
  --primary: oklch(0.5547 0.2503 297.0156);
  --secondary: oklch(0.8575 0.0145 268.4756);
  --accent: oklch(0.6820 0.1448 235.3822);
  `,
  'Soothing pastel theme inspired by Catppuccin color palette',
);

export const claudeTheme = createThemeFromCSS(
  'claude',
  'Claude',
  `
  --primary: oklch(0.6171 0.1375 39.0427);
  --secondary: oklch(0.9245 0.0138 92.9892);
  --accent: oklch(0.9245 0.0138 92.9892);
  `,
  'Warm beige theme inspired by Claude AI with copper accents',
);

export const claymorphismTheme = createThemeFromCSS(
  'claymorphism',
  'Claymorphism',
  `
  --primary: oklch(0.5854 0.2041 277.1173);
  --secondary: oklch(0.8687 0.0043 56.3660);
  --accent: oklch(0.9376 0.0260 321.9388);
  `,
  'Soft clay-textured theme with prominent rounded corners and depth',
);

export const cleanSlateTheme = createThemeFromCSS(
  'cleanSlate',
  'Clean Slate',
  `
  --primary: oklch(0.5854 0.2041 277.1173);
  --secondary: oklch(0.9276 0.0058 264.5313);;
  --accent: oklch(0.9299 0.0334 272.7879);
  `,
  'Crisp minimalist theme with clean neutral tones',
);

export const cosmicNightTheme = createThemeFromCSS(
  'cosmicnight',
  'Cosmic Night',
  `
  --primary: oklch(0.5417 0.1790 288.0332);
  --secondary: oklch(0.9174 0.0435 292.6901);
  --accent: oklch(0.9221 0.0373 262.1410);
  `,
  'Deep purple cosmic theme with starry night aesthetics',
);

export const cyberpunkTheme = createThemeFromCSS(
  'cyberpunk',
  'Cyberpunk',
  `
  --primary: oklch(0.6726 0.2904 341.4084);
  --secondary: oklch(0.9595 0.0200 286.0164);
  --accent: oklch(0.8903 0.1739 171.2690);
  `,
  'Neon-infused futuristic theme with vibrant pink and cyan accents',
);

export const darkmatterTheme = createThemeFromCSS(
  'darkmatter',
  'Darkmatter',
  `
  --primary: oklch(0.6716 0.1368 48.5130);
  --secondary: oklch(0.5360 0.0398 196.0280);
  --accent: oklch(0.9491 0 0);
  `,
  'Deep space theme with mysterious dark matter aesthetics and golden accents',
);

export const doom64Theme = createThemeFromCSS(
  'doom64',
  'Doom 64',
  `
  --primary: oklch(0.5016 0.1887 27.4816);
  --secondary: oklch(0.4955 0.0896 126.1858);
  --accent: oklch(0.5880 0.0993 245.7394);
  `,
  'Retro gaming theme inspired by Doom 64 with sharp corners and bold colors',
);

export const elegantLuxuryTheme = createThemeFromCSS(
  'elegantLuxury',
  'Elegant Luxury',
  `
  --primary: oklch(0.4650 0.1470 24.9381);
  --secondary: oklch(0.9625 0.0385 89.0943);
  --accent: oklch(0.9619 0.0580 95.6174);
  `,
  'Sophisticated luxury theme with elegant cream tones and rich mahogany accents',
);

export const graphiteTheme = createThemeFromCSS(
  'graphite',
  'Graphite',
  `
  --primary: oklch(0.4891 0 0);
  --secondary: oklch(0.9067 0 0);
  --accent: oklch(0.8078 0 0);
  `,
  'Professional monochrome theme with smooth graphite gray tones',
);

export const kodamaGraveTheme = createThemeFromCSS(
  'kodamaGrave',
  'Kodama Grave',
  `
  --primary: oklch(0.6657 0.1050 118.9078);
  --secondary: oklch(0.8532 0.0631 91.1493);
  --accent: oklch(0.8361 0.0713 90.3269);
  `,
  'Nature-inspired theme with peaceful forest green and earthy tones',
);

export const midnightBloomTheme = createThemeFromCSS(
  'midnightBloom',
  'Midnight Bloom',
  `
  --primary: oklch(0.5676 0.2021 283.0838);
  --secondary: oklch(0.8214 0.0720 249.3482);
  --accent: oklch(0.6475 0.0642 117.4260);
  `,
  'Elegant nighttime theme with rich purple blooms and soft shadows',
);

export const mochaMousseTheme = createThemeFromCSS(
  'mochaMousse',
  'Mocha Mousse',
  `
  --primary: oklch(0.6083 0.0623 44.3588);
  --secondary: oklch(0.7473 0.0387 80.5476);
  --accent: oklch(0.8502 0.0389 49.0874);
  `,
  'Warm coffee-inspired theme with rich mocha and cream tones',
);

export const darkTheme = createThemeFromCSS(
  'dark',
  'Dark (Beta)',
  `
  --primary: oklch(0.922 0 0);
  --secondary: oklch(0.269 0 0);
  --accent: oklch(0.269 0 0);
  `,
  'Dark theme (In developement)',
);

export const natureTheme = createThemeFromCSS(
  'nature',
  'Nature',
  `
  --primary: oklch(0.5234 0.1347 144.1672);
  --secondary: oklch(0.9571 0.0210 147.6360);
  --accent: oklch(0.8952 0.0504 146.0366);
  `,
  'Fresh nature-inspired theme with organic green tones and earthy accents',
);

export const neoBrutalismTheme = createThemeFromCSS(
  'neoBrutalism',
  'Neo Brutalism',
  `
  --primary: oklch(0.6489 0.2370 26.9728);
  --secondary: oklch(0.9680 0.2110 109.7692);
  --accent: oklch(0.5635 0.2408 260.8178);
  `,
  'Bold brutalist design with thick black borders and strong shadows',
);

export const northernLightsTheme = createThemeFromCSS(
  'northernLights',
  'Northern Lights',
  `
  --primary: oklch(0.6487 0.1538 150.3071);
  --secondary: oklch(0.6746 0.1414 261.3380);
  --accent: oklch(0.8269 0.1080 211.9627);
  `,
  'Magical aurora borealis theme with ethereal green and purple gradients',
);

export const notebookTheme = createThemeFromCSS(
  'notebook',
  'Notebook',
  `
  --primary: oklch(0.4891 0 0);
  --secondary: oklch(0.9006 0 0);
  --accent: oklch(0.9354 0.0456 94.8549);
  `,
  'Paper notebook theme with ruled lines aesthetic and handwritten font style',
);

export const oceanBreezeTheme = createThemeFromCSS(
  'oceanBreeze',
  'Ocean Breeze',
  `
  --primary: oklch(0.7227 0.1920 149.5793);
  --secondary: oklch(0.9514 0.0250 236.8242);
  --accent: oklch(0.9505 0.0507 163.0508);
  `,
  'Refreshing ocean-inspired theme with cool turquoise and seafoam tones',
);

export const pastelDreamsTheme = createThemeFromCSS(
  'pastelDreams',
  'Pastel Dreams',
  `
  --primary: oklch(0.7090 0.1592 293.5412);
  --secondary: oklch(0.9073 0.0530 306.0902);
  --accent: oklch(0.9376 0.0260 321.9388);
  `,
  'Dreamy pastel theme with soft lavender and pink cotton candy colors',
);

export const perpetuityTheme = createThemeFromCSS(
  'perpetuity',
  'Perpetuity',
  `
  --primary: oklch(0.5624 0.0947 203.2755);
  --secondary: oklch(0.9244 0.0181 196.8450);
  --accent: oklch(0.9021 0.0297 201.8915);
  `,
  'Timeless monospace terminal theme with cyan-tinted blue aesthetics',
);

export const quantumRoseTheme = createThemeFromCSS(
  'quantumRose',
  'Quantum Rose',
  `
  --primary: oklch(0.6002 0.2414 0.1348);
  --secondary: oklch(0.9230 0.0701 326.1273);
  --accent: oklch(0.8766 0.0828 344.8849);
  `,
  'Futuristic rose-tinted theme with quantum-inspired pink and magenta hues',
);

export const retroArcadeTheme = createThemeFromCSS(
  'retroArcade',
  'Retro Arcade',
  `
  --primary: oklch(0.5924 0.2025 355.8943);
  --secondary: oklch(0.6437 0.1019 187.3840);
  --accent: oklch(0.5808 0.1732 39.5003);
  `,
  'Bold neon-inspired palette with playful contrasts, evoking the vibrant glow of 80s arcades',
);

export const softPopTheme = createThemeFromCSS(
  'softPop',
  'Soft Pop',
  `
  --primary: oklch(0.5106 0.2301 276.9656);
  --secondary: oklch(0.7038 0.1230 182.5025);
  --accent: oklch(0.7686 0.1647 70.0804);
  `,
  'Bright, bubbly theme with pastel accents and clean contrasts for a playful yet modern look',
);

export const solarDuskTheme = createThemeFromCSS(
  'solarDusk',
  'Solar Dusk',
  `
  --primary: oklch(0.5553 0.1455 48.9975);
  --secondary: oklch(0.8276 0.0752 74.4400);
  --accent: oklch(0.9000 0.0500 74.9889);
  `,
  'Warm, golden tones fading into deep shadows-captures the calm glow of dusk before nightfall',
);

export const starryNightTheme = createThemeFromCSS(
  'starryNight',
  'Starry Night',
  `
  --primary: oklch(0.4815 0.1178 263.3758);
  --secondary: oklch(0.8567 0.1164 81.0092);
  --accent: oklch(0.6896 0.0714 234.0387);
  `,
  'Deep midnight blues and luminous highlights, evoking a tranquil star-filled night sky',
);

export const sunsetHorizonTheme = createThemeFromCSS(
  'sunsetHorizon',
  'Sunset Horizon',
  `
  --primary: oklch(0.7357 0.1641 34.7091);
  --secondary: oklch(0.9596 0.0200 28.9029);
  --accent: oklch(0.8278 0.1131 57.9984);
  `,
  'Radiant oranges and glowing ambers that reflect the warmth of a summer sunset on the horizon',
);

export const supabaseTheme = createThemeFromCSS(
  'supabase',
  'Supabase',
  `
  --primary: oklch(0.8348 0.1302 160.9080);
  --secondary: oklch(0.9940 0 0);
  --accent: oklch(0.9461 0 0);
  `,
  'Clean minimalism with fresh green accents, inspired by the signature Supabase brand identity',
);

export const t3chatTheme = createThemeFromCSS(
  't3chat',
  'T3 Chat',
  `
  --primary: oklch(0.5316 0.1409 355.1999);
  --secondary: oklch(0.8696 0.0675 334.8991);
  --accent: oklch(0.8696 0.0675 334.8991);
  `,
  'Modern chat-inspired design with vibrant magentas and cool contrasts for lively conversations',
);

export const tangerineTheme = createThemeFromCSS(
  'tangerine',
  'Tangerine',
  `
  --primary: oklch(0.6397 0.1720 36.4421);
  --secondary: oklch(0.9670 0.0029 264.5419);
  --accent: oklch(0.9119 0.0222 243.8174);
  `,
  'Juicy citrus tones blended with cool accents, delivering a fresh and energetic aesthetic',
);

export const twitterTheme = createThemeFromCSS(
  'twitter',
  'Twitter',
  `
  --primary: oklch(0.6723 0.1606 244.9955);
  --secondary: oklch(0.1884 0.0128 248.5103);
  --accent: oklch(0.9392 0.0166 250.8453);
  `,
  'Clean whites with iconic Twitter blue highlights, optimized for clarity and social interaction',
);

export const vercelTheme = createThemeFromCSS(
  'vercel',
  'Vercel',
  `
  --primary: oklch(0 0 0);
  --secondary: oklch(0.9400 0 0);
  --accent: oklch(0.9400 0 0);
  `,
  'Minimalist monochrome design with sharp contrasts, reflecting Vercel’s sleek and modern aesthetic',
);

export const vintagePaperTheme = createThemeFromCSS(
  'vintagePaper',
  'Vintage Paper',
  `
  --primary: oklch(0.6180 0.0778 65.5444);
  --secondary: oklch(0.8846 0.0302 85.5655);
  --accent: oklch(0.8348 0.0426 88.8064);
  `,
  'Soft parchment tones with muted contrasts, evoking the warmth and texture of aged paper',
);

export const violetBloomTheme = createThemeFromCSS(
  'violetBloom',
  'Violet Bloom',
  `
  --primary: oklch(0.5393 0.2713 286.7462);
  --secondary: oklch(0.9540 0.0063 255.4755);
  --accent: oklch(0.9393 0.0288 266.3680);
  `,
  'Radiant purples with soft highlights, capturing the elegance and freshness of blooming violets',
);

export const artDecoTheme = createThemeFromCSS(
  'artDeco',
  'Art Deco',
  `
  --primary: oklch(0.77 0.14 91.27);
  --secondary: oklch(0.67 0.13 61.58);
  --accent: oklch(0.89 0.18 95.47);
  `,
  'Elegant Art Deco style with luxurious gold and geometric patterns',
);

export const corporateTheme = createThemeFromCSS(
  'corporate',
  'Corporate',
  `
  --primary: oklch(0.48 0.20 260.47);
  --secondary: oklch(0.97 0 0);
  --accent: oklch(0.95 0.02 260.18);
  `,
  'Professional corporate theme with clean lines and business aesthetics',
);

export const ghibliStudioTheme = createThemeFromCSS(
  'ghibliStudio',
  'Ghibli Studio',
  `
  --primary: oklch(0.71 0.10 111.96);
  --secondary: oklch(0.88 0.05 83.32);
  --accent: oklch(0.86 0.05 85.12);
  `,
  'Whimsical Studio Ghibli-inspired theme with gentle pastels and natural tones',
);

export const mashmallowTheme = createThemeFromCSS(
  'mashmallow',
  'Marshmallow',
  `
  --primary: oklch(0.80 0.14 348.82);
  --secondary: oklch(0.94 0.07 97.70);
  --accent: oklch(0.83 0.09 247.96);
  `,
  'Soft and fluffy marshmallow-inspired theme with sweet pastel colors',
);

export const marvelTheme = createThemeFromCSS(
  'marvel',
  'Marvel',
  `
  --primary: oklch(0.55 0.22 27.03);
  --secondary: oklch(0.52 0.14 247.51);
  --accent: oklch(0.86 0.04 33.45);
  `,
  'Heroic Marvel-inspired theme with bold reds and vibrant comic book aesthetics',
);

export const materialDesignTheme = createThemeFromCSS(
  'materialDesign',
  'Material Design',
  `
  --primary: oklch(0.51 0.21 286.50);
  --secondary: oklch(0.49 0.04 300.23);
  --accent: oklch(0.92 0.04 303.47);
  `,
  'Google Material Design theme with clean elevation and bold colors',
);

export const perplexityTheme = createThemeFromCSS(
  'perplexity',
  'Perplexity',
  `
  --primary: oklch(0.72 0.12 210.36);
  --secondary: oklch(0.97 0.01 247.91);
  --accent: oklch(0.96 0.02 204.34);
  `,
  'Clean and modern Perplexity-inspired theme with cool blue tones',
);

export const slackTheme = createThemeFromCSS(
  'slack',
  'Slack',
  `
  --primary: oklch(0.37 0.14 323.40);
  --secondary: oklch(0.96 0.01 311.36);
  --accent: oklch(0.88 0.02 323.34);
  `,
  'Collaborative Slack-inspired theme with purple accents and clean workspace aesthetics',
);

export const spotifyTheme = createThemeFromCSS(
  'spotify',
  'Spotify',
  `
  --primary: oklch(0.67 0.17 153.85);
  --secondary: oklch(0.90 0.02 238.66);
  --accent: oklch(0.90 0.02 240.73);
  `,
  'Music-inspired Spotify theme with vibrant green and dark contrasts',
);

export const summerTheme = createThemeFromCSS(
  'summer',
  'Summer',
  `
  --primary: oklch(0.70 0.17 28.12);
  --secondary: oklch(0.81 0.15 71.81);
  --accent: oklch(0.64 0.22 28.93);
  `,
  'Bright and sunny summer theme with warm oranges and golden tones',
);

export const valorantTheme = createThemeFromCSS(
  'valorant',
  'Valorant',
  `
  --primary: oklch(0.67 0.22 21.22);
  --secondary: oklch(0.95 0.02 10.30);
  --accent: oklch(0.99 0 0);
  `,
  'Tactical Valorant-inspired theme with bold reds and sharp contrasts',
);

export const vscodeTheme = createThemeFromCSS(
  'vscode',
  'VS Code',
  `
  --primary: oklch(0.71 0.15 239.15);
  --secondary: oklch(0.91 0.03 229.20);
  --accent: oklch(0.88 0.02 235.72);
  `,
  'Developer-friendly VS Code theme with cool blues and clean code aesthetics',
);

export const sageGardenTheme = createThemeFromCSS(
  'sage-garden',
  'Sage Garden',
  `
  --primary: oklch(0.6333 0.0309 154.9039);
  --secondary: oklch(0.8596 0.0291 119.9919);
  --accent: oklch(0.8242 0.0221 136.6092);
  `,
  '',
);

export const themes = [
  defaultTheme,
  cosmicNightTheme,
  vintagePaperTheme,
  perpetuityTheme,
  quantumRoseTheme,
  cyberpunkTheme,
  t3chatTheme,
  amberMinimalTheme,
  amethystHazeTheme,
  artDecoTheme,
  blackTheme,
  boldTechTheme,
  bubblegumTheme,
  caffeineTheme,
  candylandTheme,
  catppuccinTheme,
  claudeTheme,
  claymorphismTheme,
  cleanSlateTheme,
  corporateTheme,
  darkmatterTheme,
  doom64Theme,
  elegantLuxuryTheme,
  ghibliStudioTheme,
  graphiteTheme,
  kodamaGraveTheme,
  marvelTheme,
  mashmallowTheme,
  materialDesignTheme,
  midnightBloomTheme,
  mochaMousseTheme,
  darkTheme,
  natureTheme,
  neoBrutalismTheme,
  northernLightsTheme,
  notebookTheme,
  oceanBreezeTheme,
  pastelDreamsTheme,
  perplexityTheme,
  retroArcadeTheme,
  slackTheme,
  softPopTheme,
  solarDuskTheme,
  spotifyTheme,
  starryNightTheme,
  summerTheme,
  sunsetHorizonTheme,
  supabaseTheme,
  tangerineTheme,
  twitterTheme,
  valorantTheme,
  vercelTheme,
  violetBloomTheme,
  vscodeTheme,
  sageGardenTheme,
] as const;
