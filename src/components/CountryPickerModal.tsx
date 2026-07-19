import { useEffect, useMemo, useRef, useState } from "react";
import { Globe2, Search, X } from "lucide-react";
import { useStore } from "../store/useStore";
import { fmt } from "../lib/format";
import type { CountryInfo } from "../types";

interface CountryPickerModalProps {
  open: boolean;
  onClose: () => void;
}

export function CountryPickerModal({ open, onClose }: CountryPickerModalProps) {
  const countries = useStore((s) => s.countries);
  const recentCountries = useStore((s) => s.recentCountries);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);

  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // 打开时重置关键字、聚焦输入框、锁 body 滚动、ESC 关闭
  useEffect(() => {
    if (!open) return;
    setQ("");
    // 仅在非触摸设备上自动聚焦，避免移动端强制弹出虚拟键盘导致 panel 溢出可见区域
    const id = requestAnimationFrame(() => {
      if (!window.matchMedia("(pointer: coarse)").matches) {
        inputRef.current?.focus();
      }
    });
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  // 搜索结果（q 非空时同时匹配 name 和 code），统一按 name A-Z 排序
  const filtered = useMemo<CountryInfo[]>(() => {
    const needle = q.trim().toLowerCase();
    const list = needle
      ? countries.filter(
          (c) =>
            c.name.toLowerCase().includes(needle) ||
            c.code.toLowerCase().includes(needle),
        )
      : [...countries];
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [countries, q]);

  // 最近使用分组（仅 q 为空时展示，最多 6 项，且必须存在于候选集）
  const recentSection = useMemo<CountryInfo[]>(() => {
    if (q.trim()) return [];
    const byCode = new Map(countries.map((c) => [c.code, c]));
    return recentCountries
      .map((code) => byCode.get(code))
      .filter((c): c is CountryInfo => !!c)
      .slice(0, 6);
  }, [recentCountries, countries, q]);

  // 全部分组（去掉最近使用已展示的，避免重复）
  const allSection = useMemo<CountryInfo[]>(() => {
    if (q.trim()) return filtered;
    const recentCodes = new Set(recentSection.map((c) => c.code));
    return filtered.filter((c) => !recentCodes.has(c.code));
  }, [filtered, recentSection, q]);

  if (!open) return null;

  const activeCountryCode = view.kind === "country" ? view.code : null;

  function handlePick(code: string) {
    setView({ kind: "country", code });
    onClose();
  }

  function renderItem(c: CountryInfo) {
    const active = activeCountryCode === c.code;
    return (
      <button
        key={c.code}
        type="button"
        className={`country-picker__item ${active ? "is-active" : ""}`}
        onClick={() => handlePick(c.code)}
      >
        <span className="country-picker__flag">{c.flag}</span>
        <span className="country-picker__country-name">{c.name}</span>
        <span className="country-picker__count mono">{fmt(c.channelCount)}</span>
      </button>
    );
  }

  const isEmpty = filtered.length === 0;

  return (
    <div className="country-picker" role="dialog" aria-modal="true" aria-label="全部国家">
      <div className="country-picker__backdrop" onClick={onClose} />
      <div className="country-picker__panel">
        <header className="country-picker__header">
          <div className="country-picker__title">
            <Globe2 size={14} />
            <span>全部国家</span>
            <span className="country-picker__total mono">{countries.length}</span>
          </div>
          <button
            type="button"
            className="country-picker__close"
            onClick={onClose}
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </header>

        <div className="country-picker__search">
          <form className="search" role="search" onSubmit={(e) => e.preventDefault()}>
            <Search size={15} strokeWidth={2} className="search__icon" />
            <input
              ref={inputRef}
              className="search__input"
              type="text"
              placeholder="搜索国家或地区代码…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="搜索国家"
            />
            {q && (
              <button
                type="button"
                className="search__clear"
                onClick={() => setQ("")}
                aria-label="清除"
              >
                <X size={13} />
              </button>
            )}
          </form>
        </div>

        <div className="country-picker__list">
          {isEmpty ? (
            <div className="country-picker__empty">未找到匹配的国家</div>
          ) : (
            <>
              {recentSection.length > 0 && (
                <section>
                  <div className="country-picker__section-label">最近点击</div>
                  {recentSection.map(renderItem)}
                </section>
              )}
              <section>
                {!q.trim() && <div className="country-picker__section-label">全部国家</div>}
                {allSection.map(renderItem)}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
