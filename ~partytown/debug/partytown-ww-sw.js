/* Partytown 0.11.2 - MIT QwikDev */
(self => {
    var WorkerMessageType;
    !function(WorkerMessageType) {
        WorkerMessageType[WorkerMessageType.MainDataRequestFromWorker = 0] = "MainDataRequestFromWorker";
        WorkerMessageType[WorkerMessageType.MainDataResponseToWorker = 1] = "MainDataResponseToWorker";
        WorkerMessageType[WorkerMessageType.MainInterfacesRequestFromWorker = 2] = "MainInterfacesRequestFromWorker";
        WorkerMessageType[WorkerMessageType.MainInterfacesResponseToWorker = 3] = "MainInterfacesResponseToWorker";
        WorkerMessageType[WorkerMessageType.InitializedWebWorker = 4] = "InitializedWebWorker";
        WorkerMessageType[WorkerMessageType.InitializeEnvironment = 5] = "InitializeEnvironment";
        WorkerMessageType[WorkerMessageType.InitializedEnvironmentScript = 6] = "InitializedEnvironmentScript";
        WorkerMessageType[WorkerMessageType.InitializeNextScript = 7] = "InitializeNextScript";
        WorkerMessageType[WorkerMessageType.InitializedScripts = 8] = "InitializedScripts";
        WorkerMessageType[WorkerMessageType.RefHandlerCallback = 9] = "RefHandlerCallback";
        WorkerMessageType[WorkerMessageType.ForwardMainTrigger = 10] = "ForwardMainTrigger";
        WorkerMessageType[WorkerMessageType.ForwardWorkerAccessRequest = 11] = "ForwardWorkerAccessRequest";
        WorkerMessageType[WorkerMessageType.AsyncAccessRequest = 12] = "AsyncAccessRequest";
        WorkerMessageType[WorkerMessageType.LocationUpdate = 13] = "LocationUpdate";
        WorkerMessageType[WorkerMessageType.DocumentVisibilityState = 14] = "DocumentVisibilityState";
        WorkerMessageType[WorkerMessageType.CustomElementCallback = 15] = "CustomElementCallback";
    }(WorkerMessageType || (WorkerMessageType = {}));
    var LocationUpdateType;
    !function(LocationUpdateType) {
        LocationUpdateType[LocationUpdateType.PushState = 0] = "PushState";
        LocationUpdateType[LocationUpdateType.ReplaceState = 1] = "ReplaceState";
        LocationUpdateType[LocationUpdateType.PopState = 2] = "PopState";
        LocationUpdateType[LocationUpdateType.HashChange = 3] = "HashChange";
    }(LocationUpdateType || (LocationUpdateType = {}));
    var InterfaceType;
    !function(InterfaceType) {
        InterfaceType[InterfaceType.Window = 0] = "Window";
        InterfaceType[InterfaceType.Element = 1] = "Element";
        InterfaceType[InterfaceType.AttributeNode = 2] = "AttributeNode";
        InterfaceType[InterfaceType.TextNode = 3] = "TextNode";
        InterfaceType[InterfaceType.CDataSectionNode = 4] = "CDataSectionNode";
        InterfaceType[InterfaceType.Function = 5] = "Function";
        InterfaceType[InterfaceType.Property = 6] = "Property";
        InterfaceType[InterfaceType.ProcessingInstructionNode = 7] = "ProcessingInstructionNode";
        InterfaceType[InterfaceType.CommentNode = 8] = "CommentNode";
        InterfaceType[InterfaceType.Document = 9] = "Document";
        InterfaceType[InterfaceType.DocumentTypeNode = 10] = "DocumentTypeNode";
        InterfaceType[InterfaceType.DocumentFragmentNode = 11] = "DocumentFragmentNode";
        InterfaceType[InterfaceType.EnvGlobalConstructor = 12] = "EnvGlobalConstructor";
    }(InterfaceType || (InterfaceType = {}));
    var WinDocId;
    !function(WinDocId) {
        WinDocId.document = "d";
        WinDocId.documentElement = "e";
        WinDocId.head = "h";
        WinDocId.body = "b";
    }(WinDocId || (WinDocId = {}));
    var ApplyPathType;
    !function(ApplyPathType) {
        ApplyPathType[ApplyPathType.SetValue = 0] = "SetValue";
        ApplyPathType[ApplyPathType.GlobalConstructor = 1] = "GlobalConstructor";
    }(ApplyPathType || (ApplyPathType = {}));
    var SerializedType;
    !function(SerializedType) {
        SerializedType[SerializedType.Primitive = 0] = "Primitive";
        SerializedType[SerializedType.Array = 1] = "Array";
        SerializedType[SerializedType.Object = 2] = "Object";
        SerializedType[SerializedType.Instance = 3] = "Instance";
        SerializedType[SerializedType.Ref = 4] = "Ref";
        SerializedType[SerializedType.Event = 5] = "Event";
        SerializedType[SerializedType.Function = 6] = "Function";
        SerializedType[SerializedType.NodeList = 7] = "NodeList";
        SerializedType[SerializedType.ArrayBuffer = 8] = "ArrayBuffer";
        SerializedType[SerializedType.ArrayBufferView = 9] = "ArrayBufferView";
        SerializedType[SerializedType.Attr = 10] = "Attr";
        SerializedType[SerializedType.CSSRule = 11] = "CSSRule";
        SerializedType[SerializedType.CSSRuleList = 12] = "CSSRuleList";
        SerializedType[SerializedType.CSSStyleDeclaration = 13] = "CSSStyleDeclaration";
        SerializedType[SerializedType.Error = 14] = "Error";
    }(SerializedType || (SerializedType = {}));
    var NodeName;
    !function(NodeName) {
        NodeName.Body = "BODY";
        NodeName.Comment = "#comment";
        NodeName.Document = "#document";
        NodeName.DocumentElement = "HTML";
        NodeName.DocumentTypeNode = "html";
        NodeName.DocumentFragment = "#document-fragment";
        NodeName.IFrame = "IFRAME";
        NodeName.Head = "HEAD";
        NodeName.Script = "SCRIPT";
        NodeName.Text = "#text";
    }(NodeName || (NodeName = {}));
    var StateProp;
    !function(StateProp) {
        StateProp.errorHandlers = "error";
        StateProp.loadHandlers = "load";
        StateProp[StateProp.src = 0] = "src";
        StateProp[StateProp.loadErrorStatus = 1] = "loadErrorStatus";
        StateProp[StateProp.cssRules = 2] = "cssRules";
        StateProp[StateProp.innerHTML = 3] = "innerHTML";
        StateProp[StateProp.url = 4] = "url";
        StateProp[StateProp.type = 5] = "type";
    }(StateProp || (StateProp = {}));
    var CallType;
    !function(CallType) {
        CallType[CallType.Blocking = 1] = "Blocking";
        CallType[CallType.NonBlocking = 2] = "NonBlocking";
        CallType[CallType.NonBlockingNoSideEffect = 3] = "NonBlockingNoSideEffect";
    }(CallType || (CallType = {}));
    const WinIdKey = Symbol();
    const InstanceIdKey = Symbol();
    const InstanceDataKey = Symbol();
    const NamespaceKey = Symbol();
    const ApplyPathKey = Symbol();
    const InstanceStateKey = Symbol();
    const HookContinue = Symbol();
    const HookPrevent = Symbol();
    const webWorkerInstances = new Map;
    const webWorkerRefsByRefId = {};
    const webWorkerRefIdsByRef = new WeakMap;
    const postMessages = [];
    const webWorkerCtx = {};
    const environments = {};
    const cachedDimensions = new Map;
    const cachedStructure = new Map;
    const commaSplit = str => str.split(",");
    const partytownLibUrl = url => {
        url = webWorkerCtx.$libPath$ + url;
        if (new URL(url).origin != location.origin) {
            throw "Invalid " + url;
        }
        return url;
    };
    const getterDimensionPropNames = commaSplit("clientWidth,clientHeight,clientTop,clientLeft,innerWidth,innerHeight,offsetWidth,offsetHeight,offsetTop,offsetLeft,outerWidth,outerHeight,pageXOffset,pageYOffset,scrollWidth,scrollHeight,scrollTop,scrollLeft");
    const elementStructurePropNames = commaSplit("childElementCount,children,firstElementChild,lastElementChild,nextElementSibling,previousElementSibling");
    const structureChangingMethodNames = commaSplit("insertBefore,remove,removeChild,replaceChild");
    const dimensionChangingSetterNames = commaSplit("className,width,height,hidden,innerHTML,innerText,textContent,text");
    const dimensionChangingMethodNames = commaSplit("setAttribute,setAttributeNS,setProperty");
    const eventTargetMethods = commaSplit("addEventListener,dispatchEvent,removeEventListener");
    const nonBlockingMethods = eventTargetMethods.concat(dimensionChangingMethodNames, commaSplit("add,observe,remove,unobserve"));
    const IS_TAG_REG = /^[A-Z_]([A-Z0-9-]*[A-Z0-9])?$/;
    const noop = () => {};
    const len = obj => obj.length;
    const getConstructorName = obj => {
        var _a, _b, _c;
        try {
            const constructorName = null === (_a = null == obj ? void 0 : obj.constructor) || void 0 === _a ? void 0 : _a.name;
            if (constructorName) {
                return constructorName;
            }
        } catch (e) {}
        try {
            const zoneJsConstructorName = null === (_c = null === (_b = null == obj ? void 0 : obj.__zone_symbol__originalInstance) || void 0 === _b ? void 0 : _b.constructor) || void 0 === _c ? void 0 : _c.name;
            if (zoneJsConstructorName) {
                return zoneJsConstructorName;
            }
        } catch (e) {}
        return "";
    };
    const EMPTY_ARRAY = [];
    const randomId = () => Math.round(Math.random() * Number.MAX_SAFE_INTEGER).toString(36);
    const SCRIPT_TYPE = "text/partytown";
    const defineProperty = (obj, memberName, descriptor) => Object.defineProperty(obj, memberName, {
        ...descriptor,
        configurable: true
    });
    const defineConstructorName = (Cstr, value) => defineProperty(Cstr, "name", {
        value: value
    });
    const definePrototypeProperty = (Cstr, memberName, descriptor) => defineProperty(Cstr.prototype, memberName, descriptor);
    const definePrototypePropertyDescriptor = (Cstr, propertyDescriptorMap) => Object.defineProperties(Cstr.prototype, propertyDescriptorMap);
    const definePrototypeValue = (Cstr, memberName, value) => definePrototypeProperty(Cstr, memberName, {
        value: value,
        writable: true
    });
    Object.freeze((obj => {
        const properties = new Set;
        let currentObj = obj;
        do {
            Object.getOwnPropertyNames(currentObj).forEach((item => {
                "function" == typeof currentObj[item] && properties.add(item);
            }));
        } while ((currentObj = Object.getPrototypeOf(currentObj)) !== Object.prototype);
        return Array.from(properties);
    })([]));
    function testIfMustLoadScriptOnMainThread(config, value) {
        var _a, _b;
        return null !== (_b = null === (_a = config.loadScriptsOnMainThread) || void 0 === _a ? void 0 : _a.map((([type, value]) => new RegExp("string" === type ? function(input) {
            return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        }(value) : value))).some((regexp => regexp.test(value)))) && void 0 !== _b && _b;
    }
    const hasInstanceStateValue = (instance, stateKey) => stateKey in instance[InstanceStateKey];
    const getInstanceStateValue = (instance, stateKey) => instance[InstanceStateKey][stateKey];
    const setInstanceStateValue = (instance, stateKey, stateValue) => instance[InstanceStateKey][stateKey] = stateValue;
    const setWorkerRef = (ref, refId) => {
        if (!(refId = webWorkerRefIdsByRef.get(ref))) {
            webWorkerRefIdsByRef.set(ref, refId = randomId());
            webWorkerRefsByRefId[refId] = ref;
        }
        return refId;
    };
    const getOrCreateNodeInstance = (winId, instanceId, nodeName, namespace, instance, prevInstanceId) => {
        instance = webWorkerInstances.get(instanceId);
        if (!instance && nodeName && environments[winId]) {
            const prevInstance = webWorkerInstances.get(prevInstanceId || "");
            instance = environments[winId].$createNode$(nodeName, instanceId, namespace, prevInstance);
            webWorkerInstances.set(instanceId, instance);
        }
        return instance;
    };
    const definePrototypeNodeType = (Cstr, nodeType) => definePrototypeValue(Cstr, "nodeType", nodeType);
    const cachedTreeProps = (Cstr, treeProps) => treeProps.map((propName => definePrototypeProperty(Cstr, propName, {
        get() {
            let cacheKey = getInstanceCacheKey(this, propName);
            let result = cachedStructure.get(cacheKey);
            if (!result) {
                result = getter(this, [ propName ]);
                cachedStructure.set(cacheKey, result);
            }
            return result;
        }
    })));
    const getInstanceCacheKey = (instance, memberName, args) => [ instance[WinIdKey], instance[InstanceIdKey], memberName, ...(args || EMPTY_ARRAY).map((arg => String(arg && arg[WinIdKey] ? arg[InstanceIdKey] : arg))) ].join(".");
    const cachedProps = (Cstr, propNames) => commaSplit(propNames).map((propName => definePrototypeProperty(Cstr, propName, {
        get() {
            hasInstanceStateValue(this, propName) || setInstanceStateValue(this, propName, getter(this, [ propName ]));
            return getInstanceStateValue(this, propName);
        },
        set(val) {
            getInstanceStateValue(this, propName) !== val && setter(this, [ propName ], val);
            setInstanceStateValue(this, propName, val);
        }
    })));
    const cachedDimensionProps = Cstr => getterDimensionPropNames.map((propName => definePrototypeProperty(Cstr, propName, {
        get() {
            const dimension = cachedDimensions.get(getInstanceCacheKey(this, propName));
            if ("number" == typeof dimension) {
                return dimension;
            }
            const groupedDimensions = getter(this, [ propName ], getterDimensionPropNames);
            if (groupedDimensions && "object" == typeof groupedDimensions) {
                Object.entries(groupedDimensions).map((([dimensionPropName, value]) => cachedDimensions.set(getInstanceCacheKey(this, dimensionPropName), value)));
                return groupedDimensions[propName];
            }
            return groupedDimensions;
        }
    })));
    const cachedDimensionMethods = (Cstr, dimensionMethodNames) => dimensionMethodNames.map((methodName => {
        Cstr.prototype[methodName] = function(...args) {
            let cacheKey = getInstanceCacheKey(this, methodName, args);
            let dimensions = cachedDimensions.get(cacheKey);
            if (!dimensions) {
                dimensions = callMethod(this, [ methodName ], args);
                cachedDimensions.set(cacheKey, dimensions);
            }
            return dimensions;
        };
    }));
    const serializeForMain = ($winId$, $instanceId$, value, added, type) => void 0 !== value && (type = typeof value) ? "string" === type || "boolean" === type || "number" === type || null == value ? [ SerializedType.Primitive, value ] : "function" === type ? [ SerializedType.Ref, {
        $winId$: $winId$,
        $instanceId$: $instanceId$,
        $refId$: setWorkerRef(value)
    } ] : (added = added || new Set) && Array.isArray(value) ? added.has(value) ? [ SerializedType.Array, [] ] : added.add(value) && [ SerializedType.Array, value.map((v => serializeForMain($winId$, $instanceId$, v, added))) ] : "object" === type ? value[InstanceIdKey] ? [ SerializedType.Instance, [ value[WinIdKey], value[InstanceIdKey] ] ] : value instanceof Event ? [ SerializedType.Event, serializeObjectForMain($winId$, $instanceId$, value, false, added) ] : supportsTrustedHTML && value instanceof TrustedHTML ? [ SerializedType.Primitive, value.toString() ] : value instanceof ArrayBuffer ? [ SerializedType.ArrayBuffer, value ] : ArrayBuffer.isView(value) ? [ SerializedType.ArrayBufferView, value.buffer, getConstructorName(value) ] : [ SerializedType.Object, serializeObjectForMain($winId$, $instanceId$, value, true, added) ] : void 0 : value;
    const supportsTrustedHTML = "undefined" != typeof TrustedHTML;
    const serializeObjectForMain = (winId, instanceId, obj, includeFunctions, added, serializedObj, propName, propValue) => {
        serializedObj = {};
        if (!added.has(obj)) {
            added.add(obj);
            for (propName in obj) {
                propValue = obj[propName];
                (includeFunctions || "function" != typeof propValue) && (serializedObj[propName] = serializeForMain(winId, instanceId, propValue, added));
            }
        }
        return serializedObj;
    };
    const serializeInstanceForMain = (instance, value) => instance ? serializeForMain(instance[WinIdKey], instance[InstanceIdKey], value) : [ SerializedType.Primitive, value ];
    const deserializeFromMain = (winId, instanceId, applyPath, serializedValueTransfer, serializedType, serializedValue, obj, key) => {
        if (serializedValueTransfer) {
            serializedType = serializedValueTransfer[0];
            serializedValue = serializedValueTransfer[1];
            if (serializedType === SerializedType.Primitive || serializedType === SerializedType.CSSRule || serializedType === SerializedType.CSSRuleList) {
                return serializedValue;
            }
            if (serializedType === SerializedType.Ref) {
                return deserializeRefFromMain(applyPath, serializedValue);
            }
            if (serializedType === SerializedType.Function) {
                return winId && applyPath.length > 0 ? (...args) => callMethod(environments[winId].$window$, applyPath, args, CallType.Blocking) : noop;
            }
            if (serializedType === SerializedType.Instance) {
                return getOrCreateSerializedInstance(serializedValue);
            }
            if (serializedType === SerializedType.NodeList) {
                return new NodeList(serializedValue.map(getOrCreateSerializedInstance));
            }
            if (serializedType === SerializedType.Attr) {
                return new Attr(serializedValue);
            }
            if (serializedType === SerializedType.Array) {
                return serializedValue.map((v => deserializeFromMain(winId, instanceId, applyPath, v)));
            }
            if (serializedType === SerializedType.Error) {
                return new CustomError(serializedValue);
            }
            obj = {};
            for (key in serializedValue) {
                obj[key] = deserializeFromMain(winId, instanceId, [ ...applyPath, key ], serializedValue[key]);
            }
            if (serializedType === SerializedType.CSSStyleDeclaration) {
                return new environments[winId].$window$.CSSStyleDeclaration(winId, instanceId, applyPath, obj);
            }
            if (serializedType === SerializedType.Event) {
                if ("message" === obj.type && obj.origin) {
                    let postMessageKey = JSON.stringify(obj.data);
                    let postMessageData = postMessages.find((pm => pm.$data$ === postMessageKey));
                    let env;
                    if (postMessageData) {
                        env = environments[postMessageData.$winId$];
                        if (env) {
                            obj.source = env.$window$;
                            obj.origin = env.$location$.origin;
                        }
                    }
                }
                return new Proxy(new Event(obj.type, obj), {
                    get: (target, propName) => propName in obj ? obj[propName] : "function" == typeof target[String(propName)] ? noop : target[String(propName)]
                });
            }
            if (serializedType === SerializedType.Object) {
                return obj;
            }
        }
    };
    const getOrCreateSerializedInstance = ([winId, instanceId, nodeName, prevInstanceId]) => instanceId === winId && environments[winId] ? environments[winId].$window$ : getOrCreateNodeInstance(winId, instanceId, nodeName, void 0, void 0, prevInstanceId);
    const deserializeRefFromMain = (applyPath, {$winId$: $winId$, $instanceId$: $instanceId$, $nodeName$: $nodeName$, $refId$: $refId$}) => {
        webWorkerRefsByRefId[$refId$] || webWorkerRefIdsByRef.set(webWorkerRefsByRefId[$refId$] = function(...args) {
            const instance = getOrCreateNodeInstance($winId$, $instanceId$, $nodeName$);
            return callMethod(instance, applyPath, args);
        }, $refId$);
        return webWorkerRefsByRefId[$refId$];
    };
    class CustomError extends Error {
        constructor(errorObject) {
            super(errorObject.message);
            this.name = errorObject.name;
            this.message = errorObject.message;
            this.stack = errorObject.stack;
        }
    }
    class NodeList {
        constructor(nodes) {
            (this._ = nodes).map(((node, index) => this[index] = node));
        }
        entries() {
            return this._.entries();
        }
        forEach(cb, thisArg) {
            this._.map(cb, thisArg);
        }
        item(index) {
            return this[index];
        }
        keys() {
            return this._.keys();
        }
        get length() {
            return len(this._);
        }
        values() {
            return this._.values();
        }
        [Symbol.iterator]() {
            return this._[Symbol.iterator]();
        }
    }
    const Attr = class {
        constructor(serializedAttr) {
            this.name = serializedAttr[0];
            this.value = serializedAttr[1];
        }
        get nodeName() {
            return this.name;
        }
        get nodeType() {
            return 2;
        }
    };
    const warnCrossOrigin = (apiType, apiName, env) => console.warn(`Partytown unable to ${apiType} cross-origin ${apiName}: ` + env.$location$);
    const logWorker = (msg, winId) => {
        try {
            const config = webWorkerCtx.$config$;
            if (config.logStackTraces) {
                const frames = (new Error).stack.split("\n");
                const i = frames.findIndex((f => f.includes("logWorker")));
                msg += "\n" + frames.slice(i + 1).join("\n");
            }
            let prefix;
            let color;
            if (winId) {
                prefix = `Worker (${normalizedWinId(winId)}) 🎉`;
                color = winColor(winId);
            } else {
                prefix = self.name;
                color = "#9844bf";
            }
            if (webWorkerCtx.lastLog !== msg) {
                webWorkerCtx.lastLog = msg;
                console.debug.apply(console, [ `%c${prefix}`, `background: ${color}; color: white; padding: 2px 3px; border-radius: 2px; font-size: 0.8em;`, msg ]);
            }
        } catch (e) {}
    };
    const winIds = [];
    const normalizedWinId = winId => {
        winIds.includes(winId) || winIds.push(winId);
        return winIds.indexOf(winId) + 1;
    };
    const winColor = winId => {
        const colors = [ "#00309e", "#ea3655", "#eea727" ];
        const index = normalizedWinId(winId) - 1;
        return colors[index] || colors[colors.length - 1];
    };
    const getTargetProp = (target, applyPath) => {
        let n = "";
        if (target) {
            const cstrName = getConstructorName(target);
            if ("Window" === cstrName) {
                n = "";
            } else if ("string" == typeof target[InstanceDataKey]) {
                let nodeName = target[InstanceDataKey];
                n = nodeName === NodeName.Text ? "textNode." : nodeName === NodeName.Comment ? "commentNode." : nodeName === NodeName.Document ? "document." : nodeName === NodeName.DocumentTypeNode ? "doctype." : nodeName.toLowerCase() + ".";
            } else {
                n = "nodeType" in target && target.nodeType === InterfaceType.AttributeNode ? "attributes." : "CanvasRenderingContext2D" === cstrName ? "context2D." : "CanvasRenderingContextWebGL" === cstrName ? "contextWebGL." : "CSSStyleDeclaration" === cstrName ? "style." : "MutationObserver" === cstrName ? "mutationObserver." : "NamedNodeMap" === cstrName ? "namedNodeMap." : "ResizeObserver" === cstrName ? "resizeObserver." : cstrName.substring(0, 1).toLowerCase() + cstrName.substring(1) + ".";
            }
            target[ApplyPathKey] && target[ApplyPathKey].length && (n += [ ...target[ApplyPathKey] ].join(".") + ".");
        }
        if (applyPath.length > 1) {
            const first = applyPath.slice(0, applyPath.length - 1);
            const last = applyPath[applyPath.length - 1];
            if (!isNaN(last)) {
                return n + `${first.join(".")}[${last}]`;
            }
        }
        return n + applyPath.join(".");
    };
    const getLogValue = (applyPath, v) => {
        const type = typeof v;
        if (void 0 === v) {
            return "undefined";
        }
        if ("boolean" === type || "number" === type || null == v) {
            return JSON.stringify(v);
        }
        if ("string" === type) {
            return applyPath.includes("cookie") ? JSON.stringify(v.slice(0, 10) + "...") : JSON.stringify(v.length > 50 ? v.slice(0, 40) + "..." : v);
        }
        if (Array.isArray(v)) {
            return `[${v.map(getLogValue).join(", ")}]`;
        }
        if ("object" === type) {
            const instanceId = v[InstanceIdKey];
            const cstrName = getConstructorName(v);
            if ("string" == typeof instanceId) {
                if ("Window" === cstrName) {
                    return "window";
                }
                if ("string" == typeof v[InstanceDataKey]) {
                    if (1 === v.nodeType) {
                        return `<${v[InstanceDataKey].toLowerCase()}>`;
                    }
                    if (v.nodeType === InterfaceType.DocumentTypeNode) {
                        return `<!DOCTYPE ${v[InstanceDataKey]}>`;
                    }
                    if (v.nodeType <= InterfaceType.DocumentFragmentNode) {
                        return v[InstanceDataKey];
                    }
                }
                return "¯\\_(ツ)_/¯ instance obj";
            }
            return v[Symbol.iterator] ? `[${Array.from(v).map((i => getLogValue(applyPath, i))).join(", ")}]` : "value" in v ? "string" == typeof v.value ? `"${v.value}"` : objToString(v.value) : objToString(v);
        }
        return (v => "object" == typeof v && v && v.then)(v) ? "Promise" : "function" === type ? `ƒ() ${v.name || ""}`.trim() : `¯\\_(ツ)_/¯ ${String(v)}`.trim();
    };
    const objToString = obj => {
        const s = [];
        for (let key in obj) {
            const value = obj[key];
            const type = typeof value;
            "string" === type ? s.push(`${key}: "${value}"`) : "function" === type ? s.push(`${key}: ƒ`) : Array.isArray(type) ? s.push(`${key}: [..]`) : "object" === type && value ? s.push(`${key}: {..}`) : s.push(`${key}: ${String(value)}`);
        }
        let str = s.join(", ");
        str.length > 200 && (str = str.substring(0, 200) + "..");
        return `{ ${str} }`;
    };
    const logDimensionCacheClearStyle = (target, propName) => {
        (webWorkerCtx.$config$.logGetters || webWorkerCtx.$config$.logSetters) && logWorker(`Dimension cache cleared from style.${propName} setter`, target[WinIdKey]);
    };
    const logDimensionCacheClearMethod = (target, methodName) => {
        (webWorkerCtx.$config$.logGetters || webWorkerCtx.$config$.logCalls) && logWorker(`Dimension cache cleared from method call ${methodName}()`, target[WinIdKey]);
    };
    const taskQueue = [];
    const queue = (instance, $applyPath$, callType, $assignInstanceId$, $groupedGetters$, buffer) => {
        if (instance[ApplyPathKey]) {
            taskQueue.push({
                $winId$: instance[WinIdKey],
                $instanceId$: instance[InstanceIdKey],
                $applyPath$: [ ...instance[ApplyPathKey], ...$applyPath$ ],
                $assignInstanceId$: $assignInstanceId$,
                $groupedGetters$: $groupedGetters$
            });
            taskQueue[len(taskQueue) - 1].$debug$ = ((target, applyPath, callType) => {
                let m = getTargetProp(target, applyPath);
                callType === CallType.Blocking ? m += " (blocking)" : callType === CallType.NonBlocking ? m += " (non-blocking)" : callType === CallType.NonBlockingNoSideEffect && (m += " (non-blocking, no-side-effect)");
                return m.trim();
            })(instance, $applyPath$, callType);
            buffer && callType !== CallType.NonBlockingNoSideEffect && console.error("buffer must be sent NonBlockingNoSideEffect");
            if (callType === CallType.NonBlockingNoSideEffect) {
                webWorkerCtx.$postMessage$([ WorkerMessageType.AsyncAccessRequest, {
                    $msgId$: randomId(),
                    $tasks$: [ ...taskQueue ]
                } ], buffer ? [ buffer instanceof ArrayBuffer ? buffer : buffer.buffer ] : void 0);
                taskQueue.length = 0;
            } else if (callType === CallType.Blocking) {
                return sendToMain(true);
            }
            webWorkerCtx.$asyncMsgTimer$ = setTimeout(sendToMain, 20);
        }
    };
    const sendToMain = isBlocking => {
        clearTimeout(webWorkerCtx.$asyncMsgTimer$);
        if (len(taskQueue)) {
            webWorkerCtx.$config$.logMainAccess && logWorker(`Main access, tasks sent: ${taskQueue.length}`);
            const endTask = taskQueue[len(taskQueue) - 1];
            const accessReq = {
                $msgId$: `${randomId()}.${webWorkerCtx.$tabId$}`,
                $tasks$: [ ...taskQueue ]
            };
            taskQueue.length = 0;
            if (isBlocking) {
                const accessRsp = ((webWorkerCtx, accessReq) => {
                    const xhr = new XMLHttpRequest;
                    xhr.open("POST", partytownLibUrl("proxytown"), false);
                    xhr.send(JSON.stringify(accessReq));
                    return JSON.parse(xhr.responseText);
                })(0, accessReq);
                const isPromise = accessRsp.$isPromise$;
                const rtnValue = deserializeFromMain(endTask.$winId$, endTask.$instanceId$, endTask.$applyPath$, accessRsp.$rtnValue$);
                if (accessRsp.$error$) {
                    if (isPromise) {
                        return Promise.reject(accessRsp.$error$);
                    }
                    throw new Error(accessRsp.$error$);
                }
                return isPromise ? Promise.resolve(rtnValue) : rtnValue;
            }
            webWorkerCtx.$postMessage$([ WorkerMessageType.AsyncAccessRequest, accessReq ]);
        }
    };
    const getter = (instance, applyPath, groupedGetters, rtnValue) => {
        if (webWorkerCtx.$config$.get) {
            rtnValue = webWorkerCtx.$config$.get(createHookOptions(instance, applyPath));
            if (rtnValue !== HookContinue) {
                return rtnValue;
            }
        }
        rtnValue = queue(instance, applyPath, CallType.Blocking, void 0, groupedGetters);
        ((target, applyPath, rtnValue, restrictedToWorker = false, groupedGetters = false) => {
            if (webWorkerCtx.$config$.logGetters) {
                try {
                    const msg = `Get ${getTargetProp(target, applyPath)}, returned: ${getLogValue(applyPath, rtnValue)}${restrictedToWorker ? " (restricted to worker)" : ""}${groupedGetters ? " (grouped getter)" : ""}`;
                    msg.includes("Symbol(") || logWorker(msg, target[WinIdKey]);
                } catch (e) {}
            }
        })(instance, applyPath, rtnValue, false, !!groupedGetters);
        return rtnValue;
    };
    const setter = (instance, applyPath, value, hookSetterValue) => {
        if (webWorkerCtx.$config$.set) {
            hookSetterValue = webWorkerCtx.$config$.set({
                value: value,
                prevent: HookPrevent,
                ...createHookOptions(instance, applyPath)
            });
            if (hookSetterValue === HookPrevent) {
                return;
            }
            hookSetterValue !== HookContinue && (value = hookSetterValue);
        }
        if (dimensionChangingSetterNames.some((s => applyPath.includes(s)))) {
            cachedDimensions.clear();
            ((target, propName) => {
                (webWorkerCtx.$config$.logGetters || webWorkerCtx.$config$.logSetters) && logWorker(`Dimension cache cleared from setter "${propName}"`, target[WinIdKey]);
            })(instance, applyPath[applyPath.length - 1]);
        }
        applyPath = [ ...applyPath, serializeInstanceForMain(instance, value), ApplyPathType.SetValue ];
        ((target, applyPath, value, restrictedToWorker = false) => {
            if (webWorkerCtx.$config$.logSetters) {
                try {
                    applyPath = applyPath.slice(0, applyPath.length - 2);
                    logWorker(`Set ${getTargetProp(target, applyPath)}, value: ${getLogValue(applyPath, value)}${restrictedToWorker ? " (restricted to worker)" : ""}`, target[WinIdKey]);
                } catch (e) {}
            }
        })(instance, applyPath, value);
        queue(instance, applyPath, CallType.NonBlocking);
    };
    const callMethod = (instance, applyPath, args, callType, assignInstanceId, buffer, rtnValue, methodName) => {
        if (webWorkerCtx.$config$.apply) {
            rtnValue = webWorkerCtx.$config$.apply({
                args: args,
                ...createHookOptions(instance, applyPath)
            });
            if (rtnValue !== HookContinue) {
                return rtnValue;
            }
        }
        methodName = applyPath[len(applyPath) - 1];
        applyPath = [ ...applyPath, serializeInstanceForMain(instance, args) ];
        callType = callType || (nonBlockingMethods.includes(methodName) ? CallType.NonBlocking : CallType.Blocking);
        if ("setAttribute" === methodName && hasInstanceStateValue(instance, args[0])) {
            setInstanceStateValue(instance, args[0], args[1]);
        } else if (structureChangingMethodNames.includes(methodName)) {
            cachedDimensions.clear();
            cachedStructure.clear();
            ((target, methodName) => {
                (webWorkerCtx.$config$.logGetters || webWorkerCtx.$config$.logCalls) && logWorker(`Dimension and DOM structure cache cleared from method call ${methodName}()`, target[WinIdKey]);
            })(instance, methodName);
        } else if (dimensionChangingMethodNames.includes(methodName)) {
            callType = CallType.NonBlocking;
            cachedDimensions.clear();
            logDimensionCacheClearMethod(instance, methodName);
        }
        rtnValue = queue(instance, applyPath, callType, assignInstanceId, void 0, buffer);
        ((target, applyPath, args, rtnValue) => {
            if (webWorkerCtx.$config$.logCalls) {
                try {
                    applyPath = applyPath.slice(0, applyPath.length - 1);
                    logWorker(`Call ${getTargetProp(target, applyPath)}(${args.map((v => getLogValue(applyPath, v))).join(", ")}), returned: ${getLogValue(applyPath, rtnValue)}`, target[WinIdKey]);
                } catch (e) {}
            }
        })(instance, applyPath, args, rtnValue);
        return rtnValue;
    };
    const constructGlobal = (instance, cstrName, args) => {
        ((target, cstrName, args) => {
            if (webWorkerCtx.$config$.logCalls) {
                try {
                    logWorker(`Construct new ${cstrName}(${args.map((v => getLogValue([], v))).join(", ")})`, target[WinIdKey]);
                } catch (e) {}
            }
        })(instance, cstrName, args);
        queue(instance, [ ApplyPathType.GlobalConstructor, cstrName, serializeInstanceForMain(instance, args) ], CallType.Blocking);
    };
    const createHookOptions = (instance, applyPath) => ({
        name: applyPath.join("."),
        continue: HookContinue,
        nodeName: instance[InstanceDataKey],
        constructor: getConstructorName(instance),
        instance: instance,
        window: environments[instance[WinIdKey]].$window$
    });
    const addStorageApi = (win, storageName, env) => {
        let storage = {
            getItem(key) {
                if (env.$isSameOrigin$) {
                    return callMethod(win, [ storageName, "getItem" ], [ key ], CallType.Blocking);
                }
                warnCrossOrigin("get", storageName, env);
            },
            setItem(key, value) {
                env.$isSameOrigin$ ? callMethod(win, [ storageName, "setItem" ], [ key, value ], CallType.Blocking) : warnCrossOrigin("set", storageName, env);
            },
            removeItem(key) {
                env.$isSameOrigin$ ? callMethod(win, [ storageName, "removeItem" ], [ key ], CallType.Blocking) : warnCrossOrigin("remove", storageName, env);
            },
            key(index) {
                if (env.$isSameOrigin$) {
                    return callMethod(win, [ storageName, "key" ], [ index ], CallType.Blocking);
                }
                warnCrossOrigin("key", storageName, env);
            },
            clear() {
                env.$isSameOrigin$ ? callMethod(win, [ storageName, "clear" ], EMPTY_ARRAY, CallType.Blocking) : warnCrossOrigin("clear", storageName, env);
            },
            get length() {
                if (env.$isSameOrigin$) {
                    return getter(win, [ storageName, "length" ]);
                }
                warnCrossOrigin("length", storageName, env);
            }
        };
        win[storageName] = new Proxy(storage, {
            get: (target, key) => Reflect.has(target, key) ? Reflect.get(target, key) : target.getItem(key),
            set(target, key, value) {
                target.setItem(key, value);
                return true;
            },
            has: (target, key) => !!Reflect.has(target, key) || "string" == typeof key && null !== target.getItem(key),
            deleteProperty(target, key) {
                target.removeItem(key);
                return true;
            }
        });
    };
    const createCSSStyleDeclarationCstr = (win, WorkerBase, cstrName) => {
        win[cstrName] = defineConstructorName(class extends WorkerBase {
            constructor(winId, instanceId, applyPath, styles) {
                super(winId, instanceId, applyPath, styles || {});
                return new Proxy(this, {
                    get(target, propName) {
                        if (target[propName]) {
                            return target[propName];
                        }
                        target[propName] || "string" != typeof propName || target[InstanceDataKey][propName] || (target[InstanceDataKey][propName] = getter(target, [ propName ]));
                        return target[InstanceDataKey][propName];
                    },
                    set(target, propName, propValue) {
                        target[InstanceDataKey][propName] = propValue;
                        setter(target, [ propName ], propValue);
                        logDimensionCacheClearStyle(target, propName);
                        cachedDimensions.clear();
                        return true;
                    }
                });
            }
            setProperty(...args) {
                this[InstanceDataKey][args[0]] = args[1];
                callMethod(this, [ "setProperty" ], args, CallType.NonBlocking);
                logDimensionCacheClearStyle(this, args[0]);
                cachedDimensions.clear();
            }
            getPropertyValue(propName) {
                return this[propName];
            }
            removeProperty(propName) {
                let value = this[InstanceDataKey][propName];
                callMethod(this, [ "removeProperty" ], [ propName ], CallType.NonBlocking);
                logDimensionCacheClearStyle(this, propName);
                cachedDimensions.clear();
                this[InstanceDataKey][propName] = void 0;
                return value;
            }
        }, cstrName);
    };
    const createCSSStyleSheetConstructor = (win, cssStyleSheetCstrName) => {
        win[cssStyleSheetCstrName] = defineConstructorName(class {
            constructor(ownerNode) {
                this.ownerNode = ownerNode;
            }
            get cssRules() {
                const ownerNode = this.ownerNode;
                return new Proxy({}, {
                    get(target, propKey) {
                        const propName = String(propKey);
                        return "item" === propName ? index => getCssRule(ownerNode, index) : "length" === propName ? getCssRules(ownerNode).length : isNaN(propName) ? target[propKey] : getCssRule(ownerNode, propName);
                    }
                });
            }
            insertRule(ruleText, index) {
                const cssRules = getCssRules(this.ownerNode);
                index = void 0 === index ? 0 : index;
                if (index >= 0 && index <= cssRules.length) {
                    callMethod(this.ownerNode, [ "sheet", "insertRule" ], [ ruleText, index ], CallType.NonBlocking);
                    cssRules.splice(index, 0, 0);
                }
                logDimensionCacheClearMethod(this.ownerNode, "insertRule");
                cachedDimensions.clear();
                return index;
            }
            deleteRule(index) {
                callMethod(this.ownerNode, [ "sheet", "deleteRule" ], [ index ], CallType.NonBlocking);
                getCssRules(this.ownerNode).splice(index, 1);
                logDimensionCacheClearMethod(this.ownerNode, "deleteRule");
                cachedDimensions.clear();
            }
            get type() {
                return "text/css";
            }
        }, cssStyleSheetCstrName);
        const HTMLStyleDescriptorMap = {
            sheet: {
                get() {
                    return new win[cssStyleSheetCstrName](this);
                }
            }
        };
        definePrototypePropertyDescriptor(win.HTMLStyleElement, HTMLStyleDescriptorMap);
    };
    const getCssRules = (ownerNode, cssRules) => {
        cssRules = getInstanceStateValue(ownerNode, StateProp.cssRules);
        if (!cssRules) {
            cssRules = getter(ownerNode, [ "sheet", "cssRules" ]);
            setInstanceStateValue(ownerNode, StateProp.cssRules, cssRules);
        }
        return cssRules;
    };
    const getCssRule = (ownerNode, index, cssRules) => {
        cssRules = getCssRules(ownerNode);
        0 === cssRules[index] && (cssRules[index] = getter(ownerNode, [ "sheet", "cssRules", parseInt(index, 10) ]));
        return cssRules[index];
    };
    const runScriptContent = (env, instanceId, scriptContent, winId, errorMsg) => {
        try {
            webWorkerCtx.$config$.logScriptExecution && logWorker(`Execute script: ${scriptContent.substring(0, 100).split("\n").map((l => l.trim())).join(" ").trim().substring(0, 60)}...`, winId);
            env.$currentScriptId$ = instanceId;
            run(env, scriptContent);
        } catch (contentError) {
            console.error(scriptContent, contentError);
            errorMsg = String(contentError.stack || contentError);
        }
        env.$currentScriptId$ = "";
        return errorMsg;
    };
    const run = (env, scriptContent, scriptUrl) => {
        env.$runWindowLoadEvent$ = 1;
        let sourceWithReplacedThis = ((scriptContent, newThis) => scriptContent.replace(/([a-zA-Z0-9_$\.\'\"\`])?(\.\.\.)?this(?![a-zA-Z0-9_$:])/g, ((match, p1, p2) => {
            const prefix = (p1 || "") + (p2 || "");
            return null != p1 ? prefix + "this" : prefix + newThis;
        })))(scriptContent, "(thi$(this)?window:this)");
        scriptContent = `with(this){${sourceWithReplacedThis.replace(/\/\/# so/g, "//Xso")}\n;function thi$(t){return t===this}};${(webWorkerCtx.$config$.globalFns || []).filter((globalFnName => /[a-zA-Z_$][0-9a-zA-Z_$]*/.test(globalFnName))).map((g => `(typeof ${g}=='function'&&(this.${g}=${g}))`)).join(";")};` + (scriptUrl ? "\n//# sourceURL=" + scriptUrl : "");
        env.$isSameOrigin$ || (scriptContent = scriptContent.replace(/.postMessage\(/g, `.postMessage('${env.$winId$}',`));
        new Function(scriptContent).call(env.$window$);
        env.$runWindowLoadEvent$ = 0;
    };
    const runStateLoadHandlers = (instance, type, handlers) => {
        handlers = getInstanceStateValue(instance, type);
        handlers && setTimeout((() => handlers.map((cb => cb({
            type: type
        })))));
    };
    const resolveBaseLocation = (env, baseLocation) => {
        baseLocation = env.$location$;
        while (!baseLocation.host) {
            env = environments[env.$parentWinId$];
            baseLocation = env.$location$;
            if (env.$winId$ === env.$parentWinId$) {
                break;
            }
        }
        return baseLocation;
    };
    const resolveToUrl = (env, url, type, baseLocation, resolvedUrl, configResolvedUrl) => {
        baseLocation = resolveBaseLocation(env, baseLocation);
        resolvedUrl = new URL(url || "", baseLocation);
        if (type && webWorkerCtx.$config$.resolveUrl) {
            configResolvedUrl = webWorkerCtx.$config$.resolveUrl(resolvedUrl, baseLocation, type);
            if (configResolvedUrl) {
                return configResolvedUrl;
            }
        }
        return resolvedUrl;
    };
    const resolveUrl = (env, url, type) => resolveToUrl(env, url, type) + "";
    const resolveSendBeaconRequestParameters = (env, url) => {
        const baseLocation = resolveBaseLocation(env);
        const resolvedUrl = new URL(url || "", baseLocation);
        if (webWorkerCtx.$config$.resolveSendBeaconRequestParameters) {
            const configResolvedParams = webWorkerCtx.$config$.resolveSendBeaconRequestParameters(resolvedUrl, baseLocation);
            if (configResolvedParams) {
                return configResolvedParams;
            }
        }
        return {};
    };
    const getPartytownScript = () => `<script src="${partytownLibUrl("partytown.js?v=0.11.2")}"><\/script>`;
    const createImageConstructor = env => class HTMLImageElement {
        constructor() {
            this.s = "";
            this.l = [];
            this.e = [];
            this.style = {};
            this.attributes = new Map;
        }
        get src() {
            return this.s;
        }
        set src(src) {
            webWorkerCtx.$config$.logImageRequests && logWorker(`Image() request: ${resolveUrl(env, src, "image")}`, env.$winId$);
            this.s = src;
            fetch(resolveUrl(env, src, "image"), {
                mode: "no-cors",
                credentials: "include",
                keepalive: true
            }).then((rsp => {
                rsp.ok || 0 === rsp.status ? this.l.map((cb => cb({
                    type: "load"
                }))) : this.e.map((cb => cb({
                    type: "error"
                })));
            }), (() => this.e.forEach((cb => cb({
                type: "error"
            })))));
        }
        getAttribute(name) {
            const value = this.attributes.get(name.toLowerCase());
            return void 0 !== value ? value : null;
        }
        setAttribute(name, value) {
            this.attributes.set(name.toLowerCase(), String(value));
            "src" === name.toLowerCase() && (this.src = value);
        }
        hasAttribute(name) {
            return this.attributes.has(name.toLowerCase());
        }
        removeAttribute(name) {
            this.attributes.delete(name.toLowerCase());
        }
        toggleAttribute(name, force) {
            const normalizedName = name.toLowerCase();
            const hasAttr = this.attributes.has(normalizedName);
            if (void 0 !== force) {
                if (force) {
                    hasAttr || this.attributes.set(normalizedName, "");
                    return true;
                }
                this.attributes.delete(normalizedName);
                return false;
            }
            if (hasAttr) {
                this.attributes.delete(normalizedName);
                return false;
            }
            this.attributes.set(normalizedName, "");
            return true;
        }
        addEventListener(eventName, cb) {
            "load" === eventName && this.l.push(cb);
            "error" === eventName && this.e.push(cb);
        }
        removeEventListener(eventName, cb) {
            "load" === eventName && (this.l = this.l.filter((fn => fn !== cb)));
            "error" === eventName && (this.e = this.e.filter((fn => fn !== cb)));
        }
        get onload() {
            return this.l[0];
        }
        set onload(cb) {
            this.l = [ cb ];
        }
        get onerror() {
            return this.e[0];
        }
        set onerror(cb) {
            this.e = [ cb ];
        }
    };
    const HTMLSrcElementDescriptorMap = {
        addEventListener: {
            value(...args) {
                const eventName = args[0];
                const callbacks = getInstanceStateValue(this, eventName) || [];
                callbacks.push(args[1]);
                setInstanceStateValue(this, eventName, callbacks);
            }
        },
        async: {
            get: noop,
            set: noop
        },
        defer: {
            get: noop,
            set: noop
        },
        onload: {
            get() {
                let callbacks = getInstanceStateValue(this, StateProp.loadHandlers);
                return callbacks && callbacks[0] || null;
            },
            set(cb) {
                setInstanceStateValue(this, StateProp.loadHandlers, cb ? [ cb ] : null);
            }
        },
        onerror: {
            get() {
                let callbacks = getInstanceStateValue(this, StateProp.errorHandlers);
                return callbacks && callbacks[0] || null;
            },
            set(cb) {
                setInstanceStateValue(this, StateProp.errorHandlers, cb ? [ cb ] : null);
            }
        },
        getAttribute: {
            value(attrName) {
                return "src" === attrName ? this.src : callMethod(this, [ "getAttribute" ], [ attrName ]);
            }
        },
        setAttribute: {
            value(attrName, attrValue) {
                scriptAttrPropNames.includes(attrName) ? this[attrName] = attrValue : callMethod(this, [ "setAttribute" ], [ attrName, attrValue ]);
            }
        }
    };
    const scriptAttrPropNames = commaSplit("src,type");
    const patchHTMLScriptElement = (WorkerHTMLScriptElement, env) => {
        const HTMLScriptDescriptorMap = {
            innerHTML: innerHTMLDescriptor,
            innerText: innerHTMLDescriptor,
            src: {
                get() {
                    return getInstanceStateValue(this, StateProp.url) || "";
                },
                set(url) {
                    const orgUrl = resolveUrl(env, url, null);
                    const config = webWorkerCtx.$config$;
                    url = resolveUrl(env, url, "script");
                    setInstanceStateValue(this, StateProp.url, url);
                    setter(this, [ "src" ], url);
                    orgUrl !== url && setter(this, [ "dataset", "ptsrc" ], orgUrl);
                    if (this.type) {
                        const shouldExecuteScriptViaMainThread = testIfMustLoadScriptOnMainThread(config, url);
                        shouldExecuteScriptViaMainThread && setter(this, [ "type" ], "text/javascript");
                    }
                }
            },
            text: innerHTMLDescriptor,
            textContent: innerHTMLDescriptor,
            type: {
                get() {
                    return getter(this, [ "type" ]);
                },
                set(type) {
                    if (!isScriptJsType(type)) {
                        setInstanceStateValue(this, StateProp.type, type);
                        setter(this, [ "type" ], type);
                    }
                }
            },
            ...HTMLSrcElementDescriptorMap
        };
        definePrototypePropertyDescriptor(WorkerHTMLScriptElement, HTMLScriptDescriptorMap);
    };
    const innerHTMLDescriptor = {
        get() {
            const type = getter(this, [ "type" ]);
            if (isScriptJsType(type)) {
                const scriptContent = getInstanceStateValue(this, StateProp.innerHTML);
                if (scriptContent) {
                    return scriptContent;
                }
            }
            return getter(this, [ "innerHTML" ]) || "";
        },
        set(scriptContent) {
            setInstanceStateValue(this, StateProp.innerHTML, scriptContent);
        }
    };
    const isScriptJsType = scriptType => !scriptType || "text/javascript" === scriptType;
    const createNodeCstr = (win, env, WorkerBase) => {
        const config = webWorkerCtx.$config$;
        const WorkerNode = defineConstructorName(class extends WorkerBase {
            appendChild(node) {
                return this.insertBefore(node, null);
            }
            get href() {}
            set href(_) {}
            insertBefore(newNode, referenceNode) {
                const winId = newNode[WinIdKey] = this[WinIdKey];
                const instanceId = newNode[InstanceIdKey];
                const nodeName = newNode[InstanceDataKey];
                const isScript = nodeName === NodeName.Script;
                const isIFrame = nodeName === NodeName.IFrame;
                if (isScript) {
                    const scriptContent = getInstanceStateValue(newNode, StateProp.innerHTML);
                    const scriptType = getInstanceStateValue(newNode, StateProp.type);
                    if (scriptContent) {
                        if (isScriptJsType(scriptType)) {
                            const scriptId = newNode.id;
                            const loadOnMainThread = scriptId && testIfMustLoadScriptOnMainThread(config, scriptId);
                            if (loadOnMainThread) {
                                setter(newNode, [ "type" ], "text/javascript");
                            } else {
                                const errorMsg = runScriptContent(env, instanceId, scriptContent, winId, "");
                                const datasetType = errorMsg ? "pterror" : "ptid";
                                const datasetValue = errorMsg || instanceId;
                                setter(newNode, [ "type" ], "text/partytown-x");
                                setter(newNode, [ "dataset", datasetType ], datasetValue);
                            }
                        }
                        setter(newNode, [ "innerHTML" ], scriptContent);
                    }
                }
                callMethod(this, [ "insertBefore" ], [ newNode, referenceNode ], CallType.NonBlocking);
                if (isIFrame) {
                    const src = getInstanceStateValue(newNode, StateProp.src);
                    if (src && src.startsWith("javascript:")) {
                        const scriptContent = src.split("javascript:")[1];
                        runScriptContent(env, instanceId, scriptContent, winId, "");
                    }
                    ((winId, iframe) => {
                        let i = 0;
                        let type;
                        let handlers;
                        let callback = () => {
                            if (environments[winId] && environments[winId].$isInitialized$ && !environments[winId].$isLoading$) {
                                type = getInstanceStateValue(iframe, StateProp.loadErrorStatus) ? StateProp.errorHandlers : StateProp.loadHandlers;
                                handlers = getInstanceStateValue(iframe, type);
                                handlers && handlers.map((handler => handler({
                                    type: type
                                })));
                            } else if (i++ > 2e3) {
                                handlers = getInstanceStateValue(iframe, StateProp.errorHandlers);
                                handlers && handlers.map((handler => handler({
                                    type: StateProp.errorHandlers
                                })));
                            } else {
                                setTimeout(callback, 9);
                            }
                        };
                        callback();
                    })(instanceId, newNode);
                }
                if (isScript) {
                    sendToMain(true);
                    webWorkerCtx.$postMessage$([ WorkerMessageType.InitializeNextScript, winId ]);
                }
                return newNode;
            }
            get nodeName() {
                return "#s" === this[InstanceDataKey] ? "#document-fragment" : this[InstanceDataKey];
            }
            get nodeType() {
                return 3;
            }
            get ownerDocument() {
                return env.$document$;
            }
        }, "Node");
        cachedTreeProps(WorkerNode, commaSplit("childNodes,firstChild,isConnected,lastChild,nextSibling,parentElement,parentNode,previousSibling"));
        win.Node = WorkerNode;
    };
    const htmlMedia = commaSplit("AUDIO,CANVAS,VIDEO");
    const windowMediaConstructors = commaSplit("Audio,MediaSource");
    const patchDocument = (WorkerDocument, env, isDocumentImplementation) => {
        const DocumentDescriptorMap = {
            body: {
                get: () => env.$body$
            },
            cookie: {
                get() {
                    if (env.$isSameOrigin$) {
                        return getter(this, [ "cookie" ]);
                    }
                    warnCrossOrigin("get", "cookie", env);
                    return "";
                },
                set(value) {
                    if (env.$isSameOrigin$) {
                        setter(this, [ "cookie" ], value);
                    } else {
                        warnCrossOrigin("set", "cookie", env);
                    }
                }
            },
            createElement: {
                value(tagName) {
                    tagName = tagName.toUpperCase();
                    if (!IS_TAG_REG.test(tagName)) {
                        throw tagName + " not valid";
                    }
                    const isIframe = tagName === NodeName.IFrame;
                    const winId = this[WinIdKey];
                    const instanceId = (isIframe ? "f_" : "") + randomId();
                    callMethod(this, [ "createElement" ], [ tagName ], CallType.NonBlocking, instanceId);
                    const elm = getOrCreateNodeInstance(winId, instanceId, tagName);
                    if (isIframe) {
                        const env = createEnvironment({
                            $winId$: instanceId,
                            $parentWinId$: winId,
                            $url$: "about:blank"
                        }, true);
                        env.$window$.fetch = fetch;
                        setter(elm, [ "srcdoc" ], getPartytownScript());
                    } else if (tagName === NodeName.Script) {
                        const scriptType = getInstanceStateValue(elm, StateProp.type);
                        isScriptJsType(scriptType) && setter(elm, [ "type" ], "text/partytown");
                    }
                    return elm;
                }
            },
            createElementNS: {
                value(namespace, tagName) {
                    const instanceId = randomId();
                    const nsElm = getOrCreateNodeInstance(this[WinIdKey], instanceId, tagName, namespace);
                    callMethod(this, [ "createElementNS" ], [ namespace, tagName ], CallType.NonBlocking, instanceId);
                    return nsElm;
                }
            },
            createTextNode: {
                value(text) {
                    const winId = this[WinIdKey];
                    const instanceId = randomId();
                    const textNode = getOrCreateNodeInstance(winId, instanceId, NodeName.Text);
                    callMethod(this, [ "createTextNode" ], [ text ], CallType.NonBlocking, instanceId);
                    return textNode;
                }
            },
            createEvent: {
                value: type => new Event(type)
            },
            currentScript: {
                get() {
                    return env.$currentScriptId$ ? getOrCreateNodeInstance(this[WinIdKey], env.$currentScriptId$, NodeName.Script) : null;
                }
            },
            defaultView: {
                get: () => isDocumentImplementation ? null : env.$window$
            },
            documentElement: {
                get: () => env.$documentElement$
            },
            getElementsByTagName: {
                value(tagName) {
                    tagName = tagName.toUpperCase();
                    return tagName === NodeName.Body ? [ env.$body$ ] : tagName === NodeName.Head ? [ env.$head$ ] : callMethod(this, [ "getElementsByTagName" ], [ tagName ]);
                }
            },
            head: {
                get: () => env.$head$
            },
            images: {
                get() {
                    return getter(this, [ "images" ]);
                }
            },
            scripts: {
                get() {
                    return getter(this, [ "scripts" ]);
                }
            },
            adoptedStyleSheets: {
                get() {
                    return getter(this, [ "adoptedStyleSheets" ]);
                }
            },
            implementation: {
                get() {
                    return {
                        hasFeature: () => true,
                        createHTMLDocument: title => {
                            const $winId$ = randomId();
                            callMethod(this, [ "implementation", "createHTMLDocument" ], [ title ], CallType.Blocking, {
                                $winId$: $winId$
                            });
                            const docEnv = createEnvironment({
                                $winId$: $winId$,
                                $parentWinId$: $winId$,
                                $url$: env.$location$ + "",
                                $visibilityState$: "hidden"
                            }, true, true);
                            return docEnv.$document$;
                        }
                    };
                }
            },
            location: {
                get: () => env.$location$,
                set(url) {
                    env.$location$.href = url + "";
                }
            },
            nodeType: {
                value: 9
            },
            parentNode: {
                value: null
            },
            parentElement: {
                value: null
            },
            readyState: {
                value: "complete"
            },
            visibilityState: {
                get: () => env.$visibilityState$ || "visible"
            }
        };
        definePrototypePropertyDescriptor(WorkerDocument, DocumentDescriptorMap);
        cachedProps(WorkerDocument, "compatMode,referrer,forms");
    };
    const patchDocumentElementChild = (WokerDocumentElementChild, env) => {
        const DocumentElementChildDescriptorMap = {
            parentElement: {
                get() {
                    return this.parentNode;
                }
            },
            parentNode: {
                get: () => env.$documentElement$
            }
        };
        definePrototypePropertyDescriptor(WokerDocumentElementChild, DocumentElementChildDescriptorMap);
    };
    const patchElement = (WorkerElement, WorkerHTMLElement) => {
        const ElementDescriptorMap = {
            localName: {
                get() {
                    return this[InstanceDataKey].toLowerCase();
                }
            },
            namespaceURI: {
                get() {
                    return this[NamespaceKey] || "http://www.w3.org/1999/xhtml";
                }
            },
            nodeType: {
                value: 1
            },
            tagName: {
                get() {
                    return this[InstanceDataKey];
                }
            }
        };
        definePrototypePropertyDescriptor(WorkerElement, ElementDescriptorMap);
        cachedTreeProps(WorkerElement, elementStructurePropNames);
        cachedProps(WorkerElement, "id");
        cachedDimensionProps(WorkerHTMLElement);
        cachedDimensionMethods(WorkerHTMLElement, commaSplit("getClientRects,getBoundingClientRect"));
    };
    const patchHTMLAnchorElement = (WorkerHTMLAnchorElement, env) => {
        const HTMLAnchorDescriptorMap = {};
        commaSplit("hash,host,hostname,href,origin,pathname,port,protocol,search").map((anchorProp => {
            HTMLAnchorDescriptorMap[anchorProp] = {
                get() {
                    let value = getInstanceStateValue(this, StateProp.url);
                    let href;
                    if ("string" != typeof value) {
                        href = getter(this, [ "href" ]);
                        if ("" === href) {
                            return "protocol" === anchorProp ? ":" : "";
                        }
                        setInstanceStateValue(this, StateProp.url, href);
                        value = new URL(href)[anchorProp];
                    }
                    return resolveToUrl(env, value, null)[anchorProp];
                },
                set(value) {
                    let url;
                    if ("href" === anchorProp) {
                        if ((url => {
                            try {
                                new URL(url);
                                return true;
                            } catch (_) {
                                return false;
                            }
                        })(value)) {
                            url = new URL(value);
                        } else {
                            const baseHref = env.$location$.href;
                            url = resolveToUrl(env, baseHref, null);
                            url.href = new URL(value + "", url.href);
                        }
                    } else {
                        url = resolveToUrl(env, this.href, null);
                        url[anchorProp] = value;
                    }
                    setInstanceStateValue(this, StateProp.url, url.href);
                    setter(this, [ "href" ], url.href);
                }
            };
        }));
        definePrototypePropertyDescriptor(WorkerHTMLAnchorElement, HTMLAnchorDescriptorMap);
    };
    const patchHTMLIFrameElement = (WorkerHTMLIFrameElement, env) => {
        const HTMLIFrameDescriptorMap = {
            contentDocument: {
                get() {
                    return getIframeEnv(this).$document$;
                }
            },
            contentWindow: {
                get() {
                    return getIframeEnv(this).$window$;
                }
            },
            src: {
                get() {
                    let src = getInstanceStateValue(this, StateProp.src);
                    if (src && src.startsWith("javascript:")) {
                        return src;
                    }
                    src = getIframeEnv(this).$location$.href;
                    return src.startsWith("about:") ? "" : src;
                },
                set(src) {
                    if (src) {
                        if (src.startsWith("javascript:")) {
                            setInstanceStateValue(this, StateProp.src, src);
                        } else if (!src.startsWith("about:")) {
                            let xhr = new XMLHttpRequest;
                            let xhrStatus;
                            let env = getIframeEnv(this);
                            env.$location$.href = src = resolveUrl(env, src, "iframe");
                            env.$isLoading$ = 1;
                            env.$isSameOrigin$ = webWorkerCtx.$origin$ === env.$location$.origin;
                            setInstanceStateValue(this, StateProp.loadErrorStatus, void 0);
                            xhr.open("GET", src, false);
                            xhr.send();
                            xhrStatus = xhr.status;
                            if (xhrStatus > 199 && xhrStatus < 300) {
                                setter(this, [ "srcdoc" ], `<base href="${src}">` + function(text) {
                                    return text.replace(SCRIPT_TAG_REGEXP, ((_, attrs) => {
                                        const parts = [];
                                        let hasType = false;
                                        let match;
                                        while (match = ATTR_REGEXP.exec(attrs)) {
                                            let [keyValue] = match;
                                            if (keyValue.startsWith("type=")) {
                                                hasType = true;
                                                keyValue = keyValue.replace(/(application|text)\/javascript/, SCRIPT_TYPE);
                                            }
                                            parts.push(keyValue);
                                        }
                                        hasType || parts.push('type="text/partytown"');
                                        return `<script ${parts.join(" ")}>`;
                                    }));
                                }(xhr.responseText) + getPartytownScript());
                                sendToMain(true);
                                webWorkerCtx.$postMessage$([ WorkerMessageType.InitializeNextScript, env.$winId$ ]);
                            } else {
                                setInstanceStateValue(this, StateProp.loadErrorStatus, xhrStatus);
                                env.$isLoading$ = 0;
                            }
                        }
                    }
                }
            },
            ...HTMLSrcElementDescriptorMap
        };
        definePrototypePropertyDescriptor(WorkerHTMLIFrameElement, HTMLIFrameDescriptorMap);
    };
    const ATTR_REGEXP_STR = "((?:\\w|-)+(?:=(?:(?:\\w|-)+|'[^']*'|\"[^\"]*\")?)?)";
    const SCRIPT_TAG_REGEXP = new RegExp(`<script\\s*((${ATTR_REGEXP_STR}\\s*)*)>`, "mg");
    const ATTR_REGEXP = new RegExp(ATTR_REGEXP_STR, "mg");
    const getIframeEnv = iframe => {
        const $winId$ = iframe[InstanceIdKey];
        environments[$winId$] || createEnvironment({
            $winId$: $winId$,
            $parentWinId$: iframe[WinIdKey],
            $url$: getter(iframe, [ "src" ]) || "about:blank"
        }, true);
        return environments[$winId$];
    };
    const patchSvgElement = WorkerSVGGraphicsElement => {
        const getMatrix = (elm, methodName) => {
            const {a: a, b: b, c: c, d: d, e: e, f: f} = callMethod(elm, [ methodName ], EMPTY_ARRAY);
            return new DOMMatrixReadOnly([ a, b, c, d, e, f ]);
        };
        const SVGGraphicsElementDescriptorMap = {
            ...WorkerSVGGraphicsElement,
            getCTM: {
                value: function() {
                    return getMatrix(this, "getCTM");
                }
            },
            getScreenCTM: {
                value: function() {
                    return getMatrix(this, "getScreenCTM");
                }
            }
        };
        definePrototypePropertyDescriptor(WorkerSVGGraphicsElement, SVGGraphicsElementDescriptorMap);
    };
    const createNamedNodeMapCstr = (win, WorkerBase) => {
        win.NamedNodeMap = defineConstructorName(class NamedNodeMap extends WorkerBase {
            constructor(winId, instanceId, applyPath) {
                super(winId, instanceId, applyPath);
                return new Proxy(this, {
                    get(target, propName) {
                        const handler = NAMED_NODE_MAP_HANDLERS[propName];
                        return handler ? handler.bind(target, [ propName ]) : getter(target, [ propName ]);
                    },
                    set(target, propName, propValue) {
                        const handler = NAMED_NODE_MAP_HANDLERS[propName];
                        if (handler) {
                            throw new Error("Can't set read-only property: " + String(propName));
                        }
                        setter(target, [ propName ], propValue);
                        return true;
                    }
                });
            }
        }, "NamedNodeMap");
    };
    function method(applyPath, ...args) {
        return callMethod(this, applyPath, args, CallType.Blocking);
    }
    const NAMED_NODE_MAP_HANDLERS = {
        getNamedItem: method,
        getNamedItemNS: method,
        item: method,
        removeNamedItem: method,
        removeNamedItemNS: method,
        setNamedItem: method,
        setNamedItemNS: method
    };
    const createWindow = ($winId$, $parentWinId$, url, $visibilityState$, isIframeWindow, isDocumentImplementation) => {
        let cstrInstanceId;
        let cstrNodeName;
        let cstrNamespace;
        let cstrPrevInstance;
        const WorkerBase = class {
            constructor(winId, instanceId, applyPath, instanceData, namespace) {
                this[WinIdKey] = winId || $winId$;
                this[InstanceIdKey] = instanceId || cstrInstanceId || randomId();
                this[ApplyPathKey] = applyPath || [];
                this[InstanceDataKey] = instanceData || cstrNodeName;
                this[NamespaceKey] = namespace || cstrNamespace;
                this[InstanceStateKey] = cstrPrevInstance && cstrPrevInstance[InstanceStateKey] || {};
                cstrInstanceId = cstrNodeName = cstrNamespace = void 0;
            }
        };
        const WorkerLocation = defineConstructorName(class extends URL {
            assign() {
                logWorker("location.assign(), noop");
            }
            reload() {
                logWorker("location.reload(), noop");
            }
            replace() {
                logWorker("location.replace(), noop");
            }
        }, "Location");
        const $location$ = new WorkerLocation(url);
        const $isSameOrigin$ = $location$.origin === webWorkerCtx.$origin$ || "about:blank" === $location$.origin;
        const $isTopWindow$ = $parentWinId$ === $winId$;
        const env = {};
        const getChildEnvs = () => {
            let childEnv = [];
            let envWinId;
            let otherEnv;
            for (envWinId in environments) {
                otherEnv = environments[envWinId];
                otherEnv.$parentWinId$ !== $winId$ || otherEnv.$isTopWindow$ || childEnv.push(otherEnv);
            }
            return childEnv;
        };
        const WorkerWindow = defineConstructorName(class extends WorkerBase {
            constructor() {
                super($winId$, $winId$);
                this.addEventListener = (...args) => {
                    "load" === args[0] ? env.$runWindowLoadEvent$ && setTimeout((() => args[1]({
                        type: "load"
                    }))) : callMethod(this, [ "addEventListener" ], args, CallType.NonBlocking);
                };
                let win = this;
                let value;
                let historyState;
                let hasInitializedMedia = 0;
                let initWindowMedia = () => {
                    if (!hasInitializedMedia) {
                        (() => {
                            if (!webWorkerCtx.$initWindowMedia$) {
                                self.$bridgeToMedia$ = [ getter, setter, callMethod, constructGlobal, definePrototypePropertyDescriptor, randomId, WinIdKey, InstanceIdKey, ApplyPathKey ];
                                webWorkerCtx.$importScripts$(partytownLibUrl("partytown-media.js?v=0.11.2"));
                                webWorkerCtx.$initWindowMedia$ = self.$bridgeFromMedia$;
                                delete self.$bridgeFromMedia$;
                            }
                            return webWorkerCtx.$initWindowMedia$;
                        })()(WorkerBase, WorkerEventTargetProxy, env, win, windowMediaConstructors);
                        hasInitializedMedia = 1;
                    }
                };
                let nodeCstrs = {};
                let $createNode$ = (nodeName, instanceId, namespace, prevInstance) => {
                    htmlMedia.includes(nodeName) && initWindowMedia();
                    const NodeCstr = nodeCstrs[nodeName] ? nodeCstrs[nodeName] : nodeName.includes("-") ? nodeCstrs.UNKNOWN : nodeCstrs.I;
                    cstrInstanceId = instanceId;
                    cstrNodeName = nodeName;
                    cstrNamespace = namespace;
                    cstrPrevInstance = prevInstance;
                    return new NodeCstr;
                };
                win.Window = WorkerWindow;
                win.name = name + `${normalizedWinId($winId$)} (${$winId$})`;
                createNodeCstr(win, env, WorkerBase);
                (win => {
                    win.NodeList = defineConstructorName(NodeList, "NodeList");
                })(win);
                createNamedNodeMapCstr(win, WorkerBase);
                createCSSStyleDeclarationCstr(win, WorkerBase, "CSSStyleDeclaration");
                ((win, WorkerBase, cstrName) => {
                    win[cstrName] = defineConstructorName(class extends WorkerBase {
                        now() {
                            return performance.now();
                        }
                    }, cstrName);
                })(win, WorkerBase, "Performance");
                ((win, nodeCstrs) => {
                    const registry = new Map;
                    win.customElements = {
                        define(tagName, Cstr, opts) {
                            registry.set(tagName, Cstr);
                            nodeCstrs[tagName.toUpperCase()] = Cstr;
                            const ceData = [ Cstr.name, Cstr.observedAttributes ];
                            callMethod(win, [ "customElements", "define" ], [ tagName, ceData, opts ]);
                        },
                        get: tagName => registry.get(tagName) || callMethod(win, [ "customElements", "get" ], [ tagName ]),
                        whenDefined: tagName => registry.has(tagName) ? Promise.resolve() : callMethod(win, [ "customElements", "whenDefined" ], [ tagName ]),
                        upgrade: elm => callMethod(win, [ "customElements", "upgrade" ], [ elm ])
                    };
                })(win, nodeCstrs);
                webWorkerCtx.$interfaces$.map((([cstrName, superCstrName, members, interfaceType, nodeName]) => {
                    const SuperCstr = TrapConstructors[cstrName] ? WorkerTrapProxy : "EventTarget" === superCstrName ? WorkerEventTargetProxy : "Object" === superCstrName ? WorkerBase : win[superCstrName];
                    const Cstr = win[cstrName] = defineConstructorName(interfaceType === InterfaceType.EnvGlobalConstructor ? class extends WorkerBase {
                        constructor(...args) {
                            super();
                            constructGlobal(this, cstrName, args);
                        }
                    } : win[cstrName] || class extends SuperCstr {}, cstrName);
                    nodeName && (nodeCstrs[nodeName] = Cstr);
                    members.map((([memberName, memberType, staticValue]) => {
                        memberName in Cstr.prototype || memberName in SuperCstr.prototype || ("string" == typeof memberType ? definePrototypeProperty(Cstr, memberName, {
                            get() {
                                if (!hasInstanceStateValue(this, memberName)) {
                                    const instanceId = this[InstanceIdKey];
                                    const applyPath = [ ...this[ApplyPathKey], memberName ];
                                    const PropCstr = win[memberType];
                                    PropCstr && setInstanceStateValue(this, memberName, new PropCstr($winId$, instanceId, applyPath));
                                }
                                return getInstanceStateValue(this, memberName);
                            },
                            set(value) {
                                setInstanceStateValue(this, memberName, value);
                            }
                        }) : memberType === InterfaceType.Function ? definePrototypeValue(Cstr, memberName, (function(...args) {
                            return callMethod(this, [ memberName ], args);
                        })) : memberType > 0 && (void 0 !== staticValue ? definePrototypeValue(Cstr, memberName, staticValue) : definePrototypeProperty(Cstr, memberName, {
                            get() {
                                return getter(this, [ memberName ]);
                            },
                            set(value) {
                                return setter(this, [ memberName ], value);
                            }
                        })));
                    }));
                }));
                commaSplit("atob,btoa,crypto,indexedDB,setTimeout,setInterval,clearTimeout,clearInterval").map((globalName => {
                    delete WorkerWindow.prototype[globalName];
                    if (!(globalName in win)) {
                        value = self[globalName];
                        null != value && (win[globalName] = "function" != typeof value || value.toString().startsWith("class") ? value : value.bind(self));
                    }
                }));
                Object.getOwnPropertyNames(self).map((globalName => {
                    globalName in win || (win[globalName] = self[globalName]);
                }));
                windowMediaConstructors.map((cstrName => defineProperty(win, cstrName, {
                    get() {
                        initWindowMedia();
                        return win[cstrName];
                    }
                })));
                "trustedTypes" in self && (win.trustedTypes = self.trustedTypes);
                patchElement(win.Element, win.HTMLElement);
                patchDocument(win.Document, env, isDocumentImplementation);
                (WorkerDocumentFragment => {
                    definePrototypeNodeType(WorkerDocumentFragment, 11);
                    cachedTreeProps(WorkerDocumentFragment, elementStructurePropNames);
                })(win.DocumentFragment);
                patchHTMLAnchorElement(win.HTMLAnchorElement, env);
                (WorkerHTMLFormElement => {
                    definePrototypePropertyDescriptor(WorkerHTMLFormElement, {});
                    cachedProps(WorkerHTMLFormElement, "elements");
                })(win.HTMLFormElement);
                patchHTMLIFrameElement(win.HTMLIFrameElement);
                patchHTMLScriptElement(win.HTMLScriptElement, env);
                patchSvgElement(win.SVGGraphicsElement);
                patchDocumentElementChild(win.HTMLHeadElement, env);
                patchDocumentElementChild(win.HTMLBodyElement, env);
                ((WorkerHTMLHtmlElement, env) => {
                    const DocumentElementDescriptorMap = {
                        parentElement: {
                            value: null
                        },
                        parentNode: {
                            get: () => env.$document$
                        }
                    };
                    definePrototypePropertyDescriptor(WorkerHTMLHtmlElement, DocumentElementDescriptorMap);
                })(win.HTMLHtmlElement, env);
                createCSSStyleSheetConstructor(win, "CSSStyleSheet");
                createCSSStyleSheetConstructor(win, "CSSMediaRule");
                definePrototypeNodeType(win.Comment, 8);
                definePrototypeNodeType(win.DocumentType, 10);
                Object.assign(env, {
                    $winId$: $winId$,
                    $parentWinId$: $parentWinId$,
                    $window$: new Proxy(win, {
                        get: (win, propName) => {
                            var _a;
                            if ("string" != typeof propName || isNaN(propName)) {
                                return (null === (_a = webWorkerCtx.$config$.mainWindowAccessors) || void 0 === _a ? void 0 : _a.includes(propName)) ? getter(this, [ propName ]) : win[propName];
                            }
                            {
                                let frame = getChildEnvs()[propName];
                                return frame ? frame.$window$ : void 0;
                            }
                        },
                        has: () => true
                    }),
                    $document$: $createNode$(NodeName.Document, $winId$ + "." + WinDocId.document),
                    $documentElement$: $createNode$(NodeName.DocumentElement, $winId$ + "." + WinDocId.documentElement),
                    $head$: $createNode$(NodeName.Head, $winId$ + "." + WinDocId.head),
                    $body$: $createNode$(NodeName.Body, $winId$ + "." + WinDocId.body),
                    $location$: $location$,
                    $visibilityState$: $visibilityState$,
                    $isSameOrigin$: $isSameOrigin$,
                    $isTopWindow$: $isTopWindow$,
                    $createNode$: $createNode$
                });
                win.requestAnimationFrame = cb => setTimeout((() => cb(performance.now())), 9);
                win.cancelAnimationFrame = id => clearTimeout(id);
                win.requestIdleCallback = (cb, start) => {
                    start = Date.now();
                    return setTimeout((() => cb({
                        didTimeout: false,
                        timeRemaining: () => Math.max(0, 50 - (Date.now() - start))
                    })), 1);
                };
                win.cancelIdleCallback = id => clearTimeout(id);
                addStorageApi(win, "localStorage", env);
                addStorageApi(win, "sessionStorage", env);
                $isSameOrigin$ || (win.indexeddb = void 0);
                if (isIframeWindow) {
                    historyState = {};
                    win.history = {
                        pushState(stateObj) {
                            historyState = stateObj;
                        },
                        replaceState(stateObj) {
                            historyState = stateObj;
                        },
                        get state() {
                            return historyState;
                        },
                        length: 0
                    };
                    win.indexeddb = void 0;
                } else {
                    const originalPushState = win.history.pushState.bind(win.history);
                    const originalReplaceState = win.history.replaceState.bind(win.history);
                    win.history.pushState = (stateObj, _, newUrl) => {
                        false !== env.$propagateHistoryChange$ && originalPushState(stateObj, _, newUrl);
                    };
                    win.history.replaceState = (stateObj, _, newUrl) => {
                        false !== env.$propagateHistoryChange$ && originalReplaceState(stateObj, _, newUrl);
                    };
                }
                win.Worker = void 0;
            }
            get body() {
                return env.$body$;
            }
            get document() {
                return env.$document$;
            }
            get documentElement() {
                return env.$documentElement$;
            }
            fetch(input, init) {
                input = "string" == typeof input || input instanceof URL ? String(input) : input.url;
                return fetch(resolveUrl(env, input, "fetch"), init);
            }
            get frames() {
                return env.$window$;
            }
            get frameElement() {
                return $isTopWindow$ ? null : getOrCreateNodeInstance($parentWinId$, $winId$, NodeName.IFrame);
            }
            get globalThis() {
                return env.$window$;
            }
            get head() {
                return env.$head$;
            }
            get length() {
                return getChildEnvs().length;
            }
            get location() {
                return $location$;
            }
            set location(loc) {
                $location$.href = loc + "";
            }
            get Image() {
                return createImageConstructor(env);
            }
            get navigator() {
                return (env => {
                    const nav = {
                        sendBeacon: (url, body) => {
                            if (webWorkerCtx.$config$.logSendBeaconRequests) {
                                try {
                                    logWorker(`sendBeacon: ${resolveUrl(env, url, null)}${body ? ", data: " + JSON.stringify(body) : ""}, resolvedParams: ${JSON.stringify(resolveSendBeaconRequestParameters(env, url))}`);
                                } catch (e) {
                                    console.error(e);
                                }
                            }
                            try {
                                fetch(resolveUrl(env, url, null), {
                                    method: "POST",
                                    body: body,
                                    mode: "no-cors",
                                    keepalive: true,
                                    ...resolveSendBeaconRequestParameters(env, url)
                                });
                                return true;
                            } catch (e) {
                                console.error(e);
                                return false;
                            }
                        }
                    };
                    for (let key in navigator) {
                        nav[key] = navigator[key];
                    }
                    return new Proxy(nav, {
                        set(_, propName, propValue) {
                            navigator[propName] = propValue;
                            return true;
                        },
                        get(target, prop) {
                            if (Object.prototype.hasOwnProperty.call(target, prop)) {
                                return target[prop];
                            }
                            const value = getter(env.$window$, [ "navigator", prop ]);
                            return value;
                        }
                    });
                })(env);
            }
            get origin() {
                return $location$.origin;
            }
            set origin(_) {}
            get parent() {
                for (let envWinId in environments) {
                    if (environments[envWinId].$winId$ === $parentWinId$) {
                        return environments[envWinId].$window$;
                    }
                }
                return env.$window$;
            }
            postMessage(...args) {
                if (environments[args[0]]) {
                    len(postMessages) > 50 && postMessages.splice(0, 5);
                    postMessages.push({
                        $winId$: args[0],
                        $data$: JSON.stringify(args[1])
                    });
                    args = args.slice(1);
                }
                callMethod(this, [ "postMessage" ], args, CallType.NonBlockingNoSideEffect);
            }
            get self() {
                return env.$window$;
            }
            get top() {
                for (let envWinId in environments) {
                    if (environments[envWinId].$isTopWindow$) {
                        return environments[envWinId].$window$;
                    }
                }
                return env.$window$;
            }
            get window() {
                return env.$window$;
            }
            get XMLHttpRequest() {
                const Xhr = XMLHttpRequest;
                const str = String(Xhr);
                const ExtendedXhr = defineConstructorName(class extends Xhr {
                    open(...args) {
                        args[1] = resolveUrl(env, args[1], "xhr");
                        super.open(...args);
                    }
                    set withCredentials(_) {
                        webWorkerCtx.$config$.allowXhrCredentials && (super.withCredentials = _);
                    }
                    toString() {
                        return str;
                    }
                }, getConstructorName(Xhr));
                ExtendedXhr.prototype.constructor.toString = () => str;
                return ExtendedXhr;
            }
        }, "Window");
        const WorkerTrapProxy = class extends WorkerBase {
            constructor(winId, instanceId, applyPath, nodeName) {
                super(winId, instanceId, applyPath, nodeName);
                return new Proxy(this, {
                    get: (instance, propName) => getter(instance, [ propName ]),
                    set(instance, propName, propValue) {
                        setter(instance, [ propName ], propValue);
                        return true;
                    }
                });
            }
        };
        const WorkerEventTargetProxy = class extends WorkerBase {};
        eventTargetMethods.map((methodName => WorkerEventTargetProxy.prototype[methodName] = function(...args) {
            return callMethod(this, [ methodName ], args, CallType.NonBlocking);
        }));
        cachedProps(WorkerWindow, "devicePixelRatio");
        cachedDimensionProps(WorkerWindow);
        cachedDimensionMethods(WorkerWindow, [ "getComputedStyle" ]);
        new WorkerWindow;
        return env;
    };
    const TrapConstructors = {
        DOMStringMap: 1,
        NamedNodeMap: 1
    };
    const createEnvironment = ({$winId$: $winId$, $parentWinId$: $parentWinId$, $url$: $url$, $visibilityState$: $visibilityState$}, isIframeWindow, isDocumentImplementation) => {
        if (!environments[$winId$]) {
            environments[$winId$] = createWindow($winId$, $parentWinId$, $url$, $visibilityState$, isIframeWindow, isDocumentImplementation);
            {
                const winType = $winId$ === $parentWinId$ ? "top" : "iframe";
                logWorker(`Created ${winType} window ${normalizedWinId($winId$)} environment`, $winId$);
            }
        }
        webWorkerCtx.$postMessage$([ WorkerMessageType.InitializeNextScript, $winId$ ]);
        return environments[$winId$];
    };
    const queuedEvents = [];
    const receiveMessageFromSandboxToWorker = ev => {
        const msg = ev.data;
        const msgType = msg[0];
        const msgValue = msg[1];
        if (webWorkerCtx.$isInitialized$) {
            if (msgType === WorkerMessageType.InitializeNextScript) {
                (async initScript => {
                    let winId = initScript.$winId$;
                    let instanceId = initScript.$instanceId$;
                    let instance = getOrCreateNodeInstance(winId, instanceId, NodeName.Script);
                    let scriptContent = initScript.$content$;
                    let scriptSrc = initScript.$url$;
                    let scriptOrgSrc = initScript.$orgUrl$;
                    let errorMsg = "";
                    let env = environments[winId];
                    let rsp;
                    let javascriptContentTypes = [ "text/jscript", "text/javascript", "text/x-javascript", "application/javascript", "application/x-javascript", "text/ecmascript", "text/x-ecmascript", "application/ecmascript" ];
                    if (scriptSrc) {
                        try {
                            scriptSrc = resolveToUrl(env, scriptSrc, "script") + "";
                            setInstanceStateValue(instance, StateProp.url, scriptSrc);
                            webWorkerCtx.$config$.logScriptExecution && logWorker(`Execute script src: ${scriptOrgSrc}`, winId);
                            rsp = await fetch(scriptSrc);
                            if (rsp.ok) {
                                let responseContentType = rsp.headers.get("content-type");
                                let shouldExecute = javascriptContentTypes.some((ct => {
                                    var _a, _b, _c;
                                    return null === (_c = null === (_a = null == responseContentType ? void 0 : responseContentType.toLowerCase) || void 0 === _a ? void 0 : (_b = _a.call(responseContentType)).includes) || void 0 === _c ? void 0 : _c.call(_b, ct);
                                }));
                                if (shouldExecute) {
                                    scriptContent = await rsp.text();
                                    env.$currentScriptId$ = instanceId;
                                    run(env, scriptContent, scriptOrgSrc || scriptSrc);
                                }
                                runStateLoadHandlers(instance, StateProp.loadHandlers);
                            } else {
                                errorMsg = rsp.statusText;
                                runStateLoadHandlers(instance, StateProp.errorHandlers);
                            }
                        } catch (urlError) {
                            console.error(urlError);
                            errorMsg = String(urlError.stack || urlError);
                            runStateLoadHandlers(instance, StateProp.errorHandlers);
                        }
                    } else {
                        scriptContent && (errorMsg = runScriptContent(env, instanceId, scriptContent, winId, errorMsg));
                    }
                    env.$currentScriptId$ = "";
                    webWorkerCtx.$postMessage$([ WorkerMessageType.InitializedEnvironmentScript, winId, instanceId, errorMsg ]);
                })(msgValue);
            } else if (msgType === WorkerMessageType.RefHandlerCallback) {
                (({$winId$: $winId$, $instanceId$: $instanceId$, $refId$: $refId$, $thisArg$: $thisArg$, $args$: $args$}) => {
                    if (webWorkerRefsByRefId[$refId$]) {
                        try {
                            webWorkerRefsByRefId[$refId$].apply(deserializeFromMain($winId$, $instanceId$, [], $thisArg$), deserializeFromMain($winId$, $instanceId$, [], $args$));
                        } catch (e) {
                            console.error(e);
                        }
                    }
                })(msgValue);
            } else if (msgType === WorkerMessageType.ForwardMainTrigger) {
                (({$winId$: $winId$, $forward$: $forward$, $args$: $args$}) => {
                    try {
                        let target = environments[$winId$].$window$;
                        let i = 0;
                        let l = len($forward$);
                        for (;i < l; i++) {
                            i + 1 < l ? target = target[$forward$[i]] : target[$forward$[i]].apply(target, deserializeFromMain(null, $winId$, [], $args$));
                        }
                    } catch (e) {
                        console.error(e);
                    }
                })(msgValue);
            } else if (msgType === WorkerMessageType.InitializeEnvironment) {
                createEnvironment(msgValue);
            } else if (msgType === WorkerMessageType.InitializedScripts) {
                if (1 !== environments[msgValue].$isInitialized$) {
                    const winId = msgValue;
                    const env = environments[winId];
                    const winType = env.$winId$ === env.$parentWinId$ ? "top" : "iframe";
                    logWorker(`Initialized ${winType} window ${normalizedWinId(winId)} environment 🎉`, winId);
                }
                environments[msgValue].$isInitialized$ = 1;
                environments[msgValue].$isLoading$ = 0;
            } else if (msgType === WorkerMessageType.DocumentVisibilityState) {
                environments[msgValue].$visibilityState$ = msg[2];
            } else if (msgType === WorkerMessageType.LocationUpdate) {
                const $winId$ = msgValue.$winId$;
                const env = environments[$winId$];
                env.$location$.href = msgValue.url;
                !function($winId$, env, data) {
                    const history = env.$window$.history;
                    switch (data.type) {
                      case LocationUpdateType.PushState:
                        env.$propagateHistoryChange$ = false;
                        try {
                            history.pushState(data.state, "", data.newUrl);
                        } catch (e) {}
                        env.$propagateHistoryChange$ = true;
                        break;

                      case LocationUpdateType.ReplaceState:
                        env.$propagateHistoryChange$ = false;
                        try {
                            history.replaceState(data.state, "", data.newUrl);
                        } catch (e) {}
                        env.$propagateHistoryChange$ = true;
                    }
                }(msgValue.$winId$, env, msgValue);
            } else {
                msgType === WorkerMessageType.CustomElementCallback && ((_type, winId, instanceId, callbackName, args) => {
                    const elm = getOrCreateNodeInstance(winId, instanceId);
                    elm && "function" == typeof elm[callbackName] && elm[callbackName].apply(elm, args);
                })(...msg);
            }
        } else if (msgType === WorkerMessageType.MainDataResponseToWorker) {
            (initWebWorkerData => {
                const config = webWorkerCtx.$config$ = JSON.parse(initWebWorkerData.$config$);
                const locOrigin = initWebWorkerData.$origin$;
                webWorkerCtx.$importScripts$ = importScripts.bind(self);
                webWorkerCtx.$interfaces$ = initWebWorkerData.$interfaces$;
                webWorkerCtx.$libPath$ = initWebWorkerData.$libPath$;
                webWorkerCtx.$origin$ = locOrigin;
                webWorkerCtx.$postMessage$ = postMessage.bind(self);
                webWorkerCtx.$sharedDataBuffer$ = initWebWorkerData.$sharedDataBuffer$;
                webWorkerCtx.$tabId$ = initWebWorkerData.$tabId$;
                self.importScripts = void 0;
                delete self.postMessage;
                delete self.WorkerGlobalScope;
                commaSplit("resolveUrl,resolveSendBeaconRequestParameters,get,set,apply").map((configName => {
                    config[configName] && (config[configName] = new Function("return " + config[configName])());
                }));
            })(msgValue);
            webWorkerCtx.$postMessage$([ WorkerMessageType.MainInterfacesRequestFromWorker ]);
        } else if (msgType === WorkerMessageType.MainInterfacesResponseToWorker) {
            webWorkerCtx.$interfaces$ = [ ...webWorkerCtx.$interfaces$, ...msgValue ];
            webWorkerCtx.$isInitialized$ = 1;
            logWorker("Initialized web worker");
            webWorkerCtx.$postMessage$([ WorkerMessageType.InitializedWebWorker ]);
            queuedEvents.length && logWorker(`Queued ready messages: ${queuedEvents.length}`);
            [ ...queuedEvents ].map(receiveMessageFromSandboxToWorker);
            queuedEvents.length = 0;
        } else {
            queuedEvents.push(ev);
        }
    };
    self.onmessage = receiveMessageFromSandboxToWorker;
    postMessage([ WorkerMessageType.MainDataRequestFromWorker ]);
})(self);
