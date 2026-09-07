// markdown-it-texmath 未自带 TS 类型,这里补一个最小声明(仅用到 md.use 处的插件签名)。
declare module "markdown-it-texmath" {
    const texmath: (md: any, options?: Record<string, unknown>) => void;
    export default texmath;
}
