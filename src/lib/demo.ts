/**
 * Modo demonstração: imita o Supabase com dados de exemplo guardados só
 * na memória do navegador. Nada é enviado para a internet nem fica salvo.
 * Ative com `npm run demo`.
 */

type Linha = Record<string, any>

const EU = 'demo-zelador'
const T1 = 'demo-t1'
const T2 = 'demo-t2'
const T3 = 'demo-t3'

let centro: [number, number] = [-23.5874, -46.6576] // Parque Ibirapuera (SP)
let semeado = false

const banco: Record<string, Linha[]> = {
  terreiros: [
    { id: T1, nome: 'Terreiro Exemplo 1', nacao: 'Candomblé de Ketu' },
    { id: T2, nome: 'Terreiro Exemplo 2', nacao: 'Umbanda / Jurema / Quimbanda' },
    { id: T3, nome: 'Terreiro Exemplo 3', nacao: 'Umbanda' },
  ],
  perfis: [
    { ...perfil(EU, 'Você (administrador)', T1, 'zelador', true), admin: true },
    perfil('demo-m1', 'Ana de Oxum', T1, 'membro', true),
    perfil('demo-m2', 'Carlos', T1, 'validador', true),
    perfil('demo-m3', 'Joana', T1, 'membro', false),
    perfil('demo-m4', 'Pedro de Ogum', T1, 'membro', false),
  ],
  folhas: [
    folha('f1', 'Aroeira', 'Schinus terebinthifolia', 'aroeira-vermelha, aroeira-pimenteira'),
    folha('f2', 'Arruda', 'Ruta graveolens', null, true, 'Pode causar queimaduras na pele exposta ao sol. Não usar na gravidez.'),
    folha('f3', 'Guiné', 'Petiveria alliacea', 'tipi, erva-pipi', true, 'Não ingerir.'),
    folha('f4', 'Espada-de-São-Jorge', 'Dracaena trifasciata', 'espada-de-Ogum', true, 'Não ingerir (pessoas e animais).'),
    folha('f5', 'Alecrim', 'Salvia rosmarinus'),
    folha('f6', 'Manjericão', 'Ocimum basilicum', 'alfavaca'),
    folha('f7', 'Boldo', 'Plectranthus barbatus', 'boldo-brasileiro, tapete-de-Oxalá'),
    folha('f8', 'Comigo-ninguém-pode', 'Dieffenbachia seguine', null, true, 'Muito tóxica: a seiva queima boca e garganta.'),
    folha('f9', 'Peregun', 'Dracaena fragrans', 'pau-d’água'),
    folha('f10', 'Erva-cidreira', 'Lippia alba', 'cidreira-de-arbusto', false, null, 'pendente', 'demo-m1'),
  ],
  fundamentos: [],
  pontos: [],
  convites: [],
  membros: [],
  financeiro_casa: [],
  cobrancas: [],
  pagamentos: [],
  eventos: [],
  materiais: [],
  movimentos_material: [],
  obrigacoes: [
    {
      id: 'o1', nome: 'Obrigação de exemplo', data: new Date(Date.now() + 86400000 * 10).toISOString().slice(0, 10),
      observacao: 'Lista de exemplo para ver como funciona.', visibilidade: 'terreiro', terreiro_id: T1,
      criado_por: EU, created_at: new Date().toISOString(),
    },
  ],
  obrigacao_itens: [
    item('i1', 'f1', '1 maço', true),
    item('i2', 'f3', '3 galhos'),
    item('i3', 'f5', '1 maço'),
    item('i4', 'f6', '2 maços'),
    item('i5', 'f9', '7 folhas'),
  ],
}

function item(id: string, folhaId: string, quantidade: string, colhida = false): Linha {
  return { id, obrigacao_id: 'o1', folha_id: folhaId, quantidade, colhida, created_at: new Date().toISOString() }
}

// Na demonstração, os vínculos (membros) espelham os perfis de exemplo.
queueMicrotask(() => {
  banco.membros = banco.perfis.map((p) => ({
    perfil_id: p.id, terreiro_id: p.terreiro_id, papel: p.papel, aprovado: p.aprovado, contador: false,
    isento: p.papel === 'zelador', mensalidade_valor: null, permissoes: [],
    aprovado_em: p.aprovado ? new Date(Date.now() - 200 * 86400000).toISOString() : null, created_at: p.created_at,
  }))
})

