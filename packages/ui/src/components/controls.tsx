interface SliderProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  displayValue: string;
  onChange: (value: number) => void;
}

export function Slider({ label, value, min = 0, max = 100, step = 1, displayValue, onChange }: SliderProps) {
  return (
    <div className="flex items-center gap-3">
      <label className="text-sm text-text-2 min-w-20 font-medium">{label}</label>
      <input
        type="range"
        aria-label={label}
        className="flex-1"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="text-sm text-text-2 min-w-12 text-right font-mono">{displayValue}</span>
    </div>
  );
}

interface ColorPickerProps {
  hue: number;
  saturation: number;
  brightness: number;
  onHueChange: (h: number) => void;
  onSatChange: (s: number) => void;
  onBrightChange: (b: number) => void;
}

export function ColorPicker({ hue, saturation, brightness, onHueChange, onSatChange, onBrightChange }: ColorPickerProps) {
  return (
    <div className="space-y-2">
      <Slider label="Hue" value={hue} max={360} displayValue={`${hue}°`} onChange={onHueChange} />
      <Slider label="Saturation" value={saturation} displayValue={`${saturation}%`} onChange={onSatChange} />
      <Slider label="Brightness" value={brightness} displayValue={`${brightness}%`} onChange={onBrightChange} />
    </div>
  );
}
