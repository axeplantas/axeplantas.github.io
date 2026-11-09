import { Brush, Cake, ClipboardList, Download, Map as IconeMapa, Package, Stethoscope, Ticket, TriangleAlert, Users, Wallet } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { baixarPlanilha, buscarTudo, comUnidade, diaMes, hojeIso, nomeDe, useIrmaos } from '../lib/casa'
import { seAplica, valorDe } from '../lib/financeiro'
import { ehZelador, temPermissao, useSessao } from '../lib/sessao'
import { supabase } from '../lib/supabase'
import Topo from '../components/Topo'
import {
  formatarDataCurta, formatarReais, idade,
  type Cobranca, type Contribuicao, type Escala, type FinanceiroCasa, type Irmao, type ItemObrigacao,
  type MembroDaCasa, type Obrigacao, type Pagamento, type PessoaEscala, type ResumoFicha,
} from '../lib/tipos'

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

interface Dados {
  membros: MembroDaCasa[]
  config: FinanceiroCasa | null
  cobrancas: Cobranca[]
  pagamentos: Pagamento[]
  alvos: Set<string>
  escalas: Escala[]
  pessoasEscala: PessoaEscala[]
  obrigacoes: Obrigacao[]
  itens: ItemObrigacao[]
  contribuicoes: Contribuicao[]
  uso: { perfil_id: string; ultimo_acesso: string | null; acessos_30d: number; acoes_30d: number }[]
  pontos: { criado_por: string | null; status: string }[]
  materiais: { id: string; nome: string; quantidade: number; minimo: number | null; unidade: string }[]
  saidas: { material_id: string; quantidade: number }[]
  fichas: ResumoFicha[] | null
  senhas: { data: string; total: number; atendidas: number; ausentes: number }[] | null
}

