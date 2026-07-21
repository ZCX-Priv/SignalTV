import { Radio } from "lucide-react";

export function Logo() {
  return (
    <div className="logo">
      <span className="logo__mark">
        <Radio size={16} strokeWidth={2.2} />
        <span className="dot" aria-hidden />
      </span>
      <span className="logo__word">
        <span className="logo__name">SignalTV</span>
      </span>
    </div>
  );
}
