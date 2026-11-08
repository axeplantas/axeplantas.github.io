import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { avisar } from '../lib/avisos'
import { ehValidador, useSessao } from '../lib/sessao'
import { mensagemDeErro, supabase } from '../lib/supabase'
import { semAcento } from '../lib/texto'
import type { Folha } from '../lib/tipos'
import Topo from '../components/Topo'

type Existente = Pick<Folha, 'id' | 'nome_popular' | 'outros_nomes' | 'nome_cientifico'>

export default function NovaFolha() {
  const { perfil } = useSessao()
  const navegar = useNavigate()
  const [campos, setCampos] = useState({
    nome_popular: '',
    nome_ritual: '',
    outros_nomes: '',
    nome_cientifico: '',
    alerta: '',
  })
  const [toxica, setToxica] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [existentes, setExistentes] = useState<Existente[]>([])

  useEffect(() => {
    supabase
      .from('folhas')
      .select('id, nome_popular, outros_nomes, nome_cientifico')
      .neq('status', 'recusada')
      .then(({ data }) => setExistentes((data ?? []) as Existente[]))
  }, [])

  // Folhas que já existem com nome parecido com o que está sendo digitado.
  const parecidas = useMemo(() => {
    const termo = semAcento(campos.nome_popular.trim())
    if (termo.length < 3) return []
    return existentes
      .filter((f) => semAcento([f.nome_popular, f.outros_nomes, f.nome_cientifico].filter(Boolean).join(' ')).includes(termo))
      .slice(0, 5)
  }, [campos.nome_popular, existentes])

  const igual = parecidas.find((f) => semAcento(f.nome_popular) === semAcento(campos.nome_popular.trim()))

  const mudar = (campo: keyof typeof campos) => (e: { target: { value: string } }) =>
    setCampos((c) => ({ ...c, [campo]: e.target.value }))

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!perfil) return
    if (igual) return setErro(`Já existe a folha “${igual.nome_popular}”. Toque nela acima em vez de cadastrar de novo.`)
    setSalvando(true)
    const limpo = Object.fromEntries(Object.entries(campos).map(([k, v]) => [k, v.trim() || null]))
    const { data, error } = await supabase
      .from('folhas')
      .insert({ ...limpo, toxica, terreiro_id: perfil.terreiro_id })
      .select('id')
      .single()
    if (error) {
      setErro(mensagemDeErro(error))
      setSalvando(false)
      return
    }
    avisar(ehValidador(perfil) ? 'Folha cadastrada!' : 'Folha enviada! O validador da sua casa vai conferir.')
    navegar(`/folhas/${data.id}`, { replace: true })
  }

  return (
    <form className="pagina formulario" onSubmit={salvar}>
      <Topo titulo="Nova folha" voltar={-1} />
      {!ehValidador(perfil) && (
        <p className="aviso">A folha aparece para todos depois que um validador do seu terreiro aprovar.</p>
      )}
      <label>
        Nome popular *
        <input value={campos.nome_popular} onChange={mudar('nome_popular')} required maxLength={60} placeholder="Ex.: Aroeira" />
      </label>

      {parecidas.length > 0 && (
        <div className="aviso">
          <strong>{igual ? 'Esta folha já existe:' : 'Já existem folhas parecidas. É alguma destas?'}</strong>
          <ul className="lista-parecidas">
            {parecidas.map((f) => (
              <li key={f.id}>
                <Link to={`/folhas/${f.id}`}>{f.nome_popular}</Link>
                {f.nome_cientifico && <em className="sutil"> · {f.nome_cientifico}</em>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <label>
        Nome no Axé (Yorubá, Kikongo, Tupi…)
        <input value={campos.nome_ritual} onChange={mudar('nome_ritual')} maxLength={60} placeholder="Como é chamada na sua casa" />
      </label>
      <label>
        Outros nomes da região
        <input value={campos.outros_nomes} onChange={mudar('outros_nomes')} maxLength={120} placeholder="Separe por vírgula" />
      </label>
      <label>
        Nome científico (se souber)
        <input value={campos.nome_cientifico} onChange={mudar('nome_cientifico')} maxLength={80}
          placeholder="Ex.: Schinus terebinthifolia" autoCapitalize="none" />
      </label>
      <label className="opcao">
        <input type="checkbox" checked={toxica} onChange={(e) => setToxica(e.target.checked)} />
        Esta folha é tóxica ou pede cuidado
      </label>
      <label>
        Cuidados / não confundir com…
        <textarea value={campos.alerta} onChange={mudar('alerta')} rows={2} maxLength={300} />
      </label>
      <p className="sutil">Orixás e usos são registrados depois, na página da folha, e ficam visíveis só para a sua casa.</p>
      {erro && <p className="erro">{erro}</p>}
      <button className="primario" disabled={salvando}>{salvando ? 'Salvando…' : 'Cadastrar folha'}</button>
      <button type="button" className="link" onClick={() => navegar(-1)}>Cancelar</button>
    </form>
  )
}
