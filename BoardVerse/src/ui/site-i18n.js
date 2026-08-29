import { SITE_I18N_DICTIONARY } from "./site-i18n-dict.js";
export const SITE_I18N_SCRIPT = String.raw`<script id="boardverse-site-i18n">
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
