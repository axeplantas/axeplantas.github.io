import { useCallback, useEffect, useState, type FormEvent } from 'react'
import CompartilharLink from '../components/CompartilharLink'
import { avisar } from '../lib/avisos'
import Convites from '../components/Convites'
import { useSessao } from '../lib/sessao'
import { linkDoConvite, mensagemDeErro, supabase } from '../lib/supabase'
import { ROTULO_PAPEL, type MembroDaCasa, type Papel, type Terreiro } from '../lib/tipos'
import { confirmar } from '../lib/dialogo'
import Topo from '../components/Topo'

const NACOES = ['Candomblé de Ketu', 'Candomblé de Angola', 'Candomblé Jeje', 'Umbanda', 'Umbanda / Jurema / Quimbanda', 'Jurema', 'Quimbanda']

export default function Admin() {
  const { perfil, recarregarPerfil } = useSessao()
  const [terreiros, setTerreiros] = useState<Terreiro[]>([])
  const [vinculos, setVinculos] = useState<MembroDaCasa[]>([])
  const [aberto, setAberto] = useState<string | null>(null)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    const [t, p] = await Promise.all([
      supabase.from('terreiros').select('id, nome, nacao').order('nome'),
      supabase.from('membros').select('*, perfis(apelido)').order('created_at'),
    ])
    setTerreiros((t.data ?? []) as Terreiro[])
    setVinculos((p.data ?? []) as unknown as MembroDaCasa[])
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function executar(acao: PromiseLike<{ error: unknown }>) {
    setErro('')
    const { error } = await acao
    if (error) setErro(mensagemDeErro(error))
    else avisar('Pronto!')
    await carregar()
  }

  const pendentes = vinculos.filter((v) => !v.aprovado)
  const nomeTerreiro = (id: string | null) => terreiros.find((t) => t.id === id)?.nome ?? 'Sem terreiro'

  return (
    <div className="pagina">
      <Topo titulo="Administração" voltar="/perfil" />
      <p className="sutil">Só você vê esta área. Aqui você cria os terreiros e convida os zeladores.</p>
      {erro && <p className="erro">{erro}</p>}

      <NovoTerreiro aoCriar={carregar} />

      <section>
        <h2>Terreiros ({terreiros.length})</h2>
        {terreiros.length === 0 && <p className="sutil">Nenhum terreiro ainda. Crie o primeiro acima.</p>}
        {terreiros.map((t) => {
          const membros = vinculos.filter((v) => v.terreiro_id === t.id)
          const zeladores = membros.filter((p) => p.papel === 'zelador' && p.aprovado)
          return (
            <div key={t.id} className="cartao">
              <button className="cabecalho-botao" onClick={() => setAberto(aberto === t.id ? null : t.id)}>
                <span>
                  <strong>{t.nome}</strong>
                  <span className="sutil"> · {t.nacao}</span>
                  <div className="sutil">
                    {membros.filter((m) => m.aprovado).length} membro(s) ·{' '}
                    {zeladores.length > 0 ? `Zelador(a): ${zeladores.map((z) => z.perfis?.apelido).join(', ')}` : 'Sem zelador ainda'}
                  </div>
                </span>
                <span aria-hidden>{aberto === t.id ? '▲' : '▼'}</span>
              </button>
              {aberto === t.id && <LinksDoTerreiro terreiroId={t.id} temZelador={zeladores.length > 0} />}
            </div>
          )
        })}
      </section>

      <section>
        <h2>Pedidos de entrada ({pendentes.length})</h2>
        {pendentes.length === 0 && <p className="sutil">Nenhum pedido aguardando.</p>}
        {pendentes.map((m) => (
          <div key={`${m.perfil_id}-${m.terreiro_id}`} className="cartao">
            <strong>{m.perfis?.apelido}</strong>
            <div className="sutil">{nomeTerreiro(m.terreiro_id)} · pediu em {new Date(m.created_at).toLocaleDateString('pt-BR')}</div>
            <div className="linha">
              <button className="primario"
                onClick={() => executar(supabase.rpc('atualizar_membro', {
                  p_usuario: m.perfil_id, p_terreiro: m.terreiro_id, p_aprovado: true, p_papel: 'membro',
                  p_contador: false, p_isento: false, p_mensalidade: null,
                }))}>
                Aprovar
              </button>
              <button className="link perigo"
                onClick={async () => (await confirmar(`Recusar o pedido de ${m.perfis?.apelido} para ${nomeTerreiro(m.terreiro_id)}?`, { botao: 'Recusar', perigo: true })) &&
                  executar(supabase.rpc('remover_da_casa', { p_usuario: m.perfil_id, p_terreiro: m.terreiro_id }))}>
                Recusar
              </button>
            </div>
          </div>
        ))}
      </section>

      <MinhaCasa terreiros={terreiros} aoSalvar={async () => { await recarregarPerfil(); await carregar() }}
        atual={perfil?.terreiro_id ?? ''} papelAtual={perfil?.papel ?? 'membro'} />
    </div>
  )
}

