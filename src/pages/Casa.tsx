import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import TrocarCasa from '../components/TrocarCasa'
import { diaMes, hojeIso } from '../lib/casa'
import { feriadosNacionais } from '../lib/feriados'
import { ehEquipe, ehGestorFinanceiro, ehValidador, ehZelador, temPermissao, useSessao } from '../lib/sessao'
import { supabase } from '../lib/supabase'
import { formatarDataCurta, type Escala, type Evento, type PessoaEscala } from '../lib/tipos'

/** Aba "Casa": tudo o que é da casa ativa, num só lugar (só o que o zelador deixou ligado). */
export default function Casa() {
  const { perfil, casaAtiva, modulos } = useSessao()
  const terreiro = casaAtiva?.terreiro_id
  const [proximo, setProximo] = useState<Evento | null>(null)
  const [paraConferir, setParaConferir] = useState(0)
  const [verMateriais, setVerMateriais] = useState(false)
  const [pendencias, setPendencias] = useState(0)
  const [escala, setEscala] = useState<{ responder: number; proxima: Escala | null }>({ responder: 0, proxima: null })
  const [fichaVazia, setFichaVazia] = useState(false)

  useEffect(() => {
    if (!terreiro) return
    const hoje = hojeIso()
    if (modulos.calendario) {
      supabase.from('eventos').select('*').eq('terreiro_id', terreiro).gte('data', hoje).order('data').limit(1)
        .then(({ data }) => setProximo(((data ?? []) as Evento[])[0] ?? null))
    }
    if (modulos.materiais) {
      supabase.rpc('pode_ver_materiais', { p_terreiro: terreiro }).then(({ data }) => setVerMateriais(data === true))
    }
    if (modulos.financeiro && ehGestorFinanceiro(casaAtiva)) {
      supabase.from('pagamentos').select('id', { count: 'exact', head: true }).eq('terreiro_id', terreiro).eq('status', 'informado')
        .then(({ count }) => setParaConferir(count ?? 0))
    }
    if (modulos.escalas && perfil) {
      Promise.all([
        supabase.from('escalas').select('*').eq('terreiro_id', terreiro).gte('data', hoje).order('data'),
        supabase.from('escala_pessoas').select('*').eq('terreiro_id', terreiro).eq('perfil_id', perfil.id),
      ]).then(([e, p]) => {
        const escalas = (e.data ?? []) as Escala[]
        const minhas = (p.data ?? []) as PessoaEscala[]
        const responder = minhas.filter((x) => x.status === 'convocado' && escalas.some((s) => s.id === x.escala_id)).length
        const proxima = escalas.find((s) => minhas.some((x) => x.escala_id === s.id && x.status === 'confirmado')) ?? null
        setEscala({ responder, proxima })
      })
    }
    if (modulos.fichas && perfil) {
      supabase.rpc('abrir_ficha', { p_perfil: perfil.id, p_terreiro: terreiro }).then(({ data, error }) => setFichaVazia(!error && !data))
    }
    if (ehValidador(perfil)) {
      Promise.all([
        supabase.from('folhas').select('id', { count: 'exact', head: true }).eq('status', 'pendente').eq('terreiro_id', terreiro),
        supabase.from('pontos').select('id', { count: 'exact', head: true }).eq('status', 'pendente').eq('terreiro_id', terreiro).neq('visibilidade', 'privado'),
        ehZelador(casaAtiva)
          ? supabase.from('membros').select('perfil_id', { count: 'exact', head: true }).eq('terreiro_id', terreiro).eq('aprovado', false)
          : Promise.resolve({ count: 0 }),
      ]).then((r) => setPendencias(r.reduce((s, x) => s + (x.count ?? 0), 0)))
    }
  }, [terreiro, casaAtiva, perfil, modulos])

  const hoje = hojeIso()
  const proximoFeriado = feriadosNacionais(new Date().getFullYear())
    .concat(feriadosNacionais(new Date().getFullYear() + 1))
    .find((f) => f.data >= hoje)

  return (
    <div className="pagina">
      <h1>Casa</h1>
      <TrocarCasa />

      {ehZelador(casaAtiva) && (
        <Link to="/casa/gestao" className="cartao-gestao">
          <span className="cartao-casa-icone">⚙️</span>
          <span className="cresce">
            <strong>Gestão da casa</strong>
            <span className="sutil">Filhos, relatórios, registro de atividades e configurações</span>
          </span>
          {pendencias + paraConferir > 0 && <b className="selo-cartao">{pendencias + paraConferir}</b>}
          <span aria-hidden>›</span>
        </Link>
      )}

      <div className="grade-casa">
        {modulos.calendario && (
          <Link to="/casa/calendario" className="cartao-casa">
            <span className="cartao-casa-icone">📅</span>
            <strong>Calendário</strong>
            <span className="sutil">
              {proximo
                ? `${formatarDataCurta(proximo.data).slice(0, 5)} · ${proximo.titulo}`
                : proximoFeriado
                  ? `Feriado: ${formatarDataCurta(proximoFeriado.data).slice(0, 5)} · ${proximoFeriado.nome}`
                  : 'Festas, giras e obrigações'}
            </span>
          </Link>
        )}

        {modulos.escalas && (
          <Link to="/casa/escalas" className="cartao-casa">
            <span className="cartao-casa-icone">🧹</span>
            <strong>Escalas</strong>
            <span className="sutil">
              {escala.responder > 0
                ? `${escala.responder} esperando sua resposta`
                : escala.proxima ? `Você: ${diaMes(escala.proxima.data)} · ${escala.proxima.titulo}` : 'Limpeza, cozinha, portão…'}
            </span>
            {escala.responder > 0 && <b className="selo-cartao">{escala.responder}</b>}
          </Link>
        )}

        {modulos.financeiro && (
          <Link to="/casa/financeiro" className="cartao-casa">
            <span className="cartao-casa-icone">💰</span>
            <strong>Financeiro</strong>
            <span className="sutil">
              {ehGestorFinanceiro(casaAtiva) && paraConferir > 0
                ? `${paraConferir} comprovante(s) para conferir`
                : ehGestorFinanceiro(casaAtiva) ? 'Mensalidades, contribuições e comprovantes' : 'Minhas mensalidades e contribuições'}
            </span>
            {paraConferir > 0 && ehGestorFinanceiro(casaAtiva) && <b className="selo-cartao">{paraConferir}</b>}
          </Link>
        )}

        {modulos.funcoes && (
          <Link to="/obrigacoes" className="cartao-casa">
            <span className="cartao-casa-icone">📋</span>
            <strong>Funções e obrigações</strong>
            <span className="sutil">O que é preciso e quem leva</span>
          </Link>
        )}

        {modulos.fichas && (
          <Link to="/casa/ficha" className="cartao-casa">
            <span className="cartao-casa-icone">🩺</span>
            <strong>Minha ficha</strong>
            <span className="sutil">{fichaVazia ? 'Preencha: alergias, remédios, orixás' : 'Saúde, orixás e guias'}</span>
            {fichaVazia && <b className="selo-cartao">!</b>}
          </Link>
        )}

        {modulos.senhas && temPermissao(casaAtiva, 'senhas') && (
          <Link to="/casa/senhas" className="cartao-casa">
            <span className="cartao-casa-icone">🎟️</span>
            <strong>Senhas da gira</strong>
            <span className="sutil">Entregar e chamar na ordem</span>
          </Link>
        )}

        {modulos.fichas && !ehZelador(casaAtiva) && temPermissao(casaAtiva, 'fichas') && (
          <Link to="/casa/fichas" className="cartao-casa">
            <span className="cartao-casa-icone">🗂️</span>
            <strong>Fichas dos filhos</strong>
            <span className="sutil">Você tem acesso às fichas</span>
          </Link>
        )}

        {modulos.materiais && verMateriais && (
          <Link to="/casa/materiais" className="cartao-casa">
            <span className="cartao-casa-icone">📦</span>
            <strong>Materiais</strong>
            <span className="sutil">Estoque da casa</span>
          </Link>
        )}

        {modulos.mapa && ehValidador(perfil) && (
          <Link to="/painel" className="cartao-casa">
            <span className="cartao-casa-icone">✔️</span>
            <strong>Validar</strong>
            <span className="sutil">{pendencias > 0 ? `${pendencias} esperando você` : 'Tudo em dia'}</span>
            {pendencias > 0 && <b className="selo-cartao">{pendencias}</b>}
          </Link>
        )}
      </div>

      {!ehEquipe(casaAtiva) && (
        <p className="sutil centro">É filho(a) de outra casa também? Peça o link de convite ao zelador de lá: você entra com esta mesma conta.</p>
      )}
    </div>
  )
}
