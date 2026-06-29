/**
 * Creates small fixture files used in upload tests.
 * Run this once as part of test setup.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

export function ensureFixtureFiles(): void {
  const fixturesDir = path.join(__dirname, '../fixtures/files')
  fs.mkdirSync(fixturesDir, { recursive: true })

  // Minimal valid PDF
  const pdfPath = path.join(fixturesDir, 'sample.pdf')
  if (!fs.existsSync(pdfPath)) {
    // A minimal 1-page PDF that passes MIME type checks
    const minimalPdf = Buffer.from(
      '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj ' +
        '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj ' +
        '3 0 obj<</Type/Page/MediaBox[0 0 3 3]>>endobj\n' +
        'xref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n' +
        '0000000058 00000 n\n0000000115 00000 n\n' +
        'trailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF',
    )
    fs.writeFileSync(pdfPath, minimalPdf)
  }
}
