import { CircleCheck, CloudUpload, Hand, Satellite, WifiOff } from 'lucide-react'
import type { LatLngExpression } from 'leaflet'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Circle, CircleMarker, MapContainer, useMap, useMapEvents } from 'react-leaflet'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BotaoCamada, Camada, useCamada } from '../components/CamadaMapa'
import FotosDaPlanta, { type FotoPlanta } from '../components/FotosDaPlanta'
import IdentificarFolha, { type FolhaResumo } from '../components/IdentificarFolha'
import SeletorFolha from '../components/SeletorFolha'
import Topo from '../components/Topo'
import { avisar } from '../lib/avisos'
import { ehErroDeRede, enviarPonto, guardarPonto } from '../lib/fila'
import { buscarPosicaoPrecisa, type Leitura } from '../lib/gps'
import { prepararFoto } from '../lib/imagem'
import { ehValidador, useSessao } from '../lib/sessao'
import { mensagemDeErro, supabase } from '../lib/supabase'
import { ROTULO_VISIBILIDADE, type Visibilidade } from '../lib/tipos'

const CHAVE_FOLHAS = 'axe-plantas:folhas'

/** Lista de folhas guardada no celular, para marcar pontos mesmo sem internet. */
function folhasGuardadas(): FolhaResumo[] {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_FOLHAS) ?? '[]') as FolhaResumo[]
  } catch {
    return []
  }
}

