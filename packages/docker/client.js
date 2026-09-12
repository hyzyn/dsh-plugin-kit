"use strict";(()=>{var tt=`/* eslint-disable */
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
  /* \u4E0E tty \u4FA7\u8FB9\u680F\u5165\u53E3\u540C\u56E0\uFF1A\u5BBF\u4E3B\u65E0\u5168\u5C40 box-sizing reset\uFF0Cwidth:100% + \u5DE6\u53F3 padding
     \u5728 content-box \u4E0B\u4F1A\u6BD4\u5BB9\u5668\u5BBD 24px\uFF0C\u591A\u51FA\u7684\u53F3\u4FA7\u4F1A\u88AB\u4FA7\u8FB9\u680F\u88C1\u6389\uFF08hover \u5E95\u8272\u7F3A\u4E00\u89D2\uFF09\u3002 */
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: var(--dk-gap-md);
  width: 100%;
  min-width: 0;
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
  /* \u6298\u53E0 rail \u91CC\u5BBF\u4E3B\u7684\u884C\u662F 36\xD736\uFF0C\u8DDF\u9F50\uFF08\u4E0E tty \u5165\u53E3\u4E00\u81F4\uFF09 */
  height: 36px;
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

/*
 * \u8F93\u5165\u6846\u4E00\u5F8B\u53EF\u6536\u7F29\uFF1A\u4EE5\u524D\u8FD9\u91CC\u662F min-width: 180px\uFF0C\u9047\u5230\u7A84\u5BB9\u5668\uFF08\u8BBE\u7F6E\u9762\u677F ~600px \u65F6
 * \u6BCF\u5217\u53EA\u6709 ~180px\uFF09\u4F1A\u628A\u5217\u6491\u7834\u3001\u548C\u9694\u58C1\u5B57\u6BB5\u53E0\u5728\u4E00\u8D77\u3002\u5BBD\u5EA6\u4EA4\u7ED9\u5BB9\u5668\u7684\u6805\u683C/\u5F39\u6027\u5E03\u5C40\u51B3\u5B9A\u3002
 */
.dk_input { min-width: 0; }
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
/* dsh-plugin-kit \u5957\u4EF6\u5FBD\u6807\uFF08\u7EA6\u5B9A\u89C1 @hyzyn/dsh-kit README\uFF1A\u5168\u90E8 kit \u8BBE\u7F6E\u5361\u7247\u5171\u7528\uFF09 */
.dshkit_badge {
  flex: none;
  margin-left: auto;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  line-height: 16px;
  letter-spacing: 0.02em;
  color: var(--dk-label-2, var(--dsw-alias-label-dimmed));
  background: var(--dk-bg-2, var(--dsw-alias-bg-layer-2));
  border: 1px solid var(--dk-border, var(--dsw-alias-border-l1));
}
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
  min-width: 0;
}

/*
 * \u6807\u7B7E\u884C\u9AD8\u5FC5\u987B\u9501\u6B7B\u3002
 * \u4E2D\u6587\u8D70 PingFang SC \u56DE\u9000\u5B57\u4F53\uFF0C\u884C\u6846\u6BD4\u7EAF\u62C9\u4E01\u6587\u672C\u9AD8 ~2.5px\uFF0816.5 vs 14\uFF09\uFF1B\u6805\u683C\u662F
 * align-items:start\uFF0C\u540C\u4E00\u884C\u91CC\u300Cdocker CLI\u300D\u548C\u300C\u7EDF\u8BA1\u5237\u65B0\u95F4\u9694\uFF08\u79D2\uFF09\u300D\u7684\u8F93\u5165\u6846\u5C31\u4F1A
 * \u5DEE 2.5px \u9519\u5F00\uFF0C\u57FA\u7EBF\u4E5F\u9AD8\u4F4E\u4E0D\u9F50\u3002\u7ED9\u6B7B\u884C\u9AD8\u540E\u4E24\u79CD\u6587\u672C\u7684\u884C\u6846\u7B49\u9AD8\uFF0C\u8F93\u5165\u6846\u9876\u8FB9\u5BF9\u9F50\u3002
 * \u522B\u5220\u6210 line-height: normal \u2014\u2014 \u4E00\u5220\u5C31\u9000\u56DE\u5B57\u4F53\u5EA6\u91CF\u51B3\u5B9A\u884C\u6846\u3002
 */
.dk_label { font-size: 12px; line-height: 1.4; color: var(--dk-label-2); }
.dk_hint { font-size: 11px; color: var(--dk-label-3); line-height: 1.6; }
.dk_row { display: flex; align-items: center; gap: var(--dk-gap-md); flex-wrap: wrap; }

/*
 * \u8BBE\u7F6E\u5361\u7247\u7684\u5B57\u6BB5\u6805\u683C\uFF1A**\u7B49\u5BBD** 3 \u5217\uFF08\u7A84\u5C4F 2 \u5217\uFF09\u3002
 * \u4E0D\u8981\u518D\u7ED9\u5355\u4E2A\u5B57\u6BB5\u8DE8\u5217\u2014\u2014\u7B2C\u4E00\u884C\u8DE8 2 \u5217\u3001\u7B2C\u4E8C\u884C\u5355\u5217\uFF0C\u884C\u4E0E\u884C\u4E4B\u95F4\u5BBD\u5EA6\u4E0D\u4E00\u81F4\uFF0C
 * \u770B\u8D77\u6765\u6BD4\u4E0D\u5BF9\u9F50\u8FD8\u4E71\uFF08v0.1.22 \u7684\u6559\u8BAD\uFF09\u3002
 */
.dk_fieldGrid {
  display: grid;
  /* auto-fit + minmax\uFF1A\u5217\u5BBD\u8DDF\u7740**\u5BB9\u5668**\u8D70\uFF0C\u800C\u4E0D\u662F\u89C6\u53E3 \u2014\u2014 \u8BBE\u7F6E\u9762\u677F\u672C\u8EAB\u53EF\u80FD\u662F\u7A84\u7684\u3002
     \u5361\u7247 ~966px \u2192 3 \u5217\uFF1B~570px \u2192 2 \u5217\uFF1B\u518D\u7A84 \u2192 1 \u5217\uFF0C\u6C38\u8FDC\u4E0D\u4F1A\u53E0 */
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--dk-gap-lg) var(--dk-gap-xl);
  align-items: start;
}

.dk_fieldGrid .dk_input,
.dk_fieldGrid .dk_select { min-width: 0; }

/* \u6570\u5B57\u8F93\u5165\u53BB\u6389\u6D4F\u89C8\u5668\u539F\u751F\u4E0A\u4E0B\u7BAD\u5934\uFF1A\u5404\u5E73\u53F0\u6837\u5F0F\u4E0D\u4E00\uFF0C\u8FD8\u4F1A\u5403\u6389\u53F3\u5185\u8FB9\u8DDD */
.dk_input[type="number"] {
  -moz-appearance: textfield;
  appearance: textfield;
  font-variant-numeric: tabular-nums;
}

.dk_input[type="number"]::-webkit-outer-spin-button,
.dk_input[type="number"]::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

/*
 * \u76EE\u6807\u884C\u4E0E\u5185\u8054 SSH \u5B57\u6BB5\u5171\u7528\u540C\u4E00\u5957\u5217\u5BBD\u6A21\u677F\uFF081fr \xB7 96px \xB7 1fr \xB7 150px\uFF09\uFF0C
 * \u5185\u8054\u5757\u6574\u5BBD\u94FA\u5F00 \u2192 host/port/username/auth \u6B63\u597D\u843D\u5728\u76EE\u6807\u540D/\u7C7B\u578B/\u8FDE\u63A5\u7C3F/\u64CD\u4F5C\u5217\u4E0B\u65B9\u3002
 */
.dk_targetRow {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 96px minmax(0, 1fr) minmax(0, 150px);
  gap: var(--dk-gap-sm);
  align-items: center;
  padding: var(--dk-gap-sm);
  border: 1px solid var(--dk-border);
  border-radius: var(--dk-r-md);
  background: var(--dk-surface-2);
}

/* \u5220\u9664\u6309\u94AE\u9760\u53F3\uFF0C\u4E0D\u8DDF\u7740\u5217\u5BBD\u88AB\u62C9\u957F */
.dk_targetRow > .dk_btnDanger { justify-self: end; }

.dk_targetInline {
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: minmax(0, 1fr) 96px minmax(0, 1fr) minmax(0, 150px);
  gap: var(--dk-gap-sm);
  align-items: center;
}

/* \u51ED\u636E\u5360\u524D\u4E09\u5217\uFF0C\u590D\u9009\u6846\u56FA\u5B9A\u7B2C 4 \u5217\uFF08\u4E0E\u4E0A\u9762\u7684 auth \u4E0B\u62C9\u4E0A\u4E0B\u5BF9\u9F50\uFF09 */
.dk_targetInline > .dk_credential { grid-column: 1 / span 3; }
.dk_targetInline > .dk_check { grid-row: 2; grid-column: 4; }

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
  .dk_targetRow,
  .dk_targetInline { grid-template-columns: minmax(0, 1fr) 80px; }
  .dk_targetInline > .dk_credential { grid-column: 1 / -1; }
  .dk_targetInline > .dk_check { grid-row: auto; grid-column: 2; }
  .dk_cardRow { grid-template-columns: 40px 1fr; }
}
`;var Mt="/api/dsh-docker",nt="dsh-docker-style";function Fe(){if(document.getElementById(nt)!==null)return;let l=document.createElement("style");l.id=nt,l.textContent=tt,document.head.appendChild(l)}async function G(l,g){let e=await fetch(Mt+l,{...g,headers:{"content-type":"application/json",...g?.headers??{}}}),o=null;try{o=await e.json()}catch{}if(!e.ok){let E=o!==null&&typeof o.error=="string"?o.error:`HTTP ${String(e.status)}`;throw new Error(E)}if(o!==null&&o.ok===!1)throw new Error(typeof o.error=="string"?o.error:"\u8BF7\u6C42\u5931\u8D25");return o}var P={config:()=>G("/config"),saveConfig:l=>G("/config",{method:"POST",body:JSON.stringify(l)}),targets:()=>G("/targets"),probe:l=>G("/probe",{method:"POST",body:JSON.stringify({target:l})}),containers:(l,g)=>G("/containers",{method:"POST",body:JSON.stringify({target:l,all:g})}),inspect:(l,g)=>G("/inspect",{method:"POST",body:JSON.stringify({target:l,id:g})}),logs:(l,g,e)=>G("/logs",{method:"POST",body:JSON.stringify({target:l,id:g,...e})}),stats:(l,g)=>G("/stats",{method:"POST",body:JSON.stringify({target:l,ids:g})}),images:l=>G("/images",{method:"POST",body:JSON.stringify({target:l})}),action:(l,g,e)=>G("/action",{method:"POST",body:JSON.stringify({target:l,action:g,id:e})}),exec:(l,g,e,o)=>G("/exec",{method:"POST",body:JSON.stringify({target:l,id:g,command:e,timeoutSec:o})})};function Ot(l){return l==null||!Number.isFinite(l)?"\u2014":l.toFixed(l>=10?1:2)+"%"}function Rt(l){return l.hostPort===void 0?String(l.containerPort)+"/"+l.protocol:String(l.hostPort)+"\u2192"+String(l.containerPort)+"/"+l.protocol}function at(l){if(!Array.isArray(l)||l.length===0)return"\u65E0\u7AEF\u53E3\u6620\u5C04";let g=new Set,e=[];for(let o of l){let E=Rt(o);g.has(E)||(g.add(E),e.push(E))}return e.join("  ")}function Dt(l){let g=/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/.exec(l);return g===null?l:g[1]+" "+g[2]}function At(l){return{running:"\u8FD0\u884C\u4E2D",exited:"\u5DF2\u505C\u6B62",created:"\u5DF2\u521B\u5EFA",paused:"\u5DF2\u6682\u505C",restarting:"\u91CD\u542F\u4E2D",dead:"dead",removing:"\u5220\u9664\u4E2D",unknown:"\u672A\u77E5"}[l]??l}function Ht(l,g){let e=new Blob([g],{type:"text/plain;charset=utf-8"}),o=URL.createObjectURL(e),E=document.createElement("a");E.href=o,E.download=l,E.click(),setTimeout(()=>URL.revokeObjectURL(o),1e3)}function rt(l){return"docker exec -it '"+String(l).replaceAll("'","'\\''")+"' sh"}var Z=null,de=null,Ne=null,ee=null,Ue=[],Ve=0,Le=null,Ee=!1;function it(l){Ee=l,Le!==null&&Le.set(l)}function st(l){it(!(l!==null&&typeof l=="object"&&l.enabled===!1))}function Ge(l){l!==null&&typeof l=="object"&&(ee=l),Ve=Date.now(),st(ee)}async function Te(){let l=!0;try{ee=(await P.config()).config,Ve=Date.now(),st(ee)}catch(g){l=!1,console.warn("[dsh-docker] \u914D\u7F6E\u7F13\u5B58\u5237\u65B0\u5931\u8D25\uFF1A"+(g instanceof Error?g.message:String(g)))}try{Ue=(await P.targets()).targets??[],Ve=Date.now()}catch(g){Ee&&(l=!1,console.warn("[dsh-docker] \u76EE\u6807\u7F13\u5B58\u5237\u65B0\u5931\u8D25\uFF1A"+(g instanceof Error?g.message:String(g))))}return l}async function Pt(l,g){let e=Ke(l,g);return e!==void 0?e:(await Te(),Ke(l,g))}function Ke(l,g){let e=ee!==null&&Array.isArray(ee.targets)?ee.targets:[];if(typeof g=="string"&&g!==""){let S=e.find(z=>z.kind==="ssh"&&z.book===g);if(S!==void 0)return S.name}let o=typeof l?.host=="string"?l.host:"";if(o==="")return;let E=Number(l?.port),h=Number.isInteger(E)&&E>0?E:22;for(let S of Ue){if(S.kind!=="ssh"||typeof S.label!="string")continue;let z=/^([^@]+)@(.+?)(?::(\d+))?$/.exec(S.label);if(z!==null&&z[2]===o&&Number(z[3]??22)===h)return S.name}}var dt='<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 1.8l5.4 3.1v6.2L8 14.2 2.6 11.1V4.9z"/><path d="M2.6 4.9L8 8l5.4-3.1"/><path d="M8 8v6.2"/></svg>',zt='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 1.8l5.4 3.1v6.2L8 14.2 2.6 11.1V4.9z"/><path d="M2.6 4.9L8 8l5.4-3.1"/><path d="M8 8v6.2"/></svg>',Ce='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.2 8a5.2 5.2 0 1 1-1.5-3.7"/><path d="M13.4 2.2v2.6h-2.6"/></svg>',Se='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M4.5 4.5l7 7"/><path d="M11.5 4.5l-7 7"/></svg>',jt='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 3.4l7.4 4.6L5 12.6z"/></svg>',Ft='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4.2" y="4.2" width="7.6" height="7.6" rx="1.2"/></svg>',Gt='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.2 8a5.2 5.2 0 1 1-1.5-3.7"/><path d="M13.4 2.2v2.6h-2.6"/></svg>',Vt='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4.6h10"/><path d="M6.2 4.6V3.4a.8.8 0 0 1 .8-.8h2a.8.8 0 0 1 .8.8v1.2"/><path d="M4.6 4.6l.6 8a.9.9 0 0 0 .9.8h3.8a.9.9 0 0 0 .9-.8l.6-8"/></svg>';var Kt='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3v7.2"/><path d="M5 7.4L8 10.4l3-3"/><path d="M3.4 12.8h9.2"/></svg>',Ut='<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2.6l5.8 10.4H2.2z"/><path d="M8 6.4v3.2"/><path d="M8 11.6h.01"/></svg>',ot='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5l3.5 3L3 11"/><path d="M8.5 11H13"/></svg>',Wt='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M3 4.5h10"/><path d="M3 8h10"/><path d="M3 11.5h6"/></svg>',Yt='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M3.5 12.5v-4"/><path d="M7 12.5v-8"/><path d="M10.5 12.5v-5"/><path d="M13 12.5v-2"/></svg>',Jt='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.5 8h-9"/><path d="M7 4.5L3.5 8 7 11.5"/></svg>',lt='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6.5L8 10.5l4-4"/></svg>';window.__ModuleLoader__.load({id:"@hyzyn/dsh-docker",factory:l=>{let g=l("react"),{jsx:e,jsxs:o}=l("react/jsx-runtime"),{createRoot:E}=l("react-dom/client"),{useState:h,useEffect:S,useRef:z,useCallback:oe}=g;function ct(t,a,d){if(a==="")return t;let k=t.toLowerCase(),w=a.toLowerCase(),r=[],_=0,x=k.indexOf(w),f=0;for(;x>=0&&f<500;)x>_&&r.push(t.slice(_,x)),r.push(e("mark",{children:t.slice(x,x+w.length)},d+"-m"+String(f))),_=x+w.length,f+=1,x=k.indexOf(w,_);return _<t.length&&r.push(t.slice(_)),r}function We(t){let a=t.health==="unhealthy"?"unhealthy":t.state,d=t.health==="unhealthy"?"\u4E0D\u5065\u5EB7":At(t.state);return e("span",{className:"dk_badge","data-state":a,title:t.status??"",children:d})}function V(t){return o("div",{className:"dk_banner","data-kind":t.kind??"error",children:[e("span",{className:"dk_bannerIcon",dangerouslySetInnerHTML:{__html:Ut}},"icon"),o("div",{className:"dk_bannerBody",children:[e("div",{children:t.title}),t.hint===void 0?null:e("div",{className:"dk_hint",style:{marginTop:4},children:t.hint})]},"body"),t.action===void 0?null:e("div",{className:"dk_bannerAction",children:t.action},"action")]})}function Ie(t){return o("div",{className:"dk_confirmBackdrop",onMouseDown:a=>a.stopPropagation(),children:[o("div",{className:"dk_confirm",children:[e("div",{className:"dk_confirmTitle",children:t.title}),e("div",{className:"dk_confirmText",children:t.text}),o("div",{className:"dk_confirmActions",children:[e("button",{type:"button",className:"dk_btn",onClick:t.onCancel,children:"\u53D6\u6D88"}),e("button",{type:"button",className:"dk_btn dk_btnDanger",onClick:t.onConfirm,children:t.confirmLabel})]})]})]})}function $t(t){return e("button",{type:"button",className:"dk_btn"+(t.danger===!0?" dk_btnDanger":""),disabled:t.disabled===!0,title:t.title??"",onClick:a=>{a.stopPropagation(),t.onClick()},children:t.children})}function ke(t){return o("div",{className:"dk_cardRow",children:[e("span",{className:"dk_cardLabel",children:t.label}),e("span",{className:"dk_cardValue",title:String(t.value),children:t.value})]})}function K(t){let a=t.disabled===!0;return e("button",{type:"button",className:"dk_iconBtn"+(t.danger===!0?" dk_iconBtnDanger":""),"data-on":t.on===!0?"1":void 0,"data-spin":t.spin===!0?"1":void 0,disabled:a,title:t.title,"aria-label":t.title,onClick:d=>{d.stopPropagation(),!a&&t.onClick()},children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:t.icon}})})}function kt(t){let a=t.item,d=t.allowMutations!==!0,k=a.state==="running"||a.state==="paused"||a.state==="restarting",w=a.createdAt===null?a.runningFor===""?"\u2014":a.runningFor:Dt(a.createdAt);return o("div",{className:"dk_card",role:"button",tabIndex:0,"data-selected":t.selected===!0?"1":"0",onClick:()=>t.onOpen(a,"overview"),onKeyDown:r=>{(r.key==="Enter"||r.key===" ")&&(r.preventDefault(),t.onOpen(a,"overview"))},children:[o("div",{className:"dk_cardHead",children:[e("span",{className:"dk_cardName",title:a.name,children:a.name}),e(We,{state:a.state,health:a.health,status:a.status})]},"head"),o("div",{className:"dk_cardRows",children:[e(ke,{label:"\u955C\u50CF",value:a.image},"image"),e(ke,{label:"ID",value:a.shortId},"id"),e(ke,{label:"\u7AEF\u53E3",value:at(a.ports)},"ports"),e(ke,{label:"\u521B\u5EFA",value:w},"created"),a.composeProject===null?null:e(ke,{label:"compose",value:a.composeProject+(a.composeService===null?"":"/"+a.composeService)},"compose")]},"rows"),o("div",{className:"dk_actionBar",children:[e(K,{icon:ot,title:"\u5728\u5BB9\u5668\u5185\u6253\u5F00\u4EA4\u4E92\u5F0F\u7EC8\u7AEF\uFF08docker exec -it "+a.name+" sh\uFF09",onClick:()=>t.onExec(a)},"exec"),e(K,{icon:Wt,title:"\u67E5\u770B\u65E5\u5FD7",onClick:()=>t.onOpen(a,"logs")},"logs"),e(K,{icon:Yt,title:"\u8D44\u6E90\u5360\u7528",onClick:()=>t.onOpen(a,"stats")},"stats"),e("span",{className:"dk_actionBarSep","aria-hidden":"true"},"sep"),e(K,{icon:k?Ft:jt,title:d?"\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D":k?"\u505C\u6B62\u5BB9\u5668":"\u542F\u52A8\u5BB9\u5668",disabled:d,onClick:()=>t.onAction(k?"stop":"start",a)},"power"),e(K,{icon:Gt,title:d?"\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D":"\u91CD\u542F\u5BB9\u5668",disabled:d,onClick:()=>t.onAction("restart",a)},"restart"),e(K,{icon:Vt,danger:!0,title:d?"\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D":"\u5220\u9664\u5BB9\u5668\uFF08\u4E0D\u53EF\u6062\u590D\uFF09",disabled:d,onClick:()=>t.onAction("remove",a)},"remove")]},"actions")]})}let ut=/^\s*(\[\d{4}-\d{2}-\d{2}[ T][0-9:.,]+\]|\d{2}:\d{2}:\d{2}[,.]\d{3})/,gt=/^\s*(\[(?:TRACE|DEBUG|INFO|WARN|ERROR|FATAL)\]|\|\s*(?:TRACE|DEBUG|INFO|WARN|ERROR|FATAL))/,ht=/(TRACE|DEBUG|INFO|WARN|ERROR|FATAL)/,Be=2e3;function pt(t,a,d){let k=[],w=t;for(let r=0;r<2;r+=1){let _=ut.exec(w);if(_!==null){k.push(e("span",{className:"dk_logTs",children:_[1]},"ts"+String(r))),w=w.slice(_[0].length);continue}let x=gt.exec(w);if(x!==null){let f=ht.exec(x[1]);k.push(e("span",{className:"dk_logLevel","data-level":f===null?"":f[1],children:x[1].trim()},"lv"+String(r))),w=w.slice(x[0].length);continue}break}return k.push(e("span",{className:"dk_logText",children:ct(w,d,"x"+String(a))},"tx")),o("div",{className:"dk_logLine",children:k},String(a))}function mt(t){let a=t.item,d=t.config,[k,w]=h(t.initialTab??"overview"),[r,_]=h(null),[x,f]=h(""),[N,j]=h({tail:d.logTailDefault,timestamps:!1}),[B,M]=h(null),[C,$]=h(""),[Y,te]=h(!1),[O,R]=h(""),[T,F]=h(!1),[J,i]=h(3),[s,p]=h(null),[I,q]=h(""),[he,X]=h(""),[D,be]=h(null),[pe,A]=h(""),[ne,me]=h(!1);S(()=>{let m=!0;return _(null),f(""),P.inspect(t.target,a.id).then(b=>{m&&_(b.details?.[0]??null)}).catch(b=>{m&&f(b.message)}),()=>{m=!1}},[t.target,a.id,t.refreshToken]);let Q=oe(()=>{te(!0),$(""),P.logs(t.target,a.id,{tail:N.tail,timestamps:N.timestamps}).then(m=>M(m.logs)).catch(m=>$(m.message)).finally(()=>te(!1))},[t.target,a.id,N.tail,N.timestamps]);S(()=>{k==="logs"&&Q()},[k,Q,t.refreshToken]),S(()=>{if(k!=="logs"||!T)return;let m=setInterval(Q,Math.max(1,J)*1e3);return()=>clearInterval(m)},[k,T,J,Q]),S(()=>{if(k!=="stats")return;let m=!0,b=()=>{P.stats(t.target,[a.id]).then(y=>{m&&(p(y.stats?.[0]??null),q(""))}).catch(y=>{m&&q(y.message)})};b();let c=setInterval(b,Math.max(2,d.pollIntervalSec)*1e3);return()=>{m=!1,clearInterval(c)}},[k,t.target,a.id,d.pollIntervalSec,t.refreshToken]);let U=()=>{he.trim()!==""&&(me(!0),A(""),be(null),P.exec(t.target,a.id,he,d.execTimeoutSec).then(m=>be(m.result)).catch(m=>A(m.message)).finally(()=>me(!1)))},W=()=>{if(x!=="")return e(V,{title:"\u8BFB\u53D6\u5BB9\u5668\u8BE6\u60C5\u5931\u8D25",hint:x});if(r===null)return e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]});let m=[["\u72B6\u6001",r.state+(r.health===null?"":" / "+r.health)+(r.status===""?"":"\uFF08"+r.status+"\uFF09")],["\u955C\u50CF",r.image],["\u5BB9\u5668 ID",r.shortId],["\u542F\u52A8\u65F6\u95F4",r.startedAt??"\u2014"],["\u7ED3\u675F\u65F6\u95F4",r.finishedAt??"\u2014"],["\u9000\u51FA\u7801",r.exitCode===null?"\u2014":String(r.exitCode)],["\u91CD\u542F\u6B21\u6570",r.restartCount===null?"\u2014":String(r.restartCount)],["\u91CD\u542F\u7B56\u7565",r.restartPolicy??"\u2014"],["PID",r.pid===null?"\u2014":String(r.pid)],["\u7AEF\u53E3",r.ports.length===0?"\u2014":at(r.ports)],["\u6302\u8F7D",r.mounts.length===0?"\u2014":r.mounts.map(c=>c.source+"\u2192"+c.destination+(c.readWrite?"":"\uFF08\u53EA\u8BFB\uFF09")).join(`
`)],["\u7F51\u7EDC",r.networks.length===0?"\u2014":r.networks.map(c=>c.name+(c.ip===null?"":"\uFF08"+c.ip+"\uFF09")).join(", ")],["\u547D\u4EE4",(r.entrypoint+" "+r.command).trim()||"\u2014"],["\u5DE5\u4F5C\u76EE\u5F55",r.workingDir===""?"\u2014":r.workingDir],["\u7528\u6237",r.user===""?"\u2014":r.user]],b=o("div",{className:"dk_kv",children:m.flatMap(([c,y],L)=>[e("div",{className:"dk_kvKey",children:c},"k"+String(L)),e("div",{className:"dk_kvVal"+(c==="\u5BB9\u5668 ID"||c==="\u547D\u4EE4"||c==="\u955C\u50CF"?" dk_kvValMono":""),children:y},"v"+String(L))])});return o("div",{children:[r.healthLogTail===null?null:e("div",{className:"dk_hint",style:{marginBottom:8},children:"\u6700\u8FD1\u5065\u5EB7\u68C0\u67E5\u8F93\u51FA\uFF1A"+r.healthLogTail}),b,e("div",{className:"dk_cardSection",style:{marginTop:16},children:"\u4E00\u6B21\u6027\u547D\u4EE4\uFF08docker exec\uFF09"}),d.allowExec!==!0?e(V,{kind:"info",title:"exec \u672A\u542F\u7528",hint:"\u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6253\u5F00\u300C\u5141\u8BB8 exec\u300D\uFF0C\u6216\u76F4\u63A5\u590D\u5236\u5361\u7247\u4E0A\u7684 exec \u547D\u4EE4\u5230\u7EC8\u7AEF\u9762\u677F\u4EA4\u4E92\u5F0F\u8FDB\u5165\u5BB9\u5668\u3002"}):o("div",{children:[o("div",{className:"dk_row",children:[e("input",{className:"dk_input",style:{flex:"1 1 auto"},placeholder:"\u5982 ls -la /app \u6216 cat /etc/nginx/nginx.conf",value:he,onChange:c=>X(c.target.value),onKeyDown:c=>{c.key==="Enter"&&U()}}),e("button",{type:"button",className:"dk_btn dk_btnPrimary",disabled:ne,onClick:U,children:ne?"\u6267\u884C\u4E2D\u2026":"\u6267\u884C"})]}),pe===""?null:e(V,{title:"\u6267\u884C\u5931\u8D25",hint:pe}),D===null?null:o("div",{style:{marginTop:8},children:[e("div",{className:"dk_hint",children:"\u9000\u51FA\u7801 "+(D.code===null?"?":String(D.code))+" \xB7 \u8017\u65F6 "+String(D.durationMs)+"ms"+(D.truncated?" \xB7 \u8F93\u51FA\u5DF2\u622A\u65AD":"")}),e("pre",{className:"dk_logBox",style:{marginTop:6},children:(D.stdout||"")+(D.stderr===""?"":`
[stderr]
`+D.stderr)||"(\u65E0\u8F93\u51FA)"})]})]})]})},ae=()=>{let m=B!==null&&typeof B=="object"&&typeof B.text=="string"?B.text:"",b=O.trim().toLowerCase(),c=m===""?[]:m.split(`
`),y=b===""?c:c.filter(L=>L.toLowerCase().includes(b));return{raw:m,needle:b,allLines:c,matchedLines:y}},fe=(m,b,c)=>e("button",{type:"button",className:"dk_pill","data-on":m?"1":"0",onClick:c,children:b}),Re=()=>{let{raw:m}=ae(),b=[...new Set([100,200,500,1e3,5e3,Number(d.logTailDefault)||200,Number(N.tail)||200])].filter(c=>Number.isInteger(c)&&c>0).sort((c,y)=>c-y);return o("div",{className:"dk_logTools",children:[e("span",{className:"dk_toolLabel",children:"LINES"}),e("select",{className:"dk_select dk_selectSm",value:String(N.tail),onChange:c=>j({...N,tail:Number(c.target.value)}),children:b.map(c=>e("option",{value:String(c),children:c===5e3?"Last 5000":"Last "+String(c)},String(c)))}),e("span",{className:"dk_toolLabel",children:"TIMESTAMPS"}),fe(N.timestamps,N.timestamps?"On":"Off",()=>j({...N,timestamps:!N.timestamps})),e("span",{className:"dk_toolLabel",children:"AUTO REFRESH"}),fe(T,T?"On":"Off",()=>F(c=>!c)),e("select",{className:"dk_select dk_selectSm",value:String(J),title:"\u81EA\u52A8\u5237\u65B0\u95F4\u9694\uFF08\u5F00\u542F AUTO REFRESH \u540E\u6309\u6B64\u8F6E\u8BE2\uFF09",onChange:c=>i(Number(c.target.value)),children:[2,3,5,10].map(c=>e("option",{value:String(c),children:String(c)+"s"},String(c)))}),e(K,{icon:Ce,title:"\u5237\u65B0\u65E5\u5FD7",spin:Y,onClick:Q},"refresh"),e(K,{icon:Kt,title:"\u4E0B\u8F7D\u65E5\u5FD7",disabled:m==="",onClick:()=>Ht(a.name+".log",m)},"download")]})},_e=()=>{let{needle:m,allLines:b,matchedLines:c}=ae();return o("div",{className:"dk_filterBar",children:[o("div",{className:"dk_filterWrap",children:[e("input",{className:"dk_input dk_filterInput",placeholder:"\u8FC7\u6EE4\u65E5\u5FD7\u2026",value:O,onChange:y=>R(y.target.value),onKeyDown:y=>{y.key==="Escape"&&O!==""&&(y.stopPropagation(),R(""))}}),O===""?null:e("button",{type:"button",className:"dk_filterClear",title:"\u6E05\u7A7A\u8FC7\u6EE4","aria-label":"\u6E05\u7A7A\u8FC7\u6EE4",onClick:()=>R(""),children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Se}})},"clear")]}),e("span",{className:"dk_filterCount",children:m===""?String(b.length)+" \u884C":String(c.length)+" / "+String(b.length)+" \u884C\u5339\u914D"})]})},De=()=>{let{needle:m,matchedLines:b}=ae(),c=b.length>Be?b.slice(-Be):b;return o("div",{className:"dk_logs",children:[C===""?null:e(V,{title:"\u8BFB\u53D6\u65E5\u5FD7\u5931\u8D25",hint:C+(C.includes("Failed to fetch")?"\uFF08\u7F51\u7EDC\u8BF7\u6C42\u6CA1\u5230\u5BBF\u4E3B\uFF1A\u5BBF\u4E3B\u53EF\u80FD\u521A\u91CD\u542F\u3001\u6216\u8FDE\u63A5\u88AB\u4E2D\u65AD\uFF09":""),action:e("button",{type:"button",className:"dk_btn",disabled:Y,onClick:Q,children:"\u91CD\u8BD5"})}),B!==null&&B.truncated===!0?e(V,{kind:"warn",title:"\u65E5\u5FD7\u8F93\u51FA\u8D85\u8FC7\u4E0A\u9650\uFF0C\u5DF2\u622A\u65AD",hint:"\u8C03\u5C0F\u300CLINES\u300D\u6216\u5230\u8BBE\u7F6E\u5361\u7247\u8C03\u5927\u300C\u5355\u6B21\u547D\u4EE4\u8F93\u51FA\u4E0A\u9650\u300D\u3002"}):null,o("div",{className:"dk_logBody",children:[b.length>c.length?e("div",{className:"dk_logLine dk_logMore",children:"\uFF08\u53EA\u663E\u793A\u6700\u8FD1 "+String(Be)+" \u884C\uFF0C\u5171 "+String(b.length)+" \u884C\u5339\u914D\uFF09"},"more"):null,C!==""?null:B===null?e("div",{className:"dk_logLine",children:"\u8BFB\u53D6\u4E2D\u2026"},"loading"):c.length===0?e("div",{className:"dk_logLine",children:m===""?"(\u65E0\u65E5\u5FD7)":"(\u65E0\u5339\u914D\u65E5\u5FD7)"},"empty"):c.map((y,L)=>pt(y,L,m))]})]})},Ae=()=>{if(I!=="")return e(V,{title:"\u8BFB\u53D6\u7EDF\u8BA1\u5931\u8D25",hint:I});if(s===null)return e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]});let m=s.cpuPercent??0,b=s.memPercent??0,c=L=>o("div",{className:"dk_bar",children:[e("div",{className:"dk_barFill","data-warn":L>=60&&L<85?"1":void 0,"data-danger":L>=85?"1":void 0,style:{width:Math.min(100,Math.max(0,L))+"%"}})]}),y=(L,xe,Pe)=>o("tr",{children:[e("td",{children:L}),e("td",{className:"dk_num",children:xe}),e("td",{children:Pe??null})]},L);return o("table",{className:"dk_stats",children:[e("thead",{children:o("tr",{children:[e("th",{children:"\u6307\u6807"}),e("th",{children:"\u6570\u503C"}),e("th",{children:"\u5360\u7528"})]})}),e("tbody",{children:[y("CPU",Ot(s.cpuPercent),c(m)),y("\u5185\u5B58",s.memUsage,c(b)),y("\u7F51\u7EDC IO",s.netIO,null),y("\u78C1\u76D8 IO",s.blockIO,null),y("PIDs",s.pids===null?"\u2014":String(s.pids),null)]})]})},He=[["overview","\u6982\u89C8"],["logs","\u65E5\u5FD7"],["stats","\u7EDF\u8BA1"]],ve=k==="overview"?r===null&&x==="":k==="stats"?s===null&&I==="":!1;return o("div",{className:"dk_detail",children:[o("div",{className:"dk_header dk_headerDetail",children:[e(K,{icon:Jt,title:"\u8FD4\u56DE\u5BB9\u5668\u5217\u8868",onClick:t.onBack},"back"),e("span",{className:"dk_detailTitle",title:a.name,children:a.name}),e(We,{state:a.state,health:a.health,status:a.status}),e("span",{className:"dk_detailSub",children:t.targetLabel??""}),e("span",{className:"dk_headerSpacer"}),k==="logs"?Re():e(K,{icon:Ce,title:"\u5237\u65B0",spin:ve,onClick:t.onRefresh},"refresh"),t.docked===!0?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:t.onClose,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Se}})},"close")]}),o("div",{className:"dk_tabs",children:[...He.map(([m,b])=>e("button",{type:"button",className:"dk_tab","data-on":k===m?"1":"0",onClick:()=>w(m),children:b},m)),k==="logs"?e("span",{className:"dk_headerSpacer"},"spacer"):null,k==="logs"?_e():null]}),e("div",{className:"dk_detailBody",children:k==="overview"?W():k==="logs"?De():Ae()})]})}function ft(t){let a=t.collapsed===!0;return o("div",{className:"dk_drawer","data-collapsed":a?"1":void 0,style:a||t.height===null?void 0:{height:String(t.height)+"px"},children:[e("div",{className:"dk_drawerResize",title:"\u62D6\u52A8\u8C03\u6574\u7EC8\u7AEF\u9AD8\u5EA6\uFF08\u53CC\u51FB\u6298\u53E0 / \u5C55\u5F00\uFF09",onMouseDown:t.onResizeStart,onDoubleClick:t.onToggleCollapse},"resize"),o("div",{className:"dk_drawerHead",children:[e("span",{className:"dk_drawerIcon",dangerouslySetInnerHTML:{__html:ot}}),e("span",{className:"dk_drawerTitle",title:t.label,children:t.label}),e("span",{className:"dk_drawerHint",children:a?"\u5DF2\u6298\u53E0 \xB7 \u4F1A\u8BDD\u4FDD\u6301\u8FD0\u884C":"\u7531\u7EC8\u7AEF\u9762\u677F\u627F\u8F7D \xB7 \u6298\u53E0\u4FDD\u7559\u4F1A\u8BDD"}),e("span",{className:"dk_headerSpacer"}),e("button",{type:"button",className:"dk_iconBtn dk_drawerFold",title:a?"\u5C55\u5F00\u7EC8\u7AEF\uFF08\u4F1A\u8BDD\u672A\u4E2D\u65AD\uFF09":"\u6298\u53E0\u7EC8\u7AEF\uFF08\u4F1A\u8BDD\u4FDD\u6301\u8FD0\u884C\uFF09",onClick:t.onToggleCollapse,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:lt}})},"fold"),e("button",{type:"button",className:"dk_iconBtn",title:"\u7ED3\u675F\u7EC8\u7AEF\u4F1A\u8BDD\u5E76\u6536\u8D77\u62BD\u5C49",onClick:t.onClose,children:e("span",{dangerouslySetInnerHTML:{__html:Se}})},"close")]}),e("div",{className:"dk_drawerBody",ref:t.hostRef})]})}function Ye(t){let[a,d]=h(null),[k,w]=h([]),[r,_]=h(t.initialTarget??""),x=t.sessionHint!==void 0&&(t.initialTarget??"")==="",[f,N]=h("containers"),[j,B]=h([]),[M,C]=h([]),[$,Y]=h(!1),[te,O]=h(""),[R,T]=h(""),[F,J]=h(!0),[i,s]=h(""),[p,I]=h("all"),[q,he]=h(!1),[X,D]=h(null),[be,pe]=h(0),[A,ne]=h(null),[me,Q]=h(""),U=z(!0),[W,ae]=h(null),fe=z(null),[Re,_e]=h(!1),[De,Ae]=h(null),[He,ve]=h(!1),m=z(null),b=z(!1);S(()=>()=>{U.current=!1},[]),S(()=>{if(W===null)return;let n=fe.current;if(n===null)return;let u=null;try{u=Z.mount(n,W.options)}catch(v){T("\u7EC8\u7AEF\u542F\u52A8\u5931\u8D25\uFF1A"+(v instanceof Error?v.message:String(v))),ae(null);return}return()=>{try{u?.()}catch{}}},[W]);let c=n=>{if(n.button!==void 0&&n.button!==0)return;let u=n.currentTarget.parentElement,v=m.current;if(u===null||v===null)return;n.preventDefault();let se=n.clientY,ce=u.getBoundingClientRect().height,H=Math.max(160,Math.round(v.getBoundingClientRect().height*.75)),Ze=Et=>{let It=Math.round(ce+(se-Et.clientY));Ae(Math.min(H,Math.max(160,It)))},et=()=>{document.removeEventListener("mousemove",Ze),document.removeEventListener("mouseup",et),document.body.style.userSelect=""};document.body.style.userSelect="none",document.addEventListener("mousemove",Ze),document.addEventListener("mouseup",et)},y=()=>{if(W===null){t.onClose();return}ve(!0)};S(()=>{P.config().then(n=>{let u=n.config;d(u),!x&&Array.isArray(u.targets)&&u.targets.length>0&&_(v=>v===""?u.targets[0].name:v),Ge(u)}).catch(n=>O(n.message)),P.targets().then(n=>{w(n.targets??[]),Ue=n.targets??[];let u=(n.targets??[])[0];u!==void 0&&!x&&_(v=>v===""?u.name:v)}).catch(()=>{})},[]);let L=oe(()=>{r!==""&&(Y(!0),P.containers(r,F).then(n=>{U.current&&(B(n.containers??[]),O(""))}).catch(n=>{U.current&&O(n.message)}).finally(()=>{U.current&&Y(!1)}))},[r,F]),xe=oe(()=>{r!==""&&(Y(!0),P.images(r).then(n=>{U.current&&(C(n.images??[]),O(""))}).catch(n=>{U.current&&O(n.message)}).finally(()=>{U.current&&Y(!1)}))},[r]),Pe=oe(()=>pe(n=>n+1),[]),ie=oe(()=>{f==="images"?xe():L(),pe(n=>n+1)},[f,L,xe]);S(()=>{r!==""&&ie()},[r,F,f]),S(()=>{if(!q||r===""||f!=="containers")return;let n=setInterval(ie,Math.max(2,a?.pollIntervalSec??5)*1e3);return()=>clearInterval(n)},[q,ie,r,a,f]),S(()=>{if(R==="")return;let n=setTimeout(()=>T(""),4e3);return()=>clearTimeout(n)},[R]);let we=(n,u)=>{let v=rt(n.name);navigator.clipboard.writeText(v).then(()=>{T("\u5DF2\u590D\u5236\uFF1A"+v+(u===void 0?"":"\uFF08"+u+"\uFF09"))}).catch(()=>T("\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u6267\u884C\uFF1A"+v))},Ct=n=>{let u=rt(n.name);if(Z===null){let H=document.querySelector("[data-dsh-tty-entry]")!==null;we(n,H?"\u7EC8\u7AEF\u9762\u677F\u7248\u672C\u8FC7\u65E7\uFF08\u4EA4\u4E92\u5F0F\u8FDB\u5165\u5BB9\u5668\u9700\u8981 dsh-tty \u2265 0.14.0\uFF09\uFF0C\u547D\u4EE4\u5DF2\u590D\u5236\uFF0C\u53EF\u7C98\u8D34\u5230\u7CFB\u7EDF\u7EC8\u7AEF\u6267\u884C":"\u672A\u5B89\u88C5 dsh-tty \u7EC8\u7AEF\u9762\u677F\uFF0C\u547D\u4EE4\u5DF2\u590D\u5236\uFF0C\u53EF\u7C98\u8D34\u5230\u7CFB\u7EDF\u7EC8\u7AEF\u6267\u884C\uFF08\u88C5 dsh-tty \u540E\u53EF\u76F4\u63A5\u5728\u6B64\u5F00\u7EC8\u7AEF\uFF09");return}let v=(a?.targets??[]).find(H=>H.name===r),se=n.name+" \xB7 exec",ce=v===void 0||v.kind==="local"?{command:u,label:se}:typeof v.book=="string"&&v.book!==""?{book:v.book,command:u,label:se}:(v.auth??"agent")==="agent"?{spec:{host:v.host,port:v.port,username:v.username,auth:"agent",agentForward:v.agentForward===!0},command:u,label:se}:null;if(ce===null){we(n,"\u5185\u8054\u76EE\u6807\u7528\u4E86 key/password \u8BA4\u8BC1\uFF0C\u6D4F\u89C8\u5668\u7AEF\u62FF\u4E0D\u5230\u51ED\u8BC1");return}if(t.docked===!0){try{Z.open(ce)}catch(H){we(n,H instanceof Error?H.message:String(H))}return}if(typeof Z.mount=="function"&&Number(Z.version??0)>=2){ae({label:se,options:ce}),_e(!1);return}try{Z.open(ce),t.onClose()}catch(H){we(n,H instanceof Error?H.message:String(H))}},St=(n,u)=>{ne({title:n==="remove"?"\u5220\u9664\u5BB9\u5668":n==="stop"?"\u505C\u6B62\u5BB9\u5668":n==="start"?"\u542F\u52A8\u5BB9\u5668":"\u91CD\u542F\u5BB9\u5668",text:n==="remove"?`\u786E\u5B9A\u5220\u9664\u5BB9\u5668 ${u.name}\uFF1F\u5BB9\u5668\u7684\u53EF\u5199\u5C42\u4E0E\u914D\u7F6E\u4F1A\u88AB\u5220\u9664\uFF08\u547D\u540D\u6570\u636E\u5377\u4FDD\u7559\uFF09\uFF0C\u6B64\u64CD\u4F5C\u4E0D\u53EF\u6062\u590D\u3002`:`\u786E\u5B9A\u5BF9\u5BB9\u5668 ${u.name} \u6267\u884C${n==="stop"?"\u505C\u6B62":n==="start"?"\u542F\u52A8":"\u91CD\u542F"}\u64CD\u4F5C\uFF1F`,confirmLabel:n==="remove"?"\u5220\u9664":"\u786E\u5B9A",run:()=>{ne(null),P.action(r,n,u.id).then(v=>{T(`${v.result.action} ${u.name}\uFF1A${v.result.message}`),ie()}).catch(v=>O(v.message))}})},ye=X===null?null:j.find(n=>n.id===X.id)??X.item,qe=j.filter(n=>{if(p==="running"&&!(n.state==="running"||n.state==="paused"||n.state==="restarting")||p==="stopped"&&n.state==="running"||p==="unhealthy"&&n.health!=="unhealthy")return!1;let u=i.trim().toLowerCase();return u===""?!0:n.name.toLowerCase().includes(u)||n.image.toLowerCase().includes(u)||n.id.toLowerCase().includes(u)}),ze=M.filter(n=>{let u=me.trim().toLowerCase();return u===""||n.reference.toLowerCase().includes(u)||n.id.toLowerCase().includes(u)}),je=n=>{let u=k.find(v=>v.name===n);return u===void 0||u.label===void 0?n:n+" \xB7 "+u.label},Xe=()=>$?e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]}):r===""?x?o("div",{className:"dk_empty",children:[e("div",{className:"dk_emptyTitle",children:"\u5F53\u524D\u4F1A\u8BDD\u4E3B\u673A\u8FD8\u4E0D\u662F Docker \u76EE\u6807"}),e("div",{className:"dk_emptyHint",children:"\u6309\u4E0A\u9762\u7684\u63D0\u793A\u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6DFB\u52A0\u4E00\u6761\u76EE\u6807\uFF08\u63A8\u8350\u76F4\u63A5\u9009\u8FDE\u63A5\u7C3F\u6761\u76EE\uFF09\uFF0C\u4FDD\u5B58\u540E\u56DE\u5230\u8FD9\u91CC\u5237\u65B0\u3002\u4E3A\u907F\u514D\u5F20\u51A0\u674E\u6234\uFF0C\u9762\u677F\u4E0D\u4F1A\u81EA\u52A8\u5207\u5230\u5176\u4ED6\u76EE\u6807\u3002"})]}):o("div",{className:"dk_empty",children:[e("div",{className:"dk_emptyTitle",children:"\u8FD8\u6CA1\u6709\u914D\u7F6E Docker \u76EE\u6807"}),e("div",{className:"dk_emptyHint",children:"\u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6DFB\u52A0\u4E00\u4E2A\u76EE\u6807\uFF1A\u672C\u673A\u76F4\u63A5\u9009\u300C\u672C\u673A\u300D\uFF1B\u8FDC\u7A0B\u4E3B\u673A\u53EF\u4EE5\u5F15\u7528 tty \u7EC8\u7AEF\u9762\u677F\u7684\u8FDE\u63A5\u7C3F\u6761\u76EE\u3002"})]}):o("div",{className:"dk_empty",children:[e("div",{className:"dk_emptyTitle",children:f==="images"?"\u6CA1\u6709\u955C\u50CF":"\u6CA1\u6709\u5BB9\u5668"}),e("div",{className:"dk_emptyHint",children:i.trim()===""?"\u76EE\u6807\u4E0A\u6CA1\u6709\u5339\u914D\u7684\u6570\u636E\uFF0C\u6216\u7B5B\u9009\u6761\u4EF6\u8FC7\u7A84\u3002":"\u6CA1\u6709\u5339\u914D\u300C"+i.trim()+"\u300D\u7684\u7ED3\u679C\u3002"})]}),Tt=()=>f==="images"?o("div",{className:"dk_imagesView",children:[ze.length===0?Xe():e("div",{className:"dk_tableWrap",children:o("table",{className:"dk_images",children:[e("thead",{children:o("tr",{children:[e("th",{children:"\u955C\u50CF"}),e("th",{children:"\u5927\u5C0F"}),e("th",{children:"\u521B\u5EFA"}),e("th",{children:"ID"})]})}),e("tbody",{children:ze.map(n=>o("tr",{children:[e("td",{className:"dk_mono",children:n.reference}),e("td",{children:n.sizeText}),e("td",{children:n.createdSince}),e("td",{className:"dk_mono",children:n.shortId})]},n.id+n.reference))})]})})]}):qe.length===0?Xe():e("div",{className:"dk_grid",children:qe.map(n=>e(kt,{item:n,selected:X!==null&&n.id===X.id,allowMutations:a?.allowMutations===!0,onOpen:(u,v)=>D({id:u.id,tab:v,item:u}),onExec:Ct,onAction:St,onCopyExec:u=>{navigator.clipboard.writeText("docker exec -it "+u.name+" sh").then(()=>T("\u5DF2\u590D\u5236\uFF1Adocker exec -it "+u.name+" sh")).catch(()=>T("\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u590D\u5236"))}},n.id))}),re=t.docked===!0,Lt=[ye!==null?[e(mt,{item:ye,target:r,targetLabel:je(r),config:a??{pollIntervalSec:5,logTailDefault:200,allowExec:!1,execTimeoutSec:30},initialTab:X.tab,refreshToken:be,onBack:()=>D(null),onRefresh:Pe,onClose:y,docked:re},"detail"),A===null?null:e(Ie,{title:A.title,text:A.text,confirmLabel:A.confirmLabel,onCancel:()=>ne(null),onConfirm:A.run},"confirm")]:[re?null:o("div",{className:"dk_header",children:[e("span",{className:"dk_titleIcon",dangerouslySetInnerHTML:{__html:dt}}),e("span",{className:"dk_title",children:"Docker \u5BB9\u5668"}),a?.allowMutations===!0?null:e("span",{className:"dk_badge","data-state":"paused",children:"\u53EA\u8BFB\u6A21\u5F0F"}),e("span",{className:"dk_headerSpacer"}),ye!==null?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5237\u65B0\u5217\u8868","data-spin":$?"1":void 0,onClick:ie,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Ce}})}),e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:y,children:e("span",{dangerouslySetInnerHTML:{__html:Se}})})]}),ye!==null?null:o("div",{className:"dk_toolbar",children:[re?e("button",{type:"button",className:"dk_iconBtn",title:"\u5237\u65B0\u5217\u8868","data-spin":$?"1":void 0,onClick:ie,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Ce}})},"refresh"):null,re&&a?.allowMutations!==!0?e("span",{className:"dk_badge","data-state":"paused",children:"\u53EA\u8BFB\u6A21\u5F0F"},"readonly"):null,e("select",{className:"dk_select",value:r,onChange:n=>{_(n.target.value),D(null),t.onTargetChange?.(je(n.target.value))},children:[...r===""?[e("option",{value:"",children:"\uFF08\u672A\u9009\u62E9\u76EE\u6807\uFF09"},"__none")]:[],...(k.length===0&&r!==""?[{name:r,label:void 0}]:k).map(n=>e("option",{value:n.name,children:je(n.name)},n.name))]}),e("div",{className:"dk_seg",children:[["containers","\u5BB9\u5668"],["images","\u955C\u50CF"]].map(([n,u])=>e("button",{type:"button",className:"dk_segBtn","data-on":f===n?"1":"0",onClick:()=>{N(n),D(null)},children:u},n))}),f==="containers"?e("input",{className:"dk_input dk_search",placeholder:"\u641C\u7D22\u540D\u79F0 / \u955C\u50CF / ID",value:i,onChange:n=>s(n.target.value)}):null,f==="images"?e("input",{className:"dk_input dk_search",placeholder:"\u641C\u7D22\u955C\u50CF\uFF08\u4ED3\u5E93 / \u6807\u7B7E / ID\uFF09",value:me,onChange:n=>Q(n.target.value)}):null,f==="images"?e("span",{className:"dk_hint dk_searchCount",children:String(ze.length)+" / "+String(M.length)+" \u4E2A\u955C\u50CF"}):null,f==="containers"?e("div",{className:"dk_seg",children:[["all","\u5168\u90E8"],["running","\u8FD0\u884C\u4E2D"],["stopped","\u5DF2\u505C\u6B62"],["unhealthy","\u4E0D\u5065\u5EB7"]].map(([n,u])=>e("button",{type:"button",className:"dk_segBtn","data-on":p===n?"1":"0",onClick:()=>I(n),children:u},n))}):null,f==="containers"?e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:F,onChange:n=>J(n.target.checked)}),"\u542B\u5DF2\u505C\u6B62"]}):null,f==="containers"?e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:q,onChange:n=>he(n.target.checked)}),"\u81EA\u52A8\u5237\u65B0"]}):null]}),o("div",{className:"dk_body",children:[o("div",{className:"dk_main"+(f==="images"?" dk_mainImages":""),children:[te===""?null:e(V,{title:"\u64CD\u4F5C\u5931\u8D25",hint:te}),R===""?null:e(V,{kind:"info",title:R}),t.sessionHint===void 0?null:e(V,{kind:"info",title:"\u5F53\u524D\u4F1A\u8BDD\u4E3B\u673A\u8FD8\u6CA1\u914D\u7F6E\u4E3A Docker \u76EE\u6807",hint:"\u4F1A\u8BDD\u4E3B\u673A\uFF1A"+t.sessionHint.host+(t.sessionHint.port===22?"":":"+String(t.sessionHint.port))+(t.sessionHint.book===""?"":"\uFF08\u8FDE\u63A5\u7C3F\uFF1A"+t.sessionHint.book+"\uFF09")+" \u2014 \u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6DFB\u52A0\u4E00\u6761 kind=ssh \u76EE\u6807"+(t.sessionHint.book===""?"\uFF08\u586B host/username\uFF0C\u6216\u7528\u8FDE\u63A5\u7C3F\u6761\u76EE\uFF09":"\uFF0C\u76F4\u63A5\u9009\u8FDE\u63A5\u7C3F\u6761\u76EE\u300C"+t.sessionHint.book+"\u300D")+"\uFF0C\u4FDD\u5B58\u540E\u56DE\u5230\u8FD9\u91CC\u5237\u65B0\u5373\u53EF\u3002"}),a!==null&&a.allowMutations!==!0?e(V,{kind:"info",title:"\u5F53\u524D\u4E3A\u53EA\u8BFB\u6A21\u5F0F",hint:"\u542F\u52A8 / \u505C\u6B62 / \u91CD\u542F / \u5220\u9664\u9700\u8981\u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D\u3002"}):null,Tt()]})]}),A===null?null:e(Ie,{title:A.title,text:A.text,confirmLabel:A.confirmLabel,onCancel:()=>ne(null),onConfirm:A.run})],W===null?null:e(ft,{label:W.label,hostRef:fe,collapsed:Re,height:De,onToggleCollapse:()=>_e(n=>!n),onResizeStart:c,onClose:()=>ae(null)},"execDrawer"),He&&W!==null?e(Ie,{title:"\u7ED3\u675F\u5BB9\u5668\u7EC8\u7AEF\u4F1A\u8BDD",text:"\u5173\u95ED\u9762\u677F\u4F1A\u7ED3\u675F\u300C"+W.label+"\u300D\u7684\u7EC8\u7AEF\u4F1A\u8BDD\uFF08docker exec -it \u2026\uFF09\u3002\u82E5\u53EA\u662F\u60F3\u7ED9\u65E5\u5FD7 / \u5217\u8868\u817E\u5730\u65B9\uFF0C\u5148\u70B9\u62BD\u5C49\u53F3\u4E0A\u89D2\u7684\u6298\u53E0\u6309\u94AE\u5373\u53EF\uFF0C\u4F1A\u8BDD\u4F1A\u4FDD\u6301\u8FD0\u884C\u3002",confirmLabel:"\u7ED3\u675F\u5E76\u5173\u95ED",onCancel:()=>ve(!1),onConfirm:()=>{ve(!1),t.onClose()}},"closeConfirm"):null],Qe=o("div",{className:"dk_panel"+(re?" dk_panelDock":""),"data-dock":re?"1":void 0,ref:m,onMouseDown:n=>n.stopPropagation(),children:Lt});return re?Qe:o("div",{className:"dk_backdrop",onMouseDown:n=>{b.current=n.target===n.currentTarget},onMouseUp:n=>{let u=b.current&&n.target===n.currentTarget;b.current=!1,u&&y()},children:[Qe]})}function vt(){let[t,a]=h(!1),[d,k]=h(null),[w,r]=h(!1),[_,x]=h(!1),[f,N]=h({kind:"",text:""}),j=z(0),B=oe(()=>{P.config().then(i=>{k(i.config),Ge(i.config),j.current=Array.isArray(i.config?.targets)?i.config.targets.length:0,r(!0)}).catch(i=>{N({kind:"error",text:"\u8BFB\u53D6\u914D\u7F6E\u5931\u8D25\uFF1A"+i.message}),r(!0)})},[]);S(()=>{t&&!w&&B()},[t,w,B]);let M=i=>k(s=>({...s,...i})),C=(i,s)=>k(p=>{let I=p.targets.slice();return I[i]={...I[i],...s},{...p,targets:I}}),$=()=>k(i=>({...i,targets:[...i.targets,{name:"\u76EE\u6807"+String(i.targets.length+1),kind:"local",book:"",host:"",port:22,username:"",auth:"agent",keyPath:"",agentForward:!1,passwordSet:!1,passphraseSet:!1}]})),Y=i=>k(s=>({...s,targets:s.targets.filter((p,I)=>I!==i)})),te=i=>k(s=>({...s,hostKeys:s.hostKeys.filter(p=>!(p.host===i.host&&p.port===i.port))})),O=()=>{x(!0),N({kind:"",text:""});let i={enabled:d.enabled,announceToAgent:d.announceToAgent,dockerBin:d.dockerBin,allowMutations:d.allowMutations,allowExec:d.allowExec,execTimeoutSec:d.execTimeoutSec,pollIntervalSec:d.pollIntervalSec,logTailDefault:d.logTailDefault,maxOutputKb:d.maxOutputKb,targets:d.targets.map(s=>({name:s.name,kind:s.kind,book:s.book??"",host:s.host??"",port:Number(s.port)||22,username:s.username??"",auth:s.auth??"agent",keyPath:s.keyPath??"",...s.password===void 0||s.password===""?{}:{password:s.password},...s.passphrase===void 0||s.passphrase===""?{}:{passphrase:s.passphrase},agentForward:s.agentForward===!0})),hostKeys:d.hostKeys,...d.targets.length===0&&j.current>0?{clearTargets:!0}:{}};P.saveConfig(i).then(s=>{k(s.config),Ge(s.config),j.current=Array.isArray(s.config?.targets)?s.config.targets.length:0,Te(),N(s.warning===void 0?{kind:"ok",text:"\u5DF2\u4FDD\u5B58\u5E76\u70ED\u751F\u6548"}:{kind:"error",text:s.warning})}).catch(s=>{N({kind:"error",text:"\u4FDD\u5B58\u5931\u8D25\uFF1A"+s.message})}).finally(()=>x(!1))},R=i=>e("div",{className:"dk_cardSection",children:i}),T=(i,s,p,I)=>o("div",{className:"dk_field","data-span":I===void 0?void 0:String(I),children:[e("span",{className:"dk_label",children:i}),s,p===void 0?null:e("span",{className:"dk_hint",children:p})]}),F=(i,s,p,I)=>e("input",{className:"dk_input",type:"number",min:s,max:p,value:d[i],onChange:q=>M({[i]:Number(q.target.value)})}),J=i=>o("li",{className:"dk_settingsCard"+(t?" dk_settingsCardOpen":""),children:[o("button",{type:"button",className:"dk_settingsHead","aria-expanded":t,onClick:()=>a(s=>!s),children:[o("span",{className:"dk_settingsHeadText",children:[e("span",{className:"dk_settingsName",children:"Docker \u5BB9\u5668\u9762\u677F"}),e("span",{className:"dk_settingsDesc",children:"\u672C\u673A / SSH \u4E3B\u673A\u4E0A\u7684\u5BB9\u5668\u4E0E\u955C\u50CF\uFF1B\u9ED8\u8BA4\u53EA\u8BFB\uFF0C\u53D8\u66F4\u64CD\u4F5C\u9700\u663E\u5F0F\u5F00\u542F"})]}),e("span",{className:"dshkit_badge",children:"Kit"}),e("span",{className:"dk_settingsChevron",dangerouslySetInnerHTML:{__html:lt}})]}),t?e("div",{className:"dk_settingsBody",children:i}):null]});return J(t?!w||d===null?o("div",{className:"dk_row",children:[e("span",{className:"dk_spin"}),"\u8BFB\u53D6\u914D\u7F6E\u2026"]}):[R("\u57FA\u672C"),o("div",{className:"dk_row",children:[e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:d.enabled,onChange:i=>M({enabled:i.target.checked})}),"\u542F\u7528\u63D2\u4EF6"]}),e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:d.announceToAgent,onChange:i=>M({announceToAgent:i.target.checked})}),"\u5411 agent \u516C\u544A\u80FD\u529B"]})]}),o("div",{className:"dk_fieldGrid",children:[T("docker CLI",e("input",{className:"dk_input",value:d.dockerBin,onChange:i=>M({dockerBin:i.target.value})}),"\u9ED8\u8BA4 docker\uFF1Bpodman \u53EF\u586B podman"),T("\u7EDF\u8BA1\u5237\u65B0\u95F4\u9694\uFF08\u79D2\uFF09",F("pollIntervalSec",1,60)),T("\u65E5\u5FD7\u9ED8\u8BA4\u884C\u6570",F("logTailDefault",1,5e3)),T("\u8F93\u51FA\u4E0A\u9650\uFF08KB\uFF09",F("maxOutputKb",1,8192)),T("exec \u8D85\u65F6\uFF08\u79D2\uFF09",F("execTimeoutSec",1,120))]}),R("\u80FD\u529B\u5F00\u5173\uFF08\u9ED8\u8BA4\u5173\u95ED\uFF09"),o("div",{className:"dk_row",children:[e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:d.allowMutations,onChange:i=>M({allowMutations:i.target.checked})}),"\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\uFF08\u542F\u52A8 / \u505C\u6B62 / \u91CD\u542F / \u5220\u9664\uFF09"]}),e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:d.allowExec,onChange:i=>M({allowExec:i.target.checked})}),"\u5141\u8BB8 exec\uFF08\u5728\u5BB9\u5668\u5185\u6267\u884C\u547D\u4EE4\uFF09"]})]}),e("span",{className:"dk_hint",children:"docker socket \u7B49\u4EF7\u4E8E\u76EE\u6807\u4E3B\u673A\u7684 root \u6743\u9650\u3002\u5F00\u542F\u540E\uFF0C\u6D4F\u89C8\u5668\u9762\u677F\u4E0E agent \u90FD\u80FD\u6267\u884C\u5BF9\u5E94\u64CD\u4F5C\uFF0C\u8BF7\u53EA\u5728\u53EF\u4FE1\u73AF\u5883\u4E0B\u6253\u5F00\u3002"}),R("\u76EE\u6807"),...d.targets.map((i,s)=>o("div",{className:"dk_targetRow",children:[e("input",{className:"dk_input",value:i.name,placeholder:"\u76EE\u6807\u540D",onChange:p=>C(s,{name:p.target.value})}),e("select",{className:"dk_select",value:i.kind,onChange:p=>C(s,{kind:p.target.value}),children:[e("option",{value:"local",children:"\u672C\u673A"}),e("option",{value:"ssh",children:"SSH \u4E3B\u673A"})]}),i.kind==="local"?e("span",{className:"dk_hint",children:"\u5BBF\u4E3B\u6240\u5728\u673A\u5668\u4E0A\u7684 docker"}):o("div",{className:"dk_row",style:{gridColumn:"span 1"},children:[e("select",{className:"dk_select",value:i.book??"",onChange:p=>C(s,{book:p.target.value}),children:[e("option",{value:"",children:d.ttyBooks.length===0?"\uFF08\u65E0 tty \u8FDE\u63A5\u7C3F\uFF0C\u8BF7\u586B\u5185\u8054\u4FE1\u606F\uFF09":"\uFF08\u4E0D\u7528\u8FDE\u63A5\u7C3F\uFF0C\u624B\u586B\uFF09"}),...d.ttyBooks.map(p=>e("option",{value:p,children:"\u8FDE\u63A5\u7C3F\uFF1A"+p},p))]})]}),e("button",{type:"button",className:"dk_btn dk_btnDanger",onClick:()=>Y(s),children:"\u5220\u9664"}),i.kind==="ssh"&&(i.book??"")===""?o("div",{className:"dk_targetInline",children:[e("input",{className:"dk_input",placeholder:"host",value:i.host??"",onChange:p=>C(s,{host:p.target.value})}),e("input",{className:"dk_input",placeholder:"22",title:"\u7AEF\u53E3",value:i.port??22,onChange:p=>C(s,{port:Number(p.target.value)||22})}),e("input",{className:"dk_input",placeholder:"username",value:i.username??"",onChange:p=>C(s,{username:p.target.value})}),e("select",{className:"dk_select",value:i.auth??"agent",onChange:p=>C(s,{auth:p.target.value}),children:[e("option",{value:"agent",children:"ssh-agent"}),e("option",{value:"key",children:"\u79C1\u94A5"}),e("option",{value:"password",children:"\u5BC6\u7801"})]}),(i.auth??"agent")==="key"?e("input",{className:"dk_input dk_credential",placeholder:"~/.ssh/id_ed25519",value:i.keyPath??"",onChange:p=>C(s,{keyPath:p.target.value})}):null,(i.auth??"agent")==="password"?e("input",{className:"dk_input dk_credential",type:"password",placeholder:i.passwordSet===!0?"\uFF08\u5DF2\u8BBE\u7F6E\uFF0C\u7559\u7A7A\u4FDD\u6301\u4E0D\u53D8\uFF09":"env:SSH_PASSWORD",value:i.password??"",onChange:p=>C(s,{password:p.target.value})}):null,e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:i.agentForward===!0,onChange:p=>C(s,{agentForward:p.target.checked})}),"agent forwarding"]})]}):null]},String(s)+i.name)),o("div",{className:"dk_row",children:[e("button",{type:"button",className:"dk_btn",onClick:$,children:"\u6DFB\u52A0\u76EE\u6807"}),e("span",{className:"dk_hint",children:"SSH \u76EE\u6807\u63A8\u8350\u76F4\u63A5\u9009 tty \u7EC8\u7AEF\u9762\u677F\u7684\u8FDE\u63A5\u7C3F\u6761\u76EE\uFF08\u51ED\u8BC1\u53EA\u9700\u7EF4\u62A4\u4E00\u5904\uFF09\uFF1B\u624B\u586B\u65F6\u5BC6\u7801 / \u53E3\u4EE4\u5EFA\u8BAE\u5199 env:VAR\u3002"})]}),R("SSH \u4E3B\u673A\u5BC6\u94A5\u8BB0\u5F55\uFF08TOFU\uFF09"),...d.hostKeys.length===0?[e("span",{className:"dk_hint",children:"\u6682\u65E0\u8BB0\u5F55 \u2014 \u9996\u6B21 SSH \u8FDE\u63A5\u6210\u529F\u540E\u81EA\u52A8\u8BB0\u5F55\u4E3B\u673A\u6307\u7EB9\uFF08\u82E5 tty \u5DF2\u8BB0\u5F55\u540C\u4E00\u4E3B\u673A\uFF0C\u4F1A\u76F4\u63A5\u590D\u7528\uFF09\u3002"},"none")]:d.hostKeys.map(i=>o("div",{className:"dk_targetRow",children:[e("span",{children:i.host+":"+String(i.port)}),e("span",{className:"dk_hint",style:{gridColumn:"span 2",wordBreak:"break-all"},children:"sha256:"+i.fingerprint}),e("button",{type:"button",className:"dk_btn",onClick:()=>te(i),children:"\u5220\u9664"})]},i.host+":"+String(i.port))),e("span",{className:"dk_hint",children:"\u6307\u7EB9\u53D8\u66F4\u65F6\u8FDE\u63A5\u4F1A\u88AB\u62D2\u7EDD\uFF08\u9632\u4E2D\u95F4\u4EBA\uFF09\uFF1B\u786E\u8BA4\u5B89\u5168\u540E\u5220\u9664\u5BF9\u5E94\u8BB0\u5F55\u5373\u53EF\u91CD\u8FDE\u3002"}),o("div",{className:"dk_row",children:[e("button",{type:"button",className:"dk_btn dk_btnPrimary",disabled:_,onClick:O,children:_?"\u4FDD\u5B58\u4E2D\u2026":"\u4FDD\u5B58"}),e("span",{className:"dk_msg","data-kind":f.kind,children:f.text})]})]:null)}let ue=null,le=null,Me=null;function ge(){let t=le,a=ue,d=Me;if(le=null,ue=null,Me=null,a!==null&&a.remove(),t!==null&&setTimeout(()=>{try{t.unmount()}catch{}},0),d!==null)try{d.dispose()}catch{}}function bt(t){return t!==null&&typeof t=="object"&&typeof t.appendChild=="function"}function _t(){return typeof de?.mountPane=="function"&&typeof de.isOpen=="function"&&Number(de.version??0)>=1&&de.isOpen()===!0}function Je(t){ge(),Fe();let a={onClose:ge,initialTarget:t?.target??"",sessionHint:t?.sessionHint};if(_t()){let d=null;try{d=de.mountPane({title:"Docker \u5BB9\u5668",hint:t?.target===void 0||t.target===""?"":t.target,size:520,min:360,onClose:()=>ge()})}catch(k){d=null,console.warn("[dsh-docker] \u6302\u8F7D\u5230\u7EC8\u7AEF\u9762\u677F\u5931\u8D25\uFF0C\u56DE\u9000\u5F39\u7A97\uFF1A"+(k instanceof Error?k.message:String(k)))}if(d!==null&&bt(d.element)){Me=d,le=E(d.element),le.render(e(Ye,{...a,docked:!0,onTargetChange:k=>{try{d.setHint(k)}catch{}}}));return}}ue=document.createElement("div"),document.body.appendChild(ue),le=E(ue),le.render(e(Ye,a))}function xt(){let t=document.querySelector('[data-pane="sidebar"], [class*="sidebarCol"]');if(t!==null)return t.querySelector('[class*="logoRow"]')?.parentElement??t.firstElementChild}function wt(t){let a=t.querySelector('button[class*="newSession"]');if(a!==null)return a;for(let d of t.children)if(d.tagName==="BUTTON")return d}function yt(){let t=document.createElement("div");return t.dataset.dshDockerEntry="",t.className="dk_sidebarEntry",t.setAttribute("role","button"),t.setAttribute("aria-label","\u5BB9\u5668"),t.innerHTML='<span class="dk_entryIcon">'+dt+'</span><span class="dk_entryLabel">\u5BB9\u5668</span>',t.addEventListener("click",a=>{a.preventDefault(),Je()}),t}function $e(t,a){let d=wt(t);if(d===void 0)return!1;if(a.parentElement!==t){let k=d.closest('[class*="logoRow"]'),w=k!==null&&k.parentElement===t?k:d,r=Array.from(t.children).filter(_=>_ instanceof HTMLElement&&_.matches("[data-dsh-global-search-entry], [data-dsh-rss-entry], [data-dsh-taskboard-entry], [data-dsh-ssh-entry], [data-dsh-tty-entry], [data-dsh-docker-entry]"));if(r.length>0){let _=r[r.length-1];t.insertBefore(a,_.nextSibling)}else t.insertBefore(a,w.nextElementSibling)}return!0}function Nt(){if(Fe(),document.querySelector("[data-dsh-docker-entry]")!==null)return()=>{};let t=yt(),a,d=!1,k=()=>{if(a!==void 0&&!a.isConnected&&(r.disconnect(),a=void 0,d=!1),d){if(document.body.contains(t))return;r.disconnect(),a=void 0,d=!1}a??(a=xt()),a!==void 0&&(d=$e(a,t),d&&r.observe(a,{childList:!0,subtree:!0}))},w=new MutationObserver(()=>{k()});w.observe(document.body,{childList:!0,subtree:!0});let r=new MutationObserver(()=>{if(a===void 0||!a.isConnected){d=!1,k();return}a.contains(t)||(d=$e(a,t))});return k(),()=>{w.disconnect(),r.disconnect(),t.remove()}}let Oe={};return Oe.inject=["slots"],Oe.apply=t=>{Fe();let a=!1,d=()=>{};Le={set(r){if(r!==a){if(a=r,r){d=Nt();return}d(),d=()=>{},ge(),typeof Ne?.requestRender=="function"&&Ne.requestRender()}}},it(!0);let k=t.slots.inject("settings.plugin.item",()=>t.slots.register({name:"settings.plugin.item",key:"docker",order:102},vt));t.inject(["ttyTerminal"],r=>(Z=r.ttyTerminal??null,()=>{Z=null})),t.inject(["ttyPanel"],r=>(de=r.ttyPanel??null,()=>{de=null}));let w=()=>{};return Te(),t.inject(["ttyConnbar"],r=>{let _=r.ttyConnbar;_!==void 0&&(Ne=_,w=_.addAction(x=>{if(!Ee)return;let f=x?.spec??{};if(f.t!=="ssh")return;let N=typeof x?.bookName=="string"?x.bookName:"",j=Ke(f,N),B=j!==void 0?`\u6253\u5F00\u8BE5\u4E3B\u673A\u7684 Docker \u5BB9\u5668\u9762\u677F\uFF08\u76EE\u6807\uFF1A${j}\uFF09`:ee===null?"\u6253\u5F00\u5F53\u524D\u4F1A\u8BDD\u4E3B\u673A\u7684 Docker \u5BB9\u5668\u9762\u677F":"\u8BE5\u4E3B\u673A\u5C1A\u672A\u914D\u7F6E\u4E3A Docker \u76EE\u6807 \u2014 \u70B9\u51FB\u6253\u5F00\u9762\u677F\u67E5\u770B/\u914D\u7F6E";x.addAction(zt,"\u5BB9\u5668",B,()=>{(async()=>{let M=await Pt(f,N),C=Number(f.port);Je({target:M??"",sessionHint:M===void 0?{host:typeof f.host=="string"?f.host:"",port:Number.isInteger(C)&&C>0?C:22,book:N}:void 0})})()})}),(async()=>{for(let x=0;x<3;x+=1){if(await Te()){typeof _.requestRender=="function"&&_.requestRender();return}await new Promise(f=>setTimeout(f,2e3))}})())}),()=>{w(),k(),Le=null,Ee=!1,Ne=null,d(),ge()}},Oe}});})();
