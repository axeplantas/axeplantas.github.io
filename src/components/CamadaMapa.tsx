import { Map as IconeMapa, Satellite } from 'lucide-react'
import { useState } from 'react'
import { TileLayer } from 'react-leaflet'

export type TipoCamada = 'ruas' | 'satelite'

/** Ruas ou satélite, lembrando a última escolha neste celular (cada tela com a sua). */
export function useCamada(tela: string, padrao: TipoCamada = 'ruas'): [TipoCamada, () => void] {
  const CHAVE = `axe-plantas:camada-${tela}`
  const [tipo, setTipo] = useState<TipoCamada>(() => {
    try {
      const salvo = localStorage.getItem(CHAVE)
      return salvo === 'ruas' || salvo === 'satelite' ? salvo : padrao
    } catch {
      return padrao
    }
  })
  function alternar() {
    const novo = tipo === 'ruas' ? 'satelite' : 'ruas'
    setTipo(novo)
    try {
      localStorage.setItem(CHAVE, novo)
    } catch {
      // Sem armazenamento: só não lembra a escolha.
    }
  }
  return [tipo, alternar]
}

/** Fundo do mapa. A foto de satélite ajuda a pôr a mira exatamente na árvore ou na moita. */
export function Camada({ tipo }: { tipo: TipoCamada }) {
  return tipo === 'satelite' ? (
    <TileLayer
      key="satelite"
      attribution="Imagens &copy; Esri, Maxar, Earthstar Geographics"
      url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
      maxNativeZoom={18}
      maxZoom={20}
    />
  ) : (
    <TileLayer
      key="ruas"
      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      maxNativeZoom={19}
      maxZoom={20}
    />
  )
}

export function BotaoCamada({ tipo, aoAlternar, className = '' }: { tipo: TipoCamada; aoAlternar: () => void; className?: string }) {
  return (
    <button type="button" className={`botao-camada ${className}`} onClick={aoAlternar}
      aria-label={tipo === 'ruas' ? 'Ver foto de satélite' : 'Ver mapa de ruas'}>
      {tipo === 'ruas' ? <><Satellite size={16} aria-hidden /> Satélite</> : <><IconeMapa size={16} aria-hidden /> Ruas</>}
    </button>
  )
}