export default function NovoPonto() {
  const { perfil } = useSessao()
  const navegar = useNavigate()
  const [params] = useSearchParams()

  const [folhas, setFolhas] = useState<FolhaResumo[]>(folhasGuardadas)
  const [folhaNova, setFolhaNova] = useState(false)
  const [folhaId, setFolhaId] = useState(params.get('folha') ?? '')
  const [posicao, setPosicao] = useState<[number, number] | null>(null)
  const [gps, setGps] = useState<Leitura | null>(null)
  const [refinando, setRefinando] = useState(false)
  const [ajustadoAMao, setAjustadoAMao] = useState(false)
  const [versaoGps, setVersaoGps] = useState(0)
  const [camada, alternarCamada] = useCamada('marcar', 'satelite')
  const pararGps = useRef<(() => void) | null>(null)
  const mexeu = useRef(false)
  const [zoom, setZoom] = useState(18)
  const [erroGps, setErroGps] = useState('')
  const [fotos, setFotos] = useState<FotoPlanta[]>([])
  const [semInternet, setSemInternet] = useState(!navigator.onLine)
  const [visibilidade, setVisibilidade] = useState<Visibilidade>('rede')
  const [observacao, setObservacao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    supabase
      .from('folhas')
      .select('id, nome_popular, nome_cientifico, outros_nomes, status')
      .neq('status', 'recusada')
      .order('nome_popular')
      .then(({ data, error }) => {
        if (error || !data) return
        setFolhas(data)
        try {
          localStorage.setItem(CHAVE_FOLHAS, JSON.stringify(data))
        } catch {
          // Sem espaço: segue sem a cópia local.
        }
      })
    pegarLocalizacao()

    const mudou = () => setSemInternet(!navigator.onLine)
    window.addEventListener('online', mudou)
    window.addEventListener('offline', mudou)
    return () => {
      window.removeEventListener('online', mudou)
      window.removeEventListener('offline', mudou)
      pararGps.current?.()
    }
  }, [])

  // Escuta o GPS por até 30 s e vai levando a mira para a leitura mais precisa,
  // até a pessoa arrastar o mapa (aí vale o ajuste dela).
  function pegarLocalizacao() {
    setErroGps('')
    setRefinando(true)
    setAjustadoAMao(false)
    mexeu.current = false
    pararGps.current?.()
    pararGps.current = buscarPosicaoPrecisa(
      (leitura) => {
        setGps(leitura)
        if (!mexeu.current) {
          setPosicao([leitura.lat, leitura.lng])
          setVersaoGps((v) => v + 1)
        }
      },
      (falha) => {
        setRefinando(false)
        if (falha) setErroGps(falha)
      },
    )
  }

  function arrastou() {
    if (mexeu.current) return
    mexeu.current = true
    setAjustadoAMao(true)
    pararGps.current?.()
  }

  function validar(): string | null {
    if (!folhaId) return 'Falta escolher qual é a folha (passo 2).'
    if (!posicao) return 'Falta marcar onde está a folha (passo 3).'
    if (zoom < 15) return 'Aproxime o mapa (passo 3) até a mira ficar exatamente em cima da planta.'
    return null
  }

  async function salvar(e: FormEvent, soGuardar = false) {
    e.preventDefault()
    if (!perfil) return
    const problema = validar()
    if (problema) return setErro(problema)
    setErro('')
    setSalvando(true)

    const blobs = await Promise.all(fotos.map((f) => prepararFoto(f.arquivo)))
    const ponto = {
      folhaId,
      lat: posicao![0],
      lng: posicao![1],
      observacao: observacao.trim() || null,
      visibilidade,
      fotos: blobs,
    }

    async function guardar(motivo: string) {
      await guardarPonto({
        ...ponto,
        id: crypto.randomUUID(),
        folhaNome: folhas.find((f) => f.id === folhaId)?.nome_popular ?? 'Folha',
        criadoEm: new Date().toISOString(),
      })
      avisar(motivo)
      navegar('/')
    }

    try {
      if (soGuardar || !navigator.onLine) {
        return await guardar('Guardado no celular. Será enviado sozinho quando houver internet.')
      }
      await enviarPonto(ponto, perfil.id, perfil.terreiro_id)
      avisar(
        visibilidade === 'privado' || ehValidador(perfil)
          ? 'Ponto salvo no mapa!'
          : 'Ponto enviado! Ele aparece para todos depois que um validador da sua casa aprovar.',
      )
      navegar(`/?folha=${folhaId}`)
    } catch (err) {
      if (ehErroDeRede(err)) {
        return await guardar('A internet caiu: guardei no celular e envio sozinho quando voltar.')
      }
      setErro(mensagemDeErro(err))
      setSalvando(false)
    }
  }

  return (
    <form className="pagina formulario" onSubmit={salvar}>
      <Topo titulo="Marcar uma folha" />
      {semInternet && (
        <p className="aviso">
          <WifiOff size={18} aria-hidden /> Você está sem internet. Pode marcar normalmente: o ponto fica guardado no celular e é enviado sozinho quando o
          sinal voltar.
        </p>
      )}

      <section>
        <h2>1. Fotos</h2>
        <FotosDaPlanta fotos={fotos} aoMudar={setFotos} />
        {fotos.length > 0 && (
          <IdentificarFolha key={fotos.map((f) => f.id + f.orgao).join()} fotos={fotos} folhas={folhas}
            aoEscolher={(folha, nova) => {
              if (nova) setFolhas((lista) => [...lista, folha].sort((a, b) => a.nome_popular.localeCompare(b.nome_popular, 'pt-BR')))
              setFolhaId(folha.id)
              setFolhaNova(nova)
            }} />
        )}
        {fotos.length > 0 && <p className="sutil">As fotos ficam no ponto, para quem for procurar a folha saber como ela é.</p>}
      </section>

      <section>
        <h2>2. Qual folha?</h2>
        <SeletorFolha folhas={folhas} valor={folhaId} aoMudar={(id) => { setFolhaId(id); setFolhaNova(false) }} />
        {folhaNova && (
          <p className="aviso">Folha nova cadastrada a partir da foto. O validador da sua casa vai conferir o nome.</p>
        )}
      </section>

      <section>
        <h2>3. Onde está?</h2>
        <p className="sutil">Arraste o mapa até a mira ficar em cima da planta.</p>
        <div className="mapa-mira">
          {posicao ? (
            <MapContainer center={posicao as LatLngExpression} zoom={gps ? 19 : 4} className="mapa">
              <Camada tipo={camada} />
              {gps && (
                <>
                  <Circle center={[gps.lat, gps.lng]} radius={gps.precisao} interactive={false}
                    pathOptions={{ color: '#1a73e8', weight: 1, fillColor: '#1a73e8', fillOpacity: 0.12 }} />
                  <CircleMarker center={[gps.lat, gps.lng]} radius={6} interactive={false}
                    pathOptions={{ color: '#fff', weight: 2, fillColor: '#1a73e8', fillOpacity: 1 }} />
                </>
              )}
              <IrPara posicao={posicao} versao={versaoGps} />
              <SeguirCentro aoMudar={(p, z) => { setPosicao(p); setZoom(z) }} aoArrastar={arrastou} />
            </MapContainer>
          ) : (
            <div className="mapa mapa-vazio">{erroGps || 'Procurando sua localização…'}</div>
          )}
          {posicao && <div className="mira" aria-hidden>✛</div>}
          {posicao && <BotaoCamada tipo={camada} aoAlternar={alternarCamada} className="no-mapa" />}
        </div>
        <SituacaoGps gps={gps} refinando={refinando} ajustadoAMao={ajustadoAMao} />
        <div className="linha">
          <button type="button" className="link" onClick={pegarLocalizacao} disabled={refinando}>
            {refinando ? 'Buscando sinal do GPS…' : 'Pegar minha posição de novo'}
          </button>
          {!posicao && erroGps && (
            <button type="button" className="link" onClick={() => { setPosicao([-14.235, -51.925]); setZoom(4) }}>
              Escolher no mapa
            </button>
          )}
        </div>
      </section>

      <section>
        <h2>4. Quem pode ver?</h2>
        <div className="opcoes">
          {(Object.keys(ROTULO_VISIBILIDADE) as Visibilidade[]).map((v) => (
            <label key={v} className="opcao">
              <input type="radio" name="visibilidade" checked={visibilidade === v} onChange={() => setVisibilidade(v)} />
              {ROTULO_VISIBILIDADE[v]}
            </label>
          ))}
        </div>
        <p className="sutil">
          {visibilidade === 'privado'
            ? 'Só você vê este ponto. Bom para quintais e lugares particulares.'
            : visibilidade === 'rede'
              ? 'Todos os terreiros vão ver. Não marque casas, quintais ou terreiros: para isso, use “Só eu”.'
              : 'Só os membros da sua casa vão ver.'}
          {visibilidade !== 'privado' && !ehValidador(perfil) && ' Aparece depois que um validador aprovar.'}
        </p>
      </section>

      <section>
        <h2>5. Observação (opcional)</h2>
        <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={3} maxLength={500}
          placeholder="Ex.: atrás do banco da praça, florindo em outubro" />
      </section>

      {erro && <p className="erro">{erro}</p>}
      <button className="primario" disabled={salvando}>
        {salvando ? 'Salvando…' : semInternet ? 'Guardar no celular' : 'Salvar no mapa'}
      </button>
      {!semInternet && (
        <button type="button" className="botao" disabled={salvando} onClick={(e) => salvar(e as unknown as FormEvent, true)}>
          <CloudUpload size={18} aria-hidden /> Guardar no celular e enviar depois
        </button>
      )}
      {!semInternet && <p className="sutil centro">Use “guardar” quando o sinal estiver fraco: o app envia sozinho mais tarde.</p>}
    </form>
  )
}

