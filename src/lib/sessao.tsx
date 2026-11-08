import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { lerModulos, TODOS_LIGADOS, type Modulos } from './modulos'
import { supabase } from './supabase'
import type { Casa, Perfil, Permissao } from './tipos'

interface Sessao {
  sessao: Session | null
  perfil: Perfil | null
  /** Partes do app que o zelador deixou ligadas na casa ativa. */
  modulos: Modulos
  /** Todas as casas da pessoa (aprovadas ou aguardando). */
  casas: Casa[]
  /** O vínculo com a casa escolhida no momento. */
  casaAtiva: Casa | null
  carregando: boolean
  recuperandoSenha: boolean
  fimRecuperacao: () => void
  recarregarPerfil: () => Promise<void>
  trocarCasa: (terreiroId: string) => Promise<void>
  sair: () => Promise<void>
}

const ContextoSessao = createContext<Sessao | null>(null)

const CHAVE_PERFIL = 'axe-plantas:perfil'

interface Guardado {
  perfil: Perfil
  casas: Casa[]
}

function guardar(dados: Guardado | null) {
  try {
    if (dados) localStorage.setItem(CHAVE_PERFIL, JSON.stringify(dados))
    else localStorage.removeItem(CHAVE_PERFIL)
  } catch {
    // Sem armazenamento disponível: segue sem cópia local.
  }
}

function lerGuardado(usuarioId: string): Guardado | null {
  try {
    const dados = JSON.parse(localStorage.getItem(CHAVE_PERFIL) ?? 'null') as Guardado | Perfil | null
    if (!dados) return null
    // Formato antigo guardava só o perfil.
    const normalizado = 'perfil' in dados ? dados : { perfil: dados, casas: [] }
    return normalizado.perfil?.id === usuarioId ? normalizado : null
  } catch {
    return null
  }
}

