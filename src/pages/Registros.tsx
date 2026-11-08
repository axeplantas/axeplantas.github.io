import { useCallback, useEffect, useMemo, useState } from 'react'
import { nomeDe, useIrmaos } from '../lib/casa'
import IconeArea from '../components/IconeArea'
import { areaDe, descrever, ROTULO_AREA, type Area } from '../lib/registros'
import { ehZelador, useSessao } from '../lib/sessao'
import { supabase } from '../lib/supabase'
import type { Registro } from '../lib/tipos'
import Topo from '../components/Topo'

const POR_PAGINA = 300

/** Zelador: o que cada filho fez no app, do mais recente para o mais antigo. */
export default function Registros() {
  const { casaAtiva } = useSessao()
  const terreiro = casaAtiva?.terreiro_id
  const irmaos = useIrmaos(terreiro)
  const [registros, setRegistros] = useState<Registro[] | null>(null)
  const [pessoa, setPessoa] = useState('')
  const [area, setArea] = useState<Area | ''>('')
  const [semAcessos, setSemAcessos] = useState(true)
  const [limite, setLimite] = useState(POR_PAGINA)

  const carregar = useCallback(async () => {
    if (!terreiro) return
    let consulta = supabase.from('registros').select('*').eq('terreiro_id', terreiro)
    if (pessoa) consulta = consulta.eq('perfil_id', pessoa)
    const { data } = await consulta.order('created_at', { ascending: false }).limit(limite)
    setRegistros(((data ?? []) as Registro[]).sort((a, b) => b.created_at.localeCompare(a.created_at)))
  }, [terreiro, pessoa, limite])

  useEffect(() => {
    carregar()
  }, [carregar])

  const nome = useCallback((id: string | null) => nomeDe(irmaos, id), [irmaos])

  const visiveis = useMemo(() => (registros ?? []).filter((r) => {
    const a = areaDe(r)
    if (area) return a === area
    return !(semAcessos && a === 'acesso')
  }), [registros, area, semAcessos])

  // Agrupa por dia
  const dias = useMemo(() => {
    const grupos = new Map<string, Registro[]>()
    for (const r of visiveis) {
      const dia = new Date(r.created_at).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
      grupos.set(dia, [...(grupos.get(dia) ?? []), r])
    }
    return [...grupos.entries()]
  }, [visiveis])

  if (!ehZelador(casaAtiva)) return <div className="pagina"><p>Só o zelador vê o registro de atividades.</p></div>

  return (
    <div className="pagina">
      <Topo titulo="Registro de atividades" voltar={'/casa/gestao'} />
      <p className="sutil">
        Tudo o que é feito no app desta casa: quem fez, o quê e quando. Ninguém consegue apagar. Dados de saúde não
        aparecem aqui, só que a ficha foi vista ou alterada.
      </p>

      <div className="filtros">
        <select value={pessoa} onChange={(e) => setPessoa(e.target.value)} aria-label="Filtrar por pessoa">
          <option value="">Todas as pessoas</option>
          {irmaos.map((i) => <option key={i.perfil_id} value={i.perfil_id}>{i.apelido}</option>)}
        </select>
        <select value={area} onChange={(e) => setArea(e.target.value as Area | '')} aria-label="Filtrar por assunto">
          <option value="">Todos os assuntos</option>
          {(Object.keys(ROTULO_AREA) as Area[]).map((a) => <option key={a} value={a}>{ROTULO_AREA[a]}</option>)}
        </select>
      </div>
      {!area && (
        <label className="opcao">
          <input type="checkbox" checked={semAcessos} onChange={(e) => setSemAcessos(e.target.checked)} />
          Esconder “abriu o app”
        </label>
      )}

      {!registros && <p className="sutil">Carregando…</p>}
      {registros && visiveis.length === 0 && <p className="sutil">Nada registrado com esses filtros.</p>}

      {dias.map(([dia, itens]) => (
        <section key={dia}>
          <h2 className="dia-registro">{dia}</h2>
          <ul className="lista-registros">
            {itens.map((r) => (
              <li key={r.id}>
                <span className="hora-registro">{new Date(r.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                <span className="cresce">
                  <strong>{nome(r.perfil_id)}</strong> {descrever(r, nome)}
                </span>
                <IconeArea area={areaDe(r)} />
              </li>
            ))}
          </ul>
        </section>
      ))}

      {registros && registros.length >= limite && (
        <button className="botao bloco" onClick={() => setLimite(limite + POR_PAGINA)}>Ver mais antigos</button>
      )}
    </div>
  )
}
