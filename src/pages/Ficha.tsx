import { Clock, HeartPulse, LockKeyhole, Pill, Sparkles, UserRound } from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { avisar } from '../lib/avisos'
import { useIrmaos, nomeDe } from '../lib/casa'
import { ehZelador, temPermissao, useSessao } from '../lib/sessao'
import { mensagemDeErro, supabase } from '../lib/supabase'
import { CAMPOS_FICHA, ROTULO_SECAO, useConfigFicha, type CampoExtra, type SecaoFicha } from '../lib/ficha'
import { formatarDataCurta, idade, type Ficha as TipoFicha, type Medicamento } from '../lib/tipos'
import Topo from '../components/Topo'

type Campos = Omit<TipoFicha, 'perfil_id' | 'terreiro_id' | 'consentimento_em' | 'atualizado_em' | 'atualizado_por' | 'extras'>

const VAZIA: Campos = {
  nome_completo: null, data_nascimento: null, telefone: null, contato_emergencia: null, tipo_sanguineo: null,
  alergias: null, condicoes_saude: null, medicamentos: [], orixa_cabeca: null, orixa_ajunto: null,
  outros_orixas: null, nome_de_santo: null, data_iniciacao: null, guias: null, mestres: null, entidades: null,
  observacoes: null,
}

const ESPIRITUAL: (keyof Campos)[] = ['orixa_cabeca', 'orixa_ajunto', 'outros_orixas', 'nome_de_santo', 'data_iniciacao',
  'guias', 'mestres', 'entidades', 'observacoes']

/**
 * Ficha do filho. Rota "/casa/ficha" = a minha; "/casa/fichas/:id" = a de um filho
 * (zelador e autorizados). O filho edita tudo; o zelador edita só a parte espiritual.
 */
