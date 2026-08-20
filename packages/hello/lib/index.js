import { definePlugin } from '@hyzyn/dsh-kit';
const plugin = definePlugin({
    name: 'hello',
    inject: [],
    apply(ctx, config) {
        if (config?.announce === false)
            return;
        // 模板只演示挂载点；真实插件在这里从 ctx 取服务，例如：
        //   const tools = ctx.get('tools')
        // 或声明式注入（inject 数组 + ctx.<name>）：
        //   inject: ['tools', 'webServer'] → ctx.tools / ctx.webServer
        console.log('[dsh-plugin-kit/hello] mounted');
    },
});
export const { name, inject, apply } = plugin;
//# sourceMappingURL=index.js.map