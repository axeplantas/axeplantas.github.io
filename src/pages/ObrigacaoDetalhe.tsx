import { Bean, Bird, Brush, CircleCheck, CookingPot, Flame, Hand, Leaf, Map as IconeMapa, Package, Shirt, Soup, Trash2, TriangleAlert, Users, Wine, Wrench, X, type LucideIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import SeletorFolha from '../components/SeletorFolha'
import { avisar } from '../lib/avisos'
import { comUnidade, nomeDe, useIrmaos } from '../lib/casa'
import { distanciaEmMetros, formatarDistancia, linkComoChegar } from '../lib/distancia'
import { ehEquipe, ehValidador, temPermissao, useSessao } from '../lib/sessao'
import { mensagemDeErro, supabase } from '../lib/supabase'
import {
  ROTULO_CATEGORIA_ITEM, UNIDADES,
  type CategoriaItem, type Contribuicao, type Folha, type Irmao, type ItemObrigacao, type Obrigacao, type Ponto,
} from '../lib/tipos'
import { formatarData } from './Obrigacoes'
import { confirmar } from '../lib/dialogo'
import Topo from '../components/Topo'

type PontoSimples = Pick<Ponto, 'id' | 'folha_id' | 'lat' | 'lng'>
type FolhaSimples = Pick<Folha, 'id' | 'nome_popular' | 'status' | 'nome_cientifico' | 'outros_nomes'>

const numero = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })

const ICONE_CATEGORIA: Record<CategoriaItem, LucideIcon> = {
  folha: Leaf, animal: Bird, semente: Bean, vela: Flame, bebida: Wine, alimento: CookingPot,
  louca: Soup, tecido: Shirt, ferramenta: Wrench, outro: Package,
}

function IconeCategoria({ categoria }: { categoria: CategoriaItem }) {
  const Icone = ICONE_CATEGORIA[categoria] ?? Package
  return <span className="tile pequeno" aria-hidden><Icone size={18} /></span>
}

export function nomeDoItem(i: ItemObrigacao): string {
  return i.nome ?? i.folhas?.nome_popular ?? 'Item'
}

