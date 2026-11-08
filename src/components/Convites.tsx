import { useCallback, useEffect, useState } from 'react'
import { linkDoConvite, mensagemDeErro, supabase } from '../lib/supabase'
import type { Convite, TipoConvite } from '../lib/tipos'
import CompartilharLink from './CompartilharLink'
import { confirmar } from '../lib/dialogo'

const MENSAGEM: Record<TipoConvite, string> = {
  admin: 'Convite para administrar o Axé Plantas:',
  zelador: 'Você foi convidado(a) como zelador(a) no Axé Plantas, o mapa das folhas. Crie sua conta pelo link:',
  membro: 'Entre no Axé Plantas, o mapa das folhas da nossa casa. Crie sua conta pelo link:',
}

function validade(c: Convite): string {
  if (!c.expira_em) return ''
  return `vale até ${new Date(c.expira_em).toLocaleDateString('pt-BR')}`
}

/** Links de convite ativos de um terreiro, com botão para gerar um novo. */
export default function Convites({ terreiroId, tipo, titulo, explicacao }: {
  terreiroId: string
  tipo: Exclude<TipoConvite, 'admin'>
  titulo: string
  explicacao: string
}) {
  const [convites, setConvites] = useState<Convite[]>([])
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    const { data } = await supabase
      .from('convites')
      .select('*')
      .eq('terreiro_id', terreiroId)
      .eq('tipo', tipo)
      .eq('ativo', true)
      .order('created_at')
    const agora = Date.now()
    setConvites(
      ((data ?? []) as Convite[]).filter(
        (c) => (!c.expira_em || new Date(c.expira_em).getTime() > agora) && (c.usos_max === null || c.usos < c.usos_max),
      ),
    )
  }, [terreiroId, tipo])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function gerar() {
    setErro('')
    setGerando(true)
    const { error } = await supabase.rpc('criar_convite', { p_terreiro: terreiroId, p_tipo: tipo })
    setGerando(false)
    if (error) return setErro(mensagemDeErro(error))
    carregar()
  }

  async function desativar(c: Convite) {
    if (!(await confirmar('Desativar este link?', { texto: 'Quem ainda não usou não vai mais conseguir entrar por ele.', botao: 'Desativar', perigo: true }))) return
    const { error } = await supabase.rpc('desativar_convite', { p_convite: c.id })
    if (error) return setErro(mensagemDeErro(error))
    carregar()
  }

  return (
    <div className="convites">
      <h3>{titulo}</h3>
      <p className="sutil">{explicacao}</p>
      {convites.map((c) => (
        <div key={c.id} className="convite-item">
          <CompartilharLink link={linkDoConvite(c.codigo)} mensagem={MENSAGEM[tipo]} />
          <div className="sutil linha">
            <span>
              {tipo === 'membro' ? `${c.usos} pessoa(s) entraram` : 'Uso único'} · {validade(c)}
            </span>
            <button className="link perigo" onClick={() => desativar(c)}>Desativar</button>
          </div>
        </div>
      ))}
      {erro && <p className="erro">{erro}</p>}
      {convites.length === 0 && (
        <button className="primario" onClick={gerar} disabled={gerando}>
          {gerando ? 'Gerando…' : 'Gerar link de convite'}
        </button>
      )}
      {convites.length > 0 && (
        <button className="link" onClick={gerar} disabled={gerando}>Gerar outro link</button>
      )}
    </div>
  )
}
