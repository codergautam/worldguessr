/* Partytown 0.11.2 - MIT QwikDev */
(window => {
    const isPromise = v => "object" == typeof v && v && v.then;
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
    const startsWith = (str, val) => str.startsWith(val);
    const isValidMemberName = memberName => !(startsWith(memberName, "webkit") || startsWith(memberName, "toJSON") || startsWith(memberName, "constructor") || startsWith(memberName, "toString") || startsWith(memberName, "_"));
    const getNodeName = node => 11 === node.nodeType && node.host ? "#s" : node.nodeName;
    const randomId = () => Math.round(Math.random() * Number.MAX_SAFE_INTEGER).toString(36);
    const defineConstructorName = (Cstr, value) => ((obj, memberName, descriptor) => Object.defineProperty(obj, memberName, {
        ...descriptor,
        configurable: true
    }))(Cstr, "name", {
        value: value
    });
    const htmlConstructorTags = {
        Anchor: "a",
        DList: "dl",
        Image: "img",
        OList: "ol",
        Paragraph: "p",
        Quote: "q",
        TableCaption: "caption",
        TableCell: "td",
        TableCol: "colgroup",
        TableRow: "tr",
        TableSection: "tbody",
        UList: "ul"
    };
    const svgConstructorTags = {
        Graphics: "g",
        SVG: "svg"
    };
    const defaultPartytownForwardPropertySettings = {
        preserveBehavior: false
    };
    const arrayMethods = Object.freeze((obj => {
        const properties = new Set;
        let currentObj = obj;
        do {
            Object.getOwnPropertyNames(currentObj).forEach((item => {
                "function" == typeof currentObj[item] && properties.add(item);
            }));
        } while ((currentObj = Object.getPrototypeOf(currentObj)) !== Object.prototype);
        return Array.from(properties);
    })([]));
    const InstanceIdKey = Symbol();
    const CreatedKey = Symbol();
    const instances = new Map;
    const mainRefs = new Map;
    const winCtxs = {};
    const windowIds = new WeakMap;
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
    const getAndSetInstanceId = (instance, instanceId) => {
        if (instance) {
            if (instanceId = windowIds.get(instance)) {
                return instanceId;
            }
            (instanceId = instance[InstanceIdKey]) || setInstanceId(instance, instanceId = randomId());
            return instanceId;
        }
    };
    const getInstance = (winId, instanceId, win, doc, docId) => {
        if ((win = winCtxs[winId]) && win.$window$) {
            if (winId === instanceId) {
                return win.$window$;
            }
            doc = win.$window$.document;
            docId = instanceId.split(".").pop();
            if (docId === WinDocId.document) {
                return doc;
            }
            if (docId === WinDocId.documentElement) {
                return doc.documentElement;
            }
            if (docId === WinDocId.head) {
                return doc.head;
            }
            if (docId === WinDocId.body) {
                return doc.body;
            }
        }
        return instances.get(instanceId);
    };
    const setInstanceId = (instance, instanceId, now) => {
        if (instance) {
            instances.set(instanceId, instance);
            instance[InstanceIdKey] = instanceId;
            instance[CreatedKey] = now = Date.now();
            if (now > lastCleanup + 5e3) {
                instances.forEach(((storedInstance, instanceId) => {
                    storedInstance[CreatedKey] < lastCleanup && storedInstance.nodeType && !storedInstance.isConnected && instances.delete(instanceId);
                }));
                lastCleanup = now;
            }
        }
    };
    let lastCleanup = 0;
    const mainWindow = window.parent;
    const docImpl = document.implementation.createHTMLDocument();
    const config = mainWindow.partytown || {};
    const libPath = (config.lib || "/~partytown/") + "debug/";
    const logMain = msg => {
        console.debug.apply(console, [ "%cMain 🌎", "background: #717171; color: white; padding: 2px 3px; border-radius: 2px; font-size: 0.8em;", msg ]);
    };
    const winIds = [];
    const normalizedWinId = winId => {
        winIds.includes(winId) || winIds.push(winId);
        return winIds.indexOf(winId) + 1;
    };
    const defineCustomElement = (winId, worker, ceData) => {
        const Cstr = defineConstructorName(class extends winCtxs[winId].$window$.HTMLElement {}, ceData[0]);
        const ceCallbackMethods = "connectedCallback,disconnectedCallback,attributeChangedCallback,adoptedCallback".split(",");
        ceCallbackMethods.map((callbackMethodName => Cstr.prototype[callbackMethodName] = function(...args) {
            worker.postMessage([ WorkerMessageType.CustomElementCallback, winId, getAndSetInstanceId(this), callbackMethodName, args ]);
        }));
        Cstr.observedAttributes = ceData[1];
        return Cstr;
    };
    const serializeForWorker = ($winId$, value, added, type, cstrName, prevInstanceId) => void 0 !== value && (type = typeof value) ? "string" === type || "number" === type || "boolean" === type || null == value ? [ SerializedType.Primitive, value ] : "function" === type ? [ SerializedType.Function ] : (added = added || new Set) && Array.isArray(value) ? added.has(value) ? [ SerializedType.Array, [] ] : added.add(value) && [ SerializedType.Array, value.map((v => serializeForWorker($winId$, v, added))) ] : "object" === type ? serializedValueIsError(value) ? [ SerializedType.Error, {
        name: value.name,
        message: value.message,
        stack: value.stack
    } ] : "" === (cstrName = getConstructorName(value)) ? [ SerializedType.Object, {} ] : "Window" === cstrName ? [ SerializedType.Instance, [ $winId$, $winId$ ] ] : "HTMLCollection" === cstrName || "NodeList" === cstrName ? [ SerializedType.NodeList, Array.from(value).map((v => serializeForWorker($winId$, v, added)[1])) ] : cstrName.endsWith("Event") ? [ SerializedType.Event, serializeObjectForWorker($winId$, value, added) ] : "CSSRuleList" === cstrName ? [ SerializedType.CSSRuleList, Array.from(value).map(serializeCssRuleForWorker) ] : startsWith(cstrName, "CSS") && cstrName.endsWith("Rule") ? [ SerializedType.CSSRule, serializeCssRuleForWorker(value) ] : "CSSStyleDeclaration" === cstrName ? [ SerializedType.CSSStyleDeclaration, serializeObjectForWorker($winId$, value, added) ] : "Attr" === cstrName ? [ SerializedType.Attr, [ value.name, value.value ] ] : value.nodeType ? [ SerializedType.Instance, [ $winId$, getAndSetInstanceId(value), getNodeName(value), prevInstanceId ] ] : [ SerializedType.Object, serializeObjectForWorker($winId$, value, added, true, true) ] : void 0 : value;
    const serializeObjectForWorker = (winId, obj, added, includeFunctions, includeEmptyStrings, serializedObj, propName, propValue) => {
        serializedObj = {};
        if (!added.has(obj)) {
            added.add(obj);
            for (propName in obj) {
                if (isValidMemberName(propName)) {
                    propValue = "path" === propName && getConstructorName(obj).endsWith("Event") ? obj.composedPath() : obj[propName];
                    (includeFunctions || "function" != typeof propValue) && (includeEmptyStrings || "" !== propValue) && (serializedObj[propName] = serializeForWorker(winId, propValue, added));
                }
            }
        }
        return serializedObj;
    };
    const serializeCssRuleForWorker = cssRule => {
        let obj = {};
        let key;
        for (key in cssRule) {
            validCssRuleProps.includes(key) && (obj[key] = String(cssRule[key]));
        }
        return obj;
    };
    let ErrorObject = null;
    const serializedValueIsError = value => {
        var _a;
        ErrorObject = (null === (_a = window.top) || void 0 === _a ? void 0 : _a.Error) || ErrorObject;
        return value instanceof ErrorObject;
    };
    const deserializeFromWorker = (worker, serializedTransfer, serializedType, serializedValue) => {
        if (serializedTransfer) {
            serializedType = serializedTransfer[0];
            serializedValue = serializedTransfer[1];
            return serializedType === SerializedType.Primitive ? serializedValue : serializedType === SerializedType.Ref ? deserializeRefFromWorker(worker, serializedValue) : serializedType === SerializedType.Array ? serializedValue.map((v => deserializeFromWorker(worker, v))) : serializedType === SerializedType.Instance ? getInstance(serializedValue[0], serializedValue[1]) : serializedType === SerializedType.Event ? constructEvent(deserializeObjectFromWorker(worker, serializedValue)) : serializedType === SerializedType.Object ? deserializeObjectFromWorker(worker, serializedValue) : serializedType === SerializedType.ArrayBuffer ? serializedValue : serializedType === SerializedType.ArrayBufferView ? new window[serializedTransfer[2]](serializedValue) : void 0;
        }
    };
    const deserializeRefFromWorker = (worker, {$winId$: $winId$, $instanceId$: $instanceId$, $refId$: $refId$}, ref) => {
        ref = mainRefs.get($refId$);
        if (!ref) {
            ref = function(...args) {
                worker.postMessage([ WorkerMessageType.RefHandlerCallback, {
                    $winId$: $winId$,
                    $instanceId$: $instanceId$,
                    $refId$: $refId$,
                    $thisArg$: serializeForWorker($winId$, this),
                    $args$: serializeForWorker($winId$, args)
                } ]);
            };
            mainRefs.set($refId$, ref);
        }
        return ref;
    };
    const constructEvent = eventProps => new ("detail" in eventProps ? CustomEvent : Event)(eventProps.type, eventProps);
    const deserializeObjectFromWorker = (worker, serializedValue, obj, key) => {
        obj = {};
        for (key in serializedValue) {
            obj[key] = deserializeFromWorker(worker, serializedValue[key]);
        }
        return obj;
    };
    const validCssRuleProps = "cssText,selectorText,href,media,namespaceURI,prefix,name,conditionText".split(",");
    const mainAccessHandler = async (worker, accessReq) => {
        let accessRsp = {
            $msgId$: accessReq.$msgId$
        };
        let totalTasks = len(accessReq.$tasks$);
        let i = 0;
        let task;
        let winId;
        let applyPath;
        let instance;
        let rtnValue;
        let isLast;
        for (;i < totalTasks; i++) {
            try {
                isLast = i === totalTasks - 1;
                task = accessReq.$tasks$[i];
                winId = task.$winId$;
                applyPath = task.$applyPath$;
                !winCtxs[winId] && winId.startsWith("f_") && await new Promise((resolve => {
                    let check = 0;
                    let callback = () => {
                        winCtxs[winId] || check++ > 1e3 ? resolve() : requestAnimationFrame(callback);
                    };
                    callback();
                }));
                if (applyPath[0] === ApplyPathType.GlobalConstructor && applyPath[1] in winCtxs[winId].$window$) {
                    setInstanceId(new winCtxs[winId].$window$[applyPath[1]](...deserializeFromWorker(worker, applyPath[2])), task.$instanceId$);
                } else {
                    instance = getInstance(winId, task.$instanceId$);
                    if (instance) {
                        rtnValue = applyToInstance(worker, winId, instance, applyPath, isLast, task.$groupedGetters$);
                        task.$assignInstanceId$ && ("string" == typeof task.$assignInstanceId$ ? setInstanceId(rtnValue, task.$assignInstanceId$) : winCtxs[task.$assignInstanceId$.$winId$] = {
                            $winId$: task.$assignInstanceId$.$winId$,
                            $window$: {
                                document: rtnValue
                            }
                        });
                        if (isPromise(rtnValue)) {
                            rtnValue = await rtnValue;
                            isLast && (accessRsp.$isPromise$ = true);
                        }
                        isLast && (accessRsp.$rtnValue$ = serializeForWorker(winId, rtnValue, void 0, void 0, void 0, task.$instanceId$));
                    } else {
                        accessRsp.$error$ = `Error finding instance "${task.$instanceId$}" on window ${normalizedWinId(winId)}`;
                        console.error(accessRsp.$error$, task);
                    }
                }
            } catch (e) {
                isLast ? accessRsp.$error$ = String(e.stack || e) : console.error(e);
            }
        }
        return accessRsp;
    };
    const applyToInstance = (worker, winId, instance, applyPath, isLast, groupedGetters) => {
        let i = 0;
        let l = len(applyPath);
        let next;
        let current;
        let previous;
        let args;
        let groupedRtnValues;
        for (;i < l; i++) {
            current = applyPath[i];
            next = applyPath[i + 1];
            previous = applyPath[i - 1];
            try {
                if (!Array.isArray(next)) {
                    if ("string" == typeof current || "number" == typeof current) {
                        if (i + 1 === l && groupedGetters) {
                            groupedRtnValues = {};
                            groupedGetters.map((propName => groupedRtnValues[propName] = instance[propName]));
                            return groupedRtnValues;
                        }
                        instance = instance[current];
                    } else {
                        if (next === ApplyPathType.SetValue) {
                            instance[previous] = deserializeFromWorker(worker, current);
                            return;
                        }
                        if ("function" == typeof instance[previous]) {
                            args = deserializeFromWorker(worker, current);
                            "define" === previous && "CustomElementRegistry" === getConstructorName(instance) && (args[1] = defineCustomElement(winId, worker, args[1]));
                            "insertRule" === previous && args[1] > len(instance.cssRules) && (args[1] = len(instance.cssRules));
                            instance = instance[previous].apply(instance, args);
                            if ("play" === previous) {
                                return Promise.resolve();
                            }
                        }
                    }
                }
            } catch (err) {
                if (isLast) {
                    throw err;
                }
                console.debug("Non-blocking setter error:", err);
            }
        }
        return instance;
    };
    const mainForwardTrigger = (worker, $winId$, win) => {
        let queuedForwardCalls = win._ptf;
        let forwards = (win.partytown || {}).forward || [];
        let i;
        let mainForwardFn;
        let forwardCall = ($forward$, args) => worker.postMessage([ WorkerMessageType.ForwardMainTrigger, {
            $winId$: $winId$,
            $forward$: $forward$,
            $args$: serializeForWorker($winId$, Array.from(args))
        } ]);
        win._ptf = void 0;
        forwards.map((forwardProps => {
            const [property, {preserveBehavior: preserveBehavior}] = (propertyOrPropertyWithSettings => {
                if ("string" == typeof propertyOrPropertyWithSettings) {
                    return [ propertyOrPropertyWithSettings, defaultPartytownForwardPropertySettings ];
                }
                const [property, settings = defaultPartytownForwardPropertySettings] = propertyOrPropertyWithSettings;
                return [ property, {
                    ...defaultPartytownForwardPropertySettings,
                    ...settings
                } ];
            })(forwardProps);
            mainForwardFn = win;
            property.split(".").map(((_, i, arr) => {
                mainForwardFn = mainForwardFn[arr[i]] = i + 1 < len(arr) ? mainForwardFn[arr[i]] || (propertyName => arrayMethods.includes(propertyName) ? [] : {})(arr[i + 1]) : (() => {
                    let originalFunction = null;
                    if (preserveBehavior) {
                        const {methodOrProperty: methodOrProperty, thisObject: thisObject} = ((window, properties) => {
                            let thisObject = window;
                            for (let i = 0; i < properties.length - 1; i += 1) {
                                thisObject = thisObject[properties[i]];
                            }
                            return {
                                thisObject: thisObject,
                                methodOrProperty: properties.length > 0 ? thisObject[properties[properties.length - 1]] : void 0
                            };
                        })(win, arr);
                        "function" == typeof methodOrProperty && (originalFunction = (...args) => methodOrProperty.apply(thisObject, ...args));
                    }
                    return (...args) => {
                        let returnValue;
                        originalFunction && (returnValue = originalFunction(args));
                        forwardCall(arr, args);
                        return returnValue;
                    };
                })();
            }));
        }));
        if (queuedForwardCalls) {
            for (i = 0; i < len(queuedForwardCalls); i += 2) {
                forwardCall(queuedForwardCalls[i], queuedForwardCalls[i + 1]);
            }
        }
    };
    const readNextScript = (worker, winCtx) => {
        let $winId$ = winCtx.$winId$;
        let win = winCtx.$window$;
        let doc = win.document;
        let scriptSelector = 'script[type="text/partytown"]:not([data-ptid]):not([data-pterror])';
        let blockingScriptSelector = scriptSelector + ":not([async]):not([defer])";
        let scriptElm;
        let $instanceId$;
        let scriptData;
        if (doc && doc.body) {
            scriptElm = doc.querySelector(blockingScriptSelector);
            scriptElm || (scriptElm = doc.querySelector(scriptSelector));
            if (scriptElm) {
                scriptElm.dataset.ptid = $instanceId$ = getAndSetInstanceId(scriptElm, $winId$);
                scriptData = {
                    $winId$: $winId$,
                    $instanceId$: $instanceId$
                };
                if (scriptElm.src) {
                    scriptData.$url$ = scriptElm.src;
                    scriptData.$orgUrl$ = scriptElm.dataset.ptsrc || scriptElm.src;
                } else {
                    scriptData.$content$ = scriptElm.innerHTML;
                }
                worker.postMessage([ WorkerMessageType.InitializeNextScript, scriptData ]);
            } else {
                if (!winCtx.$isInitialized$) {
                    winCtx.$isInitialized$ = 1;
                    mainForwardTrigger(worker, $winId$, win);
                    doc.dispatchEvent(new CustomEvent("pt0"));
                    {
                        const winType = win === win.top ? "top" : "iframe";
                        logMain(`Executed ${winType} window ${normalizedWinId($winId$)} environment scripts in ${(performance.now() - winCtx.$startTime$).toFixed(1)}ms`);
                    }
                }
                worker.postMessage([ WorkerMessageType.InitializedScripts, $winId$ ]);
            }
        } else {
            requestAnimationFrame((() => readNextScript(worker, winCtx)));
        }
    };
    const registerWindow = (worker, $winId$, $window$) => {
        if (!windowIds.has($window$)) {
            windowIds.set($window$, $winId$);
            const doc = $window$.document;
            const history = $window$.history;
            const $parentWinId$ = windowIds.get($window$.parent);
            let initialised = false;
            const onInitialisedQueue = [];
            const onInitialised = callback => {
                initialised ? callback() : onInitialisedQueue.push(callback);
            };
            const sendInitEnvData = () => {
                worker.postMessage([ WorkerMessageType.InitializeEnvironment, {
                    $winId$: $winId$,
                    $parentWinId$: $parentWinId$,
                    $url$: doc.baseURI,
                    $visibilityState$: doc.visibilityState
                } ]);
                setTimeout((() => {
                    initialised = true;
                    onInitialisedQueue.forEach((callback => {
                        callback();
                    }));
                }));
            };
            const pushState = history.pushState.bind(history);
            const replaceState = history.replaceState.bind(history);
            const onLocationChange = (type, state, newUrl, oldUrl) => () => {
                worker.postMessage([ WorkerMessageType.LocationUpdate, {
                    $winId$: $winId$,
                    type: type,
                    state: state,
                    url: doc.baseURI,
                    newUrl: newUrl,
                    oldUrl: oldUrl
                } ]);
            };
            history.pushState = (state, _, newUrl) => {
                pushState(state, _, newUrl);
                onInitialised(onLocationChange(LocationUpdateType.PushState, state, null == newUrl ? void 0 : newUrl.toString()));
            };
            history.replaceState = (state, _, newUrl) => {
                replaceState(state, _, newUrl);
                onInitialised(onLocationChange(LocationUpdateType.ReplaceState, state, null == newUrl ? void 0 : newUrl.toString()));
            };
            $window$.addEventListener("popstate", (event => {
                onInitialised(onLocationChange(LocationUpdateType.PopState, event.state));
            }));
            $window$.addEventListener("hashchange", (event => {
                onInitialised(onLocationChange(LocationUpdateType.HashChange, {}, event.newURL, event.oldURL));
            }));
            $window$.addEventListener("ptupdate", (() => {
                readNextScript(worker, winCtxs[$winId$]);
            }));
            doc.addEventListener("visibilitychange", (() => worker.postMessage([ WorkerMessageType.DocumentVisibilityState, $winId$, doc.visibilityState ])));
            winCtxs[$winId$] = {
                $winId$: $winId$,
                $window$: $window$
            };
            winCtxs[$winId$].$startTime$ = performance.now();
            {
                const winType = $winId$ === $parentWinId$ ? "top" : "iframe";
                logMain(`Registered ${winType} window ${normalizedWinId($winId$)}`);
            }
            "complete" === doc.readyState ? sendInitEnvData() : $window$.addEventListener("load", sendInitEnvData);
        }
    };
    const onMessageFromWebWorker = (worker, msg, winCtx) => {
        if (msg[0] === WorkerMessageType.InitializedWebWorker) {
            registerWindow(worker, randomId(), mainWindow);
        } else {
            winCtx = winCtxs[msg[1]];
            winCtx && (msg[0] === WorkerMessageType.InitializeNextScript ? requestAnimationFrame((() => readNextScript(worker, winCtx))) : msg[0] === WorkerMessageType.InitializedEnvironmentScript && ((worker, winCtx, instanceId, errorMsg, scriptElm) => {
                scriptElm = winCtx.$window$.document.querySelector(`[data-ptid="${instanceId}"]`);
                if (scriptElm) {
                    errorMsg ? scriptElm.dataset.pterror = errorMsg : scriptElm.type += "-x";
                    delete scriptElm.dataset.ptid;
                }
                readNextScript(worker, winCtx);
            })(worker, winCtx, msg[2], msg[3]));
        }
    };
    const readMainPlatform = () => {
        const elm = docImpl.createElement("i");
        const textNode = docImpl.createTextNode("");
        const comment = docImpl.createComment("");
        const frag = docImpl.createDocumentFragment();
        const shadowRoot = docImpl.createElement("p").attachShadow({
            mode: "open"
        });
        const intersectionObserver = getGlobalConstructor(mainWindow, "IntersectionObserver");
        const mutationObserver = getGlobalConstructor(mainWindow, "MutationObserver");
        const resizeObserver = getGlobalConstructor(mainWindow, "ResizeObserver");
        const perf = mainWindow.performance;
        const screen = mainWindow.screen;
        const impls = [ [ mainWindow.history ], [ perf ], [ perf.navigation ], [ perf.timing ], [ screen ], [ screen.orientation ], [ mainWindow.visualViewport ], [ intersectionObserver, InterfaceType.EnvGlobalConstructor ], [ mutationObserver, InterfaceType.EnvGlobalConstructor ], [ resizeObserver, InterfaceType.EnvGlobalConstructor ], [ textNode ], [ comment ], [ frag ], [ shadowRoot ], [ elm ], [ elm.attributes ], [ elm.classList ], [ elm.dataset ], [ elm.style ], [ docImpl ], [ docImpl.doctype ] ];
        const initialInterfaces = [ readImplementation("Window", mainWindow), readImplementation("Node", textNode) ];
        const $config$ = function(config) {
            return JSON.stringify(config, ((key, value) => {
                if ("function" == typeof value) {
                    value = String(value);
                    value.startsWith(key + "(") && (value = "function " + value);
                }
                "loadScriptsOnMainThread" === key && (value = value.map((scriptUrl => Array.isArray(scriptUrl) ? scriptUrl : [ "string" == typeof scriptUrl ? "string" : "regexp", "string" == typeof scriptUrl ? scriptUrl : scriptUrl.source ])));
                return value;
            }));
        }(config);
        const initWebWorkerData = {
            $config$: $config$,
            $interfaces$: readImplementations(impls, initialInterfaces),
            $libPath$: new URL(libPath, mainWindow.location) + "",
            $origin$: origin,
            $tabId$: mainWindow._pttab
        };
        addGlobalConstructorUsingPrototype(initWebWorkerData.$interfaces$, mainWindow, "IntersectionObserverEntry");
        return initWebWorkerData;
    };
    const readMainInterfaces = () => {
        const elms = Object.getOwnPropertyNames(mainWindow).map((interfaceName => ((doc, interfaceName, r, tag) => {
            r = interfaceName.match(/^(HTML|SVG)(.+)Element$/);
            if (r) {
                tag = r[2];
                return "S" == interfaceName[0] ? doc.createElementNS("http://www.w3.org/2000/svg", svgConstructorTags[tag] || tag.slice(0, 2).toLowerCase() + tag.slice(2)) : doc.createElement(htmlConstructorTags[tag] || tag);
            }
        })(docImpl, interfaceName))).filter((elm => {
            if (!elm) {
                return false;
            }
            const constructorName = getConstructorName(elm);
            return !("HTMLUnknownElement" === constructorName && "UNKNOWN" !== elm.nodeName.toUpperCase());
        })).map((elm => [ elm ]));
        return readImplementations(elms, []);
    };
    const readImplementations = (impls, interfaces) => {
        const cstrs = new Set([ "Object" ]);
        const cstrImpls = impls.filter((implData => implData[0])).map((implData => {
            const impl = implData[0];
            const interfaceType = implData[1];
            const cstrName = getConstructorName(impl);
            const CstrPrototype = mainWindow[cstrName].prototype;
            return [ cstrName, CstrPrototype, impl, interfaceType ];
        }));
        cstrImpls.map((([cstrName, CstrPrototype, impl, intefaceType]) => readOwnImplementation(cstrs, interfaces, cstrName, CstrPrototype, impl, intefaceType)));
        return interfaces;
    };
    const readImplementation = (cstrName, impl, memberName) => {
        let interfaceMembers = [];
        let interfaceInfo = [ cstrName, "Object", interfaceMembers ];
        for (memberName in impl) {
            readImplementationMember(interfaceMembers, impl, memberName);
        }
        return interfaceInfo;
    };
    const readOwnImplementation = (cstrs, interfaces, cstrName, CstrPrototype, impl, interfaceType) => {
        if (!cstrs.has(cstrName)) {
            cstrs.add(cstrName);
            const SuperCstr = Object.getPrototypeOf(CstrPrototype);
            const superCstrName = getConstructorName(SuperCstr);
            const interfaceMembers = [];
            const propDescriptors = Object.getOwnPropertyDescriptors(CstrPrototype);
            readOwnImplementation(cstrs, interfaces, superCstrName, SuperCstr, impl, interfaceType);
            for (const memberName in propDescriptors) {
                readImplementationMember(interfaceMembers, impl, memberName);
            }
            interfaces.push([ cstrName, superCstrName, interfaceMembers, interfaceType, getNodeName(impl) ]);
        }
    };
    const readImplementationMember = (interfaceMembers, implementation, memberName, value, memberType, cstrName) => {
        try {
            if (isValidMemberName(memberName) && isNaN(memberName[0]) && "all" !== memberName) {
                value = implementation[memberName];
                memberType = typeof value;
                if ("function" === memberType) {
                    (String(value).includes("[native") || Object.getPrototypeOf(implementation)[memberName]) && interfaceMembers.push([ memberName, InterfaceType.Function ]);
                } else if ("object" === memberType && null != value) {
                    cstrName = getConstructorName(value);
                    "Object" !== cstrName && "Function" !== cstrName && self[cstrName] && interfaceMembers.push([ memberName, value.nodeType || cstrName ]);
                } else {
                    "symbol" !== memberType && (memberName.toUpperCase() === memberName ? interfaceMembers.push([ memberName, InterfaceType.Property, value ]) : interfaceMembers.push([ memberName, InterfaceType.Property ]));
                }
            }
        } catch (e) {
            console.warn(e);
        }
    };
    const getGlobalConstructor = (mainWindow, cstrName) => void 0 !== mainWindow[cstrName] ? new mainWindow[cstrName](noop) : 0;
    const addGlobalConstructorUsingPrototype = ($interfaces$, mainWindow, cstrName) => {
        void 0 !== mainWindow[cstrName] && $interfaces$.push([ cstrName, "Object", Object.keys(mainWindow[cstrName].prototype).map((propName => [ propName, InterfaceType.Property ])), InterfaceType.EnvGlobalConstructor ]);
    };
    let worker;
    (async receiveMessage => {
        const sharedDataBuffer = new SharedArrayBuffer(1073741824);
        const sharedData = new Int32Array(sharedDataBuffer);
        return (worker, msg) => {
            const msgType = msg[0];
            const accessReq = msg[1];
            if (msgType === WorkerMessageType.MainDataRequestFromWorker) {
                const initData = readMainPlatform();
                initData.$sharedDataBuffer$ = sharedDataBuffer;
                worker.postMessage([ WorkerMessageType.MainDataResponseToWorker, initData ]);
            } else {
                msg[0] === WorkerMessageType.MainInterfacesRequestFromWorker ? worker.postMessage([ WorkerMessageType.MainInterfacesResponseToWorker, readMainInterfaces() ]) : msgType === WorkerMessageType.ForwardWorkerAccessRequest ? receiveMessage(accessReq, (accessRsp => {
                    const stringifiedData = JSON.stringify(accessRsp);
                    const stringifiedDataLength = stringifiedData.length;
                    for (let i = 0; i < stringifiedDataLength; i++) {
                        sharedData[i + 1] = stringifiedData.charCodeAt(i);
                    }
                    sharedData[0] = stringifiedDataLength;
                    Atomics.notify(sharedData, 0);
                })) : onMessageFromWebWorker(worker, msg);
            }
        };
    })(((accessReq, responseCallback) => mainAccessHandler(worker, accessReq).then(responseCallback))).then((onMessageHandler => {
        if (onMessageHandler) {
            worker = new Worker(libPath + "partytown-ww-atomics.js?v=0.11.2", {
                name: "Partytown 🎉"
            });
            worker.onmessage = ev => {
                const msg = ev.data;
                msg[0] === WorkerMessageType.AsyncAccessRequest ? mainAccessHandler(worker, msg[1]) : onMessageHandler(worker, msg);
            };
            logMain("Created Partytown web worker (0.11.2)");
            worker.onerror = ev => console.error("Web Worker Error", ev);
            mainWindow.addEventListener("pt1", (ev => registerWindow(worker, getAndSetInstanceId(ev.detail.frameElement), ev.detail)));
        }
    }));
})(window);
