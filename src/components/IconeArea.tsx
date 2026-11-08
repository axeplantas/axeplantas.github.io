import { Brush, CalendarDays, ClipboardList, Map as IconeMapa, Package, Settings2, Smartphone, Stethoscope, Users, Wallet, type LucideIcon } from 'lucide-react'
import type { Area } from '../lib/registros'

const ICONE: Record<Area, LucideIcon> = {
  acesso: Smartphone,
  fichas: Stethoscope,
  financeiro: Wallet,
  funcoes: ClipboardList,
  escalas: Brush,
  calendario: CalendarDays,
  mapa: IconeMapa,
  materiais: Package,
  filhos: Users,
  config: Settings2,
}

/** Ícone do assunto de um registro de atividade. */
export default function IconeArea({ area }: { area: Area }) {
  const Icone = ICONE[area]
  return <Icone size={16} className="cor-sutil" aria-hidden />
}
