import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { ehGestorFinanceiro, ehValidador, ehZelador, useSessao } from '../lib/sessao'
import { supabase } from '../lib/supabase'
import Avisos from './Avisos'
import InstalarApp from './InstalarApp'
import PontosGuardados from './PontosGuardados'

/** Quantas coisas esperam o validador/zelador: pedidos de entrada, folhas e pontos. */
function usePendencias(): number {
  const { perfil, casaAtiva } = useSessao()
  const local = useLocation()
  const [total, setTotal] = useState(0)

  useEffect(() => {
    const gestor = ehGestorFinanceiro(casaAtiva)
    if (!perfil?.terreiro_id || (!ehValidador(perfil) && !gestor)) return
    const terreiro = perfil.terreiro_id
    let ativo = true

    async function contar() {
      const consultas: PromiseLike<{ count: number | null }>[] = []
      if (ehValidador(perfil)) {
        consultas.push(
          supabase.from('folhas').select('id', { count: 'exact', head: true }).eq('status', 'pendente').eq('terreiro_id', terreiro),
          supabase.from('pontos').select('id', { count: 'exact', head: true }).eq('status', 'pendente')
            .eq('terreiro_id', terreiro).neq('visibilidade', 'privado'),
        )
      }
      if (ehZelador(casaAtiva)) {
        consultas.push(
          supabase.from('membros').select('perfil_id', { count: 'exact', head: true }).eq('aprovado', false).eq('terreiro_id', terreiro),
        )
      }
      if (gestor) {
        consultas.push(
          supabase.from('pagamentos').select('id', { count: 'exact', head: true }).eq('status', 'informado').eq('terreiro_id', terreiro),
        )
      }
      const resultados = await Promise.all(consultas)
      if (ativo) setTotal(resultados.reduce((soma, r) => soma + (r.count ?? 0), 0))
    }

    contar()
    const aoVoltar = () => document.visibilityState === 'visible' && contar()
    document.addEventListener('visibilitychange', aoVoltar)
    return () => {
      ativo = false
      document.removeEventListener('visibilitychange', aoVoltar)
    }
  }, [perfil, casaAtiva, local.pathname])

  return total
}

export default function Layout() {
  const pendencias = usePendencias()
  const { modulos } = useSessao()

  return (
    <div className="app">
      <main className="conteudo">
        <PontosGuardados />
        <Outlet />
      </main>
      <InstalarApp />
      <Avisos />
      <nav className="menu">
        {modulos.mapa && (
          <>
            <NavLink to="/" end>
              <span aria-hidden>🗺️</span>Mapa
            </NavLink>
            <NavLink to="/folhas">
              <span aria-hidden>🌿</span>Folhas
            </NavLink>
            <NavLink to="/marcar" className="menu-destaque">
              <span aria-hidden>＋</span>Marcar
            </NavLink>
          </>
        )}
        <NavLink to="/casa" aria-label={pendencias ? `Casa, ${pendencias} pendentes` : 'Casa'}>
          <span aria-hidden className="icone-com-selo">
            🏠{pendencias > 0 && <b className="selo">{pendencias > 9 ? '9+' : pendencias}</b>}
          </span>
          Casa
        </NavLink>
        <NavLink to="/perfil">
          <span aria-hidden>👤</span>Perfil
        </NavLink>
      </nav>
    </div>
  )
}
