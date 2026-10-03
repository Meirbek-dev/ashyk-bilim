// Browser-test doubles of the upload path: the API's create/finalize answers and storage's side of the PUT.

export const SLOT = {
  id: '0190a5d2-0000-7000-8000-000000000001',
  key: 'uploads/a.png',
  put_url: 'https://storage.test/put',
}

/** Storage's side of the PUT: records the request, reports progress, answers with `status`. */
export class FakeStorage extends EventTarget {
  static last: FakeStorage | null = null
  static status = 200
  /** Resolve it to let a held PUT finish (to see the progress state); settled by default. */
  static gate: Promise<unknown> = Promise.resolve()
  readonly upload = new EventTarget()
  readonly headers = new Map<string, string>()
  method = ''
  url = ''
  status = 0
  open(method: string, url: string) {
    this.method = method
    this.url = url
  }
  setRequestHeader(name: string, value: string) {
    this.headers.set(name, value)
  }
  abort() {
    this.dispatchEvent(new Event('abort'))
  }
  send(body: Blob) {
    FakeStorage.last = this
    this.upload.dispatchEvent(
      new ProgressEvent('progress', { lengthComputable: true, loaded: body.size / 2, total: body.size }),
    )
    void FakeStorage.gate.then(() => {
      this.status = FakeStorage.status
      this.dispatchEvent(new Event('load'))
      return null
    })
  }
}

export const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
