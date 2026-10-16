import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

type Theme = 'dark' | 'light'
const read = (): Theme => {
  try { const t = localStorage.getItem('nova-theme'); if (t === 'dark' || t === 'light') return t } catch { /* storage unavailable */ }
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(read)
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem('nova-theme', theme) } catch { /* ignore */ }
  }, [theme])
  return <button className="btn ghost" style={{ padding: 8, marginRight: 6 }}
    aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
    onClick={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}>
    {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</button>
}
