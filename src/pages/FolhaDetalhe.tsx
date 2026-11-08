import { TriangleAlert } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import Foto from '../components/Foto'
import { avisar } from '../lib/avisos'
import { ehAdmin, ehValidador, useSessao } from '../lib/sessao'
import { mensagemDeErro, supabase } from '../lib/supabase'
import { fotosDoPonto, type Folha, type Fundamento } from '../lib/tipos'
import Topo from '../components/Topo'

export default function FolhaDetalhe() {
  const { id } = useParams()
  const { perfil } = useSessao()
  const [folha, setFolha] = useState<Folha | null>(null)
  const [fundamento, setFundamento] = useState<Fundamento | null>(null)
  const [qtdPontos, setQtdPontos] = useState(0)
  const [fotos, setFotos] = useState<string[]>([])
  const [carregando, setCarregando] = useState(true)
  const [editando, setEditando] = useState(false)
  const [editandoFolha, setEditandoFolha] = useState(false)

  useEffect(() => {
    if (!id) return
    Promise.all([
      supabase.from('folhas').select('*').eq('id', id).maybeSingle(),
      supabase.from('fundamentos').select('*').eq('folha_id', id).maybeSingle(),
      supabase.from('pontos').select('fotos, foto_path').eq('folha_id', id).neq('status', 'recusado').order('created_at', { ascending: false }),
    ]).then(([f, fund, pontos]) => {
      setFolha(f.data as Folha | null)
      setFundamento(fund.data as Fundamento | null)
      const lista = (pontos.data ?? []) as { fotos: string[] | null; foto_path: string | null }[]
      setQtdPontos(lista.length)
      setFotos(lista.flatMap(fotosDoPonto).slice(0, 6))
      setCarregando(false)
    })
  }, [id])

  if (carregando) return <div className="pagina"><p className="sutil">Carregando…</p></div>
  if (!folha) return <div className="pagina"><p>Folha não encontrada.</p><Link to="/folhas">Voltar</Link></div>

  const podeEditar = ehValidador(perfil)
  const podeEditarFolha = ehAdmin(perfil) || (ehValidador(perfil) && folha.terreiro_id === perfil?.terreiro_id)
  const temFundamento = fundamento && (fundamento.orixas || fundamento.usos || fundamento.observacoes)

  return (
    <div className="pagina">
      <Topo titulo={folha.nome_popular} voltar={-1}
        acao={!editandoFolha && podeEditarFolha && <button className="botao" onClick={() => setEditandoFolha(true)}>Editar</button>} />
      {editandoFolha && (
        <EditarFolha folha={folha} aoSalvar={(f) => { setFolha(f); setEditandoFolha(false) }} aoCancelar={() => setEditandoFolha(false)} />
      )}
      {folha.nome_ritual && <p className="destaque">{folha.nome_ritual}</p>}
      {folha.nome_cientifico && <p className="cientifico">{folha.nome_cientifico}</p>}
      {folha.outros_nomes && <p className="sutil">Também chamada: {folha.outros_nomes}</p>}
      {folha.status === 'pendente' && <p className="aviso">Esta folha ainda está em validação.</p>}

      {(folha.toxica || folha.alerta) && (
        <div className="caixa-alerta">
          {folha.toxica && <strong className="icone-texto"><TriangleAlert size={18} aria-hidden /> Tóxica ou pede cuidado.</strong>} {folha.alerta}
        </div>
      )}

      <div className="linha">
        <Link to={`/?folha=${folha.id}`} className="botao">Ver no mapa ({qtdPontos})</Link>
        <Link to={`/marcar?folha=${folha.id}`} className="botao">Marcar onde encontrei</Link>
      </div>

      {fotos.length > 0 && (
        <section>
          <h2>Como ela é</h2>
          <div className="grade-fotos">
            {fotos.map((c) => <Foto key={c} caminho={c} alt={folha.nome_popular} />)}
          </div>
        </section>
      )}

      <section className="cartao">
        <div className="cabecalho">
          <h2>Fundamento da casa</h2>
          {podeEditar && !editando && <button className="link" onClick={() => setEditando(true)}>Editar</button>}
        </div>
        <p className="sutil">Visível apenas para membros de {perfil?.terreiros?.nome ?? 'seu terreiro'}.</p>
        {editando ? (
          <EditarFundamento
            folhaId={folha.id}
            atual={fundamento}
            aoSalvar={(f) => {
              setFundamento(f)
              setEditando(false)
            }}
            aoCancelar={() => setEditando(false)}
          />
        ) : temFundamento ? (
          <dl>
            {fundamento.orixas && (<><dt>Orixás / Entidades</dt><dd>{fundamento.orixas}</dd></>)}
            {fundamento.usos && (<><dt>Usos</dt><dd>{fundamento.usos}</dd></>)}
            {fundamento.observacoes && (<><dt>Observações</dt><dd>{fundamento.observacoes}</dd></>)}
          </dl>
        ) : (
          <p className="sutil">Nada registrado ainda.</p>
        )}
      </section>
    </div>
  )
}

