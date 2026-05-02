export type StepStatus = 'pending' | 'active' | 'done' | 'failed';
export interface StepDef { id: string; label: string; status: StepStatus }

export function Steps({ steps }: { steps: StepDef[] }) {
  return (
    <ul className="steps">
      {steps.map((s) => (
        <li key={s.id} className={s.status}>
          <span className="marker">
            {s.status === 'done' ? '✓' : s.status === 'failed' ? '✕' : s.status === 'active' ? <span className="spinner" /> : ''}
          </span>
          <span className="label">{s.label}</span>
        </li>
      ))}
    </ul>
  );
}
