import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { avisar } from '../lib/avisos'
import { useIrmaos, nomeDe } from '../lib/casa'
import { ehZelador, temPermissao, useSessao } from '../lib/sessao'
import { mensagemDeErro, supabase } from '../lib/supabase'
import { formatarDataCurta, idade, type Ficha as TipoFicha, type Medicamento } from '../lib/tipos'

type Campos = Omit<TipoFicha, 'perfil_id' | 'terreiro_id' | 'consentimento_em' | 'atualizado_em' | 'atualizado_por'>

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
  const navegar = useNavigate()
  const terreiro = casaAtiva?.terreiro_id
  const dono = id ?? perfil?.id
  const minha = dono === perfil?.id
  const irmaos = useIrmaos(minha ? undefined : terreiro)
  const [ficha, setFicha] = useState<TipoFicha | null>(null)
  const [campos, setCampos] = useState<Campos>(VAZIA)
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
      ? { ...campos, medicamentos: campos.medicamentos.filter((m) => m.nome.trim()) }
      : Object.fromEntries(ESPIRITUAL.map((k) => [k, campos[k]]))
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
      <button className="link" onClick={() => navegar(minha ? '/casa' : '/casa/fichas')}>← {minha ? 'Casa' : 'Fichas dos filhos'}</button>
      <div className="cabecalho">
        <h1>{nome}</h1>
        {!editando && (minha || podeEditarEspiritual) && <button className="botao" onClick={() => setEditando(true)}>Editar</button>}
      </div>
      <p className="sutil">
        {casaAtiva?.terreiros?.nome}
        {ficha?.atualizado_em && ` · atualizada em ${formatarDataCurta(ficha.atualizado_em)}`}
      </p>

      <p className="aviso-pequeno">
        🔒 {minha
          ? 'Só você, o zelador da casa e quem ele autorizar veem esta ficha. Seus irmãos nunca veem. Cada visualização e mudança fica registrada.'
          : 'Dados pessoais e de saúde: trate com sigilo. Esta visualização fica registrada.'}
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

      {(ficha || editando) && (
        <>
          <Secao titulo="👤 Pessoal" bloqueada={editando && !minha}>
            <Campo rotulo="Nome completo" valor={campos.nome_completo} editando={editando && minha} aoMudar={(v) => mudar('nome_completo', v)} />
            <Campo rotulo="Data de nascimento" tipo="date" valor={campos.data_nascimento} editando={editando && minha}
              aoMudar={(v) => mudar('data_nascimento', v)}
              exibir={(v) => `${formatarDataCurta(v)}${anos !== null ? ` (${anos} anos)` : ''}`} />
            <Campo rotulo="Telefone" tipo="tel" valor={campos.telefone} editando={editando && minha} aoMudar={(v) => mudar('telefone', v)} />
            <Campo rotulo="Contato de emergência (nome e telefone)" valor={campos.contato_emergencia} editando={editando && minha}
              aoMudar={(v) => mudar('contato_emergencia', v)} />
          </Secao>

          <Secao titulo="🩺 Saúde" bloqueada={editando && !minha}>
            <Campo rotulo="Alergias (remédios, alimentos, ervas, animais...)" valor={campos.alergias} editando={editando && minha}
              aoMudar={(v) => mudar('alergias', v)} longo destaque={Boolean(campos.alergias)} vazio="Nenhuma alergia informada" />
            <Campo rotulo="Problemas de saúde (pressão, diabetes, coração, gravidez...)" valor={campos.condicoes_saude}
              editando={editando && minha} aoMudar={(v) => mudar('condicoes_saude', v)} longo />
            <Campo rotulo="Tipo sanguíneo" valor={campos.tipo_sanguineo} editando={editando && minha}
              aoMudar={(v) => mudar('tipo_sanguineo', v)} opcoes={['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Não sei']} />
            <Remedios lista={campos.medicamentos} editando={editando && minha} aoMudar={(l) => mudar('medicamentos', l)} />
          </Secao>

          <Secao titulo="🕯️ Espiritual">
            <Campo rotulo="Orixá de cabeça (pai/mãe de cabeça, Ori)" valor={campos.orixa_cabeca} editando={editando && podeEditarEspiritual}
              aoMudar={(v) => mudar('orixa_cabeca', v)} />
            <Campo rotulo="Juntó / segundo orixá" valor={campos.orixa_ajunto} editando={editando && podeEditarEspiritual}
              aoMudar={(v) => mudar('orixa_ajunto', v)} />
            <Campo rotulo="Outros orixás" valor={campos.outros_orixas} editando={editando && podeEditarEspiritual}
              aoMudar={(v) => mudar('outros_orixas', v)} />
            <Campo rotulo="Nome de santo (dijina)" valor={campos.nome_de_santo} editando={editando && podeEditarEspiritual}
              aoMudar={(v) => mudar('nome_de_santo', v)} />
            <Campo rotulo="Data de iniciação / feitura" tipo="date" valor={campos.data_iniciacao} editando={editando && podeEditarEspiritual}
              aoMudar={(v) => mudar('data_iniciacao', v)}
              exibir={(v) => `${formatarDataCurta(v)} (${idade(v) ?? 0} ano(s) de santo)`} />
            <Campo rotulo="Guias (caboclos, pretos-velhos, baianos, boiadeiros...)" valor={campos.guias} longo
              editando={editando && podeEditarEspiritual} aoMudar={(v) => mudar('guias', v)} />
            <Campo rotulo="Mestres e mestras (Jurema)" valor={campos.mestres} longo editando={editando && podeEditarEspiritual}
              aoMudar={(v) => mudar('mestres', v)} />
            <Campo rotulo="Exus, pombagiras, erês e outras entidades" valor={campos.entidades} longo
              editando={editando && podeEditarEspiritual} aoMudar={(v) => mudar('entidades', v)} />
            <Campo rotulo="Observações" valor={campos.observacoes} longo editando={editando && podeEditarEspiritual}
              aoMudar={(v) => mudar('observacoes', v)} />
          </Secao>
        </>
      )}

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

function Secao({ titulo, bloqueada, children }: { titulo: string; bloqueada?: boolean; children: ReactNode }) {
  return (
    <section className={`cartao ficha-secao ${bloqueada ? 'bloqueada' : ''}`}>
      <h2>{titulo}</h2>
      {children}
    </section>
  )
}

function Campo({ rotulo, valor, editando, aoMudar, tipo = 'text', longo, opcoes, destaque, vazio = '—', exibir }: {
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
                <strong>💊 {m.nome}</strong>{m.dose && ` · ${m.dose}`}
                {m.continuo && <span className="etiqueta situacao-informado">Uso contínuo</span>}
                {m.horarios && <div>🕑 {m.horarios}</div>}
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
