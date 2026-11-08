import Topo from '../components/Topo'
import { Link } from 'react-router-dom'

/** Mostrado ao administrador que ainda não escolheu o próprio terreiro. */
export default function SemCasa() {
  return (
    <div className="pagina">
      <Topo titulo="Falta escolher a sua casa" />
      <p>
        O mapa, as folhas e as obrigações são da rede de terreiros. Como administrador, você ainda não faz parte de
        nenhum terreiro, por isso esta parte está vazia.
      </p>
      <ol className="passos">
        <li>Em <strong>Administração</strong>, toque em <strong>+ Novo terreiro</strong> e crie a sua casa (e as outras).</li>
        <li>Ainda lá, em <strong>A minha casa</strong>, escolha o seu terreiro e o seu papel.</li>
        <li>Pronto: o mapa, as folhas e as obrigações passam a funcionar.</li>
      </ol>
      <Link to="/admin" className="primario bloco">Ir para a Administração</Link>
    </div>
  )
}
