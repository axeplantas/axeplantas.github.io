import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { temPermissao, useSessao } from '../lib/sessao'
import { mensagemDeErro, supabase } from '../lib/supabase'
import { idade, type ResumoFicha } from '../lib/tipos'

type Filtro = 'todos' | 'alergia' | 'remedio' | 'sem'

/** Zelador e autorizados: as fichas de todos os filhos da casa. */
export default function Fichas() {
  const { casaAtiva } = useSessao()
  const navegar = useNavigate()
  const terreiro = casaAtiva?.terreiro_id
  const [fichas, setFichas] = useState<ResumoFicha[] | null>(null)
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (!terreiro || !temPermissao(casaAtiva, 'fichas')) return
    supabase.rpc('listar_fichas', { p_terreiro: terreiro }).then(({ data, error }) => {
      if (error) setErro(mensagemDeErro(error))
      setFichas((data ?? []) as ResumoFicha[])
    })
  }, [terreiro, casaAtiva])

  const visiveis = useMemo(() => (fichas ?? []).filter((f) => {
    if (busca && !f.apelido.toLowerCase().includes(busca.toLowerCase())) return false
    if (filtro === 'alergia') return Boolean(f.alergias)
    if (filtro === 'remedio') return f.total_remedios > 0
    if (filtro === 'sem') return !f.preenchida
    return true
  }), [fichas, busca, filtro])

  if (!temPermissao(casaAtiva, 'fichas')) {
    return <div className="pagina"><p>Somente o zelador e quem ele autorizar veem as fichas.</p></div>
  }

  const lista = fichas ?? []
  const preenchidas = lista.filter((f) => f.preenchida).length

  return (
    <div className="pagina">
      <button className="link" onClick={() => navegar('/casa/gestao')}>← Gestão da casa</button>
      <h1>Fichas dos filhos</h1>
      <p className="aviso-pequeno">🔒 Dados de saúde e religião: só você e quem você autorizar veem. Cada ficha aberta fica registrada.</p>

      {fichas && (
        <div className="indicadores">
          <button className={`indicador ${filtro === 'sem' ? 'escolhido' : ''}`} onClick={() => setFiltro(filtro === 'sem' ? 'todos' : 'sem')}>
            <span className="indicador-numero">{preenchidas}/{lista.length}</span>
            <span>fichas preenchidas</span>
          </button>
          <button className={`indicador ${lista.some((f) => f.alergias) ? 'alerta' : ''} ${filtro === 'alergia' ? 'escolhido' : ''}`}
            onClick={() => setFiltro(filtro === 'alergia' ? 'todos' : 'alergia')}>
            <span className="indicador-numero">{lista.filter((f) => f.alergias).length}</span>
            <span>com alergia</span>
          </button>
          <button className={`indicador ${filtro === 'remedio' ? 'escolhido' : ''}`} onClick={() => setFiltro(filtro === 'remedio' ? 'todos' : 'remedio')}>
            <span className="indicador-numero">{lista.filter((f) => f.total_remedios > 0).length}</span>
            <span>tomam remédio</span>
          </button>
          <Link to="/casa/relatorios#fichas" className="indicador">
            <span className="indicador-numero pequeno">📊</span>
            <span>orixás, aniversários e mais</span>
          </Link>
        </div>
      )}

      <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Procurar filho pelo nome" />
      {filtro !== 'todos' && (
        <button className="filtro-ativo" onClick={() => setFiltro('todos')}>
          {filtro === 'alergia' ? 'Só quem tem alergia' : filtro === 'remedio' ? 'Só quem toma remédio' : 'Só quem não preencheu'} ✕
        </button>
      )}
      {erro && <p className="erro">{erro}</p>}
      {!fichas && <p className="sutil">Carregando…</p>}

      <ul className="lista">
        {visiveis.map((f) => (
          <li key={f.perfil_id}>
            <Link to={`/casa/fichas/${f.perfil_id}`} className="item">
              <div className="cresce">
                <strong>{f.apelido}</strong>
                <div className="sutil">
                  {f.preenchida
                    ? [f.orixa_cabeca, f.nome_de_santo, f.data_nascimento && `${idade(f.data_nascimento)} anos`].filter(Boolean).join(' · ') || 'Ficha preenchida'
                    : 'Ainda não preencheu'}
                </div>
                <div className="etiquetas">
                  {f.alergias && <span className="etiqueta situacao-recusado">⚠️ Alergia: {f.alergias.slice(0, 40)}</span>}
                  {f.remedios_continuos > 0 && <span className="etiqueta situacao-informado">💊 {f.remedios_continuos} de uso contínuo</span>}
                  {f.condicoes_saude && <span className="etiqueta situacao-aberto">🩺 {f.condicoes_saude.slice(0, 40)}</span>}
                </div>
              </div>
              <span aria-hidden>›</span>
            </Link>
          </li>
        ))}
      </ul>
      {fichas && visiveis.length === 0 && <p className="sutil">Ninguém aqui.</p>}
      {fichas && lista.length > preenchidas && (
        <p className="sutil centro">Peça no grupo da casa: cada filho preenche a própria ficha em Casa › Minha ficha.</p>
      )}
    </div>
  )
}
