import { Camera } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ROTULO_ORGAO, type Orgao } from '../lib/tipos'

export interface FotoPlanta {
  id: string
  arquivo: File
  orgao: Orgao
}

const MAXIMO = 3

/** Até 3 fotos da mesma planta, cada uma dizendo qual parte aparece (folha, flor...). */
export default function FotosDaPlanta({ fotos, aoMudar }: { fotos: FotoPlanta[]; aoMudar: (f: FotoPlanta[]) => void }) {
  const [previas, setPrevias] = useState<Record<string, string>>({})

  useEffect(() => {
    const urls = Object.fromEntries(fotos.map((f) => [f.id, URL.createObjectURL(f.arquivo)]))
    setPrevias(urls)
    return () => Object.values(urls).forEach((u) => URL.revokeObjectURL(u))
  }, [fotos])

  function adicionar(arquivo: File | undefined) {
    if (!arquivo) return
    const usados = new Set(fotos.map((f) => f.orgao))
    const orgao = (['leaf', 'flower', 'fruit', 'habit', 'bark'] as Orgao[]).find((o) => !usados.has(o)) ?? 'leaf'
    aoMudar([...fotos, { id: crypto.randomUUID(), arquivo, orgao }])
  }

  return (
    <div className="fotos-planta">
      {fotos.map((f, i) => (
        <div key={f.id} className="foto-planta">
          {previas[f.id] && <img src={previas[f.id]} alt={`Foto ${i + 1}`} />}
          <div className="foto-planta-info">
            <span className="sutil">Foto {i + 1}: o que aparece?</span>
            <div className="chips">
              {(Object.keys(ROTULO_ORGAO) as Orgao[]).map((o) => (
                <button key={o} type="button" className={`chip ${f.orgao === o ? 'ativo' : ''}`}
                  onClick={() => aoMudar(fotos.map((x) => (x.id === f.id ? { ...x, orgao: o } : x)))}>
                  {ROTULO_ORGAO[o]}
                </button>
              ))}
            </div>
            <button type="button" className="link perigo" onClick={() => aoMudar(fotos.filter((x) => x.id !== f.id))}>
              Tirar esta foto
            </button>
          </div>
        </div>
      ))}

      {fotos.length < MAXIMO && (
        <label className="botao-foto">
          <Camera size={20} aria-hidden />{fotos.length === 0 ? ' Tirar ou escolher foto' : ' Adicionar outra foto (flor, fruto, planta inteira…)'}
          <input type="file" accept="image/*" capture="environment" hidden
            onChange={(e) => { adicionar(e.target.files?.[0]); e.target.value = '' }} />
        </label>
      )}
      {fotos.length === 0 && (
        <p className="sutil">
          Para o identificador acertar: <strong>uma parte da planta por foto</strong>, bem de perto, ocupando a tela e
          em foco. Uma folha sobre a palma da mão ou um fundo liso ajuda muito. Evite várias plantas misturadas.
        </p>
      )}
      {fotos.length === 1 && (
        <p className="sutil">Dica: uma segunda foto, de outra parte da planta, deixa a identificação bem mais certeira.</p>
      )}
    </div>
  )
}
