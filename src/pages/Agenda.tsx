import { Brush, CalendarDays, ChevronRight, ClipboardList, Flag, Wallet, type LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Topo from '../components/Topo'
import { avisar } from '../lib/avisos'
import { diaMes, hojeIso } from '../lib/casa'
import { feriadosNacionais } from '../lib/feriados'
import { seAplica, valorDe } from '../lib/financeiro'
import { lerModulos, type Modulos } from '../lib/modulos'
import { useSessao } from '../lib/sessao'
import { mensagemDeErro, supabase } from '../lib/supabase'
import {
  formatarReais, ROTULO_EVENTO,
  type Cobranca, type Escala, type Evento, type FinanceiroCasa, type Obrigacao, type Pagamento, type PessoaEscala,
} from '../lib/tipos'

type Tipo = 'evento' | 'escala' | 'funcao' | 'pagamento' | 'feriado'

interface Compromisso {
  id: string
  tipo: Tipo
  data: string
  hora?: string | null
  titulo: string
  detalhe?: string
  terreiro?: string
  rota?: string
  urgente?: boolean
}

const ICONE: Record<Tipo, LucideIcon> = {
  evento: CalendarDays, escala: Brush, funcao: ClipboardList, pagamento: Wallet, feriado: Flag,
}

const SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const DIAS = 90

function rotuloDia(data: string, hoje: string): string {
  const [a, m, d] = data.split('-').map(Number)
  const dia = new Date(a, m - 1, d)
  const diff = Math.round((dia.getTime() - new Date(`${hoje}T00:00:00`).getTime()) / 86400000)
  if (diff === 0) return 'Hoje'
  if (diff === 1) return 'Amanhã'
  return `${SEMANA[dia.getDay()]}, ${diaMes(data)}`
}

/** Agenda geral: o que a pessoa tem em todas as casas de que faz parte. */
export default function Agenda() {
  const { perfil, casas, casaAtiva, trocarCasa } = useSessao()
  const navegar = useNavigate()
  const minhasCasas = useMemo(() => casas.filter((c) => c.aprovado), [casas])
  const [itens, setItens] = useState<Compromisso[] | null>(null)
  const [filtro, setFiltro] = useState<string>('todas')

  useEffect(() => {
    if (!perfil || minhasCasas.length === 0) return
    const ids = minhasCasas.map((c) => c.terreiro_id)
    const hoje = hojeIso()
    const limite = new Date(Date.now() + DIAS * 86400000).toISOString().slice(0, 10)

    ;(async () => {
      await Promise.all(ids.map((id) => supabase.rpc('garantir_mensalidades', { p_terreiro: id })))
      const [cfg, ev, esc, pes, ob, cob, pag, fin, alv] = await Promise.all([
        supabase.from('casa_config').select('terreiro_id, modulos').in('terreiro_id', ids),
        supabase.from('eventos').select('*').in('terreiro_id', ids).gte('data', hoje).lte('data', limite),
        supabase.from('escalas').select('*').in('terreiro_id', ids).gte('data', hoje).lte('data', limite),
        supabase.from('escala_pessoas').select('*').in('terreiro_id', ids),
        supabase.from('obrigacoes').select('*').in('terreiro_id', ids).gte('data', hoje).lte('data', limite),
        supabase.from('cobrancas').select('*').in('terreiro_id', ids).lte('vencimento', limite),
        supabase.from('pagamentos').select('*').eq('perfil_id', perfil.id),
        supabase.from('financeiro_casa').select('*').in('terreiro_id', ids),
        supabase.from('cobranca_alvos').select('cobranca_id, perfil_id').eq('perfil_id', perfil.id),
      ])
      const modulos = new Map<string, Modulos>(ids.map((id) => [id, lerModulos(
        ((cfg.data ?? []) as { terreiro_id: string; modulos: Record<string, unknown> }[]).find((c) => c.terreiro_id === id)?.modulos)]))
      const ligado = (id: string, m: keyof Modulos) => modulos.get(id)?.[m] !== false
      const lista: Compromisso[] = []

      for (const e of (ev.data ?? []) as Evento[]) {
        if (!ligado(e.terreiro_id, 'calendario')) continue
        lista.push({ id: `ev-${e.id}`, tipo: 'evento', data: e.data, hora: e.hora, titulo: e.titulo,
          detalhe: [ROTULO_EVENTO[e.tipo], e.local].filter(Boolean).join(' · '), terreiro: e.terreiro_id, rota: '/casa/calendario' })
      }

      const pessoas = (pes.data ?? []) as PessoaEscala[]
      for (const e of (esc.data ?? []) as Escala[]) {
        if (!ligado(e.terreiro_id, 'escalas')) continue
        const minha = pessoas.find((p) => p.escala_id === e.id && p.perfil_id === perfil.id)
        const confirmados = pessoas.filter((p) => p.escala_id === e.id && p.status === 'confirmado').length
        if (minha && minha.status !== 'recusou') {
          lista.push({ id: `es-${e.id}`, tipo: 'escala', data: e.data, hora: e.hora, titulo: `Escala: ${e.titulo}`,
            detalhe: minha.status === 'confirmado' ? 'Você confirmou' : 'Esperando sua resposta',
            urgente: minha.status === 'convocado', terreiro: e.terreiro_id, rota: '/casa/escalas' })
        } else if (!minha && e.modo === 'vagas' && confirmados < (e.vagas ?? 0)) {
          lista.push({ id: `es-${e.id}`, tipo: 'escala', data: e.data, hora: e.hora, titulo: `Vaga aberta: ${e.titulo}`,
            detalhe: `${(e.vagas ?? 0) - confirmados} vaga(s) sobrando`, terreiro: e.terreiro_id, rota: '/casa/escalas' })
        }
      }

      for (const o of (ob.data ?? []) as Obrigacao[]) {
        if (!o.data || !ligado(o.terreiro_id, 'funcoes')) continue
        lista.push({ id: `ob-${o.id}`, tipo: 'funcao', data: o.data, titulo: o.nome,
          detalhe: o.visibilidade === 'privado' ? 'Só você vê' : 'Função da casa', terreiro: o.terreiro_id, rota: `/obrigacoes/${o.id}` })
      }

      const pagamentos = (pag.data ?? []) as Pagamento[]
      const alvos = new Set(((alv.data ?? []) as { cobranca_id: string; perfil_id: string }[]).map((a) => `${a.cobranca_id}:${a.perfil_id}`))
      for (const c of (cob.data ?? []) as Cobranca[]) {
        if (!ligado(c.terreiro_id, 'financeiro')) continue
        const casa = minhasCasas.find((x) => x.terreiro_id === c.terreiro_id)
        const config = ((fin.data ?? []) as FinanceiroCasa[]).find((f) => f.terreiro_id === c.terreiro_id) ?? null
        if (!casa) continue
        const eu = { perfil_id: perfil.id, isento: casa.isento, mensalidade_valor: casa.mensalidade_valor, aprovado_em: casa.aprovado_em }
        if (!seAplica(c, eu, config, alvos)) continue
        const p = pagamentos.find((x) => x.cobranca_id === c.id)
        if (p && p.status !== 'recusado') continue
        const atrasada = c.vencimento < hoje
        lista.push({ id: `cb-${c.id}`, tipo: 'pagamento', data: atrasada ? hoje : c.vencimento, titulo: c.titulo,
          detalhe: `${formatarReais(valorDe(c, eu, config))} · ${atrasada ? `venceu em ${diaMes(c.vencimento)}` : 'a pagar'}${p?.status === 'recusado' ? ' · comprovante recusado' : ''}`,
          urgente: atrasada || p?.status === 'recusado', terreiro: c.terreiro_id, rota: '/casa/financeiro' })
      }

      const ano = new Date().getFullYear()
      for (const f of [...feriadosNacionais(ano), ...feriadosNacionais(ano + 1)]) {
        if (f.data >= hoje && f.data <= limite) lista.push({ id: `fe-${f.data}`, tipo: 'feriado', data: f.data, titulo: f.nome, detalhe: 'Feriado nacional' })
      }

      lista.sort((a, b) => a.data.localeCompare(b.data) || Number(Boolean(b.urgente)) - Number(Boolean(a.urgente))
        || (a.hora ?? '99').localeCompare(b.hora ?? '99'))
      setItens(lista)
    })()
  }, [perfil, minhasCasas])

  const nomeCasa = (id?: string) => minhasCasas.find((c) => c.terreiro_id === id)?.terreiros?.nome ?? ''
  const hoje = hojeIso()
  const visiveis = (itens ?? []).filter((i) => filtro === 'todas' || i.terreiro === filtro || (i.tipo === 'feriado' && filtro === 'todas'))
  const dias = new Map<string, Compromisso[]>()
  for (const i of visiveis) dias.set(i.data, [...(dias.get(i.data) ?? []), i])

  async function abrir(i: Compromisso) {
    if (!i.rota) return
    try {
      if (i.terreiro && i.terreiro !== casaAtiva?.terreiro_id) {
        await trocarCasa(i.terreiro)
        avisar(`Você está agora em ${nomeCasa(i.terreiro)}.`)
      }
      navegar(i.rota)
    } catch (e) {
      avisar(mensagemDeErro(e), 'erro')
    }
  }

  return (
    <div className="pagina">
      <Topo titulo="Minha agenda" voltar="/casa" subtitulo={`Próximos ${DIAS} dias, em todas as suas casas`} />

      {minhasCasas.length > 1 && (
        <div className="chips filtro-casas" role="radiogroup" aria-label="Mostrar casa">
          <button className={`chip ${filtro === 'todas' ? 'ativo' : ''}`} role="radio" aria-checked={filtro === 'todas'} onClick={() => setFiltro('todas')}>
            Todas as casas
          </button>
          {minhasCasas.map((c) => (
            <button key={c.terreiro_id} className={`chip ${filtro === c.terreiro_id ? 'ativo' : ''}`} role="radio"
              aria-checked={filtro === c.terreiro_id} onClick={() => setFiltro(c.terreiro_id)}>
              {c.terreiros?.nome}
            </button>
          ))}
        </div>
      )}

      {!itens && <p className="sutil">Juntando a agenda das suas casas…</p>}
      {itens && visiveis.length === 0 && (
        <div className="cartao vazio">
          <CalendarDays size={28} aria-hidden className="cor-sutil" />
          <strong>Nada marcado por enquanto.</strong>
          <span className="sutil">Festas, giras, escalas, funções e pagamentos das suas casas aparecem aqui.</span>
        </div>
      )}

      {[...dias.entries()].map(([data, lista]) => (
        <section key={data} className="dia-agenda">
          <h2 className={data === hoje ? 'hoje' : ''}>{rotuloDia(data, hoje)}</h2>
          <ul className="lista">
            {lista.map((i) => {
              const Icone = ICONE[i.tipo]
              return (
                <li key={i.id}>
                  <button className="item item-agenda" onClick={() => abrir(i)} disabled={!i.rota}>
                    <span className={`tile ${i.urgente ? 'vermelho' : i.tipo === 'pagamento' ? 'dourado' : i.tipo === 'feriado' ? 'azul' : ''}`} aria-hidden>
                      <Icone size={20} />
                    </span>
                    <span className="cresce">
                      <strong>{i.titulo}</strong>
                      <span className="sutil">
                        {[i.hora?.slice(0, 5), i.detalhe].filter(Boolean).join(' · ')}
                      </span>
                      {i.terreiro && minhasCasas.length > 1 && <span className="casa-etiqueta">{nomeCasa(i.terreiro)}</span>}
                    </span>
                    {i.rota && <ChevronRight size={20} className="chevron" aria-hidden />}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
