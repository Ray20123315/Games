import { SITE_I18N_DICTIONARY } from "./site-i18n-dict.js";

export const RESPONSIVE_STYLE = String.raw`<style id="boardverse-responsive">
@media (max-width:1024px){
html,body{width:100%!important;max-width:100vw!important;height:auto!important;min-height:100%!important;overflow-x:hidden!important;overflow-y:auto!important}
body{min-height:100vh!important;min-height:100dvh!important}
#bvPublicNav{position:static!important;width:calc(100% - 24px)!important;margin:10px 12px 0!important;justify-content:center!important;box-sizing:border-box!important}
.app-frame{width:100%!important;min-width:0!important;padding:12px!important;padding-left:max(12px,env(safe-area-inset-left))!important;padding-right:max(12px,env(safe-area-inset-right))!important;padding-bottom:max(12px,env(safe-area-inset-bottom))!important}
.topbar{min-width:0!important;align-items:flex-start!important;flex-wrap:wrap!important}.top-tools{min-width:0!important;flex-wrap:wrap!important}
.lobby-grid{grid-template-columns:minmax(0,1fr)!important}.game-list{grid-template-columns:repeat(2,minmax(0,1fr))!important}.room-layout{grid-template-columns:minmax(0,1fr)!important;height:auto!important}.room-main{min-width:0!important}.side-stack{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px!important;align-content:start!important}.side-stack>.chat-card,.side-stack>.rules-card,.side-stack>.room-notice{grid-column:1/-1!important}
.board-card{min-height:0!important}.board-stage{height:min(72vw,64dvh)!important;min-height:320px!important}.board-fit{max-width:100%!important;max-height:100%!important}.board{max-width:100%!important;max-height:100%!important}
.room-gate{width:100%!important;max-width:760px!important;margin:12px auto!important}.dialog-card,.confirm-card{max-width:calc(100vw - 24px)!important;max-height:calc(100dvh - 24px)!important;overflow:auto!important}
.wrap{width:100%!important;max-width:780px!important;box-sizing:border-box!important}
.controls{max-width:100%!important}.controls input{min-width:0!important}.events{max-width:100%!important}
.admin-frame{width:100%!important;height:auto!important;min-width:0!important;min-height:100vh!important;min-height:100dvh!important;max-width:none!important;display:grid!important;grid-template-rows:auto auto minmax(0,1fr)!important;overflow:visible!important;border-left:0!important;border-right:0!important}
.admin-frame .topbar{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;gap:10px!important;height:auto!important}.admin-frame .summary{grid-column:1/-1!important;grid-template-columns:repeat(5,minmax(0,1fr))!important}.admin-frame .top-actions{grid-column:2!important}.admin-frame .workspace{overflow:visible!important;min-height:0!important}.admin-frame .content-grid{grid-template-columns:minmax(0,1fr)!important}.admin-frame .panel{min-width:0!important}.admin-frame .scroll{max-width:100%!important;overflow:auto!important;-webkit-overflow-scrolling:touch}.admin-frame .room-table{min-width:780px!important}
}
@media (max-width:720px){
.app-frame{padding:10px!important;padding-left:max(10px,env(safe-area-inset-left))!important;padding-right:max(10px,env(safe-area-inset-right))!important;padding-bottom:max(10px,env(safe-area-inset-bottom))!important;gap:10px!important}
.topbar{display:flex!important;flex-direction:column!important;align-items:stretch!important;gap:10px!important}.brand{width:100%!important}.brand h1{font-size:18px!important}.brand p{white-space:normal!important;line-height:1.35!important}.top-tools{width:100%!important;display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px!important;justify-content:stretch!important}.top-tools>*{min-width:0!important;max-width:100%!important}.top-theme-setting,.sound-wrap{grid-column:1/-1!important}.top-theme-setting{justify-content:space-between!important;white-space:normal!important}.sound-wrap{width:100%!important}.sound-wrap input[type=range]{width:auto!important;min-width:0!important;flex:1 1 auto!important}.compact-select,.compact-btn{width:100%!important}
.hero{min-height:0!important;padding:16px!important}.hero h2{font-size:clamp(26px,9vw,38px)!important}.panel,.game-catalog,.rooms{padding:14px!important}.fields{grid-template-columns:minmax(0,1fr)!important}.field.full{grid-column:auto!important}.game-list,.room-columns,.role-actions,.players{grid-template-columns:minmax(0,1fr)!important}.rooms-head,.game-catalog-head,.gate-head,.room-header{align-items:stretch!important;flex-direction:column!important}.room-row{align-items:stretch!important;flex-direction:column!important}.room-row .btn{width:100%!important}.room-actions,.actions{width:100%!important}.room-actions .btn,.actions>.btn{flex:1 1 140px!important}.role-choice{min-height:88px!important}
.room-layout{display:block!important}.room-main{gap:8px!important}.board-card{padding:6px!important}.board-stage{height:min(94vw,70dvh)!important;min-height:250px!important;padding:2px!important}.line-board,.xiangqi-board{border-width:4px!important}.side-stack{display:grid!important;grid-template-columns:minmax(0,1fr)!important;margin-top:10px!important}.side-stack>*{grid-column:auto!important}.chat-form{max-width:100%!important}.chat-form input{min-width:0!important}
.dialog-card,.replay-dialog,.confirm-card{width:calc(100vw - 20px)!important;max-width:none!important;max-height:calc(100dvh - 20px)!important;margin:10px!important;overflow:auto!important}.replay-layout{grid-template-columns:minmax(0,1fr)!important}.replay-stage{min-width:0!important}.replay-controls,.controls{align-items:stretch!important}.controls input[type=range],.replay-controls input[type=range]{flex-basis:100%!important;min-width:0!important;width:100%!important}.board{max-width:100%!important}
.wrap{padding:12px!important;padding-left:max(12px,env(safe-area-inset-left))!important;padding-right:max(12px,env(safe-area-inset-right))!important}.wrap>.top{align-items:stretch!important;flex-direction:column!important}.wrap>.top select{width:100%!important}.wrap .card{padding:14px!important}.wrap button{max-width:100%!important}
#bvGlobalLang{top:auto!important;right:max(8px,env(safe-area-inset-right))!important;bottom:max(8px,env(safe-area-inset-bottom))!important;max-width:calc(100vw - 16px)!important}
.admin-frame .topbar{display:grid!important;grid-template-columns:minmax(0,1fr)!important;padding:12px!important;gap:10px!important}.admin-frame .brand,.admin-frame .summary,.admin-frame .top-actions{grid-column:1!important}.admin-frame .summary{grid-template-columns:repeat(2,minmax(0,1fr))!important}.admin-frame .top-actions{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;justify-content:stretch!important}.admin-frame .ghost-link,.admin-frame .gold-link{width:100%!important}.admin-nav{padding:8px 10px!important}.admin-frame .workspace{padding:10px!important;gap:10px!important}.workspace-head{align-items:stretch!important;flex-direction:column!important}.heading{min-width:0!important}.toolbar{justify-content:flex-start!important;width:100%!important}.toolbar>*{max-width:100%!important}.filter-wrap,.batch-reason{min-width:0!important;width:100%!important}.content-grid{display:block!important}.content-grid>.panel{margin-bottom:10px!important}.panel-bar{flex-wrap:wrap!important}.split,.triple{grid-template-columns:minmax(0,1fr)!important}.admin-frame .room-table{min-width:720px!important}.toast{max-width:calc(100vw - 20px)!important;min-width:0!important}
}
@media (max-width:480px){
.top-tools{grid-template-columns:minmax(0,1fr)!important}.top-theme-setting,.sound-wrap{grid-column:auto!important}.room-actions .btn,.actions>.btn{flex-basis:100%!important}.admin-frame .summary{grid-template-columns:repeat(2,minmax(0,1fr))!important}.admin-frame .metric:last-child{grid-column:1/-1!important}.admin-frame .top-actions{grid-template-columns:minmax(0,1fr)!important}
}
@media (pointer:coarse){
button,.btn,.compact-btn,.compact-select,input,select,textarea{touch-action:manipulation}.btn,.compact-btn,.compact-select,button{min-height:44px}input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]),select,textarea{font-size:max(16px,1em)!important}
}
@media (orientation:landscape) and (max-height:560px) and (max-width:1024px){
.app-frame{padding-top:8px!important}.board-stage{height:min(82dvh,72vw)!important;min-height:220px!important}
}
</style>`;

