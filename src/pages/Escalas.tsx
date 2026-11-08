import { CalendarDays, Check, CircleCheck, CircleX, Clock, Hand } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { avisar } from '../lib/avisos'
import { diaMes, hojeIso, nomeDe, useIrmaos } from '../lib/casa'
import { ehEquipe, temPermissao, useSessao } from '../lib/sessao'
import { mensagemDeErro, supabase } from '../lib/supabase'
import type { Escala, Irmao, ModoEscala, PessoaEscala } from '../lib/tipos'
import { confirmar } from '../lib/dialogo'
import Topo from '../components/Topo'

const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

function quando(e: Escala): string {
  const [a, m, d] = e.data.split('-').map(Number)
  return `${SEMANA[new Date(a, m - 1, d).getDay()]}, ${diaMes(e.data)}${e.hora ? ` às ${e.hora.slice(0, 5)}` : ''}`
}

/** Escalas da casa: limpeza, cozinha, portão... */
export default function Escalas() {
  const { perfil, casaAtiva } = useSessao()
  const [params] = useSearchParams()
  const terreiro = casaAtiva?.terreiro_id
  const irmaos = useIrmaos(terreiro)
  const [escalas, setEscalas] = useState<Escala[]>([])
  const [pessoas, setPessoas] = useState<PessoaEscala[]>([])
  const [carregando, setCarregando] = useState(true)
  const [criando, setCriando] = useState(Boolean(params.get('obrigacao')))
  const [verPassadas, setVerPassadas] = useState(false)
  const organiza = ehEquipe(casaAtiva) || temPermissao(casaAtiva, 'escalas')

  const carregar = useCallback(async () => {
    if (!terreiro) return
    const [e, p] = await Promise.all([
      supabase.from('escalas').select('*').eq('terreiro_id', terreiro).order('data'),
      supabase.from('escala_pessoas').select('*').eq('terreiro_id', terreiro),
    ])
    setEscalas((e.data ?? []) as Escala[])
    setPessoas((p.data ?? []) as PessoaEscala[])
    setCarregando(false)
  }, [terreiro])

  useEffect(() => {
    carregar()
  }, [carregar])

  const hoje = hojeIso()
  const proximas = escalas.filter((e) => e.data >= hoje)
  const passadas = escalas.filter((e) => e.data < hoje).reverse()

  return (
    <div className="pagina">
      <Topo titulo="Escalas" voltar={'/casa'} acao={<>{organiza && !criando && <button className="botao" onClick={() => setCriando(true)}>+ Nova</button>}</>} />
      <p className="sutil">Limpeza, cozinha, portão, montagem da festa: quem está em cada tarefa.</p>

      {criando && terreiro && (
        <NovaEscala terreiro={terreiro} irmaos={irmaos} obrigacao={params.get('obrigacao')} tituloInicial={params.get('titulo') ?? ''}
          aoTerminar={async (ok) => { setCriando(false); if (ok) await carregar() }} />
      )}

      {carregando && <p className="sutil">Carregando…</p>}
      {!carregando && proximas.length === 0 && !criando && (
        <p className="sutil">Nenhuma escala marcada.{organiza ? ' Toque em “+ Nova” para convocar os filhos.' : ''}</p>
      )}

      {proximas.map((e) => (
        <CartaoEscala key={e.id} escala={e} pessoas={pessoas.filter((p) => p.escala_id === e.id)} irmaos={irmaos}
          eu={perfil?.id ?? ''} organiza={organiza} aoMudar={carregar} />
      ))}

      {passadas.length > 0 && (
        <section>
          <button className="link" onClick={() => setVerPassadas(!verPassadas)}>
            {verPassadas ? 'Esconder' : 'Ver'} escalas que já passaram ({passadas.length})
          </button>
          {verPassadas && passadas.map((e) => (
            <CartaoEscala key={e.id} escala={e} pessoas={pessoas.filter((p) => p.escala_id === e.id)} irmaos={irmaos}
              eu={perfil?.id ?? ''} organiza={organiza} aoMudar={carregar} passada />
          ))}
        </section>
      )}
    </div>
  )
}

