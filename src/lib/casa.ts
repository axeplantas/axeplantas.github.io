import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { Irmao } from './tipos'

/** Filhos aprovados da casa (só o apelido e o papel). */
export function useIrmaos(terreiro: string | undefined): Irmao[] {
  const [irmaos, setIrmaos] = useState<Irmao[]>([])
  useEffect(() => {
    if (!terreiro) return
    supabase.rpc('apelidos_da_casa', { p_terreiro: terreiro }).then(({ data }) => setIrmaos((data ?? []) as Irmao[]))
  }, [terreiro])
  return irmaos
}

export function nomeDe(irmaos: Irmao[], id: string | null | undefined): string {
  return irmaos.find((i) => i.perfil_id === id)?.apelido ?? 'Alguém'
}

/** "2026-11-08" → "08/11" */
export function diaMes(data: string): string {
  const [, mes, dia] = data.slice(0, 10).split('-')
  return `${dia}/${mes}`
}

export function hojeIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Busca todas as linhas de uma consulta, de mil em mil (o servidor entrega no máximo mil por vez). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function buscarTudo<T>(montar: () => any): Promise<T[]> {
  const tudo: T[] = []
  for (let inicio = 0; ; inicio += 1000) {
    const { data, error } = await montar().range(inicio, inicio + 999)
    if (error || !data) break
    tudo.push(...(data as T[]))
    if (data.length < 1000) break
  }
  return tudo
}

/** Baixa uma tabela como planilha (CSV que abre no Excel e no Google Planilhas). */
export function baixarPlanilha(nome: string, linhas: (string | number | null | undefined)[][]) {
  const texto = linhas
    .map((l) => l.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';'))
    .join('\r\n')
  const url = URL.createObjectURL(new Blob(['\uFEFF' + texto], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${nome}.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const INVARIAVEIS = new Set(['kg', 'g', 'ml', 'l'])

/** "3" + "galho" → "3 galhos"; "1" + "maço" → "1 maço"; "2,5" + "kg" → "2,5 kg". */
export function comUnidade(quantidade: number, unidade: string | null | undefined): string {
  const n = quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
  if (!unidade) return n
  if (quantidade <= 1 || INVARIAVEIS.has(unidade.toLowerCase())) return `${n} ${unidade}`
  const plural = unidade.endsWith('ão') ? `${unidade.slice(0, -2)}ões` : /[aeiouáéíóúâêô]$/i.test(unidade) ? `${unidade}s` : `${unidade}es`
  return `${n} ${plural}`
}
