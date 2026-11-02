/**
 * 花名册数据层统一出口：模型 / 校验与归一化 / 查询 / 命令 / 本人与薪资。
 * 外部一律从 './roster' 引用，不直接进子文件。
 */
export * from './model'
export * from './normalize'
export * from './queries'
export * from './commands'
export * from './self'
