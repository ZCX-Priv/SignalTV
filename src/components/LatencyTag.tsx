interface Props {
  /** 延迟毫秒数；undefined 表示未探测，-1 表示失败 */
  ms: number | undefined | null;
  /** 根类名（如 "card__ping" 或 "player__ping"） */
  className: string;
}

/** 延迟标签：绿(<300ms) / 黄(300-1000ms) / 红(>1000ms) / 灰(未知) */
export function LatencyTag({ ms, className }: Props) {
  let level: "ok" | "warn" | "bad" | "unknown";
  let text: string;

  if (ms === undefined || ms === null) {
    level = "unknown";
    text = "··";
  } else if (ms < 0) {
    level = "unknown";
    text = "—";
  } else if (ms < 300) {
    level = "ok";
    text = `${ms}ms`;
  } else if (ms < 1000) {
    level = "warn";
    text = `${ms}ms`;
  } else {
    level = "bad";
    text = `${ms}ms`;
  }

  return <span className={`${className} ${className}--${level}`}>{text}</span>;
}
