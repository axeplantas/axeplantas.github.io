export type Tema = 'auto' | 'claro' | 'escuro'

const CHAVE = 'axe-plantas:tema'

export function temaEscolhido(): Tema {
  try {
    const t = localStorage.getItem(CHAVE)
    return t === 'claro' || t === 'escuro' ? t : 'auto'
  } catch {
    return 'auto'
  }
}

/** Aplica o tema escolhido (ou deixa o celular decidir, no "auto"). */
export function aplicarTema(tema: Tema = temaEscolhido()) {
  const raiz = document.documentElement
  if (tema === 'auto') delete raiz.dataset.tema
  else raiz.dataset.tema = tema
  try {
    if (tema === 'auto') localStorage.removeItem(CHAVE)
    else localStorage.setItem(CHAVE, tema)
  } catch {
    // Sem armazenamento: vale só até fechar o app.
  }
}
