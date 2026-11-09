import { BellRing, House } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { avisar } from '../lib/avisos'
import { MODULOS, type Modulo, type Modulos } from '../lib/modulos'
import { ehGestorFinanceiro, ehZelador, useSessao } from '../lib/sessao'
import { mensagemDeErro, supabase } from '../lib/supabase'
import type { FinanceiroCasa } from '../lib/tipos'
import ConfigurarFicha from '../components/ConfigurarFicha'
import Topo from '../components/Topo'

const DIAS_AVISO = [7, 5, 3, 2, 1, 0]

/** Zelador: o que aparece no app da casa, lembretes de pagamento e dados da casa. */
export default function Configuracoes() {
  const { casaAtiva, modulos, recarregarPerfil } = useSessao()
  const terreiro = casaAtiva?.terreiro_id
  const [escolha, setEscolha] = useState<Modulos>(modulos)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => setEscolha(modulos), [modulos])

  if (!ehZelador(casaAtiva) || !terreiro) {
    return <div className="pagina"><p>Só o zelador da casa mexe nas configurações.</p></div>
  }

  const mudou = MODULOS.some((m) => escolha[m.chave] !== modulos[m.chave])

  async function salvarModulos() {
    setSalvando(true)
    const { error } = await supabase.rpc('configurar_modulos', { p_terreiro: terreiro, p_modulos: escolha })
    setSalvando(false)
    if (error) return avisar(mensagemDeErro(error), 'erro')
    await recarregarPerfil()
    avisar('Pronto! O app da casa foi atualizado para todos os filhos.')
  }

  return (
    <div className="pagina">
      <Topo titulo="Configurações da casa" voltar={'/casa/gestao'} />
      <p className="sutil">{casaAtiva?.terreiros?.nome}</p>

      <section>
        <h2>O que a casa usa no dia a dia</h2>
        <p className="sutil">
          Desligue o que a sua casa não usa: some do app de todos os filhos e deixa tudo mais simples. Dá para religar
          quando quiser, sem perder nada.
        </p>
        <div className="lista-modulos">
          {MODULOS.map((m) => (
            <label key={m.chave} className={`modulo ${escolha[m.chave] ? 'ligado' : ''}`}>
              <span className="tile" aria-hidden><m.icone size={22} /></span>
              <span className="cresce">
                <strong>{m.nome}</strong>
                <span className="sutil">{m.descricao}</span>
              </span>
              <input type="checkbox" role="switch" className="interruptor" checked={escolha[m.chave]}
                onChange={(e) => setEscolha((atual) => ({ ...atual, [m.chave as Modulo]: e.target.checked }))} />
            </label>
          ))}
        </div>
        {mudou && (
          <button className="primario bloco" onClick={salvarModulos} disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar o que a casa usa'}
          </button>
        )}
      </section>

      {modulos.fichas && <ConfigurarFicha terreiro={terreiro} />}

      {modulos.financeiro && ehGestorFinanceiro(casaAtiva) && <Lembretes terreiro={terreiro} />}

      <DadosDaCasa terreiro={terreiro} nome={casaAtiva?.terreiros?.nome ?? ''} nacao={casaAtiva?.terreiros?.nacao ?? ''}
        aoSalvar={recarregarPerfil} />
    </div>
  )
}