export function ProvedorSessao({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [casas, setCasas] = useState<Casa[]>([])
  const [carregando, setCarregando] = useState(true)
  const [recuperandoSenha, setRecuperandoSenha] = useState(false)

  const buscarPerfil = useCallback(async (usuarioId: string | undefined, tentativa = 0): Promise<void> => {
    if (!usuarioId) {
      setPerfil(null)
      setCasas([])
      return
    }
    // As ligações com "terreiros" são explícitas (!…_fkey): perfis e terreiros se ligam por mais de
    // um caminho (casa ativa, vínculos, acesso a materiais) e o servidor recusa a consulta ambígua.
    const [resPerfil, resCasas] = await Promise.all([
      supabase.from('perfis').select('*, terreiros!perfis_terreiro_id_fkey(nome, nacao)').eq('id', usuarioId).maybeSingle(),
      supabase
        .from('membros')
        .select('terreiro_id, papel, aprovado, contador, isento, mensalidade_valor, aprovado_em, permissoes, terreiros!membros_terreiro_id_fkey(nome, nacao)')
        .eq('perfil_id', usuarioId),
    ])
    if (resPerfil.error) {
      console.warn('Não foi possível carregar o perfil:', resPerfil.error.message)
      // Sem internet: usa o cadastro guardado no celular para o app continuar abrindo.
      const guardado = lerGuardado(usuarioId)
      if (guardado) {
        setPerfil(guardado.perfil)
        setCasas(guardado.casas)
      }
      return
    }
    const novoPerfil = resPerfil.data as Perfil | null
    if (resCasas.error) {
      // Falhou só a lista de casas (sinal fraco, sessão renovando...): mantém a última
      // conhecida e tenta de novo em instantes, em vez de mostrar o app "sem casa".
      console.warn('Não foi possível carregar as casas:', resCasas.error.message)
      const guardado = lerGuardado(usuarioId)
      setPerfil(novoPerfil)
      if (guardado?.casas.length) setCasas(guardado.casas)
      if (tentativa < 3) setTimeout(() => buscarPerfil(usuarioId, tentativa + 1), 2000 * (tentativa + 1))
      return
    }
    const novasCasas = ((resCasas.data ?? []) as unknown as Casa[]).sort((a, b) =>
      (a.terreiros?.nome ?? '').localeCompare(b.terreiros?.nome ?? '', 'pt-BR'),
    )
    guardar(novoPerfil ? { perfil: novoPerfil, casas: novasCasas } : null)
    setPerfil(novoPerfil)
    setCasas(novasCasas)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSessao(data.session)
      await buscarPerfil(data.session?.user.id)
      setCarregando(false)
    })

    const { data } = supabase.auth.onAuthStateChange((evento, novaSessao) => {
      if (evento === 'PASSWORD_RECOVERY') setRecuperandoSenha(true)
      setSessao(novaSessao)
      // Fora do callback para não travar o cliente do Supabase.
      setTimeout(() => buscarPerfil(novaSessao?.user.id), 0)
    })
    return () => data.subscription.unsubscribe()
  }, [buscarPerfil])

  // Módulos ligados na casa ativa (guardados no celular para abrir sem internet)
  // e o registro de que a pessoa abriu o app nesta casa.
  const terreiroAtivo = perfil?.aprovado ? perfil.terreiro_id : null
  const [modulos, setModulos] = useState<Modulos>(TODOS_LIGADOS)
  useEffect(() => {
    if (!terreiroAtivo) return
    const chave = `axe-plantas:modulos:${terreiroAtivo}`
    try {
      setModulos(lerModulos(JSON.parse(localStorage.getItem(chave) ?? 'null')))
    } catch {
      setModulos(TODOS_LIGADOS)
    }
    supabase.from('casa_config').select('modulos').eq('terreiro_id', terreiroAtivo).maybeSingle()
      .then(({ data, error }) => {
        if (error) return
        const config = (data?.modulos ?? {}) as Record<string, unknown>
        setModulos(lerModulos(config))
        try {
          localStorage.setItem(chave, JSON.stringify(config))
        } catch {
          // Sem armazenamento: segue sem a cópia.
        }
      })
    supabase.rpc('registrar_acesso', { p_terreiro: terreiroAtivo }).then(() => undefined)
  }, [terreiroAtivo])

  const recarregarPerfil = useCallback(async () => {
    await buscarPerfil(sessao?.user.id)
    if (!terreiroAtivo) return
    const { data } = await supabase.from('casa_config').select('modulos').eq('terreiro_id', terreiroAtivo).maybeSingle()
    if (data) setModulos(lerModulos(data.modulos as Record<string, unknown>))
  }, [buscarPerfil, sessao?.user.id, terreiroAtivo])

  const trocarCasa = useCallback(async (terreiroId: string) => {
    const { error } = await supabase.rpc('trocar_casa', { p_terreiro: terreiroId })
    if (error) throw error
    await recarregarPerfil()
  }, [recarregarPerfil])

  // Se a lista de casas ainda não chegou, usa a casa ativa que já vem no perfil.
  const casaDoPerfil: Casa | null = perfil?.terreiro_id
    ? {
        terreiro_id: perfil.terreiro_id,
        papel: perfil.papel,
        aprovado: perfil.aprovado,
        contador: false,
        isento: false,
        mensalidade_valor: null,
        aprovado_em: null,
        terreiros: perfil.terreiros ?? null,
      }
    : null
  const casaAtiva = casas.find((c) => c.terreiro_id === perfil?.terreiro_id) ?? casaDoPerfil

  const valor: Sessao = {
    sessao,
    perfil,
    modulos,
    casas: casas.length > 0 || !casaDoPerfil ? casas : [casaDoPerfil],
    casaAtiva,
    carregando,
    recuperandoSenha,
    fimRecuperacao: () => setRecuperandoSenha(false),
    recarregarPerfil,
    trocarCasa,
    sair: async () => {
      await supabase.auth.signOut()
      guardar(null)
      setPerfil(null)
      setCasas([])
    },
  }

  return <ContextoSessao.Provider value={valor}>{children}</ContextoSessao.Provider>
}

export function useSessao(): Sessao {
  const contexto = useContext(ContextoSessao)
  if (!contexto) throw new Error('useSessao fora do ProvedorSessao')
  return contexto
}

export function ehAdmin(perfil: Perfil | null): boolean {
  return perfil?.aprovado === true && perfil.admin === true
}

export function ehValidador(perfil: Perfil | null): boolean {
  return perfil?.aprovado === true && (perfil.papel === 'validador' || perfil.papel === 'zelador')
}

export function ehZelador(casa: Casa | null): boolean {
  return casa?.aprovado === true && casa.papel === 'zelador'
}

/** Zelador ou contador: confere mensalidades e contribuições. */
export function ehGestorFinanceiro(casa: Casa | null): boolean {
  return casa?.aprovado === true && (casa.papel === 'zelador' || casa.contador)
}

/** Zelador ou validador: cuida do calendário. */
export function ehEquipe(casa: Casa | null): boolean {
  return casa?.aprovado === true && (casa.papel === 'zelador' || casa.papel === 'validador')
}

/** O zelador tem todas; os outros só as que ele deu. */
export function temPermissao(casa: Casa | null, permissao: Permissao): boolean {
  return casa?.aprovado === true && (casa.papel === 'zelador' || (casa.permissoes ?? []).includes(permissao))
}
