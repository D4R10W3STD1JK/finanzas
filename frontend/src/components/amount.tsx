import clsx from "clsx";
import type { TransactionKind } from "../api/types";
import { formatMoney } from "../lib/format";

/** Importe coloreado según el tipo: gastos con signo menos, ingresos en verde. */
export function Amount({
  kind,
  value,
  className,
}: {
  kind: TransactionKind;
  value: string | number;
  className?: string;
}) {
  const n = Number(value);
  const signed = kind === "expense" ? -n : n;
  const color =
    kind === "income"
      ? "text-income"
      : kind === "expense"
        ? "text-fg"
        : kind === "adjustment"
          ? signed < 0
            ? "text-expense"
            : "text-income"
          : "text-fg-subtle";
  return (
    <span className={clsx("amount font-medium", color, className)}>
      {kind === "transfer" ? formatMoney(n) : formatMoney(signed, { sign: true })}
    </span>
  );
}

export function Balance({ value, className }: { value: string | number; className?: string }) {
  const n = Number(value);
  return <span className={clsx("amount", n < 0 && "text-expense", className)}>{formatMoney(n)}</span>;
}
