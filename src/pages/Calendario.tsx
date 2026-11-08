import { MapPin } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { avisar } from '../lib/avisos'
import { feriadosNacionais, type Feriado } from '../lib/feriados'
import { ehEquipe, useSessao } from '../lib/sessao'
import { mensagemDeErro, supabase } from '../lib/supabase'
import { formatarDataCurta, ROTULO_EVENTO, type Evento, type TipoEvento } from '../lib/tipos'
import { confirmar } from '../lib/dialogo'
import Topo from '../components/Topo'

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function diaDaSemana(data: string): string {
  const [a, m, d] = data.split('-').map(Number)
  return new Date(a, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'long' })
}

/** Arquivo .ics para a pessoa adicionar o evento na agenda do celular. */
function baixarNaAgenda(e: Evento, casa: string) {
  const data = e.data.replace(/-/g, '')
  const hora = (h: string | null) => (h ? h.slice(0, 5).replace(':', '') + '00' : '')
  const inicio = e.hora ? `DTSTART;TZID=America/Sao_Paulo:${data}T${hora(e.hora)}` : `DTSTART;VALUE=DATE:${data}`
  const fim = e.hora
    ? `DTEND;TZID=America/Sao_Paulo:${data}T${hora(e.hora_fim ?? e.hora)}`
    : `DTEND;VALUE=DATE:${iso(new Date(new Date(`${e.data}T12:00:00`).getTime() + 86400000)).replace(/-/g, '')}`
  const escapar = (t: string) => t.replace(/[,;\\]/g, (c) => `\\${c}`).replace(/\n/g, '\\n')
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Axe Plantas//PT-BR', 'BEGIN:VEVENT',
    `UID:${e.id}@axeplantas`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    inicio, fim, `SUMMARY:${escapar(e.titulo)} (${escapar(casa)})`,
    e.local ? `LOCATION:${escapar(e.local)}` : '', e.descricao ? `DESCRIPTION:${escapar(e.descricao)}` : '',
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).join('\r\n')
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${e.titulo}.ics`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function Calendario() {
  const { casaAtiva } = useSessao()
  const terreiro = casaAtiva?.terreiro_id
  const podeEditar = ehEquipe(casaAtiva)
  const hoje = iso(new Date())
  const [mes, setMes] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [eventos, setEventos] = useState<Evento[]>([])
  const [diaEscolhido, setDiaEscolhido] = useState(hoje)
  const [editando, setEditando] = useState<Evento | 'novo' | null>(null)

  const carregar = useCallback(async () => {
    if (!terreiro) return
    const { data } = await supabase.from('eventos').select('*').eq('terreiro_id', terreiro).order('data').order('hora')
    setEventos((data ?? []) as Evento[])
  }, [terreiro])

  useEffect(() => {
    carregar()
  }, [carregar])

  const feriados = useMemo(() => {
    const ano = mes.getFullYear()
    return [...feriadosNacionais(ano - 1), ...feriadosNacionais(ano), ...feriadosNacionais(ano + 1)]
  }, [mes])

  const porDia = useMemo(() => {
    const mapa = new Map<string, { eventos: Evento[]; feriados: Feriado[] }>()
    const pegar = (d: string) => mapa.get(d) ?? (mapa.set(d, { eventos: [], feriados: [] }), mapa.get(d)!)
    eventos.forEach((e) => pegar(e.data).eventos.push(e))
    feriados.forEach((f) => pegar(f.data).feriados.push(f))
    return mapa
  }, [eventos, feriados])

  const dias = useMemo(() => {
    const primeiro = new Date(mes.getFullYear(), mes.getMonth(), 1)
    const ultimo = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate()
    const lista: (string | null)[] = Array(primeiro.getDay()).fill(null)
    for (let d = 1; d <= ultimo; d++) lista.push(iso(new Date(mes.getFullYear(), mes.getMonth(), d)))
    return lista
  }, [mes])

  const proximos = useMemo(() => {
    const itens = [
      ...eventos.filter((e) => e.data >= hoje).map((e) => ({ data: e.data, evento: e as Evento | null, feriado: null as Feriado | null })),
      ...feriados.filter((f) => f.data >= hoje).map((f) => ({ data: f.data, evento: null, feriado: f })),
    ]
    return itens.sort((a, b) => a.data.localeCompare(b.data) || (a.evento?.hora ?? '').localeCompare(b.evento?.hora ?? '')).slice(0, 12)
  }, [eventos, feriados, hoje])

  if (!terreiro || !casaAtiva) return <div className="pagina"><p>Escolha uma casa primeiro.</p></div>

  const doDia = porDia.get(diaEscolhido)
  const casa = casaAtiva.terreiros?.nome ?? 'Casa'

  async function apagar(e: Evento) {
    if (!(await confirmar(`Apagar “${e.titulo}” do calendário?`, { botao: 'Apagar', perigo: true }))) return
    const { error } = await supabase.from('eventos').delete().eq('id', e.id)
    if (error) return avisar(mensagemDeErro(error), 'erro')
    avisar('Evento apagado.')
    await carregar()
  }

  function CartaoEvento({ e }: { e: Evento }) {
    return (
      <div className={`cartao evento evento-${e.tipo}`}>
        <div className="cabecalho">
          <strong>{e.titulo}</strong>
          <span className="sutil">{ROTULO_EVENTO[e.tipo]}</span>
        </div>
        <div className="sutil">
          {formatarDataCurta(e.data)} ({diaDaSemana(e.data)})
          {e.hora ? ` · ${e.hora.slice(0, 5)}${e.hora_fim ? ` às ${e.hora_fim.slice(0, 5)}` : ''}` : ' · dia inteiro'}
        </div>
        {e.local && <div className="sutil icone-texto"><MapPin size={14} aria-hidden /> {e.local}</div>}
        {e.descricao && <p className="texto-pre">{e.descricao}</p>}
        <div className="linha">
          <button className="link" onClick={() => baixarNaAgenda(e, casa)}>Adicionar à minha agenda</button>
          {podeEditar && <button className="link" onClick={() => setEditando(e)}>Editar</button>}
          {podeEditar && <button className="link perigo" onClick={() => apagar(e)}>Apagar</button>}
        </div>
      </div>
    )
  }

  return (
    <div className="pagina">
      <Topo titulo="Calendário" voltar={'/casa'} acao={<>{podeEditar && !editando && <button className="botao" onClick={() => setEditando('novo')}>+ Evento</button>}</>} />
      <p className="sutil">{casa}</p>

      {editando && (
        <FormEvento terreiro={terreiro} evento={editando === 'novo' ? null : editando} dataInicial={diaEscolhido}
          aoTerminar={async (ok) => { setEditando(null); if (ok) await carregar() }} />
      )}

      <div className="calendario">
        <div className="calendario-topo">
          <button className="botao" aria-label="Mês anterior" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}>‹</button>
          <strong>{MESES[mes.getMonth()]} de {mes.getFullYear()}</strong>
          <button className="botao" aria-label="Próximo mês" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}>›</button>
        </div>
        <div className="calendario-grade">
          {SEMANA.map((d, i) => <span key={i} className="calendario-semana">{d}</span>)}
          {dias.map((d, i) => {
            if (!d) return <span key={i} />
            const info = porDia.get(d)
            const classes = [
              'calendario-dia',
              d === hoje ? 'hoje' : '',
              d === diaEscolhido ? 'escolhido' : '',
              info?.feriados.some((f) => !f.facultativo) ? 'feriado' : '',
            ].join(' ')
            return (
              <button key={d} className={classes} onClick={() => setDiaEscolhido(d)}>
                {Number(d.slice(8))}
                <span className="pontinhos">
                  {info?.eventos.slice(0, 3).map((e) => <i key={e.id} className={`ponto-${e.tipo}`} />)}
                  {info?.feriados.length ? <i className="ponto-feriado" /> : null}
                </span>
              </button>
            )
          })}
        </div>
        <div className="legenda-calendario sutil">
          <span><i className="ponto-festa" /> Evento da casa</span>
          <span><i className="ponto-feriado" /> Feriado</span>
        </div>
      </div>

      <section>
        <h2>{formatarDataCurta(diaEscolhido)} · {diaDaSemana(diaEscolhido)}</h2>
        {doDia?.feriados.map((f) => (
          <div key={f.nome} className="cartao feriado-cartao">
            🇧🇷 <strong>{f.nome}</strong>{f.facultativo ? <span className="sutil"> · ponto facultativo</span> : <span className="sutil"> · feriado nacional</span>}
          </div>
        ))}
        {doDia?.eventos.map((e) => <CartaoEvento key={e.id} e={e} />)}
        {!doDia?.eventos.length && !doDia?.feriados.length && (
          <p className="sutil">Nada neste dia.{podeEditar ? ' Toque em “+ Evento” para marcar algo.' : ''}</p>
        )}
      </section>

      <section>
        <h2>Próximos</h2>
        {proximos.map((p, i) => p.evento
          ? <CartaoEvento key={p.evento.id} e={p.evento} />
          : (
            <div key={`f${i}`} className="linha item-feriado">
              <span className="data-curta">{formatarDataCurta(p.data).slice(0, 5)}</span>
              <span className="cresce">🇧🇷 {p.feriado!.nome}{p.feriado!.facultativo ? ' (ponto facultativo)' : ''}</span>
            </div>
          ))}
      </section>
    </div>
  )
}

function FormEvento({ terreiro, evento, dataInicial, aoTerminar }: {
  terreiro: string
  evento: Evento | null
  dataInicial: string
  aoTerminar: (ok: boolean) => void
}) {
  const [titulo, setTitulo] = useState(evento?.titulo ?? '')
  const [tipo, setTipo] = useState<TipoEvento>(evento?.tipo ?? 'gira')
  const [data, setData] = useState(evento?.data ?? dataInicial)
  const [hora, setHora] = useState(evento?.hora?.slice(0, 5) ?? '')
  const [horaFim, setHoraFim] = useState(evento?.hora_fim?.slice(0, 5) ?? '')
  const [local, setLocal] = useState(evento?.local ?? '')
  const [descricao, setDescricao] = useState(evento?.descricao ?? '')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (hora && horaFim && horaFim < hora) return setErro('O horário de término é antes do início.')
    setSalvando(true)
    const dados = {
      titulo: titulo.trim(), tipo, data, hora: hora || null, hora_fim: horaFim || null,
      local: local.trim() || null, descricao: descricao.trim() || null,
    }
    const { error } = evento
      ? await supabase.from('eventos').update(dados).eq('id', evento.id)
      : await supabase.from('eventos').insert({ ...dados, terreiro_id: terreiro })
    setSalvando(false)
    if (error) return setErro(mensagemDeErro(error))
    avisar(evento ? 'Evento atualizado.' : 'Evento marcado! A casa foi avisada.')
    aoTerminar(true)
  }

  return (
    <form className="cartao formulario" onSubmit={salvar}>
      <h2>{evento ? 'Editar evento' : 'Novo evento'}</h2>
      <label>
        O que vai acontecer *
        <input value={titulo} onChange={(e) => setTitulo(e.target.value)} required maxLength={80} placeholder="Ex.: Gira de Pretos-Velhos" />
      </label>
      <div className="chips">
        {(Object.keys(ROTULO_EVENTO) as TipoEvento[]).map((t) => (
          <button key={t} type="button" className={`chip ${tipo === t ? 'ativo' : ''}`} onClick={() => setTipo(t)}>{ROTULO_EVENTO[t]}</button>
        ))}
      </div>
      <label>
        Dia *
        <input type="date" value={data} onChange={(e) => setData(e.target.value)} required />
      </label>
      <div className="linha">
        <label className="cresce">
          Começa (opcional)
          <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
        </label>
        <label className="cresce">
          Termina (opcional)
          <input type="time" value={horaFim} onChange={(e) => setHoraFim(e.target.value)} />
        </label>
      </div>
      <label>
        Local (opcional)
        <input value={local} onChange={(e) => setLocal(e.target.value)} maxLength={120} placeholder="Ex.: No terreiro" />
      </label>
      <label>
        Detalhes (opcional)
        <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} maxLength={500}
          placeholder="Ex.: vir de branco, trazer uma vela" />
      </label>
      {erro && <p className="erro">{erro}</p>}
      <div className="linha">
        <button className="primario" disabled={salvando}>{salvando ? 'Salvando…' : evento ? 'Salvar' : 'Marcar e avisar a casa'}</button>
        <button type="button" className="link" onClick={() => aoTerminar(false)}>Cancelar</button>
      </div>
    </form>
  )
}
