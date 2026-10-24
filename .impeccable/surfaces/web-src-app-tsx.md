---
version: 1
slug: "web-src-app-tsx"
primary_target: "web/src/App.tsx"
related_targets: ["web/src/views"]
---

# App shell (todas las vistas) — Al Fin Desayuno

Scope: la PWA completa (Inicio, Actividades, Acuerdos, Equipo, Presupuesto, Ajustes). Mode: Operate. Celular primero.
Job: cada integrante entra, ve qué le toca, marca un paso con el pulgar y ve el avance del equipo.
Memorable moment: tu imán con tus pasos pendientes y el "desde tu última visita" del equipo.

## Direction contract

THESIS: La app es la pizarra de turnos de la oficina: el equipo son imanes de color y cada actividad se mueve de columna en columna. Rechaza el tablero genérico de tarjetas blancas con KPIs y anillo de avance sobre crema y terracota.

OWN-WORLD: Esmalte blanco sobre marco de aluminio gris azulado (#E8EDF5); juego de plumones: azul #1D3FBF (acción y navegación), rojo #E5483A (urgente, encabezados de columna), verde #15803D (hecho), negro tinta #0F172A. Personas como imanes redondos o en píldora con sombra corta real. Una sola sans (Figtree), sin degradados ni vidrio.

STORY: Ana abre la app, ve su imán y sus 3 pasos, marca uno (trazo de plumón), lee quién avanzó desde su última visita y sale sabiendo cuánto falta.

FIRST VIEWPORT: Celular: barra superior con marca e imán propio; pizarra enmarcada con "Desayuno · 21 nov", días que faltan y pasos del equipo; zona punteada "tu imán" con tus pasos marcables; columnas Pendiente / En curso / Hecho debajo. Barra inferior estándar. Escritorio: riel azul oscuro a la izquierda, misma pizarra al centro.

FORM: Pizarra de turnos (IMPECCABLE’S PICK, puesto 1 de mi lista). seed:22c186ca1f6592a9. Signature move: imanes de personas + tablero por columnas; marcar un paso dibuja un check de plumón y una actividad terminada salta a "Hecho".

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
