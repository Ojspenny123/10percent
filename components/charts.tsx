export function Bars({ values, labels, format }: { values: number[]; labels?: string[]; format?: (value: number) => string }) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-2" style={{ height: 160 }}>
      {values.map((value, index) => (
        <div key={index} className="flex flex-1 flex-col items-center justify-end gap-1">
          <span className="text-[10px] text-muted">{format ? format(value) : Math.round(value)}</span>
          <div className="w-full rounded-t bg-coral" style={{ height: `${Math.max(4, (value / max) * 120)}px` }} title={labels?.[index] ?? String(value)} />
          {labels?.[index] ? <span className="max-w-full truncate text-[10px] text-muted">{labels[index]}</span> : null}
        </div>
      ))}
    </div>
  );
}

export function Line({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  const points = values.map((value, index) => `${(index / Math.max(1, values.length - 1)) * 280 + 8},${150 - (value / max) * 130}`).join(" ");
  return (
    <svg viewBox="0 0 300 160" className="h-40 w-full" role="img" aria-label="Chart">
      <polyline fill="none" stroke="#1F7A72" strokeWidth="3" points={points} />
    </svg>
  );
}
