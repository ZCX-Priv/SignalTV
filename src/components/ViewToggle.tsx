import { LayoutGrid, List } from "lucide-react";
import { useStore } from "../store/useStore";
import type { LayoutScope } from "../store/useStore";
import { toast } from "../lib/toast";
import { useI18n } from "../i18n";

interface ViewToggleProps {
  /** 形态作用域：浏览页（首页/分类/国家/搜索共享）、收藏页、历史页各自独立 */
  scope: LayoutScope;
}

/**
 * 卡片/列表视图切换分段控件：按 scope 订阅对应作用域的持久化偏好，
 * 供 FilterBar（browse/favorites）与 HistoryPanel（history）共用，
 * 保证各处交互、aria 与 toast 提示完全一致。
 */
export function ViewToggle({ scope }: ViewToggleProps) {
  const { t } = useI18n();
  const gridLayout = useStore((s) => s.gridLayouts[scope]);
  const setGridLayout = useStore((s) => s.setGridLayout);

  return (
    <div className="seg" role="group" aria-label={t("filter.viewAria")}>
      <button
        type="button"
        className={`seg__btn ${gridLayout === "grid" ? "is-on" : ""}`}
        aria-pressed={gridLayout === "grid"}
        aria-label={t("filter.viewGrid")}
        title={t("filter.viewGrid")}
        onClick={() => {
          if (gridLayout === "grid") return;
          setGridLayout(scope, "grid");
          toast.info(t("toast.viewGrid"));
        }}
      >
        <LayoutGrid size={13} />
      </button>
      <button
        type="button"
        className={`seg__btn ${gridLayout === "list" ? "is-on" : ""}`}
        aria-pressed={gridLayout === "list"}
        aria-label={t("filter.viewList")}
        title={t("filter.viewList")}
        onClick={() => {
          if (gridLayout === "list") return;
          setGridLayout(scope, "list");
          toast.info(t("toast.viewList"));
        }}
      >
        <List size={13} />
      </button>
    </div>
  );
}
