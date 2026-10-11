import { definePlugin, dshHome, getService } from '@hyzyn/dsh-kit';
const plugin = definePlugin({
    name: 'loglens',
    inject: [],
    apply(ctx, config) {
        if (config?.announce === false)
            return;
        // 取宿主服务用 kit 的 getService：先 ctx.get(name)，未注册再回退属性访问；
        // 真实插件会换成 webServer / credentials / tools 等（也可声明式 inject）。
        const tools = getService(ctx, 'tools');
        // 配置目录统一由 dshHome() 推导（DSH_HOME 优先，否则 ~/.dsh），不要自己拼路径。
        const home = dshHome();
        console.log(`[dsh-loglens] mounted（home=${home}，tools ${tools === undefined ? '未就绪' : '已就绪'}）`);
    },
});
export const { name, inject, apply } = plugin;
//# sourceMappingURL=index.js.map