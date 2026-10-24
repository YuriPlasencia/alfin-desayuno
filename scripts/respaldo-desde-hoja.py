"""Arma un respaldo importable (Ajustes → Importar) con el equipo y las actividades
de la hoja de Google del desayuno. Los datos se transcriben aquí tal como están en la hoja.

Uso: python scripts/respaldo-desde-hoja.py  →  escribe respaldo-equipo.json en la raíz.
Incluye la fecha y hora confirmadas; el lugar queda por definir hasta que se edite en Ajustes.
"""

from __future__ import annotations

import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "respaldo-equipo.json")

# Confirmado por el coordinador: miércoles 28 de octubre, 9:00 a. m.
EVENTO = {
    "event_name": "Al Fin Desayuno",
    "event_date": "2026-10-28",
    "event_time": "09:00",
    "location": "",
    "guests": 80,  # las cantidades de la hoja están calculadas para 80
    "team_size": 16,
    "note": "",
}

# Pestaña "Sheet1": Nombre, Apellido
EQUIPO = [
    ("Yuri", "Plasencia"),
    ("Kluber", "Cancino"),
    ("Henry", "Aquino"),
    ("Cesar", "Cabrera"),
    ("Milner", "Quispe"),
    ("Edgar", "Aguilar"),
    ("Daniel", "Martinez"),
    ("Luis", "Orbezo"),
    ("Alexandra", "Velarde"),
    ("Naryha", "Prado"),
    ("Garnihe", "Alvarez"),
    ("Jorge", "Palomino"),
    ("Leila", "Barriga"),
    ("Carmen", "Suarez"),
    ("Timothy", "Mayorga"),
    ("Dandy", "Reyna"),
]

COLORES = [
    "#1D3FBF", "#E4572E", "#2F8F5B", "#D98E04", "#8B5CF6", "#0E7490", "#C2412D", "#DB2777",
    "#3B6EA5", "#A16207", "#475569", "#15803D", "#B45309", "#7C3AED", "#0F766E", "#BE123C",
]

COMPRAR = ["Comprar o encargar", "Llevar el día del desayuno"]
PREPARAR = ["Preparar", "Llevar el día del desayuno"]

# Pestaña "Hoja1": producto, cantidad, precio, total, responsable (agrupado por tipo)
ACTIVIDADES = [
    # (título, área, prioridad, responsables, detalle, pasos)
    ("Tamales", "Compras", "alta", ["Leila"], "50 unidades × S/ 5 = S/ 250", COMPRAR),
    ("Chicharrón", "Compras", "alta", ["Yuri", "Leila"], "80 porciones × S/ 10 (la hoja no trae el total)", COMPRAR),
    ("Butifarras", "Compras", "alta", ["Henry"], "80 unidades × S/ 8 = S/ 640", COMPRAR),
    ("Pan francés", "Compras", "alta", ["Leila"], "80 unidades", COMPRAR),
    ("Sarza criolla", "Cocina", "media", ["Leila"], "", PREPARAR),
    ("Limones y exprimidor", "Cocina", "media", ["Leila"], "", ["Comprar los limones", "Llevar el exprimidor"]),
    ("Rocoto licuado", "Cocina", "media", ["Alexandra"], "", PREPARAR),
    ("Turrón", "Compras", "media", ["Milner"], "80 porciones × S/ 2 = S/ 160", COMPRAR),
    ("Jugos", "Compras", "media", ["Timothy", "Jorge"], "4 × S/ 12 = S/ 48", COMPRAR),
    ("Agua", "Compras", "media", ["Timothy"], "1 × S/ 15", COMPRAR),
    (
        "Menaje descartable",
        "Logística",
        "media",
        ["Jorge"],
        "Platos, vasos, tenedores y servilletas",
        ["Platos (100)", "Vasos (100)", "Tenedores (100)", "Servilletas (300)"],
    ),
    ("Cuchillos", "Logística", "baja", ["Carmen"], "", ["Conseguir", "Llevar el día del desayuno"]),
    ("Fuentes y bandejas", "Logística", "baja", ["Carmen"], "3 fuentes · en la hoja figura junto a Mirella", ["Conseguir", "Llevar el día del desayuno"]),
    (
        "Regalos",
        "Regalos",
        "media",
        ["Alexandra"],
        "Total S/ 70",
        ["Tazas Halloween/Criollo (S/ 20)", "Tomatodo (S/ 30)", "Calabaza con dulce (S/ 20)"],
    ),
    (
        "Kahoot",
        "Dinámicas",
        "media",
        ["Yuri"],
        "Temas: criollismo, actualidad, coril, Alfin, conocimientos generales",
        ["Armar las preguntas", "Probar el Kahoot antes del día"],
    ),
    ("Escape room", "Dinámicas", "media", ["Jorge", "Yuri"], "", ["Diseñar los retos", "Probar antes del día"]),
    (
        "Otras dinámicas",
        "Dinámicas",
        "baja",
        ["Yuri"],
        "Acertijos, aplicativos tipo críptico del día, etc.",
        ["Elegir las dinámicas", "Probar antes del día"],
    ),
]

