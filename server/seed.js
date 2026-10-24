import { db, nowIso, logActivity } from './db.js'

const COLORS = ['#E4572E', '#D98E04', '#2F8F5B', '#3B6EA5', '#8B5CF6', '#C2412D', '#0E7490', '#A16207']

function isoLocal(date) {
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10)
}

export function dayOffset(days) {
  const date = new Date()
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() + days)
  return isoLocal(date)
}

const MEMBERS = [
  { name: 'Ana Torres', role: 'Coordinación general', area: 'Coordinación', phone: '987 654 321', lead: 1 },
  { name: 'Luis Ramírez', role: 'Cronograma y reuniones', area: 'Coordinación', phone: '912 345 678' },
  { name: 'Carla Mendoza', role: 'Tesorería y aportes', area: 'Finanzas', phone: '998 112 233' },
  { name: 'Jorge Salazar', role: 'Compras: mercado', area: 'Compras', phone: '955 887 744' },
  { name: 'Milagros Rojas', role: 'Compras: abarrotes', area: 'Compras', phone: '933 221 110' },
  { name: 'Diego Huamán', role: 'Cocina: salados', area: 'Cocina', phone: '944 556 677' },
  { name: 'Rosa Quispe', role: 'Cocina: dulces', area: 'Cocina', phone: '966 778 899' },
  { name: 'Kevin Flores', role: 'Cocina: bebidas', area: 'Cocina', phone: '977 334 455' },
  { name: 'Patricia León', role: 'Logística: traslado', area: 'Logística', phone: '988 990 011' },
  { name: 'Marco Vargas', role: 'Logística: menaje y mesas', area: 'Logística', phone: '911 223 344' },
  { name: 'Sandra Castro', role: 'Ambientación y decoración', area: 'Ambientación', phone: '922 445 566' },
  { name: 'Renzo Aguilar', role: 'Sonido y música', area: 'Ambientación', phone: '933 667 788' },
  { name: 'Yuli Chávez', role: 'Servicio: atención de mesas', area: 'Servicio', phone: '944 889 900' },
  { name: 'Andrés Paredes', role: 'Limpieza y residuos', area: 'Servicio', phone: '955 001 122' },
  { name: 'Fiorella Núñez', role: 'Comunicación e invitaciones', area: 'Comunicación', phone: '966 223 344' },
  { name: 'Bruno Cárdenas', role: 'Fotos y recuerdos', area: 'Comunicación', phone: '977 445 566' },
]