export default function Ficha() {
  const { id } = useParams()
  const { perfil, casaAtiva, casas } = useSessao()
  const terreiro = casaAtiva?.terreiro_id
  const dono = id ?? perfil?.id
  const minha = dono === perfil?.id
  const irmaos = useIrmaos(minha ? undefined : terreiro)
  const [ficha, setFicha] = useState<TipoFicha | null>(null)
  const [campos, setCampos] = useState<Campos>(VAZIA)
  const [extras, setExtras] = useState<Record<string, string>>({})
  const [config] = useConfigFicha(terreiro)
  const [carregando, setCarregando] = useState(true)
  const [editando, setEditando] = useState(false)
  const [aceite, setAceite] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const podeVer = minha || temPermissao(casaAtiva, 'fichas')
  const podeEditarEspiritual = minha || ehZelador(casaAtiva)

  const carregar = useCallback(async () => {
    if (!terreiro || !dono) return
    const { data, error } = await supabase.rpc('abrir_ficha', { p_perfil: dono, p_terreiro: terreiro })
    if (error) setErro(mensagemDeErro(error))
    const f = (data ?? null) as TipoFicha | null
    setFicha(f)
    setCampos(f ? { ...VAZIA, ...f, medicamentos: f.medicamentos ?? [] } : VAZIA)
    setExtras((f?.extras ?? {}) as Record<string, string>)
    setEditando(minha && !f)
    setCarregando(false)
  }, [terreiro, dono, minha])

  useEffect(() => {
    if (podeVer) carregar()
  }, [carregar, podeVer])

  if (!podeVer) return <div className="pagina"><p>Somente o próprio filho, o zelador e quem ele autorizar veem esta ficha.</p></div>
  if (carregando) return <div className="pagina"><p className="sutil">Carregando a ficha…</p></div>

  const precisaAceite = minha && !ficha?.consentimento_em
  const outrasCasas = casas.filter((c) => c.terreiro_id !== terreiro && c.aprovado)

  function mudar<K extends keyof Campos>(campo: K, valor: Campos[K]) {
    setCampos((c) => ({ ...c, [campo]: valor }))
  }

  async function salvar() {
    if (precisaAceite && !aceite) return setErro('Marque que concorda em guardar estes dados para salvar.')
    setSalvando(true)
    setErro('')
    const dados = minha
      ? { ...campos, medicamentos: campos.medicamentos.filter((m) => m.nome.trim()), extras }
      : { ...Object.fromEntries(ESPIRITUAL.map((k) => [k, campos[k]])), extras }
    const { error } = await supabase.rpc('salvar_ficha', {
      p_perfil: dono, p_terreiro: terreiro, p_dados: dados, p_consentimento: aceite || !precisaAceite,
    })
    setSalvando(false)
    if (error) return setErro(mensagemDeErro(error))
    avisar('Ficha salva.')
    await carregar()
    setEditando(false)
  }

  async function copiarDe(origem: string) {
    if (precisaAceite && !aceite) return setErro('Marque que concorda em guardar estes dados para copiar.')
    const { error } = await supabase.rpc('copiar_minha_ficha', { p_de: origem, p_para: terreiro })
    if (error) return setErro(mensagemDeErro(error))
    avisar('Ficha copiada. Confira e ajuste o que for diferente nesta casa.')
    await carregar()
  }

  const nome = minha ? 'Minha ficha' : `Ficha de ${nomeDe(irmaos, dono)}`
  const anos = idade(campos.data_nascimento)

  return (
    <div className="pagina">
      <Topo titulo={nome} voltar={minha ? '/casa' : '/casa/fichas'} acao={<>{!editando && (minha || podeEditarEspiritual) && <button className="botao" onClick={() => setEditando(true)}>Editar</button>}</>} />
      <p className="sutil">
        {casaAtiva?.terreiros?.nome}
        {ficha?.atualizado_em && ` · atualizada em ${formatarDataCurta(ficha.atualizado_em)}`}
      </p>

      <p className="nota-privacidade">
        <LockKeyhole size={18} aria-hidden /><span>{minha
          ? 'Só você, o zelador da casa e quem ele autorizar veem esta ficha. Seus irmãos nunca veem. Cada visualização e mudança fica registrada.'
          : 'Dados pessoais e de saúde: trate com sigilo. Esta visualização fica registrada.'}</span>
      </p>

      {!ficha && !editando && <p className="sutil">{minha ? 'Você ainda não preencheu sua ficha.' : 'Este filho ainda não preencheu a ficha.'}</p>}

      {editando && minha && !ficha && outrasCasas.length > 0 && (
        <div className="cartao">
          <strong>Já preencheu em outra casa?</strong>
          <p className="sutil">Copie de lá e ajuste o que for diferente aqui (orixás e guias costumam mudar de casa para casa).</p>
          <div className="chips">
            {outrasCasas.map((c) => (
              <button key={c.terreiro_id} type="button" className="chip" onClick={() => copiarDe(c.terreiro_id)}>
                Copiar de {c.terreiros?.nome}
              </button>
            ))}
          </div>
        </div>
      )}

      {(ficha || editando) && (['pessoal', 'saude', 'espiritual'] as SecaoFicha[]).map((secao) => {
        const padrao = CAMPOS_FICHA.filter((c) => c.secao === secao && !config.ocultos.includes(c.chave))
        const proprios = config.extras.filter((e) => e.secao === secao)
        if (padrao.length + proprios.length === 0) return null
        const pode = editando && (minha || (secao === 'espiritual' && podeEditarEspiritual))
        const Icone = secao === 'pessoal' ? UserRound : secao === 'saude' ? HeartPulse : Sparkles
        return (
          <Secao key={secao} titulo={<><Icone size={20} aria-hidden /> {ROTULO_SECAO[secao]}</>} bloqueada={editando && !pode}>
            {padrao.map((c) => {
              const valor = campos[c.chave as keyof Campos] as string | null
              const mudarEste = (v: string | null) => mudar(c.chave as keyof Campos, v as never)
              switch (c.tipo) {
                case 'remedios':
                  return <Remedios key={c.chave} lista={campos.medicamentos} editando={pode} aoMudar={(l) => mudar('medicamentos', l)} />
                case 'sangue':
                  return <Campo key={c.chave} rotulo={c.rotulo} valor={valor} editando={pode} aoMudar={mudarEste}
                    opcoes={['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Não sei']} />
                case 'nascimento':
                  return <Campo key={c.chave} rotulo={c.rotulo} tipo="date" valor={valor} editando={pode} aoMudar={mudarEste}
                    exibir={(v) => `${formatarDataCurta(v)}${anos !== null ? ` (${anos} anos)` : ''}`} />
                case 'iniciacao':
                  return <Campo key={c.chave} rotulo={c.rotulo} tipo="date" valor={valor} editando={pode} aoMudar={mudarEste}
                    exibir={(v) => `${formatarDataCurta(v)} (${idade(v) ?? 0} ano(s) de santo)`} />
                case 'alergia':
                  return <Campo key={c.chave} rotulo={c.rotulo} valor={valor} editando={pode} aoMudar={mudarEste} longo
                    destaque={Boolean(valor)} vazio="Nenhuma alergia informada" />
                case 'tel':
                  return <Campo key={c.chave} rotulo={c.rotulo} tipo="tel" valor={valor} editando={pode} aoMudar={mudarEste} />
                case 'longo':
                  return <Campo key={c.chave} rotulo={c.rotulo} valor={valor} editando={pode} aoMudar={mudarEste} longo />
                default:
                  return <Campo key={c.chave} rotulo={c.rotulo} valor={valor} editando={pode} aoMudar={mudarEste} />
              }
            })}
            {proprios.map((e) => (
              <CampoProprio key={e.id} campo={e} valor={extras[e.id] ?? null} editando={pode}
                aoMudar={(v) => setExtras((x) => ({ ...x, [e.id]: v ?? '' }))} />
            ))}
          </Secao>
        )
      })}

      {editando && (
        <div className="formulario">
          {!minha && <p className="sutil">Como zelador, você edita a parte espiritual. Pessoal e saúde só o próprio filho altera.</p>}
          {precisaAceite && (
            <label className="aceite">
              <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} />
              <span>
                Concordo que estes dados (inclusive de saúde e religião) fiquem guardados para a minha casa cuidar de mim,
                visíveis só para mim, o zelador e quem ele autorizar. Posso apagar quando quiser.{' '}
                <a href="privacidade.html" target="_blank" rel="noreferrer">Privacidade</a>
              </span>
            </label>
          )}
          {erro && <p className="erro">{erro}</p>}
          <button className="primario" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar ficha'}</button>
          {ficha && <button type="button" className="link" onClick={() => { setEditando(false); carregar() }}>Cancelar</button>}
        </div>
      )}
      {!editando && erro && <p className="erro">{erro}</p>}
      {!minha && !editando && <Link to="/casa/fichas" className="link">Ver todas as fichas</Link>}
    </div>
  )
}

