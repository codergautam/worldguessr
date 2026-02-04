/* Partytown 0.11.2 - MIT QwikDev */
const defaultPartytownForwardPropertySettings = {
    preserveBehavior: false
};

const resolvePartytownForwardProperty = propertyOrPropertyWithSettings => {
    if ("string" == typeof propertyOrPropertyWithSettings) {
        return [ propertyOrPropertyWithSettings, defaultPartytownForwardPropertySettings ];
    }
    const [property, settings = defaultPartytownForwardPropertySettings] = propertyOrPropertyWithSettings;
    return [ property, {
        ...defaultPartytownForwardPropertySettings,
        ...settings
    } ];
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

!function(win, doc, nav, top, useAtomics, config, libPath, timeout, scripts, sandbox, mainForwardFn = win, isReady) {
    function ready() {
        if (!isReady) {
            isReady = 1;
            libPath = (config.lib || "/~partytown/") + (false !== config.debug ? "debug/" : "");
            if ("/" == libPath[0]) {
                scripts = doc.querySelectorAll('script[type="text/partytown"]');
                if (top != win) {
                    top.dispatchEvent(new CustomEvent("pt1", {
                        detail: win
                    }));
                } else {
                    timeout = setTimeout(fallback, (null == config ? void 0 : config.fallbackTimeout) || 1e4);
                    doc.addEventListener("pt0", clearFallback);
                    useAtomics ? loadSandbox(1) : nav.serviceWorker ? nav.serviceWorker.register(libPath + (config.swPath || "partytown-sw.js"), {
                        scope: libPath
                    }).then((function(swRegistration) {
                        if (swRegistration.active) {
                            loadSandbox();
                        } else if (swRegistration.installing) {
                            swRegistration.installing.addEventListener("statechange", (function(ev) {
                                "activated" == ev.target.state && loadSandbox();
                            }));
                        } else {
                            console.warn(swRegistration);
                        }
                    }), console.error) : fallback();
                }
            } else {
                console.warn('Partytown config.lib url must start with "/"');
            }
        }
    }
    function loadSandbox(isAtomics) {
        sandbox = doc.createElement(isAtomics ? "script" : "iframe");
        win._pttab = Date.now();
        if (!isAtomics) {
            sandbox.style.display = "block";
            sandbox.style.width = "0";
            sandbox.style.height = "0";
            sandbox.style.border = "0";
            sandbox.style.visibility = "hidden";
            sandbox.setAttribute("aria-hidden", !0);
        }
        sandbox.src = libPath + "partytown-" + (isAtomics ? "atomics.js?v=0.11.2" : "sandbox-sw.html?" + win._pttab);
        doc.querySelector(config.sandboxParent || "body").appendChild(sandbox);
    }
    function fallback(i, script) {
        console.warn("Partytown script fallback");
        clearFallback();
        top == win && (config.forward || []).map((function(forwardProps) {
            const [property] = resolvePartytownForwardProperty(forwardProps);
            delete win[property.split(".")[0]];
        }));
        for (i = 0; i < scripts.length; i++) {
            script = doc.createElement("script");
            script.innerHTML = scripts[i].innerHTML;
            script.nonce = config.nonce;
            doc.head.appendChild(script);
        }
        sandbox && sandbox.parentNode.removeChild(sandbox);
    }
    function clearFallback() {
        clearTimeout(timeout);
    }
    config = win.partytown || {};
    top == win && (config.forward || []).map((function(forwardProps) {
        const [property, {preserveBehavior: preserveBehavior}] = resolvePartytownForwardProperty(forwardProps);
        mainForwardFn = win;
        property.split(".").map((function(_, i, forwardPropsArr) {
            mainForwardFn = mainForwardFn[forwardPropsArr[i]] = i + 1 < forwardPropsArr.length ? mainForwardFn[forwardPropsArr[i]] || (propertyName => arrayMethods.includes(propertyName) ? [] : {})(forwardPropsArr[i + 1]) : (() => {
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
                    })(win, forwardPropsArr);
                    "function" == typeof methodOrProperty && (originalFunction = (...args) => methodOrProperty.apply(thisObject, ...args));
                }
                return function() {
                    let returnValue;
                    originalFunction && (returnValue = originalFunction(arguments));
                    (win._ptf = win._ptf || []).push(forwardPropsArr, arguments);
                    return returnValue;
                };
            })();
        }));
    }));
    if ("complete" == doc.readyState) {
        ready();
    } else {
        win.addEventListener("DOMContentLoaded", ready);
        win.addEventListener("load", ready);
    }
}(window, document, navigator, top, window.crossOriginIsolated);