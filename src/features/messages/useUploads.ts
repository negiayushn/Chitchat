import { useCallback, useState } from 'react'
import { supabase, supabaseUrl } from '../../lib/supabase'
import { BUCKET, kindOf, safeName, validateFile } from '../../lib/files'
import type { Attachment, Message } from './useMessages'

export type Upload = { id: string; file: File; progress: number; error: string | null }

async function putWithProgress(path: string, file: File, onProgress: (pct: number) => void) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('auth')
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${supabaseUrl}/storage/v1/object/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`)
    xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`)
    xhr.setRequestHeader('apikey', import.meta.env.VITE_SUPABASE_ANON_KEY as string)
    xhr.setRequestHeader('Content-Type', file.type)
    xhr.upload.onprogress = e => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100))
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`status ${xhr.status}`)))
    xhr.onerror = () => reject(new Error('network'))
    xhr.send(file)
  })
}

export function useUploads(conversationId: string, meId: string, onDone: (m: Message, a: Attachment) => void) {
  const [uploads, setUploads] = useState<Upload[]>([])
  const patch = (id: string, p: Partial<Upload>) => setUploads(prev => prev.map(u => (u.id === id ? { ...u, ...p } : u)))

  const run = useCallback(async (u: Upload) => {
    patch(u.id, { error: null, progress: 0 })
    const path = `${conversationId}/${crypto.randomUUID()}-${safeName(u.file.name)}`
    try { await putWithProgress(path, u.file, pct => patch(u.id, { progress: pct })) }
    catch { return patch(u.id, { error: 'Upload failed. Check your connection and retry.' }) }

    const { data: m, error: me } = await supabase.from('messages')
      .insert({ conversation_id: conversationId, sender_id: meId, kind: kindOf(u.file.type) }).select().single()
    if (me || !m) return patch(u.id, { error: 'Could not send the file. Retry?' })
    const { data: a, error: ae } = await supabase.from('attachments')
      .insert({ message_id: m.id, storage_path: path, file_name: u.file.name, mime_type: u.file.type, size_bytes: u.file.size }).select().single()
    if (ae || !a) { await supabase.rpc('delete_message_for_everyone', { mid: m.id }); return patch(u.id, { error: 'Could not attach the file. Retry?' }) }
    setUploads(prev => prev.filter(x => x.id !== u.id)); onDone(m as Message, a as Attachment)
  }, [conversationId, meId, onDone])

  const add = useCallback((files: FileList | null): string[] => {
    const errors: string[] = []
    for (const f of Array.from(files ?? [])) {
      const e = validateFile(f); if (e) { errors.push(e); continue }
      const u: Upload = { id: crypto.randomUUID(), file: f, progress: 0, error: null }
      setUploads(prev => [...prev, u]); void run(u)
    }
    return errors
  }, [run])

  return { uploads, add, retry: (u: Upload) => void run(u), dismiss: (id: string) => setUploads(prev => prev.filter(u => u.id !== id)) }
}
