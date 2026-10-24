# Al Fin Desayuno

Aplicativo web (y PWA instalable en Android) para organizar en equipo el desayuno de **80 invitados** con **16 personas** a cargo: acuerdos, actividades con checklist, responsables, avance y presupuesto.

---

## 1. Qué incluye esta primera versión

| Módulo | Para qué sirve |
| --- | --- |
| **Inicio** | Cuenta regresiva, avance general, KPIs, próximos vencimientos, avance por área y actividad reciente. |
| **Actividades** | Tareas por área, prioridad, fecha límite, responsables y **checklist con avance**. Filtros por estado, área, persona y búsqueda. |
| **Acuerdos** | Decisiones del equipo con tres estados: propuesto → acordado → cumplido. |
| **Equipo** | Las 16 personas con su rol, área, teléfono y carga de trabajo. |
| **Presupuesto** | Ingresos (aportes, apoyo de la empresa, rifa), gastos y saldo, con estado cobrado/pagado. |
| **Ajustes** | Datos del evento, respaldo JSON (exportar/importar) y reinicio de datos de ejemplo. |

Relanzamiento visual (la **pizarra de turnos**):

- Paleta de pizarra de oficina: esmalte blanco, marco aluminio y plumones azul (acciones), rojo (urgente), verde (hecho). Fuente Figtree incluida en la app (funciona sin internet).
- Cada integrante es un **imán** de color; el selector "Elige tu imán" firma tus cambios.
- **Inicio personal**: tus pasos pendientes se marcan ahí mismo, con un check de plumón animado.
- **Desde tu última visita**: avisa quién avanzó mientras no estabas y marca como *nuevo* esos movimientos.
- **Tablero por columnas** (Pendiente / En curso / Bloqueada / Hecho) además de la vista de lista.
- Al marcar el primer paso, la actividad pasa sola a *En curso*; al marcar el último, salta a *Hecho* y celebra el nuevo avance del equipo.

Extras ya funcionando:

- **Sincronización en vivo** (SSE): si alguien marca un paso, los demás lo ven sin recargar.
- **PWA**: se instala en el celular, guarda la última información vista y funciona con mala señal.
- **Registro de actividad**: cada cambio se guarda con el nombre de quien lo hizo.
- **Diseño responsive**: escritorio, tablet y celular.

---

## 2. Cómo ejecutarlo

Requisitos: **Node.js 22.13 o superior** (se usa SQLite integrado, sin dependencias nativas).

```bash
npm install          # instala dependencias
npm run dev          # API en :8787 y web en :5173
```

Abre **http://localhost:5173**.

Para producción (un solo puerto, la API sirve también la web):

```bash
npm run build
npm start            # http://localhost:8787
```

Otros comandos:

```bash
npm run typecheck    # revisa tipos de TypeScript
npm run reset-demo   # vuelve a cargar los datos de ejemplo
```

La base de datos queda en `data/alfin.db` (SQLite). Bórrala si quieres empezar de cero.

### Abrirlo desde otros celulares de la red

1. Ejecuta `npm start` (o `npm run dev`).
2. Averigua la IP de la computadora: `ipconfig` → IPv4 (por ejemplo `192.168.1.25`).
3. En el celular abre `http://192.168.1.25:8787`.
4. En Chrome: menú ⋮ → **Instalar aplicación**.

> Si el celular no carga, revisa que la PC y el celular estén en la misma red y que el firewall de Windows permita Node en la red privada.

---

## 3. Estructura del proyecto

```
AlfinDesayuno/
├─ server/
│  ├─ db.js          # SQLite (node:sqlite), esquema y consultas del bootstrap
│  ├─ seed.js        # datos de ejemplo realistas (16 personas / 80 invitados)
│  └─ index.js       # API REST + SSE + servido del build
├─ web/
│  ├─ index.html
│  ├─ public/        # iconos PWA y favicon
│  └─ src/
│     ├─ App.tsx         # navegación y layout
│     ├─ store.tsx       # estado global, SSE, caché offline y toasts
│     ├─ api.ts          # cliente HTTP
│     ├─ types.ts        # tipos y catálogos (áreas, colores)
│     ├─ lib/            # formato de fechas/moneda y estadísticas
│     ├─ components/ui.tsx
│     └─ views/          # Dashboard, Tasks, Agreements, Team, Budget, Settings
├─ scripts/
│  ├─ dev.mjs        # levanta API + Vite juntos
│  ├─ shots.mjs      # capturas automáticas (Playwright)
│  └─ make-icons.py  # genera los iconos de la app
├─ docs/screenshots/
└─ data/             # base SQLite (se crea sola, no se versiona)
```