export default function ObrigacaoDetalhe() {
  const { id } = useParams()
  const { perfil, casaAtiva, casas, modulos, trocarCasa } = useSessao()
  const navegar = useNavigate()
  const irmaos = useIrmaos(casaAtiva?.terreiro_id)
  const [obrigacao, setObrigacao] = useState<Obrigacao | null>(null)
  const [itens, setItens] = useState<ItemObrigacao[]>([])
  const [contribuicoes, setContribuicoes] = useState<Contribuicao[]>([])
  const [pontos, setPontos] = useState<PontoSimples[]>([])
  const [folhas, setFolhas] = useState<FolhaSimples[]>([])
  const [eu, setEu] = useState<[number, number] | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const carregarItens = useCallback(async () => {
    if (!id) return
    const [i, c] = await Promise.all([
      supabase.from('obrigacao_itens').select('*, folhas(nome_popular, nome_ritual, toxica, alerta)').eq('obrigacao_id', id).order('created_at'),
      supabase.from('item_contribuicoes').select('*').eq('obrigacao_id', id),
    ])
    setItens((i.data ?? []) as ItemObrigacao[])
    setContribuicoes((c.data ?? []) as Contribuicao[])
  }, [id])

  useEffect(() => {
    if (!id) return
    Promise.all([
      supabase.from('obrigacoes').select('*').eq('id', id).maybeSingle(),
      supabase.from('pontos').select('id, folha_id, lat, lng').eq('status', 'validado'),
      supabase.from('folhas').select('id, nome_popular, status, nome_cientifico, outros_nomes').neq('status', 'recusada').order('nome_popular'),
      carregarItens(),
    ]).then(([o, p, f]) => {
      setObrigacao(o.data as Obrigacao | null)
      setPontos((p.data ?? []) as PontoSimples[])
      setFolhas(f.data ?? [])
      setCarregando(false)
    })
    navigator.geolocation?.getCurrentPosition(
      (pos) => setEu([pos.coords.latitude, pos.coords.longitude]),
      () => {},
      { timeout: 10000 },
    )
  }, [id, carregarItens])

  /** Para cada folha, o ponto mais perto (ou o primeiro, se não houver GPS). */
  const maisPerto = useMemo(() => {
    const resultado = new Map<string, { ponto: PontoSimples; metros: number | null; total: number }>()
    for (const p of pontos) {
      const metros = eu ? distanciaEmMetros(eu, [p.lat, p.lng]) : null
      const atual = resultado.get(p.folha_id)
      const total = (atual?.total ?? 0) + 1
      if (!atual || (metros !== null && atual.metros !== null && metros < atual.metros)) {
        resultado.set(p.folha_id, { ponto: p, metros, total })
      } else {
        atual.total = total
      }
    }
    return resultado
  }, [pontos, eu])

  if (carregando) return <div className="pagina"><p className="sutil">Carregando…</p></div>
  if (!obrigacao) return <div className="pagina"><p>Função não encontrada.</p><Link to="/obrigacoes">Voltar</Link></div>

  // Função de outra casa (link antigo ou aberto de fora): cada rito fica na sua casa.
  if (casaAtiva && obrigacao.terreiro_id !== casaAtiva.terreiro_id) {
    const outra = casas.find((c) => c.terreiro_id === obrigacao.terreiro_id)
    return (
      <div className="pagina">
        <Topo titulo={obrigacao.nome} voltar="/obrigacoes" />
        <div className="cartao">
          <p>Esta função é de <strong>{outra?.terreiros?.nome ?? 'outra casa'}</strong>.</p>
          <p className="sutil">Você está vendo agora {casaAtiva.terreiros?.nome}. Troque de casa para abrir.</p>
          {outra && (
            <button className="primario" onClick={() => trocarCasa(obrigacao.terreiro_id)}>
              Ir para {outra.terreiros?.nome}
            </button>
          )}
        </div>
      </div>
    )
  }

  const daCasa = obrigacao.visibilidade === 'terreiro'
  const organiza = obrigacao.criado_por === perfil?.id
    || (daCasa && (ehValidador(perfil) || ehEquipe(casaAtiva) || temPermissao(casaAtiva, 'funcoes')))
  const prontos = itens.filter((i) => i.colhida).length
  const idsFolhas = [...new Set(itens.map((i) => i.folha_id).filter((f): f is string => Boolean(f)))]
  const minhas = contribuicoes.filter((c) => c.perfil_id === perfil?.id)

  async function marcar(item: ItemObrigacao) {
    setItens((lista) => lista.map((i) => (i.id === item.id ? { ...i, colhida: !i.colhida } : i)))
    const { error } = await supabase.from('obrigacao_itens').update({ colhida: !item.colhida }).eq('id', item.id)
    if (error) {
      setErro(mensagemDeErro(error))
      carregarItens()
    }
  }

  async function remover(item: ItemObrigacao) {
    if (!(await confirmar(`Tirar “${nomeDoItem(item)}” da lista?`, { texto: 'Quem ia levar este item também sai da lista.', botao: 'Tirar', perigo: true }))) return
    const { error } = await supabase.from('obrigacao_itens').delete().eq('id', item.id)
    if (error) return setErro(mensagemDeErro(error))
    await carregarItens()
  }

  async function apagarObrigacao() {
    if (!(await confirmar(`Apagar “${obrigacao!.nome}”?`, { texto: 'Os itens e quem ia levar cada um também são apagados.', botao: 'Apagar', perigo: true }))) return
    const { error } = await supabase.from('obrigacoes').delete().eq('id', obrigacao!.id)
    if (error) return setErro(mensagemDeErro(error))
    navegar('/obrigacoes', { replace: true })
  }

  return (
    <div className="pagina">
      <Topo titulo={obrigacao.nome} voltar={'/obrigacoes'} />
      <p className="sutil">
        {obrigacao.data && `${formatarData(obrigacao.data)} · `}
        {daCasa ? (casaAtiva?.terreiros?.nome ?? 'Minha casa') : 'Só eu'}
        {obrigacao.filho_id && ` · obrigação de ${nomeDe(irmaos, obrigacao.filho_id)}`}
      </p>
      {obrigacao.observacao && <p className="texto-pre">{obrigacao.observacao}</p>}

      {itens.length > 0 && (
        <div className="progresso" aria-label={`${prontos} de ${itens.length} itens prontos`}>
          <div className="progresso-barra" style={{ width: `${(prontos / itens.length) * 100}%` }} />
          <span>{prontos} de {itens.length} itens prontos</span>
        </div>
      )}

      {minhas.length > 0 && (
        <div className="cartao meus-itens">
          <strong className="icone-texto"><Hand size={18} aria-hidden /> Você vai levar</strong>
          {minhas.map((c) => {
            const item = itens.find((i) => i.id === c.item_id)
            return (
              <div key={c.id} className="sutil">
                {comUnidade(Number(c.quantidade), item?.unidade)} de {item ? nomeDoItem(item) : 'item'}
                {c.status === 'entregue' ? ' · entregue' : ''}
              </div>
            )
          })}
        </div>
      )}

      <div className="linha botoes-funcao">
        {modulos.mapa && idsFolhas.length > 0 && <Link to={`/?folhas=${idsFolhas.join(',')}`} className="botao"><IconeMapa size={18} aria-hidden /> Folhas no mapa</Link>}
        {daCasa && organiza && modulos.escalas && (
          <Link to={`/casa/escalas?obrigacao=${obrigacao.id}&titulo=${encodeURIComponent(obrigacao.nome)}`} className="botao"><Brush size={18} aria-hidden /> Criar escala</Link>
        )}
      </div>
      {erro && <p className="erro">{erro}</p>}

      <ul className="lista">
        {itens.map((item) => (
          <Item key={item.id} item={item} daCasa={daCasa} organiza={organiza} eu={perfil?.id ?? ''} irmaos={irmaos}
            contribuicoes={contribuicoes.filter((c) => c.item_id === item.id)}
            perto={item.folha_id ? maisPerto.get(item.folha_id) : undefined} mostrarMapa={modulos.mapa}
            aoMarcar={() => marcar(item)} aoRemover={() => remover(item)} aoMudar={carregarItens} />
        ))}
      </ul>
      {itens.length === 0 && <p className="sutil">Nenhum item ainda.{organiza ? ' Adicione abaixo o que vai ser preciso.' : ''}</p>}

      {organiza && (
        <AdicionarItem obrigacaoId={obrigacao.id} folhas={folhas.filter((f) => !idsFolhas.includes(f.id))} aoAdicionar={carregarItens} />
      )}

      {(obrigacao.criado_por === perfil?.id || (daCasa && ehValidador(perfil))) && (
        <button className="link perigo" onClick={apagarObrigacao}>Apagar esta função</button>
      )}
    </div>
  )
}