function EditarFolha({ folha, aoSalvar, aoCancelar }: {
  folha: Folha
  aoSalvar: (f: Folha) => void
  aoCancelar: () => void
}) {
  const [campos, setCampos] = useState({
    nome_popular: folha.nome_popular,
    nome_ritual: folha.nome_ritual ?? '',
    outros_nomes: folha.outros_nomes ?? '',
    nome_cientifico: folha.nome_cientifico ?? '',
    alerta: folha.alerta ?? '',
  })
  const [toxica, setToxica] = useState(folha.toxica)
  const [erro, setErro] = useState('')
  const mudar = (campo: keyof typeof campos) => (e: { target: { value: string } }) =>
    setCampos((c) => ({ ...c, [campo]: e.target.value }))

  async function salvar(e: FormEvent) {
    e.preventDefault()
    const limpo = Object.fromEntries(Object.entries(campos).map(([k, v]) => [k, v.trim() || null]))
    const { data, error } = await supabase.from('folhas').update({ ...limpo, toxica }).eq('id', folha.id).select().single()
    if (error) return setErro(mensagemDeErro(error))
    avisar('Folha atualizada.')
    aoSalvar(data as Folha)
  }

  return (
    <form className="cartao formulario" onSubmit={salvar}>
      <h2>Editar folha</h2>
      <label>
        Nome popular *
        <input value={campos.nome_popular} onChange={mudar('nome_popular')} required maxLength={60} />
      </label>
      <label>
        Nome no Axé
        <input value={campos.nome_ritual} onChange={mudar('nome_ritual')} maxLength={60} />
      </label>
      <label>
        Outros nomes (separe por vírgula)
        <input value={campos.outros_nomes} onChange={mudar('outros_nomes')} maxLength={120} />
      </label>
      <label>
        Nome científico
        <input value={campos.nome_cientifico} onChange={mudar('nome_cientifico')} maxLength={80} autoCapitalize="none" />
      </label>
      <label className="opcao">
        <input type="checkbox" checked={toxica} onChange={(e) => setToxica(e.target.checked)} />
        Tóxica ou pede cuidado
      </label>
      <label>
        Cuidados / não confundir com…
        <textarea value={campos.alerta} onChange={mudar('alerta')} rows={2} maxLength={300} />
      </label>
      {erro && <p className="erro">{erro}</p>}
      <div className="linha">
        <button className="primario">Salvar</button>
        <button type="button" className="link" onClick={aoCancelar}>Cancelar</button>
      </div>
    </form>
  )
}

function EditarFundamento({ folhaId, atual, aoSalvar, aoCancelar }: {
  folhaId: string
  atual: Fundamento | null
  aoSalvar: (f: Fundamento) => void
  aoCancelar: () => void
}) {
  const { perfil } = useSessao()
  const [orixas, setOrixas] = useState(atual?.orixas ?? '')
  const [usos, setUsos] = useState(atual?.usos ?? '')
  const [observacoes, setObservacoes] = useState(atual?.observacoes ?? '')
  const [erro, setErro] = useState('')

  async function salvar(e: FormEvent) {
    e.preventDefault()
    const { data, error } = await supabase
      .from('fundamentos')
      .upsert({
        folha_id: folhaId,
        terreiro_id: perfil!.terreiro_id,
        orixas: orixas.trim() || null,
        usos: usos.trim() || null,
        observacoes: observacoes.trim() || null,
      })
      .select()
      .single()
    if (error) return setErro(mensagemDeErro(error))
    avisar('Fundamento salvo. Só a sua casa vê.')
    aoSalvar(data as Fundamento)
  }

  return (
    <form className="formulario" onSubmit={salvar}>
      <label>
        Orixás / Entidades
        <input value={orixas} onChange={(e) => setOrixas(e.target.value)} />
      </label>
      <label>
        Usos (banho, sacudimento, amaci, defumação, chá…)
        <textarea value={usos} onChange={(e) => setUsos(e.target.value)} rows={3} />
      </label>
      <label>
        Observações
        <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={3} />
      </label>
      {erro && <p className="erro">{erro}</p>}
      <div className="linha">
        <button className="primario">Salvar</button>
        <button type="button" className="link" onClick={aoCancelar}>Cancelar</button>
      </div>
    </form>
  )
}