const TASKS = [
  {
    title: 'Definir el menú final y las cantidades',
    detail: 'Cerrar el menú aprobado en el acuerdo: pan con chicharrón, tamal, chocolate caliente, jugo de naranja y fruta. Calcular porciones para 80 personas con margen de 10 %.',
    area: 'Cocina', priority: 'alta', status: 'en_curso', dueIn: 2, members: [6, 7, 8],
    checklist: [
      { t: 'Proponer 3 opciones de menú', done: 1 },
      { t: 'Calcular porciones para 80 personas', done: 1 },
      { t: 'Validar el menú con todo el equipo', done: 0 },
      { t: 'Cerrar el menú definitivo y publicarlo', done: 0 },
    ],
  },
  {
    title: 'Cotizar y comprar abarrotes e insumos secos',
    detail: 'Harina, azúcar, chocolate, café, pan, aceite, condimentos y descartables. Comparar dos proveedores antes de cerrar la compra.',
    area: 'Compras', priority: 'alta', status: 'pendiente', dueIn: 8, members: [5],
    checklist: [
      { t: 'Armar la lista de abarrotes', done: 1 },
      { t: 'Comparar 2 proveedores', done: 0 },
      { t: 'Reservar la compra', done: 0 },
      { t: 'Recibir y verificar cantidades', done: 0 },
    ],
  },
  {
    title: 'Compra de mercado: frutas, verduras y carnes',
    detail: 'Compra mayorista el sábado 14/11 a las 6:00 a.m. Llevar la lista impresa, balanza y bolsas reutilizables.',
    area: 'Compras', priority: 'alta', status: 'pendiente', dueIn: 14, members: [4, 9],
    checklist: [
      { t: 'Lista de mercado con cantidades', done: 0 },
      { t: 'Coordinar movilidad para el traslado', done: 0 },
      { t: 'Compra, pesaje y verificación', done: 0 },
    ],
  },
  {
    title: 'Recaudar los aportes de los 16 integrantes',
    detail: 'Aporte acordado: S/ 100 por persona. Registrar cada aporte en la caja y avisar en el grupo cuando esté completo.',
    area: 'Finanzas', priority: 'alta', status: 'en_curso', dueIn: 9, members: [3],
    checklist: [
      { t: 'Enviar recordatorio en el grupo', done: 1 },
      { t: 'Registrar los aportes recibidos', done: 1 },
      { t: 'Cerrar la caja de aportes', done: 0 },
    ],
  },
  {
    title: 'Reservar y confirmar el local',
    detail: 'Salón comunal reservado para el sábado 21/11, de 7:00 a.m. a 1:00 p.m. Incluye mesas y sillas.',
    area: 'Logística', priority: 'alta', status: 'hecha', dueIn: -2, members: [1],
    checklist: [
      { t: 'Visitar el local', done: 1 },
      { t: 'Firmar la reserva', done: 1 },
      { t: 'Confirmar el pago del adelanto', done: 1 },
    ],
  },
  {
    title: 'Armar el cronograma del día del desayuno',
    detail: 'Hora por hora: montaje, llegada de invitados, servicio, palabras de bienvenida, cierre y limpieza.',
    area: 'Coordinación', priority: 'media', status: 'en_curso', dueIn: 5, members: [2, 1],
    checklist: [
      { t: 'Definir bloques horarios', done: 1 },
      { t: 'Asignar responsables por bloque', done: 0 },
      { t: 'Compartir el cronograma con el equipo', done: 0 },
    ],
  },
  {
    title: 'Diseñar y enviar las invitaciones',
    detail: 'Formato digital con fecha, hora y lugar. Enviar por el grupo y por correo a los jefes de área.',
    area: 'Comunicación', priority: 'media', status: 'pendiente', dueIn: 6, members: [15],
    checklist: [
      { t: 'Diseñar la invitación', done: 0 },
      { t: 'Validar datos de fecha y lugar', done: 0 },
      { t: 'Enviar a los invitados', done: 0 },
    ],
  },
  {
    title: 'Confirmar la asistencia de 80 personas',
    detail: 'Llevar una lista de confirmados para ajustar porciones y distribución de mesas.',
    area: 'Comunicación', priority: 'alta', status: 'pendiente', dueIn: 12, members: [15, 1],
    checklist: [
      { t: 'Crear la lista de confirmados', done: 0 },
      { t: 'Enviar recordatorio a 10 días', done: 0 },
      { t: 'Cerrar el número final de invitados', done: 0 },
    ],
  },
  {
    title: 'Menaje: vajilla, mesas y manteles',
    detail: '10 mesas para 8 personas. Contar platos, tazas, cubiertos y servilletas con 10 % de reserva.',
    area: 'Logística', priority: 'media', status: 'pendiente', dueIn: 10, members: [10],
    checklist: [
      { t: 'Inventariar lo que ya tenemos', done: 0 },
      { t: 'Pedir prestado o comprar lo faltante', done: 0 },
      { t: 'Empacar menaje por cajas rotuladas', done: 0 },
    ],
  },
  {
    title: 'Decoración temática y cartel de bienvenida',
    detail: 'Paleta cálida, guirnaldas y cartel con el nombre del equipo. Presupuesto máximo S/ 150.',
    area: 'Ambientación', priority: 'baja', status: 'pendiente', dueIn: 15, members: [11],
    checklist: [
      { t: 'Definir la idea de decoración', done: 0 },
      { t: 'Comprar materiales', done: 0 },
      { t: 'Armar el cartel de bienvenida', done: 0 },
    ],
  },
  {
    title: 'Sonido, música y micrófono',
    detail: 'Pendiente confirmar si el local tiene equipo de sonido. Si no, coordinar el alquiler.',
    area: 'Ambientación', priority: 'media', status: 'bloqueada', dueIn: 16, members: [12],
    checklist: [
      { t: 'Consultar al local por el equipo', done: 0 },
      { t: 'Armar la lista de canciones', done: 0 },
      { t: 'Probar el sonido el día previo', done: 0 },
    ],
  },
  {
    title: 'Plan de limpieza y manejo de residuos',
    detail: 'Tachos rotulados, bolsas por tipo de residuo y turno de limpieza al cierre.',
    area: 'Servicio', priority: 'media', status: 'pendiente', dueIn: 18, members: [14],
    checklist: [
      { t: 'Definir turnos de limpieza', done: 0 },
      { t: 'Comprar bolsas y tachos', done: 0 },
      { t: 'Coordinar la entrega del local limpio', done: 0 },
    ],
  },
  {
    title: 'Ensayo de montaje y tiempos de servicio',
    detail: 'Simular el montaje completo y el servicio de 80 platos para detectar cuellos de botella.',
    area: 'Coordinación', priority: 'media', status: 'pendiente', dueIn: 21, members: [2, 13],
    checklist: [
      { t: 'Fijar fecha del ensayo', done: 0 },
      { t: 'Cronometrar el montaje', done: 0 },
      { t: 'Ajustar el cronograma', done: 0 },
    ],
  },
  {
    title: 'Protocolo de bienvenida y palabras de cierre',
    detail: 'Quién presenta, cuánto dura y qué se agradece. Máximo 5 minutos.',
    area: 'Coordinación', priority: 'baja', status: 'pendiente', dueIn: 20, members: [1, 2],
    checklist: [
      { t: 'Elegir al presentador', done: 0 },
      { t: 'Escribir las palabras de bienvenida', done: 0 },
      { t: 'Ensayar el discurso', done: 0 },
    ],
  },
  {
    title: 'Fotos, video y agradecimientos',
    detail: 'Foto grupal antes del servicio, video corto para el recuerdo y mensaje de agradecimiento al cierre.',
    area: 'Comunicación', priority: 'baja', status: 'pendiente', dueIn: 28, members: [16],
    checklist: [
      { t: 'Definir los momentos a fotografiar', done: 0 },
      { t: 'Tomar la foto grupal', done: 0 },
      { t: 'Compartir el material con el equipo', done: 0 },
    ],
  },
]

