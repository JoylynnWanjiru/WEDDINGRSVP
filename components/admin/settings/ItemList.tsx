"use client";

// Generic editor for the settings lists (venues, programme, FAQ, contacts, photos): each
// row is its own small form with Save and Delete, plus an "Add" form at the end.

import { useState, useTransition, type ReactNode } from "react";
import { deleteItemAction, saveItemAction, type ItemKind } from "@/app/admin/(dashboard)/settings/actions";
import { btn, Notice } from "../ui";

export type ItemFormProps<T> = { item: T | null; errors: Record<string, string> };

export function ItemList<T extends { id: string }>({
  kind,
  items,
  title,
  addLabel,
  render,
  toValues,
  summary,
}: {
  kind: ItemKind;
  items: T[];
  title: (item: T) => string;
  addLabel: string;
  /** The form fields for an item (or for a new one when item is null). */
  render: (props: ItemFormProps<T>) => ReactNode;
  /** FormData → values for the save action. */
  toValues: (form: FormData) => Record<string, unknown>;
  summary?: (item: T) => string;
}) {
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <Row key={item.id} kind={kind} item={item} title={title(item)} summary={summary?.(item)} render={render} toValues={toValues} />
      ))}
      <Row kind={kind} item={null} title={addLabel} render={render} toValues={toValues} />
    </div>
  );
}

function Row<T extends { id: string }>({
  kind,
  item,
  title,
  summary,
  render,
  toValues,
}: {
  kind: ItemKind;
  item: T | null;
  title: string;
  summary?: string;
  render: (props: ItemFormProps<T>) => ReactNode;
  toValues: (form: FormData) => Record<string, unknown>;
}) {
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [formKey, setFormKey] = useState(0); // reset the "add" form after saving

  function save(form: FormData) {
    const values = { ...toValues(form), ...(item ? { id: item.id } : {}) };
    startTransition(async () => {
      const res = await saveItemAction(kind, values);
      setErrors(res.ok ? {} : (res.fields ?? {}));
      setNotice(res.ok ? { tone: "ok", text: item ? "Saved." : "Added." } : { tone: "error", text: res.message });
      if (res.ok && !item) setFormKey((k) => k + 1);
    });
  }

  function remove() {
    if (!item || !window.confirm(`Delete "${title}"?`)) return;
    startTransition(async () => {
      const res = await deleteItemAction(kind, item.id);
      if (!res.ok) setNotice({ tone: "error", text: res.message });
    });
  }

  return (
    <details className="a-card" open={!item ? false : undefined}>
      <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 px-4 py-3">
        <span className={item ? "font-medium" : "label text-[0.62rem] text-gold-deep"}>{item ? title : `+ ${title}`}</span>
        {summary ? <span className="truncate text-sm text-wine/70">{summary}</span> : null}
      </summary>
      <form key={formKey} action={save} className="space-y-4 border-t border-wine/10 p-4">
        {render({ item, errors })}
        {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
        <div className="flex gap-2">
          <button type="submit" className={btn.primary} disabled={pending}>
            {pending ? "Saving…" : item ? "Save" : "Add"}
          </button>
          {item ? (
            <button type="button" className={btn.danger} disabled={pending} onClick={remove}>
              Delete
            </button>
          ) : null}
        </div>
      </form>
    </details>
  );
}
