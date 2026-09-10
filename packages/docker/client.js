"use strict";(()=>{var Xe=`/* eslint-disable */
/**
 * @hyzyn/dsh-docker \u2014 \u9762\u677F\u6837\u5F0F\u8868\u3002
 *
 * \u8BBE\u8BA1\u7EA6\u5B9A\uFF08\u6539\u6837\u5F0F\u524D\u5148\u8BFB\u8FD9\u6BB5\uFF09\uFF1A
 *   - \u989C\u8272/\u8FB9\u6846/\u9634\u5F71\u4E00\u5F8B\u8D70 DSH \u5B98\u65B9 token\uFF08--dsw-*\uFF09\uFF0C\u76AE\u80A4\u5207\u6362\u81EA\u52A8\u8DDF\u968F\uFF1B
 *   - \u51E0\u4F55\uFF08\u5706\u89D2 / \u63A7\u4EF6\u9AD8\u5EA6 / \u95F4\u8DDD\uFF09\u7EDF\u4E00\u7528 --dk-* \u4EE4\u724C\uFF0C\u7981\u6B62\u5728\u89C4\u5219\u91CC\u5199\u9B54\u6CD5\u6570\u5B57\uFF1B
 *   - \u4E09\u6863\u5C42\u7EA7\uFF1Abase\uFF08\u9762\u677F\u5E95\uFF09\u2192 layer-2\uFF08\u680F / \u5361\u7247\u5E95\uFF09\u2192 layer-3\uFF08\u884C / \u8F93\u5165\u5E95\uFF09\uFF1B
 *   - \u4EA4\u4E92\u5143\u7D20\u5FC5\u987B\u6709 hover / active / :focus-visible / :disabled \u56DB\u6001\uFF1B
 *   - \u72B6\u6001\u8272\u53EA\u7528\u5728\u5FBD\u7AE0\u4E0E\u8FDB\u5EA6\u6761\u4E0A\uFF0C\u6B63\u6587\u4FDD\u6301\u4E2D\u6027\uFF0C\u907F\u514D\u5F69\u8272\u566A\u97F3\u3002
 *
 * \u7531 scripts/build-client.mjs \u4EE5 text loader \u5185\u8054\u8FDB client.js\u3002
 */

/* ============================ \u8BBE\u8BA1\u4EE4\u724C ============================ */

/*
 * \u4EE4\u724C\u58F0\u660E\u5728 :where(html, body) \u4E0A\u2014\u2014\u4E0D\u80FD\u53EA\u653E :root\uFF1ADSH \u7684\u660E\u6697\u4E3B\u9898\u6302\u5728
 * body[data-ds-dark-theme] \u4E0A\u8986\u76D6 --dsw-*\uFF0C\u800C var() \u5728\u300C\u58F0\u660E\u5B83\u7684\u5143\u7D20\u300D\u4E0A\u5C31
 * \u5B8C\u6210\u66FF\u6362\uFF1B\u53EA\u5728 :root \u58F0\u660E\u4F1A\u6C38\u8FDC\u62FF\u5230\u6D45\u8272\u503C\u3002
 */
:where(html, body) {
  --dk-r-xs: 4px;
  --dk-r-sm: 6px;
  --dk-r-md: 8px;
  --dk-r-lg: 10px;
  --dk-r-xl: 12px;
  --dk-r-pill: 999px;
  --dk-h-sm: 24px;
  --dk-h-md: 28px;
  --dk-h-lg: 32px;
  --dk-gap-xs: 4px;
  --dk-gap-sm: 6px;
  --dk-gap-md: 8px;
  --dk-gap-lg: 12px;
  --dk-gap-xl: 16px;
  /* \u8BBE\u7F6E\u5361\u7247\u6807\u9898\u884C\u5185\u8FB9\u8DDD\uFF1A\u5BF9\u9F50 DSH \u5185\u7F6E\u5361\u7247 / \u5176\u4ED6\u63D2\u4EF6\u5361\u7247\uFF08pM_pluginCard\u3001tt_card\uFF09 */
  --dk-pad-cardHead: 14px 16px;
  --dk-mono: "SF Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  --dk-ease: cubic-bezier(.2, .8, .2, 1);
  --dk-dur: .16s;
  --dk-accent: var(--dsw-alias-state-business-primary, #4d6bfe);
  --dk-danger: var(--dsw-alias-state-error-primary, #d1242f);
  --dk-success: var(--dsw-alias-state-success-primary, #1a7f37);
  --dk-warn: var(--dsw-alias-state-warn-primary, #bf8700);
  --dk-border: var(--dsw-alias-border-l1, rgba(127, 127, 127, .22));
  --dk-border-strong: var(--dsw-alias-border-l2, rgba(127, 127, 127, .32));
  --dk-hover: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, .1));
  --dk-hover-solid: var(--dsw-alias-interactive-bg-hover-solid, rgba(127, 127, 127, .16));
  --dk-label: var(--dsw-alias-label-primary, #1a1a1a);
  --dk-label-2: var(--dsw-alias-label-secondary, #555);
  --dk-label-dimmed: var(--dsw-alias-label-dimmed, var(--dk-label-3));
  --dk-label-3: var(--dsw-alias-label-tertiary, #888);
  --dk-surface: var(--dsw-alias-bg-base, #fff);
  --dk-surface-solid: var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-base, #fff));
  --dk-surface-2: var(--dsw-alias-bg-layer-2, #f2f2f2);
  --dk-surface-3: var(--dsw-alias-bg-layer-3, #e8e8e8);
  --dk-input: var(--dsw-specific-input-major, var(--dsw-alias-bg-base, #fff));
  --dk-shadow: 0 16px 40px -12px rgba(0, 0, 0, .32), var(--dsw-shadow-lv3, 0 4px 12px rgba(0, 0, 0, .12));
  --dk-shadow-lg: 0 32px 72px -24px rgba(0, 0, 0, .48), 0 2px 8px rgba(0, 0, 0, .16);
  --dk-ring: 0 0 0 2px color-mix(in srgb, var(--dk-accent) 42%, transparent);
  --dk-log-bg: #0b0e14;
  --dk-log-fg: #d7dce5;
}

/* ============================ \u901A\u7528 ============================ */

.dk_backdrop ::selection,
.dk_card ::selection {
  background: color-mix(in srgb, var(--dk-accent) 32%, transparent);
}

.dk_backdrop *,
.dk_card *,
[data-dsh-docker-entry] {
  scrollbar-width: thin;
  scrollbar-color: var(--dk-border-strong) transparent;
}

.dk_backdrop *::-webkit-scrollbar,
.dk_card *::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

.dk_backdrop *::-webkit-scrollbar-thumb,
.dk_card *::-webkit-scrollbar-thumb {
  background: var(--dk-border-strong);
  border: 3px solid transparent;
  border-radius: var(--dk-r-pill);
  background-clip: content-box;
}

/* ============================ \u4FA7\u8FB9\u680F\u5165\u53E3 ============================ */

[data-dsh-docker-entry] {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--dk-gap-md);
  width: 100%;
  height: var(--dk-h-lg);
  padding: 0 var(--dk-gap-lg);
  border-radius: var(--dk-r-md);
  color: var(--dk-label-2);
  font-size: 13px;
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
  transition: background var(--dk-dur) var(--dk-ease), color var(--dk-dur) var(--dk-ease);
}

[data-dsh-docker-entry]:hover {
  background: var(--dk-hover);
  color: var(--dk-label);
}

[data-dsh-docker-entry]:focus-visible {
  outline: none;
  box-shadow: var(--dk-ring);
}

.dk_entryIcon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  color: currentColor;
}

.dk_entryLabel {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* \u4FA7\u8FB9\u680F\u6298\u53E0\uFF08DSH \u5916\u58F3\u5728\u7956\u5148\u5143\u7D20\u4E0A\u6253 data-sidebar-collapsed\uFF09\uFF1A\u53EA\u7559\u56FE\u6807\uFF0C
   \u4E0E tty \u7684\u7EC8\u7AEF\u5165\u53E3\u540C\u5F62\u2014\u2014\u5426\u5219\u6807\u7B7E\u4F1A\u4ECE\u7A84\u680F\u91CC\u6EA2\u51FA\u4E00\u6761\u7AD6\u6761 */
[data-sidebar-collapsed] [data-dsh-docker-entry] {
  justify-content: center;
  width: 100%;
  padding: 0;
  margin: 0;
}

[data-sidebar-collapsed] .dk_entryLabel {
  display: none;
}

[data-sidebar-collapsed] .dk_entryBadge {
  margin-left: 0;
  padding-left: 0;
}

.dk_entryBadge {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: var(--dk-gap-xs);
  font-size: 11px;
  color: var(--dk-label-3);
  font-variant-numeric: tabular-nums;
}

.dk_entryDot {
  width: 6px;
  height: 6px;
  border-radius: var(--dk-r-pill);
  background: var(--dk-label-3);
}

.dk_entryDot[data-state="ok"] { background: var(--dk-success); }
.dk_entryDot[data-state="error"] { background: var(--dk-danger); }
.dk_entryDot[data-state="loading"] { background: var(--dk-warn); }

/* ============================ \u5F39\u7A97\u9AA8\u67B6 ============================ */

.dk_backdrop {
  position: fixed;
  inset: 0;
  z-index: 2140;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(8px, 3vh, 32px);
  background: color-mix(in srgb, #000 42%, transparent);
  backdrop-filter: blur(2px);
  animation: dk_fade var(--dk-dur) var(--dk-ease);
}

@keyframes dk_fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

.dk_panel {
  display: flex;
  flex-direction: column;
  width: min(1180px, 100%);
  height: min(820px, 100%);
  min-height: 420px;
  overflow: hidden;
  border: 1px solid var(--dk-border-strong);
  border-radius: var(--dk-r-xl);
  background: var(--dk-surface-solid);
  color: var(--dk-label);
  box-shadow: var(--dk-shadow-lg);
  font-size: 13px;
  line-height: 1.5;
}

/*
 * dock \u6A21\u5F0F\uFF080.3.0\uFF09\uFF1A\u9762\u677F\u957F\u5728 tty \u9762\u677F\u7684\u53F3\u4FA7\u6302\u8F7D\u4F4D\u91CC\uFF0C\u6491\u6EE1\u5BBF\u4E3B\u5373\u53EF\u2014\u2014
 * \u5916\u6846 / \u5706\u89D2 / \u9634\u5F71 / \u6700\u5C0F\u9AD8\u5EA6\u90FD\u662F\u300C\u72EC\u7ACB\u5F39\u7A97\u300D\u7684\u88C5\u9970\uFF0C\u6302\u5728\u522B\u4EBA\u680F\u91CC\u8981\u5168\u53BB\u6389\u3002
 */
.dk_panelDock {
  width: 100%;
  height: 100%;
  min-height: 0;
  border: none;
  border-radius: 0;
  box-shadow: none;
}

/* ---- \u4EA4\u4E92\u5F0F\u7EC8\u7AEF\u62BD\u5C49\uFF08ttyTerminal.mount \u5C31\u5730\u5D4C\u5165\uFF0C0.15.0\uFF09 ---- */
.dk_drawer {
  position: relative; /* \u9876\u90E8\u62D6\u62FD\u6761\u7684\u5B9A\u4F4D\u57FA\u51C6 */
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  height: min(46%, 380px);
  min-height: 180px;
  border-top: 1px solid var(--dk-border-strong);
  background: var(--dk-surface-2);
  animation: dk_drawerIn var(--dk-dur) var(--dk-ease);
}

/* \u62D6\u62FD\u6761\uFF1A\u8D34\u7740\u62BD\u5C49\u4E0A\u6CBF\uFF0C\u9F20\u6807\u8FDB\u5165\u624D\u663E\u5F62\uFF08\u5E38\u6001\u4E0D\u6253\u6270\u7EC8\u7AEF\u5185\u5BB9\uFF09 */
.dk_drawerResize {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 2;
  height: 5px;
  cursor: ns-resize;
}

.dk_drawerResize:hover { background: color-mix(in srgb, var(--dk-accent) 55%, transparent); }

/*
 * \u6298\u53E0\uFF1A\u53EA\u628A\u62BD\u5C49\u538B\u5230\u6807\u9898\u680F\u9AD8\u5EA6\uFF08\u6B63\u6587\u9690\u85CF\uFF09\uFF0C**\u4E0D\u5378\u8F7D**\u6302\u8F7D\u70B9\u2014\u2014tty \u90A3\u8FB9\u7684
 * xterm \u4E0E PTY \u4F1A\u8BDD\u7167\u65E7\u8DD1\u7740\uFF0C\u5C55\u5F00\u5373\u539F\u6837\u56DE\u6765\u3002
 */
.dk_drawer[data-collapsed="1"] {
  height: auto; /* \u53EA\u5269\u6807\u9898\u680F\uFF08\u6B63\u6587 display:none\uFF09\uFF0C\u522B\u5199\u6B7B\u9AD8\u5EA6\uFF1Aheader \u662F\u5185\u5BB9\u76D2 + \u5185\u8FB9\u8DDD */
  min-height: 0;
}

.dk_drawer[data-collapsed="1"] .dk_drawerResize,
.dk_drawer[data-collapsed="1"] .dk_drawerBody { display: none; }

.dk_drawerFold .dk_iconGlyph { transition: transform var(--dk-dur) var(--dk-ease); }
.dk_drawer[data-collapsed="1"] .dk_drawerFold .dk_iconGlyph { transform: rotate(180deg); }

@keyframes dk_drawerIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
}

.dk_drawerHead {
  display: flex;
  align-items: center;
  gap: var(--dk-gap-md);
  flex: 0 0 auto;
  min-height: 34px;
  padding: var(--dk-gap-xs) var(--dk-gap-lg);
  border-bottom: 1px solid var(--dk-border);
}

.dk_drawerIcon {
  display: inline-flex;
  flex: none;
  color: var(--dk-accent);
}

.dk_drawerTitle {
  min-width: 0;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dk_drawerHint {
  flex: none;
  color: var(--dk-label-3);
  font-size: 11px;
  white-space: nowrap;
}

/* \u6302\u8F7D\u70B9\uFF1Atty \u4F1A\u5F80\u91CC\u585E\u4E00\u4E2A\u7EDD\u5BF9\u5B9A\u4F4D\u7684 .tt_term\uFF08\u590D\u7528\u7EC8\u7AEF\u9762\u677F\u540C\u4E00\u5957\u6837\u5F0F\uFF09 */
.dk_drawerBody {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  background: var(--dk-log-bg);
}

.dk_header {
  display: flex;
  align-items: center;
  gap: var(--dk-gap-md);
  flex: 0 0 auto;
  flex-wrap: wrap;
  min-height: 44px;
  padding: var(--dk-gap-sm) var(--dk-gap-lg);
  border-bottom: 1px solid var(--dk-border);
  background: var(--dk-surface-2);
}

/* \u8BE6\u60C5\u5934\uFF1A\u8FD4\u56DE + \u5BB9\u5668\u540D + \u72B6\u6001 + \u76EE\u6807\u4E3B\u673A +\uFF08\u65E5\u5FD7\u9875\u5DE5\u5177\u6761\uFF09+ \u5173\u95ED */
.dk_headerDetail { gap: var(--dk-gap-sm); }

.dk_logTools {
  display: flex;
  align-items: center;
  gap: var(--dk-gap-sm);
  flex-wrap: wrap;
}

.dk_titleIcon {
  display: inline-flex;
  align-items: center;
  color: var(--dk-accent);
}

.dk_title {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: .2px;
}

.dk_headerSpacer { flex: 1 1 auto; }

.dk_iconBtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--dk-h-md);
  height: var(--dk-h-md);
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--dk-r-sm);
  background: transparent;
  color: var(--dk-label-2);
  cursor: pointer;
  transition: background var(--dk-dur) var(--dk-ease), color var(--dk-dur) var(--dk-ease);
}

.dk_iconBtn:hover { background: var(--dk-hover); color: var(--dk-label); }
.dk_iconBtn:focus-visible { outline: none; box-shadow: var(--dk-ring); }
.dk_iconBtn:disabled { opacity: .45; cursor: not-allowed; }

/*
 * \u5237\u65B0\u4E2D\u7684\u56FE\u6807\u81EA\u5DF1\u8F6C\uFF08data-spin \u7531\u5404\u5904\u7684 refresh \u6309\u94AE\u6309 loading \u6253\uFF09\uFF1A
 * \u6BD4\u5728\u6309\u94AE\u65C1\u8FB9\u53E6\u6302\u4E00\u4E2A\u72EC\u7ACB spinner \u76F4\u89C2\u2014\u2014\u7528\u6237\u521A\u70B9\u7684\u5C31\u662F\u8FD9\u9897\u3002
 */
.dk_iconBtn[data-spin="1"] { color: var(--dk-accent); }
.dk_iconBtn[data-spin="1"] > span { animation: dk_spin .8s linear infinite; }

/* ============================ \u5DE5\u5177\u680F ============================ */

.dk_toolbar {
  display: flex;
  align-items: center;
  gap: var(--dk-gap-md);
  flex: 0 0 auto;
  flex-wrap: wrap;
  padding: var(--dk-gap-md) var(--dk-gap-lg);
  border-bottom: 1px solid var(--dk-border);
}

.dk_select,
.dk_input {
  height: var(--dk-h-lg);
  padding: 0 var(--dk-gap-md);
  border: 1px solid var(--dk-border-strong);
  border-radius: var(--dk-r-sm);
  background: var(--dk-input);
  color: var(--dk-label);
  font-size: 13px;
  font-family: inherit;
  transition: border-color var(--dk-dur) var(--dk-ease), box-shadow var(--dk-dur) var(--dk-ease);
}

.dk_input { min-width: 180px; }
.dk_select:focus-visible,
.dk_input:focus-visible {
  outline: none;
  border-color: var(--dk-accent);
  box-shadow: var(--dk-ring);
}

.dk_search { flex: 1 1 200px; min-width: 160px; }

/* \u5DE5\u5177\u6761\u91CC\u7684\u7ED3\u679C\u8BA1\u6570\uFF08\u955C\u50CF\uFF1A23 / 23 \u4E2A\u955C\u50CF\uFF09\uFF1A\u522B\u88AB\u538B\u7F29\uFF0C\u6570\u5B57\u7B49\u5BBD */
.dk_searchCount { flex: none; font-variant-numeric: tabular-nums; }

.dk_seg {
  display: inline-flex;
  padding: 2px;
  border: 1px solid var(--dk-border);
  border-radius: var(--dk-r-md);
  background: var(--dk-surface-2);
}

.dk_segBtn {
  height: var(--dk-h-sm);
  padding: 0 var(--dk-gap-md);
  border: none;
  border-radius: var(--dk-r-xs);
  background: transparent;
  color: var(--dk-label-2);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: background var(--dk-dur) var(--dk-ease), color var(--dk-dur) var(--dk-ease);
}

.dk_segBtn:hover { color: var(--dk-label); }
.dk_segBtn[data-on="1"] {
  background: var(--dk-surface-solid);
  color: var(--dk-label);
  box-shadow: 0 1px 2px rgba(0, 0, 0, .12);
}

.dk_check {
  display: inline-flex;
  align-items: center;
  gap: var(--dk-gap-sm);
  font-size: 12px;
  color: var(--dk-label-2);
  cursor: pointer;
  user-select: none;
}

.dk_check input { accent-color: var(--dk-accent); }

/* ============================ \u6309\u94AE ============================ */

.dk_btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--dk-gap-sm);
  height: var(--dk-h-md);
  padding: 0 var(--dk-gap-lg);
  border: 1px solid var(--dk-border-strong);
  border-radius: var(--dk-r-sm);
  background: var(--dk-surface-solid);
  color: var(--dk-label);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
  transition: background var(--dk-dur) var(--dk-ease), border-color var(--dk-dur) var(--dk-ease), color var(--dk-dur) var(--dk-ease);
}

.dk_btn:hover { background: var(--dk-hover); }
.dk_btn:active { background: var(--dk-hover-solid); }
.dk_btn:focus-visible { outline: none; box-shadow: var(--dk-ring); }
.dk_btn:disabled { opacity: .45; cursor: not-allowed; }

.dk_btnPrimary {
  border-color: transparent;
  background: var(--dk-accent);
  color: #fff;
}

.dk_btnPrimary:hover { background: color-mix(in srgb, var(--dk-accent) 86%, #000); }

.dk_btnDanger { border-color: color-mix(in srgb, var(--dk-danger) 40%, transparent); color: var(--dk-danger); }
.dk_btnDanger:hover { background: color-mix(in srgb, var(--dk-danger) 12%, transparent); }

/* ============================ \u4E3B\u4F53 / \u5BB9\u5668\u5361\u7247 ============================ */

.dk_body {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
}

.dk_main {
  flex: 1 1 auto;
  min-width: 0;
  overflow: auto;
  padding: var(--dk-gap-lg);
}

.dk_grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--dk-gap-lg);
}

.dk_card {
  display: flex;
  flex-direction: column;
  gap: var(--dk-gap-sm);
  padding: var(--dk-gap-lg);
  border: 1px solid var(--dk-border);
  border-radius: var(--dk-r-lg);
  background: var(--dk-surface-solid);
  cursor: pointer;
  transition: border-color var(--dk-dur) var(--dk-ease), box-shadow var(--dk-dur) var(--dk-ease), transform var(--dk-dur) var(--dk-ease);
}

.dk_card:hover {
  border-color: var(--dk-border-strong);
  box-shadow: var(--dk-shadow);
}

.dk_card:focus-visible { outline: none; box-shadow: var(--dk-ring); }

.dk_card[data-selected="1"] {
  border-color: var(--dk-accent);
  box-shadow: var(--dk-ring);
}

.dk_cardHead {
  display: flex;
  align-items: center;
  gap: var(--dk-gap-sm);
  min-width: 0;
}

.dk_cardName {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dk_cardRows {
  display: flex;
  flex-direction: column;
  gap: var(--dk-gap-xs);
  margin-top: var(--dk-gap-xs);
}

.dk_cardRow {
  display: grid;
  grid-template-columns: 44px 1fr;
  gap: var(--dk-gap-md);
  align-items: baseline;
  font-size: 12px;
}

.dk_cardLabel {
  color: var(--dk-label-3);
}

.dk_cardValue {
  min-width: 0;
  color: var(--dk-label-2);
  font-family: var(--dk-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dk_actionBar {
  display: flex;
  gap: var(--dk-gap-xs);
  margin-top: var(--dk-gap-sm);
  padding-top: var(--dk-gap-sm);
  border-top: 1px solid var(--dk-border);
}

.dk_actionBar .dk_iconBtn {
  border: 1px solid var(--dk-border);
  background: var(--dk-surface-2);
}

.dk_actionBar .dk_iconBtn:hover:not(:disabled) {
  background: var(--dk-hover-solid);
  color: var(--dk-label);
}

/* \u300C\u67E5\u770B\u300D\u4E0E\u300C\u53D8\u66F4\u300D\u4E24\u7EC4\u4E4B\u95F4\u7684\u7AD6\u7EBF\u5206\u9694 */
.dk_actionBarSep {
  flex: none;
  width: 1px;
  margin: 4px var(--dk-gap-sm);
  background: var(--dk-border-strong);
}

/* \u5220\u9664\u662F\u7834\u574F\u6027\u4E14\u4E0D\u53EF\u6062\u590D\uFF1A\u5728\u53D8\u66F4\u7EC4\u5185\u518D\u989D\u5916\u7559\u4E00\u70B9\u8DDD\u79BB\uFF0C\u522B\u548C\u300C\u91CD\u542F\u300D\u6328\u7740\u70B9\u9519 */
.dk_actionBar .dk_iconBtnDanger {
  margin-left: var(--dk-gap-xs);
}

.dk_iconBtnDanger { color: var(--dk-danger); }
.dk_iconBtnDanger:hover:not(:disabled) { background: color-mix(in srgb, var(--dk-danger) 14%, transparent); }

.dk_iconGlyph { display: inline-flex; align-items: center; }

/* ============================ \u5FBD\u7AE0 ============================ */

.dk_badge {
  display: inline-flex;
  align-items: center;
  gap: var(--dk-gap-xs);
  height: 20px;
  padding: 0 var(--dk-gap-sm);
  border-radius: var(--dk-r-pill);
  border: 1px solid var(--dk-border-strong);
  background: var(--dk-surface-2);
  color: var(--dk-label-2);
  font-size: 11px;
  line-height: 1;
  white-space: nowrap;
}

.dk_badge::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: var(--dk-r-pill);
  background: currentColor;
  opacity: .8;
}

.dk_badge[data-state="running"] { color: var(--dk-success); border-color: color-mix(in srgb, var(--dk-success) 36%, transparent); background: color-mix(in srgb, var(--dk-success) 10%, transparent); }
.dk_badge[data-state="exited"] { color: var(--dk-label-3); }
.dk_badge[data-state="paused"] { color: var(--dk-warn); border-color: color-mix(in srgb, var(--dk-warn) 36%, transparent); background: color-mix(in srgb, var(--dk-warn) 10%, transparent); }
.dk_badge[data-state="restarting"] { color: var(--dk-warn); }
.dk_badge[data-state="dead"] { color: var(--dk-danger); border-color: color-mix(in srgb, var(--dk-danger) 36%, transparent); background: color-mix(in srgb, var(--dk-danger) 10%, transparent); }
.dk_badge[data-state="unhealthy"] { color: var(--dk-danger); }
.dk_badge[data-state="created"] { color: var(--dk-label-2); }
.dk_badge[data-state="unknown"] { color: var(--dk-label-3); }

.dk_tag {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 var(--dk-gap-sm);
  border-radius: var(--dk-r-xs);
  background: var(--dk-surface-3);
  color: var(--dk-label-2);
  font-size: 11px;
}

/* ============================ \u5BB9\u5668\u8BE6\u60C5\uFF08\u6574\u680F\uFF09 ============================ */

.dk_detail {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
}


.dk_detailTitle {
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dk_detailSub {
  flex: none;
  color: var(--dk-label-3);
  font-size: 11px;
  font-family: var(--dk-mono);
}

.dk_tabs {
  display: flex;
  align-items: center;
  gap: var(--dk-gap-xs);
  flex: 0 0 auto;
  padding: 0 var(--dk-gap-lg);
  border-bottom: 1px solid var(--dk-border);
}

.dk_filterBar {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--dk-gap-md);
  flex: 1 1 auto;
  min-width: 0;
  /* \u53F3\u4FA7\u7ED9\u8BA1\u6570\u7559\u56FA\u5B9A\u69FD\uFF0892px \u2248 4 \u4F4D\u6570 + \u300C\u884C\u5339\u914D\u300D\uFF09\uFF0C\u8F93\u5165\u6846\u5BBD\u5EA6\u56E0\u6B64\u6052\u5B9A */
  padding: var(--dk-gap-xs) 92px var(--dk-gap-xs) 0;
}

.dk_tab {
  height: var(--dk-h-lg);
  padding: 0 var(--dk-gap-md);
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--dk-label-2);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
}

.dk_tab:hover { color: var(--dk-label); }
.dk_tab[data-on="1"] { color: var(--dk-label); border-bottom-color: var(--dk-accent); }

.dk_detailBody {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: auto;
  padding: var(--dk-gap-lg);
}

/* ============================ \u65E5\u5FD7\u89C6\u56FE ============================ */

.dk_logs {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  margin: calc(-1 * var(--dk-gap-lg));
}


.dk_toolLabel {
  color: var(--dk-label-3);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: .4px;
}

.dk_selectSm { height: var(--dk-h-md); padding: 0 var(--dk-gap-sm); font-size: 12px; }

.dk_pill {
  min-width: 44px;
  height: var(--dk-h-md);
  padding: 0 var(--dk-gap-md);
  border: 1px solid var(--dk-border-strong);
  border-radius: var(--dk-r-pill);
  background: var(--dk-surface-2);
  color: var(--dk-label-3);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: background var(--dk-dur) var(--dk-ease), color var(--dk-dur) var(--dk-ease), border-color var(--dk-dur) var(--dk-ease);
}

.dk_pill:hover { background: var(--dk-hover); }
.dk_pill:focus-visible { outline: none; box-shadow: var(--dk-ring); }

.dk_pill[data-on="1"] {
  border-color: color-mix(in srgb, var(--dk-success) 46%, transparent);
  background: color-mix(in srgb, var(--dk-success) 16%, transparent);
  color: var(--dk-success);
  font-weight: 600;
}


/* \u8FC7\u6EE4\u8F93\u5165\u6846\u5E38\u9A7B\uFF1B\u6E05\u7A7A\u6309\u94AE\u6D6E\u5728\u6846\u5185\u53F3\u4FA7\uFF08\u7EDD\u5BF9\u5B9A\u4F4D \u2192 \u51FA\u73B0/\u6D88\u5931\u90FD\u4E0D\u6324\u52A8\u5E03\u5C40\uFF09 */
.dk_filterWrap {
  position: relative;
  display: flex;
  flex: 1 1 200px;
  min-width: 0;
}

.dk_filterInput {
  flex: 1 1 auto;
  height: var(--dk-h-md);
  min-width: 0;
  /* \u5E38\u9A7B\u53F3\u4FA7\u5185\u8FB9\u8DDD\u7ED9\u6E05\u9664\u6309\u94AE\u7559\u4F4D\uFF1A\u5185\u8FB9\u8DDD\u8DDF\u7740\u5185\u5BB9\u53D8\u4F1A\u6539 flex \u57FA\u51C6\uFF0C\u53CD\u800C\u6324\u52A8\u8F93\u5165\u6846 */
  padding-right: 28px;
}

.dk_filterClear {
  position: absolute;
  top: 50%;
  right: 4px;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: var(--dk-r-sm);
  background: transparent;
  color: var(--dk-label-3);
  cursor: pointer;
}

.dk_filterClear:hover { background: var(--dk-hover); color: var(--dk-label); }
.dk_filterClear:focus-visible { outline: none; box-shadow: var(--dk-ring); }
/* \u8BA1\u6570\uFF08\u300C201 \u884C\u300D/\u300C1 / 201 \u884C\u5339\u914D\u300D\uFF09\u53F3\u5BF9\u9F50\u5728\u56FA\u5B9A\u69FD\u91CC\uFF1A\u6587\u6848\u53D8\u957F\u4E5F\u4E0D\u4F1A\u628A\u8F93\u5165\u6846\u6324\u52A8 */
.dk_filterCount {
  position: absolute;
  top: 50%;
  right: 0;
  transform: translateY(-50%);
  white-space: nowrap;
  color: var(--dk-label-3);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.dk_logBody {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: var(--dk-gap-md) var(--dk-gap-lg);
  background: var(--dk-log-bg);
  color: var(--dk-log-fg);
  font-family: var(--dk-mono);
  font-size: 12px;
  line-height: 1.6;
}

.dk_logLine {
  white-space: pre-wrap;
  word-break: break-word;
}

.dk_logLine mark {
  background: color-mix(in srgb, var(--dk-warn) 62%, transparent);
  color: inherit;
  border-radius: 2px;
}

.dk_logLevel {
  margin-right: var(--dk-gap-sm);
  font-weight: 600;
}

.dk_logLevel[data-level="TRACE"] { color: #8a93a5; }
.dk_logLevel[data-level="DEBUG"] { color: #8a93a5; }
.dk_logLevel[data-level="INFO"] { color: #6ea8fe; }
.dk_logLevel[data-level="WARN"] { color: #e0a94a; }
.dk_logLevel[data-level="ERROR"] { color: #ff6b6b; }
.dk_logLevel[data-level="FATAL"] { color: #ff6b6b; font-weight: 700; }

.dk_logTs { margin-right: var(--dk-gap-sm); color: #7f8899; }
.dk_logText { color: inherit; }
.dk_logMore { color: #7f8899; font-style: italic; }

/* \u952E\u503C\u884C */
.dk_kv {
  display: grid;
  grid-template-columns: 92px 1fr;
  gap: var(--dk-gap-xs) var(--dk-gap-md);
  font-size: 12px;
}

.dk_kvKey { color: var(--dk-label-3); }
.dk_kvVal { color: var(--dk-label); word-break: break-all; }
.dk_kvValMono { font-family: var(--dk-mono); }

/* \u65E5\u5FD7 */
.dk_logBar {
  display: flex;
  align-items: center;
  gap: var(--dk-gap-sm);
  flex-wrap: wrap;
  margin-bottom: var(--dk-gap-sm);
}

.dk_logBar .dk_input { height: var(--dk-h-md); min-width: 0; }

.dk_logBox {
  margin: 0;
  padding: var(--dk-gap-md);
  border-radius: var(--dk-r-md);
  background: var(--dk-log-bg);
  color: var(--dk-log-fg);
  font-family: var(--dk-mono);
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: none;
}

.dk_logBox mark {
  background: color-mix(in srgb, var(--dk-warn) 55%, transparent);
  color: inherit;
  border-radius: 2px;
}

/* \u7EDF\u8BA1 */
.dk_stats {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.dk_stats th,
.dk_stats td {
  padding: var(--dk-gap-sm) var(--dk-gap-md);
  border-bottom: 1px solid var(--dk-border);
  text-align: left;
  white-space: nowrap;
}

.dk_stats th {
  color: var(--dk-label-3);
  font-weight: 500;
}

.dk_stats td.dk_num { font-family: var(--dk-mono); text-align: right; }

.dk_bar {
  position: relative;
  width: 72px;
  height: 6px;
  border-radius: var(--dk-r-pill);
  background: var(--dk-surface-3);
  overflow: hidden;
}

.dk_barFill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: var(--dk-r-pill);
  background: var(--dk-accent);
  transition: width var(--dk-dur) var(--dk-ease);
}

.dk_barFill[data-warn="1"] { background: var(--dk-warn); }
.dk_barFill[data-danger="1"] { background: var(--dk-danger); }

/* ============================ \u955C\u50CF\u8868 ============================ */

.dk_tableWrap { overflow: auto; }

/*
 * \u955C\u50CF\u9875\uFF1A\u641C\u7D22\u6846\u5DF2\u7ECF\u5728\u5DE5\u5177\u6761\uFF08\u56FA\u5B9A\u533A\uFF09\uFF0C\u8FD9\u91CC\u518D\u8BA9\u8868\u4F53\u81EA\u5DF1\u6EDA\u3001\u8868\u5934\u9489\u4F4F\u2014\u2014
 * \u957F\u955C\u50CF\u5217\u8868\u6EDA\u5230\u5E95\u65F6\u5217\u540D\uFF08\u955C\u50CF / \u5927\u5C0F / \u521B\u5EFA / ID\uFF09\u4ECD\u7136\u770B\u5F97\u89C1\u3002
 */
.dk_mainImages {
  display: flex;
  flex-direction: column;
  /* auto \u800C\u4E0D\u662F hidden\uFF1A\u6A2A\u5E45 / \u7A7A\u6001\u5728\u77EE\u9762\u677F\u91CC\u4ECD\u53EF\u6EDA\uFF0C\u4E0D\u4F1A\u88AB\u88C1\u6389 */
  overflow: auto;
}

.dk_imagesView {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
}

.dk_mainImages .dk_tableWrap {
  flex: 1 1 auto;
  min-height: 0;
}

.dk_images thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--dk-surface-solid);
}

.dk_images {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.dk_images th,
.dk_images td {
  padding: var(--dk-gap-sm) var(--dk-gap-md);
  border-bottom: 1px solid var(--dk-border);
  text-align: left;
  white-space: nowrap;
}

.dk_images th { color: var(--dk-label-3); font-weight: 500; }
.dk_images td.dk_mono { font-family: var(--dk-mono); }
.dk_images tbody tr:hover { background: var(--dk-hover); }

/* ============================ \u7A7A\u6001 / \u63D0\u793A ============================ */

.dk_empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--dk-gap-md);
  padding: 48px var(--dk-gap-lg);
  color: var(--dk-label-3);
  text-align: center;
}

.dk_emptyTitle { font-size: 13px; color: var(--dk-label-2); }
.dk_emptyHint { font-size: 12px; max-width: 420px; line-height: 1.6; }

.dk_banner {
  display: flex;
  align-items: flex-start;
  gap: var(--dk-gap-sm);
  margin: 0 0 var(--dk-gap-lg);
  padding: var(--dk-gap-md) var(--dk-gap-lg);
  border: 1px solid color-mix(in srgb, var(--dk-danger) 32%, transparent);
  border-radius: var(--dk-r-md);
  background: color-mix(in srgb, var(--dk-danger) 8%, transparent);
  color: var(--dk-label);
  font-size: 12px;
  line-height: 1.6;
}

.dk_banner[data-kind="warn"] {
  border-color: color-mix(in srgb, var(--dk-warn) 32%, transparent);
  background: color-mix(in srgb, var(--dk-warn) 8%, transparent);
}

.dk_banner[data-kind="info"] {
  border-color: var(--dk-border-strong);
  background: var(--dk-surface-2);
}

.dk_bannerIcon { flex: 0 0 auto; margin-top: 1px; color: currentColor; }
.dk_bannerBody { flex: 1 1 auto; min-width: 0; }
.dk_bannerAction { flex: 0 0 auto; display: inline-flex; align-items: center; }

/* ============================ \u786E\u8BA4\u6846 ============================ */

.dk_confirmBackdrop {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--dk-gap-lg);
  background: color-mix(in srgb, #000 40%, transparent);
}

.dk_confirm {
  width: min(420px, 100%);
  padding: var(--dk-gap-xl);
  border: 1px solid var(--dk-border-strong);
  border-radius: var(--dk-r-lg);
  background: var(--dk-surface-solid);
  box-shadow: var(--dk-shadow-lg);
}

.dk_confirmTitle { font-size: 13px; font-weight: 600; margin-bottom: var(--dk-gap-md); }
.dk_confirmText { font-size: 12px; color: var(--dk-label-2); line-height: 1.7; margin-bottom: var(--dk-gap-lg); }
.dk_confirmActions { display: flex; justify-content: flex-end; gap: var(--dk-gap-md); }

/* ============================ \u8BBE\u7F6E\u5361\u7247 ============================ */

/*
 * \u5916\u6846\u4E0E DSH \u5185\u7F6E\u5361\u7247 / \u5176\u4ED6\u63D2\u4EF6\u5361\u7247\uFF08pM_pluginCard\u3001tt_card\uFF09\u540C\u4E00\u5957\u5EA6\u91CF\uFF1A
 * border-l2 + bg-layer-3\uFF08\u5C55\u5F00\u65F6 layer-2\uFF09\u300112px \u5706\u89D2\u3001\u6807\u9898\u884C 14/16\u3001
 * \u6807\u9898 14px/600\u3001\u63CF\u8FF0 12px/label-secondary\u3002
 * \u4E4B\u524D\u662F\u5185\u8054\u7684 10px \u5706\u89D2 + \u66F4\u6D45\u7684\u8FB9\u6846 + 13px \u6807\u9898\uFF0C\u5728\u8BBE\u7F6E\u5217\u8868\u91CC\u4E00\u773C\u5C31\u662F\u300C\u53E6\u4E00\u5957\u300D\u3002
 */
.dk_settingsCard {
  list-style: none;
  border: 1px solid var(--dk-border-strong);
  border-radius: var(--dk-r-xl);
  background: var(--dk-surface-3);
  transition: border-color var(--dk-dur) var(--dk-ease), background var(--dk-dur) var(--dk-ease);
}

.dk_settingsCard:hover { border-color: var(--dk-label-dimmed); }
.dk_settingsCardOpen { background: var(--dk-surface-2); border-color: var(--dk-label-dimmed); }

.dk_settingsHead {
  display: flex;
  align-items: center;
  gap: var(--dk-gap-lg);
  width: 100%;
  padding: var(--dk-pad-cardHead);
  border: 0;
  border-radius: var(--dk-r-xl);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.dk_settingsHead:focus-visible { outline: none; box-shadow: var(--dk-ring); }
.dk_settingsHeadText { display: flex; flex-direction: column; gap: var(--dk-gap-xs); flex: 1; min-width: 0; }
.dk_settingsName { color: var(--dk-label); font-size: 14px; font-weight: 600; line-height: 1.4; }
.dk_settingsDesc { color: var(--dk-label-2); font-size: 12px; line-height: 1.5; }

.dk_settingsChevron {
  flex: none;
  display: inline-flex;
  color: var(--dk-label-3);
  transition: transform var(--dk-dur) var(--dk-ease);
}

.dk_settingsCardOpen .dk_settingsChevron { transform: rotate(180deg); }

.dk_settingsBody {
  display: flex;
  flex-direction: column;
  gap: var(--dk-gap-lg);
  padding: 2px var(--dk-gap-xl) var(--dk-gap-xl);
  color: var(--dk-label);
  font-size: 13px;
}

.dk_cardSection {
  margin-top: var(--dk-gap-xs);
  padding-bottom: var(--dk-gap-xs);
  border-bottom: 1px solid var(--dk-border);
  color: var(--dk-label-3);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: .3px;
}

.dk_field {
  display: flex;
  flex-direction: column;
  gap: var(--dk-gap-sm);
}

.dk_label { font-size: 12px; color: var(--dk-label-2); }
.dk_hint { font-size: 11px; color: var(--dk-label-3); line-height: 1.6; }
.dk_row { display: flex; align-items: center; gap: var(--dk-gap-md); flex-wrap: wrap; }

.dk_targetRow {
  display: grid;
  grid-template-columns: 1fr 96px 1fr auto;
  gap: var(--dk-gap-sm);
  align-items: center;
  padding: var(--dk-gap-sm);
  border: 1px solid var(--dk-border);
  border-radius: var(--dk-r-md);
  background: var(--dk-surface-2);
}

.dk_targetRow .dk_input,
.dk_targetRow .dk_select {
  height: var(--dk-h-md);
  min-width: 0;
}

.dk_targetHead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dk-gap-md);
}

.dk_msg { font-size: 12px; }
.dk_msg[data-kind="ok"] { color: var(--dk-success); }
.dk_msg[data-kind="error"] { color: var(--dk-danger); }

.dk_spin {
  display: inline-block;
  width: 13px;
  height: 13px;
  border: 2px solid var(--dk-border-strong);
  border-top-color: var(--dk-accent);
  border-radius: 50%;
  animation: dk_spin .7s linear infinite;
}

@keyframes dk_spin { to { transform: rotate(360deg); } }

.dk_srOnly {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

/* \u7A84\u5C4F\uFF1A\u62BD\u5C49\u6539\u4E3A\u8986\u76D6\u6574\u680F */
@media (max-width: 860px) {
  .dk_body { flex-direction: column; }
  .dk_targetRow { grid-template-columns: 1fr 1fr; }
  .dk_cardRow { grid-template-columns: 40px 1fr; }
}
`;var Tt="/api/dsh-docker",Qe="dsh-docker-style";function Pe(){if(document.getElementById(Qe)!==null)return;let i=document.createElement("style");i.id=Qe,i.textContent=Xe,document.head.appendChild(i)}async function V(i,m){let e=await fetch(Tt+i,{...m,headers:{"content-type":"application/json",...m?.headers??{}}}),d=null;try{d=await e.json()}catch{}if(!e.ok){let E=d!==null&&typeof d.error=="string"?d.error:`HTTP ${String(e.status)}`;throw new Error(E)}if(d!==null&&d.ok===!1)throw new Error(typeof d.error=="string"?d.error:"\u8BF7\u6C42\u5931\u8D25");return d}var H={config:()=>V("/config"),saveConfig:i=>V("/config",{method:"POST",body:JSON.stringify(i)}),targets:()=>V("/targets"),probe:i=>V("/probe",{method:"POST",body:JSON.stringify({target:i})}),containers:(i,m)=>V("/containers",{method:"POST",body:JSON.stringify({target:i,all:m})}),inspect:(i,m)=>V("/inspect",{method:"POST",body:JSON.stringify({target:i,id:m})}),logs:(i,m,e)=>V("/logs",{method:"POST",body:JSON.stringify({target:i,id:m,...e})}),stats:(i,m)=>V("/stats",{method:"POST",body:JSON.stringify({target:i,ids:m})}),images:i=>V("/images",{method:"POST",body:JSON.stringify({target:i})}),action:(i,m,e)=>V("/action",{method:"POST",body:JSON.stringify({target:i,action:m,id:e})}),exec:(i,m,e,d)=>V("/exec",{method:"POST",body:JSON.stringify({target:i,id:m,command:e,timeoutSec:d})})};function Lt(i){return i==null||!Number.isFinite(i)?"\u2014":i.toFixed(i>=10?1:2)+"%"}function Et(i){return i.hostPort===void 0?String(i.containerPort)+"/"+i.protocol:String(i.hostPort)+"\u2192"+String(i.containerPort)+"/"+i.protocol}function Ze(i){if(!Array.isArray(i)||i.length===0)return"\u65E0\u7AEF\u53E3\u6620\u5C04";let m=new Set,e=[];for(let d of i){let E=Et(d);m.has(E)||(m.add(E),e.push(E))}return e.join("  ")}function Bt(i){let m=/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/.exec(i);return m===null?i:m[1]+" "+m[2]}function It(i){return{running:"\u8FD0\u884C\u4E2D",exited:"\u5DF2\u505C\u6B62",created:"\u5DF2\u521B\u5EFA",paused:"\u5DF2\u6682\u505C",restarting:"\u91CD\u542F\u4E2D",dead:"dead",removing:"\u5220\u9664\u4E2D",unknown:"\u672A\u77E5"}[i]??i}function Mt(i,m){let e=new Blob([m],{type:"text/plain;charset=utf-8"}),d=URL.createObjectURL(e),E=document.createElement("a");E.href=d,E.download=i,E.click(),setTimeout(()=>URL.revokeObjectURL(d),1e3)}function et(i){return"docker exec -it '"+String(i).replaceAll("'","'\\''")+"' sh"}var Z=null,re=null,ce=null,Fe=[],rt=0;function ze(i){i!==null&&typeof i=="object"&&(ce=i),rt=Date.now()}async function Se(){try{let[i,m]=await Promise.all([H.config(),H.targets()]);return ce=i.config,Fe=m.targets??[],rt=Date.now(),!0}catch(i){return console.warn("[dsh-docker] \u76EE\u6807\u7F13\u5B58\u5237\u65B0\u5931\u8D25\uFF1A"+(i instanceof Error?i.message:String(i))),!1}}async function Ot(i,m){let e=je(i,m);return e!==void 0?e:(await Se(),je(i,m))}function je(i,m){let e=ce!==null&&Array.isArray(ce.targets)?ce.targets:[];if(typeof m=="string"&&m!==""){let C=e.find(P=>P.kind==="ssh"&&P.book===m);if(C!==void 0)return C.name}let d=typeof i?.host=="string"?i.host:"";if(d==="")return;let E=Number(i?.port),g=Number.isInteger(E)&&E>0?E:22;for(let C of Fe){if(C.kind!=="ssh"||typeof C.label!="string")continue;let P=/^([^@]+)@(.+?)(?::(\d+))?$/.exec(C.label);if(P!==null&&P[2]===d&&Number(P[3]??22)===g)return C.name}}var tt='<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 1.8l5.4 3.1v6.2L8 14.2 2.6 11.1V4.9z"/><path d="M2.6 4.9L8 8l5.4-3.1"/><path d="M8 8v6.2"/></svg>',Rt='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 1.8l5.4 3.1v6.2L8 14.2 2.6 11.1V4.9z"/><path d="M2.6 4.9L8 8l5.4-3.1"/><path d="M8 8v6.2"/></svg>',Ne='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.2 8a5.2 5.2 0 1 1-1.5-3.7"/><path d="M13.4 2.2v2.6h-2.6"/></svg>',Ce='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M4.5 4.5l7 7"/><path d="M11.5 4.5l-7 7"/></svg>',Dt='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 3.4l7.4 4.6L5 12.6z"/></svg>',At='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4.2" y="4.2" width="7.6" height="7.6" rx="1.2"/></svg>',Ht='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.2 8a5.2 5.2 0 1 1-1.5-3.7"/><path d="M13.4 2.2v2.6h-2.6"/></svg>',Pt='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4.6h10"/><path d="M6.2 4.6V3.4a.8.8 0 0 1 .8-.8h2a.8.8 0 0 1 .8.8v1.2"/><path d="M4.6 4.6l.6 8a.9.9 0 0 0 .9.8h3.8a.9.9 0 0 0 .9-.8l.6-8"/></svg>';var zt='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3v7.2"/><path d="M5 7.4L8 10.4l3-3"/><path d="M3.4 12.8h9.2"/></svg>',jt='<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2.6l5.8 10.4H2.2z"/><path d="M8 6.4v3.2"/><path d="M8 11.6h.01"/></svg>',nt='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5l3.5 3L3 11"/><path d="M8.5 11H13"/></svg>',Ft='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M3 4.5h10"/><path d="M3 8h10"/><path d="M3 11.5h6"/></svg>',Vt='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M3.5 12.5v-4"/><path d="M7 12.5v-8"/><path d="M10.5 12.5v-5"/><path d="M13 12.5v-2"/></svg>',Gt='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.5 8h-9"/><path d="M7 4.5L3.5 8 7 11.5"/></svg>',at='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6.5L8 10.5l4-4"/></svg>';window.__ModuleLoader__.load({id:"@hyzyn/dsh-docker",factory:i=>{let m=i("react"),{jsx:e,jsxs:d}=i("react/jsx-runtime"),{createRoot:E}=i("react-dom/client"),{useState:g,useEffect:C,useRef:P,useCallback:de}=m;function dt(t,a,o){if(a==="")return t;let c=t.toLowerCase(),v=a.toLowerCase(),r=[],b=0,x=c.indexOf(v),w=0;for(;x>=0&&w<500;)x>b&&r.push(t.slice(b,x)),r.push(e("mark",{children:t.slice(x,x+v.length)},o+"-m"+String(w))),b=x+v.length,w+=1,x=c.indexOf(v,b);return b<t.length&&r.push(t.slice(b)),r}function Ve(t){let a=t.health==="unhealthy"?"unhealthy":t.state,o=t.health==="unhealthy"?"\u4E0D\u5065\u5EB7":It(t.state);return e("span",{className:"dk_badge","data-state":a,title:t.status??"",children:o})}function G(t){return d("div",{className:"dk_banner","data-kind":t.kind??"error",children:[e("span",{className:"dk_bannerIcon",dangerouslySetInnerHTML:{__html:jt}},"icon"),d("div",{className:"dk_bannerBody",children:[e("div",{children:t.title}),t.hint===void 0?null:e("div",{className:"dk_hint",style:{marginTop:4},children:t.hint})]},"body"),t.action===void 0?null:e("div",{className:"dk_bannerAction",children:t.action},"action")]})}function Te(t){return d("div",{className:"dk_confirmBackdrop",onMouseDown:a=>a.stopPropagation(),children:[d("div",{className:"dk_confirm",children:[e("div",{className:"dk_confirmTitle",children:t.title}),e("div",{className:"dk_confirmText",children:t.text}),d("div",{className:"dk_confirmActions",children:[e("button",{type:"button",className:"dk_btn",onClick:t.onCancel,children:"\u53D6\u6D88"}),e("button",{type:"button",className:"dk_btn dk_btnDanger",onClick:t.onConfirm,children:t.confirmLabel})]})]})]})}function Kt(t){return e("button",{type:"button",className:"dk_btn"+(t.danger===!0?" dk_btnDanger":""),disabled:t.disabled===!0,title:t.title??"",onClick:a=>{a.stopPropagation(),t.onClick()},children:t.children})}function ke(t){return d("div",{className:"dk_cardRow",children:[e("span",{className:"dk_cardLabel",children:t.label}),e("span",{className:"dk_cardValue",title:String(t.value),children:t.value})]})}function K(t){let a=t.disabled===!0;return e("button",{type:"button",className:"dk_iconBtn"+(t.danger===!0?" dk_iconBtnDanger":""),"data-on":t.on===!0?"1":void 0,"data-spin":t.spin===!0?"1":void 0,disabled:a,title:t.title,"aria-label":t.title,onClick:o=>{o.stopPropagation(),!a&&t.onClick()},children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:t.icon}})})}function ot(t){let a=t.item,o=t.allowMutations!==!0,c=a.state==="running"||a.state==="paused"||a.state==="restarting",v=a.createdAt===null?a.runningFor===""?"\u2014":a.runningFor:Bt(a.createdAt);return d("div",{className:"dk_card",role:"button",tabIndex:0,"data-selected":t.selected===!0?"1":"0",onClick:()=>t.onOpen(a,"overview"),onKeyDown:r=>{(r.key==="Enter"||r.key===" ")&&(r.preventDefault(),t.onOpen(a,"overview"))},children:[d("div",{className:"dk_cardHead",children:[e("span",{className:"dk_cardName",title:a.name,children:a.name}),e(Ve,{state:a.state,health:a.health,status:a.status})]},"head"),d("div",{className:"dk_cardRows",children:[e(ke,{label:"\u955C\u50CF",value:a.image},"image"),e(ke,{label:"ID",value:a.shortId},"id"),e(ke,{label:"\u7AEF\u53E3",value:Ze(a.ports)},"ports"),e(ke,{label:"\u521B\u5EFA",value:v},"created"),a.composeProject===null?null:e(ke,{label:"compose",value:a.composeProject+(a.composeService===null?"":"/"+a.composeService)},"compose")]},"rows"),d("div",{className:"dk_actionBar",children:[e(K,{icon:nt,title:"\u5728\u5BB9\u5668\u5185\u6253\u5F00\u4EA4\u4E92\u5F0F\u7EC8\u7AEF\uFF08docker exec -it "+a.name+" sh\uFF09",onClick:()=>t.onExec(a)},"exec"),e(K,{icon:Ft,title:"\u67E5\u770B\u65E5\u5FD7",onClick:()=>t.onOpen(a,"logs")},"logs"),e(K,{icon:Vt,title:"\u8D44\u6E90\u5360\u7528",onClick:()=>t.onOpen(a,"stats")},"stats"),e("span",{className:"dk_actionBarSep","aria-hidden":"true"},"sep"),e(K,{icon:c?At:Dt,title:o?"\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D":c?"\u505C\u6B62\u5BB9\u5668":"\u542F\u52A8\u5BB9\u5668",disabled:o,onClick:()=>t.onAction(c?"stop":"start",a)},"power"),e(K,{icon:Ht,title:o?"\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D":"\u91CD\u542F\u5BB9\u5668",disabled:o,onClick:()=>t.onAction("restart",a)},"restart"),e(K,{icon:Pt,danger:!0,title:o?"\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D":"\u5220\u9664\u5BB9\u5668\uFF08\u4E0D\u53EF\u6062\u590D\uFF09",disabled:o,onClick:()=>t.onAction("remove",a)},"remove")]},"actions")]})}let lt=/^\s*(\[\d{4}-\d{2}-\d{2}[ T][0-9:.,]+\]|\d{2}:\d{2}:\d{2}[,.]\d{3})/,it=/^\s*(\[(?:TRACE|DEBUG|INFO|WARN|ERROR|FATAL)\]|\|\s*(?:TRACE|DEBUG|INFO|WARN|ERROR|FATAL))/,st=/(TRACE|DEBUG|INFO|WARN|ERROR|FATAL)/,Le=2e3;function ct(t,a,o){let c=[],v=t;for(let r=0;r<2;r+=1){let b=lt.exec(v);if(b!==null){c.push(e("span",{className:"dk_logTs",children:b[1]},"ts"+String(r))),v=v.slice(b[0].length);continue}let x=it.exec(v);if(x!==null){let w=st.exec(x[1]);c.push(e("span",{className:"dk_logLevel","data-level":w===null?"":w[1],children:x[1].trim()},"lv"+String(r))),v=v.slice(x[0].length);continue}break}return c.push(e("span",{className:"dk_logText",children:dt(v,o,"x"+String(a))},"tx")),d("div",{className:"dk_logLine",children:c},String(a))}function kt(t){let a=t.item,o=t.config,[c,v]=g(t.initialTab??"overview"),[r,b]=g(null),[x,w]=g(""),[N,j]=g({tail:o.logTailDefault,timestamps:!1}),[B,I]=g(null),[T,$]=g(""),[Y,ee]=g(!1),[M,O]=g(""),[S,F]=g(!1),[J,l]=g(3),[s,h]=g(null),[z,q]=g(""),[ge,X]=g(""),[R,be]=g(null),[he,D]=g(""),[te,pe]=g(!1);C(()=>{let p=!0;return b(null),w(""),H.inspect(t.target,a.id).then(_=>{p&&b(_.details?.[0]??null)}).catch(_=>{p&&w(_.message)}),()=>{p=!1}},[t.target,a.id,t.refreshToken]);let Q=de(()=>{ee(!0),$(""),H.logs(t.target,a.id,{tail:N.tail,timestamps:N.timestamps}).then(p=>I(p.logs)).catch(p=>$(p.message)).finally(()=>ee(!1))},[t.target,a.id,N.tail,N.timestamps]);C(()=>{c==="logs"&&Q()},[c,Q,t.refreshToken]),C(()=>{if(c!=="logs"||!S)return;let p=setInterval(Q,Math.max(1,J)*1e3);return()=>clearInterval(p)},[c,S,J,Q]),C(()=>{if(c!=="stats")return;let p=!0,_=()=>{H.stats(t.target,[a.id]).then(y=>{p&&(h(y.stats?.[0]??null),q(""))}).catch(y=>{p&&q(y.message)})};_();let k=setInterval(_,Math.max(2,o.pollIntervalSec)*1e3);return()=>{p=!1,clearInterval(k)}},[c,t.target,a.id,o.pollIntervalSec,t.refreshToken]);let U=()=>{ge.trim()!==""&&(pe(!0),D(""),be(null),H.exec(t.target,a.id,ge,o.execTimeoutSec).then(p=>be(p.result)).catch(p=>D(p.message)).finally(()=>pe(!1)))},W=()=>{if(x!=="")return e(G,{title:"\u8BFB\u53D6\u5BB9\u5668\u8BE6\u60C5\u5931\u8D25",hint:x});if(r===null)return e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]});let p=[["\u72B6\u6001",r.state+(r.health===null?"":" / "+r.health)+(r.status===""?"":"\uFF08"+r.status+"\uFF09")],["\u955C\u50CF",r.image],["\u5BB9\u5668 ID",r.shortId],["\u542F\u52A8\u65F6\u95F4",r.startedAt??"\u2014"],["\u7ED3\u675F\u65F6\u95F4",r.finishedAt??"\u2014"],["\u9000\u51FA\u7801",r.exitCode===null?"\u2014":String(r.exitCode)],["\u91CD\u542F\u6B21\u6570",r.restartCount===null?"\u2014":String(r.restartCount)],["\u91CD\u542F\u7B56\u7565",r.restartPolicy??"\u2014"],["PID",r.pid===null?"\u2014":String(r.pid)],["\u7AEF\u53E3",r.ports.length===0?"\u2014":Ze(r.ports)],["\u6302\u8F7D",r.mounts.length===0?"\u2014":r.mounts.map(k=>k.source+"\u2192"+k.destination+(k.readWrite?"":"\uFF08\u53EA\u8BFB\uFF09")).join(`
`)],["\u7F51\u7EDC",r.networks.length===0?"\u2014":r.networks.map(k=>k.name+(k.ip===null?"":"\uFF08"+k.ip+"\uFF09")).join(", ")],["\u547D\u4EE4",(r.entrypoint+" "+r.command).trim()||"\u2014"],["\u5DE5\u4F5C\u76EE\u5F55",r.workingDir===""?"\u2014":r.workingDir],["\u7528\u6237",r.user===""?"\u2014":r.user]],_=d("div",{className:"dk_kv",children:p.flatMap(([k,y],L)=>[e("div",{className:"dk_kvKey",children:k},"k"+String(L)),e("div",{className:"dk_kvVal"+(k==="\u5BB9\u5668 ID"||k==="\u547D\u4EE4"||k==="\u955C\u50CF"?" dk_kvValMono":""),children:y},"v"+String(L))])});return d("div",{children:[r.healthLogTail===null?null:e("div",{className:"dk_hint",style:{marginBottom:8},children:"\u6700\u8FD1\u5065\u5EB7\u68C0\u67E5\u8F93\u51FA\uFF1A"+r.healthLogTail}),_,e("div",{className:"dk_cardSection",style:{marginTop:16},children:"\u4E00\u6B21\u6027\u547D\u4EE4\uFF08docker exec\uFF09"}),o.allowExec!==!0?e(G,{kind:"info",title:"exec \u672A\u542F\u7528",hint:"\u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6253\u5F00\u300C\u5141\u8BB8 exec\u300D\uFF0C\u6216\u76F4\u63A5\u590D\u5236\u5361\u7247\u4E0A\u7684 exec \u547D\u4EE4\u5230\u7EC8\u7AEF\u9762\u677F\u4EA4\u4E92\u5F0F\u8FDB\u5165\u5BB9\u5668\u3002"}):d("div",{children:[d("div",{className:"dk_row",children:[e("input",{className:"dk_input",style:{flex:"1 1 auto"},placeholder:"\u5982 ls -la /app \u6216 cat /etc/nginx/nginx.conf",value:ge,onChange:k=>X(k.target.value),onKeyDown:k=>{k.key==="Enter"&&U()}}),e("button",{type:"button",className:"dk_btn dk_btnPrimary",disabled:te,onClick:U,children:te?"\u6267\u884C\u4E2D\u2026":"\u6267\u884C"})]}),he===""?null:e(G,{title:"\u6267\u884C\u5931\u8D25",hint:he}),R===null?null:d("div",{style:{marginTop:8},children:[e("div",{className:"dk_hint",children:"\u9000\u51FA\u7801 "+(R.code===null?"?":String(R.code))+" \xB7 \u8017\u65F6 "+String(R.durationMs)+"ms"+(R.truncated?" \xB7 \u8F93\u51FA\u5DF2\u622A\u65AD":"")}),e("pre",{className:"dk_logBox",style:{marginTop:6},children:(R.stdout||"")+(R.stderr===""?"":`
[stderr]
`+R.stderr)||"(\u65E0\u8F93\u51FA)"})]})]})]})},ne=()=>{let p=B!==null&&typeof B=="object"&&typeof B.text=="string"?B.text:"",_=M.trim().toLowerCase(),k=p===""?[]:p.split(`
`),y=_===""?k:k.filter(L=>L.toLowerCase().includes(_));return{raw:p,needle:_,allLines:k,matchedLines:y}},me=(p,_,k)=>e("button",{type:"button",className:"dk_pill","data-on":p?"1":"0",onClick:k,children:_}),Ie=()=>{let{raw:p}=ne(),_=[...new Set([100,200,500,1e3,5e3,Number(o.logTailDefault)||200,Number(N.tail)||200])].filter(k=>Number.isInteger(k)&&k>0).sort((k,y)=>k-y);return d("div",{className:"dk_logTools",children:[e("span",{className:"dk_toolLabel",children:"LINES"}),e("select",{className:"dk_select dk_selectSm",value:String(N.tail),onChange:k=>j({...N,tail:Number(k.target.value)}),children:_.map(k=>e("option",{value:String(k),children:k===5e3?"Last 5000":"Last "+String(k)},String(k)))}),e("span",{className:"dk_toolLabel",children:"TIMESTAMPS"}),me(N.timestamps,N.timestamps?"On":"Off",()=>j({...N,timestamps:!N.timestamps})),e("span",{className:"dk_toolLabel",children:"AUTO REFRESH"}),me(S,S?"On":"Off",()=>F(k=>!k)),e("select",{className:"dk_select dk_selectSm",value:String(J),title:"\u81EA\u52A8\u5237\u65B0\u95F4\u9694\uFF08\u5F00\u542F AUTO REFRESH \u540E\u6309\u6B64\u8F6E\u8BE2\uFF09",onChange:k=>l(Number(k.target.value)),children:[2,3,5,10].map(k=>e("option",{value:String(k),children:String(k)+"s"},String(k)))}),Y?e("span",{className:"dk_spin"}):null,e(K,{icon:Ne,title:"\u5237\u65B0\u65E5\u5FD7",onClick:Q},"refresh"),e(K,{icon:zt,title:"\u4E0B\u8F7D\u65E5\u5FD7",disabled:p==="",onClick:()=>Mt(a.name+".log",p)},"download")]})},_e=()=>{let{needle:p,allLines:_,matchedLines:k}=ne();return d("div",{className:"dk_filterBar",children:[d("div",{className:"dk_filterWrap",children:[e("input",{className:"dk_input dk_filterInput",placeholder:"\u8FC7\u6EE4\u65E5\u5FD7\u2026",value:M,onChange:y=>O(y.target.value),onKeyDown:y=>{y.key==="Escape"&&M!==""&&(y.stopPropagation(),O(""))}}),M===""?null:e("button",{type:"button",className:"dk_filterClear",title:"\u6E05\u7A7A\u8FC7\u6EE4","aria-label":"\u6E05\u7A7A\u8FC7\u6EE4",onClick:()=>O(""),children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Ce}})},"clear")]}),e("span",{className:"dk_filterCount",children:p===""?String(_.length)+" \u884C":String(k.length)+" / "+String(_.length)+" \u884C\u5339\u914D"})]})},Me=()=>{let{needle:p,matchedLines:_}=ne(),k=_.length>Le?_.slice(-Le):_;return d("div",{className:"dk_logs",children:[T===""?null:e(G,{title:"\u8BFB\u53D6\u65E5\u5FD7\u5931\u8D25",hint:T+(T.includes("Failed to fetch")?"\uFF08\u7F51\u7EDC\u8BF7\u6C42\u6CA1\u5230\u5BBF\u4E3B\uFF1A\u5BBF\u4E3B\u53EF\u80FD\u521A\u91CD\u542F\u3001\u6216\u8FDE\u63A5\u88AB\u4E2D\u65AD\uFF09":""),action:e("button",{type:"button",className:"dk_btn",disabled:Y,onClick:Q,children:"\u91CD\u8BD5"})}),B!==null&&B.truncated===!0?e(G,{kind:"warn",title:"\u65E5\u5FD7\u8F93\u51FA\u8D85\u8FC7\u4E0A\u9650\uFF0C\u5DF2\u622A\u65AD",hint:"\u8C03\u5C0F\u300CLINES\u300D\u6216\u5230\u8BBE\u7F6E\u5361\u7247\u8C03\u5927\u300C\u5355\u6B21\u547D\u4EE4\u8F93\u51FA\u4E0A\u9650\u300D\u3002"}):null,d("div",{className:"dk_logBody",children:[_.length>k.length?e("div",{className:"dk_logLine dk_logMore",children:"\uFF08\u53EA\u663E\u793A\u6700\u8FD1 "+String(Le)+" \u884C\uFF0C\u5171 "+String(_.length)+" \u884C\u5339\u914D\uFF09"},"more"):null,T!==""?null:B===null?e("div",{className:"dk_logLine",children:"\u8BFB\u53D6\u4E2D\u2026"},"loading"):k.length===0?e("div",{className:"dk_logLine",children:p===""?"(\u65E0\u65E5\u5FD7)":"(\u65E0\u5339\u914D\u65E5\u5FD7)"},"empty"):k.map((y,L)=>ct(y,L,p))]})]})},Oe=()=>{if(z!=="")return e(G,{title:"\u8BFB\u53D6\u7EDF\u8BA1\u5931\u8D25",hint:z});if(s===null)return e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]});let p=s.cpuPercent??0,_=s.memPercent??0,k=L=>d("div",{className:"dk_bar",children:[e("div",{className:"dk_barFill","data-warn":L>=60&&L<85?"1":void 0,"data-danger":L>=85?"1":void 0,style:{width:Math.min(100,Math.max(0,L))+"%"}})]}),y=(L,xe,De)=>d("tr",{children:[e("td",{children:L}),e("td",{className:"dk_num",children:xe}),e("td",{children:De??null})]},L);return d("table",{className:"dk_stats",children:[e("thead",{children:d("tr",{children:[e("th",{children:"\u6307\u6807"}),e("th",{children:"\u6570\u503C"}),e("th",{children:"\u5360\u7528"})]})}),e("tbody",{children:[y("CPU",Lt(s.cpuPercent),k(p)),y("\u5185\u5B58",s.memUsage,k(_)),y("\u7F51\u7EDC IO",s.netIO,null),y("\u78C1\u76D8 IO",s.blockIO,null),y("PIDs",s.pids===null?"\u2014":String(s.pids),null)]})]})},Re=[["overview","\u6982\u89C8"],["logs","\u65E5\u5FD7"],["stats","\u7EDF\u8BA1"]],fe=c==="overview"?r===null&&x==="":c==="stats"?s===null&&z==="":!1;return d("div",{className:"dk_detail",children:[d("div",{className:"dk_header dk_headerDetail",children:[e(K,{icon:Gt,title:"\u8FD4\u56DE\u5BB9\u5668\u5217\u8868",onClick:t.onBack},"back"),e("span",{className:"dk_detailTitle",title:a.name,children:a.name}),e(Ve,{state:a.state,health:a.health,status:a.status}),e("span",{className:"dk_detailSub",children:t.targetLabel??""}),e("span",{className:"dk_headerSpacer"}),c==="logs"?Ie():e(K,{icon:Ne,title:"\u5237\u65B0",spin:fe,onClick:t.onRefresh},"refresh"),t.docked===!0?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:t.onClose,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Ce}})},"close")]}),d("div",{className:"dk_tabs",children:[...Re.map(([p,_])=>e("button",{type:"button",className:"dk_tab","data-on":c===p?"1":"0",onClick:()=>v(p),children:_},p)),c==="logs"?e("span",{className:"dk_headerSpacer"},"spacer"):null,c==="logs"?_e():null]}),e("div",{className:"dk_detailBody",children:c==="overview"?W():c==="logs"?Me():Oe()})]})}function ut(t){let a=t.collapsed===!0;return d("div",{className:"dk_drawer","data-collapsed":a?"1":void 0,style:a||t.height===null?void 0:{height:String(t.height)+"px"},children:[e("div",{className:"dk_drawerResize",title:"\u62D6\u52A8\u8C03\u6574\u7EC8\u7AEF\u9AD8\u5EA6\uFF08\u53CC\u51FB\u6298\u53E0 / \u5C55\u5F00\uFF09",onMouseDown:t.onResizeStart,onDoubleClick:t.onToggleCollapse},"resize"),d("div",{className:"dk_drawerHead",children:[e("span",{className:"dk_drawerIcon",dangerouslySetInnerHTML:{__html:nt}}),e("span",{className:"dk_drawerTitle",title:t.label,children:t.label}),e("span",{className:"dk_drawerHint",children:a?"\u5DF2\u6298\u53E0 \xB7 \u4F1A\u8BDD\u4FDD\u6301\u8FD0\u884C":"\u7531\u7EC8\u7AEF\u9762\u677F\u627F\u8F7D \xB7 \u6298\u53E0\u4FDD\u7559\u4F1A\u8BDD"}),e("span",{className:"dk_headerSpacer"}),e("button",{type:"button",className:"dk_iconBtn dk_drawerFold",title:a?"\u5C55\u5F00\u7EC8\u7AEF\uFF08\u4F1A\u8BDD\u672A\u4E2D\u65AD\uFF09":"\u6298\u53E0\u7EC8\u7AEF\uFF08\u4F1A\u8BDD\u4FDD\u6301\u8FD0\u884C\uFF09",onClick:t.onToggleCollapse,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:at}})},"fold"),e("button",{type:"button",className:"dk_iconBtn",title:"\u7ED3\u675F\u7EC8\u7AEF\u4F1A\u8BDD\u5E76\u6536\u8D77\u62BD\u5C49",onClick:t.onClose,children:e("span",{dangerouslySetInnerHTML:{__html:Ce}})},"close")]}),e("div",{className:"dk_drawerBody",ref:t.hostRef})]})}function Ge(t){let[a,o]=g(null),[c,v]=g([]),[r,b]=g(t.initialTarget??""),x=t.sessionHint!==void 0&&(t.initialTarget??"")==="",[w,N]=g("containers"),[j,B]=g([]),[I,T]=g([]),[$,Y]=g(!1),[ee,M]=g(""),[O,S]=g(""),[F,J]=g(!0),[l,s]=g(""),[h,z]=g("all"),[q,ge]=g(!1),[X,R]=g(null),[be,he]=g(0),[D,te]=g(null),[pe,Q]=g(""),U=P(!0),[W,ne]=g(null),me=P(null),[Ie,_e]=g(!1),[Me,Oe]=g(null),[Re,fe]=g(!1),p=P(null),_=P(!1);C(()=>()=>{U.current=!1},[]),C(()=>{if(W===null)return;let n=me.current;if(n===null)return;let u=null;try{u=Z.mount(n,W.options)}catch(f){S("\u7EC8\u7AEF\u542F\u52A8\u5931\u8D25\uFF1A"+(f instanceof Error?f.message:String(f))),ne(null);return}return()=>{try{u?.()}catch{}}},[W]);let k=n=>{if(n.button!==void 0&&n.button!==0)return;let u=n.currentTarget.parentElement,f=p.current;if(u===null||f===null)return;n.preventDefault();let ie=n.clientY,se=u.getBoundingClientRect().height,A=Math.max(160,Math.round(f.getBoundingClientRect().height*.75)),$e=Nt=>{let Ct=Math.round(se+(ie-Nt.clientY));Oe(Math.min(A,Math.max(160,Ct)))},qe=()=>{document.removeEventListener("mousemove",$e),document.removeEventListener("mouseup",qe),document.body.style.userSelect=""};document.body.style.userSelect="none",document.addEventListener("mousemove",$e),document.addEventListener("mouseup",qe)},y=()=>{if(W===null){t.onClose();return}fe(!0)};C(()=>{H.config().then(n=>{let u=n.config;o(u),!x&&Array.isArray(u.targets)&&u.targets.length>0&&b(f=>f===""?u.targets[0].name:f),ze(u)}).catch(n=>M(n.message)),H.targets().then(n=>{v(n.targets??[]),Fe=n.targets??[];let u=(n.targets??[])[0];u!==void 0&&!x&&b(f=>f===""?u.name:f)}).catch(()=>{})},[]);let L=de(()=>{r!==""&&(Y(!0),H.containers(r,F).then(n=>{U.current&&(B(n.containers??[]),M(""))}).catch(n=>{U.current&&M(n.message)}).finally(()=>{U.current&&Y(!1)}))},[r,F]),xe=de(()=>{r!==""&&(Y(!0),H.images(r).then(n=>{U.current&&(T(n.images??[]),M(""))}).catch(n=>{U.current&&M(n.message)}).finally(()=>{U.current&&Y(!1)}))},[r]),De=de(()=>he(n=>n+1),[]),le=de(()=>{w==="images"?xe():L(),he(n=>n+1)},[w,L,xe]);C(()=>{r!==""&&le()},[r,F,w]),C(()=>{if(!q||r===""||w!=="containers")return;let n=setInterval(le,Math.max(2,a?.pollIntervalSec??5)*1e3);return()=>clearInterval(n)},[q,le,r,a,w]),C(()=>{if(O==="")return;let n=setTimeout(()=>S(""),4e3);return()=>clearTimeout(n)},[O]);let we=(n,u)=>{let f=et(n.name);navigator.clipboard.writeText(f).then(()=>{S("\u5DF2\u590D\u5236\uFF1A"+f+(u===void 0?"":"\uFF08"+u+"\uFF09"))}).catch(()=>S("\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u6267\u884C\uFF1A"+f))},_t=n=>{let u=et(n.name);if(Z===null){let A=document.querySelector("[data-dsh-tty-entry]")!==null;we(n,A?"\u7EC8\u7AEF\u9762\u677F\u7248\u672C\u8FC7\u65E7\uFF08\u4EA4\u4E92\u5F0F\u8FDB\u5165\u5BB9\u5668\u9700\u8981 dsh-tty \u2265 0.14.0\uFF09\uFF0C\u547D\u4EE4\u5DF2\u590D\u5236\uFF0C\u53EF\u7C98\u8D34\u5230\u7CFB\u7EDF\u7EC8\u7AEF\u6267\u884C":"\u672A\u5B89\u88C5 dsh-tty \u7EC8\u7AEF\u9762\u677F\uFF0C\u547D\u4EE4\u5DF2\u590D\u5236\uFF0C\u53EF\u7C98\u8D34\u5230\u7CFB\u7EDF\u7EC8\u7AEF\u6267\u884C\uFF08\u88C5 dsh-tty \u540E\u53EF\u76F4\u63A5\u5728\u6B64\u5F00\u7EC8\u7AEF\uFF09");return}let f=(a?.targets??[]).find(A=>A.name===r),ie=n.name+" \xB7 exec",se=f===void 0||f.kind==="local"?{command:u,label:ie}:typeof f.book=="string"&&f.book!==""?{book:f.book,command:u,label:ie}:(f.auth??"agent")==="agent"?{spec:{host:f.host,port:f.port,username:f.username,auth:"agent",agentForward:f.agentForward===!0},command:u,label:ie}:null;if(se===null){we(n,"\u5185\u8054\u76EE\u6807\u7528\u4E86 key/password \u8BA4\u8BC1\uFF0C\u6D4F\u89C8\u5668\u7AEF\u62FF\u4E0D\u5230\u51ED\u8BC1");return}if(t.docked===!0){try{Z.open(se)}catch(A){we(n,A instanceof Error?A.message:String(A))}return}if(typeof Z.mount=="function"&&Number(Z.version??0)>=2){ne({label:ie,options:se}),_e(!1);return}try{Z.open(se),t.onClose()}catch(A){we(n,A instanceof Error?A.message:String(A))}},xt=(n,u)=>{te({title:n==="remove"?"\u5220\u9664\u5BB9\u5668":n==="stop"?"\u505C\u6B62\u5BB9\u5668":n==="start"?"\u542F\u52A8\u5BB9\u5668":"\u91CD\u542F\u5BB9\u5668",text:n==="remove"?`\u786E\u5B9A\u5220\u9664\u5BB9\u5668 ${u.name}\uFF1F\u5BB9\u5668\u7684\u53EF\u5199\u5C42\u4E0E\u914D\u7F6E\u4F1A\u88AB\u5220\u9664\uFF08\u547D\u540D\u6570\u636E\u5377\u4FDD\u7559\uFF09\uFF0C\u6B64\u64CD\u4F5C\u4E0D\u53EF\u6062\u590D\u3002`:`\u786E\u5B9A\u5BF9\u5BB9\u5668 ${u.name} \u6267\u884C${n==="stop"?"\u505C\u6B62":n==="start"?"\u542F\u52A8":"\u91CD\u542F"}\u64CD\u4F5C\uFF1F`,confirmLabel:n==="remove"?"\u5220\u9664":"\u786E\u5B9A",run:()=>{te(null),H.action(r,n,u.id).then(f=>{S(`${f.result.action} ${u.name}\uFF1A${f.result.message}`),le()}).catch(f=>M(f.message))}})},ye=X===null?null:j.find(n=>n.id===X.id)??X.item,We=j.filter(n=>{if(h==="running"&&!(n.state==="running"||n.state==="paused"||n.state==="restarting")||h==="stopped"&&n.state==="running"||h==="unhealthy"&&n.health!=="unhealthy")return!1;let u=l.trim().toLowerCase();return u===""?!0:n.name.toLowerCase().includes(u)||n.image.toLowerCase().includes(u)||n.id.toLowerCase().includes(u)}),Ae=I.filter(n=>{let u=pe.trim().toLowerCase();return u===""||n.reference.toLowerCase().includes(u)||n.id.toLowerCase().includes(u)}),He=n=>{let u=c.find(f=>f.name===n);return u===void 0||u.label===void 0?n:n+" \xB7 "+u.label},Ye=()=>$?e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]}):r===""?x?d("div",{className:"dk_empty",children:[e("div",{className:"dk_emptyTitle",children:"\u5F53\u524D\u4F1A\u8BDD\u4E3B\u673A\u8FD8\u4E0D\u662F Docker \u76EE\u6807"}),e("div",{className:"dk_emptyHint",children:"\u6309\u4E0A\u9762\u7684\u63D0\u793A\u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6DFB\u52A0\u4E00\u6761\u76EE\u6807\uFF08\u63A8\u8350\u76F4\u63A5\u9009\u8FDE\u63A5\u7C3F\u6761\u76EE\uFF09\uFF0C\u4FDD\u5B58\u540E\u56DE\u5230\u8FD9\u91CC\u5237\u65B0\u3002\u4E3A\u907F\u514D\u5F20\u51A0\u674E\u6234\uFF0C\u9762\u677F\u4E0D\u4F1A\u81EA\u52A8\u5207\u5230\u5176\u4ED6\u76EE\u6807\u3002"})]}):d("div",{className:"dk_empty",children:[e("div",{className:"dk_emptyTitle",children:"\u8FD8\u6CA1\u6709\u914D\u7F6E Docker \u76EE\u6807"}),e("div",{className:"dk_emptyHint",children:"\u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6DFB\u52A0\u4E00\u4E2A\u76EE\u6807\uFF1A\u672C\u673A\u76F4\u63A5\u9009\u300C\u672C\u673A\u300D\uFF1B\u8FDC\u7A0B\u4E3B\u673A\u53EF\u4EE5\u5F15\u7528 tty \u7EC8\u7AEF\u9762\u677F\u7684\u8FDE\u63A5\u7C3F\u6761\u76EE\u3002"})]}):d("div",{className:"dk_empty",children:[e("div",{className:"dk_emptyTitle",children:w==="images"?"\u6CA1\u6709\u955C\u50CF":"\u6CA1\u6709\u5BB9\u5668"}),e("div",{className:"dk_emptyHint",children:l.trim()===""?"\u76EE\u6807\u4E0A\u6CA1\u6709\u5339\u914D\u7684\u6570\u636E\uFF0C\u6216\u7B5B\u9009\u6761\u4EF6\u8FC7\u7A84\u3002":"\u6CA1\u6709\u5339\u914D\u300C"+l.trim()+"\u300D\u7684\u7ED3\u679C\u3002"})]}),wt=()=>w==="images"?d("div",{className:"dk_imagesView",children:[Ae.length===0?Ye():e("div",{className:"dk_tableWrap",children:d("table",{className:"dk_images",children:[e("thead",{children:d("tr",{children:[e("th",{children:"\u955C\u50CF"}),e("th",{children:"\u5927\u5C0F"}),e("th",{children:"\u521B\u5EFA"}),e("th",{children:"ID"})]})}),e("tbody",{children:Ae.map(n=>d("tr",{children:[e("td",{className:"dk_mono",children:n.reference}),e("td",{children:n.sizeText}),e("td",{children:n.createdSince}),e("td",{className:"dk_mono",children:n.shortId})]},n.id+n.reference))})]})})]}):We.length===0?Ye():e("div",{className:"dk_grid",children:We.map(n=>e(ot,{item:n,selected:X!==null&&n.id===X.id,allowMutations:a?.allowMutations===!0,onOpen:(u,f)=>R({id:u.id,tab:f,item:u}),onExec:_t,onAction:xt,onCopyExec:u=>{navigator.clipboard.writeText("docker exec -it "+u.name+" sh").then(()=>S("\u5DF2\u590D\u5236\uFF1Adocker exec -it "+u.name+" sh")).catch(()=>S("\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u590D\u5236"))}},n.id))}),ae=t.docked===!0,yt=[ye!==null?[e(kt,{item:ye,target:r,targetLabel:He(r),config:a??{pollIntervalSec:5,logTailDefault:200,allowExec:!1,execTimeoutSec:30},initialTab:X.tab,refreshToken:be,onBack:()=>R(null),onRefresh:De,onClose:y,docked:ae},"detail"),D===null?null:e(Te,{title:D.title,text:D.text,confirmLabel:D.confirmLabel,onCancel:()=>te(null),onConfirm:D.run},"confirm")]:[ae?null:d("div",{className:"dk_header",children:[e("span",{className:"dk_titleIcon",dangerouslySetInnerHTML:{__html:tt}}),e("span",{className:"dk_title",children:"Docker \u5BB9\u5668"}),a?.allowMutations===!0?null:e("span",{className:"dk_badge","data-state":"paused",children:"\u53EA\u8BFB\u6A21\u5F0F"}),e("span",{className:"dk_headerSpacer"}),ye!==null?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5237\u65B0\u5217\u8868","data-spin":$?"1":void 0,onClick:le,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Ne}})}),e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:y,children:e("span",{dangerouslySetInnerHTML:{__html:Ce}})})]}),ye!==null?null:d("div",{className:"dk_toolbar",children:[ae?e("button",{type:"button",className:"dk_iconBtn",title:"\u5237\u65B0\u5217\u8868","data-spin":$?"1":void 0,onClick:le,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Ne}})},"refresh"):null,ae&&a?.allowMutations!==!0?e("span",{className:"dk_badge","data-state":"paused",children:"\u53EA\u8BFB\u6A21\u5F0F"},"readonly"):null,e("select",{className:"dk_select",value:r,onChange:n=>{b(n.target.value),R(null),t.onTargetChange?.(He(n.target.value))},children:[...r===""?[e("option",{value:"",children:"\uFF08\u672A\u9009\u62E9\u76EE\u6807\uFF09"},"__none")]:[],...(c.length===0&&r!==""?[{name:r,label:void 0}]:c).map(n=>e("option",{value:n.name,children:He(n.name)},n.name))]}),e("div",{className:"dk_seg",children:[["containers","\u5BB9\u5668"],["images","\u955C\u50CF"]].map(([n,u])=>e("button",{type:"button",className:"dk_segBtn","data-on":w===n?"1":"0",onClick:()=>{N(n),R(null)},children:u},n))}),w==="containers"?e("input",{className:"dk_input dk_search",placeholder:"\u641C\u7D22\u540D\u79F0 / \u955C\u50CF / ID",value:l,onChange:n=>s(n.target.value)}):null,w==="images"?e("input",{className:"dk_input dk_search",placeholder:"\u641C\u7D22\u955C\u50CF\uFF08\u4ED3\u5E93 / \u6807\u7B7E / ID\uFF09",value:pe,onChange:n=>Q(n.target.value)}):null,w==="images"?e("span",{className:"dk_hint dk_searchCount",children:String(Ae.length)+" / "+String(I.length)+" \u4E2A\u955C\u50CF"}):null,w==="containers"?e("div",{className:"dk_seg",children:[["all","\u5168\u90E8"],["running","\u8FD0\u884C\u4E2D"],["stopped","\u5DF2\u505C\u6B62"],["unhealthy","\u4E0D\u5065\u5EB7"]].map(([n,u])=>e("button",{type:"button",className:"dk_segBtn","data-on":h===n?"1":"0",onClick:()=>z(n),children:u},n))}):null,w==="containers"?e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:F,onChange:n=>J(n.target.checked)}),"\u542B\u5DF2\u505C\u6B62"]}):null,w==="containers"?e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:q,onChange:n=>ge(n.target.checked)}),"\u81EA\u52A8\u5237\u65B0"]}):null]}),d("div",{className:"dk_body",children:[d("div",{className:"dk_main"+(w==="images"?" dk_mainImages":""),children:[ee===""?null:e(G,{title:"\u64CD\u4F5C\u5931\u8D25",hint:ee}),O===""?null:e(G,{kind:"info",title:O}),t.sessionHint===void 0?null:e(G,{kind:"info",title:"\u5F53\u524D\u4F1A\u8BDD\u4E3B\u673A\u8FD8\u6CA1\u914D\u7F6E\u4E3A Docker \u76EE\u6807",hint:"\u4F1A\u8BDD\u4E3B\u673A\uFF1A"+t.sessionHint.host+(t.sessionHint.port===22?"":":"+String(t.sessionHint.port))+(t.sessionHint.book===""?"":"\uFF08\u8FDE\u63A5\u7C3F\uFF1A"+t.sessionHint.book+"\uFF09")+" \u2014 \u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6DFB\u52A0\u4E00\u6761 kind=ssh \u76EE\u6807"+(t.sessionHint.book===""?"\uFF08\u586B host/username\uFF0C\u6216\u7528\u8FDE\u63A5\u7C3F\u6761\u76EE\uFF09":"\uFF0C\u76F4\u63A5\u9009\u8FDE\u63A5\u7C3F\u6761\u76EE\u300C"+t.sessionHint.book+"\u300D")+"\uFF0C\u4FDD\u5B58\u540E\u56DE\u5230\u8FD9\u91CC\u5237\u65B0\u5373\u53EF\u3002"}),a!==null&&a.allowMutations!==!0?e(G,{kind:"info",title:"\u5F53\u524D\u4E3A\u53EA\u8BFB\u6A21\u5F0F",hint:"\u542F\u52A8 / \u505C\u6B62 / \u91CD\u542F / \u5220\u9664\u9700\u8981\u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D\u3002"}):null,wt()]})]}),D===null?null:e(Te,{title:D.title,text:D.text,confirmLabel:D.confirmLabel,onCancel:()=>te(null),onConfirm:D.run})],W===null?null:e(ut,{label:W.label,hostRef:me,collapsed:Ie,height:Me,onToggleCollapse:()=>_e(n=>!n),onResizeStart:k,onClose:()=>ne(null)},"execDrawer"),Re&&W!==null?e(Te,{title:"\u7ED3\u675F\u5BB9\u5668\u7EC8\u7AEF\u4F1A\u8BDD",text:"\u5173\u95ED\u9762\u677F\u4F1A\u7ED3\u675F\u300C"+W.label+"\u300D\u7684\u7EC8\u7AEF\u4F1A\u8BDD\uFF08docker exec -it \u2026\uFF09\u3002\u82E5\u53EA\u662F\u60F3\u7ED9\u65E5\u5FD7 / \u5217\u8868\u817E\u5730\u65B9\uFF0C\u5148\u70B9\u62BD\u5C49\u53F3\u4E0A\u89D2\u7684\u6298\u53E0\u6309\u94AE\u5373\u53EF\uFF0C\u4F1A\u8BDD\u4F1A\u4FDD\u6301\u8FD0\u884C\u3002",confirmLabel:"\u7ED3\u675F\u5E76\u5173\u95ED",onCancel:()=>fe(!1),onConfirm:()=>{fe(!1),t.onClose()}},"closeConfirm"):null],Je=d("div",{className:"dk_panel"+(ae?" dk_panelDock":""),"data-dock":ae?"1":void 0,ref:p,onMouseDown:n=>n.stopPropagation(),children:yt});return ae?Je:d("div",{className:"dk_backdrop",onMouseDown:n=>{_.current=n.target===n.currentTarget},onMouseUp:n=>{let u=_.current&&n.target===n.currentTarget;_.current=!1,u&&y()},children:[Je]})}function gt(){let[t,a]=g(!1),[o,c]=g(null),[v,r]=g(!1),[b,x]=g(!1),[w,N]=g({kind:"",text:""}),j=P(0),B=de(()=>{H.config().then(l=>{c(l.config),ze(l.config),j.current=Array.isArray(l.config?.targets)?l.config.targets.length:0,r(!0)}).catch(l=>{N({kind:"error",text:"\u8BFB\u53D6\u914D\u7F6E\u5931\u8D25\uFF1A"+l.message}),r(!0)})},[]);C(()=>{t&&!v&&B()},[t,v,B]);let I=l=>c(s=>({...s,...l})),T=(l,s)=>c(h=>{let z=h.targets.slice();return z[l]={...z[l],...s},{...h,targets:z}}),$=()=>c(l=>({...l,targets:[...l.targets,{name:"\u76EE\u6807"+String(l.targets.length+1),kind:"local",book:"",host:"",port:22,username:"",auth:"agent",keyPath:"",agentForward:!1,passwordSet:!1,passphraseSet:!1}]})),Y=l=>c(s=>({...s,targets:s.targets.filter((h,z)=>z!==l)})),ee=l=>c(s=>({...s,hostKeys:s.hostKeys.filter(h=>!(h.host===l.host&&h.port===l.port))})),M=()=>{x(!0),N({kind:"",text:""});let l={enabled:o.enabled,announceToAgent:o.announceToAgent,dockerBin:o.dockerBin,allowMutations:o.allowMutations,allowExec:o.allowExec,execTimeoutSec:o.execTimeoutSec,pollIntervalSec:o.pollIntervalSec,logTailDefault:o.logTailDefault,maxOutputKb:o.maxOutputKb,targets:o.targets.map(s=>({name:s.name,kind:s.kind,book:s.book??"",host:s.host??"",port:Number(s.port)||22,username:s.username??"",auth:s.auth??"agent",keyPath:s.keyPath??"",...s.password===void 0||s.password===""?{}:{password:s.password},...s.passphrase===void 0||s.passphrase===""?{}:{passphrase:s.passphrase},agentForward:s.agentForward===!0})),hostKeys:o.hostKeys,...o.targets.length===0&&j.current>0?{clearTargets:!0}:{}};H.saveConfig(l).then(s=>{c(s.config),ze(s.config),j.current=Array.isArray(s.config?.targets)?s.config.targets.length:0,Se(),N(s.warning===void 0?{kind:"ok",text:"\u5DF2\u4FDD\u5B58\u5E76\u70ED\u751F\u6548"}:{kind:"error",text:s.warning})}).catch(s=>{N({kind:"error",text:"\u4FDD\u5B58\u5931\u8D25\uFF1A"+s.message})}).finally(()=>x(!1))},O=l=>e("div",{className:"dk_cardSection",children:l}),S=(l,s,h)=>d("div",{className:"dk_field",children:[e("span",{className:"dk_label",children:l}),s,h===void 0?null:e("span",{className:"dk_hint",children:h})]}),F=(l,s,h,z)=>e("input",{className:"dk_input",type:"number",min:s,max:h,value:o[l],onChange:q=>I({[l]:Number(q.target.value)})}),J=l=>d("li",{className:"dk_settingsCard"+(t?" dk_settingsCardOpen":""),children:[d("button",{type:"button",className:"dk_settingsHead","aria-expanded":t,onClick:()=>a(s=>!s),children:[d("span",{className:"dk_settingsHeadText",children:[e("span",{className:"dk_settingsName",children:"Docker \u5BB9\u5668\u9762\u677F"}),e("span",{className:"dk_settingsDesc",children:"\u672C\u673A / SSH \u4E3B\u673A\u4E0A\u7684\u5BB9\u5668\u4E0E\u955C\u50CF\uFF1B\u9ED8\u8BA4\u53EA\u8BFB\uFF0C\u53D8\u66F4\u64CD\u4F5C\u9700\u663E\u5F0F\u5F00\u542F"})]}),e("span",{className:"dk_settingsChevron",dangerouslySetInnerHTML:{__html:at}})]}),t?e("div",{className:"dk_settingsBody",children:l}):null]});return J(t?!v||o===null?d("div",{className:"dk_row",children:[e("span",{className:"dk_spin"}),"\u8BFB\u53D6\u914D\u7F6E\u2026"]}):[O("\u57FA\u672C"),d("div",{className:"dk_row",children:[e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:o.enabled,onChange:l=>I({enabled:l.target.checked})}),"\u542F\u7528\u63D2\u4EF6"]}),e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:o.announceToAgent,onChange:l=>I({announceToAgent:l.target.checked})}),"\u5411 agent \u516C\u544A\u80FD\u529B"]})]}),d("div",{className:"dk_row",children:[S("docker CLI",e("input",{className:"dk_input",value:o.dockerBin,onChange:l=>I({dockerBin:l.target.value})}),"\u9ED8\u8BA4 docker\uFF1Bpodman \u53EF\u586B podman"),S("\u7EDF\u8BA1\u5237\u65B0\u95F4\u9694\uFF08\u79D2\uFF09",F("pollIntervalSec",1,60)),S("\u65E5\u5FD7\u9ED8\u8BA4\u884C\u6570",F("logTailDefault",1,5e3)),S("\u8F93\u51FA\u4E0A\u9650\uFF08KB\uFF09",F("maxOutputKb",1,8192)),S("exec \u8D85\u65F6\uFF08\u79D2\uFF09",F("execTimeoutSec",1,120))]}),O("\u80FD\u529B\u5F00\u5173\uFF08\u9ED8\u8BA4\u5173\u95ED\uFF09"),d("div",{className:"dk_row",children:[e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:o.allowMutations,onChange:l=>I({allowMutations:l.target.checked})}),"\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\uFF08\u542F\u52A8 / \u505C\u6B62 / \u91CD\u542F / \u5220\u9664\uFF09"]}),e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:o.allowExec,onChange:l=>I({allowExec:l.target.checked})}),"\u5141\u8BB8 exec\uFF08\u5728\u5BB9\u5668\u5185\u6267\u884C\u547D\u4EE4\uFF09"]})]}),e("span",{className:"dk_hint",children:"docker socket \u7B49\u4EF7\u4E8E\u76EE\u6807\u4E3B\u673A\u7684 root \u6743\u9650\u3002\u5F00\u542F\u540E\uFF0C\u6D4F\u89C8\u5668\u9762\u677F\u4E0E agent \u90FD\u80FD\u6267\u884C\u5BF9\u5E94\u64CD\u4F5C\uFF0C\u8BF7\u53EA\u5728\u53EF\u4FE1\u73AF\u5883\u4E0B\u6253\u5F00\u3002"}),O("\u76EE\u6807"),...o.targets.map((l,s)=>d("div",{className:"dk_targetRow",children:[e("input",{className:"dk_input",value:l.name,placeholder:"\u76EE\u6807\u540D",onChange:h=>T(s,{name:h.target.value})}),e("select",{className:"dk_select",value:l.kind,onChange:h=>T(s,{kind:h.target.value}),children:[e("option",{value:"local",children:"\u672C\u673A"}),e("option",{value:"ssh",children:"SSH \u4E3B\u673A"})]}),l.kind==="local"?e("span",{className:"dk_hint",children:"\u5BBF\u4E3B\u6240\u5728\u673A\u5668\u4E0A\u7684 docker"}):d("div",{className:"dk_row",style:{gridColumn:"span 1"},children:[e("select",{className:"dk_select",value:l.book??"",onChange:h=>T(s,{book:h.target.value}),children:[e("option",{value:"",children:o.ttyBooks.length===0?"\uFF08\u65E0 tty \u8FDE\u63A5\u7C3F\uFF0C\u8BF7\u586B\u5185\u8054\u4FE1\u606F\uFF09":"\uFF08\u4E0D\u7528\u8FDE\u63A5\u7C3F\uFF0C\u624B\u586B\uFF09"}),...o.ttyBooks.map(h=>e("option",{value:h,children:"\u8FDE\u63A5\u7C3F\uFF1A"+h},h))]})]}),e("button",{type:"button",className:"dk_btn dk_btnDanger",onClick:()=>Y(s),children:"\u5220\u9664"}),l.kind==="ssh"&&(l.book??"")===""?d("div",{className:"dk_row",style:{gridColumn:"1 / -1"},children:[e("input",{className:"dk_input",placeholder:"host",value:l.host??"",onChange:h=>T(s,{host:h.target.value})}),e("input",{className:"dk_input",style:{width:90},placeholder:"port",value:l.port??22,onChange:h=>T(s,{port:Number(h.target.value)||22})}),e("input",{className:"dk_input",placeholder:"username",value:l.username??"",onChange:h=>T(s,{username:h.target.value})}),e("select",{className:"dk_select",value:l.auth??"agent",onChange:h=>T(s,{auth:h.target.value}),children:[e("option",{value:"agent",children:"ssh-agent"}),e("option",{value:"key",children:"\u79C1\u94A5"}),e("option",{value:"password",children:"\u5BC6\u7801"})]}),(l.auth??"agent")==="key"?e("input",{className:"dk_input",placeholder:"~/.ssh/id_ed25519",value:l.keyPath??"",onChange:h=>T(s,{keyPath:h.target.value})}):null,(l.auth??"agent")==="password"?e("input",{className:"dk_input",type:"password",placeholder:l.passwordSet===!0?"\uFF08\u5DF2\u8BBE\u7F6E\uFF0C\u7559\u7A7A\u4FDD\u6301\u4E0D\u53D8\uFF09":"env:SSH_PASSWORD",value:l.password??"",onChange:h=>T(s,{password:h.target.value})}):null,e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:l.agentForward===!0,onChange:h=>T(s,{agentForward:h.target.checked})}),"agent forwarding"]})]}):null]},String(s)+l.name)),d("div",{className:"dk_row",children:[e("button",{type:"button",className:"dk_btn",onClick:$,children:"\u6DFB\u52A0\u76EE\u6807"}),e("span",{className:"dk_hint",children:"SSH \u76EE\u6807\u63A8\u8350\u76F4\u63A5\u9009 tty \u7EC8\u7AEF\u9762\u677F\u7684\u8FDE\u63A5\u7C3F\u6761\u76EE\uFF08\u51ED\u8BC1\u53EA\u9700\u7EF4\u62A4\u4E00\u5904\uFF09\uFF1B\u624B\u586B\u65F6\u5BC6\u7801 / \u53E3\u4EE4\u5EFA\u8BAE\u5199 env:VAR\u3002"})]}),O("SSH \u4E3B\u673A\u5BC6\u94A5\u8BB0\u5F55\uFF08TOFU\uFF09"),...o.hostKeys.length===0?[e("span",{className:"dk_hint",children:"\u6682\u65E0\u8BB0\u5F55 \u2014 \u9996\u6B21 SSH \u8FDE\u63A5\u6210\u529F\u540E\u81EA\u52A8\u8BB0\u5F55\u4E3B\u673A\u6307\u7EB9\uFF08\u82E5 tty \u5DF2\u8BB0\u5F55\u540C\u4E00\u4E3B\u673A\uFF0C\u4F1A\u76F4\u63A5\u590D\u7528\uFF09\u3002"},"none")]:o.hostKeys.map(l=>d("div",{className:"dk_targetRow",children:[e("span",{children:l.host+":"+String(l.port)}),e("span",{className:"dk_hint",style:{gridColumn:"span 2",wordBreak:"break-all"},children:"sha256:"+l.fingerprint}),e("button",{type:"button",className:"dk_btn",onClick:()=>ee(l),children:"\u5220\u9664"})]},l.host+":"+String(l.port))),e("span",{className:"dk_hint",children:"\u6307\u7EB9\u53D8\u66F4\u65F6\u8FDE\u63A5\u4F1A\u88AB\u62D2\u7EDD\uFF08\u9632\u4E2D\u95F4\u4EBA\uFF09\uFF1B\u786E\u8BA4\u5B89\u5168\u540E\u5220\u9664\u5BF9\u5E94\u8BB0\u5F55\u5373\u53EF\u91CD\u8FDE\u3002"}),d("div",{className:"dk_row",children:[e("button",{type:"button",className:"dk_btn dk_btnPrimary",disabled:b,onClick:M,children:b?"\u4FDD\u5B58\u4E2D\u2026":"\u4FDD\u5B58"}),e("span",{className:"dk_msg","data-kind":w.kind,children:w.text})]})]:null)}let ue=null,oe=null,Ee=null;function ve(){let t=oe,a=ue,o=Ee;if(oe=null,ue=null,Ee=null,a!==null&&a.remove(),t!==null&&setTimeout(()=>{try{t.unmount()}catch{}},0),o!==null)try{o.dispose()}catch{}}function ht(t){return t!==null&&typeof t=="object"&&typeof t.appendChild=="function"}function pt(){return typeof re?.mountPane=="function"&&typeof re.isOpen=="function"&&Number(re.version??0)>=1&&re.isOpen()===!0}function Ke(t){ve(),Pe();let a={onClose:ve,initialTarget:t?.target??"",sessionHint:t?.sessionHint};if(pt()){let o=null;try{o=re.mountPane({title:"Docker \u5BB9\u5668",hint:t?.target===void 0||t.target===""?"":t.target,size:520,min:360,onClose:()=>ve()})}catch(c){o=null,console.warn("[dsh-docker] \u6302\u8F7D\u5230\u7EC8\u7AEF\u9762\u677F\u5931\u8D25\uFF0C\u56DE\u9000\u5F39\u7A97\uFF1A"+(c instanceof Error?c.message:String(c)))}if(o!==null&&ht(o.element)){Ee=o,oe=E(o.element),oe.render(e(Ge,{...a,docked:!0,onTargetChange:c=>{try{o.setHint(c)}catch{}}}));return}}ue=document.createElement("div"),document.body.appendChild(ue),oe=E(ue),oe.render(e(Ge,a))}function mt(){let t=document.querySelector('[data-pane="sidebar"], [class*="sidebarCol"]');if(t!==null)return t.querySelector('[class*="logoRow"]')?.parentElement??t.firstElementChild}function ft(t){let a=t.querySelector('button[class*="newSession"]');if(a!==null)return a;for(let o of t.children)if(o.tagName==="BUTTON")return o}function vt(){let t=document.createElement("div");return t.dataset.dshDockerEntry="",t.className="dk_sidebarEntry",t.setAttribute("role","button"),t.setAttribute("aria-label","\u5BB9\u5668"),t.innerHTML='<span class="dk_entryIcon">'+tt+'</span><span class="dk_entryLabel">\u5BB9\u5668</span>',t.addEventListener("click",a=>{a.preventDefault(),Ke()}),t}function Ue(t,a){let o=ft(t);if(o===void 0)return!1;if(a.parentElement!==t){let c=o.closest('[class*="logoRow"]'),v=c!==null&&c.parentElement===t?c:o,r=Array.from(t.children).filter(b=>b instanceof HTMLElement&&b.matches("[data-dsh-global-search-entry], [data-dsh-rss-entry], [data-dsh-taskboard-entry], [data-dsh-ssh-entry], [data-dsh-tty-entry], [data-dsh-docker-entry]"));if(r.length>0){let b=r[r.length-1];t.insertBefore(a,b.nextSibling)}else t.insertBefore(a,v.nextElementSibling)}return!0}function bt(){if(Pe(),document.querySelector("[data-dsh-docker-entry]")!==null)return()=>{};let t=vt(),a,o=!1,c=()=>{if(a!==void 0&&!a.isConnected&&(r.disconnect(),a=void 0,o=!1),o){if(document.body.contains(t))return;r.disconnect(),a=void 0,o=!1}a??(a=mt()),a!==void 0&&(o=Ue(a,t),o&&r.observe(a,{childList:!0,subtree:!0}))},v=new MutationObserver(()=>{c()});v.observe(document.body,{childList:!0,subtree:!0});let r=new MutationObserver(()=>{if(a===void 0||!a.isConnected){o=!1,c();return}a.contains(t)||(o=Ue(a,t))});return c(),()=>{v.disconnect(),r.disconnect(),t.remove()}}let Be={};return Be.inject=["slots"],Be.apply=t=>{Pe();let a=bt(),o=t.slots.inject("settings.plugin.item",()=>t.slots.register({name:"settings.plugin.item",key:"docker",order:112},gt));t.inject(["ttyTerminal"],v=>(Z=v.ttyTerminal??null,()=>{Z=null})),t.inject(["ttyPanel"],v=>(re=v.ttyPanel??null,()=>{re=null}));let c=()=>{};return Se(),t.inject(["ttyConnbar"],v=>{let r=v.ttyConnbar;r!==void 0&&(c=r.addAction(b=>{let x=b?.spec??{};if(x.t!=="ssh")return;let w=typeof b?.bookName=="string"?b.bookName:"",N=je(x,w),j=N!==void 0?`\u6253\u5F00\u8BE5\u4E3B\u673A\u7684 Docker \u5BB9\u5668\u9762\u677F\uFF08\u76EE\u6807\uFF1A${N}\uFF09`:ce===null?"\u6253\u5F00\u5F53\u524D\u4F1A\u8BDD\u4E3B\u673A\u7684 Docker \u5BB9\u5668\u9762\u677F":"\u8BE5\u4E3B\u673A\u5C1A\u672A\u914D\u7F6E\u4E3A Docker \u76EE\u6807 \u2014 \u70B9\u51FB\u6253\u5F00\u9762\u677F\u67E5\u770B/\u914D\u7F6E";b.addAction(Rt,"\u5BB9\u5668",j,()=>{(async()=>{let B=await Ot(x,w),I=Number(x.port);Ke({target:B??"",sessionHint:B===void 0?{host:typeof x.host=="string"?x.host:"",port:Number.isInteger(I)&&I>0?I:22,book:w}:void 0})})()})}),(async()=>{for(let b=0;b<3;b+=1){if(await Se()){typeof r.requestRender=="function"&&r.requestRender();return}await new Promise(x=>setTimeout(x,2e3))}})())}),()=>{c(),o(),a(),ve()}},Be}});})();
