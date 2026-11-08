import { Bell } from 'lucide-react'
import { useEffect, useState } from 'react'
import { avisar } from '../lib/avisos'
import { ativarNotificacoes, desativarNotificacoes, estadoNotificacoes, type EstadoNotificacao } from '../lib/notificacoes'
import { mensagemDeErro } from '../lib/supabase'

/**
 * Cartão para ligar as notificações. `discreto` esconde o cartão quando já estão
 * ativas (usado no topo de telas); no Perfil aparece sempre, com opção de desligar.
 */
export default function AtivarNotificacoes({ motivo, discreto = false }: { motivo: string; discreto?: boolean }) {
  const [estado, setEstado] = useState<EstadoNotificacao | null>(null)
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    estadoNotificacoes().then(setEstado)
  }, [])

  async function ativar() {
    setOcupado(true)
    try {
      await ativarNotificacoes()
      setEstado('ativas')
      avisar('Notificações ativadas neste celular!')
    } catch (erro) {
      avisar(mensagemDeErro(erro), 'erro')
      setEstado(await estadoNotificacoes())
    } finally {
      setOcupado(false)
    }
  }

  async function desativar() {
    setOcupado(true)
    await desativarNotificacoes()
    setEstado('desligadas')
    setOcupado(false)
    avisar('Notificações desligadas neste celular.')
  }

  if (!estado || estado === 'sem-suporte') return null
  if (discreto && (estado === 'ativas' || estado === 'instalar')) return null

  return (
    <section className="cartao notificacoes">
      <h2 className="secao-titulo"><Bell size={20} aria-hidden /> Notificações</h2>
      {estado === 'ativas' && (
        <>
          <p className="sutil">Ativas neste celular.</p>
          <button className="link" onClick={desativar} disabled={ocupado}>Desligar</button>
        </>
      )}
      {estado === 'desligadas' && (
        <>
          <p>{motivo}</p>
          <button className="primario" onClick={ativar} disabled={ocupado}>
            {ocupado ? 'Ativando…' : 'Ativar notificações'}
          </button>
        </>
      )}
      {estado === 'bloqueadas' && (
        <p className="sutil">
          As notificações estão bloqueadas para este app. Para ligar, abra os <strong>Ajustes do celular</strong>, procure o
          Axé Plantas (ou o navegador) e permita as notificações.
        </p>
      )}
      {estado === 'instalar' && (
        <p className="sutil">
          No iPhone, as notificações só funcionam com o app instalado: no Safari, toque em <strong>Compartilhar</strong> (□↑)
          e em <strong>“Adicionar à Tela de Início”</strong>. Depois abra pelo ícone e ative aqui.
        </p>
      )}
    </section>
  )
}