function perfil(id: string, apelido: string, terreiro: string, papel: string, aprovado: boolean): Linha {
  return { id, apelido, terreiro_id: terreiro, papel, aprovado, created_at: new Date(Date.now() - 86400000 * 3).toISOString() }
}

function folha(
  id: string, nome: string, cientifico: string, outros: string | null = null, toxica = false,
  alerta: string | null = null, status = 'validada', criadoPor = EU,
): Linha {
  return {
    id, nome_popular: nome, nome_ritual: null, outros_nomes: outros, nome_cientifico: cientifico,
    toxica, alerta, status, terreiro_id: T1, criado_por: criadoPor, created_at: new Date().toISOString(),
  }
}

/** Cria pontos de exemplo ao redor de onde a pessoa está. */
function semear() {
  if (semeado) return
  semeado = true
  const exemplos: [string, string, string, string | null, string][] = [
    // folha, visibilidade, status, observação, terreiro
    ['f1', 'rede', 'validado', 'Árvore grande na entrada da praça.', T1],
    ['f1', 'rede', 'validado', null, T2],
    ['f2', 'terreiro', 'validado', 'Canteiro ao lado da padaria.', T1],
    ['f3', 'rede', 'validado', 'Embaixo das árvores, perto do lago.', T3],
    ['f4', 'rede', 'validado', 'Vários vasos na calçada.', T2],
    ['f5', 'privado', 'validado', 'No meu quintal.', T1],
    ['f6', 'rede', 'validado', null, T3],
    ['f7', 'rede', 'validado', 'Pode colher, o dono autorizou.', T1],
    ['f8', 'rede', 'validado', 'Cuidado: perto do parquinho.', T2],
    ['f9', 'rede', 'validado', null, T1],
    ['f6', 'rede', 'pendente', 'Achei hoje, florindo.', T1],
    ['f10', 'terreiro', 'pendente', 'Touceira grande no terreno da escola.', T1],
  ]
  exemplos.forEach(([folhaId, visibilidade, status, observacao, terreiro], i) => {
    const angulo = (i / exemplos.length) * Math.PI * 2
    const raio = 0.002 + (i % 4) * 0.0015
    banco.pontos.push({
      id: `p${i}`,
      folha_id: folhaId,
      lat: centro[0] + Math.sin(angulo) * raio,
      lng: centro[1] + Math.cos(angulo) * raio,
      foto_path: null,
      observacao,
      visibilidade,
      status,
      terreiro_id: terreiro,
      criado_por: status === 'pendente' ? 'demo-m1' : EU,
      created_at: new Date().toISOString(),
    })
  })
}

export function definirCentroDemo(lat: number, lng: number) {
  if (!semeado) centro = [lat, lng]
}

// ---------------------------------------------------------------------
// Consultas (imita o "supabase.from(...)")
// ---------------------------------------------------------------------

class Consulta implements PromiseLike<any> {
  private op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select'
  private filtros: ((l: Linha) => boolean)[] = []
  private ordem: string | null = null
  private dados: any = null
  private selecao = '*'
  private contar = false
  private unico: 'single' | 'maybe' | null = null
  private limite: number | null = null
  private inicio = 0

  private tabela: string

  constructor(tabela: string) {
    this.tabela = tabela
  }

  select(selecao = '*', opcoes?: { count?: string; head?: boolean }) {
    this.selecao = selecao
    this.contar = Boolean(opcoes?.count)
    return this
  }
  insert(v: any) { this.op = 'insert'; this.dados = v; return this }
  update(v: any) { this.op = 'update'; this.dados = v; return this }
  upsert(v: any) { this.op = 'upsert'; this.dados = v; return this }
  delete() { this.op = 'delete'; return this }
  eq(c: string, v: any) { this.filtros.push((l) => l[c] === v); return this }
  in(c: string, v: any[]) { this.filtros.push((l) => v.includes(l[c])); return this }
  gte(c: string, v: any) { this.filtros.push((l) => l[c] >= v); return this }
  lte(c: string, v: any) { this.filtros.push((l) => l[c] <= v); return this }
  gt(c: string, v: any) { this.filtros.push((l) => l[c] > v); return this }
  lt(c: string, v: any) { this.filtros.push((l) => l[c] < v); return this }
  limit(n: number) { this.limite = n; return this }
  range(de: number, ate: number) { this.inicio = de; this.limite = ate - de + 1; return this }
  neq(c: string, v: any) { this.filtros.push((l) => l[c] !== v); return this }
  order(c: string) { this.ordem ??= c; return this }
  single() { this.unico = 'single'; return this }
  maybeSingle() { this.unico = 'maybe'; return this }

