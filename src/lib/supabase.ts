import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { criarClienteDemo } from './demo'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
export const SUPABASE_URL = url ?? ''
const chave = import.meta.env.VITE_SUPABASE_KEY as string | undefined

/** Modo demonstração: dados de exemplo, nada é salvo (npm run demo). */
export const modoDemo = import.meta.env.VITE_DEMO === 'true'

export const configurado = modoDemo || Boolean(url && chave)

export const supabase: SupabaseClient = modoDemo
  ? (criarClienteDemo() as SupabaseClient)
  : createClient(url ?? 'http://localhost', chave ?? 'sem-chave', { auth: { flowType: 'pkce' } })

export const BUCKET_FOTOS = 'fotos'

/** Versão dos termos e da política aceitos no cadastro. Mude ao alterar os textos. */
export const VERSAO_TERMOS = '2026-11'

export async function urlDaFoto(caminho: string): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET_FOTOS).createSignedUrl(caminho, 60 * 60)
  return data?.signedUrl ?? null
}

/** Traduz as mensagens de erro mais comuns para o português. */
export function mensagemDeErro(erro: unknown): string {
  const msg = erro instanceof Error ? erro.message : String((erro as { message?: string })?.message ?? erro)
  if (msg.includes('Invalid login credentials')) return 'E-mail ou senha incorretos.'
  if (msg.includes('User already registered')) return 'Este e-mail já tem cadastro. Use "Entrar".'
  if (msg.includes('Database error saving new user') || msg.includes('convite_invalido'))
    return 'Este link de convite não vale mais. Peça um novo ao seu zelador.'
  if (msg.includes('consentimento_obrigatorio')) return 'É preciso aceitar os termos e a política de privacidade.'
  if (msg.includes('unico_zelador'))
    return 'Você é o único zelador da casa. Passe o cargo para outra pessoa (aba Validar) antes de excluir a conta.'
  if (msg.includes('Password should be at least')) return 'A senha precisa ter pelo menos 6 caracteres.'
  if (msg.includes('should be different from the old password')) return 'A nova senha precisa ser diferente da atual.'
  if (msg.includes('is invalid') && msg.toLowerCase().includes('email')) return 'Este e-mail parece estar errado. Confira o que digitou.'
  if (msg.includes('JWT expired') || msg.includes('refresh_token')) return 'Sua sessão expirou. Saia e entre de novo.'
  if (msg.includes('Load failed') || msg.includes('NetworkError')) return 'Sem conexão com a internet. Tente de novo quando tiver sinal.'
  if (msg.includes('Email not confirmed')) return 'Confirme seu e-mail antes de entrar.'
  if (msg.includes('rate limit')) return 'Muitas tentativas. Aguarde alguns minutos.'
  if (msg.includes('Failed to fetch')) return 'Sem conexão com a internet.'
  return msg
}

/** Endereço que a pessoa abre para criar a conta com um convite. */
export function linkDoConvite(codigo: string): string {
  return `${window.location.origin}${window.location.pathname}?convite=${codigo}`
}
