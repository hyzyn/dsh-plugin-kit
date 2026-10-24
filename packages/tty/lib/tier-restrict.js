/**
 * 实现已上收到 kit（`packages/kit/src/tier-restrict.ts`）；本文件仅为兼容转发，维护者确认后可删。
 *
 * 为什么留空壳而不是直接删：**删除 / 改名任何文件属「先问」项**（AGENTS.md § 不可逆的边界），
 * 这一刀只做「搬家 + 多一个消费者」，不该顺手把删文件塞进来。
 *
 * tty 自己的接线与用例已改为直接引 `@hyzyn/dsh-kit`：
 *   - `src/index.ts` 的 `attachTierRestrict`；
 *   - `test/restrict-probe.test.ts` 的 `shouldRestrictForTier` / `tierRestrictedNames`。
 * 旧路径 `../src/tier-restrict.js` 由这里继续提供同一组导出（`export *` 转发到 kit 的公开面）。
 */
export * from '@hyzyn/dsh-kit';
//# sourceMappingURL=tier-restrict.js.map