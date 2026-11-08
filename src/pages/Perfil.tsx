import { ShieldCheck } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ehAdmin, useSessao } from '../lib/sessao'
import AtivarNotificacoes from '../components/AtivarNotificacoes'
import CampoSenha from '../components/CampoSenha'
import Topo from '../components/Topo'
import { VERSAO } from '../lib/atualizacao'
import { aplicarTema, temaEscolhido, type Tema } from '../lib/tema'
import { avisar } from '../lib/avisos'
import { BUCKET_FOTOS, mensagemDeErro, supabase } from '../lib/supabase'
import { ROTULO_PAPEL } from '../lib/tipos'

export default function Perfil() {
  const { perfil, sessao, recarregarPerfil, sair } = useSessao()
  const [apelido, setApelido] = useState(perfil?.apelido ?? '')
  const [mensagem, setMensagem] = useState('')

  async function salvar(e: FormEvent) {
    e.preventDefault()
    const { error } = await supabase.from('perfis').update({ apelido: apelido.trim() }).eq('id', perfil!.id)
    if (error) setMensagem(mensagemDeErro(error))
    else {
      setMensagem('')
      avisar('Nome atualizado.')
      recarregarPerfil()
    }
  }

  return (
    <div className="pagina">
      <Topo titulo="Perfil" />
      <div className="cartao">
        <div><strong>{perfil?.terreiros?.nome ?? 'Sem terreiro'}</strong></div>
        <div className="sutil">{perfil?.terreiros?.nacao}</div>
        <div className="sutil">{perfil && ROTULO_PAPEL[perfil.papel]} · {sessao?.user.email}</div>
      </div>

      {ehAdmin(perfil) && (
        <Link to="/admin" className="botao bloco"><ShieldCheck size={18} aria-hidden /> Administração (terreiros e convites)</Link>
      )}

      <form className="formulario" onSubmit={salvar}>
        <label>
          Como quer ser chamado(a)
          <input value={apelido} onChange={(e) => setApelido(e.target.value)} required maxLength={40} />
        </label>
        {mensagem && <p className="aviso">{mensagem}</p>}
        <button className="primario">Salvar</button>
      </form>

      <AtivarNotificacoes motivo="Receba avisos no celular: quando seu acesso ou seus pontos forem aprovados e, se você valida, quando houver algo para conferir." />

      <Aparencia />

      <TrocarSenha />

      <section className="cartao">
        <h2>Instalar no celular</h2>
        <p><strong>iPhone:</strong> abra no Safari, toque em Compartilhar (□↑) e depois em “Adicionar à Tela de Início”.</p>
        <p><strong>Android:</strong> abra no Chrome, toque nos três pontinhos (⋮) e depois em “Instalar app” ou “Adicionar à tela inicial”.</p>
      </section>

      <section className="cartao">
        <h2>Cuidados na coleta</h2>
        <ul>
          <li>Peça licença antes de colher.</li>
          <li>Não arranque a planta inteira: deixe para que ela continue viva.</li>
          <li>Não entre em terreno particular sem autorização.</li>
          <li>Na dúvida sobre a identificação, não use: pergunte aos mais velhos.</li>
        </ul>
      </section>

      <section className="cartao">
        <h2>Seus dados</h2>
        <p className="sutil">
          Saiba como cuidamos das suas informações na <a href="privacidade.html" target="_blank">Política de Privacidade</a>{' '}
          e veja os <a href="termos.html" target="_blank">Termos de Uso</a>.
        </p>
      </section>

      <button className="link perigo" onClick={sair}>Sair da conta</button>

      <ExcluirConta />

      <p className="versao">Versão de {VERSAO}</p>
    </div>
  )
}

