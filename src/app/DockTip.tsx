/** Desktop dock tooltip: a dark pill (name + shortcut chips) shown by CSS on hover and keyboard focus. Decorative; the button's aria-label names it. */
export function DockTip({ name, keys, hint }: { name: string; keys?: Array<string | undefined>; hint?: string }) {
  const chips = (keys ?? []).filter((key): key is string => Boolean(key))
  return (
    <span className="dock-tip" aria-hidden="true">
      {name}
      {chips.map((key) => <kbd key={key}>{key}</kbd>)}
      {hint && <span className="dock-tip-hint">{hint}</span>}
    </span>
  )
}
