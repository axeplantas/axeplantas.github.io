import { CloudUpload } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { avisar } from '../lib/avisos'
import { descartarPonto, enviarGuardados, pontosGuardados, type PontoGuardado } from '../lib/fila'
import { useSessao } from '../lib/sessao'
import { confirmar } from '../lib/dialogo'

/** Mostra os pontos guardados no celular e envia sozinho quando houver internet. */
export default function PontosGuardados() {
  const { perfil } = useSessao()
  const [guardados, setGuardados] = useState<PontoGuardado[]>([])
  const [aberto, setAberto] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)

  const atualizar = useCallback(() => {
    pontosGuardados().then(setGuardados)
  }, [])

  const enviar = useCallback(async (manual: boolean) => {
    if (!perfil) return
    const lista = await pontosGuardados()
    if (lista.length === 0) return
    if (!navigator.onLine) {
      if (manual) avisar('Ainda sem internet. Os pontos continuam guardados.', 'erro')
      return
    }
    setEnviando(true)
    const { enviados, restantes } = await enviarGuardados(perfil.id, perfil.terreiro_id)
    setEnviando(false)
    if (enviados > 0) avisar(`${enviados} ponto(s) guardado(s) foram enviados!`)
    else if (manual && restantes > 0) avisar('Não consegui enviar agora. Tento de novo quando o sinal melhorar.', 'erro')
  }, [perfil])

  useEffect(() => {
    atualizar()
    enviar(false)
    const aoMudarFila = () => atualizar()
    const aoVoltarInternet = () => {
      setOnline(true)
      enviar(false)
    }
    const aoPerderInternet = () => setOnline(false)
    const aoVoltarApp = () => {
      if (document.visibilityState === 'visible') enviar(false)
    }
    window.addEventListener('axe-fila', aoMudarFila)
    window.addEventListener('online', aoVoltarInternet)
    window.addEventListener('offline', aoPerderInternet)
    document.addEventListener('visibilitychange', aoVoltarApp)
    return () => {
      window.removeEventListener('axe-fila', aoMudarFila)
      window.removeEventListener('online', aoVoltarInternet)
      window.removeEventListener('offline', aoPerderInternet)
      document.removeEventListener('visibilitychange', aoVoltarApp)
    }
  }, [atualizar, enviar])

  if (guardados.length === 0) return null

  return (
    <div className="guardados">
      <button className="guardados-resumo" onClick={() => setAberto((a) => !a)}>
        <CloudUpload size={18} aria-hidden /> {guardados.length} ponto(s) guardado(s) no celular
        <span className="sutil">{online ? (enviando ? ' · enviando…' : ' · toque para ver') : ' · sem internet'}</span>
      </button>
      {aberto && (
        <div className="guardados-lista">
          {guardados.map((p) => (
            <div key={p.id} className="linha">
              <span className="cresce">
                <strong>{p.folhaNome}</strong>
                <span className="sutil">
                  {' · '}
                  {new Date(p.criadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                  {p.fotos.length > 0 && ` · ${p.fotos.length} foto(s)`}
                </span>
              </span>
              <button className="link perigo"
                onClick={async () => (await confirmar(`Descartar o ponto de ${p.folhaNome}?`, { texto: 'Ele não será enviado.', botao: 'Descartar', perigo: true })) && descartarPonto(p.id)}>
                Descartar
              </button>
            </div>
          ))}
          <button className="primario" disabled={!online || enviando} onClick={() => enviar(true)}>
            {online ? (enviando ? 'Enviando…' : 'Enviar agora') : 'Sem internet: envio automático depois'}
          </button>
        </div>
      )}
    </div>
  )
}
