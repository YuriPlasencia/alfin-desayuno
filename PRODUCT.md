# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Equipos de trabajo de una empresa que organizan eventos internos (desayunos, aniversarios, paseos). El primero fue Al Fin Desayuno: ~16 personas para 80 invitados. Lo usan sobre todo desde el celular, en ratos cortos entre otras tareas: entrar, ver qué les toca, marcar un paso, ver cómo va el equipo y salir. Una o dos personas coordinan y miran el panorama completo desde la computadora.

## Product Purpose
Juntay (antes Juntada y "Al Fin Desayuno"): que cada equipo llegue al día de su evento con todo resuelto: acuerdos tomados, actividades repartidas con checklist, responsables claros y la caja cuadrada. El éxito es que nadie tenga que preguntar "¿qué falta?" por chat: la app lo responde, y que la gente vuelva a abrirla por gusto porque ver el avance del equipo motiva.

## Positioning
No es un gestor de proyectos genérico: cada evento es su propio tablero, con cuenta regresiva, hecho para un equipo pequeño que se conoce. Cada cambio queda firmado con el nombre de quien lo hizo y se ve en vivo en los celulares de todos.

## Operating Context
- Varios eventos (confirmado 27-oct-2026): cada uno con su base, su código y su equipo; la persona ve "Tus eventos" y entra a cada pizarra.
- Ingreso con Google + código del evento (confirmado); sin Google configurado, con el nombre.
- Celular primero (confirmado); PWA instalable en Android, funciona con mala señal mostrando lo último guardado.
- La cuenta se liga a un imán del evento la primera vez ("¿Quién eres?"); ese nombre firma sus cambios.
- Reuniones del equipo por videollamada; coordinación diaria por chat.

## Capabilities and Constraints
- Módulos: Inicio, Actividades (por área, prioridad, fecha, responsables, checklist), Acuerdos (propuesto → acordado → cumplido), Equipo, Presupuesto (ingresos/gastos, cobrado/pagado, en soles PEN), Ajustes (datos del evento, respaldo JSON, reinicio demo).
- Amigo secreto (22-nov-2026): una actividad más de cada evento. Reglas (monto, fecha y lugar de entrega, endulzadas), cada quien se apunta y deja su lista de deseos, sorteo en una sola ronda con excepciones, papelito privado, mensajes anónimos en ambos sentidos, apuesta de quién te regala y revelación el día de la entrega. Las parejas no viajan en /bootstrap ni en el respaldo, y ni quien organiza las ve antes de revelar.
- Sincronización en vivo por SSE; registro de actividad con autor.
- Stack existente: React 19 + Vite + vite-plugin-pwa; API Express + SQLite (node:sqlite).
- Idioma: español (Perú).
- Pendiente (no decidido): cuentas/PIN, notificaciones push, comentarios y adjuntos, plan de mesas, despliegue en la nube.

## Brand Commitments
- Nombre: "Juntay" (decidido 22-nov-2026; antes "Juntada", que se pensó para Argentina y Uruguay y cuyo dominio .app es de otra app). Se pronuncia jun-TAY: «juntar» con el sufijo quechua -y de invitación; en quechua *hunt'ay* es completar, cumplir. Mercado: Perú, Colombia, Ecuador, Bolivia, Chile y Venezuela. "Al Fin Desayuno" es un evento dentro de la app. Tono profesional pero cálido, de equipo de empresa.
- No usar la identidad de ninguna marca corporativa externa.

## Evidence on Hand
- Datos de ejemplo en `server/seed.js` (nombres, montos y fechas ficticios).
- Capturas de la versión anterior en `docs/screenshots/`.
- No hay testimonios, métricas reales ni logos de cliente; no inventarlos.

## Product Principles
1. Lo mío primero: al abrir, cada persona ve en segundos qué le toca hoy.
2. El avance se siente: cada paso marcado tiene respuesta visible y suma al equipo.
3. Confianza por transparencia: cifras claras, quién hizo qué y cuándo.
4. Un pulgar basta: las acciones frecuentes se hacen en un toque desde el celular.
5. Calma en los números, calidez en los detalles.
