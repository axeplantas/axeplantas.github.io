import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { avisar } from '../lib/avisos'
import { hoje, ROTULO_SITUACAO, seAplica, valorDe, type Pessoa, type Situacao } from '../lib/financeiro'
import { prepararFoto } from '../lib/imagem'
import { ehGestorFinanceiro, useSessao } from '../lib/sessao'
import { mensagemDeErro, supabase } from '../lib/supabase'
import { confirmar, copiar as copiarTexto, pedirTexto } from '../lib/dialogo'
import {
  formatarDataCurta, formatarReais,
  type Cobranca, type FinanceiroCasa, type MembroDaCasa, type Pagamento,
} from '../lib/tipos'

async function abrirComprovante(caminho: string) {
  const janela = window.open('', '_blank')
  const { data } = await supabase.storage.from('comprovantes').createSignedUrl(caminho, 600)
  if (data?.signedUrl && janela) janela.location.href = data.signedUrl
  else {
    janela?.close()
    avisar('Não foi possível abrir o comprovante.', 'erro')
  }
}

export default function Financeiro() {
  const { perfil, casaAtiva } = useSessao()
  const navegar = useNavigate()
  const terreiro = casaAtiva?.terreiro_id
  const gestor = ehGestorFinanceiro(casaAtiva)
  const [config, setConfig] = useState<FinanceiroCasa | null>(null)
  const [cobrancas, setCobrancas] = useState<Cobranca[]>([])
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([])
  const [alvos, setAlvos] = useState<Set<string>>(new Set())
  const [membros, setMembros] = useState<MembroDaCasa[]>([])
  const [carregado, setCarregado] = useState(false)
  const [aba, setAba] = useState<'minhas' | 'conferir' | 'situacao' | 'contribuicoes' | 'configurar'>('minhas')

  const carregar = useCallback(async () => {
    if (!terreiro) return
    await supabase.rpc('garantir_mensalidades', { p_terreiro: terreiro })
    const [f, c, p, a, m] = await Promise.all([
      supabase.from('financeiro_casa').select('*').eq('terreiro_id', terreiro).maybeSingle(),
      supabase.from('cobrancas').select('*').eq('terreiro_id', terreiro).order('vencimento', { ascending: false }),
      supabase.from('pagamentos').select('*').eq('terreiro_id', terreiro),
      supabase.from('cobranca_alvos').select('cobranca_id, perfil_id'),
      gestor
        ? supabase.from('membros').select('*, perfis(apelido)').eq('terreiro_id', terreiro).eq('aprovado', true)
        : Promise.resolve({ data: [] }),
    ])
    setConfig((f.data as FinanceiroCasa | null) ?? null)
    setCobrancas((c.data ?? []) as Cobranca[])
    setPagamentos((p.data ?? []) as Pagamento[])
    setAlvos(new Set(((a.data ?? []) as { cobranca_id: string; perfil_id: string }[]).map((x) => `${x.cobranca_id}:${x.perfil_id}`)))
    setMembros(((m.data ?? []) as unknown as MembroDaCasa[]).sort((x, y) =>
      (x.perfis?.apelido ?? '').localeCompare(y.perfis?.apelido ?? '', 'pt-BR')))
    setCarregado(true)
  }, [terreiro, gestor])

  useEffect(() => {
    carregar()
  }, [carregar])

  const paraConferir = pagamentos.filter((p) => p.status === 'informado')

  useEffect(() => {
    if (gestor && paraConferir.length > 0 && aba === 'minhas') setAba('conferir')
    // Só ao abrir a tela: leva o gestor direto ao que precisa de atenção.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregado])

  if (!terreiro || !perfil || !casaAtiva) return <div className="pagina"><p>Escolha uma casa primeiro.</p></div>

  const eu: Pessoa = { perfil_id: perfil.id, isento: casaAtiva.isento, mensalidade_valor: casaAtiva.mensalidade_valor, aprovado_em: casaAtiva.aprovado_em }

  return (
    <div className="pagina">
      <button className="link" onClick={() => navegar('/casa')}>← Casa</button>
      <h1>Financeiro</h1>
      <p className="sutil">{casaAtiva.terreiros?.nome}</p>

      {gestor && (
        <div className="abas abas-rolaveis">
          <button className={aba === 'minhas' ? 'ativa' : ''} onClick={() => setAba('minhas')}>Minhas</button>
          <button className={aba === 'conferir' ? 'ativa' : ''} onClick={() => setAba('conferir')}>
            Conferir{paraConferir.length > 0 ? ` (${paraConferir.length})` : ''}
          </button>
          <button className={aba === 'situacao' ? 'ativa' : ''} onClick={() => setAba('situacao')}>Quem pagou</button>
          <button className={aba === 'contribuicoes' ? 'ativa' : ''} onClick={() => setAba('contribuicoes')}>Contribuições</button>
          <button className={aba === 'configurar' ? 'ativa' : ''} onClick={() => setAba('configurar')}>Configurar</button>
        </div>
      )}

      {!carregado && <p className="sutil">Carregando…</p>}

      {carregado && aba === 'minhas' && (
        <Minhas eu={eu} terreiro={terreiro} config={config} cobrancas={cobrancas} pagamentos={pagamentos}
          alvos={alvos} gestor={gestor} aoMudar={carregar} irConfigurar={() => setAba('configurar')} />
      )}
      {carregado && aba === 'conferir' && (
        <Conferir pendentes={paraConferir} cobrancas={cobrancas} membros={membros} aoMudar={carregar} />
      )}
      {carregado && aba === 'situacao' && (
        <QuemPagou config={config} cobrancas={cobrancas} pagamentos={pagamentos} alvos={alvos} membros={membros} aoMudar={carregar} />
      )}
      {carregado && aba === 'contribuicoes' && (
        <Contribuicoes terreiro={terreiro} cobrancas={cobrancas} membros={membros} aoMudar={carregar} />
      )}
      {carregado && aba === 'configurar' && <Configurar terreiro={terreiro} config={config} aoSalvar={carregar} />}
    </div>
  )
}

// ---------------------------------------------------------------------
// Filho: o que eu devo e informar pagamento
// ---------------------------------------------------------------------

function Minhas({ eu, terreiro, config, cobrancas, pagamentos, alvos, gestor, aoMudar, irConfigurar }: {
  eu: Pessoa
  terreiro: string
  config: FinanceiroCasa | null
  cobrancas: Cobranca[]
  pagamentos: Pagamento[]
  alvos: Set<string>
  gestor: boolean
  aoMudar: () => Promise<void>
  irConfigurar: () => void
}) {
  const [verPagas, setVerPagas] = useState(false)
  const [informando, setInformando] = useState<string | null>(null)

  const minhas = cobrancas
    .filter((c) => seAplica(c, eu, config, alvos))
    .map((c) => {
      const pagamento = pagamentos.find((p) => p.cobranca_id === c.id && p.perfil_id === eu.perfil_id)
      const situacao: Situacao = pagamento?.status ?? 'aberto'
      return { c, pagamento, situacao, valor: pagamento?.valor ?? valorDe(c, eu, config) }
    })
  const pendentes = minhas.filter((x) => x.situacao === 'aberto' || x.situacao === 'recusado' || x.situacao === 'informado')
  const pagas = minhas.filter((x) => x.situacao === 'confirmado' || x.situacao === 'isento')
  const emAberto = pendentes.filter((x) => x.situacao !== 'informado')

  return (
    <>
      {!config && gestor && (
        <div className="aviso">
          A mensalidade da casa ainda não foi configurada.{' '}
          <button className="link" onClick={irConfigurar}>Configurar agora</button>
        </div>
      )}

      {config?.instrucoes && <InstrucoesPagamento texto={config.instrucoes} />}

      <div className={`cartao resumo-financeiro ${emAberto.length === 0 ? 'em-dia' : ''}`}>
        {emAberto.length === 0 ? (
          <strong>✔ Você está em dia com a casa.</strong>
        ) : (
          <>
            <strong>{emAberto.length} em aberto · {formatarReais(emAberto.reduce((s, x) => s + x.valor, 0))}</strong>
            <span className="sutil">Pague e toque em “Informar pagamento” para mandar o comprovante.</span>
          </>
        )}
      </div>

      {pendentes.map(({ c, pagamento, situacao, valor }) => {
        const vencida = situacao === 'aberto' && c.vencimento < hoje()
        return (
          <div key={c.id} className={`cartao cobranca ${vencida ? 'vencida' : ''}`}>
            <div className="cabecalho">
              <strong>{c.titulo}</strong>
              <strong>{formatarReais(valor)}</strong>
            </div>
            {c.descricao && <p className="sutil">{c.descricao}</p>}
            <div className="sutil">Vencimento: {formatarDataCurta(c.vencimento)}{vencida ? ' · vencida' : ''}</div>
            <span className={`etiqueta situacao-${situacao}`}>{ROTULO_SITUACAO[situacao]}</span>
            {situacao === 'recusado' && pagamento?.motivo && <p className="erro">Motivo: {pagamento.motivo}</p>}
            {pagamento?.comprovante && (
              <button className="link" onClick={() => abrirComprovante(pagamento.comprovante!)}>Ver meu comprovante</button>
            )}
            {informando === c.id ? (
              <InformarPagamento terreiro={terreiro} perfilId={eu.perfil_id} cobranca={c}
                aoTerminar={async (ok) => { setInformando(null); if (ok) await aoMudar() }} />
            ) : (
              <button className={situacao === 'informado' ? 'link' : 'primario'} onClick={() => setInformando(c.id)}>
                {situacao === 'informado' ? 'Trocar comprovante' : situacao === 'recusado' ? 'Enviar de novo' : 'Informar pagamento'}
              </button>
            )}
          </div>
        )
      })}

      {pagas.length > 0 && (
        <section>
          <button className="link" onClick={() => setVerPagas((v) => !v)}>
            {verPagas ? 'Esconder' : 'Ver'} pagas ({pagas.length})
          </button>
          {verPagas && pagas.map(({ c, situacao, valor, pagamento }) => (
            <div key={c.id} className="linha item-pago">
              <span className="cresce">✔ {c.titulo}</span>
              <span className="sutil">{situacao === 'isento' ? 'Isento' : formatarReais(valor)}</span>
              {pagamento?.comprovante && <button className="link" onClick={() => abrirComprovante(pagamento.comprovante!)}>Ver</button>}
            </div>
          ))}
        </section>
      )}

      {minhas.length === 0 && config && <p className="sutil">Nenhuma cobrança para você por enquanto.</p>}
    </>
  )
}

function InstrucoesPagamento({ texto }: { texto: string }) {
  async function copiar() {
    if (await copiarTexto(texto)) avisar('Copiado! Cole no app do banco.')
  }
  return (
    <div className="cartao instrucoes-pagamento">
      <div className="cabecalho">
        <strong>Como pagar</strong>
        <button className="botao" onClick={copiar}>Copiar</button>
      </div>
      <p className="texto-pre">{texto}</p>
    </div>
  )
}

function InformarPagamento({ terreiro, perfilId, cobranca, aoTerminar }: {
  terreiro: string
  perfilId: string
  cobranca: Cobranca
  aoTerminar: (ok: boolean) => void
}) {
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [observacao, setObservacao] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!arquivo) return setErro('Anexe o comprovante (foto ou PDF).')
    if (!navigator.onLine) return setErro('Sem internet. Tente de novo quando tiver sinal.')
    setErro('')
    setEnviando(true)
    let caminho: string | null = null
    try {
      const ehPdf = arquivo.type === 'application/pdf'
      if (ehPdf && arquivo.size > 5 * 1024 * 1024) throw new Error('O PDF é muito grande (máximo 5 MB).')
      const conteudo = ehPdf ? arquivo : await prepararFoto(arquivo, 1800)
      caminho = `${terreiro}/${perfilId}/${crypto.randomUUID()}.${ehPdf ? 'pdf' : 'jpg'}`
      const envio = await supabase.storage.from('comprovantes').upload(caminho, conteudo, {
        contentType: ehPdf ? 'application/pdf' : 'image/jpeg',
      })
      if (envio.error) throw envio.error
      const { error } = await supabase.rpc('informar_pagamento', {
        p_cobranca: cobranca.id, p_comprovante: caminho, p_observacao: observacao,
      })
      if (error) throw error
      avisar('Comprovante enviado! O zelador ou o contador vai conferir.')
      aoTerminar(true)
    } catch (err) {
      if (caminho) await supabase.storage.from('comprovantes').remove([caminho])
      setErro(mensagemDeErro(err))
      setEnviando(false)
    }
  }

  return (
    <form className="formulario informar" onSubmit={enviar}>
      <label className="botao-foto">
        {arquivo ? `📎 ${arquivo.name}` : '📎 Anexar comprovante (foto, print ou PDF)'}
        <input type="file" accept="image/*,application/pdf" hidden onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
      </label>
      <label>
        Observação (opcional)
        <input value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={200} placeholder="Ex.: paguei via Pix no dia 05" />
      </label>
      {erro && <p className="erro">{erro}</p>}
      <div className="linha">
        <button className="primario" disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar comprovante'}</button>
        <button type="button" className="link" onClick={() => aoTerminar(false)}>Cancelar</button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------
// Zelador / contador
// ---------------------------------------------------------------------

function nomeDe(membros: MembroDaCasa[], perfilId: string): string {
  return membros.find((m) => m.perfil_id === perfilId)?.perfis?.apelido ?? 'Filho(a)'
}

async function conferir(cobranca: string, perfilId: string, status: 'confirmado' | 'recusado' | 'isento', motivo: string | null, sucesso: string) {
  const { error } = await supabase.rpc('conferir_pagamento', {
    p_cobranca: cobranca, p_perfil: perfilId, p_status: status, p_motivo: motivo,
  })
  if (error) {
    avisar(mensagemDeErro(error), 'erro')
    return false
  }
  avisar(sucesso)
  return true
}

function Conferir({ pendentes, cobrancas, membros, aoMudar }: {
  pendentes: Pagamento[]
  cobrancas: Cobranca[]
  membros: MembroDaCasa[]
  aoMudar: () => Promise<void>
}) {
  const [ocupado, setOcupado] = useState<string | null>(null)

  async function agir(p: Pagamento, status: 'confirmado' | 'recusado') {
    const nome = nomeDe(membros, p.perfil_id)
    let motivo: string | null = null
    if (status === 'recusado') {
      motivo = await pedirTexto(`Recusar o comprovante de ${nome}?`, {
        texto: 'Diga o motivo: a pessoa vai ver e poderá enviar de novo.', campo: 'Motivo', botao: 'Recusar comprovante',
      })
      if (!motivo) return
    }
    setOcupado(p.id)
    const ok = await conferir(p.cobranca_id, p.perfil_id, status, motivo,
      status === 'confirmado' ? `Pagamento de ${nome} confirmado.` : 'Comprovante recusado.')
    setOcupado(null)
    if (ok) await aoMudar()
  }

  if (pendentes.length === 0) {
    return <div className="cartao tudo-em-dia"><strong>✔ Nenhum comprovante para conferir.</strong></div>
  }

  return (
    <>
      <p className="sutil">Abra o comprovante, confira o valor e a data, e confirme. Se algo estiver errado, recuse dizendo o motivo.</p>
      {pendentes.map((p) => {
        const c = cobrancas.find((x) => x.id === p.cobranca_id)
        return (
          <div key={p.id} className="cartao">
            <div className="cabecalho">
              <strong>{nomeDe(membros, p.perfil_id)}</strong>
              <strong>{formatarReais(p.valor)}</strong>
            </div>
            <div>{c?.titulo}</div>
            <div className="sutil">Enviado em {p.informado_em ? new Date(p.informado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</div>
            {p.observacao && <p>“{p.observacao}”</p>}
            {p.comprovante && <button className="botao" onClick={() => abrirComprovante(p.comprovante!)}>📎 Ver comprovante</button>}
            <div className="linha">
              <button className="primario" disabled={ocupado === p.id} onClick={() => agir(p, 'confirmado')}>Confirmar</button>
              <button className="link perigo" disabled={ocupado === p.id} onClick={() => agir(p, 'recusado')}>Recusar</button>
            </div>
          </div>
        )
      })}
    </>
  )
}

function QuemPagou({ config, cobrancas, pagamentos, alvos, membros, aoMudar }: {
  config: FinanceiroCasa | null
  cobrancas: Cobranca[]
  pagamentos: Pagamento[]
  alvos: Set<string>
  membros: MembroDaCasa[]
  aoMudar: () => Promise<void>
}) {
  const [escolhida, setEscolhida] = useState(cobrancas[0]?.id ?? '')
  const c = cobrancas.find((x) => x.id === escolhida)

  const linhas = useMemo(() => {
    if (!c) return []
    return membros
      .filter((m) => seAplica(c, m, config, alvos))
      .map((m) => {
        const p = pagamentos.find((x) => x.cobranca_id === c.id && x.perfil_id === m.perfil_id)
        const situacao: Situacao = p?.status ?? 'aberto'
        return { m, p, situacao, valor: p?.valor ?? valorDe(c, m, config) }
      })
  }, [c, membros, pagamentos, alvos, config])

  if (cobrancas.length === 0) return <p className="sutil">Nenhuma cobrança ainda. Configure a mensalidade ou crie uma contribuição.</p>

  const pagos = linhas.filter((l) => l.situacao === 'confirmado')
  const faltam = linhas.filter((l) => l.situacao === 'aberto' || l.situacao === 'recusado')
  const total = linhas.filter((l) => l.situacao !== 'isento').reduce((s, l) => s + l.valor, 0)
  const recebido = pagos.reduce((s, l) => s + l.valor, 0)

  async function copiarPendentes() {
    const texto = `${c?.titulo} — falta pagar:\n${faltam.map((l) => `• ${l.m.perfis?.apelido} (${formatarReais(l.valor)})`).join('\n')}`
    if (await copiarTexto(texto)) avisar('Lista copiada! Cole no WhatsApp.')
  }

  async function marcar(perfilId: string, status: 'confirmado' | 'isento', nome: string) {
    const pergunta = status === 'confirmado'
      ? `Registrar que ${nome} pagou (em dinheiro ou sem comprovante)?`
      : `Isentar ${nome} desta cobrança?`
    if (!(await confirmar(pergunta, { botao: status === 'confirmado' ? 'Registrar pagamento' : 'Isentar' }))) return
    if (await conferir(c!.id, perfilId, status, null, status === 'confirmado' ? 'Pagamento registrado.' : 'Isenção registrada.')) {
      await aoMudar()
    }
  }

  return (
    <>
      <select value={escolhida} onChange={(e) => setEscolhida(e.target.value)} aria-label="Escolher cobrança">
        {cobrancas.map((x) => <option key={x.id} value={x.id}>{x.titulo} · vence {formatarDataCurta(x.vencimento).slice(0, 5)}</option>)}
      </select>

      <div className="cartao resumo-financeiro">
        <strong>Recebido {formatarReais(recebido)} de {formatarReais(total)}</strong>
        <span className="sutil">{pagos.length} pago(s) · {faltam.length} em aberto · {linhas.filter((l) => l.situacao === 'informado').length} para conferir</span>
        <div className="barra-progresso"><div style={{ width: `${total ? (recebido / total) * 100 : 0}%` }} /></div>
        {faltam.length > 0 && <button className="link" onClick={copiarPendentes}>Copiar lista de quem falta (para o WhatsApp)</button>}
      </div>

      {linhas.map(({ m, p, situacao, valor }) => {
        const nome = m.perfis?.apelido ?? 'Filho(a)'
        return (
          <div key={m.perfil_id} className="linha item-situacao">
            <span className="cresce">
              <strong>{nome}</strong>
              <span className="sutil"> · {formatarReais(valor)}</span>
              <div><span className={`etiqueta situacao-${situacao}`}>{ROTULO_SITUACAO[situacao]}</span></div>
            </span>
            {p?.comprovante && <button className="link" onClick={() => abrirComprovante(p.comprovante!)}>Comprovante</button>}
            {(situacao === 'aberto' || situacao === 'recusado') && (
              <>
                <button className="link" onClick={() => marcar(m.perfil_id, 'confirmado', nome)}>Recebi</button>
                <button className="link" onClick={() => marcar(m.perfil_id, 'isento', nome)}>Isentar</button>
              </>
            )}
          </div>
        )
      })}
      {linhas.length === 0 && <p className="sutil">Ninguém deve esta cobrança.</p>}
    </>
  )
}

function Contribuicoes({ terreiro, cobrancas, membros, aoMudar }: {
  terreiro: string
  cobrancas: Cobranca[]
  membros: MembroDaCasa[]
  aoMudar: () => Promise<void>
}) {
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [vencimento, setVencimento] = useState('')
  const [todos, setTodos] = useState(true)
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set())
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const existentes = cobrancas.filter((c) => c.tipo === 'contribuicao')

  async function criar(e: FormEvent) {
    e.preventDefault()
    if (!todos && escolhidos.size === 0) return setErro('Escolha pelo menos um filho, ou marque “Todos da casa”.')
    setErro('')
    setSalvando(true)
    const { error } = await supabase.rpc('criar_contribuicao', {
      p_terreiro: terreiro, p_titulo: titulo, p_descricao: descricao, p_valor: Number(valor),
      p_vencimento: vencimento, p_pessoas: todos ? [] : [...escolhidos],
    })
    setSalvando(false)
    if (error) return setErro(mensagemDeErro(error))
    avisar('Contribuição criada! Os filhos foram avisados.')
    setTitulo('')
    setDescricao('')
    setValor('')
    setVencimento('')
    setEscolhidos(new Set())
    await aoMudar()
  }

  async function apagar(c: Cobranca) {
    if (!(await confirmar(`Apagar “${c.titulo}”?`, { texto: 'Os pagamentos já informados também somem.', botao: 'Apagar', perigo: true }))) return
    const { error } = await supabase.rpc('apagar_cobranca', { p_cobranca: c.id })
    if (error) return avisar(mensagemDeErro(error), 'erro')
    avisar('Contribuição apagada.')
    await aoMudar()
  }

  return (
    <>
      <form className="cartao formulario" onSubmit={criar}>
        <h2>Nova contribuição</h2>
        <p className="sutil">Para festas, obrigações coletivas, reformas… Segue o mesmo caminho da mensalidade: o filho manda o comprovante e você confere.</p>
        <label>
          O que é *
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} required maxLength={80} placeholder="Ex.: Contribuição para a festa de Erê" />
        </label>
        <label>
          Detalhes (opcional)
          <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} maxLength={300} />
        </label>
        <div className="linha">
          <label className="cresce">
            Valor (R$) *
            <input type="number" inputMode="decimal" min="0.01" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} required placeholder="70,00" />
          </label>
          <label className="cresce">
            Pagar até *
            <input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} required />
          </label>
        </div>
        <div className="opcoes">
          <label className="opcao"><input type="radio" checked={todos} onChange={() => setTodos(true)} /> Todos da casa</label>
          <label className="opcao"><input type="radio" checked={!todos} onChange={() => setTodos(false)} /> Só alguns filhos</label>
        </div>
        {!todos && (
          <div className="lista-escolha">
            {membros.map((m) => (
              <label key={m.perfil_id} className="opcao">
                <input type="checkbox" checked={escolhidos.has(m.perfil_id)}
                  onChange={(e) => setEscolhidos((s) => {
                    const novo = new Set(s)
                    if (e.target.checked) novo.add(m.perfil_id)
                    else novo.delete(m.perfil_id)
                    return novo
                  })} />
                {m.perfis?.apelido}
              </label>
            ))}
          </div>
        )}
        {erro && <p className="erro">{erro}</p>}
        <button className="primario" disabled={salvando}>{salvando ? 'Criando…' : 'Criar e avisar os filhos'}</button>
      </form>

      {existentes.length > 0 && (
        <section>
          <h2>Contribuições criadas</h2>
          {existentes.map((c) => (
            <div key={c.id} className="linha item-situacao">
              <span className="cresce">
                <strong>{c.titulo}</strong>
                <span className="sutil"> · {formatarReais(c.valor)} · até {formatarDataCurta(c.vencimento)} · {c.para_todos ? 'todos' : 'alguns filhos'}</span>
              </span>
              <button className="link perigo" onClick={() => apagar(c)}>Apagar</button>
            </div>
          ))}
        </section>
      )}
    </>
  )
}