export const SITE_I18N_SCRIPT = RESPONSIVE_STYLE + String.raw`<script id="boardverse-site-i18n">
(function(){
'use strict';
var KEY='boardverseLang', SUPPORTED=['zh-Hant','zh-Hans','en'], locale='zh-Hant';
function get(){try{return localStorage.getItem(KEY)}catch(e){return null}}
function put(v){try{localStorage.setItem(KEY,v)}catch(e){}}
function norm(v){v=String(v||'').trim().replace(/_/g,'-').toLowerCase();if(!v)return null;if(v==='zh-hant'||v.indexOf('zh-hant-')===0||/^zh-(tw|hk|mo)(-|$)/.test(v))return 'zh-Hant';if(v==='zh-hans'||v.indexOf('zh-hans-')===0||/^zh-(cn|sg)(-|$)/.test(v))return 'zh-Hans';if(v==='zh'||v.indexOf('zh-')===0)return 'zh-Hant';if(v==='en'||v.indexOf('en-')===0)return 'en';return null}
function detect(){var saved=norm(get());if(saved)return saved;var xs=[];try{xs=Array.isArray(navigator.languages)?navigator.languages.slice():[]}catch(e){}try{if(navigator.language)xs.push(navigator.language)}catch(e){}for(var i=0;i<xs.length;i++){var hit=norm(xs[i]);if(hit)return hit}return 'zh-Hant'}
function htmlLang(v){return v==='zh-Hans'?'zh-Hans-CN':v==='en'?'en':'zh-Hant-TW'}
locale=detect();put(locale);document.documentElement.lang=htmlLang(locale);
var D=${JSON.stringify(SITE_I18N_DICTIONARY)};
var R=Object.create(null);Object.keys(D).forEach(function(k){D[k].forEach(function(v){R[v]=D[k]})});
function pick(t){return locale==='en'?t[2]:locale==='zh-Hans'?t[1]:t[0]}
function tr(s){var hit=R[String(s||'').trim()];return hit?pick(hit):String(s||'')}
function translate(el){if(!el||el.nodeType!==1)return;if(el.hasAttribute('data-bv-h')){var v=locale==='en'?el.getAttribute('data-bv-e'):locale==='zh-Hans'?el.getAttribute('data-bv-s'):el.getAttribute('data-bv-h');if(v!=null)el.textContent=v}['placeholder','aria-label','title'].forEach(function(a){if(el.hasAttribute(a)){var old=el.getAttribute(a),next=tr(old);if(next!==old)el.setAttribute(a,next)}});for(var i=0;i<el.childNodes.length;i++){var n=el.childNodes[i];if(n.nodeType===3){var raw=n.nodeValue||'',trim=raw.trim(),next=tr(trim);if(trim&&next!==trim)n.nodeValue=raw.replace(trim,next)}}}
function walk(root){if(!root)return;if(root.nodeType===1)translate(root);var all=root.querySelectorAll?root.querySelectorAll('*'):[];for(var i=0;i<all.length;i++)translate(all[i])}
function labels(s){if(!s||!s.options)return;for(var i=0;i<s.options.length;i++){var o=s.options[i];if(o.value==='zh-Hant')o.textContent='\u7e41\u9ad4\u4e2d\u6587';else if(o.value==='zh-Hans')o.textContent='\u7b80\u4f53\u4e2d\u6587';else if(o.value==='en')o.textContent='English'}}
function selectors(){return document.querySelectorAll('#languageSelect,#bvPageLang,#bvGlobalLang')}
function ensure(){var s=document.querySelector('#languageSelect,#bvPageLang,#bvGlobalLang');if(s)return s;s=document.createElement('select');s.id='bvGlobalLang';s.setAttribute('aria-label','Language');s.style.cssText='position:fixed;right:12px;top:12px;z-index:100000;background:#211c14;color:#f3ede2;border:1px solid #6d5936;border-radius:9px;padding:7px 9px;font:600 13px system-ui,sans-serif';[['zh-Hant','\u7e41\u9ad4\u4e2d\u6587'],['zh-Hans','\u7b80\u4f53\u4e2d\u6587'],['en','English']].forEach(function(x){var o=document.createElement('option');o.value=x[0];o.textContent=x[1];s.appendChild(o)});document.body.appendChild(s);return s}
function setLocale(v){var n=norm(v);if(!n||SUPPORTED.indexOf(n)<0||n===locale)return;put(n);location.reload()}
function bind(){ensure();selectors().forEach(function(s){labels(s);s.value=locale;if(s.dataset.bvSiteI18n)return;s.dataset.bvSiteI18n='1';s.addEventListener('change',function(){setLocale(this.value)})});walk(document.body)}
window.BoardVerseI18n={getLocale:function(){return locale},setLocale:setLocale,t:function(h,s,e){return locale==='en'?e:locale==='zh-Hans'?s:h},translate:tr,supported:SUPPORTED.slice()};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})()
</script>`;
