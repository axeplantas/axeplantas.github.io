/**
 * Perguntas dentro do próprio app (no lugar de confirm/prompt do navegador,
 * que no app instalado no iPhone às vezes nem aparecem).
 */

export interface PedidoDialogo {
  tipo: 'confirmar' | 'texto' | 'copiar'
  titulo: string
  texto?: string
  botao?: string
  perigo?: boolean
  /** texto: rótulo do campo; copiar: o conteúdo a copiar */
  campo?: string
  responder: (resposta: boolean | string | null) => void
}

function pedir(pedido: Omit<PedidoDialogo, 'responder'>): Promise<boolean | string | null> {
  return new Promise((responder) => {
    window.dispatchEvent(new CustomEvent<PedidoDialogo>('axe-dialogo', { detail: { ...pedido, responder } }))
  })
}

/** "Tem certeza?" — resolve true se a pessoa confirmar. */
export async function confirmar(titulo: string, opcoes: { texto?: string; botao?: string; perigo?: boolean } = {}): Promise<boolean> {
  return (await pedir({ tipo: 'confirmar', titulo, ...opcoes })) === true
}

/** Pede um texto curto (ex.: motivo de uma recusa). Resolve null se cancelar. */
export async function pedirTexto(titulo: string, opcoes: { texto?: string; botao?: string; campo?: string } = {}): Promise<string | null> {
  const r = await pedir({ tipo: 'texto', titulo, ...opcoes })
  return typeof r === 'string' && r.trim() ? r.trim() : null
}

/** Copia para a área de transferência; se o celular não deixar, mostra o texto pronto para copiar. */
export async function copiar(conteudo: string, titulo = 'Copie o texto abaixo'): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(conteudo)
    return true
  } catch {
    await pedir({ tipo: 'copiar', titulo, campo: conteudo, botao: 'Pronto' })
    return false
  }
}
