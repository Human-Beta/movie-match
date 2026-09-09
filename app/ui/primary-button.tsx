import type { ComponentPropsWithoutRef, ReactNode } from "react";

const baseClassName =
  "cursor-pointer rounded-full bg-amber-400 px-6 py-3 font-semibold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60 disabled:data-[busy=true]:cursor-wait";

type PrimaryButtonProps = Readonly<
  Omit<ComponentPropsWithoutRef<"button">, "aria-busy" | "type"> & {
    busy?: boolean;
    submit?: boolean;
  }
>;

export function PrimaryButton({ busy = false, className, submit = false, ...props }: PrimaryButtonProps): ReactNode {
  return (
    <button
      {...props}
      aria-busy={busy || undefined}
      className={className ? `${baseClassName} ${className}` : baseClassName}
      data-busy={busy || undefined}
      type={submit ? "submit" : "button"}
    />
  );
}
