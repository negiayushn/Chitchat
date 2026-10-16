import { useEffect, useState } from 'react'
import { Download, FileText } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { BUCKET, formatSize } from '../../lib/files'
import type { Attachment } from './useMessages'

// Private bucket: files are shown through short-lived signed URLs, cached until shortly before expiry.
const cache = new Map<string, { url: string; exp: number }>()
async function signed(path: string, download?: string) {
  const key = `${path}|${download ?? ''}`; const hit = cache.get(key)
  if (hit && hit.exp > Date.now()) return hit.url
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600, download ? { download } : undefined)
  if (error || !data) throw error ?? new Error('no url')
  cache.set(key, { url: data.signedUrl, exp: Date.now() + 3300_000 }); return data.signedUrl
}

export function AttachmentView({ att }: { att: Attachment }) {
  const [url, setUrl] = useState<string | null>(null); const [failed, setFailed] = useState(false)
  const isDoc = !att.mime_type.startsWith('image/') && !att.mime_type.startsWith('video/')
  useEffect(() => {
    let live = true
    signed(att.storage_path, isDoc ? att.file_name : undefined).then(u => live && setUrl(u)).catch(() => live && setFailed(true))
    return () => { live = false }
  }, [att.storage_path, att.file_name, isDoc])

  if (failed) return <div className="muted" style={{ fontSize: 13 }}>File unavailable</div>
  if (!url) return <div className="muted" style={{ fontSize: 13 }}>Loading file…</div>
  if (att.mime_type.startsWith('image/'))
    return <a href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={att.file_name} loading="lazy" style={{ maxWidth: '100%', maxHeight: 320, borderRadius: 12, display: 'block' }} /></a>
  if (att.mime_type.startsWith('video/'))
    return <video src={url} controls preload="metadata" style={{ maxWidth: '100%', maxHeight: 320, borderRadius: 12 }} />
  return <a href={url} rel="noopener noreferrer" style={{ display: 'flex', gap: 10, alignItems: 'center', color: 'inherit', textDecoration: 'none' }}>
    <FileText size={22} /><div style={{ minWidth: 0 }}><div style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{att.file_name}</div>
      <div style={{ fontSize: 12, opacity: .75 }}>{formatSize(att.size_bytes)}</div></div><Download size={16} /></a>
}