const AGREEMENTS = [
  { title: 'Aporte de S/ 100 por integrante', detail: 'Los 16 integrantes aportan S/ 100 hasta el 05/11. Se registra cada depósito en la caja del equipo.', status: 'acordado', owner: 3, dueIn: 13 },
  { title: 'Menú cerrado del desayuno', detail: 'Pan con chicharrón, tamal, chocolate caliente, jugo de naranja y fruta de estación.', status: 'acordado', owner: 6, dueIn: 2 },
  { title: 'Presupuesto máximo de S/ 2,000', detail: 'Ningún gasto por encima del presupuesto sin aprobación del equipo.', status: 'acordado', owner: 3, dueIn: 30 },
  { title: 'Compra mayorista el sábado 14/11', detail: 'Punto de encuentro 6:00 a.m. en el mercado mayorista. Llevar la lista impresa.', status: 'acordado', owner: 4, dueIn: 22 },
  { title: 'Sin bebidas alcohólicas', detail: 'El desayuno es un espacio familiar y de trabajo: solo jugos, café, infusiones y chocolate.', status: 'acordado', owner: 1, dueIn: 29 },
  { title: 'Cada área entrega su lista de compras hasta el 31/10', detail: 'Listas con cantidades para 80 personas, no para 16.', status: 'propuesto', owner: 1, dueIn: 8 },
  { title: 'Reunión de coordinación los domingos 8:00 p.m.', detail: 'Videollamada de 30 minutos. Si no puedes asistir, envías tu avance por escrito.', status: 'acordado', owner: 2, dueIn: 3 },
  { title: 'Tolerancia de llegada de 15 minutos', detail: 'Quien llega tarde apoya en la limpieza final. Aplica para el día del desayuno.', status: 'propuesto', owner: 13, dueIn: 27 },
  { title: 'Usar vajilla reutilizable y descartables biodegradables', detail: 'Reducir residuos: platos de loza del local y vasos biodegradables.', status: 'cumplido', owner: 14, dueIn: -1 },
]

