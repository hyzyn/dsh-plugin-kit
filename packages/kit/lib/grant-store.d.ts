/** 授权的来源通道：目前只有「带外落地授权文件」这一条（就地提权）。 */
export type CapabilityGrantVia = 'file';
/** 一条已生效的授权记录。 */
export interface CapabilityGrant {
    /** 授权时刻（Unix 秒）。 */
    grantedAt: number;
    /** 授权经由哪条通道。 */
    via: CapabilityGrantVia;
}
/**
 * `capabilityGranted` 需要的**最小**授权存储形状。
 *
 * 为什么用接口而不是直接依赖 `GrantStore`：能力判定是跨包约定（docker / tty 都调），而存储实例
 * 由插件自己造（它知道 `dshHome()`，测试里则指向临时目录）；接口让两边各自演化，测试也能塞一个
 * 只实现 `has` 的假对象。
 */
export interface CapabilityGrantSource {
    has(env: string): boolean;
    source?(env: string): CapabilityGrant | undefined;
}
/**
 * kit 在 DSH 主目录下**自己的**数据目录名。
 *
 * 为什么带归属：DSH 主目录是**所有**所有者共用的平铺目录（官方的 `sessions/` `logs/` `storages/`，
 * 本仓插件的 `tty/` `rss-digest/` `rss.json`）。把 `capability-grants.json` / `grant-confirm/` 这类
 * **描述机制**的名字直接铺在那一层，等于替「集中式能力同意存储」这个位置预设了占用者——DSH 核心
 * 将来加同名目录是完全合理的，那时就是鸠占鹊巢。按拥有者包名收进一级子目录，惯例与 `tty/` 一致。
 * （kit D08。）
 */
export declare const KIT_DIR_NAME = "dsh-kit";
/** 授权文件名（放在 kit 自己的目录下）。 */
export declare const GRANT_FILE_NAME = "capability-grants.json";
/** 就地提权等待确认文件的子目录名（`elevation.ts` 用；路径由 `capabilityPaths` 统一拼）。 */
export declare const CONFIRM_DIR_NAME = "grant-confirm";
/**
 * 覆写 kit 数据目录的环境变量（**测试 / 诊断用**，不是给用户调的旋钮）。kit D12。
 *
 * 为什么需要它：真宿主验收（`scripts/live-host-smoke.mjs`）里有一个「宿主没授权」的实例，
 * 而它**必须**跑在用户真实的 DSH 主目录下（profile 里的 `node_modules` 是指向本仓的**相对**
 * 符号链接，换 `DSH_HOME` 会让插件整批失联）。可带外授权是**持久**的：用户只要在卡片上
 * 授权过一次，那个「无授权实例」就会继承下来——2026-09-27 实测，A 段 9 条断言全红，
 * 而红的理由与产品行为无关（它其实已授权）。那正是本仓最忌讳的一类闸门：**恒红且理由错**，
 * 跑几次之后没人再看它，于是真正的回归也一起被无视。
 *
 * 有了这个覆写，验收把两个实例的授权目录各自指到一个空目录，前提重新成立。
 * **它不是新的权限口子**：能设置宿主环境变量的人，本来就能用启动环境变量那条通道
 * 直接授权（那条通道比这个更强）；这里只是把「授权落在哪个目录」也变成可注入的。
 */
export declare const KIT_HOME_ENV = "DSH_KIT_HOME";
/**
 * kit 在 DSH 主目录下的落盘布局。
 *
 * 存在的理由：落点原来是**两处各拼一遍**（存储自己拼文件名、插件自己 `join(dshHome(), 'grant-confirm')`），
 * 改了目录名就会漂一半——那正是本仓最忌讳的「配了没反应」的路径版。
 */
export interface CapabilityPaths {
    /** kit 的数据目录（`<DSH home>/dsh-kit`）。 */
    dir: string;
    /** 授权文件（`<dir>/capability-grants.json`）。 */
    grantsFile: string;
    /** 就地提权的确认目录（`<dir>/grant-confirm`）。 */
    confirmDir: string;
}
/** 拼出 kit 的落盘布局。**路径只在这里拼一次**，消费方不要再自己 `join(dshHome(), …)`。 */
export declare function capabilityPaths(dshHomeDir: string): CapabilityPaths;
/**
 * 授权存储。**构造不碰磁盘**（文件不存在时第一次 `has()` 才是空表），首次查询时读一次盘。
 *
 * @param dir - 放授权文件的目录。正常走 `capabilityPaths(dshHome()).dir`；测试传临时目录。
 *   本类**只拥有这个目录**（缺就建、建了才 chmod），不去动 DSH 主目录本身的权限。
 */
export declare class GrantStore implements CapabilityGrantSource {
    private readonly dir;
    private loaded;
    private readonly records;
    constructor(dir: string);
    /** 授权文件路径（审计文案与测试断言都用它，避免各处各拼一遍）。 */
    path(): string;
    has(env: string): boolean;
    source(env: string): CapabilityGrant | undefined;
    /** 记一条授权并落盘（本进程内即时可见）。 */
    grant(env: string, via?: CapabilityGrantVia): void;
    /** 撤销授权并落盘；**没记录就不写盘**（空操作不该新建文件 / 刷 mtime）。 */
    revoke(env: string): void;
    /** 读盘一次并缓存。文件不存在 = 空表。 */
    private load;
    private flush;
}
/**
 * **仅供测试**：清掉共享实例的进程内 memo（连带它们缓存的授权表）。
 *
 * 为什么必须有：`sharedGrantStore` 的记忆是**进程级**的（这正是它要修的 bug），而测试恰恰需要
 * 「每个用例一份干净状态」——只删授权文件是不够的，内存里那份缓存还在。真实宿主不该调用它：
 * 那里一个进程只该有、也只有一个实例。
 */
export declare function __resetSharedGrantStoresForTest(): void;
/** 取这个目录的共享授权存储（同一目录多次调用返回**同一个**实例；见上面的 D11）。 */
export declare function sharedGrantStore(dir: string): GrantStore;
