import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { avisar } from '../lib/avisos'
import { ehZelador, useSessao } from '../lib/sessao'
import { mensagemDeErro, supabase } from '../lib/supabase'
import { semAcento } from '../lib/texto'
import { confirmar } from '../lib/dialogo'
import {
  ROTULO_CATEGORIA, UNIDADES,
  type CategoriaMaterial, type Material, type MembroDaCasa, type Movimento,
} from '../lib/tipos'

function quantidade(n: number): string {
  return Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

function acabando(m: Material): boolean {
  return m.minimo !== null && Number(m.quantidade) <= Number(m.minimo)
}

export default function Materiais() {
  const { casaAtiva } = useSessao()
  const navegar = useNavigate()
  const terreiro = casaAtiva?.terreiro_id
  const zelador = ehZelador(casaAtiva)
  const [podeVer, setPodeVer] = useState<boolean | null>(null)
  const [podeEditar, setPodeEditar] = useState(false)
  const [materiais, setMateriais] = useState<Material[]>([])
  const [busca, setBusca] = useState('')
  const [categoria, setCategoria] = useState<CategoriaMaterial | 'acabando' | ''>('')
  const [aberto, setAberto] = useState<string | null>(null)
  const [novo, setNovo] = useState(false)
  const [configurando, setConfigurando] = useState(false)

  const carregar = useCallback(async () => {
    if (!terreiro) return
    const [ver, editar, lista] = await Promise.all([
      supabase.rpc('pode_ver_materiais', { p_terreiro: terreiro }),
      supabase.rpc('pode_editar_materiais', { p_terreiro: terreiro }),
      supabase.from('materiais').select('*').eq('terreiro_id', terreiro).order('nome'),
    ])
    setPodeVer(ver.data === true)
    setPodeEditar(editar.data === true)
    setMateriais((lista.data ?? []) as Material[])
  }, [terreiro])

  useEffect(() => {
    carregar()
  }, [carregar])

  const filtrados = useMemo(() => {
    const termo = semAcento(busca.trim())
    return materiais.filter((m) =>
      (!termo || semAcento(`${m.nome} ${m.observacao ?? ''}`).includes(termo)) &&
      (categoria === '' || (categoria === 'acabando' ? acabando(m) : m.categoria === categoria)))
  }, [materiais, busca, categoria])

  const qtdAcabando = materiais.filter(acabando).length

  if (!terreiro) return <div className="pagina"><p>Escolha uma casa primeiro.</p></div>
  if (podeVer === false) {
    return (
      <div className="pagina">
        <button className="link" onClick={() => navegar('/casa')}>← Casa</button>
        <h1>Materiais</h1>
        <p>O zelador da casa ainda não liberou os materiais para você.</p>
      </div>
    )
  }

  return (
    <div className="pagina">
      <button className="link" onClick={() => navegar('/casa')}>← Casa</button>
      <div className="cabecalho">
        <h1>Materiais</h1>
        {podeEditar && !novo && <button className="botao" onClick={() => setNovo(true)}>+ Material</button>}
      </div>
      <p className="sutil">{casaAtiva?.terreiros?.nome}</p>

      {zelador && (
        configurando
          ? <QuemVe terreiro={terreiro} aoTerminar={() => setConfigurando(false)} />
          : <button className="link" onClick={() => setConfigurando(true)}>🔒 Quem pode ver e editar os materiais</button>
      )}

      {novo && <FormMaterial terreiro={terreiro} aoTerminar={async (ok) => { setNovo(false); if (ok) await carregar() }} />}

      <input type="search" placeholder="Buscar material…" value={busca} onChange={(e) => setBusca(e.target.value)} />
      <div className="chips rolar">
        <button className={`chip ${categoria === '' ? 'ativo' : ''}`} onClick={() => setCategoria('')}>Todos ({materiais.length})</button>
        {qtdAcabando > 0 && (
          <button className={`chip alerta ${categoria === 'acabando' ? 'ativo' : ''}`} onClick={() => setCategoria('acabando')}>
            ⚠️ Acabando ({qtdAcabando})
          </button>
        )}
        {(Object.keys(ROTULO_CATEGORIA) as CategoriaMaterial[])
          .filter((c) => materiais.some((m) => m.categoria === c))
          .map((c) => (
            <button key={c} className={`chip ${categoria === c ? 'ativo' : ''}`} onClick={() => setCategoria(c)}>{ROTULO_CATEGORIA[c]}</button>
          ))}
      </div>

      {podeVer === null && <p className="sutil">Carregando…</p>}
      {podeVer && materiais.length === 0 && (
        <p className="sutil">Nenhum material cadastrado.{podeEditar ? ' Toque em “+ Material” para começar.' : ''}</p>
      )}

      <ul className="lista">
        {filtrados.map((m) => (
          <li key={m.id} className={`material ${acabando(m) ? 'acabando' : ''}`}>
            <button className="item cabecalho-botao" onClick={() => setAberto(aberto === m.id ? null : m.id)}>
              <span>
                <strong>{m.nome}</strong>
                <div className="sutil">{ROTULO_CATEGORIA[m.categoria]}</div>
              </span>
              <span className="material-qtd">
                {quantidade(m.quantidade)} <span className="sutil">{m.unidade}</span>
                {acabando(m) && <span className="etiqueta perigo">acabando</span>}
              </span>
            </button>
            {aberto === m.id && <DetalheMaterial material={m} podeEditar={podeEditar} aoMudar={carregar} />}
          </li>
        ))}
      </ul>
    </div>
  )
}

function DetalheMaterial({ material, podeEditar, aoMudar }: { material: Material; podeEditar: boolean; aoMudar: () => Promise<void> }) {
  const [tipo, setTipo] = useState<'entrada' | 'saida' | 'ajuste' | null>(null)
  const [qtd, setQtd] = useState('')
  const [motivo, setMotivo] = useState('')
  const [historico, setHistorico] = useState<Movimento[]>([])
  const [editando, setEditando] = useState(false)

  useEffect(() => {
    supabase.from('movimentos_material').select('*, perfis(apelido)').eq('material_id', material.id)
      .order('created_at', { ascending: false }).limit(10)
      .then(({ data }) => setHistorico((data ?? []) as unknown as Movimento[]))
  }, [material.id, material.quantidade])

  async function registrar(e: FormEvent) {
    e.preventDefault()
    const valor = Number(qtd)
    if (!(valor >= 0) || qtd === '') return avisar('Informe a quantidade.', 'erro')
    if (tipo === 'saida' && valor > Number(material.quantidade)
        && !(await confirmar(`Só há ${quantidade(material.quantidade)} ${material.unidade}.`, { texto: 'Registrar a saída mesmo assim? O estoque fica zerado.', botao: 'Registrar saída' }))) return
    const { error } = await supabase.from('movimentos_material').insert({
      material_id: material.id, tipo, quantidade: valor, motivo: motivo.trim() || null, terreiro_id: material.terreiro_id,
    })
    if (error) return avisar(mensagemDeErro(error), 'erro')
    avisar(tipo === 'entrada' ? 'Entrada registrada.' : tipo === 'saida' ? 'Saída registrada.' : 'Quantidade corrigida.')
    setTipo(null)
    setQtd('')
    setMotivo('')
    await aoMudar()
  }

  async function apagar() {
    if (!(await confirmar(`Apagar “${material.nome}”?`, { texto: 'O histórico de entradas e saídas também é apagado.', botao: 'Apagar', perigo: true }))) return
    const { error } = await supabase.from('materiais').delete().eq('id', material.id)
    if (error) return avisar(mensagemDeErro(error), 'erro')
    avisar('Material apagado.')
    await aoMudar()
  }

  if (editando) {
    return <FormMaterial terreiro={material.terreiro_id} material={material} aoTerminar={async (ok) => { setEditando(false); if (ok) await aoMudar() }} />
  }

  return (
    <div className="detalhe-material">
      {material.minimo !== null && <div className="sutil">Avisar quando chegar a {quantidade(material.minimo)} {material.unidade}</div>}
      {material.observacao && <p className="texto-pre">{material.observacao}</p>}

      {podeEditar && !tipo && (
        <div className="linha">
          <button className="primario" onClick={() => setTipo('entrada')}>+ Entrou</button>
          <button className="botao" onClick={() => setTipo('saida')}>− Saiu / usei</button>
          <button className="link" onClick={() => setTipo('ajuste')}>Corrigir</button>
        </div>
      )}
      {tipo && (
        <form className="formulario" onSubmit={registrar}>
          <label>
            {tipo === 'entrada' ? 'Quanto entrou' : tipo === 'saida' ? 'Quanto saiu' : 'Quantidade certa agora'} ({material.unidade})
            <input type="number" inputMode="decimal" min="0" step="any" value={qtd} onChange={(e) => setQtd(e.target.value)} required autoFocus />
          </label>
          <label>
            Motivo (opcional)
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={120}
              placeholder={tipo === 'entrada' ? 'Ex.: compra, doação' : tipo === 'saida' ? 'Ex.: obrigação da Ana' : 'Ex.: contagem do estoque'} />
          </label>
          <div className="linha">
            <button className="primario">Registrar</button>
            <button type="button" className="link" onClick={() => setTipo(null)}>Cancelar</button>
          </div>
        </form>
      )}

      {historico.length > 0 && (
        <div className="historico">
          <strong className="sutil">Últimos movimentos</strong>
          {historico.map((h) => (
            <div key={h.id} className="linha sutil">
              <span>{new Date(h.created_at).toLocaleDateString('pt-BR')}</span>
              <span className="cresce">
                {h.tipo === 'entrada' ? '+' : h.tipo === 'saida' ? '−' : '='}{quantidade(h.quantidade)}
                {h.motivo ? ` · ${h.motivo}` : ''}{h.perfis?.apelido ? ` · ${h.perfis.apelido}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      {podeEditar && (
        <div className="linha">
          <button className="link" onClick={() => setEditando(true)}>Editar</button>
          <button className="link perigo" onClick={apagar}>Apagar</button>
        </div>
      )}
    </div>
  )
}

function FormMaterial({ terreiro, material, aoTerminar }: { terreiro: string; material?: Material; aoTerminar: (ok: boolean) => void }) {
  const [nome, setNome] = useState(material?.nome ?? '')
  const [categoria, setCategoria] = useState<CategoriaMaterial>(material?.categoria ?? 'outro')
  const [unidade, setUnidade] = useState(material?.unidade ?? 'unidade')
  const [qtd, setQtd] = useState(material ? '' : '0')
  const [minimo, setMinimo] = useState(material?.minimo?.toString() ?? '')
  const [observacao, setObservacao] = useState(material?.observacao ?? '')
  const [erro, setErro] = useState('')

  async function salvar(e: FormEvent) {
    e.preventDefault()
    const dados = {
      nome: nome.trim(), categoria, unidade, minimo: minimo === '' ? null : Number(minimo), observacao: observacao.trim() || null,
    }
    const { error } = material
      ? await supabase.from('materiais').update(dados).eq('id', material.id)
      : await supabase.from('materiais').insert({ ...dados, terreiro_id: terreiro, quantidade: Number(qtd || 0) })
    if (error) return setErro(mensagemDeErro(error))
    avisar(material ? 'Material atualizado.' : 'Material cadastrado.')
    aoTerminar(true)
  }

  return (
    <form className="cartao formulario" onSubmit={salvar}>
      <h2>{material ? 'Editar material' : 'Novo material'}</h2>
      <label>
        Nome *
        <input value={nome} onChange={(e) => setNome(e.target.value)} required maxLength={80} placeholder="Ex.: Vela branca de 7 dias" />
      </label>
      <label>
        Tipo
        <select value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaMaterial)}>
          {(Object.keys(ROTULO_CATEGORIA) as CategoriaMaterial[]).map((c) => <option key={c} value={c}>{ROTULO_CATEGORIA[c]}</option>)}
        </select>
      </label>
      <div className="linha">
        <label className="cresce">
          Medida
          <select value={unidade} onChange={(e) => setUnidade(e.target.value)}>
            {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
        {!material && (
          <label className="cresce">
            Quantidade agora
            <input type="number" inputMode="decimal" min="0" step="any" value={qtd} onChange={(e) => setQtd(e.target.value)} />
          </label>
        )}
      </div>
      <label>
        Avisar quando chegar a (opcional)
        <input type="number" inputMode="decimal" min="0" step="any" value={minimo} onChange={(e) => setMinimo(e.target.value)} placeholder="Ex.: 2" />
        <span className="dica">Quando o estoque chegar nesse número, o zelador recebe um aviso no celular.</span>
      </label>
      <label>
        Observação (opcional)
        <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} maxLength={300} placeholder="Ex.: onde fica guardado" />
      </label>
      {erro && <p className="erro">{erro}</p>}
      <div className="linha">
        <button className="primario">Salvar</button>
        <button type="button" className="link" onClick={() => aoTerminar(false)}>Cancelar</button>
      </div>
    </form>
  )
}

/** Zelador: liberar para todos ou escolher exatamente quem vê e quem edita. */
function QuemVe({ terreiro, aoTerminar }: { terreiro: string; aoTerminar: () => void }) {
  const [membros, setMembros] = useState<MembroDaCasa[]>([])
  const [paraTodos, setParaTodos] = useState(false)
  const [acesso, setAcesso] = useState<Record<string, 'nada' | 've' | 'edita'>>({})
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('membros').select('*, perfis(apelido)').eq('terreiro_id', terreiro).eq('aprovado', true),
      supabase.from('materiais_config').select('para_todos').eq('terreiro_id', terreiro).maybeSingle(),
      supabase.from('materiais_acesso').select('perfil_id, pode_editar').eq('terreiro_id', terreiro),
    ]).then(([m, c, a]) => {
      setMembros(((m.data ?? []) as unknown as MembroDaCasa[]).filter((x) => x.papel !== 'zelador')
        .sort((x, y) => (x.perfis?.apelido ?? '').localeCompare(y.perfis?.apelido ?? '', 'pt-BR')))
      setParaTodos(c.data?.para_todos ?? false)
      setAcesso(Object.fromEntries(((a.data ?? []) as { perfil_id: string; pode_editar: boolean }[])
        .map((x) => [x.perfil_id, x.pode_editar ? 'edita' : 've'])))
    })
  }, [terreiro])

  async function salvar() {
    setSalvando(true)
    const pessoas = Object.entries(acesso)
      .filter(([, nivel]) => nivel !== 'nada')
      .map(([perfil_id, nivel]) => ({ perfil_id, pode_editar: nivel === 'edita' }))
    const { error } = await supabase.rpc('definir_acesso_materiais', { p_terreiro: terreiro, p_para_todos: paraTodos, p_pessoas: pessoas })
    setSalvando(false)
    if (error) return avisar(mensagemDeErro(error), 'erro')
    avisar('Acesso aos materiais atualizado.')
    aoTerminar()
  }

  return (
    <div className="cartao formulario">
      <h2>Quem pode ver os materiais</h2>
      <p className="sutil">Você (zelador) sempre vê e edita.</p>
      <div className="opcoes">
        <label className="opcao"><input type="radio" checked={paraTodos} onChange={() => setParaTodos(true)} /> Todos os filhos da casa podem ver</label>
        <label className="opcao"><input type="radio" checked={!paraTodos} onChange={() => setParaTodos(false)} /> Só os filhos que eu escolher</label>
      </div>
      <p className="sutil">{paraTodos ? 'Escolha abaixo quem também pode editar (registrar entradas e saídas):' : 'Escolha quem vê e quem também pode editar:'}</p>
      <div className="lista-escolha">
        {membros.map((m) => {
          const nivel = acesso[m.perfil_id] ?? 'nada'
          return (
            <div key={m.perfil_id} className="linha">
              <span className="cresce">{m.perfis?.apelido}</span>
              <select value={nivel} onChange={(e) => setAcesso((a) => ({ ...a, [m.perfil_id]: e.target.value as 'nada' | 've' | 'edita' }))}>
                <option value="nada">{paraTodos ? 'Só vê' : 'Não vê'}</option>
                {!paraTodos && <option value="ve">Vê</option>}
                <option value="edita">Vê e edita</option>
              </select>
            </div>
          )
        })}
        {membros.length === 0 && <p className="sutil">Ainda não há filhos aprovados na casa.</p>}
      </div>
      <div className="linha">
        <button className="primario" disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        <button className="link" onClick={aoTerminar}>Cancelar</button>
      </div>
    </div>
  )
}
