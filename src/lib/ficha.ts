import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export type SecaoFicha = 'pessoal' | 'saude' | 'espiritual'

export const ROTULO_SECAO: Record<SecaoFicha, string> = {
  pessoal: 'Pessoal',
  saude: 'Saúde',
  espiritual: 'Espiritual',
}

/** Campos que toda ficha pode ter. O zelador escolhe quais a casa usa. */
export const CAMPOS_FICHA = [
  { chave: 'nome_completo', rotulo: 'Nome completo', secao: 'pessoal', tipo: 'texto' },
  { chave: 'data_nascimento', rotulo: 'Data de nascimento', secao: 'pessoal', tipo: 'nascimento' },
  { chave: 'telefone', rotulo: 'Telefone', secao: 'pessoal', tipo: 'tel' },
  { chave: 'contato_emergencia', rotulo: 'Contato de emergência (nome e telefone)', secao: 'pessoal', tipo: 'texto' },
  { chave: 'alergias', rotulo: 'Alergias (remédios, alimentos, ervas, animais...)', secao: 'saude', tipo: 'alergia' },
  { chave: 'condicoes_saude', rotulo: 'Problemas de saúde (pressão, diabetes, coração, gravidez...)', secao: 'saude', tipo: 'longo' },
  { chave: 'tipo_sanguineo', rotulo: 'Tipo sanguíneo', secao: 'saude', tipo: 'sangue' },
  { chave: 'medicamentos', rotulo: 'Remédios (nome, dose, horários, para que serve)', secao: 'saude', tipo: 'remedios' },
  { chave: 'orixa_cabeca', rotulo: 'Orixá de cabeça (pai/mãe de cabeça, Ori)', secao: 'espiritual', tipo: 'texto' },
  { chave: 'orixa_ajunto', rotulo: 'Juntó / segundo orixá', secao: 'espiritual', tipo: 'texto' },
  { chave: 'outros_orixas', rotulo: 'Outros orixás', secao: 'espiritual', tipo: 'texto' },
  { chave: 'nome_de_santo', rotulo: 'Nome de santo (dijina)', secao: 'espiritual', tipo: 'texto' },
  { chave: 'data_iniciacao', rotulo: 'Data de iniciação / feitura', secao: 'espiritual', tipo: 'iniciacao' },
  { chave: 'guias', rotulo: 'Guias (caboclos, pretos-velhos, baianos, boiadeiros...)', secao: 'espiritual', tipo: 'longo' },
  { chave: 'mestres', rotulo: 'Mestres e mestras (Jurema)', secao: 'espiritual', tipo: 'longo' },
  { chave: 'entidades', rotulo: 'Exus, pombagiras, erês e outras entidades', secao: 'espiritual', tipo: 'longo' },
  { chave: 'observacoes', rotulo: 'Observações', secao: 'espiritual', tipo: 'longo' },
] as const

export type ChaveCampo = (typeof CAMPOS_FICHA)[number]['chave']

export type TipoExtra = 'texto' | 'longo' | 'data' | 'simnao'

export const ROTULO_TIPO_EXTRA: Record<TipoExtra, string> = {
  texto: 'Texto curto',
  longo: 'Texto longo',
  data: 'Data',
  simnao: 'Sim ou não',
}

/** Campo criado pela própria casa. */
export interface CampoExtra {
  id: string
  titulo: string
  ajuda?: string
  secao: SecaoFicha
  tipo: TipoExtra
}

export interface ConfigFicha {
  ocultos: ChaveCampo[]
  extras: CampoExtra[]
}

export const CONFIG_PADRAO: ConfigFicha = { ocultos: [], extras: [] }

export function lerConfigFicha(bruto: unknown): ConfigFicha {
  const c = (bruto ?? {}) as Partial<ConfigFicha>
  return {
    ocultos: Array.isArray(c.ocultos) ? c.ocultos : [],
    extras: Array.isArray(c.extras) ? c.extras.filter((e) => e && e.id && e.titulo) : [],
  }
}

/** Como a casa ativa configurou a ficha. */
export function useConfigFicha(terreiro: string | undefined): [ConfigFicha, boolean, () => Promise<void>] {
  const [config, setConfig] = useState<ConfigFicha>(CONFIG_PADRAO)
  const [carregado, setCarregado] = useState(false)
  async function carregar() {
    if (!terreiro) return
    const { data } = await supabase.from('casa_config').select('ficha').eq('terreiro_id', terreiro).maybeSingle()
    setConfig(lerConfigFicha(data?.ficha))
    setCarregado(true)
  }
  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terreiro])
  return [config, carregado, carregar]
}