---

## 4. API

| Método | Ruta | Uso |
| --- | --- | --- |
| GET | `/api/health` | Estado del servidor (sin código) |
| GET / POST | `/api/auth` | Consultar / enviar el código del equipo |
| GET | `/api/bootstrap` | Todo el estado de la app en una sola llamada |
| GET | `/api/stream` | Eventos en vivo (SSE) |
| POST / PATCH / DELETE | `/api/tasks`, `/api/tasks/:id` | Actividades |
| POST | `/api/tasks/:id/checklist` | Agregar paso |
| PATCH / DELETE | `/api/checklist/:id` | Marcar paso / eliminar |
| POST / PATCH / DELETE | `/api/agreements`, `/api/agreements/:id` | Acuerdos |
| POST / PATCH / DELETE | `/api/members`, `/api/members/:id` | Equipo |
| POST / PATCH / DELETE | `/api/budget`, `/api/budget/:id` | Presupuesto |
| PATCH | `/api/settings` | Datos del evento |
| GET / POST | `/api/export`, `/api/import` | Respaldo y restauración |
| POST | `/api/demo/reset` | Reiniciar datos de ejemplo |

Las escrituras envían el encabezado `X-Actor-Id` con el integrante que hace el cambio, para el historial.

---

## 5. Datos de ejemplo

La base arranca con un caso completo y editable: 16 integrantes (Coordinación, Finanzas, Compras, Cocina, Logística, Ambientación, Servicio, Comunicación), 15 actividades con checklist, 9 acuerdos, 12 movimientos de presupuesto y un historial de cambios.

Los nombres, montos y fechas son **de ejemplo**: cámbialos en **Equipo**, **Ajustes** y cada módulo, o reinicia desde **Ajustes → Restablecer datos de ejemplo**.

---

## 6. Publicarla en internet (Railway)

Para que el equipo entre desde su casa o la oficina, la app se publica en un servidor con `https`. El proyecto ya trae todo listo para **Railway** (`railway.json`, Node 22 en `.nvmrc`).

### Código de acceso del equipo

Con la variable `TEAM_CODE` definida, la app pide ese código **una sola vez por dispositivo** (se recuerda un año). Sin el código no se pueden ver ni cambiar datos. No distingue mayúsculas y bloquea 15 minutos tras 10 intentos fallidos. Si cambias `TEAM_CODE`, todos tendrán que volver a escribirlo (útil si el código se filtró).

Sin `TEAM_CODE` (uso en tu computadora) la app queda abierta como antes.

### Pasos

1. Sube el proyecto a un repositorio de GitHub (privado está bien).
2. En [railway.com](https://railway.com) crea una cuenta y un proyecto nuevo con **Deploy from GitHub repo** y elige el repositorio.
3. En el servicio, abre **Settings → Volumes** (o clic derecho → *Attach volume*) y crea un volumen montado en **`/data`**. Ahí vive la base de datos; sin volumen, los datos se pierden en cada reinicio.
4. En **Variables** agrega:
   - `TEAM_CODE` = el código que compartirás con el equipo (por ejemplo, una palabra y un número).
   - `DATA_DIR` = `/data`
5. En **Settings → Networking** pulsa **Generate Domain**. Obtendrás algo como `https://alfin-desayuno.up.railway.app`.
6. Espera a que el despliegue quede en verde (Railway revisa `/api/health`).
7. Comparte el enlace y el código por el chat del equipo. Desde Chrome: menú ⋮ → **Instalar aplicación**; en iPhone: Safari → Compartir → **Agregar a inicio**.

### Primer uso

La primera vez que arranca con un volumen vacío, la app carga los **datos de ejemplo** (16 personas ficticias). Cámbialos en **Equipo**, **Actividades** y **Ajustes**, o importa un respaldo JSON desde **Ajustes** si ya trabajaste en tu computadora (exporta primero el respaldo en local).

Haz un respaldo (**Ajustes → Exportar**) de vez en cuando: es un archivo pequeño y te protege ante cualquier error.

---

## 7. Próximos pasos sugeridos

1. **Cuentas y permisos**: hoy hay un código común del equipo; a futuro, PIN por integrante y roles admin/editor/lector.
2. **Notificaciones**: recordatorios de vencimientos por push o correo.
3. **Comentarios por actividad** y adjuntos (fotos de cotizaciones, comprobantes).
4. **Plan de mesas** e invitados con confirmación (80 personas, hoy solo el número).
5. **Android nativo**: empaquetar con Capacitor para publicar APK/AAB cuando haga falta; la PWA ya cubre el uso diario.

---

Hecho para el equipo de Al Fin Desayuno.
