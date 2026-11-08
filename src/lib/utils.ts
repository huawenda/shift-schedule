// shadcn 组件的 className 合并入口。
//
// `cn` 包内部就是 clsx + tailwind-merge：前者拼条件类名，后者让「后面的类覆盖前面的同名工具类」。
// 组件源码里一律写 `cn(默认类, props.className)`，这样外部传 className 才有覆盖能力。
//
// 与主项目现有 SCSS 类名（.btn / .input …）互不相干：它们不走这条链路，
// 全靠后者在 `@layer utilities` 之外的普通规则优先级。
export { cn } from 'cn'
