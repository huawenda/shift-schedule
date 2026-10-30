/** 读 `--name=value` 形式的命令行参数，没传就返回 fallback */
export function readArg(name, fallback) {
  const prefix = `--${name}=`
  const found = process.argv.find(arg => arg.startsWith(prefix))
  return found ? found.slice(prefix.length) : fallback
}