const BUDGET = [
  { kind: 'ingreso', concept: 'Aportes recibidos (10 integrantes)', amount: 1000, status: 'hecho', owner: 3, dueIn: -3, note: 'Depósitos verificados en la caja' },
  { kind: 'ingreso', concept: 'Aportes pendientes (6 integrantes)', amount: 600, status: 'pendiente', owner: 3, dueIn: 13, note: 'Recordatorio enviado en el grupo' },
  { kind: 'ingreso', concept: 'Apoyo de la empresa', amount: 500, status: 'pendiente', owner: 1, dueIn: 10, note: 'Solicitud enviada a Recursos Humanos' },
  { kind: 'ingreso', concept: 'Rifa interna del equipo', amount: 200, status: 'pendiente', owner: 15, dueIn: 20, note: 'Sorteo el 15/11' },
  { kind: 'gasto', concept: 'Insumos del desayuno (pan, carne, tamales, fruta)', amount: 780, status: 'pendiente', owner: 4, dueIn: 14, note: '' },
  { kind: 'gasto', concept: 'Bebidas: café, chocolate, jugo de naranja', amount: 180, status: 'pendiente', owner: 8, dueIn: 14, note: '' },
  { kind: 'gasto', concept: 'Menaje y descartables biodegradables', amount: 120, status: 'hecho', owner: 10, dueIn: -1, note: 'Comprado en el mercado central' },
  { kind: 'gasto', concept: 'Decoración y cartel de bienvenida', amount: 150, status: 'pendiente', owner: 11, dueIn: 15, note: '' },
  { kind: 'gasto', concept: 'Alquiler de sonido y micrófono', amount: 100, status: 'pendiente', owner: 12, dueIn: 16, note: 'Confirmar si el local lo incluye' },
  { kind: 'gasto', concept: 'Transporte de menaje e insumos', amount: 120, status: 'pendiente', owner: 9, dueIn: 14, note: '' },
  { kind: 'gasto', concept: 'Imprevistos', amount: 100, status: 'pendiente', owner: 3, dueIn: 29, note: 'Reserva del 6 %' },
  { kind: 'gasto', concept: 'Agradecimientos al local y al equipo', amount: 50, status: 'pendiente', owner: 16, dueIn: 29, note: '' },
]

const DEMO_LOG = [
  {
    minutesAgo: 25,
    actor: 6,
    detail: 'Completó el paso “Calcular porciones para 80 personas” de “Definir el menú final y las cantidades”',
    entity: 'task',
    entityId: 1,
    action: 'checklist',
  },
  {
    minutesAgo: 95,
    actor: 3,
    detail: 'Registró los aportes de 10 integrantes en la caja del equipo',
    entity: 'budget',
    entityId: 1,
    action: 'update',
  },
  {
    minutesAgo: 190,
    actor: 2,
    detail: 'Actualizó la actividad “Armar el cronograma del día del desayuno”',
    entity: 'task',
    entityId: 6,
    action: 'update',
  },
  {
    minutesAgo: 1440,
    actor: 4,
    detail: 'Marcó el acuerdo “Compra mayorista el sábado 14/11” como acordado',
    entity: 'agreement',
    entityId: 4,
    action: 'status',
  },
  {
    minutesAgo: 2880,
    actor: 1,
    detail: 'Creó la actividad “Reservar y confirmar el local”',
    entity: 'task',
    entityId: 5,
    action: 'create',
  },
]


function clearAll() {
  db.exec(`
    DELETE FROM task_assignees;
    DELETE FROM checklist_items;
    DELETE FROM tasks;
    DELETE FROM agreements;
    DELETE FROM budget_items;
    DELETE FROM activity_log;
    DELETE FROM members;
    DELETE FROM settings;
    DELETE FROM sqlite_sequence;
  `)
}