/** Mostra quão boa está a posição e o que fazer quando ela está ruim. */
function SituacaoGps({ gps, refinando, ajustadoAMao }: { gps: Leitura | null; refinando: boolean; ajustadoAMao: boolean }) {
  if (ajustadoAMao) return <p className="sutil icone-texto"><Hand size={16} aria-hidden /> Posição ajustada por você: vale onde a mira está.</p>
  if (!gps) return null
  if (refinando) {
    return (
      <p className="sutil">
        <Satellite size={16} aria-hidden /> Melhorando a precisão… agora <strong>~{gps.precisao} m</strong>. Fique parado(a) uns segundos, de preferência
        ao ar livre.
      </p>
    )
  }
  if (gps.precisao <= 15) return <p className="sutil icone-texto"><CircleCheck size={16} className="cor-ok" aria-hidden /> Precisão do GPS: ~{gps.precisao} m.</p>
  return (
    <p className="aviso-pequeno">
      GPS impreciso (~{gps.precisao} m): o círculo azul mostra onde você pode estar. Arraste o mapa até a mira ficar em
      cima da planta (a foto de satélite ajuda) ou tente de novo longe de prédios e árvores altas.
    </p>
  )
}

/** Leva o mapa até a nova leitura do GPS, sem afastar o zoom que a pessoa escolheu. */
function IrPara({ posicao, versao }: { posicao: [number, number]; versao: number }) {
  const mapa = useMap()
  const ultima = useRef(versao)
  useEffect(() => {
    if (versao === ultima.current) return
    ultima.current = versao
    mapa.setView(posicao, Math.max(mapa.getZoom(), 19))
  }, [versao, posicao, mapa])
  return null
}

function SeguirCentro({ aoMudar, aoArrastar }: { aoMudar: (p: [number, number], zoom: number) => void; aoArrastar: () => void }) {
  const mapa = useMapEvents({
    dragstart: aoArrastar,
    moveend: () => {
      const c = mapa.getCenter()
      aoMudar([c.lat, c.lng], mapa.getZoom())
    },
  })
  return null
}