function CartaoEscala({ escala, pessoas, irmaos, eu, organiza, aoMudar, passada }: {
  escala: Escala
  pessoas: PessoaEscala[]
  irmaos: Irmao[]
  eu: string
  organiza: boolean
  aoMudar: () => Promise<void>
  passada?: boolean
}) {
  const [aberta, setAberta] = useState(false)
  const minha = pessoas.find((p) => p.perfil_id === eu)
  const confirmados = pessoas.filter((p) => p.status === 'confirmado')
  const completa = escala.modo === 'vagas' && confirmados.length >= (escala.vagas ?? 0)

  async function responder(vou: boolean) {
    const { error } = await supabase.rpc('responder_escala', { p_escala: escala.id, p_vou: vou })
    if (error) avisar(mensagemDeErro(error), 'erro')
    else avisar(vou ? 'Você está na escala. Obrigado!' : escala.modo === 'vagas' ? 'Você saiu da escala.' : 'Resposta enviada.')
    await aoMudar()
  }

  async function presenca(perfilId: string, valor: 'presente' | 'faltou' | null) {
    const { error } = await supabase.rpc('marcar_presenca', { p_escala: escala.id, p_perfil: perfilId, p_presenca: valor })
    if (error) avisar(mensagemDeErro(error), 'erro')
    await aoMudar()
  }

  async function apagar() {
    if (!(await confirmar(`Apagar a escala “${escala.titulo}”?`, { texto: 'Quem estava nela deixa de ver.', botao: 'Apagar', perigo: true }))) return
    const { error } = await supabase.rpc('apagar_escala', { p_escala: escala.id })
    if (error) return avisar(mensagemDeErro(error), 'erro')
    avisar('Escala apagada.')
    await aoMudar()
  }

  const resumo = escala.modo === 'vagas'
    ? `${confirmados.length} de ${escala.vagas} vaga(s) preenchida(s)`
    : `${confirmados.length} de ${pessoas.length} confirmaram`

  return (
    <div className={`cartao escala ${minha?.status === 'confirmado' ? 'escala-minha' : ''}`}>
      <button className="cabecalho-botao" onClick={() => setAberta(!aberta)}>
        <span>
          <strong>{escala.titulo}</strong>
          <div className="sutil icone-texto"><CalendarDays size={14} aria-hidden /> {quando(escala)}{escala.local && ` · ${escala.local}`}</div>
          <div className="sutil">{resumo}{completa && ' · completa'}</div>
        </span>
        <span aria-hidden>{aberta ? '▲' : '▼'}</span>
      </button>

      {escala.modo === 'vagas' && (
        <div className="barra-progresso"><div style={{ width: `${Math.min(100, (confirmados.length / (escala.vagas ?? 1)) * 100)}%` }} /></div>
      )}

      {!passada && (
        <div className="linha escala-acoes">
          {escala.modo === 'vagas' ? (
            minha?.status === 'confirmado'
              ? <><span className="etiqueta situacao-confirmado icone-texto"><Check size={14} aria-hidden /> Você está na escala</span><button className="link perigo" onClick={() => responder(false)}>Sair</button></>
              : completa
                ? <span className="sutil">Vagas preenchidas.</span>
                : <button className="primario" onClick={() => responder(true)}><Hand size={18} aria-hidden /> Quero participar</button>
          ) : minha ? (
            minha.status === 'convocado' ? (
              <>
                <button className="primario" onClick={() => responder(true)}><Check size={18} aria-hidden /> Vou</button>
                <button className="botao" onClick={() => responder(false)}>Não posso</button>
              </>
            ) : (
              <>
                <span className={`etiqueta ${minha.status === 'confirmado' ? 'situacao-confirmado' : 'situacao-recusado'}`}>
                  {minha.status === 'confirmado' ? 'Você confirmou' : 'Você disse que não pode'}
                </span>
                <button className="link" onClick={() => responder(minha.status !== 'confirmado')}>Mudar resposta</button>
              </>
            )
          ) : (
            <span className="sutil">Você não foi convocado(a) para esta.</span>
          )}
        </div>
      )}

      {aberta && (
        <div className="escala-detalhe">
          {escala.descricao && <p className="texto-pre">{escala.descricao}</p>}
          {escala.obrigacao_id && <Link to={`/obrigacoes/${escala.obrigacao_id}`}>Ver a função ligada a esta escala</Link>}
          <ul className="pessoas-escala">
            {pessoas.length === 0 && <li className="sutil">Ninguém ainda.</li>}
            {pessoas
              .slice()
              .sort((a, b) => nomeDe(irmaos, a.perfil_id).localeCompare(nomeDe(irmaos, b.perfil_id), 'pt-BR'))
              .map((p) => (
                <li key={p.perfil_id}>
                  <span className="cresce">
                    {p.status === 'confirmado' ? <CircleCheck size={16} className="cor-ok" aria-hidden /> : p.status === 'recusou' ? <CircleX size={16} className="cor-perigo" aria-hidden /> : <Clock size={16} className="cor-sutil" aria-hidden />} {nomeDe(irmaos, p.perfil_id)}
                  </span>
                  {organiza && (passada || escala.data === hojeIso()) && p.status !== 'recusou' && (
                    <span className="chips">
                      <button className={`chip ${p.presenca === 'presente' ? 'ativo' : ''}`}
                        onClick={() => presenca(p.perfil_id, p.presenca === 'presente' ? null : 'presente')}>Veio</button>
                      <button className={`chip ${p.presenca === 'faltou' ? 'ativo perigo' : ''}`}
                        onClick={() => presenca(p.perfil_id, p.presenca === 'faltou' ? null : 'faltou')}>Faltou</button>
                    </span>
                  )}
                  {!organiza && p.presenca && <span className="sutil">{p.presenca === 'presente' ? 'veio' : 'faltou'}</span>}
                </li>
              ))}
          </ul>
          {organiza && <button className="link perigo" onClick={apagar}>Apagar escala</button>}
        </div>
      )}
    </div>
  )
}

