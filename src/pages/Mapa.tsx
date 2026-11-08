import type { LatLngBoundsExpression, LatLngExpression, Map as MapaLeaflet } from 'leaflet'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Circle, CircleMarker, MapContainer, Popup } from 'react-leaflet'
import { Link, useSearchParams } from 'react-router-dom'
import { BotaoCamada, Camada, useCamada } from '../components/CamadaMapa'
import Galeria from '../components/Galeria'
import { avisar } from '../lib/avisos'
import { linkComoChegar } from '../lib/distancia'
import { useSessao } from '../lib/sessao'
import { BUCKET_FOTOS, mensagemDeErro, modoDemo, supabase } from '../lib/supabase'
import { fotosDoPonto, ROTULO_VISIBILIDADE, type Ponto } from '../lib/tipos'
import { confirmar } from '../lib/dialogo'

const CENTRO_BRASIL: LatLngExpression = [-14.235, -51.925]

const COR_VISIBILIDADE = {
  rede: '#2f7d4a',
  terreiro: '#c98a1b',
  privado: '#6b6b6b',
}

export default function Mapa() {
  const { perfil } = useSessao()
  const [params, setParams] = useSearchParams()
  const filtroFolha = params.get('folha') ?? ''
  const filtroLista = useMemo(() => params.get('folhas')?.split(',').filter(Boolean) ?? [], [params])
  const [pontos, setPontos] = useState<Ponto[]>([])
  const [carregado, setCarregado] = useState(false)
  const [eu, setEu] = useState<[number, number] | null>(null)
  const [raio, setRaio] = useState(0)
  const [camada, alternarCamada] = useCamada('mapa')
  const [semGps, setSemGps] = useState(false)
  const [erro, setErro] = useState('')
  const mapa = useRef<MapaLeaflet | null>(null)
  const enquadrou = useRef(false)

  useEffect(() => {
    supabase
      .from('pontos')
      .select('*, folhas(nome_popular, nome_ritual, toxica, alerta)')
      .neq('status', 'recusado')
      .then(({ data, error }) => {
        if (error) setErro(mensagemDeErro(error))
        setPontos((data ?? []) as Ponto[])
        setCarregado(true)
      })
    localizar(false)
  }, [])

  function localizar(centralizar: boolean) {
    if (!navigator.geolocation) return setSemGps(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const posicao: [number, number] = [pos.coords.latitude, pos.coords.longitude]
        setEu(posicao)
        setRaio(Math.round(pos.coords.accuracy))
        setSemGps(false)
        if (centralizar) mapa.current?.setView(posicao, 15)
      },
      () => {
        setSemGps(true)
        if (centralizar) avisar('Ative a localização do celular para o app saber onde você está.', 'erro')
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: centralizar ? 0 : 30000 },
    )
  }

  // Só as folhas que têm pontos no mapa, com a quantidade de cada.
  const opcoes = useMemo(() => {
    const contagem = new Map<string, { nome: string; total: number }>()
    for (const p of pontos) {
      const atual = contagem.get(p.folha_id)
      contagem.set(p.folha_id, { nome: p.folhas?.nome_popular ?? 'Folha em validação', total: (atual?.total ?? 0) + 1 })
    }
    return [...contagem.entries()].sort((a, b) => a[1].nome.localeCompare(b[1].nome, 'pt-BR'))
  }, [pontos])

  const visiveis = useMemo(() => {
    if (filtroLista.length > 0) return pontos.filter((p) => filtroLista.includes(p.folha_id))
    if (filtroFolha) return pontos.filter((p) => p.folha_id === filtroFolha)
    return pontos
  }, [pontos, filtroFolha, filtroLista])

  const filtrando = filtroLista.length > 0 || Boolean(filtroFolha)

  // Primeira vez: a sua posição (ou todos os pontos). Ao filtrar: mostra os pontos daquela folha.
  useEffect(() => {
    const m = mapa.current
    if (!m || !carregado) return
    if (filtrando && visiveis.length > 0) {
      m.fitBounds(visiveis.map((p) => [p.lat, p.lng]) as LatLngBoundsExpression, { padding: [50, 50], maxZoom: 17 })
      enquadrou.current = true
    } else if (!enquadrou.current && eu) {
      m.setView(eu, 15)
      enquadrou.current = true
    } else if (!enquadrou.current && pontos.length > 0 && semGps) {
      m.fitBounds(pontos.map((p) => [p.lat, p.lng]) as LatLngBoundsExpression, { padding: [50, 50], maxZoom: 16 })
      enquadrou.current = true
    }
  }, [carregado, filtrando, visiveis, eu, semGps, pontos])

  async function apagar(ponto: Ponto) {
    if (!(await confirmar(`Apagar este ponto de ${ponto.folhas?.nome_popular ?? 'folha'}?`, { texto: 'Ele sai do mapa e não dá para desfazer.', botao: 'Apagar', perigo: true }))) return
    const { error } = await supabase.from('pontos').delete().eq('id', ponto.id)
    if (error) return avisar(mensagemDeErro(error), 'erro')
    const fotos = fotosDoPonto(ponto)
    if (fotos.length && ponto.criado_por === perfil?.id) {
      await supabase.storage.from(BUCKET_FOTOS).remove(fotos)
    }
    setPontos((lista) => lista.filter((p) => p.id !== ponto.id))
    avisar('Ponto apagado.')
  }

  const nomeFiltro = opcoes.find(([id]) => id === filtroFolha)?.[1].nome

  return (
    <div className="mapa-tela">
      <div className="mapa-filtro">
        {filtroLista.length > 0 ? (
          <button className="filtro-ativo" onClick={() => setParams({})}>
            Folhas da obrigação ({visiveis.length} pontos) ✕
          </button>
        ) : (
          <select
            value={filtroFolha}
            onChange={(e) => setParams(e.target.value ? { folha: e.target.value } : {})}
            aria-label="Mostrar só uma folha"
          >
            <option value="">Todas as folhas ({pontos.length} pontos)</option>
            {filtroFolha && !nomeFiltro && <option value={filtroFolha}>Folha escolhida (0)</option>}
            {opcoes.map(([id, { nome, total }]) => (
              <option key={id} value={id}>
                {nome} ({total})
              </option>
            ))}
          </select>
        )}
      </div>
      {erro && <p className="erro flutuante">{erro}</p>}

      {carregado && pontos.length === 0 && (
        <div className="mapa-vazio-aviso">
          <strong>Ainda não há folhas marcadas.</strong>
          <span>Encontrou uma folha? Toque em <b>＋ Marcar</b> para colocar no mapa.</span>
        </div>
      )}
      {carregado && pontos.length > 0 && filtrando && visiveis.length === 0 && (
        <div className="mapa-vazio-aviso">
          <strong>Ninguém marcou esta folha ainda.</strong>
          <button className="link" onClick={() => setParams({})}>Ver todas as folhas</button>
        </div>
      )}

      <MapContainer center={CENTRO_BRASIL} zoom={4} className="mapa" ref={mapa}>
        <Camada tipo={camada} />

        {eu && raio > 15 && (
          <Circle center={eu} radius={raio} interactive={false}
            pathOptions={{ color: '#1a73e8', weight: 1, fillColor: '#1a73e8', fillOpacity: 0.1 }} />
        )}
        {eu && (
          <CircleMarker center={eu} radius={8} pathOptions={{ color: '#fff', weight: 3, fillColor: '#1a73e8', fillOpacity: 1 }}>
            <Popup>Você está aqui{raio ? ` (precisão ~${raio} m)` : ''}</Popup>
          </CircleMarker>
        )}

        {visiveis.map((p) => (
          <CircleMarker
            key={p.id}
            center={[p.lat, p.lng]}
            radius={12}
            pathOptions={{
              color: p.folhas?.toxica ? '#b3261e' : '#fff',
              weight: p.folhas?.toxica ? 3 : 2,
              fillColor: COR_VISIBILIDADE[p.visibilidade],
              fillOpacity: p.status === 'pendente' ? 0.45 : 0.9,
              dashArray: p.status === 'pendente' ? '4 3' : undefined,
            }}
          >
            <Popup minWidth={230}>
              <div className="popup">
                <strong className="popup-titulo">{p.folhas?.nome_popular ?? 'Folha em validação'}</strong>
                {p.folhas?.nome_ritual && <div className="sutil">{p.folhas.nome_ritual}</div>}
                {p.folhas?.toxica && <div className="alerta-toxica">⚠️ Tóxica{p.folhas.alerta ? `: ${p.folhas.alerta}` : ''}</div>}
                {p.status === 'pendente' && <div className="etiqueta">Aguardando validação</div>}
                <div className="sutil">Visível para: {ROTULO_VISIBILIDADE[p.visibilidade]}</div>
                <Galeria caminhos={fotosDoPonto(p)} nome={p.folhas?.nome_popular ?? 'Folha'} />
                {p.observacao && <p>{p.observacao}</p>}
                <div className="popup-acoes">
                  <a className="botao" href={linkComoChegar(p.lat, p.lng)} target="_blank" rel="noreferrer">
                    Como chegar
                  </a>
                  <Link className="botao" to={`/folhas/${p.folha_id}`}>Ver folha</Link>
                </div>
                {p.criado_por === perfil?.id && (
                  <button className="link perigo" onClick={() => apagar(p)}>Apagar este ponto</button>
                )}
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>

      <BotaoCamada tipo={camada} aoAlternar={alternarCamada} className="flutuante-mapa" />

      <button className="botao-localizar" onClick={() => localizar(true)} aria-label="Ir para a minha localização">
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
          <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
          <circle cx="12" cy="12" r="3" fill="currentColor" />
          <path d="M12 1v4M12 19v4M1 12h4M19 12h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      <div className="legenda">
        <span><i style={{ background: COR_VISIBILIDADE.rede }} />Todos</span>
        <span><i style={{ background: COR_VISIBILIDADE.terreiro }} />Minha casa</span>
        <span><i style={{ background: COR_VISIBILIDADE.privado }} />Só eu</span>
        <span><i className="borda-toxica" />Tóxica</span>
        <span><i className="pendente" />Aguardando</span>
        {modoDemo && <strong>DEMO</strong>}
      </div>
    </div>
  )
}