function Item({ item, daCasa, organiza, eu, irmaos, contribuicoes, perto, mostrarMapa, aoMarcar, aoRemover, aoMudar }: {
  item: ItemObrigacao
  daCasa: boolean
  organiza: boolean
  eu: string
  irmaos: Irmao[]
  contribuicoes: Contribuicao[]
  perto?: { ponto: PontoSimples; metros: number | null; total: number }
  mostrarMapa: boolean
  aoMarcar: () => void
  aoRemover: () => void
  aoMudar: () => Promise<void>
}) {
  const [acao, setAcao] = useState<'levar' | 'distribuir' | null>(null)
  const [quantidade, setQuantidade] = useState('1')
  const [quem, setQuem] = useState('')
  const total = item.quantidade_total ? Number(item.quantidade_total) : null
  const soma = contribuicoes.reduce((s, c) => s + Number(c.quantidade), 0)
  const falta = total !== null ? Math.max(0, total - soma) : null
  const minha = contribuicoes.find((c) => c.perfil_id === eu)
  const completo = falta === 0
  const categoria = (item.categoria ?? 'folha') as CategoriaItem
  const quantidadeTexto = total !== null ? comUnidade(total, item.unidade) : item.quantidade
  // Quanto cabe para quem vai levar: o que falta + o que essa pessoa já tinha combinado.
  const limite = (quemLeva: string) =>
    falta === null ? null : falta + Number(contribuicoes.find((c) => c.perfil_id === quemLeva)?.quantidade ?? 0)
  const maximo = acao === 'levar' ? limite(eu) : quem ? limite(quem) : falta
  const qtdDigitada = Number(quantidade.replace(',', '.'))
  const passou = maximo !== null && qtdDigitada > maximo

  async function rpc(nome: string, args: Record<string, unknown>, ok: string) {
    const { error } = await supabase.rpc(nome, args)
    if (error) return avisar(mensagemDeErro(error), 'erro')
    avisar(ok)
    setAcao(null)
    await aoMudar()
  }

  function abrir(tipo: 'levar' | 'distribuir') {
    setQuantidade(String(falta && falta > 0 ? falta : 1))
    setQuem('')
    setAcao(acao === tipo ? null : tipo)
  }

  return (
    <li className={`item-obrigacao ${item.colhida ? 'colhida' : ''}`}>
      <div className="item-topo">
        <IconeCategoria categoria={categoria} />
        <span className="item-nome cresce">
          <strong>{nomeDoItem(item)}</strong>
          {quantidadeTexto && <span className="sutil">{quantidadeTexto}</span>}
        </span>
        {(completo || item.colhida) && <span className="etiqueta situacao-confirmado">{completo ? 'Completo' : 'Pronto'}</span>}
        <label className="check-item" title="Marcar como pronto">
          <input type="checkbox" checked={item.colhida} onChange={aoMarcar} aria-label={`${nomeDoItem(item)}: pronto`} />
        </label>
      </div>
      {item.folhas?.toxica && (
        <div className="alerta-toxica icone-texto"><TriangleAlert size={16} aria-hidden /> Tóxica{item.folhas.alerta ? `: ${item.folhas.alerta}` : ''}</div>
      )}

      {daCasa && (total !== null || contribuicoes.length > 0) && (
        <div className="contribuicoes">
          {total !== null && (
            <div className="barra-progresso" title={`${numero(soma)} de ${numero(total)}`}>
              <div style={{ width: `${Math.min(100, (soma / total) * 100)}%` }} />
            </div>
          )}
          {contribuicoes.map((c) => (
            <div key={c.id} className="contribuicao">
              <span className="cresce">
                {c.status === 'entregue'
                  ? <CircleCheck size={16} className="cor-ok" aria-label="Entregue" />
                  : <Hand size={16} className="cor-sutil" aria-hidden />}{' '}<strong>{c.perfil_id === eu ? 'Você' : nomeDe(irmaos, c.perfil_id)}</strong>{' '}
                leva {comUnidade(Number(c.quantidade), item.unidade)}
                {c.atribuido_por && <span className="sutil"> (pedido do zelador)</span>}
              </span>
              {(c.perfil_id === eu || organiza) && (
                <button className="link" onClick={() => rpc('marcar_entrega', { p_contribuicao: c.id, p_entregue: c.status !== 'entregue' },
                  c.status !== 'entregue' ? 'Marcado como entregue.' : 'Desmarcado.')}>
                  {c.status === 'entregue' ? 'Desfazer' : 'Entregue'}
                </button>
              )}
              {(organiza || (c.perfil_id === eu && !c.atribuido_por)) && (
                <button className="link perigo" onClick={() => rpc('desistir_item', { p_contribuicao: c.id }, 'Tirado da lista de quem leva.')}
                  aria-label={`Tirar ${c.perfil_id === eu ? 'você' : nomeDe(irmaos, c.perfil_id)} deste item`}><X size={18} /></button>
              )}
            </div>
          ))}
          {falta !== null && <div className="sutil">{falta > 0 ? `Faltam ${comUnidade(falta, item.unidade)}` : 'Quantidade completa: ninguém mais precisa levar.'}</div>}
        </div>
      )}

      {((daCasa && !item.colhida && !completo) || organiza) && (
        <div className="linha acoes-item">
          {daCasa && !item.colhida && !completo && (
            <>
              {(item.aberto !== false || organiza) && !minha && (
                <button className="botao pequeno-botao" onClick={() => abrir('levar')}><Hand size={16} aria-hidden /> Eu levo</button>
              )}
              {organiza && <button className="botao pequeno-botao" onClick={() => abrir('distribuir')}><Users size={16} aria-hidden /> Distribuir</button>}
              {item.aberto === false && !organiza && !minha && <span className="sutil">O zelador distribui este item.</span>}
            </>
          )}
          {organiza && (
            <button className="botao-icone perigo" onClick={aoRemover} aria-label={`Tirar ${nomeDoItem(item)} da lista`} title="Tirar da lista">
              <Trash2 size={18} />
            </button>
          )}
        </div>
      )}

      {acao && (
        <form className="formulario distribuir" onSubmit={(e) => {
          e.preventDefault()
          const qtd = qtdDigitada
          if (passou) return
          if (acao === 'levar') rpc('contribuir_item', { p_item: item.id, p_quantidade: qtd }, 'Obrigado! Você está na lista de quem leva.')
          else rpc('atribuir_item', { p_item: item.id, p_perfil: quem, p_quantidade: qtd }, `${nomeDe(irmaos, quem)} foi avisado(a).`)
        }}>
          {acao === 'distribuir' && (
            <select value={quem} onChange={(e) => setQuem(e.target.value)} required aria-label="Quem vai levar">
              <option value="">Quem vai levar?</option>
              {irmaos.map((i) => <option key={i.perfil_id} value={i.perfil_id}>{i.apelido}</option>)}
            </select>
          )}
          <div className="linha">
            <input type="number" inputMode="decimal" min="0.01" step="any" max={maximo ?? undefined} value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)} required className="cresce" aria-label="Quantidade"
              aria-invalid={passou} />
            <span>{item.unidade ?? 'unidade(s)'}</span>
          </div>
          {maximo !== null && (
            <p className={passou ? 'erro' : 'sutil'}>
              {passou ? `Só faltam ${comUnidade(maximo, item.unidade)}: diminua a quantidade.` : `Faltam ${comUnidade(maximo, item.unidade)}.`}
            </p>
          )}
          <div className="linha">
            <button className="primario" disabled={passou}>{acao === 'levar' ? 'Confirmar' : 'Distribuir e avisar'}</button>
            <button type="button" className="link" onClick={() => setAcao(null)}>Cancelar</button>
          </div>
        </form>
      )}

      {mostrarMapa && item.folha_id && !item.colhida && (
        <div className="onde">
          {perto ? (
            <>
              <span className="sutil">
                {perto.metros !== null ? `Mais perto: ${formatarDistancia(perto.metros)}` : 'Tem no mapa'}
                {perto.total > 1 && ` · ${perto.total} lugares`}
              </span>
              <a href={linkComoChegar(perto.ponto.lat, perto.ponto.lng)} target="_blank" rel="noreferrer">Como chegar</a>
              <Link to={`/?folha=${item.folha_id}`}>Mapa</Link>
            </>
          ) : (
            <span className="sutil">Ainda ninguém marcou onde encontrar.</span>
          )}
        </div>
      )}
    </li>
  )
}