/** Campo criado pela casa (o zelador define o título e o que o filho deve colocar). */
function CampoProprio({ campo, valor, editando, aoMudar }: {
  campo: CampoExtra
  valor: string | null
  editando: boolean
  aoMudar: (v: string | null) => void
}) {
  if (campo.tipo === 'simnao') {
    return <Campo rotulo={campo.titulo} valor={valor} editando={editando} aoMudar={aoMudar} opcoes={['Sim', 'Não']} ajuda={campo.ajuda} />
  }
  if (campo.tipo === 'data') {
    return <Campo rotulo={campo.titulo} tipo="date" valor={valor} editando={editando} aoMudar={aoMudar} ajuda={campo.ajuda}
      exibir={(v) => formatarDataCurta(v)} />
  }
  return <Campo rotulo={campo.titulo} valor={valor} editando={editando} aoMudar={aoMudar} longo={campo.tipo === 'longo'} ajuda={campo.ajuda} />
}

function Secao({ titulo, bloqueada, children }: { titulo: ReactNode; bloqueada?: boolean; children: ReactNode }) {
  return (
    <section className={`cartao ficha-secao ${bloqueada ? 'bloqueada' : ''}`}>
      <h2>{titulo}</h2>
      {children}
    </section>
  )
}

function Campo({ rotulo, valor, editando, aoMudar, tipo = 'text', longo, opcoes, destaque, vazio = '—', exibir, ajuda }: {
  ajuda?: string
  rotulo: string
  valor: string | null
  editando: boolean
  aoMudar: (v: string | null) => void
  tipo?: string
  longo?: boolean
  opcoes?: string[]
  destaque?: boolean
  vazio?: string
  exibir?: (v: string) => string
}) {
  if (!editando) {
    return (
      <div className={`ficha-campo ${destaque ? 'destaque-saude' : ''}`}>
        <span className="sutil">{rotulo}</span>
        <span className="texto-pre">{valor ? (exibir ? exibir(valor) : valor) : <span className="sutil">{vazio}</span>}</span>
      </div>
    )
  }
  const mudar = (v: string) => aoMudar(v === '' ? null : v)
  return (
    <label>
      {rotulo}
      {ajuda && <span className="dica">{ajuda}</span>}
      {opcoes ? (
        <select value={valor ?? ''} onChange={(e) => mudar(e.target.value)}>
          <option value="">—</option>
          {opcoes.map((o) => <option key={o}>{o}</option>)}
        </select>
      ) : longo ? (
        <textarea value={valor ?? ''} onChange={(e) => mudar(e.target.value)} rows={2} maxLength={1000} />
      ) : (
        <input type={tipo} value={valor ?? ''} onChange={(e) => mudar(e.target.value)} maxLength={200} />
      )}
    </label>
  )
}

