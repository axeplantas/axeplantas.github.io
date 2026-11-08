import { useEffect, useState, type FormEvent } from 'react'
import CampoSenha from '../components/CampoSenha'
import { mensagemDeErro, modoDemo, supabase, VERSAO_TERMOS } from '../lib/supabase'
import { sugerirEmail } from '../lib/texto'

type Modo = 'entrar' | 'cadastrar' | 'esqueci'

interface InfoConvite {
  tipo: 'admin' | 'zelador' | 'membro'
  terreiro: string | null
  nacao: string | null
}

/** Código do convite que veio no link (…/?convite=abc123). */
function conviteDoLink(): string | null {
  return new URLSearchParams(window.location.search).get('convite')
}

function descreverConvite(info: InfoConvite): string {
  if (info.tipo === 'admin') return 'Você foi convidado(a) para administrar o Axé Plantas.'
  if (info.tipo === 'zelador') return `Você foi convidado(a) como zelador(a) de ${info.terreiro}.`
  return `Você foi convidado(a) para entrar em ${info.terreiro}.`
}

export default function Entrar() {
  const [convite] = useState(conviteDoLink)
  const [infoConvite, setInfoConvite] = useState<InfoConvite | null>(null)
  const [conviteInvalido, setConviteInvalido] = useState(false)
  const [modo, setModo] = useState<Modo>(convite ? 'cadastrar' : 'entrar')
  const [emailDigitado, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [apelido, setApelido] = useState('')
  const [aceite, setAceite] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  const enderecoDoApp = window.location.origin + window.location.pathname

  useEffect(() => {
    if (!convite) return
    supabase.rpc('info_convite', { p_codigo: convite }).then(({ data }) => {
      const info = (data as InfoConvite[] | null)?.[0]
      if (info) setInfoConvite(info)
      else {
        setConviteInvalido(true)
        setModo('entrar')
      }
    })
  }, [convite])

  const sugestaoEmail = sugerirEmail(emailDigitado)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const email = emailDigitado.trim().toLowerCase()
    setErro('')
    setAviso('')
    setEnviando(true)
    try {
      if (modo === 'entrar') {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
        if (error) throw error
      } else if (modo === 'cadastrar') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password: senha,
          options: {
            data: { apelido, convite, consentimento: aceite, versao_termos: VERSAO_TERMOS },
            emailRedirectTo: enderecoDoApp,
          },
        })
        if (error) throw error
        // Tira o convite do endereço: ele já foi usado.
        window.history.replaceState(null, '', enderecoDoApp)
        if (!data.session) setAviso('Cadastro feito! Confira seu e-mail para confirmar a conta.')
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: enderecoDoApp })
        if (error) throw error
        setAviso(
          'Se o e-mail estiver cadastrado, você vai receber um link para criar uma nova senha. Abra o link neste mesmo celular. Confira também a caixa de spam.',
        )
      }
    } catch (err) {
      const mensagem = mensagemDeErro(err)
      setErro(modo === 'entrar' && mensagem.includes('incorretos')
        ? 'E-mail ou senha incorretos. Confira o que digitou (toque em “Mostrar”) ou use “Esqueci minha senha”.'
        : mensagem)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <main className="tela-central">
      <img src="logo-vertical.svg" alt="Axé Plantas" className="logo" />
      <p className="lema">
        <span className="lema-yoruba">Kò sí ewé, kò sí òrìṣà</span>
        <span className="lema-traducao">Sem folha, não há Orixá</span>
      </p>
      {modoDemo && (
        <p className="aviso">
          <strong>Modo demonstração.</strong> Digite qualquer e-mail e senha (mín. 6 letras). Nada é salvo.
        </p>
      )}

      {infoConvite && (
        <div className="abas">
          <button className={modo === 'entrar' ? 'ativa' : ''} onClick={() => setModo('entrar')} type="button">
            Já tenho conta
          </button>
          <button className={modo === 'cadastrar' ? 'ativa' : ''} onClick={() => setModo('cadastrar')} type="button">
            Criar conta
          </button>
        </div>
      )}
      {infoConvite && modo === 'cadastrar' && <p className="aviso convite">{descreverConvite(infoConvite)}</p>}
      {conviteInvalido && (
        <p className="erro">
          Este link de convite já foi usado ou venceu. Links de zelador valem para uma pessoa só. Peça ao zelador da sua
          casa o <strong>link para os filhos</strong>.
        </p>
      )}

      <form onSubmit={enviar} className="formulario">
        {modo === 'cadastrar' && (
          <label>
            Como quer ser chamado(a)
            <input value={apelido} onChange={(e) => setApelido(e.target.value)} required maxLength={40}
              placeholder="Apelido ou nome de santo" />
          </label>
        )}
        <label>
          E-mail
          <input type="email" value={emailDigitado} onChange={(e) => setEmail(e.target.value)} required autoComplete="email"
            autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="email" />
        </label>
        {sugestaoEmail && (
          <button type="button" className="sugestao-email" onClick={() => setEmail(sugestaoEmail)}>
            Você quis dizer <strong>{sugestaoEmail}</strong>? Toque para corrigir.
          </button>
        )}
        {modo !== 'esqueci' && <CampoSenha valor={senha} aoMudar={setSenha} novaSenha={modo === 'cadastrar'} />}

        {modo === 'cadastrar' && (
          <label className="opcao aceite">
            <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} required />
            <span>
              Tenho 18 anos ou mais, li e aceito os <a href="termos.html" target="_blank">Termos de Uso</a> e a{' '}
              <a href="privacidade.html" target="_blank">Política de Privacidade</a>, e autorizo o uso da informação
              de que participo de um terreiro para o funcionamento do app.
            </span>
          </label>
        )}

        {erro && <p className="erro">{erro}</p>}
        {aviso && <p className="aviso">{aviso}</p>}

        <button type="submit" className="primario" disabled={enviando}>
          {enviando ? 'Aguarde…' : modo === 'entrar' ? 'Entrar' : modo === 'cadastrar' ? 'Criar conta' : 'Enviar link'}
        </button>
      </form>

      {modo === 'entrar' && (
        <button type="button" className="link" onClick={() => setModo('esqueci')}>
          Esqueci minha senha
        </button>
      )}
      {modo === 'esqueci' && (
        <button type="button" className="link" onClick={() => setModo('entrar')}>
          Voltar
        </button>
      )}
      {!convite && modo === 'entrar' && (
        <p className="sutil">Ainda não tem conta? Peça o link de convite ao zelador da sua casa.</p>
      )}

      <p className="rodape-legal">
        <a href="termos.html" target="_blank">Termos de Uso</a> · <a href="privacidade.html" target="_blank">Privacidade</a>
      </p>
    </main>
  )
}
