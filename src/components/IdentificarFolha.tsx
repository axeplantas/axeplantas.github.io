import { useState } from 'react'
import { prepararFoto } from '../lib/imagem'
import { useSessao } from '../lib/sessao'
import { mensagemDeErro, supabase } from '../lib/supabase'
import type { Folha } from '../lib/tipos'
import type { FotoPlanta } from './FotosDaPlanta'

export type FolhaResumo = Pick<Folha, 'id' | 'nome_popular' | 'nome_cientifico' | 'outros_nomes' | 'status'>

interface Sugestao {
  cientifico: string
  familia: string | null
  nomes: string[]
  confianca: number
  referencias?: string[]
}

/** "Schinus terebinthifolia Raddi" → "schinus terebinthifolia"; "Mentha × piperita" → "mentha piperita". */
function especie(nome: string | null): string {
  return (nome ?? '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((parte) => parte && parte !== 'x')
    .slice(0, 2)
    .join(' ')
}

/** "Erva-Cidreira " → "erva cidreira" (sem acento, sem hífen). */
function nomeSimples(nome: string): string {
  return nome.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z]+/g, ' ').trim()
}

/** Procura a folha do catálogo pelo nome científico ou, se não achar, pelo nome popular. */
function acharNoCatalogo(s: { cientifico: string; nomes: string[] }, folhas: FolhaResumo[]): FolhaResumo | undefined {
  const porCientifico = folhas.find((f) => especie(f.nome_cientifico) === especie(s.cientifico))
  if (porCientifico) return porCientifico
  const nomesSugeridos = new Set(s.nomes.map(nomeSimples))
  return folhas.find((f) =>
    [f.nome_popular, ...(f.outros_nomes ?? '').split(',')]
      .map(nomeSimples)
      .some((n) => n && nomesSugeridos.has(n)),
  )
}

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

/** Envia a foto ao Pl@ntNet (pela função do Supabase) e deixa escolher a sugestão certa. */
export default function IdentificarFolha({ fotos, folhas, aoEscolher }: {
  fotos: FotoPlanta[]
  folhas: FolhaResumo[]
  aoEscolher: (folha: FolhaResumo, nova: boolean) => void
}) {
  const { perfil } = useSessao()
  const [sugestoes, setSugestoes] = useState<Sugestao[] | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [salvando, setSalvando] = useState<string | null>(null)
  const [erro, setErro] = useState('')

  const noCatalogo = (s: Sugestao) => acharNoCatalogo(s, folhas)

  async function identificar() {
    setErro('')
    setBuscando(true)
    try {
      const corpo = new FormData()
      for (const f of fotos) {
        corpo.append('foto', await prepararFoto(f.arquivo, 1280), 'foto.jpg')
        corpo.append('orgao', f.orgao)
      }
      const { data, error } = await supabase.functions.invoke('identificar', { body: corpo })
      if (error) {
        const detalhe = await (error as { context?: Response }).context?.json?.().catch(() => null)
        throw new Error(detalhe?.erro ?? 'Não foi possível identificar agora. Tente de novo.')
      }
      setSugestoes((data?.sugestoes ?? []) as Sugestao[])
    } catch (err) {
      setErro(mensagemDeErro(err))
    } finally {
      setBuscando(false)
    }
  }

  async function escolher(s: Sugestao) {
    const existente = noCatalogo(s)
    if (existente) return aoEscolher(existente, false)
    if (!perfil) return
    setSalvando(s.cientifico)
    setErro('')
    const { data, error } = await supabase
      .from('folhas')
      .insert({
        nome_popular: capitalizar(s.nomes[0] ?? s.cientifico),
        outros_nomes: s.nomes.slice(1, 5).join(', ') || null,
        nome_cientifico: s.cientifico,
        terreiro_id: perfil.terreiro_id,
      })
      .select('id, nome_popular, nome_cientifico, outros_nomes, status')
      .single()
    setSalvando(null)
    if (error) return setErro(mensagemDeErro(error))
    aoEscolher(data as FolhaResumo, true)
  }

  if (!sugestoes) {
    return (
      <div className="identificar">
        {navigator.onLine ? (
          <button type="button" className="botao bloco" onClick={identificar} disabled={buscando}>
            {buscando ? 'Identificando…' : fotos.length > 1 ? `Identificar usando as ${fotos.length} fotos` : 'Identificar a planta pela foto'}
          </button>
        ) : (
          <p className="aviso-pequeno">Sem internet: a identificação pela foto fica para depois. Escolha a folha pelo nome abaixo.</p>
        )}
        {erro && <p className="erro">{erro}</p>}
      </div>
    )
  }

  return (
    <div className="identificar">
      {sugestoes.length === 0 ? (
        <p className="aviso">Não reconheci nenhuma planta. Tente uma foto mais de perto, de uma folha ou flor, com boa luz.</p>
      ) : (
        <>
          {sugestoes[0].confianca < 30 && (
            <p className="aviso-pequeno">
              O identificador ficou em dúvida. {fotos.length < 3
                ? 'Acrescente uma foto de outra parte (flor, fruto ou a planta inteira) e tente de novo: costuma resolver.'
                : 'Tente fotos mais de perto, com boa luz, uma parte da planta por foto.'}
            </p>
          )}
          <p className="sutil">
            Toque na planta certa. <strong>É só uma sugestão:</strong> confira antes, porque algumas plantas tóxicas são
            parecidas com outras.
          </p>
          <ul className="sugestoes">
            {sugestoes.map((s) => {
              const existente = noCatalogo(s)
              return (
                <li key={s.cientifico}>
                  <button type="button" className="sugestao" onClick={() => escolher(s)} disabled={salvando !== null}>
                    <span className="sugestao-nome">
                      <strong>{existente?.nome_popular ?? capitalizar(s.nomes[0] ?? s.cientifico)}</strong>
                      <em>{s.cientifico}</em>
                      <span className="sutil">
                        {existente ? 'Já está no catálogo' : 'Folha nova: será cadastrada'}
                        {s.confianca < 20 && ' · pouca certeza'}
                      </span>
                    </span>
                    <span className="sugestao-certeza">{salvando === s.cientifico ? '…' : `${s.confianca}%`}</span>
                  </button>
                  {s.referencias && s.referencias.length > 0 && (
                    <div className="referencias" aria-label="Fotos de referência desta espécie">
                      {s.referencias.map((url) => <img key={url} src={url} alt="" loading="lazy" />)}
                      <span className="sutil">Compare com a sua planta</span>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
      {erro && <p className="erro">{erro}</p>}
      <button type="button" className="link" onClick={() => setSugestoes(null)}>Tentar de novo</button>
    </div>
  )
}
