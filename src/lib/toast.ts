// 重导出 sonner 的 toast 函数：统一从 ./lib/toast 引入，
// 未来若替换底层库（如改用 react-hot-toast）只需改此文件，
// 所有调用方代码无需改动。
//
// 拆分原因：sonner 的 toast 是函数，不能与 Toaster 组件放在同一文件，
// 否则触发 react/only-export-components 警告，影响开发时 Fast Refresh。
export { toast } from "sonner";
