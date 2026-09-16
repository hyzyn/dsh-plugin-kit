"use strict";(()=>{var Dr=`/* eslint-disable */
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
`;var Jn="/api/dsh-docker",jr="dsh-docker-style",Hr="@hyzyn/dsh-docker",Bn="docker",lt=null;function Pn(){if(document.getElementById(jr)!==null)return;let l=document.createElement("style");l.id=jr,l.textContent=Dr,document.head.appendChild(l)}async function le(l,h){let e=await fetch(Jn+l,{...h,headers:{"content-type":"application/json",...h?.headers??{}}}),o=null;try{o=await e.json()}catch{}if(!e.ok){let O=o!==null&&typeof o.error=="string"?o.error:`HTTP ${String(e.status)}`;throw new Error(O)}if(o!==null&&o.ok===!1)throw new Error(typeof o.error=="string"?o.error:"\u8BF7\u6C42\u5931\u8D25");return o}var Q={config:()=>le("/config"),saveConfig:l=>le("/config",{method:"POST",body:JSON.stringify(l)}),targets:()=>le("/targets"),probe:l=>le("/probe",{method:"POST",body:JSON.stringify({target:l})}),containers:(l,h)=>le("/containers",{method:"POST",body:JSON.stringify({target:l,all:h})}),attention:l=>le("/attention",{method:"POST",body:JSON.stringify({target:l})}),inspect:(l,h)=>le("/inspect",{method:"POST",body:JSON.stringify({target:l,id:h})}),logs:(l,h,e)=>le("/logs",{method:"POST",body:JSON.stringify({target:l,id:h,...e})}),stats:(l,h)=>le("/stats",{method:"POST",body:JSON.stringify({target:l,ids:h})}),images:l=>le("/images",{method:"POST",body:JSON.stringify({target:l})}),imageInspect:(l,h)=>le("/images/inspect",{method:"POST",body:JSON.stringify({target:l,ref:h})}),imageRemove:(l,h)=>le("/images/remove",{method:"POST",body:JSON.stringify({target:l,ref:h})}),imagePrune:l=>le("/images/prune",{method:"POST",body:JSON.stringify({target:l})}),networks:l=>le("/networks",{method:"POST",body:JSON.stringify({target:l})}),networkInspect:(l,h)=>le("/networks/inspect",{method:"POST",body:JSON.stringify({target:l,name:h})}),networkRemove:(l,h)=>le("/networks/remove",{method:"POST",body:JSON.stringify({target:l,name:h})}),networkPrune:l=>le("/networks/prune",{method:"POST",body:JSON.stringify({target:l})}),volumes:l=>le("/volumes",{method:"POST",body:JSON.stringify({target:l})}),volumeInspect:(l,h)=>le("/volumes/inspect",{method:"POST",body:JSON.stringify({target:l,name:h})}),volumeRemove:(l,h)=>le("/volumes/remove",{method:"POST",body:JSON.stringify({target:l,name:h})}),volumePrune:l=>le("/volumes/prune",{method:"POST",body:JSON.stringify({target:l})}),action:(l,h,e)=>le("/action",{method:"POST",body:JSON.stringify({target:l,action:h,id:e})}),exec:(l,h,e,o)=>le("/exec",{method:"POST",body:JSON.stringify({target:l,id:h,command:e,timeoutSec:o})})};function ln(l,h){return Jn+l+"?"+new URLSearchParams(h).toString()}function Ro(l){return l==null||!Number.isFinite(l)?"\u2014":l.toFixed(l>=10?1:2)+"%"}function Mo(l){return l.hostPort===void 0?String(l.containerPort)+"/"+l.protocol:String(l.hostPort)+"\u2192"+String(l.containerPort)+"/"+l.protocol}function sn(l){if(!Array.isArray(l)||l.length===0)return"\u65E0\u7AEF\u53E3\u6620\u5C04";let h=new Set,e=[];for(let o of l){let O=Mo(o);h.has(O)||(h.add(O),e.push(O))}return e.join("  ")}function St(l){let h=/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/.exec(l);return h===null?l:h[1]+" "+h[2]}function dn(l){if(l==null||!Number.isFinite(l)||l<0)return"\u2014";let h=["B","kB","MB","GB","TB"],e=l,o=0;for(;e>=1e3&&o<h.length-1;)e/=1e3,o+=1;return(o===0?String(Math.round(e)):e.toFixed(e>=100?0:1))+" "+h[o]}function Bo(l){return{running:"\u8FD0\u884C\u4E2D",exited:"\u5DF2\u505C\u6B62",created:"\u5DF2\u521B\u5EFA",paused:"\u5DF2\u6682\u505C",restarting:"\u91CD\u542F\u4E2D",dead:"dead",removing:"\u5220\u9664\u4E2D",unknown:"\u672A\u77E5"}[l]??l}function zr(l,h){let e=new Blob([h],{type:"text/plain;charset=utf-8"}),o=URL.createObjectURL(e),O=document.createElement("a");O.href=o,O.download=l,O.click(),setTimeout(()=>URL.revokeObjectURL(o),1e3)}var da="docker exec -it '";function An(l){let h=String(l).replaceAll("'","'\\''");return da+h+"' sh"}function Fr(l){return typeof l=="string"&&l.startsWith(da)}var Un="dsh-docker:last-target";function Vr(){try{let l=window.localStorage.getItem(Un);return typeof l=="string"?l:""}catch{return""}}function Kr(l){try{window.localStorage.setItem(Un,l)}catch{}}function Dn(l,h,e,o){if(h!=="")return h;if(o)return"";let O=l.map(p=>p.name);return e!==""&&O.includes(e)?e:O.length>0?O[0]:""}var Xe=null,et=null,cn=null,Ae=null,qn=[],Fn=0,hn=null,pn=!1;function ca(l){pn=l,hn!==null&&hn.set(l)}function ua(l){ca(!(l!==null&&typeof l=="object"&&l.enabled===!1))}function jn(l){l!==null&&typeof l=="object"&&(Ae=l),Fn=Date.now(),ua(Ae)}async function kn(){let l=!0;try{Ae=(await Q.config()).config,Fn=Date.now(),ua(Ae)}catch(h){l=!1,console.warn("[dsh-docker] \u914D\u7F6E\u7F13\u5B58\u5237\u65B0\u5931\u8D25\uFF1A"+(h instanceof Error?h.message:String(h)))}try{qn=(await Q.targets()).targets??[],Fn=Date.now()}catch(h){pn&&(l=!1,console.warn("[dsh-docker] \u76EE\u6807\u7F13\u5B58\u5237\u65B0\u5931\u8D25\uFF1A"+(h instanceof Error?h.message:String(h))))}return l}async function Po(l,h){let e=Vn(l,h);return e!==void 0?e:(await kn(),Vn(l,h))}function Vn(l,h){let e=Ae!==null&&Array.isArray(Ae.targets)?Ae.targets:[];if(typeof h=="string"&&h!==""){let I=e.find(P=>P.kind==="ssh"&&P.book===h);if(I!==void 0)return I.name}let o=typeof l?.host=="string"?l.host:"";if(o==="")return;let O=Number(l?.port),p=Number.isInteger(O)&&O>0?O:22;for(let I of qn){if(I.kind!=="ssh"||typeof I.label!="string")continue;let P=/^([^@]+)@(.+?)(?::(\d+))?$/.exec(I.label);if(P!==null&&P[2]===o&&Number(P[3]??22)===p)return I.name}}var Wr='<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 1.8l5.4 3.1v6.2L8 14.2 2.6 11.1V4.9z"/><path d="M2.6 4.9L8 8l5.4-3.1"/><path d="M8 8v6.2"/></svg>',Ao='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 1.8l5.4 3.1v6.2L8 14.2 2.6 11.1V4.9z"/><path d="M2.6 4.9L8 8l5.4-3.1"/><path d="M8 8v6.2"/></svg>',tt='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.2 8a5.2 5.2 0 1 1-1.5-3.7"/><path d="M13.4 2.2v2.6h-2.6"/></svg>',Pe='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M4.5 4.5l7 7"/><path d="M11.5 4.5l-7 7"/></svg>',Do='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 3.4l7.4 4.6L5 12.6z"/></svg>',jo='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4.2" y="4.2" width="7.6" height="7.6" rx="1.2"/></svg>',Ho='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.2 8a5.2 5.2 0 1 1-1.5-3.7"/><path d="M13.4 2.2v2.6h-2.6"/></svg>',un='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4.6h10"/><path d="M6.2 4.6V3.4a.8.8 0 0 1 .8-.8h2a.8.8 0 0 1 .8.8v1.2"/><path d="M4.6 4.6l.6 8a.9.9 0 0 0 .9.8h3.8a.9.9 0 0 0 .9-.8l.6-8"/></svg>';var zo='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3v7.2"/><path d="M5 7.4L8 10.4l3-3"/><path d="M3.4 12.8h9.2"/></svg>',Fo='<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2.6l5.8 10.4H2.2z"/><path d="M8 6.4v3.2"/><path d="M8 11.6h.01"/></svg>',Gr='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5l3.5 3L3 11"/><path d="M8.5 11H13"/></svg>',Jr='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M3 4.5h10"/><path d="M3 8h10"/><path d="M3 11.5h6"/></svg>',Vo='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M3.5 12.5v-4"/><path d="M7 12.5v-8"/><path d="M10.5 12.5v-5"/><path d="M13 12.5v-2"/></svg>',nt='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.5 8h-9"/><path d="M7 4.5L3.5 8 7 11.5"/></svg>',Hn='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6.5L8 10.5l4-4"/></svg>',Ko='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2.6v6.4"/><path d="M5.3 6.5L8 9.2l2.7-2.7"/><path d="M3 11.4v1.2a.8.8 0 0 0 .8.8h8.4a.8.8 0 0 0 .8-.8v-1.2"/></svg>',Wo='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="3.5" width="11" height="9" rx="1.2"/><path d="M2.5 10.2L5.6 7.6l2.4 2 2.1-1.7 3.4 2.9"/><path d="M6 6.2h.01"/></svg>',zn='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.4 12.6h9.2"/><path d="M5.2 9.6l3.1-3.1"/><path d="M8.4 3.6l2.4 2.4"/><path d="M10.6 6.2l1.8 1.8-3.2 1.2-1.2 3.2-1.8-1.8z"/></svg>',Ur='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.4 5.9L8 2.8l5.6 3.1L8 9z"/><path d="M2.4 8.4L8 11.5l5.6-3.1"/><path d="M2.4 10.9L8 14l5.6-3.1"/></svg>';var Go='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="3.2" r="1.7"/><circle cx="3.4" cy="12.2" r="1.7"/><circle cx="12.6" cy="12.2" r="1.7"/><path d="M6.7 4.6L4.5 10.6"/><path d="M9.3 4.6l2.2 6"/><path d="M5.1 12.2h5.8"/></svg>',Jo='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="8" cy="4.2" rx="4.6" ry="1.9"/><path d="M3.4 4.2v7.6c0 1 2.1 1.9 4.6 1.9s4.6-.9 4.6-1.9V4.2"/><path d="M3.4 8c0 1 2.1 1.9 4.6 1.9s4.6-.9 4.6-1.9"/></svg>',ka=6,gn=8,Kn=6;function Uo(l){return(Ae!==null&&Array.isArray(Ae.targets)?Ae.targets:[]).some(e=>e.name===l&&e.kind==="ssh")}function qr(l,h=!1){let e=h===!0?Kn:gn;return l>e?{canRun:!1,hint:"\u6700\u591A "+String(e)+" \u4E2A\u5BB9\u5668"+(h===!0?"\uFF08SSH \u76EE\u6807\u4E0A\u4E00\u6761\u8FDE\u63A5\u8981\u540C\u65F6\u88C5\u5B9E\u65F6\u6D41\u4E0E\u5237\u65B0\u7B49\u77ED\u547D\u4EE4\uFF09":"\uFF0C\u6D4F\u89C8\u5668\u5E76\u53D1\u957F\u8FDE\u63A5\u6709\u9650\u5236")}:l>ka?{canRun:!0,hint:"\u8FDE\u63A5\u6570\u8F83\u591A\uFF0C\u6D4F\u89C8\u5668\u5E76\u53D1\u957F\u8FDE\u63A5\u6709\u9650\u5236"}:l<2?{canRun:!1,hint:l===0?"":"\u81F3\u5C11\u9009\u62E9 2 \u4E2A\u5BB9\u5668"}:{canRun:!0,hint:""}}function Xr(l,h){return l.includes(h)?l.filter(e=>e!==h):[...l,h]}function Yr(l,h){let e=new Set(h.map(O=>O.id)),o=l.filter(O=>e.has(O));return o.length===l.length?l:o}var ga=[{key:"all",label:"\u5168\u90E8\u53EF\u89C1",needsBase:!1},{key:"unhealthy",label:"\u4E0D\u5065\u5EB7",needsBase:!1},{key:"abnormal",label:"\u9700\u5173\u6CE8",needsBase:!1},{key:"stopped",label:"\u5DF2\u505C\u6B62",needsBase:!1},{key:"sameImage",label:"\u540C\u955C\u50CF",needsBase:!0},{key:"sameProject",label:"\u540C\u9879\u76EE",needsBase:!0}],qo=l=>l==="running"||l==="paused"||l==="restarting";function ha(l,h){switch(l){case"all":return()=>!0;case"unhealthy":return e=>e.health==="unhealthy";case"abnormal":return e=>Xn(e).length>0;case"stopped":return e=>!qo(e.state);case"sameImage":return e=>h!==null&&e.image===h.image;case"sameProject":return e=>h!==null&&h.composeProject!==null&&e.composeProject===h.composeProject;default:return()=>!1}}function $r(l,h,e,o,O){let p=ha(e,o),I=Math.max(O-h.length,0),P=l.filter(rt=>!h.includes(rt.id)&&p(rt)),se=P.slice(0,I);return{ids:h.concat(se.map(rt=>rt.id)),added:se.length,skipped:P.length-se.length}}function Zr(l,h,e,o){let O=Math.max(o-h.length,0);return ga.filter(p=>!p.needsBase||e!==null).map(p=>{let I=ha(p.key,e),P=l.filter(se=>!h.includes(se.id)&&I(se)).length;return{key:p.key,label:p.label,count:Math.min(P,O),over:Math.max(P-O,0)}})}function Qr(l,h){let e=new Map(l.map(o=>[o.id,o]));return h.map(o=>e.get(o)).filter(o=>o!==void 0)}function ea(){let l=0;return{next(){return l+=1,l},isCurrent(h){return h===l}}}var Wn=120,pa=[["oom","\u88AB OOM \u6740",0],["dead","\u50F5\u6B7B",1],["unhealthy","\u4E0D\u5065\u5EB7",2],["restarting","\u53CD\u590D\u91CD\u542F",3],["exit-nonzero","\u975E\u96F6\u9000\u51FA",4]],Xo=l=>{let h=pa.find(([e])=>e===l);return h===void 0?l:h[1]},Yo=l=>{let h=pa.find(([e])=>e===l);return h===void 0?9:h[2]};function Xn(l){let h=[];return l.health==="unhealthy"&&h.push("unhealthy"),l.state==="restarting"&&h.push("restarting"),l.state==="dead"&&h.push("dead"),l.state==="exited"&&typeof l.exitCode=="number"&&l.exitCode!==0&&h.push("exit-nonzero"),h}function $o(l){let h=p=>{if(typeof p!="string"||p==="")return"";let I=Date.parse(p);return Number.isFinite(I)?new Date(I).toLocaleString():""},e=["\u6253\u5F00\u5BB9\u5668\u8BE6\u60C5"],o=h(l.finishedAt),O=h(l.startedAt);return o!==""?e.push("\u7ED3\u675F\u4E8E "+o):O!==""&&e.push("\u542F\u52A8\u4E8E "+O),typeof l.restartCount=="number"&&e.push("\u91CD\u542F\u6B21\u6570 "+String(l.restartCount)),typeof l.exitCode=="number"&&e.push("\u9000\u51FA\u7801 "+String(l.exitCode)),e.join(" \xB7 ")}function Gn(l){return l.filter(h=>Xn(h).length>0)}function ma(l){let h=0,e=0,o=0;for(let O of l)O.state==="running"||O.state==="paused"||O.state==="restarting"?h+=1:e+=1,O.health==="unhealthy"&&(o+=1);return{running:h,stopped:e,unhealthy:o}}function fa(l){let h=e=>{let o=Array.isArray(e.reasons)?e.reasons:[];return o.length===0?e.item.health==="unhealthy"?2:3:Math.min(...o.map(Yo))};return l.slice().sort((e,o)=>{let O=h(e)-h(o);return O!==0?O:e.targetIndex!==o.targetIndex?e.targetIndex-o.targetIndex:e.item.name===o.item.name?0:e.item.name<o.item.name?-1:1})}function va(l){let h=String(l??"").split(`
`)[0].trim();return h===""?"\u672A\u77E5\u9519\u8BEF":h.length>Wn?h.slice(0,Wn)+"\u2026":h}function Ct(l,h,e){let o=!1,O=l.map(p=>p.name!==h?p:(o=!0,{...p,...e}));return o?O:l}function ta(l){let h=l.map(o=>{let O=ma(o.containers),p=Gn(o.containers),I=Array.isArray(o.attention)?o.attention.length:null;return{name:o.name,kind:o.kind==="ssh"?"ssh":"local",label:typeof o.label=="string"?o.label:"",error:o.error===""?"":va(o.error),loaded:o.loaded===!0,running:O.running,stopped:O.stopped,unhealthy:O.unhealthy,attention:I===null?p.length:I,attentionApprox:I===null}}),e=[];return l.forEach((o,O)=>{if(Array.isArray(o.attention)){for(let p of o.attention)e.push({target:o.name,targetIndex:O,item:p,reasons:Array.isArray(p.reasons)?p.reasons:[]});return}for(let p of Gn(o.containers))e.push({target:o.name,targetIndex:O,item:p,reasons:Xn(p)})}),{cards:h,rows:fa(e),unreachable:h.filter(o=>o.error!==""),loading:l.some(o=>o.loaded!==!0)}}var na=50,ra=8,aa=500;function oa(l,h,e){let o=[h,...l];return o.length>e?o.slice(0,e):o}function ia(l){if(typeof l!="number"||!Number.isFinite(l))return"--:--:--";let h=new Date(l*1e3);if(Number.isNaN(h.getTime()))return"--:--:--";let e=o=>String(o).padStart(2,"0");return e(h.getHours())+":"+e(h.getMinutes())+":"+e(h.getSeconds())}function la(l){let h=typeof l.action=="string"?l.action:"";return h===""?"?":h.indexOf("die")!==0||l.exitCode===null||l.exitCode===void 0?h:h+"("+String(l.exitCode)+")"}function sa(l,h){let e=null;return{schedule(){e!==null&&clearTimeout(e),e=setTimeout(()=>{e=null,h()},l)},cancel(){e!==null&&(clearTimeout(e),e=null)}}}window.__ModuleLoader__.load({id:"@hyzyn/dsh-docker",factory:l=>{let h=l("react"),{jsx:e,jsxs:o}=l("react/jsx-runtime"),{createRoot:O}=l("react-dom/client"),{useState:p,useEffect:I,useRef:P,useCallback:se}=h;function rt(t,n,a){if(n==="")return t;let r=t.toLowerCase(),u=n.toLowerCase(),d=[],c=0,s=r.indexOf(u),k=0;for(;s>=0&&k<500;)s>c&&d.push(t.slice(c,s)),d.push(e("mark",{children:t.slice(s,s+u.length)},a+"-m"+String(k))),c=s+u.length,k+=1,s=r.indexOf(u,c);return c<t.length&&d.push(t.slice(c)),d}function Yn(t){let n=Array.isArray(t.rows)?t.rows:[],a=Array.isArray(t.mono)?t.mono:[];return o("div",{className:"dk_kv",children:n.flatMap(([r,u],d)=>[e("div",{className:"dk_kvKey",children:r},"k"+String(d)),e("div",{className:"dk_kvVal"+(a.indexOf(r)>=0?" dk_kvValMono":""),children:u},"v"+String(d))])})}function st(t){let n=t.health==="unhealthy"?"unhealthy":t.state,a=t.health==="unhealthy"?"\u4E0D\u5065\u5EB7":Bo(t.state);return e("span",{className:"dk_badge","data-state":n,title:t.status??"",children:a})}function Y(t){return o("div",{className:"dk_banner","data-kind":t.kind??"error",children:[e("span",{className:"dk_bannerIcon",dangerouslySetInnerHTML:{__html:Fo}},"icon"),o("div",{className:"dk_bannerBody",children:[e("div",{children:t.title}),t.hint===void 0?null:e("div",{className:"dk_hint",style:{marginTop:4},children:t.hint})]},"body"),t.action===void 0?null:e("div",{className:"dk_bannerAction",children:t.action},"action")]})}function Tt(t,n,a){return o("span",{className:"dk_ovCount","data-state":t,"data-zero":a===0?"1":void 0,children:[e("span",{className:"dk_ovCountValue",children:String(a)}),e("span",{className:"dk_ovCountLabel",children:n})]},t)}function $n(t,n){if(t.cards.length===0)return o("div",{className:"dk_empty",children:[e("div",{className:"dk_emptyTitle",children:"\u8FD8\u6CA1\u6709\u914D\u7F6E Docker \u76EE\u6807"}),e("div",{className:"dk_emptyHint",children:"\u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6DFB\u52A0\u76EE\u6807\u540E\uFF0C\u603B\u89C8\u4F1A\u5728\u8FD9\u91CC\u4E00\u5C4F\u6C47\u603B\u5168\u90E8\u4E3B\u673A\u3002"})]});let a=t.rows.length===0?t.loading?o("div",{className:"dk_empty dk_ovEmpty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]},"loading"):o("div",{className:"dk_empty dk_ovEmpty",children:[e("div",{className:"dk_emptyTitle",children:"\u4E00\u5207\u6B63\u5E38"}),e("div",{className:"dk_emptyHint",children:"\u6240\u6709\u76EE\u6807\u4E0A\u90FD\u6CA1\u6709\u9700\u8981\u5173\u6CE8\u7684\u5BB9\u5668\uFF08\u4E0D\u5065\u5EB7 / \u53CD\u590D\u91CD\u542F / \u88AB OOM \u6740 / \u975E\u96F6\u9000\u51FA / \u50F5\u6B7B\uFF09\u3002"})]},"empty"):e("div",{className:"dk_tableWrap",children:o("table",{className:"dk_images dk_ovTable",children:[e("thead",{children:o("tr",{children:[e("th",{children:"\u5BB9\u5668\u540D"}),e("th",{children:"\u76EE\u6807"}),e("th",{children:"\u72B6\u6001"}),e("th",{children:"\u539F\u56E0"}),e("th",{children:"\u955C\u50CF"})]})}),e("tbody",{children:t.rows.map(r=>o("tr",{className:"dk_rowClickable",title:$o(r.item),onClick:()=>n.onOpenContainer(r.target,r.item),children:[e("td",{className:"dk_mono",title:r.item.name,children:r.item.name}),e("td",{children:r.target}),e("td",{children:e(st,{state:r.item.state,health:r.item.health,status:r.item.status})}),e("td",{children:e("span",{className:"dk_reasons",children:(r.reasons??[]).map(u=>e("span",{className:"dk_reason","data-reason":u,children:Xo(u)},u))})}),e("td",{className:"dk_mono dk_pathCell",title:r.item.image,children:r.item.image})]},r.target+"\0"+r.item.id))})]})},0);return o("div",{className:"dk_imagesView dk_ovView",children:[t.unreachable.length===0?null:e(Y,{title:String(t.unreachable.length)+" \u4E2A\u76EE\u6807\u4E0D\u53EF\u8FBE",hint:t.unreachable.map(r=>r.name+"\uFF1A"+r.error).join("\uFF1B")+"\uFF08\u5176\u4F59\u76EE\u6807\u7684\u6B63\u5E38\u7ED3\u679C\u4E0D\u53D7\u5F71\u54CD\uFF09"},"unreachable"),e("div",{className:"dk_ovCards",children:t.cards.map(r=>o("button",{type:"button",className:"dk_ovCard","data-state":r.error!==""?"error":r.loaded===!0?"ok":"loading",title:r.error===""?"\u5207\u5230\u8BE5\u76EE\u6807\u7684\u5BB9\u5668\u5217\u8868":r.error,onClick:()=>n.onOpenTarget(r.name),children:[o("div",{className:"dk_ovCardHead",children:[e("span",{className:"dk_ovCardName",title:r.label===""?r.name:r.label,children:r.name}),e("span",{className:"dk_badge","data-state":"paused",children:r.kind==="local"?"\u672C\u673A":"SSH"})]},"head"),r.error===""?r.loaded===!0?o("div",{className:"dk_ovCardCounts",children:[Tt("running","\u8FD0\u884C\u4E2D",r.running),Tt("stopped","\u5DF2\u505C\u6B62",r.stopped),Tt("unhealthy","\u4E0D\u5065\u5EB7",r.unhealthy),Tt("attention",r.attentionApprox?"\u9700\u5173\u6CE8\uFF08\u7C97\u5224\uFF09":"\u9700\u5173\u6CE8",r.attention)]},"counts"):o("div",{className:"dk_ovCardLoading",children:[e("span",{className:"dk_spin"}),e("span",{children:"\u8BFB\u53D6\u4E2D\u2026"})]},"loading"):o("div",{className:"dk_ovCardError",children:[e("span",{className:"dk_badge","data-state":"dead",children:"\u4E0D\u53EF\u8FBE"}),e("span",{className:"dk_ovCardErrorText",title:r.error,children:r.error})]},"error")]},r.name))},1),e("div",{className:"dk_ovSection",children:t.rows.length===0?"\u9700\u5173\u6CE8\u5BB9\u5668":"\u9700\u5173\u6CE8\u5BB9\u5668\uFF08"+String(t.rows.length)+"\uFF09"},2),a]})}function dt(t){let n=t.busy===!0;return o("div",{className:"dk_confirmBackdrop",onMouseDown:a=>a.stopPropagation(),children:[o("div",{className:"dk_confirm","data-busy":n?"1":void 0,children:[e("div",{className:"dk_confirmTitle",children:t.title}),e("div",{className:"dk_confirmText",children:t.text}),o("div",{className:"dk_confirmActions",children:[e("button",{type:"button",className:"dk_btn",disabled:n,onClick:t.onCancel,children:"\u53D6\u6D88"}),e("button",{type:"button",className:"dk_btn dk_btnDanger",disabled:n,"aria-busy":n?"true":void 0,onClick:t.onConfirm,children:n?o("span",{className:"dk_confirmBusy",children:[e("span",{className:"dk_spin"}),"\u6267\u884C\u4E2D\u2026"]}):t.confirmLabel})]})]})]})}function Zo(t){return e("button",{type:"button",className:"dk_btn"+(t.danger===!0?" dk_btnDanger":""),disabled:t.disabled===!0,title:t.title??"",onClick:n=>{n.stopPropagation(),t.onClick()},children:t.children})}let Zn=60;function Qn(t,n,a){let r=t.concat([n]);return r.length>a?r.slice(r.length-a):r}function er(t){let n=Array.isArray(t.values)?t.values:[],a=n.filter(g=>typeof g=="number"&&Number.isFinite(g)),r=96,u=22,d=Math.max(Number(t.max)||0,...a,1),c=n.length>1?r/(n.length-1):0,s=[];n.forEach((g,v)=>{if(typeof g!="number"||!Number.isFinite(g))return;let w=c===0?r:v*c,E=u-Math.min(1,Math.max(0,g/d))*u;s.push(w.toFixed(1)+","+E.toFixed(1))});let k=a.length===0?null:a[a.length-1],b=t.alertAt!==void 0&&k!==null&&k>=t.alertAt;return e("span",{className:"dk_spark","data-alert":b?"1":void 0,title:t.title??"",children:s.length<2?e("span",{className:"dk_sparkEmpty",children:"\u91C7\u6837\u4E2D\u2026"}):e("svg",{viewBox:"0 0 "+String(r)+" "+String(u),preserveAspectRatio:"none","aria-hidden":"true",children:e("polyline",{points:s.join(" "),fill:"none",stroke:"currentColor","stroke-width":"1.4","stroke-linejoin":"round","stroke-linecap":"round","vector-effect":"non-scaling-stroke"})})})}function ct(t){return o("div",{className:"dk_cardRow",children:[e("span",{className:"dk_cardLabel",children:t.label}),e("span",{className:"dk_cardValue",title:String(t.value),children:t.value})]})}function $(t){let n=t.disabled===!0,a=t.busy===!0;return e("button",{type:"button",className:"dk_iconBtn"+(t.danger===!0?" dk_iconBtnDanger":""),"data-on":t.on===!0?"1":void 0,"data-spin":t.spin===!0?"1":void 0,"data-busy":a?"1":void 0,"aria-busy":a?"true":void 0,disabled:n,title:t.title,"aria-label":t.title,onClick:r=>{r.stopPropagation(),!n&&t.onClick()},children:a?e("span",{className:"dk_spin"}):e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:t.icon}})})}function ba(t){let n=t.item,a=t.pickMode===!0,r=t.picked===!0,u=t.allowMutations!==!0,d=n.state==="running"||n.state==="paused"||n.state==="restarting",c=n.createdAt===null?n.runningFor===""?"\u2014":n.runningFor:St(n.createdAt),s=typeof t.pending=="string"?t.pending:"",k=s!=="",b=v=>k?"\u6B63\u5728\u6267\u884C "+s+"\u2026\u8BF7\u7A0D\u5019":u?"\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D":v,g=()=>{if(a){t.onTogglePick(n);return}t.onOpen(n,"overview")};return o("div",{className:"dk_card",role:a?"checkbox":"button","aria-checked":a?r?"true":"false":void 0,tabIndex:0,"data-selected":t.selected===!0?"1":"0","data-pick":a?"1":void 0,"data-picked":r?"1":void 0,"data-pending":k?"1":void 0,onClick:g,onKeyDown:v=>{(v.key==="Enter"||v.key===" ")&&(v.preventDefault(),g())},children:[o("div",{className:"dk_cardHead",children:[a?e("span",{className:"dk_pick","data-on":r?"1":"0","aria-hidden":"true"},"pick"):null,e("span",{className:"dk_cardName",title:n.name,children:n.name}),e(st,{state:n.state,health:n.health,status:n.status})]},"head"),o("div",{className:"dk_cardRows",children:[e(ct,{label:"\u955C\u50CF",value:n.image},"image"),e(ct,{label:"ID",value:n.shortId},"id"),e(ct,{label:"\u7AEF\u53E3",value:sn(n.ports)},"ports"),e(ct,{label:"\u521B\u5EFA",value:c},"created"),n.composeProject===null?null:e(ct,{label:"compose",value:n.composeProject+(n.composeService===null?"":"/"+n.composeService)},"compose")]},"rows"),a?null:o("div",{className:"dk_actionBar",children:[e($,{icon:Gr,title:"\u5728\u5BB9\u5668\u5185\u6253\u5F00\u4EA4\u4E92\u5F0F\u7EC8\u7AEF\uFF08docker exec -it "+n.name+" sh\uFF09",onClick:()=>t.onExec(n)},"exec"),e($,{icon:Jr,title:"\u67E5\u770B\u65E5\u5FD7",onClick:()=>t.onOpen(n,"logs")},"logs"),e($,{icon:Vo,title:"\u8D44\u6E90\u5360\u7528",onClick:()=>t.onOpen(n,"stats")},"stats"),e("span",{className:"dk_actionBarSep","aria-hidden":"true"},"sep"),e($,{icon:d?jo:Do,title:b(d?"\u505C\u6B62\u5BB9\u5668":"\u542F\u52A8\u5BB9\u5668"),disabled:u||k,busy:s===(d?"stop":"start"),onClick:()=>t.onAction(d?"stop":"start",n)},"power"),e($,{icon:Ho,title:b("\u91CD\u542F\u5BB9\u5668"),disabled:u||k,busy:s==="restart",onClick:()=>t.onAction("restart",n)},"restart"),e($,{icon:un,danger:!0,title:b("\u5220\u9664\u5BB9\u5668\uFF08\u4E0D\u53EF\u6062\u590D\uFF09"),disabled:u||k,busy:s==="remove",onClick:()=>t.onAction("remove",n)},"remove")]},"actions")]})}let _a=/^\s*(\[\d{4}-\d{2}-\d{2}[ T][0-9:.,]+\]|\d{2}:\d{2}:\d{2}[,.]\d{3})/,tr=/^\s*(\[(?:TRACE|DEBUG|INFO|WARN|ERROR|FATAL)\]|\|\s*(?:TRACE|DEBUG|INFO|WARN|ERROR|FATAL))/,nr=/(TRACE|DEBUG|INFO|WARN|ERROR|FATAL)/,ut=2e3,Oe=5e3;function rr(t,n,a){let r=[],u=t;for(let d=0;d<2;d+=1){let c=_a.exec(u);if(c!==null){r.push(e("span",{className:"dk_logTs",children:c[1]},"ts"+String(d))),u=u.slice(c[0].length);continue}let s=tr.exec(u);if(s!==null){let k=nr.exec(s[1]);r.push(e("span",{className:"dk_logLevel","data-level":k===null?"":k[1],children:s[1].trim()},"lv"+String(d))),u=u.slice(s[0].length);continue}break}return r.push(e("span",{className:"dk_logText",children:rt(u,a,"x"+String(n))},"tx")),r}function ya(t,n,a){return o("div",{className:"dk_logLine",children:rr(t,n,a)},String(n))}function xa(t,n,a,r){let u=r===!0&&typeof t.ts=="number"&&Number.isFinite(t.ts)?e("span",{className:"dk_logTs",children:new Date(t.ts).toLocaleTimeString()},"ts"):null;return o("div",{className:"dk_logLine","data-log-ts":typeof t.ts=="number"&&Number.isFinite(t.ts)?String(t.ts):void 0,children:[e("span",{className:"dk_logSvc",children:"["+t.service+"]"},"svc"),u,...rr(t.text,n,a)]},String(n))}let Ce=null,mn=20,ar=400;function or(){if(Ce===null)return{ok:!1,reason:"\u5BBF\u4E3B\u672A\u63D0\u4F9B sessions \u670D\u52A1"};let t;try{t=Ce.list?.getSnapshot?.()?.current}catch(n){return{ok:!1,reason:n instanceof Error?n.message:String(n)}}if(typeof t!="string"||t==="")return{ok:!1,reason:"\u5F53\u524D\u6CA1\u6709\u6253\u5F00\u7684\u4F1A\u8BDD"};try{let n=Ce.scope(t);if(n===void 0)return{ok:!1,reason:"\u4F1A\u8BDD\u5C1A\u672A\u5C31\u7EEA\uFF08\u4F5C\u7528\u57DF\u672A\u6302\u8F7D\uFF09"};let a=n.get?.("conversation")??n.conversation??null;return a===null?{ok:!1,reason:"\u5BBF\u4E3B\u7F3A\u5C11 conversation \u670D\u52A1"}:{ok:!0,id:t,actx:n,conversation:a}}catch(n){return{ok:!1,reason:n instanceof Error?n.message:String(n)}}}function Lt(t){let n=t.querySelector(".dk_logSvc"),a=t.querySelector(".dk_logLevel"),r=t.querySelector(".dk_logText"),u=r===null?t.textContent??"":r.textContent??"",d=Number(t.dataset.logTs);if((!Number.isFinite(d)||d<=0)&&(d=null),d===null){let c=cr.exec(u);if(c!==null){let s=Date.parse(c[1]);Number.isFinite(s)&&(d=s,u=u.slice(c[0].length))}}return{svc:n===null?"":n.textContent.replace(/^\[|\]$/g,""),lv:a===null?"":a.textContent.trim(),ts:d,text:u}}function wa(t){let n=[];return t.svc!==""&&n.push("["+t.svc+"]"),t.ts!==null&&n.push(new Date(t.ts).toISOString()),t.lv!==""&&n.push(t.lv),n.length===0?t.text:n.join(" ")+" "+t.text}function Na(t){return Array.from(t.querySelectorAll(".dk_logLine")).filter(n=>n.querySelector(".dk_logText")!==null)}function Et(t){let n=t==null?null:t.nodeType===Node.ELEMENT_NODE?t:t.parentElement;return n===null?null:n.closest(".dk_logLine")}function Sa(t,n){let a=Na(t);if(a.length===0)return null;let r=null,u=null;try{let s=window.getSelection();if(s!==null&&s.isCollapsed===!1&&s.rangeCount>0){let k=s.getRangeAt(0);t.contains(k.commonAncestorContainer)&&(r=Et(k.startContainer),u=Et(k.endContainer))}}catch{}(r===null||u===null)&&(r=Et(n.target),u=r);let d=a.indexOf(r),c=a.indexOf(u);if((d<0||c<0)&&(r=Et(n.target),d=a.indexOf(r),c=d),d<0)return null;if(d>c){let s=d;d=c,c=s}return{rows:a,from:d,to:c}}function Ca(t,n){let a=String(n.to-n.from+1);if(t.containers.length===1)return a+" \u884C \xB7 "+t.containers[0].name;let r=new Set;for(let u=n.from;u<=n.to;u+=1){let d=Lt(n.rows[u]).svc;d!==""&&r.add(d)}return r.size===0?a+" \u884C":a+" \u884C \xB7 "+[...r].slice(0,3).join("/")}function Ta(t,n){let a=n.rows,r=[];for(let v=n.from;v<=n.to&&r.length<ar;v+=1)r.push(Lt(a[v]));let u=a.slice(Math.max(0,n.from-mn),n.from).map(Lt),d=a.slice(n.to+1,Math.min(a.length,n.to+1+mn)).map(Lt),c=r.concat(u,d).map(v=>v.ts).filter(v=>v!==null),s=[...new Set(r.map(v=>v.svc).filter(v=>v!==""))],k=r.length<n.to-n.from+1,b=[];b.push("[dsh-docker] \u5BB9\u5668\u65E5\u5FD7\u7247\u6BB5"),b.push(""),b.push("- \u76EE\u6807\uFF1A"+(t.targetLabel!==""?t.targetLabel:t.target!==""?t.target:"\u672A\u77E5"));for(let v of t.containers.slice(0,3))b.push("- \u5BB9\u5668\uFF1A"+v.name+"\uFF08"+String(v.id)+(v.image===void 0||v.image===""?"":"\uFF0C\u955C\u50CF "+String(v.image))+"\uFF09");t.containers.length>3&&b.push("- \u5BB9\u5668\uFF1A\u53E6\u6709 "+String(t.containers.length-3)+" \u4E2A\uFF0C\u89C1\u5404\u884C\u7684 [service] \u524D\u7F00"),s.length>0&&b.push("- \u6D89\u53CA\u670D\u52A1\uFF1A"+s.join("\u3001")),b.push("- \u65F6\u95F4\u7A97\uFF1A"+(c.length===0?"\u672A\u542F\u7528\u65F6\u95F4\u6233\uFF0C\u65E0\u65F6\u95F4\u7A97":new Date(Math.min(...c)).toISOString()+" \u2192 "+new Date(Math.max(...c)).toISOString())),b.push("- \u9009\u4E2D\uFF1A"+String(r.length)+" \u884C"+(k?"\uFF08\u5DF2\u622A\u65AD\uFF0C\u4E0A\u9650 "+String(ar)+" \u884C\uFF09":"")+"\uFF0C\u53E6\u9644\u524D\u540E\u5404 "+String(mn)+" \u884C\u4E0A\u4E0B\u6587"+(t.filtered===!0?"\uFF08\u4E0A\u4E0B\u6587\u53D6\u81EA\u5F53\u524D\u8FC7\u6EE4\u540E\u7684\u89C6\u56FE\uFF09":""));let g=(v,w)=>{if(w.length!==0){b.push(""),b.push("--- "+v+" ---");for(let E of w)b.push(wa(E))}};return g("\u4E0A\u4E0B\u6587\uFF08\u524D "+String(u.length)+" \u884C\uFF09",u),g("\u9009\u4E2D\uFF08"+String(r.length)+" \u884C\uFF09",r),g("\u4E0A\u4E0B\u6587\uFF08\u540E "+String(d.length)+" \u884C\uFF09",d),b.push(""),b.push("\u9700\u8981\u66F4\u591A\u4E0A\u4E0B\u6587\u8BF7\u81EA\u884C\u62C9\u53D6\uFF0C\u4E0D\u8981\u81C6\u6D4B\u672A\u7ED9\u51FA\u7684\u5185\u5BB9\uFF1A`docker_logs` / `docker_inspect`\uFF0Ctarget="+JSON.stringify(t.target)+(t.containers.length===1?"\uFF0Cid="+JSON.stringify(t.containers[0].name):"")+"\u3002"),b.join(`
`)}let It=null,Ot=null,Rt=null,Mt=null;function kt(){Ot!==null&&(Ot(),Ot=null),It!==null&&(It.remove(),It=null)}function Bt(){Mt!==null&&(Mt(),Mt=null),Rt!==null&&(Rt.remove(),Rt=null)}function La(t,n,a){let u=t.getBoundingClientRect(),d=n,c=a;d+u.width>window.innerWidth-8&&(d=Math.max(8,n-u.width)),c+u.height>window.innerHeight-8&&(c=Math.max(8,a-u.height)),t.style.left=String(Math.round(d))+"px",t.style.top=String(Math.round(c))+"px"}function Pt(t,n="error"){let a=document.createElement("div");a.className="dk_askToast",a.dataset.kind=n,a.textContent=t,document.body.appendChild(a),setTimeout(()=>a.remove(),5e3)}let At="";function ir(t){t.ok!==!0&&Pt("\u672A\u80FD\u4EA4\u7ED9\u4F1A\u8BDD\uFF1A"+t.message)}function Ea(t){kt();let n=document.createElement("div");n.className="dk_menu",n.setAttribute("role","menu");let a=document.createElement("div");a.className="dk_menuHead",a.textContent=t.head,n.appendChild(a);let r=document.createElement("div");r.className="dk_menuSub",r.textContent=t.sub,n.appendChild(r);for(let k of t.items){let b=document.createElement("button");b.type="button",b.className="dk_menuItem",b.setAttribute("role","menuitem"),b.disabled=k.disabled===!0,k.disabled===!0&&(b.title=k.reason);let g=document.createElement("span");g.className="dk_menuItemLabel",g.textContent=k.label,b.appendChild(g);let v=document.createElement("span");v.className="dk_menuItemHint",v.textContent=k.disabled===!0?k.reason:k.hint??"",b.appendChild(v),k.disabled!==!0&&b.addEventListener("click",()=>{kt(),k.onPick()}),n.appendChild(b)}let u=document.createElement("div");u.className="dk_menuNote",u.textContent=t.note,n.appendChild(u),document.body.appendChild(n),La(n,t.x,t.y),It=n;let d=k=>{k.key==="Escape"&&kt()},c=k=>{n.contains(k.target)||kt()},s=()=>kt();document.addEventListener("keydown",d,!0),document.addEventListener("mousedown",c,!0),document.addEventListener("wheel",s,{capture:!0,passive:!0}),document.addEventListener("touchmove",s,{capture:!0,passive:!0}),window.addEventListener("resize",s),Ot=()=>{document.removeEventListener("keydown",d,!0),document.removeEventListener("mousedown",c,!0),document.removeEventListener("wheel",s,!0),document.removeEventListener("touchmove",s,!0),window.removeEventListener("resize",s)}}function Ia(t){return navigator.clipboard!==void 0&&navigator.clipboard!==null?navigator.clipboard.writeText(t):new Promise((n,a)=>{let r=document.createElement("textarea");r.value=t,r.style.position="fixed",r.style.opacity="0",document.body.appendChild(r),r.select();let u=!1;try{u=document.execCommand("copy")}catch{u=!1}r.remove(),u?n():a(new Error("\u6D4F\u89C8\u5668\u62D2\u7EDD\u4E86\u590D\u5236"))})}function lr(t,n){try{let a=typeof t.conversation.input?.for=="function"?t.conversation.input.for(t.actx):null;a!==null&&typeof a.notify=="function"&&a.notify("info",n)}catch{}}async function Dt(t,n){let a=or();if(a.ok!==!0)return{ok:!1,message:a.reason};try{if(n==="draft"){let r=typeof a.conversation.input?.for=="function"?a.conversation.input.for(a.actx):null;return r===null||typeof r.setDraft!="function"?{ok:!1,message:"\u5BBF\u4E3B\u672A\u63D0\u4F9B\u4F1A\u8BDD\u8F93\u5165\u95E8\u9762\uFF0C\u65E0\u6CD5\u53EA\u586B\u8349\u7A3F"}:(r.setDraft(t),lr(a,"\u65E5\u5FD7\u7247\u6BB5\u5DF2\u586B\u5165\u8F93\u5165\u6846\uFF0C\u786E\u8BA4\u540E\u518D\u53D1\u9001"),Pt("\u5DF2\u586B\u5165\u5F53\u524D\u4F1A\u8BDD\u7684\u8F93\u5165\u6846"+At,"ok"),{ok:!0,message:"\u5DF2\u586B\u5165\u8F93\u5165\u6846"})}return await a.conversation.send(t),lr(a,"\u65E5\u5FD7\u7247\u6BB5\u5DF2\u53D1\u9001\u5230\u4F1A\u8BDD"),Pt("\u5DF2\u53D1\u9001\u65E5\u5FD7\u7247\u6BB5\u5230\u5F53\u524D\u4F1A\u8BDD"+At,"ok"),{ok:!0,message:"\u5DF2\u53D1\u9001"}}catch(r){return{ok:!1,message:r instanceof Error?r.message:String(r)}}}function Oa(t){Bt();let n=document.createElement("div");n.className="dk_askCard",n.setAttribute("role","dialog");let a=document.createElement("div");a.className="dk_askCardHead",a.textContent=t.head,n.appendChild(a);let r=document.createElement("textarea");r.className="dk_askCardText",r.spellcheck=!1,r.value=t.prompt,n.appendChild(r);let u=document.createElement("div");u.className="dk_askCardStatus",n.appendChild(u);let d=document.createElement("div");d.className="dk_askCardFoot";let c=(L,D,y)=>{let A=document.createElement("button");return A.type="button",A.className="dk_btn"+(D===void 0?"":" "+D),A.textContent=L,A.addEventListener("click",y),d.appendChild(A),A},s=c("\u53D1\u9001","dk_btnPrimary",()=>{v("send",s)}),k=c("\u53EA\u586B\u8F93\u5165\u6846",void 0,()=>{v("draft",k)});c("\u590D\u5236",void 0,()=>{Ia(r.value).then(()=>{u.textContent="\u5DF2\u590D\u5236\u8BCA\u65AD\u5305",u.dataset.kind="ok"},L=>{u.textContent="\u590D\u5236\u5931\u8D25\uFF1A"+(L instanceof Error?L.message:String(L)),u.dataset.kind="error"})});let b=c("\u53D6\u6D88",void 0,()=>Bt());n.appendChild(d);let g=document.createElement("div");g.className="dk_askCardHint",g.textContent="\u5185\u5BB9\u4F1A\u8FDB\u5165\u6A21\u578B\u4E0A\u4E0B\u6587\uFF0C\u8BF7\u7559\u610F\u5176\u4E2D\u7684\u51ED\u8BC1\u4E0E\u7528\u6237\u6570\u636E\u3002",n.appendChild(g);let v=async(L,D)=>{s.disabled=!0,k.disabled=!0,b.disabled=!0,D.textContent=L==="send"?"\u53D1\u9001\u4E2D\u2026":"\u5199\u5165\u4E2D\u2026";let y=await Dt(r.value,L);if(y.ok===!0){Bt();return}u.textContent=y.message,u.dataset.kind="error",s.disabled=!1,k.disabled=!1,b.disabled=!1,D.textContent=L==="send"?"\u53D1\u9001":"\u53EA\u586B\u8F93\u5165\u6846"};document.body.appendChild(n);let w=n.getBoundingClientRect();n.style.left=String(Math.round(Math.max(8,(window.innerWidth-w.width)/2)))+"px",n.style.top=String(Math.round(Math.max(8,(window.innerHeight-w.height)/2)))+"px",r.focus(),Rt=n;let E=L=>{L.key==="Escape"&&Bt()};document.addEventListener("keydown",E,!0),Mt=()=>document.removeEventListener("keydown",E,!0)}function sr(t,n,a){let r=Sa(n,t);if(r===null)return;t.preventDefault();let u=or(),d=()=>Ta(a,r),c=u.ok!==!0,s=c?u.reason:"";Ea({x:t.clientX,y:t.clientY,head:"\u95EE Agent",sub:Ca(a,r)+(c?" \xB7 "+s:" \xB7 \u5F53\u524D\u4F1A\u8BDD"),items:[{label:"\u9884\u89C8\u540E\u53D1\u9001\u2026",hint:"\u53EF\u6539\u5B8C\u518D\u53D1",disabled:c,reason:s,onPick:()=>Oa({head:"\u53D1\u9001\u65E5\u5FD7\u7247\u6BB5\u5230\u5F53\u524D\u4F1A\u8BDD",prompt:d()})},{label:"\u76F4\u63A5\u53D1\u9001\u5230\u5F53\u524D\u4F1A\u8BDD",hint:"\u7ACB\u5373\u5F00\u59CB\u5206\u6790",disabled:c,reason:s,onPick:()=>{Dt(d(),"send").then(ir)}},{label:"\u53EA\u586B\u5165\u8F93\u5165\u6846",hint:"\u4E0D\u53D1\u9001",disabled:c,reason:s,onPick:()=>{Dt(d(),"draft").then(ir)}},{label:"\u4F1A\u8BDD\u8BA2\u9605\u63A2\u9488\uFF08spike\uFF09",hint:"\u65B9\u6848 B \u8BFB\u6570",disabled:Ht===null,reason:"\u5BBF\u4E3B\u672A\u63D0\u4F9B\u53F3\u4FA7\u680F\u670D\u52A1\uFF08sidebarRight\uFF09",onPick:()=>{try{Ht?.openTab?.(br)}catch(k){Pt("\u6253\u5F00\u63A2\u9488\u5931\u8D25\uFF1A"+(k instanceof Error?k.message:String(k)))}}}],note:"\u65E5\u5FD7\u5185\u5BB9\u4F1A\u8FDB\u5165\u6A21\u578B\u4E0A\u4E0B\u6587\uFF0C\u8BF7\u7559\u610F\u5176\u4E2D\u7684\u51ED\u8BC1\u3002"})}function Ra(t){let n=t.item,a=t.config,[r,u]=p(t.initialTab??"overview"),d=wn(),[c,s]=p(null),[k,b]=p(""),[g,v]=p({tail:a.logTailDefault,timestamps:!1}),[w,E]=p(null),[L,D]=p(""),[y,A]=p(!1),[R,H]=p(""),[T,ne]=p(!1),[f,_]=p(3),[x,z]=p(!1),[U,q]=p([]),[ae,ke]=p(""),[$e,me]=p(""),[De,be]=p(""),[ze,Ge]=p(!1),[ge,Fe]=p(!0),B=P([]),oe=P(""),ee=P(null),[X,it]=p(null),[fe,we]=p(""),[ce,Le]=p(!1),[j,Z]=p(""),[re,Ne]=p(""),[_e,ve]=p({cpu:[],mem:[]}),Ve=P({cpu:[],mem:[]}),[Je,Sn]=p(""),[Ee,Kt]=p(null),[Wt,mt]=p(""),[ft,Ke]=p(!1);I(()=>{let N=!0;return s(null),b(""),Q.inspect(t.target,n.id).then(M=>{N&&s(M.details?.[0]??null)}).catch(M=>{N&&b(M.message)}),()=>{N=!1}},[t.target,n.id,t.refreshToken]);let he=se(()=>{A(!0),D(""),Q.logs(t.target,n.id,{tail:g.tail,timestamps:g.timestamps}).then(N=>E(N.logs)).catch(N=>D(N.message)).finally(()=>A(!1))},[t.target,n.id,g.tail,g.timestamps]);I(()=>{r==="logs"&&he()},[r,he,t.refreshToken]),I(()=>{if(r!=="logs"||!T||x)return;let N=setInterval(he,Math.max(1,f)*1e3);return()=>clearInterval(N)},[r,T,f,he,x]),I(()=>{if(!d||r!=="logs"||!x)return;if(typeof EventSource!="function"){me("\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301 EventSource\uFF0C\u65E0\u6CD5\u5B9E\u65F6\u8DDF\u968F"),z(!1);return}B.current=[],oe.current="",q([]),Ge(!1),me(""),be(""),Fe(!0),ke("connecting");let N=new URLSearchParams({target:t.target,id:n.id,tail:String(g.tail),...g.timestamps?{timestamps:"1"}:{}}),M=new EventSource(Jn+"/logs/stream?"+N.toString()),S=!1,F=()=>{if(!S){S=!0;try{M.close()}catch{}}},V=K=>{if(K==="")return;let W=(oe.current+K).split(`
`);if(oe.current=W.pop()??"",W.length===0)return;let ue=B.current.concat(W),qe=ue.length>Oe?ue.slice(ue.length-Oe):ue;B.current=qe,qe.length!==ue.length&&Ge(!0),q(qe)},G=K=>{let W=null;try{W=JSON.parse(K.data)}catch{return}W===null||typeof W!="object"||(typeof W.d=="string"?V(W.d):typeof W.e=="string"&&V(W.e))},de=K=>{let W=null;try{W=JSON.parse(K.data)}catch{}let ue=W!==null&&typeof W.reason=="string"?W.reason:"container-exit",qe=W!==null&&typeof W.code=="number"?W.code:null;if(ue==="container-exit"){be("\u5BB9\u5668\u5DF2\u9000\u51FA"+(qe===null?"":"\uFF08\u9000\u51FA\u7801 "+String(qe)+"\uFF09")+"\uFF0C\u65E5\u5FD7\u6D41\u7ED3\u675F\uFF0C\u5DF2\u5207\u56DE\u5FEB\u7167"),F(),z(!1),he();return}ke("reconnecting"),be("\u670D\u52A1\u7AEF\u5DF2\u505C\u6B62\u65E5\u5FD7\u6D41\uFF0C\u6B63\u5728\u91CD\u8FDE\u2026")},J=K=>{if(typeof K.data=="string"&&K.data!==""){let W="\u65E5\u5FD7\u6D41\u5F02\u5E38";try{let ue=JSON.parse(K.data);ue!==null&&typeof ue.message=="string"&&(W=ue.message)}catch{}me(W),F(),z(!1),he();return}ke(M.readyState===2?"closed":"reconnecting")};return M.addEventListener("line",G),M.addEventListener("end",de),M.addEventListener("error",J),M.onopen=()=>{ke("open"),be("")},F},[r,x,t.target,n.id,g.tail,g.timestamps,he]),I(()=>{if(r!=="logs"||!x||!ge)return;let N=ee.current;N!==null&&(N.scrollTop=N.scrollHeight)},[d,r,x,ge,U]);let Gt=()=>{if(x){z(!1),ke(""),he();return}z(!0),ne(!1),me(""),be("")},Cn=()=>{if(ce){Le(!1),Z("");return}Le(!0),Ne(""),we("")},vt=()=>j==="open"?"\u5B9E\u65F6\u8DDF\u968F\u4E2D\uFF08docker stats\uFF09":j==="connecting"?"\u6B63\u5728\u8FDE\u63A5\u7EDF\u8BA1\u6D41\u2026":j==="reconnecting"?"\u8FDE\u63A5\u4E2D\u65AD\uFF0C\u6B63\u5728\u81EA\u52A8\u91CD\u8FDE\u2026":j==="closed"?"\u7EDF\u8BA1\u6D41\u5DF2\u65AD\u5F00":"\u7EDF\u8BA1\u6D41",Jt=()=>{let N=ee.current;N!==null&&(N.scrollTop=N.scrollHeight),Fe(!0)},Ue=N=>{if(!x)return;let M=N.currentTarget;Fe(M.scrollHeight-M.scrollTop-M.clientHeight<24)},je=()=>ae==="open"?"\u5B9E\u65F6\u8DDF\u968F\u4E2D\uFF08docker logs -f\uFF09":ae==="connecting"?"\u6B63\u5728\u8FDE\u63A5\u65E5\u5FD7\u6D41\u2026":ae==="reconnecting"?"\u8FDE\u63A5\u4E2D\u65AD\uFF0C\u6B63\u5728\u81EA\u52A8\u91CD\u8FDE\u2026":ae==="closed"?"\u65E5\u5FD7\u6D41\u5DF2\u65AD\u5F00":"\u65E5\u5FD7\u6D41";I(()=>{if(r!=="stats"||ce)return;let N=!0,M=()=>{Q.stats(t.target,[n.id]).then(F=>{N&&(it(F.stats?.[0]??null),we(""))}).catch(F=>{N&&we(F.message)})};M();let S=setInterval(M,Math.max(2,a.pollIntervalSec)*1e3);return()=>{N=!1,clearInterval(S)}},[r,ce,t.target,n.id,a.pollIntervalSec,t.refreshToken]),I(()=>{if(!d||r!=="stats"||!ce)return;if(typeof EventSource!="function"){Ne("\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301 EventSource\uFF0C\u65E0\u6CD5\u5B9E\u65F6\u8DDF\u968F"),Le(!1);return}Ve.current={cpu:[],mem:[]},ve({cpu:[],mem:[]}),Z("connecting"),Ne(""),we("");let N=new EventSource(ln("/stats/stream",{target:t.target,ids:n.id})),M=!1,S=()=>{if(!M){M=!0;try{N.close()}catch{}}},F=de=>{let J=null;try{J=JSON.parse(de.data)}catch{return}if(J===null||typeof J!="object")return;let K=typeof J.cpuPercent=="number"?J.cpuPercent:null,W=typeof J.memPercent=="number"?J.memPercent:null;it(J),we("");let ue={cpu:K===null?Ve.current.cpu:Qn(Ve.current.cpu,K,Zn),mem:W===null?Ve.current.mem:Qn(Ve.current.mem,W,Zn)};Ve.current=ue,ve(ue)},V=de=>{let J=null;try{J=JSON.parse(de.data)}catch{}let K=J!==null&&typeof J.reason=="string"?J.reason:"stats-exit",W=J!==null&&typeof J.code=="number"?J.code:null;Ne("\u7EDF\u8BA1\u6D41\u5DF2\u7ED3\u675F"+(K==="stats-exit"?"\uFF08docker stats \u9000\u51FA"+(W===null?"":"\uFF0C\u9000\u51FA\u7801 "+String(W))+"\uFF09":"")+"\uFF0C\u5DF2\u5207\u56DE\u5FEB\u7167\u8F6E\u8BE2"),S(),Le(!1)},G=de=>{if(typeof de.data=="string"&&de.data!==""){let J="\u7EDF\u8BA1\u6D41\u5F02\u5E38";try{let K=JSON.parse(de.data);K!==null&&typeof K.message=="string"&&(J=K.message)}catch{}we(J),S(),Le(!1);return}Z(N.readyState===2?"closed":"reconnecting")};return N.addEventListener("stats",F),N.addEventListener("end",V),N.addEventListener("error",G),N.onopen=()=>{Z("open"),Ne("")},S},[d,r,ce,t.target,n.id]);let Ut=()=>{Je.trim()!==""&&(Ke(!0),mt(""),Kt(null),Q.exec(t.target,n.id,Je,a.execTimeoutSec).then(N=>Kt(N.result)).catch(N=>mt(N.message)).finally(()=>Ke(!1)))},qt=()=>{if(k!=="")return e(Y,{title:"\u8BFB\u53D6\u5BB9\u5668\u8BE6\u60C5\u5931\u8D25",hint:k});if(c===null)return e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]});let N=[["\u72B6\u6001",c.state+(c.health===null?"":" / "+c.health)+(c.status===""?"":"\uFF08"+c.status+"\uFF09")],["\u955C\u50CF",c.image],["\u5BB9\u5668 ID",c.shortId],["\u542F\u52A8\u65F6\u95F4",c.startedAt??"\u2014"],["\u7ED3\u675F\u65F6\u95F4",c.finishedAt??"\u2014"],["\u9000\u51FA\u7801",c.exitCode===null?"\u2014":String(c.exitCode)],["\u91CD\u542F\u6B21\u6570",c.restartCount===null?"\u2014":String(c.restartCount)],["\u91CD\u542F\u7B56\u7565",c.restartPolicy??"\u2014"],["PID",c.pid===null?"\u2014":String(c.pid)],["\u7AEF\u53E3",c.ports.length===0?"\u2014":sn(c.ports)],["\u6302\u8F7D",c.mounts.length===0?"\u2014":c.mounts.map(S=>S.source+"\u2192"+S.destination+(S.readWrite?"":"\uFF08\u53EA\u8BFB\uFF09")).join(`
`)],["\u7F51\u7EDC",c.networks.length===0?"\u2014":c.networks.map(S=>S.name+(S.ip===null?"":"\uFF08"+S.ip+"\uFF09")).join(", ")],["\u547D\u4EE4",(c.entrypoint+" "+c.command).trim()||"\u2014"],["\u5DE5\u4F5C\u76EE\u5F55",c.workingDir===""?"\u2014":c.workingDir],["\u7528\u6237",c.user===""?"\u2014":c.user]],M=o("div",{className:"dk_kv",children:N.flatMap(([S,F],V)=>[e("div",{className:"dk_kvKey",children:S},"k"+String(V)),e("div",{className:"dk_kvVal"+(S==="\u5BB9\u5668 ID"||S==="\u547D\u4EE4"||S==="\u955C\u50CF"?" dk_kvValMono":""),children:F},"v"+String(V))])});return o("div",{children:[c.healthLogTail===null?null:e("div",{className:"dk_hint",style:{marginBottom:8},children:"\u6700\u8FD1\u5065\u5EB7\u68C0\u67E5\u8F93\u51FA\uFF1A"+c.healthLogTail}),M,e("div",{className:"dk_cardSection",style:{marginTop:16},children:"\u4E00\u6B21\u6027\u547D\u4EE4\uFF08docker exec\uFF09"}),a.allowExec!==!0?e(Y,{kind:"info",title:"exec \u672A\u542F\u7528",hint:"\u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6253\u5F00\u300C\u5141\u8BB8 exec\u300D\uFF0C\u6216\u76F4\u63A5\u590D\u5236\u5361\u7247\u4E0A\u7684 exec \u547D\u4EE4\u5230\u7EC8\u7AEF\u9762\u677F\u4EA4\u4E92\u5F0F\u8FDB\u5165\u5BB9\u5668\u3002"}):o("div",{children:[o("div",{className:"dk_row",children:[e("input",{className:"dk_input",style:{flex:"1 1 auto"},placeholder:"\u5982 ls -la /app \u6216 cat /etc/nginx/nginx.conf",value:Je,onChange:S=>Sn(S.target.value),onKeyDown:S=>{S.key==="Enter"&&Ut()}}),e("button",{type:"button",className:"dk_btn dk_btnPrimary",disabled:ft,onClick:Ut,children:ft?"\u6267\u884C\u4E2D\u2026":"\u6267\u884C"})]}),Wt===""?null:e(Y,{title:"\u6267\u884C\u5931\u8D25",hint:Wt}),Ee===null?null:o("div",{style:{marginTop:8},children:[e("div",{className:"dk_hint",children:"\u9000\u51FA\u7801 "+(Ee.code===null?"?":String(Ee.code))+" \xB7 \u8017\u65F6 "+String(Ee.durationMs)+"ms"+(Ee.truncated?" \xB7 \u8F93\u51FA\u5DF2\u622A\u65AD":"")}),e("pre",{className:"dk_logBox",style:{marginTop:6},children:(Ee.stdout||"")+(Ee.stderr===""?"":`
[stderr]
`+Ee.stderr)||"(\u65E0\u8F93\u51FA)"})]})]})]})},ye=()=>{let N=x?U.join(`
`):w!==null&&typeof w=="object"&&typeof w.text=="string"?w.text:"",M=R.trim().toLowerCase(),S=N===""?[]:N.split(`
`),F=M===""?S:S.filter(V=>V.toLowerCase().includes(M));return{raw:N,needle:M,allLines:S,matchedLines:F}},Se=(N,M,S,F)=>e("button",{type:"button",className:"dk_pill"+(F?.className??""),"data-on":N?"1":"0",disabled:F?.disabled===!0,title:F?.title??"",onClick:S,children:M}),Xt=()=>{let{raw:N}=ye(),M=[...new Set([100,200,500,1e3,5e3,Number(a.logTailDefault)||200,Number(g.tail)||200])].filter(S=>Number.isInteger(S)&&S>0).sort((S,F)=>S-F);return o("div",{className:"dk_logTools",children:[e("span",{className:"dk_toolLabel",children:"LINES"}),e("select",{className:"dk_select dk_selectSm",value:String(g.tail),onChange:S=>v({...g,tail:Number(S.target.value)}),children:M.map(S=>e("option",{value:String(S),children:S===5e3?"Last 5000":"Last "+String(S)},String(S)))}),e("span",{className:"dk_toolLabel",children:"TIMESTAMPS"}),Se(g.timestamps,g.timestamps?"On":"Off",()=>v({...g,timestamps:!g.timestamps})),e("span",{className:"dk_toolLabel",children:"FOLLOW"}),Se(x,x?"On":"Off",Gt,{className:" dk_pillFollow",title:x?"\u5173\u95ED\u5B9E\u65F6\u8DDF\u968F\uFF08\u56DE\u5230\u65E5\u5FD7\u5FEB\u7167\uFF09":"\u5B9E\u65F6\u8DDF\u968F\u5BB9\u5668\u65E5\u5FD7\uFF08docker logs -f\uFF09"}),e("span",{className:"dk_toolLabel",children:"AUTO REFRESH"}),Se(T,T?"On":"Off",()=>ne(S=>!S),{disabled:x,title:x?"FOLLOW \u6253\u5F00\u65F6\u6682\u505C\u8F6E\u8BE2":"\u6309\u4E0B\u65B9\u95F4\u9694\u91CD\u65B0\u62C9\u53D6\u65E5\u5FD7\u5FEB\u7167"}),e("select",{className:"dk_select dk_selectSm",value:String(f),disabled:x,title:"\u81EA\u52A8\u5237\u65B0\u95F4\u9694\uFF08\u5F00\u542F AUTO REFRESH \u540E\u6309\u6B64\u8F6E\u8BE2\uFF09",onChange:S=>_(Number(S.target.value)),children:[2,3,5,10].map(S=>e("option",{value:String(S),children:String(S)+"s"},String(S)))}),e($,{icon:tt,title:"\u5237\u65B0\u65E5\u5FD7",spin:y,onClick:he},"refresh"),e($,{icon:zo,title:"\u4E0B\u8F7D\u65E5\u5FD7",disabled:N==="",onClick:()=>zr(n.name+".log",N)},"download")]})},Yt=()=>{let{needle:N,allLines:M,matchedLines:S}=ye();return o("div",{className:"dk_filterBar",children:[o("div",{className:"dk_filterWrap",children:[e("input",{className:"dk_input dk_filterInput",placeholder:"\u8FC7\u6EE4\u65E5\u5FD7\u2026",value:R,onChange:F=>H(F.target.value),onKeyDown:F=>{F.key==="Escape"&&R!==""&&(F.stopPropagation(),H(""))}}),R===""?null:e("button",{type:"button",className:"dk_filterClear",title:"\u6E05\u7A7A\u8FC7\u6EE4","aria-label":"\u6E05\u7A7A\u8FC7\u6EE4",onClick:()=>H(""),children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Pe}})},"clear")]}),e("span",{className:"dk_filterCount",children:N===""?String(M.length)+" \u884C":String(S.length)+" / "+String(M.length)+" \u884C\u5339\u914D"})]})},$t=()=>{let{needle:N,matchedLines:M}=ye(),S=M.length>ut?M.slice(-ut):M;return o("div",{className:"dk_logs",children:[L===""?null:e(Y,{title:"\u8BFB\u53D6\u65E5\u5FD7\u5931\u8D25",hint:L+(L.includes("Failed to fetch")?"\uFF08\u7F51\u7EDC\u8BF7\u6C42\u6CA1\u5230\u5BBF\u4E3B\uFF1A\u5BBF\u4E3B\u53EF\u80FD\u521A\u91CD\u542F\u3001\u6216\u8FDE\u63A5\u88AB\u4E2D\u65AD\uFF09":""),action:e("button",{type:"button",className:"dk_btn",disabled:y,onClick:he,children:"\u91CD\u8BD5"})}),$e===""?null:e(Y,{title:"\u65E5\u5FD7\u6D41\u4E2D\u65AD",hint:$e,action:e("button",{type:"button",className:"dk_btn",onClick:Gt,children:"\u91CD\u8BD5"})}),De===""?null:e(Y,{kind:"info",title:De}),ze?e(Y,{kind:"warn",title:"\u65E5\u5FD7\u8D85\u8FC7 "+String(Oe)+" \u884C\uFF0C\u5DF2\u4E22\u5F03\u6700\u65E9\u5185\u5BB9",hint:"\u6D41\u5F0F\u65E5\u5FD7\u53EA\u4FDD\u7559\u6700\u8FD1\u7684\u884C\uFF1B\u9700\u8981\u5B8C\u6574\u5386\u53F2\u8BF7\u7528\u5FEB\u7167\u6216\u300C\u4E0B\u8F7D\u65E5\u5FD7\u300D\u3002"}):null,!x&&w!==null&&w.truncated===!0?e(Y,{kind:"warn",title:"\u65E5\u5FD7\u8F93\u51FA\u8D85\u8FC7\u4E0A\u9650\uFF0C\u5DF2\u622A\u65AD",hint:"\u8C03\u5C0F\u300CLINES\u300D\u6216\u5230\u8BBE\u7F6E\u5361\u7247\u8C03\u5927\u300C\u5355\u6B21\u547D\u4EE4\u8F93\u51FA\u4E0A\u9650\u300D\u3002"}):null,x?e("div",{className:"dk_followState","data-state":ae,children:je()}):null,o("div",{className:"dk_logBody",ref:ee,onScroll:Ue,onContextMenu:F=>sr(F,ee.current,{target:t.target,targetLabel:t.targetLabel??"",containers:[n],filtered:N!==""}),children:[M.length>S.length?e("div",{className:"dk_logLine dk_logMore",children:"\uFF08\u53EA\u663E\u793A\u6700\u8FD1 "+String(ut)+" \u884C\uFF0C\u5171 "+String(M.length)+" \u884C\u5339\u914D\uFF09"},"more"):null,L!==""?null:!x&&w===null?e("div",{className:"dk_logLine",children:"\u8BFB\u53D6\u4E2D\u2026"},"loading"):S.length===0?e("div",{className:"dk_logLine",children:x?"\u7B49\u5F85\u65E5\u5FD7\u2026":N===""?"(\u65E0\u65E5\u5FD7)":"(\u65E0\u5339\u914D\u65E5\u5FD7)"},"empty"):S.map((F,V)=>ya(F,V,N))]}),x&&!ge?e("button",{type:"button",className:"dk_backToBottom",onClick:Jt,children:"\u56DE\u5230\u5E95\u90E8"}):null]})},Ze=()=>{let N=ce,M=o("div",{className:"dk_statsBar",children:[e("span",{className:"dk_toolLabel",children:"FOLLOW"}),Se(N,N?"On":"Off",Cn,{className:" dk_pillFollow",title:N?"\u5173\u95ED\u5B9E\u65F6\u8DDF\u968F\uFF08\u56DE\u5230 docker stats \u5FEB\u7167\uFF09":"\u5B9E\u65F6\u8DDF\u968F\u8D44\u6E90\u5360\u7528\uFF08docker stats \u6BCF\u79D2\u4E00\u884C\uFF09"}),e("span",{className:"dk_hint",children:N?"60 \u70B9 \u2248 \u6700\u8FD1 1 \u5206\u949F":"\u6253\u5F00 FOLLOW \u770B\u5B9E\u65F6\u8D8B\u52BF"}),e("span",{className:"dk_headerSpacer"}),N?e("span",{className:"dk_followState","data-state":j,children:vt()}):null]}),S=K=>o("div",{className:"dk_statsView",children:[M,K]});if(re!=="")return S(o("div",{children:[e(Y,{kind:"info",title:re}),fe===""?null:e(Y,{title:"\u8BFB\u53D6\u7EDF\u8BA1\u5931\u8D25",hint:fe})]}));if(fe!=="")return S(e(Y,{title:"\u8BFB\u53D6\u7EDF\u8BA1\u5931\u8D25",hint:fe}));if(X===null)return S(e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]}));let F=X.cpuPercent??0,V=X.memPercent??0,G=K=>o("div",{className:"dk_bar",children:[e("div",{className:"dk_barFill","data-warn":K>=60&&K<85?"1":void 0,"data-danger":K>=85?"1":void 0,style:{width:Math.min(100,Math.max(0,K))+"%"}})]}),de=Math.max(100,..._e.cpu),J=(K,W,ue)=>o("tr",{children:[e("td",{children:K}),e("td",{className:"dk_num",children:W}),e("td",{children:ue??null})]},K);return S(o("table",{className:"dk_stats",children:[e("thead",{children:o("tr",{children:[e("th",{children:"\u6307\u6807"}),e("th",{children:"\u6570\u503C"}),e("th",{children:"\u5360\u7528 / \u8D8B\u52BF"})]})}),e("tbody",{children:[J("CPU",Ro(X.cpuPercent),o("div",{className:"dk_trend",children:[G(F),N||_e.cpu.length>0?e(er,{values:_e.cpu,max:de,alertAt:85,title:"CPU% \u6700\u8FD1 60 \u4E2A\u91C7\u6837"}):null]})),J("\u5185\u5B58",X.memUsage,o("div",{className:"dk_trend",children:[G(V),N||_e.mem.length>0?e(er,{values:_e.mem,max:100,alertAt:85,title:"\u5185\u5B58\u5360\u7528% \u6700\u8FD1 60 \u4E2A\u91C7\u6837"}):null]})),J("\u7F51\u7EDC IO",X.netIO,null),J("\u78C1\u76D8 IO",X.blockIO,null),J("PIDs",X.pids===null?"\u2014":String(X.pids),null)]})]}))},Zt=[["overview","\u6982\u89C8"],["logs","\u65E5\u5FD7"],["stats","\u7EDF\u8BA1"]],Tn=r==="overview"?c===null&&k==="":r==="stats"?X===null&&fe==="":!1;return o("div",{className:"dk_detail",children:[o("div",{className:"dk_header dk_headerDetail",children:[e($,{icon:nt,title:"\u8FD4\u56DE\u5BB9\u5668\u5217\u8868",onClick:t.onBack},"back"),e("span",{className:"dk_detailTitle",title:n.name,children:n.name}),e(st,{state:n.state,health:n.health,status:n.status}),e("span",{className:"dk_detailSub",children:t.targetLabel??""}),e("span",{className:"dk_headerSpacer"}),r==="logs"?Xt():e($,{icon:tt,title:"\u5237\u65B0",spin:Tn,onClick:t.onRefresh},"refresh"),t.docked===!0?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:t.onClose,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Pe}})},"close")]}),o("div",{className:"dk_tabs",children:[...Zt.map(([N,M])=>e("button",{type:"button",className:"dk_tab","data-on":r===N?"1":"0",onClick:()=>u(N),children:M},N)),r==="logs"?e("span",{className:"dk_headerSpacer"},"spacer"):null,r==="logs"?Yt():null]}),e("div",{className:"dk_detailBody",children:r==="overview"?qt():r==="logs"?$t():Ze()})]})}function fn(t){return t.dangling===!0?t.id:t.reference}function Ma(t){let n=t.item,a=fn(n),[r,u]=p("overview"),[d,c]=p(null),[s,k]=p(""),[b,g]=p(!1),v=se(()=>{g(!0),k(""),Q.imageInspect(t.target,a).then(y=>c(y.image)).catch(y=>k(y.message)).finally(()=>g(!1))},[t.target,a]);I(()=>{v()},[v]);let w=y=>o("div",{className:"dk_kv",children:y.flatMap(([A,R],H)=>[e("div",{className:"dk_kvKey",children:A},"k"+String(H)),e("div",{className:"dk_kvVal"+(["ID","\u5165\u53E3","digest"].indexOf(A)>=0?" dk_kvValMono":""),children:R},"v"+String(H))])}),E=()=>{if(s!=="")return e(Y,{title:"\u8BFB\u53D6\u955C\u50CF\u8BE6\u60C5\u5931\u8D25",hint:s,action:e("button",{type:"button",className:"dk_btn",onClick:v,children:"\u91CD\u8BD5"})});if(d===null)return e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]});let y=d.detail,A=[["\u6807\u7B7E",y.repoTags.length===0?"<none>\uFF08dangling\uFF09":y.repoTags.join(`
`)],["ID",y.id],["\u5927\u5C0F",y.size===null?"\u2014":dn(y.size)],["\u542B\u7236\u5C42",y.virtualSize===null?"\u2014":dn(y.virtualSize)],["\u521B\u5EFA",y.created===""?"\u2014":St(y.created)],["\u5E73\u53F0",y.os===""&&y.architecture===""?"\u2014":y.os+"/"+y.architecture],["\u5C42\u6570",String(y.layerCount)],["\u5165\u53E3",(y.entrypoint+" "+y.command).trim()||"\u2014"],["\u5DE5\u4F5C\u76EE\u5F55",y.workingDir===""?"\u2014":y.workingDir],["\u7528\u6237",y.user===""?"\u2014":y.user],["\u66B4\u9732\u7AEF\u53E3",y.exposedPorts.length===0?"\u2014":y.exposedPorts.join(", ")],["digest",y.repoDigests.length===0?"\u2014":y.repoDigests.join(`
`)]],R=Object.entries(y.labels);return o("div",{children:[w(A),e("div",{className:"dk_cardSection",style:{marginTop:16},children:"\u5C42\uFF08"+String(y.layerCount)+"\uFF09"}),y.layers.length===0?e("span",{className:"dk_hint",children:"\u8BE5\u955C\u50CF\u6CA1\u6709\u5C42\u4FE1\u606F\uFF08scratch \u6784\u5EFA\u6216\u65E7\u7248 docker\uFF09\u3002"}):e("div",{className:"dk_layerList",children:y.layers.map((H,T)=>o("div",{className:"dk_layerItem",children:[e("span",{className:"dk_layerIndex",children:"#"+String(T)}),e("span",{className:"dk_mono dk_layerId",title:H,children:H.replace(/^sha256:/,"")})]},H+String(T)))}),R.length===0?null:o("div",{children:[e("div",{className:"dk_cardSection",style:{marginTop:16},children:"\u6807\u7B7E\uFF08"+String(R.length)+"\uFF09"}),e("div",{className:"dk_labelList",children:R.map(([H,T])=>o("div",{className:"dk_labelItem",children:[e("span",{className:"dk_labelKey",children:H}),e("span",{className:"dk_labelVal",title:T,children:T})]},H))})]})]})},L=()=>s!==""?e(Y,{title:"\u8BFB\u53D6\u955C\u50CF\u8BE6\u60C5\u5931\u8D25",hint:s}):d===null?e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]}):d.historyError!==null?e(Y,{kind:"warn",title:"\u8BFB\u53D6\u6784\u5EFA\u5386\u53F2\u5931\u8D25",hint:d.historyError}):d.history.length===0?o("div",{className:"dk_empty",children:[e("div",{className:"dk_emptyTitle",children:"\u6CA1\u6709\u6784\u5EFA\u5386\u53F2"}),e("div",{className:"dk_emptyHint",children:"\u8BE5 docker \u7248\u672C\u65E2\u6CA1\u6709 history --format\uFF08\u9700\u8981 Docker \u2265 26\uFF09\uFF0C\u7EAF\u6587\u672C\u8868\u683C\u4E5F\u6CA1\u89E3\u6790\u51FA\u5185\u5BB9\u3002"})]}):e("div",{className:"dk_tableWrap",children:o("table",{className:"dk_images dk_historyTable",children:[e("thead",{children:o("tr",{children:[e("th",{children:"\u5C42 ID"}),e("th",{children:"\u521B\u5EFA"}),e("th",{children:"\u5927\u5C0F"}),e("th",{children:"\u6784\u5EFA\u547D\u4EE4"})]})}),e("tbody",{children:d.history.map((y,A)=>o("tr",{children:[e("td",{className:"dk_mono",children:y.shortId}),e("td",{children:y.createdSince===""?y.created===""?"\u2014":St(y.created):y.createdSince}),e("td",{children:y.sizeText===""?y.size===null?"\u2014":dn(y.size):y.sizeText}),e("td",{className:"dk_mono dk_historyCmd",title:y.createdBy,children:y.createdBy===""?"\u2014":y.createdBy})]},String(A)))})]})}),D=[["overview","\u6982\u89C8"],["history","\u6784\u5EFA\u5386\u53F2"]];return o("div",{className:"dk_detail",children:[o("div",{className:"dk_header dk_headerDetail",children:[e($,{icon:nt,title:"\u8FD4\u56DE\u955C\u50CF\u5217\u8868",onClick:t.onBack},"back"),e("span",{className:"dk_detailTitle",title:a,children:a}),n.dangling===!0?e("span",{className:"dk_badge","data-state":"paused",children:"dangling"}):null,e("span",{className:"dk_detailSub",children:t.targetLabel??""}),e("span",{className:"dk_headerSpacer"}),e($,{icon:tt,title:"\u5237\u65B0\u955C\u50CF\u8BE6\u60C5",spin:b,onClick:v},"refresh"),t.docked===!0?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:t.onClose,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Pe}})},"close")]}),e("div",{className:"dk_tabs",children:D.map(([y,A])=>e("button",{type:"button",className:"dk_tab","data-on":r===y?"1":"0",onClick:()=>u(y),children:A},y))}),e("div",{className:"dk_detailBody",children:r==="overview"?E():L()})]})}function Ba(t){let n=t.item,a=n.name,[r,u]=p("overview"),[d,c]=p(null),[s,k]=p(""),[b,g]=p(!1),[v,w]=p(!1),[E,L]=p(!1),[D,y]=p(""),A=se(()=>{g(!0),k(""),Q.networkInspect(t.target,a).then(f=>c(f.network)).catch(f=>k(f.message)).finally(()=>g(!1))},[t.target,a]);I(()=>{A()},[A]);let R=()=>{L(!0),y(""),Q.networkRemove(t.target,a).then(f=>t.onRemoved(f.result.message)).catch(f=>{w(!1),y(f.message)}).finally(()=>L(!1))},H=()=>{if(s!=="")return e(Y,{title:"\u8BFB\u53D6\u7F51\u7EDC\u8BE6\u60C5\u5931\u8D25",hint:s,action:e("button",{type:"button",className:"dk_btn",onClick:A,children:"\u91CD\u8BD5"})});if(d===null)return e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]});let f=d.detail,_=[["\u540D\u79F0",f.name],["ID",f.id],["\u9A71\u52A8",f.driver===""?"\u2014":f.driver],["\u8303\u56F4",f.scope===""?"\u2014":f.scope],["\u521B\u5EFA",f.created===""?"\u2014":St(f.created)],["\u5B50\u7F51",f.subnets.length===0?"\u2014":f.subnets.map(x=>x.subnet===""?"\u2014":x.subnet).join(`
`)],["\u7F51\u5173",f.subnets.length===0?"\u2014":f.subnets.map(x=>x.gateway===""?"\u2014":x.gateway).join(`
`)],["\u5C5E\u6027",[f.internal?"internal":"",f.attachable?"attachable":"",f.ingress?"ingress":"",f.enableIpv6?"ipv6":""].filter(x=>x!=="").join(" \xB7 ")||"\u2014"],["\u9009\u9879",Object.keys(f.options).length===0?"\u2014":Object.entries(f.options).map(([x,z])=>x+"="+z).join(`
`)],["\u6807\u7B7E",Object.keys(f.labels).length===0?"\u2014":Object.entries(f.labels).map(([x,z])=>x+"="+z).join(`
`)]];return e(Yn,{rows:_,mono:["ID","\u5B50\u7F51","\u7F51\u5173","\u9009\u9879","\u6807\u7B7E"]})},T=()=>{if(s!=="")return e(Y,{title:"\u8BFB\u53D6\u7F51\u7EDC\u8BE6\u60C5\u5931\u8D25",hint:s});if(d===null)return e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]});let f=d.detail.containers;return f.length===0?e("div",{className:"dk_empty",children:[e("div",{className:"dk_emptyTitle",children:"\u6CA1\u6709\u5BB9\u5668\u63A5\u5165\u8FD9\u4E2A\u7F51\u7EDC"})]}):e("div",{className:"dk_tableWrap",children:o("table",{className:"dk_images",children:[e("thead",{children:o("tr",{children:[e("th",{children:"\u5BB9\u5668"}),e("th",{children:"IPv4"}),e("th",{children:"IPv6"}),e("th",{children:"MAC"})]})}),e("tbody",{children:f.map(_=>o("tr",{children:[e("td",{className:"dk_mono",title:_.id,children:_.name===""?_.shortId:_.name}),e("td",{className:"dk_mono",children:_.ipv4===""?"\u2014":_.ipv4}),e("td",{className:"dk_mono",children:_.ipv6===""?"\u2014":_.ipv6}),e("td",{className:"dk_mono",children:_.mac===""?"\u2014":_.mac})]},_.id))})]})})},ne=[["overview","\u6982\u89C8"],["containers","\u63A5\u5165\u7684\u5BB9\u5668"+(d===null?"":"\uFF08"+String(d.detail.containers.length)+"\uFF09")]];return o("div",{className:"dk_detail",children:[o("div",{className:"dk_header dk_headerDetail",children:[e($,{icon:nt,title:"\u8FD4\u56DE\u7F51\u7EDC\u5217\u8868",onClick:t.onBack},"back"),e("span",{className:"dk_projectIcon",dangerouslySetInnerHTML:{__html:Go}}),e("span",{className:"dk_detailTitle",title:a,children:a}),n.internal===!0?e("span",{className:"dk_badge","data-state":"paused",children:"internal"}):null,e("span",{className:"dk_detailSub",children:t.targetLabel??""}),e("span",{className:"dk_headerSpacer"}),e($,{icon:tt,title:"\u5237\u65B0\u7F51\u7EDC\u8BE6\u60C5",spin:b,onClick:A},"refresh"),e($,{icon:un,danger:!0,disabled:t.allowMutations!==!0,title:t.allowMutations===!0?"\u5220\u9664\u7F51\u7EDC\uFF08\u4E0D\u53EF\u6062\u590D\uFF09":"\u5220\u9664\u7F51\u7EDC\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",onClick:()=>w(!0)},"remove"),t.docked===!0?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:t.onClose,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Pe}})},"close")]}),e("div",{className:"dk_tabs",children:ne.map(([f,_])=>e("button",{type:"button",className:"dk_tab","data-on":r===f?"1":"0",onClick:()=>u(f),children:_},f))}),o("div",{className:"dk_detailBody",children:[D===""?null:e(Y,{title:"\u5220\u9664\u7F51\u7EDC\u5931\u8D25",hint:D}),r==="overview"?H():T()]}),v?e(dt,{title:"\u5220\u9664\u7F51\u7EDC",text:"\u786E\u5B9A\u5220\u9664\u7F51\u7EDC "+a+"\uFF1F\u8FD8\u6709\u5BB9\u5668\u63A5\u7740\u65F6 docker \u4F1A\u62D2\u7EDD\uFF1B\u5220\u9664\u540E\u4F9D\u8D56\u5B83\u7684\u5BB9\u5668\u4F1A\u5931\u53BB\u7F51\u7EDC\uFF0C\u9700\u8981\u91CD\u65B0\u521B\u5EFA\u6216\u63A5\u5165\u522B\u7684\u7F51\u7EDC\u3002",confirmLabel:"\u5220\u9664",busy:E,onCancel:()=>w(!1),onConfirm:R},"confirm"):null]})}function Pa(t){let a=t.item.name,[r,u]=p(null),[d,c]=p(""),[s,k]=p(!1),[b,g]=p(!1),[v,w]=p(!1),[E,L]=p(""),D=se(()=>{k(!0),c(""),Q.volumeInspect(t.target,a).then(R=>u(R.volume)).catch(R=>c(R.message)).finally(()=>k(!1))},[t.target,a]);I(()=>{D()},[D]);let y=()=>{w(!0),L(""),Q.volumeRemove(t.target,a).then(R=>t.onRemoved(R.result.message)).catch(R=>{g(!1),L(R.message)}).finally(()=>w(!1))},A=()=>{if(d!=="")return e(Y,{title:"\u8BFB\u53D6\u5377\u8BE6\u60C5\u5931\u8D25",hint:d,action:e("button",{type:"button",className:"dk_btn",onClick:D,children:"\u91CD\u8BD5"})});if(r===null)return e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]});let R=r.detail,H=[["\u540D\u79F0",R.name],["\u9A71\u52A8",R.driver===""?"\u2014":R.driver],["\u8303\u56F4",R.scope===""?"\u2014":R.scope],["\u6302\u8F7D\u70B9",R.mountpoint===""?"\u2014":R.mountpoint],["\u521B\u5EFA",R.created===""?"\u2014":St(R.created)],["\u9009\u9879",Object.keys(R.options).length===0?"\u2014":Object.entries(R.options).map(([T,ne])=>T+"="+ne).join(`
`)],["\u6807\u7B7E",Object.keys(R.labels).length===0?"\u2014":Object.entries(R.labels).map(([T,ne])=>T+"="+ne).join(`
`)]];return e(Yn,{rows:H,mono:["\u6302\u8F7D\u70B9","\u9009\u9879","\u6807\u7B7E"]})};return o("div",{className:"dk_detail",children:[o("div",{className:"dk_header dk_headerDetail",children:[e($,{icon:nt,title:"\u8FD4\u56DE\u5377\u5217\u8868",onClick:t.onBack},"back"),e("span",{className:"dk_projectIcon",dangerouslySetInnerHTML:{__html:Jo}}),e("span",{className:"dk_detailTitle",title:a,children:a}),e("span",{className:"dk_detailSub",children:t.targetLabel??""}),e("span",{className:"dk_headerSpacer"}),e($,{icon:tt,title:"\u5237\u65B0\u5377\u8BE6\u60C5",spin:s,onClick:D},"refresh"),e($,{icon:un,danger:!0,disabled:t.allowMutations!==!0,title:t.allowMutations===!0?"\u5220\u9664\u5377\uFF08\u5377\u91CC\u7684\u6570\u636E\u4F1A\u4E00\u8D77\u6CA1\uFF0C\u4E0D\u53EF\u6062\u590D\uFF09":"\u5220\u9664\u5377\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",onClick:()=>g(!0)},"remove"),t.docked===!0?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:t.onClose,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Pe}})},"close")]}),o("div",{className:"dk_detailBody",children:[E===""?null:e(Y,{title:"\u5220\u9664\u5377\u5931\u8D25",hint:E}),A()]}),b?e(dt,{title:"\u5220\u9664\u5377",text:"\u786E\u5B9A\u5220\u9664\u5377 "+a+"\uFF1F\u5377\u91CC\u7684\u6570\u636E\u4F1A\u4E00\u8D77\u5220\u9664\u4E14\u4E0D\u53EF\u6062\u590D\uFF1B\u8FD8\u6709\u5BB9\u5668\u5360\u7528\u65F6 docker \u4F1A\u62D2\u7EDD\u3002",confirmLabel:"\u5220\u9664",busy:v,onCancel:()=>g(!1),onConfirm:y},"confirm"):null]})}let Aa=2e3;function Da(t,n,a){let r=a+n,u=r.split(/\r\n|\r|\n/),d="";/[\r\n]$/.test(r)||(d=u.pop()??"");let c=t.slice();for(let s of u){let k=s.trim();if(k==="")continue;let b=/^([0-9a-f]{6,}|[A-Za-z][A-Za-z0-9 _-]*?):\s/.exec(k),g=b===null?null:b[1];g!==null&&c.length>0&&c[c.length-1].key===g?c[c.length-1]={key:g,text:k}:c.push({key:g,text:k}),c.length>Aa&&c.shift()}return{lines:c,pending:d}}function ja(t){let[n,a]=p(""),[r,u]=p(!1),[d,c]=p([]),[s,k]=p(""),[b,g]=p(""),[v,w]=p(null),E=P(""),L=P([]),D=P(""),y=P(null);I(()=>{if(!r)return;if(typeof EventSource!="function"){g("\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301 EventSource\uFF0C\u65E0\u6CD5\u663E\u793A\u62C9\u53D6\u8FDB\u5EA6"),u(!1);return}k("connecting");let T=new EventSource(ln("/images/pull/stream",{target:t.target,ref:E.current})),ne=!1,f=()=>{if(!ne){ne=!0;try{T.close()}catch{}}},_=U=>{let q=null;try{q=JSON.parse(U.data)}catch{return}if(q===null||typeof q!="object")return;let ae=typeof q.d=="string"?q.d:typeof q.e=="string"?q.e:"";if(ae==="")return;let ke=Da(L.current,ae,D.current);L.current=ke.lines,D.current=ke.pending,c(ke.lines)},x=U=>{let q=null;try{q=JSON.parse(U.data)}catch{}let ae=q!==null&&typeof q.code=="number"?q.code:null;w(ae),u(!1),k(ae===0?"\u62C9\u53D6\u5B8C\u6210":"\u62C9\u53D6\u7ED3\u675F\uFF08\u9000\u51FA\u7801 "+String(ae===null?"?":ae)+"\uFF09"),ae===0&&t.onDone?.()},z=U=>{if(typeof U.data=="string"&&U.data!==""){let q="\u62C9\u53D6\u5931\u8D25";try{let ae=JSON.parse(U.data);ae!==null&&typeof ae.message=="string"&&(q=ae.message)}catch{}g(q),u(!1),k("");return}k(T.readyState===2?"closed":"reconnecting")};return T.addEventListener("line",_),T.addEventListener("end",x),T.addEventListener("error",z),T.onopen=()=>k("open"),()=>{f(),D.current=""}},[r,t.target]),I(()=>{let T=y.current;T!==null&&(T.scrollTop=T.scrollHeight)},[d]);let A=()=>{let T=n.trim();T===""||r||(E.current=T,L.current=[],D.current="",c([]),g(""),w(null),k(""),u(!0))},R=()=>{u(!1),k("\u5DF2\u505C\u6B62")},H=()=>s==="open"?"\u6B63\u5728\u62C9\u53D6\uFF08docker pull\uFF09\u2026":s==="connecting"?"\u6B63\u5728\u8FDE\u63A5\u62C9\u53D6\u6D41\u2026":s==="reconnecting"?"\u8FDE\u63A5\u4E2D\u65AD\uFF0C\u6B63\u5728\u81EA\u52A8\u91CD\u8FDE\u2026":s==="closed"?"\u62C9\u53D6\u6D41\u5DF2\u65AD\u5F00":s;return o("div",{className:"dk_detail",children:[o("div",{className:"dk_header dk_headerDetail",children:[e($,{icon:nt,title:"\u8FD4\u56DE\u955C\u50CF\u5217\u8868",onClick:t.onBack},"back"),e("span",{className:"dk_detailTitle",children:"\u62C9\u53D6\u955C\u50CF"}),e("span",{className:"dk_detailSub",children:t.targetLabel??""}),e("span",{className:"dk_headerSpacer"}),t.docked===!0?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:t.onClose,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Pe}})},"close")]}),o("div",{className:"dk_detailBody dk_pullBody",children:[t.allowMutations!==!0?e(Y,{kind:"info",title:"\u62C9\u53D6\u955C\u50CF\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",hint:"docker pull \u4F1A\u5199\u5165\u76EE\u6807\u673A\u7684\u955C\u50CF\u5B58\u50A8\u5E76\u5360\u7528\u78C1\u76D8\u4E0E\u5E26\u5BBD\u3002\u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D\u540E\u5373\u53EF\u5728\u6B64\u62C9\u53D6\u3002"}):o("div",{className:"dk_row",children:[e("input",{className:"dk_input",style:{flex:"1 1 auto"},placeholder:"\u955C\u50CF\u5F15\u7528\uFF0C\u5982 nginx:1.27 \u6216 ghcr.io/org/app:latest",value:n,disabled:r,onChange:T=>a(T.target.value),onKeyDown:T=>{T.key==="Enter"&&A()}}),r?e("button",{type:"button",className:"dk_btn dk_btnDanger",onClick:R,children:"\u505C\u6B62"}):e("button",{type:"button",className:"dk_btn dk_btnPrimary",disabled:t.allowMutations!==!0,onClick:A,children:"\u62C9\u53D6"})]}),b===""?null:e(Y,{title:"\u62C9\u53D6\u5931\u8D25",hint:b}),s===""?null:e("div",{className:"dk_hint",children:H()+(v===null?"":" \xB7 \u9000\u51FA\u7801 "+String(v))}),o("div",{className:"dk_pullBox",ref:y,children:[d.length===0?e("div",{className:"dk_pullLine",children:r?"\u7B49\u5F85 docker pull \u8F93\u51FA\u2026":"\u586B\u5199\u955C\u50CF\u5F15\u7528\u540E\u70B9\u300C\u62C9\u53D6\u300D\uFF0C\u9010\u5C42\u8FDB\u5EA6\u4F1A\u5B9E\u65F6\u51FA\u73B0\u5728\u8FD9\u91CC\u3002"}):d.map((T,ne)=>e("div",{className:"dk_pullLine","data-key":T.key??void 0,children:T.text},String(ne)))]})]})]})}function vn(t){let n=new Map;for(let a of t){let r=a.composeProject===null?"":a.composeProject,u=n.get(r);u===void 0&&(u={project:r,items:[]},n.set(r,u)),u.items.push(a)}return[...n.values()]}let dr=t=>t==="running"||t==="paused"||t==="restarting";function Ha(t){return e("div",{className:"dk_projects",children:t.groups.map(n=>{let a=n.items.filter(c=>dr(c.state)).length,r=n.items.filter(c=>c.health==="unhealthy").length,u=[...new Set(n.items.map(c=>c.composeService===null?c.name:c.composeService))],d=n.project===""?"\uFF08\u975E compose \u5BB9\u5668\uFF09":n.project;return o("div",{className:"dk_project",role:"button",tabIndex:0,onClick:()=>t.onOpen(n.project),onKeyDown:c=>{(c.key==="Enter"||c.key===" ")&&(c.preventDefault(),t.onOpen(n.project))},children:[o("div",{className:"dk_projectHead",children:[e("span",{className:"dk_projectIcon",dangerouslySetInnerHTML:{__html:Ur}}),e("span",{className:"dk_projectName",title:d,children:d}),e("span",{className:"dk_badge","data-state":a===n.items.length?"running":a===0?"exited":"paused",children:String(a)+" / "+String(n.items.length)+" \u8FD0\u884C\u4E2D"}),r>0?e("span",{className:"dk_badge","data-state":"unhealthy",children:String(r)+" \u4E0D\u5065\u5EB7"}):null,e("span",{className:"dk_headerSpacer"}),e("span",{className:"dk_hint",children:String(u.length)+" \u4E2A\u670D\u52A1"})]}),e("div",{className:"dk_projectRows",children:n.items.map(c=>o("div",{className:"dk_projectRow",children:[e("span",{className:"dk_projectSvc",children:c.composeService===null?"\u2014":c.composeService}),e("span",{className:"dk_projectContainer",title:c.name,children:c.name}),e(st,{state:c.state,health:c.health,status:c.status}),e("span",{className:"dk_projectImage",title:c.image,children:c.image}),e("span",{className:"dk_projectPorts",children:sn(c.ports)})]},c.id))})]},n.project===""?"__ungrouped":n.project)})})}function za(t){let[n,a]=p("services"),r=t.items,u=t.project===""?"\uFF08\u975E compose \u5BB9\u5668\uFF09":t.project,d=r.filter(k=>dr(k.state)).length,c=()=>e("div",{className:"dk_tableWrap",children:o("table",{className:"dk_images dk_composeTable",children:[e("thead",{children:o("tr",{children:[e("th",{children:"\u670D\u52A1"}),e("th",{children:"\u5BB9\u5668"}),e("th",{children:"\u72B6\u6001"}),e("th",{children:"\u7AEF\u53E3"}),e("th",{children:"\u955C\u50CF"})]})}),e("tbody",{children:r.map(k=>o("tr",{children:[e("td",{children:k.composeService===null?"\u2014":k.composeService}),e("td",{className:"dk_mono",title:k.name,children:k.name}),e("td",{children:e(st,{state:k.state,health:k.health,status:k.status})}),e("td",{children:sn(k.ports)}),e("td",{className:"dk_mono",title:k.image,children:k.image})]},k.id))})]})}),s=[["services","\u670D\u52A1"],["logs","\u805A\u5408\u65E5\u5FD7"]];return o("div",{className:"dk_detail",children:[o("div",{className:"dk_header dk_headerDetail",children:[e($,{icon:nt,title:"\u8FD4\u56DE Compose \u5217\u8868",onClick:t.onBack},"back"),e("span",{className:"dk_projectIcon",dangerouslySetInnerHTML:{__html:Ur}}),e("span",{className:"dk_detailTitle",title:u,children:u}),e("span",{className:"dk_badge","data-state":d===r.length?"running":d===0?"exited":"paused",children:String(d)+" / "+String(r.length)+" \u8FD0\u884C\u4E2D"}),e("span",{className:"dk_detailSub",children:t.targetLabel??""}),e("span",{className:"dk_headerSpacer"}),t.docked===!0?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:t.onClose,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Pe}})},"close")]}),e("div",{className:"dk_tabs",children:s.map(([k,b])=>e("button",{type:"button",className:"dk_tab","data-on":n===k?"1":"0",onClick:()=>a(k),children:b},k))}),e("div",{className:"dk_detailBody",children:n==="services"?c():e(mr,{target:t.target,targetLabel:t.targetLabel,items:r})})]})}let bn=350,cr=/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))\s/;function ur(t){let n=cr.exec(t);if(n===null)return{ts:null,text:t};let a=Date.parse(n[1]);return{ts:Number.isFinite(a)?a:null,text:t.slice(n[0].length)}}let Fa={TRACE:0,DEBUG:1,INFO:2,WARN:3,ERROR:4,FATAL:5},Va=/^\s*(\[\d{4}-\d{2}-\d{2}[ T][0-9:.,]+\]|\d{2}:\d{2}:\d{2}[,.]\d{3})\s*/;function kr(t){let n=tr.exec(t.replace(Va,""));if(n===null)return null;let a=nr.exec(n[1]);return a===null?null:a[1]}function _n(t){let n=0;return t.map((a,r)=>(typeof a.ts=="number"&&Number.isFinite(a.ts)&&(n=a.ts),{row:a,index:r,key:n})).sort((a,r)=>a.key-r.key||a.index-r.index).map(a=>a.row)}let yn=400;function jt(t,n,a){if(n.length===0)return t;let r=Math.max(a,0),u=Math.max(t.length-r,0),d=t.slice(u).concat(n);return t.slice(0,u).concat(_n(d))}function gr(t,n){if(typeof n!="number"||n<=0)return t;let a=null,r=[];for(let u of t){let d=kr(u.text);d!==null&&(a=d);let c=a===null?null:Fa[a]??0;(c===null||c>=n)&&r.push(u)}return r}function Ka(t){let n=typeof t.ts=="number"&&Number.isFinite(t.ts)?new Date(t.ts).toISOString()+" ":"";return"["+t.service+"] "+n+t.text}function hr(t,n){let a=t.map(Ka).join(`
`);if(n?.format!=="md")return a;let r=Array.isArray(n.items)?n.items:[];return["# \u805A\u5408\u65E5\u5FD7","","- \u6765\u6E90\uFF1A"+(typeof n.targetLabel=="string"&&n.targetLabel!==""?n.targetLabel+" \xB7 ":"")+(n.target??""),"- \u5BB9\u5668\uFF08"+String(r.length)+"\uFF09\uFF1A"+r.map(d=>d.name).join("\u3001"),"- \u884C\u6570\uFF1A"+String(t.length),"- \u5BFC\u51FA\u65F6\u95F4\uFF1A"+new Date().toLocaleString(),"","```text",a,"```",""].join(`
`)}function pr(t,n,a){if(n.length===0)return t;let r=t.concat(n);return r.length>a?r.slice(r.length-a):r}function mr(t){let n=t.items,[a,r]=p([]),[u,d]=p("connecting"),[c,s]=p(""),[k,b]=p(!1),[g,v]=p(0),[w,E]=p(!1),[L,D]=p(!1),[y,A]=p("arrival"),[R,H]=p(0),T=P([]),ne=P(new Map),f=P(!1),_=P([]),x=P("arrival"),z=P([]),U=P(null),q=P(null),ae=n.map(B=>B.id).join(","),ke=wn();I(()=>{if(!ke)return;if(n.length===0){d("empty");return}if(typeof EventSource!="function"){d("unsupported");return}d("connecting"),T.current=[],ne.current=new Map,_.current=[],r([]),v(0),E(!1),z.current=[],U.current!==null&&(clearTimeout(U.current),U.current=null);let B=0,oe=0,ee=n.map(X=>{let it=X.composeService===null?X.name:X.composeService,fe=new EventSource(ln("/logs/stream",{target:t.target,id:X.id,tail:100,timestamps:1})),we=j=>{if(j.length===0)return;let Z=x.current==="time"?jt(T.current,j,yn):T.current.concat(j),re=Z.length>Oe?Z.slice(Z.length-Oe):Z;T.current=re,re.length!==Z.length&&E(!0),r(re)},ce=j=>{if(x.current!=="time"){we(j);return}z.current=z.current.concat(j),U.current===null&&(U.current=setTimeout(()=>{U.current=null;let Z=z.current;z.current=[],we(_n(Z))},bn))},Le=j=>{let re=((ne.current.get(X.id)??"")+j).split(`
`);if(ne.current.set(X.id,re.pop()??""),re.length===0)return;let Ne=re.map(_e=>{let ve=ur(_e);return{service:it,text:ve.text,ts:ve.ts}});if(f.current){let _e=_.current.concat(Ne);_.current=_e.length>Oe?_e.slice(_e.length-Oe):_e,v(ve=>_.current.length-ve>=5||ve===0?_.current.length:ve);return}ce(Ne)};return fe.addEventListener("line",j=>{let Z=null;try{Z=JSON.parse(j.data)}catch{return}Z===null||typeof Z!="object"||(typeof Z.d=="string"?Le(Z.d):typeof Z.e=="string"&&Le(Z.e))}),fe.addEventListener("end",()=>{try{fe.close()}catch{}oe+=1,oe>=n.length&&d("closed")}),fe.addEventListener("error",j=>{typeof j.data=="string"&&j.data!==""?d("partial"):d("reconnecting")}),fe.onopen=()=>{B+=1,d("open")},()=>{try{fe.close()}catch{}}});return()=>{for(let X of ee)X()}},[ke,t.target,ae]),I(()=>{if(k)return;let B=q.current;B!==null&&(B.scrollTop=B.scrollHeight)},[k,a]);let $e=()=>{let B=!f.current;if(f.current=B,b(B),B)return;let oe=_.current;if(_.current=[],v(0),oe.length>0){let ee=pr(T.current,oe,Oe);T.current=ee,r(ee)}requestAnimationFrame(()=>{let ee=q.current;ee!==null&&(ee.scrollTop=ee.scrollHeight)})},me=c.trim().toLowerCase(),De=gr(a,R),be=me===""?De:De.filter(B=>B.text.toLowerCase().indexOf(me)>=0||B.service.toLowerCase().indexOf(me)>=0),ze=be.length>ut?be.slice(-ut):be,Ge=()=>{let B=y==="time"?"arrival":"time";x.current=B,A(B),U.current!==null&&(clearTimeout(U.current),U.current=null);let oe=z.current;if(z.current=[],oe.length>0){let ee=jt(T.current,oe,yn),X=ee.length>Oe?ee.slice(ee.length-Oe):ee;T.current=X,r(X)}if(B==="time"){let ee=jt([],T.current,T.current.length);T.current=ee,r(ee)}},ge=B=>{let oe=hr(ze,{format:B,target:t.target,targetLabel:t.targetLabel,items:n}),ee=new Date().toISOString().replace(/[:.]/g,"-").slice(0,19);zr("docker-logs-"+ee+(B==="md"?".md":".log"),oe)},Fe=()=>u==="open"?"\u5DF2\u8FDE\u63A5 "+String(n.length)+" \u6761\u5BB9\u5668\u65E5\u5FD7\u6D41\uFF08docker logs -f\uFF09":u==="connecting"?"\u6B63\u5728\u8FDE\u63A5\u5BB9\u5668\u65E5\u5FD7\u6D41\u2026":u==="reconnecting"?"\u90E8\u5206\u8FDE\u63A5\u4E2D\u65AD\uFF0C\u6B63\u5728\u81EA\u52A8\u91CD\u8FDE\u2026":u==="partial"?"\u90E8\u5206\u5BB9\u5668\u65E5\u5FD7\u6D41\u51FA\u9519":u==="closed"?"\u5168\u90E8\u5BB9\u5668\u65E5\u5FD7\u6D41\u5DF2\u7ED3\u675F":u==="unsupported"?"\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301 EventSource":u==="empty"?"\u8BE5\u9879\u76EE\u6CA1\u6709\u53EF\u805A\u5408\u7684\u5BB9\u5668":"\u805A\u5408\u65E5\u5FD7";return o("div",{className:"dk_logs",children:[w?e(Y,{kind:"warn",title:"\u805A\u5408\u65E5\u5FD7\u8D85\u8FC7 "+String(Oe)+" \u884C\uFF0C\u5DF2\u4E22\u5F03\u6700\u65E9\u5185\u5BB9"}):null,o("div",{className:"dk_filterBar",children:[o("div",{className:"dk_filterWrap",children:[e("input",{className:"dk_input dk_filterInput",placeholder:"\u8FC7\u6EE4\u670D\u52A1\u540D / \u65E5\u5FD7\u5185\u5BB9\u2026",value:c,onChange:B=>s(B.target.value),onKeyDown:B=>{B.key==="Escape"&&c!==""&&(B.stopPropagation(),s(""))}}),c===""?null:e("button",{type:"button",className:"dk_filterClear",title:"\u6E05\u7A7A\u8FC7\u6EE4",onClick:()=>s(""),children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Pe}})},"clear")]}),e("button",{type:"button",className:"dk_pill dk_pillFollow","data-on":k?"0":"1","data-paused":k?"1":void 0,title:k?"\u6062\u590D\u5B9E\u65F6\uFF08\u4F1A\u4E00\u6B21\u6027\u663E\u793A\u6682\u505C\u671F\u95F4\u6512\u4E0B\u7684 "+String(g)+" \u884C\u5E76\u56DE\u5230\u5E95\u90E8\uFF09":"\u6682\u505C\uFF08\u51BB\u7ED3\u5F53\u524D\u753B\u9762\uFF1A\u65B0\u65E5\u5FD7\u7EE7\u7EED\u63A5\u6536\u4F46\u4E0D\u8FFD\u52A0\uFF0C\u907F\u514D\u8BFB\u5C4F\u88AB\u9876\u8D70\uFF09",onClick:$e,children:k?g>0?"\u5DF2\u6682\u505C +"+String(g):"\u5DF2\u6682\u505C":"\u5B9E\u65F6"}),e("button",{type:"button",className:"dk_pill","data-on":L?"1":"0",title:L?"\u9690\u85CF\u6BCF\u884C\u65F6\u95F4\u6233":"\u663E\u793A\u6BCF\u884C\u65F6\u95F4\u6233\uFF08\u65F6\u95F4\u6233\u59CB\u7EC8\u968F\u6D41\u63A5\u6536\uFF0C\u53EA\u5F71\u54CD\u663E\u793A\uFF09",onClick:()=>D(B=>!B),children:"\u65F6\u95F4\u6233"}),e("button",{type:"button",className:"dk_pill","data-on":y==="time"?"1":"0",title:y==="time"?"\u6309\u5230\u8FBE\u987A\u5E8F\u663E\u793A\uFF08\u5B9E\u65F6\u8DDF\u968F\u96F6\u5EF6\u8FDF\uFF09":"\u6309\u5BB9\u5668\u65F6\u95F4\u6233\u5408\u5E76\uFF08\u8DE8\u5BB9\u5668\u6210\u4E00\u6761\u771F\u65F6\u95F4\u7EBF\uFF0C\u4EE3\u4EF7\u7EA6 "+String(bn)+"ms \u5EF6\u8FDF\uFF09",onClick:()=>Ge(),children:y==="time"?"\u6309\u65F6\u95F4":"\u6309\u5230\u8FBE"}),e("select",{className:"dk_select dk_selectSm",value:String(R),title:"\u6309\u65E5\u5FD7\u7EA7\u522B\u8FC7\u6EE4\uFF08\u65E0\u7EA7\u522B\u524D\u7F00\u7684\u884C\u59CB\u7EC8\u4FDD\u7559\uFF09",onChange:B=>H(Number(B.target.value)),children:[e("option",{value:"0",children:"\u5168\u90E8\u7EA7\u522B"},"all"),e("option",{value:"3",children:"WARN+"},"warn"),e("option",{value:"4",children:"ERROR+"},"error")]}),e("button",{type:"button",className:"dk_chip",disabled:ze.length===0,title:"\u5BFC\u51FA\u5F53\u524D\u663E\u793A\u5185\u5BB9\u4E3A .log\uFF08\u7EAF\u6587\u672C\uFF09",onClick:()=>ge("log"),children:"\u2B07 .log"}),e("button",{type:"button",className:"dk_chip",disabled:ze.length===0,title:"\u5BFC\u51FA\u5F53\u524D\u663E\u793A\u5185\u5BB9\u4E3A .md\uFF08\u5E26\u6765\u6E90\u4E0E\u884C\u6570\u8868\u5934\uFF0C\u9002\u5408\u5F53\u5DE5\u5355\u9644\u4EF6\uFF09",onClick:()=>ge("md"),children:"\u2B07 .md"}),e("span",{className:"dk_filterCount",children:me===""&&R===0?String(a.length)+" \u884C":String(be.length)+" / "+String(a.length)+" \u884C"})]}),e("div",{className:"dk_followState","data-state":u==="open"?"open":u==="closed"?"closed":"connecting",children:Fe()}),e("div",{className:"dk_logBody",ref:q,onContextMenu:B=>sr(B,q.current,{target:t.target,targetLabel:t.targetLabel??"",containers:n,filtered:me!==""}),children:[ze.length===0?e("div",{className:"dk_logLine",children:u==="open"?"\u7B49\u5F85\u65E5\u5FD7\u2026":Fe()},"empty"):ze.map((B,oe)=>xa(B,oe,me,L))]})]})}function Wa(t,n){let a=typeof t.image=="string"?t.image:"",r=typeof t.composeProject=="string"?t.composeProject:"";return o("span",{className:"dk_activityItem","data-action":String(t.action??"").split(":")[0].trim(),title:r===""?a:a+" \xB7 "+r,children:[e("span",{className:"dk_activityTime",children:ia(t.time)}),e("span",{className:"dk_activityName",children:t.name}),e("span",{className:"dk_activityAction",children:la(t)})]},String(n)+String(t.name)+String(t.time))}function Ga(t){let n=t.open===!0,a=Array.isArray(t.events)?t.events:[],r=a.slice(0,ra);return o("div",{className:"dk_activity","data-open":n?"1":"0",children:[e("button",{type:"button",className:"dk_activityHead","aria-expanded":n,title:"\u5BB9\u5668\u4E8B\u4EF6\u6D3B\u52A8\uFF08docker events\uFF09\uFF1A\u70B9\u51FB\u6298\u53E0 / \u5C55\u5F00",onClick:t.onToggle,children:[e("span",{className:"dk_activityTitle",children:"\u6D3B\u52A8"}),e("span",{className:"dk_activityState","data-state":t.status??"",children:t.statusText??""}),e("span",{className:"dk_headerSpacer"}),e("span",{className:"dk_hint",children:a.length===0?"\u6682\u65E0\u4E8B\u4EF6":"\u6700\u8FD1 "+String(r.length)+" / "+String(a.length)+" \u6761"}),e("span",{className:"dk_activityChevron",dangerouslySetInnerHTML:{__html:Hn}})]}),n===!1?null:r.length===0?e("div",{className:"dk_activityEmpty",children:"\u6682\u65E0\u4E8B\u4EF6\uFF08\u5BB9\u5668\u7684 start / die / health \u7B49\u52A8\u4F5C\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\uFF09"}):e("div",{className:"dk_activityList",children:r.map(Wa)})]})}function Ja(t){let n=t.info,a=Array.isArray(t.presets)?t.presets:[],r=a.some(u=>u.count>0)||t.count>0;return o("div",{className:"dk_pickBar",children:[o("div",{className:"dk_pickRow",children:[e("span",{className:"dk_pickCount",children:"\u5DF2\u9009 "+String(t.count)+" \u4E2A\u5BB9\u5668"}),n.hint===""?null:e("span",{className:"dk_hint dk_pickHint",children:n.hint}),e("span",{className:"dk_headerSpacer"}),e("button",{type:"button",className:"dk_btn dk_btnPrimary",disabled:n.canRun!==!0,title:n.hint!==""?n.hint:n.canRun===!0?"\u628A\u6240\u9009\u5BB9\u5668\u7684\u65E5\u5FD7\u805A\u5408\u6210\u4E00\u6761\u6D41":"\u81F3\u5C11\u9009\u62E9 2 \u4E2A\u5BB9\u5668",onClick:t.onRun,children:"\u805A\u5408\u65E5\u5FD7"}),e("button",{type:"button",className:"dk_btn",onClick:t.onCancel,children:"\u53D6\u6D88"})]}),r?o("div",{className:"dk_pickPresets",children:[e("span",{className:"dk_pickPresetsLabel",children:"\u6309\u6761\u4EF6\u9009\u4E2D"}),...a.filter(u=>u.count>0).map(u=>e("button",{type:"button",className:"dk_chip",title:"\u5728\u5F53\u524D\u7B5B\u9009\u7ED3\u679C\u91CC\u52FE\u9009\u300C"+u.label+"\u300D\u7684\u5BB9\u5668\uFF08\u6700\u591A "+String(t.max??gn)+" \u4E2A\u6D41\uFF09"+(u.over>0?"\uFF1B\u53E6\u6709 "+String(u.over)+" \u4E2A\u8D85\u51FA\u4E0A\u9650\u4E0D\u4F1A\u9009\u4E2D":""),onClick:()=>t.onPreset(u.key),children:u.label+" "+String(u.count)},u.key)),t.count>0?e("button",{type:"button",className:"dk_chip dk_chipQuiet",title:"\u6E05\u7A7A\u52FE\u9009",onClick:t.onClear,children:"\u6E05\u7A7A"},"clear"):null,t.notice===""?null:e("span",{className:"dk_hint dk_pickNotice",children:t.notice})]}):null]})}function Ua(t){return o("div",{className:"dk_detail",children:[o("div",{className:"dk_header dk_headerDetail",children:[e($,{icon:nt,title:"\u8FD4\u56DE\u5BB9\u5668\u5217\u8868\uFF08\u9000\u51FA\u9009\u62E9\u6001\uFF09",onClick:t.onBack},"back"),e("span",{className:"dk_projectIcon",dangerouslySetInnerHTML:{__html:Jr}}),e("span",{className:"dk_detailTitle",children:"\u805A\u5408\u65E5\u5FD7 \xB7 "+String(t.items.length)+" \u4E2A\u5BB9\u5668"}),e("span",{className:"dk_detailSub",children:t.targetLabel??""}),e("span",{className:"dk_headerSpacer"}),t.docked===!0?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:t.onClose,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Pe}})},"close")]}),e("div",{className:"dk_detailBody",children:e(mr,{target:t.target,targetLabel:t.targetLabel,items:t.items})})]})}function qa(t){let n=t.collapsed===!0;return o("div",{className:"dk_drawer","data-collapsed":n?"1":void 0,style:n||t.height===null?void 0:{height:String(t.height)+"px"},children:[e("div",{className:"dk_drawerResize",title:"\u62D6\u52A8\u8C03\u6574\u7EC8\u7AEF\u9AD8\u5EA6\uFF08\u53CC\u51FB\u6298\u53E0 / \u5C55\u5F00\uFF09",onMouseDown:t.onResizeStart,onDoubleClick:t.onToggleCollapse},"resize"),o("div",{className:"dk_drawerHead",children:[e("span",{className:"dk_drawerIcon",dangerouslySetInnerHTML:{__html:Gr}}),e("span",{className:"dk_drawerTitle",title:t.label,children:t.label}),e("span",{className:"dk_drawerHint",children:n?"\u5DF2\u6298\u53E0 \xB7 \u4F1A\u8BDD\u4FDD\u6301\u8FD0\u884C":"\u7531\u7EC8\u7AEF\u9762\u677F\u627F\u8F7D \xB7 \u6298\u53E0\u4FDD\u7559\u4F1A\u8BDD"}),e("span",{className:"dk_headerSpacer"}),e("button",{type:"button",className:"dk_iconBtn dk_drawerFold",title:n?"\u5C55\u5F00\u7EC8\u7AEF\uFF08\u4F1A\u8BDD\u672A\u4E2D\u65AD\uFF09":"\u6298\u53E0\u7EC8\u7AEF\uFF08\u4F1A\u8BDD\u4FDD\u6301\u8FD0\u884C\uFF09",onClick:t.onToggleCollapse,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Hn}})},"fold"),e("button",{type:"button",className:"dk_iconBtn",title:"\u7ED3\u675F\u7EC8\u7AEF\u4F1A\u8BDD\u5E76\u6536\u8D77\u62BD\u5C49",onClick:t.onClose,children:e("span",{dangerouslySetInnerHTML:{__html:Pe}})},"close")]}),e("div",{className:"dk_drawerBody",ref:t.hostRef})]})}let xn={view:"containers",search:"",stateFilter:"all",all:!0,detail:null,activityOpen:!0};function at(t,n){let[a,r]=p(()=>t in xn?xn[t]:n);return I(()=>{xn[t]=a},[t,a]),[a,r]}let fr=h.createContext(!0);function wn(){return h.useContext(fr)}let vr="@hyzyn/dsh-docker#session-probe",br="session-probe",Ht=null;function Xa(t){if(t==null)return String(t);if(Array.isArray(t))return"\u6570\u7EC4\uFF08\u957F\u5EA6 "+String(t.length)+"\uFF09";let n=typeof t;if(n!=="object")return n+" "+String(t).slice(0,40);let a=Object.keys(t);return a.length===0?"\u5BF9\u8C61\uFF08\u65E0\u952E\uFF09":"\u5BF9\u8C61\uFF0C\u952E\uFF1A"+a.slice(0,8).join(", ")+(a.length>8?" \u2026 \u5171 "+String(a.length):"")}function zt(t){try{let n=JSON.stringify(t);return n===void 0?"\uFF08\u65E0\u6CD5\u5E8F\u5217\u5316\uFF09":n.length>220?n.slice(0,220)+"\u2026":n}catch{return"\uFF08\u5E8F\u5217\u5316\u5931\u8D25\uFF1A\u53EF\u80FD\u6709\u5FAA\u73AF\u5F15\u7528\uFF09"}}function Ya(t){let[,n]=p(0);return I(()=>{let a=setInterval(()=>n(r=>r+1),1e3);return()=>clearInterval(a)},[]),t.at===0?"\uFF08\u8FD8\u6CA1\u6536\u5230\u8FC7\uFF09":String(Math.round((Date.now()-t.at)/1e3))+" \u79D2\u524D"}function _r(t){let n=P(0);n.current+=1;let a=null;try{a=t.useTabInfo()}catch{}let r=typeof t.sessionId=="string"?t.sessionId:"",u=k=>{if(k==null)return{text:"\u5FEB\u7167\u662F "+String(k),count:null,last:""};if(Array.isArray(k))return{text:"\u6570\u7EC4\uFF0C\u957F\u5EA6 "+String(k.length),count:k.length,last:k.length===0?"":zt(k[k.length-1])};if(typeof k!="object")return{text:typeof k+" "+String(k).slice(0,60),count:null,last:""};let b=Object.keys(k);for(let g of["events","entries","items","rows"]){let v=k[g];if(Array.isArray(v))return{text:"\u5FEB\u7167\u952E\uFF1A"+b.join(", ")+" \uFF5C "+g+".length="+String(v.length),count:v.length,last:v.length===0?"":zt(v[v.length-1])}}return{text:"\u5FEB\u7167\u952E\uFF1A"+b.join(", ")+"\uFF08\u6CA1\u627E\u5230\u4E8B\u4EF6\u6570\u7EC4\uFF09",count:null,last:""}},[d,c]=p({mode:"\u672A\u8BA2\u9605",calls:0,at:0,window:null,session:null,error:""});I(()=>{if(r==="")return;let k=null,b=!1,g=()=>{let v=Ce?.binding?.(r)?.eventSource;if(v==null)return{window:null,session:null};let w=null;try{w=typeof v.getSnapshot=="function"?v.getSnapshot():null}catch{w=null}let E=null;try{let L=Ce.binding(r)?.session;L!=null&&typeof L.getSnapshot=="function"&&(E=L.getSnapshot())}catch{E=null}return{window:u(w),session:E===null?null:{text:Xa(E),last:zt(E)}}};try{let v=Ce?.binding?.(r)?.eventSource;if(v==null||typeof v.subscribe!="function"){c(L=>({...L,mode:"\uFF08\u62FF\u4E0D\u5230 source.subscribe\uFF09"}));return}let w=g();c({mode:"subscribe(cb)",calls:0,at:0,window:w.window,session:w.session,error:""});let E=v.subscribe(()=>{if(b)return;let L=g();c(D=>({mode:D.mode,calls:D.calls+1,at:Date.now(),window:L.window,session:L.session,error:""}))});k=typeof E=="function"?E:null}catch(v){c({mode:"\u8BA2\u9605\u629B\u9519",calls:0,at:0,window:null,session:null,error:v instanceof Error?v.message:String(v)})}return()=>{if(b=!0,typeof k=="function")try{k()}catch{}}},[r]);let s=[["sessionId",r===""?"\uFF08\u7A7A\uFF09":r],["tab.visible",a===null?"\u2014":String(a.tab?.visible)],["\u672C\u7EC4\u4EF6\u5DF2\u6E32\u67D3",String(n.current)+" \u6B21\uFF08\u4E0D\u542B\u5B9A\u65F6\u5668\uFF09"],["\u2014\u2014\u2014\u2014 \u4E8B\u4EF6\u7A97\u53E3\u5FEB\u7167\uFF08\u8BA2\u9605\u90A3\u4E00\u523B\u8BFB\u5230\u7684\uFF09 \u2014\u2014\u2014\u2014",""],["eventSource.getSnapshot()",d.window===null?"\uFF08\u672A\u8BFB\u5230\uFF09":d.window.text],["\u7A97\u53E3\u91CC\u7684\u4E8B\u4EF6\u6761\u6570",d.window===null||d.window.count===null?"\u2014":String(d.window.count)],["\u6700\u540E\u4E00\u6761\u4E8B\u4EF6",d.window===null||d.window.last===""?"\u2014":d.window.last],["\u2014\u2014\u2014\u2014 \u8BA2\u9605\u56DE\u8C03\uFF08\u5B83\u53D8\u8FC7\u5417\uFF09 \u2014\u2014\u2014\u2014",""],["\u8BA2\u9605\u65B9\u5F0F / \u56DE\u8C03\u6B21\u6570",d.mode+" \uFF5C \u56DE\u8C03 "+String(d.calls)+" \u6B21"+(d.error===""?"":"\uFF08"+d.error+"\uFF09")],["\u56DE\u8C03\u540E\u7684\u4E8B\u4EF6\u6761\u6570",d.window===null||d.window.count===null?"\u2014":String(d.window.count)],["\u56DE\u8C03\u540E\u7684\u6700\u540E\u4E00\u6761",d.window===null||d.window.last===""?"\u2014":d.window.last],["\u2014\u2014\u2014\u2014 binding.session \u7684\u5FEB\u7167\uFF08\u82E5\u6709\uFF09 \u2014\u2014\u2014\u2014",""],["session.getSnapshot()",d.session===null?"\uFF08\u6CA1\u6709\u8FD9\u4E2A\u65B9\u6CD5\uFF09":d.session.text],["session \u5FEB\u7167\u5185\u5BB9",d.session===null?"\u2014":d.session.last],["\u2014\u2014\u2014\u2014 \u4F1A\u8BDD\u4F5C\u7528\u57DF\u94A9\u5B50\u7684\u5F62\u53C2\u4E2A\u6570\uFF08\u5DE5\u5382\uFF0C\u4E0D\u662F\u666E\u901A hook\uFF09 \u2014\u2014\u2014\u2014",""],["useChat / useConversation",String(t.useChat?.length??"\u2014")+" / "+String(t.useConversation?.length??"\u2014")],["useTrajectory / useProjection",String(t.useTrajectory?.length??"\u2014")+" / "+String(t.useProjection?.length??"\u2014")]];return o("div",{className:"dk_spike",children:[e("div",{className:"dk_spikeTitle",children:"\u4F1A\u8BDD\u4E8B\u4EF6\u7A97\u53E3\u63A2\u9488 v3\uFF08spike \xB7 \u65B9\u6848 B\uFF09"}),e("div",{className:"dk_spikeHint",children:"\u5173\u952E\u662F\u300C\u56DE\u8C03\u6B21\u6570\u300D\u4E0E\u300C\u56DE\u8C03\u540E\u7684\u6761\u6570\u300D\uFF1A\u7528\u65E5\u5FD7\u53F3\u952E\u300C\u76F4\u63A5\u53D1\u9001\u5230\u5F53\u524D\u4F1A\u8BDD\u300D\u8BA9 Agent \u8DD1\u8D77\u6765\uFF0C\u5B83\u4EEC\u5E94\u5F53\u53D8\u5316\u3002"}),...s.map(([k,b])=>o("div",{className:"dk_spikeRow",children:[e("span",{className:"dk_spikeKey",children:k}),e("span",{className:"dk_spikeVal",children:b===""?"\u2014":String(b)})]},k)),o("div",{className:"dk_spikeRow",children:[e("span",{className:"dk_spikeKey",children:"\u6700\u8FD1\u4E00\u6B21\u56DE\u8C03\u8DDD\u4ECA"}),e("span",{className:"dk_spikeVal",children:e(Ya,{at:d.at})})]},"age")]})}function Ft(t,n){return t.length<=n?t:t.slice(0,n)+" \u2026\uFF08\u622A\u65AD\uFF09"}function Ye(t,n=600){if(typeof t=="string")return Ft(t,n);if(Array.isArray(t)){let a=t.map(r=>Ye(r,n)).filter(r=>r!=="");return Ft(a.join(`
`),n)}return t==null||typeof t!="object"?"":typeof t.text=="string"?Ft(t.text,n):t.content!==void 0?Ye(t.content,n):t.message!==void 0?Ye(t.message,n):Ft(zt(t),n)}function $a(t,n=40){let a=Array.isArray(t)?t:[],r=0;for(let s=a.length-1;s>=0;s-=1)if(a[s]?.event?.type==="turn/start"){r=s;break}let u=[],d=new Map,c=(s,k,b)=>{let g=d.get(s);if(g===void 0){let v={kind:k,text:b};d.set(s,v),u.push(v);return}g.text+=b};for(let s=r;s<a.length;s+=1){let k=a[s],b=k?.event;if(b==null)continue;if(k.type==="transient"){if(b.type!=="assistant/live-chunk")continue;let v=b.data??{},w=v.chunk??{},E=String(v.attemptId??"")+":"+String(v.step??"")+":"+String(w.index??"");if(w.type==="text-delta"&&typeof w.text=="string")c("t|"+E,"text",w.text);else if(w.type==="reasoning-delta"&&typeof w.text=="string")c("r|"+E,"reasoning",w.text);else if(w.type==="tool-call-delta"){let L="c|"+String(w.id??E),D=d.get(L);if(D===void 0){let y={kind:"tool",name:typeof w.name=="string"&&w.name!==""?w.name:"\uFF08\u5DE5\u5177\uFF09",args:typeof w.argumentsDelta=="string"?w.argumentsDelta:""};d.set(L,y),u.push(y)}else typeof w.name=="string"&&w.name!==""&&(D.name=w.name),typeof w.argumentsDelta=="string"&&(D.args+=w.argumentsDelta)}continue}let g=b.data??{};b.type==="user/message"?u.push({kind:"user",text:Ye(g)}):b.type==="assistant/message"?u.push({kind:"text",text:Ye(g.message??g)}):b.type==="tool/call"?u.push({kind:"tool",name:typeof g.name=="string"?g.name:"\uFF08\u5DE5\u5177\uFF09",args:typeof g.arguments=="string"?g.arguments:""}):b.type==="tool/result"?u.push({kind:"result",text:Ye(g.message??g),failed:g.error!==void 0}):b.type==="turn/end"&&u.push({kind:"end",reason:typeof g.reason?.kind=="string"?g.reason.kind:"\u7ED3\u675F"})}return u.length<=n?u:u.slice(u.length-n)}function Vt(t){let[n,a]=p(null),[r,u]=p([]),d=typeof t.initialTarget=="string"?t.initialTarget.trim():"",c=P(d!==""?d:Vr()),[s,k]=p(c.current),b=t.sessionHint!==void 0&&(t.initialTarget??"")==="",[g,v]=at("view","containers"),[w,E]=p([]),[L,D]=p(""),y=P(""),A=se(i=>{y.current=i,D(i)},[]),[R,H]=p([]),[T,ne]=p([]),[f,_]=p([]),[x,z]=p([]),[U,q]=p(null),[ae,ke]=p(null),[$e,me]=p(null),[De,be]=p(null),[ze,Ge]=p(!1),[ge,Fe]=p(!1),[B,oe]=p([]),[ee,X]=p(""),[it,fe]=p(!1),[we,ce]=p(!1),[Le,j]=p(""),[Z,re]=p(""),[Ne,_e]=at("all",!0),[ve,Ve]=at("search",""),[Je,Sn]=at("stateFilter","all"),[Ee,Kt]=p(!1),[Wt,mt]=p([]),ft=wn(),[Ke,he]=p(""),[Gt,Cn]=at("activityOpen",!0),vt=P(null),Jt=P(""),[Ue,je]=at("detail",null),[Ut,qt]=p(0),[ye,Se]=p(null),[Xt,Yt]=p(!1),[$t,Ze]=p({}),[Zt,Tn]=p(""),[N,M]=p(""),[S,F]=p(""),V=P(!0),G=P(null);G.current===null&&(G.current=ea());let[de,J]=p(null),K=P(null),[W,ue]=p(!1),[qe,io]=p(null),[lo,Ln]=p(!1),Tr=P(null),En=P(!1);I(()=>()=>{V.current=!1},[]),I(()=>{if(de===null)return;let i=K.current;if(i===null)return;let m=null;try{m=Xe.mount(i,de.options)}catch(C){re("\u7EC8\u7AEF\u542F\u52A8\u5931\u8D25\uFF1A"+(C instanceof Error?C.message:String(C))),J(null);return}return()=>{try{m?.()}catch{}}},[de]);let so=i=>{if(i.button!==void 0&&i.button!==0)return;let m=i.currentTarget.parentElement,C=Tr.current;if(m===null||C===null)return;i.preventDefault();let pe=i.clientY,ie=m.getBoundingClientRect().height,te=Math.max(160,Math.round(C.getBoundingClientRect().height*.75)),He=xe=>{let Be=Math.round(ie+(pe-xe.clientY));io(Math.min(te,Math.max(160,Be)))},an=()=>{document.removeEventListener("mousemove",He),document.removeEventListener("mouseup",an),document.body.style.userSelect=""};document.body.style.userSelect="none",document.addEventListener("mousemove",He),document.addEventListener("mouseup",an)},We=()=>{if(de===null){t.onClose();return}Ln(!0)};I(()=>{Q.config().then(i=>{let m=i.config;a(m),Array.isArray(m.targets)&&m.targets.length>0&&k(C=>Dn(m.targets,C,c.current,b)),jn(m)}).catch(i=>j(i.message)),Q.targets().then(i=>{u(i.targets??[]),qn=i.targets??[],k(m=>Dn(i.targets??[],m,c.current,b)),c.current=""}).catch(()=>{})},[]),I(()=>{s!==""&&Kr(s)},[s]);let bt=se(()=>{if(s==="")return Promise.resolve();let i=G.current.next();return ce(!0),Q.containers(s,Ne).then(m=>{!V.current||!G.current.isCurrent(i)||(E(m.containers??[]),A(s),j(""))}).catch(m=>{!V.current||!G.current.isCurrent(i)||(y.current!==s&&E([]),A(s),j(m.message))}).finally(()=>{V.current&&G.current.isCurrent(i)&&ce(!1)})},[s,Ne]),_t=se(()=>{if(s==="")return Promise.resolve();let i=G.current.next();return ce(!0),Q.images(s).then(m=>{!V.current||!G.current.isCurrent(i)||(ne(m.images??[]),A(s),j(""))}).catch(m=>{!V.current||!G.current.isCurrent(i)||(y.current!==s&&ne([]),A(s),j(m.message))}).finally(()=>{V.current&&G.current.isCurrent(i)&&ce(!1)})},[s]),Qt=se(()=>{if(s==="")return Promise.resolve();let i=G.current.next();return ce(!0),Q.networks(s).then(m=>{!V.current||!G.current.isCurrent(i)||(_(m.networks??[]),A(s),j(""))}).catch(m=>{!V.current||!G.current.isCurrent(i)||(y.current!==s&&_([]),A(s),j(m.message))}).finally(()=>{V.current&&G.current.isCurrent(i)&&ce(!1)})},[s]),en=se(()=>{if(s==="")return Promise.resolve();let i=G.current.next();return ce(!0),Q.volumes(s).then(m=>{!V.current||!G.current.isCurrent(i)||(z(m.volumes??[]),A(s),j(""))}).catch(m=>{!V.current||!G.current.isCurrent(i)||(y.current!==s&&z([]),A(s),j(m.message))}).finally(()=>{V.current&&G.current.isCurrent(i)&&ce(!1)})},[s]),In=se(()=>{if(r.length===0)return H([]),Promise.resolve();let i=G.current.next();ce(!0),H(r.map(ie=>({name:ie.name,kind:ie.kind,label:ie.label,containers:[],attention:null,error:"",loaded:!1})));let m=r.length,C=()=>{m-=1,m===0&&V.current&&G.current.isCurrent(i)&&ce(!1)},pe=ie=>Q.attention(ie).then(te=>{!V.current||!G.current.isCurrent(i)||H(He=>Ct(He,ie,{attention:te.items??[]}))}).catch(()=>{!V.current||!G.current.isCurrent(i)||H(te=>Ct(te,ie,{attention:null}))});return Promise.all(r.map(ie=>(pe(ie.name),Q.containers(ie.name,!0).then(te=>{!V.current||!G.current.isCurrent(i)||H(He=>Ct(He,ie.name,{containers:te.containers??[],error:"",loaded:!0}))}).catch(te=>{!V.current||!G.current.isCurrent(i)||H(He=>Ct(He,ie.name,{error:te instanceof Error?te.message:String(te),loaded:!0}))}).finally(C))))},[r]);I(()=>{vt.current=bt},[bt]);let co=se(()=>qt(i=>i+1),[]),Re=se(()=>{Fe(!1),oe([]),X(""),fe(!1)},[]),uo=()=>{if(ge){Re();return}oe([]),fe(!1),Fe(!0)},ko=i=>oe(m=>Xr(m,i.id));I(()=>{if(!ge)return;let i=m=>{m.key==="Escape"&&Re()};return document.addEventListener("keydown",i),()=>document.removeEventListener("keydown",i)},[ge,Re]),I(()=>{ge&&oe(i=>Yr(i,w))},[w,ge]);let go=i=>{k(i),j(""),v("containers"),je(null),Re(),Ze({}),t.onTargetChange?.(Me(i))},ho=(i,m)=>{k(i),j(""),v("containers"),Re(),Ze({}),je({id:m.id,tab:"overview",item:m}),t.onTargetChange?.(Me(i))},yt=se(()=>{g==="overview"?In():g==="images"?_t():g==="networks"?Qt():g==="volumes"?en():bt(),qt(i=>i+1)},[g,In,bt,_t,Qt,en]);I(()=>{g!=="overview"&&s!==""&&yt()},[s,Ne,g]);let po=r.map(i=>i.name).join("\0");I(()=>{g==="overview"&&In()},[g,po]),I(()=>{if(!Ee||g!=="overview"&&(s===""||g==="images"))return;let i=setInterval(yt,Math.max(2,n?.pollIntervalSec??5)*1e3);return()=>clearInterval(i)},[Ee,yt,s,n,g]);let mo=()=>Ke==="open"?"\u5B9E\u65F6\u63A5\u6536\u4E2D\uFF08docker events\uFF09":Ke==="connecting"?"\u6B63\u5728\u8FDE\u63A5\u4E8B\u4EF6\u6D41\u2026":Ke==="reconnecting"?"\u8FDE\u63A5\u4E2D\u65AD\uFF0C\u6B63\u5728\u81EA\u52A8\u91CD\u8FDE\u2026":Ke==="closed"?"\u4E8B\u4EF6\u6D41\u5DF2\u65AD\u5F00":Ke==="unsupported"?"\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301 EventSource":"\u4E8B\u4EF6\u6D41";I(()=>{if(!ft||g!=="containers"||s==="")return;if(typeof EventSource!="function"){he("unsupported");return}Jt.current!==s&&(Jt.current=s,mt([])),he("connecting");let i=sa(aa,()=>{let xe=vt.current;xe!==null&&xe()}),m=!1,C=new EventSource(ln("/events/stream",{target:s})),pe=!1,ie=()=>{if(!pe){pe=!0;try{C.close()}catch{}}},te=xe=>{let Be=null;try{Be=JSON.parse(xe.data)}catch{return}Be===null||typeof Be!="object"||(mt(on=>oa(on,Be,na)),i.schedule())},He=xe=>{let Be=null;try{Be=JSON.parse(xe.data)}catch{}let on=Be!==null&&typeof Be.code=="number"?Be.code:null;he("closed"),re("\u4E8B\u4EF6\u6D41\u5DF2\u7ED3\u675F"+(on===null?"":"\uFF08\u9000\u51FA\u7801 "+String(on)+"\uFF09")+"\uFF0C\u5217\u8868\u56DE\u5230 AUTO REFRESH / \u624B\u52A8\u5237\u65B0"),ie()},an=xe=>{if(typeof xe.data=="string"&&xe.data!==""){he("closed"),ie();return}he(C.readyState===2?"closed":"reconnecting")};return C.addEventListener("event",te),C.addEventListener("end",He),C.addEventListener("error",an),C.onopen=()=>{if(he("open"),m){let xe=vt.current;xe!==null&&xe()}m=!0},()=>{ie(),i.cancel()}},[ft,g,s]),I(()=>{if(Z==="")return;let i=setTimeout(()=>re(""),4e3);return()=>clearTimeout(i)},[Z]),I(()=>(At=t.carrier==="tab"?"":" \xB7 \u4F1A\u8BDD\u5728\u9762\u677F\u540E\u9762\uFF1A\u5173\u6389\u6216\u6700\u5C0F\u5316\u9762\u677F/\u7EC8\u7AEF\u5373\u53EF\u770B\u5230",()=>{At=""}),[t.carrier]);let tn=(i,m)=>{let C=An(i.name);navigator.clipboard.writeText(C).then(()=>{re("\u5DF2\u590D\u5236\uFF1A"+C+(m===void 0?"":"\uFF08"+m+"\uFF09"))}).catch(()=>re("\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u6267\u884C\uFF1A"+C))},fo=i=>{let m=An(i.name);if(Xe===null){let te=document.querySelector("[data-dsh-tty-entry]")!==null;tn(i,te?"\u7EC8\u7AEF\u9762\u677F\u7248\u672C\u8FC7\u65E7\uFF08\u4EA4\u4E92\u5F0F\u8FDB\u5165\u5BB9\u5668\u9700\u8981 dsh-tty \u2265 0.14.0\uFF09\uFF0C\u547D\u4EE4\u5DF2\u590D\u5236\uFF0C\u53EF\u7C98\u8D34\u5230\u7CFB\u7EDF\u7EC8\u7AEF\u6267\u884C":"\u672A\u5B89\u88C5 dsh-tty \u7EC8\u7AEF\u9762\u677F\uFF0C\u547D\u4EE4\u5DF2\u590D\u5236\uFF0C\u53EF\u7C98\u8D34\u5230\u7CFB\u7EDF\u7EC8\u7AEF\u6267\u884C\uFF08\u88C5 dsh-tty \u540E\u53EF\u76F4\u63A5\u5728\u6B64\u5F00\u7EC8\u7AEF\uFF09");return}let C=(n?.targets??[]).find(te=>te.name===s),pe=i.name+" \xB7 exec",ie=C===void 0||C.kind==="local"?{command:m,label:pe}:typeof C.book=="string"&&C.book!==""?{book:C.book,command:m,label:pe}:(C.auth??"agent")==="agent"?{spec:{host:C.host,port:C.port,username:C.username,auth:"agent",agentForward:C.agentForward===!0},command:m,label:pe}:null;if(ie===null){tn(i,"\u5185\u8054\u76EE\u6807\u7528\u4E86 key/password \u8BA4\u8BC1\uFF0C\u6D4F\u89C8\u5668\u7AEF\u62FF\u4E0D\u5230\u51ED\u8BC1");return}if(t.docked===!0||t.carrier==="tab"&&t.tabFullscreen!==!0){try{Xe.open(ie)}catch(te){tn(i,te instanceof Error?te.message:String(te))}return}if(typeof Xe.mount=="function"&&Number(Xe.version??0)>=2){J({label:pe,options:ie}),ue(!1);return}try{Xe.open(ie),t.onClose()}catch(te){tn(i,te instanceof Error?te.message:String(te))}},Lr=i=>Ze(m=>{if(m[i]===void 0)return m;let C={...m};return delete C[i],C}),xt=(i,m)=>{Yt(!0);let C=()=>{Yt(!1),Se(null)};Promise.resolve().then(i).then(async()=>{if(C(),m!==void 0)try{await m()}catch(pe){j(pe.message)}},pe=>{C(),j(pe.message)})},vo=(i,m)=>{$t[m.id]===void 0&&Se({title:i==="remove"?"\u5220\u9664\u5BB9\u5668":i==="stop"?"\u505C\u6B62\u5BB9\u5668":i==="start"?"\u542F\u52A8\u5BB9\u5668":"\u91CD\u542F\u5BB9\u5668",text:i==="remove"?`\u786E\u5B9A\u5220\u9664\u5BB9\u5668 ${m.name}\uFF1F\u5BB9\u5668\u7684\u53EF\u5199\u5C42\u4E0E\u914D\u7F6E\u4F1A\u88AB\u5220\u9664\uFF08\u547D\u540D\u6570\u636E\u5377\u4FDD\u7559\uFF09\uFF0C\u6B64\u64CD\u4F5C\u4E0D\u53EF\u6062\u590D\u3002`:`\u786E\u5B9A\u5BF9\u5BB9\u5668 ${m.name} \u6267\u884C${i==="stop"?"\u505C\u6B62":i==="start"?"\u542F\u52A8":"\u91CD\u542F"}\u64CD\u4F5C\uFF1F`,confirmLabel:i==="remove"?"\u5220\u9664":"\u786E\u5B9A",run:()=>xt(async()=>{Ze(C=>({...C,[m.id]:i}));try{let C=await Q.action(s,i,m.id);re(`${C.result.action} ${m.name}\uFF1A${C.result.message}`)}catch(C){throw Lr(m.id),C}},async()=>{try{await bt()}finally{Lr(m.id)}})})},bo=i=>{let m=fn(i);Se({title:"\u5220\u9664\u955C\u50CF",text:"\u786E\u5B9A\u5220\u9664\u955C\u50CF "+m+"\uFF1F\u955C\u50CF\u88AB\u5BB9\u5668\u6216\u5B50\u955C\u50CF\u5F15\u7528\u65F6\u4F1A\u5931\u8D25\uFF1B\u5220\u9664\u540E\u9700\u8981\u91CD\u65B0\u62C9\u53D6\u6216\u6784\u5EFA\u624D\u80FD\u6062\u590D\uFF0C\u4E14\u4E0D\u53EF\u64A4\u9500\u3002",confirmLabel:"\u5220\u9664",run:()=>xt(async()=>{let C=await Q.imageRemove(s,m);re("\u5DF2\u5220\u9664 "+m+"\uFF1A"+C.result.message),U!==null&&fn(U)===m&&q(null),await _t()})})},_o=()=>{Se({title:"\u6E05\u7406 dangling \u955C\u50CF",text:"\u6E05\u7406\u8BE5\u76EE\u6807\u4E0A\u6240\u6709\u65E0\u6807\u7B7E\uFF08<none>:<none>\uFF09\u7684\u955C\u50CF\u5C42\uFF0C\u91CA\u653E\u78C1\u76D8\u7A7A\u95F4\uFF1B\u4E0D\u4F1A\u5220\u9664\u6709 tag \u7684\u955C\u50CF\u3002",confirmLabel:"\u6E05\u7406",run:()=>xt(async()=>{let i=await Q.imagePrune(s),m=String(i.result.message).trim().split(`
`).filter(C=>C!=="");re("\u5DF2\u6E05\u7406 dangling \u955C\u50CF\uFF1A"+(m.length===0?"ok":m[m.length-1])),await _t()})})},yo=()=>{Se({title:"\u6E05\u7406\u672A\u4F7F\u7528\u7684\u7F51\u7EDC",text:"\u6E05\u7406\u8BE5\u76EE\u6807\u4E0A\u6240\u6709\u6CA1\u6709\u5BB9\u5668\u63A5\u5165\u7684\u7F51\u7EDC\u3002compose \u521B\u5EFA\u7684\u9879\u76EE\u7F51\u7EDC\u4E5F\u5728\u5176\u4E2D\uFF08\u4E0B\u6B21 up \u4F1A\u91CD\u5EFA\uFF09\uFF0C\u4F46\u6B63\u5728\u8DD1\u7684\u9879\u76EE\u4F1A\u77ED\u6682\u5931\u53BB\u7F51\u7EDC\u3002",confirmLabel:"\u6E05\u7406",run:()=>xt(async()=>{let i=await Q.networkPrune(s),m=String(i.result.message).trim().split(`
`).filter(C=>C!=="");re("\u5DF2\u6E05\u7406\u672A\u4F7F\u7528\u7F51\u7EDC\uFF1A"+(m.length===0?"ok":m[m.length-1])),await Qt()})})},xo=()=>{Se({title:"\u6E05\u7406\u672A\u4F7F\u7528\u7684\u5377",text:"\u6E05\u7406\u8BE5\u76EE\u6807\u4E0A\u6240\u6709\u6CA1\u6709\u88AB\u5BB9\u5668\u4F7F\u7528\u7684\u5377\u2014\u2014\u5377\u91CC\u7684\u6570\u636E\u4F1A\u4E00\u8D77\u5220\u9664\u4E14\u4E0D\u53EF\u6062\u590D\u3002docker \u2265 23 \u53EA\u5220\u533F\u540D\u5377\uFF08\u4E0D\u5E26 --all\uFF09\uFF0C\u66F4\u8001\u7684\u7248\u672C\u4F1A\u8FDE\u547D\u540D\u5377\u4E00\u8D77\u5220\uFF1B\u6267\u884C\u524D\u8BF7\u786E\u8BA4\u6CA1\u6709\u9700\u8981\u4FDD\u7559\u7684\u6570\u636E\u5377\u3002",confirmLabel:"\u6E05\u7406",run:()=>xt(async()=>{let i=await Q.volumePrune(s),m=String(i.result.message).trim().split(`
`).filter(C=>C!=="");re("\u5DF2\u6E05\u7406\u672A\u4F7F\u7528\u5377\uFF1A"+(m.length===0?"ok":m[m.length-1])),await en()})})},Er=(i,m)=>C=>{i(),re(C),m()},nn=Ue===null?null:w.find(i=>i.id===Ue.id)??Ue.item,Qe=w.filter(i=>{if(Je==="running"&&!(i.state==="running"||i.state==="paused"||i.state==="restarting")||Je==="stopped"&&i.state==="running"||Je==="unhealthy"&&i.health!=="unhealthy")return!1;let m=ve.trim().toLowerCase();return m===""?!0:i.name.toLowerCase().includes(m)||i.image.toLowerCase().includes(m)||i.id.toLowerCase().includes(m)}),On=T.filter(i=>{let m=Zt.trim().toLowerCase();return m===""||i.reference.toLowerCase().includes(m)||i.id.toLowerCase().includes(m)}),Rn=f.filter(i=>{let m=N.trim().toLowerCase();return m===""||i.name.toLowerCase().includes(m)||i.driver.toLowerCase().includes(m)||i.id.toLowerCase().includes(m)}),Mn=x.filter(i=>{let m=S.trim().toLowerCase();return m===""||i.name.toLowerCase().includes(m)||i.driver.toLowerCase().includes(m)||i.mountpoint.toLowerCase().includes(m)}),wo=()=>o("div",{className:"dk_switchPill",title:"\u6B63\u5728\u5207\u6362\u5230 "+s+Ir(s)+"\u3002\u4E0B\u9762\u4ECD\u662F "+L+Ir(L)+"\u7684\u6570\u636E\uFF0C\u5207\u6362\u5B8C\u6210\u524D\u4E0D\u53EF\u64CD\u4F5C\u3002",children:[e("span",{className:"dk_spin dk_spinSm"}),o("span",{className:"dk_switchText",children:[e("span",{children:"\u6B63\u5728\u5207\u6362\u5230"}),e("strong",{children:s}),e("span",{className:"dk_switchDot",children:"\xB7"}),o("span",{className:"dk_switchSub",children:[e("span",{children:"\u5F53\u524D\u663E\u793A\uFF1A"}),e("span",{className:"dk_switchName",children:L})]})]})]},"switchPill"),Ir=i=>{let m=r.find(pe=>pe.name===i),C=m===void 0||typeof m.label!="string"?"":m.label;return C===""||C===i?"":"\uFF08"+C+"\uFF09"},Or=L!==""&&L!==s&&!b,Me=i=>{let m=r.find(C=>C.name===i);return m===void 0||m.label===void 0?i:i+" \xB7 "+m.label},wt=()=>we?e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]}):s===""?b?o("div",{className:"dk_empty",children:[e("div",{className:"dk_emptyTitle",children:"\u5F53\u524D\u4F1A\u8BDD\u4E3B\u673A\u8FD8\u4E0D\u662F Docker \u76EE\u6807"}),e("div",{className:"dk_emptyHint",children:"\u6309\u4E0A\u9762\u7684\u63D0\u793A\u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6DFB\u52A0\u4E00\u6761\u76EE\u6807\uFF08\u63A8\u8350\u76F4\u63A5\u9009\u8FDE\u63A5\u7C3F\u6761\u76EE\uFF09\uFF0C\u4FDD\u5B58\u540E\u56DE\u5230\u8FD9\u91CC\u5237\u65B0\u3002\u4E3A\u907F\u514D\u5F20\u51A0\u674E\u6234\uFF0C\u9762\u677F\u4E0D\u4F1A\u81EA\u52A8\u5207\u5230\u5176\u4ED6\u76EE\u6807\u3002"})]}):o("div",{className:"dk_empty",children:[e("div",{className:"dk_emptyTitle",children:"\u8FD8\u6CA1\u6709\u914D\u7F6E Docker \u76EE\u6807"}),e("div",{className:"dk_emptyHint",children:"\u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6DFB\u52A0\u4E00\u4E2A\u76EE\u6807\uFF1A\u672C\u673A\u76F4\u63A5\u9009\u300C\u672C\u673A\u300D\uFF1B\u8FDC\u7A0B\u4E3B\u673A\u53EF\u4EE5\u5F15\u7528 tty \u7EC8\u7AEF\u9762\u677F\u7684\u8FDE\u63A5\u7C3F\u6761\u76EE\u3002"})]}):Le!==""&&w.length===0?o("div",{className:"dk_empty",children:[e("div",{className:"dk_emptyTitle",children:"\u8FD9\u4E2A\u76EE\u6807\u7684\u6570\u636E\u6CA1\u8BFB\u5230"}),e("div",{className:"dk_emptyHint",children:"\u4E0A\u9762\u7684\u9519\u8BEF\u6761\u91CC\u6709\u539F\u56E0\uFF08\u76EE\u6807\u4E0D\u53EF\u8FBE / docker \u672A\u8FD0\u884C / \u6743\u9650\u4E0D\u8DB3\uFF09\u3002\u4FEE\u597D\u540E\u70B9\u53F3\u4E0A\u89D2\u5237\u65B0\u5373\u53EF\u3002"})]}):o("div",{className:"dk_empty",children:[e("div",{className:"dk_emptyTitle",children:g==="images"?"\u6CA1\u6709\u955C\u50CF":g==="compose"?"\u6CA1\u6709 Compose \u9879\u76EE":g==="networks"?"\u6CA1\u6709\u7F51\u7EDC":g==="volumes"?"\u6CA1\u6709\u5377":"\u6CA1\u6709\u5BB9\u5668"}),e("div",{className:"dk_emptyHint",children:ve.trim()===""?"\u76EE\u6807\u4E0A\u6CA1\u6709\u5339\u914D\u7684\u6570\u636E\uFF0C\u6216\u7B5B\u9009\u6761\u4EF6\u8FC7\u7A84\u3002":"\u6CA1\u6709\u5339\u914D\u300C"+ve.trim()+"\u300D\u7684\u7ED3\u679C\u3002"})]}),No=()=>{if(g==="overview")return $n(ta(R),{onOpenTarget:go,onOpenContainer:ho});if(g==="images")return o("div",{className:"dk_imagesView",children:[On.length===0?wt():e("div",{className:"dk_tableWrap",children:o("table",{className:"dk_images",children:[e("thead",{children:o("tr",{children:[e("th",{children:"\u955C\u50CF"}),e("th",{children:"\u5927\u5C0F"}),e("th",{children:"\u521B\u5EFA"}),e("th",{children:"ID"}),e("th",{className:"dk_colActions",children:"\u64CD\u4F5C"})]})}),e("tbody",{children:On.map(i=>o("tr",{children:[e("td",{className:"dk_mono",title:i.reference,children:i.dangling?"<none>\uFF08dangling\uFF09":i.reference}),e("td",{children:i.sizeText===""?i.size===null?"\u2014":dn(i.size):i.sizeText}),e("td",{children:i.createdSince}),e("td",{className:"dk_mono",children:i.shortId}),e("td",{className:"dk_colActions",children:o("div",{className:"dk_rowActions",children:[e($,{icon:Wo,title:"\u67E5\u770B\u955C\u50CF\u8BE6\u60C5\uFF08\u5C42 / \u6784\u5EFA\u5386\u53F2\uFF09",onClick:()=>q(i)},"inspect"),e($,{icon:un,danger:!0,disabled:n?.allowMutations!==!0,title:n?.allowMutations===!0?"\u5220\u9664\u955C\u50CF\uFF08\u4E0D\u53EF\u6062\u590D\uFF09":"\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",onClick:()=>bo(i)},"remove")]})},"actions")]},i.id+i.reference))})]})})]});if(g==="compose"){let i=vn(Qe);return i.length===0?wt():e(Ha,{groups:i,onOpen:m=>be({project:m})})}return g==="networks"?o("div",{className:"dk_imagesView",children:[Rn.length===0?wt():e("div",{className:"dk_tableWrap",children:o("table",{className:"dk_images",children:[e("thead",{children:o("tr",{children:[e("th",{children:"\u540D\u79F0"}),e("th",{children:"\u9A71\u52A8"}),e("th",{children:"\u8303\u56F4"}),e("th",{children:"\u5C5E\u6027"}),e("th",{children:"ID"})]})}),e("tbody",{children:Rn.map(i=>o("tr",{className:"dk_rowClickable",onClick:()=>ke(i),title:"\u67E5\u770B\u7F51\u7EDC\u8BE6\u60C5",children:[e("td",{className:"dk_mono",title:i.name,children:i.name}),e("td",{children:i.driver===""?"\u2014":i.driver}),e("td",{children:i.scope===""?"\u2014":i.scope}),e("td",{children:i.internal?e("span",{className:"dk_badge","data-state":"paused",children:"internal"}):"\u2014"}),e("td",{className:"dk_mono",title:i.id,children:i.shortId})]},i.id+i.name))})]})})]}):g==="volumes"?o("div",{className:"dk_imagesView",children:[Mn.length===0?wt():e("div",{className:"dk_tableWrap",children:o("table",{className:"dk_images",children:[e("thead",{children:o("tr",{children:[e("th",{children:"\u540D\u79F0"}),e("th",{children:"\u9A71\u52A8"}),e("th",{children:"\u8303\u56F4"}),e("th",{children:"\u6302\u8F7D\u70B9"})]})}),e("tbody",{children:Mn.map(i=>o("tr",{className:"dk_rowClickable",onClick:()=>me(i),title:"\u67E5\u770B\u5377\u8BE6\u60C5",children:[e("td",{className:"dk_mono",title:i.name,children:i.name}),e("td",{children:i.driver===""?"\u2014":i.driver}),e("td",{children:i.scope===""?"\u2014":i.scope}),e("td",{className:"dk_mono dk_pathCell",title:i.mountpoint,children:i.mountpoint===""?"\u2014":i.mountpoint})]},i.name))})]})})]}):Qe.length===0?wt():e("div",{className:"dk_grid",key:L===""?"first":L,children:Qe.map(i=>e(ba,{item:i,selected:Ue!==null&&i.id===Ue.id,allowMutations:n?.allowMutations===!0,pickMode:ge,picked:B.includes(i.id),pending:$t[i.id],onTogglePick:ko,onOpen:(m,C)=>je({id:m.id,tab:C,item:m}),onExec:fo,onAction:vo,onCopyExec:m=>{navigator.clipboard.writeText("docker exec -it "+m.name+" sh").then(()=>re("\u5DF2\u590D\u5236\uFF1Adocker exec -it "+m.name+" sh")).catch(()=>re("\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u590D\u5236"))}},i.id))})},Ie=t.docked===!0,Rr=t.carrier==="tab",So=n??{pollIntervalSec:5,logTailDefault:200,allowExec:!1,allowMutations:!1,execTimeoutSec:30},Nt=Qr(w,B),Mr=Uo(s),rn=Mr?Kn:gn,Co=qr(Nt.length,Mr),Br=Nt.length>0?Nt[0]:null,To=Zr(Qe,B,Br,rn),Lo=i=>{let m=$r(Qe,B,i,Br,rn);oe(m.ids),m.skipped>0?X("\u5DF2\u65B0\u589E "+String(m.added)+" \u4E2A\uFF0C\u53E6\u6709 "+String(m.skipped)+" \u4E2A\u8D85\u51FA\u4E0A\u9650\uFF08\u6700\u591A "+String(rn)+" \u4E2A\u6D41\uFF09\u672A\u9009"):m.added===0?X("\u6CA1\u6709\u53EF\u65B0\u589E\u7684\u5BB9\u5668\uFF08\u5DF2\u88AB\u52FE\u9009\u6216\u4E0D\u5728\u5F53\u524D\u7B5B\u9009\u7ED3\u679C\u91CC\uFF09"):X("\u5DF2\u65B0\u589E "+String(m.added)+" \u4E2A")},Eo=De===null?[]:vn(w).find(i=>i.project===De.project)?.items??[],Pr=nn!==null?e(Ra,{item:nn,target:s,targetLabel:Me(s),config:So,initialTab:Ue.tab,refreshToken:Ut,onBack:()=>je(null),onRefresh:co,onClose:We,docked:Ie},"detail"):U!==null?e(Ma,{item:T.find(i=>i.id===U.id)??U,target:s,targetLabel:Me(s),onBack:()=>q(null),onClose:We,docked:Ie},"imageDetail"):ze?e(ja,{target:s,targetLabel:Me(s),allowMutations:n?.allowMutations===!0,onBack:()=>Ge(!1),onDone:_t,onClose:We,docked:Ie},"pull"):De!==null?e(za,{project:De.project,items:Eo,target:s,targetLabel:Me(s),onBack:()=>be(null),onClose:We,docked:Ie},"composeDetail"):it?e(Ua,{items:Nt,target:s,targetLabel:Me(s),onBack:Re,onClose:We,docked:Ie},"aggregate"):ae!==null?e(Ba,{item:ae,target:s,targetLabel:Me(s),allowMutations:n?.allowMutations===!0,onBack:()=>ke(null),onRemoved:Er(()=>ke(null),Qt),onClose:We,docked:Ie},"networkDetail"):$e!==null?e(Pa,{item:$e,target:s,targetLabel:Me(s),allowMutations:n?.allowMutations===!0,onBack:()=>me(null),onRemoved:Er(()=>me(null),en),onClose:We,docked:Ie},"volumeDetail"):null,Io=[Pr!==null?[Pr,ye===null?null:e(dt,{title:ye.title,text:ye.text,confirmLabel:ye.confirmLabel,busy:Xt,onCancel:()=>Se(null),onConfirm:ye.run},"confirm")]:[Ie?null:o("div",{className:"dk_header",children:[e("span",{className:"dk_titleIcon",dangerouslySetInnerHTML:{__html:Wr}}),e("span",{className:"dk_title",children:"Docker \u5BB9\u5668"}),n?.allowMutations===!0?null:e("span",{className:"dk_badge","data-state":"paused",children:"\u53EA\u8BFB\u6A21\u5F0F"}),e("span",{className:"dk_headerSpacer"}),nn!==null?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5237\u65B0\u5217\u8868","data-spin":we?"1":void 0,onClick:yt,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:tt}})}),e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:We,children:e("span",{dangerouslySetInnerHTML:{__html:Pe}})})]}),nn!==null?null:o("div",{className:"dk_toolbar",children:[e("select",{className:"dk_select",value:g==="overview"?"":s,onChange:i=>{k(i.target.value),j(""),v("containers"),je(null),Re(),Ze({}),t.onTargetChange?.(Me(i.target.value))},children:[...g==="overview"?[e("option",{value:"",children:"\uFF08\u603B\u89C8 \xB7 \u5168\u90E8\u76EE\u6807\uFF09"},"__overview")]:s===""?[e("option",{value:"",children:"\uFF08\u672A\u9009\u62E9\u76EE\u6807\uFF09"},"__none")]:[],...(r.length===0&&s!==""?[{name:s,label:void 0}]:r).map(i=>e("option",{value:i.name,children:Me(i.name)},i.name))]}),r.length<2?null:e("button",{type:"button",className:"dk_pill dk_pillOverview","data-on":g==="overview"?"1":"0",title:g==="overview"?"\u9000\u51FA\u603B\u89C8\uFF0C\u56DE\u5230\u5F53\u524D\u76EE\u6807\u7684\u5BB9\u5668\u5217\u8868":"\u4E0D\u9009\u76EE\u6807\uFF0C\u4E00\u5C4F\u770B\u5168\u90E8\u76EE\u6807\u7684\u5BB9\u5668\u6982\u51B5\uFF08\u53EA\u8BFB\uFF09",onClick:()=>{if(g!=="overview"){v("overview"),j(""),je(null),Re();return}v("containers"),je(null),Re()},children:"\u603B\u89C8"}),e("div",{className:"dk_seg",children:[["containers","\u5BB9\u5668"],["images","\u955C\u50CF"],["compose","Compose"],["networks","\u7F51\u7EDC"],["volumes","\u5377"]].map(([i,m])=>e("button",{type:"button",className:"dk_segBtn","data-on":g===i?"1":"0",onClick:()=>{v(i),je(null),q(null),be(null),ke(null),me(null),Ge(!1),Re()},children:m},i))}),g==="containers"?e("button",{type:"button",className:"dk_pill dk_pillPick","data-on":ge?"1":"0",title:ge?"\u9000\u51FA\u9009\u62E9\u5E76\u6E05\u7A7A\u52FE\u9009\uFF08Esc\uFF09":"\u591A\u9009\u5BB9\u5668\uFF0C\u628A\u5B83\u4EEC\u7684\u65E5\u5FD7\u4E34\u65F6\u805A\u5408\u6210\u4E00\u6761\u6D41",onClick:uo,children:ge?"\u9000\u51FA\u9009\u62E9":"\u805A\u5408\u9009\u62E9"}):null,g==="containers"?e("input",{className:"dk_input dk_search",placeholder:"\u641C\u7D22\u540D\u79F0 / \u955C\u50CF / ID",value:ve,onChange:i=>Ve(i.target.value)}):null,g==="compose"?e("input",{className:"dk_input dk_search",placeholder:"\u641C\u7D22\u9879\u76EE / \u670D\u52A1 / \u5BB9\u5668",value:ve,onChange:i=>Ve(i.target.value)}):null,g==="images"?e("input",{className:"dk_input dk_search",placeholder:"\u641C\u7D22\u955C\u50CF\uFF08\u4ED3\u5E93 / \u6807\u7B7E / ID\uFF09",value:Zt,onChange:i=>Tn(i.target.value)}):null,g==="images"?e("span",{className:"dk_hint dk_searchCount",children:String(On.length)+" / "+String(T.length)+" \u4E2A\u955C\u50CF"}):null,g==="images"?e($,{icon:Ko,disabled:n?.allowMutations!==!0,title:n?.allowMutations===!0?"\u62C9\u53D6\u955C\u50CF\uFF08docker pull\uFF0C\u9010\u5C42\u5B9E\u65F6\u8FDB\u5EA6\uFF09":"\u62C9\u53D6\u955C\u50CF\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",onClick:()=>Ge(!0)},"pull"):null,g==="images"?e($,{icon:zn,danger:!0,disabled:n?.allowMutations!==!0,title:n?.allowMutations===!0?"\u6E05\u7406 dangling\uFF08\u65E0\u6807\u7B7E\uFF09\u955C\u50CF":"\u6E05\u7406 dangling \u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",onClick:_o},"prune"):null,g==="networks"?e("input",{className:"dk_input dk_search",placeholder:"\u641C\u7D22\u7F51\u7EDC\uFF08\u540D\u79F0 / \u9A71\u52A8 / ID\uFF09",value:N,onChange:i=>M(i.target.value)}):null,g==="volumes"?e("input",{className:"dk_input dk_search",placeholder:"\u641C\u7D22\u5377\uFF08\u540D\u79F0 / \u9A71\u52A8 / \u6302\u8F7D\u70B9\uFF09",value:S,onChange:i=>F(i.target.value)}):null,g==="networks"?e("span",{className:"dk_hint dk_searchCount",children:String(Rn.length)+" / "+String(f.length)+" \u4E2A\u7F51\u7EDC"}):null,g==="volumes"?e("span",{className:"dk_hint dk_searchCount",children:String(Mn.length)+" / "+String(x.length)+" \u4E2A\u5377"}):null,g==="networks"?e($,{icon:zn,danger:!0,disabled:n?.allowMutations!==!0,title:n?.allowMutations===!0?"\u6E05\u7406\u672A\u4F7F\u7528\u7684\u7F51\u7EDC\uFF08docker network prune\uFF09":"\u6E05\u7406\u7F51\u7EDC\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",onClick:yo},"prune"):null,g==="volumes"?e($,{icon:zn,danger:!0,disabled:n?.allowMutations!==!0,title:n?.allowMutations===!0?"\u6E05\u7406\u672A\u4F7F\u7528\u7684\u5377\uFF08docker volume prune\uFF0C\u4F1A\u5220\u6570\u636E\uFF09":"\u6E05\u7406\u5377\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",onClick:xo},"prune"):null,g==="compose"?e("span",{className:"dk_hint dk_searchCount",children:String(vn(Qe).length)+" \u4E2A\u9879\u76EE \xB7 "+String(Qe.length)+" \u4E2A\u5BB9\u5668"}):null,g==="containers"?e("div",{className:"dk_seg",children:[["all","\u5168\u90E8"],["running","\u8FD0\u884C\u4E2D"],["stopped","\u5DF2\u505C\u6B62"],["unhealthy","\u4E0D\u5065\u5EB7"]].map(([i,m])=>e("button",{type:"button",className:"dk_segBtn","data-on":Je===i?"1":"0",onClick:()=>Sn(i),children:m},i))}):null,g==="containers"||g==="compose"||g==="overview"?o("div",{className:"dk_toolbarToggles",children:[g==="containers"||g==="compose"?e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:Ne,onChange:i=>_e(i.target.checked)}),"\u542B\u5DF2\u505C\u6B62"]},"all"):null,e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:Ee,onChange:i=>Kt(i.target.checked)}),"\u81EA\u52A8\u5237\u65B0"]},"auto")]}):null,Ie?o("div",{className:"dk_toolbarEnd",children:[n?.allowMutations!==!0?e("span",{className:"dk_badge","data-state":"paused",children:"\u53EA\u8BFB\u6A21\u5F0F"},"readonly"):null,e("button",{type:"button",className:"dk_iconBtn",title:"\u5237\u65B0\u5217\u8868","data-spin":we?"1":void 0,onClick:yt,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:tt}})},"refresh")]}):null]}),g==="containers"&&ge?e(Ja,{count:Nt.length,info:Co,presets:To,max:rn,notice:ee,onPreset:Lo,onClear:()=>{oe([]),X("")},onRun:()=>fe(!0),onCancel:Re},"pickBar"):null,o("div",{className:"dk_body","data-stale":Or?"1":void 0,children:[Or?e("div",{className:"dk_switchOverlay",children:wo()},"stale"):null,o("div",{className:"dk_main"+(g==="images"||g==="networks"||g==="volumes"||g==="overview"?" dk_mainImages":""),children:[Le===""||g==="overview"?null:e(Y,{title:"\u64CD\u4F5C\u5931\u8D25",hint:Le}),Z===""?null:e(Y,{kind:"info",title:Z}),t.sessionHint===void 0?null:e(Y,{kind:"info",title:"\u5F53\u524D\u4F1A\u8BDD\u4E3B\u673A\u8FD8\u6CA1\u914D\u7F6E\u4E3A Docker \u76EE\u6807",hint:"\u4F1A\u8BDD\u4E3B\u673A\uFF1A"+t.sessionHint.host+(t.sessionHint.port===22?"":":"+String(t.sessionHint.port))+(t.sessionHint.book===""?"":"\uFF08\u8FDE\u63A5\u7C3F\uFF1A"+t.sessionHint.book+"\uFF09")+" \u2014 \u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6DFB\u52A0\u4E00\u6761 kind=ssh \u76EE\u6807"+(t.sessionHint.book===""?"\uFF08\u586B host/username\uFF0C\u6216\u7528\u8FDE\u63A5\u7C3F\u6761\u76EE\uFF09":"\uFF0C\u76F4\u63A5\u9009\u8FDE\u63A5\u7C3F\u6761\u76EE\u300C"+t.sessionHint.book+"\u300D")+"\uFF0C\u4FDD\u5B58\u540E\u56DE\u5230\u8FD9\u91CC\u5237\u65B0\u5373\u53EF\u3002"}),n!==null&&n.allowMutations!==!0?e(Y,{kind:"info",title:"\u5F53\u524D\u4E3A\u53EA\u8BFB\u6A21\u5F0F",hint:"\u5BB9\u5668\u7684\u542F\u52A8 / \u505C\u6B62 / \u91CD\u542F / \u5220\u9664\uFF0C\u4EE5\u53CA\u955C\u50CF\u3001\u7F51\u7EDC\u3001\u5377\u7684\u5220\u9664\u4E0E\u6E05\u7406\uFF0C\u90FD\u9700\u8981\u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D\u3002"}):null,g==="containers"?e(Ga,{events:Wt,status:Ke,statusText:mo(),open:Gt,onToggle:()=>Cn(i=>!i)},"activity"):null,No()]})]}),ye===null?null:e(dt,{title:ye.title,text:ye.text,confirmLabel:ye.confirmLabel,busy:Xt,onCancel:()=>Se(null),onConfirm:ye.run})],de===null?null:e(qa,{label:de.label,hostRef:K,collapsed:W,height:qe,onToggleCollapse:()=>ue(i=>!i),onResizeStart:so,onClose:()=>J(null)},"execDrawer"),lo&&de!==null?e(dt,{title:"\u7ED3\u675F\u5BB9\u5668\u7EC8\u7AEF\u4F1A\u8BDD",text:"\u5173\u95ED\u9762\u677F\u4F1A\u7ED3\u675F\u300C"+de.label+"\u300D\u7684\u7EC8\u7AEF\u4F1A\u8BDD\uFF08docker exec -it \u2026\uFF09\u3002\u82E5\u53EA\u662F\u60F3\u7ED9\u65E5\u5FD7 / \u5217\u8868\u817E\u5730\u65B9\uFF0C\u5148\u70B9\u62BD\u5C49\u53F3\u4E0A\u89D2\u7684\u6298\u53E0\u6309\u94AE\u5373\u53EF\uFF0C\u4F1A\u8BDD\u4F1A\u4FDD\u6301\u8FD0\u884C\u3002",confirmLabel:"\u7ED3\u675F\u5E76\u5173\u95ED",onCancel:()=>Ln(!1),onConfirm:()=>{Ln(!1),t.onClose()}},"closeConfirm"):null],Ar=o("div",{className:"dk_panel"+(Ie?" dk_panelDock":Rr?" dk_panelTab":""),"data-dock":Ie?"1":void 0,ref:Tr,onMouseDown:i=>i.stopPropagation(),children:Io});return Ie||Rr?Ar:o("div",{className:"dk_backdrop",onMouseDown:i=>{En.current=i.target===i.currentTarget},onMouseUp:i=>{let m=En.current&&i.target===i.currentTarget;En.current=!1,m&&We()},children:[Ar]})}function yr(t){let n=null;try{n=t.useTabInfo()}catch{}let a=()=>{pt=!1;try{n?.tab?.actions?.close?.()}catch{}};I(()=>{pt=!0},[]);let r=n?.tab?.navigation?.params,u=typeof r?.target=="string"?r.target:"",d=P("");u!==""&&(d.current=u);let c=d.current,s=n?.tab?.visible!==!1,k=n?.sidebar?.fullscreen===!0;return e(fr.Provider,{value:s,children:e(Vt,{key:c===""?"docker-tab":c,carrier:"tab",tabFullscreen:k,onClose:a,initialTarget:c===""?void 0:c,sessionHint:r?.sessionHint})})}function Za(){let[t,n]=p(!1),[a,r]=p(null),[u,d]=p(!1),[c,s]=p(!1),[k,b]=p({kind:"",text:""}),g=P(0),v=se(()=>{Q.config().then(f=>{r(f.config),jn(f.config),g.current=Array.isArray(f.config?.targets)?f.config.targets.length:0,d(!0)}).catch(f=>{b({kind:"error",text:"\u8BFB\u53D6\u914D\u7F6E\u5931\u8D25\uFF1A"+f.message}),d(!0)})},[]);I(()=>{t&&!u&&v()},[t,u,v]);let w=f=>r(_=>({..._,...f})),E=(f,_)=>r(x=>{let z=x.targets.slice();return z[f]={...z[f],..._},{...x,targets:z}}),L=()=>r(f=>({...f,targets:[...f.targets,{name:"\u76EE\u6807"+String(f.targets.length+1),kind:"local",book:"",host:"",port:22,username:"",auth:"agent",keyPath:"",agentForward:!1,passwordSet:!1,passphraseSet:!1}]})),D=f=>r(_=>({..._,targets:_.targets.filter((x,z)=>z!==f)})),y=f=>r(_=>({..._,hostKeys:_.hostKeys.filter(x=>!(x.host===f.host&&x.port===f.port))})),A=()=>{s(!0),b({kind:"",text:""});let f={enabled:a.enabled,announceToAgent:a.announceToAgent,dockerBin:a.dockerBin,allowMutations:a.allowMutations,allowExec:a.allowExec,execTimeoutSec:a.execTimeoutSec,pollIntervalSec:a.pollIntervalSec,logTailDefault:a.logTailDefault,maxOutputKb:a.maxOutputKb,targets:a.targets.map(_=>({name:_.name,kind:_.kind,book:_.book??"",host:_.host??"",port:Number(_.port)||22,username:_.username??"",auth:_.auth??"agent",keyPath:_.keyPath??"",..._.password===void 0||_.password===""?{}:{password:_.password},..._.passphrase===void 0||_.passphrase===""?{}:{passphrase:_.passphrase},agentForward:_.agentForward===!0})),hostKeys:a.hostKeys,...a.targets.length===0&&g.current>0?{clearTargets:!0}:{}};Q.saveConfig(f).then(_=>{r(_.config),jn(_.config),g.current=Array.isArray(_.config?.targets)?_.config.targets.length:0,kn(),b(_.warning===void 0?{kind:"ok",text:"\u5DF2\u4FDD\u5B58\u5E76\u70ED\u751F\u6548"}:{kind:"error",text:_.warning})}).catch(_=>{b({kind:"error",text:"\u4FDD\u5B58\u5931\u8D25\uFF1A"+_.message})}).finally(()=>s(!1))},R=f=>e("div",{className:"dk_cardSection",children:f}),H=(f,_,x,z)=>o("div",{className:"dk_field","data-span":z===void 0?void 0:String(z),children:[e("span",{className:"dk_label",children:f}),_,x===void 0?null:e("span",{className:"dk_hint",children:x})]}),T=(f,_,x,z)=>e("input",{className:"dk_input",type:"number",min:_,max:x,value:a[f],onChange:U=>w({[f]:Number(U.target.value)})}),ne=f=>o("li",{className:"dk_settingsCard"+(t?" dk_settingsCardOpen":""),children:[o("button",{type:"button",className:"dk_settingsHead","aria-expanded":t,onClick:()=>n(_=>!_),children:[o("span",{className:"dk_settingsHeadText",children:[e("span",{className:"dk_settingsName",children:"Docker \u5BB9\u5668\u9762\u677F"}),e("span",{className:"dk_settingsDesc",children:"\u672C\u673A / SSH \u4E3B\u673A\u4E0A\u7684\u5BB9\u5668\u4E0E\u955C\u50CF\uFF1B\u9ED8\u8BA4\u53EA\u8BFB\uFF0C\u53D8\u66F4\u64CD\u4F5C\u9700\u663E\u5F0F\u5F00\u542F"})]}),e("span",{className:"dshkit_badge",children:"Kit"}),e("span",{className:"dk_settingsChevron",dangerouslySetInnerHTML:{__html:Hn}})]}),t?e("div",{className:"dk_settingsBody",children:f}):null]});return ne(t?!u||a===null?o("div",{className:"dk_row",children:[e("span",{className:"dk_spin"}),"\u8BFB\u53D6\u914D\u7F6E\u2026"]}):[R("\u57FA\u672C"),o("div",{className:"dk_row",children:[e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:a.enabled,onChange:f=>w({enabled:f.target.checked})}),"\u542F\u7528\u63D2\u4EF6"]}),e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:a.announceToAgent,onChange:f=>w({announceToAgent:f.target.checked})}),"\u5411 agent \u516C\u544A\u80FD\u529B"]})]}),o("div",{className:"dk_fieldGrid",children:[H("docker CLI",e("input",{className:"dk_input",value:a.dockerBin,onChange:f=>w({dockerBin:f.target.value})}),"\u9ED8\u8BA4 docker\uFF1Bpodman \u53EF\u586B podman"),H("\u7EDF\u8BA1\u5237\u65B0\u95F4\u9694\uFF08\u79D2\uFF09",T("pollIntervalSec",1,60)),H("\u65E5\u5FD7\u9ED8\u8BA4\u884C\u6570",T("logTailDefault",1,5e3)),H("\u8F93\u51FA\u4E0A\u9650\uFF08KB\uFF09",T("maxOutputKb",1,8192)),H("exec \u8D85\u65F6\uFF08\u79D2\uFF09",T("execTimeoutSec",1,120))]}),R("\u80FD\u529B\u5F00\u5173\uFF08\u9ED8\u8BA4\u5173\u95ED\uFF09"),o("div",{className:"dk_row",children:[e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:a.allowMutations,onChange:f=>w({allowMutations:f.target.checked})}),"\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\uFF08\u5BB9\u5668\u542F\u505C\u5220\u3001\u955C\u50CF\u62C9\u53D6 / \u5220\u9664 / \u6E05\u7406\uFF09"]}),e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:a.allowExec,onChange:f=>w({allowExec:f.target.checked})}),"\u5141\u8BB8 exec\uFF08\u5728\u5BB9\u5668\u5185\u6267\u884C\u547D\u4EE4\uFF09"]})]}),e("span",{className:"dk_hint",children:"docker socket \u7B49\u4EF7\u4E8E\u76EE\u6807\u4E3B\u673A\u7684 root \u6743\u9650\u3002\u5F00\u542F\u540E\uFF0C\u6D4F\u89C8\u5668\u9762\u677F\u4E0E agent \u90FD\u80FD\u6267\u884C\u5BF9\u5E94\u64CD\u4F5C\uFF0C\u8BF7\u53EA\u5728\u53EF\u4FE1\u73AF\u5883\u4E0B\u6253\u5F00\u3002"}),R("\u76EE\u6807"),...a.targets.map((f,_)=>o("div",{className:"dk_targetRow",children:[e("input",{className:"dk_input",value:f.name,placeholder:"\u76EE\u6807\u540D",onChange:x=>E(_,{name:x.target.value})}),e("select",{className:"dk_select",value:f.kind,onChange:x=>E(_,{kind:x.target.value}),children:[e("option",{value:"local",children:"\u672C\u673A"}),e("option",{value:"ssh",children:"SSH \u4E3B\u673A"})]}),f.kind==="local"?e("span",{className:"dk_hint",children:"\u5BBF\u4E3B\u6240\u5728\u673A\u5668\u4E0A\u7684 docker"}):o("div",{className:"dk_row",style:{gridColumn:"span 1"},children:[e("select",{className:"dk_select",value:f.book??"",onChange:x=>E(_,{book:x.target.value}),children:[e("option",{value:"",children:a.ttyBooks.length===0?"\uFF08\u65E0 tty \u8FDE\u63A5\u7C3F\uFF0C\u8BF7\u586B\u5185\u8054\u4FE1\u606F\uFF09":"\uFF08\u4E0D\u7528\u8FDE\u63A5\u7C3F\uFF0C\u624B\u586B\uFF09"}),...a.ttyBooks.map(x=>e("option",{value:x,children:"\u8FDE\u63A5\u7C3F\uFF1A"+x},x))]})]}),e("button",{type:"button",className:"dk_btn dk_btnDanger",onClick:()=>D(_),children:"\u5220\u9664"}),f.kind==="ssh"&&(f.book??"")===""?o("div",{className:"dk_targetInline",children:[e("input",{className:"dk_input",placeholder:"host",value:f.host??"",onChange:x=>E(_,{host:x.target.value})}),e("input",{className:"dk_input",placeholder:"22",title:"\u7AEF\u53E3",value:f.port??22,onChange:x=>E(_,{port:Number(x.target.value)||22})}),e("input",{className:"dk_input",placeholder:"username",value:f.username??"",onChange:x=>E(_,{username:x.target.value})}),e("select",{className:"dk_select",value:f.auth??"agent",onChange:x=>E(_,{auth:x.target.value}),children:[e("option",{value:"agent",children:"ssh-agent"}),e("option",{value:"key",children:"\u79C1\u94A5"}),e("option",{value:"password",children:"\u5BC6\u7801"})]}),(f.auth??"agent")==="key"?e("input",{className:"dk_input dk_credential",placeholder:"~/.ssh/id_ed25519",value:f.keyPath??"",onChange:x=>E(_,{keyPath:x.target.value})}):null,(f.auth??"agent")==="password"?e("input",{className:"dk_input dk_credential",type:"password",placeholder:f.passwordSet===!0?"\uFF08\u5DF2\u8BBE\u7F6E\uFF0C\u7559\u7A7A\u4FDD\u6301\u4E0D\u53D8\uFF09":"env:SSH_PASSWORD",value:f.password??"",onChange:x=>E(_,{password:x.target.value})}):null,e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:f.agentForward===!0,onChange:x=>E(_,{agentForward:x.target.checked})}),"agent forwarding"]})]}):null]},String(_)+f.name)),o("div",{className:"dk_row",children:[e("button",{type:"button",className:"dk_btn",onClick:L,children:"\u6DFB\u52A0\u76EE\u6807"}),e("span",{className:"dk_hint",children:"SSH \u76EE\u6807\u63A8\u8350\u76F4\u63A5\u9009 tty \u7EC8\u7AEF\u9762\u677F\u7684\u8FDE\u63A5\u7C3F\u6761\u76EE\uFF08\u51ED\u8BC1\u53EA\u9700\u7EF4\u62A4\u4E00\u5904\uFF09\uFF1B\u624B\u586B\u65F6\u5BC6\u7801 / \u53E3\u4EE4\u5EFA\u8BAE\u5199 env:VAR\u3002"})]}),R("SSH \u4E3B\u673A\u5BC6\u94A5\u8BB0\u5F55\uFF08TOFU\uFF09"),...a.hostKeys.length===0?[e("span",{className:"dk_hint",children:"\u6682\u65E0\u8BB0\u5F55 \u2014 \u9996\u6B21 SSH \u8FDE\u63A5\u6210\u529F\u540E\u81EA\u52A8\u8BB0\u5F55\u4E3B\u673A\u6307\u7EB9\uFF08\u82E5 tty \u5DF2\u8BB0\u5F55\u540C\u4E00\u4E3B\u673A\uFF0C\u4F1A\u76F4\u63A5\u590D\u7528\uFF09\u3002"},"none")]:a.hostKeys.map(f=>o("div",{className:"dk_targetRow",children:[e("span",{children:f.host+":"+String(f.port)}),e("span",{className:"dk_hint",style:{gridColumn:"span 2",wordBreak:"break-all"},children:"sha256:"+f.fingerprint}),e("button",{type:"button",className:"dk_btn",onClick:()=>y(f),children:"\u5220\u9664"})]},f.host+":"+String(f.port))),e("span",{className:"dk_hint",children:"\u6307\u7EB9\u53D8\u66F4\u65F6\u8FDE\u63A5\u4F1A\u88AB\u62D2\u7EDD\uFF08\u9632\u4E2D\u95F4\u4EBA\uFF09\uFF1B\u786E\u8BA4\u5B89\u5168\u540E\u5220\u9664\u5BF9\u5E94\u8BB0\u5F55\u5373\u53EF\u91CD\u8FDE\u3002"}),o("div",{className:"dk_row",children:[e("button",{type:"button",className:"dk_btn dk_btnPrimary",disabled:c,onClick:A,children:c?"\u4FDD\u5B58\u4E2D\u2026":"\u4FDD\u5B58"}),e("span",{className:"dk_msg","data-kind":k.kind,children:k.text})]})]:null)}let gt=null,ot=null,Nn=null;function ht(){let t=ot,n=gt,a=Nn;if(ot=null,gt=null,Nn=null,n!==null&&n.remove(),t!==null&&setTimeout(()=>{try{t.unmount()}catch{}},0),a!==null)try{a.dispose()}catch{}}function Qa(t){return t!==null&&typeof t=="object"&&typeof t.appendChild=="function"}function eo(){return typeof et?.mountPane=="function"&&typeof et.isOpen=="function"&&Number(et.version??0)>=1&&et.isOpen()===!0}let to="dsh-docker:carrier";function xr(){try{return window.localStorage.getItem(to)==="modal"?"modal":"tab"}catch{return"tab"}}let pt=!1;function wr(t,n,a,r){return t!==!0||r!==!0||typeof a!="string"||a===""?!1:a!==n}function Nr(t){if(xr()==="tab"&&lt!==null)try{let n={};typeof t?.target=="string"&&t.target!==""&&(n.target=t.target),t?.sessionHint!==void 0&&(n.sessionHint=t.sessionHint),pt=!0,lt.openTab(Bn,{params:n});return}catch(n){console.warn("[dsh-docker] \u6253\u5F00\u53F3\u4FA7\u680F\u6807\u7B7E\u5931\u8D25\uFF0C\u56DE\u9000\u6A21\u6001\uFF1A"+(n instanceof Error?n.message:String(n)))}Sr(t)}function Sr(t){ht(),Pn();let n={onClose:ht,initialTarget:t?.target??"",sessionHint:t?.sessionHint};if(eo()){let a=null;try{a=et.mountPane({title:"Docker \u5BB9\u5668",hint:t?.target===void 0||t.target===""?"":t.target,size:520,min:360,onClose:()=>ht()})}catch(r){a=null,console.warn("[dsh-docker] \u6302\u8F7D\u5230\u7EC8\u7AEF\u9762\u677F\u5931\u8D25\uFF0C\u56DE\u9000\u5F39\u7A97\uFF1A"+(r instanceof Error?r.message:String(r)))}if(a!==null&&Qa(a.element)){Nn=a,ot=O(a.element),ot.render(e(Vt,{...n,docked:!0,onTargetChange:r=>{try{a.setHint(r)}catch{}}}));return}}gt=document.createElement("div"),document.body.appendChild(gt),ot=O(gt),ot.render(e(Vt,n))}function no(){let t=document.querySelector('[data-pane="sidebar"], [class*="sidebarCol"]');if(t!==null)return t.querySelector('[class*="logoRow"]')?.parentElement??t.firstElementChild}function ro(t){let n=t.querySelector('button[class*="newSession"]');if(n!==null)return n;for(let a of t.children)if(a.tagName==="BUTTON")return a}function ao(){let t=document.createElement("div");return t.dataset.dshDockerEntry="",t.className="dk_sidebarEntry",t.setAttribute("role","button"),t.setAttribute("aria-label","\u5BB9\u5668"),t.innerHTML='<span class="dk_entryIcon">'+Wr+'</span><span class="dk_entryLabel">\u5BB9\u5668</span>',t.addEventListener("click",n=>{n.preventDefault(),Nr()}),t}function Cr(t,n){let a=ro(t);if(a===void 0)return!1;if(n.parentElement!==t){let r=a.closest('[class*="logoRow"]'),u=r!==null&&r.parentElement===t?r:a,d=Array.from(t.children).filter(c=>c instanceof HTMLElement&&c.matches("[data-dsh-global-search-entry], [data-dsh-rss-entry], [data-dsh-taskboard-entry], [data-dsh-ssh-entry], [data-dsh-tty-entry], [data-dsh-docker-entry]"));if(d.length>0){let c=d[d.length-1];t.insertBefore(n,c.nextSibling)}else t.insertBefore(n,u.nextElementSibling)}return!0}function oo(){if(Pn(),document.querySelector("[data-dsh-docker-entry]")!==null)return()=>{};let t=ao(),n,a=!1,r=()=>{if(n!==void 0&&!n.isConnected&&(d.disconnect(),n=void 0,a=!1),a){if(document.body.contains(t))return;d.disconnect(),n=void 0,a=!1}n??(n=no()),n!==void 0&&(a=Cr(n,t),a&&d.observe(n,{childList:!0,subtree:!0}))},u=new MutationObserver(()=>{r()});u.observe(document.body,{childList:!0,subtree:!0});let d=new MutationObserver(()=>{if(n===void 0||!n.isConnected){a=!1,r();return}n.contains(t)||(a=Cr(n,t))});return r(),()=>{u.disconnect(),d.disconnect(),t.remove()}}let Te={};return Te.inject=["slots"],Te.__carrier={open:Nr,preference:xr,isOwnExec:Fr,buildExec:An,shouldReopen:wr,deliver:Dt},Te.__feed={projectFeed:$a,textOf:Ye},Te.__render={ContainerPanel:Vt,DockerTabBody:yr,SessionProbeBody:_r},Te.__pick={MAX:gn,SSH_MAX:Kn,PRESETS:ga,presetCounts:Zr,apply:$r,SOFT_MAX:ka,decide:qr,toggle:Xr,reconcile:Yr,items:Qr},Te.__events={LIMIT:na,RECENT:ra,DEBOUNCE_MS:aa,append:oa,actionText:la,timeText:ia,debounce:sa},Te.__overview={ERROR_MAX:Wn,counts:ma,abnormal:Gn,sortRows:fa,patch:Ct,errorText:va,data:ta,body:$n},Te.__listSeq={make:ea},Te.__panel={chooseInitialTarget:Dn,readLastTarget:Vr,writeLastTarget:Kr,LAST_TARGET_KEY:Un},Te.__aggLogs={mergeBuffered:pr,WINDOW_MS:bn,splitTs:ur,levelName:kr,orderByTs:_n,REORDER_TAIL:yn,reorderTail:jt,filterByLevel:gr,exportText:hr},Te.apply=t=>{Pn();let n=!1,a=()=>{};hn={set(d){if(d!==n){if(n=d,d){a=oo();return}a(),a=()=>{},ht(),typeof cn?.requestRender=="function"&&cn.requestRender()}}},ca(!0);let r=t.slots.inject("settings.plugin.item",()=>t.slots.register({name:"settings.plugin.item",key:"docker",order:102},Za));t.inject(["ttyTerminal"],d=>(Xe=d.ttyTerminal??null,()=>{Xe=null})),t.inject(["ttyPanel"],d=>(et=d.ttyPanel??null,()=>{et=null})),t.inject(["sessions"],d=>{Ce=d.sessions??null;let c=null;try{c=Ce?.list?.getSnapshot?.()?.current??null}catch{}let s=typeof Ce?.list?.subscribe=="function"?Ce.list.subscribe(()=>{let k=null;try{k=Ce.list.getSnapshot()?.current??null}catch{}if(wr(pt,c,k,lt!==null))try{lt.openTab(Bn,{})}catch{}typeof k=="string"&&k!==""&&(c=k)}):null;return()=>{if(s!==null)try{s()}catch{}Ce=null,pt=!1}}),t.inject(["sidebarRightTabs","sidebarRight"],d=>{let c=d.sidebarRightTabs.register({id:Hr,kind:Bn,priority:"extension",title:()=>"Docker \u5BB9\u5668",guide:[{order:90,title:()=>"Docker \u5BB9\u5668",description:()=>"\u672C\u673A\u4E0E SSH \u4E3B\u673A\u7684\u5BB9\u5668\u3001\u955C\u50CF\u3001Compose\u3001\u7F51\u7EDC\u4E0E\u5377"}]}),s=d.slots.inject("sidebar.right.pane.tab",()=>d.slots.register({name:"sidebar.right.pane.tab",key:Hr},yr));lt=d.sidebarRight??null;let k=()=>{},b=()=>{};try{k=d.sidebarRightTabs.register({id:vr,kind:br,priority:"extension",title:()=>"\u4F1A\u8BDD\u63A2\u9488",guide:[{order:95,title:()=>"\u4F1A\u8BDD\u63A2\u9488\uFF08spike\uFF09",description:()=>"\u9A8C\u8BC1\u4F1A\u8BDD\u6D41\u5F0F\u8BA2\u9605\uFF1AuseChat / useConversation / projections"}]}),b=d.slots.inject("sidebar.right.pane.tab",()=>d.slots.register({name:"sidebar.right.pane.tab",key:vr},_r)),Ht=d.sidebarRight??null}catch(g){console.warn("[dsh-docker][spike] \u4F1A\u8BDD\u63A2\u9488\u6CE8\u518C\u5931\u8D25\uFF1A"+(g instanceof Error?g.message:String(g)))}return()=>{lt=null,Ht=null;try{b()}catch{}try{k()}catch{}try{s()}catch{}try{c()}catch{}}});let u=()=>{};return kn(),t.inject(["ttyConnbar"],d=>{let c=d.ttyConnbar;c!==void 0&&(cn=c,u=c.addAction(s=>{if(!pn)return;let k=s?.spec??{};if(k.t!=="ssh"||Fr(k.command))return;let b=typeof s?.bookName=="string"?s.bookName:"",g=Vn(k,b),v=g!==void 0?`\u6253\u5F00\u8BE5\u4E3B\u673A\u7684 Docker \u5BB9\u5668\u9762\u677F\uFF08\u76EE\u6807\uFF1A${g}\uFF09`:Ae===null?"\u6253\u5F00\u5F53\u524D\u4F1A\u8BDD\u4E3B\u673A\u7684 Docker \u5BB9\u5668\u9762\u677F":"\u8BE5\u4E3B\u673A\u5C1A\u672A\u914D\u7F6E\u4E3A Docker \u76EE\u6807 \u2014 \u70B9\u51FB\u6253\u5F00\u9762\u677F\u67E5\u770B/\u914D\u7F6E";s.addAction(Ao,"\u5BB9\u5668",v,()=>{(async()=>{let w=await Po(k,b),E=Number(k.port);Sr({target:w??"",sessionHint:w===void 0?{host:typeof k.host=="string"?k.host:"",port:Number.isInteger(E)&&E>0?E:22,book:b}:void 0})})()})}),(async()=>{for(let s=0;s<3;s+=1){if(await kn()){typeof c.requestRender=="function"&&c.requestRender();return}await new Promise(k=>setTimeout(k,2e3))}})())}),()=>{u(),r(),hn=null,pn=!1,cn=null,a(),ht()}},Te}});})();
