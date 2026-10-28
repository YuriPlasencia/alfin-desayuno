# Juntada

**Juntada** es la app para armar eventos en equipo: actividades con responsables y checklist, acuerdos, cuotas por Yape o Plin con su constancia, gastos con boleta y el saldo de la caja, en una pizarra que todos ven en vivo. Funciona en la web y se instala en el celular.

Cada evento es independiente: **Al Fin Desayuno · Octubre 2026** fue el primero, y otro equipo puede crear **Al Fin Desayuno · Noviembre 2026** (o un aniversario, un paseo…) con todas las funciones y su propio código.

---

## 0. Cómo funciona Juntada

1. **Entrar:** con la cuenta de Google (si está configurada) o con el nombre.
2. **Tus eventos:** la portada muestra los eventos de la persona; puede **crear uno** (queda como organizador) o **unirse** con el enlace que le pasaron.
3. **Código del evento:** la primera vez que alguien entra a un evento se le pide su código. El organizador lo cambia en **Ajustes → Invitar al equipo**, donde también está el enlace para compartir.
4. **¿Quién eres?:** al entrar por primera vez, la persona elige su nombre en la lista del equipo (o se agrega). Desde ahí sus cambios quedan firmados con su nombre, sin tener que elegirlo de nuevo.

Cada evento guarda sus datos en su propia base (`data/events/<evento>.db`); las cuentas y los eventos están en `data/juntada.db`.

**Paso desde Al Fin Desayuno:** al arrancar Juntada por primera vez, la base anterior (`data/alfin.db`) se copia como el evento `al-fin-desayuno-octubre-2026`, con todo lo cargado. Su código es el `TEAM_CODE` que ya usaban (o uno generado, que aparece en el log). El original no se borra.

### Ingreso con Google (una vez)

