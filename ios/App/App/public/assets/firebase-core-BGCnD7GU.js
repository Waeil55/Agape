import{o as si}from"./vendor-dOuK7WOe.js";const cr=()=>{};var Kn={};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const oi=function(i){const r=[];let o=0;for(let c=0;c<i.length;c++){let d=i.charCodeAt(c);d<128?r[o++]=d:d<2048?(r[o++]=d>>6|192,r[o++]=d&63|128):(d&64512)===55296&&c+1<i.length&&(i.charCodeAt(c+1)&64512)===56320?(d=65536+((d&1023)<<10)+(i.charCodeAt(++c)&1023),r[o++]=d>>18|240,r[o++]=d>>12&63|128,r[o++]=d>>6&63|128,r[o++]=d&63|128):(r[o++]=d>>12|224,r[o++]=d>>6&63|128,r[o++]=d&63|128)}return r},ur=function(i){const r=[];let o=0,c=0;for(;o<i.length;){const d=i[o++];if(d<128)r[c++]=String.fromCharCode(d);else if(d>191&&d<224){const b=i[o++];r[c++]=String.fromCharCode((d&31)<<6|b&63)}else if(d>239&&d<365){const b=i[o++],v=i[o++],I=i[o++],D=((d&7)<<18|(b&63)<<12|(v&63)<<6|I&63)-65536;r[c++]=String.fromCharCode(55296+(D>>10)),r[c++]=String.fromCharCode(56320+(D&1023))}else{const b=i[o++],v=i[o++];r[c++]=String.fromCharCode((d&15)<<12|(b&63)<<6|v&63)}}return r.join("")},ai={byteToCharMap_:null,charToByteMap_:null,byteToCharMapWebSafe_:null,charToByteMapWebSafe_:null,ENCODED_VALS_BASE:"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",get ENCODED_VALS(){return this.ENCODED_VALS_BASE+"+/="},get ENCODED_VALS_WEBSAFE(){return this.ENCODED_VALS_BASE+"-_."},HAS_NATIVE_SUPPORT:typeof atob=="function",encodeByteArray(i,r){if(!Array.isArray(i))throw Error("encodeByteArray takes an array as a parameter");this.init_();const o=r?this.byteToCharMapWebSafe_:this.byteToCharMap_,c=[];for(let d=0;d<i.length;d+=3){const b=i[d],v=d+1<i.length,I=v?i[d+1]:0,D=d+2<i.length,E=D?i[d+2]:0,F=b>>2,A=(b&3)<<4|I>>4;let V=(I&15)<<2|E>>6,U=E&63;D||(U=64,v||(V=64)),c.push(o[F],o[A],o[V],o[U])}return c.join("")},encodeString(i,r){return this.HAS_NATIVE_SUPPORT&&!r?btoa(i):this.encodeByteArray(oi(i),r)},decodeString(i,r){return this.HAS_NATIVE_SUPPORT&&!r?atob(i):ur(this.decodeStringToByteArray(i,r))},decodeStringToByteArray(i,r){this.init_();const o=r?this.charToByteMapWebSafe_:this.charToByteMap_,c=[];for(let d=0;d<i.length;){const b=o[i.charAt(d++)],I=d<i.length?o[i.charAt(d)]:0;++d;const E=d<i.length?o[i.charAt(d)]:64;++d;const A=d<i.length?o[i.charAt(d)]:64;if(++d,b==null||I==null||E==null||A==null)throw new fr;const V=b<<2|I>>4;if(c.push(V),E!==64){const U=I<<4&240|E>>2;if(c.push(U),A!==64){const x=E<<6&192|A;c.push(x)}}}return c},init_(){if(!this.byteToCharMap_){this.byteToCharMap_={},this.charToByteMap_={},this.byteToCharMapWebSafe_={},this.charToByteMapWebSafe_={};for(let i=0;i<this.ENCODED_VALS.length;i++)this.byteToCharMap_[i]=this.ENCODED_VALS.charAt(i),this.charToByteMap_[this.byteToCharMap_[i]]=i,this.byteToCharMapWebSafe_[i]=this.ENCODED_VALS_WEBSAFE.charAt(i),this.charToByteMapWebSafe_[this.byteToCharMapWebSafe_[i]]=i,i>=this.ENCODED_VALS_BASE.length&&(this.charToByteMap_[this.ENCODED_VALS_WEBSAFE.charAt(i)]=i,this.charToByteMapWebSafe_[this.ENCODED_VALS.charAt(i)]=i)}}};class fr extends Error{constructor(){super(...arguments),this.name="DecodeBase64StringError"}}const pr=function(i){const r=oi(i);return ai.encodeByteArray(r,!0)},re=function(i){return pr(i).replace(/\./g,"")},gr=function(i){try{return ai.decodeString(i,!0)}catch(r){console.error("base64Decode failed: ",r)}return null};/**
 * @license
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function dr(){if(typeof self<"u")return self;if(typeof window<"u")return window;if(typeof global<"u")return global;throw new Error("Unable to locate global object.")}/**
 * @license
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const mr=()=>dr().__FIREBASE_DEFAULTS__,yr=()=>{if(typeof process>"u"||typeof Kn>"u")return;const i=Kn.__FIREBASE_DEFAULTS__;if(i)return JSON.parse(i)},vr=()=>{if(typeof document>"u")return;let i;try{i=document.cookie.match(/__FIREBASE_DEFAULTS__=([^;]+)/)}catch{return}const r=i&&gr(i[1]);return r&&JSON.parse(r)},oe=()=>{try{return cr()||mr()||yr()||vr()}catch(i){console.info(`Unable to get __FIREBASE_DEFAULTS__ due to: ${i}`);return}},wr=i=>oe()?.emulatorHosts?.[i],Ro=i=>{const r=wr(i);if(!r)return;const o=r.lastIndexOf(":");if(o<=0||o+1===r.length)throw new Error(`Invalid host ${r} with no separate hostname and port!`);const c=parseInt(r.substring(o+1),10);return r[0]==="["?[r.substring(1,o-1),c]:[r.substring(0,o),c]},hi=()=>oe()?.config,ko=i=>oe()?.[`_${i}`];/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class br{constructor(){this.reject=()=>{},this.resolve=()=>{},this.promise=new Promise((r,o)=>{this.resolve=r,this.reject=o})}wrapCallback(r){return(o,c)=>{o?this.reject(o):this.resolve(c),typeof r=="function"&&(this.promise.catch(()=>{}),r.length===1?r(o):r(o,c))}}}/**
 * @license
 * Copyright 2021 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Mo(i,r){if(i.uid)throw new Error('The "uid" field is no longer supported by mockUserToken. Please use "sub" instead for Firebase Auth User ID.');const o={alg:"none",type:"JWT"},c=r||"demo-project",d=i.iat||0,b=i.sub||i.user_id;if(!b)throw new Error("mockUserToken must contain 'sub' or 'user_id' field!");const v={iss:`https://securetoken.google.com/${c}`,aud:c,iat:d,exp:d+3600,auth_time:d,sub:b,user_id:b,firebase:{sign_in_provider:"custom",identities:{}},...i};return[re(JSON.stringify(o)),re(JSON.stringify(v)),""].join(".")}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function li(){return typeof navigator<"u"&&typeof navigator.userAgent=="string"?navigator.userAgent:""}function Po(){return typeof window<"u"&&!!(window.cordova||window.phonegap||window.PhoneGap)&&/ios|iphone|ipod|ipad|android|blackberry|iemobile/i.test(li())}function Er(){const i=oe()?.forceEnvironment;if(i==="node")return!0;if(i==="browser")return!1;try{return Object.prototype.toString.call(global.process)==="[object process]"}catch{return!1}}function jo(){return typeof navigator<"u"&&navigator.userAgent==="Cloudflare-Workers"}function No(){const i=typeof chrome=="object"?chrome.runtime:typeof browser=="object"?browser.runtime:void 0;return typeof i=="object"&&i.id!==void 0}function xo(){return typeof navigator=="object"&&navigator.product==="ReactNative"}function Bo(){const i=li();return i.indexOf("MSIE ")>=0||i.indexOf("Trident/")>=0}function Ho(){return!Er()&&!!navigator.userAgent&&navigator.userAgent.includes("Safari")&&!navigator.userAgent.includes("Chrome")}function Sr(){try{return typeof indexedDB=="object"}catch{return!1}}function Ir(){return new Promise((i,r)=>{try{let o=!0;const c="validate-browser-context-for-indexeddb-analytics-module",d=self.indexedDB.open(c);d.onsuccess=()=>{d.result.close(),o||self.indexedDB.deleteDatabase(c),i(!0)},d.onupgradeneeded=()=>{o=!1},d.onerror=()=>{r(d.error?.message||"")}}catch(o){r(o)}})}function Lo(){return!(typeof navigator>"u"||!navigator.cookieEnabled)}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Ar="FirebaseError";class St extends Error{constructor(r,o,c){super(o),this.code=r,this.customData=c,this.name=Ar,Object.setPrototypeOf(this,St.prototype),Error.captureStackTrace&&Error.captureStackTrace(this,Ue.prototype.create)}}class Ue{constructor(r,o,c){this.service=r,this.serviceName=o,this.errors=c}create(r,...o){const c=o[0]||{},d=`${this.service}/${r}`,b=this.errors[r],v=b?Tr(b,c):"Error",I=`${this.serviceName}: ${v} (${d}).`;return new St(d,I,c)}}function Tr(i,r){return i.replace(Cr,(o,c)=>{const d=r[c];return d!=null?String(d):`<${c}?>`})}const Cr=/\{\$([^}]+)}/g;function Fo(i){for(const r in i)if(Object.prototype.hasOwnProperty.call(i,r))return!1;return!0}function xe(i,r){if(i===r)return!0;const o=Object.keys(i),c=Object.keys(r);for(const d of o){if(!c.includes(d))return!1;const b=i[d],v=r[d];if(Jn(b)&&Jn(v)){if(!xe(b,v))return!1}else if(b!==v)return!1}for(const d of c)if(!o.includes(d))return!1;return!0}function Jn(i){return i!==null&&typeof i=="object"}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function $o(i){const r=[];for(const[o,c]of Object.entries(i))Array.isArray(c)?c.forEach(d=>{r.push(encodeURIComponent(o)+"="+encodeURIComponent(d))}):r.push(encodeURIComponent(o)+"="+encodeURIComponent(c));return r.length?"&"+r.join("&"):""}function Uo(i){const r={};return i.replace(/^\?/,"").split("&").forEach(c=>{if(c){const[d,b]=c.split("=");r[decodeURIComponent(d)]=decodeURIComponent(b)}}),r}function Vo(i){const r=i.indexOf("?");if(!r)return"";const o=i.indexOf("#",r);return i.substring(r,o>0?o:void 0)}function zo(i,r){const o=new _r(i,r);return o.subscribe.bind(o)}class _r{constructor(r,o){this.observers=[],this.unsubscribes=[],this.observerCount=0,this.task=Promise.resolve(),this.finalized=!1,this.onNoObservers=o,this.task.then(()=>{r(this)}).catch(c=>{this.error(c)})}next(r){this.forEachObserver(o=>{o.next(r)})}error(r){this.forEachObserver(o=>{o.error(r)}),this.close(r)}complete(){this.forEachObserver(r=>{r.complete()}),this.close()}subscribe(r,o,c){let d;if(r===void 0&&o===void 0&&c===void 0)throw new Error("Missing Observer.");Dr(r,["next","error","complete"])?d=r:d={next:r,error:o,complete:c},d.next===void 0&&(d.next=Me),d.error===void 0&&(d.error=Me),d.complete===void 0&&(d.complete=Me);const b=this.unsubscribeOne.bind(this,this.observers.length);return this.finalized&&this.task.then(()=>{try{this.finalError?d.error(this.finalError):d.complete()}catch{}}),this.observers.push(d),b}unsubscribeOne(r){this.observers===void 0||this.observers[r]===void 0||(delete this.observers[r],this.observerCount-=1,this.observerCount===0&&this.onNoObservers!==void 0&&this.onNoObservers(this))}forEachObserver(r){if(!this.finalized)for(let o=0;o<this.observers.length;o++)this.sendOne(o,r)}sendOne(r,o){this.task.then(()=>{if(this.observers!==void 0&&this.observers[r]!==void 0)try{o(this.observers[r])}catch(c){typeof console<"u"&&console.error&&console.error(c)}})}close(r){this.finalized||(this.finalized=!0,r!==void 0&&(this.finalError=r),this.task.then(()=>{this.observers=void 0,this.onNoObservers=void 0}))}}function Dr(i,r){if(typeof i!="object"||i===null)return!1;for(const o of r)if(o in i&&typeof i[o]=="function")return!0;return!1}function Me(){}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Or=1e3,Rr=2,kr=4*60*60*1e3,Mr=.5;function qo(i,r=Or,o=Rr){const c=r*Math.pow(o,i),d=Math.round(Mr*c*(Math.random()-.5)*2);return Math.min(kr,c+d)}/**
 * @license
 * Copyright 2021 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Xo(i){return i&&i._delegate?i._delegate:i}/**
 * @license
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Wo(i){try{return(i.startsWith("http://")||i.startsWith("https://")?new URL(i).hostname:i).endsWith(".cloudworkstations.dev")}catch{return!1}}async function Go(i){return(await fetch(i,{credentials:"include"})).ok}class wt{constructor(r,o,c){this.name=r,this.instanceFactory=o,this.type=c,this.multipleInstances=!1,this.serviceProps={},this.instantiationMode="LAZY",this.onInstanceCreated=null}setInstantiationMode(r){return this.instantiationMode=r,this}setMultipleInstances(r){return this.multipleInstances=r,this}setServiceProps(r){return this.serviceProps=r,this}setInstanceCreatedCallback(r){return this.onInstanceCreated=r,this}}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const ht="[DEFAULT]";/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Pr{constructor(r,o){this.name=r,this.container=o,this.component=null,this.instances=new Map,this.instancesDeferred=new Map,this.instancesOptions=new Map,this.onInitCallbacks=new Map}get(r){const o=this.normalizeInstanceIdentifier(r);if(!this.instancesDeferred.has(o)){const c=new br;if(this.instancesDeferred.set(o,c),this.isInitialized(o)||this.shouldAutoInitialize())try{const d=this.getOrInitializeService({instanceIdentifier:o});d&&c.resolve(d)}catch{}}return this.instancesDeferred.get(o).promise}getImmediate(r){const o=this.normalizeInstanceIdentifier(r?.identifier),c=r?.optional??!1;if(this.isInitialized(o)||this.shouldAutoInitialize())try{return this.getOrInitializeService({instanceIdentifier:o})}catch(d){if(c)return null;throw d}else{if(c)return null;throw Error(`Service ${this.name} is not available`)}}getComponent(){return this.component}setComponent(r){if(r.name!==this.name)throw Error(`Mismatching Component ${r.name} for Provider ${this.name}.`);if(this.component)throw Error(`Component for ${this.name} has already been provided`);if(this.component=r,!!this.shouldAutoInitialize()){if(Nr(r))try{this.getOrInitializeService({instanceIdentifier:ht})}catch{}for(const[o,c]of this.instancesDeferred.entries()){const d=this.normalizeInstanceIdentifier(o);try{const b=this.getOrInitializeService({instanceIdentifier:d});c.resolve(b)}catch{}}}}clearInstance(r=ht){this.instancesDeferred.delete(r),this.instancesOptions.delete(r),this.instances.delete(r)}async delete(){const r=Array.from(this.instances.values());await Promise.all([...r.filter(o=>"INTERNAL"in o).map(o=>o.INTERNAL.delete()),...r.filter(o=>"_delete"in o).map(o=>o._delete())])}isComponentSet(){return this.component!=null}isInitialized(r=ht){return this.instances.has(r)}getOptions(r=ht){return this.instancesOptions.get(r)||{}}initialize(r={}){const{options:o={}}=r,c=this.normalizeInstanceIdentifier(r.instanceIdentifier);if(this.isInitialized(c))throw Error(`${this.name}(${c}) has already been initialized`);if(!this.isComponentSet())throw Error(`Component ${this.name} has not been registered yet`);const d=this.getOrInitializeService({instanceIdentifier:c,options:o});for(const[b,v]of this.instancesDeferred.entries()){const I=this.normalizeInstanceIdentifier(b);c===I&&v.resolve(d)}return d}onInit(r,o){const c=this.normalizeInstanceIdentifier(o),d=this.onInitCallbacks.get(c)??new Set;d.add(r),this.onInitCallbacks.set(c,d);const b=this.instances.get(c);return b&&r(b,c),()=>{d.delete(r)}}invokeOnInitCallbacks(r,o){const c=this.onInitCallbacks.get(o);if(c)for(const d of c)try{d(r,o)}catch{}}getOrInitializeService({instanceIdentifier:r,options:o={}}){let c=this.instances.get(r);if(!c&&this.component&&(c=this.component.instanceFactory(this.container,{instanceIdentifier:jr(r),options:o}),this.instances.set(r,c),this.instancesOptions.set(r,o),this.invokeOnInitCallbacks(c,r),this.component.onInstanceCreated))try{this.component.onInstanceCreated(this.container,r,c)}catch{}return c||null}normalizeInstanceIdentifier(r=ht){return this.component?this.component.multipleInstances?r:ht:r}shouldAutoInitialize(){return!!this.component&&this.component.instantiationMode!=="EXPLICIT"}}function jr(i){return i===ht?void 0:i}function Nr(i){return i.instantiationMode==="EAGER"}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class xr{constructor(r){this.name=r,this.providers=new Map}addComponent(r){const o=this.getProvider(r.name);if(o.isComponentSet())throw new Error(`Component ${r.name} has already been registered with ${this.name}`);o.setComponent(r)}addOrOverwriteComponent(r){this.getProvider(r.name).isComponentSet()&&this.providers.delete(r.name),this.addComponent(r)}getProvider(r){if(this.providers.has(r))return this.providers.get(r);const o=new Pr(r,this);return this.providers.set(r,o),o}getProviders(){return Array.from(this.providers.values())}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */var _;(function(i){i[i.DEBUG=0]="DEBUG",i[i.VERBOSE=1]="VERBOSE",i[i.INFO=2]="INFO",i[i.WARN=3]="WARN",i[i.ERROR=4]="ERROR",i[i.SILENT=5]="SILENT"})(_||(_={}));const Br={debug:_.DEBUG,verbose:_.VERBOSE,info:_.INFO,warn:_.WARN,error:_.ERROR,silent:_.SILENT},Hr=_.INFO,Lr={[_.DEBUG]:"log",[_.VERBOSE]:"log",[_.INFO]:"info",[_.WARN]:"warn",[_.ERROR]:"error"},Fr=(i,r,...o)=>{if(r<i.logLevel)return;const c=new Date().toISOString(),d=Lr[r];if(d)console[d](`[${c}]  ${i.name}:`,...o);else throw new Error(`Attempted to log a message with an invalid logType (value: ${r})`)};class $r{constructor(r){this.name=r,this._logLevel=Hr,this._logHandler=Fr,this._userLogHandler=null}get logLevel(){return this._logLevel}set logLevel(r){if(!(r in _))throw new TypeError(`Invalid value "${r}" assigned to \`logLevel\``);this._logLevel=r}setLogLevel(r){this._logLevel=typeof r=="string"?Br[r]:r}get logHandler(){return this._logHandler}set logHandler(r){if(typeof r!="function")throw new TypeError("Value assigned to `logHandler` must be a function");this._logHandler=r}get userLogHandler(){return this._userLogHandler}set userLogHandler(r){this._userLogHandler=r}debug(...r){this._userLogHandler&&this._userLogHandler(this,_.DEBUG,...r),this._logHandler(this,_.DEBUG,...r)}log(...r){this._userLogHandler&&this._userLogHandler(this,_.VERBOSE,...r),this._logHandler(this,_.VERBOSE,...r)}info(...r){this._userLogHandler&&this._userLogHandler(this,_.INFO,...r),this._logHandler(this,_.INFO,...r)}warn(...r){this._userLogHandler&&this._userLogHandler(this,_.WARN,...r),this._logHandler(this,_.WARN,...r)}error(...r){this._userLogHandler&&this._userLogHandler(this,_.ERROR,...r),this._logHandler(this,_.ERROR,...r)}}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Ur{constructor(r){this.container=r}getPlatformInfoString(){return this.container.getProviders().map(o=>{if(Vr(o)){const c=o.getImmediate();return`${c.library}/${c.version}`}else return null}).filter(o=>o).join(" ")}}function Vr(i){return i.getComponent()?.type==="VERSION"}const Be="@firebase/app",Yn="0.15.0";/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const X=new $r("@firebase/app"),zr="@firebase/app-compat",qr="@firebase/analytics-compat",Xr="@firebase/analytics",Wr="@firebase/app-check-compat",Gr="@firebase/app-check",Kr="@firebase/auth",Jr="@firebase/auth-compat",Yr="@firebase/database",Zr="@firebase/data-connect",Qr="@firebase/database-compat",ts="@firebase/functions",es="@firebase/functions-compat",ns="@firebase/installations",is="@firebase/installations-compat",rs="@firebase/messaging",ss="@firebase/messaging-compat",os="@firebase/performance",as="@firebase/performance-compat",hs="@firebase/remote-config",ls="@firebase/remote-config-compat",cs="@firebase/storage",us="@firebase/storage-compat",fs="@firebase/firestore",ps="@firebase/ai",gs="@firebase/firestore-compat",ds="firebase",ms="12.15.0";/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const He="[DEFAULT]",ys={[Be]:"fire-core",[zr]:"fire-core-compat",[Xr]:"fire-analytics",[qr]:"fire-analytics-compat",[Gr]:"fire-app-check",[Wr]:"fire-app-check-compat",[Kr]:"fire-auth",[Jr]:"fire-auth-compat",[Yr]:"fire-rtdb",[Zr]:"fire-data-connect",[Qr]:"fire-rtdb-compat",[ts]:"fire-fn",[es]:"fire-fn-compat",[ns]:"fire-iid",[is]:"fire-iid-compat",[rs]:"fire-fcm",[ss]:"fire-fcm-compat",[os]:"fire-perf",[as]:"fire-perf-compat",[hs]:"fire-rc",[ls]:"fire-rc-compat",[cs]:"fire-gcs",[us]:"fire-gcs-compat",[fs]:"fire-fst",[gs]:"fire-fst-compat",[ps]:"fire-vertex","fire-js":"fire-js",[ds]:"fire-js-all"};/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const bt=new Map,Le=new Map,Fe=new Map;function Zn(i,r){try{i.container.addComponent(r)}catch(o){X.debug(`Component ${r.name} failed to register with FirebaseApp ${i.name}`,o)}}function Ft(i){const r=i.name;if(Fe.has(r))return X.debug(`There were multiple attempts to register component ${r}.`),!1;Fe.set(r,i);for(const o of bt.values())Zn(o,i);for(const o of Le.values())Zn(o,i);return!0}function ci(i,r){const o=i.container.getProvider("heartbeat").getImmediate({optional:!0});return o&&o.triggerHeartbeat(),i.container.getProvider(r)}function Ko(i){return i==null?!1:i.settings!==void 0}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const vs={"no-app":"No Firebase App '{$appName}' has been created - call initializeApp() first","bad-app-name":"Illegal App name: '{$appName}'","duplicate-app":"Firebase App named '{$appName}' already exists with different options or config","app-deleted":"Firebase App named '{$appName}' already deleted","server-app-deleted":"Firebase Server App has been deleted","no-options":"Need to provide options, when not being deployed to hosting via source.","invalid-app-argument":"firebase.{$appName}() takes either no argument or a Firebase App instance.","invalid-log-argument":"First argument to `onLog` must be null or a function.","idb-open":"Error thrown when opening IndexedDB. Original error: {$originalErrorMessage}.","idb-get":"Error thrown when reading from IndexedDB. Original error: {$originalErrorMessage}.","idb-set":"Error thrown when writing to IndexedDB. Original error: {$originalErrorMessage}.","idb-delete":"Error thrown when deleting from IndexedDB. Original error: {$originalErrorMessage}.","finalization-registry-not-supported":"FirebaseServerApp deleteOnDeref field defined but the JS runtime does not support FinalizationRegistry.","invalid-server-app-environment":"FirebaseServerApp is not for use in browser environments."},et=new Ue("app","Firebase",vs);/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class ws{constructor(r,o,c){this._isDeleted=!1,this._options={...r},this._config={...o},this._name=o.name,this._automaticDataCollectionEnabled=o.automaticDataCollectionEnabled,this._container=c,this.container.addComponent(new wt("app",()=>this,"PUBLIC"))}get automaticDataCollectionEnabled(){return this.checkDestroyed(),this._automaticDataCollectionEnabled}set automaticDataCollectionEnabled(r){this.checkDestroyed(),this._automaticDataCollectionEnabled=r}get name(){return this.checkDestroyed(),this._name}get options(){return this.checkDestroyed(),this._options}get config(){return this.checkDestroyed(),this._config}get container(){return this._container}get isDeleted(){return this._isDeleted}set isDeleted(r){this._isDeleted=r}checkDestroyed(){if(this.isDeleted)throw et.create("app-deleted",{appName:this._name})}}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Jo=ms;function bs(i,r={}){let o=i;typeof r!="object"&&(r={name:r});const c={name:He,automaticDataCollectionEnabled:!0,...r},d=c.name;if(typeof d!="string"||!d)throw et.create("bad-app-name",{appName:String(d)});if(o||(o=hi()),!o)throw et.create("no-options");const b=bt.get(d);if(b){if(xe(o,b.options)&&xe(c,b.config))return b;throw et.create("duplicate-app",{appName:d})}const v=new xr(d);for(const D of Fe.values())v.addComponent(D);const I=new ws(o,c,v);return bt.set(d,I),I}function Yo(i=He){const r=bt.get(i);if(!r&&i===He&&hi())return bs();if(!r)throw et.create("no-app",{appName:i});return r}async function Zo(i){let r=!1;const o=i.name;bt.has(o)?(r=!0,bt.delete(o)):Le.has(o)&&i.decRefCount()<=0&&(Le.delete(o),r=!0),r&&(await Promise.all(i.container.getProviders().map(c=>c.delete())),i.isDeleted=!0)}function vt(i,r,o){let c=ys[i]??i;o&&(c+=`-${o}`);const d=c.match(/\s|\//),b=r.match(/\s|\//);if(d||b){const v=[`Unable to register library "${c}" with version "${r}":`];d&&v.push(`library name "${c}" contains illegal characters (whitespace or "/")`),d&&b&&v.push("and"),b&&v.push(`version name "${r}" contains illegal characters (whitespace or "/")`),X.warn(v.join(" "));return}Ft(new wt(`${c}-version`,()=>({library:c,version:r}),"VERSION"))}/**
 * @license
 * Copyright 2021 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Es="firebase-heartbeat-database",Ss=1,$t="firebase-heartbeat-store";let Pe=null;function ui(){return Pe||(Pe=si(Es,Ss,{upgrade:(i,r)=>{switch(r){case 0:try{i.createObjectStore($t)}catch(o){console.warn(o)}}}}).catch(i=>{throw et.create("idb-open",{originalErrorMessage:i.message})})),Pe}async function Is(i){try{const o=(await ui()).transaction($t),c=await o.objectStore($t).get(fi(i));return await o.done,c}catch(r){if(r instanceof St)X.warn(r.message);else{const o=et.create("idb-get",{originalErrorMessage:r?.message});X.warn(o.message)}}}async function Qn(i,r){try{const c=(await ui()).transaction($t,"readwrite");await c.objectStore($t).put(r,fi(i)),await c.done}catch(o){if(o instanceof St)X.warn(o.message);else{const c=et.create("idb-set",{originalErrorMessage:o?.message});X.warn(c.message)}}}function fi(i){return`${i.name}!${i.options.appId}`}/**
 * @license
 * Copyright 2021 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const As=1024,Ts=30;class Cs{constructor(r){this.container=r,this._heartbeatsCache=null;const o=this.container.getProvider("app").getImmediate();this._storage=new Ds(o),this._heartbeatsCachePromise=this._storage.read().then(c=>(this._heartbeatsCache=c,c))}async triggerHeartbeat(){try{const o=this.container.getProvider("platform-logger").getImmediate().getPlatformInfoString(),c=ti();if(this._heartbeatsCache?.heartbeats==null&&(this._heartbeatsCache=await this._heartbeatsCachePromise,this._heartbeatsCache?.heartbeats==null)||this._heartbeatsCache.lastSentHeartbeatDate===c||this._heartbeatsCache.heartbeats.some(d=>d.date===c))return;if(this._heartbeatsCache.heartbeats.push({date:c,agent:o}),this._heartbeatsCache.heartbeats.length>Ts){const d=Os(this._heartbeatsCache.heartbeats);this._heartbeatsCache.heartbeats.splice(d,1)}return this._storage.overwrite(this._heartbeatsCache)}catch(r){X.warn(r)}}async getHeartbeatsHeader(){try{if(this._heartbeatsCache===null&&await this._heartbeatsCachePromise,this._heartbeatsCache?.heartbeats==null||this._heartbeatsCache.heartbeats.length===0)return"";const r=ti(),{heartbeatsToSend:o,unsentEntries:c}=_s(this._heartbeatsCache.heartbeats),d=re(JSON.stringify({version:2,heartbeats:o}));return this._heartbeatsCache.lastSentHeartbeatDate=r,c.length>0?(this._heartbeatsCache.heartbeats=c,await this._storage.overwrite(this._heartbeatsCache)):(this._heartbeatsCache.heartbeats=[],this._storage.overwrite(this._heartbeatsCache)),d}catch(r){return X.warn(r),""}}}function ti(){return new Date().toISOString().substring(0,10)}function _s(i,r=As){const o=[];let c=i.slice();for(const d of i){const b=o.find(v=>v.agent===d.agent);if(b){if(b.dates.push(d.date),ei(o)>r){b.dates.pop();break}}else if(o.push({agent:d.agent,dates:[d.date]}),ei(o)>r){o.pop();break}c=c.slice(1)}return{heartbeatsToSend:o,unsentEntries:c}}class Ds{constructor(r){this.app=r,this._canUseIndexedDBPromise=this.runIndexedDBEnvironmentCheck()}async runIndexedDBEnvironmentCheck(){return Sr()?Ir().then(()=>!0).catch(()=>!1):!1}async read(){if(await this._canUseIndexedDBPromise){const o=await Is(this.app);return o?.heartbeats?o:{heartbeats:[]}}else return{heartbeats:[]}}async overwrite(r){if(await this._canUseIndexedDBPromise){const c=await this.read();return Qn(this.app,{lastSentHeartbeatDate:r.lastSentHeartbeatDate??c.lastSentHeartbeatDate,heartbeats:r.heartbeats})}else return}async add(r){if(await this._canUseIndexedDBPromise){const c=await this.read();return Qn(this.app,{lastSentHeartbeatDate:r.lastSentHeartbeatDate??c.lastSentHeartbeatDate,heartbeats:[...c.heartbeats,...r.heartbeats]})}else return}}function ei(i){return re(JSON.stringify({version:2,heartbeats:i})).length}function Os(i){if(i.length===0)return-1;let r=0,o=i[0].date;for(let c=1;c<i.length;c++)i[c].date<o&&(o=i[c].date,r=c);return r}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Rs(i){Ft(new wt("platform-logger",r=>new Ur(r),"PRIVATE")),Ft(new wt("heartbeat",r=>new Cs(r),"PRIVATE")),vt(Be,Yn,i),vt(Be,Yn,"esm2020"),vt("fire-js","")}Rs("");var ks="firebase",Ms="12.15.0";/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */vt(ks,Ms,"app");var ni=typeof globalThis<"u"?globalThis:typeof window<"u"?window:typeof global<"u"?global:typeof self<"u"?self:{};/** @license
Copyright The Closure Library Authors.
SPDX-License-Identifier: Apache-2.0
*/var Ps,js;(function(){var i;/** @license

 Copyright The Closure Library Authors.
 SPDX-License-Identifier: Apache-2.0
*/function r(f,a){function l(){}l.prototype=a.prototype,f.F=a.prototype,f.prototype=new l,f.prototype.constructor=f,f.D=function(p,u,m){for(var h=Array(arguments.length-2),H=2;H<arguments.length;H++)h[H-2]=arguments[H];return a.prototype[u].apply(p,h)}}function o(){this.blockSize=-1}function c(){this.blockSize=-1,this.blockSize=64,this.g=Array(4),this.C=Array(this.blockSize),this.o=this.h=0,this.u()}r(c,o),c.prototype.u=function(){this.g[0]=1732584193,this.g[1]=4023233417,this.g[2]=2562383102,this.g[3]=271733878,this.o=this.h=0};function d(f,a,l){l||(l=0);const p=Array(16);if(typeof a=="string")for(var u=0;u<16;++u)p[u]=a.charCodeAt(l++)|a.charCodeAt(l++)<<8|a.charCodeAt(l++)<<16|a.charCodeAt(l++)<<24;else for(u=0;u<16;++u)p[u]=a[l++]|a[l++]<<8|a[l++]<<16|a[l++]<<24;a=f.g[0],l=f.g[1],u=f.g[2];let m=f.g[3],h;h=a+(m^l&(u^m))+p[0]+3614090360&4294967295,a=l+(h<<7&4294967295|h>>>25),h=m+(u^a&(l^u))+p[1]+3905402710&4294967295,m=a+(h<<12&4294967295|h>>>20),h=u+(l^m&(a^l))+p[2]+606105819&4294967295,u=m+(h<<17&4294967295|h>>>15),h=l+(a^u&(m^a))+p[3]+3250441966&4294967295,l=u+(h<<22&4294967295|h>>>10),h=a+(m^l&(u^m))+p[4]+4118548399&4294967295,a=l+(h<<7&4294967295|h>>>25),h=m+(u^a&(l^u))+p[5]+1200080426&4294967295,m=a+(h<<12&4294967295|h>>>20),h=u+(l^m&(a^l))+p[6]+2821735955&4294967295,u=m+(h<<17&4294967295|h>>>15),h=l+(a^u&(m^a))+p[7]+4249261313&4294967295,l=u+(h<<22&4294967295|h>>>10),h=a+(m^l&(u^m))+p[8]+1770035416&4294967295,a=l+(h<<7&4294967295|h>>>25),h=m+(u^a&(l^u))+p[9]+2336552879&4294967295,m=a+(h<<12&4294967295|h>>>20),h=u+(l^m&(a^l))+p[10]+4294925233&4294967295,u=m+(h<<17&4294967295|h>>>15),h=l+(a^u&(m^a))+p[11]+2304563134&4294967295,l=u+(h<<22&4294967295|h>>>10),h=a+(m^l&(u^m))+p[12]+1804603682&4294967295,a=l+(h<<7&4294967295|h>>>25),h=m+(u^a&(l^u))+p[13]+4254626195&4294967295,m=a+(h<<12&4294967295|h>>>20),h=u+(l^m&(a^l))+p[14]+2792965006&4294967295,u=m+(h<<17&4294967295|h>>>15),h=l+(a^u&(m^a))+p[15]+1236535329&4294967295,l=u+(h<<22&4294967295|h>>>10),h=a+(u^m&(l^u))+p[1]+4129170786&4294967295,a=l+(h<<5&4294967295|h>>>27),h=m+(l^u&(a^l))+p[6]+3225465664&4294967295,m=a+(h<<9&4294967295|h>>>23),h=u+(a^l&(m^a))+p[11]+643717713&4294967295,u=m+(h<<14&4294967295|h>>>18),h=l+(m^a&(u^m))+p[0]+3921069994&4294967295,l=u+(h<<20&4294967295|h>>>12),h=a+(u^m&(l^u))+p[5]+3593408605&4294967295,a=l+(h<<5&4294967295|h>>>27),h=m+(l^u&(a^l))+p[10]+38016083&4294967295,m=a+(h<<9&4294967295|h>>>23),h=u+(a^l&(m^a))+p[15]+3634488961&4294967295,u=m+(h<<14&4294967295|h>>>18),h=l+(m^a&(u^m))+p[4]+3889429448&4294967295,l=u+(h<<20&4294967295|h>>>12),h=a+(u^m&(l^u))+p[9]+568446438&4294967295,a=l+(h<<5&4294967295|h>>>27),h=m+(l^u&(a^l))+p[14]+3275163606&4294967295,m=a+(h<<9&4294967295|h>>>23),h=u+(a^l&(m^a))+p[3]+4107603335&4294967295,u=m+(h<<14&4294967295|h>>>18),h=l+(m^a&(u^m))+p[8]+1163531501&4294967295,l=u+(h<<20&4294967295|h>>>12),h=a+(u^m&(l^u))+p[13]+2850285829&4294967295,a=l+(h<<5&4294967295|h>>>27),h=m+(l^u&(a^l))+p[2]+4243563512&4294967295,m=a+(h<<9&4294967295|h>>>23),h=u+(a^l&(m^a))+p[7]+1735328473&4294967295,u=m+(h<<14&4294967295|h>>>18),h=l+(m^a&(u^m))+p[12]+2368359562&4294967295,l=u+(h<<20&4294967295|h>>>12),h=a+(l^u^m)+p[5]+4294588738&4294967295,a=l+(h<<4&4294967295|h>>>28),h=m+(a^l^u)+p[8]+2272392833&4294967295,m=a+(h<<11&4294967295|h>>>21),h=u+(m^a^l)+p[11]+1839030562&4294967295,u=m+(h<<16&4294967295|h>>>16),h=l+(u^m^a)+p[14]+4259657740&4294967295,l=u+(h<<23&4294967295|h>>>9),h=a+(l^u^m)+p[1]+2763975236&4294967295,a=l+(h<<4&4294967295|h>>>28),h=m+(a^l^u)+p[4]+1272893353&4294967295,m=a+(h<<11&4294967295|h>>>21),h=u+(m^a^l)+p[7]+4139469664&4294967295,u=m+(h<<16&4294967295|h>>>16),h=l+(u^m^a)+p[10]+3200236656&4294967295,l=u+(h<<23&4294967295|h>>>9),h=a+(l^u^m)+p[13]+681279174&4294967295,a=l+(h<<4&4294967295|h>>>28),h=m+(a^l^u)+p[0]+3936430074&4294967295,m=a+(h<<11&4294967295|h>>>21),h=u+(m^a^l)+p[3]+3572445317&4294967295,u=m+(h<<16&4294967295|h>>>16),h=l+(u^m^a)+p[6]+76029189&4294967295,l=u+(h<<23&4294967295|h>>>9),h=a+(l^u^m)+p[9]+3654602809&4294967295,a=l+(h<<4&4294967295|h>>>28),h=m+(a^l^u)+p[12]+3873151461&4294967295,m=a+(h<<11&4294967295|h>>>21),h=u+(m^a^l)+p[15]+530742520&4294967295,u=m+(h<<16&4294967295|h>>>16),h=l+(u^m^a)+p[2]+3299628645&4294967295,l=u+(h<<23&4294967295|h>>>9),h=a+(u^(l|~m))+p[0]+4096336452&4294967295,a=l+(h<<6&4294967295|h>>>26),h=m+(l^(a|~u))+p[7]+1126891415&4294967295,m=a+(h<<10&4294967295|h>>>22),h=u+(a^(m|~l))+p[14]+2878612391&4294967295,u=m+(h<<15&4294967295|h>>>17),h=l+(m^(u|~a))+p[5]+4237533241&4294967295,l=u+(h<<21&4294967295|h>>>11),h=a+(u^(l|~m))+p[12]+1700485571&4294967295,a=l+(h<<6&4294967295|h>>>26),h=m+(l^(a|~u))+p[3]+2399980690&4294967295,m=a+(h<<10&4294967295|h>>>22),h=u+(a^(m|~l))+p[10]+4293915773&4294967295,u=m+(h<<15&4294967295|h>>>17),h=l+(m^(u|~a))+p[1]+2240044497&4294967295,l=u+(h<<21&4294967295|h>>>11),h=a+(u^(l|~m))+p[8]+1873313359&4294967295,a=l+(h<<6&4294967295|h>>>26),h=m+(l^(a|~u))+p[15]+4264355552&4294967295,m=a+(h<<10&4294967295|h>>>22),h=u+(a^(m|~l))+p[6]+2734768916&4294967295,u=m+(h<<15&4294967295|h>>>17),h=l+(m^(u|~a))+p[13]+1309151649&4294967295,l=u+(h<<21&4294967295|h>>>11),h=a+(u^(l|~m))+p[4]+4149444226&4294967295,a=l+(h<<6&4294967295|h>>>26),h=m+(l^(a|~u))+p[11]+3174756917&4294967295,m=a+(h<<10&4294967295|h>>>22),h=u+(a^(m|~l))+p[2]+718787259&4294967295,u=m+(h<<15&4294967295|h>>>17),h=l+(m^(u|~a))+p[9]+3951481745&4294967295,f.g[0]=f.g[0]+a&4294967295,f.g[1]=f.g[1]+(u+(h<<21&4294967295|h>>>11))&4294967295,f.g[2]=f.g[2]+u&4294967295,f.g[3]=f.g[3]+m&4294967295}c.prototype.v=function(f,a){a===void 0&&(a=f.length);const l=a-this.blockSize,p=this.C;let u=this.h,m=0;for(;m<a;){if(u==0)for(;m<=l;)d(this,f,m),m+=this.blockSize;if(typeof f=="string"){for(;m<a;)if(p[u++]=f.charCodeAt(m++),u==this.blockSize){d(this,p),u=0;break}}else for(;m<a;)if(p[u++]=f[m++],u==this.blockSize){d(this,p),u=0;break}}this.h=u,this.o+=a},c.prototype.A=function(){var f=Array((this.h<56?this.blockSize:this.blockSize*2)-this.h);f[0]=128;for(var a=1;a<f.length-8;++a)f[a]=0;a=this.o*8;for(var l=f.length-8;l<f.length;++l)f[l]=a&255,a/=256;for(this.v(f),f=Array(16),a=0,l=0;l<4;++l)for(let p=0;p<32;p+=8)f[a++]=this.g[l]>>>p&255;return f};function b(f,a){var l=I;return Object.prototype.hasOwnProperty.call(l,f)?l[f]:l[f]=a(f)}function v(f,a){this.h=a;const l=[];let p=!0;for(let u=f.length-1;u>=0;u--){const m=f[u]|0;p&&m==a||(l[u]=m,p=!1)}this.g=l}var I={};function D(f){return-128<=f&&f<128?b(f,function(a){return new v([a|0],a<0?-1:0)}):new v([f|0],f<0?-1:0)}function E(f){if(isNaN(f)||!isFinite(f))return A;if(f<0)return R(E(-f));const a=[];let l=1;for(let p=0;f>=l;p++)a[p]=f/l|0,l*=4294967296;return new v(a,0)}function F(f,a){if(f.length==0)throw Error("number format error: empty string");if(a=a||10,a<2||36<a)throw Error("radix out of range: "+a);if(f.charAt(0)=="-")return R(F(f.substring(1),a));if(f.indexOf("-")>=0)throw Error('number format error: interior "-" character');const l=E(Math.pow(a,8));let p=A;for(let m=0;m<f.length;m+=8){var u=Math.min(8,f.length-m);const h=parseInt(f.substring(m,m+u),a);u<8?(u=E(Math.pow(a,u)),p=p.j(u).add(E(h))):(p=p.j(l),p=p.add(E(h)))}return p}var A=D(0),V=D(1),U=D(16777216);i=v.prototype,i.m=function(){if(B(this))return-R(this).m();let f=0,a=1;for(let l=0;l<this.g.length;l++){const p=this.i(l);f+=(p>=0?p:4294967296+p)*a,a*=4294967296}return f},i.toString=function(f){if(f=f||10,f<2||36<f)throw Error("radix out of range: "+f);if(x(this))return"0";if(B(this))return"-"+R(this).toString(f);const a=E(Math.pow(f,6));var l=this;let p="";for(;;){const u=gt(l,a).g;l=ft(l,u.j(a));let m=((l.g.length>0?l.g[0]:l.h)>>>0).toString(f);if(l=u,x(l))return m+p;for(;m.length<6;)m="0"+m;p=m+p}},i.i=function(f){return f<0?0:f<this.g.length?this.g[f]:this.h};function x(f){if(f.h!=0)return!1;for(let a=0;a<f.g.length;a++)if(f.g[a]!=0)return!1;return!0}function B(f){return f.h==-1}i.l=function(f){return f=ft(this,f),B(f)?-1:x(f)?0:1};function R(f){const a=f.g.length,l=[];for(let p=0;p<a;p++)l[p]=~f.g[p];return new v(l,~f.h).add(V)}i.abs=function(){return B(this)?R(this):this},i.add=function(f){const a=Math.max(this.g.length,f.g.length),l=[];let p=0;for(let u=0;u<=a;u++){let m=p+(this.i(u)&65535)+(f.i(u)&65535),h=(m>>>16)+(this.i(u)>>>16)+(f.i(u)>>>16);p=h>>>16,m&=65535,h&=65535,l[u]=h<<16|m}return new v(l,l[l.length-1]&-2147483648?-1:0)};function ft(f,a){return f.add(R(a))}i.j=function(f){if(x(this)||x(f))return A;if(B(this))return B(f)?R(this).j(R(f)):R(R(this).j(f));if(B(f))return R(this.j(R(f)));if(this.l(U)<0&&f.l(U)<0)return E(this.m()*f.m());const a=this.g.length+f.g.length,l=[];for(var p=0;p<2*a;p++)l[p]=0;for(p=0;p<this.g.length;p++)for(let u=0;u<f.g.length;u++){const m=this.i(p)>>>16,h=this.i(p)&65535,H=f.i(u)>>>16,nt=f.i(u)&65535;l[2*p+2*u]+=h*nt,pt(l,2*p+2*u),l[2*p+2*u+1]+=m*nt,pt(l,2*p+2*u+1),l[2*p+2*u+1]+=h*H,pt(l,2*p+2*u+1),l[2*p+2*u+2]+=m*H,pt(l,2*p+2*u+2)}for(f=0;f<a;f++)l[f]=l[2*f+1]<<16|l[2*f];for(f=a;f<2*a;f++)l[f]=0;return new v(l,0)};function pt(f,a){for(;(f[a]&65535)!=f[a];)f[a+1]+=f[a]>>>16,f[a]&=65535,a++}function W(f,a){this.g=f,this.h=a}function gt(f,a){if(x(a))throw Error("division by zero");if(x(f))return new W(A,A);if(B(f))return a=gt(R(f),a),new W(R(a.g),R(a.h));if(B(a))return a=gt(f,R(a)),new W(R(a.g),a.h);if(f.g.length>30){if(B(f)||B(a))throw Error("slowDivide_ only works with positive integers.");for(var l=V,p=a;p.l(f)<=0;)l=G(l),p=G(p);var u=$(l,1),m=$(p,1);for(p=$(p,2),l=$(l,2);!x(p);){var h=m.add(p);h.l(f)<=0&&(u=u.add(l),m=h),p=$(p,1),l=$(l,1)}return a=ft(f,u.j(a)),new W(u,a)}for(u=A;f.l(a)>=0;){for(l=Math.max(1,Math.floor(f.m()/a.m())),p=Math.ceil(Math.log(l)/Math.LN2),p=p<=48?1:Math.pow(2,p-48),m=E(l),h=m.j(a);B(h)||h.l(f)>0;)l-=p,m=E(l),h=m.j(a);x(m)&&(m=V),u=u.add(m),f=ft(f,h)}return new W(u,f)}i.B=function(f){return gt(this,f).h},i.and=function(f){const a=Math.max(this.g.length,f.g.length),l=[];for(let p=0;p<a;p++)l[p]=this.i(p)&f.i(p);return new v(l,this.h&f.h)},i.or=function(f){const a=Math.max(this.g.length,f.g.length),l=[];for(let p=0;p<a;p++)l[p]=this.i(p)|f.i(p);return new v(l,this.h|f.h)},i.xor=function(f){const a=Math.max(this.g.length,f.g.length),l=[];for(let p=0;p<a;p++)l[p]=this.i(p)^f.i(p);return new v(l,this.h^f.h)};function G(f){const a=f.g.length+1,l=[];for(let p=0;p<a;p++)l[p]=f.i(p)<<1|f.i(p-1)>>>31;return new v(l,f.h)}function $(f,a){const l=a>>5;a%=32;const p=f.g.length-l,u=[];for(let m=0;m<p;m++)u[m]=a>0?f.i(m+l)>>>a|f.i(m+l+1)<<32-a:f.i(m+l);return new v(u,f.h)}c.prototype.digest=c.prototype.A,c.prototype.reset=c.prototype.u,c.prototype.update=c.prototype.v,js=c,v.prototype.add=v.prototype.add,v.prototype.multiply=v.prototype.j,v.prototype.modulo=v.prototype.B,v.prototype.compare=v.prototype.l,v.prototype.toNumber=v.prototype.m,v.prototype.toString=v.prototype.toString,v.prototype.getBits=v.prototype.i,v.fromNumber=E,v.fromString=F,Ps=v}).apply(typeof ni<"u"?ni:typeof self<"u"?self:typeof window<"u"?window:{});var ie=typeof globalThis<"u"?globalThis:typeof window<"u"?window:typeof global<"u"?global:typeof self<"u"?self:{};/** @license
Copyright The Closure Library Authors.
SPDX-License-Identifier: Apache-2.0
*/var Ns,xs,Bs,Hs,Ls,Fs,$s,Us;(function(){var i,r=Object.defineProperty;function o(t){t=[typeof globalThis=="object"&&globalThis,t,typeof window=="object"&&window,typeof self=="object"&&self,typeof ie=="object"&&ie];for(var e=0;e<t.length;++e){var n=t[e];if(n&&n.Math==Math)return n}throw Error("Cannot find global object")}var c=o(this);function d(t,e){if(e)t:{var n=c;t=t.split(".");for(var s=0;s<t.length-1;s++){var g=t[s];if(!(g in n))break t;n=n[g]}t=t[t.length-1],s=n[t],e=e(s),e!=s&&e!=null&&r(n,t,{configurable:!0,writable:!0,value:e})}}d("Symbol.dispose",function(t){return t||Symbol("Symbol.dispose")}),d("Array.prototype.values",function(t){return t||function(){return this[Symbol.iterator]()}}),d("Object.entries",function(t){return t||function(e){var n=[],s;for(s in e)Object.prototype.hasOwnProperty.call(e,s)&&n.push([s,e[s]]);return n}});/** @license

 Copyright The Closure Library Authors.
 SPDX-License-Identifier: Apache-2.0
*/var b=b||{},v=this||self;function I(t){var e=typeof t;return e=="object"&&t!=null||e=="function"}function D(t,e,n){return t.call.apply(t.bind,arguments)}function E(t,e,n){return E=D,E.apply(null,arguments)}function F(t,e){var n=Array.prototype.slice.call(arguments,1);return function(){var s=n.slice();return s.push.apply(s,arguments),t.apply(this,s)}}function A(t,e){function n(){}n.prototype=e.prototype,t.Z=e.prototype,t.prototype=new n,t.prototype.constructor=t,t.Ob=function(s,g,y){for(var w=Array(arguments.length-2),S=2;S<arguments.length;S++)w[S-2]=arguments[S];return e.prototype[g].apply(s,w)}}var V=typeof AsyncContext<"u"&&typeof AsyncContext.Snapshot=="function"?t=>t&&AsyncContext.Snapshot.wrap(t):t=>t;function U(t){const e=t.length;if(e>0){const n=Array(e);for(let s=0;s<e;s++)n[s]=t[s];return n}return[]}function x(t,e){for(let s=1;s<arguments.length;s++){const g=arguments[s];var n=typeof g;if(n=n!="object"?n:g?Array.isArray(g)?"array":n:"null",n=="array"||n=="object"&&typeof g.length=="number"){n=t.length||0;const y=g.length||0;t.length=n+y;for(let w=0;w<y;w++)t[n+w]=g[w]}else t.push(g)}}class B{constructor(e,n){this.i=e,this.j=n,this.h=0,this.g=null}get(){let e;return this.h>0?(this.h--,e=this.g,this.g=e.next,e.next=null):e=this.i(),e}}function R(t){v.setTimeout(()=>{throw t},0)}function ft(){var t=f;let e=null;return t.g&&(e=t.g,t.g=t.g.next,t.g||(t.h=null),e.next=null),e}class pt{constructor(){this.h=this.g=null}add(e,n){const s=W.get();s.set(e,n),this.h?this.h.next=s:this.g=s,this.h=s}}var W=new B(()=>new gt,t=>t.reset());class gt{constructor(){this.next=this.g=this.h=null}set(e,n){this.h=e,this.g=n,this.next=null}reset(){this.next=this.g=this.h=null}}let G,$=!1,f=new pt,a=()=>{const t=Promise.resolve(void 0);G=()=>{t.then(l)}};function l(){for(var t;t=ft();){try{t.h.call(t.g)}catch(n){R(n)}var e=W;e.j(t),e.h<100&&(e.h++,t.next=e.g,e.g=t)}$=!1}function p(){this.u=this.u,this.C=this.C}p.prototype.u=!1,p.prototype.dispose=function(){this.u||(this.u=!0,this.N())},p.prototype[Symbol.dispose]=function(){this.dispose()},p.prototype.N=function(){if(this.C)for(;this.C.length;)this.C.shift()()};function u(t,e){this.type=t,this.g=this.target=e,this.defaultPrevented=!1}u.prototype.h=function(){this.defaultPrevented=!0};var m=function(){if(!v.addEventListener||!Object.defineProperty)return!1;var t=!1,e=Object.defineProperty({},"passive",{get:function(){t=!0}});try{const n=()=>{};v.addEventListener("test",n,e),v.removeEventListener("test",n,e)}catch{}return t}();function h(t){return/^[\s\xa0]*$/.test(t)}function H(t,e){u.call(this,t?t.type:""),this.relatedTarget=this.g=this.target=null,this.button=this.screenY=this.screenX=this.clientY=this.clientX=0,this.key="",this.metaKey=this.shiftKey=this.altKey=this.ctrlKey=!1,this.state=null,this.pointerId=0,this.pointerType="",this.i=null,t&&this.init(t,e)}A(H,u),H.prototype.init=function(t,e){const n=this.type=t.type,s=t.changedTouches&&t.changedTouches.length?t.changedTouches[0]:null;this.target=t.target||t.srcElement,this.g=e,e=t.relatedTarget,e||(n=="mouseover"?e=t.fromElement:n=="mouseout"&&(e=t.toElement)),this.relatedTarget=e,s?(this.clientX=s.clientX!==void 0?s.clientX:s.pageX,this.clientY=s.clientY!==void 0?s.clientY:s.pageY,this.screenX=s.screenX||0,this.screenY=s.screenY||0):(this.clientX=t.clientX!==void 0?t.clientX:t.pageX,this.clientY=t.clientY!==void 0?t.clientY:t.pageY,this.screenX=t.screenX||0,this.screenY=t.screenY||0),this.button=t.button,this.key=t.key||"",this.ctrlKey=t.ctrlKey,this.altKey=t.altKey,this.shiftKey=t.shiftKey,this.metaKey=t.metaKey,this.pointerId=t.pointerId||0,this.pointerType=t.pointerType,this.state=t.state,this.i=t,t.defaultPrevented&&H.Z.h.call(this)},H.prototype.h=function(){H.Z.h.call(this);const t=this.i;t.preventDefault?t.preventDefault():t.returnValue=!1};var nt="closure_listenable_"+(Math.random()*1e6|0),Mi=0;function Pi(t,e,n,s,g){this.listener=t,this.proxy=null,this.src=e,this.type=n,this.capture=!!s,this.ha=g,this.key=++Mi,this.da=this.fa=!1}function Ut(t){t.da=!0,t.listener=null,t.proxy=null,t.src=null,t.ha=null}function Vt(t,e,n){for(const s in t)e.call(n,t[s],s,t)}function ji(t,e){for(const n in t)e.call(void 0,t[n],n,t)}function We(t){const e={};for(const n in t)e[n]=t[n];return e}const Ge="constructor hasOwnProperty isPrototypeOf propertyIsEnumerable toLocaleString toString valueOf".split(" ");function Ke(t,e){let n,s;for(let g=1;g<arguments.length;g++){s=arguments[g];for(n in s)t[n]=s[n];for(let y=0;y<Ge.length;y++)n=Ge[y],Object.prototype.hasOwnProperty.call(s,n)&&(t[n]=s[n])}}function zt(t){this.src=t,this.g={},this.h=0}zt.prototype.add=function(t,e,n,s,g){const y=t.toString();t=this.g[y],t||(t=this.g[y]=[],this.h++);const w=le(t,e,s,g);return w>-1?(e=t[w],n||(e.fa=!1)):(e=new Pi(e,this.src,y,!!s,g),e.fa=n,t.push(e)),e};function he(t,e){const n=e.type;if(n in t.g){var s=t.g[n],g=Array.prototype.indexOf.call(s,e,void 0),y;(y=g>=0)&&Array.prototype.splice.call(s,g,1),y&&(Ut(e),t.g[n].length==0&&(delete t.g[n],t.h--))}}function le(t,e,n,s){for(let g=0;g<t.length;++g){const y=t[g];if(!y.da&&y.listener==e&&y.capture==!!n&&y.ha==s)return g}return-1}var ce="closure_lm_"+(Math.random()*1e6|0),ue={};function Je(t,e,n,s,g){if(Array.isArray(e)){for(let y=0;y<e.length;y++)Je(t,e[y],n,s,g);return null}return n=Qe(n),t&&t[nt]?t.J(e,n,I(s)?!!s.capture:!1,g):Ni(t,e,n,!1,s,g)}function Ni(t,e,n,s,g,y){if(!e)throw Error("Invalid event type");const w=I(g)?!!g.capture:!!g;let S=pe(t);if(S||(t[ce]=S=new zt(t)),n=S.add(e,n,s,w,y),n.proxy)return n;if(s=xi(),n.proxy=s,s.src=t,s.listener=n,t.addEventListener)m||(g=w),g===void 0&&(g=!1),t.addEventListener(e.toString(),s,g);else if(t.attachEvent)t.attachEvent(Ze(e.toString()),s);else if(t.addListener&&t.removeListener)t.addListener(s);else throw Error("addEventListener and attachEvent are unavailable.");return n}function xi(){function t(n){return e.call(t.src,t.listener,n)}const e=Bi;return t}function Ye(t,e,n,s,g){if(Array.isArray(e))for(var y=0;y<e.length;y++)Ye(t,e[y],n,s,g);else s=I(s)?!!s.capture:!!s,n=Qe(n),t&&t[nt]?(t=t.i,y=String(e).toString(),y in t.g&&(e=t.g[y],n=le(e,n,s,g),n>-1&&(Ut(e[n]),Array.prototype.splice.call(e,n,1),e.length==0&&(delete t.g[y],t.h--)))):t&&(t=pe(t))&&(e=t.g[e.toString()],t=-1,e&&(t=le(e,n,s,g)),(n=t>-1?e[t]:null)&&fe(n))}function fe(t){if(typeof t!="number"&&t&&!t.da){var e=t.src;if(e&&e[nt])he(e.i,t);else{var n=t.type,s=t.proxy;e.removeEventListener?e.removeEventListener(n,s,t.capture):e.detachEvent?e.detachEvent(Ze(n),s):e.addListener&&e.removeListener&&e.removeListener(s),(n=pe(e))?(he(n,t),n.h==0&&(n.src=null,e[ce]=null)):Ut(t)}}}function Ze(t){return t in ue?ue[t]:ue[t]="on"+t}function Bi(t,e){if(t.da)t=!0;else{e=new H(e,this);const n=t.listener,s=t.ha||t.src;t.fa&&fe(t),t=n.call(s,e)}return t}function pe(t){return t=t[ce],t instanceof zt?t:null}var ge="__closure_events_fn_"+(Math.random()*1e9>>>0);function Qe(t){return typeof t=="function"?t:(t[ge]||(t[ge]=function(e){return t.handleEvent(e)}),t[ge])}function P(){p.call(this),this.i=new zt(this),this.M=this,this.G=null}A(P,p),P.prototype[nt]=!0,P.prototype.removeEventListener=function(t,e,n,s){Ye(this,t,e,n,s)};function j(t,e){var n,s=t.G;if(s)for(n=[];s;s=s.G)n.push(s);if(t=t.M,s=e.type||e,typeof e=="string")e=new u(e,t);else if(e instanceof u)e.target=e.target||t;else{var g=e;e=new u(s,t),Ke(e,g)}g=!0;let y,w;if(n)for(w=n.length-1;w>=0;w--)y=e.g=n[w],g=qt(y,s,!0,e)&&g;if(y=e.g=t,g=qt(y,s,!0,e)&&g,g=qt(y,s,!1,e)&&g,n)for(w=0;w<n.length;w++)y=e.g=n[w],g=qt(y,s,!1,e)&&g}P.prototype.N=function(){if(P.Z.N.call(this),this.i){var t=this.i;for(const e in t.g){const n=t.g[e];for(let s=0;s<n.length;s++)Ut(n[s]);delete t.g[e],t.h--}}this.G=null},P.prototype.J=function(t,e,n,s){return this.i.add(String(t),e,!1,n,s)},P.prototype.K=function(t,e,n,s){return this.i.add(String(t),e,!0,n,s)};function qt(t,e,n,s){if(e=t.i.g[String(e)],!e)return!0;e=e.concat();let g=!0;for(let y=0;y<e.length;++y){const w=e[y];if(w&&!w.da&&w.capture==n){const S=w.listener,k=w.ha||w.src;w.fa&&he(t.i,w),g=S.call(k,s)!==!1&&g}}return g&&!s.defaultPrevented}function Hi(t,e){if(typeof t!="function")if(t&&typeof t.handleEvent=="function")t=E(t.handleEvent,t);else throw Error("Invalid listener argument");return Number(e)>2147483647?-1:v.setTimeout(t,e||0)}function tn(t){t.g=Hi(()=>{t.g=null,t.i&&(t.i=!1,tn(t))},t.l);const e=t.h;t.h=null,t.m.apply(null,e)}class Li extends p{constructor(e,n){super(),this.m=e,this.l=n,this.h=null,this.i=!1,this.g=null}j(e){this.h=arguments,this.g?this.i=!0:tn(this)}N(){super.N(),this.g&&(v.clearTimeout(this.g),this.g=null,this.i=!1,this.h=null)}}function At(t){p.call(this),this.h=t,this.g={}}A(At,p);var en=[];function nn(t){Vt(t.g,function(e,n){this.g.hasOwnProperty(n)&&fe(e)},t),t.g={}}At.prototype.N=function(){At.Z.N.call(this),nn(this)},At.prototype.handleEvent=function(){throw Error("EventHandler.handleEvent not implemented")};var de=v.JSON.stringify,Fi=v.JSON.parse,$i=class{stringify(t){return v.JSON.stringify(t,void 0)}parse(t){return v.JSON.parse(t,void 0)}};function rn(){}function sn(){}var Tt={OPEN:"a",hb:"b",ERROR:"c",tb:"d"};function me(){u.call(this,"d")}A(me,u);function ye(){u.call(this,"c")}A(ye,u);var it={},on=null;function Xt(){return on=on||new P}it.Ia="serverreachability";function an(t){u.call(this,it.Ia,t)}A(an,u);function Ct(t){const e=Xt();j(e,new an(e))}it.STAT_EVENT="statevent";function hn(t,e){u.call(this,it.STAT_EVENT,t),this.stat=e}A(hn,u);function N(t){const e=Xt();j(e,new hn(e,t))}it.Ja="timingevent";function ln(t,e){u.call(this,it.Ja,t),this.size=e}A(ln,u);function _t(t,e){if(typeof t!="function")throw Error("Fn must not be null and must be a function");return v.setTimeout(function(){t()},e)}function Dt(){this.g=!0}Dt.prototype.ua=function(){this.g=!1};function Ui(t,e,n,s,g,y){t.info(function(){if(t.g)if(y){var w="",S=y.split("&");for(let T=0;T<S.length;T++){var k=S[T].split("=");if(k.length>1){const M=k[0];k=k[1];const q=M.split("_");w=q.length>=2&&q[1]=="type"?w+(M+"="+k+"&"):w+(M+"=redacted&")}}}else w=null;else w=y;return"XMLHTTP REQ ("+s+") [attempt "+g+"]: "+e+`
`+n+`
`+w})}function Vi(t,e,n,s,g,y,w){t.info(function(){return"XMLHTTP RESP ("+s+") [ attempt "+g+"]: "+e+`
`+n+`
`+y+" "+w})}function dt(t,e,n,s){t.info(function(){return"XMLHTTP TEXT ("+e+"): "+qi(t,n)+(s?" "+s:"")})}function zi(t,e){t.info(function(){return"TIMEOUT: "+e})}Dt.prototype.info=function(){};function qi(t,e){if(!t.g)return e;if(!e)return null;try{const y=JSON.parse(e);if(y){for(t=0;t<y.length;t++)if(Array.isArray(y[t])){var n=y[t];if(!(n.length<2)){var s=n[1];if(Array.isArray(s)&&!(s.length<1)){var g=s[0];if(g!="noop"&&g!="stop"&&g!="close")for(let w=1;w<s.length;w++)s[w]=""}}}}return de(y)}catch{return e}}var Wt={NO_ERROR:0,cb:1,qb:2,pb:3,kb:4,ob:5,rb:6,Ga:7,TIMEOUT:8,ub:9},cn={ib:"complete",Fb:"success",ERROR:"error",Ga:"abort",xb:"ready",yb:"readystatechange",TIMEOUT:"timeout",sb:"incrementaldata",wb:"progress",lb:"downloadprogress",Nb:"uploadprogress"},un;function ve(){}A(ve,rn),ve.prototype.g=function(){return new XMLHttpRequest},un=new ve;function Ot(t){return encodeURIComponent(String(t))}function Xi(t){var e=1;t=t.split(":");const n=[];for(;e>0&&t.length;)n.push(t.shift()),e--;return t.length&&n.push(t.join(":")),n}function K(t,e,n,s){this.j=t,this.i=e,this.l=n,this.S=s||1,this.V=new At(this),this.H=45e3,this.J=null,this.o=!1,this.u=this.B=this.A=this.M=this.F=this.T=this.D=null,this.G=[],this.g=null,this.C=0,this.m=this.v=null,this.X=-1,this.K=!1,this.P=0,this.O=null,this.W=this.L=this.U=this.R=!1,this.h=new fn}function fn(){this.i=null,this.g="",this.h=!1}var pn={},we={};function be(t,e,n){t.M=1,t.A=Kt(z(e)),t.u=n,t.R=!0,gn(t,null)}function gn(t,e){t.F=Date.now(),Gt(t),t.B=z(t.A);var n=t.B,s=t.S;Array.isArray(s)||(s=[String(s)]),_n(n.i,"t",s),t.C=0,n=t.j.L,t.h=new fn,t.g=qn(t.j,n?e:null,!t.u),t.P>0&&(t.O=new Li(E(t.Y,t,t.g),t.P)),e=t.V,n=t.g,s=t.ba;var g="readystatechange";Array.isArray(g)||(g&&(en[0]=g.toString()),g=en);for(let y=0;y<g.length;y++){const w=Je(n,g[y],s||e.handleEvent,!1,e.h||e);if(!w)break;e.g[w.key]=w}e=t.J?We(t.J):{},t.u?(t.v||(t.v="POST"),e["Content-Type"]="application/x-www-form-urlencoded",t.g.ea(t.B,t.v,t.u,e)):(t.v="GET",t.g.ea(t.B,t.v,null,e)),Ct(),Ui(t.i,t.v,t.B,t.l,t.S,t.u)}K.prototype.ba=function(t){t=t.target;const e=this.O;e&&Z(t)==3?e.j():this.Y(t)},K.prototype.Y=function(t){try{if(t==this.g)t:{const S=Z(this.g),k=this.g.ya(),T=this.g.ca();if(!(S<3)&&(S!=3||this.g&&(this.h.h||this.g.la()||jn(this.g)))){this.K||S!=4||k==7||(k==8||T<=0?Ct(3):Ct(2)),Ee(this);var e=this.g.ca();this.X=e;var n=Wi(this);if(this.o=e==200,Vi(this.i,this.v,this.B,this.l,this.S,S,e),this.o){if(this.U&&!this.L){e:{if(this.g){var s,g=this.g;if((s=g.g?g.g.getResponseHeader("X-HTTP-Initial-Response"):null)&&!h(s)){var y=s;break e}}y=null}if(t=y)dt(this.i,this.l,t,"Initial handshake response via X-HTTP-Initial-Response"),this.L=!0,Se(this,t);else{this.o=!1,this.m=3,N(12),rt(this),Rt(this);break t}}if(this.R){t=!0;let M;for(;!this.K&&this.C<n.length;)if(M=Gi(this,n),M==we){S==4&&(this.m=4,N(14),t=!1),dt(this.i,this.l,null,"[Incomplete Response]");break}else if(M==pn){this.m=4,N(15),dt(this.i,this.l,n,"[Invalid Chunk]"),t=!1;break}else dt(this.i,this.l,M,null),Se(this,M);if(dn(this)&&this.C!=0&&(this.h.g=this.h.g.slice(this.C),this.C=0),S!=4||n.length!=0||this.h.h||(this.m=1,N(16),t=!1),this.o=this.o&&t,!t)dt(this.i,this.l,n,"[Invalid Chunked Response]"),rt(this),Rt(this);else if(n.length>0&&!this.W){this.W=!0;var w=this.j;w.g==this&&w.aa&&!w.P&&(w.j.info("Great, no buffering proxy detected. Bytes received: "+n.length),Re(w),w.P=!0,N(11))}}else dt(this.i,this.l,n,null),Se(this,n);S==4&&rt(this),this.o&&!this.K&&(S==4?$n(this.j,this):(this.o=!1,Gt(this)))}else hr(this.g),e==400&&n.indexOf("Unknown SID")>0?(this.m=3,N(12)):(this.m=0,N(13)),rt(this),Rt(this)}}}catch{}finally{}};function Wi(t){if(!dn(t))return t.g.la();const e=jn(t.g);if(e==="")return"";let n="";const s=e.length,g=Z(t.g)==4;if(!t.h.i){if(typeof TextDecoder>"u")return rt(t),Rt(t),"";t.h.i=new v.TextDecoder}for(let y=0;y<s;y++)t.h.h=!0,n+=t.h.i.decode(e[y],{stream:!(g&&y==s-1)});return e.length=0,t.h.g+=n,t.C=0,t.h.g}function dn(t){return t.g?t.v=="GET"&&t.M!=2&&t.j.Aa:!1}function Gi(t,e){var n=t.C,s=e.indexOf(`
`,n);return s==-1?we:(n=Number(e.substring(n,s)),isNaN(n)?pn:(s+=1,s+n>e.length?we:(e=e.slice(s,s+n),t.C=s+n,e)))}K.prototype.cancel=function(){this.K=!0,rt(this)};function Gt(t){t.T=Date.now()+t.H,mn(t,t.H)}function mn(t,e){if(t.D!=null)throw Error("WatchDog timer not null");t.D=_t(E(t.aa,t),e)}function Ee(t){t.D&&(v.clearTimeout(t.D),t.D=null)}K.prototype.aa=function(){this.D=null;const t=Date.now();t-this.T>=0?(zi(this.i,this.B),this.M!=2&&(Ct(),N(17)),rt(this),this.m=2,Rt(this)):mn(this,this.T-t)};function Rt(t){t.j.I==0||t.K||$n(t.j,t)}function rt(t){Ee(t);var e=t.O;e&&typeof e.dispose=="function"&&e.dispose(),t.O=null,nn(t.V),t.g&&(e=t.g,t.g=null,e.abort(),e.dispose())}function Se(t,e){try{var n=t.j;if(n.I!=0&&(n.g==t||Ie(n.h,t))){if(!t.L&&Ie(n.h,t)&&n.I==3){try{var s=n.Ba.g.parse(e)}catch{s=null}if(Array.isArray(s)&&s.length==3){var g=s;if(g[0]==0){t:if(!n.v){if(n.g)if(n.g.F+3e3<t.F)te(n),Zt(n);else break t;Oe(n),N(18)}}else n.xa=g[1],0<n.xa-n.K&&g[2]<37500&&n.F&&n.A==0&&!n.C&&(n.C=_t(E(n.Va,n),6e3));wn(n.h)<=1&&n.ta&&(n.ta=void 0)}else ot(n,11)}else if((t.L||n.g==t)&&te(n),!h(e))for(g=n.Ba.g.parse(e),e=0;e<g.length;e++){let T=g[e];const M=T[0];if(!(M<=n.K))if(n.K=M,T=T[1],n.I==2)if(T[0]=="c"){n.M=T[1],n.ba=T[2];const q=T[3];q!=null&&(n.ka=q,n.j.info("VER="+n.ka));const at=T[4];at!=null&&(n.za=at,n.j.info("SVER="+n.za));const Q=T[5];Q!=null&&typeof Q=="number"&&Q>0&&(s=1.5*Q,n.O=s,n.j.info("backChannelRequestTimeoutMs_="+s)),s=n;const tt=t.g;if(tt){const ne=tt.g?tt.g.getResponseHeader("X-Client-Wire-Protocol"):null;if(ne){var y=s.h;y.g||ne.indexOf("spdy")==-1&&ne.indexOf("quic")==-1&&ne.indexOf("h2")==-1||(y.j=y.l,y.g=new Set,y.h&&(Ae(y,y.h),y.h=null))}if(s.G){const ke=tt.g?tt.g.getResponseHeader("X-HTTP-Session-Id"):null;ke&&(s.wa=ke,C(s.J,s.G,ke))}}n.I=3,n.l&&n.l.ra(),n.aa&&(n.T=Date.now()-t.F,n.j.info("Handshake RTT: "+n.T+"ms")),s=n;var w=t;if(s.na=zn(s,s.L?s.ba:null,s.W),w.L){bn(s.h,w);var S=w,k=s.O;k&&(S.H=k),S.D&&(Ee(S),Gt(S)),s.g=w}else Ln(s);n.i.length>0&&Qt(n)}else T[0]!="stop"&&T[0]!="close"||ot(n,7);else n.I==3&&(T[0]=="stop"||T[0]=="close"?T[0]=="stop"?ot(n,7):De(n):T[0]!="noop"&&n.l&&n.l.qa(T),n.A=0)}}Ct(4)}catch{}}var Ki=class{constructor(t,e){this.g=t,this.map=e}};function yn(t){this.l=t||10,v.PerformanceNavigationTiming?(t=v.performance.getEntriesByType("navigation"),t=t.length>0&&(t[0].nextHopProtocol=="hq"||t[0].nextHopProtocol=="h2")):t=!!(v.chrome&&v.chrome.loadTimes&&v.chrome.loadTimes()&&v.chrome.loadTimes().wasFetchedViaSpdy),this.j=t?this.l:1,this.g=null,this.j>1&&(this.g=new Set),this.h=null,this.i=[]}function vn(t){return t.h?!0:t.g?t.g.size>=t.j:!1}function wn(t){return t.h?1:t.g?t.g.size:0}function Ie(t,e){return t.h?t.h==e:t.g?t.g.has(e):!1}function Ae(t,e){t.g?t.g.add(e):t.h=e}function bn(t,e){t.h&&t.h==e?t.h=null:t.g&&t.g.has(e)&&t.g.delete(e)}yn.prototype.cancel=function(){if(this.i=En(this),this.h)this.h.cancel(),this.h=null;else if(this.g&&this.g.size!==0){for(const t of this.g.values())t.cancel();this.g.clear()}};function En(t){if(t.h!=null)return t.i.concat(t.h.G);if(t.g!=null&&t.g.size!==0){let e=t.i;for(const n of t.g.values())e=e.concat(n.G);return e}return U(t.i)}var Sn=RegExp("^(?:([^:/?#.]+):)?(?://(?:([^\\\\/?#]*)@)?([^\\\\/?#]*?)(?::([0-9]+))?(?=[\\\\/?#]|$))?([^?#]+)?(?:\\?([^#]*))?(?:#([\\s\\S]*))?$");function Ji(t,e){if(t){t=t.split("&");for(let n=0;n<t.length;n++){const s=t[n].indexOf("=");let g,y=null;s>=0?(g=t[n].substring(0,s),y=t[n].substring(s+1)):g=t[n],e(g,y?decodeURIComponent(y.replace(/\+/g," ")):"")}}}function J(t){this.g=this.o=this.j="",this.u=null,this.m=this.h="",this.l=!1;let e;t instanceof J?(this.l=t.l,kt(this,t.j),this.o=t.o,this.g=t.g,Mt(this,t.u),this.h=t.h,Te(this,Dn(t.i)),this.m=t.m):t&&(e=String(t).match(Sn))?(this.l=!1,kt(this,e[1]||"",!0),this.o=Pt(e[2]||""),this.g=Pt(e[3]||"",!0),Mt(this,e[4]),this.h=Pt(e[5]||"",!0),Te(this,e[6]||"",!0),this.m=Pt(e[7]||"")):(this.l=!1,this.i=new Nt(null,this.l))}J.prototype.toString=function(){const t=[];var e=this.j;e&&t.push(jt(e,In,!0),":");var n=this.g;return(n||e=="file")&&(t.push("//"),(e=this.o)&&t.push(jt(e,In,!0),"@"),t.push(Ot(n).replace(/%25([0-9a-fA-F]{2})/g,"%$1")),n=this.u,n!=null&&t.push(":",String(n))),(n=this.h)&&(this.g&&n.charAt(0)!="/"&&t.push("/"),t.push(jt(n,n.charAt(0)=="/"?Qi:Zi,!0))),(n=this.i.toString())&&t.push("?",n),(n=this.m)&&t.push("#",jt(n,er)),t.join("")},J.prototype.resolve=function(t){const e=z(this);let n=!!t.j;n?kt(e,t.j):n=!!t.o,n?e.o=t.o:n=!!t.g,n?e.g=t.g:n=t.u!=null;var s=t.h;if(n)Mt(e,t.u);else if(n=!!t.h){if(s.charAt(0)!="/")if(this.g&&!this.h)s="/"+s;else{var g=e.h.lastIndexOf("/");g!=-1&&(s=e.h.slice(0,g+1)+s)}if(g=s,g==".."||g==".")s="";else if(g.indexOf("./")!=-1||g.indexOf("/.")!=-1){s=g.lastIndexOf("/",0)==0,g=g.split("/");const y=[];for(let w=0;w<g.length;){const S=g[w++];S=="."?s&&w==g.length&&y.push(""):S==".."?((y.length>1||y.length==1&&y[0]!="")&&y.pop(),s&&w==g.length&&y.push("")):(y.push(S),s=!0)}s=y.join("/")}else s=g}return n?e.h=s:n=t.i.toString()!=="",n?Te(e,Dn(t.i)):n=!!t.m,n&&(e.m=t.m),e};function z(t){return new J(t)}function kt(t,e,n){t.j=n?Pt(e,!0):e,t.j&&(t.j=t.j.replace(/:$/,""))}function Mt(t,e){if(e){if(e=Number(e),isNaN(e)||e<0)throw Error("Bad port number "+e);t.u=e}else t.u=null}function Te(t,e,n){e instanceof Nt?(t.i=e,nr(t.i,t.l)):(n||(e=jt(e,tr)),t.i=new Nt(e,t.l))}function C(t,e,n){t.i.set(e,n)}function Kt(t){return C(t,"zx",Math.floor(Math.random()*2147483648).toString(36)+Math.abs(Math.floor(Math.random()*2147483648)^Date.now()).toString(36)),t}function Pt(t,e){return t?e?decodeURI(t.replace(/%25/g,"%2525")):decodeURIComponent(t):""}function jt(t,e,n){return typeof t=="string"?(t=encodeURI(t).replace(e,Yi),n&&(t=t.replace(/%25([0-9a-fA-F]{2})/g,"%$1")),t):null}function Yi(t){return t=t.charCodeAt(0),"%"+(t>>4&15).toString(16)+(t&15).toString(16)}var In=/[#\/\?@]/g,Zi=/[#\?:]/g,Qi=/[#\?]/g,tr=/[#\?@]/g,er=/#/g;function Nt(t,e){this.h=this.g=null,this.i=t||null,this.j=!!e}function st(t){t.g||(t.g=new Map,t.h=0,t.i&&Ji(t.i,function(e,n){t.add(decodeURIComponent(e.replace(/\+/g," ")),n)}))}i=Nt.prototype,i.add=function(t,e){st(this),this.i=null,t=mt(this,t);let n=this.g.get(t);return n||this.g.set(t,n=[]),n.push(e),this.h+=1,this};function An(t,e){st(t),e=mt(t,e),t.g.has(e)&&(t.i=null,t.h-=t.g.get(e).length,t.g.delete(e))}function Tn(t,e){return st(t),e=mt(t,e),t.g.has(e)}i.forEach=function(t,e){st(this),this.g.forEach(function(n,s){n.forEach(function(g){t.call(e,g,s,this)},this)},this)};function Cn(t,e){st(t);let n=[];if(typeof e=="string")Tn(t,e)&&(n=n.concat(t.g.get(mt(t,e))));else for(t=Array.from(t.g.values()),e=0;e<t.length;e++)n=n.concat(t[e]);return n}i.set=function(t,e){return st(this),this.i=null,t=mt(this,t),Tn(this,t)&&(this.h-=this.g.get(t).length),this.g.set(t,[e]),this.h+=1,this},i.get=function(t,e){return t?(t=Cn(this,t),t.length>0?String(t[0]):e):e};function _n(t,e,n){An(t,e),n.length>0&&(t.i=null,t.g.set(mt(t,e),U(n)),t.h+=n.length)}i.toString=function(){if(this.i)return this.i;if(!this.g)return"";const t=[],e=Array.from(this.g.keys());for(let s=0;s<e.length;s++){var n=e[s];const g=Ot(n);n=Cn(this,n);for(let y=0;y<n.length;y++){let w=g;n[y]!==""&&(w+="="+Ot(n[y])),t.push(w)}}return this.i=t.join("&")};function Dn(t){const e=new Nt;return e.i=t.i,t.g&&(e.g=new Map(t.g),e.h=t.h),e}function mt(t,e){return e=String(e),t.j&&(e=e.toLowerCase()),e}function nr(t,e){e&&!t.j&&(st(t),t.i=null,t.g.forEach(function(n,s){const g=s.toLowerCase();s!=g&&(An(this,s),_n(this,g,n))},t)),t.j=e}function ir(t,e){const n=new Dt;if(v.Image){const s=new Image;s.onload=F(Y,n,"TestLoadImage: loaded",!0,e,s),s.onerror=F(Y,n,"TestLoadImage: error",!1,e,s),s.onabort=F(Y,n,"TestLoadImage: abort",!1,e,s),s.ontimeout=F(Y,n,"TestLoadImage: timeout",!1,e,s),v.setTimeout(function(){s.ontimeout&&s.ontimeout()},1e4),s.src=t}else e(!1)}function rr(t,e){const n=new Dt,s=new AbortController,g=setTimeout(()=>{s.abort(),Y(n,"TestPingServer: timeout",!1,e)},1e4);fetch(t,{signal:s.signal}).then(y=>{clearTimeout(g),y.ok?Y(n,"TestPingServer: ok",!0,e):Y(n,"TestPingServer: server error",!1,e)}).catch(()=>{clearTimeout(g),Y(n,"TestPingServer: error",!1,e)})}function Y(t,e,n,s,g){try{g&&(g.onload=null,g.onerror=null,g.onabort=null,g.ontimeout=null),s(n)}catch{}}function sr(){this.g=new $i}function Ce(t){this.i=t.Sb||null,this.h=t.ab||!1}A(Ce,rn),Ce.prototype.g=function(){return new Jt(this.i,this.h)};function Jt(t,e){P.call(this),this.H=t,this.o=e,this.m=void 0,this.status=this.readyState=0,this.responseType=this.responseText=this.response=this.statusText="",this.onreadystatechange=null,this.A=new Headers,this.h=null,this.F="GET",this.D="",this.g=!1,this.B=this.j=this.l=null,this.v=new AbortController}A(Jt,P),i=Jt.prototype,i.open=function(t,e){if(this.readyState!=0)throw this.abort(),Error("Error reopening a connection");this.F=t,this.D=e,this.readyState=1,Bt(this)},i.send=function(t){if(this.readyState!=1)throw this.abort(),Error("need to call open() first. ");if(this.v.signal.aborted)throw this.abort(),Error("Request was aborted.");this.g=!0;const e={headers:this.A,method:this.F,credentials:this.m,cache:void 0,signal:this.v.signal};t&&(e.body=t),(this.H||v).fetch(new Request(this.D,e)).then(this.Pa.bind(this),this.ga.bind(this))},i.abort=function(){this.response=this.responseText="",this.A=new Headers,this.status=0,this.v.abort(),this.j&&this.j.cancel("Request was aborted.").catch(()=>{}),this.readyState>=1&&this.g&&this.readyState!=4&&(this.g=!1,xt(this)),this.readyState=0},i.Pa=function(t){if(this.g&&(this.l=t,this.h||(this.status=this.l.status,this.statusText=this.l.statusText,this.h=t.headers,this.readyState=2,Bt(this)),this.g&&(this.readyState=3,Bt(this),this.g)))if(this.responseType==="arraybuffer")t.arrayBuffer().then(this.Na.bind(this),this.ga.bind(this));else if(typeof v.ReadableStream<"u"&&"body"in t){if(this.j=t.body.getReader(),this.o){if(this.responseType)throw Error('responseType must be empty for "streamBinaryChunks" mode responses.');this.response=[]}else this.response=this.responseText="",this.B=new TextDecoder;On(this)}else t.text().then(this.Oa.bind(this),this.ga.bind(this))};function On(t){t.j.read().then(t.Ma.bind(t)).catch(t.ga.bind(t))}i.Ma=function(t){if(this.g){if(this.o&&t.value)this.response.push(t.value);else if(!this.o){var e=t.value?t.value:new Uint8Array(0);(e=this.B.decode(e,{stream:!t.done}))&&(this.response=this.responseText+=e)}t.done?xt(this):Bt(this),this.readyState==3&&On(this)}},i.Oa=function(t){this.g&&(this.response=this.responseText=t,xt(this))},i.Na=function(t){this.g&&(this.response=t,xt(this))},i.ga=function(){this.g&&xt(this)};function xt(t){t.readyState=4,t.l=null,t.j=null,t.B=null,Bt(t)}i.setRequestHeader=function(t,e){this.A.append(t,e)},i.getResponseHeader=function(t){return this.h&&this.h.get(t.toLowerCase())||""},i.getAllResponseHeaders=function(){if(!this.h)return"";const t=[],e=this.h.entries();for(var n=e.next();!n.done;)n=n.value,t.push(n[0]+": "+n[1]),n=e.next();return t.join(`\r
`)};function Bt(t){t.onreadystatechange&&t.onreadystatechange.call(t)}Object.defineProperty(Jt.prototype,"withCredentials",{get:function(){return this.m==="include"},set:function(t){this.m=t?"include":"same-origin"}});function Rn(t){let e="";return Vt(t,function(n,s){e+=s,e+=":",e+=n,e+=`\r
`}),e}function _e(t,e,n){t:{for(s in n){var s=!1;break t}s=!0}s||(n=Rn(n),typeof t=="string"?n!=null&&Ot(n):C(t,e,n))}function O(t){P.call(this),this.headers=new Map,this.L=t||null,this.h=!1,this.g=null,this.D="",this.o=0,this.l="",this.j=this.B=this.v=this.A=!1,this.m=null,this.F="",this.H=!1}A(O,P);var or=/^https?$/i,ar=["POST","PUT"];i=O.prototype,i.Fa=function(t){this.H=t},i.ea=function(t,e,n,s){if(this.g)throw Error("[goog.net.XhrIo] Object is active with another request="+this.D+"; newUri="+t);e=e?e.toUpperCase():"GET",this.D=t,this.l="",this.o=0,this.A=!1,this.h=!0,this.g=this.L?this.L.g():un.g(),this.g.onreadystatechange=V(E(this.Ca,this));try{this.B=!0,this.g.open(e,String(t),!0),this.B=!1}catch(y){kn(this,y);return}if(t=n||"",n=new Map(this.headers),s)if(Object.getPrototypeOf(s)===Object.prototype)for(var g in s)n.set(g,s[g]);else if(typeof s.keys=="function"&&typeof s.get=="function")for(const y of s.keys())n.set(y,s.get(y));else throw Error("Unknown input type for opt_headers: "+String(s));s=Array.from(n.keys()).find(y=>y.toLowerCase()=="content-type"),g=v.FormData&&t instanceof v.FormData,!(Array.prototype.indexOf.call(ar,e,void 0)>=0)||s||g||n.set("Content-Type","application/x-www-form-urlencoded;charset=utf-8");for(const[y,w]of n)this.g.setRequestHeader(y,w);this.F&&(this.g.responseType=this.F),"withCredentials"in this.g&&this.g.withCredentials!==this.H&&(this.g.withCredentials=this.H);try{this.m&&(clearTimeout(this.m),this.m=null),this.v=!0,this.g.send(t),this.v=!1}catch(y){kn(this,y)}};function kn(t,e){t.h=!1,t.g&&(t.j=!0,t.g.abort(),t.j=!1),t.l=e,t.o=5,Mn(t),Yt(t)}function Mn(t){t.A||(t.A=!0,j(t,"complete"),j(t,"error"))}i.abort=function(t){this.g&&this.h&&(this.h=!1,this.j=!0,this.g.abort(),this.j=!1,this.o=t||7,j(this,"complete"),j(this,"abort"),Yt(this))},i.N=function(){this.g&&(this.h&&(this.h=!1,this.j=!0,this.g.abort(),this.j=!1),Yt(this,!0)),O.Z.N.call(this)},i.Ca=function(){this.u||(this.B||this.v||this.j?Pn(this):this.Xa())},i.Xa=function(){Pn(this)};function Pn(t){if(t.h&&typeof b<"u"){if(t.v&&Z(t)==4)setTimeout(t.Ca.bind(t),0);else if(j(t,"readystatechange"),Z(t)==4){t.h=!1;try{const y=t.ca();t:switch(y){case 200:case 201:case 202:case 204:case 206:case 304:case 1223:var e=!0;break t;default:e=!1}var n;if(!(n=e)){var s;if(s=y===0){let w=String(t.D).match(Sn)[1]||null;!w&&v.self&&v.self.location&&(w=v.self.location.protocol.slice(0,-1)),s=!or.test(w?w.toLowerCase():"")}n=s}if(n)j(t,"complete"),j(t,"success");else{t.o=6;try{var g=Z(t)>2?t.g.statusText:""}catch{g=""}t.l=g+" ["+t.ca()+"]",Mn(t)}}finally{Yt(t)}}}}function Yt(t,e){if(t.g){t.m&&(clearTimeout(t.m),t.m=null);const n=t.g;t.g=null,e||j(t,"ready");try{n.onreadystatechange=null}catch{}}}i.isActive=function(){return!!this.g};function Z(t){return t.g?t.g.readyState:0}i.ca=function(){try{return Z(this)>2?this.g.status:-1}catch{return-1}},i.la=function(){try{return this.g?this.g.responseText:""}catch{return""}},i.La=function(t){if(this.g){var e=this.g.responseText;return t&&e.indexOf(t)==0&&(e=e.substring(t.length)),Fi(e)}};function jn(t){try{if(!t.g)return null;if("response"in t.g)return t.g.response;switch(t.F){case"":case"text":return t.g.responseText;case"arraybuffer":if("mozResponseArrayBuffer"in t.g)return t.g.mozResponseArrayBuffer}return null}catch{return null}}function hr(t){const e={};t=(t.g&&Z(t)>=2&&t.g.getAllResponseHeaders()||"").split(`\r
`);for(let s=0;s<t.length;s++){if(h(t[s]))continue;var n=Xi(t[s]);const g=n[0];if(n=n[1],typeof n!="string")continue;n=n.trim();const y=e[g]||[];e[g]=y,y.push(n)}ji(e,function(s){return s.join(", ")})}i.ya=function(){return this.o},i.Ha=function(){return typeof this.l=="string"?this.l:String(this.l)};function Ht(t,e,n){return n&&n.internalChannelParams&&n.internalChannelParams[t]||e}function Nn(t){this.za=0,this.i=[],this.j=new Dt,this.ba=this.na=this.J=this.W=this.g=this.wa=this.G=this.H=this.u=this.U=this.o=null,this.Ya=this.V=0,this.Sa=Ht("failFast",!1,t),this.F=this.C=this.v=this.m=this.l=null,this.X=!0,this.xa=this.K=-1,this.Y=this.A=this.D=0,this.Qa=Ht("baseRetryDelayMs",5e3,t),this.Za=Ht("retryDelaySeedMs",1e4,t),this.Ta=Ht("forwardChannelMaxRetries",2,t),this.va=Ht("forwardChannelRequestTimeoutMs",2e4,t),this.ma=t&&t.xmlHttpFactory||void 0,this.Ua=t&&t.Rb||void 0,this.Aa=t&&t.useFetchStreams||!1,this.O=void 0,this.L=t&&t.supportsCrossDomainXhr||!1,this.M="",this.h=new yn(t&&t.concurrentRequestLimit),this.Ba=new sr,this.S=t&&t.fastHandshake||!1,this.R=t&&t.encodeInitMessageHeaders||!1,this.S&&this.R&&(this.R=!1),this.Ra=t&&t.Pb||!1,t&&t.ua&&this.j.ua(),t&&t.forceLongPolling&&(this.X=!1),this.aa=!this.S&&this.X&&t&&t.detectBufferingProxy||!1,this.ia=void 0,t&&t.longPollingTimeout&&t.longPollingTimeout>0&&(this.ia=t.longPollingTimeout),this.ta=void 0,this.T=0,this.P=!1,this.ja=this.B=null}i=Nn.prototype,i.ka=8,i.I=1,i.connect=function(t,e,n,s){N(0),this.W=t,this.H=e||{},n&&s!==void 0&&(this.H.OSID=n,this.H.OAID=s),this.F=this.X,this.J=zn(this,null,this.W),Qt(this)};function De(t){if(xn(t),t.I==3){var e=t.V++,n=z(t.J);if(C(n,"SID",t.M),C(n,"RID",e),C(n,"TYPE","terminate"),Lt(t,n),e=new K(t,t.j,e),e.M=2,e.A=Kt(z(n)),n=!1,v.navigator&&v.navigator.sendBeacon)try{n=v.navigator.sendBeacon(e.A.toString(),"")}catch{}!n&&v.Image&&(new Image().src=e.A,n=!0),n||(e.g=qn(e.j,null),e.g.ea(e.A)),e.F=Date.now(),Gt(e)}Vn(t)}function Zt(t){t.g&&(Re(t),t.g.cancel(),t.g=null)}function xn(t){Zt(t),t.v&&(v.clearTimeout(t.v),t.v=null),te(t),t.h.cancel(),t.m&&(typeof t.m=="number"&&v.clearTimeout(t.m),t.m=null)}function Qt(t){if(!vn(t.h)&&!t.m){t.m=!0;var e=t.Ea;G||a(),$||(G(),$=!0),f.add(e,t),t.D=0}}function lr(t,e){return wn(t.h)>=t.h.j-(t.m?1:0)?!1:t.m?(t.i=e.G.concat(t.i),!0):t.I==1||t.I==2||t.D>=(t.Sa?0:t.Ta)?!1:(t.m=_t(E(t.Ea,t,e),Un(t,t.D)),t.D++,!0)}i.Ea=function(t){if(this.m)if(this.m=null,this.I==1){if(!t){this.V=Math.floor(Math.random()*1e5),t=this.V++;const g=new K(this,this.j,t);let y=this.o;if(this.U&&(y?(y=We(y),Ke(y,this.U)):y=this.U),this.u!==null||this.R||(g.J=y,y=null),this.S)t:{for(var e=0,n=0;n<this.i.length;n++){e:{var s=this.i[n];if("__data__"in s.map&&(s=s.map.__data__,typeof s=="string")){s=s.length;break e}s=void 0}if(s===void 0)break;if(e+=s,e>4096){e=n;break t}if(e===4096||n===this.i.length-1){e=n+1;break t}}e=1e3}else e=1e3;e=Hn(this,g,e),n=z(this.J),C(n,"RID",t),C(n,"CVER",22),this.G&&C(n,"X-HTTP-Session-Id",this.G),Lt(this,n),y&&(this.R?e="headers="+Ot(Rn(y))+"&"+e:this.u&&_e(n,this.u,y)),Ae(this.h,g),this.Ra&&C(n,"TYPE","init"),this.S?(C(n,"$req",e),C(n,"SID","null"),g.U=!0,be(g,n,null)):be(g,n,e),this.I=2}}else this.I==3&&(t?Bn(this,t):this.i.length==0||vn(this.h)||Bn(this))};function Bn(t,e){var n;e?n=e.l:n=t.V++;const s=z(t.J);C(s,"SID",t.M),C(s,"RID",n),C(s,"AID",t.K),Lt(t,s),t.u&&t.o&&_e(s,t.u,t.o),n=new K(t,t.j,n,t.D+1),t.u===null&&(n.J=t.o),e&&(t.i=e.G.concat(t.i)),e=Hn(t,n,1e3),n.H=Math.round(t.va*.5)+Math.round(t.va*.5*Math.random()),Ae(t.h,n),be(n,s,e)}function Lt(t,e){t.H&&Vt(t.H,function(n,s){C(e,s,n)}),t.l&&Vt({},function(n,s){C(e,s,n)})}function Hn(t,e,n){n=Math.min(t.i.length,n);const s=t.l?E(t.l.Ka,t.l,t):null;t:{var g=t.i;let S=-1;for(;;){const k=["count="+n];S==-1?n>0?(S=g[0].g,k.push("ofs="+S)):S=0:k.push("ofs="+S);let T=!0;for(let M=0;M<n;M++){var y=g[M].g;const q=g[M].map;if(y-=S,y<0)S=Math.max(0,g[M].g-100),T=!1;else try{y="req"+y+"_"||"";try{var w=q instanceof Map?q:Object.entries(q);for(const[at,Q]of w){let tt=Q;I(Q)&&(tt=de(Q)),k.push(y+at+"="+encodeURIComponent(tt))}}catch(at){throw k.push(y+"type="+encodeURIComponent("_badmap")),at}}catch{s&&s(q)}}if(T){w=k.join("&");break t}}w=void 0}return t=t.i.splice(0,n),e.G=t,w}function Ln(t){if(!t.g&&!t.v){t.Y=1;var e=t.Da;G||a(),$||(G(),$=!0),f.add(e,t),t.A=0}}function Oe(t){return t.g||t.v||t.A>=3?!1:(t.Y++,t.v=_t(E(t.Da,t),Un(t,t.A)),t.A++,!0)}i.Da=function(){if(this.v=null,Fn(this),this.aa&&!(this.P||this.g==null||this.T<=0)){var t=4*this.T;this.j.info("BP detection timer enabled: "+t),this.B=_t(E(this.Wa,this),t)}},i.Wa=function(){this.B&&(this.B=null,this.j.info("BP detection timeout reached."),this.j.info("Buffering proxy detected and switch to long-polling!"),this.F=!1,this.P=!0,N(10),Zt(this),Fn(this))};function Re(t){t.B!=null&&(v.clearTimeout(t.B),t.B=null)}function Fn(t){t.g=new K(t,t.j,"rpc",t.Y),t.u===null&&(t.g.J=t.o),t.g.P=0;var e=z(t.na);C(e,"RID","rpc"),C(e,"SID",t.M),C(e,"AID",t.K),C(e,"CI",t.F?"0":"1"),!t.F&&t.ia&&C(e,"TO",t.ia),C(e,"TYPE","xmlhttp"),Lt(t,e),t.u&&t.o&&_e(e,t.u,t.o),t.O&&(t.g.H=t.O);var n=t.g;t=t.ba,n.M=1,n.A=Kt(z(e)),n.u=null,n.R=!0,gn(n,t)}i.Va=function(){this.C!=null&&(this.C=null,Zt(this),Oe(this),N(19))};function te(t){t.C!=null&&(v.clearTimeout(t.C),t.C=null)}function $n(t,e){var n=null;if(t.g==e){te(t),Re(t),t.g=null;var s=2}else if(Ie(t.h,e))n=e.G,bn(t.h,e),s=1;else return;if(t.I!=0){if(e.o)if(s==1){n=e.u?e.u.length:0,e=Date.now()-e.F;var g=t.D;s=Xt(),j(s,new ln(s,n)),Qt(t)}else Ln(t);else if(g=e.m,g==3||g==0&&e.X>0||!(s==1&&lr(t,e)||s==2&&Oe(t)))switch(n&&n.length>0&&(e=t.h,e.i=e.i.concat(n)),g){case 1:ot(t,5);break;case 4:ot(t,10);break;case 3:ot(t,6);break;default:ot(t,2)}}}function Un(t,e){let n=t.Qa+Math.floor(Math.random()*t.Za);return t.isActive()||(n*=2),n*e}function ot(t,e){if(t.j.info("Error code "+e),e==2){var n=E(t.bb,t),s=t.Ua;const g=!s;s=new J(s||"//www.google.com/images/cleardot.gif"),v.location&&v.location.protocol=="http"||kt(s,"https"),Kt(s),g?ir(s.toString(),n):rr(s.toString(),n)}else N(2);t.I=0,t.l&&t.l.pa(e),Vn(t),xn(t)}i.bb=function(t){t?(this.j.info("Successfully pinged google.com"),N(2)):(this.j.info("Failed to ping google.com"),N(1))};function Vn(t){if(t.I=0,t.ja=[],t.l){const e=En(t.h);(e.length!=0||t.i.length!=0)&&(x(t.ja,e),x(t.ja,t.i),t.h.i.length=0,U(t.i),t.i.length=0),t.l.oa()}}function zn(t,e,n){var s=n instanceof J?z(n):new J(n);if(s.g!="")e&&(s.g=e+"."+s.g),Mt(s,s.u);else{var g=v.location;s=g.protocol,e=e?e+"."+g.hostname:g.hostname,g=+g.port;const y=new J(null);s&&kt(y,s),e&&(y.g=e),g&&Mt(y,g),n&&(y.h=n),s=y}return n=t.G,e=t.wa,n&&e&&C(s,n,e),C(s,"VER",t.ka),Lt(t,s),s}function qn(t,e,n){if(e&&!t.L)throw Error("Can't create secondary domain capable XhrIo object.");return e=t.Aa&&!t.ma?new O(new Ce({ab:n})):new O(t.ma),e.Fa(t.L),e}i.isActive=function(){return!!this.l&&this.l.isActive(this)};function Xn(){}i=Xn.prototype,i.ra=function(){},i.qa=function(){},i.pa=function(){},i.oa=function(){},i.isActive=function(){return!0},i.Ka=function(){};function ee(){}ee.prototype.g=function(t,e){return new L(t,e)};function L(t,e){P.call(this),this.g=new Nn(e),this.l=t,this.h=e&&e.messageUrlParams||null,t=e&&e.messageHeaders||null,e&&e.clientProtocolHeaderRequired&&(t?t["X-Client-Protocol"]="webchannel":t={"X-Client-Protocol":"webchannel"}),this.g.o=t,t=e&&e.initMessageHeaders||null,e&&e.messageContentType&&(t?t["X-WebChannel-Content-Type"]=e.messageContentType:t={"X-WebChannel-Content-Type":e.messageContentType}),e&&e.sa&&(t?t["X-WebChannel-Client-Profile"]=e.sa:t={"X-WebChannel-Client-Profile":e.sa}),this.g.U=t,(t=e&&e.Qb)&&!h(t)&&(this.g.u=t),this.A=e&&e.supportsCrossDomainXhr||!1,this.v=e&&e.sendRawJson||!1,(e=e&&e.httpSessionIdParam)&&!h(e)&&(this.g.G=e,t=this.h,t!==null&&e in t&&(t=this.h,e in t&&delete t[e])),this.j=new yt(this)}A(L,P),L.prototype.m=function(){this.g.l=this.j,this.A&&(this.g.L=!0),this.g.connect(this.l,this.h||void 0)},L.prototype.close=function(){De(this.g)},L.prototype.o=function(t){var e=this.g;if(typeof t=="string"){var n={};n.__data__=t,t=n}else this.v&&(n={},n.__data__=de(t),t=n);e.i.push(new Ki(e.Ya++,t)),e.I==3&&Qt(e)},L.prototype.N=function(){this.g.l=null,delete this.j,De(this.g),delete this.g,L.Z.N.call(this)};function Wn(t){me.call(this),t.__headers__&&(this.headers=t.__headers__,this.statusCode=t.__status__,delete t.__headers__,delete t.__status__);var e=t.__sm__;if(e){t:{for(const n in e){t=n;break t}t=void 0}(this.i=t)&&(t=this.i,e=e!==null&&t in e?e[t]:void 0),this.data=e}else this.data=t}A(Wn,me);function Gn(){ye.call(this),this.status=1}A(Gn,ye);function yt(t){this.g=t}A(yt,Xn),yt.prototype.ra=function(){j(this.g,"a")},yt.prototype.qa=function(t){j(this.g,new Wn(t))},yt.prototype.pa=function(t){j(this.g,new Gn)},yt.prototype.oa=function(){j(this.g,"b")},ee.prototype.createWebChannel=ee.prototype.g,L.prototype.send=L.prototype.o,L.prototype.open=L.prototype.m,L.prototype.close=L.prototype.close,Us=function(){return new ee},$s=function(){return Xt()},Fs=it,Ls={jb:0,mb:1,nb:2,Hb:3,Mb:4,Jb:5,Kb:6,Ib:7,Gb:8,Lb:9,PROXY:10,NOPROXY:11,Eb:12,Ab:13,Bb:14,zb:15,Cb:16,Db:17,fb:18,eb:19,gb:20},Wt.NO_ERROR=0,Wt.TIMEOUT=8,Wt.HTTP_ERROR=6,Hs=Wt,cn.COMPLETE="complete",Bs=cn,sn.EventType=Tt,Tt.OPEN="a",Tt.CLOSE="b",Tt.ERROR="c",Tt.MESSAGE="d",P.prototype.listen=P.prototype.J,xs=sn,O.prototype.listenOnce=O.prototype.K,O.prototype.getLastError=O.prototype.Ha,O.prototype.getLastErrorCode=O.prototype.ya,O.prototype.getStatus=O.prototype.ca,O.prototype.getResponseJson=O.prototype.La,O.prototype.getResponseText=O.prototype.la,O.prototype.send=O.prototype.ea,O.prototype.setWithCredentials=O.prototype.Fa,Ns=O}).apply(typeof ie<"u"?ie:typeof self<"u"?self:typeof window<"u"?window:{});const pi="@firebase/installations",Ve="0.6.22";/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const gi=1e4,di=`w:${Ve}`,mi="FIS_v2",Vs="https://firebaseinstallations.googleapis.com/v1",zs=60*60*1e3,qs="installations",Xs="Installations";/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Ws={"missing-app-config-values":'Missing App configuration value: "{$valueName}"',"not-registered":"Firebase Installation is not registered.","installation-not-found":"Firebase Installation not found.","request-failed":'{$requestName} request failed with error "{$serverCode} {$serverStatus}: {$serverMessage}"',"app-offline":"Could not process request. Application offline.","delete-pending-registration":"Can't delete installation while there is a pending registration request."},ct=new Ue(qs,Xs,Ws);function yi(i){return i instanceof St&&i.code.includes("request-failed")}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function vi({projectId:i}){return`${Vs}/projects/${i}/installations`}function wi(i){return{token:i.token,requestStatus:2,expiresIn:Ks(i.expiresIn),creationTime:Date.now()}}async function bi(i,r){const c=(await r.json()).error;return ct.create("request-failed",{requestName:i,serverCode:c.code,serverMessage:c.message,serverStatus:c.status})}function Ei({apiKey:i}){return new Headers({"Content-Type":"application/json",Accept:"application/json","x-goog-api-key":i})}function Gs(i,{refreshToken:r}){const o=Ei(i);return o.append("Authorization",Js(r)),o}async function Si(i){const r=await i();return r.status>=500&&r.status<600?i():r}function Ks(i){return Number(i.replace("s","000"))}function Js(i){return`${mi} ${i}`}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Ys({appConfig:i,heartbeatServiceProvider:r},{fid:o}){const c=vi(i),d=Ei(i),b=r.getImmediate({optional:!0});if(b){const E=await b.getHeartbeatsHeader();E&&d.append("x-firebase-client",E)}const v={fid:o,authVersion:mi,appId:i.appId,sdkVersion:di},I={method:"POST",headers:d,body:JSON.stringify(v)},D=await Si(()=>fetch(c,I));if(D.ok){const E=await D.json();return{fid:E.fid||o,registrationStatus:2,refreshToken:E.refreshToken,authToken:wi(E.authToken)}}else throw await bi("Create Installation",D)}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Ii(i){return new Promise(r=>{setTimeout(r,i)})}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Zs(i){return btoa(String.fromCharCode(...i)).replace(/\+/g,"-").replace(/\//g,"_")}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Qs=/^[cdef][\w-]{21}$/,$e="";function to(){try{const i=new Uint8Array(17);(self.crypto||self.msCrypto).getRandomValues(i),i[0]=112+i[0]%16;const o=eo(i);return Qs.test(o)?o:$e}catch{return $e}}function eo(i){return Zs(i).substr(0,22)}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function It(i){return`${i.appName}!${i.appId}`}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Et=new Map;function Ai(i,r){const o=It(i);Ti(o,r),ro(o,r)}function no(i,r){Ci();const o=It(i);let c=Et.get(o);c||(c=new Set,Et.set(o,c)),c.add(r)}function io(i,r){const o=It(i),c=Et.get(o);c&&(c.delete(r),c.size===0&&Et.delete(o),_i())}function Ti(i,r){const o=Et.get(i);if(o)for(const c of o)c(r)}function ro(i,r){const o=Ci();o&&o.postMessage({key:i,fid:r}),_i()}let lt=null;function Ci(){return!lt&&"BroadcastChannel"in self&&(lt=new BroadcastChannel("[Firebase] FID Change"),lt.onmessage=i=>{Ti(i.data.key,i.data.fid)}),lt}function _i(){Et.size===0&&lt&&(lt.close(),lt=null)}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const so="firebase-installations-database",oo=1,ut="firebase-installations-store";let je=null;function ze(){return je||(je=si(so,oo,{upgrade:(i,r)=>{switch(r){case 0:i.createObjectStore(ut)}}})),je}async function se(i,r){const o=It(i),d=(await ze()).transaction(ut,"readwrite"),b=d.objectStore(ut),v=await b.get(o);return await b.put(r,o),await d.done,(!v||v.fid!==r.fid)&&Ai(i,r.fid),r}async function Di(i){const r=It(i),c=(await ze()).transaction(ut,"readwrite");await c.objectStore(ut).delete(r),await c.done}async function ae(i,r){const o=It(i),d=(await ze()).transaction(ut,"readwrite"),b=d.objectStore(ut),v=await b.get(o),I=r(v);return I===void 0?await b.delete(o):await b.put(I,o),await d.done,I&&(!v||v.fid!==I.fid)&&Ai(i,I.fid),I}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function qe(i){let r;const o=await ae(i.appConfig,c=>{const d=ao(c),b=ho(i,d);return r=b.registrationPromise,b.installationEntry});return o.fid===$e?{installationEntry:await r}:{installationEntry:o,registrationPromise:r}}function ao(i){const r=i||{fid:to(),registrationStatus:0};return Oi(r)}function ho(i,r){if(r.registrationStatus===0){if(!navigator.onLine){const d=Promise.reject(ct.create("app-offline"));return{installationEntry:r,registrationPromise:d}}const o={fid:r.fid,registrationStatus:1,registrationTime:Date.now()},c=lo(i,o);return{installationEntry:o,registrationPromise:c}}else return r.registrationStatus===1?{installationEntry:r,registrationPromise:co(i)}:{installationEntry:r}}async function lo(i,r){try{const o=await Ys(i,r);return se(i.appConfig,o)}catch(o){throw yi(o)&&o.customData.serverCode===409?await Di(i.appConfig):await se(i.appConfig,{fid:r.fid,registrationStatus:0}),o}}async function co(i){let r=await ii(i.appConfig);for(;r.registrationStatus===1;)await Ii(100),r=await ii(i.appConfig);if(r.registrationStatus===0){const{installationEntry:o,registrationPromise:c}=await qe(i);return c||o}return r}function ii(i){return ae(i,r=>{if(!r)throw ct.create("installation-not-found");return Oi(r)})}function Oi(i){return uo(i)?{fid:i.fid,registrationStatus:0}:i}function uo(i){return i.registrationStatus===1&&i.registrationTime+gi<Date.now()}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function fo({appConfig:i,heartbeatServiceProvider:r},o){const c=po(i,o),d=Gs(i,o),b=r.getImmediate({optional:!0});if(b){const E=await b.getHeartbeatsHeader();E&&d.append("x-firebase-client",E)}const v={installation:{sdkVersion:di,appId:i.appId}},I={method:"POST",headers:d,body:JSON.stringify(v)},D=await Si(()=>fetch(c,I));if(D.ok){const E=await D.json();return wi(E)}else throw await bi("Generate Auth Token",D)}function po(i,{fid:r}){return`${vi(i)}/${r}/authTokens:generate`}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Xe(i,r=!1){let o;const c=await ae(i.appConfig,b=>{if(!Ri(b))throw ct.create("not-registered");const v=b.authToken;if(!r&&yo(v))return b;if(v.requestStatus===1)return o=go(i,r),b;{if(!navigator.onLine)throw ct.create("app-offline");const I=wo(b);return o=mo(i,I),I}});return o?await o:c.authToken}async function go(i,r){let o=await ri(i.appConfig);for(;o.authToken.requestStatus===1;)await Ii(100),o=await ri(i.appConfig);const c=o.authToken;return c.requestStatus===0?Xe(i,r):c}function ri(i){return ae(i,r=>{if(!Ri(r))throw ct.create("not-registered");const o=r.authToken;return bo(o)?{...r,authToken:{requestStatus:0}}:r})}async function mo(i,r){try{const o=await fo(i,r),c={...r,authToken:o};return await se(i.appConfig,c),o}catch(o){if(yi(o)&&(o.customData.serverCode===401||o.customData.serverCode===404))await Di(i.appConfig);else{const c={...r,authToken:{requestStatus:0}};await se(i.appConfig,c)}throw o}}function Ri(i){return i!==void 0&&i.registrationStatus===2}function yo(i){return i.requestStatus===2&&!vo(i)}function vo(i){const r=Date.now();return r<i.creationTime||i.creationTime+i.expiresIn<r+zs}function wo(i){const r={requestStatus:1,requestTime:Date.now()};return{...i,authToken:r}}function bo(i){return i.requestStatus===1&&i.requestTime+gi<Date.now()}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Eo(i){const r=i,{installationEntry:o,registrationPromise:c}=await qe(r);return c?c.catch(console.error):Xe(r).catch(console.error),o.fid}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function So(i,r=!1){const o=i;return await Io(o),(await Xe(o,r)).token}async function Io(i){const{registrationPromise:r}=await qe(i);r&&await r}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Qo(i,r){const{appConfig:o}=i;return no(o,r),()=>{io(o,r)}}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Ao(i){if(!i||!i.options)throw Ne("App Configuration");if(!i.name)throw Ne("App Name");const r=["projectId","apiKey","appId"];for(const o of r)if(!i.options[o])throw Ne(o);return{appName:i.name,projectId:i.options.projectId,apiKey:i.options.apiKey,appId:i.options.appId}}function Ne(i){return ct.create("missing-app-config-values",{valueName:i})}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const ki="installations",To="installations-internal",Co=i=>{const r=i.getProvider("app").getImmediate(),o=Ao(r),c=ci(r,"heartbeat");return{app:r,appConfig:o,heartbeatServiceProvider:c,_delete:()=>Promise.resolve()}},_o=i=>{const r=i.getProvider("app").getImmediate(),o=ci(r,ki).getImmediate();return{getId:()=>Eo(o),getToken:d=>So(o,d)}};function Do(){Ft(new wt(ki,Co,"PUBLIC")),Ft(new wt(To,_o,"PRIVATE"))}Do();vt(pi,Ve);vt(pi,Ve,"esm2020");export{jo as A,Fo as B,wt as C,br as D,Hs as E,St as F,Bo as G,Sr as H,Ps as I,Po as J,xo as K,_ as L,js as M,Ho as N,Qo as O,Go as P,$o as Q,Uo as R,Jo as S,vt as T,Ir as U,xs as W,Ns as X,ci as _,Ue as a,Fs as b,Bs as c,$r as d,Ls as e,Ko as f,Ft as g,Lo as h,gr as i,qo as j,Mo as k,zo as l,Us as m,xe as n,Zo as o,Vo as p,Yo as q,wr as r,Ro as s,ko as t,Xo as u,$s as v,li as w,bs as x,No as y,Wo as z};
