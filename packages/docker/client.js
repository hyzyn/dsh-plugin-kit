"use strict";(()=>{var Jr=`/* eslint-disable */
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
 * \u5D4C\u5165\u5F0F\u627F\u8F7D\uFF1A\u9762\u677F\u957F\u5728\u522B\u4EBA\u7684\u680F\u91CC\uFF0C\u6491\u6EE1\u5BBF\u4E3B\u5373\u53EF\u2014\u2014\u5916\u6846 / \u5706\u89D2 / \u9634\u5F71 / \u6700\u5C0F\u9AD8\u5EA6\u90FD\u662F
 * \u300C\u72EC\u7ACB\u5F39\u7A97\u300D\u7684\u88C5\u9970\uFF0C\u6302\u5728\u522B\u4EBA\u680F\u91CC\u8981\u5168\u53BB\u6389\u3002
 *   .dk_panelDock \u2014\u2014 tty \u9762\u677F\u7684\u53F3\u4FA7\u6302\u8F7D\u4F4D\uFF080.3.0\uFF09
 *   .dk_panelTab  \u2014\u2014 \u4F1A\u8BDD\u53F3\u4FA7\u680F\u7684\u6807\u7B7E\uFF08S1\uFF09
 */
.dk_panelDock,
.dk_panelTab {
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
  transition: background var(--dk-dur) var(--dk-ease), color var(--dk-dur) var(--dk-ease), opacity var(--dk-dur) var(--dk-ease);
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

/*
 * dock \u6A21\u5F0F\u4E0B\u6CA1\u6709\u9762\u677F\u5934\u90E8\uFF0C\u5237\u65B0 / \u53EA\u8BFB\u5FBD\u6807\u6302\u5230\u5DE5\u5177\u6761\u672B\u5C3E\u5E76\u9760\u53F3\uFF1A
 * margin-left:auto \u5728\u4E0D\u6362\u884C\u65F6\u628A\u5B83\u63A8\u5230\u6574\u884C\u6700\u53F3\uFF0C\u6362\u884C\u65F6\u8D34\u5230\u6700\u540E\u4E00\u884C\u7684\u53F3\u7AEF\u2014\u2014
 * \u4E0E\u300C\u8FC7\u6EE4 / \u7B5B\u9009\u63A7\u4EF6\u4ECE\u5DE6\u5F80\u53F3\u6392\u300D\u533A\u5206\u5F00\uFF0C\u907F\u514D\u5237\u65B0\u88AB\u5F53\u6210\u5DE5\u5177\u6761\u7684\u7B2C\u4E00\u4E2A\u7B5B\u9009\u9879\u3002
 */
.dk_toolbarEnd {
  display: inline-flex;
  align-items: center;
  gap: var(--dk-gap-sm);
  margin-left: auto;
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

/*
 * \u641C\u7D22\u6846\u662F\u5DE5\u5177\u6761\u91CC\u552F\u4E00\u53EF\u4F38\u7F29\u7684\u9879\uFF0C\u5B83\u7684 min-width \u51B3\u5B9A\u4E86\u300C\u653E\u4E0D\u4E0B\u65F6\u5148\u6324\u8C01\u300D\uFF1A\u7ED9\u5230 160px \u65F6
 * \u7A7A\u9699\u4E0D\u591F\uFF0C\u6D4F\u89C8\u5668\u5B81\u53EF\u628A\u672B\u5C3E\u90A3\u4E2A\u5F00\u5173\u5355\u72EC\u6362\u884C\uFF0C\u4E5F\u4E0D\u80AF\u628A\u641C\u7D22\u6846\u538B\u7A84\u4E00\u70B9\u2014\u2014\u5BBD\u9762\u677F\u91CC\u56E0\u6B64\u591A\u51FA
 * \u4E00\u884C\u53EA\u6709\u4E00\u4E2A\u590D\u9009\u6846\u3002120px \u8BA9\u5B83\u5148\u7626\u4E0B\u6765\u515C\u4F4F\u8FD9\u70B9\u5DEE\u8DDD\uFF08flex-grow \u4ECD\u662F 1\uFF1A\u7A7A\u95F4\u5BCC\u4F59\u65F6\u5B83\u7167\u65E7
 * \u586B\u6EE1\u6574\u884C\uFF0C\u89C6\u89C9\u5BBD\u5EA6\u4E0D\u53D8\uFF09\u3002
 */
.dk_search { flex: 1 1 120px; min-width: 120px; }

/* \u5DE5\u5177\u6761\u91CC\u7684\u7ED3\u679C\u8BA1\u6570\uFF08\u955C\u50CF\uFF1A23 / 23 \u4E2A\u955C\u50CF\uFF09\uFF1A\u522B\u88AB\u538B\u7F29\uFF0C\u6570\u5B57\u7B49\u5BBD */
.dk_searchCount { flex: none; font-variant-numeric: tabular-nums; }

.dk_seg {
  display: inline-flex;
  padding: 2px;
  border: 1px solid var(--dk-border);
  border-radius: var(--dk-r-md);
  background: var(--dk-surface-2);
  /*
   * \u5206\u6BB5\u4ECE\u4E09\u6BB5\u957F\u5230\u4E94\u6BB5\uFF08\u5BB9\u5668/\u955C\u50CF/Compose/\u7F51\u7EDC/\u5377\uFF09\u540E\uFF0C520px \u7684 dock \u7A84\u680F\u91CC\u53EF\u80FD\u653E\u4E0D\u4E0B\uFF1A
   * \u5141\u8BB8\u8FD9\u4E00\u6BB5\u81EA\u5DF1\u6A2A\u5411\u6EDA\u52A8\uFF0C\u800C\u4E0D\u662F\u6574\u4E2A\u5DE5\u5177\u6761\u6362\u884C\u6216\u505A\u4E8C\u7EA7\u83DC\u5355\uFF08\u5207\u9875\u662F\u9AD8\u9891\u52A8\u4F5C\uFF0C
   * \u591A\u4E00\u6B21\u70B9\u51FB\u4E0D\u5212\u7B97\uFF09\u3002\u6EDA\u52A8\u6761\u9690\u85CF\uFF0C\u9760\u4E24\u7AEF\u7684\u88C1\u5207\u7ED9\u51FA\u300C\u8FD8\u6709\u5185\u5BB9\u300D\u7684\u6697\u793A\u3002
   */
  max-width: 100%;
  overflow-x: auto;
  scrollbar-width: none;
}

.dk_seg::-webkit-scrollbar { display: none; }

.dk_segBtn {
  /* \u4E0D\u53C2\u4E0E\u538B\u7F29\uFF1A\u5426\u5219\u7A84\u680F\u91CC\u4E94\u6BB5\u4F1A\u88AB\u538B\u6210\u300C\u5BB9/\u955C/Co/\u7F51/\u5377\u300D\u8FD9\u79CD\u534A\u622A\u5B57 */
  flex: none;
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

/*
 * \u5DE5\u5177\u6761\u672B\u5C3E\u7684\u4E24\u4E2A\u5F00\u5173\uFF08\u542B\u5DF2\u505C\u6B62 / \u81EA\u52A8\u5237\u65B0\uFF09\u6210\u7EC4\uFF1A\u5B83\u4EEC\u662F\u4E00\u4E2A\u300C\u5F00\u5173\u7C07\u300D\uFF0C\u5DE5\u5177\u6761\u5728\u5BBD\u9762\u677F\u91CC
 * \u6070\u597D\u5361\u5728\u653E\u5F97\u4E0B\u4E0E\u653E\u4E0D\u4E0B\u7684\u8FB9\u754C\u4E0A\u2014\u2014\u5206\u5F00\u6392\u65F6\u6700\u540E\u4E00\u4E2A\u4F1A\u88AB\u5355\u72EC\u6324\u5230\u7B2C\u4E8C\u884C\uFF08\u4E00\u884C\u53EA\u6709\u4E00\u4E2A\u590D\u9009
 * \u6846\uFF09\u3002\u6210\u7EC4\u540E\u6362\u884C\u4EE5\u7EC4\u4E3A\u5355\u4F4D\uFF0C\u6700\u574F\u60C5\u51B5\u4E5F\u662F\u4E00\u6574\u7EC4\u4E00\u8D77\u4E0B\u53BB\u3002
 */
.dk_toolbarToggles {
  display: inline-flex;
  align-items: center;
  gap: var(--dk-gap-md);
}

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
  /* \u8FC7\u6E21\u6D6E\u5C42\u4E0E\u9876\u90E8\u8FDB\u5EA6\u6761\u7684\u5B9A\u4F4D\u57FA\u51C6 */
  position: relative;
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
  /* \u5207\u76EE\u6807\u65F6\u6570\u636E\u6574\u6279\u6362\u6389\uFF1A\u6DE1\u5165 + \u8F7B\u5FAE\u4E0A\u79FB\uFF0C\u8BA9\u300C\u6362\u4E86\u4E00\u6279\u5185\u5BB9\u300D\u770B\u5F97\u89C1 */
  animation: dk_dataIn .2s var(--dk-ease) both;
}

/*
 * \u300C\u6B63\u5728\u5207\u76EE\u6807\u300D\uFF1A\u6B63\u6587\u538B\u6697 + \u9501\u4F4F\u6307\u9488\uFF08pointer-events: none \u53EA\u6321\u5185\u5BB9\uFF0C\u5916\u5C42 .dk_main
 * \u4ECD\u53EF\u6EDA\u52A8\uFF09\u3002\u4FDD\u7559\u53EF\u8BFB\u662F\u523B\u610F\u7684\u2014\u2014\u6BD4\u8D77\u767D\u5C4F\uFF0C\u7528\u6237\u66F4\u5E0C\u671B\u8FD8\u80FD\u770B\u7740\u521A\u624D\u90A3\u6279\u5361\u7247\uFF0C
 * \u53EA\u662F\u77E5\u9053\u300C\u8FD9\u4E0D\u662F\u65B0\u76EE\u6807\u7684\u300D\u3001\u6B64\u65F6\u70B9\u4E0D\u52A8\u3002
 */
/*
 * \u300C\u6B63\u5728\u5207\u76EE\u6807\u300D\u7684\u65E7\u6570\u636E\uFF1A82% + \u8F7B\u5EA6\u53BB\u8272\uFF0C\u800C\u4E0D\u662F 42% \u7EAF\u538B\u6697\u3002
 * \u8BED\u4E49\u5DEE\u522B\u2014\u201442% \u8BFB\u4F5C\u300C\u574F\u4E86 / \u88AB\u7981\u7528\u300D\uFF0C82% + \u53BB\u8272\u8BFB\u4F5C\u300C\u8FD9\u662F\u53E6\u4E00\u6279\u5185\u5BB9\u300D\uFF0C
 * \u4E0E\u300C\u6B63\u5728\u6362\u4E00\u6279\u6570\u636E\u300D\u662F\u4E00\u56DE\u4E8B\uFF1B\u53EF\u8BFB\u6027\u4E5F\u4FDD\u4F4F\uFF08\u8FD8\u8981\u80FD\u770B\u6E05\u5BB9\u5668\u540D\uFF09\u3002
 * pointer-events: none \u662F\u5B89\u5168\u5E95\u7EBF\uFF1A\u4E0D\u52A0\u9501\u65F6\u70B9\u300C\u505C\u6B62\u300D\u4F1A\u62FF\u65B0\u76EE\u6807\u5F53\u76EE\u6807\u3001
 * \u7528\u65E7\u5217\u8868\u7684\u5BB9\u5668 ID \u53D1\u547D\u4EE4\u3002
 */
.dk_body[data-stale="1"] .dk_main {
  opacity: .82;
  filter: saturate(.55);
  pointer-events: none;
  user-select: none;
}

.dk_body .dk_main {
  transition: opacity var(--dk-dur) var(--dk-ease), filter var(--dk-dur) var(--dk-ease);
}

/*
 * \u6B63\u6587\u9876\u90E8\u7684\u8FC7\u6E21\u5C42\uFF1A\u4E00\u6761 2px \u6D41\u5149\u8FDB\u5EA6\u6761\uFF08::before\uFF09+ \u4E00\u679A\u5C45\u4E2D\u7684\u84DD\u8272\u72B6\u6001\u80F6\u56CA\u3002
 * \u7EDD\u5BF9\u5B9A\u4F4D \u2192 \u4E0D\u5360\u6587\u6863\u6D41\uFF0C\u5207\u6362\u65F6\u9996\u5361\u4F4D\u7F6E\u4E0E\u6EDA\u52A8\u9AD8\u5EA6\u90FD\u4E0D\u53D8\uFF1B\u81EA\u8EAB\u4E0D\u5403\u6307\u9488\u4E8B\u4EF6\uFF08\u4E0D\u6321\u6EDA\u52A8\uFF09\u3002
 */
.dk_switchOverlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 4;
  display: flex;
  justify-content: center;
  padding-top: var(--dk-gap-sm);
  pointer-events: none;
}

/* \u9876\u90E8 2px \u4E0D\u5B9A\u957F\u8FDB\u5EA6\u6761\uFF1A\u9762\u677F\u7EA7\u300C\u6B63\u5728\u53D6\u6570\u300D\u4FE1\u53F7 */
.dk_switchOverlay::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background-image: linear-gradient(90deg, transparent, var(--dk-accent), transparent);
  background-size: 35% 100%;
  background-repeat: no-repeat;
  animation: dk_indeterminate 1.15s linear infinite;
}

/* \u72B6\u6001\u80F6\u56CA\uFF1A\u84DD\u8272\uFF08\u5F3A\u8C03\u8272\uFF09\u8868\u8FBE\u300C\u8FDB\u884C\u4E2D\u300D\uFF0C\u5E95\u8272\u662F\u5F3A\u8C03\u8272\u63BA\u5165\u5F53\u524D\u8868\u9762 */
.dk_switchPill {
  display: flex;
  align-items: center;
  gap: var(--dk-gap-sm);
  flex: none;
  min-width: 0;
  max-width: min(400px, 38vw);
  padding: 4px var(--dk-gap-lg);
  border: 1px solid color-mix(in srgb, var(--dk-accent) 42%, transparent);
  border-radius: var(--dk-r-pill);
  background: color-mix(in srgb, var(--dk-accent) 12%, var(--dk-surface-solid));
  backdrop-filter: blur(6px);
  box-shadow: 0 2px 10px rgba(0, 0, 0, .10);
  font-size: 12px;
  color: var(--dk-accent);
}

.dk_switchText {
  display: flex;
  align-items: baseline;
  gap: var(--dk-gap-sm);
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dk_switchText strong { color: var(--dk-accent); font-weight: 600; }
/* \u300C\xB7\u300D\u4E0E\u300C\u5F53\u524D\u663E\u793A\uFF1A\u300D\u7A0D\u5FAE\u538B\u6DE1\u4E00\u70B9\uFF0C\u4E0E\u4E24\u4E2A\u76EE\u6807\u540D\u533A\u5206\u5C42\u6B21\uFF08\u4ECD\u5728\u84DD\u8272\u7CFB\u5185\uFF09 */
.dk_switchDot,
.dk_switchSub { color: color-mix(in srgb, var(--dk-accent) 72%, var(--dk-label-2)); }
.dk_switchName { color: var(--dk-accent); }
.dk_spinSm { width: 10px; height: 10px; color: var(--dk-accent); }

/* \u8FDB\u5165\uFF1A8px \u4E0A\u6ED1 + \u6DE1\u5165\uFF0C\u8BA9\u300C\u6362\u4E86\u4E00\u6279\u5185\u5BB9\u300D\u6709\u65B9\u5411\u611F\uFF08\u4E0D\u662F\u95EA\u4E00\u4E0B\uFF09 */
@keyframes dk_dataIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
}

@keyframes dk_indeterminate {
  from { background-position: -40% 0; }
  to { background-position: 140% 0; }
}

@media (prefers-reduced-motion: reduce) {
  .dk_grid { animation: none; }
  .dk_switchOverlay::before { animation: none; background-position: 50% 0; }
  .dk_body .dk_main { transition: none; }
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
  /* \u542F\u505C\u540E\u72B6\u6001\u5FBD\u6807\u4F1A\u4ECE\u300C\u8FD0\u884C\u4E2D\u300D\u7FFB\u5230\u300C\u5DF2\u505C\u6B62\u300D\uFF1A\u7ED9\u4E2A\u8FC7\u6E21\uFF0C\u522B\u786C\u5207 */
  transition: background-color var(--dk-dur) var(--dk-ease), border-color var(--dk-dur) var(--dk-ease), color var(--dk-dur) var(--dk-ease);
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

/* \u9700\u5173\u6CE8\u539F\u56E0\u5FBD\u6807\uFF08\u603B\u89C8\u5F02\u5E38\u8868\uFF09 */
.dk_reasons { display: inline-flex; flex-wrap: wrap; gap: 4px; }

.dk_reason {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 6px;
  border-radius: var(--dk-r-xs);
  background: var(--dk-surface-3);
  color: var(--dk-label-2);
  font-size: 11px;
  white-space: nowrap;
}

.dk_reason[data-reason="oom"] { background: color-mix(in srgb, var(--dk-danger) 18%, transparent); color: var(--dk-danger); }
.dk_reason[data-reason="dead"] { background: color-mix(in srgb, var(--dk-danger) 14%, transparent); color: var(--dk-danger); }
.dk_reason[data-reason="unhealthy"] { background: color-mix(in srgb, var(--dk-danger) 12%, transparent); color: var(--dk-danger); }
.dk_reason[data-reason="restarting"] { background: color-mix(in srgb, var(--dk-warn) 16%, transparent); color: var(--dk-warn); }
.dk_reason[data-reason="exit-nonzero"] { background: color-mix(in srgb, var(--dk-warn) 12%, transparent); color: var(--dk-warn); }

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

/**
 * \u540C\u4E00\u6761\u8FC7\u6EE4\u884C\u6302\u5728\u4E24\u5904\uFF0C\u4F38\u7F29\u8F74\u4E0D\u540C\uFF0C\u5FC5\u987B\u5206\u5F00\u5BF9\u5F85\uFF1A
 *   - \u5355\u5BB9\u5668\u65E5\u5FD7\uFF1A\u5B83\u5728 \`.dk_tabs\`\uFF08\u6A2A\u5411\u884C\uFF09\u91CC\uFF0C\`flex: 1 1 auto\` \u662F\u300C\u6A2A\u5411\u5360\u6EE1\u5269\u4F59\u5BBD\u5EA6\u300D\uFF0C\u6B63\u786E\uFF1B
 *   - \u805A\u5408\u65E5\u5FD7\uFF08ComposeLogs\uFF09\uFF1A\u5B83\u662F \`.dk_logs\`\uFF08\u7EB5\u5411 flex\uFF09\u7684\u76F4\u63A5\u5B50\u9879\uFF0C\u6B64\u65F6 \`flex: 1 1 auto\`
 *     \u4F1A\u53D8\u6210**\u7EB5\u5411\u6491\u9AD8**\u2014\u2014\u8FC7\u6EE4\u5230\u5C11\u91CF\u884C\u65F6\u65E5\u5FD7\u4F53\u57FA\u51C6\u9AD8\u5EA6\u53D8\u5C0F\u3001\u5269\u4F59\u7A7A\u95F4\u51FA\u73B0\uFF0C\u5DE5\u5177\u6761\u4E0E
 *     \`.dk_logBody\` \u5404\u5206\u4E00\u534A\uFF0C\u6574\u6761\u5DE5\u5177\u6761\u957F\u6210\u4E24\u767E\u591A\u50CF\u7D20\u7684\u6A2A\u6761\uFF08\u8F93\u5165\u6846\u5782\u76F4\u5C45\u4E2D\u3001\u72B6\u6001\u884C\u88AB
 *     \u9876\u5230\u4E0B\u9762\uFF09\uFF0C\u4E5F\u5C31\u662F\u300C\u8F93\u5165\u6587\u5B57\u540E\u754C\u9762\u53D8\u5F62\u300D\u3002\u5DE5\u5177\u6761\u662F\u56FA\u5B9A\u9AD8\u5EA6\u7684\u4E00\u884C\uFF0C\u4E0D\u8BE5\u53C2\u4E0E\u7EB5\u5411\u4F38\u7F29\u3002
 */
.dk_logs > .dk_filterBar { flex: 0 0 auto; }

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
  position: relative; /* \u300C\u56DE\u5230\u5E95\u90E8\u300D\u6D6E\u5C42\u5B9A\u4F4D\u57FA\u51C6 */
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

/* \u300C\u805A\u5408\u9009\u62E9\u300D\u6FC0\u6D3B\u6001\uFF1A\u8FD9\u662F\u300C\u8FDB\u5165\u9009\u62E9\u6A21\u5F0F\u300D\u800C\u4E0D\u662F\u300C\u67D0\u4E2A\u5F00\u5173\u5DF2\u5F00\u300D\uFF0C\u7528\u5F3A\u8C03\u8272 */
.dk_pillPick[data-on="1"] {
  border-color: color-mix(in srgb, var(--dk-accent) 52%, transparent);
  background: color-mix(in srgb, var(--dk-accent) 18%, transparent);
  color: var(--dk-accent);
  font-weight: 600;
}

/* FOLLOW \u6FC0\u6D3B\u6001\u7528\u5F3A\u8C03\u8272\uFF08\u4E0E AUTO REFRESH \u7684\u6210\u529F\u7EFF\u533A\u5206\u5F00\uFF1A\u5B9E\u65F6\u6D41\u5728\u63A8 vs \u8F6E\u8BE2\u5F00\u7740\uFF09 */
.dk_pillFollow[data-on="1"] {
  border-color: color-mix(in srgb, var(--dk-accent) 52%, transparent);
  background: color-mix(in srgb, var(--dk-accent) 18%, transparent);
  color: var(--dk-accent);
}

.dk_pill:disabled {
  opacity: .45;
  cursor: not-allowed;
}

.dk_pill:disabled:hover { background: var(--dk-surface-2); }

/* FOLLOW \u8FDE\u63A5\u72B6\u6001\u884C\uFF1A\u5C0F\u5706\u70B9 + \u6587\u6848\uFF08\u8FDE\u63A5\u9519\u8BEF\u53EA\u5728\u8FD9\u91CC\u8868\u8FBE\uFF0C\u4E0D\u5F39\u6A2A\u5E45\u5237\u5C4F\uFF09 */
.dk_followState {
  display: flex;
  align-items: center;
  gap: var(--dk-gap-sm);
  flex: 0 0 auto;
  padding: var(--dk-gap-xs) var(--dk-gap-lg);
  border-bottom: 1px solid var(--dk-border);
  background: var(--dk-surface-2);
  color: var(--dk-label-3);
  font-size: 11px;
}

.dk_followState::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--dk-label-3);
}

.dk_followState[data-state="open"]::before { background: var(--dk-success); }
.dk_followState[data-state="connecting"]::before,
.dk_followState[data-state="reconnecting"]::before { background: var(--dk-warn); }
.dk_followState[data-state="closed"]::before { background: var(--dk-danger); }

/* FOLLOW \u6682\u505C\u81EA\u52A8\u6EDA\u52A8\u65F6\u7684\u300C\u56DE\u5230\u5E95\u90E8\u300D\u6D6E\u5C42\uFF08\u4E0D\u5360\u5E03\u5C40\uFF0C\u51FA\u73B0/\u6D88\u5931\u4E0D\u6324\u52A8\u65E5\u5FD7\uFF09 */
.dk_backToBottom {
  position: absolute;
  right: var(--dk-gap-lg);
  bottom: var(--dk-gap-lg);
  z-index: 2;
  height: var(--dk-h-md);
  padding: 0 var(--dk-gap-md);
  border: 1px solid var(--dk-border-strong);
  border-radius: var(--dk-r-pill);
  background: var(--dk-surface-2);
  color: var(--dk-label);
  font-size: 11px;
  font-family: inherit;
  cursor: pointer;
  box-shadow: 0 2px 10px rgba(0, 0, 0, .28);
}

.dk_backToBottom:hover { background: var(--dk-hover-solid); }
.dk_backToBottom:focus-visible { outline: none; box-shadow: var(--dk-ring); }


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

/* ------------------------------------------------------------------ *
 * \u65E5\u5FD7 \u2192 \u4F1A\u8BDD\u6865\uFF1A\u53F3\u952E\u83DC\u5355 / \u9884\u89C8\u5361\u7247 / \u5931\u8D25\u63D0\u793A
 *
 * \u4E09\u8005\u90FD\u6302\u5728 document.body \u4E0A\uFF0C\u800C\u4E0D\u662F\u9762\u677F\u7684 React \u6811\u91CC\uFF1A\`.dk_logBody\` \u662F
 * overflow:auto\uFF0C\u5185\u8054\u6E32\u67D3\u4F1A\u8DDF\u7740\u65E5\u5FD7\u4E00\u8D77\u6EDA\u8D70\uFF1B\u800C\u5BBF\u4E3B\u53EA\u5411\u6D4F\u89C8\u5668\u534A\u4F53\u6CE8\u5165
 * react / react/jsx-runtime / react-dom/client\uFF0C\u6CA1\u6709 react-dom\uFF0C\u4E5F\u5C31\u62FF\u4E0D\u5230
 * createPortal\u3002\u597D\u5728 \`--dk-*\` \u4EE4\u724C\u58F0\u660E\u5728 \`:where(html, body)\` \u4E0A\uFF0Cbody \u4E0B\u7684
 * \u6D6E\u5C42\u81EA\u52A8\u7EE7\u627F\uFF0C\u4E0D\u5FC5\u642C\u4EE4\u724C\u3002
 *
 * z-index \u5FC5\u987B\u9AD8\u4E8E \`.dk_backdrop\` \u7684 2140\uFF1A\u6A21\u6001\u5F62\u6001\u4E0B\u9762\u677F\u6574\u4E2A\u5728 backdrop \u91CC\uFF0C
 * \u83DC\u5355\u6302\u5230 body \u540E\u82E5\u4F4E\u4E8E\u5B83\u5C31\u4F1A\u88AB\u76D6\u4F4F\u3001\u70B9\u4E0D\u51FA\u6765\u3002
 * ------------------------------------------------------------------ */

.dk_menu {
  position: fixed;
  z-index: 2160;
  min-width: 220px;
  max-width: 320px;
  padding: var(--dk-gap-xs);
  border: 1px solid var(--dk-border-strong);
  border-radius: var(--dk-r-md);
  background: var(--dk-surface-solid);
  box-shadow: var(--dk-shadow);
  color: var(--dk-label);
  font-size: 12px;
}

.dk_menuHead { padding: 6px 8px 2px; font-weight: 600; }
.dk_menuSub {
  padding: 0 8px 6px;
  color: var(--dk-label-3);
  font-size: 11px;
  line-height: 1.5;
  word-break: break-all;
}

.dk_menuItem {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 6px 8px;
  border: none;
  border-radius: var(--dk-r-sm);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.dk_menuItem:hover:not(:disabled) { background: var(--dk-hover); }
.dk_menuItem:focus-visible { outline: none; box-shadow: var(--dk-ring); }
.dk_menuItem:disabled { cursor: not-allowed; }
.dk_menuItem:disabled .dk_menuItemLabel { color: var(--dk-label-3); }
.dk_menuItemHint { color: var(--dk-label-3); font-size: 11px; }

.dk_menuNote {
  margin-top: var(--dk-gap-xs);
  padding: 6px 8px 2px;
  border-top: 1px solid var(--dk-border);
  color: var(--dk-label-3);
  font-size: 11px;
  line-height: 1.5;
}

.dk_askCard {
  position: fixed;
  z-index: 2170;
  display: flex;
  flex-direction: column;
  gap: var(--dk-gap-sm);
  width: min(680px, calc(100vw - 32px));
  padding: var(--dk-gap-lg);
  border: 1px solid var(--dk-border-strong);
  border-radius: var(--dk-r-lg);
  background: var(--dk-surface-solid);
  box-shadow: var(--dk-shadow-lg);
  color: var(--dk-label);
}

.dk_askCardHead { font-size: 13px; font-weight: 600; }

.dk_askCardText {
  width: 100%;
  height: min(42vh, 340px);
  padding: var(--dk-gap-md);
  border: 1px solid var(--dk-border);
  border-radius: var(--dk-r-sm);
  background: var(--dk-log-bg);
  color: var(--dk-log-fg);
  font-family: var(--dk-mono);
  font-size: 12px;
  line-height: 1.6;
  resize: vertical;
}

.dk_askCardText:focus-visible { outline: none; box-shadow: var(--dk-ring); }

.dk_askCardStatus { min-height: 16px; color: var(--dk-label-3); font-size: 11px; }
.dk_askCardStatus[data-kind="error"] { color: var(--dk-danger); }
.dk_askCardStatus[data-kind="ok"] { color: var(--dk-accent); }

.dk_askCardFoot { display: flex; align-items: center; gap: var(--dk-gap-md); }
/* \u53D6\u6D88\u63A8\u5230\u6700\u53F3\uFF1A\u4E0E .dk_confirmActions \u7684\u300C\u52A8\u4F5C\u5728\u53F3\u300D\u4E00\u81F4\uFF0C\u907F\u514D\u8BEF\u70B9\u4E3B\u6309\u94AE */
.dk_askCardFoot .dk_btn:last-child { margin-left: auto; }

.dk_askCardHint { color: var(--dk-label-3); font-size: 11px; line-height: 1.5; }

.dk_askToast {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 2180;
  max-width: 420px;
  padding: 10px 14px;
  border: 1px solid color-mix(in srgb, var(--dk-danger) 40%, transparent);
  border-radius: var(--dk-r-md);
  background: var(--dk-surface-solid);
  box-shadow: var(--dk-shadow);
  color: var(--dk-danger);
  font-size: 12px;
  line-height: 1.6;
}

/* \u6210\u529F\u56DE\u6267\uFF1A\u540C\u4E00\u679A toast \u6362\u914D\u8272\uFF08\u9ED8\u8BA4\u90A3\u5957\u662F\u300C\u5931\u8D25\u300D\u7684\u7EA2\uFF09 */
.dk_askToast[data-kind="ok"] {
  border-color: color-mix(in srgb, var(--dk-success) 42%, transparent);
  color: var(--dk-success);
}

/* ---------- Agent \u62BD\u5C49\uFF08\u65B9\u6848 \u2463\uFF09 ---------- */
/*
 * \u547D\u540D\u7A7A\u95F4\u523B\u610F\u7528 dk_agent*\uFF1A\`dk_drawer*\` \u662F**\u7EC8\u7AEF\u62BD\u5C49**\uFF08\u6A21\u6001\u4E0B\u5C31\u5730\u5D4C\u5165\u7684\u90A3\u4E2A\uFF09\u7684\uFF0C
 * \u590D\u7528\u4F1A\u8BA9\u4E24\u8FB9\u4E92\u6539\u6837\u5F0F\u2014\u2014\u5B9E\u6D4B\u8E29\u8FC7\uFF1AAgent \u680F\u88AB\u5957\u8FDB\u7EC8\u7AEF\u62BD\u5C49\u7684 height: min(46%,380px)\uFF0C
 * \u680F\u4E0B\u9762\u51ED\u7A7A\u591A\u51FA 380px \u7A7A\u76D2\u3002\u6709\u4E13\u95E8\u7684\u7528\u4F8B\u5B88\u7740\u8FD9\u6761\uFF08\u6837\u5F0F\u547D\u540D\u7A7A\u95F4\u4E0D\u5F97\u649E\u8F66\uFF09\u3002
 *
 * \u51E0\u4F55\u4E0E\u7EC8\u7AEF\u62BD\u5C49\u4FDD\u6301\u540C\u4E00\u5957\u8BED\u8A00\uFF1A\u6536\u8D77\u6001\u53EA\u6709\u4E00\u6761\u6807\u9898\u680F\uFF0C\u5C55\u5F00\u6001\u624D\u8981\u771F\u5B9E\u9AD8\u5EA6\u3002
 */
.dk_agent {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--dk-border);
  background: var(--dk-surface-solid);
}

/* \u5C55\u5F00\uFF1A\u7ED9\u5B83\u771F\u5B9E\u9AD8\u5EA6\uFF08\u7A84\u627F\u8F7D\u4E0B\u9762\u677F\u672C\u6765\u5C31\u4E0D\u9AD8\uFF0C46% \u4E0A\u9650 + 380px \u5C01\u9876\uFF09 */
.dk_agent[data-open="1"] {
  height: min(46%, 380px);
  min-height: 160px;
}

.dk_agentHead {
  display: flex;
  align-items: center;
  gap: var(--dk-gap-sm);
  padding: var(--dk-gap-sm) var(--dk-gap-md);
  font-size: 12px;
  min-width: 0;
}

.dk_agentDot { width: 7px; height: 7px; border-radius: 50%; flex: 0 0 auto; background: var(--dk-label-3); }
.dk_agentDot[data-status="running"] { background: var(--dk-accent); }
.dk_agentDot[data-status="done"] { background: var(--dk-success); }
.dk_agentDot[data-status="stopped"] { background: var(--dk-danger); }
.dk_agentDot[data-status="unavailable"] { background: var(--dk-warn); }

.dk_agentTitle { font-weight: 600; color: var(--dk-label); flex: 0 0 auto; }
.dk_agentSub { color: var(--dk-label-3); flex: 0 0 auto; }
.dk_agentHint { color: var(--dk-label-3); flex: 0 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: help; }
.dk_agentGrow { flex: 1 1 auto; min-width: 0; }

.dk_agentBody {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: var(--dk-gap-sm);
  padding: var(--dk-gap-sm) var(--dk-gap-md) var(--dk-gap-lg);
  border-top: 1px solid var(--dk-border);
  font-size: 12px;
  line-height: 1.6;
}

/* \u6536\u8D77\u6001\uFF1Ahidden \u5FC5\u987B\u663E\u5F0F\u8986\u76D6 display:flex\uFF0C\u5426\u5219\u5C5E\u6027\u4E0D\u8D77\u4F5C\u7528 */
.dk_agentBody[hidden] { display: none; }

.dk_agentItem { display: flex; gap: var(--dk-gap-sm); align-items: baseline; min-width: 0; }
.dk_agentItem[data-kind="reasoning"] { color: var(--dk-label-3); font-style: italic; }
.dk_agentItem[data-kind="result"] { color: var(--dk-label-2); }
.dk_agentItem[data-kind="end"] { color: var(--dk-label-3); }

.dk_agentTag {
  flex: 0 0 auto;
  min-width: 34px;
  color: var(--dk-label-3);
  font-size: 11px;
}

.dk_agentText, .dk_agentTool { white-space: pre-wrap; word-break: break-word; min-width: 0; }
.dk_agentTool { font-family: var(--dk-mono); color: var(--dk-accent); }

/* \u3010SPIKE \xB7 \u9A8C\u5B8C\u5220\u9664\u3011\u63A2\u9488\u7684\u6392\u7248\uFF1A\u628A\u8BFB\u6570\u644A\u6210\u4E24\u5217 */
.dk_spike {
  display: flex;
  flex-direction: column;
  gap: var(--dk-gap-sm);
  padding: var(--dk-gap-lg);
  color: var(--dk-label);
  font-size: 12px;
}

.dk_spikeTitle { font-size: 13px; font-weight: 600; }
.dk_spikeHint { color: var(--dk-label-3); line-height: 1.6; }

.dk_spikeRow {
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: var(--dk-gap-md);
  align-items: baseline;
}

.dk_spikeKey { color: var(--dk-label-3); }
.dk_spikeVal { word-break: break-all; }

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

/* ============================ \u4E34\u65F6\u591A\u9009\u805A\u5408 ============================ */

/*
 * \u52FE\u9009\u6846\uFF1A\u7EAF CSS \u753B\u65B9\u6846 + \u52FE\uFF08\u7528\u771F\u5B9E <input type="checkbox"> \u4F1A\u5E26\u8FDB\u6D4F\u89C8\u5668\u539F\u751F
 * \u5C3A\u5BF8/\u5BF9\u9F50\u5DEE\u5F02\uFF0C\u8FD8\u8981\u5904\u7406\u53EA\u8BFB\u6001\uFF09\u3002\u672A\u52FE\u9009\u65F6\u628A\u52FE\u7684\u5B57\u8272\u8BBE\u6210\u900F\u660E\uFF0C\u5F62\u72B6\u4ECD\u7136\u5360\u4F4D\uFF0C
 * \u6240\u4EE5\u52FE\u9009/\u53D6\u6D88\u4E0D\u4F1A\u8BA9\u5361\u7247\u5934\u90E8\u6A2A\u5411\u6296\u52A8\u3002
 */
.dk_pick {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: 1px solid var(--dk-border-strong);
  border-radius: var(--dk-r-xs);
  background: var(--dk-input);
  color: transparent;
  font-size: 11px;
  line-height: 1;
  transition: background var(--dk-dur) var(--dk-ease), border-color var(--dk-dur) var(--dk-ease), color var(--dk-dur) var(--dk-ease);
}

.dk_pick::after { content: '\u2713'; }
.dk_pick[data-on="1"] { background: var(--dk-accent); border-color: var(--dk-accent); color: #fff; }

/* \u9009\u62E9\u6001\uFF1A\u6574\u5F20\u5361\u7247\u5C31\u662F\u52FE\u9009\u5F00\u5173\uFF0C\u52A8\u4F5C\u6761\u6536\u8D77\uFF08\u5426\u5219\u4E00\u8FB9\u591A\u9009\u4E00\u8FB9\u80FD\u70B9\u5230\u542F\u505C\u5220\uFF09 */
.dk_card[data-pick="1"] .dk_actionBar { display: none; }
.dk_card[data-picked="1"] { border-color: var(--dk-accent); box-shadow: var(--dk-ring); }

/* \u805A\u5408\u64CD\u4F5C\u6761\uFF1A\u5939\u5728\u5DE5\u5177\u6761\u4E0E\u6B63\u6587\u4E4B\u95F4\u7684\u4E00\u6761\u6A2A\u680F\uFF0C\u8BA1\u6570\u9760\u5DE6\u3001\u6309\u94AE\u9760\u53F3 */
/* \u9009\u62E9\u6001\u64CD\u4F5C\u6761\uFF1A\u7B2C\u4E00\u884C\u662F\u8BA1\u6570 + \u52A8\u4F5C\uFF0C\u7B2C\u4E8C\u884C\u662F\u300C\u6309\u6761\u4EF6\u9009\u4E2D\u300Dchips */
.dk_pickBar {
  display: flex;
  flex-direction: column;
  gap: var(--dk-gap-sm);
  flex: 0 0 auto;
  padding: var(--dk-gap-sm) var(--dk-gap-lg);
  border-bottom: 1px solid var(--dk-border);
  background: var(--dk-surface-2);
}

.dk_pickRow {
  display: flex;
  align-items: center;
  gap: var(--dk-gap-md);
  flex-wrap: wrap;
}

.dk_pickPresets {
  display: flex;
  align-items: center;
  gap: var(--dk-gap-sm);
  flex-wrap: wrap;
}

.dk_pickPresetsLabel {
  font-size: 11px;
  color: var(--dk-label-3);
}

/* \u6761\u4EF6 chip\uFF1A\u4E0E pill \u540C\u65CF\u7684\u8F7B\u91CF\u6309\u94AE\uFF08\u4E00\u884C\u653E\u5F97\u4E0B 5~6 \u4E2A\uFF09 */
.dk_chip {
  height: var(--dk-h-sm);
  padding: 0 var(--dk-gap-md);
  border: 1px solid var(--dk-border-strong);
  border-radius: var(--dk-r-pill);
  background: var(--dk-surface-solid);
  color: var(--dk-label-2);
  font-size: 11px;
  font-family: inherit;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition: background var(--dk-dur) var(--dk-ease), color var(--dk-dur) var(--dk-ease), border-color var(--dk-dur) var(--dk-ease);
}

.dk_chip:hover { background: var(--dk-hover); color: var(--dk-label); border-color: var(--dk-accent); }
.dk_chip:focus-visible { outline: none; box-shadow: var(--dk-ring); }
.dk_chipQuiet { border-color: var(--dk-border); color: var(--dk-label-3); }
.dk_pickNotice { margin-left: auto; }

.dk_pickCount {
  font-size: 12px;
  font-weight: 600;
  color: var(--dk-label);
  font-variant-numeric: tabular-nums;
}

/* \u63D0\u793A\u5728\u7A84\u680F\u91CC\u53EF\u4EE5\u6362\u884C\uFF0C\u4F46\u4E0D\u8981\u6491\u7834\u884C */
.dk_pickHint { min-width: 0; }

/* ============================ \u4E8B\u4EF6\u6D3B\u52A8\u6761 ============================ */

/*
 * \u6D3B\u52A8\u6761\uFF1A\u8D34\u5728\u5BB9\u5668\u5217\u8868\u5934\u90E8\u7684\u4E00\u6761\u7A84\u680F\u3002\u9ED8\u8BA4\u5C55\u5F00\u3001\u53EF\u6298\u53E0\u2014\u2014\u6298\u53E0\u53EA\u6536\u8D77\u660E\u7EC6\uFF0C
 * \u4E8B\u4EF6\u6D41\u7167\u5E38\u8DD1\uFF08\u5B83\u4E0D\u662F\u6682\u505C\u5F00\u5173\uFF09\uFF0C\u6240\u4EE5\u6298\u53E0\u6001\u4E5F\u8981\u7559\u7740\u6807\u9898\u4E0E\u72B6\u6001\u70B9\u3002
 */
.dk_activity {
  flex: 0 0 auto;
  margin-bottom: var(--dk-gap-lg);
  border: 1px solid var(--dk-border);
  border-radius: var(--dk-r-md);
  background: var(--dk-surface-2);
  overflow: hidden;
}

.dk_activityHead {
  display: flex;
  align-items: center;
  gap: var(--dk-gap-md);
  width: 100%;
  min-width: 0;
  padding: var(--dk-gap-sm) var(--dk-gap-lg);
  border: none;
  background: transparent;
  color: var(--dk-label);
  font-family: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.dk_activityHead:hover { background: var(--dk-hover); }
.dk_activityHead:focus-visible { outline: none; box-shadow: var(--dk-ring); }
.dk_activityTitle { flex: none; font-weight: 600; letter-spacing: .3px; }

/* \u72B6\u6001\u70B9\u6CBF\u7528 .dk_followState \u7684\u8BED\u4E49\u8272\uFF0C\u4F46\u5185\u8054\u5728\u6807\u9898\u884C\u91CC\u3001\u4E0D\u5360\u6574\u884C\u4E5F\u6CA1\u6709\u4E0B\u8FB9\u6846 */
.dk_activityState {
  display: inline-flex;
  align-items: center;
  gap: var(--dk-gap-sm);
  flex: none;
  color: var(--dk-label-3);
  font-size: 11px;
}

.dk_activityState::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--dk-label-3);
}

.dk_activityState[data-state="open"]::before { background: var(--dk-success); }
.dk_activityState[data-state="connecting"]::before,
.dk_activityState[data-state="reconnecting"]::before { background: var(--dk-warn); }
.dk_activityState[data-state="closed"]::before,
.dk_activityState[data-state="unsupported"]::before { background: var(--dk-danger); }

.dk_activityChevron {
  flex: none;
  display: inline-flex;
  color: var(--dk-label-3);
  transition: transform var(--dk-dur) var(--dk-ease);
}

.dk_activity[data-open="1"] .dk_activityChevron { transform: rotate(180deg); }

.dk_activityList {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dk-gap-sm);
  padding: 0 var(--dk-gap-lg) var(--dk-gap-md);
}

.dk_activityEmpty {
  padding: 0 var(--dk-gap-lg) var(--dk-gap-md);
  color: var(--dk-label-3);
  font-size: 11px;
}

.dk_activityItem {
  display: inline-flex;
  align-items: center;
  gap: var(--dk-gap-sm);
  max-width: 100%;
  padding: 2px var(--dk-gap-sm);
  border: 1px solid var(--dk-border);
  border-radius: var(--dk-r-xs);
  background: var(--dk-surface-solid);
  font-size: 11px;
}

.dk_activityTime {
  color: var(--dk-label-3);
  font-family: var(--dk-mono);
  font-variant-numeric: tabular-nums;
}

.dk_activityName {
  max-width: 200px;
  color: var(--dk-label);
  font-family: var(--dk-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dk_activityAction { color: var(--dk-label-2); }

/* \u52A8\u4F5C\u7740\u8272\uFF1Astart \u662F\u300C\u8D77\u6765\u4E86\u300D\uFF0Cdie / oom / kill \u662F\u300C\u51FA\u4E8B\u4E86\u300D\uFF0Chealth \u53EA\u9648\u8FF0\u72B6\u6001 */
.dk_activityItem[data-action="start"] .dk_activityAction { color: var(--dk-success); font-weight: 600; }
.dk_activityItem[data-action="die"] .dk_activityAction,
.dk_activityItem[data-action="oom"] .dk_activityAction,
.dk_activityItem[data-action="kill"] .dk_activityAction { color: var(--dk-danger); font-weight: 600; }
.dk_activityItem[data-action="stop"] .dk_activityAction,
.dk_activityItem[data-action="destroy"] .dk_activityAction { color: var(--dk-warn); }
.dk_activityItem[data-action="health_status"] .dk_activityAction { color: var(--dk-label-2); font-style: italic; }

/* ==================== \u53D8\u66F4\u64CD\u4F5C\u7684\u300C\u6267\u884C\u4E2D\u300D\u6001 ==================== */

/*
 * \u542F\u505C\u5220\u5728\u98DE\u7684\u65F6\u5019\uFF08docker stop / rm \u8981\u7B49\u5BB9\u5668\u771F\u7684\u9000\u51FA\uFF0C\u79D2\u7EA7\u5230\u5341\u51E0\u79D2\uFF09\uFF1A
 *   1. \u6B63\u5728\u8DD1\u7684\u90A3\u4E2A\u6309\u94AE\u628A\u56FE\u6807\u6362\u6210\u8F6C\u5708\uFF08\u89C1 IconAction \u7684 busy\uFF09\uFF1B
 *   2. \u540C\u4E00\u5F20\u5361\u7247\u7684\u5176\u5B83\u53D8\u66F4\u6309\u94AE\u7F6E\u7070\u538B\u6697\uFF0C\u76F4\u89C2\u8868\u793A\u300C\u8FD9\u4E00\u7EC4\u5148\u522B\u52A8\u300D\uFF1B
 *   3. \u5361\u7247\u63CF\u8FB9\u8D70\u5F3A\u8C03\u8272\uFF0C\u626B\u5217\u8868\u65F6\u80FD\u770B\u51FA\u54EA\u51E0\u5F20\u6B63\u5728\u5904\u7406\u3002
 * \u7F6E\u7070\u6309\u94AE\u672C\u8EAB\u6709 opacity .45\uFF0Cbusy \u7684\u90A3\u4E2A\u8981\u9876\u6389\u5B83\uFF0C\u5426\u5219\u8F6C\u5708\u4E5F\u8DDF\u7740\u53D8\u6DE1\u3002
 */
.dk_iconBtn[data-busy="1"] { color: var(--dk-accent); }
.dk_iconBtn[data-busy="1"]:disabled { opacity: 1; cursor: progress; }
.dk_card[data-pending="1"] .dk_actionBar .dk_iconBtn:not([data-busy="1"]) { opacity: .4; }
.dk_card[data-pending="1"] { border-color: color-mix(in srgb, var(--dk-accent) 45%, transparent); }

/* \u786E\u8BA4\u6846\u91CC\u7684\u300C\u6267\u884C\u4E2D\u2026\u300D\uFF1A\u8F6C\u5708 + \u6587\u6848\u5E76\u6392\uFF0C\u4E0D\u6491\u7834\u6309\u94AE\u9AD8\u5EA6 */
.dk_confirmBusy { display: inline-flex; align-items: center; gap: var(--dk-gap-sm); }

/* \u5FD9\u788C\u7684\u786E\u8BA4\u952E\u540C\u6837\u8981\u9876\u6389 .dk_btn:disabled \u7684 .45\uFF0C\u5426\u5219\u300C\u6267\u884C\u4E2D\u2026\u300D\u770B\u4E0D\u6E05\uFF08\u53D6\u6D88\u952E\u4FDD\u6301\u7F6E\u7070\uFF09 */
.dk_confirm[data-busy="1"] .dk_btnDanger { opacity: 1; cursor: progress; }

/* ==================== \u7F51\u7EDC / \u5377\u5217\u8868 ==================== */

/*
 * \u53EF\u70B9\u51FB\u7684\u8868\u683C\u884C\uFF08\u7F51\u7EDC / \u5377\u5217\u8868\uFF1A\u884C = \u8FDB\u8BE6\u60C5\u7684\u5165\u53E3\uFF09\u3002
 * \u53EA\u7ED9 cursor + hover \u63D0\u793A\uFF0C\u4E0D\u52A0\u4E0B\u5212\u7EBF\u2014\u2014\u8868\u683C\u91CC\u6EE1\u5C4F\u4E0B\u5212\u7EBF\u4F1A\u66F4\u96BE\u770B\u3002
 */
.dk_rowClickable { cursor: pointer; }
.dk_rowClickable:hover { background: var(--dk-hover); }

/* \u6302\u8F7D\u70B9\u5217\uFF1A\u8DEF\u5F84\u5F88\u957F\uFF0C\u6491\u5BBD\u8868\u683C\u4F1A\u628A\u522B\u7684\u5217\u6324\u6CA1\uFF0C\u8FD9\u91CC\u9650\u5BBD + \u7701\u7565\u53F7\uFF0Ctitle \u91CC\u7ED9\u5168\u91CF */
.dk_pathCell { max-width: 420px; overflow: hidden; text-overflow: ellipsis; }

/* ====================== \u591A\u76EE\u6807\u603B\u89C8\uFF08\u53EA\u8BFB\uFF09 ========================= */

/*
 * \u4E00\u5C4F\u770B\u5168\u90E8\u76EE\u6807\uFF1A\u4E0A\u9762\u4E00\u884C\u8BA1\u6570\u5361\uFF0C\u4E0B\u9762\u5F02\u5E38\u8868\u3002\u5361\u7247\u884C\u4E0D\u6EDA\uFF08\u76EE\u6807\u6570\u662F\u914D\u7F6E\u51FA\u6765\u7684\uFF0C
 * \u901A\u5E38\u4E2A\u4F4D\u6570\uFF09\uFF0C\u5F02\u5E38\u8868\u81EA\u5DF1\u6EDA\u3001\u8868\u5934\u5438\u9876\u2014\u2014\u4E0E\u955C\u50CF / \u7F51\u7EDC / \u5377\u9875\u540C\u6B3E\uFF0C\u9760 .dk_mainImages
 * \u91CC\u90A3\u6761 \`.dk_tableWrap { flex: 1 }\` \u751F\u6548\uFF0C\u6240\u4EE5\u6B63\u6587\u5916\u5C42\u5FC5\u987B\u662F flex \u5217\u7684 .dk_imagesView\u3002
 */
.dk_ovCards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: var(--dk-gap-md);
  margin-bottom: var(--dk-gap-lg);
}

.dk_ovCard {
  display: flex;
  flex-direction: column;
  gap: var(--dk-gap-sm);
  padding: var(--dk-gap-md) var(--dk-gap-lg);
  border: 1px solid var(--dk-border);
  border-radius: var(--dk-r-md);
  background: var(--dk-surface-solid);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color var(--dk-dur) var(--dk-ease), box-shadow var(--dk-dur) var(--dk-ease);
}

.dk_ovCard:hover { border-color: var(--dk-border-strong); box-shadow: var(--dk-shadow); }
.dk_ovCard:focus-visible { outline: none; box-shadow: var(--dk-ring); }

/* \u4E0D\u53EF\u8FBE\u7684\u5361\u8981\u5728\u4E00\u5C4F\u91CC\u7B2C\u4E00\u773C\u88AB\u6311\u51FA\u6765\uFF1A\u5371\u9669\u8272\u63CF\u8FB9 + \u6DE1\u5E95\uFF0C\u548C\u300C\u6570\u5B57\u90FD\u6B63\u5E38\u300D\u7684\u5361\u62C9\u5F00 */
.dk_ovCard[data-state="error"] {
  border-color: color-mix(in srgb, var(--dk-danger) 40%, transparent);
  background: color-mix(in srgb, var(--dk-danger) 8%, transparent);
}

.dk_ovCardHead {
  display: flex;
  align-items: center;
  gap: var(--dk-gap-sm);
  min-width: 0;
}

.dk_ovCardName {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/*
 * \u8BA1\u6570\u533A\uFF1A**\u4E24\u5217\u7F51\u683C + \u56FA\u5B9A\u5BBD\u5EA6\u7684\u6570\u5B57\u69FD**\u3002
 * \u539F\u6765\u662F flex-wrap\uFF1A\u56DB\u9879\u6362\u884C\u540E\u6BCF\u9879\u5BBD\u5EA6\u968F\u5185\u5BB9\u53D8\uFF08\u300C21 \u8FD0\u884C\u4E2D\u300D\u6BD4\u300C0 \u4E0D\u5065\u5EB7\u300D\u5BBD\uFF09\uFF0C
 * \u7B2C\u4E8C\u5217\u5C31\u8DDF\u7740\u5185\u5BB9\u5DE6\u53F3\u9519\u5F00\uFF0C\u770B\u8D77\u6765\u300C\u6587\u5B57\u6CA1\u5BF9\u9F50\u300D\u3002
 *   - \u7F51\u683C\u4FDD\u8BC1\u540C\u4E00\u5217\u7684\u8D77\u70B9\u4E00\u81F4\uFF08\u4E24\u884C\u4E24\u5217\u5BF9\u9F50\uFF09\uFF1B
 *   - \u6570\u5B57\u69FD\u56FA\u5B9A\u5BBD + \u53F3\u5BF9\u9F50 + tabular-nums\uFF0C\u4FDD\u8BC1\u300C21\u300D\u4E0E\u300C0\u300D\u4E4B\u540E\u7684\u6807\u7B7E\u4E5F\u5728\u540C\u4E00 x
 *     \uFF0812px \u5BB9\u5668\u5B57\u53F7\u4E0B 2.8ch \u2248 34px\uFF0C\u591F\u653E\u4E09\u4F4D\u6570\uFF1B\u771F\u8D85\u8FC7\u65F6\u6807\u7B7E\u53F3\u79FB\u4E00\u4F4D\uFF0C\u53EF\u63A5\u53D7\uFF09\u3002
 */
.dk_ovCardCounts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--dk-gap-sm) var(--dk-gap-lg);
}

.dk_ovCount {
  display: grid;
  grid-template-columns: 2.8ch auto;
  align-items: baseline;
  gap: var(--dk-gap-xs);
  min-width: 0;
  font-size: 12px;
  color: var(--dk-label-3);
}

.dk_ovCountLabel { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.dk_ovCountValue {
  font-size: 16px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  text-align: right;
  color: var(--dk-label);
}

.dk_ovCount[data-state="running"] .dk_ovCountValue { color: var(--dk-success); }
.dk_ovCount[data-state="unhealthy"] .dk_ovCountValue { color: var(--dk-danger); }
/*
 * \u8FD8\u6CA1\u7B54\u5B8C\u7684\u5361\uFF1A\u53EA\u7ED9\u8BFB\u53D6\u6001\uFF0C\u4E0D\u51FA 0/0/0\uFF08\u90A3\u4F1A\u88AB\u8BFB\u6210\u300C\u8FD9\u53F0\u673A\u5668\u6CA1\u6709\u5BB9\u5668\u300D\uFF0C\u800C\u5B83\u53EA\u662F\u8FD8\u6CA1
 * \u56DE\u7B54\u2014\u2014SSH \u76EE\u6807\u4E0D\u53EF\u8FBE\u65F6\u8981\u7B49 readyTimeout 20s\uFF09\u3002\u6574\u5361\u538B\u6697\u4E00\u70B9\uFF0C\u4E0E\u5DF2\u6709\u7ED3\u679C\u533A\u5206\u5F00\u3002
 */
.dk_ovCard[data-state="loading"] { opacity: .7; }

.dk_ovCardLoading {
  display: flex;
  align-items: center;
  gap: var(--dk-gap-sm);
  font-size: 12px;
  color: var(--dk-label-3);
}

/* \u4E0D\u5065\u5EB7\u4E3A 0 \u65F6\u6570\u5B57\u5373\u7ED3\u8BBA\uFF0C\u4E0D\u8BE5\u7EE7\u7EED\u7528\u5371\u9669\u8272\u558A\u4EBA */
.dk_ovCount[data-state="unhealthy"][data-zero="1"] .dk_ovCountValue { color: var(--dk-label-3); }

.dk_ovCardError {
  display: flex;
  align-items: center;
  gap: var(--dk-gap-sm);
  min-width: 0;
  font-size: 12px;
}

/* SSH \u62A5\u9519\u662F\u4E00\u957F\u4E32\uFF1A\u5361\u7247\u91CC\u53EA\u7559\u4E00\u884C\uFF0C\u5168\u91CF\u5728 title \u91CC */
.dk_ovCardErrorText {
  flex: 1 1 auto;
  min-width: 0;
  color: var(--dk-label-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dk_ovSection {
  margin: 0 0 var(--dk-gap-sm);
  font-size: 12px;
  font-weight: 600;
  color: var(--dk-label-2);
}

/* \u300C\u4E00\u5207\u6B63\u5E38\u300D/\u300C\u8BFB\u53D6\u4E2D\u300D\u8D34\u5728\u5361\u7247\u884C\u4E0B\u9762\uFF0C\u4E0D\u9700\u8981\u6EE1\u5C4F 48px \u7684\u7559\u767D */
.dk_ovEmpty { padding: 24px var(--dk-gap-lg); }

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
  .dk_projectRow { grid-template-columns: 96px 1fr auto; }
  .dk_projectImage,
  .dk_projectPorts { display: none; }
}

/* ============================ \u955C\u50CF\u8BE6\u60C5 ============================ */

/* \u955C\u50CF\u8868\u6700\u540E\u4E00\u5217\uFF08\u64CD\u4F5C\uFF09\uFF1A\u5BBD\u5EA6\u6536\u5230\u5185\u5BB9\u3001\u6309\u94AE\u53F3\u5BF9\u9F50\uFF0C\u4E0D\u8DDF\u6570\u636E\u5217\u62A2\u5BBD\u5EA6 */
.dk_colActions { width: 1%; white-space: nowrap; text-align: right; }
.dk_rowActions { display: inline-flex; align-items: center; gap: var(--dk-gap-xs); }

.dk_layerList {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 220px;
  overflow: auto;
}

.dk_layerItem {
  display: flex;
  align-items: center;
  gap: var(--dk-gap-md);
  font-size: 12px;
  color: var(--dk-label-2);
}

.dk_layerIndex {
  flex: none;
  width: 36px;
  color: var(--dk-label-3);
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.dk_layerId { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.dk_labelList { display: flex; flex-direction: column; gap: 2px; font-size: 12px; }
.dk_labelItem { display: grid; grid-template-columns: minmax(0, 240px) 1fr; gap: var(--dk-gap-md); }
.dk_labelKey { color: var(--dk-label-3); font-family: var(--dk-mono); overflow-wrap: anywhere; }
.dk_labelVal { color: var(--dk-label); font-family: var(--dk-mono); overflow-wrap: anywhere; }

.dk_historyTable td { vertical-align: top; }
.dk_historyCmd { max-width: 440px; overflow: hidden; text-overflow: ellipsis; }

/* ============================ \u955C\u50CF\u62C9\u53D6\u8FDB\u5EA6 ============================ */

.dk_pullBody { gap: var(--dk-gap-md); }

.dk_pullBox {
  flex: 1 1 auto;
  min-height: 180px;
  margin-top: var(--dk-gap-md);
  padding: var(--dk-gap-md);
  border: 1px solid var(--dk-border);
  border-radius: var(--dk-r-md);
  background: var(--dk-log-bg);
  color: var(--dk-log-fg);
  font-family: var(--dk-mono);
  font-size: 12px;
  line-height: 1.5;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.dk_pullLine { min-height: 1.5em; }
/* \u9010\u5C42\u72B6\u6001\u884C\uFF1A\u5C42\u952E\u7531 data-key \u6807\u51FA\uFF0C\u7ED9\u5C42\u72B6\u6001\u4E00\u70B9\u8272\u5F69\u533A\u5206 */
.dk_pullLine[data-key] { color: color-mix(in srgb, var(--dk-log-fg) 82%, var(--dk-accent)); }

/* ============================ \u7EDF\u8BA1\u5B9E\u65F6\u8DDF\u968F ============================ */

.dk_statsView {
  display: flex;
  flex-direction: column;
  gap: var(--dk-gap-md);
  flex: 1 1 auto;
  min-height: 0;
}

.dk_statsBar { display: flex; align-items: center; gap: var(--dk-gap-sm); flex-wrap: wrap; }
.dk_trend { display: inline-flex; align-items: center; gap: var(--dk-gap-sm); }

.dk_spark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 96px;
  height: 22px;
  color: var(--dk-accent);
}

.dk_spark svg { display: block; width: 96px; height: 22px; overflow: visible; }
.dk_spark[data-alert="1"] { color: var(--dk-danger); }
.dk_sparkEmpty { font-size: 11px; color: var(--dk-label-3); }

/* ============================ Compose \u9879\u76EE ============================ */

.dk_projects { display: flex; flex-direction: column; gap: var(--dk-gap-lg); }

.dk_project {
  border: 1px solid var(--dk-border);
  border-radius: var(--dk-r-md);
  background: var(--dk-surface-2);
  overflow: hidden;
  cursor: pointer;
  transition: border-color var(--dk-dur) var(--dk-ease), box-shadow var(--dk-dur) var(--dk-ease);
}

.dk_project:hover { border-color: var(--dk-border-strong); }
.dk_project:focus-visible { outline: none; box-shadow: var(--dk-ring); }
.dk_projectHead { display: flex; align-items: center; gap: var(--dk-gap-md); padding: var(--dk-gap-md) var(--dk-gap-lg); }
.dk_projectIcon { display: inline-flex; align-items: center; color: var(--dk-accent); }
.dk_projectName { font-size: 13px; font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dk_projectRows { display: flex; flex-direction: column; border-top: 1px solid var(--dk-border); }

.dk_projectRow {
  display: grid;
  grid-template-columns: 120px minmax(120px, 1.1fr) auto minmax(120px, 1.2fr) minmax(80px, 1fr);
  align-items: center;
  gap: var(--dk-gap-md);
  padding: var(--dk-gap-sm) var(--dk-gap-lg);
  font-size: 12px;
  border-top: 1px solid var(--dk-border);
}

.dk_projectRow:first-child { border-top: none; }
.dk_projectSvc { color: var(--dk-label-2); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dk_projectContainer { font-family: var(--dk-mono); color: var(--dk-label); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dk_projectImage { font-family: var(--dk-mono); color: var(--dk-label-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dk_projectPorts { color: var(--dk-label-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.dk_composeTable td { vertical-align: middle; }

/* \u805A\u5408\u65E5\u5FD7\u7684 [service] \u524D\u7F00\uFF08\u540C\u4E00\u4EFD\u65E5\u5FD7\u7740\u8272\uFF0C\u53EA\u591A\u4E00\u4E2A\u6765\u6E90\u6807\u7B7E\uFF09 */
.dk_logSvc { margin-right: 6px; color: var(--dk-accent); font-weight: 600; }
`;var Xn="/api/dsh-docker",Ur="dsh-docker-style",qr="@hyzyn/dsh-docker",Pn="docker",lt=null;function jn(){if(document.getElementById(Ur)!==null)return;let l=document.createElement("style");l.id=Ur,l.textContent=Jr,document.head.appendChild(l)}async function le(l,h){let e=await fetch(Xn+l,{...h,headers:{"content-type":"application/json",...h?.headers??{}}}),o=null;try{o=await e.json()}catch{}if(!e.ok){let O=o!==null&&typeof o.error=="string"?o.error:`HTTP ${String(e.status)}`;throw new Error(O)}if(o!==null&&o.ok===!1)throw new Error(typeof o.error=="string"?o.error:"\u8BF7\u6C42\u5931\u8D25");return o}var Q={config:()=>le("/config"),saveConfig:l=>le("/config",{method:"POST",body:JSON.stringify(l)}),targets:()=>le("/targets"),probe:l=>le("/probe",{method:"POST",body:JSON.stringify({target:l})}),containers:(l,h)=>le("/containers",{method:"POST",body:JSON.stringify({target:l,all:h})}),attention:l=>le("/attention",{method:"POST",body:JSON.stringify({target:l})}),inspect:(l,h)=>le("/inspect",{method:"POST",body:JSON.stringify({target:l,id:h})}),logs:(l,h,e)=>le("/logs",{method:"POST",body:JSON.stringify({target:l,id:h,...e})}),stats:(l,h)=>le("/stats",{method:"POST",body:JSON.stringify({target:l,ids:h})}),images:l=>le("/images",{method:"POST",body:JSON.stringify({target:l})}),imageInspect:(l,h)=>le("/images/inspect",{method:"POST",body:JSON.stringify({target:l,ref:h})}),imageRemove:(l,h)=>le("/images/remove",{method:"POST",body:JSON.stringify({target:l,ref:h})}),imagePrune:l=>le("/images/prune",{method:"POST",body:JSON.stringify({target:l})}),networks:l=>le("/networks",{method:"POST",body:JSON.stringify({target:l})}),networkInspect:(l,h)=>le("/networks/inspect",{method:"POST",body:JSON.stringify({target:l,name:h})}),networkRemove:(l,h)=>le("/networks/remove",{method:"POST",body:JSON.stringify({target:l,name:h})}),networkPrune:l=>le("/networks/prune",{method:"POST",body:JSON.stringify({target:l})}),volumes:l=>le("/volumes",{method:"POST",body:JSON.stringify({target:l})}),volumeInspect:(l,h)=>le("/volumes/inspect",{method:"POST",body:JSON.stringify({target:l,name:h})}),volumeRemove:(l,h)=>le("/volumes/remove",{method:"POST",body:JSON.stringify({target:l,name:h})}),volumePrune:l=>le("/volumes/prune",{method:"POST",body:JSON.stringify({target:l})}),action:(l,h,e)=>le("/action",{method:"POST",body:JSON.stringify({target:l,action:h,id:e})}),exec:(l,h,e,o)=>le("/exec",{method:"POST",body:JSON.stringify({target:l,id:h,command:e,timeoutSec:o})})};function dn(l,h){return Xn+l+"?"+new URLSearchParams(h).toString()}function Go(l){return l==null||!Number.isFinite(l)?"\u2014":l.toFixed(l>=10?1:2)+"%"}function Wo(l){return l.hostPort===void 0?String(l.containerPort)+"/"+l.protocol:String(l.hostPort)+"\u2192"+String(l.containerPort)+"/"+l.protocol}function cn(l){if(!Array.isArray(l)||l.length===0)return"\u65E0\u7AEF\u53E3\u6620\u5C04";let h=new Set,e=[];for(let o of l){let O=Wo(o);h.has(O)||(h.add(O),e.push(O))}return e.join("  ")}function Ct(l){let h=/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/.exec(l);return h===null?l:h[1]+" "+h[2]}function un(l){if(l==null||!Number.isFinite(l)||l<0)return"\u2014";let h=["B","kB","MB","GB","TB"],e=l,o=0;for(;e>=1e3&&o<h.length-1;)e/=1e3,o+=1;return(o===0?String(Math.round(e)):e.toFixed(e>=100?0:1))+" "+h[o]}function Jo(l){return{running:"\u8FD0\u884C\u4E2D",exited:"\u5DF2\u505C\u6B62",created:"\u5DF2\u521B\u5EFA",paused:"\u5DF2\u6682\u505C",restarting:"\u91CD\u542F\u4E2D",dead:"dead",removing:"\u5220\u9664\u4E2D",unknown:"\u672A\u77E5"}[l]??l}function Xr(l,h){let e=new Blob([h],{type:"text/plain;charset=utf-8"}),o=URL.createObjectURL(e),O=document.createElement("a");O.href=o,O.download=l,O.click(),setTimeout(()=>URL.revokeObjectURL(o),1e3)}var va="docker exec -it '";function Hn(l){let h=String(l).replaceAll("'","'\\''");return va+h+"' sh"}function Yr(l){return typeof l=="string"&&l.startsWith(va)}var Yn="dsh-docker:last-target";function $r(){try{let l=window.localStorage.getItem(Yn);return typeof l=="string"?l:""}catch{return""}}function Zr(l){try{window.localStorage.setItem(Yn,l)}catch{}}function zn(l,h,e,o){if(h!=="")return h;if(o)return"";let O=l.map(p=>p.name);return e!==""&&O.includes(e)?e:O.length>0?O[0]:""}var Xe=null,et=null,kn=null,De=null,$n=[],Gn=0,mn=null,fn=!1;function ba(l){fn=l,mn!==null&&mn.set(l)}function _a(l){ba(!(l!==null&&typeof l=="object"&&l.enabled===!1))}function Fn(l){l!==null&&typeof l=="object"&&(De=l),Gn=Date.now(),_a(De)}async function hn(){let l=!0;try{De=(await Q.config()).config,Gn=Date.now(),_a(De)}catch(h){l=!1,console.warn("[dsh-docker] \u914D\u7F6E\u7F13\u5B58\u5237\u65B0\u5931\u8D25\uFF1A"+(h instanceof Error?h.message:String(h)))}try{$n=(await Q.targets()).targets??[],Gn=Date.now()}catch(h){fn&&(l=!1,console.warn("[dsh-docker] \u76EE\u6807\u7F13\u5B58\u5237\u65B0\u5931\u8D25\uFF1A"+(h instanceof Error?h.message:String(h))))}return l}async function Uo(l,h){let e=Wn(l,h);return e!==void 0?e:(await hn(),Wn(l,h))}function Wn(l,h){let e=De!==null&&Array.isArray(De.targets)?De.targets:[];if(typeof h=="string"&&h!==""){let L=e.find(B=>B.kind==="ssh"&&B.book===h);if(L!==void 0)return L.name}let o=typeof l?.host=="string"?l.host:"";if(o==="")return;let O=Number(l?.port),p=Number.isInteger(O)&&O>0?O:22;for(let L of $n){if(L.kind!=="ssh"||typeof L.label!="string")continue;let B=/^([^@]+)@(.+?)(?::(\d+))?$/.exec(L.label);if(B!==null&&B[2]===o&&Number(B[3]??22)===p)return L.name}}var Qr='<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 1.8l5.4 3.1v6.2L8 14.2 2.6 11.1V4.9z"/><path d="M2.6 4.9L8 8l5.4-3.1"/><path d="M8 8v6.2"/></svg>',qo='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 1.8l5.4 3.1v6.2L8 14.2 2.6 11.1V4.9z"/><path d="M2.6 4.9L8 8l5.4-3.1"/><path d="M8 8v6.2"/></svg>',tt='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.2 8a5.2 5.2 0 1 1-1.5-3.7"/><path d="M13.4 2.2v2.6h-2.6"/></svg>',Be='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M4.5 4.5l7 7"/><path d="M11.5 4.5l-7 7"/></svg>',Xo='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 3.4l7.4 4.6L5 12.6z"/></svg>',Yo='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4.2" y="4.2" width="7.6" height="7.6" rx="1.2"/></svg>',$o='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.2 8a5.2 5.2 0 1 1-1.5-3.7"/><path d="M13.4 2.2v2.6h-2.6"/></svg>',gn='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4.6h10"/><path d="M6.2 4.6V3.4a.8.8 0 0 1 .8-.8h2a.8.8 0 0 1 .8.8v1.2"/><path d="M4.6 4.6l.6 8a.9.9 0 0 0 .9.8h3.8a.9.9 0 0 0 .9-.8l.6-8"/></svg>';var Zo='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3v7.2"/><path d="M5 7.4L8 10.4l3-3"/><path d="M3.4 12.8h9.2"/></svg>',Qo='<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2.6l5.8 10.4H2.2z"/><path d="M8 6.4v3.2"/><path d="M8 11.6h.01"/></svg>',ea='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5l3.5 3L3 11"/><path d="M8.5 11H13"/></svg>',ta='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M3 4.5h10"/><path d="M3 8h10"/><path d="M3 11.5h6"/></svg>',ei='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M3.5 12.5v-4"/><path d="M7 12.5v-8"/><path d="M10.5 12.5v-5"/><path d="M13 12.5v-2"/></svg>',nt='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.5 8h-9"/><path d="M7 4.5L3.5 8 7 11.5"/></svg>',Vn='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6.5L8 10.5l4-4"/></svg>',ti='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2.6v6.4"/><path d="M5.3 6.5L8 9.2l2.7-2.7"/><path d="M3 11.4v1.2a.8.8 0 0 0 .8.8h8.4a.8.8 0 0 0 .8-.8v-1.2"/></svg>',ni='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="3.5" width="11" height="9" rx="1.2"/><path d="M2.5 10.2L5.6 7.6l2.4 2 2.1-1.7 3.4 2.9"/><path d="M6 6.2h.01"/></svg>',Kn='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.4 12.6h9.2"/><path d="M5.2 9.6l3.1-3.1"/><path d="M8.4 3.6l2.4 2.4"/><path d="M10.6 6.2l1.8 1.8-3.2 1.2-1.2 3.2-1.8-1.8z"/></svg>',na='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.4 5.9L8 2.8l5.6 3.1L8 9z"/><path d="M2.4 8.4L8 11.5l5.6-3.1"/><path d="M2.4 10.9L8 14l5.6-3.1"/></svg>';var ri='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="3.2" r="1.7"/><circle cx="3.4" cy="12.2" r="1.7"/><circle cx="12.6" cy="12.2" r="1.7"/><path d="M6.7 4.6L4.5 10.6"/><path d="M9.3 4.6l2.2 6"/><path d="M5.1 12.2h5.8"/></svg>',ai='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="8" cy="4.2" rx="4.6" ry="1.9"/><path d="M3.4 4.2v7.6c0 1 2.1 1.9 4.6 1.9s4.6-.9 4.6-1.9V4.2"/><path d="M3.4 8c0 1 2.1 1.9 4.6 1.9s4.6-.9 4.6-1.9"/></svg>',ya=6,pn=8,Jn=6;function oi(l){return(De!==null&&Array.isArray(De.targets)?De.targets:[]).some(e=>e.name===l&&e.kind==="ssh")}function ra(l,h=!1){let e=h===!0?Jn:pn;return l>e?{canRun:!1,hint:"\u6700\u591A "+String(e)+" \u4E2A\u5BB9\u5668"+(h===!0?"\uFF08SSH \u76EE\u6807\u4E0A\u4E00\u6761\u8FDE\u63A5\u8981\u540C\u65F6\u88C5\u5B9E\u65F6\u6D41\u4E0E\u5237\u65B0\u7B49\u77ED\u547D\u4EE4\uFF09":"\uFF0C\u6D4F\u89C8\u5668\u5E76\u53D1\u957F\u8FDE\u63A5\u6709\u9650\u5236")}:l>ya?{canRun:!0,hint:"\u8FDE\u63A5\u6570\u8F83\u591A\uFF0C\u6D4F\u89C8\u5668\u5E76\u53D1\u957F\u8FDE\u63A5\u6709\u9650\u5236"}:l<2?{canRun:!1,hint:l===0?"":"\u81F3\u5C11\u9009\u62E9 2 \u4E2A\u5BB9\u5668"}:{canRun:!0,hint:""}}function aa(l,h){return l.includes(h)?l.filter(e=>e!==h):[...l,h]}function oa(l,h){let e=new Set(h.map(O=>O.id)),o=l.filter(O=>e.has(O));return o.length===l.length?l:o}var xa=[{key:"all",label:"\u5168\u90E8\u53EF\u89C1",needsBase:!1},{key:"unhealthy",label:"\u4E0D\u5065\u5EB7",needsBase:!1},{key:"abnormal",label:"\u9700\u5173\u6CE8",needsBase:!1},{key:"stopped",label:"\u5DF2\u505C\u6B62",needsBase:!1},{key:"sameImage",label:"\u540C\u955C\u50CF",needsBase:!0},{key:"sameProject",label:"\u540C\u9879\u76EE",needsBase:!0}],ii=l=>l==="running"||l==="paused"||l==="restarting";function wa(l,h){switch(l){case"all":return()=>!0;case"unhealthy":return e=>e.health==="unhealthy";case"abnormal":return e=>Zn(e).length>0;case"stopped":return e=>!ii(e.state);case"sameImage":return e=>h!==null&&e.image===h.image;case"sameProject":return e=>h!==null&&h.composeProject!==null&&e.composeProject===h.composeProject;default:return()=>!1}}function ia(l,h,e,o,O){let p=wa(e,o),L=Math.max(O-h.length,0),B=l.filter(rt=>!h.includes(rt.id)&&p(rt)),se=B.slice(0,L);return{ids:h.concat(se.map(rt=>rt.id)),added:se.length,skipped:B.length-se.length}}function la(l,h,e,o){let O=Math.max(o-h.length,0);return xa.filter(p=>!p.needsBase||e!==null).map(p=>{let L=wa(p.key,e),B=l.filter(se=>!h.includes(se.id)&&L(se)).length;return{key:p.key,label:p.label,count:Math.min(B,O),over:Math.max(B-O,0)}})}function sa(l,h){let e=new Map(l.map(o=>[o.id,o]));return h.map(o=>e.get(o)).filter(o=>o!==void 0)}function da(){let l=0;return{next(){return l+=1,l},isCurrent(h){return h===l}}}var Un=120,Na=[["oom","\u88AB OOM \u6740",0],["dead","\u50F5\u6B7B",1],["unhealthy","\u4E0D\u5065\u5EB7",2],["restarting","\u53CD\u590D\u91CD\u542F",3],["exit-nonzero","\u975E\u96F6\u9000\u51FA",4]],li=l=>{let h=Na.find(([e])=>e===l);return h===void 0?l:h[1]},si=l=>{let h=Na.find(([e])=>e===l);return h===void 0?9:h[2]};function Zn(l){let h=[];return l.health==="unhealthy"&&h.push("unhealthy"),l.state==="restarting"&&h.push("restarting"),l.state==="dead"&&h.push("dead"),l.state==="exited"&&typeof l.exitCode=="number"&&l.exitCode!==0&&h.push("exit-nonzero"),h}function di(l){let h=p=>{if(typeof p!="string"||p==="")return"";let L=Date.parse(p);return Number.isFinite(L)?new Date(L).toLocaleString():""},e=["\u6253\u5F00\u5BB9\u5668\u8BE6\u60C5"],o=h(l.finishedAt),O=h(l.startedAt);return o!==""?e.push("\u7ED3\u675F\u4E8E "+o):O!==""&&e.push("\u542F\u52A8\u4E8E "+O),typeof l.restartCount=="number"&&e.push("\u91CD\u542F\u6B21\u6570 "+String(l.restartCount)),typeof l.exitCode=="number"&&e.push("\u9000\u51FA\u7801 "+String(l.exitCode)),e.join(" \xB7 ")}function qn(l){return l.filter(h=>Zn(h).length>0)}function Sa(l){let h=0,e=0,o=0;for(let O of l)O.state==="running"||O.state==="paused"||O.state==="restarting"?h+=1:e+=1,O.health==="unhealthy"&&(o+=1);return{running:h,stopped:e,unhealthy:o}}function Ca(l){let h=e=>{let o=Array.isArray(e.reasons)?e.reasons:[];return o.length===0?e.item.health==="unhealthy"?2:3:Math.min(...o.map(si))};return l.slice().sort((e,o)=>{let O=h(e)-h(o);return O!==0?O:e.targetIndex!==o.targetIndex?e.targetIndex-o.targetIndex:e.item.name===o.item.name?0:e.item.name<o.item.name?-1:1})}function Ta(l){let h=String(l??"").split(`
`)[0].trim();return h===""?"\u672A\u77E5\u9519\u8BEF":h.length>Un?h.slice(0,Un)+"\u2026":h}function Tt(l,h,e){let o=!1,O=l.map(p=>p.name!==h?p:(o=!0,{...p,...e}));return o?O:l}function ca(l){let h=l.map(o=>{let O=Sa(o.containers),p=qn(o.containers),L=Array.isArray(o.attention)?o.attention.length:null;return{name:o.name,kind:o.kind==="ssh"?"ssh":"local",label:typeof o.label=="string"?o.label:"",error:o.error===""?"":Ta(o.error),loaded:o.loaded===!0,running:O.running,stopped:O.stopped,unhealthy:O.unhealthy,attention:L===null?p.length:L,attentionApprox:L===null}}),e=[];return l.forEach((o,O)=>{if(Array.isArray(o.attention)){for(let p of o.attention)e.push({target:o.name,targetIndex:O,item:p,reasons:Array.isArray(p.reasons)?p.reasons:[]});return}for(let p of qn(o.containers))e.push({target:o.name,targetIndex:O,item:p,reasons:Zn(p)})}),{cards:h,rows:Ca(e),unreachable:h.filter(o=>o.error!==""),loading:l.some(o=>o.loaded!==!0)}}var ua=50,ka=8,ga=500;function ha(l,h,e){let o=[h,...l];return o.length>e?o.slice(0,e):o}function pa(l){if(typeof l!="number"||!Number.isFinite(l))return"--:--:--";let h=new Date(l*1e3);if(Number.isNaN(h.getTime()))return"--:--:--";let e=o=>String(o).padStart(2,"0");return e(h.getHours())+":"+e(h.getMinutes())+":"+e(h.getSeconds())}function ma(l){let h=typeof l.action=="string"?l.action:"";return h===""?"?":h.indexOf("die")!==0||l.exitCode===null||l.exitCode===void 0?h:h+"("+String(l.exitCode)+")"}function fa(l,h){let e=null;return{schedule(){e!==null&&clearTimeout(e),e=setTimeout(()=>{e=null,h()},l)},cancel(){e!==null&&(clearTimeout(e),e=null)}}}window.__ModuleLoader__.load({id:"@hyzyn/dsh-docker",factory:l=>{let h=l("react"),{jsx:e,jsxs:o}=l("react/jsx-runtime"),{createRoot:O}=l("react-dom/client"),{useState:p,useEffect:L,useRef:B,useCallback:se}=h;function rt(t,n,a){if(n==="")return t;let r=t.toLowerCase(),u=n.toLowerCase(),d=[],s=0,c=r.indexOf(u),k=0;for(;c>=0&&k<500;)c>s&&d.push(t.slice(s,c)),d.push(e("mark",{children:t.slice(c,c+u.length)},a+"-m"+String(k))),s=c+u.length,k+=1,c=r.indexOf(u,s);return s<t.length&&d.push(t.slice(s)),d}function Qn(t){let n=Array.isArray(t.rows)?t.rows:[],a=Array.isArray(t.mono)?t.mono:[];return o("div",{className:"dk_kv",children:n.flatMap(([r,u],d)=>[e("div",{className:"dk_kvKey",children:r},"k"+String(d)),e("div",{className:"dk_kvVal"+(a.indexOf(r)>=0?" dk_kvValMono":""),children:u},"v"+String(d))])})}function st(t){let n=t.health==="unhealthy"?"unhealthy":t.state,a=t.health==="unhealthy"?"\u4E0D\u5065\u5EB7":Jo(t.state);return e("span",{className:"dk_badge","data-state":n,title:t.status??"",children:a})}function Y(t){return o("div",{className:"dk_banner","data-kind":t.kind??"error",children:[e("span",{className:"dk_bannerIcon",dangerouslySetInnerHTML:{__html:Qo}},"icon"),o("div",{className:"dk_bannerBody",children:[e("div",{children:t.title}),t.hint===void 0?null:e("div",{className:"dk_hint",style:{marginTop:4},children:t.hint})]},"body"),t.action===void 0?null:e("div",{className:"dk_bannerAction",children:t.action},"action")]})}function Lt(t,n,a){return o("span",{className:"dk_ovCount","data-state":t,"data-zero":a===0?"1":void 0,children:[e("span",{className:"dk_ovCountValue",children:String(a)}),e("span",{className:"dk_ovCountLabel",children:n})]},t)}function er(t,n){if(t.cards.length===0)return o("div",{className:"dk_empty",children:[e("div",{className:"dk_emptyTitle",children:"\u8FD8\u6CA1\u6709\u914D\u7F6E Docker \u76EE\u6807"}),e("div",{className:"dk_emptyHint",children:"\u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6DFB\u52A0\u76EE\u6807\u540E\uFF0C\u603B\u89C8\u4F1A\u5728\u8FD9\u91CC\u4E00\u5C4F\u6C47\u603B\u5168\u90E8\u4E3B\u673A\u3002"})]});let a=t.rows.length===0?t.loading?o("div",{className:"dk_empty dk_ovEmpty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]},"loading"):o("div",{className:"dk_empty dk_ovEmpty",children:[e("div",{className:"dk_emptyTitle",children:"\u4E00\u5207\u6B63\u5E38"}),e("div",{className:"dk_emptyHint",children:"\u6240\u6709\u76EE\u6807\u4E0A\u90FD\u6CA1\u6709\u9700\u8981\u5173\u6CE8\u7684\u5BB9\u5668\uFF08\u4E0D\u5065\u5EB7 / \u53CD\u590D\u91CD\u542F / \u88AB OOM \u6740 / \u975E\u96F6\u9000\u51FA / \u50F5\u6B7B\uFF09\u3002"})]},"empty"):e("div",{className:"dk_tableWrap",children:o("table",{className:"dk_images dk_ovTable",children:[e("thead",{children:o("tr",{children:[e("th",{children:"\u5BB9\u5668\u540D"}),e("th",{children:"\u76EE\u6807"}),e("th",{children:"\u72B6\u6001"}),e("th",{children:"\u539F\u56E0"}),e("th",{children:"\u955C\u50CF"})]})}),e("tbody",{children:t.rows.map(r=>o("tr",{className:"dk_rowClickable",title:di(r.item),onClick:()=>n.onOpenContainer(r.target,r.item),children:[e("td",{className:"dk_mono",title:r.item.name,children:r.item.name}),e("td",{children:r.target}),e("td",{children:e(st,{state:r.item.state,health:r.item.health,status:r.item.status})}),e("td",{children:e("span",{className:"dk_reasons",children:(r.reasons??[]).map(u=>e("span",{className:"dk_reason","data-reason":u,children:li(u)},u))})}),e("td",{className:"dk_mono dk_pathCell",title:r.item.image,children:r.item.image})]},r.target+"\0"+r.item.id))})]})},0);return o("div",{className:"dk_imagesView dk_ovView",children:[t.unreachable.length===0?null:e(Y,{title:String(t.unreachable.length)+" \u4E2A\u76EE\u6807\u4E0D\u53EF\u8FBE",hint:t.unreachable.map(r=>r.name+"\uFF1A"+r.error).join("\uFF1B")+"\uFF08\u5176\u4F59\u76EE\u6807\u7684\u6B63\u5E38\u7ED3\u679C\u4E0D\u53D7\u5F71\u54CD\uFF09"},"unreachable"),e("div",{className:"dk_ovCards",children:t.cards.map(r=>o("button",{type:"button",className:"dk_ovCard","data-state":r.error!==""?"error":r.loaded===!0?"ok":"loading",title:r.error===""?"\u5207\u5230\u8BE5\u76EE\u6807\u7684\u5BB9\u5668\u5217\u8868":r.error,onClick:()=>n.onOpenTarget(r.name),children:[o("div",{className:"dk_ovCardHead",children:[e("span",{className:"dk_ovCardName",title:r.label===""?r.name:r.label,children:r.name}),e("span",{className:"dk_badge","data-state":"paused",children:r.kind==="local"?"\u672C\u673A":"SSH"})]},"head"),r.error===""?r.loaded===!0?o("div",{className:"dk_ovCardCounts",children:[Lt("running","\u8FD0\u884C\u4E2D",r.running),Lt("stopped","\u5DF2\u505C\u6B62",r.stopped),Lt("unhealthy","\u4E0D\u5065\u5EB7",r.unhealthy),Lt("attention",r.attentionApprox?"\u9700\u5173\u6CE8\uFF08\u7C97\u5224\uFF09":"\u9700\u5173\u6CE8",r.attention)]},"counts"):o("div",{className:"dk_ovCardLoading",children:[e("span",{className:"dk_spin"}),e("span",{children:"\u8BFB\u53D6\u4E2D\u2026"})]},"loading"):o("div",{className:"dk_ovCardError",children:[e("span",{className:"dk_badge","data-state":"dead",children:"\u4E0D\u53EF\u8FBE"}),e("span",{className:"dk_ovCardErrorText",title:r.error,children:r.error})]},"error")]},r.name))},1),e("div",{className:"dk_ovSection",children:t.rows.length===0?"\u9700\u5173\u6CE8\u5BB9\u5668":"\u9700\u5173\u6CE8\u5BB9\u5668\uFF08"+String(t.rows.length)+"\uFF09"},2),a]})}function dt(t){let n=t.busy===!0;return o("div",{className:"dk_confirmBackdrop",onMouseDown:a=>a.stopPropagation(),children:[o("div",{className:"dk_confirm","data-busy":n?"1":void 0,children:[e("div",{className:"dk_confirmTitle",children:t.title}),e("div",{className:"dk_confirmText",children:t.text}),o("div",{className:"dk_confirmActions",children:[e("button",{type:"button",className:"dk_btn",disabled:n,onClick:t.onCancel,children:"\u53D6\u6D88"}),e("button",{type:"button",className:"dk_btn dk_btnDanger",disabled:n,"aria-busy":n?"true":void 0,onClick:t.onConfirm,children:n?o("span",{className:"dk_confirmBusy",children:[e("span",{className:"dk_spin"}),"\u6267\u884C\u4E2D\u2026"]}):t.confirmLabel})]})]})]})}function ci(t){return e("button",{type:"button",className:"dk_btn"+(t.danger===!0?" dk_btnDanger":""),disabled:t.disabled===!0,title:t.title??"",onClick:n=>{n.stopPropagation(),t.onClick()},children:t.children})}let tr=60;function nr(t,n,a){let r=t.concat([n]);return r.length>a?r.slice(r.length-a):r}function rr(t){let n=Array.isArray(t.values)?t.values:[],a=n.filter(g=>typeof g=="number"&&Number.isFinite(g)),r=96,u=22,d=Math.max(Number(t.max)||0,...a,1),s=n.length>1?r/(n.length-1):0,c=[];n.forEach((g,b)=>{if(typeof g!="number"||!Number.isFinite(g))return;let w=s===0?r:b*s,I=u-Math.min(1,Math.max(0,g/d))*u;c.push(w.toFixed(1)+","+I.toFixed(1))});let k=a.length===0?null:a[a.length-1],v=t.alertAt!==void 0&&k!==null&&k>=t.alertAt;return e("span",{className:"dk_spark","data-alert":v?"1":void 0,title:t.title??"",children:c.length<2?e("span",{className:"dk_sparkEmpty",children:"\u91C7\u6837\u4E2D\u2026"}):e("svg",{viewBox:"0 0 "+String(r)+" "+String(u),preserveAspectRatio:"none","aria-hidden":"true",children:e("polyline",{points:c.join(" "),fill:"none",stroke:"currentColor","stroke-width":"1.4","stroke-linejoin":"round","stroke-linecap":"round","vector-effect":"non-scaling-stroke"})})})}function ct(t){return o("div",{className:"dk_cardRow",children:[e("span",{className:"dk_cardLabel",children:t.label}),e("span",{className:"dk_cardValue",title:String(t.value),children:t.value})]})}function $(t){let n=t.disabled===!0,a=t.busy===!0;return e("button",{type:"button",className:"dk_iconBtn"+(t.danger===!0?" dk_iconBtnDanger":""),"data-on":t.on===!0?"1":void 0,"data-spin":t.spin===!0?"1":void 0,"data-busy":a?"1":void 0,"aria-busy":a?"true":void 0,disabled:n,title:t.title,"aria-label":t.title,onClick:r=>{r.stopPropagation(),!n&&t.onClick()},children:a?e("span",{className:"dk_spin"}):e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:t.icon}})})}function La(t){let n=t.item,a=t.pickMode===!0,r=t.picked===!0,u=t.allowMutations!==!0,d=n.state==="running"||n.state==="paused"||n.state==="restarting",s=n.createdAt===null?n.runningFor===""?"\u2014":n.runningFor:Ct(n.createdAt),c=typeof t.pending=="string"?t.pending:"",k=c!=="",v=b=>k?"\u6B63\u5728\u6267\u884C "+c+"\u2026\u8BF7\u7A0D\u5019":u?"\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D":b,g=()=>{if(a){t.onTogglePick(n);return}t.onOpen(n,"overview")};return o("div",{className:"dk_card",role:a?"checkbox":"button","aria-checked":a?r?"true":"false":void 0,tabIndex:0,"data-selected":t.selected===!0?"1":"0","data-pick":a?"1":void 0,"data-picked":r?"1":void 0,"data-pending":k?"1":void 0,onClick:g,onKeyDown:b=>{(b.key==="Enter"||b.key===" ")&&(b.preventDefault(),g())},children:[o("div",{className:"dk_cardHead",children:[a?e("span",{className:"dk_pick","data-on":r?"1":"0","aria-hidden":"true"},"pick"):null,e("span",{className:"dk_cardName",title:n.name,children:n.name}),e(st,{state:n.state,health:n.health,status:n.status})]},"head"),o("div",{className:"dk_cardRows",children:[e(ct,{label:"\u955C\u50CF",value:n.image},"image"),e(ct,{label:"ID",value:n.shortId},"id"),e(ct,{label:"\u7AEF\u53E3",value:cn(n.ports)},"ports"),e(ct,{label:"\u521B\u5EFA",value:s},"created"),n.composeProject===null?null:e(ct,{label:"compose",value:n.composeProject+(n.composeService===null?"":"/"+n.composeService)},"compose")]},"rows"),a?null:o("div",{className:"dk_actionBar",children:[e($,{icon:ea,title:"\u5728\u5BB9\u5668\u5185\u6253\u5F00\u4EA4\u4E92\u5F0F\u7EC8\u7AEF\uFF08docker exec -it "+n.name+" sh\uFF09",onClick:()=>t.onExec(n)},"exec"),e($,{icon:ta,title:"\u67E5\u770B\u65E5\u5FD7",onClick:()=>t.onOpen(n,"logs")},"logs"),e($,{icon:ei,title:"\u8D44\u6E90\u5360\u7528",onClick:()=>t.onOpen(n,"stats")},"stats"),e("span",{className:"dk_actionBarSep","aria-hidden":"true"},"sep"),e($,{icon:d?Yo:Xo,title:v(d?"\u505C\u6B62\u5BB9\u5668":"\u542F\u52A8\u5BB9\u5668"),disabled:u||k,busy:c===(d?"stop":"start"),onClick:()=>t.onAction(d?"stop":"start",n)},"power"),e($,{icon:$o,title:v("\u91CD\u542F\u5BB9\u5668"),disabled:u||k,busy:c==="restart",onClick:()=>t.onAction("restart",n)},"restart"),e($,{icon:gn,danger:!0,title:v("\u5220\u9664\u5BB9\u5668\uFF08\u4E0D\u53EF\u6062\u590D\uFF09"),disabled:u||k,busy:c==="remove",onClick:()=>t.onAction("remove",n)},"remove")]},"actions")]})}let Ea=/^\s*(\[\d{4}-\d{2}-\d{2}[ T][0-9:.,]+\]|\d{2}:\d{2}:\d{2}[,.]\d{3})/,ar=/^\s*(\[(?:TRACE|DEBUG|INFO|WARN|ERROR|FATAL)\]|\|\s*(?:TRACE|DEBUG|INFO|WARN|ERROR|FATAL))/,or=/(TRACE|DEBUG|INFO|WARN|ERROR|FATAL)/,ut=2e3,Oe=5e3;function ir(t,n,a){let r=[],u=t;for(let d=0;d<2;d+=1){let s=Ea.exec(u);if(s!==null){r.push(e("span",{className:"dk_logTs",children:s[1]},"ts"+String(d))),u=u.slice(s[0].length);continue}let c=ar.exec(u);if(c!==null){let k=or.exec(c[1]);r.push(e("span",{className:"dk_logLevel","data-level":k===null?"":k[1],children:c[1].trim()},"lv"+String(d))),u=u.slice(c[0].length);continue}break}return r.push(e("span",{className:"dk_logText",children:rt(u,a,"x"+String(n))},"tx")),r}function Ia(t,n,a){return o("div",{className:"dk_logLine",children:ir(t,n,a)},String(n))}function Oa(t,n,a,r){let u=r===!0&&typeof t.ts=="number"&&Number.isFinite(t.ts)?e("span",{className:"dk_logTs",children:new Date(t.ts).toLocaleTimeString()},"ts"):null;return o("div",{className:"dk_logLine","data-log-ts":typeof t.ts=="number"&&Number.isFinite(t.ts)?String(t.ts):void 0,children:[e("span",{className:"dk_logSvc",children:"["+t.service+"]"},"svc"),u,...ir(t.text,n,a)]},String(n))}let ve=null,vn=20,lr=400;function sr(){if(ve===null)return{ok:!1,reason:"\u5BBF\u4E3B\u672A\u63D0\u4F9B sessions \u670D\u52A1"};let t;try{t=ve.list?.getSnapshot?.()?.current}catch(n){return{ok:!1,reason:n instanceof Error?n.message:String(n)}}if(typeof t!="string"||t==="")return{ok:!1,reason:"\u5F53\u524D\u6CA1\u6709\u6253\u5F00\u7684\u4F1A\u8BDD"};try{let n=ve.scope(t);if(n===void 0)return{ok:!1,reason:"\u4F1A\u8BDD\u5C1A\u672A\u5C31\u7EEA\uFF08\u4F5C\u7528\u57DF\u672A\u6302\u8F7D\uFF09"};let a=n.get?.("conversation")??n.conversation??null;return a===null?{ok:!1,reason:"\u5BBF\u4E3B\u7F3A\u5C11 conversation \u670D\u52A1"}:{ok:!0,id:t,actx:n,conversation:a}}catch(n){return{ok:!1,reason:n instanceof Error?n.message:String(n)}}}function Et(t){let n=t.querySelector(".dk_logSvc"),a=t.querySelector(".dk_logLevel"),r=t.querySelector(".dk_logText"),u=r===null?t.textContent??"":r.textContent??"",d=Number(t.dataset.logTs);if((!Number.isFinite(d)||d<=0)&&(d=null),d===null){let s=gr.exec(u);if(s!==null){let c=Date.parse(s[1]);Number.isFinite(c)&&(d=c,u=u.slice(s[0].length))}}return{svc:n===null?"":n.textContent.replace(/^\[|\]$/g,""),lv:a===null?"":a.textContent.trim(),ts:d,text:u}}function Ra(t){let n=[];return t.svc!==""&&n.push("["+t.svc+"]"),t.ts!==null&&n.push(new Date(t.ts).toISOString()),t.lv!==""&&n.push(t.lv),n.length===0?t.text:n.join(" ")+" "+t.text}function Ma(t){return Array.from(t.querySelectorAll(".dk_logLine")).filter(n=>n.querySelector(".dk_logText")!==null)}function It(t){let n=t==null?null:t.nodeType===Node.ELEMENT_NODE?t:t.parentElement;return n===null?null:n.closest(".dk_logLine")}function Aa(t,n){let a=Ma(t);if(a.length===0)return null;let r=null,u=null;try{let c=window.getSelection();if(c!==null&&c.isCollapsed===!1&&c.rangeCount>0){let k=c.getRangeAt(0);t.contains(k.commonAncestorContainer)&&(r=It(k.startContainer),u=It(k.endContainer))}}catch{}(r===null||u===null)&&(r=It(n.target),u=r);let d=a.indexOf(r),s=a.indexOf(u);if((d<0||s<0)&&(r=It(n.target),d=a.indexOf(r),s=d),d<0)return null;if(d>s){let c=d;d=s,s=c}return{rows:a,from:d,to:s}}function Ba(t,n){let a=String(n.to-n.from+1);if(t.containers.length===1)return a+" \u884C \xB7 "+t.containers[0].name;let r=new Set;for(let u=n.from;u<=n.to;u+=1){let d=Et(n.rows[u]).svc;d!==""&&r.add(d)}return r.size===0?a+" \u884C":a+" \u884C \xB7 "+[...r].slice(0,3).join("/")}function Da(t,n){let a=n.rows,r=[];for(let b=n.from;b<=n.to&&r.length<lr;b+=1)r.push(Et(a[b]));let u=a.slice(Math.max(0,n.from-vn),n.from).map(Et),d=a.slice(n.to+1,Math.min(a.length,n.to+1+vn)).map(Et),s=r.concat(u,d).map(b=>b.ts).filter(b=>b!==null),c=[...new Set(r.map(b=>b.svc).filter(b=>b!==""))],k=r.length<n.to-n.from+1,v=[];v.push("[dsh-docker] \u5BB9\u5668\u65E5\u5FD7\u7247\u6BB5"),v.push(""),v.push("- \u76EE\u6807\uFF1A"+(t.targetLabel!==""?t.targetLabel:t.target!==""?t.target:"\u672A\u77E5"));for(let b of t.containers.slice(0,3))v.push("- \u5BB9\u5668\uFF1A"+b.name+"\uFF08"+String(b.id)+(b.image===void 0||b.image===""?"":"\uFF0C\u955C\u50CF "+String(b.image))+"\uFF09");t.containers.length>3&&v.push("- \u5BB9\u5668\uFF1A\u53E6\u6709 "+String(t.containers.length-3)+" \u4E2A\uFF0C\u89C1\u5404\u884C\u7684 [service] \u524D\u7F00"),c.length>0&&v.push("- \u6D89\u53CA\u670D\u52A1\uFF1A"+c.join("\u3001")),v.push("- \u65F6\u95F4\u7A97\uFF1A"+(s.length===0?"\u672A\u542F\u7528\u65F6\u95F4\u6233\uFF0C\u65E0\u65F6\u95F4\u7A97":new Date(Math.min(...s)).toISOString()+" \u2192 "+new Date(Math.max(...s)).toISOString())),v.push("- \u9009\u4E2D\uFF1A"+String(r.length)+" \u884C"+(k?"\uFF08\u5DF2\u622A\u65AD\uFF0C\u4E0A\u9650 "+String(lr)+" \u884C\uFF09":"")+"\uFF0C\u53E6\u9644\u524D\u540E\u5404 "+String(vn)+" \u884C\u4E0A\u4E0B\u6587"+(t.filtered===!0?"\uFF08\u4E0A\u4E0B\u6587\u53D6\u81EA\u5F53\u524D\u8FC7\u6EE4\u540E\u7684\u89C6\u56FE\uFF09":""));let g=(b,w)=>{if(w.length!==0){v.push(""),v.push("--- "+b+" ---");for(let I of w)v.push(Ra(I))}};return g("\u4E0A\u4E0B\u6587\uFF08\u524D "+String(u.length)+" \u884C\uFF09",u),g("\u9009\u4E2D\uFF08"+String(r.length)+" \u884C\uFF09",r),g("\u4E0A\u4E0B\u6587\uFF08\u540E "+String(d.length)+" \u884C\uFF09",d),v.push(""),v.push("\u9700\u8981\u66F4\u591A\u4E0A\u4E0B\u6587\u8BF7\u81EA\u884C\u62C9\u53D6\uFF0C\u4E0D\u8981\u81C6\u6D4B\u672A\u7ED9\u51FA\u7684\u5185\u5BB9\uFF1A`docker_logs` / `docker_inspect`\uFF0Ctarget="+JSON.stringify(t.target)+(t.containers.length===1?"\uFF0Cid="+JSON.stringify(t.containers[0].name):"")+"\u3002"),v.join(`
`)}let Ot=null,Rt=null,Mt=null,At=null;function kt(){Rt!==null&&(Rt(),Rt=null),Ot!==null&&(Ot.remove(),Ot=null)}function Bt(){At!==null&&(At(),At=null),Mt!==null&&(Mt.remove(),Mt=null)}function Pa(t,n,a){let u=t.getBoundingClientRect(),d=n,s=a;d+u.width>window.innerWidth-8&&(d=Math.max(8,n-u.width)),s+u.height>window.innerHeight-8&&(s=Math.max(8,a-u.height)),t.style.left=String(Math.round(d))+"px",t.style.top=String(Math.round(s))+"px"}function Dt(t,n="error"){let a=document.createElement("div");a.className="dk_askToast",a.dataset.kind=n,a.textContent=t,document.body.appendChild(a),setTimeout(()=>a.remove(),5e3)}let Pt="";function dr(t){t.ok!==!0&&Dt("\u672A\u80FD\u4EA4\u7ED9\u4F1A\u8BDD\uFF1A"+t.message)}function ja(t){kt();let n=document.createElement("div");n.className="dk_menu",n.setAttribute("role","menu");let a=document.createElement("div");a.className="dk_menuHead",a.textContent=t.head,n.appendChild(a);let r=document.createElement("div");r.className="dk_menuSub",r.textContent=t.sub,n.appendChild(r);for(let k of t.items){let v=document.createElement("button");v.type="button",v.className="dk_menuItem",v.setAttribute("role","menuitem"),v.disabled=k.disabled===!0,k.disabled===!0&&(v.title=k.reason);let g=document.createElement("span");g.className="dk_menuItemLabel",g.textContent=k.label,v.appendChild(g);let b=document.createElement("span");b.className="dk_menuItemHint",b.textContent=k.disabled===!0?k.reason:k.hint??"",v.appendChild(b),k.disabled!==!0&&v.addEventListener("click",()=>{kt(),k.onPick()}),n.appendChild(v)}let u=document.createElement("div");u.className="dk_menuNote",u.textContent=t.note,n.appendChild(u),document.body.appendChild(n),Pa(n,t.x,t.y),Ot=n;let d=k=>{k.key==="Escape"&&kt()},s=k=>{n.contains(k.target)||kt()},c=()=>kt();document.addEventListener("keydown",d,!0),document.addEventListener("mousedown",s,!0),document.addEventListener("wheel",c,{capture:!0,passive:!0}),document.addEventListener("touchmove",c,{capture:!0,passive:!0}),window.addEventListener("resize",c),Rt=()=>{document.removeEventListener("keydown",d,!0),document.removeEventListener("mousedown",s,!0),document.removeEventListener("wheel",c,!0),document.removeEventListener("touchmove",c,!0),window.removeEventListener("resize",c)}}function Ha(t){return navigator.clipboard!==void 0&&navigator.clipboard!==null?navigator.clipboard.writeText(t):new Promise((n,a)=>{let r=document.createElement("textarea");r.value=t,r.style.position="fixed",r.style.opacity="0",document.body.appendChild(r),r.select();let u=!1;try{u=document.execCommand("copy")}catch{u=!1}r.remove(),u?n():a(new Error("\u6D4F\u89C8\u5668\u62D2\u7EDD\u4E86\u590D\u5236"))})}function cr(t,n){try{let a=typeof t.conversation.input?.for=="function"?t.conversation.input.for(t.actx):null;a!==null&&typeof a.notify=="function"&&a.notify("info",n)}catch{}}async function jt(t,n){let a=sr();if(a.ok!==!0)return{ok:!1,message:a.reason};try{if(n==="draft"){let r=typeof a.conversation.input?.for=="function"?a.conversation.input.for(a.actx):null;return r===null||typeof r.setDraft!="function"?{ok:!1,message:"\u5BBF\u4E3B\u672A\u63D0\u4F9B\u4F1A\u8BDD\u8F93\u5165\u95E8\u9762\uFF0C\u65E0\u6CD5\u53EA\u586B\u8349\u7A3F"}:(r.setDraft(t),cr(a,"\u65E5\u5FD7\u7247\u6BB5\u5DF2\u586B\u5165\u8F93\u5165\u6846\uFF0C\u786E\u8BA4\u540E\u518D\u53D1\u9001"),Dt("\u5DF2\u586B\u5165\u5F53\u524D\u4F1A\u8BDD\u7684\u8F93\u5165\u6846"+Pt,"ok"),Cr(),{ok:!0,message:"\u5DF2\u586B\u5165\u8F93\u5165\u6846"})}return await a.conversation.send(t),cr(a,"\u65E5\u5FD7\u7247\u6BB5\u5DF2\u53D1\u9001\u5230\u4F1A\u8BDD"),Dt("\u5DF2\u53D1\u9001\u65E5\u5FD7\u7247\u6BB5\u5230\u5F53\u524D\u4F1A\u8BDD"+Pt,"ok"),Cr(),{ok:!0,message:"\u5DF2\u53D1\u9001"}}catch(r){return{ok:!1,message:r instanceof Error?r.message:String(r)}}}function za(t){Bt();let n=document.createElement("div");n.className="dk_askCard",n.setAttribute("role","dialog");let a=document.createElement("div");a.className="dk_askCardHead",a.textContent=t.head,n.appendChild(a);let r=document.createElement("textarea");r.className="dk_askCardText",r.spellcheck=!1,r.value=t.prompt,n.appendChild(r);let u=document.createElement("div");u.className="dk_askCardStatus",n.appendChild(u);let d=document.createElement("div");d.className="dk_askCardFoot";let s=(E,P,y)=>{let D=document.createElement("button");return D.type="button",D.className="dk_btn"+(P===void 0?"":" "+P),D.textContent=E,D.addEventListener("click",y),d.appendChild(D),D},c=s("\u53D1\u9001","dk_btnPrimary",()=>{b("send",c)}),k=s("\u53EA\u586B\u8F93\u5165\u6846",void 0,()=>{b("draft",k)});s("\u590D\u5236",void 0,()=>{Ha(r.value).then(()=>{u.textContent="\u5DF2\u590D\u5236\u8BCA\u65AD\u5305",u.dataset.kind="ok"},E=>{u.textContent="\u590D\u5236\u5931\u8D25\uFF1A"+(E instanceof Error?E.message:String(E)),u.dataset.kind="error"})});let v=s("\u53D6\u6D88",void 0,()=>Bt());n.appendChild(d);let g=document.createElement("div");g.className="dk_askCardHint",g.textContent="\u5185\u5BB9\u4F1A\u8FDB\u5165\u6A21\u578B\u4E0A\u4E0B\u6587\uFF0C\u8BF7\u7559\u610F\u5176\u4E2D\u7684\u51ED\u8BC1\u4E0E\u7528\u6237\u6570\u636E\u3002",n.appendChild(g);let b=async(E,P)=>{c.disabled=!0,k.disabled=!0,v.disabled=!0,P.textContent=E==="send"?"\u53D1\u9001\u4E2D\u2026":"\u5199\u5165\u4E2D\u2026";let y=await jt(r.value,E);if(y.ok===!0){Bt();return}u.textContent=y.message,u.dataset.kind="error",c.disabled=!1,k.disabled=!1,v.disabled=!1,P.textContent=E==="send"?"\u53D1\u9001":"\u53EA\u586B\u8F93\u5165\u6846"};document.body.appendChild(n);let w=n.getBoundingClientRect();n.style.left=String(Math.round(Math.max(8,(window.innerWidth-w.width)/2)))+"px",n.style.top=String(Math.round(Math.max(8,(window.innerHeight-w.height)/2)))+"px",r.focus(),Mt=n;let I=E=>{E.key==="Escape"&&Bt()};document.addEventListener("keydown",I,!0),At=()=>document.removeEventListener("keydown",I,!0)}function ur(t,n,a){let r=Aa(n,t);if(r===null)return;t.preventDefault();let u=sr(),d=()=>Da(a,r),s=u.ok!==!0,c=s?u.reason:"";ja({x:t.clientX,y:t.clientY,head:"\u95EE Agent",sub:Ba(a,r)+(s?" \xB7 "+c:" \xB7 \u5F53\u524D\u4F1A\u8BDD"),items:[{label:"\u9884\u89C8\u540E\u53D1\u9001\u2026",hint:"\u53EF\u6539\u5B8C\u518D\u53D1",disabled:s,reason:c,onPick:()=>za({head:"\u53D1\u9001\u65E5\u5FD7\u7247\u6BB5\u5230\u5F53\u524D\u4F1A\u8BDD",prompt:d()})},{label:"\u76F4\u63A5\u53D1\u9001\u5230\u5F53\u524D\u4F1A\u8BDD",hint:"\u7ACB\u5373\u5F00\u59CB\u5206\u6790",disabled:s,reason:c,onPick:()=>{jt(d(),"send").then(dr)}},{label:"\u53EA\u586B\u5165\u8F93\u5165\u6846",hint:"\u4E0D\u53D1\u9001",disabled:s,reason:c,onPick:()=>{jt(d(),"draft").then(dr)}},{label:"\u4F1A\u8BDD\u8BA2\u9605\u63A2\u9488\uFF08spike\uFF09",hint:"\u65B9\u6848 B \u8BFB\u6570",disabled:Ft===null,reason:"\u5BBF\u4E3B\u672A\u63D0\u4F9B\u53F3\u4FA7\u680F\u670D\u52A1\uFF08sidebarRight\uFF09",onPick:()=>{try{Ft?.openTab?.(xr)}catch(k){Dt("\u6253\u5F00\u63A2\u9488\u5931\u8D25\uFF1A"+(k instanceof Error?k.message:String(k)))}}}],note:"\u65E5\u5FD7\u5185\u5BB9\u4F1A\u8FDB\u5165\u6A21\u578B\u4E0A\u4E0B\u6587\uFF0C\u8BF7\u7559\u610F\u5176\u4E2D\u7684\u51ED\u8BC1\u3002"})}function Fa(t){let n=t.item,a=t.config,[r,u]=p(t.initialTab??"overview"),d=zt(),[s,c]=p(null),[k,v]=p(""),[g,b]=p({tail:a.logTailDefault,timestamps:!1}),[w,I]=p(null),[E,P]=p(""),[y,D]=p(!1),[R,H]=p(""),[T,ne]=p(!1),[f,_]=p(3),[x,z]=p(!1),[U,q]=p([]),[ae,ke]=p(""),[$e,me]=p(""),[Pe,_e]=p(""),[ze,We]=p(!1),[ge,Fe]=p(!0),A=B([]),oe=B(""),ee=B(null),[X,it]=p(null),[fe,Ne]=p(""),[ce,Le]=p(!1),[j,Z]=p(""),[re,Se]=p(""),[ye,be]=p({cpu:[],mem:[]}),Ve=B({cpu:[],mem:[]}),[Je,Tn]=p(""),[Ee,Wt]=p(null),[Jt,ft]=p(""),[vt,Ke]=p(!1);L(()=>{let N=!0;return c(null),v(""),Q.inspect(t.target,n.id).then(M=>{N&&c(M.details?.[0]??null)}).catch(M=>{N&&v(M.message)}),()=>{N=!1}},[t.target,n.id,t.refreshToken]);let he=se(()=>{D(!0),P(""),Q.logs(t.target,n.id,{tail:g.tail,timestamps:g.timestamps}).then(N=>I(N.logs)).catch(N=>P(N.message)).finally(()=>D(!1))},[t.target,n.id,g.tail,g.timestamps]);L(()=>{r==="logs"&&he()},[r,he,t.refreshToken]),L(()=>{if(r!=="logs"||!T||x)return;let N=setInterval(he,Math.max(1,f)*1e3);return()=>clearInterval(N)},[r,T,f,he,x]),L(()=>{if(!d||r!=="logs"||!x)return;if(typeof EventSource!="function"){me("\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301 EventSource\uFF0C\u65E0\u6CD5\u5B9E\u65F6\u8DDF\u968F"),z(!1);return}A.current=[],oe.current="",q([]),We(!1),me(""),_e(""),Fe(!0),ke("connecting");let N=new URLSearchParams({target:t.target,id:n.id,tail:String(g.tail),...g.timestamps?{timestamps:"1"}:{}}),M=new EventSource(Xn+"/logs/stream?"+N.toString()),S=!1,F=()=>{if(!S){S=!0;try{M.close()}catch{}}},V=K=>{if(K==="")return;let G=(oe.current+K).split(`
`);if(oe.current=G.pop()??"",G.length===0)return;let ue=A.current.concat(G),qe=ue.length>Oe?ue.slice(ue.length-Oe):ue;A.current=qe,qe.length!==ue.length&&We(!0),q(qe)},W=K=>{let G=null;try{G=JSON.parse(K.data)}catch{return}G===null||typeof G!="object"||(typeof G.d=="string"?V(G.d):typeof G.e=="string"&&V(G.e))},de=K=>{let G=null;try{G=JSON.parse(K.data)}catch{}let ue=G!==null&&typeof G.reason=="string"?G.reason:"container-exit",qe=G!==null&&typeof G.code=="number"?G.code:null;if(ue==="container-exit"){_e("\u5BB9\u5668\u5DF2\u9000\u51FA"+(qe===null?"":"\uFF08\u9000\u51FA\u7801 "+String(qe)+"\uFF09")+"\uFF0C\u65E5\u5FD7\u6D41\u7ED3\u675F\uFF0C\u5DF2\u5207\u56DE\u5FEB\u7167"),F(),z(!1),he();return}ke("reconnecting"),_e("\u670D\u52A1\u7AEF\u5DF2\u505C\u6B62\u65E5\u5FD7\u6D41\uFF0C\u6B63\u5728\u91CD\u8FDE\u2026")},J=K=>{if(typeof K.data=="string"&&K.data!==""){let G="\u65E5\u5FD7\u6D41\u5F02\u5E38";try{let ue=JSON.parse(K.data);ue!==null&&typeof ue.message=="string"&&(G=ue.message)}catch{}me(G),F(),z(!1),he();return}ke(M.readyState===2?"closed":"reconnecting")};return M.addEventListener("line",W),M.addEventListener("end",de),M.addEventListener("error",J),M.onopen=()=>{ke("open"),_e("")},F},[r,x,t.target,n.id,g.tail,g.timestamps,he]),L(()=>{if(r!=="logs"||!x||!ge)return;let N=ee.current;N!==null&&(N.scrollTop=N.scrollHeight)},[d,r,x,ge,U]);let Ut=()=>{if(x){z(!1),ke(""),he();return}z(!0),ne(!1),me(""),_e("")},Ln=()=>{if(ce){Le(!1),Z("");return}Le(!0),Se(""),Ne("")},bt=()=>j==="open"?"\u5B9E\u65F6\u8DDF\u968F\u4E2D\uFF08docker stats\uFF09":j==="connecting"?"\u6B63\u5728\u8FDE\u63A5\u7EDF\u8BA1\u6D41\u2026":j==="reconnecting"?"\u8FDE\u63A5\u4E2D\u65AD\uFF0C\u6B63\u5728\u81EA\u52A8\u91CD\u8FDE\u2026":j==="closed"?"\u7EDF\u8BA1\u6D41\u5DF2\u65AD\u5F00":"\u7EDF\u8BA1\u6D41",qt=()=>{let N=ee.current;N!==null&&(N.scrollTop=N.scrollHeight),Fe(!0)},Ue=N=>{if(!x)return;let M=N.currentTarget;Fe(M.scrollHeight-M.scrollTop-M.clientHeight<24)},je=()=>ae==="open"?"\u5B9E\u65F6\u8DDF\u968F\u4E2D\uFF08docker logs -f\uFF09":ae==="connecting"?"\u6B63\u5728\u8FDE\u63A5\u65E5\u5FD7\u6D41\u2026":ae==="reconnecting"?"\u8FDE\u63A5\u4E2D\u65AD\uFF0C\u6B63\u5728\u81EA\u52A8\u91CD\u8FDE\u2026":ae==="closed"?"\u65E5\u5FD7\u6D41\u5DF2\u65AD\u5F00":"\u65E5\u5FD7\u6D41";L(()=>{if(r!=="stats"||ce)return;let N=!0,M=()=>{Q.stats(t.target,[n.id]).then(F=>{N&&(it(F.stats?.[0]??null),Ne(""))}).catch(F=>{N&&Ne(F.message)})};M();let S=setInterval(M,Math.max(2,a.pollIntervalSec)*1e3);return()=>{N=!1,clearInterval(S)}},[r,ce,t.target,n.id,a.pollIntervalSec,t.refreshToken]),L(()=>{if(!d||r!=="stats"||!ce)return;if(typeof EventSource!="function"){Se("\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301 EventSource\uFF0C\u65E0\u6CD5\u5B9E\u65F6\u8DDF\u968F"),Le(!1);return}Ve.current={cpu:[],mem:[]},be({cpu:[],mem:[]}),Z("connecting"),Se(""),Ne("");let N=new EventSource(dn("/stats/stream",{target:t.target,ids:n.id})),M=!1,S=()=>{if(!M){M=!0;try{N.close()}catch{}}},F=de=>{let J=null;try{J=JSON.parse(de.data)}catch{return}if(J===null||typeof J!="object")return;let K=typeof J.cpuPercent=="number"?J.cpuPercent:null,G=typeof J.memPercent=="number"?J.memPercent:null;it(J),Ne("");let ue={cpu:K===null?Ve.current.cpu:nr(Ve.current.cpu,K,tr),mem:G===null?Ve.current.mem:nr(Ve.current.mem,G,tr)};Ve.current=ue,be(ue)},V=de=>{let J=null;try{J=JSON.parse(de.data)}catch{}let K=J!==null&&typeof J.reason=="string"?J.reason:"stats-exit",G=J!==null&&typeof J.code=="number"?J.code:null;Se("\u7EDF\u8BA1\u6D41\u5DF2\u7ED3\u675F"+(K==="stats-exit"?"\uFF08docker stats \u9000\u51FA"+(G===null?"":"\uFF0C\u9000\u51FA\u7801 "+String(G))+"\uFF09":"")+"\uFF0C\u5DF2\u5207\u56DE\u5FEB\u7167\u8F6E\u8BE2"),S(),Le(!1)},W=de=>{if(typeof de.data=="string"&&de.data!==""){let J="\u7EDF\u8BA1\u6D41\u5F02\u5E38";try{let K=JSON.parse(de.data);K!==null&&typeof K.message=="string"&&(J=K.message)}catch{}Ne(J),S(),Le(!1);return}Z(N.readyState===2?"closed":"reconnecting")};return N.addEventListener("stats",F),N.addEventListener("end",V),N.addEventListener("error",W),N.onopen=()=>{Z("open"),Se("")},S},[d,r,ce,t.target,n.id]);let Xt=()=>{Je.trim()!==""&&(Ke(!0),ft(""),Wt(null),Q.exec(t.target,n.id,Je,a.execTimeoutSec).then(N=>Wt(N.result)).catch(N=>ft(N.message)).finally(()=>Ke(!1)))},Yt=()=>{if(k!=="")return e(Y,{title:"\u8BFB\u53D6\u5BB9\u5668\u8BE6\u60C5\u5931\u8D25",hint:k});if(s===null)return e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]});let N=[["\u72B6\u6001",s.state+(s.health===null?"":" / "+s.health)+(s.status===""?"":"\uFF08"+s.status+"\uFF09")],["\u955C\u50CF",s.image],["\u5BB9\u5668 ID",s.shortId],["\u542F\u52A8\u65F6\u95F4",s.startedAt??"\u2014"],["\u7ED3\u675F\u65F6\u95F4",s.finishedAt??"\u2014"],["\u9000\u51FA\u7801",s.exitCode===null?"\u2014":String(s.exitCode)],["\u91CD\u542F\u6B21\u6570",s.restartCount===null?"\u2014":String(s.restartCount)],["\u91CD\u542F\u7B56\u7565",s.restartPolicy??"\u2014"],["PID",s.pid===null?"\u2014":String(s.pid)],["\u7AEF\u53E3",s.ports.length===0?"\u2014":cn(s.ports)],["\u6302\u8F7D",s.mounts.length===0?"\u2014":s.mounts.map(S=>S.source+"\u2192"+S.destination+(S.readWrite?"":"\uFF08\u53EA\u8BFB\uFF09")).join(`
`)],["\u7F51\u7EDC",s.networks.length===0?"\u2014":s.networks.map(S=>S.name+(S.ip===null?"":"\uFF08"+S.ip+"\uFF09")).join(", ")],["\u547D\u4EE4",(s.entrypoint+" "+s.command).trim()||"\u2014"],["\u5DE5\u4F5C\u76EE\u5F55",s.workingDir===""?"\u2014":s.workingDir],["\u7528\u6237",s.user===""?"\u2014":s.user]],M=o("div",{className:"dk_kv",children:N.flatMap(([S,F],V)=>[e("div",{className:"dk_kvKey",children:S},"k"+String(V)),e("div",{className:"dk_kvVal"+(S==="\u5BB9\u5668 ID"||S==="\u547D\u4EE4"||S==="\u955C\u50CF"?" dk_kvValMono":""),children:F},"v"+String(V))])});return o("div",{children:[s.healthLogTail===null?null:e("div",{className:"dk_hint",style:{marginBottom:8},children:"\u6700\u8FD1\u5065\u5EB7\u68C0\u67E5\u8F93\u51FA\uFF1A"+s.healthLogTail}),M,e("div",{className:"dk_cardSection",style:{marginTop:16},children:"\u4E00\u6B21\u6027\u547D\u4EE4\uFF08docker exec\uFF09"}),a.allowExec!==!0?e(Y,{kind:"info",title:"exec \u672A\u542F\u7528",hint:"\u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6253\u5F00\u300C\u5141\u8BB8 exec\u300D\uFF0C\u6216\u76F4\u63A5\u590D\u5236\u5361\u7247\u4E0A\u7684 exec \u547D\u4EE4\u5230\u7EC8\u7AEF\u9762\u677F\u4EA4\u4E92\u5F0F\u8FDB\u5165\u5BB9\u5668\u3002"}):o("div",{children:[o("div",{className:"dk_row",children:[e("input",{className:"dk_input",style:{flex:"1 1 auto"},placeholder:"\u5982 ls -la /app \u6216 cat /etc/nginx/nginx.conf",value:Je,onChange:S=>Tn(S.target.value),onKeyDown:S=>{S.key==="Enter"&&Xt()}}),e("button",{type:"button",className:"dk_btn dk_btnPrimary",disabled:vt,onClick:Xt,children:vt?"\u6267\u884C\u4E2D\u2026":"\u6267\u884C"})]}),Jt===""?null:e(Y,{title:"\u6267\u884C\u5931\u8D25",hint:Jt}),Ee===null?null:o("div",{style:{marginTop:8},children:[e("div",{className:"dk_hint",children:"\u9000\u51FA\u7801 "+(Ee.code===null?"?":String(Ee.code))+" \xB7 \u8017\u65F6 "+String(Ee.durationMs)+"ms"+(Ee.truncated?" \xB7 \u8F93\u51FA\u5DF2\u622A\u65AD":"")}),e("pre",{className:"dk_logBox",style:{marginTop:6},children:(Ee.stdout||"")+(Ee.stderr===""?"":`
[stderr]
`+Ee.stderr)||"(\u65E0\u8F93\u51FA)"})]})]})]})},xe=()=>{let N=x?U.join(`
`):w!==null&&typeof w=="object"&&typeof w.text=="string"?w.text:"",M=R.trim().toLowerCase(),S=N===""?[]:N.split(`
`),F=M===""?S:S.filter(V=>V.toLowerCase().includes(M));return{raw:N,needle:M,allLines:S,matchedLines:F}},Ce=(N,M,S,F)=>e("button",{type:"button",className:"dk_pill"+(F?.className??""),"data-on":N?"1":"0",disabled:F?.disabled===!0,title:F?.title??"",onClick:S,children:M}),$t=()=>{let{raw:N}=xe(),M=[...new Set([100,200,500,1e3,5e3,Number(a.logTailDefault)||200,Number(g.tail)||200])].filter(S=>Number.isInteger(S)&&S>0).sort((S,F)=>S-F);return o("div",{className:"dk_logTools",children:[e("span",{className:"dk_toolLabel",children:"LINES"}),e("select",{className:"dk_select dk_selectSm",value:String(g.tail),onChange:S=>b({...g,tail:Number(S.target.value)}),children:M.map(S=>e("option",{value:String(S),children:S===5e3?"Last 5000":"Last "+String(S)},String(S)))}),e("span",{className:"dk_toolLabel",children:"TIMESTAMPS"}),Ce(g.timestamps,g.timestamps?"On":"Off",()=>b({...g,timestamps:!g.timestamps})),e("span",{className:"dk_toolLabel",children:"FOLLOW"}),Ce(x,x?"On":"Off",Ut,{className:" dk_pillFollow",title:x?"\u5173\u95ED\u5B9E\u65F6\u8DDF\u968F\uFF08\u56DE\u5230\u65E5\u5FD7\u5FEB\u7167\uFF09":"\u5B9E\u65F6\u8DDF\u968F\u5BB9\u5668\u65E5\u5FD7\uFF08docker logs -f\uFF09"}),e("span",{className:"dk_toolLabel",children:"AUTO REFRESH"}),Ce(T,T?"On":"Off",()=>ne(S=>!S),{disabled:x,title:x?"FOLLOW \u6253\u5F00\u65F6\u6682\u505C\u8F6E\u8BE2":"\u6309\u4E0B\u65B9\u95F4\u9694\u91CD\u65B0\u62C9\u53D6\u65E5\u5FD7\u5FEB\u7167"}),e("select",{className:"dk_select dk_selectSm",value:String(f),disabled:x,title:"\u81EA\u52A8\u5237\u65B0\u95F4\u9694\uFF08\u5F00\u542F AUTO REFRESH \u540E\u6309\u6B64\u8F6E\u8BE2\uFF09",onChange:S=>_(Number(S.target.value)),children:[2,3,5,10].map(S=>e("option",{value:String(S),children:String(S)+"s"},String(S)))}),e($,{icon:tt,title:"\u5237\u65B0\u65E5\u5FD7",spin:y,onClick:he},"refresh"),e($,{icon:Zo,title:"\u4E0B\u8F7D\u65E5\u5FD7",disabled:N==="",onClick:()=>Xr(n.name+".log",N)},"download")]})},Zt=()=>{let{needle:N,allLines:M,matchedLines:S}=xe();return o("div",{className:"dk_filterBar",children:[o("div",{className:"dk_filterWrap",children:[e("input",{className:"dk_input dk_filterInput",placeholder:"\u8FC7\u6EE4\u65E5\u5FD7\u2026",value:R,onChange:F=>H(F.target.value),onKeyDown:F=>{F.key==="Escape"&&R!==""&&(F.stopPropagation(),H(""))}}),R===""?null:e("button",{type:"button",className:"dk_filterClear",title:"\u6E05\u7A7A\u8FC7\u6EE4","aria-label":"\u6E05\u7A7A\u8FC7\u6EE4",onClick:()=>H(""),children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Be}})},"clear")]}),e("span",{className:"dk_filterCount",children:N===""?String(M.length)+" \u884C":String(S.length)+" / "+String(M.length)+" \u884C\u5339\u914D"})]})},Qt=()=>{let{needle:N,matchedLines:M}=xe(),S=M.length>ut?M.slice(-ut):M;return o("div",{className:"dk_logs",children:[E===""?null:e(Y,{title:"\u8BFB\u53D6\u65E5\u5FD7\u5931\u8D25",hint:E+(E.includes("Failed to fetch")?"\uFF08\u7F51\u7EDC\u8BF7\u6C42\u6CA1\u5230\u5BBF\u4E3B\uFF1A\u5BBF\u4E3B\u53EF\u80FD\u521A\u91CD\u542F\u3001\u6216\u8FDE\u63A5\u88AB\u4E2D\u65AD\uFF09":""),action:e("button",{type:"button",className:"dk_btn",disabled:y,onClick:he,children:"\u91CD\u8BD5"})}),$e===""?null:e(Y,{title:"\u65E5\u5FD7\u6D41\u4E2D\u65AD",hint:$e,action:e("button",{type:"button",className:"dk_btn",onClick:Ut,children:"\u91CD\u8BD5"})}),Pe===""?null:e(Y,{kind:"info",title:Pe}),ze?e(Y,{kind:"warn",title:"\u65E5\u5FD7\u8D85\u8FC7 "+String(Oe)+" \u884C\uFF0C\u5DF2\u4E22\u5F03\u6700\u65E9\u5185\u5BB9",hint:"\u6D41\u5F0F\u65E5\u5FD7\u53EA\u4FDD\u7559\u6700\u8FD1\u7684\u884C\uFF1B\u9700\u8981\u5B8C\u6574\u5386\u53F2\u8BF7\u7528\u5FEB\u7167\u6216\u300C\u4E0B\u8F7D\u65E5\u5FD7\u300D\u3002"}):null,!x&&w!==null&&w.truncated===!0?e(Y,{kind:"warn",title:"\u65E5\u5FD7\u8F93\u51FA\u8D85\u8FC7\u4E0A\u9650\uFF0C\u5DF2\u622A\u65AD",hint:"\u8C03\u5C0F\u300CLINES\u300D\u6216\u5230\u8BBE\u7F6E\u5361\u7247\u8C03\u5927\u300C\u5355\u6B21\u547D\u4EE4\u8F93\u51FA\u4E0A\u9650\u300D\u3002"}):null,x?e("div",{className:"dk_followState","data-state":ae,children:je()}):null,o("div",{className:"dk_logBody",ref:ee,onScroll:Ue,onContextMenu:F=>ur(F,ee.current,{target:t.target,targetLabel:t.targetLabel??"",containers:[n],filtered:N!==""}),children:[M.length>S.length?e("div",{className:"dk_logLine dk_logMore",children:"\uFF08\u53EA\u663E\u793A\u6700\u8FD1 "+String(ut)+" \u884C\uFF0C\u5171 "+String(M.length)+" \u884C\u5339\u914D\uFF09"},"more"):null,E!==""?null:!x&&w===null?e("div",{className:"dk_logLine",children:"\u8BFB\u53D6\u4E2D\u2026"},"loading"):S.length===0?e("div",{className:"dk_logLine",children:x?"\u7B49\u5F85\u65E5\u5FD7\u2026":N===""?"(\u65E0\u65E5\u5FD7)":"(\u65E0\u5339\u914D\u65E5\u5FD7)"},"empty"):S.map((F,V)=>Ia(F,V,N))]}),x&&!ge?e("button",{type:"button",className:"dk_backToBottom",onClick:qt,children:"\u56DE\u5230\u5E95\u90E8"}):null]})},Ze=()=>{let N=ce,M=o("div",{className:"dk_statsBar",children:[e("span",{className:"dk_toolLabel",children:"FOLLOW"}),Ce(N,N?"On":"Off",Ln,{className:" dk_pillFollow",title:N?"\u5173\u95ED\u5B9E\u65F6\u8DDF\u968F\uFF08\u56DE\u5230 docker stats \u5FEB\u7167\uFF09":"\u5B9E\u65F6\u8DDF\u968F\u8D44\u6E90\u5360\u7528\uFF08docker stats \u6BCF\u79D2\u4E00\u884C\uFF09"}),e("span",{className:"dk_hint",children:N?"60 \u70B9 \u2248 \u6700\u8FD1 1 \u5206\u949F":"\u6253\u5F00 FOLLOW \u770B\u5B9E\u65F6\u8D8B\u52BF"}),e("span",{className:"dk_headerSpacer"}),N?e("span",{className:"dk_followState","data-state":j,children:bt()}):null]}),S=K=>o("div",{className:"dk_statsView",children:[M,K]});if(re!=="")return S(o("div",{children:[e(Y,{kind:"info",title:re}),fe===""?null:e(Y,{title:"\u8BFB\u53D6\u7EDF\u8BA1\u5931\u8D25",hint:fe})]}));if(fe!=="")return S(e(Y,{title:"\u8BFB\u53D6\u7EDF\u8BA1\u5931\u8D25",hint:fe}));if(X===null)return S(e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]}));let F=X.cpuPercent??0,V=X.memPercent??0,W=K=>o("div",{className:"dk_bar",children:[e("div",{className:"dk_barFill","data-warn":K>=60&&K<85?"1":void 0,"data-danger":K>=85?"1":void 0,style:{width:Math.min(100,Math.max(0,K))+"%"}})]}),de=Math.max(100,...ye.cpu),J=(K,G,ue)=>o("tr",{children:[e("td",{children:K}),e("td",{className:"dk_num",children:G}),e("td",{children:ue??null})]},K);return S(o("table",{className:"dk_stats",children:[e("thead",{children:o("tr",{children:[e("th",{children:"\u6307\u6807"}),e("th",{children:"\u6570\u503C"}),e("th",{children:"\u5360\u7528 / \u8D8B\u52BF"})]})}),e("tbody",{children:[J("CPU",Go(X.cpuPercent),o("div",{className:"dk_trend",children:[W(F),N||ye.cpu.length>0?e(rr,{values:ye.cpu,max:de,alertAt:85,title:"CPU% \u6700\u8FD1 60 \u4E2A\u91C7\u6837"}):null]})),J("\u5185\u5B58",X.memUsage,o("div",{className:"dk_trend",children:[W(V),N||ye.mem.length>0?e(rr,{values:ye.mem,max:100,alertAt:85,title:"\u5185\u5B58\u5360\u7528% \u6700\u8FD1 60 \u4E2A\u91C7\u6837"}):null]})),J("\u7F51\u7EDC IO",X.netIO,null),J("\u78C1\u76D8 IO",X.blockIO,null),J("PIDs",X.pids===null?"\u2014":String(X.pids),null)]})]}))},en=[["overview","\u6982\u89C8"],["logs","\u65E5\u5FD7"],["stats","\u7EDF\u8BA1"]],En=r==="overview"?s===null&&k==="":r==="stats"?X===null&&fe==="":!1;return o("div",{className:"dk_detail",children:[o("div",{className:"dk_header dk_headerDetail",children:[e($,{icon:nt,title:"\u8FD4\u56DE\u5BB9\u5668\u5217\u8868",onClick:t.onBack},"back"),e("span",{className:"dk_detailTitle",title:n.name,children:n.name}),e(st,{state:n.state,health:n.health,status:n.status}),e("span",{className:"dk_detailSub",children:t.targetLabel??""}),e("span",{className:"dk_headerSpacer"}),r==="logs"?$t():e($,{icon:tt,title:"\u5237\u65B0",spin:En,onClick:t.onRefresh},"refresh"),t.docked===!0?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:t.onClose,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Be}})},"close")]}),o("div",{className:"dk_tabs",children:[...en.map(([N,M])=>e("button",{type:"button",className:"dk_tab","data-on":r===N?"1":"0",onClick:()=>u(N),children:M},N)),r==="logs"?e("span",{className:"dk_headerSpacer"},"spacer"):null,r==="logs"?Zt():null]}),e("div",{className:"dk_detailBody",children:r==="overview"?Yt():r==="logs"?Qt():Ze()})]})}function bn(t){return t.dangling===!0?t.id:t.reference}function Va(t){let n=t.item,a=bn(n),[r,u]=p("overview"),[d,s]=p(null),[c,k]=p(""),[v,g]=p(!1),b=se(()=>{g(!0),k(""),Q.imageInspect(t.target,a).then(y=>s(y.image)).catch(y=>k(y.message)).finally(()=>g(!1))},[t.target,a]);L(()=>{b()},[b]);let w=y=>o("div",{className:"dk_kv",children:y.flatMap(([D,R],H)=>[e("div",{className:"dk_kvKey",children:D},"k"+String(H)),e("div",{className:"dk_kvVal"+(["ID","\u5165\u53E3","digest"].indexOf(D)>=0?" dk_kvValMono":""),children:R},"v"+String(H))])}),I=()=>{if(c!=="")return e(Y,{title:"\u8BFB\u53D6\u955C\u50CF\u8BE6\u60C5\u5931\u8D25",hint:c,action:e("button",{type:"button",className:"dk_btn",onClick:b,children:"\u91CD\u8BD5"})});if(d===null)return e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]});let y=d.detail,D=[["\u6807\u7B7E",y.repoTags.length===0?"<none>\uFF08dangling\uFF09":y.repoTags.join(`
`)],["ID",y.id],["\u5927\u5C0F",y.size===null?"\u2014":un(y.size)],["\u542B\u7236\u5C42",y.virtualSize===null?"\u2014":un(y.virtualSize)],["\u521B\u5EFA",y.created===""?"\u2014":Ct(y.created)],["\u5E73\u53F0",y.os===""&&y.architecture===""?"\u2014":y.os+"/"+y.architecture],["\u5C42\u6570",String(y.layerCount)],["\u5165\u53E3",(y.entrypoint+" "+y.command).trim()||"\u2014"],["\u5DE5\u4F5C\u76EE\u5F55",y.workingDir===""?"\u2014":y.workingDir],["\u7528\u6237",y.user===""?"\u2014":y.user],["\u66B4\u9732\u7AEF\u53E3",y.exposedPorts.length===0?"\u2014":y.exposedPorts.join(", ")],["digest",y.repoDigests.length===0?"\u2014":y.repoDigests.join(`
`)]],R=Object.entries(y.labels);return o("div",{children:[w(D),e("div",{className:"dk_cardSection",style:{marginTop:16},children:"\u5C42\uFF08"+String(y.layerCount)+"\uFF09"}),y.layers.length===0?e("span",{className:"dk_hint",children:"\u8BE5\u955C\u50CF\u6CA1\u6709\u5C42\u4FE1\u606F\uFF08scratch \u6784\u5EFA\u6216\u65E7\u7248 docker\uFF09\u3002"}):e("div",{className:"dk_layerList",children:y.layers.map((H,T)=>o("div",{className:"dk_layerItem",children:[e("span",{className:"dk_layerIndex",children:"#"+String(T)}),e("span",{className:"dk_mono dk_layerId",title:H,children:H.replace(/^sha256:/,"")})]},H+String(T)))}),R.length===0?null:o("div",{children:[e("div",{className:"dk_cardSection",style:{marginTop:16},children:"\u6807\u7B7E\uFF08"+String(R.length)+"\uFF09"}),e("div",{className:"dk_labelList",children:R.map(([H,T])=>o("div",{className:"dk_labelItem",children:[e("span",{className:"dk_labelKey",children:H}),e("span",{className:"dk_labelVal",title:T,children:T})]},H))})]})]})},E=()=>c!==""?e(Y,{title:"\u8BFB\u53D6\u955C\u50CF\u8BE6\u60C5\u5931\u8D25",hint:c}):d===null?e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]}):d.historyError!==null?e(Y,{kind:"warn",title:"\u8BFB\u53D6\u6784\u5EFA\u5386\u53F2\u5931\u8D25",hint:d.historyError}):d.history.length===0?o("div",{className:"dk_empty",children:[e("div",{className:"dk_emptyTitle",children:"\u6CA1\u6709\u6784\u5EFA\u5386\u53F2"}),e("div",{className:"dk_emptyHint",children:"\u8BE5 docker \u7248\u672C\u65E2\u6CA1\u6709 history --format\uFF08\u9700\u8981 Docker \u2265 26\uFF09\uFF0C\u7EAF\u6587\u672C\u8868\u683C\u4E5F\u6CA1\u89E3\u6790\u51FA\u5185\u5BB9\u3002"})]}):e("div",{className:"dk_tableWrap",children:o("table",{className:"dk_images dk_historyTable",children:[e("thead",{children:o("tr",{children:[e("th",{children:"\u5C42 ID"}),e("th",{children:"\u521B\u5EFA"}),e("th",{children:"\u5927\u5C0F"}),e("th",{children:"\u6784\u5EFA\u547D\u4EE4"})]})}),e("tbody",{children:d.history.map((y,D)=>o("tr",{children:[e("td",{className:"dk_mono",children:y.shortId}),e("td",{children:y.createdSince===""?y.created===""?"\u2014":Ct(y.created):y.createdSince}),e("td",{children:y.sizeText===""?y.size===null?"\u2014":un(y.size):y.sizeText}),e("td",{className:"dk_mono dk_historyCmd",title:y.createdBy,children:y.createdBy===""?"\u2014":y.createdBy})]},String(D)))})]})}),P=[["overview","\u6982\u89C8"],["history","\u6784\u5EFA\u5386\u53F2"]];return o("div",{className:"dk_detail",children:[o("div",{className:"dk_header dk_headerDetail",children:[e($,{icon:nt,title:"\u8FD4\u56DE\u955C\u50CF\u5217\u8868",onClick:t.onBack},"back"),e("span",{className:"dk_detailTitle",title:a,children:a}),n.dangling===!0?e("span",{className:"dk_badge","data-state":"paused",children:"dangling"}):null,e("span",{className:"dk_detailSub",children:t.targetLabel??""}),e("span",{className:"dk_headerSpacer"}),e($,{icon:tt,title:"\u5237\u65B0\u955C\u50CF\u8BE6\u60C5",spin:v,onClick:b},"refresh"),t.docked===!0?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:t.onClose,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Be}})},"close")]}),e("div",{className:"dk_tabs",children:P.map(([y,D])=>e("button",{type:"button",className:"dk_tab","data-on":r===y?"1":"0",onClick:()=>u(y),children:D},y))}),e("div",{className:"dk_detailBody",children:r==="overview"?I():E()})]})}function Ka(t){let n=t.item,a=n.name,[r,u]=p("overview"),[d,s]=p(null),[c,k]=p(""),[v,g]=p(!1),[b,w]=p(!1),[I,E]=p(!1),[P,y]=p(""),D=se(()=>{g(!0),k(""),Q.networkInspect(t.target,a).then(f=>s(f.network)).catch(f=>k(f.message)).finally(()=>g(!1))},[t.target,a]);L(()=>{D()},[D]);let R=()=>{E(!0),y(""),Q.networkRemove(t.target,a).then(f=>t.onRemoved(f.result.message)).catch(f=>{w(!1),y(f.message)}).finally(()=>E(!1))},H=()=>{if(c!=="")return e(Y,{title:"\u8BFB\u53D6\u7F51\u7EDC\u8BE6\u60C5\u5931\u8D25",hint:c,action:e("button",{type:"button",className:"dk_btn",onClick:D,children:"\u91CD\u8BD5"})});if(d===null)return e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]});let f=d.detail,_=[["\u540D\u79F0",f.name],["ID",f.id],["\u9A71\u52A8",f.driver===""?"\u2014":f.driver],["\u8303\u56F4",f.scope===""?"\u2014":f.scope],["\u521B\u5EFA",f.created===""?"\u2014":Ct(f.created)],["\u5B50\u7F51",f.subnets.length===0?"\u2014":f.subnets.map(x=>x.subnet===""?"\u2014":x.subnet).join(`
`)],["\u7F51\u5173",f.subnets.length===0?"\u2014":f.subnets.map(x=>x.gateway===""?"\u2014":x.gateway).join(`
`)],["\u5C5E\u6027",[f.internal?"internal":"",f.attachable?"attachable":"",f.ingress?"ingress":"",f.enableIpv6?"ipv6":""].filter(x=>x!=="").join(" \xB7 ")||"\u2014"],["\u9009\u9879",Object.keys(f.options).length===0?"\u2014":Object.entries(f.options).map(([x,z])=>x+"="+z).join(`
`)],["\u6807\u7B7E",Object.keys(f.labels).length===0?"\u2014":Object.entries(f.labels).map(([x,z])=>x+"="+z).join(`
`)]];return e(Qn,{rows:_,mono:["ID","\u5B50\u7F51","\u7F51\u5173","\u9009\u9879","\u6807\u7B7E"]})},T=()=>{if(c!=="")return e(Y,{title:"\u8BFB\u53D6\u7F51\u7EDC\u8BE6\u60C5\u5931\u8D25",hint:c});if(d===null)return e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]});let f=d.detail.containers;return f.length===0?e("div",{className:"dk_empty",children:[e("div",{className:"dk_emptyTitle",children:"\u6CA1\u6709\u5BB9\u5668\u63A5\u5165\u8FD9\u4E2A\u7F51\u7EDC"})]}):e("div",{className:"dk_tableWrap",children:o("table",{className:"dk_images",children:[e("thead",{children:o("tr",{children:[e("th",{children:"\u5BB9\u5668"}),e("th",{children:"IPv4"}),e("th",{children:"IPv6"}),e("th",{children:"MAC"})]})}),e("tbody",{children:f.map(_=>o("tr",{children:[e("td",{className:"dk_mono",title:_.id,children:_.name===""?_.shortId:_.name}),e("td",{className:"dk_mono",children:_.ipv4===""?"\u2014":_.ipv4}),e("td",{className:"dk_mono",children:_.ipv6===""?"\u2014":_.ipv6}),e("td",{className:"dk_mono",children:_.mac===""?"\u2014":_.mac})]},_.id))})]})})},ne=[["overview","\u6982\u89C8"],["containers","\u63A5\u5165\u7684\u5BB9\u5668"+(d===null?"":"\uFF08"+String(d.detail.containers.length)+"\uFF09")]];return o("div",{className:"dk_detail",children:[o("div",{className:"dk_header dk_headerDetail",children:[e($,{icon:nt,title:"\u8FD4\u56DE\u7F51\u7EDC\u5217\u8868",onClick:t.onBack},"back"),e("span",{className:"dk_projectIcon",dangerouslySetInnerHTML:{__html:ri}}),e("span",{className:"dk_detailTitle",title:a,children:a}),n.internal===!0?e("span",{className:"dk_badge","data-state":"paused",children:"internal"}):null,e("span",{className:"dk_detailSub",children:t.targetLabel??""}),e("span",{className:"dk_headerSpacer"}),e($,{icon:tt,title:"\u5237\u65B0\u7F51\u7EDC\u8BE6\u60C5",spin:v,onClick:D},"refresh"),e($,{icon:gn,danger:!0,disabled:t.allowMutations!==!0,title:t.allowMutations===!0?"\u5220\u9664\u7F51\u7EDC\uFF08\u4E0D\u53EF\u6062\u590D\uFF09":"\u5220\u9664\u7F51\u7EDC\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",onClick:()=>w(!0)},"remove"),t.docked===!0?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:t.onClose,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Be}})},"close")]}),e("div",{className:"dk_tabs",children:ne.map(([f,_])=>e("button",{type:"button",className:"dk_tab","data-on":r===f?"1":"0",onClick:()=>u(f),children:_},f))}),o("div",{className:"dk_detailBody",children:[P===""?null:e(Y,{title:"\u5220\u9664\u7F51\u7EDC\u5931\u8D25",hint:P}),r==="overview"?H():T()]}),b?e(dt,{title:"\u5220\u9664\u7F51\u7EDC",text:"\u786E\u5B9A\u5220\u9664\u7F51\u7EDC "+a+"\uFF1F\u8FD8\u6709\u5BB9\u5668\u63A5\u7740\u65F6 docker \u4F1A\u62D2\u7EDD\uFF1B\u5220\u9664\u540E\u4F9D\u8D56\u5B83\u7684\u5BB9\u5668\u4F1A\u5931\u53BB\u7F51\u7EDC\uFF0C\u9700\u8981\u91CD\u65B0\u521B\u5EFA\u6216\u63A5\u5165\u522B\u7684\u7F51\u7EDC\u3002",confirmLabel:"\u5220\u9664",busy:I,onCancel:()=>w(!1),onConfirm:R},"confirm"):null]})}function Ga(t){let a=t.item.name,[r,u]=p(null),[d,s]=p(""),[c,k]=p(!1),[v,g]=p(!1),[b,w]=p(!1),[I,E]=p(""),P=se(()=>{k(!0),s(""),Q.volumeInspect(t.target,a).then(R=>u(R.volume)).catch(R=>s(R.message)).finally(()=>k(!1))},[t.target,a]);L(()=>{P()},[P]);let y=()=>{w(!0),E(""),Q.volumeRemove(t.target,a).then(R=>t.onRemoved(R.result.message)).catch(R=>{g(!1),E(R.message)}).finally(()=>w(!1))},D=()=>{if(d!=="")return e(Y,{title:"\u8BFB\u53D6\u5377\u8BE6\u60C5\u5931\u8D25",hint:d,action:e("button",{type:"button",className:"dk_btn",onClick:P,children:"\u91CD\u8BD5"})});if(r===null)return e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]});let R=r.detail,H=[["\u540D\u79F0",R.name],["\u9A71\u52A8",R.driver===""?"\u2014":R.driver],["\u8303\u56F4",R.scope===""?"\u2014":R.scope],["\u6302\u8F7D\u70B9",R.mountpoint===""?"\u2014":R.mountpoint],["\u521B\u5EFA",R.created===""?"\u2014":Ct(R.created)],["\u9009\u9879",Object.keys(R.options).length===0?"\u2014":Object.entries(R.options).map(([T,ne])=>T+"="+ne).join(`
`)],["\u6807\u7B7E",Object.keys(R.labels).length===0?"\u2014":Object.entries(R.labels).map(([T,ne])=>T+"="+ne).join(`
`)]];return e(Qn,{rows:H,mono:["\u6302\u8F7D\u70B9","\u9009\u9879","\u6807\u7B7E"]})};return o("div",{className:"dk_detail",children:[o("div",{className:"dk_header dk_headerDetail",children:[e($,{icon:nt,title:"\u8FD4\u56DE\u5377\u5217\u8868",onClick:t.onBack},"back"),e("span",{className:"dk_projectIcon",dangerouslySetInnerHTML:{__html:ai}}),e("span",{className:"dk_detailTitle",title:a,children:a}),e("span",{className:"dk_detailSub",children:t.targetLabel??""}),e("span",{className:"dk_headerSpacer"}),e($,{icon:tt,title:"\u5237\u65B0\u5377\u8BE6\u60C5",spin:c,onClick:P},"refresh"),e($,{icon:gn,danger:!0,disabled:t.allowMutations!==!0,title:t.allowMutations===!0?"\u5220\u9664\u5377\uFF08\u5377\u91CC\u7684\u6570\u636E\u4F1A\u4E00\u8D77\u6CA1\uFF0C\u4E0D\u53EF\u6062\u590D\uFF09":"\u5220\u9664\u5377\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",onClick:()=>g(!0)},"remove"),t.docked===!0?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:t.onClose,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Be}})},"close")]}),o("div",{className:"dk_detailBody",children:[I===""?null:e(Y,{title:"\u5220\u9664\u5377\u5931\u8D25",hint:I}),D()]}),v?e(dt,{title:"\u5220\u9664\u5377",text:"\u786E\u5B9A\u5220\u9664\u5377 "+a+"\uFF1F\u5377\u91CC\u7684\u6570\u636E\u4F1A\u4E00\u8D77\u5220\u9664\u4E14\u4E0D\u53EF\u6062\u590D\uFF1B\u8FD8\u6709\u5BB9\u5668\u5360\u7528\u65F6 docker \u4F1A\u62D2\u7EDD\u3002",confirmLabel:"\u5220\u9664",busy:b,onCancel:()=>g(!1),onConfirm:y},"confirm"):null]})}let Wa=2e3;function Ja(t,n,a){let r=a+n,u=r.split(/\r\n|\r|\n/),d="";/[\r\n]$/.test(r)||(d=u.pop()??"");let s=t.slice();for(let c of u){let k=c.trim();if(k==="")continue;let v=/^([0-9a-f]{6,}|[A-Za-z][A-Za-z0-9 _-]*?):\s/.exec(k),g=v===null?null:v[1];g!==null&&s.length>0&&s[s.length-1].key===g?s[s.length-1]={key:g,text:k}:s.push({key:g,text:k}),s.length>Wa&&s.shift()}return{lines:s,pending:d}}function Ua(t){let[n,a]=p(""),[r,u]=p(!1),[d,s]=p([]),[c,k]=p(""),[v,g]=p(""),[b,w]=p(null),I=B(""),E=B([]),P=B(""),y=B(null);L(()=>{if(!r)return;if(typeof EventSource!="function"){g("\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301 EventSource\uFF0C\u65E0\u6CD5\u663E\u793A\u62C9\u53D6\u8FDB\u5EA6"),u(!1);return}k("connecting");let T=new EventSource(dn("/images/pull/stream",{target:t.target,ref:I.current})),ne=!1,f=()=>{if(!ne){ne=!0;try{T.close()}catch{}}},_=U=>{let q=null;try{q=JSON.parse(U.data)}catch{return}if(q===null||typeof q!="object")return;let ae=typeof q.d=="string"?q.d:typeof q.e=="string"?q.e:"";if(ae==="")return;let ke=Ja(E.current,ae,P.current);E.current=ke.lines,P.current=ke.pending,s(ke.lines)},x=U=>{let q=null;try{q=JSON.parse(U.data)}catch{}let ae=q!==null&&typeof q.code=="number"?q.code:null;w(ae),u(!1),k(ae===0?"\u62C9\u53D6\u5B8C\u6210":"\u62C9\u53D6\u7ED3\u675F\uFF08\u9000\u51FA\u7801 "+String(ae===null?"?":ae)+"\uFF09"),ae===0&&t.onDone?.()},z=U=>{if(typeof U.data=="string"&&U.data!==""){let q="\u62C9\u53D6\u5931\u8D25";try{let ae=JSON.parse(U.data);ae!==null&&typeof ae.message=="string"&&(q=ae.message)}catch{}g(q),u(!1),k("");return}k(T.readyState===2?"closed":"reconnecting")};return T.addEventListener("line",_),T.addEventListener("end",x),T.addEventListener("error",z),T.onopen=()=>k("open"),()=>{f(),P.current=""}},[r,t.target]),L(()=>{let T=y.current;T!==null&&(T.scrollTop=T.scrollHeight)},[d]);let D=()=>{let T=n.trim();T===""||r||(I.current=T,E.current=[],P.current="",s([]),g(""),w(null),k(""),u(!0))},R=()=>{u(!1),k("\u5DF2\u505C\u6B62")},H=()=>c==="open"?"\u6B63\u5728\u62C9\u53D6\uFF08docker pull\uFF09\u2026":c==="connecting"?"\u6B63\u5728\u8FDE\u63A5\u62C9\u53D6\u6D41\u2026":c==="reconnecting"?"\u8FDE\u63A5\u4E2D\u65AD\uFF0C\u6B63\u5728\u81EA\u52A8\u91CD\u8FDE\u2026":c==="closed"?"\u62C9\u53D6\u6D41\u5DF2\u65AD\u5F00":c;return o("div",{className:"dk_detail",children:[o("div",{className:"dk_header dk_headerDetail",children:[e($,{icon:nt,title:"\u8FD4\u56DE\u955C\u50CF\u5217\u8868",onClick:t.onBack},"back"),e("span",{className:"dk_detailTitle",children:"\u62C9\u53D6\u955C\u50CF"}),e("span",{className:"dk_detailSub",children:t.targetLabel??""}),e("span",{className:"dk_headerSpacer"}),t.docked===!0?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:t.onClose,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Be}})},"close")]}),o("div",{className:"dk_detailBody dk_pullBody",children:[t.allowMutations!==!0?e(Y,{kind:"info",title:"\u62C9\u53D6\u955C\u50CF\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",hint:"docker pull \u4F1A\u5199\u5165\u76EE\u6807\u673A\u7684\u955C\u50CF\u5B58\u50A8\u5E76\u5360\u7528\u78C1\u76D8\u4E0E\u5E26\u5BBD\u3002\u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D\u540E\u5373\u53EF\u5728\u6B64\u62C9\u53D6\u3002"}):o("div",{className:"dk_row",children:[e("input",{className:"dk_input",style:{flex:"1 1 auto"},placeholder:"\u955C\u50CF\u5F15\u7528\uFF0C\u5982 nginx:1.27 \u6216 ghcr.io/org/app:latest",value:n,disabled:r,onChange:T=>a(T.target.value),onKeyDown:T=>{T.key==="Enter"&&D()}}),r?e("button",{type:"button",className:"dk_btn dk_btnDanger",onClick:R,children:"\u505C\u6B62"}):e("button",{type:"button",className:"dk_btn dk_btnPrimary",disabled:t.allowMutations!==!0,onClick:D,children:"\u62C9\u53D6"})]}),v===""?null:e(Y,{title:"\u62C9\u53D6\u5931\u8D25",hint:v}),c===""?null:e("div",{className:"dk_hint",children:H()+(b===null?"":" \xB7 \u9000\u51FA\u7801 "+String(b))}),o("div",{className:"dk_pullBox",ref:y,children:[d.length===0?e("div",{className:"dk_pullLine",children:r?"\u7B49\u5F85 docker pull \u8F93\u51FA\u2026":"\u586B\u5199\u955C\u50CF\u5F15\u7528\u540E\u70B9\u300C\u62C9\u53D6\u300D\uFF0C\u9010\u5C42\u8FDB\u5EA6\u4F1A\u5B9E\u65F6\u51FA\u73B0\u5728\u8FD9\u91CC\u3002"}):d.map((T,ne)=>e("div",{className:"dk_pullLine","data-key":T.key??void 0,children:T.text},String(ne)))]})]})]})}function _n(t){let n=new Map;for(let a of t){let r=a.composeProject===null?"":a.composeProject,u=n.get(r);u===void 0&&(u={project:r,items:[]},n.set(r,u)),u.items.push(a)}return[...n.values()]}let kr=t=>t==="running"||t==="paused"||t==="restarting";function qa(t){return e("div",{className:"dk_projects",children:t.groups.map(n=>{let a=n.items.filter(s=>kr(s.state)).length,r=n.items.filter(s=>s.health==="unhealthy").length,u=[...new Set(n.items.map(s=>s.composeService===null?s.name:s.composeService))],d=n.project===""?"\uFF08\u975E compose \u5BB9\u5668\uFF09":n.project;return o("div",{className:"dk_project",role:"button",tabIndex:0,onClick:()=>t.onOpen(n.project),onKeyDown:s=>{(s.key==="Enter"||s.key===" ")&&(s.preventDefault(),t.onOpen(n.project))},children:[o("div",{className:"dk_projectHead",children:[e("span",{className:"dk_projectIcon",dangerouslySetInnerHTML:{__html:na}}),e("span",{className:"dk_projectName",title:d,children:d}),e("span",{className:"dk_badge","data-state":a===n.items.length?"running":a===0?"exited":"paused",children:String(a)+" / "+String(n.items.length)+" \u8FD0\u884C\u4E2D"}),r>0?e("span",{className:"dk_badge","data-state":"unhealthy",children:String(r)+" \u4E0D\u5065\u5EB7"}):null,e("span",{className:"dk_headerSpacer"}),e("span",{className:"dk_hint",children:String(u.length)+" \u4E2A\u670D\u52A1"})]}),e("div",{className:"dk_projectRows",children:n.items.map(s=>o("div",{className:"dk_projectRow",children:[e("span",{className:"dk_projectSvc",children:s.composeService===null?"\u2014":s.composeService}),e("span",{className:"dk_projectContainer",title:s.name,children:s.name}),e(st,{state:s.state,health:s.health,status:s.status}),e("span",{className:"dk_projectImage",title:s.image,children:s.image}),e("span",{className:"dk_projectPorts",children:cn(s.ports)})]},s.id))})]},n.project===""?"__ungrouped":n.project)})})}function Xa(t){let[n,a]=p("services"),r=t.items,u=t.project===""?"\uFF08\u975E compose \u5BB9\u5668\uFF09":t.project,d=r.filter(k=>kr(k.state)).length,s=()=>e("div",{className:"dk_tableWrap",children:o("table",{className:"dk_images dk_composeTable",children:[e("thead",{children:o("tr",{children:[e("th",{children:"\u670D\u52A1"}),e("th",{children:"\u5BB9\u5668"}),e("th",{children:"\u72B6\u6001"}),e("th",{children:"\u7AEF\u53E3"}),e("th",{children:"\u955C\u50CF"})]})}),e("tbody",{children:r.map(k=>o("tr",{children:[e("td",{children:k.composeService===null?"\u2014":k.composeService}),e("td",{className:"dk_mono",title:k.name,children:k.name}),e("td",{children:e(st,{state:k.state,health:k.health,status:k.status})}),e("td",{children:cn(k.ports)}),e("td",{className:"dk_mono",title:k.image,children:k.image})]},k.id))})]})}),c=[["services","\u670D\u52A1"],["logs","\u805A\u5408\u65E5\u5FD7"]];return o("div",{className:"dk_detail",children:[o("div",{className:"dk_header dk_headerDetail",children:[e($,{icon:nt,title:"\u8FD4\u56DE Compose \u5217\u8868",onClick:t.onBack},"back"),e("span",{className:"dk_projectIcon",dangerouslySetInnerHTML:{__html:na}}),e("span",{className:"dk_detailTitle",title:u,children:u}),e("span",{className:"dk_badge","data-state":d===r.length?"running":d===0?"exited":"paused",children:String(d)+" / "+String(r.length)+" \u8FD0\u884C\u4E2D"}),e("span",{className:"dk_detailSub",children:t.targetLabel??""}),e("span",{className:"dk_headerSpacer"}),t.docked===!0?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:t.onClose,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Be}})},"close")]}),e("div",{className:"dk_tabs",children:c.map(([k,v])=>e("button",{type:"button",className:"dk_tab","data-on":n===k?"1":"0",onClick:()=>a(k),children:v},k))}),e("div",{className:"dk_detailBody",children:n==="services"?s():e(br,{target:t.target,targetLabel:t.targetLabel,items:r})})]})}let yn=350,gr=/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))\s/;function hr(t){let n=gr.exec(t);if(n===null)return{ts:null,text:t};let a=Date.parse(n[1]);return{ts:Number.isFinite(a)?a:null,text:t.slice(n[0].length)}}let Ya={TRACE:0,DEBUG:1,INFO:2,WARN:3,ERROR:4,FATAL:5},$a=/^\s*(\[\d{4}-\d{2}-\d{2}[ T][0-9:.,]+\]|\d{2}:\d{2}:\d{2}[,.]\d{3})\s*/;function pr(t){let n=ar.exec(t.replace($a,""));if(n===null)return null;let a=or.exec(n[1]);return a===null?null:a[1]}function xn(t){let n=0;return t.map((a,r)=>(typeof a.ts=="number"&&Number.isFinite(a.ts)&&(n=a.ts),{row:a,index:r,key:n})).sort((a,r)=>a.key-r.key||a.index-r.index).map(a=>a.row)}let wn=400;function Ht(t,n,a){if(n.length===0)return t;let r=Math.max(a,0),u=Math.max(t.length-r,0),d=t.slice(u).concat(n);return t.slice(0,u).concat(xn(d))}function mr(t,n){if(typeof n!="number"||n<=0)return t;let a=null,r=[];for(let u of t){let d=pr(u.text);d!==null&&(a=d);let s=a===null?null:Ya[a]??0;(s===null||s>=n)&&r.push(u)}return r}function Za(t){let n=typeof t.ts=="number"&&Number.isFinite(t.ts)?new Date(t.ts).toISOString()+" ":"";return"["+t.service+"] "+n+t.text}function fr(t,n){let a=t.map(Za).join(`
`);if(n?.format!=="md")return a;let r=Array.isArray(n.items)?n.items:[];return["# \u805A\u5408\u65E5\u5FD7","","- \u6765\u6E90\uFF1A"+(typeof n.targetLabel=="string"&&n.targetLabel!==""?n.targetLabel+" \xB7 ":"")+(n.target??""),"- \u5BB9\u5668\uFF08"+String(r.length)+"\uFF09\uFF1A"+r.map(d=>d.name).join("\u3001"),"- \u884C\u6570\uFF1A"+String(t.length),"- \u5BFC\u51FA\u65F6\u95F4\uFF1A"+new Date().toLocaleString(),"","```text",a,"```",""].join(`
`)}function vr(t,n,a){if(n.length===0)return t;let r=t.concat(n);return r.length>a?r.slice(r.length-a):r}function br(t){let n=t.items,[a,r]=p([]),[u,d]=p("connecting"),[s,c]=p(""),[k,v]=p(!1),[g,b]=p(0),[w,I]=p(!1),[E,P]=p(!1),[y,D]=p("arrival"),[R,H]=p(0),T=B([]),ne=B(new Map),f=B(!1),_=B([]),x=B("arrival"),z=B([]),U=B(null),q=B(null),ae=n.map(A=>A.id).join(","),ke=zt();L(()=>{if(!ke)return;if(n.length===0){d("empty");return}if(typeof EventSource!="function"){d("unsupported");return}d("connecting"),T.current=[],ne.current=new Map,_.current=[],r([]),b(0),I(!1),z.current=[],U.current!==null&&(clearTimeout(U.current),U.current=null);let A=0,oe=0,ee=n.map(X=>{let it=X.composeService===null?X.name:X.composeService,fe=new EventSource(dn("/logs/stream",{target:t.target,id:X.id,tail:100,timestamps:1})),Ne=j=>{if(j.length===0)return;let Z=x.current==="time"?Ht(T.current,j,wn):T.current.concat(j),re=Z.length>Oe?Z.slice(Z.length-Oe):Z;T.current=re,re.length!==Z.length&&I(!0),r(re)},ce=j=>{if(x.current!=="time"){Ne(j);return}z.current=z.current.concat(j),U.current===null&&(U.current=setTimeout(()=>{U.current=null;let Z=z.current;z.current=[],Ne(xn(Z))},yn))},Le=j=>{let re=((ne.current.get(X.id)??"")+j).split(`
`);if(ne.current.set(X.id,re.pop()??""),re.length===0)return;let Se=re.map(ye=>{let be=hr(ye);return{service:it,text:be.text,ts:be.ts}});if(f.current){let ye=_.current.concat(Se);_.current=ye.length>Oe?ye.slice(ye.length-Oe):ye,b(be=>_.current.length-be>=5||be===0?_.current.length:be);return}ce(Se)};return fe.addEventListener("line",j=>{let Z=null;try{Z=JSON.parse(j.data)}catch{return}Z===null||typeof Z!="object"||(typeof Z.d=="string"?Le(Z.d):typeof Z.e=="string"&&Le(Z.e))}),fe.addEventListener("end",()=>{try{fe.close()}catch{}oe+=1,oe>=n.length&&d("closed")}),fe.addEventListener("error",j=>{typeof j.data=="string"&&j.data!==""?d("partial"):d("reconnecting")}),fe.onopen=()=>{A+=1,d("open")},()=>{try{fe.close()}catch{}}});return()=>{for(let X of ee)X()}},[ke,t.target,ae]),L(()=>{if(k)return;let A=q.current;A!==null&&(A.scrollTop=A.scrollHeight)},[k,a]);let $e=()=>{let A=!f.current;if(f.current=A,v(A),A)return;let oe=_.current;if(_.current=[],b(0),oe.length>0){let ee=vr(T.current,oe,Oe);T.current=ee,r(ee)}requestAnimationFrame(()=>{let ee=q.current;ee!==null&&(ee.scrollTop=ee.scrollHeight)})},me=s.trim().toLowerCase(),Pe=mr(a,R),_e=me===""?Pe:Pe.filter(A=>A.text.toLowerCase().indexOf(me)>=0||A.service.toLowerCase().indexOf(me)>=0),ze=_e.length>ut?_e.slice(-ut):_e,We=()=>{let A=y==="time"?"arrival":"time";x.current=A,D(A),U.current!==null&&(clearTimeout(U.current),U.current=null);let oe=z.current;if(z.current=[],oe.length>0){let ee=Ht(T.current,oe,wn),X=ee.length>Oe?ee.slice(ee.length-Oe):ee;T.current=X,r(X)}if(A==="time"){let ee=Ht([],T.current,T.current.length);T.current=ee,r(ee)}},ge=A=>{let oe=fr(ze,{format:A,target:t.target,targetLabel:t.targetLabel,items:n}),ee=new Date().toISOString().replace(/[:.]/g,"-").slice(0,19);Xr("docker-logs-"+ee+(A==="md"?".md":".log"),oe)},Fe=()=>u==="open"?"\u5DF2\u8FDE\u63A5 "+String(n.length)+" \u6761\u5BB9\u5668\u65E5\u5FD7\u6D41\uFF08docker logs -f\uFF09":u==="connecting"?"\u6B63\u5728\u8FDE\u63A5\u5BB9\u5668\u65E5\u5FD7\u6D41\u2026":u==="reconnecting"?"\u90E8\u5206\u8FDE\u63A5\u4E2D\u65AD\uFF0C\u6B63\u5728\u81EA\u52A8\u91CD\u8FDE\u2026":u==="partial"?"\u90E8\u5206\u5BB9\u5668\u65E5\u5FD7\u6D41\u51FA\u9519":u==="closed"?"\u5168\u90E8\u5BB9\u5668\u65E5\u5FD7\u6D41\u5DF2\u7ED3\u675F":u==="unsupported"?"\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301 EventSource":u==="empty"?"\u8BE5\u9879\u76EE\u6CA1\u6709\u53EF\u805A\u5408\u7684\u5BB9\u5668":"\u805A\u5408\u65E5\u5FD7";return o("div",{className:"dk_logs",children:[w?e(Y,{kind:"warn",title:"\u805A\u5408\u65E5\u5FD7\u8D85\u8FC7 "+String(Oe)+" \u884C\uFF0C\u5DF2\u4E22\u5F03\u6700\u65E9\u5185\u5BB9"}):null,o("div",{className:"dk_filterBar",children:[o("div",{className:"dk_filterWrap",children:[e("input",{className:"dk_input dk_filterInput",placeholder:"\u8FC7\u6EE4\u670D\u52A1\u540D / \u65E5\u5FD7\u5185\u5BB9\u2026",value:s,onChange:A=>c(A.target.value),onKeyDown:A=>{A.key==="Escape"&&s!==""&&(A.stopPropagation(),c(""))}}),s===""?null:e("button",{type:"button",className:"dk_filterClear",title:"\u6E05\u7A7A\u8FC7\u6EE4",onClick:()=>c(""),children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Be}})},"clear")]}),e("button",{type:"button",className:"dk_pill dk_pillFollow","data-on":k?"0":"1","data-paused":k?"1":void 0,title:k?"\u6062\u590D\u5B9E\u65F6\uFF08\u4F1A\u4E00\u6B21\u6027\u663E\u793A\u6682\u505C\u671F\u95F4\u6512\u4E0B\u7684 "+String(g)+" \u884C\u5E76\u56DE\u5230\u5E95\u90E8\uFF09":"\u6682\u505C\uFF08\u51BB\u7ED3\u5F53\u524D\u753B\u9762\uFF1A\u65B0\u65E5\u5FD7\u7EE7\u7EED\u63A5\u6536\u4F46\u4E0D\u8FFD\u52A0\uFF0C\u907F\u514D\u8BFB\u5C4F\u88AB\u9876\u8D70\uFF09",onClick:$e,children:k?g>0?"\u5DF2\u6682\u505C +"+String(g):"\u5DF2\u6682\u505C":"\u5B9E\u65F6"}),e("button",{type:"button",className:"dk_pill","data-on":E?"1":"0",title:E?"\u9690\u85CF\u6BCF\u884C\u65F6\u95F4\u6233":"\u663E\u793A\u6BCF\u884C\u65F6\u95F4\u6233\uFF08\u65F6\u95F4\u6233\u59CB\u7EC8\u968F\u6D41\u63A5\u6536\uFF0C\u53EA\u5F71\u54CD\u663E\u793A\uFF09",onClick:()=>P(A=>!A),children:"\u65F6\u95F4\u6233"}),e("button",{type:"button",className:"dk_pill","data-on":y==="time"?"1":"0",title:y==="time"?"\u6309\u5230\u8FBE\u987A\u5E8F\u663E\u793A\uFF08\u5B9E\u65F6\u8DDF\u968F\u96F6\u5EF6\u8FDF\uFF09":"\u6309\u5BB9\u5668\u65F6\u95F4\u6233\u5408\u5E76\uFF08\u8DE8\u5BB9\u5668\u6210\u4E00\u6761\u771F\u65F6\u95F4\u7EBF\uFF0C\u4EE3\u4EF7\u7EA6 "+String(yn)+"ms \u5EF6\u8FDF\uFF09",onClick:()=>We(),children:y==="time"?"\u6309\u65F6\u95F4":"\u6309\u5230\u8FBE"}),e("select",{className:"dk_select dk_selectSm",value:String(R),title:"\u6309\u65E5\u5FD7\u7EA7\u522B\u8FC7\u6EE4\uFF08\u65E0\u7EA7\u522B\u524D\u7F00\u7684\u884C\u59CB\u7EC8\u4FDD\u7559\uFF09",onChange:A=>H(Number(A.target.value)),children:[e("option",{value:"0",children:"\u5168\u90E8\u7EA7\u522B"},"all"),e("option",{value:"3",children:"WARN+"},"warn"),e("option",{value:"4",children:"ERROR+"},"error")]}),e("button",{type:"button",className:"dk_chip",disabled:ze.length===0,title:"\u5BFC\u51FA\u5F53\u524D\u663E\u793A\u5185\u5BB9\u4E3A .log\uFF08\u7EAF\u6587\u672C\uFF09",onClick:()=>ge("log"),children:"\u2B07 .log"}),e("button",{type:"button",className:"dk_chip",disabled:ze.length===0,title:"\u5BFC\u51FA\u5F53\u524D\u663E\u793A\u5185\u5BB9\u4E3A .md\uFF08\u5E26\u6765\u6E90\u4E0E\u884C\u6570\u8868\u5934\uFF0C\u9002\u5408\u5F53\u5DE5\u5355\u9644\u4EF6\uFF09",onClick:()=>ge("md"),children:"\u2B07 .md"}),e("span",{className:"dk_filterCount",children:me===""&&R===0?String(a.length)+" \u884C":String(_e.length)+" / "+String(a.length)+" \u884C"})]}),e("div",{className:"dk_followState","data-state":u==="open"?"open":u==="closed"?"closed":"connecting",children:Fe()}),e("div",{className:"dk_logBody",ref:q,onContextMenu:A=>ur(A,q.current,{target:t.target,targetLabel:t.targetLabel??"",containers:n,filtered:me!==""}),children:[ze.length===0?e("div",{className:"dk_logLine",children:u==="open"?"\u7B49\u5F85\u65E5\u5FD7\u2026":Fe()},"empty"):ze.map((A,oe)=>Oa(A,oe,me,E))]})]})}function Qa(t,n){let a=typeof t.image=="string"?t.image:"",r=typeof t.composeProject=="string"?t.composeProject:"";return o("span",{className:"dk_activityItem","data-action":String(t.action??"").split(":")[0].trim(),title:r===""?a:a+" \xB7 "+r,children:[e("span",{className:"dk_activityTime",children:pa(t.time)}),e("span",{className:"dk_activityName",children:t.name}),e("span",{className:"dk_activityAction",children:ma(t)})]},String(n)+String(t.name)+String(t.time))}function eo(t){let n=t.open===!0,a=Array.isArray(t.events)?t.events:[],r=a.slice(0,ka);return o("div",{className:"dk_activity","data-open":n?"1":"0",children:[e("button",{type:"button",className:"dk_activityHead","aria-expanded":n,title:"\u5BB9\u5668\u4E8B\u4EF6\u6D3B\u52A8\uFF08docker events\uFF09\uFF1A\u70B9\u51FB\u6298\u53E0 / \u5C55\u5F00",onClick:t.onToggle,children:[e("span",{className:"dk_activityTitle",children:"\u6D3B\u52A8"}),e("span",{className:"dk_activityState","data-state":t.status??"",children:t.statusText??""}),e("span",{className:"dk_headerSpacer"}),e("span",{className:"dk_hint",children:a.length===0?"\u6682\u65E0\u4E8B\u4EF6":"\u6700\u8FD1 "+String(r.length)+" / "+String(a.length)+" \u6761"}),e("span",{className:"dk_activityChevron",dangerouslySetInnerHTML:{__html:Vn}})]}),n===!1?null:r.length===0?e("div",{className:"dk_activityEmpty",children:"\u6682\u65E0\u4E8B\u4EF6\uFF08\u5BB9\u5668\u7684 start / die / health \u7B49\u52A8\u4F5C\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\uFF09"}):e("div",{className:"dk_activityList",children:r.map(Qa)})]})}function to(t){let n=t.info,a=Array.isArray(t.presets)?t.presets:[],r=a.some(u=>u.count>0)||t.count>0;return o("div",{className:"dk_pickBar",children:[o("div",{className:"dk_pickRow",children:[e("span",{className:"dk_pickCount",children:"\u5DF2\u9009 "+String(t.count)+" \u4E2A\u5BB9\u5668"}),n.hint===""?null:e("span",{className:"dk_hint dk_pickHint",children:n.hint}),e("span",{className:"dk_headerSpacer"}),e("button",{type:"button",className:"dk_btn dk_btnPrimary",disabled:n.canRun!==!0,title:n.hint!==""?n.hint:n.canRun===!0?"\u628A\u6240\u9009\u5BB9\u5668\u7684\u65E5\u5FD7\u805A\u5408\u6210\u4E00\u6761\u6D41":"\u81F3\u5C11\u9009\u62E9 2 \u4E2A\u5BB9\u5668",onClick:t.onRun,children:"\u805A\u5408\u65E5\u5FD7"}),e("button",{type:"button",className:"dk_btn",onClick:t.onCancel,children:"\u53D6\u6D88"})]}),r?o("div",{className:"dk_pickPresets",children:[e("span",{className:"dk_pickPresetsLabel",children:"\u6309\u6761\u4EF6\u9009\u4E2D"}),...a.filter(u=>u.count>0).map(u=>e("button",{type:"button",className:"dk_chip",title:"\u5728\u5F53\u524D\u7B5B\u9009\u7ED3\u679C\u91CC\u52FE\u9009\u300C"+u.label+"\u300D\u7684\u5BB9\u5668\uFF08\u6700\u591A "+String(t.max??pn)+" \u4E2A\u6D41\uFF09"+(u.over>0?"\uFF1B\u53E6\u6709 "+String(u.over)+" \u4E2A\u8D85\u51FA\u4E0A\u9650\u4E0D\u4F1A\u9009\u4E2D":""),onClick:()=>t.onPreset(u.key),children:u.label+" "+String(u.count)},u.key)),t.count>0?e("button",{type:"button",className:"dk_chip dk_chipQuiet",title:"\u6E05\u7A7A\u52FE\u9009",onClick:t.onClear,children:"\u6E05\u7A7A"},"clear"):null,t.notice===""?null:e("span",{className:"dk_hint dk_pickNotice",children:t.notice})]}):null]})}function no(t){return o("div",{className:"dk_detail",children:[o("div",{className:"dk_header dk_headerDetail",children:[e($,{icon:nt,title:"\u8FD4\u56DE\u5BB9\u5668\u5217\u8868\uFF08\u9000\u51FA\u9009\u62E9\u6001\uFF09",onClick:t.onBack},"back"),e("span",{className:"dk_projectIcon",dangerouslySetInnerHTML:{__html:ta}}),e("span",{className:"dk_detailTitle",children:"\u805A\u5408\u65E5\u5FD7 \xB7 "+String(t.items.length)+" \u4E2A\u5BB9\u5668"}),e("span",{className:"dk_detailSub",children:t.targetLabel??""}),e("span",{className:"dk_headerSpacer"}),t.docked===!0?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:t.onClose,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Be}})},"close")]}),e("div",{className:"dk_detailBody",children:e(br,{target:t.target,targetLabel:t.targetLabel,items:t.items})})]})}function ro(t){let n=t.collapsed===!0;return o("div",{className:"dk_drawer","data-collapsed":n?"1":void 0,style:n||t.height===null?void 0:{height:String(t.height)+"px"},children:[e("div",{className:"dk_drawerResize",title:"\u62D6\u52A8\u8C03\u6574\u7EC8\u7AEF\u9AD8\u5EA6\uFF08\u53CC\u51FB\u6298\u53E0 / \u5C55\u5F00\uFF09",onMouseDown:t.onResizeStart,onDoubleClick:t.onToggleCollapse},"resize"),o("div",{className:"dk_drawerHead",children:[e("span",{className:"dk_drawerIcon",dangerouslySetInnerHTML:{__html:ea}}),e("span",{className:"dk_drawerTitle",title:t.label,children:t.label}),e("span",{className:"dk_drawerHint",children:n?"\u5DF2\u6298\u53E0 \xB7 \u4F1A\u8BDD\u4FDD\u6301\u8FD0\u884C":"\u7531\u7EC8\u7AEF\u9762\u677F\u627F\u8F7D \xB7 \u6298\u53E0\u4FDD\u7559\u4F1A\u8BDD"}),e("span",{className:"dk_headerSpacer"}),e("button",{type:"button",className:"dk_iconBtn dk_drawerFold",title:n?"\u5C55\u5F00\u7EC8\u7AEF\uFF08\u4F1A\u8BDD\u672A\u4E2D\u65AD\uFF09":"\u6298\u53E0\u7EC8\u7AEF\uFF08\u4F1A\u8BDD\u4FDD\u6301\u8FD0\u884C\uFF09",onClick:t.onToggleCollapse,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Vn}})},"fold"),e("button",{type:"button",className:"dk_iconBtn",title:"\u7ED3\u675F\u7EC8\u7AEF\u4F1A\u8BDD\u5E76\u6536\u8D77\u62BD\u5C49",onClick:t.onClose,children:e("span",{dangerouslySetInnerHTML:{__html:Be}})},"close")]}),e("div",{className:"dk_drawerBody",ref:t.hostRef})]})}let Nn={view:"containers",search:"",stateFilter:"all",all:!0,detail:null,activityOpen:!0};function at(t,n){let[a,r]=p(()=>t in Nn?Nn[t]:n);return L(()=>{Nn[t]=a},[t,a]),[a,r]}let _r=h.createContext(!0);function zt(){return h.useContext(_r)}let yr="@hyzyn/dsh-docker#session-probe",xr="session-probe",Ft=null;function ao(t){if(t==null)return String(t);if(Array.isArray(t))return"\u6570\u7EC4\uFF08\u957F\u5EA6 "+String(t.length)+"\uFF09";let n=typeof t;if(n!=="object")return n+" "+String(t).slice(0,40);let a=Object.keys(t);return a.length===0?"\u5BF9\u8C61\uFF08\u65E0\u952E\uFF09":"\u5BF9\u8C61\uFF0C\u952E\uFF1A"+a.slice(0,8).join(", ")+(a.length>8?" \u2026 \u5171 "+String(a.length):"")}function Vt(t){try{let n=JSON.stringify(t);return n===void 0?"\uFF08\u65E0\u6CD5\u5E8F\u5217\u5316\uFF09":n.length>220?n.slice(0,220)+"\u2026":n}catch{return"\uFF08\u5E8F\u5217\u5316\u5931\u8D25\uFF1A\u53EF\u80FD\u6709\u5FAA\u73AF\u5F15\u7528\uFF09"}}function oo(t){let[,n]=p(0);return L(()=>{let a=setInterval(()=>n(r=>r+1),1e3);return()=>clearInterval(a)},[]),t.at===0?"\uFF08\u8FD8\u6CA1\u6536\u5230\u8FC7\uFF09":String(Math.round((Date.now()-t.at)/1e3))+" \u79D2\u524D"}function wr(t){let n=B(0);n.current+=1;let a=null;try{a=t.useTabInfo()}catch{}let r=typeof t.sessionId=="string"?t.sessionId:"",u=k=>{if(k==null)return{text:"\u5FEB\u7167\u662F "+String(k),count:null,last:""};if(Array.isArray(k))return{text:"\u6570\u7EC4\uFF0C\u957F\u5EA6 "+String(k.length),count:k.length,last:k.length===0?"":Vt(k[k.length-1])};if(typeof k!="object")return{text:typeof k+" "+String(k).slice(0,60),count:null,last:""};let v=Object.keys(k);for(let g of["events","entries","items","rows"]){let b=k[g];if(Array.isArray(b))return{text:"\u5FEB\u7167\u952E\uFF1A"+v.join(", ")+" \uFF5C "+g+".length="+String(b.length),count:b.length,last:b.length===0?"":Vt(b[b.length-1])}}return{text:"\u5FEB\u7167\u952E\uFF1A"+v.join(", ")+"\uFF08\u6CA1\u627E\u5230\u4E8B\u4EF6\u6570\u7EC4\uFF09",count:null,last:""}},[d,s]=p({mode:"\u672A\u8BA2\u9605",calls:0,at:0,window:null,session:null,error:""});L(()=>{if(r==="")return;let k=null,v=!1,g=()=>{let b=ve?.binding?.(r)?.eventSource;if(b==null)return{window:null,session:null};let w=null;try{w=typeof b.getSnapshot=="function"?b.getSnapshot():null}catch{w=null}let I=null;try{let E=ve.binding(r)?.session;E!=null&&typeof E.getSnapshot=="function"&&(I=E.getSnapshot())}catch{I=null}return{window:u(w),session:I===null?null:{text:ao(I),last:Vt(I)}}};try{let b=ve?.binding?.(r)?.eventSource;if(b==null||typeof b.subscribe!="function"){s(E=>({...E,mode:"\uFF08\u62FF\u4E0D\u5230 source.subscribe\uFF09"}));return}let w=g();s({mode:"subscribe(cb)",calls:0,at:0,window:w.window,session:w.session,error:""});let I=b.subscribe(()=>{if(v)return;let E=g();s(P=>({mode:P.mode,calls:P.calls+1,at:Date.now(),window:E.window,session:E.session,error:""}))});k=typeof I=="function"?I:null}catch(b){s({mode:"\u8BA2\u9605\u629B\u9519",calls:0,at:0,window:null,session:null,error:b instanceof Error?b.message:String(b)})}return()=>{if(v=!0,typeof k=="function")try{k()}catch{}}},[r]);let c=[["sessionId",r===""?"\uFF08\u7A7A\uFF09":r],["tab.visible",a===null?"\u2014":String(a.tab?.visible)],["\u672C\u7EC4\u4EF6\u5DF2\u6E32\u67D3",String(n.current)+" \u6B21\uFF08\u4E0D\u542B\u5B9A\u65F6\u5668\uFF09"],["\u2014\u2014\u2014\u2014 \u4E8B\u4EF6\u7A97\u53E3\u5FEB\u7167\uFF08\u8BA2\u9605\u90A3\u4E00\u523B\u8BFB\u5230\u7684\uFF09 \u2014\u2014\u2014\u2014",""],["eventSource.getSnapshot()",d.window===null?"\uFF08\u672A\u8BFB\u5230\uFF09":d.window.text],["\u7A97\u53E3\u91CC\u7684\u4E8B\u4EF6\u6761\u6570",d.window===null||d.window.count===null?"\u2014":String(d.window.count)],["\u6700\u540E\u4E00\u6761\u4E8B\u4EF6",d.window===null||d.window.last===""?"\u2014":d.window.last],["\u2014\u2014\u2014\u2014 \u8BA2\u9605\u56DE\u8C03\uFF08\u5B83\u53D8\u8FC7\u5417\uFF09 \u2014\u2014\u2014\u2014",""],["\u8BA2\u9605\u65B9\u5F0F / \u56DE\u8C03\u6B21\u6570",d.mode+" \uFF5C \u56DE\u8C03 "+String(d.calls)+" \u6B21"+(d.error===""?"":"\uFF08"+d.error+"\uFF09")],["\u56DE\u8C03\u540E\u7684\u4E8B\u4EF6\u6761\u6570",d.window===null||d.window.count===null?"\u2014":String(d.window.count)],["\u56DE\u8C03\u540E\u7684\u6700\u540E\u4E00\u6761",d.window===null||d.window.last===""?"\u2014":d.window.last],["\u2014\u2014\u2014\u2014 binding.session \u7684\u5FEB\u7167\uFF08\u82E5\u6709\uFF09 \u2014\u2014\u2014\u2014",""],["session.getSnapshot()",d.session===null?"\uFF08\u6CA1\u6709\u8FD9\u4E2A\u65B9\u6CD5\uFF09":d.session.text],["session \u5FEB\u7167\u5185\u5BB9",d.session===null?"\u2014":d.session.last],["\u2014\u2014\u2014\u2014 \u4F1A\u8BDD\u4F5C\u7528\u57DF\u94A9\u5B50\u7684\u5F62\u53C2\u4E2A\u6570\uFF08\u5DE5\u5382\uFF0C\u4E0D\u662F\u666E\u901A hook\uFF09 \u2014\u2014\u2014\u2014",""],["useChat / useConversation",String(t.useChat?.length??"\u2014")+" / "+String(t.useConversation?.length??"\u2014")],["useTrajectory / useProjection",String(t.useTrajectory?.length??"\u2014")+" / "+String(t.useProjection?.length??"\u2014")]];return o("div",{className:"dk_spike",children:[e("div",{className:"dk_spikeTitle",children:"\u4F1A\u8BDD\u4E8B\u4EF6\u7A97\u53E3\u63A2\u9488 v3\uFF08spike \xB7 \u65B9\u6848 B\uFF09"}),e("div",{className:"dk_spikeHint",children:"\u5173\u952E\u662F\u300C\u56DE\u8C03\u6B21\u6570\u300D\u4E0E\u300C\u56DE\u8C03\u540E\u7684\u6761\u6570\u300D\uFF1A\u7528\u65E5\u5FD7\u53F3\u952E\u300C\u76F4\u63A5\u53D1\u9001\u5230\u5F53\u524D\u4F1A\u8BDD\u300D\u8BA9 Agent \u8DD1\u8D77\u6765\uFF0C\u5B83\u4EEC\u5E94\u5F53\u53D8\u5316\u3002"}),...c.map(([k,v])=>o("div",{className:"dk_spikeRow",children:[e("span",{className:"dk_spikeKey",children:k}),e("span",{className:"dk_spikeVal",children:v===""?"\u2014":String(v)})]},k)),o("div",{className:"dk_spikeRow",children:[e("span",{className:"dk_spikeKey",children:"\u6700\u8FD1\u4E00\u6B21\u56DE\u8C03\u8DDD\u4ECA"}),e("span",{className:"dk_spikeVal",children:e(oo,{at:d.at})})]},"age")]})}function Kt(t,n){return t.length<=n?t:t.slice(0,n)+" \u2026\uFF08\u622A\u65AD\uFF09"}function Ye(t,n=600){if(typeof t=="string")return Kt(t,n);if(Array.isArray(t)){let a=t.map(r=>Ye(r,n)).filter(r=>r!=="");return Kt(a.join(`
`),n)}return t==null||typeof t!="object"?"":typeof t.text=="string"?Kt(t.text,n):t.content!==void 0?Ye(t.content,n):t.message!==void 0?Ye(t.message,n):Kt(Vt(t),n)}function Nr(t,n=40){let a=Array.isArray(t)?t:[],r=0;for(let c=a.length-1;c>=0;c-=1)if(a[c]?.event?.type==="turn/start"){r=c;break}let u=[],d=new Map,s=(c,k,v)=>{let g=d.get(c);if(g===void 0){let b={kind:k,text:v};d.set(c,b),u.push(b);return}g.text+=v};for(let c=r;c<a.length;c+=1){let k=a[c],v=k?.event;if(v==null)continue;if(k.type==="transient"){if(v.type!=="assistant/live-chunk")continue;let b=v.data??{},w=b.chunk??{},I=String(b.attemptId??"")+":"+String(b.step??"")+":"+String(w.index??"");if(w.type==="text-delta"&&typeof w.text=="string")s("t|"+I,"text",w.text);else if(w.type==="reasoning-delta"&&typeof w.text=="string")s("r|"+I,"reasoning",w.text);else if(w.type==="tool-call-delta"){let E="c|"+String(w.id??I),P=d.get(E);if(P===void 0){let y={kind:"tool",name:typeof w.name=="string"&&w.name!==""?w.name:"\uFF08\u5DE5\u5177\uFF09",args:typeof w.argumentsDelta=="string"?w.argumentsDelta:""};d.set(E,y),u.push(y)}else typeof w.name=="string"&&w.name!==""&&(P.name=w.name),typeof w.argumentsDelta=="string"&&(P.args+=w.argumentsDelta)}continue}let g=v.data??{};v.type==="user/message"?u.push({kind:"user",text:Ye(g)}):v.type==="assistant/message"?u.push({kind:"text",text:Ye(g.message??g)}):v.type==="tool/call"?u.push({kind:"tool",name:typeof g.name=="string"?g.name:"\uFF08\u5DE5\u5177\uFF09",args:typeof g.arguments=="string"?g.arguments:""}):v.type==="tool/result"?u.push({kind:"result",text:Ye(g.message??g),failed:g.error!==void 0}):v.type==="turn/end"&&u.push({kind:"end",reason:typeof g.reason?.kind=="string"?g.reason.kind:"\u7ED3\u675F"})}return u.length<=n?u:u.slice(u.length-n)}let Sn=600;function Sr(t,n){let a=Array.isArray(t)?t:[],r=n?.change,u=Array.isArray(n?.entries)?n.entries:null,d=r!=null&&Array.isArray(r.entries),s;return d&&a.length>0?r.kind==="append"?s=a.concat(r.entries):r.kind==="prepend"?s=a:s=r.entries.slice():u!==null?s=u.slice():d?s=r.kind==="append"?a.concat(r.entries):r.entries.slice():s=a,s.length>Sn?s.slice(s.length-Sn):s}let gt={revision:0,listeners:new Set};function Cr(){gt.revision+=1;for(let t of Array.from(gt.listeners))try{t(gt.revision)}catch{}}function Tr(){try{let t=ve?.list?.getSnapshot?.()?.current;return typeof t=="string"?t:""}catch{return""}}function io(t){let[n,a]=p(()=>typeof t=="string"&&t!==""?t:Tr());return L(()=>{if(typeof t=="string"&&t!==""){a(t);return}let r=ve?.list;if(r===void 0||typeof r.subscribe!="function")return;let u=()=>a(Tr());return u(),r.subscribe(u)},[t]),n}function Lr(t){return t==="running"?"\u6B63\u5728\u5206\u6790\u2026":t==="done"?"\u5DF2\u5B8C\u6210":t==="stopped"?"\u5DF2\u4E2D\u65AD":t==="unavailable"?"\u62FF\u4E0D\u5230\u4F1A\u8BDD\u4E8B\u4EF6\u6E90":"\u7B49\u5F85\u4E2D"}function Er(t){let n=Array.isArray(t)?t:[],a=n.length===0?null:n[n.length-1];return a===null?"idle":a.kind!=="end"?"running":a.reason==="completed"?"done":"stopped"}function lo(t,n){let[a,r]=p({items:[],status:"idle"});return L(()=>{if(n!==!0||t===""){r({items:[],status:"idle"});return}let u=null;try{u=ve?.binding?.(t)?.eventSource??null}catch{u=null}if(u===null||typeof u.subscribe!="function"){r({items:[],status:"unavailable"});return}let d=[],s=()=>{let k=null;try{k=u.getSnapshot()}catch{k=null}d=Sr(d,k);let v=Nr(d);r({items:v,status:Er(v)})};s();let c=null;try{let k=u.subscribe(s);c=typeof k=="function"?k:null}catch{}return()=>{if(typeof c=="function")try{c()}catch{}}},[t,n]),a}let so={user:"\u6211",reasoning:"\u63A8\u7406",text:"\u6B63\u6587",tool:"\u8C03\u7528",result:"\u7ED3\u679C",end:"\u6536\u5C3E"};function co(t){let n=t.item,a=so[n.kind]??n.kind;return n.kind==="end"?o("div",{className:"dk_agentItem","data-kind":"end",children:[e("span",{className:"dk_agentTag",children:a}),e("span",{className:"dk_agentText",children:"\u5B8C\u6210\uFF08"+String(n.reason)+"\uFF09"})]}):n.kind==="tool"?o("div",{className:"dk_agentItem","data-kind":"tool",children:[e("span",{className:"dk_agentTag",children:a}),e("span",{className:"dk_agentTool",children:n.name+(n.args===""?"":" "+n.args)})]}):o("div",{className:"dk_agentItem","data-kind":n.kind,children:[e("span",{className:"dk_agentTag",children:a+(n.failed===!0?"\uFF08\u5931\u8D25\uFF09":"")}),e("span",{className:"dk_agentText",children:n.text===""?"\uFF08\u7A7A\uFF09":n.text})]})}function Ir(t){let n=zt(),a=io(t.sessionId),r=lo(a,n),[u,d]=p(!1),s=B(null);L(()=>{let k=()=>d(!0);return gt.listeners.add(k),()=>{gt.listeners.delete(k)}},[]),L(()=>{let k=s.current;k!=null&&typeof k.scrollTop=="number"&&(k.scrollTop=k.scrollHeight)},[r.items.length,u]);let c=r.items.length===0?r.status==="unavailable"?"\u62FF\u4E0D\u5230\u4F1A\u8BDD\u4E8B\u4EF6\u6E90\uFF08binding.eventSource\uFF09\u2014\u2014\u62BD\u5C49\u6682\u65F6\u53EA\u80FD\u663E\u793A\u8FD9\u6761\u72B6\u6001\u3002":"\u8FD8\u6CA1\u6709\u5185\u5BB9\u3002\u7528\u65E5\u5FD7\u53F3\u952E\u300C\u76F4\u63A5\u53D1\u9001\u5230\u5F53\u524D\u4F1A\u8BDD\u300D\uFF0C\u8FD9\u91CC\u4F1A\u8DDF\u7740\u6EDA\u3002":r.items.map((k,v)=>e(co,{item:k},"item-"+String(v)));return o("div",{className:"dk_agent","data-status":r.status,"data-open":u?"1":void 0,children:[o("div",{className:"dk_agentHead",children:[e("span",{className:"dk_agentDot","data-status":r.status}),e("span",{className:"dk_agentTitle",children:"Agent"}),e("span",{className:"dk_agentSub",children:Lr(r.status)}),e("span",{className:"dk_agentGrow"}),t.conversationHidden===!0?e("span",{className:"dk_agentHint",title:"\u4F1A\u8BDD\u5728\u9762\u677F\u540E\u9762\uFF1A\u5173\u6389\u6216\u6700\u5C0F\u5316\u9762\u677F/\u7EC8\u7AEF\u5373\u53EF\u770B\u5230",children:"\u4F1A\u8BDD\u5728\u522B\u5904"}):null,e("button",{type:"button",className:"dk_btn dk_btnSm",onClick:()=>d(k=>!k),children:u?"\u6536\u8D77":"\u5C55\u5F00"})]}),e("div",{className:"dk_agentBody",ref:s,hidden:u!==!0,children:c})]})}function Gt(t){let[n,a]=p(null),[r,u]=p([]),d=typeof t.initialTarget=="string"?t.initialTarget.trim():"",s=B(d!==""?d:$r()),[c,k]=p(s.current),v=t.sessionHint!==void 0&&(t.initialTarget??"")==="",[g,b]=at("view","containers"),[w,I]=p([]),[E,P]=p(""),y=B(""),D=se(i=>{y.current=i,P(i)},[]),[R,H]=p([]),[T,ne]=p([]),[f,_]=p([]),[x,z]=p([]),[U,q]=p(null),[ae,ke]=p(null),[$e,me]=p(null),[Pe,_e]=p(null),[ze,We]=p(!1),[ge,Fe]=p(!1),[A,oe]=p([]),[ee,X]=p(""),[it,fe]=p(!1),[Ne,ce]=p(!1),[Le,j]=p(""),[Z,re]=p(""),[Se,ye]=at("all",!0),[be,Ve]=at("search",""),[Je,Tn]=at("stateFilter","all"),[Ee,Wt]=p(!1),[Jt,ft]=p([]),vt=zt(),[Ke,he]=p(""),[Ut,Ln]=at("activityOpen",!0),bt=B(null),qt=B(""),[Ue,je]=at("detail",null),[Xt,Yt]=p(0),[xe,Ce]=p(null),[$t,Zt]=p(!1),[Qt,Ze]=p({}),[en,En]=p(""),[N,M]=p(""),[S,F]=p(""),V=B(!0),W=B(null);W.current===null&&(W.current=da());let[de,J]=p(null),K=B(null),[G,ue]=p(!1),[qe,bo]=p(null),[_o,In]=p(!1),Pr=B(null),On=B(!1);L(()=>()=>{V.current=!1},[]),L(()=>{if(de===null)return;let i=K.current;if(i===null)return;let m=null;try{m=Xe.mount(i,de.options)}catch(C){re("\u7EC8\u7AEF\u542F\u52A8\u5931\u8D25\uFF1A"+(C instanceof Error?C.message:String(C))),J(null);return}return()=>{try{m?.()}catch{}}},[de]);let yo=i=>{if(i.button!==void 0&&i.button!==0)return;let m=i.currentTarget.parentElement,C=Pr.current;if(m===null||C===null)return;i.preventDefault();let pe=i.clientY,ie=m.getBoundingClientRect().height,te=Math.max(160,Math.round(C.getBoundingClientRect().height*.75)),He=we=>{let Ae=Math.round(ie+(pe-we.clientY));bo(Math.min(te,Math.max(160,Ae)))},ln=()=>{document.removeEventListener("mousemove",He),document.removeEventListener("mouseup",ln),document.body.style.userSelect=""};document.body.style.userSelect="none",document.addEventListener("mousemove",He),document.addEventListener("mouseup",ln)},Ge=()=>{if(de===null){t.onClose();return}In(!0)};L(()=>{Q.config().then(i=>{let m=i.config;a(m),Array.isArray(m.targets)&&m.targets.length>0&&k(C=>zn(m.targets,C,s.current,v)),Fn(m)}).catch(i=>j(i.message)),Q.targets().then(i=>{u(i.targets??[]),$n=i.targets??[],k(m=>zn(i.targets??[],m,s.current,v)),s.current=""}).catch(()=>{})},[]),L(()=>{c!==""&&Zr(c)},[c]);let _t=se(()=>{if(c==="")return Promise.resolve();let i=W.current.next();return ce(!0),Q.containers(c,Se).then(m=>{!V.current||!W.current.isCurrent(i)||(I(m.containers??[]),D(c),j(""))}).catch(m=>{!V.current||!W.current.isCurrent(i)||(y.current!==c&&I([]),D(c),j(m.message))}).finally(()=>{V.current&&W.current.isCurrent(i)&&ce(!1)})},[c,Se]),yt=se(()=>{if(c==="")return Promise.resolve();let i=W.current.next();return ce(!0),Q.images(c).then(m=>{!V.current||!W.current.isCurrent(i)||(ne(m.images??[]),D(c),j(""))}).catch(m=>{!V.current||!W.current.isCurrent(i)||(y.current!==c&&ne([]),D(c),j(m.message))}).finally(()=>{V.current&&W.current.isCurrent(i)&&ce(!1)})},[c]),tn=se(()=>{if(c==="")return Promise.resolve();let i=W.current.next();return ce(!0),Q.networks(c).then(m=>{!V.current||!W.current.isCurrent(i)||(_(m.networks??[]),D(c),j(""))}).catch(m=>{!V.current||!W.current.isCurrent(i)||(y.current!==c&&_([]),D(c),j(m.message))}).finally(()=>{V.current&&W.current.isCurrent(i)&&ce(!1)})},[c]),nn=se(()=>{if(c==="")return Promise.resolve();let i=W.current.next();return ce(!0),Q.volumes(c).then(m=>{!V.current||!W.current.isCurrent(i)||(z(m.volumes??[]),D(c),j(""))}).catch(m=>{!V.current||!W.current.isCurrent(i)||(y.current!==c&&z([]),D(c),j(m.message))}).finally(()=>{V.current&&W.current.isCurrent(i)&&ce(!1)})},[c]),Rn=se(()=>{if(r.length===0)return H([]),Promise.resolve();let i=W.current.next();ce(!0),H(r.map(ie=>({name:ie.name,kind:ie.kind,label:ie.label,containers:[],attention:null,error:"",loaded:!1})));let m=r.length,C=()=>{m-=1,m===0&&V.current&&W.current.isCurrent(i)&&ce(!1)},pe=ie=>Q.attention(ie).then(te=>{!V.current||!W.current.isCurrent(i)||H(He=>Tt(He,ie,{attention:te.items??[]}))}).catch(()=>{!V.current||!W.current.isCurrent(i)||H(te=>Tt(te,ie,{attention:null}))});return Promise.all(r.map(ie=>(pe(ie.name),Q.containers(ie.name,!0).then(te=>{!V.current||!W.current.isCurrent(i)||H(He=>Tt(He,ie.name,{containers:te.containers??[],error:"",loaded:!0}))}).catch(te=>{!V.current||!W.current.isCurrent(i)||H(He=>Tt(He,ie.name,{error:te instanceof Error?te.message:String(te),loaded:!0}))}).finally(C))))},[r]);L(()=>{bt.current=_t},[_t]);let xo=se(()=>Yt(i=>i+1),[]),Re=se(()=>{Fe(!1),oe([]),X(""),fe(!1)},[]),wo=()=>{if(ge){Re();return}oe([]),fe(!1),Fe(!0)},No=i=>oe(m=>aa(m,i.id));L(()=>{if(!ge)return;let i=m=>{m.key==="Escape"&&Re()};return document.addEventListener("keydown",i),()=>document.removeEventListener("keydown",i)},[ge,Re]),L(()=>{ge&&oe(i=>oa(i,w))},[w,ge]);let So=i=>{k(i),j(""),b("containers"),je(null),Re(),Ze({}),t.onTargetChange?.(Me(i))},Co=(i,m)=>{k(i),j(""),b("containers"),Re(),Ze({}),je({id:m.id,tab:"overview",item:m}),t.onTargetChange?.(Me(i))},xt=se(()=>{g==="overview"?Rn():g==="images"?yt():g==="networks"?tn():g==="volumes"?nn():_t(),Yt(i=>i+1)},[g,Rn,_t,yt,tn,nn]);L(()=>{g!=="overview"&&c!==""&&xt()},[c,Se,g]);let To=r.map(i=>i.name).join("\0");L(()=>{g==="overview"&&Rn()},[g,To]),L(()=>{if(!Ee||g!=="overview"&&(c===""||g==="images"))return;let i=setInterval(xt,Math.max(2,n?.pollIntervalSec??5)*1e3);return()=>clearInterval(i)},[Ee,xt,c,n,g]);let Lo=()=>Ke==="open"?"\u5B9E\u65F6\u63A5\u6536\u4E2D\uFF08docker events\uFF09":Ke==="connecting"?"\u6B63\u5728\u8FDE\u63A5\u4E8B\u4EF6\u6D41\u2026":Ke==="reconnecting"?"\u8FDE\u63A5\u4E2D\u65AD\uFF0C\u6B63\u5728\u81EA\u52A8\u91CD\u8FDE\u2026":Ke==="closed"?"\u4E8B\u4EF6\u6D41\u5DF2\u65AD\u5F00":Ke==="unsupported"?"\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301 EventSource":"\u4E8B\u4EF6\u6D41";L(()=>{if(!vt||g!=="containers"||c==="")return;if(typeof EventSource!="function"){he("unsupported");return}qt.current!==c&&(qt.current=c,ft([])),he("connecting");let i=fa(ga,()=>{let we=bt.current;we!==null&&we()}),m=!1,C=new EventSource(dn("/events/stream",{target:c})),pe=!1,ie=()=>{if(!pe){pe=!0;try{C.close()}catch{}}},te=we=>{let Ae=null;try{Ae=JSON.parse(we.data)}catch{return}Ae===null||typeof Ae!="object"||(ft(sn=>ha(sn,Ae,ua)),i.schedule())},He=we=>{let Ae=null;try{Ae=JSON.parse(we.data)}catch{}let sn=Ae!==null&&typeof Ae.code=="number"?Ae.code:null;he("closed"),re("\u4E8B\u4EF6\u6D41\u5DF2\u7ED3\u675F"+(sn===null?"":"\uFF08\u9000\u51FA\u7801 "+String(sn)+"\uFF09")+"\uFF0C\u5217\u8868\u56DE\u5230 AUTO REFRESH / \u624B\u52A8\u5237\u65B0"),ie()},ln=we=>{if(typeof we.data=="string"&&we.data!==""){he("closed"),ie();return}he(C.readyState===2?"closed":"reconnecting")};return C.addEventListener("event",te),C.addEventListener("end",He),C.addEventListener("error",ln),C.onopen=()=>{if(he("open"),m){let we=bt.current;we!==null&&we()}m=!0},()=>{ie(),i.cancel()}},[vt,g,c]),L(()=>{if(Z==="")return;let i=setTimeout(()=>re(""),4e3);return()=>clearTimeout(i)},[Z]),L(()=>(Pt=t.carrier==="tab"?"":" \xB7 \u4F1A\u8BDD\u5728\u9762\u677F\u540E\u9762\uFF1A\u5173\u6389\u6216\u6700\u5C0F\u5316\u9762\u677F/\u7EC8\u7AEF\u5373\u53EF\u770B\u5230",()=>{Pt=""}),[t.carrier]);let rn=(i,m)=>{let C=Hn(i.name);navigator.clipboard.writeText(C).then(()=>{re("\u5DF2\u590D\u5236\uFF1A"+C+(m===void 0?"":"\uFF08"+m+"\uFF09"))}).catch(()=>re("\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u6267\u884C\uFF1A"+C))},Eo=i=>{let m=Hn(i.name);if(Xe===null){let te=document.querySelector("[data-dsh-tty-entry]")!==null;rn(i,te?"\u7EC8\u7AEF\u9762\u677F\u7248\u672C\u8FC7\u65E7\uFF08\u4EA4\u4E92\u5F0F\u8FDB\u5165\u5BB9\u5668\u9700\u8981 dsh-tty \u2265 0.14.0\uFF09\uFF0C\u547D\u4EE4\u5DF2\u590D\u5236\uFF0C\u53EF\u7C98\u8D34\u5230\u7CFB\u7EDF\u7EC8\u7AEF\u6267\u884C":"\u672A\u5B89\u88C5 dsh-tty \u7EC8\u7AEF\u9762\u677F\uFF0C\u547D\u4EE4\u5DF2\u590D\u5236\uFF0C\u53EF\u7C98\u8D34\u5230\u7CFB\u7EDF\u7EC8\u7AEF\u6267\u884C\uFF08\u88C5 dsh-tty \u540E\u53EF\u76F4\u63A5\u5728\u6B64\u5F00\u7EC8\u7AEF\uFF09");return}let C=(n?.targets??[]).find(te=>te.name===c),pe=i.name+" \xB7 exec",ie=C===void 0||C.kind==="local"?{command:m,label:pe}:typeof C.book=="string"&&C.book!==""?{book:C.book,command:m,label:pe}:(C.auth??"agent")==="agent"?{spec:{host:C.host,port:C.port,username:C.username,auth:"agent",agentForward:C.agentForward===!0},command:m,label:pe}:null;if(ie===null){rn(i,"\u5185\u8054\u76EE\u6807\u7528\u4E86 key/password \u8BA4\u8BC1\uFF0C\u6D4F\u89C8\u5668\u7AEF\u62FF\u4E0D\u5230\u51ED\u8BC1");return}if(t.docked===!0||t.carrier==="tab"&&t.tabFullscreen!==!0){try{Xe.open(ie)}catch(te){rn(i,te instanceof Error?te.message:String(te))}return}if(typeof Xe.mount=="function"&&Number(Xe.version??0)>=2){J({label:pe,options:ie}),ue(!1);return}try{Xe.open(ie),t.onClose()}catch(te){rn(i,te instanceof Error?te.message:String(te))}},jr=i=>Ze(m=>{if(m[i]===void 0)return m;let C={...m};return delete C[i],C}),wt=(i,m)=>{Zt(!0);let C=()=>{Zt(!1),Ce(null)};Promise.resolve().then(i).then(async()=>{if(C(),m!==void 0)try{await m()}catch(pe){j(pe.message)}},pe=>{C(),j(pe.message)})},Io=(i,m)=>{Qt[m.id]===void 0&&Ce({title:i==="remove"?"\u5220\u9664\u5BB9\u5668":i==="stop"?"\u505C\u6B62\u5BB9\u5668":i==="start"?"\u542F\u52A8\u5BB9\u5668":"\u91CD\u542F\u5BB9\u5668",text:i==="remove"?`\u786E\u5B9A\u5220\u9664\u5BB9\u5668 ${m.name}\uFF1F\u5BB9\u5668\u7684\u53EF\u5199\u5C42\u4E0E\u914D\u7F6E\u4F1A\u88AB\u5220\u9664\uFF08\u547D\u540D\u6570\u636E\u5377\u4FDD\u7559\uFF09\uFF0C\u6B64\u64CD\u4F5C\u4E0D\u53EF\u6062\u590D\u3002`:`\u786E\u5B9A\u5BF9\u5BB9\u5668 ${m.name} \u6267\u884C${i==="stop"?"\u505C\u6B62":i==="start"?"\u542F\u52A8":"\u91CD\u542F"}\u64CD\u4F5C\uFF1F`,confirmLabel:i==="remove"?"\u5220\u9664":"\u786E\u5B9A",run:()=>wt(async()=>{Ze(C=>({...C,[m.id]:i}));try{let C=await Q.action(c,i,m.id);re(`${C.result.action} ${m.name}\uFF1A${C.result.message}`)}catch(C){throw jr(m.id),C}},async()=>{try{await _t()}finally{jr(m.id)}})})},Oo=i=>{let m=bn(i);Ce({title:"\u5220\u9664\u955C\u50CF",text:"\u786E\u5B9A\u5220\u9664\u955C\u50CF "+m+"\uFF1F\u955C\u50CF\u88AB\u5BB9\u5668\u6216\u5B50\u955C\u50CF\u5F15\u7528\u65F6\u4F1A\u5931\u8D25\uFF1B\u5220\u9664\u540E\u9700\u8981\u91CD\u65B0\u62C9\u53D6\u6216\u6784\u5EFA\u624D\u80FD\u6062\u590D\uFF0C\u4E14\u4E0D\u53EF\u64A4\u9500\u3002",confirmLabel:"\u5220\u9664",run:()=>wt(async()=>{let C=await Q.imageRemove(c,m);re("\u5DF2\u5220\u9664 "+m+"\uFF1A"+C.result.message),U!==null&&bn(U)===m&&q(null),await yt()})})},Ro=()=>{Ce({title:"\u6E05\u7406 dangling \u955C\u50CF",text:"\u6E05\u7406\u8BE5\u76EE\u6807\u4E0A\u6240\u6709\u65E0\u6807\u7B7E\uFF08<none>:<none>\uFF09\u7684\u955C\u50CF\u5C42\uFF0C\u91CA\u653E\u78C1\u76D8\u7A7A\u95F4\uFF1B\u4E0D\u4F1A\u5220\u9664\u6709 tag \u7684\u955C\u50CF\u3002",confirmLabel:"\u6E05\u7406",run:()=>wt(async()=>{let i=await Q.imagePrune(c),m=String(i.result.message).trim().split(`
`).filter(C=>C!=="");re("\u5DF2\u6E05\u7406 dangling \u955C\u50CF\uFF1A"+(m.length===0?"ok":m[m.length-1])),await yt()})})},Mo=()=>{Ce({title:"\u6E05\u7406\u672A\u4F7F\u7528\u7684\u7F51\u7EDC",text:"\u6E05\u7406\u8BE5\u76EE\u6807\u4E0A\u6240\u6709\u6CA1\u6709\u5BB9\u5668\u63A5\u5165\u7684\u7F51\u7EDC\u3002compose \u521B\u5EFA\u7684\u9879\u76EE\u7F51\u7EDC\u4E5F\u5728\u5176\u4E2D\uFF08\u4E0B\u6B21 up \u4F1A\u91CD\u5EFA\uFF09\uFF0C\u4F46\u6B63\u5728\u8DD1\u7684\u9879\u76EE\u4F1A\u77ED\u6682\u5931\u53BB\u7F51\u7EDC\u3002",confirmLabel:"\u6E05\u7406",run:()=>wt(async()=>{let i=await Q.networkPrune(c),m=String(i.result.message).trim().split(`
`).filter(C=>C!=="");re("\u5DF2\u6E05\u7406\u672A\u4F7F\u7528\u7F51\u7EDC\uFF1A"+(m.length===0?"ok":m[m.length-1])),await tn()})})},Ao=()=>{Ce({title:"\u6E05\u7406\u672A\u4F7F\u7528\u7684\u5377",text:"\u6E05\u7406\u8BE5\u76EE\u6807\u4E0A\u6240\u6709\u6CA1\u6709\u88AB\u5BB9\u5668\u4F7F\u7528\u7684\u5377\u2014\u2014\u5377\u91CC\u7684\u6570\u636E\u4F1A\u4E00\u8D77\u5220\u9664\u4E14\u4E0D\u53EF\u6062\u590D\u3002docker \u2265 23 \u53EA\u5220\u533F\u540D\u5377\uFF08\u4E0D\u5E26 --all\uFF09\uFF0C\u66F4\u8001\u7684\u7248\u672C\u4F1A\u8FDE\u547D\u540D\u5377\u4E00\u8D77\u5220\uFF1B\u6267\u884C\u524D\u8BF7\u786E\u8BA4\u6CA1\u6709\u9700\u8981\u4FDD\u7559\u7684\u6570\u636E\u5377\u3002",confirmLabel:"\u6E05\u7406",run:()=>wt(async()=>{let i=await Q.volumePrune(c),m=String(i.result.message).trim().split(`
`).filter(C=>C!=="");re("\u5DF2\u6E05\u7406\u672A\u4F7F\u7528\u5377\uFF1A"+(m.length===0?"ok":m[m.length-1])),await nn()})})},Hr=(i,m)=>C=>{i(),re(C),m()},an=Ue===null?null:w.find(i=>i.id===Ue.id)??Ue.item,Qe=w.filter(i=>{if(Je==="running"&&!(i.state==="running"||i.state==="paused"||i.state==="restarting")||Je==="stopped"&&i.state==="running"||Je==="unhealthy"&&i.health!=="unhealthy")return!1;let m=be.trim().toLowerCase();return m===""?!0:i.name.toLowerCase().includes(m)||i.image.toLowerCase().includes(m)||i.id.toLowerCase().includes(m)}),Mn=T.filter(i=>{let m=en.trim().toLowerCase();return m===""||i.reference.toLowerCase().includes(m)||i.id.toLowerCase().includes(m)}),An=f.filter(i=>{let m=N.trim().toLowerCase();return m===""||i.name.toLowerCase().includes(m)||i.driver.toLowerCase().includes(m)||i.id.toLowerCase().includes(m)}),Bn=x.filter(i=>{let m=S.trim().toLowerCase();return m===""||i.name.toLowerCase().includes(m)||i.driver.toLowerCase().includes(m)||i.mountpoint.toLowerCase().includes(m)}),Bo=()=>o("div",{className:"dk_switchPill",title:"\u6B63\u5728\u5207\u6362\u5230 "+c+zr(c)+"\u3002\u4E0B\u9762\u4ECD\u662F "+E+zr(E)+"\u7684\u6570\u636E\uFF0C\u5207\u6362\u5B8C\u6210\u524D\u4E0D\u53EF\u64CD\u4F5C\u3002",children:[e("span",{className:"dk_spin dk_spinSm"}),o("span",{className:"dk_switchText",children:[e("span",{children:"\u6B63\u5728\u5207\u6362\u5230"}),e("strong",{children:c}),e("span",{className:"dk_switchDot",children:"\xB7"}),o("span",{className:"dk_switchSub",children:[e("span",{children:"\u5F53\u524D\u663E\u793A\uFF1A"}),e("span",{className:"dk_switchName",children:E})]})]})]},"switchPill"),zr=i=>{let m=r.find(pe=>pe.name===i),C=m===void 0||typeof m.label!="string"?"":m.label;return C===""||C===i?"":"\uFF08"+C+"\uFF09"},Fr=E!==""&&E!==c&&!v,Me=i=>{let m=r.find(C=>C.name===i);return m===void 0||m.label===void 0?i:i+" \xB7 "+m.label},Nt=()=>Ne?e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]}):c===""?v?o("div",{className:"dk_empty",children:[e("div",{className:"dk_emptyTitle",children:"\u5F53\u524D\u4F1A\u8BDD\u4E3B\u673A\u8FD8\u4E0D\u662F Docker \u76EE\u6807"}),e("div",{className:"dk_emptyHint",children:"\u6309\u4E0A\u9762\u7684\u63D0\u793A\u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6DFB\u52A0\u4E00\u6761\u76EE\u6807\uFF08\u63A8\u8350\u76F4\u63A5\u9009\u8FDE\u63A5\u7C3F\u6761\u76EE\uFF09\uFF0C\u4FDD\u5B58\u540E\u56DE\u5230\u8FD9\u91CC\u5237\u65B0\u3002\u4E3A\u907F\u514D\u5F20\u51A0\u674E\u6234\uFF0C\u9762\u677F\u4E0D\u4F1A\u81EA\u52A8\u5207\u5230\u5176\u4ED6\u76EE\u6807\u3002"})]}):o("div",{className:"dk_empty",children:[e("div",{className:"dk_emptyTitle",children:"\u8FD8\u6CA1\u6709\u914D\u7F6E Docker \u76EE\u6807"}),e("div",{className:"dk_emptyHint",children:"\u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6DFB\u52A0\u4E00\u4E2A\u76EE\u6807\uFF1A\u672C\u673A\u76F4\u63A5\u9009\u300C\u672C\u673A\u300D\uFF1B\u8FDC\u7A0B\u4E3B\u673A\u53EF\u4EE5\u5F15\u7528 tty \u7EC8\u7AEF\u9762\u677F\u7684\u8FDE\u63A5\u7C3F\u6761\u76EE\u3002"})]}):Le!==""&&w.length===0?o("div",{className:"dk_empty",children:[e("div",{className:"dk_emptyTitle",children:"\u8FD9\u4E2A\u76EE\u6807\u7684\u6570\u636E\u6CA1\u8BFB\u5230"}),e("div",{className:"dk_emptyHint",children:"\u4E0A\u9762\u7684\u9519\u8BEF\u6761\u91CC\u6709\u539F\u56E0\uFF08\u76EE\u6807\u4E0D\u53EF\u8FBE / docker \u672A\u8FD0\u884C / \u6743\u9650\u4E0D\u8DB3\uFF09\u3002\u4FEE\u597D\u540E\u70B9\u53F3\u4E0A\u89D2\u5237\u65B0\u5373\u53EF\u3002"})]}):o("div",{className:"dk_empty",children:[e("div",{className:"dk_emptyTitle",children:g==="images"?"\u6CA1\u6709\u955C\u50CF":g==="compose"?"\u6CA1\u6709 Compose \u9879\u76EE":g==="networks"?"\u6CA1\u6709\u7F51\u7EDC":g==="volumes"?"\u6CA1\u6709\u5377":"\u6CA1\u6709\u5BB9\u5668"}),e("div",{className:"dk_emptyHint",children:be.trim()===""?"\u76EE\u6807\u4E0A\u6CA1\u6709\u5339\u914D\u7684\u6570\u636E\uFF0C\u6216\u7B5B\u9009\u6761\u4EF6\u8FC7\u7A84\u3002":"\u6CA1\u6709\u5339\u914D\u300C"+be.trim()+"\u300D\u7684\u7ED3\u679C\u3002"})]}),Do=()=>{if(g==="overview")return er(ca(R),{onOpenTarget:So,onOpenContainer:Co});if(g==="images")return o("div",{className:"dk_imagesView",children:[Mn.length===0?Nt():e("div",{className:"dk_tableWrap",children:o("table",{className:"dk_images",children:[e("thead",{children:o("tr",{children:[e("th",{children:"\u955C\u50CF"}),e("th",{children:"\u5927\u5C0F"}),e("th",{children:"\u521B\u5EFA"}),e("th",{children:"ID"}),e("th",{className:"dk_colActions",children:"\u64CD\u4F5C"})]})}),e("tbody",{children:Mn.map(i=>o("tr",{children:[e("td",{className:"dk_mono",title:i.reference,children:i.dangling?"<none>\uFF08dangling\uFF09":i.reference}),e("td",{children:i.sizeText===""?i.size===null?"\u2014":un(i.size):i.sizeText}),e("td",{children:i.createdSince}),e("td",{className:"dk_mono",children:i.shortId}),e("td",{className:"dk_colActions",children:o("div",{className:"dk_rowActions",children:[e($,{icon:ni,title:"\u67E5\u770B\u955C\u50CF\u8BE6\u60C5\uFF08\u5C42 / \u6784\u5EFA\u5386\u53F2\uFF09",onClick:()=>q(i)},"inspect"),e($,{icon:gn,danger:!0,disabled:n?.allowMutations!==!0,title:n?.allowMutations===!0?"\u5220\u9664\u955C\u50CF\uFF08\u4E0D\u53EF\u6062\u590D\uFF09":"\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",onClick:()=>Oo(i)},"remove")]})},"actions")]},i.id+i.reference))})]})})]});if(g==="compose"){let i=_n(Qe);return i.length===0?Nt():e(qa,{groups:i,onOpen:m=>_e({project:m})})}return g==="networks"?o("div",{className:"dk_imagesView",children:[An.length===0?Nt():e("div",{className:"dk_tableWrap",children:o("table",{className:"dk_images",children:[e("thead",{children:o("tr",{children:[e("th",{children:"\u540D\u79F0"}),e("th",{children:"\u9A71\u52A8"}),e("th",{children:"\u8303\u56F4"}),e("th",{children:"\u5C5E\u6027"}),e("th",{children:"ID"})]})}),e("tbody",{children:An.map(i=>o("tr",{className:"dk_rowClickable",onClick:()=>ke(i),title:"\u67E5\u770B\u7F51\u7EDC\u8BE6\u60C5",children:[e("td",{className:"dk_mono",title:i.name,children:i.name}),e("td",{children:i.driver===""?"\u2014":i.driver}),e("td",{children:i.scope===""?"\u2014":i.scope}),e("td",{children:i.internal?e("span",{className:"dk_badge","data-state":"paused",children:"internal"}):"\u2014"}),e("td",{className:"dk_mono",title:i.id,children:i.shortId})]},i.id+i.name))})]})})]}):g==="volumes"?o("div",{className:"dk_imagesView",children:[Bn.length===0?Nt():e("div",{className:"dk_tableWrap",children:o("table",{className:"dk_images",children:[e("thead",{children:o("tr",{children:[e("th",{children:"\u540D\u79F0"}),e("th",{children:"\u9A71\u52A8"}),e("th",{children:"\u8303\u56F4"}),e("th",{children:"\u6302\u8F7D\u70B9"})]})}),e("tbody",{children:Bn.map(i=>o("tr",{className:"dk_rowClickable",onClick:()=>me(i),title:"\u67E5\u770B\u5377\u8BE6\u60C5",children:[e("td",{className:"dk_mono",title:i.name,children:i.name}),e("td",{children:i.driver===""?"\u2014":i.driver}),e("td",{children:i.scope===""?"\u2014":i.scope}),e("td",{className:"dk_mono dk_pathCell",title:i.mountpoint,children:i.mountpoint===""?"\u2014":i.mountpoint})]},i.name))})]})})]}):Qe.length===0?Nt():e("div",{className:"dk_grid",key:E===""?"first":E,children:Qe.map(i=>e(La,{item:i,selected:Ue!==null&&i.id===Ue.id,allowMutations:n?.allowMutations===!0,pickMode:ge,picked:A.includes(i.id),pending:Qt[i.id],onTogglePick:No,onOpen:(m,C)=>je({id:m.id,tab:C,item:m}),onExec:Eo,onAction:Io,onCopyExec:m=>{navigator.clipboard.writeText("docker exec -it "+m.name+" sh").then(()=>re("\u5DF2\u590D\u5236\uFF1Adocker exec -it "+m.name+" sh")).catch(()=>re("\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u590D\u5236"))}},i.id))})},Ie=t.docked===!0,Dn=t.carrier==="tab",Po=n??{pollIntervalSec:5,logTailDefault:200,allowExec:!1,allowMutations:!1,execTimeoutSec:30},St=sa(w,A),Vr=oi(c),on=Vr?Jn:pn,jo=ra(St.length,Vr),Kr=St.length>0?St[0]:null,Ho=la(Qe,A,Kr,on),zo=i=>{let m=ia(Qe,A,i,Kr,on);oe(m.ids),m.skipped>0?X("\u5DF2\u65B0\u589E "+String(m.added)+" \u4E2A\uFF0C\u53E6\u6709 "+String(m.skipped)+" \u4E2A\u8D85\u51FA\u4E0A\u9650\uFF08\u6700\u591A "+String(on)+" \u4E2A\u6D41\uFF09\u672A\u9009"):m.added===0?X("\u6CA1\u6709\u53EF\u65B0\u589E\u7684\u5BB9\u5668\uFF08\u5DF2\u88AB\u52FE\u9009\u6216\u4E0D\u5728\u5F53\u524D\u7B5B\u9009\u7ED3\u679C\u91CC\uFF09"):X("\u5DF2\u65B0\u589E "+String(m.added)+" \u4E2A")},Fo=Pe===null?[]:_n(w).find(i=>i.project===Pe.project)?.items??[],Gr=an!==null?e(Fa,{item:an,target:c,targetLabel:Me(c),config:Po,initialTab:Ue.tab,refreshToken:Xt,onBack:()=>je(null),onRefresh:xo,onClose:Ge,docked:Ie},"detail"):U!==null?e(Va,{item:T.find(i=>i.id===U.id)??U,target:c,targetLabel:Me(c),onBack:()=>q(null),onClose:Ge,docked:Ie},"imageDetail"):ze?e(Ua,{target:c,targetLabel:Me(c),allowMutations:n?.allowMutations===!0,onBack:()=>We(!1),onDone:yt,onClose:Ge,docked:Ie},"pull"):Pe!==null?e(Xa,{project:Pe.project,items:Fo,target:c,targetLabel:Me(c),onBack:()=>_e(null),onClose:Ge,docked:Ie},"composeDetail"):it?e(no,{items:St,target:c,targetLabel:Me(c),onBack:Re,onClose:Ge,docked:Ie},"aggregate"):ae!==null?e(Ka,{item:ae,target:c,targetLabel:Me(c),allowMutations:n?.allowMutations===!0,onBack:()=>ke(null),onRemoved:Hr(()=>ke(null),tn),onClose:Ge,docked:Ie},"networkDetail"):$e!==null?e(Ga,{item:$e,target:c,targetLabel:Me(c),allowMutations:n?.allowMutations===!0,onBack:()=>me(null),onRemoved:Hr(()=>me(null),nn),onClose:Ge,docked:Ie},"volumeDetail"):null,Vo=[Gr!==null?[Gr,xe===null?null:e(dt,{title:xe.title,text:xe.text,confirmLabel:xe.confirmLabel,busy:$t,onCancel:()=>Ce(null),onConfirm:xe.run},"confirm")]:[Ie?null:o("div",{className:"dk_header",children:[e("span",{className:"dk_titleIcon",dangerouslySetInnerHTML:{__html:Qr}}),e("span",{className:"dk_title",children:"Docker \u5BB9\u5668"}),n?.allowMutations===!0?null:e("span",{className:"dk_badge","data-state":"paused",children:"\u53EA\u8BFB\u6A21\u5F0F"}),e("span",{className:"dk_headerSpacer"}),an!==null?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5237\u65B0\u5217\u8868","data-spin":Ne?"1":void 0,onClick:xt,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:tt}})}),e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:Ge,children:e("span",{dangerouslySetInnerHTML:{__html:Be}})})]}),an!==null?null:o("div",{className:"dk_toolbar",children:[e("select",{className:"dk_select",value:g==="overview"?"":c,onChange:i=>{k(i.target.value),j(""),b("containers"),je(null),Re(),Ze({}),t.onTargetChange?.(Me(i.target.value))},children:[...g==="overview"?[e("option",{value:"",children:"\uFF08\u603B\u89C8 \xB7 \u5168\u90E8\u76EE\u6807\uFF09"},"__overview")]:c===""?[e("option",{value:"",children:"\uFF08\u672A\u9009\u62E9\u76EE\u6807\uFF09"},"__none")]:[],...(r.length===0&&c!==""?[{name:c,label:void 0}]:r).map(i=>e("option",{value:i.name,children:Me(i.name)},i.name))]}),r.length<2?null:e("button",{type:"button",className:"dk_pill dk_pillOverview","data-on":g==="overview"?"1":"0",title:g==="overview"?"\u9000\u51FA\u603B\u89C8\uFF0C\u56DE\u5230\u5F53\u524D\u76EE\u6807\u7684\u5BB9\u5668\u5217\u8868":"\u4E0D\u9009\u76EE\u6807\uFF0C\u4E00\u5C4F\u770B\u5168\u90E8\u76EE\u6807\u7684\u5BB9\u5668\u6982\u51B5\uFF08\u53EA\u8BFB\uFF09",onClick:()=>{if(g!=="overview"){b("overview"),j(""),je(null),Re();return}b("containers"),je(null),Re()},children:"\u603B\u89C8"}),e("div",{className:"dk_seg",children:[["containers","\u5BB9\u5668"],["images","\u955C\u50CF"],["compose","Compose"],["networks","\u7F51\u7EDC"],["volumes","\u5377"]].map(([i,m])=>e("button",{type:"button",className:"dk_segBtn","data-on":g===i?"1":"0",onClick:()=>{b(i),je(null),q(null),_e(null),ke(null),me(null),We(!1),Re()},children:m},i))}),g==="containers"?e("button",{type:"button",className:"dk_pill dk_pillPick","data-on":ge?"1":"0",title:ge?"\u9000\u51FA\u9009\u62E9\u5E76\u6E05\u7A7A\u52FE\u9009\uFF08Esc\uFF09":"\u591A\u9009\u5BB9\u5668\uFF0C\u628A\u5B83\u4EEC\u7684\u65E5\u5FD7\u4E34\u65F6\u805A\u5408\u6210\u4E00\u6761\u6D41",onClick:wo,children:ge?"\u9000\u51FA\u9009\u62E9":"\u805A\u5408\u9009\u62E9"}):null,g==="containers"?e("input",{className:"dk_input dk_search",placeholder:"\u641C\u7D22\u540D\u79F0 / \u955C\u50CF / ID",value:be,onChange:i=>Ve(i.target.value)}):null,g==="compose"?e("input",{className:"dk_input dk_search",placeholder:"\u641C\u7D22\u9879\u76EE / \u670D\u52A1 / \u5BB9\u5668",value:be,onChange:i=>Ve(i.target.value)}):null,g==="images"?e("input",{className:"dk_input dk_search",placeholder:"\u641C\u7D22\u955C\u50CF\uFF08\u4ED3\u5E93 / \u6807\u7B7E / ID\uFF09",value:en,onChange:i=>En(i.target.value)}):null,g==="images"?e("span",{className:"dk_hint dk_searchCount",children:String(Mn.length)+" / "+String(T.length)+" \u4E2A\u955C\u50CF"}):null,g==="images"?e($,{icon:ti,disabled:n?.allowMutations!==!0,title:n?.allowMutations===!0?"\u62C9\u53D6\u955C\u50CF\uFF08docker pull\uFF0C\u9010\u5C42\u5B9E\u65F6\u8FDB\u5EA6\uFF09":"\u62C9\u53D6\u955C\u50CF\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",onClick:()=>We(!0)},"pull"):null,g==="images"?e($,{icon:Kn,danger:!0,disabled:n?.allowMutations!==!0,title:n?.allowMutations===!0?"\u6E05\u7406 dangling\uFF08\u65E0\u6807\u7B7E\uFF09\u955C\u50CF":"\u6E05\u7406 dangling \u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",onClick:Ro},"prune"):null,g==="networks"?e("input",{className:"dk_input dk_search",placeholder:"\u641C\u7D22\u7F51\u7EDC\uFF08\u540D\u79F0 / \u9A71\u52A8 / ID\uFF09",value:N,onChange:i=>M(i.target.value)}):null,g==="volumes"?e("input",{className:"dk_input dk_search",placeholder:"\u641C\u7D22\u5377\uFF08\u540D\u79F0 / \u9A71\u52A8 / \u6302\u8F7D\u70B9\uFF09",value:S,onChange:i=>F(i.target.value)}):null,g==="networks"?e("span",{className:"dk_hint dk_searchCount",children:String(An.length)+" / "+String(f.length)+" \u4E2A\u7F51\u7EDC"}):null,g==="volumes"?e("span",{className:"dk_hint dk_searchCount",children:String(Bn.length)+" / "+String(x.length)+" \u4E2A\u5377"}):null,g==="networks"?e($,{icon:Kn,danger:!0,disabled:n?.allowMutations!==!0,title:n?.allowMutations===!0?"\u6E05\u7406\u672A\u4F7F\u7528\u7684\u7F51\u7EDC\uFF08docker network prune\uFF09":"\u6E05\u7406\u7F51\u7EDC\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",onClick:Mo},"prune"):null,g==="volumes"?e($,{icon:Kn,danger:!0,disabled:n?.allowMutations!==!0,title:n?.allowMutations===!0?"\u6E05\u7406\u672A\u4F7F\u7528\u7684\u5377\uFF08docker volume prune\uFF0C\u4F1A\u5220\u6570\u636E\uFF09":"\u6E05\u7406\u5377\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",onClick:Ao},"prune"):null,g==="compose"?e("span",{className:"dk_hint dk_searchCount",children:String(_n(Qe).length)+" \u4E2A\u9879\u76EE \xB7 "+String(Qe.length)+" \u4E2A\u5BB9\u5668"}):null,g==="containers"?e("div",{className:"dk_seg",children:[["all","\u5168\u90E8"],["running","\u8FD0\u884C\u4E2D"],["stopped","\u5DF2\u505C\u6B62"],["unhealthy","\u4E0D\u5065\u5EB7"]].map(([i,m])=>e("button",{type:"button",className:"dk_segBtn","data-on":Je===i?"1":"0",onClick:()=>Tn(i),children:m},i))}):null,g==="containers"||g==="compose"||g==="overview"?o("div",{className:"dk_toolbarToggles",children:[g==="containers"||g==="compose"?e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:Se,onChange:i=>ye(i.target.checked)}),"\u542B\u5DF2\u505C\u6B62"]},"all"):null,e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:Ee,onChange:i=>Wt(i.target.checked)}),"\u81EA\u52A8\u5237\u65B0"]},"auto")]}):null,Ie?o("div",{className:"dk_toolbarEnd",children:[n?.allowMutations!==!0?e("span",{className:"dk_badge","data-state":"paused",children:"\u53EA\u8BFB\u6A21\u5F0F"},"readonly"):null,e("button",{type:"button",className:"dk_iconBtn",title:"\u5237\u65B0\u5217\u8868","data-spin":Ne?"1":void 0,onClick:xt,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:tt}})},"refresh")]}):null]}),g==="containers"&&ge?e(to,{count:St.length,info:jo,presets:Ho,max:on,notice:ee,onPreset:zo,onClear:()=>{oe([]),X("")},onRun:()=>fe(!0),onCancel:Re},"pickBar"):null,o("div",{className:"dk_body","data-stale":Fr?"1":void 0,children:[Fr?e("div",{className:"dk_switchOverlay",children:Bo()},"stale"):null,o("div",{className:"dk_main"+(g==="images"||g==="networks"||g==="volumes"||g==="overview"?" dk_mainImages":""),children:[Le===""||g==="overview"?null:e(Y,{title:"\u64CD\u4F5C\u5931\u8D25",hint:Le}),Z===""?null:e(Y,{kind:"info",title:Z}),t.sessionHint===void 0?null:e(Y,{kind:"info",title:"\u5F53\u524D\u4F1A\u8BDD\u4E3B\u673A\u8FD8\u6CA1\u914D\u7F6E\u4E3A Docker \u76EE\u6807",hint:"\u4F1A\u8BDD\u4E3B\u673A\uFF1A"+t.sessionHint.host+(t.sessionHint.port===22?"":":"+String(t.sessionHint.port))+(t.sessionHint.book===""?"":"\uFF08\u8FDE\u63A5\u7C3F\uFF1A"+t.sessionHint.book+"\uFF09")+" \u2014 \u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6DFB\u52A0\u4E00\u6761 kind=ssh \u76EE\u6807"+(t.sessionHint.book===""?"\uFF08\u586B host/username\uFF0C\u6216\u7528\u8FDE\u63A5\u7C3F\u6761\u76EE\uFF09":"\uFF0C\u76F4\u63A5\u9009\u8FDE\u63A5\u7C3F\u6761\u76EE\u300C"+t.sessionHint.book+"\u300D")+"\uFF0C\u4FDD\u5B58\u540E\u56DE\u5230\u8FD9\u91CC\u5237\u65B0\u5373\u53EF\u3002"}),n!==null&&n.allowMutations!==!0?e(Y,{kind:"info",title:"\u5F53\u524D\u4E3A\u53EA\u8BFB\u6A21\u5F0F",hint:"\u5BB9\u5668\u7684\u542F\u52A8 / \u505C\u6B62 / \u91CD\u542F / \u5220\u9664\uFF0C\u4EE5\u53CA\u955C\u50CF\u3001\u7F51\u7EDC\u3001\u5377\u7684\u5220\u9664\u4E0E\u6E05\u7406\uFF0C\u90FD\u9700\u8981\u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D\u3002"}):null,g==="containers"?e(eo,{events:Jt,status:Ke,statusText:Lo(),open:Ut,onToggle:()=>Ln(i=>!i)},"activity"):null,Do()]})]}),xe===null?null:e(dt,{title:xe.title,text:xe.text,confirmLabel:xe.confirmLabel,busy:$t,onCancel:()=>Ce(null),onConfirm:xe.run})],de===null?null:e(ro,{label:de.label,hostRef:K,collapsed:G,height:qe,onToggleCollapse:()=>ue(i=>!i),onResizeStart:yo,onClose:()=>J(null)},"execDrawer"),_o&&de!==null?e(dt,{title:"\u7ED3\u675F\u5BB9\u5668\u7EC8\u7AEF\u4F1A\u8BDD",text:"\u5173\u95ED\u9762\u677F\u4F1A\u7ED3\u675F\u300C"+de.label+"\u300D\u7684\u7EC8\u7AEF\u4F1A\u8BDD\uFF08docker exec -it \u2026\uFF09\u3002\u82E5\u53EA\u662F\u60F3\u7ED9\u65E5\u5FD7 / \u5217\u8868\u817E\u5730\u65B9\uFF0C\u5148\u70B9\u62BD\u5C49\u53F3\u4E0A\u89D2\u7684\u6298\u53E0\u6309\u94AE\u5373\u53EF\uFF0C\u4F1A\u8BDD\u4F1A\u4FDD\u6301\u8FD0\u884C\u3002",confirmLabel:"\u7ED3\u675F\u5E76\u5173\u95ED",onCancel:()=>In(!1),onConfirm:()=>{In(!1),t.onClose()}},"closeConfirm"):null,e(Ir,{sessionId:t.sessionId,conversationHidden:!Dn},"agentDrawer")],Wr=o("div",{className:"dk_panel"+(Ie?" dk_panelDock":Dn?" dk_panelTab":""),"data-dock":Ie?"1":void 0,ref:Pr,onMouseDown:i=>i.stopPropagation(),children:Vo});return Ie||Dn?Wr:o("div",{className:"dk_backdrop",onMouseDown:i=>{On.current=i.target===i.currentTarget},onMouseUp:i=>{let m=On.current&&i.target===i.currentTarget;On.current=!1,m&&Ge()},children:[Wr]})}function Or(t){let n=null;try{n=t.useTabInfo()}catch{}let a=()=>{mt=!1;try{n?.tab?.actions?.close?.()}catch{}};L(()=>{mt=!0},[]);let r=n?.tab?.navigation?.params,u=typeof r?.target=="string"?r.target:"",d=B("");u!==""&&(d.current=u);let s=d.current,c=n?.tab?.visible!==!1,k=n?.sidebar?.fullscreen===!0;return e(_r.Provider,{value:c,children:e(Gt,{key:s===""?"docker-tab":s,carrier:"tab",tabFullscreen:k,sessionId:typeof t.sessionId=="string"?t.sessionId:void 0,onClose:a,initialTarget:s===""?void 0:s,sessionHint:r?.sessionHint})})}function uo(){let[t,n]=p(!1),[a,r]=p(null),[u,d]=p(!1),[s,c]=p(!1),[k,v]=p({kind:"",text:""}),g=B(0),b=se(()=>{Q.config().then(f=>{r(f.config),Fn(f.config),g.current=Array.isArray(f.config?.targets)?f.config.targets.length:0,d(!0)}).catch(f=>{v({kind:"error",text:"\u8BFB\u53D6\u914D\u7F6E\u5931\u8D25\uFF1A"+f.message}),d(!0)})},[]);L(()=>{t&&!u&&b()},[t,u,b]);let w=f=>r(_=>({..._,...f})),I=(f,_)=>r(x=>{let z=x.targets.slice();return z[f]={...z[f],..._},{...x,targets:z}}),E=()=>r(f=>({...f,targets:[...f.targets,{name:"\u76EE\u6807"+String(f.targets.length+1),kind:"local",book:"",host:"",port:22,username:"",auth:"agent",keyPath:"",agentForward:!1,passwordSet:!1,passphraseSet:!1}]})),P=f=>r(_=>({..._,targets:_.targets.filter((x,z)=>z!==f)})),y=f=>r(_=>({..._,hostKeys:_.hostKeys.filter(x=>!(x.host===f.host&&x.port===f.port))})),D=()=>{c(!0),v({kind:"",text:""});let f={enabled:a.enabled,announceToAgent:a.announceToAgent,dockerBin:a.dockerBin,allowMutations:a.allowMutations,allowExec:a.allowExec,execTimeoutSec:a.execTimeoutSec,pollIntervalSec:a.pollIntervalSec,logTailDefault:a.logTailDefault,maxOutputKb:a.maxOutputKb,targets:a.targets.map(_=>({name:_.name,kind:_.kind,book:_.book??"",host:_.host??"",port:Number(_.port)||22,username:_.username??"",auth:_.auth??"agent",keyPath:_.keyPath??"",..._.password===void 0||_.password===""?{}:{password:_.password},..._.passphrase===void 0||_.passphrase===""?{}:{passphrase:_.passphrase},agentForward:_.agentForward===!0})),hostKeys:a.hostKeys,...a.targets.length===0&&g.current>0?{clearTargets:!0}:{}};Q.saveConfig(f).then(_=>{r(_.config),Fn(_.config),g.current=Array.isArray(_.config?.targets)?_.config.targets.length:0,hn(),v(_.warning===void 0?{kind:"ok",text:"\u5DF2\u4FDD\u5B58\u5E76\u70ED\u751F\u6548"}:{kind:"error",text:_.warning})}).catch(_=>{v({kind:"error",text:"\u4FDD\u5B58\u5931\u8D25\uFF1A"+_.message})}).finally(()=>c(!1))},R=f=>e("div",{className:"dk_cardSection",children:f}),H=(f,_,x,z)=>o("div",{className:"dk_field","data-span":z===void 0?void 0:String(z),children:[e("span",{className:"dk_label",children:f}),_,x===void 0?null:e("span",{className:"dk_hint",children:x})]}),T=(f,_,x,z)=>e("input",{className:"dk_input",type:"number",min:_,max:x,value:a[f],onChange:U=>w({[f]:Number(U.target.value)})}),ne=f=>o("li",{className:"dk_settingsCard"+(t?" dk_settingsCardOpen":""),children:[o("button",{type:"button",className:"dk_settingsHead","aria-expanded":t,onClick:()=>n(_=>!_),children:[o("span",{className:"dk_settingsHeadText",children:[e("span",{className:"dk_settingsName",children:"Docker \u5BB9\u5668\u9762\u677F"}),e("span",{className:"dk_settingsDesc",children:"\u672C\u673A / SSH \u4E3B\u673A\u4E0A\u7684\u5BB9\u5668\u4E0E\u955C\u50CF\uFF1B\u9ED8\u8BA4\u53EA\u8BFB\uFF0C\u53D8\u66F4\u64CD\u4F5C\u9700\u663E\u5F0F\u5F00\u542F"})]}),e("span",{className:"dshkit_badge",children:"Kit"}),e("span",{className:"dk_settingsChevron",dangerouslySetInnerHTML:{__html:Vn}})]}),t?e("div",{className:"dk_settingsBody",children:f}):null]});return ne(t?!u||a===null?o("div",{className:"dk_row",children:[e("span",{className:"dk_spin"}),"\u8BFB\u53D6\u914D\u7F6E\u2026"]}):[R("\u57FA\u672C"),o("div",{className:"dk_row",children:[e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:a.enabled,onChange:f=>w({enabled:f.target.checked})}),"\u542F\u7528\u63D2\u4EF6"]}),e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:a.announceToAgent,onChange:f=>w({announceToAgent:f.target.checked})}),"\u5411 agent \u516C\u544A\u80FD\u529B"]})]}),o("div",{className:"dk_fieldGrid",children:[H("docker CLI",e("input",{className:"dk_input",value:a.dockerBin,onChange:f=>w({dockerBin:f.target.value})}),"\u9ED8\u8BA4 docker\uFF1Bpodman \u53EF\u586B podman"),H("\u7EDF\u8BA1\u5237\u65B0\u95F4\u9694\uFF08\u79D2\uFF09",T("pollIntervalSec",1,60)),H("\u65E5\u5FD7\u9ED8\u8BA4\u884C\u6570",T("logTailDefault",1,5e3)),H("\u8F93\u51FA\u4E0A\u9650\uFF08KB\uFF09",T("maxOutputKb",1,8192)),H("exec \u8D85\u65F6\uFF08\u79D2\uFF09",T("execTimeoutSec",1,120))]}),R("\u80FD\u529B\u5F00\u5173\uFF08\u9ED8\u8BA4\u5173\u95ED\uFF09"),o("div",{className:"dk_row",children:[e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:a.allowMutations,onChange:f=>w({allowMutations:f.target.checked})}),"\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\uFF08\u5BB9\u5668\u542F\u505C\u5220\u3001\u955C\u50CF\u62C9\u53D6 / \u5220\u9664 / \u6E05\u7406\uFF09"]}),e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:a.allowExec,onChange:f=>w({allowExec:f.target.checked})}),"\u5141\u8BB8 exec\uFF08\u5728\u5BB9\u5668\u5185\u6267\u884C\u547D\u4EE4\uFF09"]})]}),e("span",{className:"dk_hint",children:"docker socket \u7B49\u4EF7\u4E8E\u76EE\u6807\u4E3B\u673A\u7684 root \u6743\u9650\u3002\u5F00\u542F\u540E\uFF0C\u6D4F\u89C8\u5668\u9762\u677F\u4E0E agent \u90FD\u80FD\u6267\u884C\u5BF9\u5E94\u64CD\u4F5C\uFF0C\u8BF7\u53EA\u5728\u53EF\u4FE1\u73AF\u5883\u4E0B\u6253\u5F00\u3002"}),R("\u76EE\u6807"),...a.targets.map((f,_)=>o("div",{className:"dk_targetRow",children:[e("input",{className:"dk_input",value:f.name,placeholder:"\u76EE\u6807\u540D",onChange:x=>I(_,{name:x.target.value})}),e("select",{className:"dk_select",value:f.kind,onChange:x=>I(_,{kind:x.target.value}),children:[e("option",{value:"local",children:"\u672C\u673A"}),e("option",{value:"ssh",children:"SSH \u4E3B\u673A"})]}),f.kind==="local"?e("span",{className:"dk_hint",children:"\u5BBF\u4E3B\u6240\u5728\u673A\u5668\u4E0A\u7684 docker"}):o("div",{className:"dk_row",style:{gridColumn:"span 1"},children:[e("select",{className:"dk_select",value:f.book??"",onChange:x=>I(_,{book:x.target.value}),children:[e("option",{value:"",children:a.ttyBooks.length===0?"\uFF08\u65E0 tty \u8FDE\u63A5\u7C3F\uFF0C\u8BF7\u586B\u5185\u8054\u4FE1\u606F\uFF09":"\uFF08\u4E0D\u7528\u8FDE\u63A5\u7C3F\uFF0C\u624B\u586B\uFF09"}),...a.ttyBooks.map(x=>e("option",{value:x,children:"\u8FDE\u63A5\u7C3F\uFF1A"+x},x))]})]}),e("button",{type:"button",className:"dk_btn dk_btnDanger",onClick:()=>P(_),children:"\u5220\u9664"}),f.kind==="ssh"&&(f.book??"")===""?o("div",{className:"dk_targetInline",children:[e("input",{className:"dk_input",placeholder:"host",value:f.host??"",onChange:x=>I(_,{host:x.target.value})}),e("input",{className:"dk_input",placeholder:"22",title:"\u7AEF\u53E3",value:f.port??22,onChange:x=>I(_,{port:Number(x.target.value)||22})}),e("input",{className:"dk_input",placeholder:"username",value:f.username??"",onChange:x=>I(_,{username:x.target.value})}),e("select",{className:"dk_select",value:f.auth??"agent",onChange:x=>I(_,{auth:x.target.value}),children:[e("option",{value:"agent",children:"ssh-agent"}),e("option",{value:"key",children:"\u79C1\u94A5"}),e("option",{value:"password",children:"\u5BC6\u7801"})]}),(f.auth??"agent")==="key"?e("input",{className:"dk_input dk_credential",placeholder:"~/.ssh/id_ed25519",value:f.keyPath??"",onChange:x=>I(_,{keyPath:x.target.value})}):null,(f.auth??"agent")==="password"?e("input",{className:"dk_input dk_credential",type:"password",placeholder:f.passwordSet===!0?"\uFF08\u5DF2\u8BBE\u7F6E\uFF0C\u7559\u7A7A\u4FDD\u6301\u4E0D\u53D8\uFF09":"env:SSH_PASSWORD",value:f.password??"",onChange:x=>I(_,{password:x.target.value})}):null,e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:f.agentForward===!0,onChange:x=>I(_,{agentForward:x.target.checked})}),"agent forwarding"]})]}):null]},String(_)+f.name)),o("div",{className:"dk_row",children:[e("button",{type:"button",className:"dk_btn",onClick:E,children:"\u6DFB\u52A0\u76EE\u6807"}),e("span",{className:"dk_hint",children:"SSH \u76EE\u6807\u63A8\u8350\u76F4\u63A5\u9009 tty \u7EC8\u7AEF\u9762\u677F\u7684\u8FDE\u63A5\u7C3F\u6761\u76EE\uFF08\u51ED\u8BC1\u53EA\u9700\u7EF4\u62A4\u4E00\u5904\uFF09\uFF1B\u624B\u586B\u65F6\u5BC6\u7801 / \u53E3\u4EE4\u5EFA\u8BAE\u5199 env:VAR\u3002"})]}),R("SSH \u4E3B\u673A\u5BC6\u94A5\u8BB0\u5F55\uFF08TOFU\uFF09"),...a.hostKeys.length===0?[e("span",{className:"dk_hint",children:"\u6682\u65E0\u8BB0\u5F55 \u2014 \u9996\u6B21 SSH \u8FDE\u63A5\u6210\u529F\u540E\u81EA\u52A8\u8BB0\u5F55\u4E3B\u673A\u6307\u7EB9\uFF08\u82E5 tty \u5DF2\u8BB0\u5F55\u540C\u4E00\u4E3B\u673A\uFF0C\u4F1A\u76F4\u63A5\u590D\u7528\uFF09\u3002"},"none")]:a.hostKeys.map(f=>o("div",{className:"dk_targetRow",children:[e("span",{children:f.host+":"+String(f.port)}),e("span",{className:"dk_hint",style:{gridColumn:"span 2",wordBreak:"break-all"},children:"sha256:"+f.fingerprint}),e("button",{type:"button",className:"dk_btn",onClick:()=>y(f),children:"\u5220\u9664"})]},f.host+":"+String(f.port))),e("span",{className:"dk_hint",children:"\u6307\u7EB9\u53D8\u66F4\u65F6\u8FDE\u63A5\u4F1A\u88AB\u62D2\u7EDD\uFF08\u9632\u4E2D\u95F4\u4EBA\uFF09\uFF1B\u786E\u8BA4\u5B89\u5168\u540E\u5220\u9664\u5BF9\u5E94\u8BB0\u5F55\u5373\u53EF\u91CD\u8FDE\u3002"}),o("div",{className:"dk_row",children:[e("button",{type:"button",className:"dk_btn dk_btnPrimary",disabled:s,onClick:D,children:s?"\u4FDD\u5B58\u4E2D\u2026":"\u4FDD\u5B58"}),e("span",{className:"dk_msg","data-kind":k.kind,children:k.text})]})]:null)}let ht=null,ot=null,Cn=null;function pt(){let t=ot,n=ht,a=Cn;if(ot=null,ht=null,Cn=null,n!==null&&n.remove(),t!==null&&setTimeout(()=>{try{t.unmount()}catch{}},0),a!==null)try{a.dispose()}catch{}}function ko(t){return t!==null&&typeof t=="object"&&typeof t.appendChild=="function"}function go(){return typeof et?.mountPane=="function"&&typeof et.isOpen=="function"&&Number(et.version??0)>=1&&et.isOpen()===!0}let ho="dsh-docker:carrier";function Rr(){try{return window.localStorage.getItem(ho)==="modal"?"modal":"tab"}catch{return"tab"}}let mt=!1;function Mr(t,n,a,r){return t!==!0||r!==!0||typeof a!="string"||a===""?!1:a!==n}function Ar(t){if(Rr()==="tab"&&lt!==null)try{let n={};typeof t?.target=="string"&&t.target!==""&&(n.target=t.target),t?.sessionHint!==void 0&&(n.sessionHint=t.sessionHint),mt=!0,lt.openTab(Pn,{params:n});return}catch(n){console.warn("[dsh-docker] \u6253\u5F00\u53F3\u4FA7\u680F\u6807\u7B7E\u5931\u8D25\uFF0C\u56DE\u9000\u6A21\u6001\uFF1A"+(n instanceof Error?n.message:String(n)))}Br(t)}function Br(t){pt(),jn();let n={onClose:pt,initialTarget:t?.target??"",sessionHint:t?.sessionHint};if(go()){let a=null;try{a=et.mountPane({title:"Docker \u5BB9\u5668",hint:t?.target===void 0||t.target===""?"":t.target,size:520,min:360,onClose:()=>pt()})}catch(r){a=null,console.warn("[dsh-docker] \u6302\u8F7D\u5230\u7EC8\u7AEF\u9762\u677F\u5931\u8D25\uFF0C\u56DE\u9000\u5F39\u7A97\uFF1A"+(r instanceof Error?r.message:String(r)))}if(a!==null&&ko(a.element)){Cn=a,ot=O(a.element),ot.render(e(Gt,{...n,docked:!0,onTargetChange:r=>{try{a.setHint(r)}catch{}}}));return}}ht=document.createElement("div"),document.body.appendChild(ht),ot=O(ht),ot.render(e(Gt,n))}function po(){let t=document.querySelector('[data-pane="sidebar"], [class*="sidebarCol"]');if(t!==null)return t.querySelector('[class*="logoRow"]')?.parentElement??t.firstElementChild}function mo(t){let n=t.querySelector('button[class*="newSession"]');if(n!==null)return n;for(let a of t.children)if(a.tagName==="BUTTON")return a}function fo(){let t=document.createElement("div");return t.dataset.dshDockerEntry="",t.className="dk_sidebarEntry",t.setAttribute("role","button"),t.setAttribute("aria-label","\u5BB9\u5668"),t.innerHTML='<span class="dk_entryIcon">'+Qr+'</span><span class="dk_entryLabel">\u5BB9\u5668</span>',t.addEventListener("click",n=>{n.preventDefault(),Ar()}),t}function Dr(t,n){let a=mo(t);if(a===void 0)return!1;if(n.parentElement!==t){let r=a.closest('[class*="logoRow"]'),u=r!==null&&r.parentElement===t?r:a,d=Array.from(t.children).filter(s=>s instanceof HTMLElement&&s.matches("[data-dsh-global-search-entry], [data-dsh-rss-entry], [data-dsh-taskboard-entry], [data-dsh-ssh-entry], [data-dsh-tty-entry], [data-dsh-docker-entry]"));if(d.length>0){let s=d[d.length-1];t.insertBefore(n,s.nextSibling)}else t.insertBefore(n,u.nextElementSibling)}return!0}function vo(){if(jn(),document.querySelector("[data-dsh-docker-entry]")!==null)return()=>{};let t=fo(),n,a=!1,r=()=>{if(n!==void 0&&!n.isConnected&&(d.disconnect(),n=void 0,a=!1),a){if(document.body.contains(t))return;d.disconnect(),n=void 0,a=!1}n??(n=po()),n!==void 0&&(a=Dr(n,t),a&&d.observe(n,{childList:!0,subtree:!0}))},u=new MutationObserver(()=>{r()});u.observe(document.body,{childList:!0,subtree:!0});let d=new MutationObserver(()=>{if(n===void 0||!n.isConnected){a=!1,r();return}n.contains(t)||(a=Dr(n,t))});return r(),()=>{u.disconnect(),d.disconnect(),t.remove()}}let Te={};return Te.inject=["slots"],Te.__carrier={open:Ar,preference:Rr,isOwnExec:Yr,buildExec:Hn,shouldReopen:Mr,deliver:jt},Te.__feed={projectFeed:Nr,textOf:Ye,applyFeedSnapshot:Sr,feedStatusOf:Er,feedStatusText:Lr,MAX:Sn},Te.__render={ContainerPanel:Gt,DockerTabBody:Or,SessionProbeBody:wr,AgentDrawer:Ir},Te.__pick={MAX:pn,SSH_MAX:Jn,PRESETS:xa,presetCounts:la,apply:ia,SOFT_MAX:ya,decide:ra,toggle:aa,reconcile:oa,items:sa},Te.__events={LIMIT:ua,RECENT:ka,DEBOUNCE_MS:ga,append:ha,actionText:ma,timeText:pa,debounce:fa},Te.__overview={ERROR_MAX:Un,counts:Sa,abnormal:qn,sortRows:Ca,patch:Tt,errorText:Ta,data:ca,body:er},Te.__listSeq={make:da},Te.__panel={chooseInitialTarget:zn,readLastTarget:$r,writeLastTarget:Zr,LAST_TARGET_KEY:Yn},Te.__aggLogs={mergeBuffered:vr,WINDOW_MS:yn,splitTs:hr,levelName:pr,orderByTs:xn,REORDER_TAIL:wn,reorderTail:Ht,filterByLevel:mr,exportText:fr},Te.apply=t=>{jn();let n=!1,a=()=>{};mn={set(d){if(d!==n){if(n=d,d){a=vo();return}a(),a=()=>{},pt(),typeof kn?.requestRender=="function"&&kn.requestRender()}}},ba(!0);let r=t.slots.inject("settings.plugin.item",()=>t.slots.register({name:"settings.plugin.item",key:"docker",order:102},uo));t.inject(["ttyTerminal"],d=>(Xe=d.ttyTerminal??null,()=>{Xe=null})),t.inject(["ttyPanel"],d=>(et=d.ttyPanel??null,()=>{et=null})),t.inject(["sessions"],d=>{ve=d.sessions??null;let s=null;try{s=ve?.list?.getSnapshot?.()?.current??null}catch{}let c=typeof ve?.list?.subscribe=="function"?ve.list.subscribe(()=>{let k=null;try{k=ve.list.getSnapshot()?.current??null}catch{}if(Mr(mt,s,k,lt!==null))try{lt.openTab(Pn,{})}catch{}typeof k=="string"&&k!==""&&(s=k)}):null;return()=>{if(c!==null)try{c()}catch{}ve=null,mt=!1}}),t.inject(["sidebarRightTabs","sidebarRight"],d=>{let s=d.sidebarRightTabs.register({id:qr,kind:Pn,priority:"extension",title:()=>"Docker \u5BB9\u5668",guide:[{order:90,title:()=>"Docker \u5BB9\u5668",description:()=>"\u672C\u673A\u4E0E SSH \u4E3B\u673A\u7684\u5BB9\u5668\u3001\u955C\u50CF\u3001Compose\u3001\u7F51\u7EDC\u4E0E\u5377"}]}),c=d.slots.inject("sidebar.right.pane.tab",()=>d.slots.register({name:"sidebar.right.pane.tab",key:qr},Or));lt=d.sidebarRight??null;let k=()=>{},v=()=>{};try{k=d.sidebarRightTabs.register({id:yr,kind:xr,priority:"extension",title:()=>"\u4F1A\u8BDD\u63A2\u9488",guide:[{order:95,title:()=>"\u4F1A\u8BDD\u63A2\u9488\uFF08spike\uFF09",description:()=>"\u9A8C\u8BC1\u4F1A\u8BDD\u6D41\u5F0F\u8BA2\u9605\uFF1AuseChat / useConversation / projections"}]}),v=d.slots.inject("sidebar.right.pane.tab",()=>d.slots.register({name:"sidebar.right.pane.tab",key:yr},wr)),Ft=d.sidebarRight??null}catch(g){console.warn("[dsh-docker][spike] \u4F1A\u8BDD\u63A2\u9488\u6CE8\u518C\u5931\u8D25\uFF1A"+(g instanceof Error?g.message:String(g)))}return()=>{lt=null,Ft=null;try{v()}catch{}try{k()}catch{}try{c()}catch{}try{s()}catch{}}});let u=()=>{};return hn(),t.inject(["ttyConnbar"],d=>{let s=d.ttyConnbar;s!==void 0&&(kn=s,u=s.addAction(c=>{if(!fn)return;let k=c?.spec??{};if(k.t!=="ssh"||Yr(k.command))return;let v=typeof c?.bookName=="string"?c.bookName:"",g=Wn(k,v),b=g!==void 0?`\u6253\u5F00\u8BE5\u4E3B\u673A\u7684 Docker \u5BB9\u5668\u9762\u677F\uFF08\u76EE\u6807\uFF1A${g}\uFF09`:De===null?"\u6253\u5F00\u5F53\u524D\u4F1A\u8BDD\u4E3B\u673A\u7684 Docker \u5BB9\u5668\u9762\u677F":"\u8BE5\u4E3B\u673A\u5C1A\u672A\u914D\u7F6E\u4E3A Docker \u76EE\u6807 \u2014 \u70B9\u51FB\u6253\u5F00\u9762\u677F\u67E5\u770B/\u914D\u7F6E";c.addAction(qo,"\u5BB9\u5668",b,()=>{(async()=>{let w=await Uo(k,v),I=Number(k.port);Br({target:w??"",sessionHint:w===void 0?{host:typeof k.host=="string"?k.host:"",port:Number.isInteger(I)&&I>0?I:22,book:v}:void 0})})()})}),(async()=>{for(let c=0;c<3;c+=1){if(await hn()){typeof s.requestRender=="function"&&s.requestRender();return}await new Promise(k=>setTimeout(k,2e3))}})())}),()=>{u(),r(),mn=null,fn=!1,kn=null,a(),pt()}},Te}});})();