1. Entra a [console.cloud.google.com](https://console.cloud.google.com), crea un proyecto (p. ej. "Juntada").
2. **APIs y servicios → Pantalla de consentimiento de OAuth:** tipo *Externo*, nombre "Juntada" y tu correo.
3. **Credenciales → Crear credenciales → ID de cliente de OAuth → Aplicación web.**
4. En **Orígenes de JavaScript autorizados** agrega la dirección de la app (p. ej. `https://alfin-desayuno.onrender.com`) y, para probar en local, `http://localhost:5173`.
5. Copia el **ID de cliente** (termina en `.apps.googleusercontent.com`) y ponlo en Render como `GOOGLE_CLIENT_ID`.

Sin `GOOGLE_CLIENT_ID` la app deja entrar solo con el nombre (cómodo para probar en local).

---

## 1. Qué incluye esta primera versión

| Módulo | Para qué sirve |
| --- | --- |
| **Inicio** | Cuenta regresiva, avance general, KPIs, próximos vencimientos, avance por área y actividad reciente. |
| **Actividades** | Tareas por área, prioridad, fecha límite, responsables y **checklist con avance**. Filtros por estado, área, persona y búsqueda. |
| **Acuerdos** | Decisiones del equipo con tres estados: propuesto → acordado → cumplido. |
| **Equipo** | Las 16 personas con su rol, área, teléfono y carga de trabajo. |
| **Presupuesto** | Ingresos (aportes, apoyo de la empresa, rifa), gastos y saldo, con estado cobrado/pagado. |
| **Ajustes** | Datos del evento y respaldo JSON (exportar/importar). |

Relanzamiento visual (la **pizarra de turnos**):

- Paleta de pizarra de oficina: esmalte blanco, marco aluminio y plumones azul (acciones), rojo (urgente), verde (hecho). Fuente Figtree incluida en la app (funciona sin internet).
- Cada integrante es un **imán** de color; el selector "Elige tu imán" firma tus cambios.
- **Inicio personal**: tus pasos pendientes se marcan ahí mismo, con un check de plumón animado.
- **Desde tu última visita**: avisa quién avanzó mientras no estabas y marca como *nuevo* esos movimientos.
- **Tablero por columnas** (Pendiente / En curso / Bloqueada / Hecho) además de la vista de lista.
- Al marcar el primer paso, la actividad pasa sola a *En curso*; al marcar el último, salta a *Hecho* y celebra el nuevo avance del equipo.

Caja con constancias:

- **Subir cuota**: cada integrante sube la captura de su Yape, Plin o transferencia. La app lee el monto, la billetera y el n.° de operación (lectura automática con Tesseract; siempre se puede corregir) y la cuota suma al instante a lo recaudado.
- **¿Quién ya pagó?**: lista del equipo con lo pagado, lo pendiente y lo que falta validar. Cualquiera toca un nombre, ve la foto de la constancia y la **valida**; queda registrado quién validó.
- **Subir gasto**: foto de la boleta o constancia; se lee el TOTAL y queda como gasto pagado por quien lo sube.
- **Flujo**: ingresos cobrados, gastos pagados y saldo en caja, en orden y con saldo acumulado.
- **Compartir**: con la app instalada en Android, aparece en el menú Compartir de Yape, Plin, el banco o la galería.
- Las fotos de actividades y constancias se pueden tomar con la cámara o elegir de la galería.

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
npm run reset-demo   # crea/recarga el evento de ejemplo "demo" (código: demo) en http://localhost:5173/e/demo
```

Las bases quedan en `data/` (SQLite): `juntada.db` (cuentas y eventos) y `events/<evento>.db` (uno por evento). Bórralas si quieres empezar de cero.

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

Las escrituras envían el encabezado `X-Actor-Id` con el integrante que hace el cambio, para el historial.

---

## 5. Datos de ejemplo

La base arranca con un caso completo y editable: 16 integrantes (Coordinación, Finanzas, Compras, Cocina, Logística, Ambientación, Servicio, Comunicación), 15 actividades con checklist, 9 acuerdos, 12 movimientos de presupuesto y un historial de cambios.

Los nombres, montos y fechas son **de ejemplo**: cámbialos en **Equipo**, **Ajustes** y cada módulo, o importa un respaldo. Para volver a cargarlos en tu computadora usa `npm run reset-demo` (la app ya no tiene botón para esto, así nadie borra los datos reales por error).

---

## 6. Publicarla en internet (Render o Railway)

Para que el equipo entre desde su casa o la oficina, la app se publica en un servidor con `https`. El proyecto trae todo listo para **Render** (`render.yaml`) y para **Railway** (`railway.json`). Ambos usan Node 22 (`.nvmrc`).

### Código de acceso del equipo

Con la variable `TEAM_CODE` definida, la app pide ese código **una sola vez por dispositivo** (se recuerda un año). Sin el código no se pueden ver ni cambiar datos. No distingue mayúsculas y bloquea 15 minutos tras 10 intentos fallidos. Si cambias `TEAM_CODE`, todos tendrán que volver a escribirlo (útil si el código se filtró).

Sin `TEAM_CODE` (uso en tu computadora) la app queda abierta como antes.

### Opción A: Render (recomendada)

1. Crea una cuenta en [render.com](https://render.com) (puedes entrar con GitHub) y autoriza el acceso al repositorio `alfin-desayuno`.
2. Ve a **New → Blueprint** y elige el repositorio. Render lee `render.yaml` y propone un servicio web **Starter** con un disco de 1 GB en `/data`.
3. Cuando lo pida, escribe el valor de **`TEAM_CODE`** (el código que compartirás con el equipo). `DATA_DIR` y `NODE_VERSION` ya vienen definidos.
4. Confirma con **Apply**. Render compila, arranca y revisa `/api/health`. El plan Starter y el disco son de pago: revisa el precio en pantalla antes de confirmar. El plan gratis no sirve porque no admite disco y la base se borraría.
5. Tu enlace queda como `https://alfin-desayuno.onrender.com` (o similar). Compártelo junto con el código.

Cada vez que subas cambios a `main` en GitHub, Render vuelve a desplegar solo.

### Opción B: Railway

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