  then<A, B>(ok?: ((v: any) => A | PromiseLike<A>) | null, falha?: ((e: any) => B | PromiseLike<B>) | null) {
    return new Promise((r) => setTimeout(r, 120)).then(() => this.executar()).then(ok, falha)
  }

  private executar() {
    if (this.tabela === 'pontos') semear()
    const tabela = (banco[this.tabela] ??= [])
    let linhas: Linha[]

    if (this.op === 'insert' || this.op === 'upsert') {
      const novo = { ...this.dados }
      const existente = this.op === 'upsert'
        ? tabela.find((l) => l.folha_id === novo.folha_id && l.terreiro_id === novo.terreiro_id)
        : undefined
      if (existente) {
        Object.assign(existente, novo)
        linhas = [existente]
      } else {
        Object.assign(novo, {
          id: novo.id ?? crypto.randomUUID(),
          created_at: new Date().toISOString(),
          criado_por: EU,
          terreiro_id: T1,
        })
        if (this.tabela === 'folhas') novo.status = 'validada'
        if (this.tabela === 'pontos') novo.status = 'validado'
        tabela.push(novo)
        linhas = [novo]
      }
    } else {
      linhas = tabela.filter((l) => this.filtros.every((f) => f(l)))
      if (this.op === 'update') linhas.forEach((l) => Object.assign(l, this.dados))
      if (this.op === 'delete') banco[this.tabela] = tabela.filter((l) => !linhas.includes(l))
    }

    if (this.ordem) {
      const c = this.ordem
      linhas = [...linhas].sort((a, b) => String(a[c]).localeCompare(String(b[c]), 'pt-BR'))
    }

    const resultado = linhas
      .slice(this.inicio, this.limite === null ? undefined : this.inicio + this.limite)
      .map((l) => this.juntar({ ...l }))
    if (this.unico) {
      const data = resultado[0] ?? null
      if (!data && this.unico === 'single') return { data: null, error: { message: 'Não encontrado' } }
      return { data, error: null }
    }
    return { data: resultado, error: null, count: this.contar ? resultado.length : null }
  }