export function seedDemo({ force = false } = {}) {
  const count = db.prepare('SELECT COUNT(*) AS n FROM members').get().n
  if (count > 0 && !force) return false

  db.exec('BEGIN')
  try {
    if (force) clearAll()

    const eventDate = dayOffset(29)
    db.prepare(
      `INSERT OR REPLACE INTO settings (id, event_name, event_date, event_time, location, guests, team_size, note, updated_at)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'Al Fin Desayuno',
      eventDate,
      '08:30',
      'Salón comunal del edificio A',
      80,
      16,
      'Desayuno de integración para 80 invitados. Montaje 7:00 a.m., servicio 8:30 a.m.',
      nowIso(),
    )

    const memberIds = []
    const insertMember = db.prepare(
      `INSERT INTO members (name, role, area, phone, email, color, is_lead, position, created_at)
       VALUES (?, ?, ?, ?, '', ?, ?, ?, ?)`,
    )
    MEMBERS.forEach((member, index) => {
      const result = insertMember.run(
        member.name,
        member.role,
        member.area,
        member.phone,
        COLORS[index % COLORS.length],
        member.lead || 0,
        index,
        nowIso(),
      )
      memberIds.push(Number(result.lastInsertRowid))
    })

    const insertTask = db.prepare(
      `INSERT INTO tasks (title, detail, area, status, priority, due_date, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    const insertAssignee = db.prepare('INSERT INTO task_assignees (task_id, member_id) VALUES (?, ?)')
    const insertCheck = db.prepare(
      `INSERT INTO checklist_items (task_id, title, done, position, done_by, done_at) VALUES (?, ?, ?, ?, ?, ?)`,
    )

    TASKS.forEach((task, index) => {
      const result = insertTask.run(
        task.title,
        task.detail,
        task.area,
        task.status,
        task.priority,
        dayOffset(task.dueIn),
        index,
        nowIso(),
        nowIso(),
      )
      const taskId = Number(result.lastInsertRowid)
      task.members.forEach((position) => insertAssignee.run(taskId, memberIds[position - 1]))
      task.checklist.forEach((item, itemIndex) => {
        insertCheck.run(
          taskId,
          item.t,
          item.done,
          itemIndex,
          item.done ? memberIds[0] : null,
          item.done ? nowIso() : null,
        )
      })
    })

    const insertAgreement = db.prepare(
      `INSERT INTO agreements (title, detail, status, owner_id, due_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    AGREEMENTS.forEach((agreement) => {
      insertAgreement.run(
        agreement.title,
        agreement.detail,
        agreement.status,
        memberIds[agreement.owner - 1],
        dayOffset(agreement.dueIn),
        nowIso(),
        nowIso(),
      )
    })

    const insertBudget = db.prepare(
      `INSERT INTO budget_items (kind, concept, amount, status, owner_id, due_date, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    BUDGET.forEach((item) => {
      insertBudget.run(
        item.kind,
        item.concept,
        item.amount,
        item.status,
        memberIds[item.owner - 1],
        dayOffset(item.dueIn),
        item.note,
        nowIso(),
      )
    })

    logActivity({ actorName: 'Sistema', entity: 'app', action: 'seed', detail: 'Se cargaron los datos de ejemplo del desayuno' })

    const insertLog = db.prepare(
      `INSERT INTO activity_log (actor_id, actor_name, entity, entity_id, action, detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const entry of [...DEMO_LOG].sort((a, b) => b.minutesAgo - a.minutesAgo)) {
      insertLog.run(
        memberIds[entry.actor - 1],
        MEMBERS[entry.actor - 1].name,
        entry.entity,
        entry.entityId,
        entry.action,
        entry.detail,
        new Date(Date.now() - entry.minutesAgo * 60000).toISOString(),
      )
    }

    db.exec('COMMIT')
    return true
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

const isCli = process.argv[1] && process.argv[1].endsWith('seed.js')
if (isCli) {
  const force = process.argv.includes('--reset')
  const created = seedDemo({ force })
  console.log(created ? 'Datos de ejemplo cargados.' : 'Ya existen datos; usa --reset para reiniciar.')
}
