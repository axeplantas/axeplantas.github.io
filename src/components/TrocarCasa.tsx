import { House } from 'lucide-react'
import { useState } from 'react'
import { avisar } from '../lib/avisos'
import { useSessao } from '../lib/sessao'
import { mensagemDeErro } from '../lib/supabase'
import { ROTULO_PAPEL } from '../lib/tipos'

/** Mostra a casa ativa e, para quem é de mais de uma casa, permite trocar. */
export default function TrocarCasa() {
  const { casas, casaAtiva, trocarCasa } = useSessao()
  const [trocando, setTrocando] = useState(false)

  if (casas.length === 0) return null

  async function trocar(terreiroId: string) {
    if (terreiroId === casaAtiva?.terreiro_id) return
    setTrocando(true)
    try {
      await trocarCasa(terreiroId)
      const nome = casas.find((c) => c.terreiro_id === terreiroId)?.terreiros?.nome
      avisar(`Agora você está em: ${nome}`)
    } catch (erro) {
      avisar(mensagemDeErro(erro), 'erro')
    } finally {
      setTrocando(false)
    }
  }

  if (casas.length === 1) {
    return (
      <div className="casa-atual">
        <span className="tile" aria-hidden><House size={20} aria-hidden /></span>
        <span>
          <strong>{casaAtiva?.terreiros?.nome}</strong>
          <span className="sutil"> · {casaAtiva && ROTULO_PAPEL[casaAtiva.papel]}{casaAtiva?.contador ? ' e contador(a)' : ''}</span>
        </span>
      </div>
    )
  }

  return (
    <label className="casa-atual trocar">
      <span className="tile" aria-hidden><House size={20} aria-hidden /></span>
      <span className="cresce">
        <span className="sutil">Você está em ({casas.length} casas)</span>
        <select value={casaAtiva?.terreiro_id ?? ''} disabled={trocando} onChange={(e) => trocar(e.target.value)}
          aria-label="Trocar de casa">
          {casas.map((c) => (
            <option key={c.terreiro_id} value={c.terreiro_id}>
              {c.terreiros?.nome} — {c.aprovado ? ROTULO_PAPEL[c.papel] : 'aguardando aprovação'}
            </option>
          ))}
        </select>
      </span>
    </label>
  )
}
