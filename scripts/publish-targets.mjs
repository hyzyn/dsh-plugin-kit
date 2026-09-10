// 全部可发布包的依赖序清单（先 kit/插件，后 dsh-all 聚合层，最后根 bundle）。
// release-publish-all.mjs（手动 OTP 流）与 release-publish-tag.mjs（CI tag 流）共用，
// 新增插件包时在这里补一行即可，两条发布路径同步生效。
export const targets = [
  ['packages/kit', '@hyzyn/dsh-kit'],
  ['packages/codegraph', '@hyzyn/dsh-codegraph'],
  ['packages/env', '@hyzyn/dsh-env'],
  ['packages/mcp', '@hyzyn/dsh-mcp'],
  ['packages/profile', '@hyzyn/dsh-profile'],
  ['packages/prompt', '@hyzyn/dsh-prompt'],
  ['packages/rss', '@hyzyn/dsh-rss'],
  ['packages/search', '@hyzyn/dsh-search'],
  ['packages/docker', '@hyzyn/dsh-docker'],
  ['packages/tty', '@hyzyn/dsh-tty'],
  ['packages/all', '@hyzyn/dsh-all'],
  ['.', '@hyzyn/dsh-plugin-kit'],
]