function LinksDoTerreiro({ terreiroId, temZelador }: { terreiroId: string; temZelador: boolean }) {
  const [mostrarZelador, setMostrarZelador] = useState(!temZelador)

  return (
    <>
      <Convites terreiroId={terreiroId} tipo="membro"
        titulo="Link para os filhos (várias pessoas)"
        explicacao="Este é o link para mandar no grupo da casa. Várias pessoas podem usar; cada uma fica aguardando aprovação. Vale por 30 dias." />
      {mostrarZelador ? (
        <div className="alerta-zelador">
          <Convites terreiroId={terreiroId} tipo="zelador"
            titulo="Link para o zelador (1 pessoa só)"
            explicacao="Atenção: quem entrar por este link vira ZELADOR(A) da casa. Funciona para uma única pessoa. Não mande no grupo." />
        </div>
      ) : (
        <button className="link" onClick={() => setMostrarZelador(true)}>Convidar outro zelador(a)</button>
      )}
    </>
  )
}

function NovoTerreiro({ aoCriar }: { aoCriar: () => Promise<void> }) {
  const [aberto, setAberto] = useState(false)
  const [nome, setNome] = useState('')
  const [nacao, setNacao] = useState(NACOES[0])
  const [link, setLink] = useState<string | null>(null)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function criar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    setSalvando(true)
    const { data, error } = await supabase.rpc('criar_terreiro', { p_nome: nome, p_nacao: nacao })
    setSalvando(false)
    if (error) return setErro(mensagemDeErro(error))
    setLink(linkDoConvite(data as string))
    await aoCriar()
  }

  if (!aberto) {
    return <button className="primario bloco" onClick={() => setAberto(true)}>+ Novo terreiro</button>
  }

  if (link) {
    return (
      <div className="cartao">
        <h2>Terreiro “{nome}” criado!</h2>
        <p>
          Agora envie este link <strong>somente para o zelador ou a zeladora</strong>, no privado. Ele funciona para uma
          pessoa só: quem entrar vira zelador(a) da casa. Os filhos entram depois, pelo link que o zelador gera.
        </p>
        <CompartilharLink link={link}
          mensagem="Você foi convidado(a) como zelador(a) no Axé Plantas, o mapa das folhas. Crie sua conta pelo link:" />
        <p className="sutil">
          Se você mesmo é o zelador desta casa, não envie este link: escolha a casa em “A minha casa”, aqui embaixo.
          O link vale por 7 dias.
        </p>
        <button className="link" onClick={() => { setAberto(false); setLink(null); setNome('') }}>Fechar</button>
      </div>
    )
  }

  return (
    <form className="cartao formulario" onSubmit={criar}>
      <h2>Novo terreiro</h2>
      <label>
        Nome do terreiro
        <input value={nome} onChange={(e) => setNome(e.target.value)} required maxLength={80} />
      </label>
      <label>
        Nação / linha
        <input list="nacoes" value={nacao} onChange={(e) => setNacao(e.target.value)} required maxLength={60} />
        <datalist id="nacoes">
          {NACOES.map((n) => <option key={n} value={n} />)}
        </datalist>
      </label>
      {erro && <p className="erro">{erro}</p>}
      <div className="linha">
        <button className="primario" disabled={salvando}>{salvando ? 'Criando…' : 'Criar e gerar link do zelador'}</button>
        <button type="button" className="link" onClick={() => setAberto(false)}>Cancelar</button>
      </div>
    </form>
  )
}

function MinhaCasa({ terreiros, atual, papelAtual, aoSalvar }: {
  terreiros: Terreiro[]
  atual: string
  papelAtual: Papel
  aoSalvar: () => Promise<void>
}) {
  const [terreiro, setTerreiro] = useState(atual)
  const [papel, setPapel] = useState<Papel>(papelAtual)
  const [mensagem, setMensagem] = useState('')

  async function salvar(e: FormEvent) {
    e.preventDefault()
    const { error } = await supabase.rpc('entrar_no_terreiro', { p_terreiro: terreiro, p_papel: papel })
    setMensagem(error ? mensagemDeErro(error) : 'Salvo!')
    if (!error) await aoSalvar()
  }

  return (
    <form className="cartao formulario" onSubmit={salvar}>
      <h2>A minha casa</h2>
      <p className="sutil">Para usar o mapa e as obrigações, escolha o terreiro do qual você faz parte.</p>
      {terreiros.length === 0 && <p className="aviso">Primeiro crie o terreiro em “+ Novo terreiro”, lá em cima.</p>}
      <select value={terreiro} onChange={(e) => setTerreiro(e.target.value)} required disabled={terreiros.length === 0}>
        <option value="">Escolha…</option>
        {terreiros.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
      </select>
      <select value={papel} onChange={(e) => setPapel(e.target.value as Papel)}>
        {(Object.keys(ROTULO_PAPEL) as Papel[]).map((p) => <option key={p} value={p}>{ROTULO_PAPEL[p]}</option>)}
      </select>
      {mensagem && <p className="aviso">{mensagem}</p>}
      <button className="primario" disabled={terreiros.length === 0}>Salvar</button>
    </form>
  )
}
