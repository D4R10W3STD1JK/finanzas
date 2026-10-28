"""Conjunto inicial de categorías. Se crea solo si no existe ninguna; luego es editable."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Category, CategoryKind

# (nombre, icono, color, subcategorías)
EXPENSES: list[tuple[str, str, str, list[str]]] = [
    ("Vivienda", "house", "#f97316", ["Alquiler", "Hipoteca", "Comunidad", "Mantenimiento y reparaciones", "Hogar y mobiliario"]),
    ("Suministros", "zap", "#eab308", ["Luz", "Agua", "Gas", "Internet", "Teléfono móvil"]),
    ("Alimentación", "shopping-cart", "#22c55e", ["Supermercado", "Restaurantes", "Cafeterías"]),
    ("Transporte", "car", "#3b82f6", ["Combustible", "Transporte público", "Mantenimiento vehículo", "Aparcamiento y peajes", "Taxi y VTC"]),
    ("Seguros", "shield", "#6366f1", ["Seguro de hogar", "Seguro de coche", "Seguro de salud", "Seguro de vida"]),
    ("Salud", "heart-pulse", "#ef4444", ["Farmacia", "Médico", "Dentista", "Óptica"]),
    ("Ocio", "party-popper", "#ec4899", ["Viajes", "Espectáculos", "Deporte", "Aficiones"]),
    ("Suscripciones", "repeat", "#8b5cf6", ["Streaming", "Software", "Prensa"]),
    ("Impuestos", "landmark", "#64748b", ["IBI", "IRPF", "Impuesto de circulación", "Tasas"]),
    ("Educación", "graduation-cap", "#0ea5e9", ["Cursos", "Libros y material"]),
    ("Ropa y cuidado personal", "shirt", "#d946ef", ["Ropa y calzado", "Peluquería"]),
    ("Regalos y donaciones", "gift", "#f43f5e", []),
    ("Mascotas", "paw-print", "#a16207", []),
    ("Comisiones bancarias", "banknote", "#78716c", []),
    ("Otros gastos", "ellipsis", "#94a3b8", []),
]

INCOMES: list[tuple[str, str, str, list[str]]] = [
    ("Nómina", "briefcase", "#16a34a", []),
    ("Pensión", "hand-coins", "#15803d", []),
    ("Intereses y dividendos", "trending-up", "#0d9488", []),
    ("Alquileres cobrados", "key-round", "#0891b2", []),
    ("Devoluciones", "undo-2", "#65a30d", ["Hacienda", "Compras"]),
    ("Regalos recibidos", "gift", "#84cc16", []),
    ("Otros ingresos", "circle-plus", "#4ade80", []),
]


def seed_default_categories(db: Session) -> bool:
    if db.scalar(select(func.count()).select_from(Category)):
        return False
    for kind, groups in ((CategoryKind.EXPENSE, EXPENSES), (CategoryKind.INCOME, INCOMES)):
        for order, (name, icon, color, subs) in enumerate(groups):
            parent = Category(name=name, kind=kind, icon=icon, color=color, sort_order=order)
            parent.children = [
                Category(name=sub, kind=kind, icon=icon, color=color, sort_order=i)
                for i, sub in enumerate(subs)
            ]
            db.add(parent)
    db.commit()
    return True