  /** Imita os "relacionamentos" como folhas(...) e terreiros(...). */
  private juntar(l: Linha): Linha {
    if (this.selecao.includes('folhas(')) l.folhas = banco.folhas.find((f) => f.id === l.folha_id) ?? null
    if (/terreiros(![\w]+)?\(/.test(this.selecao)) l.terreiros = banco.terreiros.find((t) => t.id === l.terreiro_id) ?? null
    if (this.selecao.includes('perfis(')) l.perfis = banco.perfis.find((p) => p.id === l.perfil_id) ?? null
    return l
  }
}

// ---------------------------------------------------------------------
// Ficha, escalas, funções, senhas e registros (imitação das funções do banco)
// ---------------------------------------------------------------------

const DIA = 86400000
const iso = (deslocamentoDias: number) => new Date(Date.now() + deslocamentoDias * DIA).toISOString().slice(0, 10)
const ok = (data: any = null) => ({ data, error: null })
const falha = (message: string) => ({ data: null, error: { message } })

Object.assign(banco, {
  casa_config: [],
  fichas: [
    {
      perfil_id: 'demo-m1', terreiro_id: T1, nome_completo: 'Ana Souza', data_nascimento: `1990-${iso(0).slice(5, 7)}-20`,
      telefone: null, contato_emergencia: 'Marcos (irmão) 11 9xxxx-xxxx', tipo_sanguineo: 'O+', alergias: 'Dipirona, camarão',
      condicoes_saude: 'Pressão alta', medicamentos: [{ nome: 'Losartana', dose: '50 mg', horarios: '8h', para_que: 'Pressão', continuo: true }],
      orixa_cabeca: 'Oxum', orixa_ajunto: 'Oxalá', outros_orixas: null, nome_de_santo: 'Omi Ladê', data_iniciacao: '2015-08-10',
      guias: null, mestres: null, entidades: null, observacoes: null, consentimento_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString(), atualizado_por: 'demo-m1',
    },
    {
      perfil_id: 'demo-m2', terreiro_id: T1, nome_completo: 'Carlos Lima', data_nascimento: '1985-03-02', telefone: null,
      contato_emergencia: null, tipo_sanguineo: null, alergias: null, condicoes_saude: null, medicamentos: [],
      orixa_cabeca: 'Ogum', orixa_ajunto: 'Iemanjá', outros_orixas: null, nome_de_santo: null, data_iniciacao: '2010-01-15',
      guias: 'Caboclo Sete Flechas', mestres: null, entidades: null, observacoes: null, consentimento_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString(), atualizado_por: 'demo-m2',
    },
  ],
  escalas: [
    { id: 'e1', terreiro_id: T1, titulo: 'Limpeza do barracão', descricao: 'Trazer pano e balde.', data: iso(3), hora: '09:00:00', local: 'Barracão', modo: 'vagas', vagas: 4, obrigacao_id: null, criado_por: EU, created_at: new Date().toISOString() },
    { id: 'e2', terreiro_id: T1, titulo: 'Cozinha da festa de Ogum', descricao: null, data: iso(8), hora: '14:00:00', local: 'Cozinha', modo: 'escolhidos', vagas: null, obrigacao_id: 'o1', criado_por: EU, created_at: new Date().toISOString() },
    { id: 'e3', terreiro_id: T1, titulo: 'Mutirão do quintal', descricao: null, data: iso(-10), hora: null, local: null, modo: 'todos', vagas: null, obrigacao_id: null, criado_por: EU, created_at: new Date().toISOString() },
  ],
  escala_pessoas: [
    { escala_id: 'e1', perfil_id: 'demo-m1', terreiro_id: T1, status: 'confirmado', presenca: null, respondeu_em: new Date().toISOString() },
    { escala_id: 'e2', perfil_id: EU, terreiro_id: T1, status: 'convocado', presenca: null, respondeu_em: null },
    { escala_id: 'e2', perfil_id: 'demo-m2', terreiro_id: T1, status: 'confirmado', presenca: null, respondeu_em: null },
    { escala_id: 'e3', perfil_id: EU, terreiro_id: T1, status: 'confirmado', presenca: 'presente', respondeu_em: null },
    { escala_id: 'e3', perfil_id: 'demo-m1', terreiro_id: T1, status: 'confirmado', presenca: 'presente', respondeu_em: null },
    { escala_id: 'e3', perfil_id: 'demo-m2', terreiro_id: T1, status: 'confirmado', presenca: 'faltou', respondeu_em: null },
  ],
  item_contribuicoes: [
    { id: 'c1', item_id: 'i2', obrigacao_id: 'o1', terreiro_id: T1, perfil_id: 'demo-m1', quantidade: 2, status: 'combinado', atribuido_por: null, entregue_em: null, created_at: new Date().toISOString() },
    { id: 'c2', item_id: 'i6', obrigacao_id: 'o1', terreiro_id: T1, perfil_id: 'demo-m2', quantidade: 1, status: 'entregue', atribuido_por: EU, entregue_em: new Date().toISOString(), created_at: new Date().toISOString() },
  ],
  senhas: [],
  registros: [
    { id: 1, terreiro_id: T1, perfil_id: 'demo-m1', acao: 'app.aberto', alvo_perfil: null, descricao: 'Abriu o app', detalhe: null, created_at: new Date(Date.now() - 3600000).toISOString() },
    { id: 2, terreiro_id: T1, perfil_id: 'demo-m1', acao: 'ficha.editada', alvo_perfil: 'demo-m1', descricao: null, detalhe: { campos: ['alergias', 'medicamentos'] }, created_at: new Date(Date.now() - 3000000).toISOString() },
    { id: 3, terreiro_id: T1, perfil_id: 'demo-m2', acao: 'item_contribuicoes.update', alvo_perfil: 'demo-m2', descricao: null, detalhe: { status: 'entregue', campos: ['status'] }, created_at: new Date(Date.now() - 2000000).toISOString() },
    { id: 4, terreiro_id: T1, perfil_id: 'demo-m1', acao: 'escala_pessoas.insert', alvo_perfil: 'demo-m1', descricao: null, detalhe: { status: 'confirmado' }, created_at: new Date(Date.now() - DIA).toISOString() },
    { id: 5, terreiro_id: T1, perfil_id: EU, acao: 'escalas.insert', alvo_perfil: null, descricao: 'Limpeza do barracão', detalhe: null, created_at: new Date(Date.now() - DIA - 5000).toISOString() },
  ],
})
banco.obrigacoes[0].filho_id = 'demo-m1'
banco.escala_pessoas.forEach((p) => { p.created_at ??= new Date(Date.now() - 12 * DIA).toISOString() })

// Financeiro de exemplo: 4 meses de mensalidade, com quem paga em dia, quem atrasa e quem está devendo.
{
  const mes = (n: number) => {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - n)
    return d.toISOString().slice(0, 7)
  }
  banco.financeiro_casa.push({ terreiro_id: T1, cobra_mensalidade: true, valor_padrao: 50, dia_vencimento: 10,
    instrucoes: 'Pix: (chave de exemplo)', inicio: `${mes(3)}-01`, lembrete_dias: [3, 0], lembrar_atrasados: true, atraso_intervalo: 7 })
  ;[3, 2, 1, 0].forEach((n) => {
    const id = `mens-${n}`
    banco.cobrancas.push({ id, terreiro_id: T1, tipo: 'mensalidade', titulo: `Mensalidade ${mes(n)}`, descricao: null,
      competencia: `${mes(n)}-01`, vencimento: `${mes(n)}-10`, valor: null, para_todos: true, created_at: new Date().toISOString() })
    const pago = (perfil: string, dia: string) => banco.pagamentos.push({ id: crypto.randomUUID(), cobranca_id: id, terreiro_id: T1,
      perfil_id: perfil, valor: 50, status: 'confirmado', comprovante: null, observacao: null, motivo: null,
      informado_em: `${mes(n)}-${dia}T12:00:00Z`, conferido_em: `${mes(n)}-${dia}T13:00:00Z` })
    pago('demo-m1', '05')                    // Ana: sempre em dia
    if (n >= 2) pago('demo-m2', '25')        // Carlos: paga atrasado e parou de pagar
  })
  banco.cobrancas.push({ id: 'contrib-ere', terreiro_id: T1, tipo: 'contribuicao', titulo: 'Festa de Erê', descricao: null,
    competencia: null, vencimento: iso(-5), valor: 70, para_todos: true, created_at: new Date().toISOString() })
  banco.pagamentos.push({ id: crypto.randomUUID(), cobranca_id: 'contrib-ere', terreiro_id: T1, perfil_id: 'demo-m1', valor: 70,
    status: 'informado', comprovante: null, observacao: null, motivo: null, informado_em: new Date().toISOString(), conferido_em: null })
}
banco.obrigacao_itens.push(
  { id: 'i6', obrigacao_id: 'o1', folha_id: null, nome: 'Galo carijó', categoria: 'animal', quantidade_total: 1, unidade: 'cabeça', quantidade: '1 cabeça', aberto: false, colhida: false, created_at: new Date().toISOString() },
  { id: 'i7', obrigacao_id: 'o1', folha_id: null, nome: 'Milho branco', categoria: 'semente', quantidade_total: 3, unidade: 'kg', quantidade: '3 kg', aberto: true, colhida: false, created_at: new Date().toISOString() },
  { id: 'i8', obrigacao_id: 'o1', folha_id: null, nome: 'Vela branca de 7 dias', categoria: 'vela', quantidade_total: 6, unidade: 'unidade', quantidade: '6 unidade', aberto: true, colhida: false, created_at: new Date().toISOString() },
)
banco.obrigacao_itens.find((i) => i.id === 'i2')!.quantidade_total = 3
banco.obrigacao_itens.find((i) => i.id === 'i2')!.unidade = 'galho'