function AdicionarItem({ obrigacaoId, folhas, aoAdicionar }: {
  obrigacaoId: string
  folhas: FolhaSimples[]
  aoAdicionar: () => Promise<void>
}) {
  const [categoria, setCategoria] = useState<CategoriaItem>('folha')
  const [folhaId, setFolhaId] = useState('')
  const [nome, setNome] = useState('')
  const [quantidade, setQuantidade] = useState('')
  const [unidade, setUnidade] = useState('maço')
  const [aberto, setAberto] = useState(true)
  const [erro, setErro] = useState('')

  async function adicionar(e: FormEvent) {
    e.preventDefault()
    if (categoria === 'folha' && !folhaId) return setErro('Escolha a folha digitando o nome dela.')
    if (categoria !== 'folha' && !nome.trim()) return setErro('Diga qual é o item.')
    const qtd = quantidade ? Number(quantidade.replace(',', '.')) : null
    const { error } = await supabase.from('obrigacao_itens').insert({
      obrigacao_id: obrigacaoId,
      folha_id: categoria === 'folha' ? folhaId : null,
      nome: categoria === 'folha' ? null : nome.trim(),
      categoria,
      quantidade_total: qtd,
      unidade: qtd ? unidade : null,
      quantidade: qtd ? comUnidade(qtd, unidade) : null,
      aberto,
    })
    if (error) return setErro(mensagemDeErro(error))
    avisar(`${categoria === 'folha' ? folhas.find((f) => f.id === folhaId)?.nome_popular : nome.trim()} adicionado(a).`)
    setFolhaId('')
    setNome('')
    setQuantidade('')
    setErro('')
    await aoAdicionar()
  }

  return (
    <form className="cartao formulario" onSubmit={adicionar}>
      <h2>Adicionar item</h2>
      <label>
        Tipo
        <select value={categoria} onChange={(e) => {
          const c = e.target.value as CategoriaItem
          setCategoria(c)
          setUnidade(c === 'folha' ? 'maço' : c === 'animal' ? 'cabeça' : c === 'semente' ? 'kg' : 'unidade')
        }}>
          {(Object.keys(ROTULO_CATEGORIA_ITEM) as CategoriaItem[]).map((c) => <option key={c} value={c}>{ROTULO_CATEGORIA_ITEM[c]}</option>)}
        </select>
      </label>
      {categoria === 'folha' ? (
        <SeletorFolha folhas={folhas} valor={folhaId} aoMudar={setFolhaId} linkNova={false} />
      ) : (
        <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80}
          placeholder={categoria === 'animal' ? 'Ex.: galo carijó' : categoria === 'semente' ? 'Ex.: milho branco' : 'Nome do item'} />
      )}
      <div className="linha">
        <input type="number" inputMode="decimal" min="0" step="any" value={quantidade} onChange={(e) => setQuantidade(e.target.value)}
          placeholder="Quantidade" className="cresce" aria-label="Quantidade" />
        <select value={unidade} onChange={(e) => setUnidade(e.target.value)} aria-label="Unidade">
          {UNIDADES.map((u) => <option key={u}>{u}</option>)}
        </select>
      </div>
      <label className="opcao">
        <input type="checkbox" checked={aberto} onChange={(e) => setAberto(e.target.checked)} />
        Os filhos podem se oferecer para levar (desmarque se você mesmo vai distribuir)
      </label>
      {erro && <p className="erro">{erro}</p>}
      <button className="primario">Adicionar à lista</button>
      {categoria === 'folha' && <Link to="/folhas/nova" className="link">A folha não está na lista? Cadastrar</Link>}
    </form>
  )
}
