// UX-145: the editor image/PDF block kk copy said «Жүктеп алу» (download) on
// the upload button, «Сайлау» (election) for download and «Дұрыс туралаңыз»
// (align correctly) for align-right.
import { describe, expect, it } from 'vite-plus/test'
import kk from '@/messages/kk-KZ.json'

describe('UX-145 kk media block copy', () => {
  it('upload is «Жүктеп салу», download is «Жүктеп алу», alignment names the side', () => {
    const image = kk.DashPage.Editor.ImageBlock
    expect(image.upload).toBe('Жүктеп салу')
    expect(image.download).toBe('Жүктеп алу')
    expect(kk.DashPage.Editor.PDFBlock.download).toBe('Жүктеп алу')
    expect(kk.DashPage.Editor.VideoBlock.download).toBe('Жүктеп алу')
    expect(image.alignLeft).toBe('Солға туралау')
    expect(image.alignCenter).toBe('Ортасына туралау')
    expect(image.alignRight).toBe('Оңға туралау')
    expect(JSON.stringify(kk)).not.toContain('Сайлау')
  })
})
