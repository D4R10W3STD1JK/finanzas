from fastapi import APIRouter
from sqlalchemy import exists, func, select

from app.api.deps import DB
from app.models import Category, RecurringVersion, Tag, Transaction
from app.schemas.core import CategoryIn, CategoryOut, CategoryPatch, TagIn, TagOut
from app.services.errors import Conflict, Invalid, get_or_404

router = APIRouter(tags=["categories"])


def _check_parent(db, parent_id: int | None, kind, self_id: int | None = None) -> None:
    if parent_id is None:
        return
    parent = db.get(Category, parent_id)
    if parent is None:
        raise Invalid("La categoría padre no existe")
    if parent.parent_id is not None:
        raise Invalid("Solo hay dos niveles: la categoría padre no puede ser una subcategoría")
    if parent.kind != kind:
        raise Invalid("La subcategoría debe ser del mismo tipo (ingreso/gasto) que su categoría")
    if self_id is not None:
        if parent_id == self_id:
            raise Invalid("Una categoría no puede ser su propia categoría padre")
        if db.scalar(select(exists().where(Category.parent_id == self_id))):
            raise Invalid("Una categoría con subcategorías no puede convertirse en subcategoría")


@router.get("/categories", response_model=list[CategoryOut])
def list_categories(db: DB):
    return db.scalars(select(Category).order_by(Category.kind, Category.sort_order, Category.name)).all()


@router.post("/categories", response_model=CategoryOut, status_code=201)
def create_category(data: CategoryIn, db: DB):
    _check_parent(db, data.parent_id, data.kind)
    category = Category(**data.model_dump())
    category.name = category.name.strip()
    db.add(category)
    db.commit()
    return category


@router.patch("/categories/{category_id}", response_model=CategoryOut)
def update_category(category_id: int, data: CategoryPatch, db: DB):
    category = get_or_404(db, Category, category_id, "Categoría no encontrada")
    if "parent_id" in data.model_fields_set:
        _check_parent(db, data.parent_id, category.kind, self_id=category.id)
        category.parent_id = data.parent_id
    for field in data.model_fields_set - {"parent_id"}:
        value = getattr(data, field)
        if value is not None:
            setattr(category, field, value)
    db.commit()
    return category


@router.delete("/categories/{category_id}", status_code=204)
def delete_category(category_id: int, db: DB):
    category = get_or_404(db, Category, category_id, "Categoría no encontrada")
    if db.scalar(select(exists().where(Category.parent_id == category_id))):
        raise Conflict("La categoría tiene subcategorías: bórralas o muévelas antes")
    used = db.scalar(select(exists().where(Transaction.category_id == category_id))) or db.scalar(
        select(exists().where(RecurringVersion.category_id == category_id))
    )
    if used:
        raise Conflict("La categoría está en uso. Puedes archivarla en lugar de borrarla.")
    db.delete(category)
    db.commit()


@router.get("/tags", response_model=list[TagOut])
def list_tags(db: DB):
    return db.scalars(select(Tag).order_by(Tag.name)).all()


def _check_tag_name(db, name: str, self_id: int | None = None) -> str:
    name = name.strip()
    other = db.scalar(select(Tag).where(func.lower(Tag.name) == name.lower()))
    if other is not None and other.id != self_id:
        raise Conflict(f"Ya existe la etiqueta «{other.name}»")
    return name


@router.post("/tags", response_model=TagOut, status_code=201)
def create_tag(data: TagIn, db: DB):
    tag = Tag(name=_check_tag_name(db, data.name), color=data.color)
    db.add(tag)
    db.commit()
    return tag


@router.patch("/tags/{tag_id}", response_model=TagOut)
def update_tag(tag_id: int, data: TagIn, db: DB):
    tag = get_or_404(db, Tag, tag_id, "Etiqueta no encontrada")
    tag.name = _check_tag_name(db, data.name, tag.id)
    tag.color = data.color
    db.commit()
    return tag


@router.delete("/tags/{tag_id}", status_code=204)
def delete_tag(tag_id: int, db: DB):
    db.delete(get_or_404(db, Tag, tag_id, "Etiqueta no encontrada"))
    db.commit()
