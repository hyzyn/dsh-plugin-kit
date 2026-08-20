import type { Context } from '@deepseek-ai/cordis';
export declare const name = "profile-manager";
export declare const inject: string[];
export interface Config {
    enabled?: boolean;
    announceToAgent?: boolean;
}
export declare function apply(ctx: Context, config?: Config): void;
