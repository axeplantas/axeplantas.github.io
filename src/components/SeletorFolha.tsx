import { Leaf } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { semAcento } from '../lib/texto'
import type { Folha } from '../lib/tipos'

type Opcao = Pick<Folha, 'id' | 'nome_popular' | 'status'> & Partial<Pick<Folha, 'nome_cientifico' | 'outros_nomes'>>

/** Escolher uma folha digitando parte do nome (popular, outros nomes ou científico). */
export default function SeletorFolha({ folhas, valor, aoMudar, linkNova = true }: {
  folhas: Opcao[]
  valor: string
  aoMudar: (id: string) => void
  linkNova?: boolean
}) {
  const [busca, setBusca] = useState('')
  const escolhida = folhas.find((f) => f.id === valor)

  const resultado = useMemo(() => {
    const termo = semAcento(busca.trim())
    if (!termo) return []
    return folhas
      .filter((f) => semAcento([f.nome_popular, f.outros_nomes, f.nome_cientifico].filter(Boolean).join(' ')).includes(termo))
      .slice(0, 8)
  }, [busca, folhas])

  if (escolhida) {
    return (
      <div className="folha-escolhida">
        <span>
          <Leaf size={18} aria-hidden /> <strong>{escolhida.nome_popular}</strong>
          {escolhida.status === 'pendente' && <span className="sutil"> (em validação)</span>}
        </span>
        <button type="button" className="link" onClick={() => { aoMudar(''); setBusca('') }}>Trocar</button>
      </div>
    )
  }

  return (
    <div className="seletor-folha">
      <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)}
        placeholder="Digite o nome da folha (ex.: arruda)" aria-label="Buscar folha" autoComplete="off" />
      {busca.trim() && (
        <ul className="seletor-opcoes">
          {resultado.map((f) => (
            <li key={f.id}>
              <button type="button" onClick={() => { aoMudar(f.id); setBusca('') }}>
                <strong>{f.nome_popular}</strong>
                {f.nome_cientifico && <em> · {f.nome_cientifico}</em>}
                {f.status === 'pendente' && <span className="sutil"> (em validação)</span>}
              </button>
            </li>
          ))}
          {resultado.length === 0 && <li className="sutil seletor-vazio">Nenhuma folha com esse nome.</li>}
        </ul>
      )}
      {linkNova && (
        <Link to="/folhas/nova" className="link">Não achou? Cadastrar uma folha nova</Link>
      )}
    </div>
  )
}
