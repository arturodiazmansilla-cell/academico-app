export function Field({ label, value, onChange, type = "text", placeholder, required = false }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1.5">{label}</label>
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
      />
    </div>
  );
}

export function SelectField({ label, value, onChange, options, getLabel = (o) => o.name, getValue = (o) => o.id }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1.5">{label}</label>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-600"
      >
        <option value="">Selecciona…</option>
        {options.map((o) => (
          <option key={getValue(o)} value={getValue(o)}>
            {getLabel(o)}
          </option>
        ))}
      </select>
    </div>
  );
}

export const ESTADOS_ASISTENCIA = [
  { key: "present", label: "Presente", ring: "ring-emerald-600", chip: "bg-emerald-50 border-emerald-300", text: "text-emerald-800" },
  { key: "absent", label: "Ausente", ring: "ring-red-600", chip: "bg-red-50 border-red-300", text: "text-red-800" },
  { key: "late", label: "Tarde", ring: "ring-amber-600", chip: "bg-amber-50 border-amber-300", text: "text-amber-800" },
  { key: "leave", label: "Licencia", ring: "ring-sky-600", chip: "bg-sky-50 border-sky-300", text: "text-sky-800" },
];

export function StatusPill({ estadoKey, onClick, selected }) {
  const e = ESTADOS_ASISTENCIA.find((x) => x.key === estadoKey);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
        selected ? `${e.chip} ${e.text} ring-2 ${e.ring}` : "bg-white border-slate-200 text-slate-400 hover:border-slate-300"
      }`}
    >
      {e.label}
    </button>
  );
}

export function Modal({ title, onClose, children, footer, maxWidth = "sm:max-w-lg" }) {
  return (
    <div className="fixed inset-0 z-30 bg-slate-900/40 flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className={`bg-white w-full ${maxWidth} sm:rounded shadow-xl max-h-[92vh] flex flex-col`}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 shrink-0">
          <h3 className="font-ledger text-lg font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">{children}</div>
        {footer && <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-5 py-4 shrink-0">{footer}</div>}
      </div>
    </div>
  );
}
