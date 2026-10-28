import { Pencil, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useCategories, useDeleteCategory, useSaveCategory } from "../api/hooks";
import type { Category, CategoryKind } from "../api/types";
import { IconBadge } from "../components/icons";
import { ColorPicker, IconPicker } from "../components/inputs";
import { Badge, Checkbox, ConfirmDialog, ErrorBox, Field, Modal, PageHeader, PageLoader, Segmented, Spinner } from "../components/ui";

function CategoryForm({
  open,
  category,
  kind,
  parentId,
  onClose,
}: {
  open: boolean;
  category: Category | null;
  kind: CategoryKind;
  parentId: number | null;
  onClose: () => void;
}) {
  const { data: categories = [] } = useCategories();
  const save = useSaveCategory();
  const remove = useDeleteCategory();
  const [name, setName] = useState("");
  const [parent, setParent] = useState<number | null>(null);
  const [icon, setIcon] = useState("tag");
  const [color, setColor] = useState("#64748b");
  const [archived, setArchived] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    save.reset();
    remove.reset();
    const p = categories.find((c) => c.id === (category?.parent_id ?? parentId));
    setName(category?.name ?? "");
    setParent(category?.parent_id ?? parentId);
    setIcon(category?.icon ?? p?.icon ?? "tag");
    setColor(category?.color ?? p?.color ?? "#64748b");
    setArchived(category?.archived ?? false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, category?.id, parentId]);

  const effectiveKind = category?.kind ?? kind;
  const hasChildren = !!category && categories.some((c) => c.parent_id === category.id);
  const parents = categories.filter((c) => c.kind === effectiveKind && c.parent_id === null && c.id !== category?.id);

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={category ? "Editar categoría" : parentId ? "Nueva subcategoría" : "Nueva categoría"}
        footer={
          <>
            {category && (
              <button className="btn-ghost mr-auto text-red-600 dark:text-red-400" onClick={() => setConfirmDelete(true)}>
                Borrar
              </button>
            )}
            <button className="btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button
              className="btn-primary"
              disabled={!name.trim() || save.isPending}
              onClick={() =>
                save.mutate(
                  { id: category?.id, body: { name: name.trim(), kind: effectiveKind, parent_id: parent, icon, color, archived, sort_order: category?.sort_order ?? 99 } },
                  { onSuccess: onClose },
                )
              }
            >
              {save.isPending && <Spinner className="size-4" />}
              Guardar
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-end gap-3">
            <IconBadge icon={icon} color={color} />
            <Field label="Nombre" className="flex-1">
              {(id) => <input id={id} className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />}
            </Field>
          </div>
          {!hasChildren && (
            <Field label="Categoría padre">
              {(id) => (
                <select id={id} className="input" value={parent ?? ""} onChange={(e) => setParent(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">Ninguna (categoría principal)</option>
                  {parents.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          )}
          <Field label="Color">{() => <ColorPicker value={color} onChange={setColor} />}</Field>
          <Field label="Icono">{() => <IconPicker value={icon} onChange={setIcon} color={color} />}</Field>
          {category && (
            <Checkbox checked={archived} onChange={setArchived} label="Archivada" hint="Deja de aparecer al crear movimientos, pero se conserva en el historial" />
          )}
          <ErrorBox error={save.error ?? remove.error} />
        </div>
      </Modal>
      <ConfirmDialog
        open={confirmDelete}
        title="Borrar categoría"
        message="Solo se pueden borrar categorías sin movimientos ni subcategorías. Si está en uso, archívala."
        confirmLabel="Borrar"
        danger
        busy={remove.isPending}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() =>
          remove.mutate(category!.id, {
            onSuccess: () => {
              setConfirmDelete(false);
              onClose();
            },
            onError: () => setConfirmDelete(false),
          })
        }
      />
    </>
  );
}

export default function CategoriesPage() {
  const { data, isPending } = useCategories();
  const [kind, setKind] = useState<CategoryKind>("expense");
  const [form, setForm] = useState<{ category: Category | null; parentId: number | null } | null>(null);

  if (isPending) return <PageLoader />;
  const own = (data ?? []).filter((c) => c.kind === kind);
  const parents = own.filter((c) => c.parent_id === null);

  return (
    <>
      <PageHeader
        title="Categorías"
        actions={
          <button className="btn-primary" onClick={() => setForm({ category: null, parentId: null })}>
            <Plus className="size-4" /> Nueva categoría
          </button>
        }
      />
      <div className="mb-4 max-w-xs">
        <Segmented
          value={kind}
          options={[
            { value: "expense", label: "Gastos" },
            { value: "income", label: "Ingresos" },
          ]}
          onChange={setKind}
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {parents.map((p) => {
          const children = own.filter((c) => c.parent_id === p.id);
          return (
            <div key={p.id} className={`card p-3 ${p.archived ? "opacity-60" : ""}`}>
              <div className="flex items-center gap-3">
                <IconBadge icon={p.icon} color={p.color} />
                <span className="flex-1 font-medium">{p.name}</span>
                {p.archived && <Badge>Archivada</Badge>}
                <button className="btn-ghost p-1.5" onClick={() => setForm({ category: p, parentId: null })} aria-label={`Editar ${p.name}`}>
                  <Pencil className="size-4" />
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 pl-12">
                {children.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setForm({ category: c, parentId: null })}
                    className={`inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1 text-xs hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800 ${c.archived ? "line-through opacity-60" : ""}`}
                  >
                    <span className="size-2 rounded-full" style={{ backgroundColor: c.color }} />
                    {c.name}
                  </button>
                ))}
                <button
                  onClick={() => setForm({ category: null, parentId: p.id })}
                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  <Plus className="size-3" /> Subcategoría
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <CategoryForm
        open={form !== null}
        category={form?.category ?? null}
        parentId={form?.parentId ?? null}
        kind={kind}
        onClose={() => setForm(null)}
      />
    </>
  );
}
