import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { avisar } from '../lib/avisos'
import { hojeIso } from '../lib/casa'
import { temPermissao, useSessao } from '../lib/sessao'
import { mensagemDeErro, supabase } from '../lib/supabase'
import type { Senha } from '../lib/tipos'

const ROTULO: Record<Senha['status'], string> = {
  aguardando: 'Aguardando',
  chamada: 'Chamada',
  atendida: 'Atendida',
  ausente: 'Não veio',
}

const doisDigitos = (n: number) => String(n).padStart(2, '0')

/** Senhas da gira: na porta, anota o nome e entrega o número; depois chama na ordem. */
export default function Senhas() {
  const { casaAtiva } = useSessao()
  const navegar = useNavigate()
  const terreiro = casaAtiva?.terreiro_id
  const [aba, setAba] = useState<'porta' | 'chamar'>('porta')
  const [senhas, setSenhas] = useState<Senha[]>([])
  const [telaCheia, setTelaCheia] = useState(false)

  const carregar = useCallback(async () => {
    if (!terreiro) return
    const { data } = await supabase.from('senhas').select('*').eq('terreiro_id', terreiro).eq('data', hojeIso()).order('numero')
    setSenhas(((data ?? []) as Senha[]).sort((a, b) => a.numero - b.numero))
  }, [terreiro])

  // Mais de um celular pode estar usando (um na porta, outro chamando): atualiza a cada 5 s.
  useEffect(() => {
    carregar()
    const relogio = setInterval(carregar, 5000)
    return () => clearInterval(relogio)
  }, [carregar])

  if (!temPermissao(casaAtiva, 'senhas') || !terreiro) {
    return <div className="pagina"><p>Somente o zelador e quem ele autorizar cuidam das senhas.</p></div>
  }

  const aguardando = senhas.filter((s) => s.status === 'aguardando')
  const atual = senhas
    .filter((s) => s.status === 'chamada')
    .sort((a, b) => (b.chamada_em ?? '').localeCompare(a.chamada_em ?? ''))[0]

  if (telaCheia) {
    return (
      <div className="painel-senha" onClick={() => setTelaCheia(false)}>
        <span className="painel-rotulo">Senha</span>
        <span className="painel-numero">{atual ? doisDigitos(atual.numero) : '--'}</span>
        <span className="painel-nome">{atual?.nome ?? ''}</span>
        <span className="painel-rodape">{aguardando.length} aguardando · toque para sair</span>
      </div>
    )
  }

  return (
    <div className="pagina">
      <button className="link" onClick={() => navegar('/casa')}>← Casa</button>
      <h1>Senhas da gira</h1>
      <p className="sutil">Hoje, {new Date().toLocaleDateString('pt-BR')} · {senhas.length} senha(s) entregue(s) · {aguardando.length} aguardando</p>

      <div className="abas">
        <button className={aba === 'porta' ? 'ativa' : ''} onClick={() => setAba('porta')}>🚪 Na porta</button>
        <button className={aba === 'chamar' ? 'ativa' : ''} onClick={() => setAba('chamar')}>📣 Chamar</button>
      </div>

      {aba === 'porta' ? (
        <Porta terreiro={terreiro} aoEmitir={carregar} />
      ) : (
        <Chamar terreiro={terreiro} atual={atual} aguardando={aguardando.length} aoMudar={carregar}
          aoTelaCheia={() => setTelaCheia(true)} />
      )}

      <section>
        <h2>Senhas de hoje</h2>
        {senhas.length === 0 && <p className="sutil">Nenhuma senha entregue ainda.</p>}
        <ul className="lista-senhas">
          {senhas.map((s) => (
            <li key={s.id} className={`senha-linha senha-${s.status}`}>
              <b className="senha-numero">{doisDigitos(s.numero)}</b>
              <span className="cresce">{s.nome}</span>
              <span className="sutil">{ROTULO[s.status]}</span>
              {s.status !== 'aguardando' && s.id !== atual?.id && (
                <button className="link" onClick={async () => {
                  await supabase.rpc('marcar_senha', { p_senha: s.id, p_status: 'chamada' })
                  carregar()
                }}>Chamar de novo</button>
              )}
            </li>
          ))}
        </ul>
        <p className="sutil">Os nomes ficam guardados só por 30 dias; depois fica apenas a contagem de atendimentos.</p>
      </section>
    </div>
  )
}

function Porta({ terreiro, aoEmitir }: { terreiro: string; aoEmitir: () => Promise<void> }) {
  const [nome, setNome] = useState('')
  const [ultima, setUltima] = useState<{ numero: number; nome: string } | null>(null)
  const [enviando, setEnviando] = useState(false)
  const campo = useRef<HTMLInputElement>(null)

  async function emitir(e: FormEvent) {
    e.preventDefault()
    setEnviando(true)
    const { data, error } = await supabase.rpc('emitir_senha', { p_terreiro: terreiro, p_nome: nome })
    setEnviando(false)
    if (error) return avisar(mensagemDeErro(error), 'erro')
    const primeiro = nome.trim().split(' ')[0]
    setUltima({ numero: data as number, nome: primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase() })
    setNome('')
    campo.current?.focus()
    await aoEmitir()
  }

  return (
    <div className="cartao formulario">
      {ultima && (
        <div className="senha-entregue">
          <span>Diga a {ultima.nome}:</span>
          <strong>Senha {doisDigitos(ultima.numero)}</strong>
        </div>
      )}
      <form onSubmit={emitir} className="formulario">
        <label>
          Primeiro nome de quem chegou
          <input ref={campo} value={nome} onChange={(e) => setNome(e.target.value)} required maxLength={40}
            autoCapitalize="words" autoComplete="off" placeholder="Ex.: Maria" />
        </label>
        <button className="primario bloco" disabled={enviando || !nome.trim()}>{enviando ? '…' : '🎟️ Dar a próxima senha'}</button>
      </form>
    </div>
  )
}

function Chamar({ terreiro, atual, aguardando, aoMudar, aoTelaCheia }: {
  terreiro: string
  atual: Senha | undefined
  aguardando: number
  aoMudar: () => Promise<void>
  aoTelaCheia: () => void
}) {
  async function proxima() {
    if (atual) await supabase.rpc('marcar_senha', { p_senha: atual.id, p_status: 'atendida' })
    const { data, error } = await supabase.rpc('chamar_proxima_senha', { p_terreiro: terreiro })
    if (error) avisar(mensagemDeErro(error), 'erro')
    else if (!data) avisar('Não há mais ninguém aguardando.')
    await aoMudar()
  }

  async function marcar(status: Senha['status']) {
    if (!atual) return
    await supabase.rpc('marcar_senha', { p_senha: atual.id, p_status: status })
    await aoMudar()
  }

  return (
    <div className="cartao chamada">
      <span className="sutil">Chamando agora</span>
      <span className="chamada-numero">{atual ? doisDigitos(atual.numero) : '--'}</span>
      <span className="chamada-nome">{atual?.nome ?? (aguardando ? 'Toque em “Chamar próxima”' : 'Ninguém aguardando')}</span>
      <button className="primario bloco grande" onClick={proxima} disabled={!aguardando}>
        📣 Chamar próxima {aguardando ? `(${aguardando} aguardando)` : ''}
      </button>
      {atual && (
        <div className="linha">
          <button className="botao cresce" onClick={() => marcar('atendida')}>✅ Atendida</button>
          <button className="botao cresce" onClick={() => marcar('ausente')}>🚶 Não veio</button>
        </div>
      )}
      <button className="link" onClick={aoTelaCheia}>📺 Mostrar em tela grande</button>
    </div>
  )
}
