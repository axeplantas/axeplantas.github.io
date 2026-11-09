import { Pencil, Plus, Stethoscope, Trash2 } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { avisar } from '../lib/avisos'
import { confirmar } from '../lib/dialogo'
import {
  CAMPOS_FICHA, ROTULO_SECAO, ROTULO_TIPO_EXTRA, useConfigFicha,
  type CampoExtra, type ChaveCampo, type ConfigFicha, type SecaoFicha, type TipoExtra,
} from '../lib/ficha'
import { mensagemDeErro, supabase } from '../lib/supabase'

const SECOES: SecaoFicha[] = ['pessoal', 'saude', 'espiritual']

/** Zelador: o que vai na ficha dos filhos desta casa, e campos próprios. */
export default function ConfigurarFicha({ terreiro }: { terreiro: string }) {
  const [salvo, carregado, recarregar] = useConfigFicha(terreiro)
  const [config, setConfig] = useState<ConfigFicha>(salvo)
  const [editando, setEditando] = useState<CampoExtra | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => setConfig(salvo), [salvo])

  if (!carregado) return null

  const mudou = JSON.stringify(config) !== JSON.stringify(salvo)

  function alternar(chave: ChaveCampo, ligado: boolean) {
    setConfig((c) => ({ ...c, ocultos: ligado ? c.ocultos.filter((x) => x !== chave) : [...c.ocultos, chave] }))
  }

  async function salvar(novo: ConfigFicha = config) {
    setSalvando(true)
    const { error } = await supabase.rpc('configurar_ficha', { p_terreiro: terreiro, p_ficha: novo })
    setSalvando(false)
    if (error) return avisar(mensagemDeErro(error), 'erro')
    avisar('Ficha da casa atualizada. Os filhos já veem a ficha nova.')
    await recarregar()
  }

  async function remover(campo: CampoExtra) {
    const ok = await confirmar(`Tirar o campo “${campo.titulo}”?`, {
      texto: 'Ele some da ficha de todos. O que os filhos já preencheram fica guardado e volta se você criar o campo de novo.',
      botao: 'Tirar campo', perigo: true,
    })
    if (ok) setConfig((c) => ({ ...c, extras: c.extras.filter((e) => e.id !== campo.id) }))
  }

  return (
    <section className="cartao formulario">
      <h2 className="secao-titulo"><Stethoscope size={20} aria-hidden /> Ficha dos filhos</h2>
      <p className="sutil">
        Escolha o que a ficha desta casa pede e crie campos próprios. Cada casa tem a sua ficha: o que você mudar aqui não
        afeta as outras casas.
      </p>

      {SECOES.map((secao) => (
        <div key={secao} className="grupo-config">
          <h3>{ROTULO_SECAO[secao]}</h3>
          {CAMPOS_FICHA.filter((c) => c.secao === secao).map((c) => {
            const ligado = !config.ocultos.includes(c.chave)
            return (
              <label key={c.chave} className="linha-config">
                <span className="cresce">{c.rotulo}</span>
                <input type="checkbox" role="switch" className="interruptor" checked={ligado}
                  onChange={(e) => alternar(c.chave, e.target.checked)} aria-label={`Mostrar ${c.rotulo}`} />
              </label>
            )
          })}
          {config.extras.filter((e) => e.secao === secao).map((e) => (
            <div key={e.id} className="linha-config proprio">
              <span className="cresce">
                <strong>{e.titulo}</strong>
                <span className="sutil"> · {ROTULO_TIPO_EXTRA[e.tipo]}{e.ajuda ? ` · “${e.ajuda}”` : ''}</span>
              </span>
              <button type="button" className="botao-icone" onClick={() => setEditando(e)} aria-label={`Editar ${e.titulo}`}><Pencil size={18} /></button>
              <button type="button" className="botao-icone perigo" onClick={() => remover(e)} aria-label={`Tirar ${e.titulo}`}><Trash2 size={18} /></button>
            </div>
          ))}
        </div>
      ))}

      {editando ? (
        <NovoCampo inicial={editando} aoCancelar={() => setEditando(null)}
          aoSalvar={(campo) => {
            setConfig((c) => ({ ...c, extras: c.extras.some((e) => e.id === campo.id)
              ? c.extras.map((e) => (e.id === campo.id ? campo : e))
              : [...c.extras, campo] }))
            setEditando(null)
          }} />
      ) : (
        <button type="button" className="botao" onClick={() => setEditando({ id: '', titulo: '', ajuda: '', secao: 'espiritual', tipo: 'texto' })}>
          <Plus size={18} aria-hidden /> Criar campo próprio
        </button>
      )}

      <p className="dica">
        Campos desligados somem da ficha, mas o que já foi preenchido fica guardado. Saúde e dados pessoais só o próprio
        filho preenche; os campos da parte espiritual você também pode preencher.
      </p>
      {mudou && (
        <button type="button" className="primario" onClick={() => salvar()} disabled={salvando}>
          {salvando ? 'Salvando…' : 'Salvar ficha da casa'}
        </button>
      )}
    </section>
  )
}

function NovoCampo({ inicial, aoSalvar, aoCancelar }: {
  inicial: CampoExtra
  aoSalvar: (c: CampoExtra) => void
  aoCancelar: () => void
}) {
  const [titulo, setTitulo] = useState(inicial.titulo)
  const [ajuda, setAjuda] = useState(inicial.ajuda ?? '')
  const [secao, setSecao] = useState<SecaoFicha>(inicial.secao)
  const [tipo, setTipo] = useState<TipoExtra>(inicial.tipo)

  function enviar(e: FormEvent) {
    e.preventDefault()
    if (!titulo.trim()) return
    aoSalvar({ id: inicial.id || `c${Date.now().toString(36)}`, titulo: titulo.trim(), ajuda: ajuda.trim() || undefined, secao, tipo })
  }

  return (
    <div className="cartao novo-campo">
      <strong>{inicial.id ? 'Editar campo' : 'Novo campo'}</strong>
      <label>
        Título do campo *
        <input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={80} placeholder="Ex.: Exu de trabalho" />
      </label>
      <label>
        O que o filho deve colocar (opcional)
        <input value={ajuda} onChange={(e) => setAjuda(e.target.value)} maxLength={140} placeholder="Ex.: nome e qualidade, se souber" />
      </label>
      <div className="linha">
        <label className="cresce">
          Parte da ficha
          <select value={secao} onChange={(e) => setSecao(e.target.value as SecaoFicha)}>
            {SECOES.map((s) => <option key={s} value={s}>{ROTULO_SECAO[s]}</option>)}
          </select>
        </label>
        <label className="cresce">
          Tipo de resposta
          <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoExtra)}>
            {(Object.keys(ROTULO_TIPO_EXTRA) as TipoExtra[]).map((t) => <option key={t} value={t}>{ROTULO_TIPO_EXTRA[t]}</option>)}
          </select>
        </label>
      </div>
      <div className="linha">
        <button type="button" className="primario" onClick={enviar} disabled={!titulo.trim()}>
          {inicial.id ? 'Atualizar campo' : 'Adicionar campo'}
        </button>
        <button type="button" className="link" onClick={aoCancelar}>Cancelar</button>
      </div>
    </div>
  )
}
