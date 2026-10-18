import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

// Use the image renderer already shipped with Next; no extra build dependency.
const require = createRequire(import.meta.resolve('next/package.json'))
const sharp = require('sharp')
const publicDir = new URL('../public/', import.meta.url)
const icon = await readFile(new URL('favicon.svg', publicDir), 'utf8')
const logo = await readFile(new URL('app_logo_light_full.svg', publicDir), 'utf8')
const mark = icon.match(/<path[\s\S]*?\/>/u)[0]
const square = padding => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
  <rect width="160" height="160" fill="#162c4a"/>
  <g transform="translate(${padding} ${padding}) scale(${(160 - 2 * padding) / 160})">${mark}</g>
</svg>`
const share = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#162c4a"/>
  ${logo
    .replace(/<\?xml[^>]*\?>/u, '')
    .trim()
    .replace('<svg ', '<svg x="96" y="120" width="660" height="241" ')}
  <path d="M96 426H1104" stroke="#879bb5" stroke-width="2"/>
  <text x="96" y="498" fill="#fff" font-family="Arial, sans-serif" font-size="32">Онлайн оқытуға арналған білім беру платформасы</text>
</svg>`
const assets = {
  'brand/palette.json': `${JSON.stringify({ navy: '#162c4a', white: '#ffffff' }, null, 2)}\n`,
  'apple-touch-icon.png': await sharp(Buffer.from(square(0)))
    .resize(180, 180)
    .png()
    .toBuffer(),
  'icon-192.png': await sharp(Buffer.from(icon)).resize(192, 192).png().toBuffer(),
  'icon-512.png': await sharp(Buffer.from(icon)).resize(512, 512).png().toBuffer(),
  'icon-maskable-512.png': await sharp(Buffer.from(square(24)))
    .resize(512, 512)
    .png()
    .toBuffer(),
  'brand/share-card.svg': share,
  'brand/share-card.png': await sharp(Buffer.from(share)).png().toBuffer(),
  'brand/logo-navy.png': await sharp(await readFile(new URL('app_logo_full.svg', publicDir)))
    .resize(1310)
    .png()
    .toBuffer(),
  'brand/logo-white.png': await sharp(Buffer.from(logo)).resize(1310).png().toBuffer(),
}
const manifest = {
  id: '/',
  name: 'Ashyq Bilim',
  short_name: 'Ashyq Bilim',
  description: 'Онлайн оқытуға арналған білім беру платформасы',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  background_color: '#ffffff',
  theme_color: '#162c4a',
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}
for (const dir of [publicDir, new URL('../../web-2/public/', import.meta.url)]) {
  await mkdir(new URL('brand/', dir), { recursive: true })
  for (const [name, data] of Object.entries(assets)) await writeFile(new URL(name, dir), data)
  await writeFile(new URL('site.webmanifest', dir), `${JSON.stringify(manifest, null, 2)}\n`)
}
console.log('Brand assets generated for both frontends.')