# Gastos con monto en la hoja (el chicharrón no tiene total; se calcula 80 × S/ 10)
GASTOS = [
    ("Tamales", 250, "Leila", "50 × S/ 5"),
    ("Chicharrón", 800, "Leila", "Calculado: 80 × S/ 10 (sin total en la hoja)"),
    ("Butifarras", 640, "Henry", "80 × S/ 8"),
    ("Turrón", 160, "Milner", "80 × S/ 2"),
    ("Jugos", 48, "Timothy", "4 × S/ 12"),
    ("Agua", 15, "Timothy", ""),
    ("Regalos", 70, "Alexandra", "Tazas S/ 20, tomatodo S/ 30, calabaza S/ 20"),
]


def main() -> None:
    ids = {nombre: i + 1 for i, (nombre, _) in enumerate(EQUIPO)}

    carga: dict[str, list[str]] = {nombre: [] for nombre, _ in EQUIPO}
    area_de: dict[str, str] = {}
    for titulo, area, _, responsables, _, _ in ACTIVIDADES:
        for persona in responsables:
            carga[persona].append(titulo)
            area_de.setdefault(persona, area)

    members = [
        {
            "id": ids[nombre],
            "name": f"{nombre} {apellido}",
            "role": ", ".join(carga[nombre]),
            "area": area_de.get(nombre, ""),
            "phone": "",
            "email": "",
            "color": COLORES[i % len(COLORES)],
            "is_lead": 0,
        }
        for i, (nombre, apellido) in enumerate(EQUIPO)
    ]

    tasks = [
        {
            "id": i + 1,
            "title": titulo,
            "detail": detalle,
            "area": area,
            "status": "pendiente",
            "priority": prioridad,
            "due_date": None,
            "assignees": [ids[p] for p in responsables],
            "checklist": [{"title": paso, "done": False} for paso in pasos],
        }
        for i, (titulo, area, prioridad, responsables, detalle, pasos) in enumerate(ACTIVIDADES)
    ]

    budget = [
        {
            "id": i + 1,
            "kind": "gasto",
            "concept": concepto,
            "amount": monto,
            "status": "pendiente",
            "owner_id": ids[dueno],
            "due_date": None,
            "note": nota,
        }
        for i, (concepto, monto, dueno, nota) in enumerate(GASTOS)
    ]

    data = {"settings": EVENTO, "members": members, "tasks": tasks, "agreements": [], "budget": budget}
    with open(OUT, "w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)
    sin_tareas = [m["name"] for m in members if not m["role"]]
    print(f"{OUT}: {len(members)} integrantes, {len(tasks)} actividades, {len(budget)} gastos")
    print("Sin actividad asignada:", ", ".join(sin_tareas))


if __name__ == "__main__":
    main()