function Configurar({ terreiro, config, aoSalvar }: { terreiro: string; config: FinanceiroCasa | null; aoSalvar: () => Promise<void> }) {
  const [cobra, setCobra] = useState(config?.cobra_mensalidade ?? true)
  const [valor, setValor] = useState(config?.valor_padrao?.toString() ?? '')
  const [dia, setDia] = useState(config?.dia_vencimento?.toString() ?? '10')
  const [inicio, setInicio] = useState((config?.inicio ?? new Date().toISOString()).slice(0, 7))
  const [instrucoes, setInstrucoes] = useState(config?.instrucoes ?? '')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setSalvando(true)
    const { error } = await supabase.rpc('configurar_financeiro', {
      p_terreiro: terreiro, p_cobra: cobra, p_valor: Number(valor || 0), p_dia: Number(dia),
      p_instrucoes: instrucoes, p_inicio: `${inicio}-01`,
    })
    setSalvando(false)
    if (error) return setErro(mensagemDeErro(error))
    avisar('Configuração salva.')
    await aoSalvar()
  }

  return (
    <form className="cartao formulario" onSubmit={salvar}>
      <h2>Mensalidade da casa</h2>
      <label className="opcao">
        <input type="checkbox" checked={cobra} onChange={(e) => setCobra(e.target.checked)} />
        A casa cobra mensalidade
      </label>
      {cobra && (
        <>
          <div className="linha">
            <label className="cresce">
              Valor padrão (R$)
              <input type="number" inputMode="decimal" min="0" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} required />
            </label>
            <label className="cresce">
              Vence todo dia
              <input type="number" min="1" max="28" value={dia} onChange={(e) => setDia(e.target.value)} required />
            </label>
          </div>
          <label>
            Começar a cobrar a partir de
            <input type="month" value={inicio} onChange={(e) => setInicio(e.target.value)} required />
          </label>
          <p className="sutil">
            Valores diferentes para um filho, ou isenção (por exemplo, para o zelador), ficam em{' '}
            <Link to="/casa/membros">Filhos da casa</Link>.
          </p>
        </>
      )}
      <label>
        Como pagar (chave Pix, banco, observações)
        <textarea value={instrucoes} onChange={(e) => setInstrucoes(e.target.value)} rows={3} maxLength={500}
          placeholder={'Ex.: Pix (CPF): 000.000.000-00\nNome: Fulano de Tal'} />
        <span className="dica">Aparece para todos os filhos, com um botão para copiar.</span>
      </label>
      {erro && <p className="erro">{erro}</p>}
      <button className="primario" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
    </form>
  )
}
