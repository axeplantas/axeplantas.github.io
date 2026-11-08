import { X } from 'lucide-react'
import { useEffect, useState } from 'react'

interface EventoInstalar extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const CHAVE = 'axe-plantas:instalar-dispensado-ate'
const UMA_SEMANA = 7 * 24 * 60 * 60 * 1000

function jaInstalado(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function ehIphone(): boolean {
  const ua = navigator.userAgent
  return /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)
}

function dispensado(): boolean {
  try {
    return Number(localStorage.getItem(CHAVE) ?? 0) > Date.now()
  } catch {
    return false
  }
}

/** Convida a pessoa a instalar o app na tela inicial (Android e iPhone). */
export default function InstalarApp() {
  const [eventoAndroid, setEventoAndroid] = useState<EventoInstalar | null>(null)
  const [visivel, setVisivel] = useState(() => !jaInstalado() && !dispensado() && ehIphone())

  useEffect(() => {
    function aoPoderInstalar(e: Event) {
      e.preventDefault()
      setEventoAndroid(e as EventoInstalar)
      if (!dispensado()) setVisivel(true)
    }
    function aoInstalar() {
      setVisivel(false)
    }
    window.addEventListener('beforeinstallprompt', aoPoderInstalar)
    window.addEventListener('appinstalled', aoInstalar)
    return () => {
      window.removeEventListener('beforeinstallprompt', aoPoderInstalar)
      window.removeEventListener('appinstalled', aoInstalar)
    }
  }, [])

  function fechar() {
    try {
      localStorage.setItem(CHAVE, String(Date.now() + UMA_SEMANA))
    } catch {
      // Sem armazenamento: o aviso volta na próxima visita.
    }
    setVisivel(false)
  }

  async function instalarAndroid() {
    if (!eventoAndroid) return
    await eventoAndroid.prompt()
    const { outcome } = await eventoAndroid.userChoice
    if (outcome === 'accepted') setVisivel(false)
    setEventoAndroid(null)
  }

  if (!visivel) return null

  return (
    <div className="instalar" role="dialog" aria-label="Instalar o aplicativo">
      <img src="logo.svg" alt="" />
      <div className="instalar-texto">
        <strong>Instale o Axé Plantas</strong>
        {eventoAndroid ? (
          <span>Fica na tela inicial, como um app.</span>
        ) : (
          <span>
            Toque em <b>Compartilhar</b> <span aria-hidden>(□↑)</span> e depois em <b>Adicionar à Tela de Início</b>.
          </span>
        )}
      </div>
      {eventoAndroid && (
        <button className="primario" onClick={instalarAndroid}>Instalar</button>
      )}
      <button className="instalar-fechar" onClick={fechar} aria-label="Fechar"><X size={20} aria-hidden /></button>
    </div>
  )
}
