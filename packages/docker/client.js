"use strict";(()=>{var qn=`/* eslint-disable */
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
`;var vn="/api/dsh-docker",Yn="dsh-docker-style";function sn(){if(document.getElementById(Yn)!==null)return;let o=document.createElement("style");o.id=Yn,o.textContent=qn,document.head.appendChild(o)}async function oe(o,d){let e=await fetch(vn+o,{...d,headers:{"content-type":"application/json",...d?.headers??{}}}),r=null;try{r=await e.json()}catch{}if(!e.ok){let C=r!==null&&typeof r.error=="string"?r.error:`HTTP ${String(e.status)}`;throw new Error(C)}if(r!==null&&r.ok===!1)throw new Error(typeof r.error=="string"?r.error:"\u8BF7\u6C42\u5931\u8D25");return r}var X={config:()=>oe("/config"),saveConfig:o=>oe("/config",{method:"POST",body:JSON.stringify(o)}),targets:()=>oe("/targets"),probe:o=>oe("/probe",{method:"POST",body:JSON.stringify({target:o})}),containers:(o,d)=>oe("/containers",{method:"POST",body:JSON.stringify({target:o,all:d})}),attention:o=>oe("/attention",{method:"POST",body:JSON.stringify({target:o})}),inspect:(o,d)=>oe("/inspect",{method:"POST",body:JSON.stringify({target:o,id:d})}),logs:(o,d,e)=>oe("/logs",{method:"POST",body:JSON.stringify({target:o,id:d,...e})}),stats:(o,d)=>oe("/stats",{method:"POST",body:JSON.stringify({target:o,ids:d})}),images:o=>oe("/images",{method:"POST",body:JSON.stringify({target:o})}),imageInspect:(o,d)=>oe("/images/inspect",{method:"POST",body:JSON.stringify({target:o,ref:d})}),imageRemove:(o,d)=>oe("/images/remove",{method:"POST",body:JSON.stringify({target:o,ref:d})}),imagePrune:o=>oe("/images/prune",{method:"POST",body:JSON.stringify({target:o})}),networks:o=>oe("/networks",{method:"POST",body:JSON.stringify({target:o})}),networkInspect:(o,d)=>oe("/networks/inspect",{method:"POST",body:JSON.stringify({target:o,name:d})}),networkRemove:(o,d)=>oe("/networks/remove",{method:"POST",body:JSON.stringify({target:o,name:d})}),networkPrune:o=>oe("/networks/prune",{method:"POST",body:JSON.stringify({target:o})}),volumes:o=>oe("/volumes",{method:"POST",body:JSON.stringify({target:o})}),volumeInspect:(o,d)=>oe("/volumes/inspect",{method:"POST",body:JSON.stringify({target:o,name:d})}),volumeRemove:(o,d)=>oe("/volumes/remove",{method:"POST",body:JSON.stringify({target:o,name:d})}),volumePrune:o=>oe("/volumes/prune",{method:"POST",body:JSON.stringify({target:o})}),action:(o,d,e)=>oe("/action",{method:"POST",body:JSON.stringify({target:o,action:d,id:e})}),exec:(o,d,e,r)=>oe("/exec",{method:"POST",body:JSON.stringify({target:o,id:d,command:e,timeoutSec:r})})};function zt(o,d){return vn+o+"?"+new URLSearchParams(d).toString()}function Lr(o){return o==null||!Number.isFinite(o)?"\u2014":o.toFixed(o>=10?1:2)+"%"}function Er(o){return o.hostPort===void 0?String(o.containerPort)+"/"+o.protocol:String(o.hostPort)+"\u2192"+String(o.containerPort)+"/"+o.protocol}function Ft(o){if(!Array.isArray(o)||o.length===0)return"\u65E0\u7AEF\u53E3\u6620\u5C04";let d=new Set,e=[];for(let r of o){let C=Er(r);d.has(C)||(d.add(C),e.push(C))}return e.join("  ")}function _t(o){let d=/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/.exec(o);return d===null?o:d[1]+" "+d[2]}function Vt(o){if(o==null||!Number.isFinite(o)||o<0)return"\u2014";let d=["B","kB","MB","GB","TB"],e=o,r=0;for(;e>=1e3&&r<d.length-1;)e/=1e3,r+=1;return(r===0?String(Math.round(e)):e.toFixed(e>=100?0:1))+" "+d[r]}function Or(o){return{running:"\u8FD0\u884C\u4E2D",exited:"\u5DF2\u505C\u6B62",created:"\u5DF2\u521B\u5EFA",paused:"\u5DF2\u6682\u505C",restarting:"\u91CD\u542F\u4E2D",dead:"dead",removing:"\u5220\u9664\u4E2D",unknown:"\u672A\u77E5"}[o]??o}function $n(o,d){let e=new Blob([d],{type:"text/plain;charset=utf-8"}),r=URL.createObjectURL(e),C=document.createElement("a");C.href=r,C.download=o,C.click(),setTimeout(()=>URL.revokeObjectURL(r),1e3)}function Xn(o){return"docker exec -it '"+String(o).replaceAll("'","'\\''")+"' sh"}var bn="dsh-docker:last-target";function Zn(){try{let o=window.localStorage.getItem(bn);return typeof o=="string"?o:""}catch{return""}}function Qn(o){try{window.localStorage.setItem(bn,o)}catch{}}function cn(o,d,e,r){if(d!=="")return d;if(r)return"";let C=o.map(s=>s.name);return e!==""&&C.includes(e)?e:C.length>0?C[0]:""}var Je=null,$e=null,Gt=null,Ue=null,_n=[],hn=0,Jt=null,Ut=!1;function ba(o){Ut=o,Jt!==null&&Jt.set(o)}function _a(o){ba(!(o!==null&&typeof o=="object"&&o.enabled===!1))}function un(o){o!==null&&typeof o=="object"&&(Ue=o),hn=Date.now(),_a(Ue)}async function Kt(){let o=!0;try{Ue=(await X.config()).config,hn=Date.now(),_a(Ue)}catch(d){o=!1,console.warn("[dsh-docker] \u914D\u7F6E\u7F13\u5B58\u5237\u65B0\u5931\u8D25\uFF1A"+(d instanceof Error?d.message:String(d)))}try{_n=(await X.targets()).targets??[],hn=Date.now()}catch(d){Ut&&(o=!1,console.warn("[dsh-docker] \u76EE\u6807\u7F13\u5B58\u5237\u65B0\u5931\u8D25\uFF1A"+(d instanceof Error?d.message:String(d))))}return o}async function Ir(o,d){let e=pn(o,d);return e!==void 0?e:(await Kt(),pn(o,d))}function pn(o,d){let e=Ue!==null&&Array.isArray(Ue.targets)?Ue.targets:[];if(typeof d=="string"&&d!==""){let T=e.find(R=>R.kind==="ssh"&&R.book===d);if(T!==void 0)return T.name}let r=typeof o?.host=="string"?o.host:"";if(r==="")return;let C=Number(o?.port),s=Number.isInteger(C)&&C>0?C:22;for(let T of _n){if(T.kind!=="ssh"||typeof T.label!="string")continue;let R=/^([^@]+)@(.+?)(?::(\d+))?$/.exec(T.label);if(R!==null&&R[2]===r&&Number(R[3]??22)===s)return T.name}}var ea='<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 1.8l5.4 3.1v6.2L8 14.2 2.6 11.1V4.9z"/><path d="M2.6 4.9L8 8l5.4-3.1"/><path d="M8 8v6.2"/></svg>',Rr='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 1.8l5.4 3.1v6.2L8 14.2 2.6 11.1V4.9z"/><path d="M2.6 4.9L8 8l5.4-3.1"/><path d="M8 8v6.2"/></svg>',Xe='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.2 8a5.2 5.2 0 1 1-1.5-3.7"/><path d="M13.4 2.2v2.6h-2.6"/></svg>',Be='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M4.5 4.5l7 7"/><path d="M11.5 4.5l-7 7"/></svg>',Mr='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 3.4l7.4 4.6L5 12.6z"/></svg>',Br='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4.2" y="4.2" width="7.6" height="7.6" rx="1.2"/></svg>',Pr='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.2 8a5.2 5.2 0 1 1-1.5-3.7"/><path d="M13.4 2.2v2.6h-2.6"/></svg>',Wt='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4.6h10"/><path d="M6.2 4.6V3.4a.8.8 0 0 1 .8-.8h2a.8.8 0 0 1 .8.8v1.2"/><path d="M4.6 4.6l.6 8a.9.9 0 0 0 .9.8h3.8a.9.9 0 0 0 .9-.8l.6-8"/></svg>';var Dr='<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3v7.2"/><path d="M5 7.4L8 10.4l3-3"/><path d="M3.4 12.8h9.2"/></svg>',Ar='<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2.6l5.8 10.4H2.2z"/><path d="M8 6.4v3.2"/><path d="M8 11.6h.01"/></svg>',ta='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5l3.5 3L3 11"/><path d="M8.5 11H13"/></svg>',na='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M3 4.5h10"/><path d="M3 8h10"/><path d="M3 11.5h6"/></svg>',jr='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M3.5 12.5v-4"/><path d="M7 12.5v-8"/><path d="M10.5 12.5v-5"/><path d="M13 12.5v-2"/></svg>',Ze='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.5 8h-9"/><path d="M7 4.5L3.5 8 7 11.5"/></svg>',kn='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6.5L8 10.5l4-4"/></svg>',Hr='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2.6v6.4"/><path d="M5.3 6.5L8 9.2l2.7-2.7"/><path d="M3 11.4v1.2a.8.8 0 0 0 .8.8h8.4a.8.8 0 0 0 .8-.8v-1.2"/></svg>',zr='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="3.5" width="11" height="9" rx="1.2"/><path d="M2.5 10.2L5.6 7.6l2.4 2 2.1-1.7 3.4 2.9"/><path d="M6 6.2h.01"/></svg>',gn='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.4 12.6h9.2"/><path d="M5.2 9.6l3.1-3.1"/><path d="M8.4 3.6l2.4 2.4"/><path d="M10.6 6.2l1.8 1.8-3.2 1.2-1.2 3.2-1.8-1.8z"/></svg>',aa='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.4 5.9L8 2.8l5.6 3.1L8 9z"/><path d="M2.4 8.4L8 11.5l5.6-3.1"/><path d="M2.4 10.9L8 14l5.6-3.1"/></svg>';var Fr='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="3.2" r="1.7"/><circle cx="3.4" cy="12.2" r="1.7"/><circle cx="12.6" cy="12.2" r="1.7"/><path d="M6.7 4.6L4.5 10.6"/><path d="M9.3 4.6l2.2 6"/><path d="M5.1 12.2h5.8"/></svg>',Vr='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="8" cy="4.2" rx="4.6" ry="1.9"/><path d="M3.4 4.2v7.6c0 1 2.1 1.9 4.6 1.9s4.6-.9 4.6-1.9V4.2"/><path d="M3.4 8c0 1 2.1 1.9 4.6 1.9s4.6-.9 4.6-1.9"/></svg>',ya=6,Qe=8;function ra(o){return o>Qe?{canRun:!1,hint:"\u6700\u591A "+String(Qe)+" \u4E2A\u5BB9\u5668\uFF0C\u6D4F\u89C8\u5668\u5E76\u53D1\u957F\u8FDE\u63A5\u6709\u9650\u5236"}:o>ya?{canRun:!0,hint:"\u8FDE\u63A5\u6570\u8F83\u591A\uFF0C\u6D4F\u89C8\u5668\u5E76\u53D1\u957F\u8FDE\u63A5\u6709\u9650\u5236"}:o<2?{canRun:!1,hint:o===0?"":"\u81F3\u5C11\u9009\u62E9 2 \u4E2A\u5BB9\u5668"}:{canRun:!0,hint:""}}function oa(o,d){return o.includes(d)?o.filter(e=>e!==d):[...o,d]}function la(o,d){let e=new Set(d.map(C=>C.id)),r=o.filter(C=>e.has(C));return r.length===o.length?o:r}var xa=[{key:"all",label:"\u5168\u90E8\u53EF\u89C1",needsBase:!1},{key:"unhealthy",label:"\u4E0D\u5065\u5EB7",needsBase:!1},{key:"abnormal",label:"\u9700\u5173\u6CE8",needsBase:!1},{key:"stopped",label:"\u5DF2\u505C\u6B62",needsBase:!1},{key:"sameImage",label:"\u540C\u955C\u50CF",needsBase:!0},{key:"sameProject",label:"\u540C\u9879\u76EE",needsBase:!0}],Gr=o=>o==="running"||o==="paused"||o==="restarting";function wa(o,d){switch(o){case"all":return()=>!0;case"unhealthy":return e=>e.health==="unhealthy";case"abnormal":return e=>yn(e).length>0;case"stopped":return e=>!Gr(e.state);case"sameImage":return e=>d!==null&&e.image===d.image;case"sameProject":return e=>d!==null&&d.composeProject!==null&&e.composeProject===d.composeProject;default:return()=>!1}}function ia(o,d,e,r,C){let s=wa(e,r),T=Math.max(C-d.length,0),R=o.filter(et=>!d.includes(et.id)&&s(et)),ie=R.slice(0,T);return{ids:d.concat(ie.map(et=>et.id)),added:ie.length,skipped:R.length-ie.length}}function da(o,d,e,r){let C=Math.max(r-d.length,0);return xa.filter(s=>!s.needsBase||e!==null).map(s=>{let T=wa(s.key,e),R=o.filter(ie=>!d.includes(ie.id)&&T(ie)).length;return{key:s.key,label:s.label,count:Math.min(R,C),over:Math.max(R-C,0)}})}function sa(o,d){let e=new Map(o.map(r=>[r.id,r]));return d.map(r=>e.get(r)).filter(r=>r!==void 0)}function ca(){let o=0;return{next(){return o+=1,o},isCurrent(d){return d===o}}}var mn=120,Na=[["oom","\u88AB OOM \u6740",0],["dead","\u50F5\u6B7B",1],["unhealthy","\u4E0D\u5065\u5EB7",2],["restarting","\u53CD\u590D\u91CD\u542F",3],["exit-nonzero","\u975E\u96F6\u9000\u51FA",4]],Wr=o=>{let d=Na.find(([e])=>e===o);return d===void 0?o:d[1]},Kr=o=>{let d=Na.find(([e])=>e===o);return d===void 0?9:d[2]};function yn(o){let d=[];return o.health==="unhealthy"&&d.push("unhealthy"),o.state==="restarting"&&d.push("restarting"),o.state==="dead"&&d.push("dead"),o.state==="exited"&&typeof o.exitCode=="number"&&o.exitCode!==0&&d.push("exit-nonzero"),d}function Jr(o){let d=s=>{if(typeof s!="string"||s==="")return"";let T=Date.parse(s);return Number.isFinite(T)?new Date(T).toLocaleString():""},e=["\u6253\u5F00\u5BB9\u5668\u8BE6\u60C5"],r=d(o.finishedAt),C=d(o.startedAt);return r!==""?e.push("\u7ED3\u675F\u4E8E "+r):C!==""&&e.push("\u542F\u52A8\u4E8E "+C),typeof o.restartCount=="number"&&e.push("\u91CD\u542F\u6B21\u6570 "+String(o.restartCount)),typeof o.exitCode=="number"&&e.push("\u9000\u51FA\u7801 "+String(o.exitCode)),e.join(" \xB7 ")}function fn(o){return o.filter(d=>yn(d).length>0)}function Sa(o){let d=0,e=0,r=0;for(let C of o)C.state==="running"||C.state==="paused"||C.state==="restarting"?d+=1:e+=1,C.health==="unhealthy"&&(r+=1);return{running:d,stopped:e,unhealthy:r}}function Ca(o){let d=e=>{let r=Array.isArray(e.reasons)?e.reasons:[];return r.length===0?e.item.health==="unhealthy"?2:3:Math.min(...r.map(Kr))};return o.slice().sort((e,r)=>{let C=d(e)-d(r);return C!==0?C:e.targetIndex!==r.targetIndex?e.targetIndex-r.targetIndex:e.item.name===r.item.name?0:e.item.name<r.item.name?-1:1})}function Ta(o){let d=String(o??"").split(`
`)[0].trim();return d===""?"\u672A\u77E5\u9519\u8BEF":d.length>mn?d.slice(0,mn)+"\u2026":d}function yt(o,d,e){let r=!1,C=o.map(s=>s.name!==d?s:(r=!0,{...s,...e}));return r?C:o}function ua(o){let d=o.map(r=>{let C=Sa(r.containers),s=fn(r.containers),T=Array.isArray(r.attention)?r.attention.length:null;return{name:r.name,kind:r.kind==="ssh"?"ssh":"local",label:typeof r.label=="string"?r.label:"",error:r.error===""?"":Ta(r.error),loaded:r.loaded===!0,running:C.running,stopped:C.stopped,unhealthy:C.unhealthy,attention:T===null?s.length:T,attentionApprox:T===null}}),e=[];return o.forEach((r,C)=>{if(Array.isArray(r.attention)){for(let s of r.attention)e.push({target:r.name,targetIndex:C,item:s,reasons:Array.isArray(s.reasons)?s.reasons:[]});return}for(let s of fn(r.containers))e.push({target:r.name,targetIndex:C,item:s,reasons:yn(s)})}),{cards:d,rows:Ca(e),unreachable:d.filter(r=>r.error!==""),loading:o.some(r=>r.loaded!==!0)}}var ka=50,ga=8,ha=500;function pa(o,d,e){let r=[d,...o];return r.length>e?r.slice(0,e):r}function ma(o){if(typeof o!="number"||!Number.isFinite(o))return"--:--:--";let d=new Date(o*1e3);if(Number.isNaN(d.getTime()))return"--:--:--";let e=r=>String(r).padStart(2,"0");return e(d.getHours())+":"+e(d.getMinutes())+":"+e(d.getSeconds())}function fa(o){let d=typeof o.action=="string"?o.action:"";return d===""?"?":d.indexOf("die")!==0||o.exitCode===null||o.exitCode===void 0?d:d+"("+String(o.exitCode)+")"}function va(o,d){let e=null;return{schedule(){e!==null&&clearTimeout(e),e=setTimeout(()=>{e=null,d()},o)},cancel(){e!==null&&(clearTimeout(e),e=null)}}}window.__ModuleLoader__.load({id:"@hyzyn/dsh-docker",factory:o=>{let d=o("react"),{jsx:e,jsxs:r}=o("react/jsx-runtime"),{createRoot:C}=o("react-dom/client"),{useState:s,useEffect:T,useRef:R,useCallback:ie}=d;function et(t,n,i){if(n==="")return t;let l=t.toLowerCase(),p=n.toLowerCase(),k=[],f=0,u=l.indexOf(p),v=0;for(;u>=0&&v<500;)u>f&&k.push(t.slice(f,u)),k.push(e("mark",{children:t.slice(u,u+p.length)},i+"-m"+String(v))),f=u+p.length,v+=1,u=l.indexOf(p,f);return f<t.length&&k.push(t.slice(f)),k}function xn(t){let n=Array.isArray(t.rows)?t.rows:[],i=Array.isArray(t.mono)?t.mono:[];return r("div",{className:"dk_kv",children:n.flatMap(([l,p],k)=>[e("div",{className:"dk_kvKey",children:l},"k"+String(k)),e("div",{className:"dk_kvVal"+(i.indexOf(l)>=0?" dk_kvValMono":""),children:p},"v"+String(k))])})}function lt(t){let n=t.health==="unhealthy"?"unhealthy":t.state,i=t.health==="unhealthy"?"\u4E0D\u5065\u5EB7":Or(t.state);return e("span",{className:"dk_badge","data-state":n,title:t.status??"",children:i})}function Y(t){return r("div",{className:"dk_banner","data-kind":t.kind??"error",children:[e("span",{className:"dk_bannerIcon",dangerouslySetInnerHTML:{__html:Ar}},"icon"),r("div",{className:"dk_bannerBody",children:[e("div",{children:t.title}),t.hint===void 0?null:e("div",{className:"dk_hint",style:{marginTop:4},children:t.hint})]},"body"),t.action===void 0?null:e("div",{className:"dk_bannerAction",children:t.action},"action")]})}function xt(t,n,i){return r("span",{className:"dk_ovCount","data-state":t,"data-zero":i===0?"1":void 0,children:[e("span",{className:"dk_ovCountValue",children:String(i)}),e("span",{className:"dk_ovCountLabel",children:n})]},t)}function wn(t,n){if(t.cards.length===0)return r("div",{className:"dk_empty",children:[e("div",{className:"dk_emptyTitle",children:"\u8FD8\u6CA1\u6709\u914D\u7F6E Docker \u76EE\u6807"}),e("div",{className:"dk_emptyHint",children:"\u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6DFB\u52A0\u76EE\u6807\u540E\uFF0C\u603B\u89C8\u4F1A\u5728\u8FD9\u91CC\u4E00\u5C4F\u6C47\u603B\u5168\u90E8\u4E3B\u673A\u3002"})]});let i=t.rows.length===0?t.loading?r("div",{className:"dk_empty dk_ovEmpty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]},"loading"):r("div",{className:"dk_empty dk_ovEmpty",children:[e("div",{className:"dk_emptyTitle",children:"\u4E00\u5207\u6B63\u5E38"}),e("div",{className:"dk_emptyHint",children:"\u6240\u6709\u76EE\u6807\u4E0A\u90FD\u6CA1\u6709\u9700\u8981\u5173\u6CE8\u7684\u5BB9\u5668\uFF08\u4E0D\u5065\u5EB7 / \u53CD\u590D\u91CD\u542F / \u88AB OOM \u6740 / \u975E\u96F6\u9000\u51FA / \u50F5\u6B7B\uFF09\u3002"})]},"empty"):e("div",{className:"dk_tableWrap",children:r("table",{className:"dk_images dk_ovTable",children:[e("thead",{children:r("tr",{children:[e("th",{children:"\u5BB9\u5668\u540D"}),e("th",{children:"\u76EE\u6807"}),e("th",{children:"\u72B6\u6001"}),e("th",{children:"\u539F\u56E0"}),e("th",{children:"\u955C\u50CF"})]})}),e("tbody",{children:t.rows.map(l=>r("tr",{className:"dk_rowClickable",title:Jr(l.item),onClick:()=>n.onOpenContainer(l.target,l.item),children:[e("td",{className:"dk_mono",title:l.item.name,children:l.item.name}),e("td",{children:l.target}),e("td",{children:e(lt,{state:l.item.state,health:l.item.health,status:l.item.status})}),e("td",{children:e("span",{className:"dk_reasons",children:(l.reasons??[]).map(p=>e("span",{className:"dk_reason","data-reason":p,children:Wr(p)},p))})}),e("td",{className:"dk_mono dk_pathCell",title:l.item.image,children:l.item.image})]},l.target+"\0"+l.item.id))})]})},0);return r("div",{className:"dk_imagesView dk_ovView",children:[t.unreachable.length===0?null:e(Y,{title:String(t.unreachable.length)+" \u4E2A\u76EE\u6807\u4E0D\u53EF\u8FBE",hint:t.unreachable.map(l=>l.name+"\uFF1A"+l.error).join("\uFF1B")+"\uFF08\u5176\u4F59\u76EE\u6807\u7684\u6B63\u5E38\u7ED3\u679C\u4E0D\u53D7\u5F71\u54CD\uFF09"},"unreachable"),e("div",{className:"dk_ovCards",children:t.cards.map(l=>r("button",{type:"button",className:"dk_ovCard","data-state":l.error!==""?"error":l.loaded===!0?"ok":"loading",title:l.error===""?"\u5207\u5230\u8BE5\u76EE\u6807\u7684\u5BB9\u5668\u5217\u8868":l.error,onClick:()=>n.onOpenTarget(l.name),children:[r("div",{className:"dk_ovCardHead",children:[e("span",{className:"dk_ovCardName",title:l.label===""?l.name:l.label,children:l.name}),e("span",{className:"dk_badge","data-state":"paused",children:l.kind==="local"?"\u672C\u673A":"SSH"})]},"head"),l.error===""?l.loaded===!0?r("div",{className:"dk_ovCardCounts",children:[xt("running","\u8FD0\u884C\u4E2D",l.running),xt("stopped","\u5DF2\u505C\u6B62",l.stopped),xt("unhealthy","\u4E0D\u5065\u5EB7",l.unhealthy),xt("attention",l.attentionApprox?"\u9700\u5173\u6CE8\uFF08\u7C97\u5224\uFF09":"\u9700\u5173\u6CE8",l.attention)]},"counts"):r("div",{className:"dk_ovCardLoading",children:[e("span",{className:"dk_spin"}),e("span",{children:"\u8BFB\u53D6\u4E2D\u2026"})]},"loading"):r("div",{className:"dk_ovCardError",children:[e("span",{className:"dk_badge","data-state":"dead",children:"\u4E0D\u53EF\u8FBE"}),e("span",{className:"dk_ovCardErrorText",title:l.error,children:l.error})]},"error")]},l.name))},1),e("div",{className:"dk_ovSection",children:t.rows.length===0?"\u9700\u5173\u6CE8\u5BB9\u5668":"\u9700\u5173\u6CE8\u5BB9\u5668\uFF08"+String(t.rows.length)+"\uFF09"},2),i]})}function it(t){let n=t.busy===!0;return r("div",{className:"dk_confirmBackdrop",onMouseDown:i=>i.stopPropagation(),children:[r("div",{className:"dk_confirm","data-busy":n?"1":void 0,children:[e("div",{className:"dk_confirmTitle",children:t.title}),e("div",{className:"dk_confirmText",children:t.text}),r("div",{className:"dk_confirmActions",children:[e("button",{type:"button",className:"dk_btn",disabled:n,onClick:t.onCancel,children:"\u53D6\u6D88"}),e("button",{type:"button",className:"dk_btn dk_btnDanger",disabled:n,"aria-busy":n?"true":void 0,onClick:t.onConfirm,children:n?r("span",{className:"dk_confirmBusy",children:[e("span",{className:"dk_spin"}),"\u6267\u884C\u4E2D\u2026"]}):t.confirmLabel})]})]})]})}function Ur(t){return e("button",{type:"button",className:"dk_btn"+(t.danger===!0?" dk_btnDanger":""),disabled:t.disabled===!0,title:t.title??"",onClick:n=>{n.stopPropagation(),t.onClick()},children:t.children})}let Nn=60;function Sn(t,n,i){let l=t.concat([n]);return l.length>i?l.slice(l.length-i):l}function Cn(t){let n=Array.isArray(t.values)?t.values:[],i=n.filter(m=>typeof m=="number"&&Number.isFinite(m)),l=96,p=22,k=Math.max(Number(t.max)||0,...i,1),f=n.length>1?l/(n.length-1):0,u=[];n.forEach((m,O)=>{if(typeof m!="number"||!Number.isFinite(m))return;let D=f===0?l:O*f,M=p-Math.min(1,Math.max(0,m/k))*p;u.push(D.toFixed(1)+","+M.toFixed(1))});let v=i.length===0?null:i[i.length-1],S=t.alertAt!==void 0&&v!==null&&v>=t.alertAt;return e("span",{className:"dk_spark","data-alert":S?"1":void 0,title:t.title??"",children:u.length<2?e("span",{className:"dk_sparkEmpty",children:"\u91C7\u6837\u4E2D\u2026"}):e("svg",{viewBox:"0 0 "+String(l)+" "+String(p),preserveAspectRatio:"none","aria-hidden":"true",children:e("polyline",{points:u.join(" "),fill:"none",stroke:"currentColor","stroke-width":"1.4","stroke-linejoin":"round","stroke-linecap":"round","vector-effect":"non-scaling-stroke"})})})}function dt(t){return r("div",{className:"dk_cardRow",children:[e("span",{className:"dk_cardLabel",children:t.label}),e("span",{className:"dk_cardValue",title:String(t.value),children:t.value})]})}function $(t){let n=t.disabled===!0,i=t.busy===!0;return e("button",{type:"button",className:"dk_iconBtn"+(t.danger===!0?" dk_iconBtnDanger":""),"data-on":t.on===!0?"1":void 0,"data-spin":t.spin===!0?"1":void 0,"data-busy":i?"1":void 0,"aria-busy":i?"true":void 0,disabled:n,title:t.title,"aria-label":t.title,onClick:l=>{l.stopPropagation(),!n&&t.onClick()},children:i?e("span",{className:"dk_spin"}):e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:t.icon}})})}function La(t){let n=t.item,i=t.pickMode===!0,l=t.picked===!0,p=t.allowMutations!==!0,k=n.state==="running"||n.state==="paused"||n.state==="restarting",f=n.createdAt===null?n.runningFor===""?"\u2014":n.runningFor:_t(n.createdAt),u=typeof t.pending=="string"?t.pending:"",v=u!=="",S=O=>v?"\u6B63\u5728\u6267\u884C "+u+"\u2026\u8BF7\u7A0D\u5019":p?"\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D":O,m=()=>{if(i){t.onTogglePick(n);return}t.onOpen(n,"overview")};return r("div",{className:"dk_card",role:i?"checkbox":"button","aria-checked":i?l?"true":"false":void 0,tabIndex:0,"data-selected":t.selected===!0?"1":"0","data-pick":i?"1":void 0,"data-picked":l?"1":void 0,"data-pending":v?"1":void 0,onClick:m,onKeyDown:O=>{(O.key==="Enter"||O.key===" ")&&(O.preventDefault(),m())},children:[r("div",{className:"dk_cardHead",children:[i?e("span",{className:"dk_pick","data-on":l?"1":"0","aria-hidden":"true"},"pick"):null,e("span",{className:"dk_cardName",title:n.name,children:n.name}),e(lt,{state:n.state,health:n.health,status:n.status})]},"head"),r("div",{className:"dk_cardRows",children:[e(dt,{label:"\u955C\u50CF",value:n.image},"image"),e(dt,{label:"ID",value:n.shortId},"id"),e(dt,{label:"\u7AEF\u53E3",value:Ft(n.ports)},"ports"),e(dt,{label:"\u521B\u5EFA",value:f},"created"),n.composeProject===null?null:e(dt,{label:"compose",value:n.composeProject+(n.composeService===null?"":"/"+n.composeService)},"compose")]},"rows"),i?null:r("div",{className:"dk_actionBar",children:[e($,{icon:ta,title:"\u5728\u5BB9\u5668\u5185\u6253\u5F00\u4EA4\u4E92\u5F0F\u7EC8\u7AEF\uFF08docker exec -it "+n.name+" sh\uFF09",onClick:()=>t.onExec(n)},"exec"),e($,{icon:na,title:"\u67E5\u770B\u65E5\u5FD7",onClick:()=>t.onOpen(n,"logs")},"logs"),e($,{icon:jr,title:"\u8D44\u6E90\u5360\u7528",onClick:()=>t.onOpen(n,"stats")},"stats"),e("span",{className:"dk_actionBarSep","aria-hidden":"true"},"sep"),e($,{icon:k?Br:Mr,title:S(k?"\u505C\u6B62\u5BB9\u5668":"\u542F\u52A8\u5BB9\u5668"),disabled:p||v,busy:u===(k?"stop":"start"),onClick:()=>t.onAction(k?"stop":"start",n)},"power"),e($,{icon:Pr,title:S("\u91CD\u542F\u5BB9\u5668"),disabled:p||v,busy:u==="restart",onClick:()=>t.onAction("restart",n)},"restart"),e($,{icon:Wt,danger:!0,title:S("\u5220\u9664\u5BB9\u5668\uFF08\u4E0D\u53EF\u6062\u590D\uFF09"),disabled:p||v,busy:u==="remove",onClick:()=>t.onAction("remove",n)},"remove")]},"actions")]})}let Ea=/^\s*(\[\d{4}-\d{2}-\d{2}[ T][0-9:.,]+\]|\d{2}:\d{2}:\d{2}[,.]\d{3})/,Tn=/^\s*(\[(?:TRACE|DEBUG|INFO|WARN|ERROR|FATAL)\]|\|\s*(?:TRACE|DEBUG|INFO|WARN|ERROR|FATAL))/,Ln=/(TRACE|DEBUG|INFO|WARN|ERROR|FATAL)/,st=2e3,Le=5e3;function En(t,n,i){let l=[],p=t;for(let k=0;k<2;k+=1){let f=Ea.exec(p);if(f!==null){l.push(e("span",{className:"dk_logTs",children:f[1]},"ts"+String(k))),p=p.slice(f[0].length);continue}let u=Tn.exec(p);if(u!==null){let v=Ln.exec(u[1]);l.push(e("span",{className:"dk_logLevel","data-level":v===null?"":v[1],children:u[1].trim()},"lv"+String(k))),p=p.slice(u[0].length);continue}break}return l.push(e("span",{className:"dk_logText",children:et(p,i,"x"+String(n))},"tx")),l}function Oa(t,n,i){return r("div",{className:"dk_logLine",children:En(t,n,i)},String(n))}function Ia(t,n,i,l){let p=l===!0&&typeof t.ts=="number"&&Number.isFinite(t.ts)?e("span",{className:"dk_logTs",children:new Date(t.ts).toLocaleTimeString()},"ts"):null;return r("div",{className:"dk_logLine",children:[e("span",{className:"dk_logSvc",children:"["+t.service+"]"},"svc"),p,...En(t.text,n,i)]},String(n))}function Ra(t){let n=t.item,i=t.config,[l,p]=s(t.initialTab??"overview"),[k,f]=s(null),[u,v]=s(""),[S,m]=s({tail:i.logTailDefault,timestamps:!1}),[O,D]=s(null),[M,U]=s(""),[te,b]=s(!1),[P,L]=s(""),[A,N]=s(!1),[Z,g]=s(3),[h,w]=s(!1),[K,q]=s([]),[G,ne]=s(""),[ye,xe]=s(""),[Pe,me]=s(""),[Ee,nt]=s(!1),[De,ke]=s(!0),I=R([]),de=R(""),J=R(null),[ee,Ae]=s(null),[ve,we]=s(""),[Se,ce]=s(!1),[ae,B]=s(""),[fe,le]=s(""),[ge,Oe]=s({cpu:[],mem:[]}),Ce=R({cpu:[],mem:[]}),[at,rt]=s(""),[je,ot]=s(null),[Nt,St]=s(""),[kt,Ve]=s(!1);T(()=>{let _=!0;return f(null),v(""),X.inspect(t.target,n.id).then(E=>{_&&f(E.details?.[0]??null)}).catch(E=>{_&&v(E.message)}),()=>{_=!1}},[t.target,n.id,t.refreshToken]);let he=ie(()=>{b(!0),U(""),X.logs(t.target,n.id,{tail:S.tail,timestamps:S.timestamps}).then(_=>D(_.logs)).catch(_=>U(_.message)).finally(()=>b(!1))},[t.target,n.id,S.tail,S.timestamps]);T(()=>{l==="logs"&&he()},[l,he,t.refreshToken]),T(()=>{if(l!=="logs"||!A||h)return;let _=setInterval(he,Math.max(1,Z)*1e3);return()=>clearInterval(_)},[l,A,Z,he,h]),T(()=>{if(l!=="logs"||!h)return;if(typeof EventSource!="function"){xe("\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301 EventSource\uFF0C\u65E0\u6CD5\u5B9E\u65F6\u8DDF\u968F"),w(!1);return}I.current=[],de.current="",q([]),nt(!1),xe(""),me(""),ke(!0),ne("connecting");let _=new URLSearchParams({target:t.target,id:n.id,tail:String(S.tail),...S.timestamps?{timestamps:"1"}:{}}),E=new EventSource(vn+"/logs/stream?"+_.toString()),y=!1,W=()=>{if(!y){y=!0;try{E.close()}catch{}}},j=H=>{if(H==="")return;let z=(de.current+H).split(`
`);if(de.current=z.pop()??"",z.length===0)return;let ue=I.current.concat(z),Ke=ue.length>Le?ue.slice(ue.length-Le):ue;I.current=Ke,Ke.length!==ue.length&&nt(!0),q(Ke)},F=H=>{let z=null;try{z=JSON.parse(H.data)}catch{return}z===null||typeof z!="object"||(typeof z.d=="string"?j(z.d):typeof z.e=="string"&&j(z.e))},se=H=>{let z=null;try{z=JSON.parse(H.data)}catch{}let ue=z!==null&&typeof z.reason=="string"?z.reason:"container-exit",Ke=z!==null&&typeof z.code=="number"?z.code:null;if(ue==="container-exit"){me("\u5BB9\u5668\u5DF2\u9000\u51FA"+(Ke===null?"":"\uFF08\u9000\u51FA\u7801 "+String(Ke)+"\uFF09")+"\uFF0C\u65E5\u5FD7\u6D41\u7ED3\u675F\uFF0C\u5DF2\u5207\u56DE\u5FEB\u7167"),W(),w(!1),he();return}ne("reconnecting"),me("\u670D\u52A1\u7AEF\u5DF2\u505C\u6B62\u65E5\u5FD7\u6D41\uFF0C\u6B63\u5728\u91CD\u8FDE\u2026")},V=H=>{if(typeof H.data=="string"&&H.data!==""){let z="\u65E5\u5FD7\u6D41\u5F02\u5E38";try{let ue=JSON.parse(H.data);ue!==null&&typeof ue.message=="string"&&(z=ue.message)}catch{}xe(z),W(),w(!1),he();return}ne(E.readyState===2?"closed":"reconnecting")};return E.addEventListener("line",F),E.addEventListener("end",se),E.addEventListener("error",V),E.onopen=()=>{ne("open"),me("")},W},[l,h,t.target,n.id,S.tail,S.timestamps,he]),T(()=>{if(l!=="logs"||!h||!De)return;let _=J.current;_!==null&&(_.scrollTop=_.scrollHeight)},[l,h,De,K]);let Ct=()=>{if(h){w(!1),ne(""),he();return}w(!0),N(!1),xe(""),me("")},en=()=>{if(Se){ce(!1),B("");return}ce(!0),le(""),we("")},gt=()=>ae==="open"?"\u5B9E\u65F6\u8DDF\u968F\u4E2D\uFF08docker stats\uFF09":ae==="connecting"?"\u6B63\u5728\u8FDE\u63A5\u7EDF\u8BA1\u6D41\u2026":ae==="reconnecting"?"\u8FDE\u63A5\u4E2D\u65AD\uFF0C\u6B63\u5728\u81EA\u52A8\u91CD\u8FDE\u2026":ae==="closed"?"\u7EDF\u8BA1\u6D41\u5DF2\u65AD\u5F00":"\u7EDF\u8BA1\u6D41",Tt=()=>{let _=J.current;_!==null&&(_.scrollTop=_.scrollHeight),ke(!0)},We=_=>{if(!h)return;let E=_.currentTarget;ke(E.scrollHeight-E.scrollTop-E.clientHeight<24)},He=()=>G==="open"?"\u5B9E\u65F6\u8DDF\u968F\u4E2D\uFF08docker logs -f\uFF09":G==="connecting"?"\u6B63\u5728\u8FDE\u63A5\u65E5\u5FD7\u6D41\u2026":G==="reconnecting"?"\u8FDE\u63A5\u4E2D\u65AD\uFF0C\u6B63\u5728\u81EA\u52A8\u91CD\u8FDE\u2026":G==="closed"?"\u65E5\u5FD7\u6D41\u5DF2\u65AD\u5F00":"\u65E5\u5FD7\u6D41";T(()=>{if(l!=="stats"||Se)return;let _=!0,E=()=>{X.stats(t.target,[n.id]).then(W=>{_&&(Ae(W.stats?.[0]??null),we(""))}).catch(W=>{_&&we(W.message)})};E();let y=setInterval(E,Math.max(2,i.pollIntervalSec)*1e3);return()=>{_=!1,clearInterval(y)}},[l,Se,t.target,n.id,i.pollIntervalSec,t.refreshToken]),T(()=>{if(l!=="stats"||!Se)return;if(typeof EventSource!="function"){le("\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301 EventSource\uFF0C\u65E0\u6CD5\u5B9E\u65F6\u8DDF\u968F"),ce(!1);return}Ce.current={cpu:[],mem:[]},Oe({cpu:[],mem:[]}),B("connecting"),le(""),we("");let _=new EventSource(zt("/stats/stream",{target:t.target,ids:n.id})),E=!1,y=()=>{if(!E){E=!0;try{_.close()}catch{}}},W=se=>{let V=null;try{V=JSON.parse(se.data)}catch{return}if(V===null||typeof V!="object")return;let H=typeof V.cpuPercent=="number"?V.cpuPercent:null,z=typeof V.memPercent=="number"?V.memPercent:null;Ae(V),we("");let ue={cpu:H===null?Ce.current.cpu:Sn(Ce.current.cpu,H,Nn),mem:z===null?Ce.current.mem:Sn(Ce.current.mem,z,Nn)};Ce.current=ue,Oe(ue)},j=se=>{let V=null;try{V=JSON.parse(se.data)}catch{}let H=V!==null&&typeof V.reason=="string"?V.reason:"stats-exit",z=V!==null&&typeof V.code=="number"?V.code:null;le("\u7EDF\u8BA1\u6D41\u5DF2\u7ED3\u675F"+(H==="stats-exit"?"\uFF08docker stats \u9000\u51FA"+(z===null?"":"\uFF0C\u9000\u51FA\u7801 "+String(z))+"\uFF09":"")+"\uFF0C\u5DF2\u5207\u56DE\u5FEB\u7167\u8F6E\u8BE2"),y(),ce(!1)},F=se=>{if(typeof se.data=="string"&&se.data!==""){let V="\u7EDF\u8BA1\u6D41\u5F02\u5E38";try{let H=JSON.parse(se.data);H!==null&&typeof H.message=="string"&&(V=H.message)}catch{}we(V),y(),ce(!1);return}B(_.readyState===2?"closed":"reconnecting")};return _.addEventListener("stats",W),_.addEventListener("end",j),_.addEventListener("error",F),_.onopen=()=>{B("open"),le("")},y},[l,Se,t.target,n.id]);let Lt=()=>{at.trim()!==""&&(Ve(!0),St(""),ot(null),X.exec(t.target,n.id,at,i.execTimeoutSec).then(_=>ot(_.result)).catch(_=>St(_.message)).finally(()=>Ve(!1)))},Et=()=>{if(u!=="")return e(Y,{title:"\u8BFB\u53D6\u5BB9\u5668\u8BE6\u60C5\u5931\u8D25",hint:u});if(k===null)return e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]});let _=[["\u72B6\u6001",k.state+(k.health===null?"":" / "+k.health)+(k.status===""?"":"\uFF08"+k.status+"\uFF09")],["\u955C\u50CF",k.image],["\u5BB9\u5668 ID",k.shortId],["\u542F\u52A8\u65F6\u95F4",k.startedAt??"\u2014"],["\u7ED3\u675F\u65F6\u95F4",k.finishedAt??"\u2014"],["\u9000\u51FA\u7801",k.exitCode===null?"\u2014":String(k.exitCode)],["\u91CD\u542F\u6B21\u6570",k.restartCount===null?"\u2014":String(k.restartCount)],["\u91CD\u542F\u7B56\u7565",k.restartPolicy??"\u2014"],["PID",k.pid===null?"\u2014":String(k.pid)],["\u7AEF\u53E3",k.ports.length===0?"\u2014":Ft(k.ports)],["\u6302\u8F7D",k.mounts.length===0?"\u2014":k.mounts.map(y=>y.source+"\u2192"+y.destination+(y.readWrite?"":"\uFF08\u53EA\u8BFB\uFF09")).join(`
`)],["\u7F51\u7EDC",k.networks.length===0?"\u2014":k.networks.map(y=>y.name+(y.ip===null?"":"\uFF08"+y.ip+"\uFF09")).join(", ")],["\u547D\u4EE4",(k.entrypoint+" "+k.command).trim()||"\u2014"],["\u5DE5\u4F5C\u76EE\u5F55",k.workingDir===""?"\u2014":k.workingDir],["\u7528\u6237",k.user===""?"\u2014":k.user]],E=r("div",{className:"dk_kv",children:_.flatMap(([y,W],j)=>[e("div",{className:"dk_kvKey",children:y},"k"+String(j)),e("div",{className:"dk_kvVal"+(y==="\u5BB9\u5668 ID"||y==="\u547D\u4EE4"||y==="\u955C\u50CF"?" dk_kvValMono":""),children:W},"v"+String(j))])});return r("div",{children:[k.healthLogTail===null?null:e("div",{className:"dk_hint",style:{marginBottom:8},children:"\u6700\u8FD1\u5065\u5EB7\u68C0\u67E5\u8F93\u51FA\uFF1A"+k.healthLogTail}),E,e("div",{className:"dk_cardSection",style:{marginTop:16},children:"\u4E00\u6B21\u6027\u547D\u4EE4\uFF08docker exec\uFF09"}),i.allowExec!==!0?e(Y,{kind:"info",title:"exec \u672A\u542F\u7528",hint:"\u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6253\u5F00\u300C\u5141\u8BB8 exec\u300D\uFF0C\u6216\u76F4\u63A5\u590D\u5236\u5361\u7247\u4E0A\u7684 exec \u547D\u4EE4\u5230\u7EC8\u7AEF\u9762\u677F\u4EA4\u4E92\u5F0F\u8FDB\u5165\u5BB9\u5668\u3002"}):r("div",{children:[r("div",{className:"dk_row",children:[e("input",{className:"dk_input",style:{flex:"1 1 auto"},placeholder:"\u5982 ls -la /app \u6216 cat /etc/nginx/nginx.conf",value:at,onChange:y=>rt(y.target.value),onKeyDown:y=>{y.key==="Enter"&&Lt()}}),e("button",{type:"button",className:"dk_btn dk_btnPrimary",disabled:kt,onClick:Lt,children:kt?"\u6267\u884C\u4E2D\u2026":"\u6267\u884C"})]}),Nt===""?null:e(Y,{title:"\u6267\u884C\u5931\u8D25",hint:Nt}),je===null?null:r("div",{style:{marginTop:8},children:[e("div",{className:"dk_hint",children:"\u9000\u51FA\u7801 "+(je.code===null?"?":String(je.code))+" \xB7 \u8017\u65F6 "+String(je.durationMs)+"ms"+(je.truncated?" \xB7 \u8F93\u51FA\u5DF2\u622A\u65AD":"")}),e("pre",{className:"dk_logBox",style:{marginTop:6},children:(je.stdout||"")+(je.stderr===""?"":`
[stderr]
`+je.stderr)||"(\u65E0\u8F93\u51FA)"})]})]})]})},be=()=>{let _=h?K.join(`
`):O!==null&&typeof O=="object"&&typeof O.text=="string"?O.text:"",E=P.trim().toLowerCase(),y=_===""?[]:_.split(`
`),W=E===""?y:y.filter(j=>j.toLowerCase().includes(E));return{raw:_,needle:E,allLines:y,matchedLines:W}},Ne=(_,E,y,W)=>e("button",{type:"button",className:"dk_pill"+(W?.className??""),"data-on":_?"1":"0",disabled:W?.disabled===!0,title:W?.title??"",onClick:y,children:E}),Ot=()=>{let{raw:_}=be(),E=[...new Set([100,200,500,1e3,5e3,Number(i.logTailDefault)||200,Number(S.tail)||200])].filter(y=>Number.isInteger(y)&&y>0).sort((y,W)=>y-W);return r("div",{className:"dk_logTools",children:[e("span",{className:"dk_toolLabel",children:"LINES"}),e("select",{className:"dk_select dk_selectSm",value:String(S.tail),onChange:y=>m({...S,tail:Number(y.target.value)}),children:E.map(y=>e("option",{value:String(y),children:y===5e3?"Last 5000":"Last "+String(y)},String(y)))}),e("span",{className:"dk_toolLabel",children:"TIMESTAMPS"}),Ne(S.timestamps,S.timestamps?"On":"Off",()=>m({...S,timestamps:!S.timestamps})),e("span",{className:"dk_toolLabel",children:"FOLLOW"}),Ne(h,h?"On":"Off",Ct,{className:" dk_pillFollow",title:h?"\u5173\u95ED\u5B9E\u65F6\u8DDF\u968F\uFF08\u56DE\u5230\u65E5\u5FD7\u5FEB\u7167\uFF09":"\u5B9E\u65F6\u8DDF\u968F\u5BB9\u5668\u65E5\u5FD7\uFF08docker logs -f\uFF09"}),e("span",{className:"dk_toolLabel",children:"AUTO REFRESH"}),Ne(A,A?"On":"Off",()=>N(y=>!y),{disabled:h,title:h?"FOLLOW \u6253\u5F00\u65F6\u6682\u505C\u8F6E\u8BE2":"\u6309\u4E0B\u65B9\u95F4\u9694\u91CD\u65B0\u62C9\u53D6\u65E5\u5FD7\u5FEB\u7167"}),e("select",{className:"dk_select dk_selectSm",value:String(Z),disabled:h,title:"\u81EA\u52A8\u5237\u65B0\u95F4\u9694\uFF08\u5F00\u542F AUTO REFRESH \u540E\u6309\u6B64\u8F6E\u8BE2\uFF09",onChange:y=>g(Number(y.target.value)),children:[2,3,5,10].map(y=>e("option",{value:String(y),children:String(y)+"s"},String(y)))}),e($,{icon:Xe,title:"\u5237\u65B0\u65E5\u5FD7",spin:te,onClick:he},"refresh"),e($,{icon:Dr,title:"\u4E0B\u8F7D\u65E5\u5FD7",disabled:_==="",onClick:()=>$n(n.name+".log",_)},"download")]})},It=()=>{let{needle:_,allLines:E,matchedLines:y}=be();return r("div",{className:"dk_filterBar",children:[r("div",{className:"dk_filterWrap",children:[e("input",{className:"dk_input dk_filterInput",placeholder:"\u8FC7\u6EE4\u65E5\u5FD7\u2026",value:P,onChange:W=>L(W.target.value),onKeyDown:W=>{W.key==="Escape"&&P!==""&&(W.stopPropagation(),L(""))}}),P===""?null:e("button",{type:"button",className:"dk_filterClear",title:"\u6E05\u7A7A\u8FC7\u6EE4","aria-label":"\u6E05\u7A7A\u8FC7\u6EE4",onClick:()=>L(""),children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Be}})},"clear")]}),e("span",{className:"dk_filterCount",children:_===""?String(E.length)+" \u884C":String(y.length)+" / "+String(E.length)+" \u884C\u5339\u914D"})]})},Rt=()=>{let{needle:_,matchedLines:E}=be(),y=E.length>st?E.slice(-st):E;return r("div",{className:"dk_logs",children:[M===""?null:e(Y,{title:"\u8BFB\u53D6\u65E5\u5FD7\u5931\u8D25",hint:M+(M.includes("Failed to fetch")?"\uFF08\u7F51\u7EDC\u8BF7\u6C42\u6CA1\u5230\u5BBF\u4E3B\uFF1A\u5BBF\u4E3B\u53EF\u80FD\u521A\u91CD\u542F\u3001\u6216\u8FDE\u63A5\u88AB\u4E2D\u65AD\uFF09":""),action:e("button",{type:"button",className:"dk_btn",disabled:te,onClick:he,children:"\u91CD\u8BD5"})}),ye===""?null:e(Y,{title:"\u65E5\u5FD7\u6D41\u4E2D\u65AD",hint:ye,action:e("button",{type:"button",className:"dk_btn",onClick:Ct,children:"\u91CD\u8BD5"})}),Pe===""?null:e(Y,{kind:"info",title:Pe}),Ee?e(Y,{kind:"warn",title:"\u65E5\u5FD7\u8D85\u8FC7 "+String(Le)+" \u884C\uFF0C\u5DF2\u4E22\u5F03\u6700\u65E9\u5185\u5BB9",hint:"\u6D41\u5F0F\u65E5\u5FD7\u53EA\u4FDD\u7559\u6700\u8FD1\u7684\u884C\uFF1B\u9700\u8981\u5B8C\u6574\u5386\u53F2\u8BF7\u7528\u5FEB\u7167\u6216\u300C\u4E0B\u8F7D\u65E5\u5FD7\u300D\u3002"}):null,!h&&O!==null&&O.truncated===!0?e(Y,{kind:"warn",title:"\u65E5\u5FD7\u8F93\u51FA\u8D85\u8FC7\u4E0A\u9650\uFF0C\u5DF2\u622A\u65AD",hint:"\u8C03\u5C0F\u300CLINES\u300D\u6216\u5230\u8BBE\u7F6E\u5361\u7247\u8C03\u5927\u300C\u5355\u6B21\u547D\u4EE4\u8F93\u51FA\u4E0A\u9650\u300D\u3002"}):null,h?e("div",{className:"dk_followState","data-state":G,children:He()}):null,r("div",{className:"dk_logBody",ref:J,onScroll:We,children:[E.length>y.length?e("div",{className:"dk_logLine dk_logMore",children:"\uFF08\u53EA\u663E\u793A\u6700\u8FD1 "+String(st)+" \u884C\uFF0C\u5171 "+String(E.length)+" \u884C\u5339\u914D\uFF09"},"more"):null,M!==""?null:!h&&O===null?e("div",{className:"dk_logLine",children:"\u8BFB\u53D6\u4E2D\u2026"},"loading"):y.length===0?e("div",{className:"dk_logLine",children:h?"\u7B49\u5F85\u65E5\u5FD7\u2026":_===""?"(\u65E0\u65E5\u5FD7)":"(\u65E0\u5339\u914D\u65E5\u5FD7)"},"empty"):y.map((W,j)=>Oa(W,j,_))]}),h&&!De?e("button",{type:"button",className:"dk_backToBottom",onClick:Tt,children:"\u56DE\u5230\u5E95\u90E8"}):null]})},qe=()=>{let _=Se,E=r("div",{className:"dk_statsBar",children:[e("span",{className:"dk_toolLabel",children:"FOLLOW"}),Ne(_,_?"On":"Off",en,{className:" dk_pillFollow",title:_?"\u5173\u95ED\u5B9E\u65F6\u8DDF\u968F\uFF08\u56DE\u5230 docker stats \u5FEB\u7167\uFF09":"\u5B9E\u65F6\u8DDF\u968F\u8D44\u6E90\u5360\u7528\uFF08docker stats \u6BCF\u79D2\u4E00\u884C\uFF09"}),e("span",{className:"dk_hint",children:_?"60 \u70B9 \u2248 \u6700\u8FD1 1 \u5206\u949F":"\u6253\u5F00 FOLLOW \u770B\u5B9E\u65F6\u8D8B\u52BF"}),e("span",{className:"dk_headerSpacer"}),_?e("span",{className:"dk_followState","data-state":ae,children:gt()}):null]}),y=H=>r("div",{className:"dk_statsView",children:[E,H]});if(fe!=="")return y(r("div",{children:[e(Y,{kind:"info",title:fe}),ve===""?null:e(Y,{title:"\u8BFB\u53D6\u7EDF\u8BA1\u5931\u8D25",hint:ve})]}));if(ve!=="")return y(e(Y,{title:"\u8BFB\u53D6\u7EDF\u8BA1\u5931\u8D25",hint:ve}));if(ee===null)return y(e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]}));let W=ee.cpuPercent??0,j=ee.memPercent??0,F=H=>r("div",{className:"dk_bar",children:[e("div",{className:"dk_barFill","data-warn":H>=60&&H<85?"1":void 0,"data-danger":H>=85?"1":void 0,style:{width:Math.min(100,Math.max(0,H))+"%"}})]}),se=Math.max(100,...ge.cpu),V=(H,z,ue)=>r("tr",{children:[e("td",{children:H}),e("td",{className:"dk_num",children:z}),e("td",{children:ue??null})]},H);return y(r("table",{className:"dk_stats",children:[e("thead",{children:r("tr",{children:[e("th",{children:"\u6307\u6807"}),e("th",{children:"\u6570\u503C"}),e("th",{children:"\u5360\u7528 / \u8D8B\u52BF"})]})}),e("tbody",{children:[V("CPU",Lr(ee.cpuPercent),r("div",{className:"dk_trend",children:[F(W),_||ge.cpu.length>0?e(Cn,{values:ge.cpu,max:se,alertAt:85,title:"CPU% \u6700\u8FD1 60 \u4E2A\u91C7\u6837"}):null]})),V("\u5185\u5B58",ee.memUsage,r("div",{className:"dk_trend",children:[F(j),_||ge.mem.length>0?e(Cn,{values:ge.mem,max:100,alertAt:85,title:"\u5185\u5B58\u5360\u7528% \u6700\u8FD1 60 \u4E2A\u91C7\u6837"}):null]})),V("\u7F51\u7EDC IO",ee.netIO,null),V("\u78C1\u76D8 IO",ee.blockIO,null),V("PIDs",ee.pids===null?"\u2014":String(ee.pids),null)]})]}))},Mt=[["overview","\u6982\u89C8"],["logs","\u65E5\u5FD7"],["stats","\u7EDF\u8BA1"]],tn=l==="overview"?k===null&&u==="":l==="stats"?ee===null&&ve==="":!1;return r("div",{className:"dk_detail",children:[r("div",{className:"dk_header dk_headerDetail",children:[e($,{icon:Ze,title:"\u8FD4\u56DE\u5BB9\u5668\u5217\u8868",onClick:t.onBack},"back"),e("span",{className:"dk_detailTitle",title:n.name,children:n.name}),e(lt,{state:n.state,health:n.health,status:n.status}),e("span",{className:"dk_detailSub",children:t.targetLabel??""}),e("span",{className:"dk_headerSpacer"}),l==="logs"?Ot():e($,{icon:Xe,title:"\u5237\u65B0",spin:tn,onClick:t.onRefresh},"refresh"),t.docked===!0?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:t.onClose,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Be}})},"close")]}),r("div",{className:"dk_tabs",children:[...Mt.map(([_,E])=>e("button",{type:"button",className:"dk_tab","data-on":l===_?"1":"0",onClick:()=>p(_),children:E},_)),l==="logs"?e("span",{className:"dk_headerSpacer"},"spacer"):null,l==="logs"?It():null]}),e("div",{className:"dk_detailBody",children:l==="overview"?Et():l==="logs"?Rt():qe()})]})}function qt(t){return t.dangling===!0?t.id:t.reference}function Ma(t){let n=t.item,i=qt(n),[l,p]=s("overview"),[k,f]=s(null),[u,v]=s(""),[S,m]=s(!1),O=ie(()=>{m(!0),v(""),X.imageInspect(t.target,i).then(b=>f(b.image)).catch(b=>v(b.message)).finally(()=>m(!1))},[t.target,i]);T(()=>{O()},[O]);let D=b=>r("div",{className:"dk_kv",children:b.flatMap(([P,L],A)=>[e("div",{className:"dk_kvKey",children:P},"k"+String(A)),e("div",{className:"dk_kvVal"+(["ID","\u5165\u53E3","digest"].indexOf(P)>=0?" dk_kvValMono":""),children:L},"v"+String(A))])}),M=()=>{if(u!=="")return e(Y,{title:"\u8BFB\u53D6\u955C\u50CF\u8BE6\u60C5\u5931\u8D25",hint:u,action:e("button",{type:"button",className:"dk_btn",onClick:O,children:"\u91CD\u8BD5"})});if(k===null)return e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]});let b=k.detail,P=[["\u6807\u7B7E",b.repoTags.length===0?"<none>\uFF08dangling\uFF09":b.repoTags.join(`
`)],["ID",b.id],["\u5927\u5C0F",b.size===null?"\u2014":Vt(b.size)],["\u542B\u7236\u5C42",b.virtualSize===null?"\u2014":Vt(b.virtualSize)],["\u521B\u5EFA",b.created===""?"\u2014":_t(b.created)],["\u5E73\u53F0",b.os===""&&b.architecture===""?"\u2014":b.os+"/"+b.architecture],["\u5C42\u6570",String(b.layerCount)],["\u5165\u53E3",(b.entrypoint+" "+b.command).trim()||"\u2014"],["\u5DE5\u4F5C\u76EE\u5F55",b.workingDir===""?"\u2014":b.workingDir],["\u7528\u6237",b.user===""?"\u2014":b.user],["\u66B4\u9732\u7AEF\u53E3",b.exposedPorts.length===0?"\u2014":b.exposedPorts.join(", ")],["digest",b.repoDigests.length===0?"\u2014":b.repoDigests.join(`
`)]],L=Object.entries(b.labels);return r("div",{children:[D(P),e("div",{className:"dk_cardSection",style:{marginTop:16},children:"\u5C42\uFF08"+String(b.layerCount)+"\uFF09"}),b.layers.length===0?e("span",{className:"dk_hint",children:"\u8BE5\u955C\u50CF\u6CA1\u6709\u5C42\u4FE1\u606F\uFF08scratch \u6784\u5EFA\u6216\u65E7\u7248 docker\uFF09\u3002"}):e("div",{className:"dk_layerList",children:b.layers.map((A,N)=>r("div",{className:"dk_layerItem",children:[e("span",{className:"dk_layerIndex",children:"#"+String(N)}),e("span",{className:"dk_mono dk_layerId",title:A,children:A.replace(/^sha256:/,"")})]},A+String(N)))}),L.length===0?null:r("div",{children:[e("div",{className:"dk_cardSection",style:{marginTop:16},children:"\u6807\u7B7E\uFF08"+String(L.length)+"\uFF09"}),e("div",{className:"dk_labelList",children:L.map(([A,N])=>r("div",{className:"dk_labelItem",children:[e("span",{className:"dk_labelKey",children:A}),e("span",{className:"dk_labelVal",title:N,children:N})]},A))})]})]})},U=()=>u!==""?e(Y,{title:"\u8BFB\u53D6\u955C\u50CF\u8BE6\u60C5\u5931\u8D25",hint:u}):k===null?e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]}):k.historyError!==null?e(Y,{kind:"warn",title:"\u8BFB\u53D6\u6784\u5EFA\u5386\u53F2\u5931\u8D25",hint:k.historyError}):k.history.length===0?r("div",{className:"dk_empty",children:[e("div",{className:"dk_emptyTitle",children:"\u6CA1\u6709\u6784\u5EFA\u5386\u53F2"}),e("div",{className:"dk_emptyHint",children:"\u8BE5 docker \u7248\u672C\u65E2\u6CA1\u6709 history --format\uFF08\u9700\u8981 Docker \u2265 26\uFF09\uFF0C\u7EAF\u6587\u672C\u8868\u683C\u4E5F\u6CA1\u89E3\u6790\u51FA\u5185\u5BB9\u3002"})]}):e("div",{className:"dk_tableWrap",children:r("table",{className:"dk_images dk_historyTable",children:[e("thead",{children:r("tr",{children:[e("th",{children:"\u5C42 ID"}),e("th",{children:"\u521B\u5EFA"}),e("th",{children:"\u5927\u5C0F"}),e("th",{children:"\u6784\u5EFA\u547D\u4EE4"})]})}),e("tbody",{children:k.history.map((b,P)=>r("tr",{children:[e("td",{className:"dk_mono",children:b.shortId}),e("td",{children:b.createdSince===""?b.created===""?"\u2014":_t(b.created):b.createdSince}),e("td",{children:b.sizeText===""?b.size===null?"\u2014":Vt(b.size):b.sizeText}),e("td",{className:"dk_mono dk_historyCmd",title:b.createdBy,children:b.createdBy===""?"\u2014":b.createdBy})]},String(P)))})]})}),te=[["overview","\u6982\u89C8"],["history","\u6784\u5EFA\u5386\u53F2"]];return r("div",{className:"dk_detail",children:[r("div",{className:"dk_header dk_headerDetail",children:[e($,{icon:Ze,title:"\u8FD4\u56DE\u955C\u50CF\u5217\u8868",onClick:t.onBack},"back"),e("span",{className:"dk_detailTitle",title:i,children:i}),n.dangling===!0?e("span",{className:"dk_badge","data-state":"paused",children:"dangling"}):null,e("span",{className:"dk_detailSub",children:t.targetLabel??""}),e("span",{className:"dk_headerSpacer"}),e($,{icon:Xe,title:"\u5237\u65B0\u955C\u50CF\u8BE6\u60C5",spin:S,onClick:O},"refresh"),t.docked===!0?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:t.onClose,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Be}})},"close")]}),e("div",{className:"dk_tabs",children:te.map(([b,P])=>e("button",{type:"button",className:"dk_tab","data-on":l===b?"1":"0",onClick:()=>p(b),children:P},b))}),e("div",{className:"dk_detailBody",children:l==="overview"?M():U()})]})}function Ba(t){let n=t.item,i=n.name,[l,p]=s("overview"),[k,f]=s(null),[u,v]=s(""),[S,m]=s(!1),[O,D]=s(!1),[M,U]=s(!1),[te,b]=s(""),P=ie(()=>{m(!0),v(""),X.networkInspect(t.target,i).then(g=>f(g.network)).catch(g=>v(g.message)).finally(()=>m(!1))},[t.target,i]);T(()=>{P()},[P]);let L=()=>{U(!0),b(""),X.networkRemove(t.target,i).then(g=>t.onRemoved(g.result.message)).catch(g=>{D(!1),b(g.message)}).finally(()=>U(!1))},A=()=>{if(u!=="")return e(Y,{title:"\u8BFB\u53D6\u7F51\u7EDC\u8BE6\u60C5\u5931\u8D25",hint:u,action:e("button",{type:"button",className:"dk_btn",onClick:P,children:"\u91CD\u8BD5"})});if(k===null)return e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]});let g=k.detail,h=[["\u540D\u79F0",g.name],["ID",g.id],["\u9A71\u52A8",g.driver===""?"\u2014":g.driver],["\u8303\u56F4",g.scope===""?"\u2014":g.scope],["\u521B\u5EFA",g.created===""?"\u2014":_t(g.created)],["\u5B50\u7F51",g.subnets.length===0?"\u2014":g.subnets.map(w=>w.subnet===""?"\u2014":w.subnet).join(`
`)],["\u7F51\u5173",g.subnets.length===0?"\u2014":g.subnets.map(w=>w.gateway===""?"\u2014":w.gateway).join(`
`)],["\u5C5E\u6027",[g.internal?"internal":"",g.attachable?"attachable":"",g.ingress?"ingress":"",g.enableIpv6?"ipv6":""].filter(w=>w!=="").join(" \xB7 ")||"\u2014"],["\u9009\u9879",Object.keys(g.options).length===0?"\u2014":Object.entries(g.options).map(([w,K])=>w+"="+K).join(`
`)],["\u6807\u7B7E",Object.keys(g.labels).length===0?"\u2014":Object.entries(g.labels).map(([w,K])=>w+"="+K).join(`
`)]];return e(xn,{rows:h,mono:["ID","\u5B50\u7F51","\u7F51\u5173","\u9009\u9879","\u6807\u7B7E"]})},N=()=>{if(u!=="")return e(Y,{title:"\u8BFB\u53D6\u7F51\u7EDC\u8BE6\u60C5\u5931\u8D25",hint:u});if(k===null)return e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]});let g=k.detail.containers;return g.length===0?e("div",{className:"dk_empty",children:[e("div",{className:"dk_emptyTitle",children:"\u6CA1\u6709\u5BB9\u5668\u63A5\u5165\u8FD9\u4E2A\u7F51\u7EDC"})]}):e("div",{className:"dk_tableWrap",children:r("table",{className:"dk_images",children:[e("thead",{children:r("tr",{children:[e("th",{children:"\u5BB9\u5668"}),e("th",{children:"IPv4"}),e("th",{children:"IPv6"}),e("th",{children:"MAC"})]})}),e("tbody",{children:g.map(h=>r("tr",{children:[e("td",{className:"dk_mono",title:h.id,children:h.name===""?h.shortId:h.name}),e("td",{className:"dk_mono",children:h.ipv4===""?"\u2014":h.ipv4}),e("td",{className:"dk_mono",children:h.ipv6===""?"\u2014":h.ipv6}),e("td",{className:"dk_mono",children:h.mac===""?"\u2014":h.mac})]},h.id))})]})})},Z=[["overview","\u6982\u89C8"],["containers","\u63A5\u5165\u7684\u5BB9\u5668"+(k===null?"":"\uFF08"+String(k.detail.containers.length)+"\uFF09")]];return r("div",{className:"dk_detail",children:[r("div",{className:"dk_header dk_headerDetail",children:[e($,{icon:Ze,title:"\u8FD4\u56DE\u7F51\u7EDC\u5217\u8868",onClick:t.onBack},"back"),e("span",{className:"dk_projectIcon",dangerouslySetInnerHTML:{__html:Fr}}),e("span",{className:"dk_detailTitle",title:i,children:i}),n.internal===!0?e("span",{className:"dk_badge","data-state":"paused",children:"internal"}):null,e("span",{className:"dk_detailSub",children:t.targetLabel??""}),e("span",{className:"dk_headerSpacer"}),e($,{icon:Xe,title:"\u5237\u65B0\u7F51\u7EDC\u8BE6\u60C5",spin:S,onClick:P},"refresh"),e($,{icon:Wt,danger:!0,disabled:t.allowMutations!==!0,title:t.allowMutations===!0?"\u5220\u9664\u7F51\u7EDC\uFF08\u4E0D\u53EF\u6062\u590D\uFF09":"\u5220\u9664\u7F51\u7EDC\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",onClick:()=>D(!0)},"remove"),t.docked===!0?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:t.onClose,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Be}})},"close")]}),e("div",{className:"dk_tabs",children:Z.map(([g,h])=>e("button",{type:"button",className:"dk_tab","data-on":l===g?"1":"0",onClick:()=>p(g),children:h},g))}),r("div",{className:"dk_detailBody",children:[te===""?null:e(Y,{title:"\u5220\u9664\u7F51\u7EDC\u5931\u8D25",hint:te}),l==="overview"?A():N()]}),O?e(it,{title:"\u5220\u9664\u7F51\u7EDC",text:"\u786E\u5B9A\u5220\u9664\u7F51\u7EDC "+i+"\uFF1F\u8FD8\u6709\u5BB9\u5668\u63A5\u7740\u65F6 docker \u4F1A\u62D2\u7EDD\uFF1B\u5220\u9664\u540E\u4F9D\u8D56\u5B83\u7684\u5BB9\u5668\u4F1A\u5931\u53BB\u7F51\u7EDC\uFF0C\u9700\u8981\u91CD\u65B0\u521B\u5EFA\u6216\u63A5\u5165\u522B\u7684\u7F51\u7EDC\u3002",confirmLabel:"\u5220\u9664",busy:M,onCancel:()=>D(!1),onConfirm:L},"confirm"):null]})}function Pa(t){let i=t.item.name,[l,p]=s(null),[k,f]=s(""),[u,v]=s(!1),[S,m]=s(!1),[O,D]=s(!1),[M,U]=s(""),te=ie(()=>{v(!0),f(""),X.volumeInspect(t.target,i).then(L=>p(L.volume)).catch(L=>f(L.message)).finally(()=>v(!1))},[t.target,i]);T(()=>{te()},[te]);let b=()=>{D(!0),U(""),X.volumeRemove(t.target,i).then(L=>t.onRemoved(L.result.message)).catch(L=>{m(!1),U(L.message)}).finally(()=>D(!1))},P=()=>{if(k!=="")return e(Y,{title:"\u8BFB\u53D6\u5377\u8BE6\u60C5\u5931\u8D25",hint:k,action:e("button",{type:"button",className:"dk_btn",onClick:te,children:"\u91CD\u8BD5"})});if(l===null)return e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]});let L=l.detail,A=[["\u540D\u79F0",L.name],["\u9A71\u52A8",L.driver===""?"\u2014":L.driver],["\u8303\u56F4",L.scope===""?"\u2014":L.scope],["\u6302\u8F7D\u70B9",L.mountpoint===""?"\u2014":L.mountpoint],["\u521B\u5EFA",L.created===""?"\u2014":_t(L.created)],["\u9009\u9879",Object.keys(L.options).length===0?"\u2014":Object.entries(L.options).map(([N,Z])=>N+"="+Z).join(`
`)],["\u6807\u7B7E",Object.keys(L.labels).length===0?"\u2014":Object.entries(L.labels).map(([N,Z])=>N+"="+Z).join(`
`)]];return e(xn,{rows:A,mono:["\u6302\u8F7D\u70B9","\u9009\u9879","\u6807\u7B7E"]})};return r("div",{className:"dk_detail",children:[r("div",{className:"dk_header dk_headerDetail",children:[e($,{icon:Ze,title:"\u8FD4\u56DE\u5377\u5217\u8868",onClick:t.onBack},"back"),e("span",{className:"dk_projectIcon",dangerouslySetInnerHTML:{__html:Vr}}),e("span",{className:"dk_detailTitle",title:i,children:i}),e("span",{className:"dk_detailSub",children:t.targetLabel??""}),e("span",{className:"dk_headerSpacer"}),e($,{icon:Xe,title:"\u5237\u65B0\u5377\u8BE6\u60C5",spin:u,onClick:te},"refresh"),e($,{icon:Wt,danger:!0,disabled:t.allowMutations!==!0,title:t.allowMutations===!0?"\u5220\u9664\u5377\uFF08\u5377\u91CC\u7684\u6570\u636E\u4F1A\u4E00\u8D77\u6CA1\uFF0C\u4E0D\u53EF\u6062\u590D\uFF09":"\u5220\u9664\u5377\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",onClick:()=>m(!0)},"remove"),t.docked===!0?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:t.onClose,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Be}})},"close")]}),r("div",{className:"dk_detailBody",children:[M===""?null:e(Y,{title:"\u5220\u9664\u5377\u5931\u8D25",hint:M}),P()]}),S?e(it,{title:"\u5220\u9664\u5377",text:"\u786E\u5B9A\u5220\u9664\u5377 "+i+"\uFF1F\u5377\u91CC\u7684\u6570\u636E\u4F1A\u4E00\u8D77\u5220\u9664\u4E14\u4E0D\u53EF\u6062\u590D\uFF1B\u8FD8\u6709\u5BB9\u5668\u5360\u7528\u65F6 docker \u4F1A\u62D2\u7EDD\u3002",confirmLabel:"\u5220\u9664",busy:O,onCancel:()=>m(!1),onConfirm:b},"confirm"):null]})}let Da=2e3;function Aa(t,n,i){let l=i+n,p=l.split(/\r\n|\r|\n/),k="";/[\r\n]$/.test(l)||(k=p.pop()??"");let f=t.slice();for(let u of p){let v=u.trim();if(v==="")continue;let S=/^([0-9a-f]{6,}|[A-Za-z][A-Za-z0-9 _-]*?):\s/.exec(v),m=S===null?null:S[1];m!==null&&f.length>0&&f[f.length-1].key===m?f[f.length-1]={key:m,text:v}:f.push({key:m,text:v}),f.length>Da&&f.shift()}return{lines:f,pending:k}}function ja(t){let[n,i]=s(""),[l,p]=s(!1),[k,f]=s([]),[u,v]=s(""),[S,m]=s(""),[O,D]=s(null),M=R(""),U=R([]),te=R(""),b=R(null);T(()=>{if(!l)return;if(typeof EventSource!="function"){m("\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301 EventSource\uFF0C\u65E0\u6CD5\u663E\u793A\u62C9\u53D6\u8FDB\u5EA6"),p(!1);return}v("connecting");let N=new EventSource(zt("/images/pull/stream",{target:t.target,ref:M.current})),Z=!1,g=()=>{if(!Z){Z=!0;try{N.close()}catch{}}},h=q=>{let G=null;try{G=JSON.parse(q.data)}catch{return}if(G===null||typeof G!="object")return;let ne=typeof G.d=="string"?G.d:typeof G.e=="string"?G.e:"";if(ne==="")return;let ye=Aa(U.current,ne,te.current);U.current=ye.lines,te.current=ye.pending,f(ye.lines)},w=q=>{let G=null;try{G=JSON.parse(q.data)}catch{}let ne=G!==null&&typeof G.code=="number"?G.code:null;D(ne),p(!1),v(ne===0?"\u62C9\u53D6\u5B8C\u6210":"\u62C9\u53D6\u7ED3\u675F\uFF08\u9000\u51FA\u7801 "+String(ne===null?"?":ne)+"\uFF09"),ne===0&&t.onDone?.()},K=q=>{if(typeof q.data=="string"&&q.data!==""){let G="\u62C9\u53D6\u5931\u8D25";try{let ne=JSON.parse(q.data);ne!==null&&typeof ne.message=="string"&&(G=ne.message)}catch{}m(G),p(!1),v("");return}v(N.readyState===2?"closed":"reconnecting")};return N.addEventListener("line",h),N.addEventListener("end",w),N.addEventListener("error",K),N.onopen=()=>v("open"),()=>{g(),te.current=""}},[l,t.target]),T(()=>{let N=b.current;N!==null&&(N.scrollTop=N.scrollHeight)},[k]);let P=()=>{let N=n.trim();N===""||l||(M.current=N,U.current=[],te.current="",f([]),m(""),D(null),v(""),p(!0))},L=()=>{p(!1),v("\u5DF2\u505C\u6B62")},A=()=>u==="open"?"\u6B63\u5728\u62C9\u53D6\uFF08docker pull\uFF09\u2026":u==="connecting"?"\u6B63\u5728\u8FDE\u63A5\u62C9\u53D6\u6D41\u2026":u==="reconnecting"?"\u8FDE\u63A5\u4E2D\u65AD\uFF0C\u6B63\u5728\u81EA\u52A8\u91CD\u8FDE\u2026":u==="closed"?"\u62C9\u53D6\u6D41\u5DF2\u65AD\u5F00":u;return r("div",{className:"dk_detail",children:[r("div",{className:"dk_header dk_headerDetail",children:[e($,{icon:Ze,title:"\u8FD4\u56DE\u955C\u50CF\u5217\u8868",onClick:t.onBack},"back"),e("span",{className:"dk_detailTitle",children:"\u62C9\u53D6\u955C\u50CF"}),e("span",{className:"dk_detailSub",children:t.targetLabel??""}),e("span",{className:"dk_headerSpacer"}),t.docked===!0?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:t.onClose,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Be}})},"close")]}),r("div",{className:"dk_detailBody dk_pullBody",children:[t.allowMutations!==!0?e(Y,{kind:"info",title:"\u62C9\u53D6\u955C\u50CF\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",hint:"docker pull \u4F1A\u5199\u5165\u76EE\u6807\u673A\u7684\u955C\u50CF\u5B58\u50A8\u5E76\u5360\u7528\u78C1\u76D8\u4E0E\u5E26\u5BBD\u3002\u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D\u540E\u5373\u53EF\u5728\u6B64\u62C9\u53D6\u3002"}):r("div",{className:"dk_row",children:[e("input",{className:"dk_input",style:{flex:"1 1 auto"},placeholder:"\u955C\u50CF\u5F15\u7528\uFF0C\u5982 nginx:1.27 \u6216 ghcr.io/org/app:latest",value:n,disabled:l,onChange:N=>i(N.target.value),onKeyDown:N=>{N.key==="Enter"&&P()}}),l?e("button",{type:"button",className:"dk_btn dk_btnDanger",onClick:L,children:"\u505C\u6B62"}):e("button",{type:"button",className:"dk_btn dk_btnPrimary",disabled:t.allowMutations!==!0,onClick:P,children:"\u62C9\u53D6"})]}),S===""?null:e(Y,{title:"\u62C9\u53D6\u5931\u8D25",hint:S}),u===""?null:e("div",{className:"dk_hint",children:A()+(O===null?"":" \xB7 \u9000\u51FA\u7801 "+String(O))}),r("div",{className:"dk_pullBox",ref:b,children:[k.length===0?e("div",{className:"dk_pullLine",children:l?"\u7B49\u5F85 docker pull \u8F93\u51FA\u2026":"\u586B\u5199\u955C\u50CF\u5F15\u7528\u540E\u70B9\u300C\u62C9\u53D6\u300D\uFF0C\u9010\u5C42\u8FDB\u5EA6\u4F1A\u5B9E\u65F6\u51FA\u73B0\u5728\u8FD9\u91CC\u3002"}):k.map((N,Z)=>e("div",{className:"dk_pullLine","data-key":N.key??void 0,children:N.text},String(Z)))]})]})]})}function Yt(t){let n=new Map;for(let i of t){let l=i.composeProject===null?"":i.composeProject,p=n.get(l);p===void 0&&(p={project:l,items:[]},n.set(l,p)),p.items.push(i)}return[...n.values()]}let On=t=>t==="running"||t==="paused"||t==="restarting";function Ha(t){return e("div",{className:"dk_projects",children:t.groups.map(n=>{let i=n.items.filter(f=>On(f.state)).length,l=n.items.filter(f=>f.health==="unhealthy").length,p=[...new Set(n.items.map(f=>f.composeService===null?f.name:f.composeService))],k=n.project===""?"\uFF08\u975E compose \u5BB9\u5668\uFF09":n.project;return r("div",{className:"dk_project",role:"button",tabIndex:0,onClick:()=>t.onOpen(n.project),onKeyDown:f=>{(f.key==="Enter"||f.key===" ")&&(f.preventDefault(),t.onOpen(n.project))},children:[r("div",{className:"dk_projectHead",children:[e("span",{className:"dk_projectIcon",dangerouslySetInnerHTML:{__html:aa}}),e("span",{className:"dk_projectName",title:k,children:k}),e("span",{className:"dk_badge","data-state":i===n.items.length?"running":i===0?"exited":"paused",children:String(i)+" / "+String(n.items.length)+" \u8FD0\u884C\u4E2D"}),l>0?e("span",{className:"dk_badge","data-state":"unhealthy",children:String(l)+" \u4E0D\u5065\u5EB7"}):null,e("span",{className:"dk_headerSpacer"}),e("span",{className:"dk_hint",children:String(p.length)+" \u4E2A\u670D\u52A1"})]}),e("div",{className:"dk_projectRows",children:n.items.map(f=>r("div",{className:"dk_projectRow",children:[e("span",{className:"dk_projectSvc",children:f.composeService===null?"\u2014":f.composeService}),e("span",{className:"dk_projectContainer",title:f.name,children:f.name}),e(lt,{state:f.state,health:f.health,status:f.status}),e("span",{className:"dk_projectImage",title:f.image,children:f.image}),e("span",{className:"dk_projectPorts",children:Ft(f.ports)})]},f.id))})]},n.project===""?"__ungrouped":n.project)})})}function za(t){let[n,i]=s("services"),l=t.items,p=t.project===""?"\uFF08\u975E compose \u5BB9\u5668\uFF09":t.project,k=l.filter(v=>On(v.state)).length,f=()=>e("div",{className:"dk_tableWrap",children:r("table",{className:"dk_images dk_composeTable",children:[e("thead",{children:r("tr",{children:[e("th",{children:"\u670D\u52A1"}),e("th",{children:"\u5BB9\u5668"}),e("th",{children:"\u72B6\u6001"}),e("th",{children:"\u7AEF\u53E3"}),e("th",{children:"\u955C\u50CF"})]})}),e("tbody",{children:l.map(v=>r("tr",{children:[e("td",{children:v.composeService===null?"\u2014":v.composeService}),e("td",{className:"dk_mono",title:v.name,children:v.name}),e("td",{children:e(lt,{state:v.state,health:v.health,status:v.status})}),e("td",{children:Ft(v.ports)}),e("td",{className:"dk_mono",title:v.image,children:v.image})]},v.id))})]})}),u=[["services","\u670D\u52A1"],["logs","\u805A\u5408\u65E5\u5FD7"]];return r("div",{className:"dk_detail",children:[r("div",{className:"dk_header dk_headerDetail",children:[e($,{icon:Ze,title:"\u8FD4\u56DE Compose \u5217\u8868",onClick:t.onBack},"back"),e("span",{className:"dk_projectIcon",dangerouslySetInnerHTML:{__html:aa}}),e("span",{className:"dk_detailTitle",title:p,children:p}),e("span",{className:"dk_badge","data-state":k===l.length?"running":k===0?"exited":"paused",children:String(k)+" / "+String(l.length)+" \u8FD0\u884C\u4E2D"}),e("span",{className:"dk_detailSub",children:t.targetLabel??""}),e("span",{className:"dk_headerSpacer"}),t.docked===!0?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:t.onClose,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Be}})},"close")]}),e("div",{className:"dk_tabs",children:u.map(([v,S])=>e("button",{type:"button",className:"dk_tab","data-on":n===v?"1":"0",onClick:()=>i(v),children:S},v))}),e("div",{className:"dk_detailBody",children:n==="services"?f():e(Dn,{target:t.target,items:l})})]})}let $t=350,Fa=/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))\s/;function In(t){let n=Fa.exec(t);if(n===null)return{ts:null,text:t};let i=Date.parse(n[1]);return{ts:Number.isFinite(i)?i:null,text:t.slice(n[0].length)}}let Va={TRACE:0,DEBUG:1,INFO:2,WARN:3,ERROR:4,FATAL:5},Ga=/^\s*(\[\d{4}-\d{2}-\d{2}[ T][0-9:.,]+\]|\d{2}:\d{2}:\d{2}[,.]\d{3})\s*/;function Rn(t){let n=Tn.exec(t.replace(Ga,""));if(n===null)return null;let i=Ln.exec(n[1]);return i===null?null:i[1]}function Xt(t){let n=0;return t.map((i,l)=>(typeof i.ts=="number"&&Number.isFinite(i.ts)&&(n=i.ts),{row:i,index:l,key:n})).sort((i,l)=>i.key-l.key||i.index-l.index).map(i=>i.row)}let Zt=400;function wt(t,n,i){if(n.length===0)return t;let l=Math.max(i,0),p=Math.max(t.length-l,0),k=t.slice(p).concat(n);return t.slice(0,p).concat(Xt(k))}function Mn(t,n){if(typeof n!="number"||n<=0)return t;let i=null,l=[];for(let p of t){let k=Rn(p.text);k!==null&&(i=k);let f=i===null?null:Va[i]??0;(f===null||f>=n)&&l.push(p)}return l}function Wa(t){let n=typeof t.ts=="number"&&Number.isFinite(t.ts)?new Date(t.ts).toISOString()+" ":"";return"["+t.service+"] "+n+t.text}function Bn(t,n){let i=t.map(Wa).join(`
`);if(n?.format!=="md")return i;let l=Array.isArray(n.items)?n.items:[];return["# \u805A\u5408\u65E5\u5FD7","","- \u6765\u6E90\uFF1A"+(typeof n.targetLabel=="string"&&n.targetLabel!==""?n.targetLabel+" \xB7 ":"")+(n.target??""),"- \u5BB9\u5668\uFF08"+String(l.length)+"\uFF09\uFF1A"+l.map(k=>k.name).join("\u3001"),"- \u884C\u6570\uFF1A"+String(t.length),"- \u5BFC\u51FA\u65F6\u95F4\uFF1A"+new Date().toLocaleString(),"","```text",i,"```",""].join(`
`)}function Pn(t,n,i){if(n.length===0)return t;let l=t.concat(n);return l.length>i?l.slice(l.length-i):l}function Dn(t){let n=t.items,[i,l]=s([]),[p,k]=s("connecting"),[f,u]=s(""),[v,S]=s(!1),[m,O]=s(0),[D,M]=s(!1),[U,te]=s(!1),[b,P]=s("arrival"),[L,A]=s(0),N=R([]),Z=R(new Map),g=R(!1),h=R([]),w=R("arrival"),K=R([]),q=R(null),G=R(null),ne=n.map(I=>I.id).join(",");T(()=>{if(n.length===0){k("empty");return}if(typeof EventSource!="function"){k("unsupported");return}k("connecting"),N.current=[],Z.current=new Map,h.current=[],l([]),O(0),M(!1),K.current=[],q.current!==null&&(clearTimeout(q.current),q.current=null);let I=0,de=0,J=n.map(ee=>{let Ae=ee.composeService===null?ee.name:ee.composeService,ve=new EventSource(zt("/logs/stream",{target:t.target,id:ee.id,tail:100,timestamps:1})),we=ae=>{if(ae.length===0)return;let B=w.current==="time"?wt(N.current,ae,Zt):N.current.concat(ae),fe=B.length>Le?B.slice(B.length-Le):B;N.current=fe,fe.length!==B.length&&M(!0),l(fe)},Se=ae=>{if(w.current!=="time"){we(ae);return}K.current=K.current.concat(ae),q.current===null&&(q.current=setTimeout(()=>{q.current=null;let B=K.current;K.current=[],we(Xt(B))},$t))},ce=ae=>{let fe=((Z.current.get(ee.id)??"")+ae).split(`
`);if(Z.current.set(ee.id,fe.pop()??""),fe.length===0)return;let le=fe.map(ge=>{let Oe=In(ge);return{service:Ae,text:Oe.text,ts:Oe.ts}});if(g.current){let ge=h.current.concat(le);h.current=ge.length>Le?ge.slice(ge.length-Le):ge,O(Oe=>h.current.length-Oe>=5||Oe===0?h.current.length:Oe);return}Se(le)};return ve.addEventListener("line",ae=>{let B=null;try{B=JSON.parse(ae.data)}catch{return}B===null||typeof B!="object"||(typeof B.d=="string"?ce(B.d):typeof B.e=="string"&&ce(B.e))}),ve.addEventListener("end",()=>{try{ve.close()}catch{}de+=1,de>=n.length&&k("closed")}),ve.addEventListener("error",ae=>{typeof ae.data=="string"&&ae.data!==""?k("partial"):k("reconnecting")}),ve.onopen=()=>{I+=1,k("open")},()=>{try{ve.close()}catch{}}});return()=>{for(let ee of J)ee()}},[t.target,ne]),T(()=>{if(v)return;let I=G.current;I!==null&&(I.scrollTop=I.scrollHeight)},[v,i]);let ye=()=>{let I=!g.current;if(g.current=I,S(I),I)return;let de=h.current;if(h.current=[],O(0),de.length>0){let J=Pn(N.current,de,Le);N.current=J,l(J)}requestAnimationFrame(()=>{let J=G.current;J!==null&&(J.scrollTop=J.scrollHeight)})},xe=f.trim().toLowerCase(),Pe=Mn(i,L),me=xe===""?Pe:Pe.filter(I=>I.text.toLowerCase().indexOf(xe)>=0||I.service.toLowerCase().indexOf(xe)>=0),Ee=me.length>st?me.slice(-st):me,nt=()=>{let I=b==="time"?"arrival":"time";w.current=I,P(I),q.current!==null&&(clearTimeout(q.current),q.current=null);let de=K.current;if(K.current=[],de.length>0){let J=wt(N.current,de,Zt),ee=J.length>Le?J.slice(J.length-Le):J;N.current=ee,l(ee)}if(I==="time"){let J=wt([],N.current,N.current.length);N.current=J,l(J)}},De=I=>{let de=Bn(Ee,{format:I,target:t.target,targetLabel:t.targetLabel,items:n}),J=new Date().toISOString().replace(/[:.]/g,"-").slice(0,19);$n("docker-logs-"+J+(I==="md"?".md":".log"),de)},ke=()=>p==="open"?"\u5DF2\u8FDE\u63A5 "+String(n.length)+" \u6761\u5BB9\u5668\u65E5\u5FD7\u6D41\uFF08docker logs -f\uFF09":p==="connecting"?"\u6B63\u5728\u8FDE\u63A5\u5BB9\u5668\u65E5\u5FD7\u6D41\u2026":p==="reconnecting"?"\u90E8\u5206\u8FDE\u63A5\u4E2D\u65AD\uFF0C\u6B63\u5728\u81EA\u52A8\u91CD\u8FDE\u2026":p==="partial"?"\u90E8\u5206\u5BB9\u5668\u65E5\u5FD7\u6D41\u51FA\u9519":p==="closed"?"\u5168\u90E8\u5BB9\u5668\u65E5\u5FD7\u6D41\u5DF2\u7ED3\u675F":p==="unsupported"?"\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301 EventSource":p==="empty"?"\u8BE5\u9879\u76EE\u6CA1\u6709\u53EF\u805A\u5408\u7684\u5BB9\u5668":"\u805A\u5408\u65E5\u5FD7";return r("div",{className:"dk_logs",children:[D?e(Y,{kind:"warn",title:"\u805A\u5408\u65E5\u5FD7\u8D85\u8FC7 "+String(Le)+" \u884C\uFF0C\u5DF2\u4E22\u5F03\u6700\u65E9\u5185\u5BB9"}):null,r("div",{className:"dk_filterBar",children:[r("div",{className:"dk_filterWrap",children:[e("input",{className:"dk_input dk_filterInput",placeholder:"\u8FC7\u6EE4\u670D\u52A1\u540D / \u65E5\u5FD7\u5185\u5BB9\u2026",value:f,onChange:I=>u(I.target.value),onKeyDown:I=>{I.key==="Escape"&&f!==""&&(I.stopPropagation(),u(""))}}),f===""?null:e("button",{type:"button",className:"dk_filterClear",title:"\u6E05\u7A7A\u8FC7\u6EE4",onClick:()=>u(""),children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Be}})},"clear")]}),e("button",{type:"button",className:"dk_pill dk_pillFollow","data-on":v?"0":"1","data-paused":v?"1":void 0,title:v?"\u6062\u590D\u5B9E\u65F6\uFF08\u4F1A\u4E00\u6B21\u6027\u663E\u793A\u6682\u505C\u671F\u95F4\u6512\u4E0B\u7684 "+String(m)+" \u884C\u5E76\u56DE\u5230\u5E95\u90E8\uFF09":"\u6682\u505C\uFF08\u51BB\u7ED3\u5F53\u524D\u753B\u9762\uFF1A\u65B0\u65E5\u5FD7\u7EE7\u7EED\u63A5\u6536\u4F46\u4E0D\u8FFD\u52A0\uFF0C\u907F\u514D\u8BFB\u5C4F\u88AB\u9876\u8D70\uFF09",onClick:ye,children:v?m>0?"\u5DF2\u6682\u505C +"+String(m):"\u5DF2\u6682\u505C":"\u5B9E\u65F6"}),e("button",{type:"button",className:"dk_pill","data-on":U?"1":"0",title:U?"\u9690\u85CF\u6BCF\u884C\u65F6\u95F4\u6233":"\u663E\u793A\u6BCF\u884C\u65F6\u95F4\u6233\uFF08\u65F6\u95F4\u6233\u59CB\u7EC8\u968F\u6D41\u63A5\u6536\uFF0C\u53EA\u5F71\u54CD\u663E\u793A\uFF09",onClick:()=>te(I=>!I),children:"\u65F6\u95F4\u6233"}),e("button",{type:"button",className:"dk_pill","data-on":b==="time"?"1":"0",title:b==="time"?"\u6309\u5230\u8FBE\u987A\u5E8F\u663E\u793A\uFF08\u5B9E\u65F6\u8DDF\u968F\u96F6\u5EF6\u8FDF\uFF09":"\u6309\u5BB9\u5668\u65F6\u95F4\u6233\u5408\u5E76\uFF08\u8DE8\u5BB9\u5668\u6210\u4E00\u6761\u771F\u65F6\u95F4\u7EBF\uFF0C\u4EE3\u4EF7\u7EA6 "+String($t)+"ms \u5EF6\u8FDF\uFF09",onClick:()=>nt(),children:b==="time"?"\u6309\u65F6\u95F4":"\u6309\u5230\u8FBE"}),e("select",{className:"dk_select dk_selectSm",value:String(L),title:"\u6309\u65E5\u5FD7\u7EA7\u522B\u8FC7\u6EE4\uFF08\u65E0\u7EA7\u522B\u524D\u7F00\u7684\u884C\u59CB\u7EC8\u4FDD\u7559\uFF09",onChange:I=>A(Number(I.target.value)),children:[e("option",{value:"0",children:"\u5168\u90E8\u7EA7\u522B"},"all"),e("option",{value:"3",children:"WARN+"},"warn"),e("option",{value:"4",children:"ERROR+"},"error")]}),e("button",{type:"button",className:"dk_chip",disabled:Ee.length===0,title:"\u5BFC\u51FA\u5F53\u524D\u663E\u793A\u5185\u5BB9\u4E3A .log\uFF08\u7EAF\u6587\u672C\uFF09",onClick:()=>De("log"),children:"\u2B07 .log"}),e("button",{type:"button",className:"dk_chip",disabled:Ee.length===0,title:"\u5BFC\u51FA\u5F53\u524D\u663E\u793A\u5185\u5BB9\u4E3A .md\uFF08\u5E26\u6765\u6E90\u4E0E\u884C\u6570\u8868\u5934\uFF0C\u9002\u5408\u5F53\u5DE5\u5355\u9644\u4EF6\uFF09",onClick:()=>De("md"),children:"\u2B07 .md"}),e("span",{className:"dk_filterCount",children:xe===""&&L===0?String(i.length)+" \u884C":String(me.length)+" / "+String(i.length)+" \u884C"})]}),e("div",{className:"dk_followState","data-state":p==="open"?"open":p==="closed"?"closed":"connecting",children:ke()}),e("div",{className:"dk_logBody",ref:G,children:[Ee.length===0?e("div",{className:"dk_logLine",children:p==="open"?"\u7B49\u5F85\u65E5\u5FD7\u2026":ke()},"empty"):Ee.map((I,de)=>Ia(I,de,xe,U))]})]})}function Ka(t,n){let i=typeof t.image=="string"?t.image:"",l=typeof t.composeProject=="string"?t.composeProject:"";return r("span",{className:"dk_activityItem","data-action":String(t.action??"").split(":")[0].trim(),title:l===""?i:i+" \xB7 "+l,children:[e("span",{className:"dk_activityTime",children:ma(t.time)}),e("span",{className:"dk_activityName",children:t.name}),e("span",{className:"dk_activityAction",children:fa(t)})]},String(n)+String(t.name)+String(t.time))}function Ja(t){let n=t.open===!0,i=Array.isArray(t.events)?t.events:[],l=i.slice(0,ga);return r("div",{className:"dk_activity","data-open":n?"1":"0",children:[e("button",{type:"button",className:"dk_activityHead","aria-expanded":n,title:"\u5BB9\u5668\u4E8B\u4EF6\u6D3B\u52A8\uFF08docker events\uFF09\uFF1A\u70B9\u51FB\u6298\u53E0 / \u5C55\u5F00",onClick:t.onToggle,children:[e("span",{className:"dk_activityTitle",children:"\u6D3B\u52A8"}),e("span",{className:"dk_activityState","data-state":t.status??"",children:t.statusText??""}),e("span",{className:"dk_headerSpacer"}),e("span",{className:"dk_hint",children:i.length===0?"\u6682\u65E0\u4E8B\u4EF6":"\u6700\u8FD1 "+String(l.length)+" / "+String(i.length)+" \u6761"}),e("span",{className:"dk_activityChevron",dangerouslySetInnerHTML:{__html:kn}})]}),n===!1?null:l.length===0?e("div",{className:"dk_activityEmpty",children:"\u6682\u65E0\u4E8B\u4EF6\uFF08\u5BB9\u5668\u7684 start / die / health \u7B49\u52A8\u4F5C\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\uFF09"}):e("div",{className:"dk_activityList",children:l.map(Ka)})]})}function Ua(t){let n=t.info,i=Array.isArray(t.presets)?t.presets:[],l=i.some(p=>p.count>0)||t.count>0;return r("div",{className:"dk_pickBar",children:[r("div",{className:"dk_pickRow",children:[e("span",{className:"dk_pickCount",children:"\u5DF2\u9009 "+String(t.count)+" \u4E2A\u5BB9\u5668"}),n.hint===""?null:e("span",{className:"dk_hint dk_pickHint",children:n.hint}),e("span",{className:"dk_headerSpacer"}),e("button",{type:"button",className:"dk_btn dk_btnPrimary",disabled:n.canRun!==!0,title:n.hint!==""?n.hint:n.canRun===!0?"\u628A\u6240\u9009\u5BB9\u5668\u7684\u65E5\u5FD7\u805A\u5408\u6210\u4E00\u6761\u6D41":"\u81F3\u5C11\u9009\u62E9 2 \u4E2A\u5BB9\u5668",onClick:t.onRun,children:"\u805A\u5408\u65E5\u5FD7"}),e("button",{type:"button",className:"dk_btn",onClick:t.onCancel,children:"\u53D6\u6D88"})]}),l?r("div",{className:"dk_pickPresets",children:[e("span",{className:"dk_pickPresetsLabel",children:"\u6309\u6761\u4EF6\u9009\u4E2D"}),...i.filter(p=>p.count>0).map(p=>e("button",{type:"button",className:"dk_chip",title:"\u5728\u5F53\u524D\u7B5B\u9009\u7ED3\u679C\u91CC\u52FE\u9009\u300C"+p.label+"\u300D\u7684\u5BB9\u5668\uFF08\u6700\u591A "+String(Qe)+" \u4E2A\u6D41\uFF09"+(p.over>0?"\uFF1B\u53E6\u6709 "+String(p.over)+" \u4E2A\u8D85\u51FA\u4E0A\u9650\u4E0D\u4F1A\u9009\u4E2D":""),onClick:()=>t.onPreset(p.key),children:p.label+" "+String(p.count)},p.key)),t.count>0?e("button",{type:"button",className:"dk_chip dk_chipQuiet",title:"\u6E05\u7A7A\u52FE\u9009",onClick:t.onClear,children:"\u6E05\u7A7A"},"clear"):null,t.notice===""?null:e("span",{className:"dk_hint dk_pickNotice",children:t.notice})]}):null]})}function qa(t){return r("div",{className:"dk_detail",children:[r("div",{className:"dk_header dk_headerDetail",children:[e($,{icon:Ze,title:"\u8FD4\u56DE\u5BB9\u5668\u5217\u8868\uFF08\u9000\u51FA\u9009\u62E9\u6001\uFF09",onClick:t.onBack},"back"),e("span",{className:"dk_projectIcon",dangerouslySetInnerHTML:{__html:na}}),e("span",{className:"dk_detailTitle",children:"\u805A\u5408\u65E5\u5FD7 \xB7 "+String(t.items.length)+" \u4E2A\u5BB9\u5668"}),e("span",{className:"dk_detailSub",children:t.targetLabel??""}),e("span",{className:"dk_headerSpacer"}),t.docked===!0?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:t.onClose,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Be}})},"close")]}),e("div",{className:"dk_detailBody",children:e(Dn,{target:t.target,items:t.items})})]})}function Ya(t){let n=t.collapsed===!0;return r("div",{className:"dk_drawer","data-collapsed":n?"1":void 0,style:n||t.height===null?void 0:{height:String(t.height)+"px"},children:[e("div",{className:"dk_drawerResize",title:"\u62D6\u52A8\u8C03\u6574\u7EC8\u7AEF\u9AD8\u5EA6\uFF08\u53CC\u51FB\u6298\u53E0 / \u5C55\u5F00\uFF09",onMouseDown:t.onResizeStart,onDoubleClick:t.onToggleCollapse},"resize"),r("div",{className:"dk_drawerHead",children:[e("span",{className:"dk_drawerIcon",dangerouslySetInnerHTML:{__html:ta}}),e("span",{className:"dk_drawerTitle",title:t.label,children:t.label}),e("span",{className:"dk_drawerHint",children:n?"\u5DF2\u6298\u53E0 \xB7 \u4F1A\u8BDD\u4FDD\u6301\u8FD0\u884C":"\u7531\u7EC8\u7AEF\u9762\u677F\u627F\u8F7D \xB7 \u6298\u53E0\u4FDD\u7559\u4F1A\u8BDD"}),e("span",{className:"dk_headerSpacer"}),e("button",{type:"button",className:"dk_iconBtn dk_drawerFold",title:n?"\u5C55\u5F00\u7EC8\u7AEF\uFF08\u4F1A\u8BDD\u672A\u4E2D\u65AD\uFF09":"\u6298\u53E0\u7EC8\u7AEF\uFF08\u4F1A\u8BDD\u4FDD\u6301\u8FD0\u884C\uFF09",onClick:t.onToggleCollapse,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:kn}})},"fold"),e("button",{type:"button",className:"dk_iconBtn",title:"\u7ED3\u675F\u7EC8\u7AEF\u4F1A\u8BDD\u5E76\u6536\u8D77\u62BD\u5C49",onClick:t.onClose,children:e("span",{dangerouslySetInnerHTML:{__html:Be}})},"close")]}),e("div",{className:"dk_drawerBody",ref:t.hostRef})]})}function An(t){let[n,i]=s(null),[l,p]=s([]),k=typeof t.initialTarget=="string"?t.initialTarget.trim():"",f=R(k!==""?k:Zn()),[u,v]=s(f.current),S=t.sessionHint!==void 0&&(t.initialTarget??"")==="",[m,O]=s("containers"),[D,M]=s([]),[U,te]=s(""),b=R(""),P=ie(a=>{b.current=a,te(a)},[]),[L,A]=s([]),[N,Z]=s([]),[g,h]=s([]),[w,K]=s([]),[q,G]=s(null),[ne,ye]=s(null),[xe,Pe]=s(null),[me,Ee]=s(null),[nt,De]=s(!1),[ke,I]=s(!1),[de,J]=s([]),[ee,Ae]=s(""),[ve,we]=s(!1),[Se,ce]=s(!1),[ae,B]=s(""),[fe,le]=s(""),[ge,Oe]=s(!0),[Ce,at]=s(""),[rt,je]=s("all"),[ot,Nt]=s(!1),[St,kt]=s([]),[Ve,he]=s(""),[Ct,en]=s(!0),gt=R(null),Tt=R(""),[We,He]=s(null),[Lt,Et]=s(0),[be,Ne]=s(null),[Ot,It]=s(!1),[Rt,qe]=s({}),[Mt,tn]=s(""),[_,E]=s(""),[y,W]=s(""),j=R(!0),F=R(null);F.current===null&&(F.current=ca());let[se,V]=s(null),H=R(null),[z,ue]=s(!1),[Ke,ar]=s(null),[rr,nn]=s(!1),zn=R(null),an=R(!1);T(()=>()=>{j.current=!1},[]),T(()=>{if(se===null)return;let a=H.current;if(a===null)return;let c=null;try{c=Je.mount(a,se.options)}catch(x){le("\u7EC8\u7AEF\u542F\u52A8\u5931\u8D25\uFF1A"+(x instanceof Error?x.message:String(x))),V(null);return}return()=>{try{c?.()}catch{}}},[se]);let or=a=>{if(a.button!==void 0&&a.button!==0)return;let c=a.currentTarget.parentElement,x=zn.current;if(c===null||x===null)return;a.preventDefault();let pe=a.clientY,re=c.getBoundingClientRect().height,Q=Math.max(160,Math.round(x.getBoundingClientRect().height*.75)),ze=_e=>{let Me=Math.round(re+(pe-_e.clientY));ar(Math.min(Q,Math.max(160,Me)))},jt=()=>{document.removeEventListener("mousemove",ze),document.removeEventListener("mouseup",jt),document.body.style.userSelect=""};document.body.style.userSelect="none",document.addEventListener("mousemove",ze),document.addEventListener("mouseup",jt)},Ge=()=>{if(se===null){t.onClose();return}nn(!0)};T(()=>{X.config().then(a=>{let c=a.config;i(c),Array.isArray(c.targets)&&c.targets.length>0&&v(x=>cn(c.targets,x,f.current,S)),un(c)}).catch(a=>B(a.message)),X.targets().then(a=>{p(a.targets??[]),_n=a.targets??[],v(c=>cn(a.targets??[],c,f.current,S)),f.current=""}).catch(()=>{})},[]),T(()=>{u!==""&&Qn(u)},[u]);let ht=ie(()=>{if(u==="")return Promise.resolve();let a=F.current.next();return ce(!0),X.containers(u,ge).then(c=>{!j.current||!F.current.isCurrent(a)||(M(c.containers??[]),P(u),B(""))}).catch(c=>{!j.current||!F.current.isCurrent(a)||(b.current!==u&&M([]),P(u),B(c.message))}).finally(()=>{j.current&&F.current.isCurrent(a)&&ce(!1)})},[u,ge]),pt=ie(()=>{if(u==="")return Promise.resolve();let a=F.current.next();return ce(!0),X.images(u).then(c=>{!j.current||!F.current.isCurrent(a)||(Z(c.images??[]),P(u),B(""))}).catch(c=>{!j.current||!F.current.isCurrent(a)||(b.current!==u&&Z([]),P(u),B(c.message))}).finally(()=>{j.current&&F.current.isCurrent(a)&&ce(!1)})},[u]),Bt=ie(()=>{if(u==="")return Promise.resolve();let a=F.current.next();return ce(!0),X.networks(u).then(c=>{!j.current||!F.current.isCurrent(a)||(h(c.networks??[]),P(u),B(""))}).catch(c=>{!j.current||!F.current.isCurrent(a)||(b.current!==u&&h([]),P(u),B(c.message))}).finally(()=>{j.current&&F.current.isCurrent(a)&&ce(!1)})},[u]),Pt=ie(()=>{if(u==="")return Promise.resolve();let a=F.current.next();return ce(!0),X.volumes(u).then(c=>{!j.current||!F.current.isCurrent(a)||(K(c.volumes??[]),P(u),B(""))}).catch(c=>{!j.current||!F.current.isCurrent(a)||(b.current!==u&&K([]),P(u),B(c.message))}).finally(()=>{j.current&&F.current.isCurrent(a)&&ce(!1)})},[u]),rn=ie(()=>{if(l.length===0)return A([]),Promise.resolve();let a=F.current.next();ce(!0),A(l.map(re=>({name:re.name,kind:re.kind,label:re.label,containers:[],attention:null,error:"",loaded:!1})));let c=l.length,x=()=>{c-=1,c===0&&j.current&&F.current.isCurrent(a)&&ce(!1)},pe=re=>X.attention(re).then(Q=>{!j.current||!F.current.isCurrent(a)||A(ze=>yt(ze,re,{attention:Q.items??[]}))}).catch(()=>{!j.current||!F.current.isCurrent(a)||A(Q=>yt(Q,re,{attention:null}))});return Promise.all(l.map(re=>(pe(re.name),X.containers(re.name,!0).then(Q=>{!j.current||!F.current.isCurrent(a)||A(ze=>yt(ze,re.name,{containers:Q.containers??[],error:"",loaded:!0}))}).catch(Q=>{!j.current||!F.current.isCurrent(a)||A(ze=>yt(ze,re.name,{error:Q instanceof Error?Q.message:String(Q),loaded:!0}))}).finally(x))))},[l]);T(()=>{gt.current=ht},[ht]);let lr=ie(()=>Et(a=>a+1),[]),Ie=ie(()=>{I(!1),J([]),Ae(""),we(!1)},[]),ir=()=>{if(ke){Ie();return}J([]),we(!1),I(!0)},dr=a=>J(c=>oa(c,a.id));T(()=>{if(!ke)return;let a=c=>{c.key==="Escape"&&Ie()};return document.addEventListener("keydown",a),()=>document.removeEventListener("keydown",a)},[ke,Ie]),T(()=>{ke&&J(a=>la(a,D))},[D,ke]);let sr=a=>{v(a),B(""),O("containers"),He(null),Ie(),qe({}),t.onTargetChange?.(Re(a))},cr=(a,c)=>{v(a),B(""),O("containers"),Ie(),qe({}),He({id:c.id,tab:"overview",item:c}),t.onTargetChange?.(Re(a))},mt=ie(()=>{m==="overview"?rn():m==="images"?pt():m==="networks"?Bt():m==="volumes"?Pt():ht(),Et(a=>a+1)},[m,rn,ht,pt,Bt,Pt]);T(()=>{m!=="overview"&&u!==""&&mt()},[u,ge,m]);let ur=l.map(a=>a.name).join("\0");T(()=>{m==="overview"&&rn()},[m,ur]),T(()=>{if(!ot||m!=="overview"&&(u===""||m==="images"))return;let a=setInterval(mt,Math.max(2,n?.pollIntervalSec??5)*1e3);return()=>clearInterval(a)},[ot,mt,u,n,m]);let kr=()=>Ve==="open"?"\u5B9E\u65F6\u63A5\u6536\u4E2D\uFF08docker events\uFF09":Ve==="connecting"?"\u6B63\u5728\u8FDE\u63A5\u4E8B\u4EF6\u6D41\u2026":Ve==="reconnecting"?"\u8FDE\u63A5\u4E2D\u65AD\uFF0C\u6B63\u5728\u81EA\u52A8\u91CD\u8FDE\u2026":Ve==="closed"?"\u4E8B\u4EF6\u6D41\u5DF2\u65AD\u5F00":Ve==="unsupported"?"\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301 EventSource":"\u4E8B\u4EF6\u6D41";T(()=>{if(m!=="containers"||u==="")return;if(typeof EventSource!="function"){he("unsupported");return}Tt.current!==u&&(Tt.current=u,kt([])),he("connecting");let a=va(ha,()=>{let _e=gt.current;_e!==null&&_e()}),c=!1,x=new EventSource(zt("/events/stream",{target:u})),pe=!1,re=()=>{if(!pe){pe=!0;try{x.close()}catch{}}},Q=_e=>{let Me=null;try{Me=JSON.parse(_e.data)}catch{return}Me===null||typeof Me!="object"||(kt(Ht=>pa(Ht,Me,ka)),a.schedule())},ze=_e=>{let Me=null;try{Me=JSON.parse(_e.data)}catch{}let Ht=Me!==null&&typeof Me.code=="number"?Me.code:null;he("closed"),le("\u4E8B\u4EF6\u6D41\u5DF2\u7ED3\u675F"+(Ht===null?"":"\uFF08\u9000\u51FA\u7801 "+String(Ht)+"\uFF09")+"\uFF0C\u5217\u8868\u56DE\u5230 AUTO REFRESH / \u624B\u52A8\u5237\u65B0"),re()},jt=_e=>{if(typeof _e.data=="string"&&_e.data!==""){he("closed"),re();return}he(x.readyState===2?"closed":"reconnecting")};return x.addEventListener("event",Q),x.addEventListener("end",ze),x.addEventListener("error",jt),x.onopen=()=>{if(he("open"),c){let _e=gt.current;_e!==null&&_e()}c=!0},()=>{re(),a.cancel()}},[m,u]),T(()=>{if(fe==="")return;let a=setTimeout(()=>le(""),4e3);return()=>clearTimeout(a)},[fe]);let Dt=(a,c)=>{let x=Xn(a.name);navigator.clipboard.writeText(x).then(()=>{le("\u5DF2\u590D\u5236\uFF1A"+x+(c===void 0?"":"\uFF08"+c+"\uFF09"))}).catch(()=>le("\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u6267\u884C\uFF1A"+x))},gr=a=>{let c=Xn(a.name);if(Je===null){let Q=document.querySelector("[data-dsh-tty-entry]")!==null;Dt(a,Q?"\u7EC8\u7AEF\u9762\u677F\u7248\u672C\u8FC7\u65E7\uFF08\u4EA4\u4E92\u5F0F\u8FDB\u5165\u5BB9\u5668\u9700\u8981 dsh-tty \u2265 0.14.0\uFF09\uFF0C\u547D\u4EE4\u5DF2\u590D\u5236\uFF0C\u53EF\u7C98\u8D34\u5230\u7CFB\u7EDF\u7EC8\u7AEF\u6267\u884C":"\u672A\u5B89\u88C5 dsh-tty \u7EC8\u7AEF\u9762\u677F\uFF0C\u547D\u4EE4\u5DF2\u590D\u5236\uFF0C\u53EF\u7C98\u8D34\u5230\u7CFB\u7EDF\u7EC8\u7AEF\u6267\u884C\uFF08\u88C5 dsh-tty \u540E\u53EF\u76F4\u63A5\u5728\u6B64\u5F00\u7EC8\u7AEF\uFF09");return}let x=(n?.targets??[]).find(Q=>Q.name===u),pe=a.name+" \xB7 exec",re=x===void 0||x.kind==="local"?{command:c,label:pe}:typeof x.book=="string"&&x.book!==""?{book:x.book,command:c,label:pe}:(x.auth??"agent")==="agent"?{spec:{host:x.host,port:x.port,username:x.username,auth:"agent",agentForward:x.agentForward===!0},command:c,label:pe}:null;if(re===null){Dt(a,"\u5185\u8054\u76EE\u6807\u7528\u4E86 key/password \u8BA4\u8BC1\uFF0C\u6D4F\u89C8\u5668\u7AEF\u62FF\u4E0D\u5230\u51ED\u8BC1");return}if(t.docked===!0){try{Je.open(re)}catch(Q){Dt(a,Q instanceof Error?Q.message:String(Q))}return}if(typeof Je.mount=="function"&&Number(Je.version??0)>=2){V({label:pe,options:re}),ue(!1);return}try{Je.open(re),t.onClose()}catch(Q){Dt(a,Q instanceof Error?Q.message:String(Q))}},Fn=a=>qe(c=>{if(c[a]===void 0)return c;let x={...c};return delete x[a],x}),ft=(a,c)=>{It(!0);let x=()=>{It(!1),Ne(null)};Promise.resolve().then(a).then(async()=>{if(x(),c!==void 0)try{await c()}catch(pe){B(pe.message)}},pe=>{x(),B(pe.message)})},hr=(a,c)=>{Rt[c.id]===void 0&&Ne({title:a==="remove"?"\u5220\u9664\u5BB9\u5668":a==="stop"?"\u505C\u6B62\u5BB9\u5668":a==="start"?"\u542F\u52A8\u5BB9\u5668":"\u91CD\u542F\u5BB9\u5668",text:a==="remove"?`\u786E\u5B9A\u5220\u9664\u5BB9\u5668 ${c.name}\uFF1F\u5BB9\u5668\u7684\u53EF\u5199\u5C42\u4E0E\u914D\u7F6E\u4F1A\u88AB\u5220\u9664\uFF08\u547D\u540D\u6570\u636E\u5377\u4FDD\u7559\uFF09\uFF0C\u6B64\u64CD\u4F5C\u4E0D\u53EF\u6062\u590D\u3002`:`\u786E\u5B9A\u5BF9\u5BB9\u5668 ${c.name} \u6267\u884C${a==="stop"?"\u505C\u6B62":a==="start"?"\u542F\u52A8":"\u91CD\u542F"}\u64CD\u4F5C\uFF1F`,confirmLabel:a==="remove"?"\u5220\u9664":"\u786E\u5B9A",run:()=>ft(async()=>{qe(x=>({...x,[c.id]:a}));try{let x=await X.action(u,a,c.id);le(`${x.result.action} ${c.name}\uFF1A${x.result.message}`)}catch(x){throw Fn(c.id),x}},async()=>{try{await ht()}finally{Fn(c.id)}})})},pr=a=>{let c=qt(a);Ne({title:"\u5220\u9664\u955C\u50CF",text:"\u786E\u5B9A\u5220\u9664\u955C\u50CF "+c+"\uFF1F\u955C\u50CF\u88AB\u5BB9\u5668\u6216\u5B50\u955C\u50CF\u5F15\u7528\u65F6\u4F1A\u5931\u8D25\uFF1B\u5220\u9664\u540E\u9700\u8981\u91CD\u65B0\u62C9\u53D6\u6216\u6784\u5EFA\u624D\u80FD\u6062\u590D\uFF0C\u4E14\u4E0D\u53EF\u64A4\u9500\u3002",confirmLabel:"\u5220\u9664",run:()=>ft(async()=>{let x=await X.imageRemove(u,c);le("\u5DF2\u5220\u9664 "+c+"\uFF1A"+x.result.message),q!==null&&qt(q)===c&&G(null),await pt()})})},mr=()=>{Ne({title:"\u6E05\u7406 dangling \u955C\u50CF",text:"\u6E05\u7406\u8BE5\u76EE\u6807\u4E0A\u6240\u6709\u65E0\u6807\u7B7E\uFF08<none>:<none>\uFF09\u7684\u955C\u50CF\u5C42\uFF0C\u91CA\u653E\u78C1\u76D8\u7A7A\u95F4\uFF1B\u4E0D\u4F1A\u5220\u9664\u6709 tag \u7684\u955C\u50CF\u3002",confirmLabel:"\u6E05\u7406",run:()=>ft(async()=>{let a=await X.imagePrune(u),c=String(a.result.message).trim().split(`
`).filter(x=>x!=="");le("\u5DF2\u6E05\u7406 dangling \u955C\u50CF\uFF1A"+(c.length===0?"ok":c[c.length-1])),await pt()})})},fr=()=>{Ne({title:"\u6E05\u7406\u672A\u4F7F\u7528\u7684\u7F51\u7EDC",text:"\u6E05\u7406\u8BE5\u76EE\u6807\u4E0A\u6240\u6709\u6CA1\u6709\u5BB9\u5668\u63A5\u5165\u7684\u7F51\u7EDC\u3002compose \u521B\u5EFA\u7684\u9879\u76EE\u7F51\u7EDC\u4E5F\u5728\u5176\u4E2D\uFF08\u4E0B\u6B21 up \u4F1A\u91CD\u5EFA\uFF09\uFF0C\u4F46\u6B63\u5728\u8DD1\u7684\u9879\u76EE\u4F1A\u77ED\u6682\u5931\u53BB\u7F51\u7EDC\u3002",confirmLabel:"\u6E05\u7406",run:()=>ft(async()=>{let a=await X.networkPrune(u),c=String(a.result.message).trim().split(`
`).filter(x=>x!=="");le("\u5DF2\u6E05\u7406\u672A\u4F7F\u7528\u7F51\u7EDC\uFF1A"+(c.length===0?"ok":c[c.length-1])),await Bt()})})},vr=()=>{Ne({title:"\u6E05\u7406\u672A\u4F7F\u7528\u7684\u5377",text:"\u6E05\u7406\u8BE5\u76EE\u6807\u4E0A\u6240\u6709\u6CA1\u6709\u88AB\u5BB9\u5668\u4F7F\u7528\u7684\u5377\u2014\u2014\u5377\u91CC\u7684\u6570\u636E\u4F1A\u4E00\u8D77\u5220\u9664\u4E14\u4E0D\u53EF\u6062\u590D\u3002docker \u2265 23 \u53EA\u5220\u533F\u540D\u5377\uFF08\u4E0D\u5E26 --all\uFF09\uFF0C\u66F4\u8001\u7684\u7248\u672C\u4F1A\u8FDE\u547D\u540D\u5377\u4E00\u8D77\u5220\uFF1B\u6267\u884C\u524D\u8BF7\u786E\u8BA4\u6CA1\u6709\u9700\u8981\u4FDD\u7559\u7684\u6570\u636E\u5377\u3002",confirmLabel:"\u6E05\u7406",run:()=>ft(async()=>{let a=await X.volumePrune(u),c=String(a.result.message).trim().split(`
`).filter(x=>x!=="");le("\u5DF2\u6E05\u7406\u672A\u4F7F\u7528\u5377\uFF1A"+(c.length===0?"ok":c[c.length-1])),await Pt()})})},Vn=(a,c)=>x=>{a(),le(x),c()},At=We===null?null:D.find(a=>a.id===We.id)??We.item,Ye=D.filter(a=>{if(rt==="running"&&!(a.state==="running"||a.state==="paused"||a.state==="restarting")||rt==="stopped"&&a.state==="running"||rt==="unhealthy"&&a.health!=="unhealthy")return!1;let c=Ce.trim().toLowerCase();return c===""?!0:a.name.toLowerCase().includes(c)||a.image.toLowerCase().includes(c)||a.id.toLowerCase().includes(c)}),on=N.filter(a=>{let c=Mt.trim().toLowerCase();return c===""||a.reference.toLowerCase().includes(c)||a.id.toLowerCase().includes(c)}),ln=g.filter(a=>{let c=_.trim().toLowerCase();return c===""||a.name.toLowerCase().includes(c)||a.driver.toLowerCase().includes(c)||a.id.toLowerCase().includes(c)}),dn=w.filter(a=>{let c=y.trim().toLowerCase();return c===""||a.name.toLowerCase().includes(c)||a.driver.toLowerCase().includes(c)||a.mountpoint.toLowerCase().includes(c)}),br=()=>r("div",{className:"dk_switchPill",title:"\u6B63\u5728\u5207\u6362\u5230 "+u+Gn(u)+"\u3002\u4E0B\u9762\u4ECD\u662F "+U+Gn(U)+"\u7684\u6570\u636E\uFF0C\u5207\u6362\u5B8C\u6210\u524D\u4E0D\u53EF\u64CD\u4F5C\u3002",children:[e("span",{className:"dk_spin dk_spinSm"}),r("span",{className:"dk_switchText",children:[e("span",{children:"\u6B63\u5728\u5207\u6362\u5230"}),e("strong",{children:u}),e("span",{className:"dk_switchDot",children:"\xB7"}),r("span",{className:"dk_switchSub",children:[e("span",{children:"\u5F53\u524D\u663E\u793A\uFF1A"}),e("span",{className:"dk_switchName",children:U})]})]})]},"switchPill"),Gn=a=>{let c=l.find(pe=>pe.name===a),x=c===void 0||typeof c.label!="string"?"":c.label;return x===""||x===a?"":"\uFF08"+x+"\uFF09"},Wn=U!==""&&U!==u&&!S,Re=a=>{let c=l.find(x=>x.name===a);return c===void 0||c.label===void 0?a:a+" \xB7 "+c.label},vt=()=>Se?e("div",{className:"dk_empty",children:[e("span",{className:"dk_spin"}),e("div",{children:"\u8BFB\u53D6\u4E2D\u2026"})]}):u===""?S?r("div",{className:"dk_empty",children:[e("div",{className:"dk_emptyTitle",children:"\u5F53\u524D\u4F1A\u8BDD\u4E3B\u673A\u8FD8\u4E0D\u662F Docker \u76EE\u6807"}),e("div",{className:"dk_emptyHint",children:"\u6309\u4E0A\u9762\u7684\u63D0\u793A\u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6DFB\u52A0\u4E00\u6761\u76EE\u6807\uFF08\u63A8\u8350\u76F4\u63A5\u9009\u8FDE\u63A5\u7C3F\u6761\u76EE\uFF09\uFF0C\u4FDD\u5B58\u540E\u56DE\u5230\u8FD9\u91CC\u5237\u65B0\u3002\u4E3A\u907F\u514D\u5F20\u51A0\u674E\u6234\uFF0C\u9762\u677F\u4E0D\u4F1A\u81EA\u52A8\u5207\u5230\u5176\u4ED6\u76EE\u6807\u3002"})]}):r("div",{className:"dk_empty",children:[e("div",{className:"dk_emptyTitle",children:"\u8FD8\u6CA1\u6709\u914D\u7F6E Docker \u76EE\u6807"}),e("div",{className:"dk_emptyHint",children:"\u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6DFB\u52A0\u4E00\u4E2A\u76EE\u6807\uFF1A\u672C\u673A\u76F4\u63A5\u9009\u300C\u672C\u673A\u300D\uFF1B\u8FDC\u7A0B\u4E3B\u673A\u53EF\u4EE5\u5F15\u7528 tty \u7EC8\u7AEF\u9762\u677F\u7684\u8FDE\u63A5\u7C3F\u6761\u76EE\u3002"})]}):ae!==""&&D.length===0?r("div",{className:"dk_empty",children:[e("div",{className:"dk_emptyTitle",children:"\u8FD9\u4E2A\u76EE\u6807\u7684\u6570\u636E\u6CA1\u8BFB\u5230"}),e("div",{className:"dk_emptyHint",children:"\u4E0A\u9762\u7684\u9519\u8BEF\u6761\u91CC\u6709\u539F\u56E0\uFF08\u76EE\u6807\u4E0D\u53EF\u8FBE / docker \u672A\u8FD0\u884C / \u6743\u9650\u4E0D\u8DB3\uFF09\u3002\u4FEE\u597D\u540E\u70B9\u53F3\u4E0A\u89D2\u5237\u65B0\u5373\u53EF\u3002"})]}):r("div",{className:"dk_empty",children:[e("div",{className:"dk_emptyTitle",children:m==="images"?"\u6CA1\u6709\u955C\u50CF":m==="compose"?"\u6CA1\u6709 Compose \u9879\u76EE":m==="networks"?"\u6CA1\u6709\u7F51\u7EDC":m==="volumes"?"\u6CA1\u6709\u5377":"\u6CA1\u6709\u5BB9\u5668"}),e("div",{className:"dk_emptyHint",children:Ce.trim()===""?"\u76EE\u6807\u4E0A\u6CA1\u6709\u5339\u914D\u7684\u6570\u636E\uFF0C\u6216\u7B5B\u9009\u6761\u4EF6\u8FC7\u7A84\u3002":"\u6CA1\u6709\u5339\u914D\u300C"+Ce.trim()+"\u300D\u7684\u7ED3\u679C\u3002"})]}),_r=()=>{if(m==="overview")return wn(ua(L),{onOpenTarget:sr,onOpenContainer:cr});if(m==="images")return r("div",{className:"dk_imagesView",children:[on.length===0?vt():e("div",{className:"dk_tableWrap",children:r("table",{className:"dk_images",children:[e("thead",{children:r("tr",{children:[e("th",{children:"\u955C\u50CF"}),e("th",{children:"\u5927\u5C0F"}),e("th",{children:"\u521B\u5EFA"}),e("th",{children:"ID"}),e("th",{className:"dk_colActions",children:"\u64CD\u4F5C"})]})}),e("tbody",{children:on.map(a=>r("tr",{children:[e("td",{className:"dk_mono",title:a.reference,children:a.dangling?"<none>\uFF08dangling\uFF09":a.reference}),e("td",{children:a.sizeText===""?a.size===null?"\u2014":Vt(a.size):a.sizeText}),e("td",{children:a.createdSince}),e("td",{className:"dk_mono",children:a.shortId}),e("td",{className:"dk_colActions",children:r("div",{className:"dk_rowActions",children:[e($,{icon:zr,title:"\u67E5\u770B\u955C\u50CF\u8BE6\u60C5\uFF08\u5C42 / \u6784\u5EFA\u5386\u53F2\uFF09",onClick:()=>G(a)},"inspect"),e($,{icon:Wt,danger:!0,disabled:n?.allowMutations!==!0,title:n?.allowMutations===!0?"\u5220\u9664\u955C\u50CF\uFF08\u4E0D\u53EF\u6062\u590D\uFF09":"\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",onClick:()=>pr(a)},"remove")]})},"actions")]},a.id+a.reference))})]})})]});if(m==="compose"){let a=Yt(Ye);return a.length===0?vt():e(Ha,{groups:a,onOpen:c=>Ee({project:c})})}return m==="networks"?r("div",{className:"dk_imagesView",children:[ln.length===0?vt():e("div",{className:"dk_tableWrap",children:r("table",{className:"dk_images",children:[e("thead",{children:r("tr",{children:[e("th",{children:"\u540D\u79F0"}),e("th",{children:"\u9A71\u52A8"}),e("th",{children:"\u8303\u56F4"}),e("th",{children:"\u5C5E\u6027"}),e("th",{children:"ID"})]})}),e("tbody",{children:ln.map(a=>r("tr",{className:"dk_rowClickable",onClick:()=>ye(a),title:"\u67E5\u770B\u7F51\u7EDC\u8BE6\u60C5",children:[e("td",{className:"dk_mono",title:a.name,children:a.name}),e("td",{children:a.driver===""?"\u2014":a.driver}),e("td",{children:a.scope===""?"\u2014":a.scope}),e("td",{children:a.internal?e("span",{className:"dk_badge","data-state":"paused",children:"internal"}):"\u2014"}),e("td",{className:"dk_mono",title:a.id,children:a.shortId})]},a.id+a.name))})]})})]}):m==="volumes"?r("div",{className:"dk_imagesView",children:[dn.length===0?vt():e("div",{className:"dk_tableWrap",children:r("table",{className:"dk_images",children:[e("thead",{children:r("tr",{children:[e("th",{children:"\u540D\u79F0"}),e("th",{children:"\u9A71\u52A8"}),e("th",{children:"\u8303\u56F4"}),e("th",{children:"\u6302\u8F7D\u70B9"})]})}),e("tbody",{children:dn.map(a=>r("tr",{className:"dk_rowClickable",onClick:()=>Pe(a),title:"\u67E5\u770B\u5377\u8BE6\u60C5",children:[e("td",{className:"dk_mono",title:a.name,children:a.name}),e("td",{children:a.driver===""?"\u2014":a.driver}),e("td",{children:a.scope===""?"\u2014":a.scope}),e("td",{className:"dk_mono dk_pathCell",title:a.mountpoint,children:a.mountpoint===""?"\u2014":a.mountpoint})]},a.name))})]})})]}):Ye.length===0?vt():e("div",{className:"dk_grid",key:U===""?"first":U,children:Ye.map(a=>e(La,{item:a,selected:We!==null&&a.id===We.id,allowMutations:n?.allowMutations===!0,pickMode:ke,picked:de.includes(a.id),pending:Rt[a.id],onTogglePick:dr,onOpen:(c,x)=>He({id:c.id,tab:x,item:c}),onExec:gr,onAction:hr,onCopyExec:c=>{navigator.clipboard.writeText("docker exec -it "+c.name+" sh").then(()=>le("\u5DF2\u590D\u5236\uFF1Adocker exec -it "+c.name+" sh")).catch(()=>le("\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u590D\u5236"))}},a.id))})},Te=t.docked===!0,yr=n??{pollIntervalSec:5,logTailDefault:200,allowExec:!1,allowMutations:!1,execTimeoutSec:30},bt=sa(D,de),xr=ra(bt.length),Kn=bt.length>0?bt[0]:null,wr=da(Ye,de,Kn,Qe),Nr=a=>{let c=ia(Ye,de,a,Kn,Qe);J(c.ids),c.skipped>0?Ae("\u5DF2\u65B0\u589E "+String(c.added)+" \u4E2A\uFF0C\u53E6\u6709 "+String(c.skipped)+" \u4E2A\u8D85\u51FA\u4E0A\u9650\uFF08\u6700\u591A "+String(Qe)+" \u4E2A\u6D41\uFF09\u672A\u9009"):c.added===0?Ae("\u6CA1\u6709\u53EF\u65B0\u589E\u7684\u5BB9\u5668\uFF08\u5DF2\u88AB\u52FE\u9009\u6216\u4E0D\u5728\u5F53\u524D\u7B5B\u9009\u7ED3\u679C\u91CC\uFF09"):Ae("\u5DF2\u65B0\u589E "+String(c.added)+" \u4E2A")},Sr=me===null?[]:Yt(D).find(a=>a.project===me.project)?.items??[],Jn=At!==null?e(Ra,{item:At,target:u,targetLabel:Re(u),config:yr,initialTab:We.tab,refreshToken:Lt,onBack:()=>He(null),onRefresh:lr,onClose:Ge,docked:Te},"detail"):q!==null?e(Ma,{item:N.find(a=>a.id===q.id)??q,target:u,targetLabel:Re(u),onBack:()=>G(null),onClose:Ge,docked:Te},"imageDetail"):nt?e(ja,{target:u,targetLabel:Re(u),allowMutations:n?.allowMutations===!0,onBack:()=>De(!1),onDone:pt,onClose:Ge,docked:Te},"pull"):me!==null?e(za,{project:me.project,items:Sr,target:u,targetLabel:Re(u),onBack:()=>Ee(null),onClose:Ge,docked:Te},"composeDetail"):ve?e(qa,{items:bt,target:u,targetLabel:Re(u),onBack:Ie,onClose:Ge,docked:Te},"aggregate"):ne!==null?e(Ba,{item:ne,target:u,targetLabel:Re(u),allowMutations:n?.allowMutations===!0,onBack:()=>ye(null),onRemoved:Vn(()=>ye(null),Bt),onClose:Ge,docked:Te},"networkDetail"):xe!==null?e(Pa,{item:xe,target:u,targetLabel:Re(u),allowMutations:n?.allowMutations===!0,onBack:()=>Pe(null),onRemoved:Vn(()=>Pe(null),Pt),onClose:Ge,docked:Te},"volumeDetail"):null,Cr=[Jn!==null?[Jn,be===null?null:e(it,{title:be.title,text:be.text,confirmLabel:be.confirmLabel,busy:Ot,onCancel:()=>Ne(null),onConfirm:be.run},"confirm")]:[Te?null:r("div",{className:"dk_header",children:[e("span",{className:"dk_titleIcon",dangerouslySetInnerHTML:{__html:ea}}),e("span",{className:"dk_title",children:"Docker \u5BB9\u5668"}),n?.allowMutations===!0?null:e("span",{className:"dk_badge","data-state":"paused",children:"\u53EA\u8BFB\u6A21\u5F0F"}),e("span",{className:"dk_headerSpacer"}),At!==null?null:e("button",{type:"button",className:"dk_iconBtn",title:"\u5237\u65B0\u5217\u8868","data-spin":Se?"1":void 0,onClick:mt,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Xe}})}),e("button",{type:"button",className:"dk_iconBtn",title:"\u5173\u95ED\u9762\u677F",onClick:Ge,children:e("span",{dangerouslySetInnerHTML:{__html:Be}})})]}),At!==null?null:r("div",{className:"dk_toolbar",children:[e("select",{className:"dk_select",value:m==="overview"?"":u,onChange:a=>{v(a.target.value),B(""),O("containers"),He(null),Ie(),qe({}),t.onTargetChange?.(Re(a.target.value))},children:[...m==="overview"?[e("option",{value:"",children:"\uFF08\u603B\u89C8 \xB7 \u5168\u90E8\u76EE\u6807\uFF09"},"__overview")]:u===""?[e("option",{value:"",children:"\uFF08\u672A\u9009\u62E9\u76EE\u6807\uFF09"},"__none")]:[],...(l.length===0&&u!==""?[{name:u,label:void 0}]:l).map(a=>e("option",{value:a.name,children:Re(a.name)},a.name))]}),l.length<2?null:e("button",{type:"button",className:"dk_pill dk_pillOverview","data-on":m==="overview"?"1":"0",title:m==="overview"?"\u9000\u51FA\u603B\u89C8\uFF0C\u56DE\u5230\u5F53\u524D\u76EE\u6807\u7684\u5BB9\u5668\u5217\u8868":"\u4E0D\u9009\u76EE\u6807\uFF0C\u4E00\u5C4F\u770B\u5168\u90E8\u76EE\u6807\u7684\u5BB9\u5668\u6982\u51B5\uFF08\u53EA\u8BFB\uFF09",onClick:()=>{if(m!=="overview"){O("overview"),B(""),He(null),Ie();return}O("containers"),He(null),Ie()},children:"\u603B\u89C8"}),e("div",{className:"dk_seg",children:[["containers","\u5BB9\u5668"],["images","\u955C\u50CF"],["compose","Compose"],["networks","\u7F51\u7EDC"],["volumes","\u5377"]].map(([a,c])=>e("button",{type:"button",className:"dk_segBtn","data-on":m===a?"1":"0",onClick:()=>{O(a),He(null),G(null),Ee(null),ye(null),Pe(null),De(!1),Ie()},children:c},a))}),m==="containers"?e("button",{type:"button",className:"dk_pill dk_pillPick","data-on":ke?"1":"0",title:ke?"\u9000\u51FA\u9009\u62E9\u5E76\u6E05\u7A7A\u52FE\u9009\uFF08Esc\uFF09":"\u591A\u9009\u5BB9\u5668\uFF0C\u628A\u5B83\u4EEC\u7684\u65E5\u5FD7\u4E34\u65F6\u805A\u5408\u6210\u4E00\u6761\u6D41",onClick:ir,children:ke?"\u9000\u51FA\u9009\u62E9":"\u805A\u5408\u9009\u62E9"}):null,m==="containers"?e("input",{className:"dk_input dk_search",placeholder:"\u641C\u7D22\u540D\u79F0 / \u955C\u50CF / ID",value:Ce,onChange:a=>at(a.target.value)}):null,m==="compose"?e("input",{className:"dk_input dk_search",placeholder:"\u641C\u7D22\u9879\u76EE / \u670D\u52A1 / \u5BB9\u5668",value:Ce,onChange:a=>at(a.target.value)}):null,m==="images"?e("input",{className:"dk_input dk_search",placeholder:"\u641C\u7D22\u955C\u50CF\uFF08\u4ED3\u5E93 / \u6807\u7B7E / ID\uFF09",value:Mt,onChange:a=>tn(a.target.value)}):null,m==="images"?e("span",{className:"dk_hint dk_searchCount",children:String(on.length)+" / "+String(N.length)+" \u4E2A\u955C\u50CF"}):null,m==="images"?e($,{icon:Hr,disabled:n?.allowMutations!==!0,title:n?.allowMutations===!0?"\u62C9\u53D6\u955C\u50CF\uFF08docker pull\uFF0C\u9010\u5C42\u5B9E\u65F6\u8FDB\u5EA6\uFF09":"\u62C9\u53D6\u955C\u50CF\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",onClick:()=>De(!0)},"pull"):null,m==="images"?e($,{icon:gn,danger:!0,disabled:n?.allowMutations!==!0,title:n?.allowMutations===!0?"\u6E05\u7406 dangling\uFF08\u65E0\u6807\u7B7E\uFF09\u955C\u50CF":"\u6E05\u7406 dangling \u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",onClick:mr},"prune"):null,m==="networks"?e("input",{className:"dk_input dk_search",placeholder:"\u641C\u7D22\u7F51\u7EDC\uFF08\u540D\u79F0 / \u9A71\u52A8 / ID\uFF09",value:_,onChange:a=>E(a.target.value)}):null,m==="volumes"?e("input",{className:"dk_input dk_search",placeholder:"\u641C\u7D22\u5377\uFF08\u540D\u79F0 / \u9A71\u52A8 / \u6302\u8F7D\u70B9\uFF09",value:y,onChange:a=>W(a.target.value)}):null,m==="networks"?e("span",{className:"dk_hint dk_searchCount",children:String(ln.length)+" / "+String(g.length)+" \u4E2A\u7F51\u7EDC"}):null,m==="volumes"?e("span",{className:"dk_hint dk_searchCount",children:String(dn.length)+" / "+String(w.length)+" \u4E2A\u5377"}):null,m==="networks"?e($,{icon:gn,danger:!0,disabled:n?.allowMutations!==!0,title:n?.allowMutations===!0?"\u6E05\u7406\u672A\u4F7F\u7528\u7684\u7F51\u7EDC\uFF08docker network prune\uFF09":"\u6E05\u7406\u7F51\u7EDC\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",onClick:fr},"prune"):null,m==="volumes"?e($,{icon:gn,danger:!0,disabled:n?.allowMutations!==!0,title:n?.allowMutations===!0?"\u6E05\u7406\u672A\u4F7F\u7528\u7684\u5377\uFF08docker volume prune\uFF0C\u4F1A\u5220\u6570\u636E\uFF09":"\u6E05\u7406\u5377\u9700\u8981\u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D",onClick:vr},"prune"):null,m==="compose"?e("span",{className:"dk_hint dk_searchCount",children:String(Yt(Ye).length)+" \u4E2A\u9879\u76EE \xB7 "+String(Ye.length)+" \u4E2A\u5BB9\u5668"}):null,m==="containers"?e("div",{className:"dk_seg",children:[["all","\u5168\u90E8"],["running","\u8FD0\u884C\u4E2D"],["stopped","\u5DF2\u505C\u6B62"],["unhealthy","\u4E0D\u5065\u5EB7"]].map(([a,c])=>e("button",{type:"button",className:"dk_segBtn","data-on":rt===a?"1":"0",onClick:()=>je(a),children:c},a))}):null,m==="containers"||m==="compose"||m==="overview"?r("div",{className:"dk_toolbarToggles",children:[m==="containers"||m==="compose"?e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:ge,onChange:a=>Oe(a.target.checked)}),"\u542B\u5DF2\u505C\u6B62"]},"all"):null,e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:ot,onChange:a=>Nt(a.target.checked)}),"\u81EA\u52A8\u5237\u65B0"]},"auto")]}):null,Te?r("div",{className:"dk_toolbarEnd",children:[n?.allowMutations!==!0?e("span",{className:"dk_badge","data-state":"paused",children:"\u53EA\u8BFB\u6A21\u5F0F"},"readonly"):null,e("button",{type:"button",className:"dk_iconBtn",title:"\u5237\u65B0\u5217\u8868","data-spin":Se?"1":void 0,onClick:mt,children:e("span",{className:"dk_iconGlyph",dangerouslySetInnerHTML:{__html:Xe}})},"refresh")]}):null]}),m==="containers"&&ke?e(Ua,{count:bt.length,info:xr,presets:wr,notice:ee,onPreset:Nr,onClear:()=>{J([]),Ae("")},onRun:()=>we(!0),onCancel:Ie},"pickBar"):null,r("div",{className:"dk_body","data-stale":Wn?"1":void 0,children:[Wn?e("div",{className:"dk_switchOverlay",children:br()},"stale"):null,r("div",{className:"dk_main"+(m==="images"||m==="networks"||m==="volumes"||m==="overview"?" dk_mainImages":""),children:[ae===""||m==="overview"?null:e(Y,{title:"\u64CD\u4F5C\u5931\u8D25",hint:ae}),fe===""?null:e(Y,{kind:"info",title:fe}),t.sessionHint===void 0?null:e(Y,{kind:"info",title:"\u5F53\u524D\u4F1A\u8BDD\u4E3B\u673A\u8FD8\u6CA1\u914D\u7F6E\u4E3A Docker \u76EE\u6807",hint:"\u4F1A\u8BDD\u4E3B\u673A\uFF1A"+t.sessionHint.host+(t.sessionHint.port===22?"":":"+String(t.sessionHint.port))+(t.sessionHint.book===""?"":"\uFF08\u8FDE\u63A5\u7C3F\uFF1A"+t.sessionHint.book+"\uFF09")+" \u2014 \u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6DFB\u52A0\u4E00\u6761 kind=ssh \u76EE\u6807"+(t.sessionHint.book===""?"\uFF08\u586B host/username\uFF0C\u6216\u7528\u8FDE\u63A5\u7C3F\u6761\u76EE\uFF09":"\uFF0C\u76F4\u63A5\u9009\u8FDE\u63A5\u7C3F\u6761\u76EE\u300C"+t.sessionHint.book+"\u300D")+"\uFF0C\u4FDD\u5B58\u540E\u56DE\u5230\u8FD9\u91CC\u5237\u65B0\u5373\u53EF\u3002"}),n!==null&&n.allowMutations!==!0?e(Y,{kind:"info",title:"\u5F53\u524D\u4E3A\u53EA\u8BFB\u6A21\u5F0F",hint:"\u5BB9\u5668\u7684\u542F\u52A8 / \u505C\u6B62 / \u91CD\u542F / \u5220\u9664\uFF0C\u4EE5\u53CA\u955C\u50CF\u3001\u7F51\u7EDC\u3001\u5377\u7684\u5220\u9664\u4E0E\u6E05\u7406\uFF0C\u90FD\u9700\u8981\u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 Docker \u5BB9\u5668\u9762\u677F \u6253\u5F00\u300C\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\u300D\u3002"}):null,m==="containers"?e(Ja,{events:St,status:Ve,statusText:kr(),open:Ct,onToggle:()=>en(a=>!a)},"activity"):null,_r()]})]}),be===null?null:e(it,{title:be.title,text:be.text,confirmLabel:be.confirmLabel,busy:Ot,onCancel:()=>Ne(null),onConfirm:be.run})],se===null?null:e(Ya,{label:se.label,hostRef:H,collapsed:z,height:Ke,onToggleCollapse:()=>ue(a=>!a),onResizeStart:or,onClose:()=>V(null)},"execDrawer"),rr&&se!==null?e(it,{title:"\u7ED3\u675F\u5BB9\u5668\u7EC8\u7AEF\u4F1A\u8BDD",text:"\u5173\u95ED\u9762\u677F\u4F1A\u7ED3\u675F\u300C"+se.label+"\u300D\u7684\u7EC8\u7AEF\u4F1A\u8BDD\uFF08docker exec -it \u2026\uFF09\u3002\u82E5\u53EA\u662F\u60F3\u7ED9\u65E5\u5FD7 / \u5217\u8868\u817E\u5730\u65B9\uFF0C\u5148\u70B9\u62BD\u5C49\u53F3\u4E0A\u89D2\u7684\u6298\u53E0\u6309\u94AE\u5373\u53EF\uFF0C\u4F1A\u8BDD\u4F1A\u4FDD\u6301\u8FD0\u884C\u3002",confirmLabel:"\u7ED3\u675F\u5E76\u5173\u95ED",onCancel:()=>nn(!1),onConfirm:()=>{nn(!1),t.onClose()}},"closeConfirm"):null],Un=r("div",{className:"dk_panel"+(Te?" dk_panelDock":""),"data-dock":Te?"1":void 0,ref:zn,onMouseDown:a=>a.stopPropagation(),children:Cr});return Te?Un:r("div",{className:"dk_backdrop",onMouseDown:a=>{an.current=a.target===a.currentTarget},onMouseUp:a=>{let c=an.current&&a.target===a.currentTarget;an.current=!1,c&&Ge()},children:[Un]})}function $a(){let[t,n]=s(!1),[i,l]=s(null),[p,k]=s(!1),[f,u]=s(!1),[v,S]=s({kind:"",text:""}),m=R(0),O=ie(()=>{X.config().then(g=>{l(g.config),un(g.config),m.current=Array.isArray(g.config?.targets)?g.config.targets.length:0,k(!0)}).catch(g=>{S({kind:"error",text:"\u8BFB\u53D6\u914D\u7F6E\u5931\u8D25\uFF1A"+g.message}),k(!0)})},[]);T(()=>{t&&!p&&O()},[t,p,O]);let D=g=>l(h=>({...h,...g})),M=(g,h)=>l(w=>{let K=w.targets.slice();return K[g]={...K[g],...h},{...w,targets:K}}),U=()=>l(g=>({...g,targets:[...g.targets,{name:"\u76EE\u6807"+String(g.targets.length+1),kind:"local",book:"",host:"",port:22,username:"",auth:"agent",keyPath:"",agentForward:!1,passwordSet:!1,passphraseSet:!1}]})),te=g=>l(h=>({...h,targets:h.targets.filter((w,K)=>K!==g)})),b=g=>l(h=>({...h,hostKeys:h.hostKeys.filter(w=>!(w.host===g.host&&w.port===g.port))})),P=()=>{u(!0),S({kind:"",text:""});let g={enabled:i.enabled,announceToAgent:i.announceToAgent,dockerBin:i.dockerBin,allowMutations:i.allowMutations,allowExec:i.allowExec,execTimeoutSec:i.execTimeoutSec,pollIntervalSec:i.pollIntervalSec,logTailDefault:i.logTailDefault,maxOutputKb:i.maxOutputKb,targets:i.targets.map(h=>({name:h.name,kind:h.kind,book:h.book??"",host:h.host??"",port:Number(h.port)||22,username:h.username??"",auth:h.auth??"agent",keyPath:h.keyPath??"",...h.password===void 0||h.password===""?{}:{password:h.password},...h.passphrase===void 0||h.passphrase===""?{}:{passphrase:h.passphrase},agentForward:h.agentForward===!0})),hostKeys:i.hostKeys,...i.targets.length===0&&m.current>0?{clearTargets:!0}:{}};X.saveConfig(g).then(h=>{l(h.config),un(h.config),m.current=Array.isArray(h.config?.targets)?h.config.targets.length:0,Kt(),S(h.warning===void 0?{kind:"ok",text:"\u5DF2\u4FDD\u5B58\u5E76\u70ED\u751F\u6548"}:{kind:"error",text:h.warning})}).catch(h=>{S({kind:"error",text:"\u4FDD\u5B58\u5931\u8D25\uFF1A"+h.message})}).finally(()=>u(!1))},L=g=>e("div",{className:"dk_cardSection",children:g}),A=(g,h,w,K)=>r("div",{className:"dk_field","data-span":K===void 0?void 0:String(K),children:[e("span",{className:"dk_label",children:g}),h,w===void 0?null:e("span",{className:"dk_hint",children:w})]}),N=(g,h,w,K)=>e("input",{className:"dk_input",type:"number",min:h,max:w,value:i[g],onChange:q=>D({[g]:Number(q.target.value)})}),Z=g=>r("li",{className:"dk_settingsCard"+(t?" dk_settingsCardOpen":""),children:[r("button",{type:"button",className:"dk_settingsHead","aria-expanded":t,onClick:()=>n(h=>!h),children:[r("span",{className:"dk_settingsHeadText",children:[e("span",{className:"dk_settingsName",children:"Docker \u5BB9\u5668\u9762\u677F"}),e("span",{className:"dk_settingsDesc",children:"\u672C\u673A / SSH \u4E3B\u673A\u4E0A\u7684\u5BB9\u5668\u4E0E\u955C\u50CF\uFF1B\u9ED8\u8BA4\u53EA\u8BFB\uFF0C\u53D8\u66F4\u64CD\u4F5C\u9700\u663E\u5F0F\u5F00\u542F"})]}),e("span",{className:"dshkit_badge",children:"Kit"}),e("span",{className:"dk_settingsChevron",dangerouslySetInnerHTML:{__html:kn}})]}),t?e("div",{className:"dk_settingsBody",children:g}):null]});return Z(t?!p||i===null?r("div",{className:"dk_row",children:[e("span",{className:"dk_spin"}),"\u8BFB\u53D6\u914D\u7F6E\u2026"]}):[L("\u57FA\u672C"),r("div",{className:"dk_row",children:[e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:i.enabled,onChange:g=>D({enabled:g.target.checked})}),"\u542F\u7528\u63D2\u4EF6"]}),e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:i.announceToAgent,onChange:g=>D({announceToAgent:g.target.checked})}),"\u5411 agent \u516C\u544A\u80FD\u529B"]})]}),r("div",{className:"dk_fieldGrid",children:[A("docker CLI",e("input",{className:"dk_input",value:i.dockerBin,onChange:g=>D({dockerBin:g.target.value})}),"\u9ED8\u8BA4 docker\uFF1Bpodman \u53EF\u586B podman"),A("\u7EDF\u8BA1\u5237\u65B0\u95F4\u9694\uFF08\u79D2\uFF09",N("pollIntervalSec",1,60)),A("\u65E5\u5FD7\u9ED8\u8BA4\u884C\u6570",N("logTailDefault",1,5e3)),A("\u8F93\u51FA\u4E0A\u9650\uFF08KB\uFF09",N("maxOutputKb",1,8192)),A("exec \u8D85\u65F6\uFF08\u79D2\uFF09",N("execTimeoutSec",1,120))]}),L("\u80FD\u529B\u5F00\u5173\uFF08\u9ED8\u8BA4\u5173\u95ED\uFF09"),r("div",{className:"dk_row",children:[e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:i.allowMutations,onChange:g=>D({allowMutations:g.target.checked})}),"\u5141\u8BB8\u53D8\u66F4\u64CD\u4F5C\uFF08\u5BB9\u5668\u542F\u505C\u5220\u3001\u955C\u50CF\u62C9\u53D6 / \u5220\u9664 / \u6E05\u7406\uFF09"]}),e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:i.allowExec,onChange:g=>D({allowExec:g.target.checked})}),"\u5141\u8BB8 exec\uFF08\u5728\u5BB9\u5668\u5185\u6267\u884C\u547D\u4EE4\uFF09"]})]}),e("span",{className:"dk_hint",children:"docker socket \u7B49\u4EF7\u4E8E\u76EE\u6807\u4E3B\u673A\u7684 root \u6743\u9650\u3002\u5F00\u542F\u540E\uFF0C\u6D4F\u89C8\u5668\u9762\u677F\u4E0E agent \u90FD\u80FD\u6267\u884C\u5BF9\u5E94\u64CD\u4F5C\uFF0C\u8BF7\u53EA\u5728\u53EF\u4FE1\u73AF\u5883\u4E0B\u6253\u5F00\u3002"}),L("\u76EE\u6807"),...i.targets.map((g,h)=>r("div",{className:"dk_targetRow",children:[e("input",{className:"dk_input",value:g.name,placeholder:"\u76EE\u6807\u540D",onChange:w=>M(h,{name:w.target.value})}),e("select",{className:"dk_select",value:g.kind,onChange:w=>M(h,{kind:w.target.value}),children:[e("option",{value:"local",children:"\u672C\u673A"}),e("option",{value:"ssh",children:"SSH \u4E3B\u673A"})]}),g.kind==="local"?e("span",{className:"dk_hint",children:"\u5BBF\u4E3B\u6240\u5728\u673A\u5668\u4E0A\u7684 docker"}):r("div",{className:"dk_row",style:{gridColumn:"span 1"},children:[e("select",{className:"dk_select",value:g.book??"",onChange:w=>M(h,{book:w.target.value}),children:[e("option",{value:"",children:i.ttyBooks.length===0?"\uFF08\u65E0 tty \u8FDE\u63A5\u7C3F\uFF0C\u8BF7\u586B\u5185\u8054\u4FE1\u606F\uFF09":"\uFF08\u4E0D\u7528\u8FDE\u63A5\u7C3F\uFF0C\u624B\u586B\uFF09"}),...i.ttyBooks.map(w=>e("option",{value:w,children:"\u8FDE\u63A5\u7C3F\uFF1A"+w},w))]})]}),e("button",{type:"button",className:"dk_btn dk_btnDanger",onClick:()=>te(h),children:"\u5220\u9664"}),g.kind==="ssh"&&(g.book??"")===""?r("div",{className:"dk_targetInline",children:[e("input",{className:"dk_input",placeholder:"host",value:g.host??"",onChange:w=>M(h,{host:w.target.value})}),e("input",{className:"dk_input",placeholder:"22",title:"\u7AEF\u53E3",value:g.port??22,onChange:w=>M(h,{port:Number(w.target.value)||22})}),e("input",{className:"dk_input",placeholder:"username",value:g.username??"",onChange:w=>M(h,{username:w.target.value})}),e("select",{className:"dk_select",value:g.auth??"agent",onChange:w=>M(h,{auth:w.target.value}),children:[e("option",{value:"agent",children:"ssh-agent"}),e("option",{value:"key",children:"\u79C1\u94A5"}),e("option",{value:"password",children:"\u5BC6\u7801"})]}),(g.auth??"agent")==="key"?e("input",{className:"dk_input dk_credential",placeholder:"~/.ssh/id_ed25519",value:g.keyPath??"",onChange:w=>M(h,{keyPath:w.target.value})}):null,(g.auth??"agent")==="password"?e("input",{className:"dk_input dk_credential",type:"password",placeholder:g.passwordSet===!0?"\uFF08\u5DF2\u8BBE\u7F6E\uFF0C\u7559\u7A7A\u4FDD\u6301\u4E0D\u53D8\uFF09":"env:SSH_PASSWORD",value:g.password??"",onChange:w=>M(h,{password:w.target.value})}):null,e("label",{className:"dk_check",children:[e("input",{type:"checkbox",checked:g.agentForward===!0,onChange:w=>M(h,{agentForward:w.target.checked})}),"agent forwarding"]})]}):null]},String(h)+g.name)),r("div",{className:"dk_row",children:[e("button",{type:"button",className:"dk_btn",onClick:U,children:"\u6DFB\u52A0\u76EE\u6807"}),e("span",{className:"dk_hint",children:"SSH \u76EE\u6807\u63A8\u8350\u76F4\u63A5\u9009 tty \u7EC8\u7AEF\u9762\u677F\u7684\u8FDE\u63A5\u7C3F\u6761\u76EE\uFF08\u51ED\u8BC1\u53EA\u9700\u7EF4\u62A4\u4E00\u5904\uFF09\uFF1B\u624B\u586B\u65F6\u5BC6\u7801 / \u53E3\u4EE4\u5EFA\u8BAE\u5199 env:VAR\u3002"})]}),L("SSH \u4E3B\u673A\u5BC6\u94A5\u8BB0\u5F55\uFF08TOFU\uFF09"),...i.hostKeys.length===0?[e("span",{className:"dk_hint",children:"\u6682\u65E0\u8BB0\u5F55 \u2014 \u9996\u6B21 SSH \u8FDE\u63A5\u6210\u529F\u540E\u81EA\u52A8\u8BB0\u5F55\u4E3B\u673A\u6307\u7EB9\uFF08\u82E5 tty \u5DF2\u8BB0\u5F55\u540C\u4E00\u4E3B\u673A\uFF0C\u4F1A\u76F4\u63A5\u590D\u7528\uFF09\u3002"},"none")]:i.hostKeys.map(g=>r("div",{className:"dk_targetRow",children:[e("span",{children:g.host+":"+String(g.port)}),e("span",{className:"dk_hint",style:{gridColumn:"span 2",wordBreak:"break-all"},children:"sha256:"+g.fingerprint}),e("button",{type:"button",className:"dk_btn",onClick:()=>b(g),children:"\u5220\u9664"})]},g.host+":"+String(g.port))),e("span",{className:"dk_hint",children:"\u6307\u7EB9\u53D8\u66F4\u65F6\u8FDE\u63A5\u4F1A\u88AB\u62D2\u7EDD\uFF08\u9632\u4E2D\u95F4\u4EBA\uFF09\uFF1B\u786E\u8BA4\u5B89\u5168\u540E\u5220\u9664\u5BF9\u5E94\u8BB0\u5F55\u5373\u53EF\u91CD\u8FDE\u3002"}),r("div",{className:"dk_row",children:[e("button",{type:"button",className:"dk_btn dk_btnPrimary",disabled:f,onClick:P,children:f?"\u4FDD\u5B58\u4E2D\u2026":"\u4FDD\u5B58"}),e("span",{className:"dk_msg","data-kind":v.kind,children:v.text})]})]:null)}let ct=null,tt=null,Qt=null;function ut(){let t=tt,n=ct,i=Qt;if(tt=null,ct=null,Qt=null,n!==null&&n.remove(),t!==null&&setTimeout(()=>{try{t.unmount()}catch{}},0),i!==null)try{i.dispose()}catch{}}function Xa(t){return t!==null&&typeof t=="object"&&typeof t.appendChild=="function"}function Za(){return typeof $e?.mountPane=="function"&&typeof $e.isOpen=="function"&&Number($e.version??0)>=1&&$e.isOpen()===!0}function jn(t){ut(),sn();let n={onClose:ut,initialTarget:t?.target??"",sessionHint:t?.sessionHint};if(Za()){let i=null;try{i=$e.mountPane({title:"Docker \u5BB9\u5668",hint:t?.target===void 0||t.target===""?"":t.target,size:520,min:360,onClose:()=>ut()})}catch(l){i=null,console.warn("[dsh-docker] \u6302\u8F7D\u5230\u7EC8\u7AEF\u9762\u677F\u5931\u8D25\uFF0C\u56DE\u9000\u5F39\u7A97\uFF1A"+(l instanceof Error?l.message:String(l)))}if(i!==null&&Xa(i.element)){Qt=i,tt=C(i.element),tt.render(e(An,{...n,docked:!0,onTargetChange:l=>{try{i.setHint(l)}catch{}}}));return}}ct=document.createElement("div"),document.body.appendChild(ct),tt=C(ct),tt.render(e(An,n))}function Qa(){let t=document.querySelector('[data-pane="sidebar"], [class*="sidebarCol"]');if(t!==null)return t.querySelector('[class*="logoRow"]')?.parentElement??t.firstElementChild}function er(t){let n=t.querySelector('button[class*="newSession"]');if(n!==null)return n;for(let i of t.children)if(i.tagName==="BUTTON")return i}function tr(){let t=document.createElement("div");return t.dataset.dshDockerEntry="",t.className="dk_sidebarEntry",t.setAttribute("role","button"),t.setAttribute("aria-label","\u5BB9\u5668"),t.innerHTML='<span class="dk_entryIcon">'+ea+'</span><span class="dk_entryLabel">\u5BB9\u5668</span>',t.addEventListener("click",n=>{n.preventDefault(),jn()}),t}function Hn(t,n){let i=er(t);if(i===void 0)return!1;if(n.parentElement!==t){let l=i.closest('[class*="logoRow"]'),p=l!==null&&l.parentElement===t?l:i,k=Array.from(t.children).filter(f=>f instanceof HTMLElement&&f.matches("[data-dsh-global-search-entry], [data-dsh-rss-entry], [data-dsh-taskboard-entry], [data-dsh-ssh-entry], [data-dsh-tty-entry], [data-dsh-docker-entry]"));if(k.length>0){let f=k[k.length-1];t.insertBefore(n,f.nextSibling)}else t.insertBefore(n,p.nextElementSibling)}return!0}function nr(){if(sn(),document.querySelector("[data-dsh-docker-entry]")!==null)return()=>{};let t=tr(),n,i=!1,l=()=>{if(n!==void 0&&!n.isConnected&&(k.disconnect(),n=void 0,i=!1),i){if(document.body.contains(t))return;k.disconnect(),n=void 0,i=!1}n??(n=Qa()),n!==void 0&&(i=Hn(n,t),i&&k.observe(n,{childList:!0,subtree:!0}))},p=new MutationObserver(()=>{l()});p.observe(document.body,{childList:!0,subtree:!0});let k=new MutationObserver(()=>{if(n===void 0||!n.isConnected){i=!1,l();return}n.contains(t)||(i=Hn(n,t))});return l(),()=>{p.disconnect(),k.disconnect(),t.remove()}}let Fe={};return Fe.inject=["slots"],Fe.__pick={MAX:Qe,PRESETS:xa,presetCounts:da,apply:ia,SOFT_MAX:ya,decide:ra,toggle:oa,reconcile:la,items:sa},Fe.__events={LIMIT:ka,RECENT:ga,DEBOUNCE_MS:ha,append:pa,actionText:fa,timeText:ma,debounce:va},Fe.__overview={ERROR_MAX:mn,counts:Sa,abnormal:fn,sortRows:Ca,patch:yt,errorText:Ta,data:ua,body:wn},Fe.__listSeq={make:ca},Fe.__panel={chooseInitialTarget:cn,readLastTarget:Zn,writeLastTarget:Qn,LAST_TARGET_KEY:bn},Fe.__aggLogs={mergeBuffered:Pn,WINDOW_MS:$t,splitTs:In,levelName:Rn,orderByTs:Xt,REORDER_TAIL:Zt,reorderTail:wt,filterByLevel:Mn,exportText:Bn},Fe.apply=t=>{sn();let n=!1,i=()=>{};Jt={set(k){if(k!==n){if(n=k,k){i=nr();return}i(),i=()=>{},ut(),typeof Gt?.requestRender=="function"&&Gt.requestRender()}}},ba(!0);let l=t.slots.inject("settings.plugin.item",()=>t.slots.register({name:"settings.plugin.item",key:"docker",order:102},$a));t.inject(["ttyTerminal"],k=>(Je=k.ttyTerminal??null,()=>{Je=null})),t.inject(["ttyPanel"],k=>($e=k.ttyPanel??null,()=>{$e=null}));let p=()=>{};return Kt(),t.inject(["ttyConnbar"],k=>{let f=k.ttyConnbar;f!==void 0&&(Gt=f,p=f.addAction(u=>{if(!Ut)return;let v=u?.spec??{};if(v.t!=="ssh")return;let S=typeof u?.bookName=="string"?u.bookName:"",m=pn(v,S),O=m!==void 0?`\u6253\u5F00\u8BE5\u4E3B\u673A\u7684 Docker \u5BB9\u5668\u9762\u677F\uFF08\u76EE\u6807\uFF1A${m}\uFF09`:Ue===null?"\u6253\u5F00\u5F53\u524D\u4F1A\u8BDD\u4E3B\u673A\u7684 Docker \u5BB9\u5668\u9762\u677F":"\u8BE5\u4E3B\u673A\u5C1A\u672A\u914D\u7F6E\u4E3A Docker \u76EE\u6807 \u2014 \u70B9\u51FB\u6253\u5F00\u9762\u677F\u67E5\u770B/\u914D\u7F6E";u.addAction(Rr,"\u5BB9\u5668",O,()=>{(async()=>{let D=await Ir(v,S),M=Number(v.port);jn({target:D??"",sessionHint:D===void 0?{host:typeof v.host=="string"?v.host:"",port:Number.isInteger(M)&&M>0?M:22,book:S}:void 0})})()})}),(async()=>{for(let u=0;u<3;u+=1){if(await Kt()){typeof f.requestRender=="function"&&f.requestRender();return}await new Promise(v=>setTimeout(v,2e3))}})())}),()=>{p(),l(),Jt=null,Ut=!1,Gt=null,i(),ut()}},Fe}});})();
