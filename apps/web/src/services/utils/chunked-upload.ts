/**
 * Chunked File Upload Utility
 *
 * Handles large file uploads by splitting them into chunks and uploading them sequentially.
 * Bypasses nginx request size limits and provides progress tracking.
 */

import { apiFetch } from '@/lib/api-client'
import { clientApiError, parseApiError } from '@/lib/api/assertSuccess'

// Default chunk size: 2MB (small enough to bypass most nginx configs)
const DEFAULT_CHUNK_SIZE = 2 * 1024 * 1024
const CHUNKED_UPLOAD_REQUEST_TIMEOUT_MS = 5 * 60_000

export interface ChunkedUploadOptions {
  file: File
  directory: string
  typeOfDir: 'platform' | 'users'
  uuid?: string
  filename: string
  chunkSize?: number
  onProgress?: (progress: {
    uploadedBytes: number
    totalBytes: number
    percentage: number
    currentChunk: number
    totalChunks: number
  }) => void
  onChunkComplete?: (chunkIndex: number, totalChunks: number) => void
  onError?: (error: Error) => void
}

export interface ChunkedUploadResult {
  success: boolean
  filename: string
  fileSize: number
  message?: string
}

/**
 * Split a file into chunks
 */
function splitFileIntoChunks(file: File, chunkSize: number): Blob[] {
  const chunks: Blob[] = []
  let start = 0

  while (start < file.size) {
    const end = Math.min(start + chunkSize, file.size)
    chunks.push(file.slice(start, end))
    start = end
  }

  return chunks
}

/**
 * Upload a file using chunked upload
 */
export async function uploadFileChunked(options: ChunkedUploadOptions): Promise<ChunkedUploadResult> {
  const {
    file,
    directory,
    typeOfDir,
    uuid,
    filename,
    chunkSize = DEFAULT_CHUNK_SIZE,
    onProgress,
    onChunkComplete,
    onError,
  } = options

  try {
    if (typeOfDir === 'users' && !uuid) {
      throw clientApiError('INVALID_CLIENT_REQUEST', 'uuid is required when typeOfDir is "users"', {
        path: 'uploads/initiate',
      })
    }

    // Split file into chunks
    const chunks = splitFileIntoChunks(file, chunkSize)
    const totalChunks = chunks.length
    let uploadedBytes = 0

    console.log(`Uploading file in ${totalChunks} chunks...`)

    // Step 1: Initiate chunked upload
    const initiateFormData = new FormData()
    initiateFormData.append('directory', directory)
    initiateFormData.append('type_of_dir', typeOfDir)
    initiateFormData.append('uuid', uuid ?? '')
    initiateFormData.append('filename', filename)
    initiateFormData.append('total_chunks', totalChunks.toString())
    initiateFormData.append('file_size', file.size.toString())

    const initiateResponse = await apiFetch('uploads/initiate', {
      method: 'POST',
      body: initiateFormData,
      timeoutMs: CHUNKED_UPLOAD_REQUEST_TIMEOUT_MS,
    })

    if (!initiateResponse.ok) {
      throw await parseApiError(initiateResponse, 'uploads/initiate')
    }

    const { upload_uuid: upload_id } = await initiateResponse.json()
    console.log(`Upload initiated with ID: ${upload_id}`)

    // Step 2: Upload chunks sequentially
    for (let i = 0; i < chunks.length; i += 1) {
      const chunk = chunks[i]
      if (!chunk) {
        throw clientApiError('CLIENT_INVARIANT_VIOLATION', `Chunk ${i} is undefined`, {
          path: 'uploads/chunk',
        })
      }

      const chunkFormData = new FormData()
      chunkFormData.append('upload_id', upload_id)
      chunkFormData.append('chunk_index', i.toString())
      chunkFormData.append('chunk', chunk, `chunk_${i}`)

      const chunkResponse = await apiFetch('uploads/chunk', {
        method: 'POST',
        body: chunkFormData,
        timeoutMs: CHUNKED_UPLOAD_REQUEST_TIMEOUT_MS,
      })

      if (!chunkResponse.ok) {
        throw await parseApiError(chunkResponse, 'uploads/chunk')
      }

      uploadedBytes += chunk.size

      if (onProgress) {
        onProgress({
          uploadedBytes,
          totalBytes: file.size,
          percentage: Math.round((uploadedBytes / file.size) * 100),
          currentChunk: i + 1,
          totalChunks,
        })
      }

      if (onChunkComplete) {
        onChunkComplete(i, totalChunks)
      }

      console.log(`Uploaded chunk ${i + 1}/${totalChunks}`)
    }

    // Step 3: Complete the upload
    const completeFormData = new FormData()
    completeFormData.append('upload_id', upload_id)

    const completeResponse = await apiFetch('uploads/complete', {
      method: 'POST',
      body: completeFormData,
      timeoutMs: CHUNKED_UPLOAD_REQUEST_TIMEOUT_MS,
    })

    if (!completeResponse.ok) {
      throw await parseApiError(completeResponse, 'uploads/complete')
    }

    const result = await completeResponse.json()
    console.log('Upload completed successfully')

    return {
      success: true,
      filename: result.filename,
      fileSize: result.file_size,
      message: result.message,
    }
  } catch (error) {
    if (onError) {
      onError(error as Error)
    }
    throw error
  }
}

/**
 * Determine if a file should use chunked upload
 * Files larger than 5MB should use chunked upload to avoid nginx 413 errors
 */
export function shouldUseChunkedUpload(fileSize: number): boolean {
  const THRESHOLD = 5 * 1024 * 1024 // 5MB
  return fileSize > THRESHOLD
}
