import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { PedidoDialogo } from '../lib/dialogo'

/** Mostra as perguntas de lib/dialogo como uma folha que sobe do rodapé (no celular) ou um cartão (no computador). */
export default function Dialogos() {
  const [fila, setFila] = useState<PedidoDialogo[]>([])
  const [texto, setTexto] = useState('')
  const primeiro = useRef<HTMLElement | null>(null)
  const atual = fila[0]

  useEffect(() => {
    function receber(e: Event) {
      setFila((f) => [...f, (e as CustomEvent<PedidoDialogo>).detail])
    }
    window.addEventListener('axe-dialogo', receber)
    return () => window.removeEventListener('axe-dialogo', receber)
  }, [])

  useEffect(() => {
    if (!atual) return
    setTexto('')
    const foco = setTimeout(() => primeiro.current?.focus(), 30)
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && fechar(atual.tipo === 'copiar' ? true : atual.tipo === 'texto' ? null : false)
    window.addEventListener('keydown', tecla)
    return () => {
      clearTimeout(foco)
      window.removeEventListener('keydown', tecla)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atual])

  if (!atual) return null

  function fechar(resposta: boolean | string | null) {
    atual.responder(resposta)
    setFila((f) => f.slice(1))
  }

  function enviar(e: FormEvent) {
    e.preventDefault()
    if (atual.tipo === 'texto') {
      if (!texto.trim()) return
      fechar(texto)
    } else fechar(true)
  }

  const cancelar = () => fechar(atual.tipo === 'texto' ? null : false)

  return (
    <div className="dialogo-fundo" onClick={(e) => e.target === e.currentTarget && atual.tipo !== 'copiar' && cancelar()}>
      <form className="dialogo" role="dialog" aria-modal="true" aria-labelledby="dialogo-titulo" onSubmit={enviar}>
        <h2 id="dialogo-titulo">{atual.titulo}</h2>
        {atual.texto && <p className="sutil">{atual.texto}</p>}

        {atual.tipo === 'texto' && (
          <label>
            {atual.campo ?? 'Escreva aqui'}
            <textarea ref={(el) => { primeiro.current = el }} value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} maxLength={300} />
          </label>
        )}
        {atual.tipo === 'copiar' && (
          <textarea ref={(el) => { primeiro.current = el }} readOnly value={atual.campo} rows={5}
            onFocus={(e) => e.currentTarget.select()} aria-label="Texto para copiar" />
        )}

        <div className="dialogo-botoes">
          {atual.tipo !== 'copiar' && <button type="button" className="botao" onClick={cancelar}>Cancelar</button>}
          <button className={`primario ${atual.perigo ? 'primario-perigo' : ''}`} disabled={atual.tipo === 'texto' && !texto.trim()}
            ref={(el) => { if (atual.tipo === 'confirmar') primeiro.current = el }}>
            {atual.botao ?? (atual.tipo === 'texto' ? 'Enviar' : 'Confirmar')}
          </button>
        </div>
      </form>
    </div>
  )
}
