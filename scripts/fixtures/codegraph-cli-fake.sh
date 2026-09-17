#!/bin/sh
# 验证用夹具：假 codegraph CLI。
#
# 目的：`@hyzyn/dsh-codegraph` 的 `indexForce` 是**安装级** config（只走 plugin config，
# 不进 settings schema），它的语义是给 `codegraph index` 追加 `--force` —— 而真 CLI 在没有
# `--force` 时会拒绝把家目录 / 文件系统根当项目索引。要端到端验这件事，用真 CLI 就必须
# 去索引真实的 home（重且危险），所以这里用一个只记录 argv 的假 CLI。
#
# 行为：
#   - 无论什么调用，先把 argv 追加到 $CG_FAKE_LOG（默认 /tmp/cg-fake-argv.log）；
#   - `index` 带 `--force` → 退出 0；
#   - `index` 不带 `--force` → 退出 1 并打出拒绝文案（模拟真 CLI 的行为）；
#   - 其余子命令（--version / status 之类）→ 退出 0 并给个 benign 输出，免得插件挂载时的
#     探测把插件判成不可用。
LOG="${CG_FAKE_LOG:-/tmp/cg-fake-argv.log}"
printf '%s\n' "$*" >> "$LOG"

case "$1" in
  index)
    case " $* " in
      *" --force "*)
        echo "fake-codegraph: indexed with --force"
        exit 0
        ;;
      *)
        echo "fake-codegraph: refusing to index the home directory without --force" >&2
        exit 1
        ;;
    esac
    ;;
  status)
    echo '{"indexed":true}'
    exit 0
    ;;
  *)
    echo '{}'
    exit 0
    ;;
esac
