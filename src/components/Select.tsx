import type { ReactNode } from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { ChevronDown, ChevronUp, Check } from "lucide-react";

export type SelectOption = {
  value: string;
  label: ReactNode;
  /** 用于 type-ahead 搜索；不填则取 label 的字符串文本 */
  textValue?: string;
};

export type SelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  /** 左侧 lucide 图标（建议 13px） */
  icon?: ReactNode;
  options: SelectOption[];
  className?: string;
  "aria-label"?: string;
};

export function Select({
  value,
  onValueChange,
  placeholder,
  icon,
  options,
  className,
  "aria-label": ariaLabel,
}: SelectProps) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange}>
      <SelectPrimitive.Trigger
        className={`select ${className ?? ""}`}
        aria-label={ariaLabel}
      >
        {icon && <span className="select__icon">{icon}</span>}
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon className="select__chevron">
          <ChevronDown size={14} />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          className="select__content"
          position="popper"
          sideOffset={4}
          align="start"
        >
          <SelectPrimitive.ScrollUpButton className="select__scroll">
            <ChevronUp size={14} />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="select__viewport">
            {options.map((opt) => (
              <SelectPrimitive.Item
                key={opt.value}
                value={opt.value}
                textValue={opt.textValue}
                className="select__item"
              >
                <SelectPrimitive.ItemText>{opt.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="select__indicator">
                  <Check size={13} />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="select__scroll">
            <ChevronDown size={14} />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
