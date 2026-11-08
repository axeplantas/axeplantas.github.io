import type { Registro } from './tipos'

export type Area = 'acesso' | 'fichas' | 'financeiro' | 'funcoes' | 'escalas' | 'calendario' | 'mapa' | 'materiais' | 'filhos' | 'config'

export const ROTULO_AREA: Record<Area, string> = {
  acesso: 'Acessos ao app',
  fichas: 'Fichas',
  financeiro: 'Financeiro',
  funcoes: 'Funções e obrigações',
  escalas: 'Escalas',
  calendario: 'Calendário',
  mapa: 'Mapa',
  materiais: 'Materiais',
  filhos: 'Filhos e funções',
  config: 'Configurações',
}

const AREA_DA_TABELA: Record<string, Area> = {
  app: 'acesso', ficha: 'fichas', fichas: 'fichas',
  pagamentos: 'financeiro', cobrancas: 'financeiro', financeiro_casa: 'financeiro',
  obrigacoes: 'funcoes', obrigacao_itens: 'funcoes', item_contribuicoes: 'funcoes',
  escalas: 'escalas', escala_pessoas: 'escalas', eventos: 'calendario', pontos: 'mapa',
  materiais: 'materiais', movimentos_material: 'materiais', membros: 'filhos', casa_config: 'config',
}

export function areaDe(r: Registro): Area {
  return AREA_DA_TABELA[r.acao.split('.')[0]] ?? 'config'
}

const CAMPOS_FICHA: Record<string, string> = {
  nome_completo: 'nome', data_nascimento: 'nascimento', telefone: 'telefone', contato_emergencia: 'contato de emergência',
  tipo_sanguineo: 'tipo sanguíneo', alergias: 'alergias', condicoes_saude: 'problemas de saúde', medicamentos: 'remédios',
  orixa_cabeca: 'orixá de cabeça', orixa_ajunto: 'juntó', outros_orixas: 'outros orixás', nome_de_santo: 'nome de santo',
  data_iniciacao: 'iniciação', guias: 'guias', mestres: 'mestres', entidades: 'entidades', observacoes: 'observações',
}

/** Frase em português para um registro ("aprovou Ana", "enviou comprovante"...). */
export function descrever(r: Registro, nome: (id: string | null) => string): string {
  const [tabela, op] = r.acao.split('.')
  const d = (r.detalhe ?? {}) as Record<string, unknown>
  const campos = (d.campos as string[] | undefined) ?? []
  const titulo = r.descricao ? `“${r.descricao}”` : ''
  const alvo = r.alvo_perfil && r.alvo_perfil !== r.perfil_id ? nome(r.alvo_perfil) : null
  const tem = (c: string) => campos.includes(c)

  switch (tabela) {
    case 'app': return 'abriu o app'
    case 'fichas': return 'abriu a lista de fichas dos filhos'
    case 'ficha':
      if (op === 'vista') return `abriu a ficha de ${alvo ?? 'um filho'}`
      return `${alvo ? `editou a ficha de ${alvo}` : 'atualizou a própria ficha'}${campos.length ? ` (${campos.map((c) => CAMPOS_FICHA[c] ?? c).join(', ')})` : ''}`
    case 'pagamentos': {
      const s = d.status as string | undefined
      if (s === 'informado') return 'enviou um comprovante de pagamento'
      if (s === 'confirmado') return `confirmou o pagamento${alvo ? ` de ${alvo}` : ''}`
      if (s === 'recusado') return `recusou o comprovante${alvo ? ` de ${alvo}` : ''}`
      if (s === 'isento') return `marcou ${alvo ?? 'alguém'} como isento`
      return 'mexeu num pagamento'
    }
    case 'cobrancas': return op === 'insert' ? `criou a cobrança ${titulo}` : op === 'delete' ? `apagou a cobrança ${titulo}` : `alterou a cobrança ${titulo}`
    case 'financeiro_casa': return 'mudou a configuração do financeiro'
    case 'eventos': return op === 'insert' ? `marcou no calendário ${titulo}` : op === 'delete' ? `tirou do calendário ${titulo}` : `alterou o evento ${titulo}`
    case 'obrigacoes': return op === 'insert' ? `criou a função ${titulo}` : op === 'delete' ? `apagou a função ${titulo}` : `alterou a função ${titulo}`
    case 'obrigacao_itens':
      if (op === 'insert') return `adicionou um item${titulo ? ` (${r.descricao})` : ''} numa função`
      if (op === 'delete') return 'tirou um item de uma função'
      return tem('colhida') ? 'marcou um item como pronto/colhido' : 'alterou um item de função'
    case 'item_contribuicoes':
      if (op === 'insert') return alvo ? `pôs ${alvo} para levar um item (${d.quantidade ?? ''})` : `se ofereceu para levar um item (${d.quantidade ?? ''})`
      if (op === 'delete') return 'desistiu de levar um item'
      return d.status === 'entregue' ? 'marcou um item como entregue' : 'alterou um item que vai levar'
    case 'escalas': return op === 'insert' ? `criou a escala ${titulo}` : op === 'delete' ? `apagou a escala ${titulo}` : `alterou a escala ${titulo}`
    case 'escala_pessoas':
      if (tem('presenca')) return `marcou a presença de ${alvo ?? 'alguém'} numa escala`
      if (d.status === 'confirmado') return 'confirmou presença numa escala'
      if (d.status === 'recusou') return 'disse que não pode ir numa escala'
      if (op === 'delete') return 'saiu de uma escala'
      return op === 'insert' ? 'entrou numa escala' : 'respondeu uma escala'
    case 'pontos':
      if (op === 'insert') return 'marcou uma folha no mapa'
      if (op === 'delete') return 'apagou um ponto do mapa'
      return d.status === 'validado' ? 'validou um ponto do mapa' : d.status === 'recusado' ? 'recusou um ponto do mapa' : 'alterou um ponto do mapa'
    case 'materiais': return op === 'insert' ? `cadastrou o material ${titulo}` : op === 'delete' ? `apagou o material ${titulo}` : `alterou o material ${titulo}`
    case 'movimentos_material':
      return d.tipo === 'entrada' ? `registrou entrada de material (${d.quantidade})` : d.tipo === 'saida' ? `registrou saída de material (${d.quantidade})` : 'ajustou a quantidade de um material'
    case 'membros':
      if (op === 'insert') return 'pediu para entrar na casa'
      if (op === 'delete') return `${alvo ? `tirou ${alvo}` : 'saiu'} da casa`
      if (tem('aprovado')) return `aprovou a entrada de ${alvo ?? 'alguém'}`
      if (tem('papel')) return `mudou o papel de ${alvo ?? 'alguém'}`
      if (tem('permissoes')) return `mudou as permissões de ${alvo ?? 'alguém'}`
      if (tem('contador')) return `mudou a função de contador de ${alvo ?? 'alguém'}`
      if (tem('isento') || tem('mensalidade_valor')) return `mudou a mensalidade de ${alvo ?? 'alguém'}`
      return `alterou o cadastro de ${alvo ?? 'alguém'}`
    case 'casa_config': return 'mudou o que aparece no app da casa'
    default: return r.acao
  }
}
