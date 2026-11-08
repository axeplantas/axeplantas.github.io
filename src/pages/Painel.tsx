import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AtivarNotificacoes from '../components/AtivarNotificacoes'
import Galeria from '../components/Galeria'
import { avisar } from '../lib/avisos'
import { linkComoChegar } from '../lib/distancia'
import { ehZelador, useSessao } from '../lib/sessao'
import { mensagemDeErro, supabase } from '../lib/supabase'
import { fotosDoPonto, ROTULO_VISIBILIDADE, type Folha, type MembroDaCasa, type Ponto } from '../lib/tipos'
import { confirmar } from '../lib/dialogo'

export default function Painel() {
  const { perfil, casaAtiva } = useSessao()
  const souZelador = ehZelador(casaAtiva)
  const [pendentes, setPendentes] = useState<MembroDaCasa[]>([])
  const [folhas, setFolhas] = useState<Folha[]>([])
  const [pontos, setPontos] = useState<Ponto[]>([])
  const [carregado, setCarregado] = useState(false)
  const [ocupado, setOcupado] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    if (!perfil?.terreiro_id) return
    const [f, p, m] = await Promise.all([
      supabase.from('folhas').select('*').eq('status', 'pendente').eq('terreiro_id', perfil.terreiro_id).order('created_at'),
      supabase
        .from('pontos')
        .select('*, folhas(nome_popular, nome_ritual, toxica, alerta)')
        .eq('status', 'pendente')
        .eq('terreiro_id', perfil.terreiro_id)
        .neq('visibilidade', 'privado')
        .order('created_at'),
      souZelador
        ? supabase.from('membros').select('*, perfis(apelido)').eq('terreiro_id', perfil.terreiro_id).eq('aprovado', false).order('created_at')
        : Promise.resolve({ data: [] }),
    ])
    setFolhas((f.data ?? []) as Folha[])
    setPontos((p.data ?? []) as Ponto[])
    setPendentes((m.data ?? []) as unknown as MembroDaCasa[])
    setCarregado(true)
  }, [perfil, souZelador])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function executar(id: string, acao: PromiseLike<{ error: unknown }>, sucesso: string) {
    setOcupado(id)
    const { error } = await acao
    setOcupado(null)
    if (error) avisar(mensagemDeErro(error), 'erro')
    else avisar(sucesso)
    await carregar()
  }

  const nadaPendente = carregado && pendentes.length === 0 && folhas.length === 0 && pontos.length === 0

  return (
    <div className="pagina">
      <Link to="/casa" className="link">← Casa</Link>
      <h1>Validar</h1>
      <AtivarNotificacoes discreto
        motivo="Receba um aviso no celular quando alguém pedir para entrar ou marcar uma folha nova na sua casa." />
      {!carregado && <p className="sutil">Carregando…</p>}
      {nadaPendente && (
        <div className="cartao tudo-em-dia">
          <strong>✔ Tudo em dia!</strong>
          <span className="sutil">Nenhum pedido, folha ou ponto esperando você.</span>
        </div>
      )}

      {souZelador && pendentes.length > 0 && (
        <section>
          <h2>Pedidos de entrada ({pendentes.length})</h2>
          <p className="sutil">Só aprove quem você conhece e é da casa.</p>
          {pendentes.map((m) => (
            <div key={m.perfil_id} className="cartao">
              <strong>{m.perfis?.apelido}</strong>
              <div className="sutil">Pediu em {new Date(m.created_at).toLocaleDateString('pt-BR')}</div>
              <div className="linha">
                <button className="primario" disabled={ocupado === m.perfil_id}
                  onClick={() => executar(m.perfil_id, supabase.rpc('atualizar_membro', {
                    p_usuario: m.perfil_id, p_terreiro: m.terreiro_id, p_aprovado: true, p_papel: 'membro',
                    p_contador: false, p_isento: false, p_mensalidade: null,
                  }), `${m.perfis?.apelido} foi aprovado(a).`)}>
                  Aprovar
                </button>
                <button className="link perigo" disabled={ocupado === m.perfil_id}
                  onClick={async () => (await confirmar(`Recusar o pedido de ${m.perfis?.apelido}?`, { botao: 'Recusar', perigo: true })) &&
                    executar(m.perfil_id, supabase.rpc('remover_da_casa', { p_usuario: m.perfil_id, p_terreiro: m.terreiro_id }), 'Pedido recusado.')}>
                  Recusar
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {folhas.length > 0 && (
        <section>
          <h2>Folhas novas para conferir ({folhas.length})</h2>
          <p className="sutil">Confira se o nome está certo. Se precisar corrigir, abra a folha e toque em “Editar”.</p>
          {folhas.map((f) => (
            <div key={f.id} className="cartao">
              <Link to={`/folhas/${f.id}`}><strong>{f.nome_popular}</strong></Link>
              {f.nome_ritual && <span className="sutil"> · {f.nome_ritual}</span>}
              {f.nome_cientifico && <div className="cientifico">{f.nome_cientifico}</div>}
              {f.outros_nomes && <div className="sutil">Outros nomes: {f.outros_nomes}</div>}
              {(f.toxica || f.alerta) && <div className="alerta-toxica">{f.toxica ? '⚠️ Tóxica. ' : ''}{f.alerta}</div>}
              <div className="linha">
                <button className="primario" disabled={ocupado === f.id}
                  onClick={() => executar(f.id, supabase.from('folhas').update({ status: 'validada' }).eq('id', f.id),
                    `${f.nome_popular} validada.`)}>
                  Validar
                </button>
                <button className="link perigo" disabled={ocupado === f.id}
                  onClick={async () => (await confirmar(`Recusar a folha “${f.nome_popular}”?`, { texto: 'Ela some da lista de folhas.', botao: 'Recusar', perigo: true })) &&
                    executar(f.id, supabase.from('folhas').update({ status: 'recusada' }).eq('id', f.id), 'Folha recusada.')}>
                  Recusar
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {pontos.length > 0 && (
        <section>
          <h2>Pontos para conferir ({pontos.length})</h2>
          <p className="sutil">Confira a foto e o local. Recuse se for casa, terreiro ou lugar particular marcado como público.</p>
          {pontos.map((p) => (
            <div key={p.id} className="cartao">
              <strong>{p.folhas?.nome_popular ?? 'Folha em validação'}</strong>
              <div className="sutil">Visível para: {ROTULO_VISIBILIDADE[p.visibilidade]}</div>
              <Galeria caminhos={fotosDoPonto(p)} nome={p.folhas?.nome_popular ?? 'Folha'} />
              {p.observacao && <p>{p.observacao}</p>}
              <a href={linkComoChegar(p.lat, p.lng)} target="_blank" rel="noreferrer">Ver o local no mapa</a>
              <div className="linha">
                <button className="primario" disabled={ocupado === p.id}
                  onClick={() => executar(p.id, supabase.from('pontos').update({ status: 'validado' }).eq('id', p.id), 'Ponto validado.')}>
                  Validar
                </button>
                <button className="link perigo" disabled={ocupado === p.id}
                  onClick={async () => (await confirmar('Recusar este ponto?', { texto: 'Ele sai do mapa.', botao: 'Recusar', perigo: true })) &&
                    executar(p.id, supabase.from('pontos').update({ status: 'recusado' }).eq('id', p.id), 'Ponto recusado.')}>
                  Recusar
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {souZelador && (
        <Link to="/casa/membros" className="botao bloco">👥 Filhos da casa, papéis e convites</Link>
      )}
    </div>
  )
}
