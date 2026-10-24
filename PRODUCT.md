# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Las ~16 personas de un equipo de trabajo de una empresa que se organizan para atender un desayuno (80 invitados en los datos de ejemplo). Lo usan sobre todo desde el celular, en ratos cortos entre otras tareas: entrar, ver qué les toca, marcar un paso, ver cómo va el equipo y salir. Una o dos personas coordinan y miran el panorama completo desde la computadora.

## Product Purpose
Que el equipo llegue al día del desayuno con todo resuelto: acuerdos tomados, actividades repartidas con checklist, responsables claros y la caja cuadrada. El éxito es que nadie tenga que preguntar "¿qué falta?" por chat: la app lo responde, y que la gente vuelva a abrirla por gusto porque ver el avance del equipo motiva.

## Positioning
No es un gestor de proyectos genérico: es un tablero de un solo evento, con cuenta regresiva, hecho para un equipo pequeño que se conoce. Cada cambio queda firmado con el nombre de quien lo hizo y se ve en vivo en los celulares de todos.

## Operating Context
- Un evento a la vez (confirmado). La app gira alrededor del desayuno actual y su fecha.
- Celular primero (confirmado); PWA instalable en Android, funciona con mala señal mostrando lo último guardado.
- Sin cuentas: cada persona elige "quién soy" en el selector; ese nombre firma sus cambios.
- Reuniones del equipo por videollamada; coordinación diaria por chat.

## Capabilities and Constraints
- Módulos: Inicio, Actividades (por área, prioridad, fecha, responsables, checklist), Acuerdos (propuesto → acordado → cumplido), Equipo, Presupuesto (ingresos/gastos, cobrado/pagado, en soles PEN), Ajustes (datos del evento, respaldo JSON, reinicio demo).
- Sincronización en vivo por SSE; registro de actividad con autor.
- Stack existente: React 19 + Vite + vite-plugin-pwa; API Express + SQLite (node:sqlite).
- Idioma: español (Perú).
- Pendiente (no decidido): cuentas/PIN, notificaciones push, comentarios y adjuntos, plan de mesas, despliegue en la nube.

## Brand Commitments
- Nombre: "Al Fin Desayuno". Tono profesional pero cálido, de equipo de empresa (confirmado).
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