function rpcNovas(nome: string, a: any): { data: any; error: any } | null {
  const irmaos = () => banco.membros.filter((m) => m.terreiro_id === T1 && m.aprovado)
    .map((m) => ({ perfil_id: m.perfil_id, apelido: banco.perfis.find((p) => p.id === m.perfil_id)?.apelido ?? '?', papel: m.papel }))
    .sort((x, y) => x.apelido.localeCompare(y.apelido, 'pt-BR'))
  const hoje = iso(0)
  switch (nome) {
    case 'registrar_acesso': return ok()
    case 'apelidos_da_casa': return ok(irmaos())
    case 'configurar_modulos': {
      banco.casa_config = [{ terreiro_id: a.p_terreiro, modulos: a.p_modulos }]
      return ok()
    }
    case 'configurar_lembretes': {
      const f = banco.financeiro_casa.find((x) => x.terreiro_id === a.p_terreiro)
      const dados = { lembrete_dias: a.p_dias, lembrar_atrasados: a.p_atrasados, atraso_intervalo: a.p_intervalo }
      if (f) Object.assign(f, dados)
      else banco.financeiro_casa.push({ terreiro_id: a.p_terreiro, cobra_mensalidade: false, valor_padrao: 0, dia_vencimento: 10, ...dados })
      return ok()
    }
    case 'definir_permissoes': {
      const m = banco.membros.find((x) => x.perfil_id === a.p_usuario && x.terreiro_id === a.p_terreiro)
      if (m) m.permissoes = a.p_permissoes
      return ok()
    }
    case 'abrir_ficha': return ok(banco.fichas.find((f) => f.perfil_id === a.p_perfil && f.terreiro_id === a.p_terreiro) ?? null)
    case 'salvar_ficha': {
      let f = banco.fichas.find((x) => x.perfil_id === a.p_perfil && x.terreiro_id === a.p_terreiro)
      if (!f) {
        if (a.p_perfil === EU && !a.p_consentimento) return falha('Para salvar a ficha, marque que você concorda em guardar estes dados')
        f = { perfil_id: a.p_perfil, terreiro_id: a.p_terreiro, medicamentos: [], consentimento_em: new Date().toISOString() }
        banco.fichas.push(f)
      }
      Object.assign(f, a.p_dados, { atualizado_em: new Date().toISOString(), atualizado_por: EU })
      return ok()
    }
    case 'copiar_minha_ficha': return falha('Na demonstração não há ficha em outra casa.')
    case 'listar_fichas':
      return ok(irmaos().map((i) => {
        const f = banco.fichas.find((x) => x.perfil_id === i.perfil_id && x.terreiro_id === T1)
        const meds = (f?.medicamentos ?? []) as any[]
        return {
          perfil_id: i.perfil_id, apelido: i.apelido, preenchida: Boolean(f), data_nascimento: f?.data_nascimento ?? null,
          orixa_cabeca: f?.orixa_cabeca ?? null, orixa_ajunto: f?.orixa_ajunto ?? null, nome_de_santo: f?.nome_de_santo ?? null,
          data_iniciacao: f?.data_iniciacao ?? null, alergias: f?.alergias ?? null, condicoes_saude: f?.condicoes_saude ?? null,
          remedios_continuos: meds.filter((m) => m.continuo).length, total_remedios: meds.length, atualizado_em: f?.atualizado_em ?? null,
        }
      }))
    case 'criar_escala': {
      const id = crypto.randomUUID()
      banco.escalas.push({ id, terreiro_id: a.p_terreiro, titulo: a.p_titulo, descricao: a.p_descricao || null, data: a.p_data, hora: a.p_hora,
        local: a.p_local || null, modo: a.p_modo, vagas: a.p_vagas, obrigacao_id: a.p_obrigacao, criado_por: EU, created_at: new Date().toISOString() })
      const pessoas = a.p_modo === 'todos' ? irmaos().map((i) => i.perfil_id) : a.p_modo === 'escolhidos' ? a.p_pessoas : []
      pessoas.forEach((p: string) => banco.escala_pessoas.push({ escala_id: id, perfil_id: p, terreiro_id: a.p_terreiro, status: 'convocado', presenca: null, respondeu_em: null, created_at: new Date().toISOString() }))
      return ok(id)
    }
    case 'responder_escala': {
      const e = banco.escalas.find((x) => x.id === a.p_escala)!
      const minha = banco.escala_pessoas.find((x) => x.escala_id === a.p_escala && x.perfil_id === EU)
      if (e.modo === 'vagas') {
        if (!a.p_vou) {
          banco.escala_pessoas = banco.escala_pessoas.filter((x) => x !== minha)
          return ok('saiu')
        }
        const confirmados = banco.escala_pessoas.filter((x) => x.escala_id === e.id && x.status === 'confirmado').length
        if (confirmados >= e.vagas) return falha('As vagas já foram preenchidas')
        if (minha) minha.status = 'confirmado'
        else banco.escala_pessoas.push({ escala_id: e.id, perfil_id: EU, terreiro_id: e.terreiro_id, status: 'confirmado', presenca: null, respondeu_em: new Date().toISOString(), created_at: new Date().toISOString() })
        return ok('confirmado')
      }
      if (!minha) return falha('Você não foi convocado(a) para esta escala')
      minha.status = a.p_vou ? 'confirmado' : 'recusou'
      return ok(minha.status)
    }
    case 'marcar_presenca': {
      const p = banco.escala_pessoas.find((x) => x.escala_id === a.p_escala && x.perfil_id === a.p_perfil)
      if (p) p.presenca = a.p_presenca
      return ok()
    }
    case 'apagar_escala': {
      banco.escalas = banco.escalas.filter((x) => x.id !== a.p_escala)
      return ok()
    }
    case 'contribuir_item':
    case 'atribuir_item': {
      const item = banco.obrigacao_itens.find((x) => x.id === a.p_item)!
      const quem = nome === 'contribuir_item' ? EU : a.p_perfil
      const existente = banco.item_contribuicoes.find((x) => x.item_id === a.p_item && x.perfil_id === quem)
      if (existente) existente.quantidade = a.p_quantidade
      else banco.item_contribuicoes.push({ id: crypto.randomUUID(), item_id: a.p_item, obrigacao_id: item.obrigacao_id, terreiro_id: T1,
        perfil_id: quem, quantidade: a.p_quantidade, status: 'combinado', atribuido_por: nome === 'atribuir_item' ? EU : null,
        entregue_em: null, created_at: new Date().toISOString() })
      return ok()
    }
    case 'marcar_entrega': {
      const c = banco.item_contribuicoes.find((x) => x.id === a.p_contribuicao)
      if (c) c.status = a.p_entregue ? 'entregue' : 'combinado'
      return ok()
    }
    case 'desistir_item': {
      banco.item_contribuicoes = banco.item_contribuicoes.filter((x) => x.id !== a.p_contribuicao)
      return ok()
    }
    case 'emitir_senha': {
      const numero = banco.senhas.filter((s) => s.data === hoje).length + 1
      banco.senhas.push({ id: crypto.randomUUID(), terreiro_id: a.p_terreiro, data: hoje, numero, nome: String(a.p_nome).trim().split(' ')[0],
        status: 'aguardando', chamada_em: null, created_at: new Date().toISOString() })
      return ok(numero)
    }
    case 'chamar_proxima_senha': {
      const s = banco.senhas.filter((x) => x.data === hoje && x.status === 'aguardando').sort((x, y) => x.numero - y.numero)[0]
      if (!s) return ok(null)
      Object.assign(s, { status: 'chamada', chamada_em: new Date().toISOString() })
      return ok({ id: s.id, numero: s.numero, nome: s.nome })
    }
    case 'marcar_senha': {
      const s = banco.senhas.find((x) => x.id === a.p_senha)
      if (s) Object.assign(s, { status: a.p_status, chamada_em: a.p_status === 'chamada' ? new Date().toISOString() : s.chamada_em })
      return ok()
    }
    case 'uso_do_app':
      return ok(irmaos().map((i, n) => ({
        perfil_id: i.perfil_id,
        ultimo_acesso: n === 1 ? new Date(Date.now() - 45 * DIA).toISOString() : new Date(Date.now() - n * 3600000).toISOString(),
        acessos_30d: n === 1 ? 0 : 12 - n * 3, acoes_30d: n === 1 ? 0 : 20 - n * 4,
      })))
    case 'resumo_senhas':
      return ok([{ data: iso(-7), total: 34, atendidas: 30, ausentes: 4 }, { data: iso(-14), total: 28, atendidas: 27, ausentes: 1 }])
    default: return null
  }
}

