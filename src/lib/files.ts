// Client-side checks are for UX only; the database and storage bucket enforce the same rules (migration 0004).
export const MAX_BYTES = 25 * 1024 * 1024
export const ALLOWED_MIME = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'application/pdf', 'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]
export const ACCEPT = ALLOWED_MIME.join(',')
export const BUCKET = 'attachments'

export const kindOf = (mime: string): 'image' | 'video' | 'document' =>
  mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : 'document'
export const formatSize = (n: number) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`
export const safeName = (n: string) => n.replace(/[^A-Za-z0-9._-]/g, '_').slice(-80)
export const validateFile = (f: File): string | null =>
  !ALLOWED_MIME.includes(f.type) ? `“${f.name}” isn’t a supported file type.`
  : f.size === 0 ? `“${f.name}” is empty.` : f.size > MAX_BYTES ? `“${f.name}” is larger than 25 MB.` : null