function NovaEscala({ terreiro, irmaos, obrigacao, tituloInicial, aoTerminar }: {
  terreiro: string
  irmaos: Irmao[]
  obrigacao: string | null
  tituloInicial: string
  aoTerminar: (ok: boolean) => void
}) {
  const [titulo, setTitulo] = useState(tituloInicial)
  const [descricao, setDescricao] = useState('')
  const [data, setData] = useState('')
  const [hora, setHora] = useState('')
  const [local, setLocal] = useState('')
  const [modo, setModo] = useState<ModoEscala>('vagas')
  const [vagas, setVagas] = useState('4')
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set())
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setSalvando(true)
    const { error } = await supabase.rpc('criar_escala', {
      p_terreiro: terreiro, p_titulo: titulo, p_descricao: descricao, p_data: data, p_hora: hora || null,
      p_local: local, p_modo: modo, p_vagas: modo === 'vagas' ? Number(vagas) : null,
      p_pessoas: modo === 'escolhidos' ? [...escolhidos] : [], p_obrigacao: obrigacao,
    })
    setSalvando(false)
    if (error) return setErro(mensagemDeErro(error))
    avisar(modo === 'vagas' ? 'Escala criada! Todos foram avisados; os primeiros que confirmarem ficam com as vagas.' : 'Escala criada! Os convocados foram avisados.')
    aoTerminar(true)
  }

  return (
    <form className="cartao formulario" onSubmit={salvar}>
      <h2>Nova escala</h2>
      <label>
        O que é *
        <input value={titulo} onChange={(e) => setTitulo(e.target.value)} required maxLength={80} placeholder="Ex.: Limpeza do terreiro" />
      </label>
      <div className="linha">
        <label className="cresce">Dia *<input type="date" value={data} min={hojeIso()} onChange={(e) => setData(e.target.value)} required /></label>
        <label className="cresce">Hora<input type="time" value={hora} onChange={(e) => setHora(e.target.value)} /></label>
      </div>
      <label>Local<input value={local} onChange={(e) => setLocal(e.target.value)} maxLength={80} placeholder="Ex.: barracão" /></label>
      <label>
        Recado (opcional)
        <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} maxLength={500}
          placeholder="Ex.: trazer pano e balde; roupa branca" />
      </label>

      <strong>Quem participa?</strong>
      <div className="opcoes">
        <label className="opcao"><input type="radio" checked={modo === 'vagas'} onChange={() => setModo('vagas')} />
          Preciso de um número de filhos: avisa todos e os primeiros que confirmarem entram</label>
        <label className="opcao"><input type="radio" checked={modo === 'escolhidos'} onChange={() => setModo('escolhidos')} />
          Eu escolho quem vai</label>
        <label className="opcao"><input type="radio" checked={modo === 'todos'} onChange={() => setModo('todos')} />
          Convocar a casa toda</label>
      </div>
      {modo === 'vagas' && (
        <label>Quantos filhos?<input type="number" min={1} max={200} value={vagas} onChange={(e) => setVagas(e.target.value)} required /></label>
      )}
      {modo === 'escolhidos' && (
        <div className="lista-escolha">
          {irmaos.map((m) => (
            <label key={m.perfil_id} className="opcao">
              <input type="checkbox" checked={escolhidos.has(m.perfil_id)}
                onChange={(e) => setEscolhidos((s) => {
                  const novo = new Set(s)
                  if (e.target.checked) novo.add(m.perfil_id)
                  else novo.delete(m.perfil_id)
                  return novo
                })} />
              {m.apelido}
            </label>
          ))}
        </div>
      )}
      {erro && <p className="erro">{erro}</p>}
      <div className="linha">
        <button className="primario" disabled={salvando}>{salvando ? 'Criando…' : 'Criar e avisar'}</button>
        <button type="button" className="link" onClick={() => aoTerminar(false)}>Cancelar</button>
      </div>
    </form>
  )
}