function TrocarSenha() {
  const [aberto, setAberto] = useState(false)
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setSalvando(true)
    const { error } = await supabase.auth.updateUser({ password: senha })
    setSalvando(false)
    if (error) return setErro(mensagemDeErro(error))
    avisar('Senha alterada!')
    setSenha('')
    setAberto(false)
  }

  if (!aberto) return <button className="link" onClick={() => setAberto(true)}>Trocar minha senha</button>

  return (
    <form className="cartao formulario" onSubmit={salvar}>
      <h2>Trocar senha</h2>
      <CampoSenha valor={senha} aoMudar={setSenha} novaSenha rotulo="Nova senha" />
      {erro && <p className="erro">{erro}</p>}
      <div className="linha">
        <button className="primario" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar nova senha'}</button>
        <button type="button" className="link" onClick={() => setAberto(false)}>Cancelar</button>
      </div>
    </form>
  )
}

function ExcluirConta() {
  const { perfil, sair } = useSessao()
  const [aberto, setAberto] = useState(false)
  const [confirmacao, setConfirmacao] = useState('')
  const [excluindo, setExcluindo] = useState(false)
  const [erro, setErro] = useState('')

  async function excluir(e: FormEvent) {
    e.preventDefault()
    if (!perfil) return
    setErro('')
    setExcluindo(true)
    try {
      // 1. Fotos enviadas pela pessoa
      const { data: fotos, error: erroLista } = await supabase.storage.from(BUCKET_FOTOS).list(perfil.id, { limit: 1000 })
      if (erroLista) throw erroLista
      if (fotos && fotos.length > 0) {
        const { error } = await supabase.storage.from(BUCKET_FOTOS).remove(fotos.map((f) => `${perfil.id}/${f.name}`))
        if (error) throw error
      }
      // 2. Dados privados e a conta
      const { error } = await supabase.rpc('excluir_minha_conta')
      if (error) throw error
      await sair()
    } catch (err) {
      setErro(mensagemDeErro(err))
      setExcluindo(false)
    }
  }

  if (!aberto) {
    return (
      <button className="link perigo pequeno" onClick={() => setAberto(true)}>
        Excluir minha conta
      </button>
    )
  }

  return (
    <form className="cartao formulario perigo-borda" onSubmit={excluir}>
      <h2>Excluir minha conta</h2>
      <p>Isto não pode ser desfeito. Ao excluir:</p>
      <ul>
        <li>sua conta, seu apelido e suas fotos são apagados;</li>
        <li>seus pontos e obrigações marcados como “Só eu” são apagados;</li>
        <li>os pontos que você compartilhou continuam no mapa, sem foto e sem o seu nome, para ajudar a comunidade.</li>
      </ul>
      <label>
        Digite EXCLUIR para confirmar
        <input value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} autoCapitalize="characters" />
      </label>
      {erro && <p className="erro">{erro}</p>}
      <div className="linha">
        <button className="primario perigo-fundo" disabled={confirmacao.trim().toUpperCase() !== 'EXCLUIR' || excluindo}>
          {excluindo ? 'Excluindo…' : 'Excluir definitivamente'}
        </button>
        <button type="button" className="link" onClick={() => setAberto(false)}>Cancelar</button>
      </div>
    </form>
  )
}

function Aparencia() {
  const [tema, setTema] = useState<Tema>(temaEscolhido)
  const opcoes: [Tema, string][] = [['auto', 'Automático'], ['claro', 'Claro'], ['escuro', 'Escuro']]
  return (
    <section className="cartao">
      <h2>Aparência</h2>
      <div className="escolha-tema" role="radiogroup" aria-label="Tema do app">
        {opcoes.map(([valor, nome]) => (
          <button key={valor} type="button" role="radio" aria-checked={tema === valor} className={`chip ${tema === valor ? 'ativo' : ''}`}
            onClick={() => { aplicarTema(valor); setTema(valor) }}>
            {nome}
          </button>
        ))}
      </div>
      <p className="sutil">No automático, o app acompanha o modo claro ou escuro do celular.</p>
    </section>
  )
}
