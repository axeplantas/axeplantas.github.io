import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useIrmaos } from '../lib/casa'
import { ehEquipe, temPermissao, useSessao } from '../lib/sessao'
import { mensagemDeErro, supabase } from '../lib/supabase'
import type { Obrigacao } from '../lib/tipos'

interface Resumo extends Obrigacao {
  total: number
  colhidas: number
}

export function formatarData(data: string | null): string {
  if (!data) return ''
  const [ano, mes, dia] = data.split('-')
  return `${dia}/${mes}/${ano}`
}

export default function Obrigacoes() {
  const { perfil } = useSessao()
  const navegar = useNavigate()
  const [lista, setLista] = useState<Resumo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [criando, setCriando] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('obrigacoes').select('*').order('created_at'),
      supabase.from('obrigacao_itens').select('obrigacao_id, colhida'),
    ]).then(([o, i]) => {
      const itens = (i.data ?? []) as { obrigacao_id: string; colhida: boolean }[]
      const resumos = ((o.data ?? []) as Obrigacao[]).map((ob) => {
        const meus = itens.filter((it) => it.obrigacao_id === ob.id)
        return { ...ob, total: meus.length, colhidas: meus.filter((it) => it.colhida).length }
      })
      // Mais recentes primeiro
      setLista(resumos.reverse())
      setCarregando(false)
    })
  }, [])

  return (
    <div className="pagina">
      <div className="cabecalho">
        <h1>Funções e obrigações</h1>
        {!criando && <button className="botao" onClick={() => setCriando(true)}>+ Nova</button>}
      </div>
      <p className="sutil">
        Liste tudo o que vai ser preciso (folhas, bichos, sementes, velas...). Os filhos se oferecem para levar ou o zelador
        distribui quem leva o quê.
      </p>

      {criando && <NovaObrigacao aoCriar={(id) => navegar(`/obrigacoes/${id}`)} aoCancelar={() => setCriando(false)} />}

      {carregando && <p className="sutil">Carregando…</p>}
      {!carregando && lista.length === 0 && !criando && <p className="sutil">Nenhuma obrigação ainda.</p>}

      <ul className="lista">
        {lista.map((o) => (
          <li key={o.id}>
            <Link to={`/obrigacoes/${o.id}`} className="item">
              <div>
                <strong>{o.nome}</strong>
                <div className="sutil">
                  {o.data && `${formatarData(o.data)} · `}
                  {o.visibilidade === 'terreiro' ? (perfil?.terreiros?.nome ?? 'Meu terreiro') : 'Só eu'}
                </div>
              </div>
              <div className="progresso-numero">
                {o.colhidas}/{o.total}
                <span className="sutil">prontos</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

function NovaObrigacao({ aoCriar, aoCancelar }: { aoCriar: (id: string) => void; aoCancelar: () => void }) {
  const { perfil, casaAtiva } = useSessao()
  const irmaos = useIrmaos(casaAtiva?.terreiro_id)
  const podeEscolherFilho = ehEquipe(casaAtiva) || temPermissao(casaAtiva, 'funcoes')
  const [filho, setFilho] = useState('')
  const [nome, setNome] = useState('')
  const [data, setData] = useState('')
  const [observacao, setObservacao] = useState('')
  const [visibilidade, setVisibilidade] = useState<'privado' | 'terreiro'>('terreiro')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setSalvando(true)
    const { data: criada, error } = await supabase
      .from('obrigacoes')
      .insert({
        nome: nome.trim(),
        data: data || null,
        observacao: observacao.trim() || null,
        visibilidade,
        terreiro_id: perfil!.terreiro_id,
        ...(filho && visibilidade === 'terreiro' ? { filho_id: filho } : {}),
      })
      .select('id')
      .single()
    if (error) {
      setErro(mensagemDeErro(error))
      setSalvando(false)
      return
    }
    aoCriar(criada.id)
  }

  return (
    <form className="cartao formulario" onSubmit={salvar}>
      <label>
        Nome *
        <input value={nome} onChange={(e) => setNome(e.target.value)} required maxLength={80}
          placeholder="Ex.: Obrigação de 7 anos da Ana, Festa de Ogum" />
      </label>
      <label>
        Data (opcional)
        <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
      </label>
      <div className="opcoes">
        <label className="opcao">
          <input type="radio" checked={visibilidade === 'terreiro'} onChange={() => setVisibilidade('terreiro')} />
          Minha casa (os filhos veem e ajudam a levar)
        </label>
        <label className="opcao">
          <input type="radio" checked={visibilidade === 'privado'} onChange={() => setVisibilidade('privado')} />
          Só eu
        </label>
      </div>
      {visibilidade === 'terreiro' && podeEscolherFilho && (
        <label>
          É obrigação de algum filho? (opcional)
          <select value={filho} onChange={(e) => setFilho(e.target.value)}>
            <option value="">Não, é da casa</option>
            {irmaos.map((i) => <option key={i.perfil_id} value={i.perfil_id}>{i.apelido}</option>)}
          </select>
          <span className="dica">Assim os relatórios mostram quais irmãos ajudaram na obrigação dele.</span>
        </label>
      )}
      <label>
        Observação (opcional)
        <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} maxLength={500} />
      </label>
      {erro && <p className="erro">{erro}</p>}
      <div className="linha">
        <button className="primario" disabled={salvando}>{salvando ? 'Criando…' : 'Criar e adicionar itens'}</button>
        <button type="button" className="link" onClick={aoCancelar}>Cancelar</button>
      </div>
    </form>
  )
}
