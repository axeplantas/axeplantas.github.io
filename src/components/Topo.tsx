import { ChevronLeft } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

/** Barra de topo de cada tela: voltar, título e (opcional) uma ação à direita. */
export default function Topo({ titulo, voltar, acao, subtitulo }: {
  titulo: ReactNode
  /** Para onde o botão voltar leva; -1 = tela anterior. Sem valor = sem botão. */
  voltar?: string | -1
  acao?: ReactNode
  subtitulo?: ReactNode
}) {
  const navegar = useNavigate()
  const [rolado, setRolado] = useState(false)

  useEffect(() => {
    const aoRolar = () => setRolado(window.scrollY > 4)
    aoRolar()
    window.addEventListener('scroll', aoRolar, { passive: true })
    return () => window.removeEventListener('scroll', aoRolar)
  }, [])

  return (
    <header className={`topo ${rolado ? 'rolado' : ''}`}>
      <div className="topo-barra">
        {voltar !== undefined && (
          <button type="button" className="topo-voltar" aria-label="Voltar"
            onClick={() => (voltar === -1 ? navegar(-1) : navegar(voltar))}>
            <ChevronLeft size={26} />
          </button>
        )}
        <h1>{titulo}</h1>
        {acao && <div className="topo-acao">{acao}</div>}
      </div>
      {subtitulo && <p className="topo-subtitulo">{subtitulo}</p>}
    </header>
  )
}