function Lembretes({ terreiro }: { terreiro: string }) {
  const [dias, setDias] = useState<Set<number>>(new Set([3, 0]))
  const [atrasados, setAtrasados] = useState(true)
  const [intervalo, setIntervalo] = useState(7)
  const [carregado, setCarregado] = useState(false)

  useEffect(() => {
    supabase.from('financeiro_casa').select('*').eq('terreiro_id', terreiro).maybeSingle().then(({ data }) => {
      const f = data as FinanceiroCasa | null
      if (f?.lembrete_dias) setDias(new Set(f.lembrete_dias))
      if (f?.lembrar_atrasados !== undefined) setAtrasados(f.lembrar_atrasados)
      if (f?.atraso_intervalo) setIntervalo(f.atraso_intervalo)
      setCarregado(true)
    })
  }, [terreiro])

  async function salvar() {
    const { error } = await supabase.rpc('configurar_lembretes', {
      p_terreiro: terreiro, p_dias: [...dias].sort((a, b) => b - a), p_atrasados: atrasados, p_intervalo: intervalo,
    })
    if (error) return avisar(mensagemDeErro(error), 'erro')
    avisar('Lembretes salvos.')
  }

  if (!carregado) return null

  return (
    <section className="cartao formulario">
      <h2 className="secao-titulo"><BellRing size={20} /> Lembretes de pagamento</h2>
      <p className="sutil">
        Quem ainda não pagou (nem enviou comprovante) recebe um aviso no celular, de manhã, nos dias que você escolher.
        Vale para mensalidades e contribuições.
      </p>
      <div>
        <strong>Avisar antes do vencimento</strong>
        <div className="chips">
          {DIAS_AVISO.map((d) => (
            <button key={d} type="button" className={`chip ${dias.has(d) ? 'ativo' : ''}`}
              onClick={() => setDias((s) => {
                const novo = new Set(s)
                if (novo.has(d)) novo.delete(d)
                else novo.add(d)
                return novo
              })}>
              {d === 0 ? 'No dia' : `${d} dia${d > 1 ? 's' : ''} antes`}
            </button>
          ))}
        </div>
      </div>
      <label className="opcao">
        <input type="checkbox" checked={atrasados} onChange={(e) => setAtrasados(e.target.checked)} />
        Continuar avisando quem está em atraso
      </label>
      {atrasados && (
        <label>
          De quanto em quanto tempo
          <select value={intervalo} onChange={(e) => setIntervalo(Number(e.target.value))}>
            <option value={1}>Todo dia</option>
            <option value={3}>A cada 3 dias</option>
            <option value={7}>Uma vez por semana</option>
            <option value={15}>A cada 15 dias</option>
          </select>
        </label>
      )}
      <p className="sutil">
        {dias.size === 0 && !atrasados
          ? 'Nenhum lembrete: os filhos só verão as cobranças ao abrir o app.'
          : `Resumo: ${[...dias].sort((a, b) => b - a).map((d) => (d === 0 ? 'no dia' : `${d} dia(s) antes`)).join(', ') || 'sem aviso antes'}${atrasados ? `; depois, ${intervalo === 1 ? 'todo dia' : `a cada ${intervalo} dias`} enquanto estiver em atraso` : ''}.`}
      </p>
      <button type="button" className="primario" onClick={salvar}>Salvar lembretes</button>
    </section>
  )
}

function DadosDaCasa({ terreiro, nome, nacao, aoSalvar }: {
  terreiro: string
  nome: string
  nacao: string
  aoSalvar: () => Promise<void>
}) {
  const [novoNome, setNovoNome] = useState(nome)
  const [novaNacao, setNovaNacao] = useState(nacao)
  const [erro, setErro] = useState('')

  async function salvar(e: FormEvent) {
    e.preventDefault()
    const { error } = await supabase.rpc('atualizar_terreiro', { p_terreiro: terreiro, p_nome: novoNome, p_nacao: novaNacao })
    if (error) return setErro(mensagemDeErro(error))
    setErro('')
    avisar('Dados da casa atualizados.')
    await aoSalvar()
  }

  return (
    <form className="cartao formulario" onSubmit={salvar}>
      <h2 className="secao-titulo"><House size={20} /> Dados da casa</h2>
      <label>
        Nome da casa
        <input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} required maxLength={80} />
      </label>
      <label>
        Nação / linha
        <input value={novaNacao} onChange={(e) => setNovaNacao(e.target.value)} required maxLength={60} />
      </label>
      {erro && <p className="erro">{erro}</p>}
      <button className="primario" disabled={novoNome === nome && novaNacao === nacao}>Salvar dados da casa</button>
    </form>
  )
}
