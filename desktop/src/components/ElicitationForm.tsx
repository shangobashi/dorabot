import { useState, useEffect } from "react"
import { ChevronDown, ChevronRight, FormInput } from "lucide-react"
import { Button } from "./ui/button"
import { cn } from "../lib/utils"
import type { PendingElicitation, ElicitationField } from "../hooks/useGateway"

function FieldInput({ field, value, onChange }: {
  field: ElicitationField
  value: unknown
  onChange: (v: unknown) => void
}) {
  if (field.type === 'boolean') {
    return (
      <button
        className={cn(
          'px-2.5 py-1.5 rounded-md border text-xs transition-colors w-full text-left',
          value ? 'border-primary bg-primary/10' : 'border-border bg-background hover:border-primary/50'
        )}
        onClick={() => onChange(!value)}
      >
        {value ? 'Yes' : 'No'}
      </button>
    )
  }

  if (field.type === 'select' && field.options) {
    return (
      <div className="flex flex-col gap-1">
        {field.options.map(opt => (
          <button
            key={opt.value}
            className={cn(
              'flex flex-col items-start px-2.5 py-1.5 rounded-md border text-left w-full transition-colors',
              value === opt.value
                ? 'border-primary bg-primary/10'
                : 'border-border bg-background hover:border-primary/50'
            )}
            onClick={() => onChange(opt.value)}
          >
            <span className="text-xs font-medium">{opt.label}</span>
          </button>
        ))}
      </div>
    )
  }

  if (field.type === 'number') {
    return (
      <input
        type="number"
        className="w-full px-2.5 py-1.5 bg-background border border-border rounded-md text-xs outline-none focus:border-primary placeholder:text-muted-foreground"
        placeholder={field.description || field.label}
        value={value as number ?? ''}
        onChange={e => onChange(e.target.value ? Number(e.target.value) : undefined)}
      />
    )
  }

  // text (default)
  return (
    <input
      className="w-full px-2.5 py-1.5 bg-background border border-border rounded-md text-xs outline-none focus:border-primary placeholder:text-muted-foreground"
      placeholder={field.description || field.label}
      value={(value as string) ?? ''}
      onChange={e => onChange(e.target.value)}
    />
  )
}

export function ElicitationForm({
  elicitation,
  onSubmit,
  onDismiss,
}: {
  elicitation: PendingElicitation
  onSubmit: (elicitationId: string, values: Record<string, unknown>) => void
  onDismiss: () => void
}) {
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [collapsed, setCollapsed] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(300)

  useEffect(() => {
    // Initialize defaults
    const defaults: Record<string, unknown> = {}
    for (const field of elicitation.fields) {
      if (field.default_value !== undefined) defaults[field.name] = field.default_value
    }
    setValues(defaults)
  }, [elicitation.elicitationId])

  useEffect(() => {
    const id = setInterval(() => setSecondsLeft(s => Math.max(0, s - 1)), 1000)
    return () => clearInterval(id)
  }, [])

  const mins = Math.floor(secondsLeft / 60)
  const secs = secondsLeft % 60

  const allRequiredFilled = elicitation.fields
    .filter(f => f.required)
    .every(f => values[f.name] !== undefined && values[f.name] !== '')

  const handleSubmit = () => {
    onSubmit(elicitation.elicitationId, values)
  }

  return (
    <div className="border-t border-primary bg-card shrink-0">
      <button
        className="flex items-center justify-between w-full px-3 py-1.5 hover:bg-secondary/30 transition-colors"
        onClick={() => setCollapsed(c => !c)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <FormInput className="w-3 h-3 text-primary shrink-0" />
          <span className="text-xs font-medium truncate">{elicitation.message}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={cn('text-[10px] tabular-nums', secondsLeft < 60 ? 'text-destructive' : 'text-muted-foreground')}>
            {mins}:{secs.toString().padStart(2, '0')}
          </span>
          {collapsed ? <ChevronRight className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
        </div>
      </button>

      {!collapsed && (
        <div className="px-3 pb-2 space-y-3">
          {elicitation.fields.map(field => (
            <div key={field.name} className="space-y-1">
              <div className="flex items-baseline gap-1">
                <span className="text-[11px] font-medium">{field.label}</span>
                {field.required && <span className="text-[9px] text-destructive">*</span>}
              </div>
              {field.description && field.type !== 'select' && (
                <div className="text-[10px] text-muted-foreground">{field.description}</div>
              )}
              <FieldInput
                field={field}
                value={values[field.name]}
                onChange={v => setValues(prev => ({ ...prev, [field.name]: v }))}
              />
            </div>
          ))}

          <div className="flex justify-between pt-0.5">
            <Button variant="outline" size="sm" className="h-6 text-[11px] px-2" onClick={onDismiss}>
              dismiss
            </Button>
            <Button size="sm" className="h-6 text-[11px] px-2" onClick={handleSubmit} disabled={!allRequiredFilled}>
              submit
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