// ---------------------------------------------------------------------
// Login, fotos e funções
// ---------------------------------------------------------------------

const ouvintes = new Set<(evento: string, sessao: any) => void>()
let sessao: any = null
const fotos = new Map<string, string>()

function avisar(evento: string) {
  ouvintes.forEach((f) => f(evento, sessao))
}

function entrar(email: string) {
  sessao = { user: { id: EU, email: email || 'demo@exemplo.com' } }
  setTimeout(() => avisar('SIGNED_IN'), 0)
  return { data: { session: sessao, user: sessao.user }, error: null }
}

export function criarClienteDemo(): any {
  return {
    from: (tabela: string) => new Consulta(tabela),
    rpc: async (nome: string, args: any) => {
      const novoConvite = (terreiro: string | null, tipo: string) => {
        const codigo = Math.random().toString(36).slice(2, 14)
        banco.convites.push({
          id: crypto.randomUUID(), codigo, tipo, terreiro_id: terreiro, usos: 0, usos_max: tipo === 'membro' ? null : 1,
          expira_em: new Date(Date.now() + 86400000 * (tipo === 'membro' ? 30 : 7)).toISOString(), ativo: true,
          created_at: new Date().toISOString(),
        })
        return codigo
      }
      if (nome === 'info_convite') return { data: [], error: null }
      if (nome === 'criar_convite') return { data: novoConvite(args.p_terreiro, args.p_tipo), error: null }
      if (nome === 'criar_terreiro') {
        const id = crypto.randomUUID()
        banco.terreiros.push({ id, nome: args.p_nome, nacao: args.p_nacao })
        return { data: novoConvite(id, 'zelador'), error: null }
      }
      if (nome === 'desativar_convite') {
        const c = banco.convites.find((x) => x.id === args.p_convite)
        if (c) c.ativo = false
        return { data: null, error: null }
      }
      if (nome === 'entrar_no_terreiro') {
        Object.assign(banco.perfis.find((x) => x.id === EU)!, { terreiro_id: args.p_terreiro, papel: args.p_papel })
        return { data: null, error: null }
      }
      if (nome === 'excluir_minha_conta') {
        alert('Demonstração: a conta seria excluída agora. Nada foi apagado.')
        return { data: null, error: null }
      }
      if (['garantir_mensalidades', 'trocar_casa', 'definir_acesso_materiais'].includes(nome)) return { data: null, error: null }
      if (nome === 'pode_ver_materiais' || nome === 'pode_editar_materiais') return { data: true, error: null }
      if (nome === 'atualizar_membro') {
        const v = banco.membros.find((x) => x.perfil_id === args.p_usuario && x.terreiro_id === args.p_terreiro)
        if (v) Object.assign(v, { aprovado: args.p_aprovado, papel: args.p_papel, contador: args.p_contador, isento: args.p_isento, mensalidade_valor: args.p_mensalidade })
        return { data: null, error: null }
      }
      if (nome === 'remover_da_casa') {
        banco.membros = banco.membros.filter((x) => !(x.perfil_id === args.p_usuario && x.terreiro_id === args.p_terreiro))
        return { data: null, error: null }
      }
      if (['informar_pagamento', 'conferir_pagamento', 'criar_contribuicao', 'apagar_cobranca', 'configurar_financeiro', 'aceitar_convite'].includes(nome)) {
        alert('Demonstração: esta ação funciona no app de verdade. Aqui nada é salvo.')
        return { data: null, error: null }
      }
      const novo = rpcNovas(nome, args ?? {})
      if (novo) return novo
      const p = banco.perfis.find((x) => x.id === args.p_usuario)
      if (!p) return { data: null, error: null }
      if (nome === 'gerenciar_membro') Object.assign(p, { aprovado: args.p_aprovado, papel: args.p_papel })
      if (nome === 'remover_membro') banco.perfis = banco.perfis.filter((x) => x !== p)
      return { data: null, error: null }
    },
    auth: {
      getSession: async () => ({ data: { session: sessao } }),
      onAuthStateChange: (f: (e: string, s: any) => void) => {
        ouvintes.add(f)
        return { data: { subscription: { unsubscribe: () => ouvintes.delete(f) } } }
      },
      signInWithPassword: async ({ email }: { email: string }) => entrar(email),
      signUp: async ({ email }: { email: string }) => entrar(email),
      resetPasswordForEmail: async () => ({ error: null }),
      updateUser: async () => ({ error: null }),
      signOut: async () => {
        sessao = null
        avisar('SIGNED_OUT')
        return { error: null }
      },
    },
    functions: {
      invoke: async () => {
        await new Promise((r) => setTimeout(r, 900))
        return {
          data: {
            sugestoes: [
              { cientifico: 'Schinus terebinthifolia', familia: 'Anacardiaceae', nomes: ['aroeira', 'aroeira-vermelha'], confianca: 87, referencias: [] },
              { cientifico: 'Schinus molle', familia: 'Anacardiaceae', nomes: ['aroeira-salsa', 'pimenteira'], confianca: 6 },
              { cientifico: 'Lithraea molleoides', familia: 'Anacardiaceae', nomes: ['aroeira-branca'], confianca: 2 },
            ],
          },
          error: null,
        }
      },
    },
    storage: {
      from: () => ({
        upload: async (caminho: string, arquivo: Blob) => {
          fotos.set(caminho, URL.createObjectURL(arquivo))
          return { data: { path: caminho }, error: null }
        },
        list: async () => ({ data: [], error: null }),
        createSignedUrl: async (caminho: string) => ({ data: { signedUrl: fotos.get(caminho) ?? null } }),
        remove: async () => ({ error: null }),
      }),
    },
  }
}