function Remedios({ lista, editando, aoMudar }: { lista: Medicamento[]; editando: boolean; aoMudar: (l: Medicamento[]) => void }) {
  const trocar = (i: number, m: Partial<Medicamento>) => aoMudar(lista.map((x, j) => (j === i ? { ...x, ...m } : x)))

  if (!editando) {
    return (
      <div className="ficha-campo">
        <span className="sutil">Remédios</span>
        {lista.length === 0 ? <span className="sutil">Nenhum remédio informado</span> : (
          <ul className="remedios">
            {lista.map((m, i) => (
              <li key={i}>
                <strong className="icone-texto"><Pill size={16} aria-hidden /> {m.nome}</strong>{m.dose && ` · ${m.dose}`}
                {m.continuo && <span className="etiqueta situacao-informado">Uso contínuo</span>}
                {m.horarios && <div className="icone-texto"><Clock size={14} aria-hidden /> {m.horarios}</div>}
                {m.para_que && <div className="sutil">Para: {m.para_que}</div>}
                {m.observacao && <div className="sutil">{m.observacao}</div>}
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  return (
    <div className="remedios-edicao">
      <strong>Remédios</strong>
      {lista.map((m, i) => (
        <div key={i} className="remedio">
          <input value={m.nome} onChange={(e) => trocar(i, { nome: e.target.value })} placeholder="Nome do remédio" maxLength={80} aria-label="Nome do remédio" />
          <input value={m.dose ?? ''} onChange={(e) => trocar(i, { dose: e.target.value })} placeholder="Dose (ex.: 50 mg, 1 comprimido)" maxLength={40} aria-label="Dose" />
          <input value={m.horarios ?? ''} onChange={(e) => trocar(i, { horarios: e.target.value })} placeholder="Horários (ex.: 8h e 20h)" maxLength={60} aria-label="Horários" />
          <input value={m.para_que ?? ''} onChange={(e) => trocar(i, { para_que: e.target.value })} placeholder="Para que serve" maxLength={80} aria-label="Para que serve" />
          <input value={m.observacao ?? ''} onChange={(e) => trocar(i, { observacao: e.target.value })} placeholder="Observação (opcional)" maxLength={120} aria-label="Observação" />
          <div className="linha">
            <label className="opcao cresce">
              <input type="checkbox" checked={Boolean(m.continuo)} onChange={(e) => trocar(i, { continuo: e.target.checked })} />
              Uso contínuo
            </label>
            <button type="button" className="link perigo" onClick={() => aoMudar(lista.filter((_, j) => j !== i))}>Tirar</button>
          </div>
        </div>
      ))}
      <button type="button" className="botao" onClick={() => aoMudar([...lista, { nome: '', continuo: true }])}>+ Adicionar remédio</button>
    </div>
  )
}
