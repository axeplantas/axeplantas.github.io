import { Brush, CalendarDays, ClipboardList, Map as IconeMapa, Package, Stethoscope, Ticket, Wallet, type LucideIcon } from 'lucide-react'

/**
 * Partes do app que o zelador liga ou desliga para a casa dele
 * (ex.: senhas de gira não fazem sentido no Candomblé).
 * O que não estiver configurado fica ligado.
 */
export type Modulo = 'mapa' | 'funcoes' | 'financeiro' | 'calendario' | 'escalas' | 'fichas' | 'materiais' | 'senhas'

export type Modulos = Record<Modulo, boolean>

export const MODULOS: { chave: Modulo; icone: LucideIcon; nome: string; descricao: string }[] = [
  { chave: 'mapa', icone: IconeMapa, nome: 'Mapa e folhas', descricao: 'Mapa de onde encontrar cada folha, catálogo e identificação pela foto.' },
  { chave: 'funcoes', icone: ClipboardList, nome: 'Funções e obrigações', descricao: 'Listas do que é preciso (folhas, bichos, sementes...) e quem leva cada item.' },
  { chave: 'financeiro', icone: Wallet, nome: 'Financeiro', descricao: 'Mensalidades, contribuições, comprovantes e lembretes de pagamento.' },
  { chave: 'calendario', icone: CalendarDays, nome: 'Calendário', descricao: 'Festas, giras e obrigações da casa, com aviso na véspera.' },
  { chave: 'escalas', icone: Brush, nome: 'Escalas', descricao: 'Limpeza, cozinha, portão: convocar filhos ou abrir vagas.' },
  { chave: 'fichas', icone: Stethoscope, nome: 'Ficha dos filhos', descricao: 'Saúde (alergias, remédios), orixás, guias e mestres de cada filho.' },
  { chave: 'materiais', icone: Package, nome: 'Materiais', descricao: 'Estoque da casa: velas, louças, bebidas, animais...' },
  { chave: 'senhas', icone: Ticket, nome: 'Senhas de atendimento', descricao: 'Entregar senhas na porta e chamar na ordem durante a gira.' },
]

export const TODOS_LIGADOS: Modulos = Object.fromEntries(MODULOS.map((m) => [m.chave, true])) as Modulos

export function lerModulos(config: Record<string, unknown> | null | undefined): Modulos {
  const lido = { ...TODOS_LIGADOS }
  for (const m of MODULOS) {
    if (config && typeof config[m.chave] === 'boolean') lido[m.chave] = config[m.chave] as boolean
  }
  return lido
}