/** Relatórios do zelador: dinheiro, participação, funções, uso do app, fichas, giras, mapa e materiais. */
export default function Relatorios() {
  const { casaAtiva, modulos } = useSessao()
  const local = useLocation()
  const terreiro = casaAtiva?.terreiro_id
  const irmaos = useIrmaos(terreiro)
  const [dados, setDados] = useState<Dados | null>(null)

  useEffect(() => {
    if (!terreiro || !ehZelador(casaAtiva)) return
    const umAno = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10)
    const noventaDias = new Date(Date.now() - 90 * 86400000).toISOString()
    ;(async () => {
      await supabase.rpc('garantir_mensalidades', { p_terreiro: terreiro })
      const [m, conf, cob, alv, esc, ob, uso, mat, fichas, senhas] = await Promise.all([
        supabase.from('membros').select('*, perfis(apelido)').eq('terreiro_id', terreiro),
        supabase.from('financeiro_casa').select('*').eq('terreiro_id', terreiro).maybeSingle(),
        supabase.from('cobrancas').select('*').eq('terreiro_id', terreiro).gte('vencimento', umAno),
        supabase.from('cobranca_alvos').select('cobranca_id, perfil_id'),
        supabase.from('escalas').select('*').eq('terreiro_id', terreiro).gte('data', umAno),
        supabase.from('obrigacoes').select('*').eq('terreiro_id', terreiro).eq('visibilidade', 'terreiro').gte('created_at', umAno),
        supabase.rpc('uso_do_app', { p_terreiro: terreiro }),
        supabase.from('materiais').select('id, nome, quantidade, minimo, unidade').eq('terreiro_id', terreiro),
        modulos.fichas ? supabase.rpc('listar_fichas', { p_terreiro: terreiro }) : Promise.resolve({ data: null }),
        modulos.senhas ? supabase.rpc('resumo_senhas', { p_terreiro: terreiro }) : Promise.resolve({ data: null }),
      ])
      const obrigacoes = (ob.data ?? []) as Obrigacao[]
      const idsOb = obrigacoes.map((o) => o.id)
      const [pagamentos, pessoasEscala, itens, contribuicoes, pontos, saidas] = await Promise.all([
        cob.data?.length
          ? buscarTudo<Pagamento>(() => supabase.from('pagamentos').select('*').eq('terreiro_id', terreiro).in('cobranca_id', (cob.data as Cobranca[]).map((c) => c.id)))
          : Promise.resolve([]),
        buscarTudo<PessoaEscala>(() => supabase.from('escala_pessoas').select('*').eq('terreiro_id', terreiro).gte('created_at', umAno)),
        idsOb.length ? buscarTudo<ItemObrigacao>(() => supabase.from('obrigacao_itens').select('*, folhas(nome_popular)').in('obrigacao_id', idsOb)) : Promise.resolve([]),
        buscarTudo<Contribuicao>(() => supabase.from('item_contribuicoes').select('*').eq('terreiro_id', terreiro).gte('created_at', umAno)),
        buscarTudo<{ criado_por: string | null; status: string; visibilidade: string }>(() =>
          supabase.from('pontos').select('criado_por, status, visibilidade').eq('terreiro_id', terreiro)),
        buscarTudo<{ material_id: string; quantidade: number }>(() =>
          supabase.from('movimentos_material').select('material_id, quantidade').eq('terreiro_id', terreiro).eq('tipo', 'saida').gte('created_at', noventaDias)),
      ])
      setDados({
        membros: (m.data ?? []) as unknown as MembroDaCasa[],
        config: (conf.data as FinanceiroCasa | null) ?? null,
        cobrancas: (cob.data ?? []) as Cobranca[],
        pagamentos,
        alvos: new Set(((alv.data ?? []) as { cobranca_id: string; perfil_id: string }[]).map((a) => `${a.cobranca_id}:${a.perfil_id}`)),
        escalas: (esc.data ?? []) as Escala[],
        pessoasEscala,
        obrigacoes,
        itens,
        contribuicoes,
        uso: (uso.data ?? []) as Dados['uso'],
        pontos: pontos.filter((p) => p.visibilidade !== 'privado'),
        materiais: (mat.data ?? []) as Dados['materiais'],
        saidas,
        fichas: (fichas.data as ResumoFicha[] | null) ?? null,
        senhas: (senhas.data as Dados['senhas']) ?? null,
      })
    })()
  }, [terreiro, casaAtiva, modulos.fichas, modulos.senhas])

  // Atalho vindo de outra tela (ex.: /casa/relatorios#fichas)
  useEffect(() => {
    if (dados && local.hash) document.getElementById(local.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' })
  }, [dados, local.hash])

  if (!ehZelador(casaAtiva)) return <div className="pagina"><p>Só o zelador vê os relatórios.</p></div>

  const secoes: [string, string, boolean][] = [
    ['financeiro', 'Financeiro', modulos.financeiro],
    ['escalas', 'Escalas', modulos.escalas],
    ['funcoes', 'Funções', modulos.funcoes],
    ['filhos', 'Filhos e uso', true],
    ['fichas', 'Fichas', modulos.fichas && temPermissao(casaAtiva, 'fichas')],
    ['senhas', 'Giras', modulos.senhas],
    ['mapa', 'Mapa', modulos.mapa],
    ['materiais', 'Materiais', modulos.materiais],
  ]

  return (
    <div className="pagina">
      <Topo titulo="Relatórios" voltar={'/casa/gestao'} />
      <p className="sutil">{casaAtiva?.terreiros?.nome} · números atualizados agora</p>

      <nav className="chips indice-relatorios">
        {secoes.filter(([, , ligado]) => ligado).map(([id, nome]) => (
          <a key={id} href={`#/casa/relatorios#${id}`} className="chip"
            onClick={(e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }) }}>{nome}</a>
        ))}
      </nav>

      {!dados && <p className="sutil">Calculando…</p>}
      {dados && (
        <>
          {modulos.financeiro && <RelFinanceiro d={dados} irmaos={irmaos} />}
          {modulos.escalas && <RelEscalas d={dados} irmaos={irmaos} />}
          {modulos.funcoes && <RelFuncoes d={dados} irmaos={irmaos} />}
          <RelFilhos d={dados} irmaos={irmaos} />
          {dados.fichas && <RelFichas fichas={dados.fichas} />}
          {dados.senhas && <RelSenhas senhas={dados.senhas} />}
          {modulos.mapa && <RelMapa d={dados} irmaos={irmaos} />}
          {modulos.materiais && <RelMateriais d={dados} />}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// Peças
// ---------------------------------------------------------------------

function Secao({ id, titulo, children, planilha }: { id: string; titulo: ReactNode; children: ReactNode; planilha?: () => void }) {
  return (
    <section id={id} className="relatorio">
      <div className="cabecalho">
        <h2>{titulo}</h2>
        {planilha && <button className="link" onClick={planilha}><Download size={16} aria-hidden /> Planilha</button>}
      </div>
      {children}
    </section>
  )
}

function Numero({ valor, rotulo, tom }: { valor: ReactNode; rotulo: string; tom?: 'bom' | 'alerta' | 'ruim' }) {
  return (
    <div className={`indicador ${tom === 'ruim' ? 'alerta' : ''} ${tom === 'bom' ? 'bom' : ''} ${tom === 'alerta' ? 'atencao-num' : ''}`}>
      <span className="indicador-numero">{valor}</span>
      <span>{rotulo}</span>
    </div>
  )
}

/** Barras horizontais de uma cor só, com o valor escrito ao lado. */
function Barras({ linhas, formato = (v) => String(v), maximo }: {
  linhas: { rotulo: string; valor: number; detalhe?: string }[]
  formato?: (v: number) => string
  maximo?: number
}) {
  const topo = maximo ?? Math.max(1, ...linhas.map((l) => l.valor))
  if (linhas.length === 0) return <p className="sutil">Ainda sem dados.</p>
  return (
    <ul className="barras" role="list">
      {linhas.map((l) => (
        <li key={l.rotulo} title={`${l.rotulo}: ${formato(l.valor)}${l.detalhe ? ` · ${l.detalhe}` : ''}`}>
          <span className="barras-rotulo">{l.rotulo}</span>
          <span className="barras-trilho"><span className="barras-valor" style={{ width: `${(l.valor / topo) * 100}%` }} /></span>
          <span className="barras-numero">{formato(l.valor)}</span>
          {l.detalhe && <span className="barras-detalhe">{l.detalhe}</span>}
        </li>
      ))}
    </ul>
  )
}

function Tabela({ cabecalho, linhas, vazio = 'Ninguém aqui.' }: { cabecalho: string[]; linhas: ReactNode[][]; vazio?: string }) {
  if (linhas.length === 0) return <p className="sutil">{vazio}</p>
  return (
    <div className="tabela-rolavel">
      <table className="tabela">
        <thead><tr>{cabecalho.map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>{linhas.map((l, i) => <tr key={i}>{l.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)

/** Quantos anos a pessoa completa no próximo aniversário (deste mês ou do seguinte). */
function fazAnos(nascimento: string, mesAtual: number): number {
  const [ano, mes] = nascimento.split('-').map(Number)
  return new Date().getFullYear() + (mes < mesAtual ? 1 : 0) - ano
}

// ---------------------------------------------------------------------
// 1. Financeiro
// ---------------------------------------------------------------------

function RelFinanceiro({ d, irmaos }: { d: Dados; irmaos: Irmao[] }) {
  const hoje = hojeIso()
  const aprovados = d.membros.filter((m) => m.aprovado)
  const pagamento = (c: string, p: string) => d.pagamentos.find((x) => x.cobranca_id === c && x.perfil_id === p)
  const mensalidades = d.cobrancas.filter((c) => c.tipo === 'mensalidade').sort((a, b) => (a.competencia ?? '').localeCompare(b.competencia ?? ''))
  const contribuicoes = d.cobrancas.filter((c) => c.tipo === 'contribuicao').sort((a, b) => b.vencimento.localeCompare(a.vencimento))

  const porFilho = aprovados.map((m) => {
    let devidas = 0, pagas = 0, noPrazo = 0, atrasadas = 0, aguardando = 0, aberto = 0
    for (const c of [...mensalidades, ...contribuicoes]) {
      if (!seAplica(c, m, d.config, d.alvos) || c.vencimento > hoje) continue
      const p = pagamento(c.id, m.perfil_id)
      if (p?.status === 'isento') continue
      devidas++
      if (p?.status === 'confirmado') {
        pagas++
        if ((p.informado_em ?? p.conferido_em ?? '').slice(0, 10) <= c.vencimento) noPrazo++
      } else if (p?.status === 'informado') aguardando++
      else if (c.vencimento < hoje) { atrasadas++; aberto += valorDe(c, m, d.config) }
    }
    const situacao = atrasadas > 0 ? 'atraso' : pagas > noPrazo ? 'as_vezes' : 'em_dia'
    return { m, devidas, pagas, noPrazo, atrasadas, aguardando, aberto, situacao }
  })
  const pagantes = porFilho.filter((f) => f.devidas > 0 || !f.m.isento)
  const emDia = pagantes.filter((f) => f.situacao === 'em_dia').length
  const asVezes = pagantes.filter((f) => f.situacao === 'as_vezes').length
  const emAtraso = pagantes.filter((f) => f.situacao === 'atraso')
  const totalAberto = emAtraso.reduce((s, f) => s + f.aberto, 0)

  // Últimos 6 meses: quanto da casa pagou cada mensalidade
  const meses = mensalidades.slice(-6).map((c) => {
    const aplica = aprovados.filter((m) => seAplica(c, m, d.config, d.alvos))
    const ok = aplica.filter((m) => ['confirmado', 'isento'].includes(pagamento(c.id, m.perfil_id)?.status ?? ''))
    const recebido = aplica.reduce((s, m) => {
      const p = pagamento(c.id, m.perfil_id)
      return s + (p?.status === 'confirmado' ? (p.valor ?? valorDe(c, m, d.config)) : 0)
    }, 0)
    const aguardando = aplica.filter((m) => pagamento(c.id, m.perfil_id)?.status === 'informado').length
    const [a, mes] = (c.competencia ?? c.vencimento).split('-')
    return { rotulo: `${MESES[Number(mes) - 1]}/${a.slice(2)}`, pagos: ok.length, total: aplica.length, recebido, aguardando,
      aVencer: c.vencimento >= hoje, vencimento: c.vencimento }
  })

  const competenciaAtual = `${hoje.slice(0, 7)}-01`
  const mesAtual = meses.find((_, i) => mensalidades.slice(-6)[i]?.competencia === competenciaAtual)

  const planilha = () => baixarPlanilha('financeiro-por-filho', [
    ['Filho', 'Situação', 'Cobranças vencidas', 'Pagas', 'Pagas no prazo', 'Aguardando conferência', 'Em atraso', 'Valor em atraso'],
    ...porFilho.map((f) => [nomeDe(irmaos, f.m.perfil_id), f.m.isento ? 'Isento' : f.situacao === 'atraso' ? 'Em atraso' : f.situacao === 'as_vezes' ? 'Paga, mas atrasa' : 'Em dia',
      f.devidas, f.pagas, f.noPrazo, f.aguardando, f.atrasadas, f.aberto.toFixed(2).replace('.', ',')]),
  ])

  return (
    <Secao id="financeiro" titulo={<><Wallet size={20} aria-hidden /> Financeiro</>} planilha={planilha}>
      <div className="indicadores">
        <Numero valor={mesAtual ? mesAtual.pagos : '—'} rotulo={mesAtual ? `pagaram ${mesAtual.rotulo}` : 'sem mensalidade este mês'} tom="bom" />
        <Numero valor={mesAtual ? mesAtual.total - mesAtual.pagos - mesAtual.aguardando : '—'}
          rotulo={mesAtual?.aVencer ? `ainda não pagaram (vence ${diaMes(mesAtual.vencimento)})` : 'não pagaram o mês'}
          tom={mesAtual && mesAtual.total - mesAtual.pagos - mesAtual.aguardando > 0 ? 'alerta' : undefined} />
        <Numero valor={emAtraso.length} rotulo="com pagamento em atraso" tom={emAtraso.length ? 'ruim' : undefined} />
        <Numero valor={<span className="pequeno">{formatarReais(totalAberto)}</span>} rotulo="em atraso no total" />
      </div>
      {emDia > 0 && (
        <p className="sutil">
          Ninguém com atraso: {emDia} filho(s){asVezes ? ` · ${asVezes} pagam, mas costumam atrasar` : ''}. “Ainda não pagaram”
          são os que têm mensalidade a vencer e não mandaram comprovante.
        </p>
      )}

      <h3>Mensalidade: quantos pagaram, mês a mês</h3>
      <Barras linhas={meses.map((m) => ({
        rotulo: m.rotulo, valor: pct(m.pagos, m.total),
        detalhe: `${m.pagos}/${m.total} · ${formatarReais(m.recebido)}${m.aguardando ? ` · ${m.aguardando} p/ conferir` : ''}${m.aVencer ? ` · vence ${diaMes(m.vencimento)}` : ''}`,
      }))}
        formato={(v) => `${v}%`} maximo={100} />

      <h3>Quem está em atraso</h3>
      <Tabela cabecalho={['Filho', 'Em atraso', 'Valor']}
        vazio="Ninguém em atraso."
        linhas={emAtraso.sort((a, b) => b.atrasadas - a.atrasadas).map((f) => [
          nomeDe(irmaos, f.m.perfil_id), `${f.atrasadas} cobrança(s)`, formatarReais(f.aberto),
        ])} />

      <h3>Pontualidade de cada filho (último ano)</h3>
      <Barras linhas={porFilho.filter((f) => f.pagas > 0).sort((a, b) => pct(b.noPrazo, b.pagas) - pct(a.noPrazo, a.pagas))
        .map((f) => ({ rotulo: nomeDe(irmaos, f.m.perfil_id), valor: pct(f.noPrazo, f.pagas), detalhe: `${f.noPrazo} de ${f.pagas} no prazo` }))}
        formato={(v) => `${v}%`} maximo={100} />

      {contribuicoes.length > 0 && (
        <>
          <h3>Contribuições</h3>
          <Tabela cabecalho={['Contribuição', 'Vence', 'Pagaram', 'Recebido']}
            linhas={contribuicoes.slice(0, 12).map((c) => {
              const aplica = aprovados.filter((m) => seAplica(c, m, d.config, d.alvos))
              const pagos = aplica.filter((m) => pagamento(c.id, m.perfil_id)?.status === 'confirmado')
              const conferir = aplica.filter((m) => pagamento(c.id, m.perfil_id)?.status === 'informado').length
              return [c.titulo, diaMes(c.vencimento), `${pagos.length}/${aplica.length}${conferir ? ` (+${conferir} p/ conferir)` : ''}`,
                formatarReais(pagos.length * (c.valor ?? 0))]
            })} />
        </>
      )}
    </Secao>
  )
}

// ---------------------------------------------------------------------
// 2. Escalas
// ---------------------------------------------------------------------

function RelEscalas({ d, irmaos }: { d: Dados; irmaos: Irmao[] }) {
  const hoje = hojeIso()
  const passadas = new Set(d.escalas.filter((e) => e.data < hoje).map((e) => e.id))
  const aprovados = d.membros.filter((m) => m.aprovado)
  const porFilho = aprovados.map((m) => {
    const minhas = d.pessoasEscala.filter((p) => p.perfil_id === m.perfil_id && passadas.has(p.escala_id))
    return {
      id: m.perfil_id,
      chamado: minhas.length,
      confirmou: minhas.filter((p) => p.status === 'confirmado').length,
      recusou: minhas.filter((p) => p.status === 'recusou').length,
      veio: minhas.filter((p) => p.presenca === 'presente').length,
      faltou: minhas.filter((p) => p.presenca === 'faltou').length,
      // confirmou, mas ninguém marcou a presença: conta como participação provável
      semMarca: minhas.filter((p) => p.status === 'confirmado' && !p.presenca).length,
    }
  })
  const nunca = porFilho.filter((f) => f.veio === 0 && f.semMarca === 0)
  const faltosos = porFilho.filter((f) => f.faltou > 0).sort((a, b) => b.faltou - a.faltou)

  const planilha = () => baixarPlanilha('participacao-em-escalas', [
    ['Filho', 'Convocado/entrou', 'Confirmou', 'Não pôde', 'Veio', 'Faltou'],
    ...porFilho.map((f) => [nomeDe(irmaos, f.id), f.chamado, f.confirmou, f.recusou, f.veio, f.faltou]),
  ])

  return (
    <Secao id="escalas" titulo={<><Brush size={20} aria-hidden /> Participação nas escalas</>} planilha={planilha}>
      <div className="indicadores">
        <Numero valor={passadas.size} rotulo="escalas no último ano" />
        <Numero valor={porFilho.filter((f) => f.veio + f.semMarca > 0).length} rotulo="filhos já participaram" tom="bom" />
        <Numero valor={nunca.length} rotulo="nunca participaram" tom={nunca.length ? 'alerta' : undefined} />
        <Numero valor={faltosos.reduce((s, f) => s + f.faltou, 0)} rotulo="faltas marcadas" tom={faltosos.length ? 'ruim' : undefined} />
      </div>
      <h3>Quem mais participa (presenças)</h3>
      <Barras linhas={porFilho.filter((f) => f.veio + f.semMarca > 0).sort((a, b) => (b.veio + b.semMarca) - (a.veio + a.semMarca)).slice(0, 15)
        .map((f) => ({
          rotulo: nomeDe(irmaos, f.id), valor: f.veio + f.semMarca,
          detalhe: [f.veio && `veio ${f.veio}x`, f.semMarca && `${f.semMarca} sem presença marcada`, f.faltou && `faltou ${f.faltou}x`].filter(Boolean).join(' · '),
        }))} />
      {porFilho.some((f) => f.semMarca > 0) && (
        <p className="sutil">Dica: marque “Veio” ou “Faltou” depois de cada escala (em Escalas › escala que já passou) para este relatório ficar exato.</p>
      )}
      {faltosos.length > 0 && (
        <>
          <h3>Faltas</h3>
          <Tabela cabecalho={['Filho', 'Faltou', 'Veio']} linhas={faltosos.map((f) => [nomeDe(irmaos, f.id), f.faltou, f.veio])} />
        </>
      )}
      <h3>Ainda não participaram de nenhuma escala</h3>
      <p>{nunca.length ? nunca.map((f) => nomeDe(irmaos, f.id)).join(', ') : <span className="sutil">Todos já participaram.</span>}</p>
    </Secao>
  )
}

// ---------------------------------------------------------------------
// 3. Funções e obrigações
// ---------------------------------------------------------------------

function RelFuncoes({ d, irmaos }: { d: Dados; irmaos: Irmao[] }) {
  const hoje = hojeIso()
  const obPorId = new Map(d.obrigacoes.map((o) => [o.id, o]))
  const aprovados = d.membros.filter((m) => m.aprovado)
  const porFilho = aprovados.map((m) => {
    const minhas = d.contribuicoes.filter((c) => c.perfil_id === m.perfil_id)
    const irmaosAjudados = new Set(minhas.map((c) => obPorId.get(c.obrigacao_id)?.filho_id).filter((f) => f && f !== m.perfil_id))
    return {
      id: m.perfil_id,
      itens: minhas.length,
      entregues: minhas.filter((c) => c.status === 'entregue').length,
      deIrmaos: minhas.filter((c) => { const f = obPorId.get(c.obrigacao_id)?.filho_id; return f && f !== m.perfil_id }).length,
      irmaosAjudados: irmaosAjudados.size,
      funcoes: new Set(minhas.map((c) => c.obrigacao_id)).size,
      seOfereceu: minhas.filter((c) => !c.atribuido_por).length,
    }
  })
  const nunca = porFilho.filter((f) => f.itens === 0)

  // Itens das próximas funções que ainda estão faltando
  const proximas = d.obrigacoes.filter((o) => !o.data || o.data >= hoje)
  const faltando = d.itens.filter((i) => proximas.some((o) => o.id === i.obrigacao_id) && !i.colhida).map((i) => {
    const soma = d.contribuicoes.filter((c) => c.item_id === i.id).reduce((s, c) => s + Number(c.quantidade), 0)
    return { i, soma, falta: i.quantidade_total ? Number(i.quantidade_total) - soma : soma > 0 ? 0 : 1 }
  }).filter((x) => x.falta > 0)

  const planilha = () => baixarPlanilha('contribuicoes-nas-funcoes', [
    ['Filho', 'Funções em que ajudou', 'Itens combinados', 'Entregues', 'Se ofereceu', 'Itens em obrigações de irmãos', 'Irmãos ajudados'],
    ...porFilho.map((f) => [nomeDe(irmaos, f.id), f.funcoes, f.itens, f.entregues, f.seOfereceu, f.deIrmaos, f.irmaosAjudados]),
  ])

  return (
    <Secao id="funcoes" titulo={<><ClipboardList size={20} aria-hidden /> Funções e obrigações</>} planilha={planilha}>
      <div className="indicadores">
        <Numero valor={d.obrigacoes.length} rotulo="funções/obrigações da casa" />
        <Numero valor={porFilho.filter((f) => f.itens > 0).length} rotulo="filhos já contribuíram" tom="bom" />
        <Numero valor={porFilho.filter((f) => f.deIrmaos > 0).length} rotulo="ajudaram em obrigação de irmão" tom="bom" />
        <Numero valor={faltando.length} rotulo="itens ainda sem ninguém" tom={faltando.length ? 'alerta' : undefined} />
      </div>
      <h3>Quem mais contribui (itens)</h3>
      <Barras linhas={porFilho.filter((f) => f.itens > 0).sort((a, b) => b.itens - a.itens).slice(0, 15)
        .map((f) => ({ rotulo: nomeDe(irmaos, f.id), valor: f.itens, detalhe: `${f.entregues} entregue(s)` }))} />
      <h3>Contribuições nas obrigações dos irmãos</h3>
      <Tabela cabecalho={['Filho', 'Itens levados', 'Irmãos ajudados']} vazio="Nenhuma obrigação marcada como de um filho ainda. Ao criar a obrigação, diga de quem ela é."
        linhas={porFilho.filter((f) => f.deIrmaos > 0).sort((a, b) => b.deIrmaos - a.deIrmaos)
          .map((f) => [nomeDe(irmaos, f.id), f.deIrmaos, f.irmaosAjudados])} />
      {faltando.length > 0 && (
        <>
          <h3>Ainda faltando nas próximas funções</h3>
          <Tabela cabecalho={['Função', 'Item', 'Falta']}
            linhas={faltando.slice(0, 20).map(({ i, falta }) => [
              <Link key={i.id} to={`/obrigacoes/${i.obrigacao_id}`}>{obPorId.get(i.obrigacao_id)?.nome}</Link>,
              i.nome ?? i.folhas?.nome_popular ?? 'Item',
              i.quantidade_total ? comUnidade(falta, i.unidade) : 'ninguém pegou',
            ])} />
        </>
      )}
      <h3>Ainda não contribuíram</h3>
      <p>{nunca.length ? nunca.map((f) => nomeDe(irmaos, f.id)).join(', ') : <span className="sutil">Todos já contribuíram.</span>}</p>
    </Secao>
  )
}

// ---------------------------------------------------------------------
// 4. Filhos e uso do app
// ---------------------------------------------------------------------

function RelFilhos({ d, irmaos }: { d: Dados; irmaos: Irmao[] }) {
  const aprovados = d.membros.filter((m) => m.aprovado)
  const pendentes = d.membros.filter((m) => !m.aprovado)
  const noventa = new Date(Date.now() - 90 * 86400000).toISOString()
  const trinta = new Date(Date.now() - 30 * 86400000).toISOString()
  const novos = aprovados.filter((m) => (m.aprovado_em ?? m.created_at) >= noventa)
  const uso = new Map(d.uso.map((u) => [u.perfil_id, u]))
  const sumidos = aprovados.filter((m) => (uso.get(m.perfil_id)?.ultimo_acesso ?? '') < trinta)
  const usaram = aprovados.filter((m) => (uso.get(m.perfil_id)?.acessos_30d ?? 0) > 0)

  const planilha = () => baixarPlanilha('uso-do-app', [
    ['Filho', 'Papel', 'Na casa desde', 'Último acesso', 'Acessos (30 dias)', 'Ações (30 dias)'],
    ...aprovados.map((m) => {
      const u = uso.get(m.perfil_id)
      return [nomeDe(irmaos, m.perfil_id), m.papel, formatarDataCurta(m.aprovado_em ?? m.created_at),
        u?.ultimo_acesso ? formatarDataCurta(u.ultimo_acesso) : 'nunca', u?.acessos_30d ?? 0, u?.acoes_30d ?? 0]
    }),
  ])

  return (
    <Secao id="filhos" titulo={<><Users size={20} aria-hidden /> Filhos e uso do app</>} planilha={planilha}>
      <div className="indicadores">
        <Numero valor={aprovados.length} rotulo="filhos na casa" />
        <Numero valor={novos.length} rotulo="entraram nos últimos 90 dias" tom="bom" />
        <Numero valor={`${pct(usaram.length, aprovados.length)}%`} rotulo="usaram o app no último mês" />
        <Numero valor={sumidos.length} rotulo="não abrem o app há 30+ dias" tom={sumidos.length ? 'alerta' : undefined} />
      </div>
      {pendentes.length > 0 && <p className="aviso-pequeno">{pendentes.length} pedido(s) de entrada esperando você. <Link to="/casa/membros">Ver</Link></p>}
      <h3>Quem mais usa o app (últimos 30 dias)</h3>
      <Barras linhas={aprovados.map((m) => ({ id: m.perfil_id, u: uso.get(m.perfil_id) }))
        .filter((x) => (x.u?.acessos_30d ?? 0) > 0).sort((a, b) => (b.u!.acessos_30d + b.u!.acoes_30d) - (a.u!.acessos_30d + a.u!.acoes_30d)).slice(0, 15)
        .map((x) => ({ rotulo: nomeDe(irmaos, x.id), valor: x.u!.acessos_30d, detalhe: `acessos · ${x.u!.acoes_30d} ações` }))} />
      <h3>Sumidos do app</h3>
      <Tabela cabecalho={['Filho', 'Último acesso']} vazio="Todo mundo abriu o app no último mês."
        linhas={sumidos.map((m) => {
          const u = uso.get(m.perfil_id)
          return [nomeDe(irmaos, m.perfil_id), u?.ultimo_acesso ? formatarDataCurta(u.ultimo_acesso) : 'ainda não registrado']
        })} />
      <p className="sutil">Detalhes de tudo o que cada um fez: <Link to="/casa/registros">Registro de atividades</Link>.</p>
    </Secao>
  )
}

// ---------------------------------------------------------------------
// 5. Fichas
// ---------------------------------------------------------------------

function RelFichas({ fichas }: { fichas: ResumoFicha[] }) {
  const mesAtual = new Date().getMonth() + 1
  const preenchidas = fichas.filter((f) => f.preenchida)
  const aniversarios = fichas.filter((f) => f.data_nascimento && Number(f.data_nascimento.slice(5, 7)) === mesAtual)
    .sort((a, b) => a.data_nascimento!.slice(8).localeCompare(b.data_nascimento!.slice(8)))
  const proximoMes = fichas.filter((f) => f.data_nascimento && Number(f.data_nascimento.slice(5, 7)) === (mesAtual % 12) + 1)
  const orixas = useMemo(() => {
    const contagem = new Map<string, number>()
    for (const f of fichas) {
      if (!f.orixa_cabeca) continue
      const nome = f.orixa_cabeca.trim().replace(/^./, (c) => c.toUpperCase())
      contagem.set(nome, (contagem.get(nome) ?? 0) + 1)
    }
    return [...contagem.entries()].sort((a, b) => b[1] - a[1])
  }, [fichas])
  const tempoSanto = fichas.filter((f) => f.data_iniciacao).map((f) => ({ f, anos: idade(f.data_iniciacao) ?? 0 }))
    .sort((a, b) => b.anos - a.anos)
  const alergicos = fichas.filter((f) => f.alergias)
  const remedios = fichas.filter((f) => f.remedios_continuos > 0)

  const planilha = () => baixarPlanilha('fichas-resumo', [
    ['Filho', 'Ficha', 'Nascimento', 'Orixá de cabeça', 'Juntó', 'Nome de santo', 'Iniciação', 'Alergias', 'Problemas de saúde', 'Remédios contínuos'],
    ...fichas.map((f) => [f.apelido, f.preenchida ? 'Sim' : 'Não', f.data_nascimento ? formatarDataCurta(f.data_nascimento) : '', f.orixa_cabeca, f.orixa_ajunto,
      f.nome_de_santo, f.data_iniciacao ? formatarDataCurta(f.data_iniciacao) : '', f.alergias, f.condicoes_saude, f.remedios_continuos]),
  ])

  return (
    <Secao id="fichas" titulo={<><Stethoscope size={20} aria-hidden /> Fichas dos filhos</>} planilha={planilha}>
      <div className="indicadores">
        <Numero valor={`${preenchidas.length}/${fichas.length}`} rotulo="fichas preenchidas" tom={preenchidas.length < fichas.length ? 'alerta' : 'bom'} />
        <Numero valor={aniversarios.length} rotulo="aniversariantes do mês" />
        <Numero valor={alergicos.length} rotulo="com alergia" tom={alergicos.length ? 'ruim' : undefined} />
        <Numero valor={remedios.length} rotulo="tomam remédio contínuo" />
      </div>

      <h3 className="icone-texto"><Cake size={18} aria-hidden /> Aniversariantes</h3>
      <Tabela cabecalho={['Filho', 'Dia', 'Faz']} vazio="Ninguém faz aniversário este mês (ou falta preencher a data)."
        linhas={[...aniversarios, ...proximoMes].map((f) => [
          <Link key={f.perfil_id} to={`/casa/fichas/${f.perfil_id}`}>{f.apelido}</Link>,
          diaMes(f.data_nascimento!), `${fazAnos(f.data_nascimento!, mesAtual)} anos`,
        ])} />

      <h3>Filhos por orixá de cabeça</h3>
      <Barras linhas={orixas.map(([nome, n]) => ({ rotulo: nome, valor: n }))} />

      {tempoSanto.length > 0 && (
        <>
          <h3>Tempo de santo</h3>
          <Tabela cabecalho={['Filho', 'Iniciação', 'Anos']} linhas={tempoSanto.map(({ f, anos }) => [f.apelido, formatarDataCurta(f.data_iniciacao!), anos])} />
        </>
      )}

      <h3 className="icone-texto"><TriangleAlert size={18} aria-hidden /> Atenção à saúde (para giras e obrigações)</h3>
      <Tabela cabecalho={['Filho', 'Alergias', 'Saúde', 'Remédio contínuo']} vazio="Ninguém informou alergia, problema de saúde ou remédio contínuo."
        linhas={fichas.filter((f) => f.alergias || f.condicoes_saude || f.remedios_continuos).map((f) => [
          <Link key={f.perfil_id} to={`/casa/fichas/${f.perfil_id}`}>{f.apelido}</Link>, f.alergias ?? '—', f.condicoes_saude ?? '—', f.remedios_continuos || '—',
        ])} />
    </Secao>
  )
}

// ---------------------------------------------------------------------
// 6. Giras (senhas)
// ---------------------------------------------------------------------

function RelSenhas({ senhas }: { senhas: NonNullable<Dados['senhas']> }) {
  const total = senhas.reduce((s, x) => s + x.total, 0)
  const atendidas = senhas.reduce((s, x) => s + x.atendidas, 0)
  return (
    <Secao id="senhas" titulo={<><Ticket size={20} aria-hidden /> Atendimentos nas giras</>}>
      <div className="indicadores">
        <Numero valor={senhas.length} rotulo="giras com senha" />
        <Numero valor={senhas.length ? Math.round(total / senhas.length) : 0} rotulo="pessoas por gira, em média" />
        <Numero valor={atendidas} rotulo="atendimentos feitos" tom="bom" />
        <Numero valor={`${pct(senhas.reduce((s, x) => s + x.ausentes, 0), total)}%`} rotulo="pegaram senha e não ficaram" />
      </div>
      <h3>Pessoas por gira</h3>
      <Barras linhas={senhas.slice(0, 10).map((s) => ({ rotulo: diaMes(s.data), valor: s.total, detalhe: `${s.atendidas} atendidas` }))} />
    </Secao>
  )
}

// ---------------------------------------------------------------------
// 7. Mapa e 8. Materiais
// ---------------------------------------------------------------------

function RelMapa({ d, irmaos }: { d: Dados; irmaos: Irmao[] }) {
  const contagem = new Map<string, number>()
  for (const p of d.pontos) if (p.criado_por) contagem.set(p.criado_por, (contagem.get(p.criado_por) ?? 0) + 1)
  return (
    <Secao id="mapa" titulo={<><IconeMapa size={20} aria-hidden /> Mapa de folhas</>}>
      <div className="indicadores">
        <Numero valor={d.pontos.length} rotulo="pontos marcados pela casa" />
        <Numero valor={d.pontos.filter((p) => p.status === 'pendente').length} rotulo="esperando validação" />
      </div>
      <h3>Quem mais marca folhas</h3>
      <Barras linhas={[...contagem.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, n]) => ({ rotulo: nomeDe(irmaos, id), valor: n }))} />
    </Secao>
  )
}

function RelMateriais({ d }: { d: Dados }) {
  const acabando = d.materiais.filter((m) => m.minimo !== null && Number(m.quantidade) <= Number(m.minimo))
  const uso = new Map<string, number>()
  for (const s of d.saidas) uso.set(s.material_id, (uso.get(s.material_id) ?? 0) + Number(s.quantidade))
  const maisUsados = [...uso.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
  return (
    <Secao id="materiais" titulo={<><Package size={20} aria-hidden /> Materiais</>}>
      <div className="indicadores">
        <Numero valor={d.materiais.length} rotulo="materiais cadastrados" />
        <Numero valor={acabando.length} rotulo="no mínimo ou acabando" tom={acabando.length ? 'ruim' : undefined} />
      </div>
      {acabando.length > 0 && (
        <Tabela cabecalho={['Material', 'Tem', 'Mínimo']}
          linhas={acabando.map((m) => [m.nome, comUnidade(Number(m.quantidade), m.unidade), comUnidade(Number(m.minimo), m.unidade)])} />
      )}
      <h3>Mais usados (últimos 90 dias)</h3>
      <Barras linhas={maisUsados.map(([id, n]) => {
        const m = d.materiais.find((x) => x.id === id)
        return { rotulo: m?.nome ?? 'Material', valor: n, detalhe: m?.unidade }
      })} />
    </Secao>
  )
}
