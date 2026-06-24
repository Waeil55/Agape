import{g as A,C as R,T as O,O as Z,a as ee,_ as te,u as S,q as ne,U as ie,H as oe,h as re}from"./firebase-core-BGCnD7GU.js";import{o as U,d as w}from"./vendor-dOuK7WOe.js";/**
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
 */const ae="/firebase-messaging-sw.js",se="/firebase-cloud-messaging-push-scope",W="BDOU99-h67HcA6JeFXHbSNMu7e2yNNu3RzoMj8TM4W88jITfq7ZmPvIM1Iv-4_l2LxQcYwhqby2xGpWwzjfAnG4",ce="https://fcmregistrations.googleapis.com/v1",G="google.c.a.c_id",de="google.c.a.c_l",ue="google.c.a.ts",fe="google.c.a.e",D=1e4;var C;(function(e){e[e.DATA_MESSAGE=1]="DATA_MESSAGE",e[e.DISPLAY_NOTIFICATION=3]="DISPLAY_NOTIFICATION"})(C||(C={}));/**
 * @license
 * Copyright 2018 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License. You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under the License
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express
 * or implied. See the License for the specific language governing permissions and limitations under
 * the License.
 */var g;(function(e){e.PUSH_RECEIVED="push-received",e.NOTIFICATION_CLICKED="notification-clicked",e.FID_REGISTERED="fid-registered"})(g||(g={}));/**
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
 */function u(e){const t=new Uint8Array(e);return btoa(String.fromCharCode(...t)).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_")}function $(e){const t="=".repeat((4-e.length%4)%4),n=(e+t).replace(/\-/g,"+").replace(/_/g,"/"),i=atob(n),o=new Uint8Array(i.length);for(let r=0;r<i.length;++r)o[r]=i.charCodeAt(r);return o}/**
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
 */const I="fcm_token_details_db",pe=5,N="fcm_token_object_Store";async function le(e){if("databases"in indexedDB&&!(await indexedDB.databases()).map(r=>r.name).includes(I))return null;let t=null;return(await U(I,pe,{upgrade:async(i,o,r,c)=>{if(o<2||!i.objectStoreNames.contains(N))return;const d=c.objectStore(N),p=await d.index("fcmSenderId").get(e);if(await d.clear(),!!p){if(o===2){const s=p;if(!s.auth||!s.p256dh||!s.endpoint)return;t={token:s.fcmToken,createTime:s.createTime??Date.now(),subscriptionOptions:{auth:s.auth,p256dh:s.p256dh,endpoint:s.endpoint,swScope:s.swScope,vapidKey:typeof s.vapidKey=="string"?s.vapidKey:u(s.vapidKey)}}}else if(o===3){const s=p;t={token:s.fcmToken,createTime:s.createTime,subscriptionOptions:{auth:u(s.auth),p256dh:u(s.p256dh),endpoint:s.endpoint,swScope:s.swScope,vapidKey:u(s.vapidKey)}}}else if(o===4){const s=p;t={token:s.fcmToken,createTime:s.createTime,subscriptionOptions:{auth:u(s.auth),p256dh:u(s.p256dh),endpoint:s.endpoint,swScope:s.swScope,vapidKey:u(s.vapidKey)}}}}}})).close(),await w(I),await w("fcm_vapid_details_db"),await w("undefined"),ge(t)?t:null}function ge(e){if(!e||!e.subscriptionOptions)return!1;const{subscriptionOptions:t}=e;return typeof e.createTime=="number"&&e.createTime>0&&typeof e.token=="string"&&e.token.length>0&&typeof t.auth=="string"&&t.auth.length>0&&typeof t.p256dh=="string"&&t.p256dh.length>0&&typeof t.endpoint=="string"&&t.endpoint.length>0&&typeof t.swScope=="string"&&t.swScope.length>0&&typeof t.vapidKey=="string"&&t.vapidKey.length>0}/**
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
 */const he={"missing-app-config-values":'Missing App configuration value: "{$valueName}"',"only-available-in-window":"This method is available in a Window context.","only-available-in-sw":"This method is available in a service worker context.","permission-default":"The notification permission was not granted and dismissed instead.","permission-blocked":"The notification permission was not granted and blocked instead.","unsupported-browser":"This browser doesn't support the API's required to use the Firebase SDK.","indexed-db-unsupported":"This browser doesn't support indexedDb.open() (ex. Safari iFrame, Firefox Private Browsing, etc)","failed-service-worker-registration":"We are unable to register the default service worker. {$browserErrorMessage}","token-subscribe-failed":"A problem occurred while subscribing the user to FCM: {$errorInfo}","token-subscribe-no-token":"FCM returned no token when subscribing the user to push.","fid-registration-failed":"A problem occurred while creating an FCM registration via FID: {$errorInfo}","fid-unregister-failed":"A problem occurred while unregistering the FCM registration via FID: {$errorInfo}","fid-registration-idb-schema-unavailable":"Unable to read or persist FID registration metadata because the messaging IndexedDB schema is unavailable (for example, the database could not be upgraded to the latest version).","token-unsubscribe-failed":"A problem occurred while unsubscribing the user from FCM: {$errorInfo}","token-update-failed":"A problem occurred while updating the user from FCM: {$errorInfo}","token-update-no-token":"FCM returned no token when updating the user to push.","use-sw-after-get-token":"The useServiceWorker() method may only be called once and must be called before calling getToken() to ensure your service worker is used.","invalid-sw-registration":"The input to useServiceWorker() must be a ServiceWorkerRegistration.","invalid-bg-handler":"The input to setBackgroundMessageHandler() must be a function.","invalid-vapid-key":"The public VAPID key must be a string.","use-vapid-key-after-get-token":"The usePublicVapidKey() method may only be called once and must be called before calling getToken() to ensure your VAPID key is used.","invalid-on-registered-handler":"No onRegistered callback handler was provided or registered. Implement onRegistered() before register()."},a=new ee("messaging","Messaging",he);/**
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
 */const M="firebase-messaging-database",F=2,l="firebase-messaging-store",f="firebase-messaging-fid-registration-store",we={openDB:U,deleteDB:w};let K=we,h=null;function be(e,t,n){switch(t){case 0:if(e.createObjectStore(l),n===1)break;case 1:n===2&&e.createObjectStore(f)}}function P(e){return{upgrade:(t,n)=>{be(t,n,e)},blocked:()=>{},blocking:(t,n,i)=>{h=null,i.target?.close()},terminated:()=>{h=null}}}function b(){return h||(h=K.openDB(M,F,P(2)).catch(()=>K.openDB(M,F-1,P(1)))),h}function V(e,t){return e.objectStoreNames.contains(t)}function q(e){if(!V(e,f))throw a.create("fid-registration-idb-schema-unavailable")}async function ye(e){const t=y(e),i=await(await b()).transaction(l).objectStore(l).get(t);if(i)return i;{const o=await le(e.appConfig.senderId);if(o)return await k(e,o),o}}async function k(e,t){const n=y(e),i=await b(),o=[l],r=V(i,f);r&&o.push(f);const c=i.transaction(o,"readwrite");return await c.objectStore(l).put(t,n),r&&await c.objectStore(f).delete(n),await c.done,t}async function J(e){const t=y(e),n=await b();return q(n),await n.transaction(f).objectStore(f).get(t)}async function me(e,t){const n=y(e),i=await b();q(i);const o=i.transaction([l,f],"readwrite");return await o.objectStore(f).put(t,n),await o.objectStore(l).delete(n),await o.done,t}function y({appConfig:e}){return e.appId}const x="@firebase/messaging",_="0.13.0";/**
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
 */const Te=3,Ie=1e3;async function ve(e,t){const n=await T(e),i=E(t,e.appConfig.appName,!1),o={method:"POST",headers:n,body:JSON.stringify(i)};let r;try{r=await(await fetch(m(e.appConfig),o)).json()}catch(c){throw a.create("token-subscribe-failed",{errorInfo:c?.toString()})}if(r.error){const c=r.error.message;throw a.create("token-subscribe-failed",{errorInfo:c})}if(!r.token)throw a.create("token-subscribe-no-token");return r.token}async function _e(e,t){const n=await T(e),i=E(t,e.appConfig.appName,!0),o={method:"POST",headers:n,body:JSON.stringify(i)};let r;try{r=await Re(()=>fetch(m(e.appConfig),o),Te,Ie)}catch(p){throw a.create("fid-registration-failed",{errorInfo:p?.toString()})}if(r.ok)return{responseFid:await Se(r)};let c;try{c=await r.json()}catch{throw a.create("fid-registration-failed",{errorInfo:r.statusText})}const d=c.error?.message??r.statusText;throw a.create("fid-registration-failed",{errorInfo:d})}async function Se(e){const t=await e.text();if(!t.trim())throw a.create("fid-registration-failed",{errorInfo:"CreateRegistration succeeded but response body is empty"});let n;try{n=JSON.parse(t)}catch{throw a.create("fid-registration-failed",{errorInfo:"CreateRegistration succeeded but response body is not valid JSON"})}const i=n.name;if(typeof i!="string"||i.length===0)throw a.create("fid-registration-failed",{errorInfo:"CreateRegistration succeeded but response did not include a non-empty name"});return ke(i)}const H="/registrations/";function ke(e){const t=e.indexOf(H);if(t!==-1){const n=e.slice(t+H.length);if(n.length>0)return n}throw a.create("fid-registration-failed",{errorInfo:"CreateRegistration succeeded but response name is not a valid registration resource name"})}async function Ee(e,t){const n=await T(e),i=E(t.subscriptionOptions,e.appConfig.appName,!1),o={method:"PATCH",headers:n,body:JSON.stringify(i)};let r;try{r=await(await fetch(`${m(e.appConfig)}/${t.token}`,o)).json()}catch(c){throw a.create("token-update-failed",{errorInfo:c?.toString()})}if(r.error){const c=r.error.message;throw a.create("token-update-failed",{errorInfo:c})}if(!r.token)throw a.create("token-update-no-token");return r.token}async function Ae(e,t){const i={method:"DELETE",headers:await T(e)};try{const r=await(await fetch(`${m(e.appConfig)}/${t}`,i)).json();if(r.error){const c=r.error.message;throw a.create("token-unsubscribe-failed",{errorInfo:c})}}catch(o){throw a.create("token-unsubscribe-failed",{errorInfo:o?.toString()})}}async function Re(e,t,n){let i;for(let o=0;o<t;o++)try{return await e()}catch(r){if(i=r,o<t-1){const c=n*Math.pow(2,o);await new Promise(d=>setTimeout(d,c))}}throw i}function m({projectId:e}){return`${ce}/projects/${e}/registrations`}async function T({appConfig:e,installations:t}){const n=await t.getToken();return new Headers({"Content-Type":"application/json",Accept:"application/json","x-goog-api-key":e.apiKey,"x-goog-firebase-installations-auth":`FIS ${n}`})}function Oe(e,t){try{if(/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(e))return new URL(e).host}catch{}try{if(typeof self<"u"&&self.location?.href)return new URL(e,self.location.origin).host}catch{}return typeof self<"u"&&self.location?.host?self.location.host:t}function E({p256dh:e,auth:t,endpoint:n,vapidKey:i,swScope:o},r,c){const d={web:{origin:Oe(o,r),endpoint:n,auth:t,p256dh:e}};return c&&(d.fcm_sdk_version=_),i!==W&&(d.web.applicationPubKey=i),d}/**
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
 */const De=7*24*60*60*1e3;async function Ce(e){const t=await Me(e.swRegistration,e.vapidKey),n={vapidKey:e.vapidKey,swScope:e.swRegistration.scope,endpoint:t.endpoint,auth:u(t.getKey("auth")),p256dh:u(t.getKey("p256dh"))},i=await ye(e.firebaseDependencies);if(i){if(Fe(i.subscriptionOptions,n))return Date.now()>=i.createTime+De?Ne(e,{token:i.token,createTime:Date.now(),subscriptionOptions:n}):i.token;try{await Ae(e.firebaseDependencies,i.token)}catch(o){console.warn(o)}return j(e.firebaseDependencies,n)}else return j(e.firebaseDependencies,n)}async function Ne(e,t){try{const n=await Ee(e.firebaseDependencies,t),i={...t,token:n,createTime:Date.now()};return await k(e.firebaseDependencies,i),n}catch(n){throw n}}async function j(e,t){const i={token:await ve(e,t),createTime:Date.now(),subscriptionOptions:t};return await k(e,i),i.token}async function Me(e,t){const n=await e.pushManager.getSubscription();return n||e.pushManager.subscribe({userVisibleOnly:!0,applicationServerKey:$(t)})}function Fe(e,t){const n=t.vapidKey===e.vapidKey,i=t.endpoint===e.endpoint,o=t.auth===e.auth,r=t.p256dh===e.p256dh;return n&&i&&o&&r}function Ke(e,t){const n=e.onRegisteredHandler;n&&(typeof n=="function"?n(t):n.next(t))}/**
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
 */async function Pe(e){try{e.swRegistration=await navigator.serviceWorker.register(ae,{scope:se}),e.swRegistration.update().catch(()=>{}),await xe(e.swRegistration)}catch(t){throw a.create("failed-service-worker-registration",{browserErrorMessage:t?.message})}}async function xe(e){return new Promise((t,n)=>{const i=setTimeout(()=>n(new Error(`Service worker not registered after ${D} ms`)),D),o=e.installing||e.waiting;e.active?(clearTimeout(i),t()):o?o.onstatechange=r=>{r.target?.state==="activated"&&(o.onstatechange=null,clearTimeout(i),t())}:(clearTimeout(i),n(new Error("No incoming service worker found.")))})}/**
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
 */async function Q(e,t){if(!t&&!e.swRegistration&&await Pe(e),!(!t&&e.swRegistration)){if(!(t instanceof ServiceWorkerRegistration))throw a.create("invalid-sw-registration");e.swRegistration=t}}/**
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
 */async function Y(e,t){t?e.vapidKey=t:e.vapidKey||(e.vapidKey=W)}/**
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
 */const L=3;async function He(e,t){const n=await je(e.swRegistration,e.vapidKey),i={vapidKey:e.vapidKey,swScope:e.swRegistration.scope,endpoint:n.endpoint,auth:u(n.getKey("auth")),p256dh:u(n.getKey("p256dh"))},o=e.firebaseDependencies.installations;for(let r=0;r<L;r++){const{responseFid:c}=await _e(e.firebaseDependencies,i);if(c===t)return;r<L-1&&await o.getToken(!0)}throw a.create("fid-registration-failed",{errorInfo:"CreateRegistration response FID does not match Firebase Installation ID"})}async function je(e,t){const n=await e.pushManager.getSubscription();return n||e.pushManager.subscribe({userVisibleOnly:!0,applicationServerKey:$(t)})}/**
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
 */const Le=7*24*60*60*1e3;async function z(e,t){if(!navigator)throw a.create("only-available-in-window");if(Notification.permission==="default"&&await Notification.requestPermission(),Notification.permission!=="granted")throw a.create("permission-blocked");if(!e.onRegisteredHandler)throw a.create("invalid-on-registered-handler");await Y(e,t?.vapidKey),await Q(e,t?.serviceWorkerRegistration);const n=e._registerNotifyChain.catch(()=>{});return e._registerNotifyChain=n.then(async()=>{const i=await e.firebaseDependencies.installations.getId(),o=await J(e.firebaseDependencies),r=Date.now();if((!o||o.fid!==i||r>=o.lastRegisterTime+Le)&&(await He(e,i),await me(e.firebaseDependencies,{fid:i,lastRegisterTime:r,vapidKey:e.vapidKey})),!e.onRegisteredHandler)throw a.create("invalid-on-registered-handler");Ke(e,i)}),e._registerNotifyChain}/**
 * @license
 * Copyright 2026 Google LLC
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
 */function Be(e,t){return Z(t,()=>{(async()=>!e.onRegisteredHandler||!await J(e.firebaseDependencies)||await z(e).catch(()=>{}))()})}/**
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
 */function B(e){const t={from:e.from,collapseKey:e.collapse_key,messageId:e.fcmMessageId};return Ue(t,e),We(t,e),Ge(t,e),t}function Ue(e,t){if(!t.notification)return;e.notification={};const n=t.notification.title;n&&(e.notification.title=n);const i=t.notification.body;i&&(e.notification.body=i);const o=t.notification.image;o&&(e.notification.image=o);const r=t.notification.icon;r&&(e.notification.icon=r)}function We(e,t){t.data&&(e.data=t.data)}function Ge(e,t){if(!t.fcmOptions&&!t.notification?.click_action)return;e.fcmOptions={};const n=t.fcmOptions?.link??t.notification?.click_action;n&&(e.fcmOptions.link=n);const i=t.fcmOptions?.analytics_label;i&&(e.fcmOptions.analyticsLabel=i)}/**
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
 */function $e(e){return typeof e=="object"&&!!e&&G in e}/**
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
 */function Ve(e){if(!e||!e.options)throw v("App Configuration Object");if(!e.name)throw v("App Name");const t=["projectId","apiKey","appId","messagingSenderId"],{options:n}=e;for(const i of t)if(!n[i])throw v(i);return{appName:e.name,projectId:n.projectId,apiKey:n.apiKey,appId:n.appId,senderId:n.messagingSenderId}}function v(e){return a.create("missing-app-config-values",{valueName:e})}/**
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
 */class qe{constructor(t,n,i){this.deliveryMetricsExportedToBigQueryEnabled=!1,this.onBackgroundMessageHandler=null,this.onMessageHandler=null,this.onRegisteredHandler=null,this.onUnregisteredHandler=null,this._registerNotifyChain=Promise.resolve(),this._fidChangeUnsubscribe=null,this.logEvents=[],this.logQueue={state:"stopped"};const o=Ve(t);this.firebaseDependencies={app:t,appConfig:o,installations:n,analyticsProvider:i}}_delete(){return this._fidChangeUnsubscribe&&(this._fidChangeUnsubscribe(),this._fidChangeUnsubscribe=null),this.logQueue.state==="scheduled"&&clearTimeout(this.logQueue.timerId),this.logQueue={state:"stopped"},Promise.resolve()}}/**
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
 */async function X(e,t){if(!navigator)throw a.create("only-available-in-window");if(Notification.permission==="default"&&await Notification.requestPermission(),Notification.permission!=="granted")throw a.create("permission-blocked");return await Y(e,t?.vapidKey),await Q(e,t?.serviceWorkerRegistration),Ce(e)}/**
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
 */async function Je(e,t,n){const i=Qe(t);(await e.firebaseDependencies.analyticsProvider.get()).logEvent(i,{message_id:n[G],message_name:n[de],message_time:n[ue],message_device_time:Math.floor(Date.now()/1e3)})}function Qe(e){switch(e){case g.NOTIFICATION_CLICKED:return"notification_open";case g.PUSH_RECEIVED:return"notification_foreground";default:throw new Error}}/**
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
 */async function Ye(e,t){const n=t.data;if(!n.isFirebaseMessaging)return;if(e.onMessageHandler&&n.messageType===g.PUSH_RECEIVED&&(typeof e.onMessageHandler=="function"?e.onMessageHandler(B(n)):e.onMessageHandler.next(B(n))),e.onRegisteredHandler&&n.messageType===g.FID_REGISTERED){const o=n.fid;typeof e.onRegisteredHandler=="function"?e.onRegisteredHandler(o):e.onRegisteredHandler.next(o)}const i=n.data;$e(i)&&i[fe]==="1"&&await Je(e,n.messageType,i)}/**
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
 */const ze=e=>{const t=new qe(e.getProvider("app").getImmediate(),e.getProvider("installations-internal").getImmediate(),e.getProvider("analytics-internal"));return navigator.serviceWorker.addEventListener("message",n=>Ye(t,n)),t._fidChangeUnsubscribe=Be(t,e.getProvider("installations").getImmediate()),t},Xe=e=>{const t=e.getProvider("messaging").getImmediate();return{getToken:i=>X(t,i),register:i=>z(t,i)}};function Ze(){A(new R("messaging",ze,"PUBLIC")),A(new R("messaging-internal",Xe,"PRIVATE")),O(x,_),O(x,_,"esm2020")}/**
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
 */async function et(){try{await ie()}catch{return!1}return typeof window<"u"&&oe()&&re()&&"serviceWorker"in navigator&&"PushManager"in window&&"Notification"in window&&"fetch"in window&&ServiceWorkerRegistration.prototype.hasOwnProperty("showNotification")&&PushSubscription.prototype.hasOwnProperty("getKey")}/**
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
 */function tt(e,t){if(!navigator)throw a.create("only-available-in-window");return e.onMessageHandler=t,()=>{e.onMessageHandler=null}}/**
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
 */function ot(e=ne()){return et().then(t=>{if(!t)throw a.create("unsupported-browser")},t=>{throw a.create("indexed-db-unsupported")}),te(S(e),"messaging").getImmediate()}async function rt(e,t){return e=S(e),X(e,t)}function at(e,t){return e=S(e),tt(e,t)}Ze();export{rt as a,ot as g,at as o};
