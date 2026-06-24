import{d as Ho,I as ct,f as Yo,u as Ee,F as Jo,L as De,_ as Zi,n as es,z as ts,P as ea,q as Xo,s as Zo,k as eu,v as tu,b as nu,X as ru,c as su,E as Nr,W as Ln,m as iu,N as au,w as ou,M as uu,e as ti,g as cu,C as lu,T as ni,S as hu}from"./firebase-core-BGCnD7GU.js";import{R as ns}from"./vendor-dOuK7WOe.js";/**
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
 */class ne{constructor(e){this.uid=e}isAuthenticated(){return this.uid!=null}toKey(){return this.isAuthenticated()?"uid:"+this.uid:"anonymous-user"}isEqual(e){return e.uid===this.uid}}ne.UNAUTHENTICATED=new ne(null),ne.GOOGLE_CREDENTIALS=new ne("google-credentials-uid"),ne.FIRST_PARTY=new ne("first-party-uid"),ne.MOCK_USER=new ne("mock-user");/**
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
 */let xt="12.15.0";function du(n){xt=n}/**
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
 *//**
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
 */const dt=new Ho("@firebase/firestore");function gt(){return dt.logLevel}function w(n,...e){if(dt.logLevel<=De.DEBUG){const t=e.map(rs);dt.debug(`Firestore (${xt}): ${n}`,...t)}}function Me(n,...e){if(dt.logLevel<=De.ERROR){const t=e.map(rs);dt.error(`Firestore (${xt}): ${n}`,...t)}}function Ie(n,...e){if(dt.logLevel<=De.WARN){const t=e.map(rs);dt.warn(`Firestore (${xt}): ${n}`,...t)}}function rs(n){if(typeof n=="string")return n;try{return function(t){return JSON.stringify(t)}(n)}catch{return n}}/**
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
 */function A(n,e,t){let r="Unexpected state";typeof e=="string"?r=e:t=e,ta(n,r,t)}function ta(n,e,t){let r=`FIRESTORE (${xt}) INTERNAL ASSERTION FAILED: ${e} (ID: ${n.toString(16)})`;if(t!==void 0)try{r+=" CONTEXT: "+JSON.stringify(t)}catch{r+=" CONTEXT: "+t}throw Me(r),new Error(r)}function I(n,e,t,r){let s="Unexpected state";typeof t=="string"?s=t:r=t,n||ta(e,s,r)}function P(n,e){return n}/**
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
 */const m={OK:"ok",CANCELLED:"cancelled",UNKNOWN:"unknown",INVALID_ARGUMENT:"invalid-argument",DEADLINE_EXCEEDED:"deadline-exceeded",NOT_FOUND:"not-found",ALREADY_EXISTS:"already-exists",PERMISSION_DENIED:"permission-denied",UNAUTHENTICATED:"unauthenticated",RESOURCE_EXHAUSTED:"resource-exhausted",FAILED_PRECONDITION:"failed-precondition",ABORTED:"aborted",OUT_OF_RANGE:"out-of-range",UNIMPLEMENTED:"unimplemented",INTERNAL:"internal",UNAVAILABLE:"unavailable",DATA_LOSS:"data-loss"};class y extends Jo{constructor(e,t){super(e,t),this.code=e,this.message=t,this.toString=()=>`${this.name}: [code=${this.code}]: ${this.message}`}}/**
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
 */class Pe{constructor(){this.promise=new Promise((e,t)=>{this.resolve=e,this.reject=t})}}/**
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
 */class na{constructor(e,t){this.user=t,this.type="OAuth",this.headers=new Map,this.headers.set("Authorization",`Bearer ${e}`)}}class fu{getToken(){return Promise.resolve(null)}invalidateToken(){}start(e,t){e.enqueueRetryable(()=>t(ne.UNAUTHENTICATED))}shutdown(){}}class mu{constructor(e){this.token=e,this.changeListener=null}getToken(){return Promise.resolve(this.token)}invalidateToken(){}start(e,t){this.changeListener=t,e.enqueueRetryable(()=>t(this.token.user))}shutdown(){this.changeListener=null}}class _u{constructor(e){this.t=e,this.currentUser=ne.UNAUTHENTICATED,this.i=0,this.forceRefresh=!1,this.auth=null}start(e,t){I(this.o===void 0,42304);let r=this.i;const s=u=>this.i!==r?(r=this.i,t(u)):Promise.resolve();let i=new Pe;this.o=()=>{this.i++,this.currentUser=this.u(),i.resolve(),i=new Pe,e.enqueueRetryable(()=>s(this.currentUser))};const a=()=>{const u=i;e.enqueueRetryable(async()=>{await u.promise,await s(this.currentUser)})},o=u=>{w("FirebaseAuthCredentialsProvider","Auth detected"),this.auth=u,this.o&&(this.auth.addAuthTokenListener(this.o),a())};this.t.onInit(u=>o(u)),setTimeout(()=>{if(!this.auth){const u=this.t.getImmediate({optional:!0});u?o(u):(w("FirebaseAuthCredentialsProvider","Auth not yet detected"),i.resolve(),i=new Pe)}},0),a()}getToken(){const e=this.i,t=this.forceRefresh;return this.forceRefresh=!1,this.auth?this.auth.getToken(t).then(r=>this.i!==e?(w("FirebaseAuthCredentialsProvider","getToken aborted due to token change."),this.getToken()):r?(I(typeof r.accessToken=="string",31837,{l:r}),new na(r.accessToken,this.currentUser)):null):Promise.resolve(null)}invalidateToken(){this.forceRefresh=!0}shutdown(){this.auth&&this.o&&this.auth.removeAuthTokenListener(this.o),this.o=void 0}u(){const e=this.auth&&this.auth.getUid();return I(e===null||typeof e=="string",2055,{h:e}),new ne(e)}}class pu{constructor(e,t,r){this.T=e,this.P=t,this.R=r,this.type="FirstParty",this.user=ne.FIRST_PARTY,this.I=new Map}A(){return this.R?this.R():null}get headers(){this.I.set("X-Goog-AuthUser",this.T);const e=this.A();return e&&this.I.set("Authorization",e),this.P&&this.I.set("X-Goog-Iam-Authorization-Token",this.P),this.I}}class gu{constructor(e,t,r){this.T=e,this.P=t,this.R=r}getToken(){return Promise.resolve(new pu(this.T,this.P,this.R))}start(e,t){e.enqueueRetryable(()=>t(ne.FIRST_PARTY))}shutdown(){}invalidateToken(){}}class ri{constructor(e){this.value=e,this.type="AppCheck",this.headers=new Map,e&&e.length>0&&this.headers.set("x-firebase-appcheck",this.value)}}class yu{constructor(e,t){this.V=t,this.forceRefresh=!1,this.appCheck=null,this.m=null,this.p=null,Yo(e)&&e.settings.appCheckToken&&(this.p=e.settings.appCheckToken)}start(e,t){I(this.o===void 0,3512);const r=i=>{i.error!=null&&w("FirebaseAppCheckTokenProvider",`Error getting App Check token; using placeholder token instead. Error: ${i.error.message}`);const a=i.token!==this.m;return this.m=i.token,w("FirebaseAppCheckTokenProvider",`Received ${a?"new":"existing"} token.`),a?t(i.token):Promise.resolve()};this.o=i=>{e.enqueueRetryable(()=>r(i))};const s=i=>{w("FirebaseAppCheckTokenProvider","AppCheck detected"),this.appCheck=i,this.o&&this.appCheck.addTokenListener(this.o)};this.V.onInit(i=>s(i)),setTimeout(()=>{if(!this.appCheck){const i=this.V.getImmediate({optional:!0});i?s(i):w("FirebaseAppCheckTokenProvider","AppCheck not yet detected")}},0)}getToken(){if(this.p)return Promise.resolve(new ri(this.p));const e=this.forceRefresh;return this.forceRefresh=!1,this.appCheck?this.appCheck.getToken(e).then(t=>t?(I(typeof t.token=="string",44558,{tokenResult:t}),this.m=t.token,new ri(t.token)):null):Promise.resolve(null)}invalidateToken(){this.forceRefresh=!0}shutdown(){this.appCheck&&this.o&&this.appCheck.removeTokenListener(this.o),this.o=void 0}}/**
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
 */function Eu(n){const e=typeof self<"u"&&(self.crypto||self.msCrypto),t=new Uint8Array(n);if(e&&typeof e.getRandomValues=="function")e.getRandomValues(t);else for(let r=0;r<n;r++)t[r]=Math.floor(256*Math.random());return t}/**
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
 */class ss{static newId(){const e="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",t=62*Math.floor(4.129032258064516);let r="";for(;r.length<20;){const s=Eu(40);for(let i=0;i<s.length;++i)r.length<20&&s[i]<t&&(r+=e.charAt(s[i]%62))}return r}}function b(n,e){return n<e?-1:n>e?1:0}function Fr(n,e){const t=Math.min(n.length,e.length);for(let r=0;r<t;r++){const s=n.charAt(r),i=e.charAt(r);if(s!==i)return Dr(s)===Dr(i)?b(s,i):Dr(s)?1:-1}return b(n.length,e.length)}const Tu=55296,wu=57343;function Dr(n){const e=n.charCodeAt(0);return e>=Tu&&e<=wu}function At(n,e,t){return n.length===e.length&&n.every((r,s)=>t(r,e[s]))}/**
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
 */const Ve="__name__";class ve{constructor(e,t,r){t===void 0?t=0:t>e.length&&A(637,{offset:t,range:e.length}),r===void 0?r=e.length-t:r>e.length-t&&A(1746,{length:r,range:e.length-t}),this.segments=e,this.offset=t,this.len=r}get length(){return this.len}isEqual(e){return ve.comparator(this,e)===0}child(e){const t=this.segments.slice(this.offset,this.limit());return e instanceof ve?e.forEach(r=>{t.push(r)}):t.push(e),this.construct(t)}limit(){return this.offset+this.length}popFirst(e){return e=e===void 0?1:e,this.construct(this.segments,this.offset+e,this.length-e)}popLast(){return this.construct(this.segments,this.offset,this.length-1)}firstSegment(){return this.segments[this.offset]}lastSegment(){return this.get(this.length-1)}get(e){return this.segments[this.offset+e]}isEmpty(){return this.length===0}isPrefixOf(e){if(e.length<this.length)return!1;for(let t=0;t<this.length;t++)if(this.get(t)!==e.get(t))return!1;return!0}isImmediateParentOf(e){if(this.length+1!==e.length)return!1;for(let t=0;t<this.length;t++)if(this.get(t)!==e.get(t))return!1;return!0}forEach(e){for(let t=this.offset,r=this.limit();t<r;t++)e(this.segments[t])}toArray(){return this.segments.slice(this.offset,this.limit())}static comparator(e,t){const r=Math.min(e.length,t.length);for(let s=0;s<r;s++){const i=ve.compareSegments(e.get(s),t.get(s));if(i!==0)return i}return b(e.length,t.length)}static compareSegments(e,t){const r=ve.isNumericId(e),s=ve.isNumericId(t);return r&&!s?-1:!r&&s?1:r&&s?ve.extractNumericId(e).compare(ve.extractNumericId(t)):Fr(e,t)}static isNumericId(e){return e.startsWith("__id")&&e.endsWith("__")}static extractNumericId(e){return ct.fromString(e.substring(4,e.length-2))}}class D extends ve{construct(e,t,r){return new D(e,t,r)}canonicalString(){return this.toArray().join("/")}toString(){return this.canonicalString()}toStringWithLeadingSlash(){return`/${this.canonicalString()}`}toUriEncodedString(){return this.toArray().map(encodeURIComponent).join("/")}static fromString(...e){const t=[];for(const r of e){if(r.indexOf("//")>=0)throw new y(m.INVALID_ARGUMENT,`Invalid segment (${r}). Paths must not contain // in them.`);t.push(...r.split("/").filter(s=>s.length>0))}return new D(t)}static emptyPath(){return new D([])}}const Iu=/^[_a-zA-Z][_a-zA-Z0-9]*$/;class W extends ve{construct(e,t,r){return new W(e,t,r)}static isValidIdentifier(e){return Iu.test(e)}canonicalString(){return this.toArray().map(e=>(e=e.replace(/\\/g,"\\\\").replace(/`/g,"\\`"),W.isValidIdentifier(e)||(e="`"+e+"`"),e)).join(".")}toString(){return this.canonicalString()}isKeyField(){return this.length===1&&this.get(0)===Ve}static keyField(){return new W([Ve])}static fromServerFormat(e){const t=[];let r="",s=0;const i=()=>{if(r.length===0)throw new y(m.INVALID_ARGUMENT,`Invalid field path (${e}). Paths must not be empty, begin with '.', end with '.', or contain '..'`);t.push(r),r=""};let a=!1;for(;s<e.length;){const o=e[s];if(o==="\\"){if(s+1===e.length)throw new y(m.INVALID_ARGUMENT,"Path has trailing escape character: "+e);const u=e[s+1];if(u!=="\\"&&u!=="."&&u!=="`")throw new y(m.INVALID_ARGUMENT,"Path has invalid escape sequence: "+e);r+=u,s+=2}else o==="`"?(a=!a,s++):o!=="."||a?(r+=o,s++):(i(),s++)}if(i(),a)throw new y(m.INVALID_ARGUMENT,"Unterminated ` in path: "+e);return new W(t)}static emptyPath(){return new W([])}}/**
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
 */class v{constructor(e){this.path=e}static fromPath(e){return new v(D.fromString(e))}static fromName(e){return new v(D.fromString(e).popFirst(5))}static empty(){return new v(D.emptyPath())}get collectionGroup(){return this.path.popLast().lastSegment()}hasCollectionId(e){return this.path.length>=2&&this.path.get(this.path.length-2)===e}getCollectionGroup(){return this.path.get(this.path.length-2)}getCollectionPath(){return this.path.popLast()}isEqual(e){return e!==null&&D.comparator(this.path,e.path)===0}toString(){return this.path.toString()}static comparator(e,t){return D.comparator(e.path,t.path)}static isDocumentKey(e){return e.length%2==0}static fromSegments(e){return new v(new D(e.slice()))}}/**
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
 */function ra(n,e,t){if(!t)throw new y(m.INVALID_ARGUMENT,`Function ${n}() cannot be called with an empty ${e}.`)}function Au(n,e,t,r){if(e===!0&&r===!0)throw new y(m.INVALID_ARGUMENT,`${n} and ${t} cannot be used together.`)}function si(n){if(!v.isDocumentKey(n))throw new y(m.INVALID_ARGUMENT,`Invalid document reference. Document references must have an even number of segments, but ${n} has ${n.length}.`)}function ii(n){if(v.isDocumentKey(n))throw new y(m.INVALID_ARGUMENT,`Invalid collection reference. Collection references must have an odd number of segments, but ${n} has ${n.length}.`)}function gn(n){return typeof n=="object"&&n!==null&&(Object.getPrototypeOf(n)===Object.prototype||Object.getPrototypeOf(n)===null)}function cr(n){if(n===void 0)return"undefined";if(n===null)return"null";if(typeof n=="string")return n.length>20&&(n=`${n.substring(0,20)}...`),JSON.stringify(n);if(typeof n=="number"||typeof n=="boolean")return""+n;if(typeof n=="object"){if(n instanceof Array)return"an array";{const e=function(r){return r.constructor?r.constructor.name:null}(n);return e?`a custom ${e} object`:"an object"}}return typeof n=="function"?"a function":A(12329,{type:typeof n})}function F(n,e){if("_delegate"in n&&(n=n._delegate),!(n instanceof e)){if(e.name===n.constructor.name)throw new y(m.INVALID_ARGUMENT,"Type does not match the expected instance. Did you pass a reference from a different Firestore SDK?");{const t=cr(n);throw new y(m.INVALID_ARGUMENT,`Expected type '${e.name}', but it was: ${t}`)}}return n}function vu(n,e){if(e<=0)throw new y(m.INVALID_ARGUMENT,`Function ${n}() requires a positive number, but it was: ${e}.`)}/**
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
 */function Q(n,e){const t={typeString:n};return e&&(t.value=e),t}function yn(n,e){if(!gn(n))throw new y(m.INVALID_ARGUMENT,"JSON must be an object");let t;for(const r in e)if(e[r]){const s=e[r].typeString,i="value"in e[r]?{value:e[r].value}:void 0;if(!(r in n)){t=`JSON missing required field: '${r}'`;break}const a=n[r];if(s&&typeof a!==s){t=`JSON field '${r}' must be a ${s}.`;break}if(i!==void 0&&a!==i.value){t=`Expected '${r}' field to equal '${i.value}'`;break}}if(t)throw new y(m.INVALID_ARGUMENT,t);return!0}/**
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
 */const ai=-62135596800,oi=1e6;class L{static now(){return L.fromMillis(Date.now())}static fromDate(e){return L.fromMillis(e.getTime())}static fromMillis(e){const t=Math.floor(e/1e3),r=Math.floor((e-1e3*t)*oi);return new L(t,r)}constructor(e,t){if(this.seconds=e,this.nanoseconds=t,t<0)throw new y(m.INVALID_ARGUMENT,"Timestamp nanoseconds out of range: "+t);if(t>=1e9)throw new y(m.INVALID_ARGUMENT,"Timestamp nanoseconds out of range: "+t);if(e<ai)throw new y(m.INVALID_ARGUMENT,"Timestamp seconds out of range: "+e);if(e>=253402300800)throw new y(m.INVALID_ARGUMENT,"Timestamp seconds out of range: "+e)}toDate(){return new Date(this.toMillis())}toMillis(){return 1e3*this.seconds+this.nanoseconds/oi}_compareTo(e){return this.seconds===e.seconds?b(this.nanoseconds,e.nanoseconds):b(this.seconds,e.seconds)}isEqual(e){return e.seconds===this.seconds&&e.nanoseconds===this.nanoseconds}toString(){return"Timestamp(seconds="+this.seconds+", nanoseconds="+this.nanoseconds+")"}toJSON(){return{type:L._jsonSchemaVersion,seconds:this.seconds,nanoseconds:this.nanoseconds}}static fromJSON(e){if(yn(e,L._jsonSchema))return new L(e.seconds,e.nanoseconds)}valueOf(){const e=this.seconds-ai;return String(e).padStart(12,"0")+"."+String(this.nanoseconds).padStart(9,"0")}}L._jsonSchemaVersion="firestore/timestamp/1.0",L._jsonSchema={type:Q("string",L._jsonSchemaVersion),seconds:Q("number"),nanoseconds:Q("number")};/**
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
 */class R{static fromTimestamp(e){return new R(e)}static min(){return new R(new L(0,0))}static max(){return new R(new L(253402300799,999999999))}constructor(e){this.timestamp=e}compareTo(e){return this.timestamp._compareTo(e.timestamp)}isEqual(e){return this.timestamp.isEqual(e.timestamp)}toMicroseconds(){return 1e6*this.timestamp.seconds+this.timestamp.nanoseconds/1e3}toString(){return"SnapshotVersion("+this.timestamp.toString()+")"}toTimestamp(){return this.timestamp}}/**
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
 */const Zt=-1;function Vu(n,e){const t=n.toTimestamp().seconds,r=n.toTimestamp().nanoseconds+1,s=R.fromTimestamp(r===1e9?new L(t+1,0):new L(t,r));return new We(s,v.empty(),e)}function Ru(n){return new We(n.readTime,n.key,Zt)}class We{constructor(e,t,r){this.readTime=e,this.documentKey=t,this.largestBatchId=r}static min(){return new We(R.min(),v.empty(),Zt)}static max(){return new We(R.max(),v.empty(),Zt)}}function Pu(n,e){let t=n.readTime.compareTo(e.readTime);return t!==0?t:(t=v.comparator(n.documentKey,e.documentKey),t!==0?t:b(n.largestBatchId,e.largestBatchId))}/**
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
 */const Cu="The current tab is not in the required state to perform this operation. It might be necessary to refresh the browser tab.";class Su{constructor(){this.onCommittedListeners=[]}addOnCommittedListener(e){this.onCommittedListeners.push(e)}raiseOnCommittedEvent(){this.onCommittedListeners.forEach(e=>e())}}/**
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
 */async function bt(n){if(n.code!==m.FAILED_PRECONDITION||n.message!==Cu)throw n;w("LocalStore","Unexpectedly lost primary lease")}/**
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
 */class p{constructor(e){this.nextCallback=null,this.catchCallback=null,this.result=void 0,this.error=void 0,this.isDone=!1,this.callbackAttached=!1,e(t=>{this.isDone=!0,this.result=t,this.nextCallback&&this.nextCallback(t)},t=>{this.isDone=!0,this.error=t,this.catchCallback&&this.catchCallback(t)})}catch(e){return this.next(void 0,e)}next(e,t){return this.callbackAttached&&A(59440),this.callbackAttached=!0,this.isDone?this.error?this.wrapFailure(t,this.error):this.wrapSuccess(e,this.result):new p((r,s)=>{this.nextCallback=i=>{this.wrapSuccess(e,i).next(r,s)},this.catchCallback=i=>{this.wrapFailure(t,i).next(r,s)}})}toPromise(){return new Promise((e,t)=>{this.next(e,t)})}wrapUserFunction(e){try{const t=e();return t instanceof p?t:p.resolve(t)}catch(t){return p.reject(t)}}wrapSuccess(e,t){return e?this.wrapUserFunction(()=>e(t)):p.resolve(t)}wrapFailure(e,t){return e?this.wrapUserFunction(()=>e(t)):p.reject(t)}static resolve(e){return new p((t,r)=>{t(e)})}static reject(e){return new p((t,r)=>{r(e)})}static waitFor(e){return new p((t,r)=>{let s=0,i=0,a=!1;e.forEach(o=>{++s,o.next(()=>{++i,a&&i===s&&t()},u=>r(u))}),a=!0,i===s&&t()})}static or(e){let t=p.resolve(!1);for(const r of e)t=t.next(s=>s?p.resolve(s):r());return t}static forEach(e,t){const r=[];return e.forEach((s,i)=>{r.push(t.call(this,s,i))}),this.waitFor(r)}static mapArray(e,t){return new p((r,s)=>{const i=e.length,a=new Array(i);let o=0;for(let u=0;u<i;u++){const c=u;t(e[c]).next(l=>{a[c]=l,++o,o===i&&r(a)},l=>s(l))}})}static doWhile(e,t){return new p((r,s)=>{const i=()=>{e()===!0?t().next(()=>{i()},s):r()};i()})}}function xu(n){const e=n.match(/Android ([\d.]+)/i),t=e?e[1].split(".").slice(0,2).join("."):"-1";return Number(t)}function Nt(n){return n.name==="IndexedDbTransactionError"}/**
 * @license
 * Copyright 2018 Google LLC
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
 */class lr{constructor(e,t){this.previousValue=e,t&&(t.sequenceNumberHandler=r=>this.ae(r),this.ue=r=>t.writeSequenceNumber(r))}ae(e){return this.previousValue=Math.max(e,this.previousValue),this.previousValue}next(){const e=++this.previousValue;return this.ue&&this.ue(e),e}}lr.ce=-1;/**
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
 */const is=-1;function En(n){return n==null}function en(n){return n===0&&1/n==-1/0}function bu(n){return typeof n=="number"&&Number.isInteger(n)&&!en(n)&&n<=Number.MAX_SAFE_INTEGER&&n>=Number.MIN_SAFE_INTEGER}function Nu(n){return typeof n=="string"}/**
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
 */const sa="";function Du(n){let e="";for(let t=0;t<n.length;t++)e.length>0&&(e=ui(e)),e=ku(n.get(t),e);return ui(e)}function ku(n,e){let t=e;const r=n.length;for(let s=0;s<r;s++){const i=n.charAt(s);switch(i){case"\0":t+="";break;case sa:t+="";break;default:t+=i}}return t}function ui(n){return n+sa+""}/**
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
 */class M{constructor(e,t){this.comparator=e,this.root=t||Z.EMPTY}insert(e,t){return new M(this.comparator,this.root.insert(e,t,this.comparator).copy(null,null,Z.BLACK,null,null))}remove(e){return new M(this.comparator,this.root.remove(e,this.comparator).copy(null,null,Z.BLACK,null,null))}get(e){let t=this.root;for(;!t.isEmpty();){const r=this.comparator(e,t.key);if(r===0)return t.value;r<0?t=t.left:r>0&&(t=t.right)}return null}indexOf(e){let t=0,r=this.root;for(;!r.isEmpty();){const s=this.comparator(e,r.key);if(s===0)return t+r.left.size;s<0?r=r.left:(t+=r.left.size+1,r=r.right)}return-1}isEmpty(){return this.root.isEmpty()}get size(){return this.root.size}minKey(){return this.root.minKey()}maxKey(){return this.root.maxKey()}inorderTraversal(e){return this.root.inorderTraversal(e)}forEach(e){this.inorderTraversal((t,r)=>(e(t,r),!1))}toString(){const e=[];return this.inorderTraversal((t,r)=>(e.push(`${t}:${r}`),!1)),`{${e.join(", ")}}`}reverseTraversal(e){return this.root.reverseTraversal(e)}getIterator(){return new On(this.root,null,this.comparator,!1)}getIteratorFrom(e){return new On(this.root,e,this.comparator,!1)}getReverseIterator(){return new On(this.root,null,this.comparator,!0)}getReverseIteratorFrom(e){return new On(this.root,e,this.comparator,!0)}}class On{constructor(e,t,r,s){this.isReverse=s,this.nodeStack=[];let i=1;for(;!e.isEmpty();)if(i=t?r(e.key,t):1,t&&s&&(i*=-1),i<0)e=this.isReverse?e.left:e.right;else{if(i===0){this.nodeStack.push(e);break}this.nodeStack.push(e),e=this.isReverse?e.right:e.left}}getNext(){let e=this.nodeStack.pop();const t={key:e.key,value:e.value};if(this.isReverse)for(e=e.left;!e.isEmpty();)this.nodeStack.push(e),e=e.right;else for(e=e.right;!e.isEmpty();)this.nodeStack.push(e),e=e.left;return t}hasNext(){return this.nodeStack.length>0}peek(){if(this.nodeStack.length===0)return null;const e=this.nodeStack[this.nodeStack.length-1];return{key:e.key,value:e.value}}}class Z{constructor(e,t,r,s,i){this.key=e,this.value=t,this.color=r??Z.RED,this.left=s??Z.EMPTY,this.right=i??Z.EMPTY,this.size=this.left.size+1+this.right.size}copy(e,t,r,s,i){return new Z(e??this.key,t??this.value,r??this.color,s??this.left,i??this.right)}isEmpty(){return!1}inorderTraversal(e){return this.left.inorderTraversal(e)||e(this.key,this.value)||this.right.inorderTraversal(e)}reverseTraversal(e){return this.right.reverseTraversal(e)||e(this.key,this.value)||this.left.reverseTraversal(e)}min(){return this.left.isEmpty()?this:this.left.min()}minKey(){return this.min().key}maxKey(){return this.right.isEmpty()?this.key:this.right.maxKey()}insert(e,t,r){let s=this;const i=r(e,s.key);return s=i<0?s.copy(null,null,null,s.left.insert(e,t,r),null):i===0?s.copy(null,t,null,null,null):s.copy(null,null,null,null,s.right.insert(e,t,r)),s.fixUp()}removeMin(){if(this.left.isEmpty())return Z.EMPTY;let e=this;return e.left.isRed()||e.left.left.isRed()||(e=e.moveRedLeft()),e=e.copy(null,null,null,e.left.removeMin(),null),e.fixUp()}remove(e,t){let r,s=this;if(t(e,s.key)<0)s.left.isEmpty()||s.left.isRed()||s.left.left.isRed()||(s=s.moveRedLeft()),s=s.copy(null,null,null,s.left.remove(e,t),null);else{if(s.left.isRed()&&(s=s.rotateRight()),s.right.isEmpty()||s.right.isRed()||s.right.left.isRed()||(s=s.moveRedRight()),t(e,s.key)===0){if(s.right.isEmpty())return Z.EMPTY;r=s.right.min(),s=s.copy(r.key,r.value,null,null,s.right.removeMin())}s=s.copy(null,null,null,null,s.right.remove(e,t))}return s.fixUp()}isRed(){return this.color}fixUp(){let e=this;return e.right.isRed()&&!e.left.isRed()&&(e=e.rotateLeft()),e.left.isRed()&&e.left.left.isRed()&&(e=e.rotateRight()),e.left.isRed()&&e.right.isRed()&&(e=e.colorFlip()),e}moveRedLeft(){let e=this.colorFlip();return e.right.left.isRed()&&(e=e.copy(null,null,null,null,e.right.rotateRight()),e=e.rotateLeft(),e=e.colorFlip()),e}moveRedRight(){let e=this.colorFlip();return e.left.left.isRed()&&(e=e.rotateRight(),e=e.colorFlip()),e}rotateLeft(){const e=this.copy(null,null,Z.RED,null,this.right.left);return this.right.copy(null,null,this.color,e,null)}rotateRight(){const e=this.copy(null,null,Z.RED,this.left.right,null);return this.left.copy(null,null,this.color,null,e)}colorFlip(){const e=this.left.copy(null,null,!this.left.color,null,null),t=this.right.copy(null,null,!this.right.color,null,null);return this.copy(null,null,!this.color,e,t)}checkMaxDepth(){const e=this.check();return Math.pow(2,e)<=this.size+1}check(){if(this.isRed()&&this.left.isRed())throw A(43730,{key:this.key,value:this.value});if(this.right.isRed())throw A(14113,{key:this.key,value:this.value});const e=this.left.check();if(e!==this.right.check())throw A(27949);return e+(this.isRed()?0:1)}}Z.EMPTY=null,Z.RED=!0,Z.BLACK=!1;Z.EMPTY=new class{constructor(){this.size=0}get key(){throw A(57766)}get value(){throw A(16141)}get color(){throw A(16727)}get left(){throw A(29726)}get right(){throw A(36894)}copy(e,t,r,s,i){return this}insert(e,t,r){return new Z(e,t)}remove(e,t){return this}isEmpty(){return!0}inorderTraversal(e){return!1}reverseTraversal(e){return!1}minKey(){return null}maxKey(){return null}isRed(){return!1}checkMaxDepth(){return!0}check(){return 0}};/**
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
 */class G{constructor(e){this.comparator=e,this.data=new M(this.comparator)}has(e){return this.data.get(e)!==null}first(){return this.data.minKey()}last(){return this.data.maxKey()}get size(){return this.data.size}indexOf(e){return this.data.indexOf(e)}forEach(e){this.data.inorderTraversal((t,r)=>(e(t),!1))}forEachInRange(e,t){const r=this.data.getIteratorFrom(e[0]);for(;r.hasNext();){const s=r.getNext();if(this.comparator(s.key,e[1])>=0)return;t(s.key)}}forEachWhile(e,t){let r;for(r=t!==void 0?this.data.getIteratorFrom(t):this.data.getIterator();r.hasNext();)if(!e(r.getNext().key))return}firstAfterOrEqual(e){const t=this.data.getIteratorFrom(e);return t.hasNext()?t.getNext().key:null}getIterator(){return new ci(this.data.getIterator())}getIteratorFrom(e){return new ci(this.data.getIteratorFrom(e))}add(e){return this.copy(this.data.remove(e).insert(e,!0))}delete(e){return this.has(e)?this.copy(this.data.remove(e)):this}isEmpty(){return this.data.isEmpty()}unionWith(e){let t=this;return t.size<e.size&&(t=e,e=this),e.forEach(r=>{t=t.add(r)}),t}isEqual(e){if(!(e instanceof G)||this.size!==e.size)return!1;const t=this.data.getIterator(),r=e.data.getIterator();for(;t.hasNext();){const s=t.getNext().key,i=r.getNext().key;if(this.comparator(s,i)!==0)return!1}return!0}toArray(){const e=[];return this.forEach(t=>{e.push(t)}),e}toString(){const e=[];return this.forEach(t=>e.push(t)),"SortedSet("+e.toString()+")"}copy(e){const t=new G(this.comparator);return t.data=e,t}}class ci{constructor(e){this.iter=e}getNext(){return this.iter.getNext().key}hasNext(){return this.iter.hasNext()}}/**
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
 */class pe{constructor(e){this.fields=e,e.sort(W.comparator)}static empty(){return new pe([])}unionWith(e){let t=new G(W.comparator);for(const r of this.fields)t=t.add(r);for(const r of e)t=t.add(r);return new pe(t.toArray())}covers(e){for(const t of this.fields)if(t.isPrefixOf(e))return!0;return!1}isEqual(e){return At(this.fields,e.fields,(t,r)=>t.isEqual(r))}}/**
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
 */function Kn(n){let e=0;for(const t in n)Object.prototype.hasOwnProperty.call(n,t)&&e++;return e}function st(n,e){for(const t in n)Object.prototype.hasOwnProperty.call(n,t)&&e(t,n[t])}function Lu(n,e){const t=[];for(const r in n)Object.prototype.hasOwnProperty.call(n,r)&&t.push(e(n[r],r,n));return t}function ia(n){for(const e in n)if(Object.prototype.hasOwnProperty.call(n,e))return!1;return!0}/**
 * @license
 * Copyright 2023 Google LLC
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
 */class aa extends Error{constructor(){super(...arguments),this.name="Base64DecodeError"}}/**
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
 */class j{constructor(e){this.binaryString=e}static fromBase64String(e){const t=function(s){try{return atob(s)}catch(i){throw typeof DOMException<"u"&&i instanceof DOMException?new aa("Invalid base64 string: "+i):i}}(e);return new j(t)}static fromUint8Array(e){const t=function(s){let i="";for(let a=0;a<s.length;++a)i+=String.fromCharCode(s[a]);return i}(e);return new j(t)}[Symbol.iterator](){let e=0;return{next:()=>e<this.binaryString.length?{value:this.binaryString.charCodeAt(e++),done:!1}:{value:void 0,done:!0}}}toBase64(){return function(t){return btoa(t)}(this.binaryString)}toUint8Array(){return function(t){const r=new Uint8Array(t.length);for(let s=0;s<t.length;s++)r[s]=t.charCodeAt(s);return r}(this.binaryString)}approximateByteSize(){return 2*this.binaryString.length}compareTo(e){return b(this.binaryString,e.binaryString)}isEqual(e){return this.binaryString===e.binaryString}}j.EMPTY_BYTE_STRING=new j("");const Ou=new RegExp(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.(\d+))?Z$/);function He(n){if(I(!!n,39018),typeof n=="string"){let e=0;const t=Ou.exec(n);if(I(!!t,46558,{timestamp:n}),t[1]){let s=t[1];s=(s+"000000000").substr(0,9),e=Number(s)}const r=new Date(n);return{seconds:Math.floor(r.getTime()/1e3),nanos:e}}return{seconds:U(n.seconds),nanos:U(n.nanos)}}function U(n){return typeof n=="number"?n:typeof n=="string"?Number(n):0}function Ye(n){return typeof n=="string"?j.fromBase64String(n):j.fromUint8Array(n)}/**
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
 */const oa="server_timestamp",ua="__type__",ca="__previous_value__",la="__local_write_time__";function hr(n){return(n?.mapValue?.fields||{})[ua]?.stringValue===oa}function Tn(n){const e=n.mapValue.fields[ca];return hr(e)?Tn(e):e}function vt(n){const e=He(n.mapValue.fields[la].timestampValue);return new L(e.seconds,e.nanos)}/**
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
 */class Mu{constructor(e,t,r,s,i,a,o,u,c,l,d){this.databaseId=e,this.appId=t,this.persistenceKey=r,this.host=s,this.ssl=i,this.forceLongPolling=a,this.autoDetectLongPolling=o,this.longPollingOptions=u,this.useFetchStreams=c,this.isUsingEmulator=l,this.apiKey=d}}const tn="(default)";class nn{constructor(e,t){this.projectId=e,this.database=t||tn}static empty(){return new nn("","")}get isDefaultDatabase(){return this.database===tn}isEqual(e){return e instanceof nn&&e.projectId===this.projectId&&e.database===this.database}}function Uu(n,e){if(!Object.prototype.hasOwnProperty.apply(n.options,["projectId"]))throw new y(m.INVALID_ARGUMENT,'"projectId" not provided in firebase.initializeApp.');return new nn(n.options.projectId,e)}/**
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
 */const ha="__type__",Fu="__max__",Mn={mapValue:{}},da="__vector__",rn="value",Vt={nullValue:"NULL_VALUE"},ce={booleanValue:!0},X={booleanValue:!1};function K(n){return"nullValue"in n?0:"booleanValue"in n?1:"integerValue"in n||"doubleValue"in n?2:"timestampValue"in n?3:"stringValue"in n?5:"bytesValue"in n?6:"referenceValue"in n?7:"geoPointValue"in n?8:"arrayValue"in n?9:"mapValue"in n?hr(n)?4:qu(n)?9007199254740991:Wn(n)?10:11:A(28295,{value:n})}function we(n,e,t){if(n===e)return!0;const r=K(n);if(r!==K(e))return!1;switch(r){case 0:case 9007199254740991:return!0;case 1:return n.booleanValue===e.booleanValue;case 4:return vt(n).isEqual(vt(e));case 3:return function(i,a){if(typeof i.timestampValue=="string"&&typeof a.timestampValue=="string"&&i.timestampValue.length===a.timestampValue.length)return i.timestampValue===a.timestampValue;const o=He(i.timestampValue),u=He(a.timestampValue);return o.seconds===u.seconds&&o.nanos===u.nanos}(n,e);case 5:return n.stringValue===e.stringValue;case 6:return function(i,a){return Ye(i.bytesValue).isEqual(Ye(a.bytesValue))}(n,e);case 7:return n.referenceValue===e.referenceValue;case 8:return function(i,a){return U(i.geoPointValue.latitude)===U(a.geoPointValue.latitude)&&U(i.geoPointValue.longitude)===U(a.geoPointValue.longitude)}(n,e);case 2:return function(i,a,o){if("integerValue"in i&&"integerValue"in a)return U(i.integerValue)===U(a.integerValue);let u,c;if("doubleValue"in i&&"doubleValue"in a)u=U(i.doubleValue),c=U(a.doubleValue);else{if(!o?.Ee)return!1;u=U(i.integerValue??i.doubleValue),c=U(a.integerValue??a.doubleValue)}return u===c?!!o?.he||en(u)===en(c):!!(o===void 0||o.Te)&&isNaN(u)&&isNaN(c)}(n,e,t);case 9:return At(n.arrayValue.values||[],e.arrayValue.values||[],(s,i)=>we(s,i,t));case 10:case 11:return function(i,a,o){const u=i.mapValue.fields||{},c=a.mapValue.fields||{};if(Kn(u)!==Kn(c))return!1;for(const l in u)if(u.hasOwnProperty(l)&&(c[l]===void 0||!we(u[l],c[l],o)))return!1;return!0}(n,e,t);default:return A(52216,{left:n})}}function sn(n,e){return(n.values||[]).find(t=>we(t,e))!==void 0}function le(n,e){if(n===e)return 0;const t=K(n),r=K(e);if(t!==r)return b(t,r);switch(t){case 0:case 9007199254740991:return 0;case 1:return b(n.booleanValue,e.booleanValue);case 2:return function(i,a){const o=U(i.integerValue||i.doubleValue),u=U(a.integerValue||a.doubleValue);return o<u?-1:o>u?1:o===u?0:isNaN(o)?isNaN(u)?0:-1:1}(n,e);case 3:return li(n.timestampValue,e.timestampValue);case 4:return li(vt(n),vt(e));case 5:return Fr(n.stringValue,e.stringValue);case 6:return function(i,a){const o=Ye(i),u=Ye(a);return o.compareTo(u)}(n.bytesValue,e.bytesValue);case 7:return function(i,a){const o=i.split("/"),u=a.split("/");for(let c=0;c<o.length&&c<u.length;c++){const l=b(o[c],u[c]);if(l!==0)return l}return b(o.length,u.length)}(n.referenceValue,e.referenceValue);case 8:return function(i,a){const o=b(U(i.latitude),U(a.latitude));return o!==0?o:b(U(i.longitude),U(a.longitude))}(n.geoPointValue,e.geoPointValue);case 9:return hi(n.arrayValue,e.arrayValue);case 10:return function(i,a){const o=i.fields||{},u=a.fields||{},c=o[rn]?.arrayValue,l=u[rn]?.arrayValue,d=b(c?.values?.length||0,l?.values?.length||0);return d!==0?d:hi(c,l)}(n.mapValue,e.mapValue);case 11:return function(i,a){if(i===Mn.mapValue&&a===Mn.mapValue)return 0;if(i===Mn.mapValue)return 1;if(a===Mn.mapValue)return-1;const o=i.fields||{},u=Object.keys(o),c=a.fields||{},l=Object.keys(c);u.sort(),l.sort();for(let d=0;d<u.length&&d<l.length;++d){const f=Fr(u[d],l[d]);if(f!==0)return f;const g=le(o[u[d]],c[l[d]]);if(g!==0)return g}return b(u.length,l.length)}(n.mapValue,e.mapValue);default:throw A(23264,{Pe:t})}}function li(n,e){if(typeof n=="string"&&typeof e=="string"&&n.length===e.length)return b(n,e);const t=He(n),r=He(e),s=b(t.seconds,r.seconds);return s!==0?s:b(t.nanos,r.nanos)}function hi(n,e){const t=n.values||[],r=e.values||[];for(let s=0;s<t.length&&s<r.length;++s){const i=le(t[s],r[s]);if(i!==void 0&&i!==0)return i}return b(t.length,r.length)}function Rt(n){return qr(n)}function qr(n){return"nullValue"in n?"null":"booleanValue"in n?""+n.booleanValue:"integerValue"in n?""+n.integerValue:"doubleValue"in n?""+n.doubleValue:"timestampValue"in n?function(t){const r=He(t);return`time(${r.seconds},${r.nanos})`}(n.timestampValue):"stringValue"in n?n.stringValue:"bytesValue"in n?function(t){return Ye(t).toBase64()}(n.bytesValue):"referenceValue"in n?function(t){return v.fromName(t).toString()}(n.referenceValue):"geoPointValue"in n?function(t){return`geo(${t.latitude},${t.longitude})`}(n.geoPointValue):"arrayValue"in n?function(t){let r="[",s=!0;for(const i of t.values||[])s?s=!1:r+=",",r+=qr(i);return r+"]"}(n.arrayValue):"mapValue"in n?function(t){const r=Object.keys(t.fields||{}).sort();let s="{",i=!0;for(const a of r)i?i=!1:s+=",",s+=`${a}:${qr(t.fields[a])}`;return s+"}"}(n.mapValue):A(61005,{value:n})}function Bn(n){switch(K(n)){case 0:case 1:return 4;case 2:return 8;case 3:case 8:return 16;case 4:const e=Tn(n);return e?16+Bn(e):16;case 5:return 2*n.stringValue.length;case 6:return Ye(n.bytesValue).approximateByteSize();case 7:return n.referenceValue.length;case 9:return function(r){return(r.values||[]).reduce((s,i)=>s+Bn(i),0)}(n.arrayValue);case 10:case 11:return function(r){let s=0;return st(r.fields,(i,a)=>{s+=i.length+Bn(a)}),s}(n.mapValue);default:throw A(13486,{value:n})}}function di(n,e){return{referenceValue:`projects/${n.projectId}/databases/${n.database}/documents/${e.path.canonicalString()}`}}function Re(n){return!!n&&"integerValue"in n}function ut(n){return!!n&&"doubleValue"in n}function Je(n){return Re(n)||ut(n)}function Pt(n){return!!n&&"arrayValue"in n}function ge(n){return!!n&&"nullValue"in n}function he(n){return!!n&&"doubleValue"in n&&isNaN(Number(n.doubleValue))}function lt(n){return!!n&&"mapValue"in n}function Wn(n){return(n?.mapValue?.fields||{})[ha]?.stringValue===da}function Br(n){return(n?.mapValue?.fields||{})[rn]?.arrayValue}function Gt(n){if(n.geoPointValue)return{geoPointValue:{...n.geoPointValue}};if(n.timestampValue&&typeof n.timestampValue=="object")return{timestampValue:{...n.timestampValue}};if(n.mapValue){const e={mapValue:{fields:{}}};return st(n.mapValue.fields,(t,r)=>e.mapValue.fields[t]=Gt(r)),e}if(n.arrayValue){const e={arrayValue:{values:[]}};for(let t=0;t<(n.arrayValue.values||[]).length;++t)e.arrayValue.values[t]=Gt(n.arrayValue.values[t]);return e}return{...n}}function qu(n){return(((n.mapValue||{}).fields||{}).__type__||{}).stringValue===Fu}/**
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
 */class re{constructor(e){this.value=e}static empty(){return new re({mapValue:{}})}field(e){if(e.isEmpty())return this.value;{let t=this.value;for(let r=0;r<e.length-1;++r)if(t=(t.mapValue.fields||{})[e.get(r)],!lt(t))return null;return t=(t.mapValue.fields||{})[e.lastSegment()],t||null}}set(e,t){this.getFieldsMap(e.popLast())[e.lastSegment()]=Gt(t)}setAll(e){let t=W.emptyPath(),r={},s=[];e.forEach((a,o)=>{if(!t.isImmediateParentOf(o)){const u=this.getFieldsMap(t);this.applyChanges(u,r,s),r={},s=[],t=o.popLast()}a?r[o.lastSegment()]=Gt(a):s.push(o.lastSegment())});const i=this.getFieldsMap(t);this.applyChanges(i,r,s)}delete(e){const t=this.field(e.popLast());lt(t)&&t.mapValue.fields&&delete t.mapValue.fields[e.lastSegment()]}isEqual(e){return we(this.value,e.value)}getFieldsMap(e){let t=this.value;t.mapValue.fields||(t.mapValue={fields:{}});for(let r=0;r<e.length;++r){let s=t.mapValue.fields[e.get(r)];lt(s)&&s.mapValue.fields||(s={mapValue:{fields:{}}},t.mapValue.fields[e.get(r)]=s),t=s}return t.mapValue.fields}applyChanges(e,t,r){st(t,(s,i)=>e[s]=i);for(const s of r)delete e[s]}clone(){return new re(Gt(this.value))}}function fa(n){const e=[];return st(n.fields,(t,r)=>{const s=new W([t]);if(lt(r)){const i=fa(r.mapValue).fields;if(i.length===0)e.push(s);else for(const a of i)e.push(s.child(a))}else e.push(s)}),new pe(e)}/**
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
 */function dr(n,e){if(n.useProto3Json){if(isNaN(e))return{doubleValue:"NaN"};if(e===1/0)return{doubleValue:"Infinity"};if(e===-1/0)return{doubleValue:"-Infinity"}}return{doubleValue:en(e)?"-0":e}}function as(n){return{integerValue:""+n}}function os(n,e,t){return Number.isInteger(e)&&t?.preferIntegers||bu(e)?as(e):dr(n,e)}/**
 * @license
 * Copyright 2018 Google LLC
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
 */class fr{constructor(){this._=void 0}}function Bu(n,e,t){return n instanceof an?function(s,i){const a={fields:{[ua]:{stringValue:oa},[la]:{timestampValue:{seconds:s.seconds,nanos:s.nanoseconds}}}};return i&&hr(i)&&(i=Tn(i)),i&&(a.fields[ca]=i),{mapValue:a}}(t,e):n instanceof Ct?_a(n,e):n instanceof on?pa(n,e):n instanceof un?function(s,i){const a=ma(s,i),o=Jn(a)+Jn(s.Re);return Re(a)&&Re(s.Re)?as(o):dr(s.serializer,o)}(n,e):n instanceof Hn?function(s,i){return fi(s,i,Math.min)}(n,e):n instanceof Yn?function(s,i){return fi(s,i,Math.max)}(n,e):void 0}function $u(n,e,t){return n instanceof Ct?_a(n,e):n instanceof on?pa(n,e):t}function ma(n,e){return n instanceof un?Je(e)?e:{integerValue:0}:null}class an extends fr{}class Ct extends fr{constructor(e){super(),this.elements=e}}function _a(n,e){const t=ga(e);for(const r of n.elements)t.some(s=>we(s,r))||t.push(r);return{arrayValue:{values:t}}}class on extends fr{constructor(e){super(),this.elements=e}}function pa(n,e){let t=ga(e);for(const r of n.elements)t=t.filter(s=>!we(s,r));return{arrayValue:{values:t}}}class us extends fr{constructor(e,t){super(),this.serializer=e,this.Re=t}}class un extends us{}class Hn extends us{}class Yn extends us{}function fi(n,e,t){if(!Je(e))return n.Re;const r=t(Jn(e),Jn(n.Re));return Re(e)&&Re(n.Re)?as(r):dr(n.serializer,r)}function Jn(n){return U(n.integerValue||n.doubleValue)}function ga(n){return Pt(n)&&n.arrayValue.values?n.arrayValue.values.slice():[]}/**
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
 */class ya{constructor(e,t){this.field=e,this.transform=t}}function zu(n,e){return n.field.isEqual(e.field)&&function(r,s){return r instanceof Ct&&s instanceof Ct||r instanceof on&&s instanceof on?At(r.elements,s.elements,we):r instanceof un&&s instanceof un||r instanceof Hn&&s instanceof Hn||r instanceof Yn&&s instanceof Yn?we(r.Re,s.Re):r instanceof an&&s instanceof an}(n.transform,e.transform)}class Qu{constructor(e,t){this.version=e,this.transformResults=t}}class ${constructor(e,t){this.updateTime=e,this.exists=t}static none(){return new $}static exists(e){return new $(void 0,e)}static updateTime(e){return new $(e)}get isNone(){return this.updateTime===void 0&&this.exists===void 0}isEqual(e){return this.exists===e.exists&&(this.updateTime?!!e.updateTime&&this.updateTime.isEqual(e.updateTime):!e.updateTime)}}function $n(n,e){return n.updateTime!==void 0?e.isFoundDocument()&&e.version.isEqual(n.updateTime):n.exists===void 0||n.exists===e.isFoundDocument()}class mr{}function Ea(n,e){if(!n.hasLocalMutations||e&&e.fields.length===0)return null;if(e===null)return n.isNoDocument()?new In(n.key,$.none()):new wn(n.key,n.data,$.none());{const t=n.data,r=re.empty();let s=new G(W.comparator);for(let i of e.fields)if(!s.has(i)){let a=t.field(i);a===null&&i.length>1&&(i=i.popLast(),a=t.field(i)),a===null?r.delete(i):r.set(i,a),s=s.add(i)}return new it(n.key,r,new pe(s.toArray()),$.none())}}function Gu(n,e,t){n instanceof wn?function(s,i,a){const o=s.value.clone(),u=_i(s.fieldTransforms,i,a.transformResults);o.setAll(u),i.convertToFoundDocument(a.version,o).setHasCommittedMutations()}(n,e,t):n instanceof it?function(s,i,a){if(!$n(s.precondition,i))return void i.convertToUnknownDocument(a.version);const o=_i(s.fieldTransforms,i,a.transformResults),u=i.data;u.setAll(Ta(s)),u.setAll(o),i.convertToFoundDocument(a.version,u).setHasCommittedMutations()}(n,e,t):function(s,i,a){i.convertToNoDocument(a.version).setHasCommittedMutations()}(0,e,t)}function jt(n,e,t,r){return n instanceof wn?function(i,a,o,u){if(!$n(i.precondition,a))return o;const c=i.value.clone(),l=pi(i.fieldTransforms,u,a);return c.setAll(l),a.convertToFoundDocument(a.version,c).setHasLocalMutations(),null}(n,e,t,r):n instanceof it?function(i,a,o,u){if(!$n(i.precondition,a))return o;const c=pi(i.fieldTransforms,u,a),l=a.data;return l.setAll(Ta(i)),l.setAll(c),a.convertToFoundDocument(a.version,l).setHasLocalMutations(),o===null?null:o.unionWith(i.fieldMask.fields).unionWith(i.fieldTransforms.map(d=>d.field))}(n,e,t,r):function(i,a,o){return $n(i.precondition,a)?(a.convertToNoDocument(a.version).setHasLocalMutations(),null):o}(n,e,t)}function ju(n,e){let t=null;for(const r of n.fieldTransforms){const s=e.data.field(r.field),i=ma(r.transform,s||null);i!=null&&(t===null&&(t=re.empty()),t.set(r.field,i))}return t||null}function mi(n,e){return n.type===e.type&&!!n.key.isEqual(e.key)&&!!n.precondition.isEqual(e.precondition)&&!!function(r,s){return r===void 0&&s===void 0||!(!r||!s)&&At(r,s,(i,a)=>zu(i,a))}(n.fieldTransforms,e.fieldTransforms)&&(n.type===0?n.value.isEqual(e.value):n.type!==1||n.data.isEqual(e.data)&&n.fieldMask.isEqual(e.fieldMask))}class wn extends mr{constructor(e,t,r,s=[]){super(),this.key=e,this.value=t,this.precondition=r,this.fieldTransforms=s,this.type=0}getFieldMask(){return null}}class it extends mr{constructor(e,t,r,s,i=[]){super(),this.key=e,this.data=t,this.fieldMask=r,this.precondition=s,this.fieldTransforms=i,this.type=1}getFieldMask(){return this.fieldMask}}function Ta(n){const e=new Map;return n.fieldMask.fields.forEach(t=>{if(!t.isEmpty()){const r=n.data.field(t);e.set(t,r)}}),e}function _i(n,e,t){const r=new Map;I(n.length===t.length,32656,{Ie:t.length,Ae:n.length});for(let s=0;s<t.length;s++){const i=n[s],a=i.transform,o=e.data.field(i.field);r.set(i.field,$u(a,o,t[s]))}return r}function pi(n,e,t){const r=new Map;for(const s of n){const i=s.transform,a=t.data.field(s.field);r.set(s.field,Bu(i,a,e))}return r}class In extends mr{constructor(e,t){super(),this.key=e,this.precondition=t,this.type=2,this.fieldTransforms=[]}getFieldMask(){return null}}class wa extends mr{constructor(e,t){super(),this.key=e,this.precondition=t,this.type=3,this.fieldTransforms=[]}getFieldMask(){return null}}/**
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
 */class Xn{constructor(e,t){this.position=e,this.inclusive=t}}function gi(n,e,t){let r=0;for(let s=0;s<n.position.length;s++){const i=e[s],a=n.position[s];if(i.field.isKeyField()?r=v.comparator(v.fromName(a.referenceValue),t.key):r=le(a,t.data.field(i.field)),i.dir==="desc"&&(r*=-1),r!==0)break}return r}function yi(n,e){if(n===null)return e===null;if(e===null||n.inclusive!==e.inclusive||n.position.length!==e.position.length)return!1;for(let t=0;t<n.position.length;t++)if(!we(n.position[t],e.position[t]))return!1;return!0}/**
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
 */class Ia{}class z extends Ia{constructor(e,t,r){super(),this.field=e,this.op=t,this.value=r}static create(e,t,r){return e.isKeyField()?t==="in"||t==="not-in"?this.createKeyFieldInFilter(e,t,r):new Wu(e,t,r):t==="array-contains"?new Ju(e,r):t==="in"?new Xu(e,r):t==="not-in"?new Zu(e,r):t==="array-contains-any"?new ec(e,r):new z(e,t,r)}static createKeyFieldInFilter(e,t,r){return t==="in"?new Hu(e,r):new Yu(e,r)}matches(e){const t=e.data.field(this.field);return this.op==="!="?t!==null&&t.nullValue===void 0&&this.matchesComparison(le(t,this.value)):t!==null&&K(this.value)===K(t)&&this.matchesComparison(le(t,this.value))}matchesComparison(e){switch(this.op){case"<":return e<0;case"<=":return e<=0;case"==":return e===0;case"!=":return e!==0;case">":return e>0;case">=":return e>=0;default:return A(47266,{operator:this.op})}}isInequality(){return["<","<=",">",">=","!=","not-in"].indexOf(this.op)>=0}getFlattenedFilters(){return[this]}getFilters(){return[this]}}class Ae extends Ia{constructor(e,t){super(),this.filters=e,this.op=t,this.Ve=null}static create(e,t){return new Ae(e,t)}matches(e){return Aa(this)?this.filters.find(t=>!t.matches(e))===void 0:this.filters.find(t=>t.matches(e))!==void 0}getFlattenedFilters(){return this.Ve!==null||(this.Ve=this.filters.reduce((e,t)=>e.concat(t.getFlattenedFilters()),[])),this.Ve}getFilters(){return Object.assign([],this.filters)}}function Aa(n){return n.op==="and"}function va(n){return Ku(n)&&Aa(n)}function Ku(n){for(const e of n.filters)if(e instanceof Ae)return!1;return!0}function $r(n){if(n instanceof z)return n.field.canonicalString()+n.op.toString()+Rt(n.value);if(va(n))return n.filters.map(e=>$r(e)).join(",");{const e=n.filters.map(t=>$r(t)).join(",");return`${n.op}(${e})`}}function Va(n,e){return n instanceof z?function(r,s){return s instanceof z&&r.op===s.op&&r.field.isEqual(s.field)&&we(r.value,s.value)}(n,e):n instanceof Ae?function(r,s){return s instanceof Ae&&r.op===s.op&&r.filters.length===s.filters.length?r.filters.reduce((i,a,o)=>i&&Va(a,s.filters[o]),!0):!1}(n,e):void A(19439)}function Ra(n){return n instanceof z?function(t){return`${t.field.canonicalString()} ${t.op} ${Rt(t.value)}`}(n):n instanceof Ae?function(t){return t.op.toString()+" {"+t.getFilters().map(Ra).join(" ,")+"}"}(n):"Filter"}class Wu extends z{constructor(e,t,r){super(e,t,r),this.key=v.fromName(r.referenceValue)}matches(e){const t=v.comparator(e.key,this.key);return this.matchesComparison(t)}}class Hu extends z{constructor(e,t){super(e,"in",t),this.keys=Pa("in",t)}matches(e){return this.keys.some(t=>t.isEqual(e.key))}}class Yu extends z{constructor(e,t){super(e,"not-in",t),this.keys=Pa("not-in",t)}matches(e){return!this.keys.some(t=>t.isEqual(e.key))}}function Pa(n,e){return(e.arrayValue?.values||[]).map(t=>v.fromName(t.referenceValue))}class Ju extends z{constructor(e,t){super(e,"array-contains",t)}matches(e){const t=e.data.field(this.field);return Pt(t)&&sn(t.arrayValue,this.value)}}class Xu extends z{constructor(e,t){super(e,"in",t)}matches(e){const t=e.data.field(this.field);return t!==null&&sn(this.value.arrayValue,t)}}class Zu extends z{constructor(e,t){super(e,"not-in",t)}matches(e){if(sn(this.value.arrayValue,{nullValue:"NULL_VALUE"}))return!1;const t=e.data.field(this.field);return t!==null&&t.nullValue===void 0&&!sn(this.value.arrayValue,t)}}class ec extends z{constructor(e,t){super(e,"array-contains-any",t)}matches(e){const t=e.data.field(this.field);return!(!Pt(t)||!t.arrayValue.values)&&t.arrayValue.values.some(r=>sn(this.value.arrayValue,r))}}/**
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
 */class cn{constructor(e,t="asc"){this.field=e,this.dir=t}}function tc(n,e){return n.dir===e.dir&&n.field.isEqual(e.field)}/**
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
 */class J{constructor(e,t,r,s,i,a,o){this.key=e,this.documentType=t,this.version=r,this.readTime=s,this.createTime=i,this.data=a,this.documentState=o}static newInvalidDocument(e){return new J(e,0,R.min(),R.min(),R.min(),re.empty(),0)}static newFoundDocument(e,t,r,s){return new J(e,1,t,R.min(),r,s,0)}static newNoDocument(e,t){return new J(e,2,t,R.min(),R.min(),re.empty(),0)}static newUnknownDocument(e,t){return new J(e,3,t,R.min(),R.min(),re.empty(),2)}convertToFoundDocument(e,t){return!this.createTime.isEqual(R.min())||this.documentType!==2&&this.documentType!==0||(this.createTime=e),this.version=e,this.documentType=1,this.data=t,this.documentState=0,this}convertToNoDocument(e){return this.version=e,this.documentType=2,this.data=re.empty(),this.documentState=0,this}convertToUnknownDocument(e){return this.version=e,this.documentType=3,this.data=re.empty(),this.documentState=2,this}setHasCommittedMutations(){return this.documentState=2,this}setHasLocalMutations(){return this.documentState=1,this.version=R.min(),this}setReadTime(e){return this.readTime=e,this}get hasLocalMutations(){return this.documentState===1}get hasCommittedMutations(){return this.documentState===2}get hasPendingWrites(){return this.hasLocalMutations||this.hasCommittedMutations}isValidDocument(){return this.documentType!==0}isFoundDocument(){return this.documentType===1}isNoDocument(){return this.documentType===2}isUnknownDocument(){return this.documentType===3}isEqual(e){return e instanceof J&&this.key.isEqual(e.key)&&this.version.isEqual(e.version)&&this.documentType===e.documentType&&this.documentState===e.documentState&&this.data.isEqual(e.data)}mutableCopy(){return new J(this.key,this.documentType,this.version,this.readTime,this.createTime,this.data.clone(),this.documentState)}toString(){return`Document(${this.key}, ${this.version}, ${JSON.stringify(this.data.value)}, {createTime: ${this.createTime}}), {documentType: ${this.documentType}}), {documentState: ${this.documentState}})`}}/**
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
 */class nc{constructor(e,t=null,r=[],s=[],i=null,a=null,o=null){this.path=e,this.collectionGroup=t,this.orderBy=r,this.filters=s,this.limit=i,this.startAt=a,this.endAt=o,this.de=null}}function Ei(n,e=null,t=[],r=[],s=null,i=null,a=null){return new nc(n,e,t,r,s,i,a)}function Ca(n){const e=P(n);if(e.de===null){let t=e.path.canonicalString();e.collectionGroup!==null&&(t+="|cg:"+e.collectionGroup),t+="|f:",t+=e.filters.map(r=>$r(r)).join(","),t+="|ob:",t+=e.orderBy.map(r=>function(i){return i.field.canonicalString()+i.dir}(r)).join(","),En(e.limit)||(t+="|l:",t+=e.limit),e.startAt&&(t+="|lb:",t+=e.startAt.inclusive?"b:":"a:",t+=e.startAt.position.map(r=>Rt(r)).join(",")),e.endAt&&(t+="|ub:",t+=e.endAt.inclusive?"a:":"b:",t+=e.endAt.position.map(r=>Rt(r)).join(",")),e.de=t}return e.de}function Sa(n,e){if(n.limit!==e.limit||n.orderBy.length!==e.orderBy.length)return!1;for(let t=0;t<n.orderBy.length;t++)if(!tc(n.orderBy[t],e.orderBy[t]))return!1;if(n.filters.length!==e.filters.length)return!1;for(let t=0;t<n.filters.length;t++)if(!Va(n.filters[t],e.filters[t]))return!1;return n.collectionGroup===e.collectionGroup&&!!n.path.isEqual(e.path)&&!!yi(n.startAt,e.startAt)&&yi(n.endAt,e.endAt)}function ot(n){return!!n.isCorePipeline}function xa(n){return!!n.path&&v.isDocumentKey(n.path)&&n.collectionGroup===null&&n.filters.length===0}/**
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
 */class Dt{constructor(e,t=null,r=[],s=[],i=null,a="F",o=null,u=null){this.path=e,this.collectionGroup=t,this.explicitOrderBy=r,this.filters=s,this.limit=i,this.limitType=a,this.startAt=o,this.endAt=u,this.fe=null,this.me=null,this.pe=null,this.startAt,this.endAt}}function rc(n,e,t,r,s,i,a,o){return new Dt(n,e,t,r,s,i,a,o)}function _r(n){return new Dt(n)}function Ti(n){return n.filters.length===0&&n.limit===null&&n.startAt==null&&n.endAt==null&&(n.explicitOrderBy.length===0||n.explicitOrderBy.length===1&&n.explicitOrderBy[0].field.isKeyField())}function sc(n){return v.isDocumentKey(n.path)&&n.collectionGroup===null&&n.filters.length===0}function ba(n){return n.collectionGroup!==null}function Kt(n){const e=P(n);if(e.fe===null){e.fe=[];const t=new Set;for(const i of e.explicitOrderBy)e.fe.push(i),t.add(i.field.canonicalString());const r=e.explicitOrderBy.length>0?e.explicitOrderBy[e.explicitOrderBy.length-1].dir:"asc";(function(a){let o=new G(W.comparator);return a.filters.forEach(u=>{u.getFlattenedFilters().forEach(c=>{c.isInequality()&&(o=o.add(c.field))})}),o})(e).forEach(i=>{t.has(i.canonicalString())||i.isKeyField()||e.fe.push(new cn(i,r))}),t.has(W.keyField().canonicalString())||e.fe.push(new cn(W.keyField(),r))}return e.fe}function Ce(n){const e=P(n);return e.me||(e.me=ic(e,Kt(n))),e.me}function ic(n,e){if(n.limitType==="F")return Ei(n.path,n.collectionGroup,e,n.filters,n.limit,n.startAt,n.endAt);{e=e.map(s=>{const i=s.dir==="desc"?"asc":"desc";return new cn(s.field,i)});const t=n.endAt?new Xn(n.endAt.position,n.endAt.inclusive):null,r=n.startAt?new Xn(n.startAt.position,n.startAt.inclusive):null;return Ei(n.path,n.collectionGroup,e,n.filters,n.limit,t,r)}}function zr(n,e){const t=n.filters.concat([e]);return new Dt(n.path,n.collectionGroup,n.explicitOrderBy.slice(),t,n.limit,n.limitType,n.startAt,n.endAt)}function ac(n,e){const t=n.explicitOrderBy.concat([e]);return new Dt(n.path,n.collectionGroup,t,n.filters.slice(),n.limit,n.limitType,n.startAt,n.endAt)}function Zn(n,e,t){return new Dt(n.path,n.collectionGroup,n.explicitOrderBy.slice(),n.filters.slice(),e,t,n.startAt,n.endAt)}function oc(n,e){return Sa(Ce(n),Ce(e))&&n.limitType===e.limitType}function Wt(n){return`Query(target=${function(t){let r=t.path.canonicalString();return t.collectionGroup!==null&&(r+=" collectionGroup="+t.collectionGroup),t.filters.length>0&&(r+=`, filters: [${t.filters.map(s=>Ra(s)).join(", ")}]`),En(t.limit)||(r+=", limit: "+t.limit),t.orderBy.length>0&&(r+=`, orderBy: [${t.orderBy.map(s=>function(a){return`${a.field.canonicalString()} (${a.dir})`}(s)).join(", ")}]`),t.startAt&&(r+=", startAt: ",r+=t.startAt.inclusive?"b:":"a:",r+=t.startAt.position.map(s=>Rt(s)).join(",")),t.endAt&&(r+=", endAt: ",r+=t.endAt.inclusive?"a:":"b:",r+=t.endAt.position.map(s=>Rt(s)).join(",")),`Target(${r})`}(Ce(n))}; limitType=${n.limitType})`}function pr(n,e){return e.isFoundDocument()&&function(r,s){const i=s.key.path;return r.collectionGroup!==null?s.key.hasCollectionId(r.collectionGroup)&&r.path.isPrefixOf(i):v.isDocumentKey(r.path)?r.path.isEqual(i):r.path.isImmediateParentOf(i)}(n,e)&&function(r,s){for(const i of Kt(r))if(!i.field.isKeyField()&&s.data.field(i.field)===null)return!1;return!0}(n,e)&&function(r,s){for(const i of r.filters)if(!i.matches(s))return!1;return!0}(n,e)&&function(r,s){return!(r.startAt&&!function(a,o,u){const c=gi(a,o,u);return a.inclusive?c<=0:c<0}(r.startAt,Kt(r),s)||r.endAt&&!function(a,o,u){const c=gi(a,o,u);return a.inclusive?c>=0:c>0}(r.endAt,Kt(r),s))}(n,e)}function cs(n){return(e,t)=>{let r=!1;for(const s of Kt(n)){const i=uc(s,e,t);if(i!==0)return i;r=r||s.field.isKeyField()}return 0}}function uc(n,e,t){const r=n.field.isKeyField()?v.comparator(e.key,t.key):function(i,a,o){const u=a.data.field(i),c=o.data.field(i);return u!==null&&c!==null?le(u,c):A(42886)}(n.field,e,t);switch(n.dir){case"asc":return r;case"desc":return-1*r;default:return A(19790,{direction:n.dir})}}/**
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
 */class cc{constructor(e,t){this.count=e,this.unchangedNames=t}}/**
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
 */var B,N;function Na(n){switch(n){case m.OK:return A(64938);case m.CANCELLED:case m.UNKNOWN:case m.DEADLINE_EXCEEDED:case m.RESOURCE_EXHAUSTED:case m.INTERNAL:case m.UNAVAILABLE:case m.UNAUTHENTICATED:return!1;case m.INVALID_ARGUMENT:case m.NOT_FOUND:case m.ALREADY_EXISTS:case m.PERMISSION_DENIED:case m.FAILED_PRECONDITION:case m.ABORTED:case m.OUT_OF_RANGE:case m.UNIMPLEMENTED:case m.DATA_LOSS:return!0;default:return A(15467,{code:n})}}function Da(n){if(n===void 0)return Me("GRPC error has no .code"),m.UNKNOWN;switch(n){case B.OK:return m.OK;case B.CANCELLED:return m.CANCELLED;case B.UNKNOWN:return m.UNKNOWN;case B.DEADLINE_EXCEEDED:return m.DEADLINE_EXCEEDED;case B.RESOURCE_EXHAUSTED:return m.RESOURCE_EXHAUSTED;case B.INTERNAL:return m.INTERNAL;case B.UNAVAILABLE:return m.UNAVAILABLE;case B.UNAUTHENTICATED:return m.UNAUTHENTICATED;case B.INVALID_ARGUMENT:return m.INVALID_ARGUMENT;case B.NOT_FOUND:return m.NOT_FOUND;case B.ALREADY_EXISTS:return m.ALREADY_EXISTS;case B.PERMISSION_DENIED:return m.PERMISSION_DENIED;case B.FAILED_PRECONDITION:return m.FAILED_PRECONDITION;case B.ABORTED:return m.ABORTED;case B.OUT_OF_RANGE:return m.OUT_OF_RANGE;case B.UNIMPLEMENTED:return m.UNIMPLEMENTED;case B.DATA_LOSS:return m.DATA_LOSS;default:return A(39323,{code:n})}}(N=B||(B={}))[N.OK=0]="OK",N[N.CANCELLED=1]="CANCELLED",N[N.UNKNOWN=2]="UNKNOWN",N[N.INVALID_ARGUMENT=3]="INVALID_ARGUMENT",N[N.DEADLINE_EXCEEDED=4]="DEADLINE_EXCEEDED",N[N.NOT_FOUND=5]="NOT_FOUND",N[N.ALREADY_EXISTS=6]="ALREADY_EXISTS",N[N.PERMISSION_DENIED=7]="PERMISSION_DENIED",N[N.UNAUTHENTICATED=16]="UNAUTHENTICATED",N[N.RESOURCE_EXHAUSTED=8]="RESOURCE_EXHAUSTED",N[N.FAILED_PRECONDITION=9]="FAILED_PRECONDITION",N[N.ABORTED=10]="ABORTED",N[N.OUT_OF_RANGE=11]="OUT_OF_RANGE",N[N.UNIMPLEMENTED=12]="UNIMPLEMENTED",N[N.INTERNAL=13]="INTERNAL",N[N.UNAVAILABLE=14]="UNAVAILABLE",N[N.DATA_LOSS=15]="DATA_LOSS";/**
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
 */class mt{constructor(e,t){this.mapKeyFn=e,this.equalsFn=t,this.inner={},this.innerSize=0}get(e){const t=this.mapKeyFn(e),r=this.inner[t];if(r!==void 0){for(const[s,i]of r)if(this.equalsFn(s,e))return i}}has(e){return this.get(e)!==void 0}set(e,t){const r=this.mapKeyFn(e),s=this.inner[r];if(s===void 0)return this.inner[r]=[[e,t]],void this.innerSize++;for(let i=0;i<s.length;i++)if(this.equalsFn(s[i][0],e))return void(s[i]=[e,t]);s.push([e,t]),this.innerSize++}delete(e){const t=this.mapKeyFn(e),r=this.inner[t];if(r===void 0)return!1;for(let s=0;s<r.length;s++)if(this.equalsFn(r[s][0],e))return r.length===1?delete this.inner[t]:r.splice(s,1),this.innerSize--,!0;return!1}forEach(e){st(this.inner,(t,r)=>{for(const[s,i]of r)e(s,i)})}isEmpty(){return ia(this.inner)}size(){return this.innerSize}}/**
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
 */const lc=new M(v.comparator);function oe(){return lc}const ka=new M(v.comparator);function yt(...n){let e=ka;for(const t of n)e=e.insert(t.key,t);return e}function La(n){let e=ka;return n.forEach((t,r)=>e=e.insert(t,r.overlayedDocument)),e}function Be(){return Ht()}function Oa(){return Ht()}function Ht(){return new mt(n=>n.toString(),(n,e)=>n.isEqual(e))}const hc=new M(v.comparator),dc=new G(v.comparator);function x(...n){let e=dc;for(const t of n)e=e.add(t);return e}const fc=new G(b);function mc(){return fc}/**
 * @license
 * Copyright 2023 Google LLC
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
 */function _c(){return new TextEncoder}/**
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
 */const pc=new ct([4294967295,4294967295],0);function wi(n){const e=_c().encode(n),t=new uu;return t.update(e),new Uint8Array(t.digest())}function Ii(n){const e=new DataView(n.buffer),t=e.getUint32(0,!0),r=e.getUint32(4,!0),s=e.getUint32(8,!0),i=e.getUint32(12,!0);return[new ct([t,r],0),new ct([s,i],0)]}class ls{constructor(e,t,r){if(this.bitmap=e,this.padding=t,this.hashCount=r,t<0||t>=8)throw new zt(`Invalid padding: ${t}`);if(r<0)throw new zt(`Invalid hash count: ${r}`);if(e.length>0&&this.hashCount===0)throw new zt(`Invalid hash count: ${r}`);if(e.length===0&&t!==0)throw new zt(`Invalid padding when bitmap length is 0: ${t}`);this.ge=8*e.length-t,this.ye=ct.fromNumber(this.ge)}we(e,t,r){let s=e.add(t.multiply(ct.fromNumber(r)));return s.compare(pc)===1&&(s=new ct([s.getBits(0),s.getBits(1)],0)),s.modulo(this.ye).toNumber()}be(e){return!!(this.bitmap[Math.floor(e/8)]&1<<e%8)}mightContain(e){if(this.ge===0)return!1;const t=wi(e),[r,s]=Ii(t);for(let i=0;i<this.hashCount;i++){const a=this.we(r,s,i);if(!this.be(a))return!1}return!0}static create(e,t,r){const s=e%8==0?0:8-e%8,i=new Uint8Array(Math.ceil(e/8)),a=new ls(i,s,t);return r.forEach(o=>a.insert(o)),a}insert(e){if(this.ge===0)return;const t=wi(e),[r,s]=Ii(t);for(let i=0;i<this.hashCount;i++){const a=this.we(r,s,i);this.ve(a)}}ve(e){const t=Math.floor(e/8),r=e%8;this.bitmap[t]|=1<<r}}class zt extends Error{constructor(){super(...arguments),this.name="BloomFilterError"}}/**
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
 */class An{constructor(e,t,r,s,i,a){this.snapshotVersion=e,this.targetChanges=t,this.targetMismatches=r,this.documentUpdates=s,this.augmentedDocumentUpdates=i,this.resolvedLimboDocuments=a}static createSynthesizedRemoteEventForCurrentChange(e,t,r){const s=new Map;return s.set(e,vn.createSynthesizedTargetChangeForCurrentChange(e,t,r)),new An(R.min(),s,new M(b),oe(),oe(),x())}}class vn{constructor(e,t,r,s,i){this.resumeToken=e,this.current=t,this.addedDocuments=r,this.modifiedDocuments=s,this.removedDocuments=i}static createSynthesizedTargetChangeForCurrentChange(e,t,r){return new vn(r,t,x(),x(),x())}}/**
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
 */class zn{constructor(e,t,r,s){this.Se=e,this.removedTargetIds=t,this.key=r,this.De=s}}class Ma{constructor(e,t){this.targetId=e,this.xe=t}}class Ua{constructor(e,t,r=j.EMPTY_BYTE_STRING,s=null){this.state=e,this.targetIds=t,this.resumeToken=r,this.cause=s}}class Ai{constructor(e){this.targetId=e,this.Ce=0,this.Fe=vi(),this.Oe=j.EMPTY_BYTE_STRING,this.Me=!1,this.Ne=!0}get current(){return this.Me}get resumeToken(){return this.Oe}get Le(){return this.Ce!==0}get Be(){return this.Ne}Ue(e){e.approximateByteSize()>0&&(this.Ne=!0,this.Oe=e)}ke(){let e=x(),t=x(),r=x();return this.Fe.forEach((s,i)=>{switch(i){case 0:e=e.add(s);break;case 2:t=t.add(s);break;case 1:r=r.add(s);break;default:A(38017,{changeType:i})}}),new vn(this.Oe,this.Me,e,t,r)}qe(){this.Ne=!1,this.Fe=vi()}$e(e,t){this.Ne=!0,this.Fe=this.Fe.insert(e,t)}Ke(e){this.Ne=!0,this.Fe=this.Fe.remove(e)}We(){this.Ce+=1}Qe(){this.Ce-=1,I(this.Ce>=0,3241,{Ce:this.Ce,targetId:this.targetId})}Ge(){this.Ne=!0,this.Me=!0}}const Bt="WatchChangeAggregator";class gc{constructor(e){this.ze=e,this.je=new Map,this.He=oe(),this.Je=Un(),this.Ye=oe(),this.Ze=Un(),this.Xe=new M(b)}et(e){for(const t of e.Se)e.De&&e.De.isFoundDocument()?this.tt(t,e.De):this.nt(t,e.key,e.De);for(const t of e.removedTargetIds)this.nt(t,e.key,e.De)}rt(e){this.forEachTarget(e,t=>{const r=this.je.get(t);if(r)switch(e.state){case 0:this.it(t)&&r.Ue(e.resumeToken);break;case 1:r.Qe(),r.Le||r.qe(),r.Ue(e.resumeToken);break;case 2:r.Qe(),r.Le||this.removeTarget(t);break;case 3:this.it(t)&&(r.Ge(),r.Ue(e.resumeToken));break;case 4:this.it(t)&&(this.st(t),r.Ue(e.resumeToken));break;default:A(56790,{state:e.state})}else w(Bt,`handleTargetChange received targetChange for untracked target ID (${t}) with state (${e.state})`)})}forEachTarget(e,t){e.targetIds.length>0?e.targetIds.forEach(t):this.je.forEach((r,s)=>{this.it(s)&&t(s)})}_t(e){return ot(e)?e.getPipelineSourceType()==="documents"&&e.getPipelineDocuments()?.length===1:xa(e)}ot(e){const t=e.targetId,r=e.xe.count,s=this.ut(t);if(s){const i=s.target;if(this._t(i))if(r===0){const a=new v(ot(i)?D.fromString(i.getPipelineDocuments()[0]):i.path);this.nt(t,a,J.newNoDocument(a,R.min()))}else I(r===1,20013,"Single document existence filter with count: "+r);else{const a=this.ct(t);if(a!==r){const o=this.lt(e),u=o?this.Et(o,e,a):1;if(u!==0){this.st(t);const c=u===2?"TargetPurposeExistenceFilterMismatchBloom":"TargetPurposeExistenceFilterMismatch";this.Xe=this.Xe.insert(t,c)}}}}}lt(e){const t=e.xe.unchangedNames;if(!t||!t.bits)return null;const{bits:{bitmap:r="",padding:s=0},hashCount:i=0}=t;let a,o;try{a=Ye(r).toUint8Array()}catch(u){if(u instanceof aa)return Ie("Decoding the base64 bloom filter in existence filter failed ("+u.message+"); ignoring the bloom filter and falling back to full re-query."),null;throw u}try{o=new ls(a,s,i)}catch(u){return Ie(u instanceof zt?"BloomFilter error: ":"Applying bloom filter failed: ",u),null}return o.ge===0?null:o}Et(e,t,r){return t.xe.count===r-this.Pt(e,t.targetId)?0:2}Pt(e,t){const r=this.ze.getRemoteKeysForTarget(t);let s=0;return r.forEach(i=>{const a=this.ze.Tt(),o=`projects/${a.projectId}/databases/${a.database}/documents/${i.path.canonicalString()}`;e.mightContain(o)||(this.nt(t,i,null),s++)}),s}Rt(e){const t=new Map;this.je.forEach((i,a)=>{const o=this.ut(a);if(o){if(i.current&&this._t(o.target)){const u=ot(o.target)?D.fromString(o.target.getPipelineDocuments()[0]):o.target.path,c=new v(u);this.It(c).has(a)||this.At(a,c)||this.nt(a,c,J.newNoDocument(c,e))}i.Be&&(t.set(a,i.ke()),i.qe())}});let r=x();this.Ze.forEach((i,a)=>{let o=!0;a.forEachWhile(u=>{const c=this.ut(u);return!c||c.purpose==="TargetPurposeLimboResolution"||(o=!1,!1)}),o&&(r=r.add(i))}),this.He.forEach((i,a)=>a.setReadTime(e)),this.Ye.forEach((i,a)=>a.setReadTime(e));const s=new An(e,t,this.Xe,this.He,this.Ye,r);return this.He=oe(),this.Je=Un(),this.Ye=oe(),this.Ze=Un(),this.Xe=new M(b),s}tt(e,t){const r=this.je.get(e);if(!r||!this.it(e))return void w(Bt,`addDocumentToTarget received document for unknown inactive target (${e})`);const s=this.At(e,t.key)?2:0;r.$e(t.key,s),ot(this.ut(e).target)&&this.ut(e).target.getPipelineFlavor()!=="exact"?this.Ye=this.Ye.insert(t.key,t):this.He=this.He.insert(t.key,t),this.Je=this.Je.insert(t.key,this.It(t.key).add(e)),this.Ze=this.Ze.insert(t.key,this.Vt(t.key).add(e))}nt(e,t,r){const s=this.je.get(e);s&&this.it(e)?(this.At(e,t)?s.$e(t,1):s.Ke(t),this.Ze=this.Ze.insert(t,this.Vt(t).delete(e)),this.Ze=this.Ze.insert(t,this.Vt(t).add(e)),r&&(ot(this.ut(e).target)&&this.ut(e).target.getPipelineFlavor()!=="exact"?this.Ye=this.Ye.insert(t,r):this.He=this.He.insert(t,r))):w(Bt,`removeDocumentFromTarget received document for unknown or inactive target (${e})`)}removeTarget(e){this.je.delete(e)}ct(e){const t=this.je.get(e);if(!t)return 0;const r=t.ke();return this.ze.getRemoteKeysForTarget(e).size+r.addedDocuments.size-r.removedDocuments.size}We(e){let t=this.je.get(e);t||(w(Bt,`recordPendingTargetRequest set up tracking for target ID ${e}`),t=new Ai(e),this.je.set(e,t)),t.We()}Vt(e){let t=this.Ze.get(e);return t||(t=new G(b),this.Ze=this.Ze.insert(e,t)),t}It(e){let t=this.Je.get(e);return t||(t=new G(b),this.Je=this.Je.insert(e,t)),t}it(e){const t=this.ut(e)!==null;return t||w(Bt,"Detected inactive target",e),t}ut(e){const t=this.je.get(e);return t===void 0||t.Le?null:this.ze.dt(e)}st(e){this.je.set(e,new Ai(e)),this.ze.getRemoteKeysForTarget(e).forEach(t=>{this.nt(e,t,null)})}At(e,t){return this.ze.getRemoteKeysForTarget(e).has(t)}}function Un(){return new M(v.comparator)}function vi(){return new M(v.comparator)}const yc={asc:"ASCENDING",desc:"DESCENDING"},Ec={"<":"LESS_THAN","<=":"LESS_THAN_OR_EQUAL",">":"GREATER_THAN",">=":"GREATER_THAN_OR_EQUAL","==":"EQUAL","!=":"NOT_EQUAL","array-contains":"ARRAY_CONTAINS",in:"IN","not-in":"NOT_IN","array-contains-any":"ARRAY_CONTAINS_ANY"},Tc={and:"AND",or:"OR"};class wc{constructor(e,t){this.databaseId=e,this.useProto3Json=t}}function Qr(n,e){return n.useProto3Json||En(e)?e:{value:e}}function er(n,e){return n.useProto3Json?`${new Date(1e3*e.seconds).toISOString().replace(/\.\d*/,"").replace("Z","")}.${("000000000"+e.nanoseconds).slice(-9)}Z`:{seconds:""+e.seconds,nanos:e.nanoseconds}}function hs(n){const e=He(n);return new L(e.seconds,e.nanos)}function Fa(n,e){return n.useProto3Json?e.toBase64():e.toUint8Array()}function Qn(n,e){return er(n,e.toTimestamp())}function ye(n){return I(!!n,49232),R.fromTimestamp(hs(n))}function ds(n,e){return Gr(n,e).canonicalString()}function Gr(n,e){const t=function(s){return new D(["projects",s.projectId,"databases",s.database])}(n).child("documents");return e===void 0?t:t.child(e)}function qa(n){const e=D.fromString(n);return I(ja(e),10190,{key:e.toString()}),e}function ln(n,e){return ds(n.databaseId,e.path)}function Yt(n,e){const t=qa(e);if(t.get(1)!==n.databaseId.projectId)throw new y(m.INVALID_ARGUMENT,"Tried to deserialize key from different project: "+t.get(1)+" vs "+n.databaseId.projectId);if(t.get(3)!==n.databaseId.database)throw new y(m.INVALID_ARGUMENT,"Tried to deserialize key from different database: "+t.get(3)+" vs "+n.databaseId.database);return new v($a(t))}function Ba(n,e){return ds(n.databaseId,e)}function Ic(n){const e=qa(n);return e.length===4?D.emptyPath():$a(e)}function jr(n){return new D(["projects",n.databaseId.projectId,"databases",n.databaseId.database]).canonicalString()}function $a(n){return I(n.length>4&&n.get(4)==="documents",29091,{key:n.toString()}),n.popFirst(5)}function Vi(n,e,t){return{name:ln(n,e),fields:t.value.mapValue.fields}}function Ac(n,e){return"found"in e?function(r,s){I(!!s.found,43571),s.found.name,s.found.updateTime;const i=Yt(r,s.found.name),a=ye(s.found.updateTime),o=s.found.createTime?ye(s.found.createTime):R.min(),u=new re({mapValue:{fields:s.found.fields}});return J.newFoundDocument(i,a,o,u)}(n,e):"missing"in e?function(r,s){I(!!s.missing,3894),I(!!s.readTime,22933);const i=Yt(r,s.missing),a=ye(s.readTime);return J.newNoDocument(i,a)}(n,e):A(7234,{result:e})}function vc(n,e){let t;if("targetChange"in e){e.targetChange;const r=function(c){return c==="NO_CHANGE"?0:c==="ADD"?1:c==="REMOVE"?2:c==="CURRENT"?3:c==="RESET"?4:A(39313,{state:c})}(e.targetChange.targetChangeType||"NO_CHANGE"),s=e.targetChange.targetIds||[],i=function(c,l){return c.useProto3Json?(I(l===void 0||typeof l=="string",58123),j.fromBase64String(l||"")):(I(l===void 0||l instanceof Buffer||l instanceof Uint8Array,16193),j.fromUint8Array(l||new Uint8Array))}(n,e.targetChange.resumeToken),a=e.targetChange.cause,o=a&&function(c){const l=c.code===void 0?m.UNKNOWN:Da(c.code);return new y(l,c.message||"")}(a);t=new Ua(r,s,i,o||null)}else if("documentChange"in e){e.documentChange;const r=e.documentChange;r.document,r.document.name,r.document.updateTime;const s=Yt(n,r.document.name),i=ye(r.document.updateTime),a=r.document.createTime?ye(r.document.createTime):R.min(),o=new re({mapValue:{fields:r.document.fields}}),u=J.newFoundDocument(s,i,a,o),c=r.targetIds||[],l=r.removedTargetIds||[];t=new zn(c,l,u.key,u)}else if("documentDelete"in e){e.documentDelete;const r=e.documentDelete;r.document;const s=Yt(n,r.document),i=r.readTime?ye(r.readTime):R.min(),a=J.newNoDocument(s,i),o=r.removedTargetIds||[];t=new zn([],o,a.key,a)}else if("documentRemove"in e){e.documentRemove;const r=e.documentRemove;r.document;const s=Yt(n,r.document),i=r.removedTargetIds||[];t=new zn([],i,s,null)}else{if(!("filter"in e))return A(11601,{ft:e});{e.filter;const r=e.filter;r.targetId;const{count:s=0,unchangedNames:i}=r,a=new cc(s,i),o=r.targetId;t=new Ma(o,a)}}return t}function za(n,e){let t;if(e instanceof wn)t={update:Vi(n,e.key,e.value)};else if(e instanceof In)t={delete:ln(n,e.key)};else if(e instanceof it)t={update:Vi(n,e.key,e.data),updateMask:kc(e.fieldMask)};else{if(!(e instanceof wa))return A(16599,{gt:e.type});t={verify:ln(n,e.key)}}return e.fieldTransforms.length>0&&(t.updateTransforms=e.fieldTransforms.map(r=>function(i,a){const o=a.transform;if(o instanceof an)return{fieldPath:a.field.canonicalString(),setToServerValue:"REQUEST_TIME"};if(o instanceof Ct)return{fieldPath:a.field.canonicalString(),appendMissingElements:{values:o.elements}};if(o instanceof on)return{fieldPath:a.field.canonicalString(),removeAllFromArray:{values:o.elements}};if(o instanceof un)return{fieldPath:a.field.canonicalString(),increment:o.Re};if(o instanceof Hn)return{fieldPath:a.field.canonicalString(),minimum:o.Re};if(o instanceof Yn)return{fieldPath:a.field.canonicalString(),maximum:o.Re};throw A(20930,{transform:a.transform})}(0,r))),e.precondition.isNone||(t.currentDocument=function(s,i){return i.updateTime!==void 0?{updateTime:Qn(s,i.updateTime)}:i.exists!==void 0?{exists:i.exists}:A(27497)}(n,e.precondition)),t}function Vc(n,e){return n&&n.length>0?(I(e!==void 0,14353),n.map(t=>function(s,i){let a=s.updateTime?ye(s.updateTime):ye(i);return a.isEqual(R.min())&&(a=ye(i)),new Qu(a,s.transformResults||[])}(t,e))):[]}function Rc(n,e){return{documents:[Ba(n,e.path)]}}function Pc(n,e){const t={structuredQuery:{}},r=e.path;let s;e.collectionGroup!==null?(s=r,t.structuredQuery.from=[{collectionId:e.collectionGroup,allDescendants:!0}]):(s=r.popLast(),t.structuredQuery.from=[{collectionId:r.lastSegment()}]),t.parent=Ba(n,s);const i=function(c){if(c.length!==0)return Ga(Ae.create(c,"and"))}(e.filters);i&&(t.structuredQuery.where=i);const a=function(c){if(c.length!==0)return c.map(l=>function(f){return{field:Et(f.field),direction:bc(f.dir)}}(l))}(e.orderBy);a&&(t.structuredQuery.orderBy=a);const o=Qr(n,e.limit);return o!==null&&(t.structuredQuery.limit=o),e.startAt&&(t.structuredQuery.startAt=function(c){return{before:c.inclusive,values:c.position}}(e.startAt)),e.endAt&&(t.structuredQuery.endAt=function(c){return{before:!c.inclusive,values:c.position}}(e.endAt)),{yt:t,parent:s}}function Cc(n){let e=Ic(n.parent);const t=n.structuredQuery,r=t.from?t.from.length:0;let s=null;if(r>0){I(r===1,65062);const l=t.from[0];l.allDescendants?s=l.collectionId:e=e.child(l.collectionId)}let i=[];t.where&&(i=function(d){const f=Qa(d);return f instanceof Ae&&va(f)?f.getFilters():[f]}(t.where));let a=[];t.orderBy&&(a=function(d){return d.map(f=>function(T){return new cn(Tt(T.field),function(C){switch(C){case"ASCENDING":return"asc";case"DESCENDING":return"desc";default:return}}(T.direction))}(f))}(t.orderBy));let o=null;t.limit&&(o=function(d){let f;return f=typeof d=="object"?d.value:d,En(f)?null:f}(t.limit));let u=null;t.startAt&&(u=function(d){const f=!!d.before,g=d.values||[];return new Xn(g,f)}(t.startAt));let c=null;return t.endAt&&(c=function(d){const f=!d.before,g=d.values||[];return new Xn(g,f)}(t.endAt)),rc(e,s,a,i,o,"F",u,c)}function Sc(n,e){const t=function(s){switch(s){case"TargetPurposeListen":return null;case"TargetPurposeExistenceFilterMismatch":return"existence-filter-mismatch";case"TargetPurposeExistenceFilterMismatchBloom":return"existence-filter-mismatch-bloom";case"TargetPurposeLimboResolution":return"limbo-document";default:return A(28987,{purpose:s})}}(e.purpose);return t==null?null:{"goog-listen-tags":t}}function xc(n,e){return{structuredPipeline:{pipeline:{stages:e.stages.map(t=>t._toProto(n))}}}}function Qa(n){return n.unaryFilter!==void 0?function(t){switch(t.unaryFilter.op){case"IS_NAN":const r=Tt(t.unaryFilter.field);return z.create(r,"==",{doubleValue:NaN});case"IS_NULL":const s=Tt(t.unaryFilter.field);return z.create(s,"==",{nullValue:"NULL_VALUE"});case"IS_NOT_NAN":const i=Tt(t.unaryFilter.field);return z.create(i,"!=",{doubleValue:NaN});case"IS_NOT_NULL":const a=Tt(t.unaryFilter.field);return z.create(a,"!=",{nullValue:"NULL_VALUE"});case"OPERATOR_UNSPECIFIED":return A(61313);default:return A(60726)}}(n):n.fieldFilter!==void 0?function(t){return z.create(Tt(t.fieldFilter.field),function(s){switch(s){case"EQUAL":return"==";case"NOT_EQUAL":return"!=";case"GREATER_THAN":return">";case"GREATER_THAN_OR_EQUAL":return">=";case"LESS_THAN":return"<";case"LESS_THAN_OR_EQUAL":return"<=";case"ARRAY_CONTAINS":return"array-contains";case"IN":return"in";case"NOT_IN":return"not-in";case"ARRAY_CONTAINS_ANY":return"array-contains-any";case"OPERATOR_UNSPECIFIED":return A(58110);default:return A(50506)}}(t.fieldFilter.op),t.fieldFilter.value)}(n):n.compositeFilter!==void 0?function(t){return Ae.create(t.compositeFilter.filters.map(r=>Qa(r)),function(s){switch(s){case"AND":return"and";case"OR":return"or";default:return A(1026)}}(t.compositeFilter.op))}(n):A(30097,{filter:n})}function bc(n){return yc[n]}function Nc(n){return Ec[n]}function Dc(n){return Tc[n]}function Et(n){return{fieldPath:n.canonicalString()}}function Tt(n){return W.fromServerFormat(n.fieldPath)}function Ga(n){return n instanceof z?function(t){if(t.op==="=="){if(he(t.value))return{unaryFilter:{field:Et(t.field),op:"IS_NAN"}};if(ge(t.value))return{unaryFilter:{field:Et(t.field),op:"IS_NULL"}}}else if(t.op==="!="){if(he(t.value))return{unaryFilter:{field:Et(t.field),op:"IS_NOT_NAN"}};if(ge(t.value))return{unaryFilter:{field:Et(t.field),op:"IS_NOT_NULL"}}}return{fieldFilter:{field:Et(t.field),op:Nc(t.op),value:t.value}}}(n):n instanceof Ae?function(t){const r=t.getFilters().map(s=>Ga(s));return r.length===1?r[0]:{compositeFilter:{op:Dc(t.op),filters:r}}}(n):A(54877,{filter:n})}function kc(n){const e=[];return n.fields.forEach(t=>e.push(t.canonicalString())),{fieldPaths:e}}function ja(n){return n.length>=4&&n.get(0)==="projects"&&n.get(2)==="databases"}function Ka(n){return!!n&&typeof n._toProto=="function"&&n._protoValueType==="ProtoValue"}function hn(n,e){const t={fields:{}};return e.forEach((r,s)=>{if(typeof s!="string")throw new Error(`Cannot encode map with non-string key: ${s}`);t.fields[s]=r._toProto(n)}),{mapValue:t}}function Wa(n){return{stringValue:n}}/**
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
 */function gr(n){return new wc(n,!0)}/**
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
 */class _e{constructor(e){this._byteString=e}static fromBase64String(e){try{return new _e(j.fromBase64String(e))}catch(t){throw new y(m.INVALID_ARGUMENT,"Failed to construct data from Base64 string: "+t)}}static fromUint8Array(e){return new _e(j.fromUint8Array(e))}toBase64(){return this._byteString.toBase64()}toUint8Array(){return this._byteString.toUint8Array()}toString(){return"Bytes(base64: "+this.toBase64()+")"}isEqual(e){return this._byteString.isEqual(e._byteString)}toJSON(){return{type:_e._jsonSchemaVersion,bytes:this.toBase64()}}static fromJSON(e){if(yn(e,_e._jsonSchema))return _e.fromBase64String(e.bytes)}}_e._jsonSchemaVersion="firestore/bytes/1.0",_e._jsonSchema={type:Q("string",_e._jsonSchemaVersion),bytes:Q("string")};/**
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
 */class kt{constructor(...e){for(let t=0;t<e.length;++t)if(e[t].length===0)throw new y(m.INVALID_ARGUMENT,"Invalid field name at argument $(i + 1). Field names must not be empty.");this._internalPath=new W(e)}isEqual(e){return this._internalPath.isEqual(e._internalPath)}}function Lc(){return new kt(Ve)}/**
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
 */class Vn{constructor(e){this._methodName=e}}/**
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
 */class Se{constructor(e,t){if(!isFinite(e)||e<-90||e>90)throw new y(m.INVALID_ARGUMENT,"Latitude must be a number between -90 and 90, but was: "+e);if(!isFinite(t)||t<-180||t>180)throw new y(m.INVALID_ARGUMENT,"Longitude must be a number between -180 and 180, but was: "+t);this._lat=e,this._long=t}get latitude(){return this._lat}get longitude(){return this._long}isEqual(e){return this._lat===e._lat&&this._long===e._long}_compareTo(e){return b(this._lat,e._lat)||b(this._long,e._long)}toJSON(){return{latitude:this._lat,longitude:this._long,type:Se._jsonSchemaVersion}}static fromJSON(e){if(yn(e,Se._jsonSchema))return new Se(e.latitude,e.longitude)}}function Ha(n){const e={};return n.timeoutSeconds!==void 0&&(e.timeoutSeconds=n.timeoutSeconds),e}/**
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
 */Se._jsonSchemaVersion="firestore/geoPoint/1.0",Se._jsonSchema={type:Q("string",Se._jsonSchemaVersion),latitude:Q("number"),longitude:Q("number")};class Oc{bt(e){}shutdown(){}}/**
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
 */const Ri="ConnectivityMonitor";class Pi{constructor(){this.vt=()=>this.St(),this.Dt=()=>this.xt(),this.Ct=[],this.Ft()}bt(e){this.Ct.push(e)}shutdown(){window.removeEventListener("online",this.vt),window.removeEventListener("offline",this.Dt)}Ft(){window.addEventListener("online",this.vt),window.addEventListener("offline",this.Dt)}St(){w(Ri,"Network connectivity changed: AVAILABLE");for(const e of this.Ct)e(0)}xt(){w(Ri,"Network connectivity changed: UNAVAILABLE");for(const e of this.Ct)e(1)}static C(){return typeof window<"u"&&window.addEventListener!==void 0&&window.removeEventListener!==void 0}}/**
 * @license
 * Copyright 2023 Google LLC
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
 */let Fn=null;function Kr(){return Fn===null?Fn=function(){return 268435456+Math.round(2147483648*Math.random())}():Fn++,"0x"+Fn.toString(16)}/**
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
 */const kr="RestConnection",Mc={BatchGetDocuments:"batchGet",Commit:"commit",RunQuery:"runQuery",RunAggregationQuery:"runAggregationQuery",ExecutePipeline:"executePipeline"};class Uc{get Ot(){return!1}constructor(e){this.databaseInfo=e,this.databaseId=e.databaseId;const t=e.ssl?"https":"http",r=encodeURIComponent(this.databaseId.projectId),s=encodeURIComponent(this.databaseId.database);this.Mt=t+"://"+e.host,this.Nt=`projects/${r}/databases/${s}`,this.Lt=this.databaseId.database===tn?`project_id=${r}`:`project_id=${r}&database_id=${s}`}Bt(e,t,r,s,i){const a=Kr(),o=this.Ut(e,t.toUriEncodedString());w(kr,`Sending RPC '${e}' ${a}:`,o,r);const u={"google-cloud-resource-prefix":this.Nt,"x-goog-request-params":this.Lt};this.kt(u,s,i);const{host:c}=new URL(o),l=ts(c);return this.qt(e,o,u,r,l).then(d=>(w(kr,`Received RPC '${e}' ${a}: `,d),d),d=>{throw Ie(kr,`RPC '${e}' ${a} failed with error: `,d,"url: ",o,"request:",r),d})}$t(e,t,r,s,i,a){return this.Bt(e,t,r,s,i)}kt(e,t,r){e["X-Goog-Api-Client"]=function(){return"gl-js/ fire/"+xt}(),e["Content-Type"]="text/plain",this.databaseInfo.appId&&(e["X-Firebase-GMPID"]=this.databaseInfo.appId),t&&t.headers.forEach((s,i)=>e[i]=s),r&&r.headers.forEach((s,i)=>e[i]=s)}Ut(e,t){const r=Mc[e];let s=`${this.Mt}/v1/${t}:${r}`;return this.databaseInfo.apiKey&&(s=`${s}?key=${encodeURIComponent(this.databaseInfo.apiKey)}`),s}terminate(){}}/**
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
 */class Fc{constructor(e){this.Kt=e.Kt,this.Wt=e.Wt}Qt(e){this.Gt=e}zt(e){this.jt=e}Ht(e){this.Jt=e}onMessage(e){this.Yt=e}close(){this.Wt()}send(e){this.Kt(e)}Zt(){this.Gt()}Xt(){this.jt()}en(e){this.Jt(e)}tn(e){this.Yt(e)}}/**
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
 */const te="WebChannelConnection",$t=(n,e,t)=>{n.listen(e,r=>{try{t(r)}catch(s){setTimeout(()=>{throw s},0)}})};class It extends Uc{constructor(e){super(e),this.nn=[],this.forceLongPolling=e.forceLongPolling,this.autoDetectLongPolling=e.autoDetectLongPolling,this.useFetchStreams=e.useFetchStreams,this.longPollingOptions=e.longPollingOptions}static rn(){if(!It.sn){const e=tu();$t(e,nu.STAT_EVENT,t=>{t.stat===ti.PROXY?w(te,"STAT_EVENT: detected buffering proxy"):t.stat===ti.NOPROXY&&w(te,"STAT_EVENT: detected no buffering proxy")}),It.sn=!0}}qt(e,t,r,s,i){const a=Kr();return new Promise((o,u)=>{const c=new ru;c.setWithCredentials(!0),c.listenOnce(su.COMPLETE,()=>{try{switch(c.getLastErrorCode()){case Nr.NO_ERROR:const d=c.getResponseJson();w(te,`XHR for RPC '${e}' ${a} received:`,JSON.stringify(d)),o(d);break;case Nr.TIMEOUT:w(te,`RPC '${e}' ${a} timed out`),u(new y(m.DEADLINE_EXCEEDED,"Request time out"));break;case Nr.HTTP_ERROR:const f=c.getStatus();if(w(te,`RPC '${e}' ${a} failed with status:`,f,"response text:",c.getResponseText()),f>0){let g=c.getResponseJson();Array.isArray(g)&&(g=g[0]);const T=g?.error;if(T&&T.status&&T.message){const S=function(k){const q=k.toLowerCase().replace(/_/g,"-");return Object.values(m).indexOf(q)>=0?q:m.UNKNOWN}(T.status);u(new y(S,T.message))}else u(new y(m.UNKNOWN,"Server responded with status "+c.getStatus()))}else u(new y(m.UNAVAILABLE,"Connection failed."));break;default:A(9055,{_n:e,streamId:a,an:c.getLastErrorCode(),un:c.getLastError()})}}finally{w(te,`RPC '${e}' ${a} completed.`)}});const l=JSON.stringify(s);w(te,`RPC '${e}' ${a} sending request:`,s),c.send(t,"POST",l,r,15)})}cn(e,t,r){const s=Kr(),i=[this.Mt,"/","google.firestore.v1.Firestore","/",e,"/channel"],a=this.createWebChannelTransport(),o={httpSessionIdParam:"gsessionid",initMessageHeaders:{},messageUrlParams:{database:`projects/${this.databaseId.projectId}/databases/${this.databaseId.database}`},sendRawJson:!0,supportsCrossDomainXhr:!0,internalChannelParams:{forwardChannelRequestTimeoutMs:6e5},forceLongPolling:this.forceLongPolling,detectBufferingProxy:this.autoDetectLongPolling},u=this.longPollingOptions.timeoutSeconds;u!==void 0&&(o.longPollingTimeout=Math.round(1e3*u)),this.useFetchStreams&&(o.useFetchStreams=!0),this.kt(o.initMessageHeaders,t,r),o.encodeInitMessageHeaders=!0;const c=i.join("");w(te,`Creating RPC '${e}' stream ${s}: ${c}`,o);const l=a.createWebChannel(c,o);this.En(l);let d=!1,f=!1;const g=new Fc({Kt:T=>{f?w(te,`Not sending because RPC '${e}' stream ${s} is closed:`,T):(d||(w(te,`Opening RPC '${e}' stream ${s} transport.`),l.open(),d=!0),w(te,`RPC '${e}' stream ${s} sending:`,T),l.send(T))},Wt:()=>l.close()});return $t(l,Ln.EventType.OPEN,()=>{f||(w(te,`RPC '${e}' stream ${s} transport opened.`),g.Zt())}),$t(l,Ln.EventType.CLOSE,()=>{f||(f=!0,w(te,`RPC '${e}' stream ${s} transport closed`),g.en(),this.hn(l))}),$t(l,Ln.EventType.ERROR,T=>{f||(f=!0,Ie(te,`RPC '${e}' stream ${s} transport errored. Name:`,T.name,"Message:",T.message),g.en(new y(m.UNAVAILABLE,"The operation could not be completed")))}),$t(l,Ln.EventType.MESSAGE,T=>{if(!f){const S=T.data[0];I(!!S,16349);const C=S,k=C?.error||C[0]?.error;if(k){w(te,`RPC '${e}' stream ${s} received error:`,k);const q=k.status;let fe=function(Dn){const kn=B[Dn];if(kn!==void 0)return Da(kn)}(q),at=k.message;q==="NOT_FOUND"&&at.includes("database")&&at.includes("does not exist")&&at.includes(this.databaseId.database)&&Ie(`Database '${this.databaseId.database}' not found. Please check your project configuration.`),fe===void 0&&(fe=m.INTERNAL,at="Unknown error status: "+q+" with message "+k.message),f=!0,g.en(new y(fe,at)),l.close()}else w(te,`RPC '${e}' stream ${s} received:`,S),g.tn(S)}}),It.rn(),setTimeout(()=>{g.Xt()},0),g}terminate(){this.nn.forEach(e=>e.close()),this.nn=[]}En(e){this.nn.push(e)}hn(e){this.nn=this.nn.filter(t=>t===e)}kt(e,t,r){super.kt(e,t,r),this.databaseInfo.apiKey&&(e["x-goog-api-key"]=this.databaseInfo.apiKey)}createWebChannelTransport(){return iu()}}/**
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
 */function qc(n){return new It(n)}It.sn=!1;class fs{constructor(e,t,r=1e3,s=1.5,i=6e4){this.Tn=e,this.timerId=t,this.Pn=r,this.Rn=s,this.In=i,this.An=0,this.Vn=null,this.dn=Date.now(),this.reset()}reset(){this.An=0}fn(){this.An=this.In}mn(e){this.cancel();const t=Math.floor(this.An+this.pn()),r=Math.max(0,Date.now()-this.dn),s=Math.max(0,t-r);s>0&&w("ExponentialBackoff",`Backing off for ${s} ms (base delay: ${this.An} ms, delay with jitter: ${t} ms, last attempt: ${r} ms ago)`),this.Vn=this.Tn.enqueueAfterDelay(this.timerId,s,()=>(this.dn=Date.now(),e())),this.An*=this.Rn,this.An<this.Pn&&(this.An=this.Pn),this.An>this.In&&(this.An=this.In)}gn(){this.Vn!==null&&(this.Vn.skipDelay(),this.Vn=null)}cancel(){this.Vn!==null&&(this.Vn.cancel(),this.Vn=null)}pn(){return(Math.random()-.5)*this.An}}/**
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
 */const Ci="PersistentStream";class Ya{constructor(e,t,r,s,i,a,o,u){this.Tn=e,this.yn=r,this.wn=s,this.connection=i,this.authCredentialsProvider=a,this.appCheckCredentialsProvider=o,this.listener=u,this.state=0,this.bn=0,this.vn=null,this.Sn=null,this.stream=null,this.Dn=0,this.xn=new fs(e,t)}Cn(){return this.state===1||this.state===5||this.Fn()}Fn(){return this.state===2||this.state===3}start(){this.Dn=0,this.state!==4?this.auth():this.On()}async stop(){this.Cn()&&await this.close(0)}Mn(){this.state=0,this.xn.reset()}Nn(){this.Fn()&&this.vn===null&&(this.vn=this.Tn.enqueueAfterDelay(this.yn,6e4,()=>this.Ln()))}Bn(e){this.Un(),this.stream.send(e)}async Ln(){if(this.Fn())return this.close(0)}Un(){this.vn&&(this.vn.cancel(),this.vn=null)}kn(){this.Sn&&(this.Sn.cancel(),this.Sn=null)}async close(e,t){this.Un(),this.kn(),this.xn.cancel(),this.bn++,e!==4?this.xn.reset():t&&t.code===m.RESOURCE_EXHAUSTED?(Me(t.toString()),Me("Using maximum backoff delay to prevent overloading the backend."),this.xn.fn()):t&&t.code===m.UNAUTHENTICATED&&this.state!==3&&(this.authCredentialsProvider.invalidateToken(),this.appCheckCredentialsProvider.invalidateToken()),this.stream!==null&&(this.qn(),this.stream.close(),this.stream=null),this.state=e,await this.listener.Ht(t)}qn(){}auth(){this.state=1;const e=this.$n(this.bn),t=this.bn;Promise.all([this.authCredentialsProvider.getToken(),this.appCheckCredentialsProvider.getToken()]).then(([r,s])=>{this.bn===t&&this.Kn(r,s)},r=>{e(()=>{const s=new y(m.UNKNOWN,"Fetching auth token failed: "+r.message);return this.Wn(s)})})}Kn(e,t){const r=this.$n(this.bn);this.stream=this.Qn(e,t),this.stream.Qt(()=>{r(()=>this.listener.Qt())}),this.stream.zt(()=>{r(()=>(this.state=2,this.Sn=this.Tn.enqueueAfterDelay(this.wn,1e4,()=>(this.Fn()&&(this.state=3),Promise.resolve())),this.listener.zt()))}),this.stream.Ht(s=>{r(()=>this.Wn(s))}),this.stream.onMessage(s=>{r(()=>++this.Dn==1?this.Gn(s):this.onNext(s))})}On(){this.state=5,this.xn.mn(async()=>{this.state=0,this.start()})}Wn(e){return w(Ci,`close with error: ${e}`),this.stream=null,this.close(4,e)}$n(e){return t=>{this.Tn.enqueueAndForget(()=>this.bn===e?t():(w(Ci,"stream callback skipped by getCloseGuardedDispatcher."),Promise.resolve()))}}}class Bc extends Ya{constructor(e,t,r,s,i,a){super(e,"listen_stream_connection_backoff","listen_stream_idle","health_check_timeout",t,r,s,a),this.serializer=i}Qn(e,t){return this.connection.cn("Listen",e,t)}Gn(e){return this.onNext(e)}onNext(e){this.xn.reset();const t=vc(this.serializer,e),r=function(i){if(!("targetChange"in i))return R.min();const a=i.targetChange;return a.targetIds&&a.targetIds.length?R.min():a.readTime?ye(a.readTime):R.min()}(e);return this.listener.zn(t,r)}jn(e){const t={};t.database=jr(this.serializer),t.addTarget=function(i,a){let o;const u=a.target;if(o=ot(u)?{pipelineQuery:xc(i,u)}:xa(u)?{documents:Rc(i,u)}:{query:Pc(i,u).yt},o.targetId=a.targetId,a.resumeToken.approximateByteSize()>0){o.resumeToken=Fa(i,a.resumeToken);const c=Qr(i,a.expectedCount);c!==null&&(o.expectedCount=c)}else if(a.snapshotVersion.compareTo(R.min())>0){o.readTime=er(i,a.snapshotVersion.toTimestamp());const c=Qr(i,a.expectedCount);c!==null&&(o.expectedCount=c)}return o}(this.serializer,e);const r=Sc(this.serializer,e);r&&(t.labels=r),this.Bn(t)}Hn(e){const t={};t.database=jr(this.serializer),t.removeTarget=e,this.Bn(t)}}class $c extends Ya{constructor(e,t,r,s,i,a){super(e,"write_stream_connection_backoff","write_stream_idle","health_check_timeout",t,r,s,a),this.serializer=i}get Jn(){return this.Dn>0}start(){this.lastStreamToken=void 0,super.start()}qn(){this.Jn&&this.Yn([])}Qn(e,t){return this.connection.cn("Write",e,t)}Gn(e){return I(!!e.streamToken,31322),this.lastStreamToken=e.streamToken,I(!e.writeResults||e.writeResults.length===0,55816),this.listener.Zn()}onNext(e){I(!!e.streamToken,12678),this.lastStreamToken=e.streamToken,this.xn.reset();const t=Vc(e.writeResults,e.commitTime),r=ye(e.commitTime);return this.listener.Xn(r,t)}er(){const e={};e.database=jr(this.serializer),this.Bn(e)}Yn(e){const t={streamToken:this.lastStreamToken,writes:e.map(r=>za(this.serializer,r))};this.Bn(t)}}/**
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
 */class zc{}class Qc extends zc{constructor(e,t,r,s){super(),this.authCredentials=e,this.appCheckCredentials=t,this.connection=r,this.serializer=s,this.tr=!1}nr(){if(this.tr)throw new y(m.FAILED_PRECONDITION,"The client has already been terminated.")}Bt(e,t,r,s){return this.nr(),Promise.all([this.authCredentials.getToken(),this.appCheckCredentials.getToken()]).then(([i,a])=>this.connection.Bt(e,Gr(t,r),s,i,a)).catch(i=>{throw i.name==="FirebaseError"?(i.code===m.UNAUTHENTICATED&&(this.authCredentials.invalidateToken(),this.appCheckCredentials.invalidateToken()),i):new y(m.UNKNOWN,i.toString())})}$t(e,t,r,s,i){return this.nr(),Promise.all([this.authCredentials.getToken(),this.appCheckCredentials.getToken()]).then(([a,o])=>this.connection.$t(e,Gr(t,r),s,a,o,i)).catch(a=>{throw a.name==="FirebaseError"?(a.code===m.UNAUTHENTICATED&&(this.authCredentials.invalidateToken(),this.appCheckCredentials.invalidateToken()),a):new y(m.UNKNOWN,a.toString())})}terminate(){this.tr=!0,this.connection.terminate()}}function Gc(n,e,t,r){return new Qc(n,e,t,r)}/**
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
 */const jc="ComponentProvider",Si=new Map;function Kc(n,e,t,r,s){return new Mu(n,e,t,s.host,s.ssl,s.experimentalForceLongPolling,s.experimentalAutoDetectLongPolling,Ha(s.experimentalLongPollingOptions),s.useFetchStreams,s.isUsingEmulator,r)}/**
 * @license
 * Copyright 2018 Google LLC
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
 */const xi={didRun:!1,sequenceNumbersCollected:0,targetsRemoved:0,documentsRemoved:0},Ja=41943040;class ae{static withCacheSize(e){return new ae(e,ae.DEFAULT_COLLECTION_PERCENTILE,ae.DEFAULT_MAX_SEQUENCE_NUMBERS_TO_COLLECT)}constructor(e,t,r){this.cacheSizeCollectionThreshold=e,this.percentileToCollect=t,this.maximumSequenceNumbersToCollect=r}}ae.DEFAULT_COLLECTION_PERCENTILE=10,ae.DEFAULT_MAX_SEQUENCE_NUMBERS_TO_COLLECT=1e3,ae.DEFAULT=new ae(Ja,ae.DEFAULT_COLLECTION_PERCENTILE,ae.DEFAULT_MAX_SEQUENCE_NUMBERS_TO_COLLECT),ae.DISABLED=new ae(-1,0,0);/**
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
 */const bi="LruGarbageCollector",Xa=1048576;function Ni([n,e],[t,r]){const s=b(n,t);return s===0?b(e,r):s}class Wc{constructor(e){this.rr=e,this.buffer=new G(Ni),this.ir=0}sr(){return++this.ir}_r(e){const t=[e,this.sr()];if(this.buffer.size<this.rr)this.buffer=this.buffer.add(t);else{const r=this.buffer.last();Ni(t,r)<0&&(this.buffer=this.buffer.delete(r).add(t))}}get maxValue(){return this.buffer.last()[0]}}class Hc{constructor(e,t,r){this.garbageCollector=e,this.asyncQueue=t,this.localStore=r,this.ar=null}start(){this.garbageCollector.params.cacheSizeCollectionThreshold!==-1&&this.ur(6e4)}stop(){this.ar&&(this.ar.cancel(),this.ar=null)}get started(){return this.ar!==null}ur(e){w(bi,`Garbage collection scheduled in ${e}ms`),this.ar=this.asyncQueue.enqueueAfterDelay("lru_garbage_collection",e,async()=>{this.ar=null;try{await this.localStore.collectGarbage(this.garbageCollector)}catch(t){Nt(t)?w(bi,"Ignoring IndexedDB error during garbage collection: ",t):await bt(t)}await this.ur(3e5)})}}class Yc{constructor(e,t){this.cr=e,this.params=t}calculateTargetCount(e,t){return this.cr.lr(e).next(r=>Math.floor(t/100*r))}nthSequenceNumber(e,t){if(t===0)return p.resolve(lr.ce);const r=new Wc(t);return this.cr.forEachTarget(e,s=>r._r(s.sequenceNumber)).next(()=>this.cr.Er(e,s=>r._r(s))).next(()=>r.maxValue)}removeTargets(e,t,r){return this.cr.removeTargets(e,t,r)}removeOrphanedDocuments(e,t){return this.cr.removeOrphanedDocuments(e,t)}collect(e,t){return this.params.cacheSizeCollectionThreshold===-1?(w("LruGarbageCollector","Garbage collection skipped; disabled"),p.resolve(xi)):this.getCacheSize(e).next(r=>r<this.params.cacheSizeCollectionThreshold?(w("LruGarbageCollector",`Garbage collection skipped; Cache size ${r} is lower than threshold ${this.params.cacheSizeCollectionThreshold}`),xi):this.hr(e,t))}getCacheSize(e){return this.cr.getCacheSize(e)}hr(e,t){let r,s,i,a,o,u,c;const l=Date.now();return this.calculateTargetCount(e,this.params.percentileToCollect).next(d=>(d>this.params.maximumSequenceNumbersToCollect?(w("LruGarbageCollector",`Capping sequence numbers to collect down to the maximum of ${this.params.maximumSequenceNumbersToCollect} from ${d}`),s=this.params.maximumSequenceNumbersToCollect):s=d,a=Date.now(),this.nthSequenceNumber(e,s))).next(d=>(r=d,o=Date.now(),this.removeTargets(e,r,t))).next(d=>(i=d,u=Date.now(),this.removeOrphanedDocuments(e,r))).next(d=>(c=Date.now(),gt()<=De.DEBUG&&w("LruGarbageCollector",`LRU Garbage Collection
	Counted targets in ${a-l}ms
	Determined least recently used ${s} in `+(o-a)+`ms
	Removed ${i} targets in `+(u-o)+`ms
	Removed ${d} documents in `+(c-u)+`ms
Total Duration: ${c-l}ms`),p.resolve({didRun:!0,sequenceNumbersCollected:s,targetsRemoved:i,documentsRemoved:d})))}}function Jc(n,e){return new Yc(n,e)}/**
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
 */const Za="firestore.googleapis.com",Di=!0;class ki{constructor(e){if(e.host===void 0){if(e.ssl!==void 0)throw new y(m.INVALID_ARGUMENT,"Can't provide ssl option if host option is not set");this.host=Za,this.ssl=Di}else this.host=e.host,this.ssl=e.ssl??Di;if(this.isUsingEmulator=e.emulatorOptions!==void 0,this.credentials=e.credentials,this.ignoreUndefinedProperties=!!e.ignoreUndefinedProperties,this.localCache=e.localCache,e.cacheSizeBytes===void 0)this.cacheSizeBytes=Ja;else{if(e.cacheSizeBytes!==-1&&e.cacheSizeBytes<Xa)throw new y(m.INVALID_ARGUMENT,"cacheSizeBytes must be at least 1048576");this.cacheSizeBytes=e.cacheSizeBytes}Au("experimentalForceLongPolling",e.experimentalForceLongPolling,"experimentalAutoDetectLongPolling",e.experimentalAutoDetectLongPolling),this.experimentalForceLongPolling=!!e.experimentalForceLongPolling,this.experimentalForceLongPolling?this.experimentalAutoDetectLongPolling=!1:e.experimentalAutoDetectLongPolling===void 0?this.experimentalAutoDetectLongPolling=!0:this.experimentalAutoDetectLongPolling=!!e.experimentalAutoDetectLongPolling,this.experimentalLongPollingOptions=Ha(e.experimentalLongPollingOptions??{}),function(r){if(r.timeoutSeconds!==void 0){if(isNaN(r.timeoutSeconds))throw new y(m.INVALID_ARGUMENT,`invalid long polling timeout: ${r.timeoutSeconds} (must not be NaN)`);if(r.timeoutSeconds<5)throw new y(m.INVALID_ARGUMENT,`invalid long polling timeout: ${r.timeoutSeconds} (minimum allowed value is 5)`);if(r.timeoutSeconds>30)throw new y(m.INVALID_ARGUMENT,`invalid long polling timeout: ${r.timeoutSeconds} (maximum allowed value is 30)`)}}(this.experimentalLongPollingOptions),this.useFetchStreams=!!e.useFetchStreams}isEqual(e){return this.host===e.host&&this.ssl===e.ssl&&this.credentials===e.credentials&&this.cacheSizeBytes===e.cacheSizeBytes&&this.experimentalForceLongPolling===e.experimentalForceLongPolling&&this.experimentalAutoDetectLongPolling===e.experimentalAutoDetectLongPolling&&function(r,s){return r.timeoutSeconds===s.timeoutSeconds}(this.experimentalLongPollingOptions,e.experimentalLongPollingOptions)&&this.ignoreUndefinedProperties===e.ignoreUndefinedProperties&&this.useFetchStreams===e.useFetchStreams}}class yr{constructor(e,t,r,s){this._authCredentials=e,this._appCheckCredentials=t,this._databaseId=r,this._app=s,this.type="firestore-lite",this._persistenceKey="(lite)",this._settings=new ki({}),this._settingsFrozen=!1,this._emulatorOptions={},this._terminateTask="notTerminated"}get app(){if(!this._app)throw new y(m.FAILED_PRECONDITION,"Firestore was not initialized using the Firebase SDK. 'app' is not available");return this._app}get _initialized(){return this._settingsFrozen}get _terminated(){return this._terminateTask!=="notTerminated"}_setSettings(e){if(this._settingsFrozen)throw new y(m.FAILED_PRECONDITION,"Firestore has already been started and its settings can no longer be changed. You can only modify settings before calling any other methods on a Firestore object.");this._settings=new ki(e),this._emulatorOptions=e.emulatorOptions||{},e.credentials!==void 0&&(this._authCredentials=function(r){if(!r)return new fu;switch(r.type){case"firstParty":return new gu(r.sessionIndex||"0",r.iamToken||null,r.authTokenFactory||null);case"provider":return r.client;default:throw new y(m.INVALID_ARGUMENT,"makeAuthCredentialsProvider failed due to invalid credential type")}}(e.credentials))}_getSettings(){return this._settings}_getEmulatorOptions(){return this._emulatorOptions}_freezeSettings(){return this._settingsFrozen=!0,this._settings}_delete(){return this._terminateTask==="notTerminated"&&(this._terminateTask=this._terminate()),this._terminateTask}async _restart(){this._terminateTask==="notTerminated"?await this._terminate():this._terminateTask="notTerminated"}toJSON(){return{app:this._app,databaseId:this._databaseId,settings:this._settings}}_terminate(){return function(t){const r=Si.get(t);r&&(w(jc,"Removing Datastore"),Si.delete(t),r.terminate())}(this),Promise.resolve()}}function Xc(n,e,t,r={}){n=F(n,yr);const s=ts(e),i=n._getSettings(),a={...i,emulatorOptions:n._getEmulatorOptions()},o=`${e}:${t}`;s&&ea(`https://${o}`),i.host!==Za&&i.host!==o&&Ie("Host has been set in both settings() and connectFirestoreEmulator(), emulator host will be used.");const u={...i,host:o,ssl:s,emulatorOptions:r};if(!es(u,a)&&(n._setSettings(u),r.mockUserToken)){let c,l;if(typeof r.mockUserToken=="string")c=r.mockUserToken,l=ne.MOCK_USER;else{c=eu(r.mockUserToken,n._app?.options.projectId);const d=r.mockUserToken.sub||r.mockUserToken.user_id;if(!d)throw new y(m.INVALID_ARGUMENT,"mockUserToken must contain 'sub' or 'user_id' field!");l=new ne(d)}n._authCredentials=new mu(new na(c,l))}}/**
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
 */class Ne{constructor(e,t,r){this.converter=t,this._query=r,this.type="query",this.firestore=e}withConverter(e){return new Ne(this.firestore,e,this._query)}}class O{constructor(e,t,r){this.converter=t,this._key=r,this.type="document",this.firestore=e}get _path(){return this._key.path}get id(){return this._key.path.lastSegment()}get path(){return this._key.path.canonicalString()}get parent(){return new ze(this.firestore,this.converter,this._key.path.popLast())}withConverter(e){return new O(this.firestore,e,this._key)}toJSON(){return{type:O._jsonSchemaVersion,referencePath:this._key.toString()}}static fromJSON(e,t,r){if(yn(t,O._jsonSchema))return new O(e,r||null,new v(D.fromString(t.referencePath)))}}O._jsonSchemaVersion="firestore/documentReference/1.0",O._jsonSchema={type:Q("string",O._jsonSchemaVersion),referencePath:Q("string")};class ze extends Ne{constructor(e,t,r){super(e,t,_r(r)),this._path=r,this.type="collection"}get id(){return this._query.path.lastSegment()}get path(){return this._query.path.canonicalString()}get parent(){const e=this._path.popLast();return e.isEmpty()?null:new O(this.firestore,null,new v(e))}withConverter(e){return new ze(this.firestore,e,this._path)}}function _f(n,e,...t){if(n=Ee(n),ra("collection","path",e),n instanceof yr){const r=D.fromString(e,...t);return ii(r),new ze(n,null,r)}{if(!(n instanceof O||n instanceof ze))throw new y(m.INVALID_ARGUMENT,"Expected first argument to collection() to be a CollectionReference, a DocumentReference or FirebaseFirestore");const r=n._path.child(D.fromString(e,...t));return ii(r),new ze(n.firestore,null,r)}}function Zc(n,e,...t){if(n=Ee(n),arguments.length===1&&(e=ss.newId()),ra("doc","path",e),n instanceof yr){const r=D.fromString(e,...t);return si(r),new O(n,null,new v(r))}{if(!(n instanceof O||n instanceof ze))throw new y(m.INVALID_ARGUMENT,"Expected first argument to doc() to be a CollectionReference, a DocumentReference or FirebaseFirestore");const r=n._path.child(D.fromString(e,...t));return si(r),new O(n.firestore,n instanceof ze?n.converter:null,new v(r))}}/**
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
 *//**
 * @license
 * Copyright 2024 Google LLC
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
 */class ue{constructor(e){this._values=(e||[]).map(t=>t)}toArray(){return this._values.map(e=>e)}isEqual(e){return function(r,s){if(r.length!==s.length)return!1;for(let i=0;i<r.length;++i)if(r[i]!==s[i])return!1;return!0}(this._values,e._values)}toJSON(){return{type:ue._jsonSchemaVersion,vectorValues:this._values}}static fromJSON(e){if(yn(e,ue._jsonSchema)){if(Array.isArray(e.vectorValues)&&e.vectorValues.every(t=>typeof t=="number"))return new ue(e.vectorValues);throw new y(m.INVALID_ARGUMENT,"Expected 'vectorValues' field to be a number array")}}}ue._jsonSchemaVersion="firestore/vectorValue/1.0",ue._jsonSchema={type:Q("string",ue._jsonSchemaVersion),vectorValues:Q("object")};/**
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
 */const el=/^__.*__$/;class tl{constructor(e,t,r){this.data=e,this.fieldMask=t,this.fieldTransforms=r}toMutation(e,t){return this.fieldMask!==null?new it(e,this.data,this.fieldMask,t,this.fieldTransforms):new wn(e,this.data,t,this.fieldTransforms)}}class eo{constructor(e,t,r){this.data=e,this.fieldMask=t,this.fieldTransforms=r}toMutation(e,t){return new it(e,this.data,this.fieldMask,t,this.fieldTransforms)}}function to(n){switch(n){case 0:case 2:case 1:return!0;case 3:case 4:return!1;default:throw A(40011,{dataSource:n})}}class Er{constructor(e,t,r,s,i,a){this.settings=e,this.databaseId=t,this.serializer=r,this.ignoreUndefinedProperties=s,i===void 0&&this.validatePath(),this.fieldTransforms=i||[],this.fieldMask=a||[]}get path(){return this.settings.path}get dataSource(){return this.settings.dataSource}contextWith(e){return new Er({...this.settings,...e},this.databaseId,this.serializer,this.ignoreUndefinedProperties,this.fieldTransforms,this.fieldMask)}childContextForField(e){const t=this.path?.child(e),r=this.contextWith({path:t,arrayElement:!1});return r.validatePathSegment(e),r}childContextForFieldPath(e){const t=this.path?.child(e),r=this.contextWith({path:t,arrayElement:!1});return r.validatePath(),r}childContextForArray(e){return this.contextWith({path:void 0,arrayElement:!0})}createError(e){return tr(e,this.settings.methodName,this.settings.hasConverter||!1,this.path,this.settings.targetDoc)}contains(e){return this.fieldMask.find(t=>e.isPrefixOf(t))!==void 0||this.fieldTransforms.find(t=>e.isPrefixOf(t.field))!==void 0}validatePath(){if(this.path)for(let e=0;e<this.path.length;e++)this.validatePathSegment(this.path.get(e))}validatePathSegment(e){if(e.length===0)throw this.createError("Document fields must not be empty");if(to(this.dataSource)&&el.test(e))throw this.createError('Document fields cannot begin and end with "__"')}}class nl{constructor(e,t,r){this.databaseId=e,this.ignoreUndefinedProperties=t,this.serializer=r||gr(e)}createContext(e,t,r,s=!1){return new Er({dataSource:e,methodName:t,targetDoc:r,path:W.emptyPath(),arrayElement:!1,hasConverter:s},this.databaseId,this.serializer,this.ignoreUndefinedProperties)}}function Lt(n){const e=n._freezeSettings(),t=gr(n._databaseId);return new nl(n._databaseId,!!e.ignoreUndefinedProperties,t)}function Tr(n,e,t,r,s,i={}){const a=n.createContext(i.merge||i.mergeFields?2:0,e,t,s);ys("Data must be an object, but it was:",a,r);const o=no(r,a);let u,c;if(i.merge)u=new pe(a.fieldMask),c=a.fieldTransforms;else if(i.mergeFields){const l=[];for(const d of i.mergeFields){const f=Xe(e,d,t);if(!a.contains(f))throw new y(m.INVALID_ARGUMENT,`Field '${f}' is specified in your field mask but missing from your input data.`);io(l,f)||l.push(f)}u=new pe(l),c=a.fieldTransforms.filter(d=>u.covers(d.field))}else u=null,c=a.fieldTransforms;return new tl(new re(o),u,c)}class Rn extends Vn{_toFieldTransform(e){if(e.dataSource!==2)throw e.dataSource===1?e.createError(`${this._methodName}() can only appear at the top level of your update data`):e.createError(`${this._methodName}() cannot be used with set() unless you pass {merge:true}`);return e.fieldMask.push(e.path),null}isEqual(e){return e instanceof Rn}}function rl(n,e,t){return new Er({dataSource:3,targetDoc:e.settings.targetDoc,methodName:n._methodName,arrayElement:t},e.databaseId,e.serializer,e.ignoreUndefinedProperties)}class ms extends Vn{_toFieldTransform(e){return new ya(e.path,new an)}isEqual(e){return e instanceof ms}}class _s extends Vn{constructor(e,t){super(e),this.Tr=t}_toFieldTransform(e){const t=rl(this,e,!0),r=this.Tr.map(i=>Ue(i,t)),s=new Ct(r);return new ya(e.path,s)}isEqual(e){return e instanceof _s&&es(this.Tr,e.Tr)}}function ps(n,e,t,r){const s=n.createContext(1,e,t);ys("Data must be an object, but it was:",s,r);const i=[],a=re.empty();st(r,(u,c)=>{const l=so(e,u,t);c=Ee(c);const d=s.childContextForFieldPath(l);if(c instanceof Rn)i.push(l);else{const f=Ue(c,d);f!=null&&(i.push(l),a.set(l,f))}});const o=new pe(i);return new eo(a,o,s.fieldTransforms)}function gs(n,e,t,r,s,i){const a=n.createContext(1,e,t),o=[Xe(e,r,t)],u=[s];if(i.length%2!=0)throw new y(m.INVALID_ARGUMENT,`Function ${e}() needs to be called with an even number of arguments that alternate between field names and values.`);for(let f=0;f<i.length;f+=2)o.push(Xe(e,i[f])),u.push(i[f+1]);const c=[],l=re.empty();for(let f=o.length-1;f>=0;--f)if(!io(c,o[f])){const g=o[f];let T=u[f];T=Ee(T);const S=a.childContextForFieldPath(g);if(T instanceof Rn)c.push(g);else{const C=Ue(T,S);C!=null&&(c.push(g),l.set(g,C))}}const d=new pe(c);return new eo(l,d,a.fieldTransforms)}function sl(n,e,t,r=!1){return Ue(t,n.createContext(r?4:3,e))}function Ue(n,e,t){if(ro(n=Ee(n)))return ys("Unsupported field value:",e,n),no(n,e);if(n instanceof Vn)return function(s,i){if(!to(i.dataSource))throw i.createError(`${s._methodName}() can only be used with update() and set()`);if(!i.path)throw i.createError(`${s._methodName}() is not currently supported inside arrays`);const a=s._toFieldTransform(i);a&&i.fieldTransforms.push(a)}(n,e),null;if(n===void 0&&e.ignoreUndefinedProperties)return null;if(e.path&&e.fieldMask.push(e.path),n instanceof Array){if(e.settings.arrayElement&&e.dataSource!==4)throw e.createError("Nested arrays are not supported");return function(s,i){const a=[];let o=0;for(const u of s){let c=Ue(u,i.childContextForArray(o));c==null&&(c={nullValue:"NULL_VALUE"}),a.push(c),o++}return{arrayValue:{values:a}}}(n,e)}return function(s,i,a){if((s=Ee(s))===null)return{nullValue:"NULL_VALUE"};if(typeof s=="number")return os(i.serializer,s,a);if(typeof s=="boolean")return{booleanValue:s};if(typeof s=="string")return{stringValue:s};if(s instanceof Date){const o=L.fromDate(s);return{timestampValue:er(i.serializer,o)}}if(s instanceof L){const o=new L(s.seconds,1e3*Math.floor(s.nanoseconds/1e3));return{timestampValue:er(i.serializer,o)}}if(s instanceof Se)return{geoPointValue:{latitude:s.latitude,longitude:s.longitude}};if(s instanceof _e)return{bytesValue:Fa(i.serializer,s._byteString)};if(s instanceof O){const o=i.databaseId,u=s.firestore._databaseId;if(!u.isEqual(o))throw i.createError(`Document reference is for database ${u.projectId}/${u.database} but should be for database ${o.projectId}/${o.database}`);return{referenceValue:ds(s.firestore._databaseId||i.databaseId,s._key.path)}}if(s instanceof ue)return function(u,c){const l=u instanceof ue?u.toArray():u;return{mapValue:{fields:{[ha]:{stringValue:da},[rn]:{arrayValue:{values:l.map(f=>{if(typeof f!="number")throw c.createError("VectorValues must only contain numeric values.");return dr(c.serializer,f)})}}}}}}(s,i);if(Ka(s))return s._toProto(i.serializer);throw i.createError(`Unsupported field value: ${cr(s)}`)}(n,e,t)}function no(n,e){const t={};return ia(n)?e.path&&e.path.length>0&&e.fieldMask.push(e.path):st(n,(r,s)=>{const i=Ue(s,e.childContextForField(r));i!=null&&(t[r]=i)}),{mapValue:{fields:t}}}function ro(n){return!(typeof n!="object"||n===null||n instanceof Array||n instanceof Date||n instanceof L||n instanceof Se||n instanceof _e||n instanceof O||n instanceof Vn||n instanceof ue||Ka(n))}function ys(n,e,t){if(!ro(t)||!gn(t)){const r=cr(t);throw r==="an object"?e.createError(n+" a custom object"):e.createError(n+" "+r)}}function Xe(n,e,t){if((e=Ee(e))instanceof kt)return e._internalPath;if(typeof e=="string")return so(n,e);throw tr("Field path arguments must be of type string or ",n,!1,void 0,t)}const il=new RegExp("[~\\*/\\[\\]]");function so(n,e,t){if(e.search(il)>=0)throw tr(`Invalid field path (${e}). Paths must not contain '~', '*', '/', '[', or ']'`,n,!1,void 0,t);try{return new kt(...e.split("."))._internalPath}catch{throw tr(`Invalid field path (${e}). Paths must not be empty, begin with '.', end with '.', or contain '..'`,n,!1,void 0,t)}}function tr(n,e,t,r,s){const i=r&&!r.isEmpty(),a=s!==void 0;let o=`Function ${e}() called with invalid data`;t&&(o+=" (via `toFirestore()`)"),o+=". ";let u="";return(i||a)&&(u+=" (found",i&&(u+=` in field ${r}`),a&&(u+=` in document ${s}`),u+=")"),new y(m.INVALID_ARGUMENT,o+n+u)}function io(n,e){return n.some(t=>t.isEqual(e))}function ao(n){return typeof n._readUserData=="function"}/**
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
 */class se{constructor(e){this.optionDefinitions=e}_getKnownOptions(e,t){const r=re.empty();for(const s in this.optionDefinitions)if(this.optionDefinitions.hasOwnProperty(s)){const i=this.optionDefinitions[s];if(s in e){const a=e[s];let o;i.nestedOptions&&gn(a)?o={mapValue:{fields:new se(i.nestedOptions).getOptionsProto(t,a)}}:a&&(o=Ue(a,t)??void 0),o&&r.set(W.fromServerFormat(i.serverName),o)}}return r}getOptionsProto(e,t,r){const s=this._getKnownOptions(t,e);if(r){const i=new Map(Lu(r,(a,o)=>[W.fromServerFormat(o),a!==void 0?Ue(a,e):null]));s.setAll(i)}return s.value.mapValue.fields??{}}}/**
 * @license
 * Copyright 2024 Google LLC
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
 */function al(n){return typeof n=="object"&&n!==null&&!!("nullValue"in n&&(n.nullValue===null||n.nullValue==="NULL_VALUE")||"booleanValue"in n&&(n.booleanValue===null||typeof n.booleanValue=="boolean")||"integerValue"in n&&(n.integerValue===null||typeof n.integerValue=="number"||typeof n.integerValue=="string")||"doubleValue"in n&&(n.doubleValue===null||typeof n.doubleValue=="number")||"timestampValue"in n&&(n.timestampValue===null||function(t){return typeof t=="object"&&t!==null&&"seconds"in t&&(t.seconds===null||typeof t.seconds=="number"||typeof t.seconds=="string")&&"nanos"in t&&(t.nanos===null||typeof t.nanos=="number")}(n.timestampValue))||"stringValue"in n&&(n.stringValue===null||typeof n.stringValue=="string")||"bytesValue"in n&&(n.bytesValue===null||n.bytesValue instanceof Uint8Array)||"referenceValue"in n&&(n.referenceValue===null||typeof n.referenceValue=="string")||"geoPointValue"in n&&(n.geoPointValue===null||function(t){return typeof t=="object"&&t!==null&&"latitude"in t&&(t.latitude===null||typeof t.latitude=="number")&&"longitude"in t&&(t.longitude===null||typeof t.longitude=="number")}(n.geoPointValue))||"arrayValue"in n&&(n.arrayValue===null||function(t){return typeof t=="object"&&t!==null&&!(!("values"in t)||t.values!==null&&!Array.isArray(t.values))}(n.arrayValue))||"mapValue"in n&&(n.mapValue===null||function(t){return typeof t=="object"&&t!==null&&!(!("fields"in t)||t.fields!==null&&!gn(t.fields))}(n.mapValue))||"fieldReferenceValue"in n&&(n.fieldReferenceValue===null||typeof n.fieldReferenceValue=="string")||"functionValue"in n&&(n.functionValue===null||function(t){return typeof t=="object"&&t!==null&&!(!("name"in t)||t.name!==null&&typeof t.name!="string"||!("args"in t)||t.args!==null&&!Array.isArray(t.args))}(n.functionValue))||"pipelineValue"in n&&(n.pipelineValue===null||function(t){return typeof t=="object"&&t!==null&&!(!("stages"in t)||t.stages!==null&&!Array.isArray(t.stages))}(n.pipelineValue)))}/**
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
 */function pf(){return new Rn("deleteField")}function gf(){return new ms("serverTimestamp")}function yf(...n){return new _s("arrayUnion",n)}function ol(n){return new ue(n)}/**
 * @license
 * Copyright 2024 Google LLC
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
 */function E(n){let e;return n instanceof _t?n:(e=gn(n)?dl(n):n instanceof Array?fl(n):oo(n,void 0),e)}function Lr(n){if(n instanceof _t)return n;if(n instanceof ue)return dn(n);if(Array.isArray(n))return dn(ol(n));throw new Error("Unsupported value: "+typeof n)}function Es(n){return Nu(n)?Gn(n):E(n)}class _t{constructor(){this._protoValueType="ProtoValue"}add(e){return new _("add",[this,E(e)],"add")}asBoolean(){if(this instanceof Ze)return this;if(this instanceof Mt)return new co(this);if(this instanceof Ot)return new hl(this);if(this instanceof _)return new uo(this);throw new y("invalid-argument",`Conversion of type ${typeof this} to BooleanExpression not supported.`)}subtract(e){return new _("subtract",[this,E(e)],"subtract")}multiply(e){return new _("multiply",[this,E(e)],"multiply")}divide(e){return new _("divide",[this,E(e)],"divide")}mod(e){return new _("mod",[this,E(e)],"mod")}equal(e){return new _("equal",[this,E(e)],"equal").asBoolean()}notEqual(e){return new _("not_equal",[this,E(e)],"notEqual").asBoolean()}lessThan(e){return new _("less_than",[this,E(e)],"lessThan").asBoolean()}lessThanOrEqual(e){return new _("less_than_or_equal",[this,E(e)],"lessThanOrEqual").asBoolean()}greaterThan(e){return new _("greater_than",[this,E(e)],"greaterThan").asBoolean()}greaterThanOrEqual(e){return new _("greater_than_or_equal",[this,E(e)],"greaterThanOrEqual").asBoolean()}arrayConcat(e,...t){const r=[e,...t].map(s=>E(s));return new _("array_concat",[this,...r],"arrayConcat")}arrayContains(e){return new _("array_contains",[this,E(e)],"arrayContains").asBoolean()}arrayContainsAll(e){const t=Array.isArray(e)?new Qt(e.map(E),"arrayContainsAll"):e;return new _("array_contains_all",[this,t],"arrayContainsAll").asBoolean()}arrayContainsAny(e){const t=Array.isArray(e)?new Qt(e.map(E),"arrayContainsAny"):e;return new _("array_contains_any",[this,t],"arrayContainsAny").asBoolean()}arrayReverse(){return new _("array_reverse",[this])}arrayLength(){return new _("array_length",[this],"arrayLength")}equalAny(e){const t=Array.isArray(e)?new Qt(e.map(E),"equalAny"):e;return new _("equal_any",[this,t],"equalAny").asBoolean()}notEqualAny(e){const t=Array.isArray(e)?new Qt(e.map(E),"notEqualAny"):e;return new _("not_equal_any",[this,t],"notEqualAny").asBoolean()}exists(){return new _("exists",[this],"exists").asBoolean()}charLength(){return new _("char_length",[this],"charLength")}like(e){return new _("like",[this,E(e)],"like").asBoolean()}regexContains(e){return new _("regex_contains",[this,E(e)],"regexContains").asBoolean()}regexFind(e){return new _("regex_find",[this,E(e)],"regexFind")}regexFindAll(e){return new _("regex_find_all",[this,E(e)],"regexFindAll")}regexMatch(e){return new _("regex_match",[this,E(e)],"regexMatch").asBoolean()}stringContains(e){return new _("string_contains",[this,E(e)],"stringContains").asBoolean()}startsWith(e){return new _("starts_with",[this,E(e)],"startsWith").asBoolean()}endsWith(e){return new _("ends_with",[this,E(e)],"endsWith").asBoolean()}toLower(){return new _("to_lower",[this],"toLower")}toUpper(){return new _("to_upper",[this],"toUpper")}trim(e){const t=[this];return e&&t.push(E(e)),new _("trim",t,"trim")}ltrim(e){const t=[this];return e&&t.push(E(e)),new _("ltrim",t,"ltrim")}rtrim(e){const t=[this];return e&&t.push(E(e)),new _("rtrim",t,"rtrim")}type(){return new _("type",[this])}isType(e){return new _("is_type",[this,dn(e)],"isType").asBoolean()}stringConcat(e,...t){const r=[e,...t].map(E);return new _("string_concat",[this,...r],"stringConcat")}stringIndexOf(e){return new _("string_index_of",[this,E(e)],"stringIndexOf")}stringRepeat(e){return new _("string_repeat",[this,E(e)],"stringRepeat")}stringReplaceAll(e,t){return new _("string_replace_all",[this,E(e),E(t)],"stringReplaceAll")}stringReplaceOne(e,t){return new _("string_replace_one",[this,E(e),E(t)],"stringReplaceOne")}concat(e,...t){const r=[e,...t].map(E);return new _("concat",[this,...r],"concat")}reverse(){return new _("reverse",[this],"reverse")}arrayFilter(e,t){return new _("array_filter",[this,E(e),t],"arrayFilter")}arrayTransform(e,t){return new _("array_transform",[this,E(e),t],"arrayTransform")}arrayTransformWithIndex(e,t,r){return new _("array_transform",[this,E(e),E(t),r],"arrayTransformWithIndex")}arraySlice(e,t){const r=[this,E(e)];return t!==void 0&&r.push(E(t)),new _("array_slice",r,"arraySlice")}arrayFirst(){return new _("array_first",[this],"arrayFirst")}arrayFirstN(e){return new _("array_first_n",[this,E(e)],"arrayFirstN")}arrayLast(){return new _("array_last",[this],"arrayLast")}arrayLastN(e){return new _("array_last_n",[this,E(e)],"arrayLastN")}arrayMaximum(){return new _("maximum",[this],"arrayMaximum")}arrayMaximumN(e){return new _("maximum_n",[this,E(e)],"arrayMaximumN")}arrayMinimum(){return new _("minimum",[this],"arrayMinimum")}arrayMinimumN(e){return new _("minimum_n",[this,E(e)],"arrayMinimumN")}arrayIndexOf(e){return new _("array_index_of",[this,E(e),E("first")],"arrayIndexOf")}arrayLastIndexOf(e){return new _("array_index_of",[this,E(e),E("last")],"arrayLastIndexOf")}arrayIndexOfAll(e){return new _("array_index_of_all",[this,E(e)],"arrayIndexOfAll")}byteLength(){return new _("byte_length",[this],"byteLength")}ceil(){return new _("ceil",[this])}floor(){return new _("floor",[this])}abs(){return new _("abs",[this])}exp(){return new _("exp",[this])}mapGet(e){return new _("map_get",[this,dn(e)],"mapGet")}mapSet(e,t,...r){const s=[this,E(e),E(t),...r.map(E)];return new _("map_set",s,"mapSet")}mapKeys(){return new _("map_keys",[this],"mapKeys")}mapValues(){return new _("map_values",[this],"mapValues")}mapEntries(){return new _("map_entries",[this],"mapEntries")}getField(e){return new _("get_field",[this,E(e)],"get_field")}count(){return me._create("count",[this],"count")}sum(){return me._create("sum",[this],"sum")}average(){return me._create("average",[this],"average")}minimum(){return me._create("minimum",[this],"minimum")}maximum(){return me._create("maximum",[this],"maximum")}first(){return me._create("first",[this],"first")}last(){return me._create("last",[this],"last")}arrayAgg(){return me._create("array_agg",[this],"arrayAgg")}arrayAggDistinct(){return me._create("array_agg_distinct",[this],"arrayAggDistinct")}countDistinct(){return me._create("count_distinct",[this],"countDistinct")}logicalMaximum(e,...t){const r=[e,...t];return new _("maximum",[this,...r.map(E)],"logicalMaximum")}logicalMinimum(e,...t){const r=[e,...t];return new _("minimum",[this,...r.map(E)],"minimum")}vectorLength(){return new _("vector_length",[this],"vectorLength")}cosineDistance(e){return new _("cosine_distance",[this,Lr(e)],"cosineDistance")}dotProduct(e){return new _("dot_product",[this,Lr(e)],"dotProduct")}euclideanDistance(e){return new _("euclidean_distance",[this,Lr(e)],"euclideanDistance")}unixMicrosToTimestamp(){return new _("unix_micros_to_timestamp",[this],"unixMicrosToTimestamp")}timestampToUnixMicros(){return new _("timestamp_to_unix_micros",[this],"timestampToUnixMicros")}unixMillisToTimestamp(){return new _("unix_millis_to_timestamp",[this],"unixMillisToTimestamp")}timestampToUnixMillis(){return new _("timestamp_to_unix_millis",[this],"timestampToUnixMillis")}unixSecondsToTimestamp(){return new _("unix_seconds_to_timestamp",[this],"unixSecondsToTimestamp")}timestampToUnixSeconds(){return new _("timestamp_to_unix_seconds",[this],"timestampToUnixSeconds")}timestampAdd(e,t){return new _("timestamp_add",[this,E(e),E(t)],"timestampAdd")}timestampSubtract(e,t){return new _("timestamp_subtract",[this,E(e),E(t)],"timestampSubtract")}timestampDiff(e,t){return new _("timestamp_diff",[this,Es(e),E(t)],"timestampDiff")}timestampExtract(e,t){const r=[this,E(e)];return t&&r.push(E(t)),new _("timestamp_extract",r,"timestampExtract")}documentId(){return new _("document_id",[this],"documentId")}parent(){return new _("parent",[this],"parent")}substring(e,t){const r=E(e);return new _("substring",t===void 0?[this,r]:[this,r,E(t)],"substring")}arrayGet(e){return new _("array_get",[this,E(e)],"arrayGet")}isError(){return new _("is_error",[this],"isError").asBoolean()}ifError(e){const t=new _("if_error",[this,E(e)],"ifError");return e instanceof Ze?t.asBoolean():t}isAbsent(){return new _("is_absent",[this],"isAbsent").asBoolean()}mapRemove(e){return new _("map_remove",[this,E(e)],"mapRemove")}mapMerge(e,...t){const r=E(e),s=t.map(E);return new _("map_merge",[this,r,...s],"mapMerge")}pow(e){return new _("pow",[this,E(e)])}trunc(e){return e===void 0?new _("trunc",[this]):new _("trunc",[this,E(e)],"trunc")}round(e){return e===void 0?new _("round",[this]):new _("round",[this,E(e)],"round")}collectionId(){return new _("collection_id",[this])}length(){return new _("length",[this])}ln(){return new _("ln",[this])}sqrt(){return new _("sqrt",[this])}stringReverse(){return new _("string_reverse",[this])}ifAbsent(e){return new _("if_absent",[this,E(e)],"ifAbsent")}ifNull(e){return new _("if_null",[this,E(e)],"ifNull")}coalesce(e,...t){return new _("coalesce",[this,E(e),...t.map(E)],"coalesce")}join(e){return new _("join",[this,E(e)],"join")}log10(){return new _("log10",[this])}arraySum(){return new _("sum",[this])}split(e){return new _("split",[this,E(e)])}timestampTruncate(e,t){const r=[this,E(e)];return t&&r.push(E(t)),new _("timestamp_trunc",r)}ascending(){return ml(this)}descending(){return _l(this)}as(e){return new cl(this,e,"as")}}class me{constructor(e,t){this.name=e,this.params=t,this.exprType="AggregateFunction",this._protoValueType="ProtoValue"}static _create(e,t,r){const s=new me(e,t);return s._methodName=r,s}as(e){return new ul(this,e,"as")}_toProto(e){return{functionValue:{name:this.name,args:this.params.map(t=>t._toProto(e))}}}_readUserData(e){e=this._methodName?e.contextWith({methodName:this._methodName}):e,this.params.forEach(t=>t._readUserData(e))}}class ul{constructor(e,t,r){this.aggregate=e,this.alias=t,this._methodName=r}_readUserData(e){this.aggregate._readUserData(e)}}class cl{constructor(e,t,r){this.expr=e,this.alias=t,this._methodName=r,this.exprType="AliasedExpression",this.selectable=!0}_readUserData(e){this.expr._readUserData(e)}}class Qt extends _t{constructor(e,t){super(),this.Rr=e,this._methodName=t,this.expressionType="ListOfExpressions"}_toProto(e){return{arrayValue:{values:this.Rr.map(t=>t._toProto(e))}}}_readUserData(e){this.Rr.forEach(t=>t._readUserData(e))}}class Ot extends _t{constructor(e,t){super(),this.fieldPath=e,this._methodName=t,this.expressionType="Field",this.selectable=!0}get _fieldPath(){return this.fieldPath}get fieldName(){return this.fieldPath.canonicalString()}get alias(){return this.fieldName}get expr(){return this}geoDistance(e){return new _("geo_distance",[this,E(e)],"geoDistance")}_toProto(e){return{fieldReferenceValue:this.fieldPath.canonicalString()}}_readUserData(e){}}function Gn(n){return ll(n,"field")}function ll(n,e){return new Ot(typeof n=="string"?Ve===n?Lc()._internalPath:Xe("field",n):n._internalPath,e)}class Mt extends _t{constructor(e,t){super(),this.value=e,this._methodName=t,this.expressionType="Constant"}static _fromProto(e){const t=new Mt(e,void 0);return t._protoValue=e,t}_toProto(e){return I(this._protoValue!==void 0,237),this._protoValue}_getValue(){return this._protoValue}_readUserData(e){e=this._methodName?e.contextWith({methodName:this._methodName}):e,al(this._protoValue)||(this._protoValue=Ue(this.value,e))}}function dn(n,e){return oo(n,"constant")}function oo(n,e){const t=new Mt(n,e);return typeof n=="boolean"?new co(t):t}class _ extends _t{constructor(e,t,r,s){super(),this.name=e,this.params=t,this.expressionType="Function",this._optionsProto=void 0,r!==void 0&&(this._methodName=r),s!==void 0&&(this._options=s)}get _optionsUtil(){return new se({})}_toProto(e){const t={functionValue:{name:this.name,args:this.params.map(r=>r._toProto(e))}};return this._optionsProto&&(t.functionValue.options=this._optionsProto),t}_readUserData(e){e=this._methodName?e.contextWith({methodName:this._methodName}):e,this.params.forEach(t=>t._readUserData(e)),this._options&&(this._optionsProto=this._optionsUtil.getOptionsProto(e,this._options))}}class Ze extends _t{get _methodName(){return this._expr._methodName}countIf(){return me._create("count_if",[this],"countIf")}not(){return new _("not",[this],"not").asBoolean()}conditional(e,t){return new _("conditional",[this,e,t],"conditional")}ifError(e){const t=E(e),r=new _("if_error",[this,t],"ifError");return t instanceof Ze?r.asBoolean():r}_toProto(e){return this._expr._toProto(e)}_readUserData(e){this._expr._readUserData(e)}}class uo extends Ze{constructor(e){super(),this._expr=e,this.expressionType="Function"}}class co extends Ze{constructor(e){super(),this._expr=e,this.expressionType="Constant"}_getValue(){return this._expr._getValue()}}class hl extends Ze{constructor(e){super(),this._expr=e,this.expressionType="Field"}}function dl(n,e){const t=[];for(const r in n)if(Object.prototype.hasOwnProperty.call(n,r)){const s=n[r];t.push(dn(r)),t.push(E(s))}return new _("map",t,"map")}function fl(n){return function(t,r){return new _("array",t.map(s=>E(s)),r)}(n,"array")}function ml(n){return new lo(Es(n),"ascending","ascending")}function _l(n){return new lo(Es(n),"descending","descending")}class lo{constructor(e,t,r){this.expr=e,this.direction=t,this._methodName=r,this._protoValueType="ProtoValue"}_toProto(e){return{mapValue:{fields:{direction:Wa(this.direction),expression:this.expr._toProto(e)}}}}_readUserData(e){this.expr._readUserData(e)}}/**
 * @license
 * Copyright 2024 Google LLC
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
 */class Te{constructor(e){this.optionsProto=void 0,{rawOptions:this.rawOptions,...this.knownOptions}=e}_readUserData(e){this.optionsProto=this._optionsUtil.getOptionsProto(e,this.knownOptions,this.rawOptions)}_toProto(e){return{name:this._name,options:this.optionsProto}}}class ho extends Te{get _name(){return"add_fields"}get _optionsUtil(){return new se({})}constructor(e,t){super(t),this.fields=e}_toProto(e){return{...super._toProto(e),args:[hn(e,this.fields)]}}_readUserData(e){super._readUserData(e),et(this.fields,e)}}class fo extends Te{get _name(){return"aggregate"}get _optionsUtil(){return new se({})}constructor(e,t,r){super(r),this.groups=e,this.accumulators=t}_toProto(e){return{...super._toProto(e),args:[hn(e,this.accumulators),hn(e,this.groups)]}}_readUserData(e){super._readUserData(e),et(this.groups,e),et(this.accumulators,e)}}class mo extends Te{get _name(){return"distinct"}get _optionsUtil(){return new se({})}constructor(e,t){super(t),this.groups=e}_toProto(e){return{...super._toProto(e),args:[hn(e,this.groups)]}}_readUserData(e){super._readUserData(e),et(this.groups,e)}}class wr extends Te{get _name(){return"collection"}get _optionsUtil(){return new se({forceIndex:{serverName:"force_index"}})}constructor(e,t){super(t),this.Vr=e.startsWith("/")?e:"/"+e}_toProto(e){return{...super._toProto(e),args:[{referenceValue:this.Vr}]}}_readUserData(e){super._readUserData(e)}}class Ir extends Te{get _name(){return"collection_group"}get _optionsUtil(){return new se({forceIndex:{serverName:"force_index"}})}constructor(e,t){super(t),this.collectionId=e}_toProto(e){return{...super._toProto(e),args:[{referenceValue:""},{stringValue:this.collectionId}]}}_readUserData(e){super._readUserData(e)}}class Ts extends Te{get _name(){return"database"}get _optionsUtil(){return new se({})}_toProto(e){return{...super._toProto(e)}}_readUserData(e){super._readUserData(e)}}class ws extends Te{get _name(){return"documents"}get _optionsUtil(){return new se({})}constructor(e,t){if(super(t),!e||e.length===0)throw new y(m.INVALID_ARGUMENT,"Empty document paths are not allowed in DocumentsSource");const r=e.map(i=>i.startsWith("/")?i:"/"+i),s=new Set(r);if(s.size!==r.length)throw new y(m.INVALID_ARGUMENT,"Duplicate document paths are not allowed in DocumentsSource");this.dr=r,this.mr=s}_toProto(e){return{...super._toProto(e),args:this.dr.map(t=>({referenceValue:t}))}}_readUserData(e){super._readUserData(e)}}class Ar extends Te{get _name(){return"where"}get _optionsUtil(){return new se({})}constructor(e,t){super(t),this.condition=e}_toProto(e){return{...super._toProto(e),args:[this.condition._toProto(e)]}}_readUserData(e){super._readUserData(e),et(this.condition,e)}}class ft extends Te{get _name(){return"limit"}get _optionsUtil(){return new se({})}constructor(e,t){I(!isNaN(e)&&e!==1/0&&e!==-1/0,34860),super(t),this.limit=e}_toProto(e){return{...super._toProto(e),args:[os(e,this.limit)]}}}class Li extends Te{get _name(){return"offset"}get _optionsUtil(){return new se({})}constructor(e,t){super(t),this.offset=e}_toProto(e){return{...super._toProto(e),args:[os(e,this.offset)]}}}class pl extends Te{get _name(){return"select"}get _optionsUtil(){return new se({})}constructor(e,t){super(t),this.selections=e}_toProto(e){return{...super._toProto(e),args:[hn(e,this.selections)]}}_readUserData(e){super._readUserData(e),et(this.selections,e)}}class ke extends Te{get _name(){return"sort"}get _optionsUtil(){return new se({})}constructor(e,t){super(t),this.orderings=e}_toProto(e){return{...super._toProto(e),args:this.orderings.map(t=>t._toProto(e))}}_readUserData(e){super._readUserData(e),et(this.orderings,e)}}class Is extends Te{get _name(){return"replace_with"}get _optionsUtil(){return new se({})}constructor(e,t){super(t),this.map=e}_toProto(e){return{...super._toProto(e),args:[this.map._toProto(e),Wa(Is.pr)]}}_readUserData(e){super._readUserData(e),et(this.map,e)}}Is.pr="full_replace";function et(n,e){return ao(n)?n._readUserData(e):Array.isArray(n)?n.forEach(t=>t._readUserData(e)):n instanceof Map?n.forEach(t=>t._readUserData(e)):Object.values(n).forEach(t=>t._readUserData(e)),n}// Copyright 2024 Google LLC* @license
class ie{constructor(e,t,r){this.serializer=e,this.stages=t,this.listenOptions=r,this.isCorePipeline=!0}getPipelineCollection(){return vr(this)}getPipelineCollectionGroup(){return As(this)}getPipelineCollectionId(){return gl(this)}getPipelineDocuments(){return Wr(this)}getPipelineFlavor(){return function(t){let r="exact";return t.stages.forEach((s,i)=>{s._name!==mo.name&&s._name!==fo.name||(r="keyless"),s._name===pl.name&&r==="exact"&&(r="augmented"),s._name===ho.name&&i<t.stages.length-1&&r==="exact"&&(r="augmented")}),r}(this)}getPipelineSourceType(){return Qe(this)}}function Qe(n){const e=n.stages[0];return e instanceof wr||e instanceof Ir||e instanceof Ts||e instanceof ws?e._name:"unknown"}function vr(n){if(Qe(n)==="collection")return n.stages[0].Vr}function As(n){if(Qe(n)==="collection_group")return n.stages[0].collectionId}function gl(n){switch(Qe(n)){case"collection":return D.fromString(vr(n)).lastSegment();case"collection_group":return As(n);default:return}}function Wr(n){if(Qe(n)==="documents")return n.stages[0].dr}class Jt{constructor(e,t,r,s){this._db=e,this.userDataReader=t,this._userDataWriter=r,this.stages=s}wr(e,t){const r=this.userDataReader.createContext(3,e);return ao(t)?t._readUserData(r):Array.isArray(t)?t.forEach(s=>s._readUserData(r)):t.forEach(s=>s._readUserData(r)),t}where(e){const t=this.stages.map(r=>r);return this.wr("where",e),t.push(new Ar(e,{})),new Jt(this._db,this.userDataReader,this._userDataWriter,t)}limit(e){const t=this.stages.map(r=>r);return t.push(new ft(e,{})),new Jt(this._db,this.userDataReader,this._userDataWriter,t)}sort(e,...t){const r=this.stages.map(s=>s);return"orderings"in e?r.push(new ke(this.wr("sort",e.orderings),{})):r.push(new ke(this.wr("sort",[e,...t]),{})),new Jt(this._db,this.userDataReader,this._userDataWriter,r)}br(e){return{pipeline:{stages:this.stages.map(t=>t._toProto(e))}}}}// Copyright 2024 Google LLC* @license
class h{constructor(e,t){this.type=e,this.value=t}static vr(){return new h("ERROR",void 0)}static Sr(){return new h("UNSET",void 0)}static Dr(){return new h("NULL",Vt)}static newValue(e){return ge(e)?new h("NULL",Vt):function(r){return!!r&&"booleanValue"in r}(e)?new h("BOOLEAN",e):Re(e)?new h("INT",e):ut(e)?new h("DOUBLE",e):function(r){return!!r&&"timestampValue"in r&&!!r.timestampValue}(e)?new h("TIMESTAMP",e):function(r){return!!r&&"stringValue"in r}(e)?new h("STRING",e):function(r){return!!r&&"bytesValue"in r}(e)?new h("BYTES",e):e.referenceValue?new h("REFERENCE",e):e.geoPointValue?new h("GEO_POINT",e):Pt(e)?new h("ARRAY",e):Wn(e)?new h("VECTOR",e):lt(e)?new h("MAP",e):new h("ERROR",void 0)}Cr(){return this.type==="ERROR"||this.type==="UNSET"}Fr(){return this.type==="NULL"}}function Xt(n){if(!n.Cr())return n.value}function _o(n){return n instanceof Ze?n._expr:n}function V(n){if((n=_o(n))instanceof Ot)return new yl(n);if(n instanceof Mt)return new El(n);if(n instanceof Qt)return new Tl(n);if(n instanceof _){if(n.name==="add")return new Al(n);if(n.name==="subtract")return new vl(n);if(n.name==="multiply")return new Vl(n);if(n.name==="divide")return new Rl(n);if(n.name==="mod")return new Pl(n);if(n.name==="and")return new Cl(n);if(n.name==="equal")return new ql(n);if(n.name==="not_equal")return new Bl(n);if(n.name==="less_than")return new $l(n);if(n.name==="less_than_or_equal")return new zl(n);if(n.name==="greater_than")return new Ql(n);if(n.name==="greater_than_or_equal")return new Gl(n);if(n.name==="array_concat")return new jl(n);if(n.name==="array_reverse")return new Kl(n);if(n.name==="array_contains")return new Wl(n);if(n.name==="array_contains_all")return new Hl(n);if(n.name==="array_contains_any")return new Yl(n);if(n.name==="array_length")return new Jl(n);if(n.name==="array_element")return new Xl(n);if(n.name==="equal_any")return new po(n);if(n.name==="not_equal_any")return new xl(n);if(n.name==="is_nan")return new bl(n);if(n.name==="is_not_nan")return new Nl(n);if(n.name==="is_null")return new Dl(n);if(n.name==="is_not_null")return new kl(n);if(n.name==="is_error")return new Ll(n);if(n.name==="exists")return new Ol(n);if(n.name==="not")return new Vr(n);if(n.name==="or")return new Sl(n);if(n.name==="xor")return new vs(n);if(n.name==="conditional")return new Ml(n);if(n.name==="maximum")return new Ul(n);if(n.name==="minimum")return new Fl(n);if(n.name==="reverse")return new Zl(n);if(n.name==="replace_first")return new eh(n);if(n.name==="replace_all")return new th(n);if(n.name==="char_length")return new nh(n);if(n.name==="byte_length")return new rh(n);if(n.name==="like")return new sh(n);if(n.name==="regex_contains")return new ih(n);if(n.name==="regex_match")return new ah(n);if(n.name==="string_contains")return new oh(n);if(n.name==="starts_with")return new uh(n);if(n.name==="ends_with")return new ch(n);if(n.name==="to_lower")return new lh(n);if(n.name==="to_upper")return new hh(n);if(n.name==="trim")return new dh(n);if(n.name==="string_concat")return new fh(n);if(n.name==="map_get")return new mh(n);if(n.name==="cosine_distance")return new _h(n);if(n.name==="dot_product")return new ph(n);if(n.name==="euclidean_distance")return new gh(n);if(n.name==="vector_length")return new yh(n);if(n.name==="unix_micros_to_timestamp")return new Ah(n);if(n.name==="timestamp_to_unix_micros")return new Rh(n);if(n.name==="unix_millis_to_timestamp")return new vh(n);if(n.name==="timestamp_to_unix_millis")return new Ph(n);if(n.name==="unix_seconds_to_timestamp")return new Vh(n);if(n.name==="timestamp_to_unix_seconds")return new Ch(n);if(n.name==="timestamp_add")return new Sh(n);if(n.name==="timestamp_subtract")return new xh(n)}throw new Error(`Unknown Expr : ${n}`)}class yl{constructor(e){this.expr=e}evaluate(e,t){if(this.expr.fieldName===Ve)return h.newValue({referenceValue:ln(e.serializer,t.key)});if(this.expr.fieldName==="__update_time__")return h.newValue({timestampValue:Qn(e.serializer,t.version)});if(this.expr.fieldName==="__create_time__")return h.newValue({timestampValue:Qn(e.serializer,t.createTime)});const r=t.data.field(this.expr._fieldPath);return r?hr(r)?h.newValue(function(i,a){if(i.serverTimestampBehavior==="estimate")return{timestampValue:Qn(i.serializer,R.fromTimestamp(vt(a)))};if(i.serverTimestampBehavior==="previous"){const o=Tn(a);if(o)return o}return{nullValue:"NULL_VALUE"}}(e,r)):h.newValue(r):h.Sr()}}class El{constructor(e){this.expr=e}evaluate(e,t){return h.newValue(this.expr._getValue())}}class Tl{constructor(e){this.expr=e}evaluate(e,t){const r=this.expr.Rr.map(s=>V(s).evaluate(e,t));return r.some(s=>s.Cr())?h.vr():h.newValue({arrayValue:{values:r.map(s=>s.value)}})}}function ee(n){return ut(n)?Number(n.doubleValue):Number(n.integerValue)}function xe(n){return BigInt(n.integerValue)}const wl=BigInt("0x7fffffffffffffff"),Il=-BigInt("0x8000000000000000");class Pn{constructor(e){this.expr=e}evaluate(e,t){I(this.expr.params.length>=2,24778);const r=V(this.expr.params[0]).evaluate(e,t),s=V(this.expr.params[1]).evaluate(e,t);let i=this.Or(r,s);for(const a of this.expr.params.slice(2)){const o=V(a).evaluate(e,t);i=this.Or(i,o)}return i}Or(e,t){if(e.Cr()||t.Cr())return h.vr();if(e.Fr()||t.Fr())return h.Dr();const r=e.value,s=t.value;if(!ut(r)&&!Re(r)||!ut(s)&&!Re(s))return h.vr();if(ut(r)||ut(s)){const i=this.Mr(r,s);return i?h.newValue(i):h.vr()}if(Re(r)&&Re(s)){const i=this.Nr(r,s);return i===void 0?h.vr():typeof i=="number"?h.newValue({doubleValue:i}):i<Il||i>wl?h.vr():h.newValue({integerValue:`${i}`})}return h.vr()}}function Fe(n,e){return K(n)!==K(e)?"TYPE_MISMATCH":he(n)||he(e)?"NOT_EQ":ge(n)&&ge(e)?"EQ":ge(n)||ge(e)?"NULL":Pt(n)&&Pt(e)?function(r,s){if(r.values?.length!==s.values?.length)return"NOT_EQ";let i=!1;for(let a=0;a<(r.values?.length??0);a++){const o=r.values[a],u=s.values[a];switch(Fe(o,u)){case"EQ":break;case"NOT_EQ":case"TYPE_MISMATCH":return"NOT_EQ";case"NULL":i=!0;break;default:A(44609,{Lr:o,Br:u})}}return i?"NULL":"EQ"}(n.arrayValue,e.arrayValue):Wn(n)&&Wn(e)||lt(n)&&lt(e)?function(r,s){const i=r.fields||{},a=s.fields||{};if(Kn(i)!==Kn(a))return"NOT_EQ";let o=!1;for(const u in i)if(i.hasOwnProperty(u)){if(a[u]===void 0)return"NOT_EQ";switch(Fe(i[u],a[u])){case"NOT_EQ":case"TYPE_MISMATCH":return"NOT_EQ";case"NULL":o=!0}}return o?"NULL":"EQ"}(n.mapValue,e.mapValue):function(r,s){return we(r,s,{Te:!1,Ee:!0,he:!0})}(n,e)?"EQ":"NOT_EQ"}class Al extends Pn{Nr(e,t){return xe(e)+xe(t)}Mr(e,t){return{doubleValue:ee(e)+ee(t)}}}class vl extends Pn{constructor(e){super(e),this.expr=e}Nr(e,t){return xe(e)-xe(t)}Mr(e,t){return{doubleValue:ee(e)-ee(t)}}}class Vl extends Pn{constructor(e){super(e),this.expr=e}Nr(e,t){return xe(e)*xe(t)}Mr(e,t){return{doubleValue:ee(e)*ee(t)}}}class Rl extends Pn{constructor(e){super(e),this.expr=e}Nr(e,t){const r=xe(t);if(r!==BigInt(0))return xe(e)/r}Mr(e,t){const r=ee(t);return r===0?{doubleValue:en(r)?Number.NEGATIVE_INFINITY:Number.POSITIVE_INFINITY}:{doubleValue:ee(e)/r}}}class Pl extends Pn{constructor(e){super(e),this.expr=e}Nr(e,t){const r=xe(t);if(r!==BigInt(0))return xe(e)%r}Mr(e,t){const r=ee(t);if(r!==0)return{doubleValue:ee(e)%r}}}class Cl{constructor(e){this.expr=e}evaluate(e,t){let r=!1,s=!1;for(const i of this.expr.params){const a=V(i).evaluate(e,t);switch(a.type){case"BOOLEAN":if(!a.value?.booleanValue)return h.newValue(X);break;case"NULL":s=!0;break;default:r=!0}}return r?h.vr():s?h.Dr():h.newValue(ce)}}class Vr{constructor(e){this.expr=e}evaluate(e,t){I(this.expr.params.length===1,9634);const r=V(this.expr.params[0]).evaluate(e,t);switch(r.type){case"BOOLEAN":return h.newValue({booleanValue:!r.value?.booleanValue});case"NULL":return h.Dr();default:return h.vr()}}}class Sl{constructor(e){this.expr=e}evaluate(e,t){let r=!1,s=!1;for(const i of this.expr.params){const a=V(i).evaluate(e,t);switch(a.type){case"BOOLEAN":if(a.value?.booleanValue)return h.newValue(ce);break;case"NULL":s=!0;break;default:r=!0}}return r?h.vr():s?h.Dr():h.newValue(X)}}class vs{constructor(e){this.expr=e}evaluate(e,t){let r=!1,s=!1;for(const i of this.expr.params){const a=V(i).evaluate(e,t);switch(a.type){case"BOOLEAN":r=vs.xor(r,!!a.value?.booleanValue);break;case"NULL":s=!0;break;default:return h.vr()}}return s?h.Dr():h.newValue({booleanValue:r})}static xor(e,t){return(e||t)&&!(e&&t)}}class po{constructor(e){this.expr=e}evaluate(e,t){I(this.expr.params.length===2,55094);let r=!1;const s=V(this.expr.params[0]).evaluate(e,t);switch(s.type){case"NULL":r=!0;break;case"ERROR":case"UNSET":return h.vr()}const i=V(this.expr.params[1]).evaluate(e,t);switch(i.type){case"ARRAY":break;case"NULL":r=!0;break;default:return h.vr()}if(r)return h.Dr();for(const a of i.value?.arrayValue?.values??[])switch(ge(s.value)&&ge(a)?"EQ":Fe(s.value,a)){case"EQ":return h.newValue(ce);case"NOT_EQ":case"TYPE_MISMATCH":break;case"NULL":r=!0;break;default:A(44608,{value:s.value,candidate:a})}return r?h.Dr():h.newValue(X)}}class xl{constructor(e){this.expr=e}evaluate(e,t){return new Vr(new _("not",[new _("equal_any",this.expr.params)])).evaluate(e,t)}}class bl{constructor(e){this.expr=e}evaluate(e,t){I(this.expr.params.length===1,23322);const r=V(this.expr.params[0]).evaluate(e,t);switch(r.type){case"INT":return h.newValue(X);case"DOUBLE":return h.newValue({booleanValue:isNaN(ee(r.value))});case"NULL":return h.Dr();default:return h.vr()}}}class Nl{constructor(e){this.expr=e}evaluate(e,t){return I(this.expr.params.length===1,50406),new Vr(new _("not",[new _("is_nan",this.expr.params)])).evaluate(e,t)}}class Dl{constructor(e){this.expr=e}evaluate(e,t){switch(I(this.expr.params.length===1,23123),V(this.expr.params[0]).evaluate(e,t).type){case"NULL":return h.newValue(ce);case"UNSET":case"ERROR":return h.vr();default:return h.newValue(X)}}}class kl{constructor(e){this.expr=e}evaluate(e,t){return I(this.expr.params.length===1,23167),new Vr(new _("not",[new _("is_null",this.expr.params)])).evaluate(e,t)}}class Ll{constructor(e){this.expr=e}evaluate(e,t){return I(this.expr.params.length===1,5228),V(this.expr.params[0]).evaluate(e,t).type==="ERROR"?h.newValue(ce):h.newValue(X)}}class Ol{constructor(e){this.expr=e}evaluate(e,t){switch(I(this.expr.params.length===1,6877),V(this.expr.params[0]).evaluate(e,t).type){case"ERROR":return h.vr();case"UNSET":return h.newValue(X);default:return h.newValue(ce)}}}class Ml{constructor(e){this.expr=e}evaluate(e,t){I(this.expr.params.length===3,11706);const r=V(this.expr.params[0]).evaluate(e,t);switch(r.type){case"BOOLEAN":return r.value?.booleanValue?V(this.expr.params[1]).evaluate(e,t):V(this.expr.params[2]).evaluate(e,t);case"NULL":return V(this.expr.params[2]).evaluate(e,t);default:return h.vr()}}}class Ul{constructor(e){this.expr=e}evaluate(e,t){const r=this.expr.params.map(i=>V(i).evaluate(e,t));let s;for(const i of r)switch(i.type){case"ERROR":case"UNSET":case"NULL":continue;default:s=s===void 0||le(i.value,s.value)>0?i:s}return s===void 0?h.Dr():s}}class Fl{constructor(e){this.expr=e}evaluate(e,t){const r=this.expr.params.map(i=>V(i).evaluate(e,t));let s;for(const i of r)switch(i.type){case"ERROR":case"UNSET":case"NULL":continue;default:s=s===void 0||le(i.value,s.value)<0?i:s}return s===void 0?h.Dr():s}}class Ut{constructor(e){this.expr=e}evaluate(e,t){I(this.expr.params.length===2,31033,`${this.expr.name}() function should have exactly 2 params`);const r=V(this.expr.params[0]).evaluate(e,t);switch(r.type){case"ERROR":case"UNSET":return h.vr()}const s=V(this.expr.params[1]).evaluate(e,t);switch(s.type){case"ERROR":case"UNSET":return h.vr()}return this.Ur(r,s)}}class ql extends Ut{constructor(e){super(e),this.expr=e}Ur(e,t){if(e.Fr()&&t.Fr())return h.newValue(ce);if(e.Fr()||t.Fr()||he(e.value)||he(t.value)||K(e.value)!==K(t.value))return h.newValue(X);switch(Fe(e.value,t.value)){case"EQ":return h.newValue(ce);case"NOT_EQ":return h.newValue(X);case"NULL":return h.Dr();default:A(44615,{left:e,right:t})}}}class Bl extends Ut{constructor(e){super(e),this.expr=e}Ur(e,t){switch(Fe(e.value,t.value)){case"EQ":return h.newValue(X);case"NOT_EQ":case"TYPE_MISMATCH":return h.newValue(ce);case"NULL":return h.Dr();default:A(44614,{left:e,right:t})}}}class $l extends Ut{constructor(e){super(e),this.expr=e}Ur(e,t){return K(e.value)!==K(t.value)||he(e.value)||he(t.value)?h.newValue(X):h.newValue({booleanValue:le(e.value,t.value)<0})}}class zl extends Ut{constructor(e){super(e),this.expr=e}Ur(e,t){return K(e.value)!==K(t.value)||he(e.value)||he(t.value)?h.newValue(X):Fe(e.value,t.value)==="EQ"?h.newValue(ce):h.newValue({booleanValue:le(e.value,t.value)<0})}}class Ql extends Ut{constructor(e){super(e),this.expr=e}Ur(e,t){return K(e.value)!==K(t.value)||he(e.value)||he(t.value)?h.newValue(X):h.newValue({booleanValue:le(e.value,t.value)>0})}}class Gl extends Ut{constructor(e){super(e),this.expr=e}Ur(e,t){return K(e.value)!==K(t.value)||he(e.value)||he(t.value)?h.newValue(X):Fe(e.value,t.value)==="EQ"?h.newValue(ce):h.newValue({booleanValue:le(e.value,t.value)>0})}}class jl{constructor(e){this.expr=e}evaluate(e,t){throw new Error("Unimplemented")}}class Kl{constructor(e){this.expr=e}evaluate(e,t){I(this.expr.params.length===1,216);const r=V(this.expr.params[0]).evaluate(e,t);switch(r.type){case"NULL":return h.Dr();case"ARRAY":{const s=r.value.arrayValue?.values??[];return h.newValue({arrayValue:{values:[...s].reverse()}})}default:return h.vr()}}}class Wl{constructor(e){this.expr=e}evaluate(e,t){return I(this.expr.params.length===2,52884),new po(new _("eq_any",[this.expr.params[1],this.expr.params[0]])).evaluate(e,t)}}class Hl{constructor(e){this.expr=e}evaluate(e,t){I(this.expr.params.length===2,1392);let r=!1;const s=V(this.expr.params[0]).evaluate(e,t);switch(s.type){case"ARRAY":break;case"NULL":r=!0;break;default:return h.vr()}const i=V(this.expr.params[1]).evaluate(e,t);switch(i.type){case"ARRAY":break;case"NULL":r=!0;break;default:return h.vr()}if(r)return h.Dr();const a=i.value?.arrayValue?.values??[],o=s.value?.arrayValue?.values??[];for(const u of a){let c=!1;r=!1;for(const l of o){switch(ge(u)&&ge(l)?"EQ":Fe(u,l)){case"EQ":c=!0;break;case"NOT_EQ":case"TYPE_MISMATCH":break;case"NULL":r=!0;break;default:A(44613,{value:l,search:u})}if(c)break}if(!c)return h.newValue(X)}return h.newValue(ce)}}class Yl{constructor(e){this.expr=e}evaluate(e,t){I(this.expr.params.length===2,2680);let r=!1;const s=V(this.expr.params[0]).evaluate(e,t);switch(s.type){case"ARRAY":break;case"NULL":r=!0;break;default:return h.vr()}const i=V(this.expr.params[1]).evaluate(e,t);switch(i.type){case"ARRAY":break;case"NULL":r=!0;break;default:return h.vr()}if(r)return h.Dr();const a=i.value?.arrayValue?.values??[],o=s.value?.arrayValue?.values??[];for(const u of o)for(const c of a)switch(ge(u)&&ge(c)?"EQ":Fe(u,c)){case"EQ":return h.newValue(ce);case"NOT_EQ":case"TYPE_MISMATCH":break;case"NULL":r=!0;break;default:A(44608,{value:u,search:c})}return r?h.Dr():h.newValue(X)}}class Jl{constructor(e){this.expr=e}evaluate(e,t){I(this.expr.params.length===1,38605);const r=V(this.expr.params[0]).evaluate(e,t);switch(r.type){case"NULL":return h.Dr();case"ARRAY":return h.newValue({integerValue:`${r.value?.arrayValue?.values?.length??0}`});default:return h.vr()}}}class Xl{constructor(e){this.expr=e}evaluate(e,t){throw new Error("Unimplemented")}}class Zl{constructor(e){this.expr=e}evaluate(e,t){I(this.expr.params.length===1,1508);const r=V(this.expr.params[0]).evaluate(e,t);switch(r.type){case"NULL":return h.Dr();case"BYTES":{const s=r.value?.bytesValue;if(typeof s=="string"){const i=j.fromBase64String(s).toUint8Array();return i.reverse(),h.newValue({bytesValue:j.fromUint8Array(i).toBase64()})}return h.newValue({bytesValue:new Uint8Array(s).reverse()})}case"STRING":{const s=r.value?.stringValue,i=new Intl.__PRIVATE_Segmenter(void 0,{granularity:"grapheme"}).segment(s),a=Array.from(i,o=>o.segment).reverse();return h.newValue({stringValue:a.join("")})}default:return h.vr()}}}class eh{constructor(e){this.expr=e}evaluate(e,t){throw new Error("Unimplemented")}}class th{constructor(e){this.expr=e}evaluate(e,t){throw new Error("Unimplemented")}}class nh{constructor(e){this.expr=e}evaluate(e,t){I(this.expr.params.length===1,19400);const r=V(this.expr.params[0]).evaluate(e,t);switch(r.type){case"NULL":return h.Dr();case"STRING":{const s=function(a){let o=0;for(let u=0;u<a.length;u++){const c=a.codePointAt(u);if(c===void 0)return;if(c<=65535)if(c>=55296&&c<=57343)if(c<=56319){const l=a.codePointAt(u+1);l!==void 0&&l>=56320&&l<=57343?(o+=1,u++):o+=1}else o+=1;else o+=1;else{if(!(c<=1114111))return;o+=1,u++}}return o}(r.value.stringValue);return s===void 0?h.vr():h.newValue({integerValue:s})}default:return h.vr()}}}class rh{constructor(e){this.expr=e}evaluate(e,t){I(this.expr.params.length===1,8486);const r=V(this.expr.params[0]).evaluate(e,t);switch(r.type){case"BYTES":{const s=r.value?.bytesValue;return typeof s=="string"?h.newValue({integerValue:j.fromBase64String(s).toUint8Array().length}):h.newValue({integerValue:new Uint8Array(s).length})}case"STRING":{const s=function(a){let o=0;for(let u=0;u<a.length;u++){const c=a.codePointAt(u);if(c===void 0)return;if(c>=55296&&c<=57343){if(!(c<=56319))return;{const l=a.codePointAt(u+1);if(l===void 0||!(l>=56320&&l<=57343))return;o+=4,u++}}else if(c<=127)o+=1;else if(c<=2047)o+=2;else if(c<=65535)o+=3;else{if(!(c<=1114111))return;o+=4,u++}}return o}(r.value?.stringValue);return s===void 0?h.vr():h.newValue({integerValue:s})}case"NULL":return h.Dr();default:return h.vr()}}}class Ft{constructor(e){this.expr=e}evaluate(e,t){I(this.expr.params.length===2,39773,`${this.expr.name}() function should have exactly two parameters`);let r=!1;const s=V(this.expr.params[0]).evaluate(e,t);switch(s.type){case"STRING":break;case"NULL":r=!0;break;default:return h.vr()}const i=V(this.expr.params[1]).evaluate(e,t);switch(i.type){case"STRING":break;case"NULL":r=!0;break;default:return h.vr()}return r?h.Dr():this.kr(s.value?.stringValue,i.value?.stringValue)}}class sh extends Ft{kr(e,t){try{const r=function(a){let o="";for(let u=0;u<a.length;u++){const c=a.charAt(u);switch(c){case"_":o+=".";break;case"%":o+=".*";break;case"\\":case".":case"*":case"?":case"+":case"^":case"$":case"|":case"(":case")":case"[":case"]":case"{":case"}":o+="\\"+c;break;default:o+=c}}return"^"+o+"$"}(t),s=ns.compile(r);return h.newValue({booleanValue:s.matches(e)})}catch(r){return Ie(`Invalid LIKE pattern converted to regex: ${t}, returning error. Error: ${r}`),h.vr()}}}class ih extends Ft{kr(e,t){try{const r=ns.compile(t);return h.newValue({booleanValue:r.matcher(e).find()})}catch{return Ie(`Invalid regex pattern found in regex_contains: ${t}, returning error`),h.vr()}}}class ah extends Ft{kr(e,t){try{return h.newValue({booleanValue:ns.compile(t).matches(e)})}catch{return Ie(`Invalid regex pattern found in regex_match: ${t}, returning error`),h.vr()}}}class oh extends Ft{kr(e,t){return h.newValue({booleanValue:e.includes(t)})}}class uh extends Ft{kr(e,t){return h.newValue({booleanValue:e.startsWith(t)})}}class ch extends Ft{kr(e,t){return h.newValue({booleanValue:e.endsWith(t)})}}class lh{constructor(e){this.expr=e}evaluate(e,t){I(this.expr.params.length===1,29079);const r=V(this.expr.params[0]).evaluate(e,t);switch(r.type){case"STRING":return h.newValue({stringValue:r.value?.stringValue?.toLowerCase()});case"NULL":return h.Dr();default:return h.vr()}}}class hh{constructor(e){this.expr=e}evaluate(e,t){I(this.expr.params.length===1,60487);const r=V(this.expr.params[0]).evaluate(e,t);switch(r.type){case"STRING":return h.newValue({stringValue:r.value?.stringValue?.toUpperCase()});case"NULL":return h.Dr();default:return h.vr()}}}class dh{constructor(e){this.expr=e}evaluate(e,t){I(this.expr.params.length===1,28544);const r=V(this.expr.params[0]).evaluate(e,t);switch(r.type){case"STRING":return h.newValue({stringValue:r.value?.stringValue?.trim()});case"NULL":return h.Dr();default:return h.vr()}}}class fh{constructor(e){this.expr=e}evaluate(e,t){const r=this.expr.params.map(a=>V(a).evaluate(e,t));let s="",i=!1;for(const a of r)switch(a.type){case"STRING":s+=a.value.stringValue;break;case"NULL":i=!0;break;default:return h.vr()}return i?h.Dr():h.newValue({stringValue:s})}}class mh{constructor(e){this.expr=e}evaluate(e,t){I(this.expr.params.length===2,4483);const r=V(this.expr.params[0]).evaluate(e,t);switch(r.type){case"UNSET":return h.Sr();case"MAP":break;default:return h.vr()}const s=V(this.expr.params[1]).evaluate(e,t);if(s.type!=="STRING")return h.vr();const i=r.value?.mapValue?.fields?.[s.value?.stringValue];return i===void 0?h.Sr():h.newValue(i)}}class Vs{constructor(e){this.expr=e}evaluate(e,t){I(this.expr.params.length===2,25231,`${this.expr.name}() function should have exactly 2 params`);let r=!1;const s=V(this.expr.params[0]).evaluate(e,t);switch(s.type){case"VECTOR":break;case"NULL":r=!0;break;default:return h.vr()}const i=V(this.expr.params[1]).evaluate(e,t);switch(i.type){case"VECTOR":break;case"NULL":r=!0;break;default:return h.vr()}if(r)return h.Dr();const a=Br(s.value),o=Br(i.value);if(a===void 0||o===void 0||a.values?.length!==o.values?.length)return h.vr();const u=this.qr(a,o);return u===void 0||isNaN(u)?h.vr():h.newValue({doubleValue:u})}}class _h extends Vs{qr(e,t){const r=e?.values??[],s=t?.values??[];if(r.length===0)return;let i=0,a=0,o=0;for(let c=0;c<r.length;c++){if(!Je(r[c])||!Je(s[c]))return;const l=ee(r[c]),d=ee(s[c]);i+=l*d,a+=l*l,o+=d*d}const u=Math.sqrt(a)*Math.sqrt(o);if(u!==0)return 1-Math.max(-1,Math.min(1,i/u))}}class ph extends Vs{qr(e,t){const r=e?.values??[],s=t?.values??[];if(r.length===0)return 0;let i=0;for(let a=0;a<r.length;a++){if(!Je(r[a])||!Je(s[a]))return;i+=ee(r[a])*ee(s[a])}return i}}class gh extends Vs{qr(e,t){const r=e?.values??[],s=t?.values??[];if(r.length===0)return 0;let i=0;for(let a=0;a<r.length;a++){if(!Je(r[a])||!Je(s[a]))return;const o=ee(r[a]),u=ee(s[a]);i+=Math.pow(o-u,2)}return Math.sqrt(i)}}class yh{constructor(e){this.expr=e}evaluate(e,t){I(this.expr.params.length===1,39044);const r=V(this.expr.params[0]).evaluate(e,t);switch(r.type){case"VECTOR":{const s=Br(r.value);return h.newValue({integerValue:s?.values?.length??0})}case"NULL":return h.Dr();default:return h.vr()}}}const fn=BigInt(-62135596800),mn=BigInt(253402300799),nr=BigInt(1e3),Ge=BigInt(1e6),Eh=fn*nr,Th=mn*nr+BigInt(999),wh=fn*Ge,Ih=mn*Ge+BigInt(999999);function Rs(n){return n>=wh&&n<=Ih}function go(n){return n>=fn&&n<=mn}function _n(n,e){const t=BigInt(n);return!(t<fn||t>mn)&&!(e<0||e>=1e9)&&(t!==fn||e===0)&&!(t===mn&&e>999999999)}function yo(n,e){return e<0?{seconds:n-1,nanos:e+1e9}:{seconds:n,nanos:e}}function Ps(n){return BigInt(n.seconds)*Ge+BigInt(Math.trunc(n.nanoseconds/1e3))}class Cs{constructor(e){this.expr=e}evaluate(e,t){I(this.expr.params.length===1,49262,`${this.expr.name}() function should have exactly one parameter`);const r=V(this.expr.params[0]).evaluate(e,t);switch(r.type){case"INT":return this.toTimestamp(BigInt(r.value.integerValue));case"NULL":return h.Dr();default:return h.vr()}}}class Ah extends Cs{toTimestamp(e){if(!Rs(e))return h.vr();let t=Number(e/Ge),r=Number(e%Ge*BigInt(1e3));const s=yo(t,r);return t=s.seconds,r=s.nanos,_n(t,r)?h.newValue({timestampValue:{seconds:t,nanos:r}}):h.vr()}}class vh extends Cs{toTimestamp(e){if(!function(a){return a>=Eh&&a<=Th}(e))return h.vr();let t=Number(e/nr),r=Number(e%nr*BigInt(1e6));const s=yo(t,r);return t=s.seconds,r=s.nanos,_n(t,r)?h.newValue({timestampValue:{seconds:t,nanos:r}}):h.vr()}}class Vh extends Cs{toTimestamp(e){if(!go(e))return h.vr();const t=Number(e);return h.newValue({timestampValue:{seconds:t,nanos:0}})}}class Ss{constructor(e){this.expr=e}evaluate(e,t){I(this.expr.params.length===1,1265,`${this.expr.name}() function should have exactly one parameter`);const r=V(this.expr.params[0]).evaluate(e,t);switch(r.type){case"TIMESTAMP":break;case"NULL":return h.Dr();default:return h.vr()}const s=hs(r.value.timestampValue);return _n(s.seconds,s.nanoseconds)?this.$r(s):h.vr()}}class Rh extends Ss{$r(e){const t=Ps(e);return Rs(t)?h.newValue({integerValue:`${t.toString()}`}):h.vr()}}class Ph extends Ss{$r(e){const t=Ps(e),r=t/BigInt(1e3),s=t%BigInt(1e3);return r>BigInt(0)||s===BigInt(0)?h.newValue({integerValue:r.toString()}):h.newValue({integerValue:(r-BigInt(1)).toString()})}}class Ch extends Ss{$r(e){const t=BigInt(e.seconds);return go(t)?h.newValue({integerValue:t.toString()}):h.vr()}}class Eo{constructor(e){this.expr=e}evaluate(e,t){I(this.expr.params.length===3,2775,`${this.expr.name}() function should have exactly 3 parameters`);let r=!1;const s=V(this.expr.params[0]).evaluate(e,t);switch(s.type){case"TIMESTAMP":break;case"NULL":r=!0;break;default:return h.vr()}const i=V(this.expr.params[1]).evaluate(e,t);let a;switch(i.type){case"STRING":if(a=function(q){switch(q){case"microsecond":return"microsecond";case"millisecond":return"millisecond";case"second":return"second";case"minute":return"minute";case"hour":return"hour";case"day":return"day";default:return}}(i.value.stringValue),a===void 0)return h.vr();break;case"NULL":r=!0;break;default:return h.vr()}const o=V(this.expr.params[2]).evaluate(e,t);switch(o.type){case"INT":break;case"NULL":r=!0;break;default:return h.vr()}if(r)return h.Dr();const u=BigInt(o.value.integerValue);let c;try{switch(a){case"microsecond":c=u;break;case"millisecond":c=u*BigInt(1e3);break;case"second":c=u*BigInt(1e6);break;case"minute":c=u*BigInt(6e7);break;case"hour":c=u*BigInt(36e8);break;case"day":c=u*BigInt(864e8);break;default:return h.vr()}if(a!=="microsecond"&&u!==BigInt(0)&&c/u!==BigInt(this.Kr(a)))return h.vr()}catch(k){return Ie(`Error during timestamp arithmetic: ${k}`),h.vr()}const l=hs(s.value.timestampValue);if(!_n(l.seconds,l.nanoseconds))return h.vr();const d=Ps(l),f=this.Wr(d,c);if(!Rs(f))return h.vr();const g=Number(f/Ge),T=f%Ge,S=Number((T<0?T+Ge:T)*BigInt(1e3)),C=T<0?g-1:g;return _n(C,S)?h.newValue({timestampValue:{seconds:C,nanos:S}}):h.vr()}Kr(e){switch(e){case"millisecond":return 1e3;case"second":return 1e6;case"minute":return 6e7;case"hour":return 36e8;case"day":return 864e8;default:return 1}}}class Sh extends Eo{Wr(e,t){return e+t}}class xh extends Eo{Wr(e,t){return e-t}}function pn(n){if((n=_o(n))instanceof Ot)return`fld(${n.fieldName})`;if(n instanceof Mt)return`cst(${function(t){return t===null?"null":typeof t=="number"?t.toString():typeof t=="string"?`"${t}"`:t instanceof O?`ref(${t.path})`:t instanceof ue?`vec(${JSON.stringify(t)})`:JSON.stringify(t)}(n.value)})`;if(n instanceof _)return`fn(${n.name},[${n.params.map(pn).join(",")}])`;if(n.expressionType==="ListOfExpressions")return`list([${n.Rr.map(pn).join(",")}])`;throw new Error(`Unrecognized expr ${JSON.stringify(n,null,2)}`)}function bh(n){if(n instanceof ho)return`${n._name}(${qn(n.fields)})`;if(n instanceof fo){let e=`${n._name}(${qn(n.accumulators)})`;return n.groups.size>0&&(e+=`grouping(${qn(n.groups)})`),e}if(n instanceof mo)return`${n._name}(${qn(n.groups)})`;if(n instanceof wr)return`${n._name}(${n.Vr})`;if(n instanceof Ir)return`${n._name}(${n.collectionId})`;if(n instanceof Ts)return`${n._name}()`;if(n instanceof ws)return`${n._name}(${n.dr.sort()})`;if(n instanceof Ar)return`${n._name}(${pn(n.condition)})`;if(n instanceof ft)return`${n._name}(${n.limit})`;if(n instanceof ke)return`${n._name}(${function(t){return t.map(r=>`${pn(r.expr)}${r.direction}`).join(",")}(n.orderings)})`;throw new Error(`Unrecognized stage ${n._name}`)}function qn(n){return`${Array.from(n.entries()).sort().map(([e,t])=>`${e}=${pn(t)}`).join(",")}`}function Oe(n){return n.stages.map(e=>bh(e)).join("|")}function To(n,e){return Oe(n)===Oe(e)}function H(n){return n instanceof ie}function Oi(n){return H(n)?Oe(n):Wt(n)}function wo(n){return H(n)?Oe(n):function(t){return`${Ca(Ce(t))}|lt:${t.limitType}`}(n)}function Rr(n,e){return n instanceof ie&&e instanceof ie?To(n,e):!(n instanceof ie&&!(e instanceof ie)||!(n instanceof ie)&&e instanceof ie)&&oc(n,e)}function Io(n){return ot(n)?Oe(n):Ca(n)}function Ao(n,e){return n instanceof ie&&e instanceof ie?To(n,e):!(n instanceof ie&&!(e instanceof ie)||!(n instanceof ie)&&e instanceof ie)&&Sa(n,e)}function Nh(n,e){const t=function(s){let i=!1;const a=[];for(const o of s)if(o instanceof ke)if(i=!0,o.orderings.some(u=>u.expr instanceof Ot&&u.expr.fieldName===Ve))a.push(o);else{const u=o.orderings.map(c=>c);u.push(Gn(Ve).ascending()),a.push(new ke(u,{}))}else o instanceof ft&&(i||(a.push(new ke([Gn(Ve).ascending()],{})),i=!0)),a.push(o);return i||a.push(new ke([Gn(Ve).ascending()],{})),a}(n.stages);if(n.userDataReader){const r=n.userDataReader.createContext(3,"toCorePipeline");t.forEach(s=>s._readUserData(r))}return new ie(n.userDataReader.serializer,t,e)}/**
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
 */class Dh{constructor(e,t,r,s){this.batchId=e,this.localWriteTime=t,this.baseMutations=r,this.mutations=s}applyToRemoteDocument(e,t){const r=t.mutationResults;for(let s=0;s<this.mutations.length;s++){const i=this.mutations[s];i.key.isEqual(e.key)&&Gu(i,e,r[s])}}applyToLocalView(e,t){for(const r of this.baseMutations)r.key.isEqual(e.key)&&(t=jt(r,e,t,this.localWriteTime));for(const r of this.mutations)r.key.isEqual(e.key)&&(t=jt(r,e,t,this.localWriteTime));return t}applyToLocalDocumentSet(e,t){const r=Oa();return this.mutations.forEach(s=>{const i=e.get(s.key),a=i.overlayedDocument;let o=this.applyToLocalView(a,i.mutatedFields);o=t.has(s.key)?null:o;const u=Ea(a,o);u!==null&&r.set(s.key,u),a.isValidDocument()||a.convertToNoDocument(R.min())}),r}keys(){return this.mutations.reduce((e,t)=>e.add(t.key),x())}isEqual(e){return this.batchId===e.batchId&&At(this.mutations,e.mutations,(t,r)=>mi(t,r))&&At(this.baseMutations,e.baseMutations,(t,r)=>mi(t,r))}}class xs{constructor(e,t,r,s){this.batch=e,this.commitVersion=t,this.mutationResults=r,this.docVersions=s}static from(e,t,r){I(e.mutations.length===r.length,58842,{Qr:e.mutations.length,Gr:r.length});let s=function(){return hc}();const i=e.mutations;for(let a=0;a<i.length;a++)s=s.insert(i[a].key,r[a].version);return new xs(e,t,r,s)}}/**
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
 */class kh{constructor(e,t){this.largestBatchId=e,this.mutation=t}getKey(){return this.mutation.key}isEqual(e){return e!==null&&this.mutation===e.mutation}toString(){return`Overlay{
      largestBatchId: ${this.largestBatchId},
      mutation: ${this.mutation.toString()}
    }`}}/**
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
 */class Le{constructor(e,t,r,s,i=R.min(),a=R.min(),o=j.EMPTY_BYTE_STRING,u=null){this.target=e,this.targetId=t,this.purpose=r,this.sequenceNumber=s,this.snapshotVersion=i,this.lastLimboFreeSnapshotVersion=a,this.resumeToken=o,this.expectedCount=u}withSequenceNumber(e){return new Le(this.target,this.targetId,this.purpose,e,this.snapshotVersion,this.lastLimboFreeSnapshotVersion,this.resumeToken,this.expectedCount)}withResumeToken(e,t){return new Le(this.target,this.targetId,this.purpose,this.sequenceNumber,t,this.lastLimboFreeSnapshotVersion,e,null)}withExpectedCount(e){return new Le(this.target,this.targetId,this.purpose,this.sequenceNumber,this.snapshotVersion,this.lastLimboFreeSnapshotVersion,this.resumeToken,e)}withLastLimboFreeSnapshotVersion(e){return new Le(this.target,this.targetId,this.purpose,this.sequenceNumber,this.snapshotVersion,e,this.resumeToken,this.expectedCount)}}/**
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
 */class Lh{constructor(e){this.zr=e}}function Oh(n){const e=Cc({parent:n.parent,structuredQuery:n.structuredQuery});return n.limitType==="LAST"?Zn(e,e.limit,"L"):e}/**
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
 */class Mh{constructor(){this.Hi=new Uh}addToCollectionParentIndex(e,t){return this.Hi.add(t),p.resolve()}getCollectionParents(e,t){return p.resolve(this.Hi.getEntries(t))}addFieldIndex(e,t){return p.resolve()}deleteFieldIndex(e,t){return p.resolve()}deleteAllFieldIndexes(e){return p.resolve()}createTargetIndexes(e,t){return p.resolve()}getDocumentsMatchingTarget(e,t){return p.resolve(null)}getIndexType(e,t){return p.resolve(0)}getFieldIndexes(e,t){return p.resolve([])}getNextCollectionGroupToUpdate(e){return p.resolve(null)}getMinOffset(e,t){return p.resolve(We.min())}getMinOffsetFromCollectionGroup(e,t){return p.resolve(We.min())}updateCollectionGroup(e,t,r){return p.resolve()}updateIndexEntries(e,t){return p.resolve()}}class Uh{constructor(){this.index={}}add(e){const t=e.lastSegment(),r=e.popLast(),s=this.index[t]||new G(D.comparator),i=!s.has(r);return this.index[t]=s.add(r),i}has(e){const t=e.lastSegment(),r=e.popLast(),s=this.index[t];return s&&s.has(r)}getEntries(e){return(this.index[e]||new G(D.comparator)).toArray()}}/**
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
 */class tt{constructor(e){this.Ds=e}next(){return this.Ds+=2,this.Ds}static xs(){return new tt(0)}static Cs(){return new tt(-1)}}// Copyright 2024 Google LLC* @license
function vo(n,e){let t=e;for(const r of n.stages)t=qh({serializer:n.serializer,serverTimestampBehavior:n.listenOptions?.serverTimestampBehavior},r,t);return t}function Pr(n,e){return vo(n,[e]).length>0}function Fh(n,e){return H(n)?Pr(n,e):pr(n,e)}function qh(n,e,t){if(e instanceof wr)return function(s,i,a){return a.filter(o=>o.isFoundDocument()&&`/${o.key.getCollectionPath().canonicalString()}`===i.Vr)}(0,e,t);if(e instanceof Ar)return function(s,i,a){return a.filter(o=>{const u=Xt(V(i.condition).evaluate(s,o));return u!==void 0&&we(u,ce)})}(n,e,t);if(e instanceof Ir)return function(s,i,a){return a.filter(o=>o.isFoundDocument()&&o.key.getCollectionPath().lastSegment()===i.collectionId)}(0,e,t);if(e instanceof Ts)return function(s,i,a){return a.filter(o=>o.isFoundDocument())}(0,0,t);if(e instanceof ws)return function(s,i,a){return a.filter(o=>o.isFoundDocument()&&i.mr.has(o.key.path.toStringWithLeadingSlash()))}(0,e,t);if(e instanceof ft)return function(s,i,a){return a.slice(0,i.limit)}(0,e,t);if(e instanceof ke)return function(s,i,a){const o=i.orderings.map(u=>({ks:V(u.expr),direction:u.direction}));return[...a].sort((u,c)=>{for(const{ks:l,direction:d}of o){const f=Xt(l.evaluate(s,u)),g=Xt(l.evaluate(s,c)),T=le(f??Vt,g??Vt);if(T!==0)return d==="ascending"?T:-T}return 0})}(n,e,t);throw new Error(`Unknown stage: ${e._name}`)}function Hr(n){const e=function(r){for(let s=r.stages.length-1;s>=0;s--){const i=r.stages[s];if(i instanceof ke)return i.orderings}throw new Error("Pipeline must contain at least one Sort stage")}(n);return(t,r)=>{for(const s of e){const i=Xt(V(s.expr).evaluate({serializer:n.serializer},t)),a=Xt(V(s.expr).evaluate({serializer:n.serializer},r)),o=le(i||Vt,a||Vt);if(o!==0)return s.direction==="ascending"?o:-o}return 0}}function Or(n){for(let e=n.stages.length-1;e>=0;e--){const t=n.stages[e];if(t instanceof ft)return{limit:t.limit}}}/**
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
 */class Bh{constructor(){this.changes=new mt(e=>e.toString(),(e,t)=>e.isEqual(t)),this.changesApplied=!1}addEntry(e){this.assertNotApplied(),this.changes.set(e.key,e)}removeEntry(e,t){this.assertNotApplied(),this.changes.set(e,J.newInvalidDocument(e).setReadTime(t))}getEntry(e,t){this.assertNotApplied();const r=this.changes.get(t);return r!==void 0?p.resolve(r):this.getFromCache(e,t)}getEntries(e,t){return this.getAllFromCache(e,t)}apply(e){return this.assertNotApplied(),this.changesApplied=!0,this.applyChanges(e)}assertNotApplied(){}}/**
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
 *//**
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
 */class $h{constructor(e,t){this.overlayedDocument=e,this.mutatedFields=t}}/**
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
 */class zh{constructor(e,t,r,s){this.remoteDocumentCache=e,this.mutationQueue=t,this.documentOverlayCache=r,this.indexManager=s}getDocument(e,t){let r=null;return this.documentOverlayCache.getOverlay(e,t).next(s=>(r=s,this.remoteDocumentCache.getEntry(e,t))).next(s=>(r!==null&&jt(r.mutation,s,pe.empty(),L.now()),s))}getDocuments(e,t){return this.remoteDocumentCache.getEntries(e,t).next(r=>this.getLocalViewOfDocuments(e,r,x()).next(()=>r))}getLocalViewOfDocuments(e,t,r=x()){const s=Be();return this.populateOverlays(e,s,t).next(()=>this.computeViews(e,t,s,r).next(i=>{let a=yt();return i.forEach((o,u)=>{a=a.insert(o,u.overlayedDocument)}),a}))}getOverlayedDocuments(e,t){const r=Be();return this.populateOverlays(e,r,t).next(()=>this.computeViews(e,t,r,x()))}populateOverlays(e,t,r){const s=[];return r.forEach(i=>{t.has(i)||s.push(i)}),this.documentOverlayCache.getOverlays(e,s).next(i=>{i.forEach((a,o)=>{t.set(a,o)})})}computeViews(e,t,r,s){let i=oe();const a=Ht(),o=function(){return Ht()}();return t.forEach((u,c)=>{const l=r.get(c.key);s.has(c.key)&&(l===void 0||l.mutation instanceof it)?i=i.insert(c.key,c):l!==void 0?(a.set(c.key,l.mutation.getFieldMask()),jt(l.mutation,c,l.mutation.getFieldMask(),L.now())):a.set(c.key,pe.empty())}),this.recalculateAndSaveOverlays(e,i).next(u=>(u.forEach((c,l)=>a.set(c,l)),t.forEach((c,l)=>o.set(c,new $h(l,a.get(c)??null))),o))}recalculateAndSaveOverlays(e,t){const r=Ht();let s=new M((a,o)=>a-o),i=x();return this.mutationQueue.getAllMutationBatchesAffectingDocumentKeys(e,t).next(a=>{for(const o of a)o.keys().forEach(u=>{const c=t.get(u);if(c===null)return;let l=r.get(u)||pe.empty();l=o.applyToLocalView(c,l),r.set(u,l);const d=(s.get(o.batchId)||x()).add(u);s=s.insert(o.batchId,d)})}).next(()=>{const a=[],o=s.getReverseIterator();for(;o.hasNext();){const u=o.getNext(),c=u.key,l=u.value,d=Oa();l.forEach(f=>{if(!i.has(f)){const g=Ea(t.get(f),r.get(f));g!==null&&d.set(f,g),i=i.add(f)}}),a.push(this.documentOverlayCache.saveOverlays(e,c,d))}return p.waitFor(a)}).next(()=>r)}recalculateAndSaveOverlaysForDocumentKeys(e,t){return this.remoteDocumentCache.getEntries(e,t).next(r=>this.recalculateAndSaveOverlays(e,r))}getDocumentsMatchingQuery(e,t,r,s){return H(t)?this.getDocumentsMatchingPipeline(e,t,r,s):sc(t)?this.getDocumentsMatchingDocumentQuery(e,t.path):ba(t)?this.getDocumentsMatchingCollectionGroupQuery(e,t,r,s):this.getDocumentsMatchingCollectionQuery(e,t,r,s)}getNextDocuments(e,t,r,s){return this.remoteDocumentCache.getAllFromCollectionGroup(e,t,r,s).next(i=>{const a=s-i.size>0?this.documentOverlayCache.getOverlaysForCollectionGroup(e,t,r.largestBatchId,s-i.size):p.resolve(Be());let o=Zt,u=i;return a.next(c=>p.forEach(c,(l,d)=>(o<d.largestBatchId&&(o=d.largestBatchId),i.get(l)?p.resolve():this.remoteDocumentCache.getEntry(e,l).next(f=>{u=u.insert(l,f)}))).next(()=>this.populateOverlays(e,c,i)).next(()=>this.computeViews(e,u,c,x())).next(l=>({batchId:o,changes:La(l)})))})}getDocumentsMatchingDocumentQuery(e,t){return this.getDocument(e,new v(t)).next(r=>{let s=yt();return r.isFoundDocument()&&(s=s.insert(r.key,r)),s})}getDocumentsMatchingCollectionGroupQuery(e,t,r,s){const i=t.collectionGroup;let a=yt();return this.indexManager.getCollectionParents(e,i).next(o=>p.forEach(o,u=>{const c=function(d,f){return new Dt(f,null,d.explicitOrderBy.slice(),d.filters.slice(),d.limit,d.limitType,d.startAt,d.endAt)}(t,u.child(i));return this.getDocumentsMatchingCollectionQuery(e,c,r,s).next(l=>{l.forEach((d,f)=>{a=a.insert(d,f)})})}).next(()=>a))}getDocumentsMatchingCollectionQuery(e,t,r,s){let i;return this.documentOverlayCache.getOverlaysForCollection(e,t.path,r.largestBatchId).next(a=>(i=a,this.remoteDocumentCache.getDocumentsMatchingQuery(e,t,r,i,s))).next(a=>this.retrieveMatchingLocalDocuments(i,a,o=>pr(t,o)))}getDocumentsMatchingPipeline(e,t,r,s){if(Qe(t)==="collection_group"){const i=As(t);let a=yt();return this.indexManager.getCollectionParents(e,i).next(o=>p.forEach(o,u=>{const c=function(d,f){const g=d.stages.map(T=>T instanceof Ir?new wr(f.canonicalString(),{}):T);return new ie(d.serializer,g)}(t,u.child(i));return this.getDocumentsMatchingPipeline(e,c,r,s).next(l=>{l.forEach((d,f)=>{a=a.insert(d,f)})})}).next(()=>a))}{let i;return this.getOverlaysForPipeline(e,t,r.largestBatchId).next(a=>{switch(i=a,Qe(t)){case"collection":return this.remoteDocumentCache.getDocumentsMatchingQuery(e,t,r,i,s);case"documents":let o=x();for(const u of Wr(t))o=o.add(v.fromPath(u));return this.remoteDocumentCache.getEntries(e,o);case"database":return this.remoteDocumentCache.getAllEntries(e);default:throw new y("invalid-argument",`Invalid pipeline source to execute offline: ${Oe(t)}`)}}).next(a=>this.retrieveMatchingLocalDocuments(i,a,o=>Pr(t,o)))}}retrieveMatchingLocalDocuments(e,t,r){e.forEach((i,a)=>{const o=a.getKey();t.get(o)===null&&(t=t.insert(o,J.newInvalidDocument(o)))});let s=yt();return t.forEach((i,a)=>{const o=e.get(i);o!==void 0&&jt(o.mutation,a,pe.empty(),L.now()),r(a)&&(s=s.insert(i,a))}),s}getOverlaysForPipeline(e,t,r){switch(Qe(t)){case"collection":return this.documentOverlayCache.getOverlaysForCollection(e,D.fromString(vr(t)),r);case"collection_group":throw new y("invalid-argument",`Unexpected collection group pipeline: ${Oe(t)}`);case"documents":return this.documentOverlayCache.getOverlays(e,Wr(t).map(s=>v.fromPath(s)));case"database":return this.documentOverlayCache.getAllOverlays(e,r);default:throw new y("invalid-argument",`Failed to get overlays for pipeline: ${Oe(t)}`)}}}/**
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
 */class Qh{constructor(e){this.serializer=e,this.Hs=new Map,this.Js=new Map}getBundleMetadata(e,t){return p.resolve(this.Hs.get(t))}saveBundleMetadata(e,t){return this.Hs.set(t.id,function(s){return{id:s.id,version:s.version,createTime:ye(s.createTime)}}(t)),p.resolve()}getNamedQuery(e,t){return p.resolve(this.Js.get(t))}saveNamedQuery(e,t){return this.Js.set(t.name,function(s){return{name:s.name,query:Oh(s.bundledQuery),readTime:ye(s.readTime)}}(t)),p.resolve()}}/**
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
 */class Gh{constructor(){this.overlays=new M(v.comparator),this.Ys=new Map}getOverlay(e,t){return p.resolve(this.overlays.get(t))}getOverlays(e,t){const r=Be();return p.forEach(t,s=>this.getOverlay(e,s).next(i=>{i!==null&&r.set(s,i)})).next(()=>r)}getAllOverlays(e,t){const r=Be();return this.overlays.forEach((s,i)=>{i.largestBatchId>t&&r.set(s,i)}),p.resolve(r)}saveOverlays(e,t,r){return r.forEach((s,i)=>{this.Hr(e,t,i)}),p.resolve()}removeOverlaysForBatchId(e,t,r){const s=this.Ys.get(r);return s!==void 0&&(s.forEach(i=>this.overlays=this.overlays.remove(i)),this.Ys.delete(r)),p.resolve()}getOverlaysForCollection(e,t,r){const s=Be(),i=t.length+1,a=new v(t.child("")),o=this.overlays.getIteratorFrom(a);for(;o.hasNext();){const u=o.getNext().value,c=u.getKey();if(!t.isPrefixOf(c.path))break;c.path.length===i&&u.largestBatchId>r&&s.set(u.getKey(),u)}return p.resolve(s)}getOverlaysForCollectionGroup(e,t,r,s){let i=new M((c,l)=>c-l);const a=this.overlays.getIterator();for(;a.hasNext();){const c=a.getNext().value;if(c.getKey().getCollectionGroup()===t&&c.largestBatchId>r){let l=i.get(c.largestBatchId);l===null&&(l=Be(),i=i.insert(c.largestBatchId,l)),l.set(c.getKey(),c)}}const o=Be(),u=i.getIterator();for(;u.hasNext()&&(u.getNext().value.forEach((c,l)=>o.set(c,l)),!(o.size()>=s)););return p.resolve(o)}Hr(e,t,r){const s=this.overlays.get(r.key);if(s!==null){const a=this.Ys.get(s.largestBatchId).delete(r.key);this.Ys.set(s.largestBatchId,a)}this.overlays=this.overlays.insert(r.key,new kh(t,r));let i=this.Ys.get(t);i===void 0&&(i=x(),this.Ys.set(t,i)),this.Ys.set(t,i.add(r.key))}}/**
 * @license
 * Copyright 2024 Google LLC
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
 */class jh{constructor(){this.sessionToken=j.EMPTY_BYTE_STRING}getSessionToken(e){return p.resolve(this.sessionToken)}setSessionToken(e,t){return this.sessionToken=t,p.resolve()}}/**
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
 */class bs{constructor(){this.Zs=new G(Y.Xs),this.e_=new G(Y.t_)}isEmpty(){return this.Zs.isEmpty()}addReference(e,t){const r=new Y(e,t);this.Zs=this.Zs.add(r),this.e_=this.e_.add(r)}n_(e,t){e.forEach(r=>this.addReference(r,t))}removeReference(e,t){this.r_(new Y(e,t))}i_(e,t){e.forEach(r=>this.removeReference(r,t))}s_(e){const t=new v(new D([])),r=new Y(t,e),s=new Y(t,e+1),i=[];return this.e_.forEachInRange([r,s],a=>{this.r_(a),i.push(a.key)}),i}__(){this.Zs.forEach(e=>this.r_(e))}r_(e){this.Zs=this.Zs.delete(e),this.e_=this.e_.delete(e)}o_(e){const t=new v(new D([])),r=new Y(t,e),s=new Y(t,e+1);let i=x();return this.e_.forEachInRange([r,s],a=>{i=i.add(a.key)}),i}containsKey(e){const t=new Y(e,0),r=this.Zs.firstAfterOrEqual(t);return r!==null&&e.isEqual(r.key)}}class Y{constructor(e,t){this.key=e,this.a_=t}static Xs(e,t){return v.comparator(e.key,t.key)||b(e.a_,t.a_)}static t_(e,t){return b(e.a_,t.a_)||v.comparator(e.key,t.key)}}/**
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
 */class Kh{constructor(e,t){this.indexManager=e,this.referenceDelegate=t,this.mutationQueue=[],this.gs=1,this.u_=new G(Y.Xs)}checkEmpty(e){return p.resolve(this.mutationQueue.length===0)}addMutationBatch(e,t,r,s){const i=this.gs;this.gs++,this.mutationQueue.length>0&&this.mutationQueue[this.mutationQueue.length-1];const a=new Dh(i,t,r,s);this.mutationQueue.push(a);for(const o of s)this.u_=this.u_.add(new Y(o.key,i)),this.indexManager.addToCollectionParentIndex(e,o.key.path.popLast());return p.resolve(a)}lookupMutationBatch(e,t){return p.resolve(this.c_(t))}getNextMutationBatchAfterBatchId(e,t){const r=t+1,s=this.l_(r),i=s<0?0:s;return p.resolve(this.mutationQueue.length>i?this.mutationQueue[i]:null)}getHighestUnacknowledgedBatchId(){return p.resolve(this.mutationQueue.length===0?is:this.gs-1)}getAllMutationBatches(e){return p.resolve(this.mutationQueue.slice())}getAllMutationBatchesAffectingDocumentKey(e,t){const r=new Y(t,0),s=new Y(t,Number.POSITIVE_INFINITY),i=[];return this.u_.forEachInRange([r,s],a=>{const o=this.c_(a.a_);i.push(o)}),p.resolve(i)}getAllMutationBatchesAffectingDocumentKeys(e,t){let r=new G(b);return t.forEach(s=>{const i=new Y(s,0),a=new Y(s,Number.POSITIVE_INFINITY);this.u_.forEachInRange([i,a],o=>{r=r.add(o.a_)})}),p.resolve(this.E_(r))}getAllMutationBatchesAffectingQuery(e,t){const r=t.path,s=r.length+1;let i=r;v.isDocumentKey(i)||(i=i.child(""));const a=new Y(new v(i),0);let o=new G(b);return this.u_.forEachWhile(u=>{const c=u.key.path;return!!r.isPrefixOf(c)&&(c.length===s&&(o=o.add(u.a_)),!0)},a),p.resolve(this.E_(o))}E_(e){const t=[];return e.forEach(r=>{const s=this.c_(r);s!==null&&t.push(s)}),t}removeMutationBatch(e,t){I(this.h_(t.batchId,"removed")===0,55003),this.mutationQueue.shift();let r=this.u_;return p.forEach(t.mutations,s=>{const i=new Y(s.key,t.batchId);return r=r.delete(i),this.referenceDelegate.markPotentiallyOrphaned(e,s.key)}).next(()=>{this.u_=r})}bs(e){}containsKey(e,t){const r=new Y(t,0),s=this.u_.firstAfterOrEqual(r);return p.resolve(t.isEqual(s&&s.key))}performConsistencyCheck(e){return this.mutationQueue.length,p.resolve()}h_(e,t){return this.l_(e)}l_(e){return this.mutationQueue.length===0?0:e-this.mutationQueue[0].batchId}c_(e){const t=this.l_(e);return t<0||t>=this.mutationQueue.length?null:this.mutationQueue[t]}}/**
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
 */class Wh{constructor(e){this.T_=e,this.docs=function(){return new M(v.comparator)}(),this.size=0}setIndexManager(e){this.indexManager=e}addEntry(e,t){const r=t.key,s=this.docs.get(r),i=s?s.size:0,a=this.T_(t);return this.docs=this.docs.insert(r,{document:t.mutableCopy(),size:a}),this.size+=a-i,this.indexManager.addToCollectionParentIndex(e,r.path.popLast())}removeEntry(e){const t=this.docs.get(e);t&&(this.docs=this.docs.remove(e),this.size-=t.size)}getEntry(e,t){const r=this.docs.get(t);return p.resolve(r?r.document.mutableCopy():J.newInvalidDocument(t))}getEntries(e,t){let r=oe();return t.forEach(s=>{const i=this.docs.get(s);r=r.insert(s,i?i.document.mutableCopy():J.newInvalidDocument(s))}),p.resolve(r)}getAllEntries(e){let t=oe();return this.docs.forEach((r,s)=>{t=t.insert(r,s.document)}),p.resolve(t)}getDocumentsMatchingQuery(e,t,r,s){let i,a;H(t)?(i=D.fromString(vr(t)),a=l=>Pr(t,l)):(i=t.path,a=l=>pr(t,l));let o=oe();const u=new v(i.child("__id-9223372036854775808__")),c=this.docs.getIteratorFrom(u);for(;c.hasNext();){const{key:l,value:{document:d}}=c.getNext();if(!i.isPrefixOf(l.path))break;l.path.length>i.length+1||Pu(Ru(d),r)<=0||(s.has(d.key)||a(d))&&(o=o.insert(d.key,d.mutableCopy()))}return p.resolve(o)}getAllFromCollectionGroup(e,t,r,s){A(9500)}P_(e,t){return p.forEach(this.docs,r=>t(r))}newChangeBuffer(e){return new Hh(this)}getSize(e){return p.resolve(this.size)}}class Hh extends Bh{constructor(e){super(),this.zs=e}applyChanges(e){const t=[];return this.changes.forEach((r,s)=>{s.isValidDocument()?t.push(this.zs.addEntry(e,s)):this.zs.removeEntry(r)}),p.waitFor(t)}getFromCache(e,t){return this.zs.getEntry(e,t)}getAllFromCache(e,t){return this.zs.getEntries(e,t)}}/**
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
 */class Yh{constructor(e){this.persistence=e,this.R_=new mt(t=>Io(t),Ao),this.lastRemoteSnapshotVersion=R.min(),this.highestTargetId=0,this.I_=0,this.A_=new bs,this.targetCount=0,this.V_=tt.xs()}forEachTarget(e,t){return this.R_.forEach((r,s)=>t(s)),p.resolve()}getLastRemoteSnapshotVersion(e){return p.resolve(this.lastRemoteSnapshotVersion)}getHighestSequenceNumber(e){return p.resolve(this.I_)}allocateTargetId(e){return this.highestTargetId=this.V_.next(),p.resolve(this.highestTargetId)}setTargetsMetadata(e,t,r){return r&&(this.lastRemoteSnapshotVersion=r),t>this.I_&&(this.I_=t),p.resolve()}Ms(e){this.R_.set(e.target,e);const t=e.targetId;t>this.highestTargetId&&(this.V_=new tt(t),this.highestTargetId=t),e.sequenceNumber>this.I_&&(this.I_=e.sequenceNumber)}addTargetData(e,t){return this.Ms(t),this.targetCount+=1,p.resolve()}updateTargetData(e,t){return this.Ms(t),p.resolve()}removeTargetData(e,t){return this.R_.delete(t.target),this.A_.s_(t.targetId),this.targetCount-=1,p.resolve()}removeTargets(e,t,r){let s=0;const i=[];return this.R_.forEach((a,o)=>{o.sequenceNumber<=t&&r.get(o.targetId)===null&&(this.R_.delete(a),i.push(this.removeMatchingKeysForTargetId(e,o.targetId)),s++)}),p.waitFor(i).next(()=>s)}getTargetCount(e){return p.resolve(this.targetCount)}getTargetData(e,t){const r=this.R_.get(t)||null;return p.resolve(r)}addMatchingKeys(e,t,r){return this.A_.n_(t,r),p.resolve()}removeMatchingKeys(e,t,r){this.A_.i_(t,r);const s=this.persistence.referenceDelegate,i=[];return s&&t.forEach(a=>{i.push(s.markPotentiallyOrphaned(e,a))}),p.waitFor(i)}removeMatchingKeysForTargetId(e,t){return this.A_.s_(t),p.resolve()}getMatchingKeysForTargetId(e,t){const r=this.A_.o_(t);return p.resolve(r)}containsKey(e,t){return p.resolve(this.A_.containsKey(t))}}/**
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
 */class Vo{constructor(e,t){this.d_={},this.overlays={},this.f_=new lr(0),this.m_=!1,this.m_=!0,this.p_=new jh,this.referenceDelegate=e(this),this.g_=new Yh(this),this.indexManager=new Mh,this.remoteDocumentCache=function(s){return new Wh(s)}(r=>this.referenceDelegate.y_(r)),this.serializer=new Lh(t),this.w_=new Qh(this.serializer)}start(){return Promise.resolve()}shutdown(){return this.m_=!1,Promise.resolve()}get started(){return this.m_}setDatabaseDeletedListener(){}setNetworkEnabled(){}getIndexManager(e){return this.indexManager}getDocumentOverlayCache(e){let t=this.overlays[e.toKey()];return t||(t=new Gh,this.overlays[e.toKey()]=t),t}getMutationQueue(e,t){let r=this.d_[e.toKey()];return r||(r=new Kh(t,this.referenceDelegate),this.d_[e.toKey()]=r),r}getGlobalsCache(){return this.p_}getTargetCache(){return this.g_}getRemoteDocumentCache(){return this.remoteDocumentCache}getBundleCache(){return this.w_}runTransaction(e,t,r){w("MemoryPersistence","Starting transaction:",e);const s=new Jh(this.f_.next());return this.referenceDelegate.b_(),r(s).next(i=>this.referenceDelegate.v_(s).next(()=>i)).toPromise().then(i=>(s.raiseOnCommittedEvent(),i))}S_(e,t){return p.or(Object.values(this.d_).map(r=>()=>r.containsKey(e,t)))}}class Jh extends Su{constructor(e){super(),this.currentSequenceNumber=e}}class Ns{constructor(e){this.persistence=e,this.D_=new bs,this.x_=null}static C_(e){return new Ns(e)}get F_(){if(this.x_)return this.x_;throw A(60996)}addReference(e,t,r){return this.D_.addReference(r,t),this.F_.delete(r.toString()),p.resolve()}removeReference(e,t,r){return this.D_.removeReference(r,t),this.F_.add(r.toString()),p.resolve()}markPotentiallyOrphaned(e,t){return this.F_.add(t.toString()),p.resolve()}removeTarget(e,t){this.D_.s_(t.targetId).forEach(s=>this.F_.add(s.toString()));const r=this.persistence.getTargetCache();return r.getMatchingKeysForTargetId(e,t.targetId).next(s=>{s.forEach(i=>this.F_.add(i.toString()))}).next(()=>r.removeTargetData(e,t))}b_(){this.x_=new Set}v_(e){const t=this.persistence.getRemoteDocumentCache().newChangeBuffer();return p.forEach(this.F_,r=>{const s=v.fromPath(r);return this.O_(e,s).next(i=>{i||t.removeEntry(s,R.min())})}).next(()=>(this.x_=null,t.apply(e)))}updateLimboDocument(e,t){return this.O_(e,t).next(r=>{r?this.F_.delete(t.toString()):this.F_.add(t.toString())})}y_(e){return 0}O_(e,t){return p.or([()=>p.resolve(this.D_.containsKey(t)),()=>this.persistence.getTargetCache().containsKey(e,t),()=>this.persistence.S_(e,t)])}}class rr{constructor(e,t){this.persistence=e,this.M_=new mt(r=>Du(r.path),(r,s)=>r.isEqual(s)),this.garbageCollector=Jc(this,t)}static C_(e,t){return new rr(e,t)}b_(){}v_(e){return p.resolve()}forEachTarget(e,t){return this.persistence.getTargetCache().forEachTarget(e,t)}lr(e){const t=this.Ls(e);return this.persistence.getTargetCache().getTargetCount(e).next(r=>t.next(s=>r+s))}Ls(e){let t=0;return this.Er(e,r=>{t++}).next(()=>t)}Er(e,t){return p.forEach(this.M_,(r,s)=>this.Us(e,r,s).next(i=>i?p.resolve():t(s)))}removeTargets(e,t,r){return this.persistence.getTargetCache().removeTargets(e,t,r)}removeOrphanedDocuments(e,t){let r=0;const s=this.persistence.getRemoteDocumentCache(),i=s.newChangeBuffer();return s.P_(e,a=>this.Us(e,a,t).next(o=>{o||(r++,i.removeEntry(a,R.min()))})).next(()=>i.apply(e)).next(()=>r)}markPotentiallyOrphaned(e,t){return this.M_.set(t,e.currentSequenceNumber),p.resolve()}removeTarget(e,t){const r=t.withSequenceNumber(e.currentSequenceNumber);return this.persistence.getTargetCache().updateTargetData(e,r)}addReference(e,t,r){return this.M_.set(r,e.currentSequenceNumber),p.resolve()}removeReference(e,t,r){return this.M_.set(r,e.currentSequenceNumber),p.resolve()}updateLimboDocument(e,t){return this.M_.set(t,e.currentSequenceNumber),p.resolve()}y_(e){let t=e.key.toString().length;return e.isFoundDocument()&&(t+=Bn(e.data.value)),t}Us(e,t,r){return p.or([()=>this.persistence.S_(e,t),()=>this.persistence.getTargetCache().containsKey(e,t),()=>{const s=this.M_.get(t);return p.resolve(s!==void 0&&s>r)}])}getCacheSize(e){return this.persistence.getRemoteDocumentCache().getSize(e)}}/**
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
 */class Ds{constructor(e,t,r,s){this.targetId=e,this.fromCache=t,this.wo=r,this.bo=s}static vo(e,t){let r=x(),s=x();for(const i of t.docChanges)switch(i.type){case 0:r=r.add(i.doc.key);break;case 1:s=s.add(i.doc.key)}return new Ds(e,t.fromCache,r,s)}}/**
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
 */function Xh(n,e){return v.comparator(n.key,e.key)}/**
 * @license
 * Copyright 2023 Google LLC
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
 */class Zh{constructor(){this._documentReadCount=0}get documentReadCount(){return this._documentReadCount}incrementDocumentReadCount(e){this._documentReadCount+=e}}/**
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
 */class ed{constructor(){this.So=!1,this.Do=!1,this.xo=100,this.Co=function(){return au()?8:xu(ou())>0?6:4}()}initialize(e,t){this.Fo=e,this.indexManager=t,this.So=!0}getDocumentsMatchingQuery(e,t,r,s){const i={result:null};return this.Oo(e,t).next(a=>{i.result=a}).next(()=>{if(!i.result)return this.Mo(e,t,s,r).next(a=>{i.result=a})}).next(()=>{if(i.result)return;const a=new Zh;return this.No(e,t,a).next(o=>{if(i.result=o,this.Do)return this.Lo(e,t,a,o.size)})}).next(()=>i.result)}Lo(e,t,r,s){return H(t)?p.resolve():r.documentReadCount<this.xo?(gt()<=De.DEBUG&&w("QueryEngine","SDK will not create cache indexes for query:",Wt(t),"since it only creates cache indexes for collection contains","more than or equal to",this.xo,"documents"),p.resolve()):(gt()<=De.DEBUG&&w("QueryEngine","Query:",Wt(t),"scans",r.documentReadCount,"local documents and returns",s,"documents as results."),r.documentReadCount>this.Co*s?(gt()<=De.DEBUG&&w("QueryEngine","The SDK decides to create cache indexes for query:",Wt(t),"as using cache indexes may help improve performance."),this.indexManager.createTargetIndexes(e,Ce(t))):p.resolve())}Oo(e,t){if(H(t))return p.resolve(null);let r=t;if(Ti(r))return p.resolve(null);let s=Ce(r);return this.indexManager.getIndexType(e,s).next(i=>i===0?null:(r.limit!==null&&i===1&&(r=Zn(r,null,"F"),s=Ce(r)),this.indexManager.getDocumentsMatchingTarget(e,s).next(a=>{const o=x(...a);return this.Fo.getDocuments(e,o).next(u=>this.indexManager.getMinOffset(e,s).next(c=>{const l=this.Bo(r,u);return this.Uo(r,l,o,c.readTime)?this.Oo(e,Zn(r,null,"F")):this.ko(e,l,r,c)}))})))}Mo(e,t,r,s){return(H(t)?function(a){for(const o of a.stages){if(o instanceof ft||o instanceof Li)return!1;if(o instanceof Ar){if(o.condition instanceof uo&&o.condition._expr.name==="exists"&&o.condition._expr.params[0]instanceof Ot&&o.condition._expr.params[0].fieldName===Ve)continue;return!1}}return!0}(t):Ti(t))||s.isEqual(R.min())?p.resolve(null):this.Fo.getDocuments(e,r).next(i=>{const a=this.Bo(t,i);return this.Uo(t,a,r,s)?p.resolve(null):(gt()<=De.DEBUG&&w("QueryEngine","Re-using previous result from %s to execute query: %s",s.toString(),Oi(t)),this.ko(e,a,t,Vu(s,Zt)).next(o=>o))})}Bo(e,t){let r,s;return H(e)?(r=new G(Xh),s=i=>Pr(e,i)):(r=new G(cs(e)),s=i=>pr(e,i)),t.forEach((i,a)=>{s(a)&&(r=r.add(a))}),r}Uo(e,t,r,s){if(H(e))return function(o){return o.stages.some(u=>u instanceof ft||u instanceof Li)}(e);if(e.limit===null)return!1;if(r.size!==t.size)return!0;const i=e.limitType==="F"?t.last():t.first();return!!i&&(i.hasPendingWrites||i.version.compareTo(s)>0)}No(e,t,r){return gt()<=De.DEBUG&&w("QueryEngine","Using full collection scan to execute query:",Oi(t)),this.Fo.getDocumentsMatchingQuery(e,t,We.min(),r)}ko(e,t,r,s){return this.Fo.getDocumentsMatchingQuery(e,r,s).next(i=>(t.forEach(a=>{i=i.insert(a.key,a)}),i))}}/**
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
 */const ks="LocalStore",td=3e8;class nd{constructor(e,t,r,s){this.persistence=e,this.qo=t,this.serializer=s,this.$o=new M(b),this.Ko=new mt(i=>Io(i),Ao),this.Wo=new Map,this.Qo=e.getRemoteDocumentCache(),this.g_=e.getTargetCache(),this.w_=e.getBundleCache(),this.Go(r)}Go(e){this.documentOverlayCache=this.persistence.getDocumentOverlayCache(e),this.indexManager=this.persistence.getIndexManager(e),this.mutationQueue=this.persistence.getMutationQueue(e,this.indexManager),this.localDocuments=new zh(this.Qo,this.mutationQueue,this.documentOverlayCache,this.indexManager),this.Qo.setIndexManager(this.indexManager),this.qo.initialize(this.localDocuments,this.indexManager)}collectGarbage(e){return this.persistence.runTransaction("Collect garbage","readwrite-primary",t=>e.collect(t,this.$o))}}function rd(n,e,t,r){return new nd(n,e,t,r)}async function Ro(n,e){const t=P(n);return await t.persistence.runTransaction("Handle user change","readonly",r=>{let s;return t.mutationQueue.getAllMutationBatches(r).next(i=>(s=i,t.Go(e),t.mutationQueue.getAllMutationBatches(r))).next(i=>{const a=[],o=[];let u=x();for(const c of s){a.push(c.batchId);for(const l of c.mutations)u=u.add(l.key)}for(const c of i){o.push(c.batchId);for(const l of c.mutations)u=u.add(l.key)}return t.localDocuments.getDocuments(r,u).next(c=>({zo:c,removedBatchIds:a,addedBatchIds:o}))})})}function sd(n,e){const t=P(n);return t.persistence.runTransaction("Acknowledge batch","readwrite-primary",r=>{const s=e.batch.keys(),i=t.Qo.newChangeBuffer({trackRemovals:!0});return function(o,u,c,l){const d=c.batch,f=d.keys();let g=p.resolve();return f.forEach(T=>{g=g.next(()=>l.getEntry(u,T)).next(S=>{const C=c.docVersions.get(T);I(C!==null,48541),S.version.compareTo(C)<0&&(d.applyToRemoteDocument(S,c),S.isValidDocument()&&(S.setReadTime(c.commitVersion),l.addEntry(S)))})}),g.next(()=>o.mutationQueue.removeMutationBatch(u,d))}(t,r,e,i).next(()=>i.apply(r)).next(()=>t.mutationQueue.performConsistencyCheck(r)).next(()=>t.documentOverlayCache.removeOverlaysForBatchId(r,s,e.batch.batchId)).next(()=>t.localDocuments.recalculateAndSaveOverlaysForDocumentKeys(r,function(o){let u=x();for(let c=0;c<o.mutationResults.length;++c)o.mutationResults[c].transformResults.length>0&&(u=u.add(o.batch.mutations[c].key));return u}(e))).next(()=>t.localDocuments.getDocuments(r,s))})}function Po(n){const e=P(n);return e.persistence.runTransaction("Get last remote snapshot version","readonly",t=>e.g_.getLastRemoteSnapshotVersion(t))}function id(n,e){const t=P(n),r=e.snapshotVersion;let s=t.$o;return t.persistence.runTransaction("Apply remote event","readwrite-primary",i=>{const a=t.Qo.newChangeBuffer({trackRemovals:!0});s=t.$o;const o=[];e.targetChanges.forEach((l,d)=>{const f=s.get(d);if(!f)return;o.push(t.g_.removeMatchingKeys(i,l.removedDocuments,d).next(()=>t.g_.addMatchingKeys(i,l.addedDocuments,d)));let g=f.withSequenceNumber(i.currentSequenceNumber);e.targetMismatches.get(d)!==null?g=g.withResumeToken(j.EMPTY_BYTE_STRING,R.min()).withLastLimboFreeSnapshotVersion(R.min()):l.resumeToken.approximateByteSize()>0&&(g=g.withResumeToken(l.resumeToken,r)),s=s.insert(d,g),function(S,C,k){return S.resumeToken.approximateByteSize()===0||C.snapshotVersion.toMicroseconds()-S.snapshotVersion.toMicroseconds()>=td?!0:k.addedDocuments.size+k.modifiedDocuments.size+k.removedDocuments.size>0}(f,g,l)&&o.push(t.g_.updateTargetData(i,g))});let u=oe(),c=x();if(e.documentUpdates.forEach(l=>{e.resolvedLimboDocuments.has(l)&&o.push(t.persistence.referenceDelegate.updateLimboDocument(i,l))}),o.push(ad(i,a,e.documentUpdates).next(l=>{u=l.jo,c=l.Ho})),!r.isEqual(R.min())){const l=t.g_.getLastRemoteSnapshotVersion(i).next(d=>t.g_.setTargetsMetadata(i,i.currentSequenceNumber,r));o.push(l)}return p.waitFor(o).next(()=>a.apply(i)).next(()=>t.localDocuments.getLocalViewOfDocuments(i,u,c)).next(()=>u)}).then(i=>(t.$o=s,i))}function ad(n,e,t){let r=x(),s=x();return t.forEach(i=>r=r.add(i)),e.getEntries(n,r).next(i=>{let a=oe();return t.forEach((o,u)=>{const c=i.get(o);u.isFoundDocument()!==c.isFoundDocument()&&(s=s.add(o)),u.isNoDocument()&&u.version.isEqual(R.min())?(e.removeEntry(o,u.readTime),a=a.insert(o,u)):!c.isValidDocument()||u.version.compareTo(c.version)>0||u.version.compareTo(c.version)===0&&c.hasPendingWrites?(e.addEntry(u),a=a.insert(o,u)):w(ks,"Ignoring outdated watch update for ",o,". Current version:",c.version," Watch version:",u.version)}),{jo:a,Ho:s}})}function od(n,e){const t=P(n);return t.persistence.runTransaction("Get next mutation batch","readonly",r=>(e===void 0&&(e=is),t.mutationQueue.getNextMutationBatchAfterBatchId(r,e)))}function ud(n,e){const t=P(n);return t.persistence.runTransaction("Allocate target","readwrite",r=>{let s;return t.g_.getTargetData(r,e).next(i=>i?(s=i,p.resolve(s)):t.g_.allocateTargetId(r).next(a=>(s=new Le(e,a,"TargetPurposeListen",r.currentSequenceNumber),t.g_.addTargetData(r,s).next(()=>s))))}).then(r=>{const s=t.$o.get(r.targetId);return(s===null||r.snapshotVersion.compareTo(s.snapshotVersion)>0)&&(t.$o=t.$o.insert(r.targetId,r),t.Ko.set(e,r.targetId)),r})}async function Yr(n,e,t){const r=P(n),s=r.$o.get(e),i=t?"readwrite":"readwrite-primary";try{t||await r.persistence.runTransaction("Release target",i,a=>r.persistence.referenceDelegate.removeTarget(a,s))}catch(a){if(!Nt(a))throw a;w(ks,`Failed to update sequence numbers for target ${e}: ${a}`)}r.$o=r.$o.remove(e),r.Ko.delete(s.target)}function Mi(n,e,t){const r=P(n);let s=R.min(),i=x();return r.persistence.runTransaction("Execute query","readwrite",a=>function(u,c,l){const d=P(u),f=d.Ko.get(l);return f!==void 0?p.resolve(d.$o.get(f)):d.g_.getTargetData(c,l)}(r,a,H(e)?e:Ce(e)).next(o=>{if(o)return s=o.lastLimboFreeSnapshotVersion,r.g_.getMatchingKeysForTargetId(a,o.targetId).next(u=>{i=u})}).next(()=>r.qo.getDocumentsMatchingQuery(a,e,t?s:R.min(),t?i:x())).next(o=>(cd(r,o),{documents:o,Jo:i})))}function cd(n,e){e.forEach((t,r)=>{const s=r.key.getCollectionGroup(),i=n.Wo.get(s)||R.min();r.readTime.compareTo(i)>0&&n.Wo.set(s,r.readTime)})}class Ui{constructor(){this.activeTargetIds=mc()}na(e){this.activeTargetIds=this.activeTargetIds.add(e)}ra(e){this.activeTargetIds=this.activeTargetIds.delete(e)}ta(){const e={activeTargetIds:this.activeTargetIds.toArray(),updateTimeMs:Date.now()};return JSON.stringify(e)}}class ld{constructor(){this.Ua=new Ui,this.ka={},this.onlineStateHandler=null,this.sequenceNumberHandler=null}addPendingMutation(e){}updateMutationState(e,t,r){}addLocalQueryTarget(e,t=!0){return t&&this.Ua.na(e),this.ka[e]||"not-current"}updateQueryState(e,t,r){this.ka[e]=t}removeLocalQueryTarget(e){this.Ua.ra(e)}isLocalQueryTarget(e){return this.Ua.activeTargetIds.has(e)}clearQueryState(e){delete this.ka[e]}getAllActiveQueryTargets(){return this.Ua.activeTargetIds}isActiveQueryTarget(e){return this.Ua.activeTargetIds.has(e)}start(){return this.Ua=new Ui,Promise.resolve()}handleUserChange(e,t,r){}setOnlineState(e){}shutdown(){}writeSequenceNumber(e){}notifyBundleLoaded(e){}}function Mr(){return typeof document<"u"?document:null}/**
 * @license
 * Copyright 2018 Google LLC
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
 */class hd{constructor(e,t){this.asyncQueue=e,this.onlineStateHandler=t,this.state="Unknown",this.qa=0,this.$a=null,this.Ka=!0}Wa(){this.qa===0&&(this.Qa("Unknown"),this.$a=this.asyncQueue.enqueueAfterDelay("online_state_timeout",1e4,()=>(this.$a=null,this.Ga("Backend didn't respond within 10 seconds."),this.Qa("Offline"),Promise.resolve())))}za(e){this.state==="Online"?this.Qa("Unknown"):(this.qa++,this.qa>=1&&(this.ja(),this.Ga(`Connection failed 1 times. Most recent error: ${e.toString()}`),this.Qa("Offline")))}set(e){this.ja(),this.qa=0,e==="Online"&&(this.Ka=!1),this.Qa(e)}Qa(e){e!==this.state&&(this.state=e,this.onlineStateHandler(e))}Ga(e){const t=`Could not reach Cloud Firestore backend. ${e}
This typically indicates that your device does not have a healthy Internet connection at the moment. The client will operate in offline mode until it is able to successfully connect to the backend.`;this.Ka?(Me(t),this.Ka=!1):w("OnlineStateTracker",t)}ja(){this.$a!==null&&(this.$a.cancel(),this.$a=null)}}/**
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
 */const be="RemoteStore";class dd{constructor(e,t,r,s,i){this.localStore=e,this.datastore=t,this.asyncQueue=r,this.remoteSyncer={},this.Ha=[],this.Ja=new Map,this.Ya=new Map,this.Za=new Map,this.Xa=new tt(1e3),this.eu=new tt(1001),this.tu=new Set,this.nu=[],this.ru=i,this.ru.bt(a=>{r.enqueueAndForget(async()=>{pt(this)&&(w(be,"Restarting streams for network reachability change."),await async function(u){const c=P(u);c.tu.add(4),await Sn(c),c.iu.set("Unknown"),c.tu.delete(4),await Cn(c)}(this))})}),this.iu=new hd(r,s)}}async function Cn(n){if(pt(n))for(const e of n.nu)await e(!0)}async function Sn(n){for(const e of n.nu)await e(!1)}function Jr(n,e){return n.Ya.get(e)||void 0}function Co(n,e){const t=P(n),r=Jr(t,e.targetId);if(r!==void 0&&t.Ja.has(r))return;const s=function(o,u){const c=Jr(o,u);c!==void 0&&o.Za.delete(c);const l=function(f,g){return g%2!=0?f.eu.next():f.Xa.next()}(o,u);return o.Ya.set(u,l),o.Za.set(l,u),l}(t,e.targetId);w(be,"remoteStoreListen mapping SDK target ID to remote",e.targetId,s);const i=new Le(e.target,s,e.purpose,e.sequenceNumber,e.snapshotVersion,e.lastLimboFreeSnapshotVersion,e.resumeToken);t.Ja.set(s,i),Us(t)?Ms(t):qt(t).Fn()&&Os(t,i)}function Ls(n,e){const t=P(n),r=qt(t),s=Jr(t,e);w(be,"remoteStoreUnlisten removing mapping of SDK target ID to remote",e,s),t.Ja.delete(s),t.Ya.delete(e),t.Za.delete(s),r.Fn()&&So(t,s),t.Ja.size===0&&(r.Fn()?r.Nn():pt(t)&&t.iu.set("Unknown"))}function Os(n,e){if(n.su.We(e.targetId),e.resumeToken.approximateByteSize()>0||e.snapshotVersion.compareTo(R.min())>0){const t=n.Za.get(e.targetId);if(t===void 0)return void w(be,"SDK target ID not found for remote ID: "+e.targetId);const r=n.remoteSyncer.getRemoteKeysForTarget(t).size;e=e.withExpectedCount(r)}qt(n).jn(e)}function So(n,e){n.su.We(e),qt(n).Hn(e)}function Ms(n){n.su=new gc({getRemoteKeysForTarget:e=>{const t=n.Za.get(e);return t!==void 0?n.remoteSyncer.getRemoteKeysForTarget(t):x()},dt:e=>n.Ja.get(e)||null,Tt:()=>n.datastore.serializer.databaseId}),qt(n).start(),n.iu.Wa()}function Us(n){return pt(n)&&!qt(n).Cn()&&n.Ja.size>0}function pt(n){return P(n).tu.size===0}function xo(n){n.su=void 0}async function fd(n){n.iu.set("Online")}async function md(n){n.Ja.forEach((e,t)=>{Os(n,e)})}async function _d(n,e){xo(n),Us(n)?(n.iu.za(e),Ms(n)):n.iu.set("Unknown")}async function pd(n,e,t){if(n.iu.set("Online"),e instanceof Ua&&e.state===2&&e.cause)try{await async function(s,i){const a=i.cause;for(const o of i.targetIds){if(s.Ja.has(o)){const u=s.Za.get(o);u!==void 0&&(await s.remoteSyncer.rejectListen(u,a),s.Ya.delete(u),s.Za.delete(o)),s.Ja.delete(o)}s.su.removeTarget(o)}}(n,e)}catch(r){w(be,"Failed to remove targets %s: %s ",e.targetIds.join(","),r),await sr(n,r)}else if(e instanceof zn?n.su.et(e):e instanceof Ma?n.su.ot(e):n.su.rt(e),!t.isEqual(R.min()))try{const r=await Po(n.localStore);t.compareTo(r)>=0&&await function(i,a){const o=i.su.Rt(a);o.targetChanges.forEach((c,l)=>{if(c.resumeToken.approximateByteSize()>0){const d=i.Ja.get(l);d&&i.Ja.set(l,d.withResumeToken(c.resumeToken,a))}}),o.targetMismatches.forEach((c,l)=>{const d=i.Ja.get(c);if(!d)return;i.Ja.set(c,d.withResumeToken(j.EMPTY_BYTE_STRING,d.snapshotVersion)),So(i,c);const f=new Le(d.target,c,l,d.sequenceNumber);Os(i,f)});const u=function(l,d){const f=new Map;d.targetChanges.forEach((T,S)=>{const C=l.Za.get(S);C!==void 0&&f.set(C,T)});let g=new M(b);return d.targetMismatches.forEach((T,S)=>{const C=l.Za.get(T);C!==void 0&&(g=g.insert(C,S))}),new An(d.snapshotVersion,f,g,d.documentUpdates,d.augmentedDocumentUpdates,d.resolvedLimboDocuments)}(i,o);return i.remoteSyncer.applyRemoteEvent(u)}(n,t)}catch(r){w(be,"Failed to raise snapshot:",r),await sr(n,r)}}async function sr(n,e,t){if(!Nt(e))throw e;n.tu.add(1),await Sn(n),n.iu.set("Offline"),t||(t=()=>Po(n.localStore)),n.asyncQueue.enqueueRetryable(async()=>{w(be,"Retrying IndexedDB access"),await t(),n.tu.delete(1),await Cn(n)})}function bo(n,e){return e().catch(t=>sr(n,t,e))}async function Cr(n){const e=P(n),t=nt(e);let r=e.Ha.length>0?e.Ha[e.Ha.length-1].batchId:is;for(;gd(e);)try{const s=await od(e.localStore,r);if(s===null){e.Ha.length===0&&t.Nn();break}r=s.batchId,yd(e,s)}catch(s){await sr(e,s)}No(e)&&Do(e)}function gd(n){return pt(n)&&n.Ha.length<10}function yd(n,e){n.Ha.push(e);const t=nt(n);t.Fn()&&t.Jn&&t.Yn(e.mutations)}function No(n){return pt(n)&&!nt(n).Cn()&&n.Ha.length>0}function Do(n){nt(n).start()}async function Ed(n){nt(n).er()}async function Td(n){const e=nt(n);for(const t of n.Ha)e.Yn(t.mutations)}async function wd(n,e,t){const r=n.Ha.shift(),s=xs.from(r,e,t);await bo(n,()=>n.remoteSyncer.applySuccessfulWrite(s)),await Cr(n)}async function Id(n,e){e&&nt(n).Jn&&await async function(r,s){if(function(a){return Na(a)&&a!==m.ABORTED}(s.code)){const i=r.Ha.shift();nt(r).Mn(),await bo(r,()=>r.remoteSyncer.rejectFailedWrite(i.batchId,s)),await Cr(r)}}(n,e),No(n)&&Do(n)}async function Fi(n,e){const t=P(n);t.asyncQueue.verifyOperationInProgress(),w(be,"RemoteStore received new credentials");const r=pt(t);t.tu.add(3),await Sn(t),r&&t.iu.set("Unknown"),await t.remoteSyncer.handleCredentialChange(e),t.tu.delete(3),await Cn(t)}async function Ad(n,e){const t=P(n);e?(t.tu.delete(2),await Cn(t)):e||(t.tu.add(2),await Sn(t),t.iu.set("Unknown"))}function qt(n){return n._u||(n._u=function(t,r,s){const i=P(t);return i.nr(),new Bc(r,i.connection,i.authCredentials,i.appCheckCredentials,i.serializer,s)}(n.datastore,n.asyncQueue,{Qt:fd.bind(null,n),zt:md.bind(null,n),Ht:_d.bind(null,n),zn:pd.bind(null,n)}),n.nu.push(async e=>{e?(n._u.Mn(),Us(n)?Ms(n):n.iu.set("Unknown")):(await n._u.stop(),xo(n))})),n._u}function nt(n){return n.ou||(n.ou=function(t,r,s){const i=P(t);return i.nr(),new $c(r,i.connection,i.authCredentials,i.appCheckCredentials,i.serializer,s)}(n.datastore,n.asyncQueue,{Qt:()=>Promise.resolve(),zt:Ed.bind(null,n),Ht:Id.bind(null,n),Zn:Td.bind(null,n),Xn:wd.bind(null,n)}),n.nu.push(async e=>{e?(n.ou.Mn(),await Cr(n)):(await n.ou.stop(),n.Ha.length>0&&(w(be,`Stopping write stream with ${n.Ha.length} pending writes`),n.Ha=[]))})),n.ou}/**
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
 */class Fs{constructor(e,t,r,s,i){this.asyncQueue=e,this.timerId=t,this.targetTimeMs=r,this.op=s,this.removalCallback=i,this.deferred=new Pe,this.then=this.deferred.promise.then.bind(this.deferred.promise),this.deferred.promise.catch(a=>{})}get promise(){return this.deferred.promise}static createAndSchedule(e,t,r,s,i){const a=Date.now()+r,o=new Fs(e,t,a,s,i);return o.start(r),o}start(e){this.timerHandle=setTimeout(()=>this.handleDelayElapsed(),e)}skipDelay(){return this.handleDelayElapsed()}cancel(e){this.timerHandle!==null&&(this.clearTimeout(),this.deferred.reject(new y(m.CANCELLED,"Operation cancelled"+(e?": "+e:""))))}handleDelayElapsed(){this.asyncQueue.enqueueAndForget(()=>this.timerHandle!==null?(this.clearTimeout(),this.op().then(e=>this.deferred.resolve(e))):Promise.resolve())}clearTimeout(){this.timerHandle!==null&&(this.removalCallback(this),clearTimeout(this.timerHandle),this.timerHandle=null)}}function qs(n,e){if(Me("AsyncQueue",`${e}: ${n}`),Nt(n))return new y(m.UNAVAILABLE,`${e}: ${n}`);throw n}/**
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
 */class ht{static emptySet(e){return new ht(e.comparator)}constructor(e){this.comparator=e?(t,r)=>e(t,r)||v.comparator(t.key,r.key):(t,r)=>v.comparator(t.key,r.key),this.keyedMap=yt(),this.sortedSet=new M(this.comparator)}has(e){return this.keyedMap.get(e)!=null}get(e){return this.keyedMap.get(e)}first(){return this.sortedSet.minKey()}last(){return this.sortedSet.maxKey()}isEmpty(){return this.sortedSet.isEmpty()}indexOf(e){const t=this.keyedMap.get(e);return t?this.sortedSet.indexOf(t):-1}get size(){return this.sortedSet.size}forEach(e){this.sortedSet.inorderTraversal((t,r)=>(e(t),!1))}add(e){const t=this.delete(e.key);return t.copy(t.keyedMap.insert(e.key,e),t.sortedSet.insert(e,null))}delete(e){const t=this.get(e);return t?this.copy(this.keyedMap.remove(e),this.sortedSet.remove(t)):this}isEqual(e){if(!(e instanceof ht)||this.size!==e.size)return!1;const t=this.sortedSet.getIterator(),r=e.sortedSet.getIterator();for(;t.hasNext();){const s=t.getNext().key,i=r.getNext().key;if(!s.isEqual(i))return!1}return!0}toString(){const e=[];return this.forEach(t=>{e.push(t.toString())}),e.length===0?"DocumentSet ()":`DocumentSet (
  `+e.join(`  
`)+`
)`}copy(e,t){const r=new ht;return r.comparator=this.comparator,r.keyedMap=e,r.sortedSet=t,r}}/**
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
 */class qi{constructor(){this.au=new M(v.comparator)}track(e){const t=e.doc.key,r=this.au.get(t);r?e.type!==0&&r.type===3?this.au=this.au.insert(t,e):e.type===3&&r.type!==1?this.au=this.au.insert(t,{type:r.type,doc:e.doc}):e.type===2&&r.type===2?this.au=this.au.insert(t,{type:2,doc:e.doc}):e.type===2&&r.type===0?this.au=this.au.insert(t,{type:0,doc:e.doc}):e.type===1&&r.type===0?this.au=this.au.remove(t):e.type===1&&r.type===2?this.au=this.au.insert(t,{type:1,doc:r.doc}):e.type===0&&r.type===1?this.au=this.au.insert(t,{type:2,doc:e.doc}):A(63341,{ft:e,uu:r}):this.au=this.au.insert(t,e)}cu(){const e=[];return this.au.inorderTraversal((t,r)=>{e.push(r)}),e}}class St{constructor(e,t,r,s,i,a,o,u,c){this.query=e,this.docs=t,this.oldDocs=r,this.docChanges=s,this.mutatedKeys=i,this.fromCache=a,this.syncStateChanged=o,this.excludesMetadataChanges=u,this.hasCachedResults=c}static fromInitialDocuments(e,t,r,s,i){const a=[];return t.forEach(o=>{a.push({type:0,doc:o})}),new St(e,t,ht.emptySet(t),a,r,s,!0,!1,i)}get hasPendingWrites(){return!this.mutatedKeys.isEmpty()}isEqual(e){if(!(this.fromCache===e.fromCache&&this.hasCachedResults===e.hasCachedResults&&this.syncStateChanged===e.syncStateChanged&&this.mutatedKeys.isEqual(e.mutatedKeys)&&Rr(this.query,e.query)&&this.docs.isEqual(e.docs)&&this.oldDocs.isEqual(e.oldDocs)))return!1;const t=this.docChanges,r=e.docChanges;if(t.length!==r.length)return!1;for(let s=0;s<t.length;s++)if(t[s].type!==r[s].type||!t[s].doc.isEqual(r[s].doc))return!1;return!0}}/**
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
 */class vd{constructor(){this.lu=void 0,this.Eu=[]}hu(){return this.Eu.some(e=>e.Tu())}}class Vd{constructor(){this.queries=Bi(),this.onlineState="Unknown",this.Pu=new Set}terminate(){(function(t,r){const s=P(t),i=s.queries;s.queries=Bi(),i.forEach((a,o)=>{for(const u of o.Eu)u.onError(r)})})(this,new y(m.ABORTED,"Firestore shutting down"))}}function Bi(){return new mt(n=>wo(n),Rr)}async function Bs(n,e){const t=P(n);let r=3;const s=e.query;let i=t.queries.get(s);i?!i.hu()&&e.Tu()&&(r=2):(i=new vd,r=e.Tu()?0:1);try{switch(r){case 0:i.lu=await t.onListen(s,!0);break;case 1:i.lu=await t.onListen(s,!1);break;case 2:await t.onFirstRemoteStoreListen(s)}}catch(a){const o=qs(a,`Initialization of query '${H(e.query)?Oe(e.query):Wt(e.query)}' failed`);return void e.onError(o)}t.queries.set(s,i),i.Eu.push(e),e.Ru(t.onlineState),i.lu&&e.Iu(i.lu)&&zs(t)}async function $s(n,e){const t=P(n),r=e.query;let s=3;const i=t.queries.get(r);if(i){const a=i.Eu.indexOf(e);a>=0&&(i.Eu.splice(a,1),i.Eu.length===0?s=e.Tu()?0:1:!i.hu()&&e.Tu()&&(s=2))}switch(s){case 0:return t.queries.delete(r),t.onUnlisten(r,!0);case 1:return t.queries.delete(r),t.onUnlisten(r,!1);case 2:return t.onLastRemoteStoreUnlisten(r);default:return}}function Rd(n,e){const t=P(n);let r=!1;for(const s of e){const i=s.query,a=t.queries.get(i);if(a){for(const o of a.Eu)o.Iu(s)&&(r=!0);a.lu=s}}r&&zs(t)}function Pd(n,e,t){const r=P(n),s=r.queries.get(e);if(s)for(const i of s.Eu)i.onError(t);r.queries.delete(e)}function zs(n){n.Pu.forEach(e=>{e.next()})}var Xr;(function(n){n.Default="default",n.Cache="cache"})(Xr||(Xr={}));class Qs{constructor(e,t,r){this.query=e,this.Au=t,this.Vu=!1,this.du=null,this.onlineState="Unknown",this.options=r||{}}Iu(e){if(!this.options.includeMetadataChanges){const r=[];for(const s of e.docChanges)s.type!==3&&r.push(s);e=new St(e.query,e.docs,e.oldDocs,r,e.mutatedKeys,e.fromCache,e.syncStateChanged,!0,e.hasCachedResults)}let t=!1;return this.Vu?this.fu(e)&&(this.Au.next(e),t=!0):this.mu(e,this.onlineState)&&(this.pu(e),t=!0),this.du=e,t}onError(e){this.Au.error(e)}Ru(e){this.onlineState=e;let t=!1;return this.du&&!this.Vu&&this.mu(this.du,e)&&(this.pu(this.du),t=!0),t}mu(e,t){if(!e.fromCache||!this.Tu())return!0;const r=t!=="Offline";return(!this.options.waitForSyncWhenOnline||!r)&&(!e.docs.isEmpty()||e.hasCachedResults||t==="Offline")}fu(e){if(e.docChanges.length>0)return!0;const t=this.du&&this.du.hasPendingWrites!==e.hasPendingWrites;return!(!e.syncStateChanged&&!t)&&this.options.includeMetadataChanges===!0}pu(e){e=St.fromInitialDocuments(e.query,e.docs,e.mutatedKeys,e.fromCache,e.hasCachedResults),this.Vu=!0,this.Au.next(e)}Tu(){return this.options.source!==Xr.Cache}}/**
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
 */class ko{constructor(e){this.key=e}}class Lo{constructor(e){this.key=e}}class Cd{constructor(e,t){this.query=e,this.Ou=t,this.Mu=null,this.hasCachedResults=!1,this.current=!1,this.Nu=x(),this.mutatedKeys=x(),this.Lu=H(e)?Hr(e):cs(e),this.Bu=new ht(this.Lu)}get Uu(){return this.Ou}ku(e,t){const r=t?t.qu:new qi,s=t?t.Bu:this.Bu;let i=t?t.mutatedKeys:this.mutatedKeys,a=s,o=!1;const[u,c]=this.$u(this.query,s);e.inorderTraversal((d,f)=>{const g=s.get(d),T=Fh(this.query,f)?f:null,S=!!g&&this.mutatedKeys.has(g.key),C=!!T&&(T.hasLocalMutations||this.mutatedKeys.has(T.key)&&T.hasCommittedMutations);let k=!1;g&&T?g.data.isEqual(T.data)?S!==C&&(r.track({type:3,doc:T}),k=!0):this.Ku(g,T)||(r.track({type:2,doc:T}),k=!0,(u&&this.Lu(T,u)>0||c&&this.Lu(T,c)<0)&&(o=!0)):!g&&T?(r.track({type:0,doc:T}),k=!0):g&&!T&&(r.track({type:1,doc:g}),k=!0,(u||c)&&(o=!0)),k&&(T?(a=a.add(T),i=C?i.add(d):i.delete(d)):(a=a.delete(d),i=i.delete(d)))});const l=this.Wu(this.query);if(l)if(H(this.query)){const d=[];a.forEach(T=>d.push(T));const f=vo(this.query,d);let g=new ht(Hr(this.query));for(const T of f)g=g.add(T);a.forEach(T=>{g.has(T.key)||(i=i.delete(T.key),r.track({type:1,doc:T}))}),a=g}else{const d=this.Qu(this.query);for(;a.size>l;){const f=d==="F"?a.last():a.first();a=a.delete(f.key),i=i.delete(f.key),r.track({type:1,doc:f})}}return{Bu:a,qu:r,Uo:o,mutatedKeys:i}}Wu(e){return H(e)?Or(e)?.limit:e.limit||void 0}Qu(e){if(H(e)){const t=Or(e);return t&&t.limit<0?"L":"F"}return e.limitType}$u(e,t){if(H(e)){const r=Or(e)?.limit;return[t.size===r?t.last():null,null]}return[e.limitType==="F"&&t.size===this.Wu(this.query)?t.last():null,e.limitType==="L"&&t.size===this.Wu(this.query)?t.first():null]}Ku(e,t){return e.hasLocalMutations&&t.hasCommittedMutations&&!t.hasLocalMutations}applyChanges(e,t,r,s){const i=this.Bu;this.Bu=e.Bu,this.mutatedKeys=e.mutatedKeys;const a=e.qu.cu();a.sort((l,d)=>function(g,T){const S=C=>{switch(C){case 0:return 1;case 2:case 3:return 2;case 1:return 0;default:return A(20277,{ft:C})}};return S(g)-S(T)}(l.type,d.type)||this.Lu(l.doc,d.doc)),this.Gu(r),s=s??!1;const o=t&&!s?this.zu():[],u=this.Nu.size===0&&this.current&&!s?1:0,c=u!==this.Mu;return this.Mu=u,a.length!==0||c?{snapshot:new St(this.query,e.Bu,i,a,e.mutatedKeys,u===0,c,!1,!!r&&r.resumeToken.approximateByteSize()>0),ju:o}:{ju:o}}Ru(e){return this.current&&e==="Offline"?(this.current=!1,this.applyChanges({Bu:this.Bu,qu:new qi,mutatedKeys:this.mutatedKeys,Uo:!1},!1)):{ju:[]}}Hu(e){return!this.Ou.has(e)&&!!this.Bu.has(e)&&!this.Bu.get(e).hasLocalMutations}Gu(e){e&&(e.addedDocuments.forEach(t=>this.Ou=this.Ou.add(t)),e.modifiedDocuments.forEach(t=>{}),e.removedDocuments.forEach(t=>this.Ou=this.Ou.delete(t)),this.current=e.current)}zu(){if(!this.current)return[];const e=this.Nu;this.Nu=x(),this.Bu.forEach(r=>{this.Hu(r.key)&&(this.Nu=this.Nu.add(r.key))});const t=[];return e.forEach(r=>{this.Nu.has(r)||t.push(new Lo(r))}),this.Nu.forEach(r=>{e.has(r)||t.push(new ko(r))}),t}Ju(e){this.Ou=e.Jo,this.Nu=x();const t=this.ku(e.documents);return this.applyChanges(t,!0)}Yu(){return St.fromInitialDocuments(this.query,this.Bu,this.mutatedKeys,this.Mu===0,this.hasCachedResults)}}const Gs="SyncEngine";class Sd{constructor(e,t,r){this.query=e,this.targetId=t,this.view=r}}class xd{constructor(e){this.key=e,this.Zu=!1}}class bd{constructor(e,t,r,s,i,a){this.localStore=e,this.remoteStore=t,this.eventManager=r,this.sharedClientState=s,this.currentUser=i,this.maxConcurrentLimboResolutions=a,this.Xu={},this.ec=new mt(o=>wo(o),Rr),this.tc=new Map,this.nc=new Set,this.rc=new M(v.comparator),this.sc=new Map,this._c=new bs,this.oc={},this.ac=new Map,this.uc=tt.Cs(),this.onlineState="Unknown",this.cc=void 0}get isPrimaryClient(){return this.cc===!0}}async function Nd(n,e,t=!0){const r=Bo(n);let s;const i=r.ec.get(e);return i?(r.sharedClientState.addLocalQueryTarget(i.targetId),s=i.view.Yu()):s=await Oo(r,e,t,!0),s}async function Dd(n,e){const t=Bo(n);await Oo(t,e,!0,!1)}async function Oo(n,e,t,r){const s=await ud(n.localStore,H(e)?e:Ce(e)),i=s.targetId,a=n.sharedClientState.addLocalQueryTarget(i,t);let o;return r&&(o=await kd(n,e,i,a==="current",s.resumeToken)),n.isPrimaryClient&&t&&Co(n.remoteStore,s),o}async function kd(n,e,t,r,s){n.lc=(d,f,g)=>async function(S,C,k,q){let fe=C.view.ku(k);fe.Uo&&(fe=await Mi(S.localStore,C.query,!1).then(({documents:kn})=>C.view.ku(kn,fe)));const at=q&&q.targetChanges.get(C.targetId),ei=q&&q.targetMismatches.get(C.targetId)!=null,Dn=C.view.applyChanges(fe,S.isPrimaryClient,at,ei);return zi(S,C.targetId,Dn.ju),Dn.snapshot}(n,d,f,g);const i=await Mi(n.localStore,e,!0),a=new Cd(e,i.Jo),o=a.ku(i.documents),u=vn.createSynthesizedTargetChangeForCurrentChange(t,r&&n.onlineState!=="Offline",s),c=a.applyChanges(o,n.isPrimaryClient,u);zi(n,t,c.ju);const l=new Sd(e,t,a);return n.ec.set(e,l),n.tc.has(t)?n.tc.get(t).push(e):n.tc.set(t,[e]),c.snapshot}async function Ld(n,e,t){const r=P(n),s=r.ec.get(e),i=r.tc.get(s.targetId);if(i.length>1)return r.tc.set(s.targetId,i.filter(a=>!Rr(a,e))),void r.ec.delete(e);r.isPrimaryClient?(r.sharedClientState.removeLocalQueryTarget(s.targetId),r.sharedClientState.isActiveQueryTarget(s.targetId)||await Yr(r.localStore,s.targetId,!1).then(()=>{r.sharedClientState.clearQueryState(s.targetId),t&&Ls(r.remoteStore,s.targetId),Zr(r,s.targetId)}).catch(bt)):(Zr(r,s.targetId),await Yr(r.localStore,s.targetId,!0))}async function Od(n,e){const t=P(n),r=t.ec.get(e),s=t.tc.get(r.targetId);t.isPrimaryClient&&s.length===1&&(t.sharedClientState.removeLocalQueryTarget(r.targetId),Ls(t.remoteStore,r.targetId))}async function Md(n,e,t){const r=Qd(n);try{const s=await function(a,o){const u=P(a),c=L.now(),l=o.reduce((g,T)=>g.add(T.key),x());let d,f;return u.persistence.runTransaction("Locally write mutations","readwrite",g=>{let T=oe(),S=x();return u.Qo.getEntries(g,l).next(C=>{T=C,T.forEach((k,q)=>{q.isValidDocument()||(S=S.add(k))})}).next(()=>u.localDocuments.getOverlayedDocuments(g,T)).next(C=>{d=C;const k=[];for(const q of o){const fe=ju(q,d.get(q.key).overlayedDocument);fe!=null&&k.push(new it(q.key,fe,fa(fe.value.mapValue),$.exists(!0)))}return u.mutationQueue.addMutationBatch(g,c,k,o)}).next(C=>{f=C;const k=C.applyToLocalDocumentSet(d,S);return u.documentOverlayCache.saveOverlays(g,C.batchId,k)})}).then(()=>({batchId:f.batchId,changes:La(d)}))}(r.localStore,e);r.sharedClientState.addPendingMutation(s.batchId),function(a,o,u){let c=a.oc[a.currentUser.toKey()];c||(c=new M(b)),c=c.insert(o,u),a.oc[a.currentUser.toKey()]=c}(r,s.batchId,t),await xn(r,s.changes),await Cr(r.remoteStore)}catch(s){const i=qs(s,"Failed to persist write");t.reject(i)}}async function Mo(n,e){const t=P(n);try{const r=await id(t.localStore,e);e.targetChanges.forEach((s,i)=>{const a=t.sc.get(i);a&&(I(s.addedDocuments.size+s.modifiedDocuments.size+s.removedDocuments.size<=1,22616),s.addedDocuments.size>0?a.Zu=!0:s.modifiedDocuments.size>0?I(a.Zu,14607):s.removedDocuments.size>0&&(I(a.Zu,42227),a.Zu=!1))}),await xn(t,r,e)}catch(r){await bt(r)}}function $i(n,e,t){const r=P(n);if(r.isPrimaryClient&&t===0||!r.isPrimaryClient&&t===1){const s=[];r.ec.forEach((i,a)=>{const o=a.view.Ru(e);o.snapshot&&s.push(o.snapshot)}),function(a,o){const u=P(a);u.onlineState=o;let c=!1;u.queries.forEach((l,d)=>{for(const f of d.Eu)f.Ru(o)&&(c=!0)}),c&&zs(u)}(r.eventManager,e),s.length&&r.Xu.zn(s),r.onlineState=e,r.isPrimaryClient&&r.sharedClientState.setOnlineState(e)}}async function Ud(n,e,t){const r=P(n);r.sharedClientState.updateQueryState(e,"rejected",t);const s=r.sc.get(e),i=s&&s.key;if(i){let a=new M(v.comparator);a=a.insert(i,J.newNoDocument(i,R.min()));const o=x().add(i),u=new An(R.min(),new Map,new M(b),a,oe(),o);await Mo(r,u),r.rc=r.rc.remove(i),r.sc.delete(e),js(r)}else await Yr(r.localStore,e,!1).then(()=>Zr(r,e,t)).catch(bt)}async function Fd(n,e){const t=P(n),r=e.batch.batchId;try{const s=await sd(t.localStore,e);Fo(t,r,null),Uo(t,r),t.sharedClientState.updateMutationState(r,"acknowledged"),await xn(t,s)}catch(s){await bt(s)}}async function qd(n,e,t){const r=P(n);try{const s=await function(a,o){const u=P(a);return u.persistence.runTransaction("Reject batch","readwrite-primary",c=>{let l;return u.mutationQueue.lookupMutationBatch(c,o).next(d=>(I(d!==null,37113),l=d.keys(),u.mutationQueue.removeMutationBatch(c,d))).next(()=>u.mutationQueue.performConsistencyCheck(c)).next(()=>u.documentOverlayCache.removeOverlaysForBatchId(c,l,o)).next(()=>u.localDocuments.recalculateAndSaveOverlaysForDocumentKeys(c,l)).next(()=>u.localDocuments.getDocuments(c,l))})}(r.localStore,e);Fo(r,e,t),Uo(r,e),r.sharedClientState.updateMutationState(e,"rejected",t),await xn(r,s)}catch(s){await bt(s)}}function Uo(n,e){(n.ac.get(e)||[]).forEach(t=>{t.resolve()}),n.ac.delete(e)}function Fo(n,e,t){const r=P(n);let s=r.oc[r.currentUser.toKey()];if(s){const i=s.get(e);i&&(t?i.reject(t):i.resolve(),s=s.remove(e)),r.oc[r.currentUser.toKey()]=s}}function Zr(n,e,t=null){n.sharedClientState.removeLocalQueryTarget(e);for(const r of n.tc.get(e))n.ec.delete(r),t&&n.Xu.Ec(r,t);n.tc.delete(e),n.isPrimaryClient&&n._c.s_(e).forEach(r=>{n._c.containsKey(r)||qo(n,r)})}function qo(n,e){n.nc.delete(e.path.canonicalString());const t=n.rc.get(e);t!==null&&(Ls(n.remoteStore,t),n.rc=n.rc.remove(e),n.sc.delete(t),js(n))}function zi(n,e,t){for(const r of t)r instanceof ko?(n._c.addReference(r.key,e),Bd(n,r)):r instanceof Lo?(w(Gs,"Document no longer in limbo: "+r.key),n._c.removeReference(r.key,e),n._c.containsKey(r.key)||qo(n,r.key)):A(19791,{hc:r})}function Bd(n,e){const t=e.key,r=t.path.canonicalString();n.rc.get(t)||n.nc.has(r)||(w(Gs,"New document in limbo: "+t),n.nc.add(r),js(n))}function js(n){for(;n.nc.size>0&&n.rc.size<n.maxConcurrentLimboResolutions;){const e=n.nc.values().next().value;n.nc.delete(e);const t=new v(D.fromString(e)),r=n.uc.next();n.sc.set(r,new xd(t)),n.rc=n.rc.insert(t,r),Co(n.remoteStore,new Le(Ce(_r(t.path)),r,"TargetPurposeLimboResolution",lr.ce))}}async function xn(n,e,t){const r=P(n),s=[],i=[],a=[];r.ec.isEmpty()||(r.ec.forEach((o,u)=>{a.push(r.lc(u,e,t).then(c=>{if((c||t)&&r.isPrimaryClient){const l=c?!c.fromCache:t?.targetChanges.get(u.targetId)?.current;r.sharedClientState.updateQueryState(u.targetId,l?"current":"not-current")}if(c){s.push(c);const l=Ds.vo(u.targetId,c);i.push(l)}}))}),await Promise.all(a),r.Xu.zn(s),await async function(u,c){const l=P(u);try{await l.persistence.runTransaction("notifyLocalViewChanges","readwrite",d=>p.forEach(c,f=>p.forEach(f.wo,g=>l.persistence.referenceDelegate.addReference(d,f.targetId,g)).next(()=>p.forEach(f.bo,g=>l.persistence.referenceDelegate.removeReference(d,f.targetId,g)))))}catch(d){if(!Nt(d))throw d;w(ks,"Failed to update sequence numbers: "+d)}for(const d of c){const f=d.targetId;if(!d.fromCache){const g=l.$o.get(f),T=g.snapshotVersion,S=g.withLastLimboFreeSnapshotVersion(T);l.$o=l.$o.insert(f,S)}}}(r.localStore,i))}async function $d(n,e){const t=P(n);if(!t.currentUser.isEqual(e)){w(Gs,"User change. New user:",e.toKey());const r=await Ro(t.localStore,e);t.currentUser=e,function(i,a){i.ac.forEach(o=>{o.forEach(u=>{u.reject(new y(m.CANCELLED,a))})}),i.ac.clear()}(t,"'waitForPendingWrites' promise is rejected due to a user change."),t.sharedClientState.handleUserChange(e,r.removedBatchIds,r.addedBatchIds),await xn(t,r.zo)}}function zd(n,e){const t=P(n),r=t.sc.get(e);if(r&&r.Zu)return x().add(r.key);{let s=x();const i=t.tc.get(e);if(!i)return s;for(const a of i??[]){const o=t.ec.get(a);s=s.unionWith(o.view.Uu)}return s}}function Bo(n){const e=P(n);return e.remoteStore.remoteSyncer.applyRemoteEvent=Mo.bind(null,e),e.remoteStore.remoteSyncer.getRemoteKeysForTarget=zd.bind(null,e),e.remoteStore.remoteSyncer.rejectListen=Ud.bind(null,e),e.Xu.zn=Rd.bind(null,e.eventManager),e.Xu.Ec=Pd.bind(null,e.eventManager),e}function Qd(n){const e=P(n);return e.remoteStore.remoteSyncer.applySuccessfulWrite=Fd.bind(null,e),e.remoteStore.remoteSyncer.rejectFailedWrite=qd.bind(null,e),e}class ir{constructor(){this.kind="memory",this.synchronizeTabs=!1}async initialize(e){this.serializer=gr(e.databaseInfo.databaseId),this.sharedClientState=this.Rc(e),this.persistence=this.Ic(e),await this.persistence.start(),this.localStore=this.Ac(e),this.gcScheduler=this.Vc(e,this.localStore),this.indexBackfillerScheduler=this.dc(e,this.localStore)}Vc(e,t){return null}dc(e,t){return null}Ac(e){return rd(this.persistence,new ed,e.initialUser,this.serializer)}Ic(e){return new Vo(Ns.C_,this.serializer)}Rc(e){return new ld}async terminate(){this.gcScheduler?.stop(),this.indexBackfillerScheduler?.stop(),this.sharedClientState.shutdown(),await this.persistence.shutdown()}}ir.provider={build:()=>new ir};class $o extends ir{constructor(e){super(),this.cacheSizeBytes=e}Vc(e,t){I(this.persistence.referenceDelegate instanceof rr,46915);const r=this.persistence.referenceDelegate.garbageCollector;return new Hc(r,e.asyncQueue,t)}Ic(e){const t=this.cacheSizeBytes!==void 0?ae.withCacheSize(this.cacheSizeBytes):ae.DEFAULT;return new Vo(r=>rr.C_(r,t),this.serializer)}}class ar{async initialize(e,t){this.localStore||(this.localStore=e.localStore,this.sharedClientState=e.sharedClientState,this.datastore=this.createDatastore(t),this.remoteStore=this.createRemoteStore(t),this.eventManager=this.createEventManager(t),this.syncEngine=this.createSyncEngine(t,!e.synchronizeTabs),this.sharedClientState.onlineStateHandler=r=>$i(this.syncEngine,r,1),this.remoteStore.remoteSyncer.handleCredentialChange=$d.bind(null,this.syncEngine),await Ad(this.remoteStore,this.syncEngine.isPrimaryClient))}createEventManager(e){return function(){return new Vd}()}createDatastore(e){const t=gr(e.databaseInfo.databaseId),r=qc(e.databaseInfo);return Gc(e.authCredentials,e.appCheckCredentials,r,t)}createRemoteStore(e){return function(r,s,i,a,o){return new dd(r,s,i,a,o)}(this.localStore,this.datastore,e.asyncQueue,t=>$i(this.syncEngine,t,0),function(){return Pi.C()?new Pi:new Oc}())}createSyncEngine(e,t){return function(s,i,a,o,u,c,l){const d=new bd(s,i,a,o,u,c);return l&&(d.cc=!0),d}(this.localStore,this.remoteStore,this.eventManager,this.sharedClientState,e.initialUser,e.maxConcurrentLimboResolutions,t)}async terminate(){await async function(t){const r=P(t);w(be,"RemoteStore shutting down."),r.tu.add(5),await Sn(r),r.ru.shutdown(),r.iu.set("Unknown")}(this.remoteStore),this.datastore?.terminate(),this.eventManager?.terminate()}}ar.provider={build:()=>new ar};/**
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
 *//**
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
 */class Ks{constructor(e){this.observer=e,this.muted=!1}next(e){this.muted||this.observer.next&&this.mc(this.observer.next,e)}error(e){this.muted||(this.observer.error?this.mc(this.observer.error,e):Me("Uncaught Error in snapshot listener:",e.toString()))}gc(){this.muted=!0}mc(e,t){setTimeout(()=>{this.muted||e(t)},0)}}/**
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
 */let Gd=class{constructor(e){this.datastore=e,this.readVersions=new Map,this.mutations=[],this.committed=!1,this.lastTransactionError=null,this.writtenDocs=new Set}async lookup(e){if(this.ensureCommitNotCalled(),this.mutations.length>0)throw this.lastTransactionError=new y(m.INVALID_ARGUMENT,"Firestore transactions require all reads to be executed before all writes."),this.lastTransactionError;const t=await async function(s,i){const a=P(s),o={documents:i.map(d=>ln(a.serializer,d))},u=await a.$t("BatchGetDocuments",a.serializer.databaseId,D.emptyPath(),o,i.length),c=new Map;u.forEach(d=>{const f=Ac(a.serializer,d);c.set(f.key.toString(),f)});const l=[];return i.forEach(d=>{const f=c.get(d.toString());I(!!f,55234,{key:d}),l.push(f)}),l}(this.datastore,e);return t.forEach(r=>this.recordVersion(r)),t}set(e,t){this.write(t.toMutation(e,this.precondition(e))),this.writtenDocs.add(e.toString())}update(e,t){try{this.write(t.toMutation(e,this.preconditionForUpdate(e)))}catch(r){this.lastTransactionError=r}this.writtenDocs.add(e.toString())}delete(e){this.write(new In(e,this.precondition(e))),this.writtenDocs.add(e.toString())}async commit(){if(this.ensureCommitNotCalled(),this.lastTransactionError)throw this.lastTransactionError;const e=this.readVersions;this.mutations.forEach(t=>{e.delete(t.key.toString())}),e.forEach((t,r)=>{const s=v.fromPath(r);this.mutations.push(new wa(s,this.precondition(s)))}),await async function(r,s){const i=P(r),a={writes:s.map(o=>za(i.serializer,o))};await i.Bt("Commit",i.serializer.databaseId,D.emptyPath(),a)}(this.datastore,this.mutations),this.committed=!0}recordVersion(e){let t;if(e.isFoundDocument())t=e.version;else{if(!e.isNoDocument())throw A(50498,{Oc:e.constructor.name});t=R.min()}const r=this.readVersions.get(e.key.toString());if(r){if(!t.isEqual(r))throw new y(m.ABORTED,"Document version changed between two reads.")}else this.readVersions.set(e.key.toString(),t)}precondition(e){const t=this.readVersions.get(e.toString());return!this.writtenDocs.has(e.toString())&&t?t.isEqual(R.min())?$.exists(!1):$.updateTime(t):$.none()}preconditionForUpdate(e){const t=this.readVersions.get(e.toString());if(!this.writtenDocs.has(e.toString())&&t){if(t.isEqual(R.min()))throw new y(m.INVALID_ARGUMENT,"Can't update a document that doesn't exist.");return $.updateTime(t)}return $.exists(!0)}write(e){this.ensureCommitNotCalled(),this.mutations.push(e)}ensureCommitNotCalled(){}};/**
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
 */class jd{constructor(e,t,r,s,i){this.asyncQueue=e,this.datastore=t,this.options=r,this.updateFunction=s,this.deferred=i,this.Mc=r.maxAttempts,this.xn=new fs(this.asyncQueue,"transaction_retry")}Nc(){this.Mc-=1,this.Lc()}Lc(){this.xn.mn(async()=>{const e=new Gd(this.datastore),t=this.Bc(e);t&&t.then(r=>{this.asyncQueue.enqueueAndForget(()=>e.commit().then(()=>{this.deferred.resolve(r)}).catch(s=>{this.Uc(s)}))}).catch(r=>{this.Uc(r)})})}Bc(e){try{const t=this.updateFunction(e);return!En(t)&&t.catch&&t.then?t:(this.deferred.reject(Error("Transaction callback must return a Promise")),null)}catch(t){return this.deferred.reject(t),null}}Uc(e){this.Mc>0&&this.kc(e)?(this.Mc-=1,this.asyncQueue.enqueueAndForget(()=>(this.Lc(),Promise.resolve()))):this.deferred.reject(e)}kc(e){if(e?.name==="FirebaseError"){const t=e.code;return t==="aborted"||t==="failed-precondition"||t==="already-exists"||!Na(t)}return!1}}/**
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
 */const rt="FirestoreClient";class Kd{constructor(e,t,r,s,i){this.authCredentials=e,this.appCheckCredentials=t,this.asyncQueue=r,this._databaseInfo=s,this.user=ne.UNAUTHENTICATED,this.clientId=ss.newId(),this.authCredentialListener=()=>Promise.resolve(),this.appCheckCredentialListener=()=>Promise.resolve(),this._uninitializedComponentsProvider=i,this.authCredentials.start(r,async a=>{w(rt,"Received user=",a.uid),await this.authCredentialListener(a),this.user=a}),this.appCheckCredentials.start(r,a=>(w(rt,"Received new app check token=",a),this.appCheckCredentialListener(a,this.user)))}get configuration(){return{asyncQueue:this.asyncQueue,databaseInfo:this._databaseInfo,clientId:this.clientId,authCredentials:this.authCredentials,appCheckCredentials:this.appCheckCredentials,initialUser:this.user,maxConcurrentLimboResolutions:100}}setCredentialChangeListener(e){this.authCredentialListener=e}setAppCheckTokenChangeListener(e){this.appCheckCredentialListener=e}terminate(){this.asyncQueue.enterRestrictedMode();const e=new Pe;return this.asyncQueue.enqueueAndForgetEvenWhileRestricted(async()=>{try{this._onlineComponents&&await this._onlineComponents.terminate(),this._offlineComponents&&await this._offlineComponents.terminate(),this.authCredentials.shutdown(),this.appCheckCredentials.shutdown(),e.resolve()}catch(t){const r=qs(t,"Failed to shutdown persistence");e.reject(r)}}),e.promise}}async function Ur(n,e){n.asyncQueue.verifyOperationInProgress(),w(rt,"Initializing OfflineComponentProvider");const t=n.configuration;await e.initialize(t);let r=t.initialUser;n.setCredentialChangeListener(async s=>{r.isEqual(s)||(await Ro(e.localStore,s),r=s)}),e.persistence.setDatabaseDeletedListener(()=>n.terminate()),n._offlineComponents=e}async function Qi(n,e){n.asyncQueue.verifyOperationInProgress();const t=await zo(n);w(rt,"Initializing OnlineComponentProvider"),await e.initialize(t,n.configuration),n.setCredentialChangeListener(r=>Fi(e.remoteStore,r)),n.setAppCheckTokenChangeListener((r,s)=>Fi(e.remoteStore,s)),n._onlineComponents=e}async function zo(n){if(!n._offlineComponents)if(n._uninitializedComponentsProvider){w(rt,"Using user provided OfflineComponentProvider");try{await Ur(n,n._uninitializedComponentsProvider._offline)}catch(e){const t=e;if(!function(s){return s.name==="FirebaseError"?s.code===m.FAILED_PRECONDITION||s.code===m.UNIMPLEMENTED:!(typeof DOMException<"u"&&s instanceof DOMException)||s.code===22||s.code===20||s.code===11}(t))throw t;Ie("Error using user provided cache. Falling back to memory cache: "+t),await Ur(n,new ir)}}else w(rt,"Using default OfflineComponentProvider"),await Ur(n,new $o(void 0));return n._offlineComponents}async function Sr(n){return n._onlineComponents||(n._uninitializedComponentsProvider?(w(rt,"Using user provided OnlineComponentProvider"),await Qi(n,n._uninitializedComponentsProvider._online)):(w(rt,"Using default OnlineComponentProvider"),await Qi(n,new ar))),n._onlineComponents}function Wd(n){return zo(n).then(e=>e.persistence)}function Hd(n){return Sr(n).then(e=>e.remoteStore)}function Yd(n){return Sr(n).then(e=>e.syncEngine)}function Jd(n){return Sr(n).then(e=>e.datastore)}async function or(n){const e=await Sr(n),t=e.eventManager;return t.onListen=Nd.bind(null,e.syncEngine),t.onUnlisten=Ld.bind(null,e.syncEngine),t.onFirstRemoteStoreListen=Dd.bind(null,e.syncEngine),t.onLastRemoteStoreUnlisten=Od.bind(null,e.syncEngine),t}function Xd(n){return n.asyncQueue.enqueue(async()=>{const e=await Wd(n),t=await Hd(n);return e.setNetworkEnabled(!0),function(s){const i=P(s);return i.tu.delete(0),Cn(i)}(t)})}function Zd(n,e,t,r){const s=new Ks(r),i=new Qs(e,s,t);return n.asyncQueue.enqueueAndForget(async()=>Bs(await or(n),i)),()=>{s.gc(),n.asyncQueue.enqueueAndForget(async()=>$s(await or(n),i))}}function Qo(n,e,t={}){const r=new Pe;return n.asyncQueue.enqueueAndForget(async()=>function(i,a,o,u,c){const l=new Ks({next:f=>{l.gc(),a.enqueueAndForget(()=>$s(i,d));const g=f.docs.has(o);!g&&f.fromCache?c.reject(new y(m.UNAVAILABLE,"Failed to get document because the client is offline.")):g&&f.fromCache&&u&&u.source==="server"?c.reject(new y(m.UNAVAILABLE,'Failed to get document from server. (However, this document does exist in the local cache. Run again without setting source to "server" to retrieve the cached document.)')):c.resolve(f)},error:f=>c.reject(f)}),d=new Qs(_r(o.path),l,{includeMetadataChanges:!0,waitForSyncWhenOnline:!0});return Bs(i,d)}(await or(n),n.asyncQueue,e,t,r)),r.promise}function Go(n,e,t={}){const r=new Pe;return n.asyncQueue.enqueueAndForget(async()=>function(i,a,o,u,c){const l=new Ks({next:f=>{l.gc(),a.enqueueAndForget(()=>$s(i,d)),f.fromCache&&u.source==="server"?c.reject(new y(m.UNAVAILABLE,'Failed to get documents from server. (However, these documents may exist in the local cache. Run again without setting source to "server" to retrieve the cached documents.)')):c.resolve(f)},error:f=>c.reject(f)}),d=new Qs(o instanceof Jt?Nh(o):o,l,{includeMetadataChanges:!0,waitForSyncWhenOnline:!0});return Bs(i,d)}(await or(n),n.asyncQueue,e,t,r)),r.promise}function ef(n,e){const t=new Pe;return n.asyncQueue.enqueueAndForget(async()=>Md(await Yd(n),e,t)),t.promise}function tf(n,e,t){const r=new Pe;return n.asyncQueue.enqueueAndForget(async()=>{const s=await Jd(n);new jd(n.asyncQueue,s,t,e,r).Nc()}),r.promise}/**
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
 */const Gi="AsyncQueue";class ji{constructor(e=Promise.resolve()){this.qc=[],this.$c=!1,this.Kc=[],this.Wc=null,this.Qc=!1,this.Gc=!1,this.zc=[],this.xn=new fs(this,"async_queue_retry"),this.jc=()=>{const r=Mr();r&&w(Gi,"Visibility state changed to "+r.visibilityState),this.xn.gn()},this.Hc=e;const t=Mr();t&&typeof t.addEventListener=="function"&&t.addEventListener("visibilitychange",this.jc)}get isShuttingDown(){return this.$c}enqueueAndForget(e){this.enqueue(e)}enqueueAndForgetEvenWhileRestricted(e){this.Jc(),this.Yc(e)}enterRestrictedMode(e){if(!this.$c){this.$c=!0,this.Gc=e||!1;const t=Mr();t&&typeof t.removeEventListener=="function"&&t.removeEventListener("visibilitychange",this.jc)}}enqueue(e){if(this.Jc(),this.$c)return new Promise(()=>{});const t=new Pe;return this.Yc(()=>this.$c&&this.Gc?Promise.resolve():(e().then(t.resolve,t.reject),t.promise)).then(()=>t.promise)}enqueueRetryable(e){this.enqueueAndForget(()=>(this.qc.push(e),this.Zc()))}async Zc(){if(this.qc.length!==0){try{await this.qc[0](),this.qc.shift(),this.xn.reset()}catch(e){if(!Nt(e))throw e;w(Gi,"Operation failed with retryable error: "+e)}this.qc.length>0&&this.xn.mn(()=>this.Zc())}}Yc(e){const t=this.Hc.then(()=>(this.Qc=!0,e().catch(r=>{throw this.Wc=r,this.Qc=!1,Me("INTERNAL UNHANDLED ERROR: ",Ki(r)),r}).then(r=>(this.Qc=!1,r))));return this.Hc=t,t}enqueueAfterDelay(e,t,r){this.Jc(),this.zc.indexOf(e)>-1&&(t=0);const s=Fs.createAndSchedule(this,e,t,r,i=>this.Xc(i));return this.Kc.push(s),s}Jc(){this.Wc&&A(47125,{el:Ki(this.Wc)})}verifyOperationInProgress(){}async tl(){let e;do e=this.Hc,await e;while(e!==this.Hc)}nl(e){for(const t of this.Kc)if(t.timerId===e)return!0;return!1}rl(e){return this.tl().then(()=>{this.Kc.sort((t,r)=>t.targetTimeMs-r.targetTimeMs);for(const t of this.Kc)if(t.skipDelay(),e!=="all"&&t.timerId===e)break;return this.tl()})}il(e){this.zc.push(e)}Xc(e){const t=this.Kc.indexOf(e);this.Kc.splice(t,1)}}function Ki(n){let e=n.message||"";return n.stack&&(e=n.stack.includes(n.message)?n.stack:n.message+`
`+n.stack),e}class de extends yr{constructor(e,t,r,s){super(e,t,r,s),this.type="firestore",this._queue=new ji,this._persistenceKey=s?.name||"[DEFAULT]"}async _terminate(){if(this._firestoreClient){const e=this._firestoreClient.terminate();this._queue=new ji(e),this._firestoreClient=void 0,await e}}}function Tf(n,e,t){t||(t=tn);const r=Zi(n,"firestore");if(r.isInitialized(t)){const s=r.getImmediate({identifier:t}),i=r.getOptions(t);if(es(i,e))return s;throw new y(m.FAILED_PRECONDITION,"initializeFirestore() has already been called with different options. To avoid this error, call initializeFirestore() with the same options as when it was originally called, or call getFirestore() to return the already initialized instance.")}if(e.cacheSizeBytes!==void 0&&e.localCache!==void 0)throw new y(m.INVALID_ARGUMENT,"cache and cacheSizeBytes cannot be specified at the same time as cacheSizeBytes willbe deprecated. Instead, specify the cache size in the cache object");if(e.cacheSizeBytes!==void 0&&e.cacheSizeBytes!==-1&&e.cacheSizeBytes<Xa)throw new y(m.INVALID_ARGUMENT,"cacheSizeBytes must be at least 1048576");return e.host&&ts(e.host)&&ea(e.host),r.initialize({options:e,instanceIdentifier:t})}function wf(n,e){const t=typeof n=="object"?n:Xo(),r=typeof n=="string"?n:tn,s=Zi(t,"firestore").getImmediate({identifier:r});if(!s._initialized){const i=Zo("firestore");i&&Xc(s,...i)}return s}function qe(n){if(n._terminated)throw new y(m.FAILED_PRECONDITION,"The client has already been terminated.");return n._firestoreClient||nf(n),n._firestoreClient}function nf(n){const e=n._freezeSettings(),t=Kc(n._databaseId,n._app?.options.appId||"",n._persistenceKey,n._app?.options.apiKey,e);n._componentsProvider||e.localCache?._offlineComponentProvider&&e.localCache?._onlineComponentProvider&&(n._componentsProvider={_offline:e.localCache._offlineComponentProvider,_online:e.localCache._onlineComponentProvider}),n._firestoreClient=new Kd(n._authCredentials,n._appCheckCredentials,n._queue,t,n._componentsProvider&&function(s){const i=s?._online.build();return{_offline:s?._offline.build(i),_online:i}}(n._componentsProvider))}function If(n){return Xd(qe(n=F(n,de)))}/**
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
 */class jo{convertValue(e,t="none"){switch(K(e)){case 0:return null;case 1:return e.booleanValue;case 2:return U(e.integerValue||e.doubleValue);case 3:return this.convertTimestamp(e.timestampValue);case 4:return this.convertServerTimestamp(e,t);case 5:return e.stringValue;case 6:return this.convertBytes(Ye(e.bytesValue));case 7:return this.convertReference(e.referenceValue);case 8:return this.convertGeoPoint(e.geoPointValue);case 9:return this.convertArray(e.arrayValue,t);case 11:return this.convertObject(e.mapValue,t);case 10:return this.convertVectorValue(e.mapValue);default:throw A(62114,{value:e})}}convertObject(e,t){return this.convertObjectMap(e.fields,t)}convertObjectMap(e,t="none"){const r={};return st(e,(s,i)=>{r[s]=this.convertValue(i,t)}),r}convertVectorValue(e){const t=e.fields?.[rn].arrayValue?.values?.map(r=>U(r.doubleValue));return new ue(t)}convertGeoPoint(e){return new Se(U(e.latitude),U(e.longitude))}convertArray(e,t){return(e.values||[]).map(r=>this.convertValue(r,t))}convertServerTimestamp(e,t){switch(t){case"previous":const r=Tn(e);return r==null?null:this.convertValue(r,t);case"estimate":return this.convertTimestamp(vt(e));default:return null}}convertTimestamp(e){const t=He(e);return new L(t.seconds,t.nanos)}convertDocumentKey(e,t){const r=D.fromString(e);I(ja(r),9688,{name:e});const s=new nn(r.get(1),r.get(3)),i=new v(r.popFirst(5));return s.isEqual(t)||Me(`Document ${i} contains a document reference within a different database (${s.projectId}/${s.database}) which is not supported. It will be treated as a reference in the current database (${t.projectId}/${t.database}) instead.`),i}}/**
 * @license
 * Copyright 2024 Google LLC
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
 */class bn extends jo{constructor(e){super(),this.firestore=e}convertBytes(e){return new _e(e)}convertReference(e){const t=this.convertDocumentKey(e,this.firestore._databaseId);return new O(this.firestore,null,t)}}const Wi="@firebase/firestore",Hi="4.16.0";/**
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
 */function Yi(n){return function(t,r){if(typeof t!="object"||t===null)return!1;const s=t;for(const i of r)if(i in s&&typeof s[i]=="function")return!0;return!1}(n,["next","error","complete"])}/**
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
 */class ur{constructor(e,t,r,s,i){this._firestore=e,this._userDataWriter=t,this._key=r,this._document=s,this._converter=i}get id(){return this._key.path.lastSegment()}get ref(){return new O(this._firestore,this._converter,this._key)}exists(){return this._document!==null}data(){if(this._document){if(this._converter){const e=new rf(this._firestore,this._userDataWriter,this._key,this._document,null);return this._converter.fromFirestore(e)}return this._userDataWriter.convertValue(this._document.data.value)}}_fieldsProto(){return this._document?.data.clone().value.mapValue.fields??void 0}get(e){if(this._document){const t=this._document.data.field(Xe("DocumentSnapshot.get",e));if(t!==null)return this._userDataWriter.convertValue(t)}}}class rf extends ur{data(){return super.data()}}/**
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
 */function Ko(n){if(n.limitType==="L"&&n.explicitOrderBy.length===0)throw new y(m.UNIMPLEMENTED,"limitToLast() queries require specifying at least one orderBy() clause")}class Ws{}class Hs extends Ws{}function Af(n,e,...t){let r=[];e instanceof Ws&&r.push(e),r=r.concat(t),function(i){const a=i.filter(u=>u instanceof Ys).length,o=i.filter(u=>u instanceof xr).length;if(a>1||a>0&&o>0)throw new y(m.INVALID_ARGUMENT,"InvalidQuery. When using composite filters, you cannot use more than one filter at the top level. Consider nesting the multiple filters within an `and(...)` statement. For example: change `query(query, where(...), or(...))` to `query(query, and(where(...), or(...)))`.")}(r);for(const s of r)n=s._apply(n);return n}class xr extends Hs{constructor(e,t,r){super(),this._field=e,this._op=t,this._value=r,this.type="where"}static _create(e,t,r){return new xr(e,t,r)}_apply(e){const t=this._parse(e);return Wo(e._query,t),new Ne(e.firestore,e.converter,zr(e._query,t))}_parse(e){const t=Lt(e.firestore);return function(i,a,o,u,c,l,d){let f;if(c.isKeyField()){if(l==="array-contains"||l==="array-contains-any")throw new y(m.INVALID_ARGUMENT,`Invalid Query. You can't perform '${l}' queries on documentId().`);if(l==="in"||l==="not-in"){Xi(d,l);const T=[];for(const S of d)T.push(Ji(u,i,S));f={arrayValue:{values:T}}}else f=Ji(u,i,d)}else l!=="in"&&l!=="not-in"&&l!=="array-contains-any"||Xi(d,l),f=sl(o,a,d,l==="in"||l==="not-in");return z.create(c,l,f)}(e._query,"where",t,e.firestore._databaseId,this._field,this._op,this._value)}}function vf(n,e,t){const r=e,s=Xe("where",n);return xr._create(s,r,t)}class Ys extends Ws{constructor(e,t){super(),this.type=e,this._queryConstraints=t}static _create(e,t){return new Ys(e,t)}_parse(e){const t=this._queryConstraints.map(r=>r._parse(e)).filter(r=>r.getFilters().length>0);return t.length===1?t[0]:Ae.create(t,this._getOperator())}_apply(e){const t=this._parse(e);return t.getFilters().length===0?e:(function(s,i){let a=s;const o=i.getFlattenedFilters();for(const u of o)Wo(a,u),a=zr(a,u)}(e._query,t),new Ne(e.firestore,e.converter,zr(e._query,t)))}_getQueryConstraints(){return this._queryConstraints}_getOperator(){return this.type==="and"?"and":"or"}}class Js extends Hs{constructor(e,t){super(),this._field=e,this._direction=t,this.type="orderBy"}static _create(e,t){return new Js(e,t)}_apply(e){const t=function(s,i,a){if(s.startAt!==null)throw new y(m.INVALID_ARGUMENT,"Invalid query. You must not call startAt() or startAfter() before calling orderBy().");if(s.endAt!==null)throw new y(m.INVALID_ARGUMENT,"Invalid query. You must not call endAt() or endBefore() before calling orderBy().");return new cn(i,a)}(e._query,this._field,this._direction);return new Ne(e.firestore,e.converter,ac(e._query,t))}}function Vf(n,e="asc"){const t=e,r=Xe("orderBy",n);return Js._create(r,t)}class Xs extends Hs{constructor(e,t,r){super(),this.type=e,this._limit=t,this._limitType=r}static _create(e,t,r){return new Xs(e,t,r)}_apply(e){return new Ne(e.firestore,e.converter,Zn(e._query,this._limit,this._limitType))}}function Rf(n){return vu("limit",n),Xs._create("limit",n,"F")}function Ji(n,e,t){if(typeof(t=Ee(t))=="string"){if(t==="")throw new y(m.INVALID_ARGUMENT,"Invalid query. When querying with documentId(), you must provide a valid document ID, but it was an empty string.");if(!ba(e)&&t.indexOf("/")!==-1)throw new y(m.INVALID_ARGUMENT,`Invalid query. When querying a collection by documentId(), you must provide a plain document ID, but '${t}' contains a '/' character.`);const r=e.path.child(D.fromString(t));if(!v.isDocumentKey(r))throw new y(m.INVALID_ARGUMENT,`Invalid query. When querying a collection group by documentId(), the value provided must result in a valid document path, but '${r}' is not because it has an odd number of segments (${r.length}).`);return di(n,new v(r))}if(t instanceof O)return di(n,t._key);throw new y(m.INVALID_ARGUMENT,`Invalid query. When querying with documentId(), you must provide a valid string or a DocumentReference, but it was: ${cr(t)}.`)}function Xi(n,e){if(!Array.isArray(n)||n.length===0)throw new y(m.INVALID_ARGUMENT,`Invalid Query. A non-empty array is required for '${e.toString()}' filters.`)}function Wo(n,e){const t=function(s,i){for(const a of s)for(const o of a.getFlattenedFilters())if(i.indexOf(o.op)>=0)return o.op;return null}(n.filters,function(s){switch(s){case"!=":return["!=","not-in"];case"array-contains-any":case"in":return["not-in"];case"not-in":return["array-contains-any","in","not-in","!="];default:return[]}}(e.op));if(t!==null)throw t===e.op?new y(m.INVALID_ARGUMENT,`Invalid query. You cannot use more than one '${e.op.toString()}' filter.`):new y(m.INVALID_ARGUMENT,`Invalid query. You cannot use '${e.op.toString()}' filters with '${t.toString()}' filters.`)}function br(n,e,t){let r;return r=n?t&&(t.merge||t.mergeFields)?n.toFirestore(e,t):n.toFirestore(e):e,r}class sf extends jo{constructor(e){super(),this.firestore=e}convertBytes(e){return new _e(e)}convertReference(e){const t=this.convertDocumentKey(e,this.firestore._databaseId);return new O(this.firestore,null,t)}}class af{constructor(e){this.kind="memory",this._onlineComponentProvider=ar.provider,this._offlineComponentProvider=e?.garbageCollector?e.garbageCollector._offlineComponentProvider:{build:()=>new $o(void 0)}}toJSON(){return{kind:this.kind}}}function Pf(n){return new af(n)}class wt{constructor(e,t){this.hasPendingWrites=e,this.fromCache=t}isEqual(e){return this.hasPendingWrites===e.hasPendingWrites&&this.fromCache===e.fromCache}}class je extends ur{constructor(e,t,r,s,i,a){super(e,t,r,s,a),this._firestore=e,this._firestoreImpl=e,this.metadata=i}exists(){return super.exists()}data(e={}){if(this._document){if(this._converter){const t=new jn(this._firestore,this._userDataWriter,this._key,this._document,this.metadata,null);return this._converter.fromFirestore(t,e)}return this._userDataWriter.convertValue(this._document.data.value,e.serverTimestamps)}}get(e,t={}){if(this._document){const r=this._document.data.field(Xe("DocumentSnapshot.get",e));if(r!==null)return this._userDataWriter.convertValue(r,t.serverTimestamps)}}toJSON(){if(this.metadata.hasPendingWrites)throw new y(m.FAILED_PRECONDITION,"DocumentSnapshot.toJSON() attempted to serialize a document with pending writes. Await waitForPendingWrites() before invoking toJSON().");const e=this._document,t={};return t.type=je._jsonSchemaVersion,t.bundle="",t.bundleSource="DocumentSnapshot",t.bundleName=this._key.toString(),!e||!e.isValidDocument()||!e.isFoundDocument()?t:(this._userDataWriter.convertObjectMap(e.data.value.mapValue.fields,"previous"),t.bundle=(this._firestore,this.ref.path,"NOT SUPPORTED"),t)}}je._jsonSchemaVersion="firestore/documentSnapshot/1.0",je._jsonSchema={type:Q("string",je._jsonSchemaVersion),bundleSource:Q("string","DocumentSnapshot"),bundleName:Q("string"),bundle:Q("string")};class jn extends je{data(e={}){return super.data(e)}}class Ke{constructor(e,t,r,s){this._firestore=e,this._userDataWriter=t,this._snapshot=s,this.metadata=new wt(s.hasPendingWrites,s.fromCache),this.query=r}get docs(){const e=[];return this.forEach(t=>e.push(t)),e}get size(){return this._snapshot.docs.size}get empty(){return this.size===0}forEach(e,t){this._snapshot.docs.forEach(r=>{e.call(t,new jn(this._firestore,this._userDataWriter,r.key,r,new wt(this._snapshot.mutatedKeys.has(r.key),this._snapshot.fromCache),this.query.converter))})}docChanges(e={}){const t=!!e.includeMetadataChanges;if(t&&this._snapshot.excludesMetadataChanges)throw new y(m.INVALID_ARGUMENT,"To include metadata changes with your document changes, you must also pass { includeMetadataChanges:true } to onSnapshot().");return this._cachedChanges&&this._cachedChangesIncludeMetadataChanges===t||(this._cachedChanges=function(s,i){if(s._snapshot.oldDocs.isEmpty()){let a=0;return s._snapshot.docChanges.map(o=>{H(s._snapshot.query)?Hr(s._snapshot.query):cs(s.query._query);const u=new jn(s._firestore,s._userDataWriter,o.doc.key,o.doc,new wt(s._snapshot.mutatedKeys.has(o.doc.key),s._snapshot.fromCache),s.query.converter);return o.doc,{type:"added",doc:u,oldIndex:-1,newIndex:a++}})}{let a=s._snapshot.oldDocs;return s._snapshot.docChanges.filter(o=>i||o.type!==3).map(o=>{const u=new jn(s._firestore,s._userDataWriter,o.doc.key,o.doc,new wt(s._snapshot.mutatedKeys.has(o.doc.key),s._snapshot.fromCache),s.query.converter);let c=-1,l=-1;return o.type!==0&&(c=a.indexOf(o.doc.key),a=a.delete(o.doc.key)),o.type!==1&&(a=a.add(o.doc),l=a.indexOf(o.doc.key)),{type:of(o.type),doc:u,oldIndex:c,newIndex:l}})}}(this,t),this._cachedChangesIncludeMetadataChanges=t),this._cachedChanges}toJSON(){if(this.metadata.hasPendingWrites)throw new y(m.FAILED_PRECONDITION,"QuerySnapshot.toJSON() attempted to serialize a document with pending writes. Await waitForPendingWrites() before invoking toJSON().");const e={};e.type=Ke._jsonSchemaVersion,e.bundleSource="QuerySnapshot",e.bundleName=ss.newId(),this._firestore._databaseId.database,this._firestore._databaseId.projectId;const t=[],r=[],s=[];return this.docs.forEach(i=>{i._document!==null&&(t.push(i._document),r.push(this._userDataWriter.convertObjectMap(i._document.data.value.mapValue.fields,"previous")),s.push(i.ref.path))}),e.bundle=(this._firestore,this.query._query,e.bundleName,"NOT SUPPORTED"),e}}function of(n){switch(n){case 0:return"added";case 2:case 3:return"modified";case 1:return"removed";default:return A(61501,{type:n})}}/**
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
 */Ke._jsonSchemaVersion="firestore/querySnapshot/1.0",Ke._jsonSchema={type:Q("string",Ke._jsonSchemaVersion),bundleSource:Q("string","QuerySnapshot"),bundleName:Q("string"),bundle:Q("string")};const uf={maxAttempts:5};/**
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
 */class cf{constructor(e,t){this._firestore=e,this._commitHandler=t,this._mutations=[],this._committed=!1,this._dataReader=Lt(e)}set(e,t,r){this._verifyNotCommitted();const s=$e(e,this._firestore),i=br(s.converter,t,r),a=Tr(this._dataReader,"WriteBatch.set",s._key,i,s.converter!==null,r);return this._mutations.push(a.toMutation(s._key,$.none())),this}update(e,t,r,...s){this._verifyNotCommitted();const i=$e(e,this._firestore);let a;return a=typeof(t=Ee(t))=="string"||t instanceof kt?gs(this._dataReader,"WriteBatch.update",i._key,t,r,s):ps(this._dataReader,"WriteBatch.update",i._key,t),this._mutations.push(a.toMutation(i._key,$.exists(!0))),this}delete(e){this._verifyNotCommitted();const t=$e(e,this._firestore);return this._mutations=this._mutations.concat(new In(t._key,$.none())),this}commit(){return this._verifyNotCommitted(),this._committed=!0,this._mutations.length>0?this._commitHandler(this._mutations):Promise.resolve()}_verifyNotCommitted(){if(this._committed)throw new y(m.FAILED_PRECONDITION,"A write batch can no longer be used after commit() has been called.")}}function $e(n,e){if((n=Ee(n)).firestore!==e)throw new y(m.INVALID_ARGUMENT,"Provided document reference is from a different Firestore instance.");return n}/**
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
 */class lf{constructor(e,t){this._firestore=e,this._transaction=t,this._dataReader=Lt(e)}get(e){const t=$e(e,this._firestore),r=new sf(this._firestore);return this._transaction.lookup([t._key]).then(s=>{if(!s||s.length!==1)return A(24041);const i=s[0];if(i.isFoundDocument())return new ur(this._firestore,r,i.key,i,t.converter);if(i.isNoDocument())return new ur(this._firestore,r,t._key,null,t.converter);throw A(18433,{doc:i})})}set(e,t,r){const s=$e(e,this._firestore),i=br(s.converter,t,r),a=Tr(this._dataReader,"Transaction.set",s._key,i,s.converter!==null,r);return this._transaction.set(s._key,a),this}update(e,t,r,...s){const i=$e(e,this._firestore);let a;return a=typeof(t=Ee(t))=="string"||t instanceof kt?gs(this._dataReader,"Transaction.update",i._key,t,r,s):ps(this._dataReader,"Transaction.update",i._key,t),this._transaction.update(i._key,a),this}delete(e){const t=$e(e,this._firestore);return this._transaction.delete(t._key),this}}/**
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
 */class hf extends lf{constructor(e,t){super(e,t),this._firestore=e}get(e){const t=$e(e,this._firestore),r=new bn(this._firestore);return super.get(e).then(s=>new je(this._firestore,r,t._key,s._document,new wt(!1,!1),t.converter))}}function Cf(n,e,t){n=F(n,de);const r={...uf,...t};(function(a){if(a.maxAttempts<1)throw new y(m.INVALID_ARGUMENT,"Max attempts must be at least 1")})(r);const s=qe(n);return tf(s,i=>e(new hf(n,i)),r)}/**
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
 */function Sf(n){n=F(n,O);const e=F(n.firestore,de),t=qe(e);return Qo(t,n._key).then(r=>Zs(e,n,r))}function xf(n){n=F(n,O);const e=F(n.firestore,de),t=qe(e);return Qo(t,n._key,{source:"server"}).then(r=>Zs(e,n,r))}function bf(n){n=F(n,Ne);const e=F(n.firestore,de),t=qe(e),r=new bn(e);return Ko(n._query),Go(t,n._query).then(s=>new Ke(e,r,n,s))}function Nf(n){n=F(n,Ne);const e=F(n.firestore,de),t=qe(e),r=new bn(e);return Go(t,n._query,{source:"server"}).then(s=>new Ke(e,r,n,s))}function Df(n,e,t){n=F(n,O);const r=F(n.firestore,de),s=br(n.converter,e,t),i=Lt(r);return Nn(r,[Tr(i,"setDoc",n._key,s,n.converter!==null,t).toMutation(n._key,$.none())])}function kf(n,e,t,...r){n=F(n,O);const s=F(n.firestore,de),i=Lt(s);let a;return a=typeof(e=Ee(e))=="string"||e instanceof kt?gs(i,"updateDoc",n._key,e,t,r):ps(i,"updateDoc",n._key,e),Nn(s,[a.toMutation(n._key,$.exists(!0))])}function Lf(n){return Nn(F(n.firestore,de),[new In(n._key,$.none())])}function Of(n,e){const t=F(n.firestore,de),r=Zc(n),s=br(n.converter,e),i=Lt(n.firestore);return Nn(t,[Tr(i,"addDoc",r._key,s,n.converter!==null,{}).toMutation(r._key,$.exists(!1))]).then(()=>r)}function Mf(n,...e){n=Ee(n);let t={includeMetadataChanges:!1,source:"default"},r=0;typeof e[r]!="object"||Yi(e[r])||(t=e[r++]);const s={includeMetadataChanges:t.includeMetadataChanges,source:t.source};if(Yi(e[r])){const c=e[r];e[r]=c.next?.bind(c),e[r+1]=c.error?.bind(c),e[r+2]=c.complete?.bind(c)}let i,a,o;if(n instanceof O)a=F(n.firestore,de),o=_r(n._key.path),i={next:c=>{e[r]&&e[r](Zs(a,n,c))},error:e[r+1],complete:e[r+2]};else{const c=F(n,Ne);a=F(c.firestore,de),o=c._query;const l=new bn(a);i={next:d=>{e[r]&&e[r](new Ke(a,l,c,d))},error:e[r+1],complete:e[r+2]},Ko(n._query)}const u=qe(a);return Zd(u,o,s,i)}function Nn(n,e){const t=qe(n);return ef(t,e)}function Zs(n,e,t){const r=t.docs.get(e._key),s=new bn(n);return new je(n,s,e._key,r,new wt(t.hasPendingWrites,t.fromCache),e.converter)}function Uf(n){return n=F(n,de),qe(n),new cf(n,e=>Nn(n,e))}(function(e,t=!0){du(hu),cu(new lu("firestore",(r,{instanceIdentifier:s,options:i})=>{const a=r.getProvider("app").getImmediate(),o=new de(new _u(r.getProvider("auth-internal")),new yu(a,r.getProvider("app-check-internal")),Uu(a,s),a);return i={useFetchStreams:t,...i},o._setSettings(i),o},"PUBLIC").setMultipleInstances(!0)),ni(Wi,Hi,e),ni(Wi,Hi,"esm2020")})();export{Of as a,yf as b,_f as c,Lf as d,pf as e,Zc as f,If as g,Sf as h,xf as i,bf as j,Nf as k,wf as l,Tf as m,Rf as n,Pf as o,Mf as p,Vf as q,Af as r,Cf as s,gf as t,Df as u,kf as v,vf as w,Uf as x};
