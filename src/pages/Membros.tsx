import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Convites from '../components/Convites'
import { avisar } from '../lib/avisos'
import { ehZelador, useSessao } from '../lib/sessao'
import { mensagemDeErro, supabase } from '../lib/supabase'
import { formatarReais, ROTULO_PAPEL, ROTULO_PERMISSAO, type MembroDaCasa, type Papel, type Permissao } from '../lib/tipos'
import { confirmar } from '../lib/dialogo'

/** Zelador: quem é da casa, papéis, contador e mensalidade de cada filho. */
export default function Membros() {
  const { perfil, casaAtiva } = useSessao()
  const navegar = useNavigate()
  const local = useLocation()
  const terreiro = casaAtiva?.terreiro_id
  const [membros, setMembros] = useState<MembroDaCasa[]>([])
  const [padrao, setPadrao] = useState<number | null>(null)
  const [aberto, setAberto] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    if (!terreiro) return
    const [m, f] = await Promise.all([
      supabase.from('membros').select('*, perfis(apelido)').eq('terreiro_id', terreiro).order('created_at'),
      supabase.from('financeiro_casa').select('valor_padrao').eq('terreiro_id', terreiro).maybeSingle(),
    ])
    setMembros(((m.data ?? []) as unknown as MembroDaCasa[]).sort((a, b) =>
      (a.perfis?.apelido ?? '').localeCompare(b.perfis?.apelido ?? '', 'pt-BR')))
    setPadrao(f.data?.valor_padrao ?? null)
  }, [terreiro])

  useEffect(() => {
    carregar()
  }, [carregar])

  // Atalho "Convidar filhos" da gestão: rola até os convites.
  useEffect(() => {
    if (local.hash === '#convites' && membros.length > 0) {
      document.getElementById('convites')?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [local.hash, membros.length])

  if (!ehZelador(casaAtiva) || !terreiro) {
    return <div className="pagina"><p>Só o zelador da casa vê esta tela.</p></div>
  }

  async function salvar(m: MembroDaCasa, mudancas: Partial<MembroDaCasa>, mensagem: string) {
    const novo = { ...m, ...mudancas }
    const { error } = await supabase.rpc('atualizar_membro', {
      p_usuario: m.perfil_id,
      p_terreiro: terreiro,
      p_aprovado: novo.aprovado,
      p_papel: novo.papel,
      p_contador: novo.contador,
      p_isento: novo.isento,
      p_mensalidade: novo.mensalidade_valor,
    })
    if (error) avisar(mensagemDeErro(error), 'erro')
    else avisar(mensagem)
    await carregar()
  }

  async function remover(m: MembroDaCasa) {
    const nome = m.perfis?.apelido ?? 'esta pessoa'
    if (!(await confirmar(`Tirar ${nome} desta casa?`, { texto: 'A conta continua existindo (para outras casas), mas sai daqui.', botao: 'Tirar da casa', perigo: true }))) return
    const { error } = await supabase.rpc('remover_da_casa', { p_usuario: m.perfil_id, p_terreiro: terreiro })
    if (error) return avisar(mensagemDeErro(error), 'erro')
    avisar(`${nome} saiu da casa.`)
    await carregar()
  }

  const pendentes = membros.filter((m) => !m.aprovado)
  const aprovados = membros.filter((m) => m.aprovado)

  return (
    <div className="pagina">
      <button className="link" onClick={() => navegar('/casa/gestao')}>← Gestão da casa</button>
      <h1>Filhos e funções</h1>
      <p className="sutil">{casaAtiva?.terreiros?.nome}</p>

      {pendentes.length > 0 && (
        <section>
          <h2>Pedidos de entrada ({pendentes.length})</h2>
          {pendentes.map((m) => (
            <div key={m.perfil_id} className="cartao">
              <strong>{m.perfis?.apelido}</strong>
              <div className="sutil">Pediu em {new Date(m.created_at).toLocaleDateString('pt-BR')}</div>
              <div className="linha">
                <button className="primario" onClick={() => salvar(m, { aprovado: true }, `${m.perfis?.apelido} foi aprovado(a).`)}>Aprovar</button>
                <button className="link perigo" onClick={() => remover(m)}>Recusar</button>
              </div>
            </div>
          ))}
        </section>
      )}

      <section>
        <h2>Na casa ({aprovados.length})</h2>
        <p className="sutil">
          Toque em alguém para mudar a função. <strong>Validador</strong> confere folhas e pontos e cuida do calendário;{' '}
          <strong>contador</strong> confere comprovantes e vê o financeiro. Você também pode autorizar alguém a ver as
          fichas, montar escalas, distribuir itens ou cuidar das senhas.
        </p>
        {aprovados.map((m) => {
          const ehEu = m.perfil_id === perfil?.id
          const valor = m.isento ? 'Isento' : formatarReais(m.mensalidade_valor ?? padrao)
          return (
            <div key={m.perfil_id} className="cartao">
              <button className="cabecalho-botao" onClick={() => setAberto(aberto === m.perfil_id ? null : m.perfil_id)}>
                <span>
                  <strong>{m.perfis?.apelido}{ehEu ? ' (você)' : ''}</strong>
                  <div className="sutil">
                    {ROTULO_PAPEL[m.papel]}{m.contador ? ' · contador(a)' : ''}
                    {m.papel !== 'zelador' && (m.permissoes ?? []).length > 0 ? ` · ${(m.permissoes ?? []).length} permissão(ões)` : ''} · mensalidade: {valor}
                    {m.mensalidade_valor !== null && !m.isento ? ' (valor próprio)' : ''}
                  </div>
                </span>
                <span aria-hidden>{aberto === m.perfil_id ? '▲' : '▼'}</span>
              </button>
              {aberto === m.perfil_id && (
                <EditarMembro membro={m} ehEu={ehEu} padrao={padrao} aoSalvar={salvar} aoRemover={remover}
                  aoMudarPermissoes={async (lista) => {
                    const { error } = await supabase.rpc('definir_permissoes', { p_usuario: m.perfil_id, p_terreiro: terreiro, p_permissoes: lista })
                    if (error) avisar(mensagemDeErro(error), 'erro')
                    else avisar('Permissões atualizadas.')
                    await carregar()
                  }} />
              )}
            </div>
          )
        })}
      </section>

      <section className="cartao" id="convites">
        <Convites terreiroId={terreiro} tipo="membro"
          titulo="👥 Convidar filhos da casa"
          explicacao="Envie este link no grupo da casa. Quem já tem conta (por ser de outra casa) entra com a mesma conta. Vale por 30 dias." />
      </section>
    </div>
  )
}

function EditarMembro({ membro, ehEu, padrao, aoSalvar, aoRemover, aoMudarPermissoes }: {
  membro: MembroDaCasa
  ehEu: boolean
  padrao: number | null
  aoSalvar: (m: MembroDaCasa, mudancas: Partial<MembroDaCasa>, mensagem: string) => Promise<void>
  aoRemover: (m: MembroDaCasa) => void
  aoMudarPermissoes: (lista: Permissao[]) => Promise<void>
}) {
  const permissoes = membro.permissoes ?? []
  const [valor, setValor] = useState(membro.mensalidade_valor?.toString() ?? '')
  const nome = membro.perfis?.apelido ?? 'Filho'

  async function mudarPapel(papel: Papel) {
    if (papel === 'zelador' && !(await confirmar(`Tornar ${nome} zelador(a)?`, { texto: 'Zeladores aprovam e removem filhos, veem as finanças, as fichas e o registro de atividades.', botao: 'Tornar zelador(a)' }))) return
    aoSalvar(membro, { papel }, `${nome} agora é ${ROTULO_PAPEL[papel].toLowerCase()}.`)
  }

  return (
    <div className="formulario editar-membro">
      <label>
        Papel na casa
        <select value={membro.papel} disabled={ehEu} onChange={(e) => mudarPapel(e.target.value as Papel)}>
          {(Object.keys(ROTULO_PAPEL) as Papel[]).map((p) => <option key={p} value={p}>{ROTULO_PAPEL[p]}</option>)}
        </select>
        {ehEu && <span className="dica">Você não pode mudar o seu próprio papel.</span>}
      </label>

      <label className="opcao">
        <input type="checkbox" checked={membro.contador}
          onChange={(e) => aoSalvar(membro, { contador: e.target.checked },
            e.target.checked ? `${nome} agora também é contador(a).` : `${nome} deixou de ser contador(a).`)} />
        Também é contador(a): confere comprovantes e vê as finanças da casa
      </label>

      {membro.papel !== 'zelador' && (
        <fieldset className="permissoes">
          <legend>Também pode:</legend>
          {(Object.keys(ROTULO_PERMISSAO) as Permissao[]).map((p) => (
            <label key={p} className="opcao">
              <input type="checkbox" checked={permissoes.includes(p)}
                onChange={(e) => aoMudarPermissoes(e.target.checked ? [...permissoes, p] : permissoes.filter((x) => x !== p))} />
              {ROTULO_PERMISSAO[p]}
            </label>
          ))}
        </fieldset>
      )}

      <label className="opcao">
        <input type="checkbox" checked={membro.isento}
          onChange={(e) => aoSalvar(membro, { isento: e.target.checked },
            e.target.checked ? `${nome} está isento(a) da mensalidade.` : `${nome} volta a pagar mensalidade.`)} />
        Isento(a) de mensalidade
      </label>

      {!membro.isento && (
        <label>
          Valor da mensalidade deste filho (vazio = padrão da casa{padrao !== null ? `, ${formatarReais(padrao)}` : ''})
          <span className="linha">
            <input type="number" inputMode="decimal" min="0" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)}
              placeholder="Padrão da casa" className="cresce" />
            <button type="button" className="botao"
              onClick={() => aoSalvar(membro, { mensalidade_valor: valor === '' ? null : Number(valor) },
                valor === '' ? `${nome} paga o valor padrão.` : `Mensalidade de ${nome}: ${formatarReais(Number(valor))}.`)}>
              Salvar valor
            </button>
          </span>
        </label>
      )}

      {!ehEu && <button type="button" className="link perigo" onClick={() => aoRemover(membro)}>Tirar desta casa</button>}
    </div>
  )
}
