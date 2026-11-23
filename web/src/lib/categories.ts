import type { IconName } from '../components/ui'
import type { EventCategory, EventType } from '../types'

/** Tipos de evento: cada uno propone una hora y un ejemplo de nombre. */
export const EVENT_KINDS: Record<EventType, { label: string; time: string; example: string }> = {
  desayuno: { label: 'Desayuno', time: '09:00', example: 'Ej. Al Fin Desayuno' },
  almuerzo: { label: 'Almuerzo', time: '13:00', example: 'Ej. Almuerzo de fin de año' },
  cena: { label: 'Cena', time: '20:00', example: 'Ej. Cena de aniversario' },
  cumpleanos: { label: 'Cumpleaños', time: '16:00', example: 'Ej. Cumpleaños de la abuela' },
  paseo: { label: 'Paseo', time: '08:00', example: 'Ej. Paseo a Lunahuaná' },
  fiesta: { label: 'Fiesta', time: '21:00', example: 'Ej. Fiesta de promoción' },
  partido: { label: 'Partido', time: '10:00', example: 'Ej. Pichanga del sábado' },
  secreto: { label: 'Amigo secreto', time: '19:00', example: 'Ej. Amigo secreto de Navidad' },
  mes: { label: 'Gastos del mes', time: '', example: 'Ej. Mis gastos de diciembre' },
  viaje: { label: 'Viaje', time: '', example: 'Ej. Viaje a Cusco' },
  ahorro: { label: 'Meta de ahorro', time: '', example: 'Ej. Ahorro para la laptop' },
}

/** Para qué se usa Juntay: cambia el texto de la portada y los tipos que se ofrecen al crear. */
export const CATEGORIES: Record<
  EventCategory,
  { label: string; icon: IconName; title: string; sub: string; points: { icon: IconName; text: string }[]; types: EventType[] }
> = {
  trabajo: {
    label: 'Trabajo',
    icon: 'clipboard',
    title: 'Arma tu evento en equipo',
    sub: 'Actividades con responsables, acuerdos, cuotas con su constancia y gastos con boleta. Todo en una pizarra que el equipo ve en vivo.',
    points: [
      { icon: 'tasks', text: 'Cada quien ve qué le toca y lo marca desde el celular' },
      { icon: 'wallet', text: 'Cuotas por Yape o Plin con foto, validadas por el equipo' },
      { icon: 'users', text: 'Un evento por equipo, cada uno con su código' },
    ],
    types: ['desayuno', 'almuerzo', 'cena', 'secreto'],
  },
  familiar: {
    label: 'Familiar',
    icon: 'heart',
    title: 'Organiza la reunión familiar',
    sub: 'Quién lleva qué, cuánto pone cada uno y qué falta. Toda la familia lo ve en el celular, sin perderse en el chat.',
    points: [
      { icon: 'tasks', text: 'Cada quien sabe qué llevar y lo marca cuando lo tiene' },
      { icon: 'wallet', text: 'La vaca con Yape o Plin, con la foto de cada aporte' },
      { icon: 'gift', text: 'Amigo secreto con papelito privado y lista de deseos' },
    ],
    types: ['cumpleanos', 'almuerzo', 'cena', 'secreto'],
  },
  entretenimiento: {
    label: 'Entretenimiento',
    icon: 'sparkles',
    title: 'Arma el plan con tus amigos',
    sub: 'El paseo, la fiesta o el partido: qué toca a cada uno, la vaca y los acuerdos, en una pizarra que todos ven en vivo.',
    points: [
      { icon: 'calendar', text: 'Fecha, hora y lugar claros para todos' },
      { icon: 'wallet', text: 'La vaca por Yape o Plin, con constancia' },
      { icon: 'handshake', text: 'Acuerdos a la vista, sin buscar en el chat' },
    ],
    types: ['paseo', 'fiesta', 'partido', 'secreto'],
  },
  finanzas: {
    label: 'Finanzas personales',
    icon: 'wallet',
    title: 'Ordena tus finanzas personales',
    sub: 'Toma foto a tus boletas y comprobantes de Yape o Plin: Juntay lee el monto y lo anota. Ve en qué se va tu plata y cuánto te queda.',
    points: [
      { icon: 'camera', text: 'Escanea boletas y comprobantes, el monto se lee solo' },
      { icon: 'chart', text: 'Lo que planeaste frente a lo que de verdad gastaste' },
      { icon: 'lock', text: 'Solo tú lo ves, salvo que compartas el código' },
    ],
    types: ['mes', 'viaje', 'ahorro'],
  },
}

/** Las finanzas personales son de una persona: sin hora, lugar ni invitados, y abren en Presupuesto. */
export const isPersonal = (category: EventCategory) => category === 'finanzas'

export const CATEGORY_IDS = Object.keys(CATEGORIES) as EventCategory[]

const KEY = 'juntay.categoria'

/** La categoría elegida en la portada; se recuerda en este dispositivo. */
export function readCategory(): EventCategory {
  try {
    const value = localStorage.getItem(KEY)
    return CATEGORY_IDS.includes(value as EventCategory) ? (value as EventCategory) : 'trabajo'
  } catch {
    return 'trabajo'
  }
}

export function saveCategory(category: EventCategory) {
  try {
    localStorage.setItem(KEY, category)
  } catch {
    /* sin almacenamiento: se elige de nuevo la próxima vez */
  }
}
